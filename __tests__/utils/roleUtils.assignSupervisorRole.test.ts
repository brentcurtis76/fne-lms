// @vitest-environment node
/**
 * B2a — direct tests for utils/roleUtils.ts::assignSupervisorRole, the helper
 * POST /api/admin/networks/supervisors delegates the actual grant to.
 *
 * The pre-repair helper discarded every lookup error:
 *   - a FAILED network lookup was indistinguishable from a missing network;
 *   - a FAILED duplicate-lookup fell through to the INSERT (fail open);
 *   - it never enforced one-active-network-per-supervisor at all — that lived
 *     only in the route, whose own broken query never fired either.
 *
 * These tests drive the REAL helper over a recording client, so they pin:
 * which failure class each outcome reports (`failure` — what lets the API
 * distinguish 404 from 500), that no failed or conflicting path reaches the
 * INSERT, and the exact insert payload (only columns `user_roles` has —
 * baseline.sql:11380 — with the requested red_id, active).
 *
 * All fixture data is synthetic (Ley 21.719 — no student or staff PII).
 */
import { describe, it, expect, vi } from 'vitest';

import { assignSupervisorRole } from '../../utils/roleUtils';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const NETWORK_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_NETWORK_ID = '55555555-5555-4555-8555-555555555555';

const ADMIN_ROLE_ROW = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const DB_DOWN = { code: 'PGRST301', message: 'connection to the database failed' };

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  inserts: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

function buildRecordingClient(resultsByTable: Record<string, TableResult[]>) {
  const indices: Record<string, number> = {};
  const fromCalls: FromCall[] = [];

  const client = {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = { table, index: idx, inserts: [], eqs: [] };
      fromCalls.push(fromCall);

      const resolved = { data: result.data ?? null, error: result.error ?? null };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'insert') {
            return vi.fn((payload: unknown) => {
              fromCall.inserts.push(payload);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };

  return { client: client as never, fromCalls };
}

function insertsIssued(fromCalls: FromCall[]) {
  return fromCalls
    .filter((c) => c.table === 'user_roles')
    .reduce((sum, c) => sum + c.inserts.length, 0);
}

/**
 * The helper's query order per table:
 *   user_roles #0 — isGlobalAdmin(assignedBy)
 *   redes_de_colegios #0 — network existence
 *   user_roles #1 — the target's ACTIVE supervisor roles
 *   user_roles #2 — the INSERT
 */
function adminOk(rest: {
  network?: TableResult;
  activeRoles?: TableResult;
  insert?: TableResult;
}) {
  return {
    user_roles: [
      { data: [ADMIN_ROLE_ROW], error: null },
      rest.activeRoles ?? { data: [], error: null },
      rest.insert ?? { data: null, error: null },
    ],
    redes_de_colegios: [rest.network ?? { data: { id: NETWORK_ID }, error: null }],
  };
}

describe('roleUtils.assignSupervisorRole', () => {
  it('inserts exactly one ACTIVE supervisor_de_red row carrying the requested red_id', async () => {
    const { client, fromCalls } = buildRecordingClient(adminOk({}));

    const result = await assignSupervisorRole(client, TARGET_ID, NETWORK_ID, ADMIN_ID);

    expect(result).toEqual({ success: true });
    expect(insertsIssued(fromCalls)).toBe(1);

    const payload = fromCalls
      .filter((c) => c.table === 'user_roles')
      .flatMap((c) => c.inserts)[0] as Record<string, unknown>;

    expect(payload.user_id).toBe(TARGET_ID);
    expect(payload.role_type).toBe('supervisor_de_red');
    expect(payload.red_id).toBe(NETWORK_ID);
    expect(payload.is_active).toBe(true);
    expect(payload.assigned_by).toBe(ADMIN_ID);
    expect(typeof payload.assigned_at).toBe('string');
    // Only columns user_roles actually has — no updated_at, nothing else.
    expect(Object.keys(payload).sort()).toEqual([
      'assigned_at',
      'assigned_by',
      'is_active',
      'red_id',
      'role_type',
      'user_id',
    ]);
  });

  it('refuses a non-admin assigner without touching anything else', async () => {
    const { client, fromCalls } = buildRecordingClient({
      user_roles: [{ data: [], error: null }],
    });

    const result = await assignSupervisorRole(client, TARGET_ID, NETWORK_ID, ADMIN_ID);

    expect(result.success).toBe(false);
    expect(result.failure).toBe('not_admin');
    expect(insertsIssued(fromCalls)).toBe(0);
    expect(fromCalls.filter((c) => c.table === 'redes_de_colegios')).toHaveLength(0);
  });

  it('distinguishes a FAILED network lookup from a missing network', async () => {
    const failed = buildRecordingClient(adminOk({ network: { data: null, error: DB_DOWN } }));
    const failedResult = await assignSupervisorRole(failed.client, TARGET_ID, NETWORK_ID, ADMIN_ID);
    expect(failedResult.success).toBe(false);
    expect(failedResult.failure).toBe('network_lookup_failed');
    expect(insertsIssued(failed.fromCalls)).toBe(0);

    const missing = buildRecordingClient(adminOk({ network: { data: null, error: null } }));
    const missingResult = await assignSupervisorRole(missing.client, TARGET_ID, NETWORK_ID, ADMIN_ID);
    expect(missingResult.success).toBe(false);
    expect(missingResult.failure).toBe('network_not_found');
    expect(insertsIssued(missing.fromCalls)).toBe(0);
  });

  it('does NOT insert when the existing-roles lookup fails — fail closed', async () => {
    const { client, fromCalls } = buildRecordingClient(
      adminOk({ activeRoles: { data: null, error: DB_DOWN } }),
    );

    const result = await assignSupervisorRole(client, TARGET_ID, NETWORK_ID, ADMIN_ID);

    expect(result.success).toBe(false);
    expect(result.failure).toBe('role_lookup_failed');
    expect(insertsIssued(fromCalls)).toBe(0);
  });

  it('rejects a duplicate assignment to the same network', async () => {
    const { client, fromCalls } = buildRecordingClient(
      adminOk({ activeRoles: { data: [{ id: 'r1', red_id: NETWORK_ID }], error: null } }),
    );

    const result = await assignSupervisorRole(client, TARGET_ID, NETWORK_ID, ADMIN_ID);

    expect(result.success).toBe(false);
    expect(result.failure).toBe('duplicate');
    expect(insertsIssued(fromCalls)).toBe(0);
  });

  it('enforces one-active-network-per-supervisor: an active role elsewhere blocks the grant', async () => {
    const { client, fromCalls } = buildRecordingClient(
      adminOk({ activeRoles: { data: [{ id: 'r1', red_id: OTHER_NETWORK_ID }], error: null } }),
    );

    const result = await assignSupervisorRole(client, TARGET_ID, NETWORK_ID, ADMIN_ID);

    expect(result.success).toBe(false);
    expect(result.failure).toBe('other_network');
    expect(insertsIssued(fromCalls)).toBe(0);
  });

  it('reports a failed insert as insert_failed', async () => {
    const { client } = buildRecordingClient(
      adminOk({ insert: { data: null, error: { code: '23503', message: 'fk violation' } } }),
    );

    const result = await assignSupervisorRole(client, TARGET_ID, NETWORK_ID, ADMIN_ID);

    expect(result.success).toBe(false);
    expect(result.failure).toBe('insert_failed');
  });
});
