/**
 * SM-H8: the meeting API routes run on the service role, so RLS does not
 * protect them. This asks the database the same question the meeting tables
 * ask (can_edit_meeting_verified): creator, facilitator, secretary, a
 * co_editor with grant provenance, the community leader, admin or consultor.
 * Fails closed on any error.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function isVerifiedMeetingEditor(
  serviceClient: Pick<SupabaseClient, 'rpc'>,
  userId: string,
  meetingId: string,
): Promise<boolean> {
  try {
    const { data, error } = await serviceClient.rpc('can_edit_meeting_verified', {
      check_user_id: userId,
      check_meeting_id: meetingId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
