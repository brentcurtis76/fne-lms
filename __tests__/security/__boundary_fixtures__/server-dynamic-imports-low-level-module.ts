// SYNTHETIC NEGATIVE FIXTURE — dynamic imports bypass the fixed import surface.
export async function load() {
  return import('../../../lib/auth/admin-user-maintenance');
}
