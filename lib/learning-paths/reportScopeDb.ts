/**
 * Learning-path REPORT scope for routes that must read learning-path rows with
 * the service role (W-B2c-01, Brent 2026-10-02: admin all; active consultor all
 * schools; active equipo_directivo only people with an active role in their
 * school). The decision is never re-implemented here: it is asked of the
 * database helpers (migration 20261002120000) on the CALLER's own client, so
 * auth.uid() is the caller and the forced-password-change gate applies. The
 * route then filters its service-role learning-path rows by the answer.
 * Errors fail closed (no learning-path data).
 */

type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** TRUE only when the database says the caller may see every person's learning-path data. */
export async function lpReportAll(callerClient: RpcClient): Promise<boolean> {
  try {
    const { data, error } = await callerClient.rpc('auth_lp_report_all');
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * The subset of `userIds` whose learning-path data the caller may see:
 * everyone when auth_lp_report_all(), otherwise each person the database's
 * auth_lp_report_sees_user() admits. Empty on any error.
 */
export async function lpReportVisibleUsers(callerClient: RpcClient, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  if (await lpReportAll(callerClient)) return new Set(ids);
  try {
    const answers = await Promise.all(
      ids.map(async (id) => {
        const { data, error } = await callerClient.rpc('auth_lp_report_sees_user', { p_user: id });
        return !error && data === true ? id : null;
      })
    );
    return new Set(answers.filter((id): id is string => id !== null));
  } catch {
    return new Set();
  }
}
