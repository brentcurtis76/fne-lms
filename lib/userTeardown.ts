import type { SupabaseClient } from '@supabase/supabase-js';

export interface TeardownResult {
  profileDeleted: boolean;
  profileRowsDeleted: number;
  authUserDeleted: boolean;
  rolesDeleted: number;
}

/**
 * Fully tears down a platform user account.
 *
 * Mirrors the cascade in pages/api/admin/delete-user.ts:
 *   platform_feedback -> user_roles -> profiles -> auth.users
 *
 * profiles.id has no ON DELETE CASCADE to auth.users in this schema (verified
 * against the live DB), so every step is explicit. Feedback/role deletes are
 * best-effort (logged, non-fatal); a profile-delete failure throws so callers
 * can surface a 500. The auth delete runs after the profile is gone and is
 * best-effort too (a leftover auth row without a profile is the lesser evil).
 *
 * Pass a SERVICE-ROLE client — these operations bypass RLS by design and the
 * caller is responsible for the admin/authorization check.
 */
export async function teardownPlatformUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TeardownResult> {
  // 1. Feedback authored by the user (best effort)
  const { error: feedbackError } = await supabase
    .from('platform_feedback')
    .delete()
    .eq('created_by', userId);
  if (feedbackError) {
    console.error('[teardownPlatformUser] feedback delete failed:', feedbackError);
  }

  // 2. Role assignments (best effort, but capture how many were removed)
  const { data: deletedRoles, error: rolesError } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .select('id');
  if (rolesError) {
    console.error('[teardownPlatformUser] role delete failed:', rolesError);
  }

  // 3. Profile (fatal on error — matches delete-user.ts behavior). The trailing
  // .select() mirrors the original call shape that callers/tests rely on.
  const { data: deletedProfiles, error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
    .select();
  if (profileError) {
    throw new Error(`Failed to delete user profile: ${profileError.message}`);
  }

  // 4. Auth user (best effort — the profile is already gone)
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error('[teardownPlatformUser] auth user delete failed:', authError);
  }

  return {
    profileDeleted: true,
    profileRowsDeleted: deletedProfiles?.length ?? 0,
    authUserDeleted: !authError,
    rolesDeleted: deletedRoles?.length ?? 0,
  };
}
