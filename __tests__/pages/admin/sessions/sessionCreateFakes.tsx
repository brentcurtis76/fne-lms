/**
 * The fakes of the form «Programar Sesión» (`pages/admin/sessions/create.tsx`) for the tests of
 * redesign 6, release SB (`create.nuevo`, `create.sameForm`, `create.checks`). The same kind of fakes
 * as the pin `create.clasico.test.tsx` (which keeps its own, untouched): everything outside the page
 * is replaced, and an ordered log keeps what the page asked for (every `fetch` with its address,
 * method, headers and body; every Supabase read with its filters; every `rpc`; every `auth.*` call; the
 * role helper; every router push; every toast; the browser's question).
 *
 * A test file mocks the modules with the factories below (`vi.mock(…, async () => (await
 * import('…/sessionCreateFakes')).routerModule())`), so the file and the fakes share this module's state.
 * `fakes.look` is what `useLook()` answers. Every person, school, community and address is invented.
 */
import React from 'react';
import { act } from '@testing-library/react';
import { vi } from 'vitest';

export type Answer = { status?: number; body?: unknown; unreadable?: boolean } | 'reject' | 'pending';
export type Row = { data?: unknown; error?: unknown } | 'pending' | 'throw';
type SessionAnswer = any | null | 'pending' | 'throw';

export interface Scenario {
  session: any | null;
  sessions?: SessionAnswer[];
  role?: string | 'throw' | 'pending';
  tables?: Record<string, Row[]>;
  rpc?: Row[];
  fetch?: Record<string, Answer | Answer[]>;
  confirm?: boolean;
}

export const fakes = {
  scenario: null as Scenario | null,
  log: [] as unknown[],
  look: 'clasico' as 'clasico' | 'nuevo',
  /** How many times the layout marker was mounted (a remount of the frame counts again). */
  layoutMounts: 0,
};

export function log(entry: unknown) {
  fakes.log.push(entry);
}
const S = (): Scenario => fakes.scenario as Scenario;

// ── Invented data. ──

export const ADMIN = { access_token: 'synthetic-token-admin', user: { id: 'user-admin', email: 'admin@example.invalid' } };

export const SCHOOLS = [
  { id: 7, name: 'Colegio Inventado del Norte' },
  { id: 9, name: 'Colegio Inventado del Sur' },
];
export const COMMUNITIES: Record<number, unknown[]> = {
  7: [
    { id: 'com-7a', name: 'Comunidad Inventada Alfa', school_id: 7 },
    { id: 'com-7b', name: 'Comunidad Inventada Beta', school_id: 7 },
  ],
  9: [{ id: 'com-9a', name: 'Comunidad Inventada Gamma', school_id: 9 }],
};
export const CONTRATOS: Record<number, unknown[]> = {
  7: [{ id: 'ctr-7', nombre: 'Contrato Inventado 2026', clientes: { school_id: 7 } }],
  9: [],
};
export const CONSULTANTS = [
  { id: 'u-c1', first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' },
  { id: 'u-c2', first_name: 'Bruno', last_name: 'Ficticio', email: 'bruno@example.invalid' },
  { id: 'u-c3', first_name: 'Carla', last_name: 'Supuesta', email: 'carla@example.invalid' },
];
export const HOUR_TYPES = [
  { id: 'ht-1', key: 'asesoria_directiva', display_name: 'Asesoría directiva', modality: 'presencial', sort_order: 1 },
  { id: 'ht-2', key: 'online_learning', display_name: 'Aprendizaje en línea', modality: 'online', sort_order: 2 },
  { id: 'ht-3', key: 'taller', display_name: 'Taller', modality: 'presencial', sort_order: 3 },
];
export const BUCKETS = [
  { hour_type_key: 'asesoria_directiva', available_hours: 2.5, allocated_hours: 20 },
  { hour_type_key: 'taller', available_hours: 42.5, allocated_hours: 60 },
];

export function admin(over: Partial<Scenario> = {}): Scenario {
  return { session: ADMIN, role: 'admin', confirm: true, ...over };
}

// ── Supabase. ──

const DEFAULT_ROWS: Record<string, (ops: unknown[][]) => Row> = {
  schools: () => ({ data: SCHOOLS, error: null }),
  growth_communities: (ops) => {
    const id = ops.find((op) => op[0] === 'eq' && op[1] === 'school_id')?.[2] as number;
    return { data: COMMUNITIES[id] ?? [], error: null };
  },
  contratos: (ops) => {
    const id = ops.find((op) => op[0] === 'eq' && op[1] === 'clientes.school_id')?.[2] as number;
    return { data: CONTRATOS[id] ?? [], error: null };
  },
};

function settleRow(row: Row): Promise<any> {
  if (row === 'pending') return new Promise(() => {});
  if (row === 'throw') return Promise.reject(new Error('Synthetic read failure'));
  return Promise.resolve(row);
}

function query(table: string): any {
  const ops: unknown[][] = [];
  const answer = () => {
    log({ supabase: table, ops });
    const queued = S().tables?.[table]?.shift();
    if (queued !== undefined) return settleRow(queued);
    const fallback = DEFAULT_ROWS[table];
    return settleRow(fallback ? fallback(ops) : { data: null, error: null });
  };
  const q: any = {};
  for (const method of ['select', 'eq', 'in', 'order', 'neq', 'is', 'limit', 'match', 'filter', 'or', 'not', 'gte', 'lte']) {
    q[method] = (...args: unknown[]) => {
      ops.push([method, ...args]);
      return q;
    };
  }
  q.single = () => {
    ops.push(['single']);
    return answer();
  };
  q.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => answer().then(resolve, reject);
  return q;
}

export const client: any = {
  auth: {
    getSession: vi.fn(() => {
      log('auth.getSession');
      const queue = S().sessions;
      const next: SessionAnswer = queue && queue.length > 0 ? queue.shift() : S().session;
      if (next === 'pending') return new Promise(() => {});
      if (next === 'throw') return Promise.reject(new Error('Synthetic session failure'));
      return Promise.resolve({ data: { session: next }, error: null });
    }),
    signOut: vi.fn(() => {
      log('auth.signOut');
      return Promise.resolve({ error: null });
    }),
  },
  from: vi.fn((table: string) => {
    log({ 'supabase.from': table });
    return query(table);
  }),
  rpc: vi.fn((name: string, args: unknown) => {
    log({ rpc: name, args });
    const queue = S().rpc;
    const next: Row = queue && queue.length > 0 ? (queue.length > 1 ? queue.shift()! : queue[0]) : { data: BUCKETS, error: null };
    return settleRow(next);
  }),
};

// ── fetch. ──

function defaultAnswer(key: string): Answer {
  if (key === 'GET /api/hour-types') return { body: { data: { hour_types: HOUR_TYPES } } };
  if (key.startsWith('GET /api/admin/consultants')) return { body: { data: { consultants: CONSULTANTS } } };
  if (key === 'POST /api/sessions') return { body: { data: { session: { id: 'ses-inventada-1' } } } };
  if (key === 'POST /api/sessions/bulk-approve') return { body: { data: { approved: 4 } } };
  if (/^POST \/api\/sessions\/[^/]+\/approve$/.test(key)) return { body: { data: { ok: true } } };
  return { status: 404, body: { error: `unexpected ${key}` } };
}

export function fakeFetch(url: string, init?: Record<string, unknown>) {
  const method = (init?.method as string | undefined) ?? 'GET';
  log({ fetch: url, method: init?.method ?? '«none»', headers: init?.headers ?? '«none»', body: init?.body ?? '«none»' });
  const key = `${method} ${url}`;
  const given = S().fetch?.[key];
  let answer: Answer;
  if (Array.isArray(given)) answer = given.length > 1 ? given.shift()! : given[0];
  else answer = given ?? defaultAnswer(key);
  if (answer === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (answer === 'pending') return new Promise(() => {});
  const status = answer.status ?? 200;
  const body = answer.body;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => {
      log(`body read (json) of ${key}`);
      // `unreadable`: an answer whose body is not JSON (its reading fails).
      if (answer !== 'reject' && answer !== 'pending' && answer.unreadable) return Promise.reject(new SyntaxError('Synthetic unreadable body'));
      return Promise.resolve(body);
    },
  });
}

// ── Module factories. ──

export const router = {
  asPath: '/admin/sessions/create',
  pathname: '/admin/sessions/create',
  query: {} as Record<string, string>,
  push: vi.fn((url: unknown) => {
    log({ 'router.push': url });
    return Promise.resolve(true);
  }),
  replace: vi.fn((url: unknown) => {
    log({ 'router.replace': url });
    return Promise.resolve(true);
  }),
  prefetch: vi.fn(() => Promise.resolve()),
  events: { on: vi.fn(), off: vi.fn() },
};

export const routerModule = () => ({ useRouter: () => router, default: router });

export const authHelpersModule = () => ({
  useSupabaseClient: () => client,
  useSession: () => null,
  useUser: () => null,
  useSessionContext: () => ({ session: null, isLoading: false }),
});

export const roleUtilsModule = (real: Record<string, unknown>) => ({
  ...real,
  getUserPrimaryRole: vi.fn((userId: string) => {
    log({ getUserPrimaryRole: userId });
    const role = S().role ?? 'admin';
    if (role === 'pending') return new Promise(() => {});
    if (role === 'throw') return Promise.reject(new Error('Synthetic role failure'));
    return Promise.resolve(role);
  }),
});

export const toastModule = () => {
  const toast = Object.assign((message: unknown) => log({ toast: message }), {
    success: vi.fn((message: unknown) => log({ 'toast.success': message })),
    error: vi.fn((message: unknown) => log({ 'toast.error': message })),
    loading: vi.fn((message: unknown) => log({ 'toast.loading': message })),
    dismiss: vi.fn(),
  });
  return { toast, default: toast, Toaster: () => null };
};

export const lookModule = () => ({ useLook: () => ({ look: fakes.look, setLook: () => {} }) });

export const linkModule = () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
});

/** The frame: prints the props the page gives it (functions named) and draws its children. */
function LayoutMarker(props: any) {
  React.useEffect(() => {
    fakes.layoutMounts += 1;
  }, []);
  const rest = { ...props };
  delete rest.children;
  const text = JSON.stringify(rest, (_k, v) => (typeof v === 'function' ? '«function»' : v === undefined ? '«undefined»' : v));
  return (
    <div data-marker="MainLayout" data-props={text}>
      {props.children}
    </div>
  );
}
export const layoutModule = () => ({ default: LayoutMarker });

export const headerModule = () => ({
  default: () => <div data-marker="FunctionalPageHeader" />,
  ResponsiveFunctionalPageHeader: (props: any) => (
    <div data-marker="ResponsiveFunctionalPageHeader">
      {props.title} {props.subtitle}
    </div>
  ),
  MobileFunctionalPageHeader: () => <div data-marker="MobileFunctionalPageHeader" />,
});

// ── Set-up and helpers for a case. ──

export function installGlobals() {
  fakes.log = [];
  fakes.layoutMounts = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal(
    'confirm',
    vi.fn((question: unknown) => {
      const answer = S().confirm ?? true;
      log({ confirm: question, answer });
      return answer;
    })
  );
}

/** Lets every pending promise of the page settle (the fakes answer with promises only). */
export async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** The log without the entries a press of a button writes only in one look (the browser's question). */
export function requestsOf(entries: unknown[]) {
  return entries.filter((e) => !(e && typeof e === 'object' && 'confirm' in (e as object)));
}

export function takeLog(): unknown[] {
  const out = fakes.log;
  fakes.log = [];
  return out;
}
