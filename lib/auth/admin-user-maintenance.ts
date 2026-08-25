/**
 * Narrow wrappers around Supabase's password-capable `updateUserById` primitive
 * for NON-password maintenance. The payloads are constructed here from explicit
 * scalar arguments; callers cannot supply or spread arbitrary auth attributes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function updateAuthUserEmail(
  admin: SupabaseClient,
  userId: string,
  email: string
) {
  return admin.auth.admin.updateUserById(userId, { email });
}

export async function clearAdministrativeResetMarker(
  admin: SupabaseClient,
  userId: string
) {
  return admin.auth.admin.updateUserById(userId, {
    user_metadata: { password_reset_by_admin: null, password_reset_at: null },
  });
}
