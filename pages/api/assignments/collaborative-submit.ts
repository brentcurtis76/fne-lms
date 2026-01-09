/**
 * API Route: Collaborative Assignment Submission
 * Handles submission of assignments with optional sharing to community members
 * FIXED: Now uses lesson_assignment_submissions and correct notification API
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { userAssignmentsService } from '@/lib/services/userAssignments';
import notificationService from '@/lib/notificationService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Create Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check authentication
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Parse request body
    const { assignmentId, communityId, content, fileUrl, sharedWithUserIds } =
      req.body;

    // Validation
    if (!assignmentId) {
      return res.status(400).json({
        error: 'Se requiere assignmentId'
      });
    }

    if (!content && !fileUrl) {
      return res.status(400).json({
        error: 'Debes proporcionar contenido o un archivo'
      });
    }

    if (!Array.isArray(sharedWithUserIds)) {
      return res.status(400).json({
        error: 'sharedWithUserIds debe ser un array'
      });
    }

    // Validate user has access to this assignment (enrolled in course)
    const { data: assignment } = await supabase
      .from('lesson_assignments')
      .select('course_id, title')
      .eq('id', assignmentId)
      .eq('is_published', true)
      .single();

    if (!assignment) {
      return res.status(404).json({
        error: 'Tarea no encontrada'
      });
    }

    // Check user is enrolled in the course (active enrollment only)
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('course_id', assignment.course_id)
      .eq('status', 'active')
      .single();

    if (!enrollment) {
      return res.status(403).json({
        error: 'No tienes acceso a esta tarea'
      });
    }

    // Create collaborative submission
    const result = await userAssignmentsService.createCollaborativeSubmission(
      supabase,
      {
        assignmentId,
        submitterId: session.user.id,
        communityId,
        content,
        fileUrl,
        sharedWithUserIds
      }
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Error al crear la entrega'
      });
    }

    // Get submitter profile for notifications
    const { data: submitterProfile } = await supabase
      .from('profiles')
      .select('name, first_name, last_name, email')
      .eq('id', session.user.id)
      .single();

    const submitterName = submitterProfile?.name ||
                         (submitterProfile?.first_name && submitterProfile?.last_name
                           ? `${submitterProfile.first_name} ${submitterProfile.last_name}`.trim()
                           : submitterProfile?.first_name || submitterProfile?.last_name) ||
                         submitterProfile?.email ||
                         'Un compañero';

    // Send notifications to shared members (FIXED: correct API)
    if (sharedWithUserIds.length > 0) {
      for (const userId of sharedWithUserIds) {
        try {
          await notificationService.createNotification({
            user_id: userId,
            title: 'Trabajo compartido contigo',
            description: `${submitterName} ha compartido un trabajo contigo para "${assignment.title}"`,
            category: 'assignment',
            related_url: `/mi-aprendizaje/tareas?highlight=${assignmentId}`,
            importance: 'normal'
          });
        } catch (error) {
          console.error('Error sending notification to user:', userId, error);
        }
      }
    }

    // Send notification to teachers/consultants (FIXED: correct API)
    try {
      // Get course creator and teachers
      const { data: courseData } = await supabase
        .from('courses')
        .select('created_by')
        .eq('id', assignment.course_id)
        .single();

      if (courseData?.created_by) {
        const sharedCountText =
          sharedWithUserIds.length > 0
            ? ` (compartido con ${sharedWithUserIds.length} compañero${sharedWithUserIds.length > 1 ? 's' : ''})`
            : '';

        await notificationService.createNotification({
          user_id: courseData.created_by,
          title: 'Nuevo trabajo entregado',
          description: `${submitterName} ha entregado "${assignment.title}"${sharedCountText}`,
          category: 'assignment',
          related_url: `/assignments/${assignmentId}`,
          importance: 'normal'
        });
      }
    } catch (error) {
      console.error('Error sending notifications to teachers:', error);
    }

    return res.status(200).json({
      success: true,
      submissionId: result.submissionId,
      sharedCount: result.sharedCount,
      message:
        sharedWithUserIds.length > 0
          ? `Trabajo enviado y compartido con ${result.sharedCount} compañero${result.sharedCount! > 1 ? 's' : ''}`
          : 'Trabajo enviado exitosamente'
    });
  } catch (error) {
    console.error('Error in collaborative submission:', error);
    return res.status(500).json({
      error: 'Error al enviar el trabajo',
      details: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}
