/**
 * The mechanics of a permanent meeting deletion, and the authorization it needs.
 *
 * F4 — WHAT WAS BROKEN. `utils/meetingDeletion.ts` ran the whole deletion in the
 * BROWSER on the user-scoped Supabase client, and then called
 * `recordSecurityAudit` with that same client. `security_audit_events` grants
 * `authenticated` SELECT and nothing else, so the insert could only ever fail
 * with 42501 — every single time, for every deletion. `recordSecurityAudit`
 * never throws, so the failure went to the console as `[security-audit] write
 * failed` and the deletion reported success. The `meeting_deleted` action
 * existed, was typed, was constrained, and had never once been written.
 *
 * The obvious repair — "give the browser a way to write the audit row" — is the
 * wrong one. An audit row a browser can write is an audit row a browser can
 * FORGE: a hostile client could record deletions that never happened, or omit
 * ones that did, and the trail would be worth nothing.
 *
 * SO THE OPERATION MOVED, not the privilege. `pages/api/meetings/delete.ts` is
 * now the authoritative boundary. It re-establishes the caller with
 * `auth.getUser()`, re-checks authorization SERVER-SIDE, performs the deletion,
 * and only then — knowing the real outcome — writes the audit row with a
 * service-role client. The browser learns what happened; it never writes it.
 *
 * AUTHORIZATION IS UNCHANGED, deliberately. The deletion still runs on a
 * USER-SCOPED client, so every RLS policy that governed it before governs it
 * now, and the explicit `canDeleteMeeting` predicate is the same one the modal
 * used. The point of this change is where the audit row comes from, not who may
 * delete — quietly widening or narrowing deletion rights while fixing an audit
 * bug is how a repair becomes an incident.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MeetingDeletionOutcome {
  success: boolean;
  deletedFiles: number;
  errors: string[];
  /** Set when the meeting could not be found or the caller may not touch it. */
  code?: 'NOT_FOUND' | 'FORBIDDEN' | 'DELETE_FAILED';
}

/**
 * May this user permanently delete this meeting?
 *
 * The same predicate the browser modal used, moved here so the SERVER decides.
 * Creator, global admin, or the community leader of the meeting's workspace.
 */
export async function canDeleteMeeting(
  client: SupabaseClient,
  userId: string,
  meetingId: string
): Promise<boolean> {
  try {
    const { data: meeting, error } = await client
      .from('community_meetings')
      .select('created_by, workspace_id')
      .eq('id', meetingId)
      .single();

    if (error || !meeting) {
      return false;
    }

    if (meeting.created_by === userId) {
      return true;
    }

    const { data: roles } = await client
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roles?.some((role: { role_type: string }) => role.role_type === 'admin')) {
      return true;
    }

    const { data: workspace } = await client
      .from('community_workspaces')
      .select('community_id')
      .eq('id', meeting.workspace_id)
      .single();

    if (workspace) {
      const { data: leaderRole } = await client
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('community_id', workspace.community_id)
        .eq('role_type', 'lider_comunidad')
        .eq('is_active', true)
        .single();

      if (leaderRole) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[meeting-deletion] permission check failed:', error);
    return false;
  }
}

/**
 * Delete a meeting and everything hanging off it.
 *
 * `client` must be USER-SCOPED: RLS is still the enforcement layer, exactly as
 * it was when this ran in the browser. Ordering respects the foreign keys.
 *
 * Writes no audit row — the caller does that, because only the caller knows the
 * final outcome and only the caller holds a client that may write it.
 */
export async function performMeetingDeletion(
  client: SupabaseClient,
  meetingId: string
): Promise<MeetingDeletionOutcome> {
  const errors: string[] = [];
  let deletedFiles = 0;

  const { data: meeting, error: meetingError } = await client
    .from('community_meetings')
    .select('id')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return { success: false, deletedFiles: 0, errors: ['Reunión no encontrada'], code: 'NOT_FOUND' };
  }

  const { data: attachments } = await client
    .from('meeting_attachments')
    .select('*')
    .eq('meeting_id', meetingId);

  // Storage first, database records second: an orphaned row is recoverable, an
  // orphaned file is not findable.
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      try {
        const { error: storageError } = await client.storage
          .from('meeting-documents')
          .remove([attachment.file_path]);

        if (storageError) {
          errors.push(`Error al eliminar archivo ${attachment.filename}: ${storageError.message}`);
        } else {
          deletedFiles += 1;
        }
      } catch {
        errors.push(`Error al procesar archivo ${attachment.filename}`);
      }
    }
  }

  const childTables: Array<{ table: string; label: string }> = [
    { table: 'meeting_attachments', label: 'archivos adjuntos' },
    { table: 'meeting_tasks', label: 'tareas' },
    { table: 'meeting_commitments', label: 'compromisos' },
    { table: 'meeting_agreements', label: 'acuerdos' },
    { table: 'meeting_attendees', label: 'lista de participantes' },
  ];

  for (const { table, label } of childTables) {
    const { error } = await client.from(table).delete().eq('meeting_id', meetingId);
    if (error) {
      console.error(`[meeting-deletion] could not delete ${table}:`, error.message);
      errors.push(`Error al eliminar ${label}: ${error.message}`);
    }
  }

  // `count: 'exact'` so a delete that RLS refuses is distinguishable from one
  // that removed the row — the difference between "forbidden" and "done", which
  // PostgREST otherwise reports identically as a 204.
  const { error: deleteMeetingError, count: meetingCount } = await client
    .from('community_meetings')
    .delete({ count: 'exact' })
    .eq('id', meetingId);

  if (deleteMeetingError) {
    console.error('[meeting-deletion] could not delete the meeting:', deleteMeetingError.message);
    return {
      success: false,
      deletedFiles,
      errors: [...errors, `Error al eliminar la reunión: ${deleteMeetingError.message}`],
      code: 'DELETE_FAILED',
    };
  }

  // Zero rows means RLS refused it. The old code raised this as "no tienes
  // permisos suficientes", which is right, and it is kept.
  if (meetingCount === 0) {
    return {
      success: false,
      deletedFiles,
      errors: [
        ...errors,
        'No se pudo eliminar la reunión. Es posible que no tengas permisos suficientes.',
      ],
      code: 'FORBIDDEN',
    };
  }

  return { success: true, deletedFiles, errors };
}
