import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET method
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const { id: courseId } = req.query;

    if (!courseId || typeof courseId !== 'string') {
      return res.status(400).json({
        error: 'courseId es requerido'
      });
    }

    // Fetch course details
    const { data: course, error: courseError } = await supabaseClient
      .from('courses')
      .select(`
        id,
        title,
        description,
        created_at
      `)
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Get assignment count
    const { count: assignmentCount, error: countError } = await supabaseClient
      .from('course_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (countError) {
      console.warn('Failed to fetch assignment count:', countError);
    }

    // Return course details with assignment count
    return res.status(200).json({
      success: true,
      course: {
        ...course,
        assignment_count: assignmentCount || 0
      }
    });

  } catch (error: any) {
    console.error('Fetch course error:', error);

    return res.status(500).json({
      error: error.message || 'Error al obtener detalles del curso'
    });
  }
}
