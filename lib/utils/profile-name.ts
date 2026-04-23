/**
 * Profile display-name formatter.
 *
 * Four meeting-pipeline sites (finalize route × 3, notificationService × 1)
 * had near-identical `${first_name ?? ''} ${last_name ?? ''}.trim() || email
 * || <fallback>` expressions. Extracted here so behavior stays consistent
 * when someone adds `preferred_name` or swaps the fallback order.
 */

export interface ProfileNameInput {
  first_name?: string | null;
  last_name?: string | null;
  /** Pre-composed name field present on some auth-layer rows (e.g. Supabase
   *  `auth.users.raw_user_meta_data.name`). Used as a secondary source when
   *  `first_name`/`last_name` are both blank. */
  name?: string | null;
  email?: string | null;
}

/**
 * Format a profile row into a human-readable display name.
 *
 * Preference order: "{first} {last}" → `name` → email → fallback.
 *
 * @param profile - profile row (may be null/undefined)
 * @param fallback - string to return when no name or email is available.
 *                   Defaults to 'Sin nombre' (generic). Pass something more
 *                   specific like 'Facilitador' or 'Asistente' at call sites.
 */
export function profileName(
  profile: ProfileNameInput | null | undefined,
  fallback: string = 'Sin nombre',
): string {
  if (!profile) return fallback;
  const full = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  if (full) return full;
  if (profile.name) return profile.name;
  if (profile.email) return profile.email;
  return fallback;
}
