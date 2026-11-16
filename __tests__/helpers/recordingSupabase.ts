/**
 * A recording fake of the browser Supabase client (GENERA fixes F11).
 *
 * Every request — a `from(table)` chain, an `rpc(fn, args)` or a realtime
 * `channel(name)` — is logged with the methods it called; `state.respond`
 * decides what the "database" answers when the chain is awaited or ended with
 * `.single()` / `.maybeSingle()`. Synthetic data only.
 */

export type Op = { method: string; args: unknown[] };
export type RecordedRequest = { kind: 'from' | 'rpc'; target: string; ops: Op[]; args?: unknown };
export type Answer = { data: unknown; error: unknown; count?: number | null };
export type Terminal = 'await' | 'single' | 'maybeSingle';

export type RecordedChannel = {
  name: string;
  handlers: Array<{ filter: Record<string, unknown>; handler: (payload: any) => unknown }>;
  subscribed: boolean;
  unsubscribed: number;
};

export function createRecordingSupabase() {
  const state = {
    requests: [] as RecordedRequest[],
    channels: [] as RecordedChannel[],
    respond: (_req: RecordedRequest, _terminal: Terminal): Answer => ({ data: null, error: null }),
    userId: 'user-self' as string | null,
  };

  const chainFor = (req: RecordedRequest) => {
    const answer = (terminal: Terminal) => Promise.resolve(state.respond(req, terminal));
    const chain: any = new Proxy(
      {},
      {
        get(_t, prop: string | symbol) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => answer('await').then(ok, ko);
          }
          if (typeof prop !== 'string') return undefined;
          if (prop === 'single' || prop === 'maybeSingle') {
            return () => {
              req.ops.push({ method: prop, args: [] });
              return answer(prop);
            };
          }
          return (...args: unknown[]) => {
            req.ops.push({ method: prop, args });
            return chain;
          };
        },
      }
    );
    return chain;
  };

  const client = {
    from: (table: string) => {
      const req: RecordedRequest = { kind: 'from', target: table, ops: [] };
      state.requests.push(req);
      return chainFor(req);
    },
    rpc: (fn: string, args?: unknown) => {
      const req: RecordedRequest = { kind: 'rpc', target: fn, ops: [], args };
      state.requests.push(req);
      return chainFor(req);
    },
    channel: (name: string) => {
      const channel: RecordedChannel = { name, handlers: [], subscribed: false, unsubscribed: 0 };
      state.channels.push(channel);
      const api: any = {
        on: (_type: string, filter: Record<string, unknown>, handler: (payload: any) => unknown) => {
          channel.handlers.push({ filter, handler });
          return api;
        },
        subscribe: () => {
          channel.subscribed = true;
          return api;
        },
        unsubscribe: () => {
          channel.unsubscribed += 1;
          return Promise.resolve('ok');
        },
      };
      return api;
    },
    auth: {
      getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }),
      getSession: async () => ({
        data: { session: state.userId ? { user: { id: state.userId }, access_token: 'synthetic-token' } : null },
      }),
    },
  };

  return { client, state };
}

export const has = (req: RecordedRequest, method: string) => req.ops.some((op) => op.method === method);
export const opArgs = (req: RecordedRequest, method: string) => req.ops.find((op) => op.method === method)?.args;
/** Every column list the request asked for (`select(...)` arguments). */
export const selects = (req: RecordedRequest) =>
  req.ops.filter((op) => op.method === 'select').map((op) => String(op.args[0] ?? ''));
