/**
 * A recording stand-in for the service-role Supabase client, shared by the
 * intake API suites. It pins what a route ASKS for — table, columns, filters,
 * payloads, RPC arguments — and answers whatever the test decides. It proves
 * nothing about PostgREST or the SQL; the real-stack Playwright spec and pgTAP
 * 114 own that.
 *
 * Not a test file (no `.test.` in the name), so Vitest never collects it.
 */

export interface RecordedQuery {
  table: string;
  op: 'select' | 'insert' | 'update';
  columns: string | null;
  options: Record<string, unknown> | undefined;
  payload: Record<string, unknown> | null;
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  gt: Record<string, unknown>;
  /** `.in(column, values)` filters (F04 focus reads). */
  in: Record<string, unknown[]>;
  orders: string[];
  limit: number | null;
}

export interface RecordedRpc {
  name: string;
  args: Record<string, unknown>;
}

export interface Answer {
  data: unknown;
  error: unknown;
  count?: number | null;
}

export interface FakeSupabase {
  client: { from: (table: string) => unknown; rpc: (name: string, args: Record<string, unknown>) => Promise<Answer> };
  queries: RecordedQuery[];
  rpcs: RecordedRpc[];
}

export function fakeSupabase(
  onQuery: (query: RecordedQuery) => Answer,
  onRpc: (rpc: RecordedRpc) => Answer = () => ({ data: null, error: { code: 'UNEXPECTED_RPC' } })
): FakeSupabase {
  const queries: RecordedQuery[] = [];
  const rpcs: RecordedRpc[] = [];

  const from = (table: string) => {
    const query: RecordedQuery = {
      table,
      op: 'select',
      columns: null,
      options: undefined,
      payload: null,
      eq: {},
      is: {},
      gt: {},
      in: {},
      orders: [],
      limit: null,
    };
    const settle = () => {
      queries.push(query);
      return Promise.resolve(onQuery(query));
    };
    const builder = {
      select(columns?: string, options?: Record<string, unknown>) {
        query.columns = columns ?? '*';
        if (options) query.options = options;
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        query.op = 'insert';
        query.payload = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        query.op = 'update';
        query.payload = payload;
        return builder;
      },
      eq(column: string, value: unknown) {
        query.eq[column] = value;
        return builder;
      },
      is(column: string, value: unknown) {
        query.is[column] = value;
        return builder;
      },
      gt(column: string, value: unknown) {
        query.gt[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        query.in[column] = values;
        return builder;
      },
      order(column: string) {
        query.orders.push(column);
        return builder;
      },
      limit(n: number) {
        query.limit = n;
        return builder;
      },
      maybeSingle() {
        return settle();
      },
      single() {
        return settle();
      },
      then<T>(resolve: (value: Answer) => T, reject?: (reason: unknown) => T) {
        return settle().then(resolve, reject);
      },
    };
    return builder;
  };

  const rpc = (name: string, args: Record<string, unknown>) => {
    const call = { name, args };
    rpcs.push(call);
    return Promise.resolve(onRpc(call));
  };

  return { client: { from, rpc }, queries, rpcs };
}
