import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabaseService.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    // Get user's roles
    const { data: userRoles, error: rolesError } = await supabaseService
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      return res.status(500).json({ error: 'Failed to fetch user roles' });
    }

    const roles = userRoles?.map(r => r.role_type) || [];
    const isAdmin = roles.includes('admin');
    const isConsultant = roles.includes('consultor');

    if (!isAdmin && !isConsultant) {
      return res.status(403).json({ error: 'No permission to access assignments' });
    }

    // Parse query parameters
    const { school_id, community_id, generation_id, limit = '50', offset = '0' } = req.query;
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);

    console.log('[API assignments] User:', user.id, 'isAdmin:', isAdmin, 'isConsultant:', isConsultant);

    let courseIds: string[] = [];
    let allowedStudentIds: Set<string> = new Set();

    if (isAdmin) {
      // Admin sees all courses
      const { data: allCourses, error: coursesError } = await supabaseService
        .from('courses')
        .select('id');

      if (coursesError) throw coursesError;
      courseIds = allCourses?.map(c => c.id) || [];
    } else if (isConsultant) {
      // Get consultant's assignments
      const { data: consultantAssignments, error: assignmentsError } = await supabaseService
        .from('consultant_assignments')
        .select('student_id, school_id, generation_id, community_id, assignment_data')
        .eq('consultant_id', user.id)
        .eq('is_active', true);

      if (assignmentsError) {
        console.error('Error fetching consultant assignments:', assignmentsError);
        return res.status(500).json({ error: 'Failed to fetch consultant assignments' });
      }

      console.log('[API assignments] Consultant assignments:', consultantAssignments?.length);

      if (!consultantAssignments || consultantAssignments.length === 0) {
        return res.status(200).json({ assignments: [], total: 0 });
      }

      // Build list of allowed student IDs based on assignment scopes
      for (const assignment of consultantAssignments) {
        const scope = assignment.assignment_data?.assignment_scope || 'individual';

        if (scope === 'individual' && assignment.student_id) {
          allowedStudentIds.add(assignment.student_id);
        } else if (scope === 'school' && assignment.school_id) {
          const { data: schoolUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('school_id', assignment.school_id)
            .eq('is_active', true);
          if (schoolUsers) {
            schoolUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        } else if (scope === 'generation' && assignment.generation_id) {
          const { data: genUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('generation_id', assignment.generation_id)
            .eq('is_active', true);
          if (genUsers) {
            genUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        } else if (scope === 'community' && assignment.community_id) {
          const { data: communityUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('community_id', assignment.community_id)
            .eq('is_active', true);
          if (communityUsers) {
            communityUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        }
      }

      console.log('[API assignments] Allowed students:', allowedStudentIds.size);

      if (allowedStudentIds.size === 0) {
        return res.status(200).json({ assignments: [], total: 0 });
      }

      // Get courses that these students are enrolled in
      const { data: enrollments } = await supabaseService
        .from('course_enrollments')
        .select('course_id')
        .in('user_id', Array.from(allowedStudentIds));

      console.log('[API assignments] Enrollments found:', enrollments?.length);

      const enrolledCourseIds = new Set(enrollments?.map(e => e.course_id) || []);
      courseIds = Array.from(enrolledCourseIds);
      console.log('[API assignments] Course IDs:', courseIds.length);
    }

    if (courseIds.length === 0) {
      console.log('[API assignments] No courses found, returning empty');
      return res.status(200).json({ assignments: [], total: 0 });
    }

    // Get lessons with group assignment blocks from these courses
    const { data: lessons, error: lessonsError } = await supabaseService
      .from('lessons')
      .select(`
        id,
        title,
        course_id,
        content,
        courses!inner (
          id,
          title
        )
      `)
      .in('course_id', courseIds);

    if (lessonsError) throw lessonsError;

    console.log('[API assignments] Lessons found:', lessons?.length);

    // Debug: Check what block types exist
    const blockTypes = new Set<string>();
    for (const lesson of (lessons || [])) {
      const content = lesson.content;
      if (content && Array.isArray(content)) {
        content.forEach((block: any) => {
          if (block.type) blockTypes.add(block.type);
        });
      }
    }
    console.log('[API assignments] Block types found:', Array.from(blockTypes));

    // Filter lessons that have group_assignment blocks and build assignment list
    const assignments: any[] = [];
    let groupAssignmentBlocksFound = 0;

    for (const lesson of (lessons || [])) {
      const content = lesson.content;
      if (!content || !Array.isArray(content)) continue;

      // Find group_assignment blocks
      const assignmentBlocks = content.filter((block: any) => block.type === 'group_assignment');
      groupAssignmentBlocksFound += assignmentBlocks.length;

      for (const block of assignmentBlocks) {
        // Get groups for this assignment
        const { data: groups } = await supabaseService
          .from('assignment_groups')
          .select(`
            id,
            name,
            community_id,
            assignment_group_members (
              user_id,
              profiles (
                id,
                first_name,
                last_name,
                email
              )
            ),
            growth_communities (
              id,
              name,
              school_id,
              generation_id,
              schools (
                id,
                name
              ),
              generations (
                id,
                name
              )
            )
          `)
          .eq('lesson_id', lesson.id)
          .eq('block_id', block.id);

        // Apply filters
        let filteredGroups = groups || [];

        if (school_id) {
          filteredGroups = filteredGroups.filter((g: any) =>
            g.growth_communities?.school_id === parseInt(school_id as string)
          );
        }
        if (community_id) {
          filteredGroups = filteredGroups.filter((g: any) =>
            g.community_id === community_id
          );
        }
        if (generation_id) {
          filteredGroups = filteredGroups.filter((g: any) =>
            g.growth_communities?.generation_id === generation_id
          );
        }

        // For consultants, filter groups to only include their assigned students
        if (isConsultant) {
          filteredGroups = filteredGroups.filter((g: any) => {
            const memberIds = g.assignment_group_members?.map((m: any) => m.user_id) || [];
            return memberIds.some((id: string) => allowedStudentIds.has(id));
          });
        }

        if (filteredGroups.length === 0) continue;

        // Get submissions for these groups
        const groupIds = filteredGroups.map((g: any) => g.id);
        const { data: submissions } = await supabaseService
          .from('assignment_group_submissions')
          .select('group_id, status')
          .in('group_id', groupIds);

        const submittedGroups = submissions?.filter(s => s.status === 'submitted' || s.status === 'reviewed').length || 0;

        // Get unique community info - type cast since Supabase infers arrays
        const community = filteredGroups[0]?.growth_communities as any;

        // Type cast courses since Supabase returns it as array type but it's actually a single object
        const courseData = lesson.courses as unknown as { id: any; title: any } | null;

        assignments.push({
          id: `${lesson.id}_${block.id}`,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course_id,
          course_title: courseData?.title,
          title: block.data?.title || 'Tarea Grupal',
          description: block.data?.description || '',
          instructions: block.data?.instructions || '',
          resources: block.data?.resources || [],
          created_at: block.data?.created_at || (lesson as any).created_at,
          groups_count: filteredGroups.length,
          students_count: filteredGroups.reduce((sum: number, g: any) =>
            sum + (g.assignment_group_members?.length || 0), 0),
          submitted_count: submittedGroups,
          submission_rate: filteredGroups.length > 0
            ? Math.round((submittedGroups / filteredGroups.length) * 100)
            : 0,
          community: community ? {
            id: community.id,
            name: community.name,
            school_id: community.school_id?.toString(),
            generation_id: community.generation_id,
            school: community.schools,
            generation: community.generations
          } : null
        });
      }
    }

    console.log('[API assignments] Group assignment blocks found:', groupAssignmentBlocksFound);
    console.log('[API assignments] Final assignments count:', assignments.length);

    // Sort by created_at descending
    assignments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply pagination
    const total = assignments.length;
    const paginatedAssignments = assignments.slice(offsetNum, offsetNum + limitNum);

    return res.status(200).json({
      assignments: paginatedAssignments,
      total
    });

  } catch (error) {
    console.error('Admin assignments API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
