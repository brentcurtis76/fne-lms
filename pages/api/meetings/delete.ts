import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createServiceRoleClient } from '../../../lib/api-auth';
import {
  canDeleteMeeting,
  performMeetingDeletion,
} from '../../../lib/meetings/deletion';
import { recordSecurityAudit } from '../../../lib/security/audit';

/**
 * Permanently delete a community meeting — the authoritative boundary (F4).
 *
 * This used to run entirely in the browser, audit row included. The audit row
 * could therefore never be written (`authenticated` holds SELECT only on
 * `security_audit_events`), so every deletion since the trail was introduced was
 * unrecorded while the UI said it had gone fine.
 *
 * The shape here is the point:
 *
 *   AUTHENTICATE with `auth.getUser()` — a round trip to the auth server, not a
 *   cookie decode, and not a `userId` from the body (which the previous browser
 *   function took as an argument and passed straight into the audit metadata:
 *   the actor was whatever the caller said it was).
 *
 *   AUTHORIZE server-side with the same predicate the modal used, so a caller
 *   who skips the modal is checked identically.
 *
 *   DELETE on the USER-SCOPED client, so every RLS policy that governed this
 *   before still governs it. Nothing about who may delete changes here.
 *
 *   AUDIT with a SERVICE-ROLE client, AFTER the outcome is known. The browser
 *   never writes to the trail — an audit row a browser can write is an audit row
 *   a browser can forge.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const meetingId = typeof req.body?.meetingId === 'string' ? req.body.meetingId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId)) {
    return res.status(400).json({ error: 'meetingId inválido' });
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : null;

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const admin = createServiceRoleClient();

    const permitted = await canDeleteMeeting(supabase, user.id, meetingId);

    if (!permitted) {
      // A refused attempt IS a security event, and it is the one the old code
      // could not record at all.
      await recordSecurityAudit(admin, {
        action: 'meeting_deleted',
        outcome: 'denied',
        actorUserId: user.id,
        metadata: { meeting_id: meetingId, reason },
      });

      return res.status(403).json({
        error: 'No tienes permisos para eliminar esta reunión.',
        code: 'FORBIDDEN',
      });
    }

    const outcome = await performMeetingDeletion(supabase, meetingId);

    // The audit row records what ACTUALLY happened, established by this handler
    // rather than reported by the caller. The meeting title is deliberately
    // absent — it is session content, not a security fact, and the id already
    // identifies the record.
    const audit = await recordSecurityAudit(admin, {
      action: 'meeting_deleted',
      outcome: outcome.success
        ? outcome.errors.length > 0
          ? 'partial_failure'
          : 'success'
        : 'failure',
      actorUserId: user.id,
      metadata: {
        meeting_id: meetingId,
        reason,
        deleted_file_count: outcome.deletedFiles,
        error_count: outcome.errors.length,
        failure_code: outcome.code ?? null,
      },
    });

    if (!outcome.success) {
      return res.status(outcome.code === 'NOT_FOUND' ? 404 : outcome.code === 'FORBIDDEN' ? 403 : 500).json({
        success: false,
        deletedFiles: outcome.deletedFiles,
        errors: outcome.errors,
        code: outcome.code,
        audited: audit.recorded,
      });
    }

    return res.status(200).json({
      success: true,
      deletedFiles: outcome.deletedFiles,
      errors: outcome.errors,
      audited: audit.recorded,
    });
  } catch (error: any) {
    console.error('[meetings/delete] unexpected error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
