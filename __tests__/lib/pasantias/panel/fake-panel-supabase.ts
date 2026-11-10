/**
 * A recording stand-in for the service-role Supabase client, for the Pasantías
 * panel suites (the intake fake plus `.range()`, and a storage bucket). It pins
 * what a route ASKS for — table, columns, filters, payloads, RPC arguments,
 * storage calls — and answers whatever the test decides. It proves nothing
 * about PostgREST, the SQL or Storage; pgTAP 116 and the Playwright spec own
 * that.
 *
 * Not a test file (no `.test.` in the name), so Vitest never collects it.
 */

export interface PanelQuery {
  table: string;
  op: 'select' | 'insert' | 'update';
  columns: string | null;
  payload: Record<string, unknown> | null;
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  in: Record<string, unknown[]>;
  /** `.ilike(column, pattern)` filters (the account lookup by email). */
  ilike: Record<string, string>;
  orders: string[];
  limit: number | null;
  range: [number, number] | null;
}

export interface PanelRpc {
  name: string;
  args: Record<string, unknown>;
}

export interface StorageCall {
  op: 'upload' | 'remove' | 'list' | 'download' | 'createSignedUrl';
  bucket: string;
  path?: string;
  paths?: string[];
  options?: Record<string, unknown>;
  seconds?: number;
  body?: Buffer;
}

export interface Answer {
  data: unknown;
  error: unknown;
}

export interface FakePanel {
  client: any;
  queries: PanelQuery[];
  rpcs: PanelRpc[];
  storage: StorageCall[];
  /** Every write (insert/update) the route made, in order. */
  writes: () => PanelQuery[];
}

export function fakePanel(handlers: {
  query?: (query: PanelQuery) => Answer;
  rpc?: (rpc: PanelRpc) => Answer;
  storage?: (call: StorageCall) => Answer;
}): FakePanel {
  const queries: PanelQuery[] = [];
  const rpcs: PanelRpc[] = [];
  const storage: StorageCall[] = [];
  const onQuery = handlers.query ?? (() => ({ data: [], error: null }));
  const onRpc = handlers.rpc ?? (() => ({ data: null, error: { code: 'UNEXPECTED_RPC' } }));
  const onStorage = handlers.storage ?? (() => ({ data: null, error: null }));

  const from = (table: string) => {
    const query: PanelQuery = {
      table,
      op: 'select',
      columns: null,
      payload: null,
      eq: {},
      is: {},
      in: {},
      ilike: {},
      orders: [],
      limit: null,
      range: null,
    };
    const settle = () => {
      queries.push(query);
      return Promise.resolve(onQuery(query));
    };
    const builder: any = {
      select(columns?: string) {
        query.columns = columns ?? '*';
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
      in(column: string, values: unknown[]) {
        query.in[column] = values;
        return builder;
      },
      ilike(column: string, pattern: string) {
        query.ilike[column] = pattern;
        return builder;
      },
      // Recorded nowhere: only `authorizeUserEmail` uses it, and its answer is arranged per table.
      not() {
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
      range(from_: number, to: number) {
        query.range = [from_, to];
        return builder;
      },
      maybeSingle: settle,
      single: settle,
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

  const bucket = (name: string) => {
    const run = (call: StorageCall) => {
      storage.push(call);
      return Promise.resolve(onStorage(call));
    };
    return {
      upload: (path: string, body: Buffer, options: Record<string, unknown>) =>
        run({ op: 'upload', bucket: name, path, body, options }),
      remove: (paths: string[]) => run({ op: 'remove', bucket: name, paths }),
      list: (path: string, options: Record<string, unknown>) => run({ op: 'list', bucket: name, path, options }),
      download: (path: string) => run({ op: 'download', bucket: name, path }),
      createSignedUrl: (path: string, seconds: number, options: Record<string, unknown>) =>
        run({ op: 'createSignedUrl', bucket: name, path, seconds, options }),
    };
  };

  return {
    client: { from, rpc, storage: { from: bucket } },
    queries,
    rpcs,
    storage,
    writes: () => queries.filter((q) => q.op !== 'select'),
  };
}
