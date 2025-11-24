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

    let query = supabaseClient
      .from('courses')
      .select(
        `
          id,
          title,
          description,
          thumbnail_url,
          instructor_name,
          instructor_id,
          instructors!left(full_name),
          structure_type,
          created_at
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (search) {
      const sanitized = search.replace(/%/g, '').toLowerCase();
      query = query.or(
        `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,instructor_name.ilike.%${sanitized}%,instructors.full_name.ilike.%${sanitized}%`
      );
    }

    if (instructor) {
      // Match either stored instructor_name or related instructor full_name
      query = query.or(
        `instructor_name.eq.${instructor},instructors.full_name.eq.${instructor}`
      );
    }

    const { data, error: fetchError, count } = await query;

    if (fetchError) {
      console.error('Error fetching courses:', fetchError);
      return res.status(500).json({ error: 'Error al obtener cursos' });
    }

    // Normalize instructor name for response
    const normalizedCourses = (data || []).map((course: any) => ({
      ...course,
      instructor_name: course.instructor_name || course.instructors?.full_name || 'Sin instructor'
    }));

    return res.status(200).json({
      success: true,
      courses: normalizedCourses,
      total: count || 0,
      page,
      pageSize
    });
  } catch (err: any) {
    console.error('Unexpected error fetching courses:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener cursos' });
  }
}
