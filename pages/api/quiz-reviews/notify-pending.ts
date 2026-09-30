import { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getApiUser,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  sendForcedPasswordChangeResponse,
  loggableError,
} from '../../../lib/api-auth';
import NotificationService from '../../../lib/notificationService';
import { buildNotificationUrl, NOTIFICATION_CATALOG } from '../../../lib/notifications/catalog';

/**
 * POST /api/quiz-reviews/notify-pending — the quiz_review_pending bell for a
 * saved quiz submission (lib/services/quizSubmissions.js `submitQuiz`, after the
 * RPC). The caller sends only the submission id and must be its student. The
 * reviewers are the users the pending-review list (pending.ts) shows this
 * student's submissions to: active consultant assignments whose scope covers
 * the student, held by a user with an active reviewing role. Calling again for
 * the same submission creates only the bells still missing.
 *
 * This module also exports the bell writer and the log-safe error summary the
 * group and quiz routes share.
 */

/** What a log line keeps of an error (lib/api-auth): its error code and HTTP status, nothing else. */
export { loggableError };

export type RecordBellEvent = 'group_invitation' | 'group_assignment_submitted' | 'quiz_review_pending' | 'quiz_reviewed';

/** Fixed copy: no name, title, answer, grade or other free text reaches a bell, an e-mail or a log. */
const BELL_COPY: Record<RecordBellEvent, { title: string; description: string }> = {
  group_invitation: {
    title: 'Te agregaron a un grupo',
    description: 'Un compañero te agregó a su grupo para una tarea grupal.',
  },
  group_assignment_submitted: {
    title: 'Nueva tarea grupal entregada',
    description: 'Un grupo de tu comunidad entregó una tarea grupal.',
  },
  quiz_review_pending: {
    title: 'Quiz pendiente de revisión',
    description: 'Hay un quiz con preguntas abiertas que requiere tu revisión.',
  },
  quiz_reviewed: {
    title: 'Quiz revisado',
    description: 'Tu quiz fue revisado. Revisa la retroalimentación en la lección.',
  },
};

export interface BellRecipient {
  id: string;
  /** The recipient's highest role, when the event's link depends on it. */
  role?: string;
}

/**
 * One service-owned bell per distinct recipient for a persisted record, keyed by
 * event, record and recipient (N2-01), so a repeat creates only missing bells.
 * Never throws: returns how many recipients were left without a bell.
 */
export async function deliverRecordBells(
  eventType: RecordBellEvent,
  record: Record<string, string>,
  recipients: BellRecipient[]
): Promise<number> {
  const occurrence = NotificationService.resolveOccurrence(eventType, record);
  const unique = new Map(recipients.map((r) => [r.id, r]));
  let failed = 0;
  for (const { id, role } of unique.values()) {
    try {
      await NotificationService.createNotification({
        user_id: id,
        ...BELL_COPY[eventType],
        category: NOTIFICATION_CATALOG[eventType].category,
        related_url: buildNotificationUrl(eventType, record, role),
        importance: 'normal',
        read_at: null,
        event_type: eventType,
        idempotency_key: NotificationService.generateIdempotencyKey(eventType, occurrence, id),
      });
    } catch {
      failed++;
    }
  }
  return failed;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEWER_ROLES = ['admin', 'consultor', 'equipo_directivo'];
const LOG = '[quiz-reviews/notify-pending]';

type Scoped = { school_id: number | null; generation_id: string | null; community_id: string | null };
type ConsultantAssignment = Scoped & {
  consultant_id: string;
  student_id: string | null;
  assignment_data: { assignment_scope?: string } | null;
};

/** Reviewer ids for this student's submissions, or null when a lookup failed. */
async function findReviewers(client: SupabaseClient, studentId: string): Promise<string[] | null> {
  const { data: studentRoles, error: studentError } = await client
    .from('user_roles')
    .select('school_id, generation_id, community_id')
    .eq('user_id', studentId)
    .eq('is_active', true);
  if (studentError) return null;

  const ids = <K extends keyof Scoped>(key: K) =>
    [...new Set(((studentRoles ?? []) as Scoped[]).map((r) => r[key]).filter((v) => v !== null && v !== undefined))];
  const schools = ids('school_id');
  const generations = ids('generation_id');
  const communities = ids('community_id');

  const filters = [`student_id.eq.${studentId}`];
  if (schools.length) filters.push(`school_id.in.(${schools.join(',')})`);
  if (generations.length) filters.push(`generation_id.in.(${generations.join(',')})`);
  if (communities.length) filters.push(`community_id.in.(${communities.join(',')})`);

  const { data: assignments, error: assignmentError } = await client
    .from('consultant_assignments')
    .select('consultant_id, student_id, school_id, generation_id, community_id, assignment_data')
    .eq('is_active', true)
    .or(filters.join(','));
  if (assignmentError) return null;

  // The same scope rules pending.ts applies to a consultor's list.
  const covers = (a: ConsultantAssignment) => {
    switch (a.assignment_data?.assignment_scope || 'individual') {
      case 'individual': return a.student_id === studentId;
      case 'school': return schools.includes(a.school_id);
      case 'generation': return generations.includes(a.generation_id);
      case 'community': return communities.includes(a.community_id);
      default: return false;
    }
  };
  const candidates = [
    ...new Set(((assignments ?? []) as ConsultantAssignment[]).filter(covers).map((a) => a.consultant_id)),
  ].filter((id) => id !== studentId);
  if (candidates.length === 0) return [];

  const { data: roles, error: roleError } = await client
    .from('user_roles')
    .select('user_id, role_type')
    .in('user_id', candidates)
    .eq('is_active', true);
  if (roleError) return null;
  const reviewers = new Set(
    (roles ?? []).filter((r: { role_type: string }) => REVIEWER_ROLES.includes(r.role_type)).map((r: { user_id: string }) => r.user_id)
  );
  return candidates.filter((id) => reviewers.has(id));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { user, error: authError } = await getApiUser(req, res);
    if (authError || !user) {
      return res.status(401).json({ error: 'Debes iniciar sesión' });
    }

    const client = createServiceRoleClient();

    const verdict = await getForcedPasswordChangeVerdict(client, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    const submissionId = req.body?.submission_id;
    if (typeof submissionId !== 'string' || !UUID.test(submissionId)) {
      return res.status(400).json({ error: 'Identificador inválido' });
    }

    const { data: submission, error: submissionError } = await client
      .from('quiz_submissions')
      .select('id, student_id, manual_gradable_points, review_status')
      .eq('id', submissionId.toLowerCase())
      .maybeSingle();
    if (submissionError) {
      console.error(`${LOG} submission lookup failed`);
      return res.status(500).json({ error: 'No se pudo verificar la entrega' });
    }
    if (!submission) return res.status(404).json({ error: 'Entrega no encontrada' });
    if (submission.student_id !== user.id) {
      return res.status(403).json({ error: 'Solo quien respondió el quiz puede notificar' });
    }
    // An auto-graded or already reviewed submission has nothing pending.
    if (!(submission.manual_gradable_points > 0) || submission.review_status !== 'pending') {
      return res.status(200).json({ success: true, notified: 0 });
    }

    const reviewers = await findReviewers(client, submission.student_id);
    if (!reviewers) {
      console.error(`${LOG} reviewer lookup failed`);
      return res.status(500).json({ error: 'No se pudo determinar quién revisa el quiz' });
    }

    const failed = await deliverRecordBells(
      'quiz_review_pending',
      { submission_id: submission.id },
      reviewers.map((id) => ({ id }))
    );
    if (failed > 0) {
      // Nonfatal for the submission, which stays saved: a repeat fills the gap.
      console.error(`${LOG} notifications not created`, { failed });
      return res.status(500).json({ error: 'No se pudieron crear todas las notificaciones' });
    }
    return res.status(200).json({ success: true, notified: reviewers.length });
  } catch {
    // The exception text is not logged: it can carry a credential or an identifier.
    console.error(`${LOG} unexpected error`);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
