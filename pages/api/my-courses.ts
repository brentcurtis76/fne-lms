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

    const userId = session.user.id;

    // Fetch enrollments with course details
    const { data: enrollments, error } = await supabase
      .from('course_enrollments')
      .select(`
        course_id,
        updated_at,
        created_at,
        courses (
          id,
          title,
          description,
          thumbnail_url
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching enrollments:', error);
      return res.status(500).json({ error: 'Error al cargar los cursos' });
    }

    // Calculate progress from lesson_progress table for accuracy
    // This ensures we always show the real progress, not stale cached values
    const courses = await Promise.all((enrollments || []).map(async (enrollment: any) => {
      if (!enrollment.courses) return null;

      const courseId = enrollment.courses.id;

      // Get all lessons for this course
      const { data: lessons } = await supabase
        .from('lessons')
        .select('id')
        .eq('course_id', courseId);

      const totalLessons = lessons?.length || 0;

      if (totalLessons === 0) {
        return {
          id: courseId,
          title: enrollment.courses.title,
          description: enrollment.courses.description,
          thumbnail_url: enrollment.courses.thumbnail_url,
          progress_percentage: 0,
          lessons_completed: 0,
          total_lessons: 0,
          last_activity: enrollment.updated_at,
          assigned_at: enrollment.created_at
        };
      }

      // For each lesson, check if ALL blocks are completed
      let completedLessons = 0;

      for (const lesson of lessons || []) {
        // Get total blocks for this lesson
        const { data: blocks } = await supabase
          .from('blocks')
          .select('id')
          .eq('lesson_id', lesson.id);

        const totalBlocks = blocks?.length || 0;

        if (totalBlocks === 0) {
          // Lesson with no blocks is considered complete
          completedLessons++;
          continue;
        }

        // Get completed blocks for this user in this lesson
        const { data: completedBlocksData } = await supabase
          .from('lesson_progress')
          .select('block_id')
          .eq('lesson_id', lesson.id)
          .eq('user_id', userId)
          .not('completed_at', 'is', null);

        const completedBlocks = completedBlocksData?.length || 0;

        if (completedBlocks >= totalBlocks) {
          completedLessons++;
        }
      }

      const progressPercentage = Math.round((completedLessons / totalLessons) * 100);

      return {
        id: courseId,
        title: enrollment.courses.title,
        description: enrollment.courses.description,
        thumbnail_url: enrollment.courses.thumbnail_url,
        progress_percentage: progressPercentage,
        lessons_completed: completedLessons,
        total_lessons: totalLessons,
        last_activity: enrollment.updated_at,
        assigned_at: enrollment.created_at
      };
    }));

    return res.status(200).json(courses.filter(Boolean));
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
