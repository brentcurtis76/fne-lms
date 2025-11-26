import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../../lib/api-auth';

// Check if user is admin
async function hasAdminPermission(supabaseClient: any, userId: string): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;
  return roles.some((r: any) => r.role_type === 'admin');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const isAdmin = await hasAdminPermission(supabaseClient, user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden ver los cursos' });
    }

    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const pageSizeParam = Math.max(parseInt((req.query.pageSize as string) || '12', 10), 1);
    const pageSize = Math.min(pageSizeParam, 50);
    const search = (req.query.search as string)?.trim() || '';
    const instructor = (req.query.instructor as string)?.trim() || '';
    const offset = (page - 1) * pageSize;

    // Build query with instructor join (courses.instructor_id -> instructors.id)
    let query = supabaseClient
      .from('courses')
      .select(
        `
          id,
          title,
          description,
          thumbnail_url,
          structure_type,
          created_at,
          instructor_id,
          instructor:instructors(full_name)
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    if (search) {
      const sanitized = search.replace(/%/g, '').toLowerCase();
      query = query.or(
        `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
      );
    }

    // Execute query without pagination first to filter by instructor name
    const { data: allData, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching courses:', fetchError);
      return res.status(500).json({ error: 'Error al obtener cursos' });
    }

    // Format courses with instructor_name
    let formattedCourses = (allData || []).map((course: any) => {
      const instructorData = course.instructor;
      const instructorName = instructorData?.full_name || 'Sin instructor';
      return {
        ...course,
        instructor_name: instructorName,
        instructor: undefined // Remove the nested object
      };
    });

    // Filter by instructor name if provided
    if (instructor) {
      formattedCourses = formattedCourses.filter(
        (c: any) => c.instructor_name === instructor
      );
    }

    // Get total count after instructor filter
    const total = formattedCourses.length;

    // Apply pagination after instructor filter
    const paginatedCourses = formattedCourses.slice(offset, offset + pageSize);

    // Get unique instructors for the filter dropdown (from all courses, not just filtered)
    const allInstructors = (allData || []).map((course: any) => {
      return course.instructor?.full_name || 'Sin instructor';
    });
    const uniqueInstructors = [...new Set(allInstructors)].filter(Boolean).sort();

    return res.status(200).json({
      success: true,
      courses: paginatedCourses,
      total,
      page,
      pageSize,
      instructors: uniqueInstructors
    });
  } catch (err: any) {
    console.error('Unexpected error fetching courses:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener cursos' });
  }
}
