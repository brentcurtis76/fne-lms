/**
 * Sequenced supabase client stub, shared by API-route tests.
 *
 * Each from(table) call consumes the next configured result for that table.
 * The proxy chain handles await, .single()/.maybeSingle(), and records
 * .insert/.update/.upsert/.select/.eq/.delete payloads for assertion. An
 * `ops` log captures the global ordering of from()/rpc()/auth calls so tests
 * can assert sequencing across tables.
 *
 * Extracted from the copies that grew in assign-role.test.ts and siblings —
 * new tests should import this instead of pasting another variant.
 */
import { vi } from 'vitest';

export interface TableResult {
  data?: unknown;
  error?: unknown;
}

export interface FromCall {
  table: string;
  index: number;
  inserts: unknown[];
  updates: unknown[];
  upserts: unknown[];
  selects: unknown[];
  deletes: number;
  eqs: Array<{ col: string; val: unknown }>;
}

export interface Tracker {
  fromCalls: FromCall[];
  rpcCalls: Array<{ fn: string; args?: unknown }>;
  // Global operation log: 'from:<table>', 'rpc:<fn>', 'auth:<method>'.
  ops: string[];
  // Arguments the auth admin helpers were called with. `generateLinkArgs`
  // carries the `redirectTo` a caller derived from the canonical-origin helper,
  // which is the only way to assert that an invitation link does not point
  // wherever a request's Host header said.
  createUserArgs?: unknown;
  generateLinkArgs?: unknown;
}

export function makeTracker(): Tracker {
  return { fromCalls: [], rpcCalls: [], ops: [] };
}

export interface StubOptions {
  rpcResult?: TableResult;
  createUserResult?: { data: unknown; error: unknown };
  generateLinkResult?: { data: unknown; error: unknown };
}

export function buildClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  options: StubOptions = {}
) {
  const indices: Record<string, number> = {};
  const rpcResult = options.rpcResult ?? { data: null, error: null };

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = {
        table,
        index: idx,
        inserts: [],
        updates: [],
        upserts: [],
        selects: [],
        deletes: 0,
        eqs: [],
      };
      tracker.fromCalls.push(fromCall);
      tracker.ops.push(`from:${table}`);

      const resolved = { data: result.data ?? null, error: result.error ?? null };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'insert') {
            return vi.fn((arg: unknown) => {
              fromCall.inserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'update') {
            return vi.fn((arg: unknown) => {
              fromCall.updates.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'upsert') {
            return vi.fn((arg: unknown) => {
              fromCall.upserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'select') {
            return vi.fn((arg?: unknown) => {
              fromCall.selects.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'delete') {
            return vi.fn(() => {
              fromCall.deletes += 1;
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
    rpc: vi.fn((fn: string, args?: unknown) => {
      tracker.rpcCalls.push({ fn, args });
      tracker.ops.push(`rpc:${fn}`);
      const r = { data: rpcResult.data ?? null, error: rpcResult.error ?? null };
      return { then: (resolve: (v: unknown) => void) => resolve(r) };
    }),
    auth: {
      admin: {
        createUser: vi.fn(async (args?: unknown) => {
          tracker.ops.push('auth:createUser');
          tracker.createUserArgs = args;
          return (
            options.createUserResult ?? {
              data: { user: { id: 'stub-created-user-id' } },
              error: null,
            }
          );
        }),
        generateLink: vi.fn(async (args?: unknown) => {
          tracker.ops.push('auth:generateLink');
          tracker.generateLinkArgs = args;
          return (
            options.generateLinkResult ?? {
              data: { properties: { action_link: 'https://example.com/recovery' } },
              error: null,
            }
          );
        }),
      },
    },
  };
}

export function countInserts(tracker: Tracker, table: string) {
  return tracker.fromCalls
    .filter((c) => c.table === table)
    .reduce((sum, c) => sum + c.inserts.length, 0);
}

export function findPayloads(
  tracker: Tracker,
  table: string,
  kind: 'inserts' | 'updates' | 'upserts'
): Record<string, unknown>[] {
  return tracker.fromCalls
    .filter((c) => c.table === table)
    .flatMap((c) => c[kind]) as Record<string, unknown>[];
}
