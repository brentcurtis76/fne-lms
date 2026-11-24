/**
 * A stand-in for the Supabase service-role client in the Correos route tests. Every query is recorded
 * (table, the chain of calls and their arguments); what it answers is decided by the test's `answer` function.
 * `rpc` calls are recorded apart and answered by `rpcAnswer`. Nothing touches a network or a database.
 */
export interface Op {
  method: string;
  args: unknown[];
}

export interface QueryRecord {
  table: string;
  ops: Op[];
}

export type Answer = { data?: unknown; error?: unknown; count?: number | null };

export interface FakeDb {
  client: any;
  queries: QueryRecord[];
  rpcs: { name: string; args: Record<string, unknown> }[];
  /** Every write: insert, update, upsert or delete on any table. */
  writes: () => QueryRecord[];
}

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

/** The argument of the first call of `method` in the chain, or undefined. */
export function arg(record: QueryRecord, method: string, index = 0): any {
  const op = record.ops.find((o) => o.method === method);
  return op ? op.args[index] : undefined;
}

export function has(record: QueryRecord, method: string): boolean {
  return record.ops.some((o) => o.method === method);
}

export function fakeDb(
  answer: (record: QueryRecord) => Answer = () => ({ data: [], error: null }),
  rpcAnswer: (name: string, args: Record<string, unknown>) => Answer = () => ({ data: null, error: { message: 'no rpc expected' } })
): FakeDb {
  const queries: QueryRecord[] = [];
  const rpcs: FakeDb['rpcs'] = [];

  function builder(table: string) {
    const record: QueryRecord = { table, ops: [] };
    queries.push(record);
    const settle = () => {
      const result = answer(record);
      return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
    };
    const chain: any = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'then') {
            return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              Promise.resolve().then(settle).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            record.ops.push({ method: prop, args });
            if (prop === 'single' || prop === 'maybeSingle') return Promise.resolve().then(settle);
            return chain;
          };
        },
      }
    );
    return chain;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      const result = rpcAnswer(name, args);
      return { data: result.data ?? null, error: result.error ?? null };
    },
  };

  return {
    client,
    queries,
    rpcs,
    writes: () => queries.filter((q) => q.ops.some((op) => WRITE_METHODS.has(op.method))),
  };
}

/** The counts `email_add_contacts` returns, with the given values and the rest zero. */
export function counts(values: Partial<Record<string, number>> = {}) {
  const base = { total: 0, accepted: 0, duplicate: 0, blocked: 0, left: 0, invalid: 0, contacts_created: 0, memberships_created: 0 };
  const merged = { ...base, ...values };
  if (values.total === undefined) {
    merged.total = merged.accepted + merged.duplicate + merged.blocked + merged.left + merged.invalid;
  }
  return merged;
}
