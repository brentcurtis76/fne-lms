/**
 * Assessment Builder permission helpers.
 *
 * Read access: admin, consultor
 * Write access: admin only
 */

export async function hasAssessmentReadPermission(
  supabaseClient: any,
  userId: string
): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;
  return roles.some((r: any) => ['admin', 'consultor'].includes(r.role_type));
}

export async function hasAssessmentWritePermission(
  supabaseClient: any,
  userId: string
): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;
  return roles.some((r: any) => r.role_type === 'admin');
}
