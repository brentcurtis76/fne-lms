/**
 * F12e V5b: the schools the CALLER is currently assigned to as a consultor.
 *
 * Asks the database helper public.auth_consultor_assigned_school_ids()
 * (migration 20261118101000_consultor_workspace_entry.sql) through the client
 * it is given. That client must carry the caller's session: the function
 * answers only about auth.uid(), so a service-role client gets nothing.
 *
 * "Currently assigned" (Brent, 17 Nov 2026: "The assignment, everywhere"): an
 * active consultor role and a consultant_assignments row with that school_id,
 * is_active, started and not ended. Rows naming no school do not count.
 *
 * Returns [] on any error (fail closed). The log carries only the error code,
 * never ids or messages.
 */

export const ASSIGNED_SCHOOL_IDS_RPC = 'auth_consultor_assigned_school_ids';

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function fetchAssignedSchoolIds(client: RpcClient): Promise<number[]> {
  try {
    const { data, error } = await client.rpc(ASSIGNED_SCHOOL_IDS_RPC);
    if (error) {
      const code = (error as { code?: unknown }).code;
      console.error('[consultor-assigned-schools] lookup failed', typeof code === 'string' ? { code } : {});
      return [];
    }
    if (!Array.isArray(data)) return [];
    const ids = data
      .map((row) => (typeof row === 'object' && row !== null
        ? (row as Record<string, unknown>)[ASSIGNED_SCHOOL_IDS_RPC]
        : row))
      .map((value) => (typeof value === 'string' ? Number(value) : value))
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value));
    return Array.from(new Set(ids));
  } catch {
    console.error('[consultor-assigned-schools] lookup failed');
    return [];
  }
}
