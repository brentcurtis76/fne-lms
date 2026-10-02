/**
 * Learning-path REPORT scope for routes that must read learning-path rows with
 * the service role (W-B2c-01, Brent 2026-10-02: admin all; active consultor all
 * schools; active equipo_directivo only people with an active role in their
 * school). The decision is never re-implemented here: it is asked of the
 * database helpers (migration 20261002120000) on the CALLER's own client, so
 * auth.uid() is the caller and the forced-password-change gate applies. The
 * route then filters its service-role learning-path rows by the answer.
 * Errors fail closed: a failed all-scope check returns no one, and a failed
 * per-person check leaves that person out.
 */

type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

const PER_PERSON_BATCH = 25;

type AllScope = 'all' | 'not_all' | 'error';

async function lpReportAllScope(callerClient: RpcClient): Promise<AllScope> {
  try {
    const { data, error } = await callerClient.rpc('auth_lp_report_all');
    if (error) return 'error';
    return data === true ? 'all' : 'not_all';
  } catch {
    return 'error';
  }
}

/** TRUE only when the database says the caller may see every person's learning-path data. */
export async function lpReportAll(callerClient: RpcClient): Promise<boolean> {
  return (await lpReportAllScope(callerClient)) === 'all';
}

/**
 * The subset of `userIds` whose learning-path data the caller may see:
 * everyone when auth_lp_report_all(), otherwise each person the database's
 * auth_lp_report_sees_user() admits. Empty when the all-scope check fails (no
 * per-person fan-out after an error); a per-person error leaves that person
 * out. Per-person checks run in batches of 25.
 */
export async function lpReportVisibleUsers(callerClient: RpcClient, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const scope = await lpReportAllScope(callerClient);
  if (scope === 'all') return new Set(ids);
  if (scope === 'error') return new Set();
  const visible = new Set<string>();
  for (let i = 0; i < ids.length; i += PER_PERSON_BATCH) {
    const answers = await Promise.all(
      ids.slice(i, i + PER_PERSON_BATCH).map(async (id) => {
        try {
          const { data, error } = await callerClient.rpc('auth_lp_report_sees_user', { p_user: id });
          return !error && data === true ? id : null;
        } catch {
          return null;
        }
      })
    );
    for (const id of answers) if (id) visible.add(id);
  }
  return visible;
}
