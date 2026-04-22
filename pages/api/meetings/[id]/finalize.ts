import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { Validators } from '../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import { canFinalizeMeeting } from '../../../../lib/utils/meeting-policy';
import { getCommunityRecipients } from '../../../../lib/notificationService';
import notificationService from '../../../../lib/notificationService';
import { sendMeetingSummary } from '../../../../lib/emailService';
import { docToHtml } from '../../../../lib/tiptap/render';

const finalizeSchema = z.object({
  audience: z.enum(['community', 'attended']),
  facilitator_message_doc: z.record(z.unknown()).optional(),
});

const profileName = (p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string => {
  if (!p) return 'Facilitador';
  const joined = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return joined || p.email || 'Facilitador';
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

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de reunión inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return sendAuthError(res, firstIssue?.message || 'Payload de finalización inválido', 400);
  }
  const { audience, facilitator_message_doc } = parsed.data;

  const startedAt = Date.now();

  try {
    const serviceClient = createServiceRoleClient();

    const { data: meeting, error: meetingError } = await serviceClient
      .from('community_meetings')
      .select(
        'id, title, status, created_by, facilitator_id, secretary_id, meeting_date, summary_doc, notes_doc, finalized_at, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id, community:communities(id, name))'
      )
      .eq('id', id)
      .single();

    if (meetingError || !meeting) {
      return sendAuthError(res, 'Reunión no encontrada', 404);
    }

    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);
    if (!highestRole) {
      return sendAuthError(res, 'Usuario sin roles asignados', 403);
    }

    const { data: attendees } = await serviceClient
      .from('meeting_attendees')
      .select('user_id, role, attendance_status, user_profile:profiles(id, first_name, last_name, email)')
      .eq('meeting_id', id);

    const workspace = Array.isArray((meeting as any).workspace)
      ? (meeting as any).workspace[0]
      : (meeting as any).workspace;
    const community = Array.isArray(workspace?.community)
      ? workspace.community[0]
      : workspace?.community;

    if (
      !canFinalizeMeeting(
        { id: user.id, highestRole, userRoles },
        {
          id: meeting.id,
          status: meeting.status,
          created_by: meeting.created_by,
          facilitator_id: meeting.facilitator_id,
          secretary_id: meeting.secretary_id,
          community_id: workspace?.community_id ?? null,
        },
        (attendees || []).map((a: any) => ({ user_id: a.user_id, role: a.role }))
      )
    ) {
      return sendAuthError(res, 'No tiene permisos para finalizar esta reunión', 403);
    }

    if (meeting.status !== 'borrador') {
      return res.status(409).json({ error: 'meeting_not_draft' });
    }

    const now = new Date().toISOString();

    // Atomic: guarded by WHERE finalized_at IS NULL to prevent double-finalize.
    const { data: updated, error: updateError } = await serviceClient
      .from('community_meetings')
      .update({
        status: 'completada',
        finalized_at: now,
        finalized_by: user.id,
        finalize_audience: audience,
        updated_at: now,
        updated_by: user.id,
      })
      .eq('id', id)
      .is('finalized_at', null)
      .select('id, finalized_at')
      .maybeSingle();

    if (updateError) {
      console.error('Error finalizing meeting:', updateError);
      return sendAuthError(res, 'Error al finalizar la reunión', 500, updateError.message);
    }
    if (!updated) {
      // Another caller won the race.
      return res.status(409).json({ error: 'meeting_already_finalized' });
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
      .map((a: any, idx: number) => {
        const rendered = docToHtml(a.agreement_doc);
        const text = rendered || (a.agreement_text ? `<p style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 8px 0;">${a.agreement_text}</p>` : '');
        return `<li style="margin: 0 0 8px 0;">${text}</li>`;
      })
      .join('');

    const commitmentsHtml = (commitments || [])
      .map((c: any) => {
        const rendered = docToHtml(c.commitment_doc);
        const body = rendered || `<p style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #333333; margin: 0;">${c.commitment_text || ''}</p>`;
        const assigneeName = c.assigned_to_profile
          ? `${c.assigned_to_profile.first_name ?? ''} ${c.assigned_to_profile.last_name ?? ''}`.trim() || c.assigned_to_profile.email || '—'
          : '—';
        const dueDate = c.due_date ? new Date(c.due_date).toLocaleDateString('es-CL') : '—';
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top;">${body}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; font-family: Arial, sans-serif; font-size: 13px; color: #333333;">${assigneeName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; vertical-align: top; font-family: Arial, sans-serif; font-size: 13px; color: #333333;">${dueDate}</td>
          </tr>`;
      })
      .join('');

    const templateData = {
      title: meeting.title,
      communityName: community?.name ?? null,
      meetingDates,
      facilitatorName: profileName(facilitatorProfile as any),
      finalizerName: profileName(finalizerProfile as any),
      audience,
      attendees: (attendees || []).map((a: any) => ({
        name: a.user_profile
          ? `${a.user_profile.first_name ?? ''} ${a.user_profile.last_name ?? ''}`.trim() || a.user_profile.email || 'Asistente'
          : 'Asistente',
        attended: a.attendance_status === 'attended',
        role: a.role,
      })),
      summaryHtml: docToHtml(meeting.summary_doc),
      notesHtml: docToHtml(meeting.notes_doc),
      agreementsHtml,
      commitmentsHtml,
      facilitatorMessageHtml: facilitator_message_doc ? docToHtml(facilitator_message_doc) : undefined,
      meetingUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/comunidades-crecimiento`,
    };

    const { sent, failed, errors } = await sendMeetingSummary(templateData, recipients);

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
      ms_elapsed: msElapsed,
      errors_preview: errors.slice(0, 3),
    });

    return sendApiResponse(res, {
      ok: true,
      recipients_count: recipients.length,
      sent,
      failed,
    });
  } catch (error: any) {
    console.error('Finalize error:', error);
    return sendAuthError(res, 'Error inesperado al finalizar la reunión', 500, error.message);
  }
}
