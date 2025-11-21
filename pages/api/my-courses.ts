import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });
    
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Fetch enrollments with course details
    // We select specific fields to keep the payload light
    const { data: enrollments, error } = await supabase
      .from('course_enrollments')
      .select(`
        progress_percentage,
        lessons_completed,
        total_lessons,
        updated_at,
        assigned_at,
        courses (
          id,
          title,
          description,
          thumbnail_url
        )
      `)
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching enrollments:', error);
      return res.status(500).json({ error: 'Error al cargar los cursos' });
    }

    // Transform data for the frontend
    const courses = (enrollments || []).map((enrollment: any) => {
      if (!enrollment.courses) return null;
      
      return {
        id: enrollment.courses.id,
        title: enrollment.courses.title,
        description: enrollment.courses.description,
        thumbnail_url: enrollment.courses.thumbnail_url,
        progress_percentage: enrollment.progress_percentage || 0,
        lessons_completed: enrollment.lessons_completed || 0,
        total_lessons: enrollment.total_lessons || 0,
        last_activity: enrollment.updated_at,
        assigned_at: enrollment.assigned_at
      };
    }).filter(Boolean);

    return res.status(200).json(courses);
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
