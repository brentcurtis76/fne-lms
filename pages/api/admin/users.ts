import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ROLE_PRIORITY = ['admin','consultor','equipo_directivo','supervisor_de_red','community_manager','lider_generacion','lider_comunidad','docente','encargado_licitacion'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt((req.query.pageSize as string) || '25', 10), 1), 100);
    const search = (req.query.search as string)?.trim() || '';
    const status = (req.query.status as string) || 'all';
    const schoolId = (req.query.schoolId as string) || '';
    const communityId = (req.query.communityId as string) || '';
    const offset = (page - 1) * pageSize;

    const supabaseClient = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminCheck } = await supabaseService
      .from('user_roles')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (!adminCheck || adminCheck.length === 0) {
      return res.status(403).json({ error: 'Solo administradores pueden ver usuarios' });
    }

    let allowedUserIds: string[] | null = null;
    if (communityId) {
      const { data: communityUsers, error: communityError } = await supabaseService
        .from('user_roles')
        .select('user_id')
        .eq('community_id', communityId)
        .eq('is_active', true);

      if (communityError) {
        console.error('[users API] Error fetching community filter:', communityError);
        return res.status(500).json({ error: 'Error al filtrar por comunidad' });
      }

      allowedUserIds = (communityUsers || []).map(row => row.user_id);
      if (!allowedUserIds.length) {
        return res.status(200).json({ page, pageSize, total: 0, users: [], schools: [] });
      }
    }

    let profileQuery = supabaseService
      .from('profiles')
      .select(
        `id,email,first_name,last_name,school_id,approval_status,created_at,external_school_affiliation,can_run_qa_tests,
         school:schools(id,name)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (search) {
      profileQuery = profileQuery.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    if (status !== 'all') {
      profileQuery = profileQuery.eq('approval_status', status);
    }

    if (schoolId) {
      profileQuery = profileQuery.eq('school_id', parseInt(schoolId, 10));
    }

    if (allowedUserIds) {
      profileQuery = profileQuery.in('id', allowedUserIds);
    }

    const { data: profiles, count, error: profilesError } = await profileQuery;

    if (profilesError) {
      console.error('[users API] Error fetching profiles:', profilesError);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }

    const summaryPromises = [
      supabaseService
        .from('profiles')
        .select('id', { head: true, count: 'exact' }),
      supabaseService
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('approval_status', 'pending'),
      supabaseService
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('approval_status', 'approved'),
      // Fetch all schools for filter dropdown
      supabaseService
        .from('schools')
        .select('id, name')
        .order('name', { ascending: true })
    ];

    const [totalCountRes, pendingCountRes, approvedCountRes, schoolsRes] = await Promise.all(summaryPromises);

    const summary = {
      total: totalCountRes.count || 0,
      pending: pendingCountRes.count || 0,
      approved: approvedCountRes.count || 0
    };

    const schools = (schoolsRes.data || []).map((s: any) => ({
      id: s.id.toString(),
      name: s.name
    }));

    const users = profiles || [];
    if (users.length === 0) {
      return res.status(200).json({ page, pageSize, total: count || 0, users: [], summary, schools });
    }

    const userIds = users.map(user => user.id);

    const { data: rolesData, error: rolesError } = await supabaseService
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*, school:schools(*), generation:generations(*))
      `)
      .in('user_id', userIds)
      .eq('is_active', true);

    if (rolesError) {
      console.error('[users API] Error fetching roles:', rolesError);
      return res.status(500).json({ error: 'Error al obtener roles de usuarios' });
    }

    const { data: consultantData, error: consultantError } = await supabaseService
      .from('consultant_assignments')
      .select(`
        *,
        student:student_id(id, first_name, last_name, email)
      `)
      .in('consultant_id', userIds)
      .eq('is_active', true);

    if (consultantError) {
      console.error('[users API] Error fetching consultant assignments:', consultantError);
      return res.status(500).json({ error: 'Error al obtener asignaciones de consultor' });
    }

    const { data: studentData, error: studentError } = await supabaseService
      .from('consultant_assignments')
      .select(`
        *,
        consultant:consultant_id(id, first_name, last_name, email)
      `)
      .in('student_id', userIds)
      .eq('is_active', true);

    if (studentError) {
      console.error('[users API] Error fetching student assignments:', studentError);
      return res.status(500).json({ error: 'Error al obtener asignaciones de estudiantes' });
    }

    const uniqueCommunityIds = Array.from(new Set((rolesData || [])
      .map(role => role.community_id)
      .filter((value): value is string => Boolean(value))));

    let communityAssignmentsData: any[] = [];
    if (uniqueCommunityIds.length > 0) {
      const { data: communityAssignments, error: communityAssignmentsError } = await supabaseService
        .from('consultant_assignments')
        .select(`
          *,
          consultant:consultant_id(id, first_name, last_name, email)
        `)
        .in('community_id', uniqueCommunityIds)
        .is('student_id', null)
        .eq('is_active', true);

      if (communityAssignmentsError) {
        console.error('[users API] Error fetching community assignments:', communityAssignmentsError);
        return res.status(500).json({ error: 'Error al obtener asignaciones por comunidad' });
      }

      communityAssignmentsData = communityAssignments || [];
    }

    const { data: courseData, error: courseError } = await supabaseService
      .from('course_assignments')
      .select(`
        teacher_id,
        assigned_at,
        course:courses(id, title, description)
      `)
      .in('teacher_id', userIds);

    if (courseError) {
      console.error('[users API] Error fetching course assignments:', courseError);
      return res.status(500).json({ error: 'Error al obtener cursos asignados' });
    }

    // Fetch learning path assignments - direct user assignments
    const { data: directLPData, error: directLPError } = await supabaseService
      .from('learning_path_assignments')
      .select(`
        user_id,
        assigned_at,
        path:learning_paths(id, name, description)
      `)
      .in('user_id', userIds);

    if (directLPError) {
      console.error('[users API] Error fetching direct learning path assignments:', directLPError);
      return res.status(500).json({ error: 'Error al obtener vías de aprendizaje asignadas' });
    }

    // Fetch learning path assignments - group-based (using uniqueCommunityIds already extracted)
    let groupLPData: any[] = [];
    if (uniqueCommunityIds.length > 0) {
      const { data: groupLP, error: groupLPError } = await supabaseService
        .from('learning_path_assignments')
        .select(`
          group_id,
          assigned_at,
          path:learning_paths(id, name, description)
        `)
        .in('group_id', uniqueCommunityIds);

      if (groupLPError) {
        console.error('[users API] Error fetching group learning path assignments:', groupLPError);
        return res.status(500).json({ error: 'Error al obtener vías de aprendizaje de grupos' });
      }
      groupLPData = groupLP || [];
    }

    const rolesMap = new Map<string, any[]>();
    (rolesData || []).forEach(role => {
      const arr = rolesMap.get(role.user_id) || [];
      arr.push(role);
      rolesMap.set(role.user_id, arr);
    });

    const sortRoles = (roles: any[]) => roles.sort((a, b) => {
      const aIndex = ROLE_PRIORITY.indexOf(a.role_type);
      const bIndex = ROLE_PRIORITY.indexOf(b.role_type);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

    const consultantMap = new Map<string, any[]>();
    (consultantData || []).forEach(entry => {
      const arr = consultantMap.get(entry.consultant_id) || [];
      arr.push(entry);
      consultantMap.set(entry.consultant_id, arr);
    });

    const studentMap = new Map<string, any[]>();
    (studentData || []).forEach(entry => {
      const arr = studentMap.get(entry.student_id) || [];
      arr.push(entry);
      studentMap.set(entry.student_id, arr);
    });

    const communityAssignmentsMap = new Map<string, any[]>();
    communityAssignmentsData.forEach(entry => {
      if (!entry.community_id) return;
      (rolesData || [])
        .filter(role => role.community_id === entry.community_id)
        .forEach(role => {
          const arr = communityAssignmentsMap.get(role.user_id) || [];
          arr.push(entry);
          communityAssignmentsMap.set(role.user_id, arr);
        });
    });

    const courseMap = new Map<string, any[]>();
    (courseData || []).forEach(entry => {
      const arr = courseMap.get(entry.teacher_id) || [];
      arr.push(entry);
      courseMap.set(entry.teacher_id, arr);
    });

    // Build learning path map - combine direct and group-based assignments
    const learningPathMap = new Map<string, any[]>();

    // Add direct assignments
    (directLPData || []).forEach(entry => {
      if (!entry.user_id) return;
      const arr = learningPathMap.get(entry.user_id) || [];
      arr.push({ ...entry, assignment_type: 'direct' });
      learningPathMap.set(entry.user_id, arr);
    });

    // Add group-based assignments (map group_id back to users via their community membership)
    groupLPData.forEach(entry => {
      if (!entry.group_id) return;
      // Find users who belong to this community/group
      (rolesData || [])
        .filter(role => role.community_id === entry.group_id)
        .forEach(role => {
          const arr = learningPathMap.get(role.user_id) || [];
          // Avoid duplicates if same path assigned both directly and via group
          const alreadyHasPath = arr.some(a => a.path?.id === entry.path?.id);
          if (!alreadyHasPath) {
            arr.push({ ...entry, assignment_type: 'group' });
            learningPathMap.set(role.user_id, arr);
          }
        });
    });

    const payload = users.map((user: any) => {
      const roles = sortRoles([...(rolesMap.get(user.id) || [])]);
      const highestRole = roles[0]?.role_type || user.role || null;
      const schools = Array.isArray(user.school) ? user.school[0] : user.school;
      const schoolRelation = schools ? { id: schools.id, name: schools.name } : null;
      return {
        ...user,
        school: schoolRelation?.name || user.school || null,
        school_relation: schoolRelation,
        role: highestRole,
        user_roles: roles,
        consultant_assignments: consultantMap.get(user.id) || [],
        student_assignments: [
          ...(studentMap.get(user.id) || []),
          ...(communityAssignmentsMap.get(user.id) || [])
        ],
        course_assignments: courseMap.get(user.id) || [],
        learning_path_assignments: learningPathMap.get(user.id) || []
      };
    });

    return res.status(200).json({
      page,
      pageSize,
      total: count || 0,
      users: payload,
      summary,
      schools,
    });
  } catch (error) {
    console.error('[users API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error inesperado al obtener usuarios' });
  }
}
