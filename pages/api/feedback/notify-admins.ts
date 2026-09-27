import { NextApiRequest, NextApiResponse } from 'next';
import notificationService from '../../../lib/notificationService';
import {
  getApiUser,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
} from '../../../lib/api-auth';

/**
 * /api/feedback/notify-admins — tells the platform admins that a feedback row
 * was submitted (components/feedback/FeedbackModal.tsx).
 *
 * The caller supplies only `feedback_id`. Everything else is derived here from
 * the persisted row, on the service-role client:
 *
 *   * only the row's creator may trigger the notification for it;
 *   * recipients are the active literal `admin` role rows, never a caller list;
 *   * the notification text is generic wording built from the persisted `type`.
 *     The feedback body is never read, so neither the description (which may
 *     name a student) nor any caller-supplied name, preview or URL can reach
 *     the in-app title/description, the e-mail or a log line.
 *
 * Accepts Bearer or cookie sessions (getApiUser).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TYPE_LABELS: Record<string, string> = {
  bug: 'Problema',
  idea: 'Idea',
  feedback: 'Comentario',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { user, error: authError } = await getApiUser(req, res);
    if (authError || !user) {
      return res.status(401).json({ error: 'Debes iniciar sesión' });
    }

    const serviceClient = createServiceRoleClient();

    const verdict = await getForcedPasswordChangeVerdict(serviceClient, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    const feedbackId = (req.body ?? {}).feedback_id;
    if (typeof feedbackId !== 'string' || !UUID.test(feedbackId)) {
      return res.status(400).json({ error: 'Identificador de feedback inválido' });
    }

    const { data: feedback, error: feedbackError } = await serviceClient
      .from('platform_feedback')
      .select('id, created_by, type')
      .eq('id', feedbackId)
      .maybeSingle();
    if (feedbackError) {
      console.error('[notify-admins] feedback lookup failed');
      return res.status(500).json({ error: 'No se pudo verificar el feedback' });
    }
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback no encontrado' });
    }
    if (feedback.created_by !== user.id) {
      return res.status(403).json({ error: 'No tienes permiso para notificar este feedback' });
    }

    const { data: adminRoles, error: rolesError } = await serviceClient
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin')
      .eq('is_active', true);
    if (rolesError) {
      console.error('[notify-admins] admin lookup failed');
      return res.status(500).json({ error: 'No se pudo obtener la lista de administradores' });
    }

    const adminIds = Array.from(
      new Set(
        (adminRoles ?? [])
          .map((row: { user_id?: unknown }) => row.user_id)
          .filter((id): id is string => typeof id === 'string')
      )
    );
    if (adminIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay administradores activos para notificar',
        notificationsCreated: 0,
      });
    }

    const typeLabel = TYPE_LABELS[feedback.type] ?? TYPE_LABELS.feedback;
    const result = await notificationService.triggerNotification('new_feedback', {
      feedback_id: feedback.id,
      feedback_type: feedback.type,
      feedback_preview: `Nuevo reporte de tipo ${typeLabel}`,
      assigned_users: adminIds,
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: 'No se pudo notificar a los administradores' });
    }

    return res.status(200).json({
      success: true,
      message: 'Administradores notificados',
      notificationsCreated: result.notificationsCreated ?? 0,
    });
  } catch (error) {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error('[notify-admins] unexpected error');
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
