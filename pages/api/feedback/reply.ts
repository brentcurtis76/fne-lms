import { NextApiRequest, NextApiResponse } from 'next';
import notificationService from '../../../lib/notificationService';
import { createServiceRoleClient, requireVerifiedRole } from '../../../lib/api-auth';

/**
 * /api/feedback/reply — an admin writes a REPLY on a Soporte ticket: a
 * feedback_activity row marked visible_to_reporter, which the person who
 * reported the ticket can read (migration 20261118105000_feedback_replies.sql).
 * Internal notes are not written here; the admin's screen inserts them itself.
 *
 * POST { feedback_id, message }. Admin only: requireVerifiedRole (the caller is
 * verified with the auth server, passes the forced-password gate and holds an
 * active `admin` user_roles row). The author is the verified caller, never a
 * body field; every other body key is ignored. One insert, with the service
 * client. The reporter is then told through the bell only (no e-mail); an
 * internal note never notifies.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE = 5000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const auth = await requireVerifiedRole(req, res, ['admin'], 'Solo un administrador puede responder un reporte');
    if (!auth.user) {
      return res.status(auth.status).json(auth.body);
    }
    const adminId = auth.user.id;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const feedbackId = body.feedback_id;
    if (typeof feedbackId !== 'string' || !UUID.test(feedbackId)) {
      return res.status(400).json({ error: 'Falta el reporte o su identificador no es válido.' });
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length === 0) {
      return res.status(400).json({ error: 'La respuesta no puede estar vacía.' });
    }
    if (message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: 'La respuesta no puede superar los 5.000 caracteres.' });
    }

    const serviceClient = createServiceRoleClient();

    const { data: feedback, error: feedbackError } = await serviceClient
      .from('platform_feedback')
      .select('id, created_by')
      .eq('id', feedbackId)
      .maybeSingle();
    if (feedbackError) {
      console.error('[feedback-reply] feedback lookup failed');
      return res.status(500).json({ error: 'No se pudo verificar el reporte' });
    }
    if (!feedback) {
      return res.status(404).json({ error: 'No se encontró el reporte.' });
    }

    const { data: activity, error: insertError } = await serviceClient
      .from('feedback_activity')
      .insert({
        feedback_id: feedbackId,
        message,
        created_by: adminId,
        is_system_message: false,
        visible_to_reporter: true,
      })
      .select('*')
      .single();
    if (insertError || !activity) {
      console.error('[feedback-reply] insert failed');
      return res.status(500).json({ error: 'No se pudo guardar la respuesta' });
    }

    // The reporter comes from the persisted ticket, never from the body; an admin
    // replying to their own ticket is not notified. A failure never costs the reply.
    if (typeof feedback.created_by === 'string' && feedback.created_by !== adminId) {
      try {
        const result = await notificationService.triggerNotification('feedback_reply', {
          feedback_id: feedbackId,
          activity_id: activity.id,
          reporter_id: feedback.created_by,
        });
        if (!result.success) {
          console.error('[feedback-reply] notification not created');
        }
      } catch {
        console.error('[feedback-reply] notification not created');
      }
    }

    return res.status(200).json({ success: true, activity });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[feedback-reply] unexpected error');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
