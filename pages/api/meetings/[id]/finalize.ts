import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  sendApiError,
  sendApiResponse,
  sendMeetingError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getCommunityRecipients } from '../../../../lib/notificationService';
import notificationService from '../../../../lib/notificationService';
import { sendMeetingSummary } from '../../../../lib/emailService';
import { docToHtml } from '../../../../lib/tiptap/render';
import { escapeHtml } from '../../../../lib/utils/html-escape';
import { loadMeetingAuthContext } from '../../../../lib/api/meetings/load-context';
import { MEETING_STATUS } from '../../../../lib/utils/meeting-policy';
import { profileName } from '../../../../lib/utils/profile-name';

const finalizeSchema = z.object({
  audience: z.enum(['community', 'attended']),
  facilitator_message_doc: z.record(z.unknown()).optional(),
});

// Shared email-body paragraph styles. Three near-identical strings used to
// be inlined — kept at module level so tweaks to brand palette or spacing
// apply uniformly across summary/notes/agreements/commitments fallbacks.
const EMAIL_PARAGRAPH_STYLE =
  'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 12px 0;';
const EMAIL_PARAGRAPH_TIGHT_STYLE =
  'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 8px 0;';
const EMAIL_PARAGRAPH_COMPACT_STYLE =
  'font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #333333; margin: 0;';

const renderRichOrPlain = (doc: any, text: string | null | undefined): string => {
  const rich = docToHtml(doc);
  if (rich) return rich;
  const plain = (text ?? '').trim();
  if (!plain) return '';
  return `<p style="${EMAIL_PARAGRAPH_STYLE}">${escapeHtml(plain)}</p>`;
};

type FinalizeMeeting = {
  id: string;
  title: string;
  status: string;
  created_by: string;
  facilitator_id: string | null;
  secretary_id: string | null;
  meeting_date: string | null;
  summary: string | null;
  summary_doc: any;
  notes: string | null;
  notes_doc: any;
  finalized_at: string | null;
  version: number;
  workspace?: any;
};

/**
 * POST /api/meetings/[id]/finalize
 * Transitions a borrador meeting to completada, records who finalized it and
 * the chosen audience, closes any open work sessions, and emails a summary
 * to the target audience.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-finalize');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return sendApiError(res, firstIssue?.message || 'Payload de finalización inválido', 400);
  }
  const { audience, facilitator_message_doc } = parsed.data;

  const startedAt = Date.now();

  try {
    // Finalize needs the `community:communities(id, name)` inner select on
    // the workspace join for the email header, so it re-declares the
    // workspace clause instead of using the plain `MEETING_POLICY_COLUMNS`.
    // Policy reads still only require `community_id` off the join, which
    // this extended form still provides.
    const ctx = await loadMeetingAuthContext<FinalizeMeeting>(req, res, {
      meetingSelect:
        'id, status, created_by, facilitator_id, secretary_id, ' +
        'workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id, community:communities(id, name)), ' +
        'title, meeting_date, summary, summary_doc, notes, notes_doc, finalized_at, version',
      require: 'finalize',
    });
    if (!ctx) return;

    const { meeting, serviceClient, user } = ctx;
    const id = meeting.id;

    if (meeting.status !== MEETING_STATUS.BORRADOR) {
      return sendMeetingError(
        res,
        409,
        'meeting_not_draft',
        'La reunión ya no está en borrador',
      );
    }

    // finalize needs richer attendee data (attendance_status + profile) for
    // the email body; the shared context helper only returns user_id + role.
    const { data: attendeesRich } = await serviceClient
      .from('meeting_attendees')
      .select(
        'user_id, role, attendance_status, user_profile:profiles(id, first_name, last_name, email)',
      )
      .eq('meeting_id', id);

    const workspace = Array.isArray((meeting as any).workspace)
      ? (meeting as any).workspace[0]
      : (meeting as any).workspace;
    const community = Array.isArray(workspace?.community)
      ? workspace.community[0]
      : workspace?.community;

    const now = new Date().toISOString();

    // Atomic: guarded by WHERE finalized_at IS NULL to prevent double-finalize.
    // Bumping `version` also invalidates any in-flight autosave token so a
    // racing autosave cannot write over the finalized row.
    const { data: updated, error: updateError } = await serviceClient
      .from('community_meetings')
      .update({
        status: 'completada',
        finalized_at: now,
        finalized_by: user.id,
        finalize_audience: audience,
        version: (meeting.version ?? 0) + 1,
        updated_at: now,
        updated_by: user.id,
      })
      .eq('id', id)
      .is('finalized_at', null)
      .select('id, finalized_at')
      .maybeSingle();

    if (updateError) {
      console.error('Error finalizing meeting:', updateError);
      return sendApiError(res, 'Error al finalizar la reunión', 500, updateError.message);
    }
    if (!updated) {
      // Another caller won the race.
      return sendMeetingError(
        res,
        409,
        'meeting_already_finalized',
        'La reunión ya fue finalizada por otro usuario',
      );
    }

    // Close any open work sessions for this meeting.
    await serviceClient
      .from('meeting_work_sessions')
      .update({ ended_at: now })
      .eq('meeting_id', id)
      .is('ended_at', null);

    // Load related content for the email.
    const [{ data: agreements }, { data: commitments }, { data: workSessions }, { data: finalizerProfile }, { data: facilitatorProfile }] = await Promise.all([
      serviceClient
        .from('meeting_agreements')
        .select('agreement_text, agreement_doc, order_index')
        .eq('meeting_id', id)
        .order('order_index', { ascending: true }),
      serviceClient
        .from('meeting_commitments')
        .select('commitment_text, commitment_doc, due_date, assigned_to_profile:profiles!meeting_commitments_assigned_to_fkey(first_name, last_name, email)')
        .eq('meeting_id', id),
      serviceClient
        .from('meeting_work_sessions')
        .select('started_at')
        .eq('meeting_id', id),
      serviceClient
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .maybeSingle(),
      meeting.facilitator_id
        ? serviceClient
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', meeting.facilitator_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const recipients = await getCommunityRecipients(serviceClient, id, {
      onlyAttended: audience === 'attended',
    });

    // Build email template data.
    const meetingDates: Date[] = [];
    if (meeting.meeting_date) meetingDates.push(new Date(meeting.meeting_date));
    for (const ws of workSessions || []) {
      if (ws.started_at) meetingDates.push(new Date(ws.started_at));
    }

    const agreementsHtml = (agreements || [])
      .map((a: any) => {
        const rendered = docToHtml(a.agreement_doc);
        const text = rendered || (a.agreement_text ? `<p style="${EMAIL_PARAGRAPH_TIGHT_STYLE}">${escapeHtml(a.agreement_text)}</p>` : '');
        return `<li style="margin: 0 0 8px 0;">${text}</li>`;
      })
      .join('');

    const commitmentsHtml = (commitments || [])
      .map((c: any) => {
        const rendered = docToHtml(c.commitment_doc);
        const body = rendered || `<p style="${EMAIL_PARAGRAPH_COMPACT_STYLE}">${escapeHtml(c.commitment_text || '')}</p>`;
        const assigneeName = profileName(c.assigned_to_profile, '—');
        const dueDate = c.due_date ? new Date(c.due_date).toLocaleDateString('es-CL') : '—';
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top;">${body}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; font-family: Arial, sans-serif; font-size: 13px; color: #333333;">${escapeHtml(assigneeName)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; font-family: Arial, sans-serif; font-size: 13px; color: #333333;">${dueDate}</td>
          </tr>`;
      })
      .join('');

    const templateData = {
      title: meeting.title,
      communityName: community?.name ?? null,
      meetingDates,
      facilitatorName: profileName(facilitatorProfile as any, 'Facilitador'),
      finalizerName: profileName(finalizerProfile as any, 'Facilitador'),
      audience,
      attendees: (attendeesRich || []).map((a: any) => ({
        name: profileName(a.user_profile, 'Asistente'),
        attended: a.attendance_status === 'attended',
        role: a.role,
      })),
      // Legacy plain summary/notes fallback: most autosave-written meetings
      // have non-empty summary_doc/notes_doc and the fallback is unreachable,
      // but agreement/commitment rows can still be authored outside the
      // TipTap editor (seed scripts, external tools) so the fallback stays.
      summaryHtml: renderRichOrPlain(meeting.summary_doc, meeting.summary),
      notesHtml: renderRichOrPlain(meeting.notes_doc, meeting.notes),
      agreementsHtml,
      commitmentsHtml,
      facilitatorMessageHtml: facilitator_message_doc ? docToHtml(facilitator_message_doc) : undefined,
      // No workspace deep-link exists for a specific meeting id; omit CTA rather
      // than link to a generic page that cannot open this meeting.
      meetingUrl: '',
    };

    // The DB commit above is the point-of-no-return: `status='completada'`
    // + `finalized_at` + `finalize_audience` are durable. Email delivery is
    // a best-effort side effect — if Resend throws we must still return 200
    // so the client doesn't retry (retries hit `meeting_already_finalized`
    // and leave the user with a misleading error). The warning fields let
    // the client surface "Finalizada — correo pendiente" instead.
    let summaryEmailSent = true;
    let summaryEmailError: string | null = null;
    let sent = 0;
    let failed = 0;
    let errorsPreview: unknown[] = [];
    try {
      const result = await sendMeetingSummary(templateData, recipients);
      sent = result.sent;
      failed = result.failed;
      errorsPreview = result.errors;
    } catch (emailErr: any) {
      summaryEmailSent = false;
      summaryEmailError = emailErr?.message || 'email_dispatch_failed';
      console.error('[meetings-finalize] summary email dispatch failed:', {
        meeting_id: id,
        error: summaryEmailError,
      });
    }

    // Fire in-app notification event. Do not await in a way that blocks on failure.
    try {
      await notificationService.triggerNotification('meeting_finalized', {
        meeting_id: id,
        title: meeting.title,
        finalizer_name: templateData.finalizerName,
        audience,
        recipient_ids: recipients.map((r) => r.id),
      });
    } catch (err) {
      console.error('meeting_finalized notification trigger failed:', err);
    }

    const msElapsed = Date.now() - startedAt;
    console.log('[meetings-finalize]', {
      meeting_id: id,
      audience,
      recipient_count: recipients.length,
      sent,
      failed,
      summary_email_sent: summaryEmailSent,
      ms_elapsed: msElapsed,
      errors_preview: errorsPreview.slice(0, 3),
    });

    return sendApiResponse(res, {
      ok: true,
      recipients_count: recipients.length,
      sent,
      failed,
      summary_email_sent: summaryEmailSent,
      summary_email_error: summaryEmailError,
    });
  } catch (error: any) {
    console.error('Finalize error:', error);
    return sendApiError(res, 'Error inesperado al finalizar la reunión', 500, error.message);
  }
}
