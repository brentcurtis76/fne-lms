/**
 * Meeting Deletion Service
 * Handles safe deletion of meetings with all related data and files
 * Includes transaction support, error recovery, and audit logging
 */

import { supabase } from '../lib/supabase-wrapper';

interface DeletionResult {
  success: boolean;
  deletedFiles: number;
  errors: string[];
}

interface DeleteMeetingOptions {
  skipConfirmation?: boolean;
  userId: string;
  reason?: string;
}

/**
 * Delete a meeting and all its related data
 * This includes: agreements, commitments, tasks, attendees, attachments, and storage files
 */
/**
 * Delete a meeting and all its related data.
 *
 * F4 — this used to do the work here, in the browser, and then call
 * `recordSecurityAudit` with the browser's own user-scoped client.
 * `security_audit_events` grants `authenticated` SELECT and nothing else, so
 * that insert failed with 42501 on every deletion the platform has ever
 * performed. `recordSecurityAudit` does not throw, so the failure was a console
 * line and the deletion reported success — the `meeting_deleted` action was
 * typed, constrained, indexed and never once written.
 *
 * The operation moved to `POST /api/meetings/delete`, which re-establishes the
 * caller with `auth.getUser()`, re-checks authorization server-side, deletes on
 * a user-scoped client so RLS still governs it, and writes the audit row with a
 * service-role client once it knows the real outcome. Giving the browser the
 * privilege instead would have made the trail forgeable, which is worse than not
 * having one.
 *
 * `userId` is still accepted so callers do not change, but it is no longer
 * TRUSTED: the endpoint takes the actor from the auth server and ignores
 * anything the body claims.
 */
export async function deleteMeeting(
  meetingId: string,
  options: DeleteMeetingOptions
): Promise<DeletionResult> {
  try {
    const response = await fetch('/api/meetings/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ meetingId, reason: options.reason ?? null }),
    });

    const result = await response.json().catch(() => ({} as Record<string, unknown>));

    if (!response.ok) {
      const errors = Array.isArray((result as { errors?: unknown }).errors)
        ? ((result as { errors: string[] }).errors)
        : [
            (result as { error?: string }).error ||
              'Error al eliminar la reunión. Inténtalo nuevamente.',
          ];
      return {
        success: false,
        deletedFiles: Number((result as { deletedFiles?: number }).deletedFiles) || 0,
        errors,
      };
    }

    return {
      success: true,
      deletedFiles: Number((result as { deletedFiles?: number }).deletedFiles) || 0,
      errors: Array.isArray((result as { errors?: unknown }).errors)
        ? ((result as { errors: string[] }).errors)
        : [],
    };
  } catch (error) {
    console.error('Error in deleteMeeting:', error);
    return {
      success: false,
      deletedFiles: 0,
      errors: [error instanceof Error ? error.message : 'Error desconocido'],
    };
  }
}

/**
 * Soft delete a meeting (mark as inactive instead of deleting)
 * This is a safer option that allows for recovery
 */
export async function softDeleteMeeting(
  meetingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error, count } = await supabase
      .from('community_meetings')
      .update({ 
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: userId
      })
      .eq('id', meetingId)
      .select(undefined, { count: 'exact', head: true });

    if (error) {
      console.error('Error soft deleting meeting:', error);
      throw error;
    }

    // Check if any row was actually updated
    if (count === 0) {
      throw new Error('No se pudo archivar la reunión. Es posible que no tengas permisos suficientes o que la reunión no exista.');
    }

    // No audit row. Archiving is a reversible content-lifecycle action, not a
    // security operation, and the row itself already records who and when in
    // `community_meetings.deleted_by` / `deleted_at` — which is more than the
    // old insert into the non-existent `audit_logs` ever managed.

    return { success: true };
  } catch (error) {
    console.error('Error in softDeleteMeeting:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Error al archivar la reunión' 
    };
  }
}

/**
 * Restore a soft-deleted meeting
 */
export async function restoreMeeting(
  meetingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('community_meetings')
      .update({ 
        is_active: true,
        deleted_at: null,
        deleted_by: null
      })
      .eq('id', meetingId);

    if (error) {
      throw error;
    }

    // No audit row, for the same reason as `softDeleteMeeting` above: a
    // reversible content action is not a security event. See that comment.

    return { success: true };
  } catch (error) {
    console.error('Error in restoreMeeting:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Error al restaurar la reunión' 
    };
  }
}

/**
 * Check if user has permission to delete a meeting
 */
export async function canDeleteMeeting(
  userId: string,
  meetingId: string
): Promise<boolean> {
  try {
    // Get meeting details
    const { data: meeting, error } = await supabase
      .from('community_meetings')
      .select('created_by, workspace_id')
      .eq('id', meetingId)
      .single();

    if (error || !meeting) {
      return false;
    }

    // Check if user is the creator
    if (meeting.created_by === userId) {
      return true;
    }

    // Check if user has admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roles?.some(role => role.role_type === 'admin')) {
      return true;
    }

    // Check if user is a community leader for this workspace
    const { data: workspace } = await supabase
      .from('community_workspaces')
      .select('community_id')
      .eq('id', meeting.workspace_id)
      .single();

    if (workspace) {
      const { data: leaderRole } = await supabase
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
    console.error('Error checking delete permission:', error);
    return false;
  }
}