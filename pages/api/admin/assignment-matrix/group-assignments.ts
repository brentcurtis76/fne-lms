import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type GroupType = 'school' | 'community';

interface GroupInfo {
  id: string;
  name: string;
  type: GroupType;
  memberCount: number;
}

interface GroupAssignmentSummary {
  contentId: string;
  contentTitle: string;
  contentDescription?: string;
  type: 'course' | 'learning_path';
  // How many members have this assigned
  assignedCount: number;
  // How many members have completed
  completedCount: number;
  // Average progress for courses
  averageProgress?: number;
}

interface GroupAssignmentsResponse {
  group: GroupInfo;
  // Common assignments (assigned to all or most members)
  commonAssignments: GroupAssignmentSummary[];
  // Assignment coverage stats
  stats: {
    totalMembers: number;
    membersWithAssignments: number;
    uniqueCourses: number;
    uniqueLPs: number;
  };
}

// Check if user has admin/consultor permission and return role info for scoping
interface PermissionResult {
  allowed: boolean;
  isAdmin: boolean;
  userRoles: Array<{ role_type: string; school_id: number | null; community_id: string | null }>;
}

async function checkPermissions(supabaseClient: any, userId: string): Promise<PermissionResult> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type, school_id, community_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) {
    return { allowed: false, isAdmin: false, userRoles: [] };
  }

  const roleTypes = roles.map((r: any) => r.role_type);
  const isAdmin = roleTypes.includes('admin');
  const isConsultor = roleTypes.includes('consultor');

  return {
    allowed: isAdmin || isConsultor,
    isAdmin,
    userRoles: roles
  };
}

// Check if consultor has access to a specific school
async function consultorCanAccessSchool(
  supabaseClient: any,
  userRoles: PermissionResult['userRoles'],
  schoolId: number
): Promise<boolean> {
  // Check if consultor has any role with this school_id
  const hasDirectSchoolRole = userRoles.some(r => r.school_id === schoolId);
  if (hasDirectSchoolRole) return true;

  // Check if consultor has a role in any community within this school
  const userCommunityIds = userRoles
    .filter(r => r.community_id)
    .map(r => r.community_id);

  if (userCommunityIds.length === 0) return false;

  const { data: communities } = await supabaseClient
    .from('growth_communities')
    .select('id')
    .eq('school_id', schoolId)
    .in('id', userCommunityIds);

  return (communities && communities.length > 0);
}

// Check if consultor has access to a specific community
function consultorCanAccessCommunity(
  userRoles: PermissionResult['userRoles'],
  communityId: string
): boolean {
  // Check if consultor has any role with this community_id
  return userRoles.some(r => r.community_id === communityId);
}

// Get group info and member IDs based on group type
async function getGroupMemberIds(
  supabaseClient: any,
  groupType: GroupType,
  groupId: string | number
): Promise<{ groupName: string; memberIds: string[] }> {
  let groupName = '';
  let memberIds: string[] = [];

  switch (groupType) {
    case 'school': {
      // Get school name
      const { data: school } = await supabaseClient
        .from('schools')
        .select('name')
        .eq('id', groupId)
        .single();
      groupName = school?.name || 'Escuela desconocida';

      // Get all users with this school_id
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('user_id')
        .eq('school_id', groupId)
        .eq('is_active', true);
      memberIds = [...new Set((roles || []).map((r: any) => r.user_id))] as string[];
      break;
    }

    case 'community': {
      // Get community name
      const { data: community } = await supabaseClient
        .from('growth_communities')
        .select('name')
        .eq('id', groupId)
        .single();
      groupName = community?.name || 'Comunidad desconocida';

      // Get all users with this community_id
      const { data: roles } = await supabaseClient
        .from('user_roles')
        .select('user_id')
        .eq('community_id', groupId)
        .eq('is_active', true);
      memberIds = [...new Set((roles || []).map((r: any) => r.user_id))] as string[];
      break;
    }
  }

  return { groupName, memberIds };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const supabaseAuth = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseAuth.auth.getSession();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Create service role client for bypassing RLS
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Check permission and get role info for scoping
    const permissions = await checkPermissions(supabaseService, session.user.id);
    if (!permissions.allowed) {
      return res.status(403).json({
        error: 'No tienes permiso para ver asignaciones de grupos'
      });
    }

    // Get group type and ID from query
    const { groupType, groupId } = req.query;

    if (!groupType || typeof groupType !== 'string' || !['school', 'community'].includes(groupType)) {
      return res.status(400).json({
        error: 'groupType es requerido y debe ser school o community'
      });
    }

    if (!groupId || typeof groupId !== 'string') {
      return res.status(400).json({
        error: 'groupId es requerido'
      });
    }

    // For schools, validate and convert ID to number (schools.id is integer)
    // For communities, keep as string (UUID)
    let parsedGroupId: string | number = groupId;
    if (groupType === 'school') {
      const schoolIdNum = parseInt(groupId, 10);
      if (isNaN(schoolIdNum) || schoolIdNum <= 0) {
        return res.status(400).json({
          error: 'groupId debe ser un número válido para escuelas'
        });
      }
      parsedGroupId = schoolIdNum;

      // Scoping check for consultors (admins are exempt)
      if (!permissions.isAdmin) {
        const canAccess = await consultorCanAccessSchool(
          supabaseService,
          permissions.userRoles,
          schoolIdNum
        );
        if (!canAccess) {
          return res.status(403).json({
            error: 'No tienes acceso a esta escuela'
          });
        }
      }
    } else {
      // Validate UUID format for communities
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(groupId)) {
        return res.status(400).json({
          error: 'groupId debe ser un UUID válido para comunidades'
        });
      }

      // Scoping check for consultors (admins are exempt)
      if (!permissions.isAdmin) {
        const canAccess = consultorCanAccessCommunity(permissions.userRoles, groupId);
        if (!canAccess) {
          return res.status(403).json({
            error: 'No tienes acceso a esta comunidad'
          });
        }
      }
    }

    // Get group members using service client
    const { groupName, memberIds } = await getGroupMemberIds(
      supabaseService,
      groupType as GroupType,
      parsedGroupId
    );

    if (memberIds.length === 0) {
      return res.status(200).json({
        group: {
          id: groupId,
          name: groupName,
          type: groupType,
          memberCount: 0
        },
        commonAssignments: [],
        stats: {
          totalMembers: 0,
          membersWithAssignments: 0,
          uniqueCourses: 0,
          uniqueLPs: 0
        }
      } as GroupAssignmentsResponse);
    }

    // Get all course enrollments for members using service client
    const { data: enrollments, error: enrollmentsError } = await supabaseService
      .from('course_enrollments')
      .select(`
        user_id,
        course_id,
        lessons_completed,
        total_lessons,
        status,
        courses (
          id,
          title,
          description
        )
      `)
      .in('user_id', memberIds);

    if (enrollmentsError) {
      console.error('Error fetching group enrollments:', enrollmentsError);
      throw new Error('Error al obtener inscripciones del grupo');
    }

    // Get all LP assignments for members using service client
    const { data: lpAssignments, error: lpError } = await supabaseService
      .from('learning_path_assignments')
      .select(`
        user_id,
        path_id,
        learning_paths (
          id,
          name,
          description
        )
      `)
      .in('user_id', memberIds);

    if (lpError) {
      console.error('Error fetching group LP assignments:', lpError);
      throw new Error('Error al obtener asignaciones de rutas del grupo');
    }

    // Aggregate course data
    const courseMap: Record<string, {
      contentId: string;
      contentTitle: string;
      contentDescription?: string;
      userIds: Set<string>;
      completedUserIds: Set<string>;
      totalProgress: number;
      progressCount: number;
    }> = {};

    enrollments?.forEach((e: any) => {
      const courseId = e.course_id;
      const course = e.courses;
      if (!course) return;

      if (!courseMap[courseId]) {
        courseMap[courseId] = {
          contentId: courseId,
          contentTitle: course.title,
          contentDescription: course.description,
          userIds: new Set(),
          completedUserIds: new Set(),
          totalProgress: 0,
          progressCount: 0
        };
      }

      courseMap[courseId].userIds.add(e.user_id);

      // Calculate progress
      const total = e.total_lessons || 0;
      const completed = e.lessons_completed || 0;
      if (total > 0) {
        const progress = Math.round((completed / total) * 100);
        courseMap[courseId].totalProgress += progress;
        courseMap[courseId].progressCount++;

        if (completed >= total) {
          courseMap[courseId].completedUserIds.add(e.user_id);
        }
      }
    });

    // Aggregate LP data
    const lpMap: Record<string, {
      contentId: string;
      contentTitle: string;
      contentDescription?: string;
      userIds: Set<string>;
      completedUserIds: Set<string>;
    }> = {};

    lpAssignments?.forEach((lpa: any) => {
      const pathId = lpa.path_id;
      const lp = lpa.learning_paths;
      if (!lp) return;

      if (!lpMap[pathId]) {
        lpMap[pathId] = {
          contentId: pathId,
          contentTitle: lp.name || 'Ruta sin título',
          contentDescription: lp.description,
          userIds: new Set(),
          completedUserIds: new Set()
        };
      }

      lpMap[pathId].userIds.add(lpa.user_id);
      // Note: LP completion would require additional calculation
      // For now, we don't track LP completion in this endpoint
    });

    // Convert to array and sort by assignment count
    const courseAssignments: GroupAssignmentSummary[] = Object.values(courseMap)
      .map(c => ({
        contentId: c.contentId,
        contentTitle: c.contentTitle,
        contentDescription: c.contentDescription,
        type: 'course' as const,
        assignedCount: c.userIds.size,
        completedCount: c.completedUserIds.size,
        averageProgress: c.progressCount > 0
          ? Math.round(c.totalProgress / c.progressCount)
          : 0
      }))
      .sort((a, b) => b.assignedCount - a.assignedCount);

    const lpSummaries: GroupAssignmentSummary[] = Object.values(lpMap)
      .map(lp => ({
        contentId: lp.contentId,
        contentTitle: lp.contentTitle,
        contentDescription: lp.contentDescription,
        type: 'learning_path' as const,
        assignedCount: lp.userIds.size,
        completedCount: lp.completedUserIds.size
      }))
      .sort((a, b) => b.assignedCount - a.assignedCount);

    // Combine and sort all assignments
    const commonAssignments = [...courseAssignments, ...lpSummaries]
      .sort((a, b) => b.assignedCount - a.assignedCount);

    // Calculate stats
    const usersWithEnrollments = new Set(
      (enrollments || []).map((e: any) => e.user_id)
    );
    const usersWithLPs = new Set(
      (lpAssignments || []).map((lpa: any) => lpa.user_id)
    );
    const membersWithAssignments = new Set([
      ...usersWithEnrollments,
      ...usersWithLPs
    ]).size;

    const response: GroupAssignmentsResponse = {
      group: {
        id: groupId,
        name: groupName,
        type: groupType as GroupType,
        memberCount: memberIds.length
      },
      commonAssignments,
      stats: {
        totalMembers: memberIds.length,
        membersWithAssignments,
        uniqueCourses: Object.keys(courseMap).length,
        uniqueLPs: Object.keys(lpMap).length
      }
    };

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Group assignments error:', error);
    return res.status(500).json({
      error: error.message || 'Error al obtener asignaciones del grupo'
    });
  }
}
