// @vitest-environment jsdom
/**
 * Redesign 6, area Sessions, release SA, step 0: today's admin form «Programar Sesión»
 * (`pages/admin/sessions/create.tsx`) pinned BEFORE its data code moves into a hook and its
 * markup into the classic view.
 *
 * Each case renders the page's default export with everything outside the page replaced by fakes
 * this file controls, and keeps ONE digest (see `__tests__/helpers/pin.ts`) of two things
 * together: (a) the rendered markup of the whole page, serialised as Vitest serialises a snapshot,
 * and (b) the ordered log of what the page asked for (every `fetch` with its address, method,
 * headers and body; every read of a response's body, read once as a real one; every Supabase read with its table, columns and filters; every `rpc`; every
 * `auth.*` call; the role helper; every router push, replace or event subscription; every toast; the browser's
 * confirmation question; the page's own error lines), from the first render to the settled screen
 * and after each action of a case. If a case fails, the form changed: what it draws, what it asks
 * for, or in which order.
 *
 * To see a case's text set SES_CREATE_CLASICO_SHOW to its name (or `all`), with
 * SES_CREATE_CLASICO_OUT naming a scratch folder. To accept a change ON PURPOSE set
 * SES_CREATE_CLASICO_ACCEPT to its name (or `all`). Nothing is accepted without that variable.
 *
 * The machine does not reach the pin: the time zone is fixed to UTC below before any date is made
 * (the first test fails by name if it did not take), and the clock is fixed per case with
 * `vi.setSystemTime` (only `Date` is faked, so the page's promises and the test's waits run on
 * real timers). The form's earliest date reads the clock in UTC; its Spain line converts through
 * named zones (`America/Santiago`, `Europe/Madrid`); the preview rows parse and print date-only
 * strings in the process's zone, which is UTC here on every machine.
 *
 * Every person, school, community, contract and address below is invented. Components the page
 * only places are replaced by markers that print the props the page gives them.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../../helpers/pin';

// The machine's time zone must not reach the digests: fixed before anything else runs (Node reads
// a change of `process.env.TZ` at run time while Vitest runs this file in its own process).
const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'UTC';
  return before;
});

const HERE = dirname(fileURLToPath(import.meta.url));
const { pinned, digestsFileHolds } = makePin(join(HERE, 'create.clasico.digests.json'), 'SES_CREATE_CLASICO');

// ── The fakes. ──

type Answer = { status?: number; body?: unknown } | 'reject' | 'pending';
type Row = { data?: unknown; error?: unknown } | 'pending' | 'throw';
type SessionAnswer = any | null | 'pending' | 'throw';

interface Scenario {
  /** What `auth.getSession` answers when `sessions` is empty. */
  session: any | null;
  /** Answers of `auth.getSession`, consumed in order before `session` is used. */
  sessions?: SessionAnswer[];
  /** What `getUserPrimaryRole` answers. */
  role?: string | 'throw' | 'pending';
  /** Answers per table, consumed in order before the defaults below. */
  tables?: Record<string, Row[]>;
  /** Answers of `rpc('get_bucket_summary')`, consumed in order; the last one repeats. */
  rpc?: Row[];
  /** Answers per `METHOD address`; a list is consumed in order and its last one repeats. */
  fetch?: Record<string, Answer | Answer[]>;
  /** What the browser's confirmation question answers. */
  confirm?: boolean;
}

const mocks = vi.hoisted(() => ({
  scenario: null as any,
  log: [] as unknown[],
  props: {} as Record<string, any>,
  freshRouter: false,
  router: {
    asPath: '/admin/sessions/create',
    pathname: '/admin/sessions/create',
    query: {} as Record<string, string>,
    push: null as any,
    replace: null as any,
    prefetch: null as any,
    events: null as any,
  },
}));

function log(entry: unknown) {
  mocks.log.push(entry);
}
const S = (): Scenario => mocks.scenario as Scenario;

mocks.router.push = vi.fn((url: unknown, ...rest: unknown[]) => {
  log(rest.length === 0 ? { 'router.push': url } : { 'router.push': url, rest });
  return Promise.resolve(true);
});
mocks.router.replace = vi.fn((url: unknown, ...rest: unknown[]) => {
  log(rest.length === 0 ? { 'router.replace': url } : { 'router.replace': url, rest });
  return Promise.resolve(true);
});
mocks.router.prefetch = vi.fn((...args: unknown[]) => {
  log({ 'router.prefetch': args });
  return Promise.resolve();
});
// Each subscription is written down with its event's name (send-back 2).
mocks.router.events = {
  on: vi.fn((name: unknown) => log(`router.events.on: ${String(name)}`)),
  off: vi.fn((name: unknown) => log(`router.events.off: ${String(name)}`)),
};

/** Props as text: functions, elements and `undefined` are named, so `undefined`, `null` and a text differ. */
function describeProps(props: Record<string, unknown>): string {
  const rest = { ...props };
  delete rest.children;
  return JSON.stringify(rest, (_key, value) => {
    if (value === undefined) return '«undefined»';
    if (typeof value === 'function') return '«function»';
    if (React.isValidElement(value)) {
      const type: any = value.type;
      const name = typeof type === 'string' ? type : type?.displayName || type?.name || '«anonymous»';
      return { element: name, props: value.props };
    }
    return value;
  });
}

function marker(name: string, withChildren = false) {
  return function Marker(props: any) {
    mocks.props[name] = props;
    return (
      <div data-marker={name} data-props={describeProps(props)}>
        {withChildren ? props.children : null}
      </div>
    );
  };
}

// The page's other data are pure: its own error lines are logged, React's warnings are not.
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

/** A Supabase query: every filter is written down; awaiting it logs it and answers. */
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
  q.maybeSingle = () => {
    ops.push(['maybeSingle']);
    return answer();
  };
  q.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => answer().then(resolve, reject);
  return q;
}

function logAuth(name: string, args: unknown[]) {
  log(args.length === 0 ? name : { [name]: args });
}

// One client object for the whole file, as in the app.
const client: any = {
  auth: {
    getSession: vi.fn((...args: unknown[]) => {
      logAuth('auth.getSession', args);
      const queue = S().sessions;
      const next: SessionAnswer = queue && queue.length > 0 ? queue.shift() : S().session;
      if (next === 'pending') return new Promise(() => {});
      if (next === 'throw') return Promise.reject(new Error('Synthetic session failure'));
      return Promise.resolve({ data: { session: next }, error: null });
    }),
    signOut: vi.fn((...args: unknown[]) => {
      logAuth('auth.signOut', args);
      return Promise.resolve({ error: null });
    }),
  },
  from: vi.fn((table: string, ...rest: unknown[]) => {
    // Written when the read is begun (the order of the calls) and again when it is awaited (its filters).
    log(rest.length === 0 ? { 'supabase.from': table } : { 'supabase.from': table, rest: describeProps({ rest }) });
    return query(table);
  }),
  rpc: vi.fn((name: string, ...args: unknown[]) => {
    log({ rpc: name, args: describeProps({ args }) });
    const queue = S().rpc;
    const next: Row = queue && queue.length > 0 ? (queue.length > 1 ? queue.shift()! : queue[0]) : { data: BUCKETS, error: null };
    return settleRow(next);
  }),
};

vi.mock('next/router', () => ({
  useRouter: () => (mocks.freshRouter ? { ...mocks.router } : mocks.router),
}));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => client,
  useSession: () => {
    log('unexpected useSession');
    return null;
  },
  useUser: () => {
    log('unexpected useUser');
    return null;
  },
}));
vi.mock('@/utils/roleUtils', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/utils/roleUtils')>();
  return {
    ...real,
    getUserPrimaryRole: vi.fn((userId: string, ...rest: unknown[]) => {
      log(rest.length === 0 ? { getUserPrimaryRole: userId } : { getUserPrimaryRole: userId, rest: describeProps({ rest }) });
      const role = S().role ?? 'admin';
      if (role === 'pending') return new Promise(() => {});
      if (role === 'throw') return Promise.reject(new Error('Synthetic role failure'));
      return Promise.resolve(role);
    }),
  };
});
vi.mock('react-hot-toast', () => {
  const toast = Object.assign((message: unknown) => log({ toast: message }), {
    success: vi.fn((message: unknown, ...rest: unknown[]) =>
      log(rest.length === 0 ? { 'toast.success': message } : { 'toast.success': message, rest: describeProps({ rest }) })
    ),
    error: vi.fn((message: unknown, ...rest: unknown[]) =>
      log(rest.length === 0 ? { 'toast.error': message } : { 'toast.error': message, rest: describeProps({ rest }) })
    ),
    loading: vi.fn((message: unknown) => log({ 'toast.loading': message })),
    dismiss: vi.fn((...args: unknown[]) => log({ 'toast.dismiss': args })),
  });
  return { toast, default: toast, Toaster: () => null };
});
vi.mock('@/components/layout/MainLayout', () => ({ default: marker('MainLayout', true) }));
vi.mock('@/components/layout/FunctionalPageHeader', () => ({
  default: marker('FunctionalPageHeader'),
  ResponsiveFunctionalPageHeader: marker('ResponsiveFunctionalPageHeader'),
  MobileFunctionalPageHeader: marker('MobileFunctionalPageHeader'),
}));

import SessionCreatePage from '@/pages/admin/sessions/create';

/**
 * The hooks of the page's own component, in order, read from React's fiber (React 18): a custom
 * hook makes no fiber of its own, so whatever hooks the page calls, directly or through a hook of
 * its own, are listed here; a view drawn below the page has a fiber of its own and is not. Each
 * hook is written as its kind and, for effects and memos, its kind of effect and the length of its
 * dependency list (not the values: functions there change on every render).
 */
function hookSignature(container: HTMLElement, component: unknown): string {
  const node = container.firstElementChild as (Element & Record<string, any>) | null;
  if (!node) return '«nothing drawn»';
  const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  while (fiber && fiber.type !== component) fiber = fiber.return;
  if (!fiber) return '«page fiber not found»';
  const kinds: string[] = [];
  for (let hook = fiber.memoizedState; hook; hook = hook.next) {
    const state = hook.memoizedState;
    const deps = (d: unknown) => (Array.isArray(d) ? `[${d.length}]` : String(d));
    if (hook.queue) {
      const reducer = hook.queue.lastRenderedReducer;
      kinds.push(reducer && reducer.name === 'basicStateReducer' ? 'state' : 'reducer');
    } else if (state && typeof state === 'object' && 'create' in state && 'tag' in state) {
      // The tag without its "has effect" bit (1), which changes from render to render.
      kinds.push(`effect(tag ${state.tag & ~1}, deps ${deps(state.deps)})`);
    } else if (state && typeof state === 'object' && !Array.isArray(state) && Object.keys(state).join() === 'current') {
      kinds.push('ref');
    } else if (Array.isArray(state) && state.length === 2) {
      kinds.push(`memo(deps ${deps(state[1])})`);
    } else {
      kinds.push(`other(${typeof state})`);
    }
  }
  return `${kinds.length} hooks:\n${kinds.join('\n')}`;
}

// ── The fetch fake: answers by method and address, can fail or stay pending, writes each call down. ──

function defaultAnswer(key: string): Answer {
  if (key === 'GET /api/hour-types') return { body: { data: { hour_types: HOUR_TYPES } } };
  if (key.startsWith('GET /api/admin/consultants')) return { body: { data: { consultants: CONSULTANTS } } };
  if (key === 'POST /api/sessions') return { body: { data: { session: { id: 'ses-inventada-1' } } } };
  if (key === 'POST /api/sessions/bulk-approve') return { body: { data: { approved: 4 } } };
  if (/^POST \/api\/sessions\/[^/]+\/approve$/.test(key)) return { body: { data: { ok: true } } };
  return { status: 404, body: { error: `unexpected ${key}` } };
}

function fakeFetch(url: string, ...args: unknown[]) {
  const init = (args[0] ?? undefined) as Record<string, unknown> | undefined;
  const method = (init?.method as string | undefined) ?? 'GET';
  const entry: Record<string, unknown> = {
    fetch: url,
    method: init?.method ?? '«none»',
    headers: init?.headers ?? '«none»',
    body: init?.body ?? '«none»',
  };
  const other = init ? Object.keys(init).filter((k) => !['method', 'headers', 'body'].includes(k)) : [];
  if (args.length === 0) entry.init = '«no second argument»';
  // The options as given: an option present as `null` or `undefined` differs from one left out,
  // and so does an explicit `null` or `undefined` second argument.
  if (args.length > 0 && args[0] == null) entry.init = args[0] === null ? '«null given»' : '«undefined given»';
  if (init) {
    for (const k of ['method', 'headers', 'body']) {
      if (k in init && init[k] == null) entry[`${k} as given`] = init[k] === null ? '«null»' : '«undefined»';
    }
  }
  if (other.length > 0) entry.other = describeProps(Object.fromEntries(other.map((k) => [k, init![k]])));
  if (args.length > 1) entry.more = describeProps({ args: args.slice(1) });
  log(entry);
  const key = `${method} ${url}`;
  const given = S().fetch?.[key];
  let answer: Answer;
  if (Array.isArray(given)) answer = given.length > 1 ? given.shift()! : given[0];
  else answer = given ?? defaultAnswer(key);
  if (answer === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (answer === 'pending') return new Promise(() => {});
  const status = answer.status ?? 200;
  const body = answer.body;
  let used = false;
  // A body is read once, as a real `Response`'s is (send-back 2): every read is written down, and a
  // second read fails («body already read») instead of answering again.
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => {
      if (used) {
        log(`body read again (json) of ${key}`);
        return Promise.reject(new TypeError('Synthetic: body already read'));
      }
      used = true;
      log(`body read (json) of ${key}`);
      return Promise.resolve(body);
    },
  });
}

// ── Invented data. ──

// 12:00 in Chile (UTC-3 in November), 08:00, and 22:30 (already the next day in UTC).
const NOON = new Date('2026-11-19T15:00:00Z');
const MORNING = new Date('2026-11-19T11:00:00Z');
const EVENING = new Date('2026-11-20T01:30:00Z');

const ADMIN = { access_token: 'synthetic-token-admin', user: { id: 'user-admin', email: 'admin@example.invalid' } };
const NO_TOKEN = { user: ADMIN.user };

const SCHOOLS = [
  { id: 7, name: 'Colegio Inventado del Norte' },
  { id: 9, name: 'Colegio Inventado del Sur' },
];
const COMMUNITIES: Record<number, unknown[]> = {
  7: [
    { id: 'com-7a', name: 'Comunidad Inventada Alfa', school_id: 7 },
    { id: 'com-7b', name: 'Comunidad Inventada Beta', school_id: 7 },
  ],
  9: [{ id: 'com-9a', name: 'Comunidad Inventada Gamma', school_id: 9 }],
};
const CONTRATOS: Record<number, unknown[]> = {
  7: [{ id: 'ctr-7', nombre: 'Contrato Inventado 2026', clientes: { school_id: 7 } }],
  9: [{ id: 'ctr-9', nombre: 'Contrato Inventado Sur', clientes: { school_id: 9 } }],
};
const CONSULTANTS = [
  { id: 'u-c1', first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' },
  { id: 'u-c2', first_name: 'Bruno', last_name: 'Ficticio', email: 'bruno@example.invalid' },
  { id: 'u-c3', first_name: 'Carla', last_name: 'Supuesta', email: 'carla@example.invalid' },
];
const HOUR_TYPES = [
  { id: 'ht-1', key: 'asesoria_directiva', display_name: 'Asesoría directiva', modality: 'presencial', sort_order: 1 },
  { id: 'ht-2', key: 'online_learning', display_name: 'Aprendizaje en línea', modality: 'online', sort_order: 2 },
  { id: 'ht-3', key: 'taller', display_name: 'Taller', modality: 'presencial', sort_order: 3 },
];
const bucket = (key: string, available: number, allocated: number) => ({
  hour_type_key: key,
  available_hours: available,
  allocated_hours: allocated,
});
const BUCKETS = [bucket('asesoria_directiva', 10, 20), bucket('taller', 3, 20)];

function admin(over: Partial<Scenario> = {}): Scenario {
  return { session: ADMIN, role: 'admin', confirm: true, ...over };
}

// ── Drawing and acting. ──

/** Lets every pending promise of the page settle (the fakes answer with promises only). */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let view: ReturnType<typeof render>;
async function draw(scenario: Scenario) {
  mocks.scenario = scenario;
  view = render(<SessionCreatePage />);
  await settle();
}
/** The markup now and what the page asked for since the last stage. */
function snap(): string[] {
  const out = [serialise(view.asFragment()), serialise(mocks.log)];
  mocks.log = [];
  return out;
}

const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;
async function change(element: Element | null | undefined, value: string) {
  if (!element) throw new Error('nothing to change');
  fireEvent.change(element, { target: { value } });
  await settle();
}
async function click(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}
async function call(fn: () => unknown) {
  await act(async () => {
    await fn();
  });
  await settle();
}
const field = (name: string) => $(`[name="${name}"]`);
const school = (id: string) => change(field('school_id'), id);
const community = (id: string) => change(field('growth_community_id'), id);
const consultantSelect = () => screen.queryByText('Agregar consultor...')?.closest('select');
const addConsultant = (id: string) => change(consultantSelect(), id);
const removeButton = (name: string) => $(`button[aria-label="Quitar consultor ${name}"]`);
const row = (name: string) => removeButton(name)?.parentElement?.parentElement ?? null;
const leadBox = (name: string) => row(name)?.querySelector('input[type="checkbox"]');
const roleButton = (name: string) => row(name)?.querySelector('button');
const modality = (m: 'presencial' | 'online' | 'hibrida') => click($(`input[name="modality"][value="${m}"]`));
const radioOf = (text: string) => screen.getByText(text).closest('label')?.querySelector('input');
const frequency = (value: string) => change(screen.getByText('Semanal').closest('select'), value);
const countInput = () => $('input[type="number"]');
const customDateInputs = () => Array.from(document.querySelectorAll('input[type="date"]:not([name])'));
const buttonStarting = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').startsWith(text)) ?? null;
const draftButton = () => buttonStarting('Guardar');
const scheduleButton = () => buttonStarting('Programar');

/** Everything the checks insist on, for a single presencial session at school 7. */
async function fillValid() {
  await school('7');
  await community('com-7a');
  await change(field('title'), 'Taller Inventado de Prueba');
  await change(field('session_date'), '2026-12-01');
  await addConsultant('u-c1');
  await change(field('location'), 'Sala Inventada 1');
}

let consoleError: { mockRestore: () => void } | null = null;
let ORIGINAL_ZOOM_FLAG: string | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  mocks.log = [];
  mocks.props = {};
  mocks.freshRouter = false;
  ORIGINAL_ZOOM_FLAG = process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
  process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS = 'true';
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal(
    'confirm',
    vi.fn((...args: unknown[]) => {
      const answer = S().confirm ?? true;
      log({ confirm: args, answer });
      return answer;
    })
  );
  // The page's own error lines are part of what it does; React's warnings are not the page's.
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown, second?: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) {
      log({ 'console.error': first, detail: second instanceof Error ? second.message : String(second) });
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // The flag as the process had it before this case.
  if (ORIGINAL_ZOOM_FLAG === undefined) delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
  else process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS = ORIGINAL_ZOOM_FLAG;
  consoleError?.mockRestore();
  consoleError = null;
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('the machine does not reach the pin', () => {
  it('the time zone fixed at the top of this file took (UTC)', () => {
    const day = new Date('2026-09-01T23:30:00Z').getDate();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (day !== 1 || zone !== 'UTC') {
      throw new Error(
        `The time zone of this test process is not UTC (day ${day}, zone ${zone}): the preview rows of the form would follow the machine.`
      );
    }
  });
});

// ── The cases. ──

describe("today's create-session form (pinned before SA)", () => {
  // Access and loading
  pinned('01. loading: getSession pending', async () => {
    await draw(admin({ sessions: ['pending'] }));
    return snap();
  });

  pinned('02. no session: sent to /login, access denied', async () => {
    await draw(admin({ session: null }));
    return snap();
  });

  pinned('03. role consultor: sent to /dashboard, nothing else asked', async () => {
    await draw(admin({ role: 'consultor' }));
    return snap();
  });

  pinned('04a. the role read throws: sent to /login', async () => {
    await draw(admin({ role: 'throw' }));
    return snap();
  });

  pinned('04b. getSession throws: sent to /login', async () => {
    await draw(admin({ sessions: ['throw'] }));
    return snap();
  });

  pinned('04c. the role read pending: still loading', async () => {
    await draw(admin({ role: 'pending' }));
    return snap();
  });

  // The admin's first screen
  pinned('05. admin, hour types pending', async () => {
    await draw(admin({ fetch: { 'GET /api/hour-types': 'pending' } }));
    return snap();
  });

  pinned('05b. admin, everything loaded at noon (load order)', async () => {
    await draw(admin());
    return snap();
  });

  pinned('06a. hour types answered non-ok', async () => {
    await draw(admin({ fetch: { 'GET /api/hour-types': { status: 500, body: { error: 'falla inventada' } } } }));
    return snap();
  });

  pinned('06b. hour types rejected', async () => {
    await draw(admin({ fetch: { 'GET /api/hour-types': 'reject' } }));
    return snap();
  });

  pinned('06c. hour types without a token: nothing shown', async () => {
    await draw(admin({ sessions: [ADMIN, NO_TOKEN] }));
    return snap();
  });

  pinned('07. hour types answered empty, and without data', async () => {
    await draw(admin({ fetch: { 'GET /api/hour-types': { body: { data: { hour_types: [] } } } } }));
    const first = snap();
    view.unmount();
    await draw(admin({ fetch: { 'GET /api/hour-types': { body: {} } } }));
    return [...first, ...snap()];
  });

  pinned('08. schools error, and schools answered null', async () => {
    await draw(admin({ tables: { schools: [{ data: null, error: { message: 'falla inventada' } }] } }));
    const first = snap();
    view.unmount();
    await draw(admin({ tables: { schools: [{ data: null, error: null }] } }));
    return [...first, ...snap()];
  });

  // A school chosen
  pinned('09a. a school chosen: communities, one contract, three consultants', async () => {
    await draw(admin());
    snap();
    await school('7');
    return snap();
  });

  pinned('09b. a school with no contracts, and a contracts error', async () => {
    await draw(admin({ tables: { contratos: [{ data: [], error: null }, { data: null, error: { message: 'x' } }] } }));
    snap();
    await school('7');
    const first = snap();
    await school('9');
    return [...first, ...snap()];
  });

  pinned('09c. consultants pending', async () => {
    await draw(admin({ fetch: { 'GET /api/admin/consultants?school_id=7': 'pending' } }));
    snap();
    await school('7');
    return snap();
  });

  pinned('09d. consultants answered empty', async () => {
    await draw(admin({ fetch: { 'GET /api/admin/consultants?school_id=7': { body: { data: { consultants: [] } } } } }));
    snap();
    await school('7');
    return snap();
  });

  pinned('09e. consultants non-ok with an error text', async () => {
    await draw(
      admin({ fetch: { 'GET /api/admin/consultants?school_id=7': { status: 403, body: { error: 'Sin permiso inventado' } } } })
    );
    snap();
    await school('7');
    return snap();
  });

  pinned('09f. consultants non-ok without an error text', async () => {
    await draw(admin({ fetch: { 'GET /api/admin/consultants?school_id=7': { status: 500, body: {} } } }));
    snap();
    await school('7');
    return snap();
  });

  pinned('09g. consultants without a token', async () => {
    await draw(admin({ sessions: [ADMIN, ADMIN, NO_TOKEN] }));
    snap();
    await school('7');
    return snap();
  });

  pinned('09h. consultants rejected', async () => {
    await draw(admin({ fetch: { 'GET /api/admin/consultants?school_id=7': 'reject' } }));
    snap();
    await school('7');
    return snap();
  });

  pinned('09i. communities error', async () => {
    await draw(admin({ tables: { growth_communities: [{ data: null, error: { message: 'x' } }] } }));
    snap();
    await school('7');
    return snap();
  });

  // Facilitators
  pinned('10. facilitators added, toggled, ticked and removed', async () => {
    await draw(admin());
    await school('7');
    snap();
    const stages: string[] = [];
    await addConsultant('u-c1');
    stages.push(...snap());
    await addConsultant('u-c2');
    stages.push(...snap());
    await click(roleButton('Ana Inventada'));
    stages.push(...snap());
    await click(roleButton('Ana Inventada'));
    stages.push(...snap());
    await click(leadBox('Bruno Ficticio'));
    stages.push(...snap());
    await click(leadBox('Bruno Ficticio'));
    stages.push(...snap());
    await addConsultant('u-c3');
    stages.push(...snap());
    await click(removeButton('Bruno Ficticio'));
    stages.push(...snap());
    await click(leadBox('Ana Inventada'));
    stages.push(...snap());
    await click(removeButton('Ana Inventada'));
    await click(removeButton('Carla Supuesta'));
    stages.push(...snap());
    await addConsultant('u-c3');
    stages.push(...snap());
    return stages;
  });

  pinned('10b. the selector given an empty choice: nothing added', async () => {
    await draw(admin());
    await school('7');
    snap();
    await addConsultant('');
    return snap();
  });

  // The school dependence
  pinned('11. another school after a community and facilitators', async () => {
    await draw(admin());
    await school('7');
    await community('com-7b');
    await addConsultant('u-c1');
    await change($('#hour-type-select'), 'taller');
    await change($('#contrato-select'), 'ctr-7');
    snap();
    await school('9');
    return snap();
  });

  pinned('12. school back to none', async () => {
    await draw(admin());
    await school('7');
    await community('com-7a');
    await addConsultant('u-c2');
    snap();
    await school('0');
    const first = snap();
    await school('');
    return [...first, ...snap()];
  });

  // The hours chip
  const chip = (name: string, rpc: Row[] | undefined, hourType: string, over: Partial<Scenario> = {}) =>
    pinned(name, async () => {
      await draw(admin({ rpc, ...over }));
      await school('7');
      snap();
      await change($('#hour-type-select'), hourType);
      const first = snap();
      await change($('#contrato-select'), 'ctr-7');
      return [...first, ...snap()];
    });
  chip('13a. chip: hours loading', ['pending'], 'asesoria_directiva');
  chip('13b. chip: 10 of 20', undefined, 'asesoria_directiva');
  chip('13c. chip: 3 of 20', undefined, 'taller');
  chip('13d. chip: 0 available', [{ data: [bucket('taller', 0, 20)], error: null }], 'taller');
  chip('13e. chip: -1 available', [{ data: [bucket('taller', -1, 20)], error: null }], 'taller');
  chip('13f. chip: allocated 0 with 5 available', [{ data: [bucket('taller', 5, 0)], error: null }], 'taller');
  chip('13g. chip: allocated null with 0 available', [{ data: [bucket('taller', 0, null as any)], error: null }], 'taller');
  chip('13h. chip: no bucket for the type', [{ data: [bucket('asesoria_directiva', 10, 20)], error: null }], 'taller');
  chip('13i. chip: the rpc fails', [{ data: null, error: { message: 'x' } }], 'taller');
  chip('13j. chip: the rpc answers null', [{ data: null, error: null }], 'taller');

  pinned('13k. chip: contract first, then type, then type cleared, then school changed', async () => {
    await draw(admin());
    await school('7');
    snap();
    const stages: string[] = [];
    await change($('#contrato-select'), 'ctr-7');
    stages.push(...snap());
    await change($('#hour-type-select'), 'asesoria_directiva');
    stages.push(...snap());
    await change($('#hour-type-select'), 'taller');
    stages.push(...snap());
    await change($('#hour-type-select'), '');
    stages.push(...snap());
    await change($('#hour-type-select'), 'taller');
    await school('9');
    stages.push(...snap());
    return stages;
  });

  // The Spain line and the clock
  pinned('14. Spain line: January, July, a time cleared, the date cleared', async () => {
    await draw(admin());
    snap();
    const stages: string[] = [];
    await change(field('session_date'), '2027-01-15');
    await change(field('end_time'), '10:30');
    stages.push(...snap());
    await change(field('session_date'), '2027-07-15');
    stages.push(...snap());
    await change(field('start_time'), '');
    stages.push(...snap());
    await change(field('start_time'), '09:00');
    await change(field('session_date'), '');
    stages.push(...snap());
    return stages;
  });

  pinned('14b. the earliest date at 22:30 in Chile (already tomorrow in UTC)', async () => {
    vi.setSystemTime(EVENING);
    await draw(admin());
    await click(radioOf('Serie recurrente'));
    await frequency('custom');
    return snap();
  });

  pinned('14c. the earliest date at 08:00 in Chile', async () => {
    vi.setSystemTime(MORNING);
    await draw(admin());
    await click(radioOf('Serie recurrente'));
    await frequency('custom');
    return snap();
  });

  pinned('14d. the earliest date is read again on each render', async () => {
    await draw(admin());
    const first = snap();
    vi.setSystemTime(EVENING);
    await change(field('title'), 'Otra');
    return [...first, ...snap()];
  });

  // Series
  pinned('15a. series on without a date', async () => {
    await draw(admin());
    snap();
    await click(radioOf('Serie recurrente'));
    return snap();
  });

  pinned('15b. series weekly 4 from a Saturday, then a Monday', async () => {
    await draw(admin());
    await change(field('session_date'), '2026-12-05');
    snap();
    await click(radioOf('Serie recurrente'));
    const first = snap();
    await change(field('session_date'), '2026-12-07');
    return [...first, ...snap()];
  });

  pinned('15c. series biweekly', async () => {
    await draw(admin());
    await change(field('session_date'), '2026-12-03');
    await click(radioOf('Serie recurrente'));
    snap();
    await frequency('biweekly');
    return snap();
  });

  pinned('15d. series monthly from 31 January', async () => {
    await draw(admin());
    await change(field('session_date'), '2027-01-31');
    await click(radioOf('Serie recurrente'));
    await frequency('monthly');
    snap();
    await change(countInput(), '3');
    return snap();
  });

  pinned('15e. series count empty, 1, 52 and 53', async () => {
    await draw(admin());
    await change(field('session_date'), '2026-12-01');
    await click(radioOf('Serie recurrente'));
    snap();
    const stages: string[] = [];
    for (const value of ['', '1', '52', '53']) {
      await change(countInput(), value);
      stages.push(...snap());
    }
    return stages;
  });

  pinned('15f. series custom: rows added, filled, duplicated, removed', async () => {
    await draw(admin());
    await change(field('session_date'), '2026-12-01');
    await click(radioOf('Serie recurrente'));
    snap();
    const stages: string[] = [];
    await frequency('custom');
    stages.push(...snap());
    await click(buttonStarting('Agregar fecha'));
    stages.push(...snap());
    await click(buttonStarting('Agregar fecha'));
    await change(customDateInputs()[0], '2026-12-10');
    await change(customDateInputs()[1], '2026-12-05');
    await change(customDateInputs()[2], '2026-12-10');
    stages.push(...snap());
    await click($('button[aria-label="Eliminar fecha"]'));
    stages.push(...snap());
    await click(radioOf('Sesión única'));
    stages.push(...snap());
    await click(radioOf('Serie recurrente'));
    stages.push(...snap());
    return stages;
  });

  pinned('15g. series custom without the main date', async () => {
    await draw(admin());
    await click(radioOf('Serie recurrente'));
    await frequency('custom');
    await change(customDateInputs()[0], '2026-12-10');
    await click(buttonStarting('Agregar fecha'));
    await change(customDateInputs()[1], '2026-12-12');
    return snap();
  });

  // Modality and Zoom
  pinned('16a. modality with the Zoom flag on', async () => {
    await draw(admin());
    await change(field('location'), 'Sala Inventada');
    snap();
    const stages: string[] = [];
    await modality('online');
    stages.push(...snap());
    await click(screen.getByTestId('session-zoom-managed'));
    stages.push(...snap());
    await modality('hibrida');
    stages.push(...snap());
    await click(screen.getByTestId('session-zoom-managed'));
    await change(field('meeting_link'), 'https://zoom.us/j/000000000');
    await change(field('location'), 'Sala Híbrida Inventada');
    stages.push(...snap());
    await click(screen.getByTestId('session-zoom-managed'));
    await modality('presencial');
    stages.push(...snap());
    await modality('online');
    stages.push(...snap());
    return stages;
  });

  pinned('16b. modality with the Zoom flag off', async () => {
    delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
    await draw(admin());
    snap();
    const stages: string[] = [];
    await modality('online');
    stages.push(...snap());
    await modality('hibrida');
    stages.push(...snap());
    return stages;
  });

  pinned('16c. the Zoom flag turned on between renders', async () => {
    delete process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS;
    await draw(admin());
    await modality('online');
    const first = snap();
    process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS = 'true';
    await change(field('title'), 'X');
    return [...first, ...snap()];
  });

  // The meeting provider
  const detect = (name: string, link: string) =>
    pinned(name, async () => {
      await draw(admin());
      await modality('online');
      snap();
      await change(field('meeting_link'), link);
      return snap();
    });
  detect('17a. link detected: zoom.us', 'https://ZOOM.us/j/111');
  detect('17b. link detected: meet.google.com', 'https://meet.google.com/abc-defg-hij');
  detect('17c. link detected: teams.microsoft.com', 'https://teams.microsoft.com/l/meetup-join/x');
  detect('17d. link detected: other', 'https://reunion.example.invalid/sala');

  pinned('17e. provider chosen first is kept; a second link is not re-detected; cleared and typed again', async () => {
    await draw(admin());
    await modality('online');
    snap();
    const stages: string[] = [];
    await change(field('meeting_provider'), 'teams');
    await change(field('meeting_link'), 'https://zoom.us/j/222');
    stages.push(...snap());
    await change(field('meeting_provider'), '');
    stages.push(...snap());
    await change(field('meeting_link'), 'https://meet.google.com/xyz');
    stages.push(...snap());
    await change(field('meeting_link'), '');
    await change(field('meeting_provider'), '');
    await change(field('meeting_link'), 'https://teams.microsoft.com/l/x');
    stages.push(...snap());
    return stages;
  });

  // Submitting
  pinned('18. submitting: both buttons disabled while the POST waits', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': 'pending' } }));
    await fillValid();
    snap();
    await click(draftButton());
    return snap();
  });

  // Validation, one refusal at a time, in today's order
  const validation = (name: string, button: () => HTMLButtonElement | null) =>
    pinned(name, async () => {
      await draw(admin({ confirm: false }));
      snap();
      const stages: string[] = [];
      const press = async () => {
        await click(button());
        stages.push(...snap());
      };
      await press(); // school
      await school('7');
      await press(); // community
      await community('com-7a');
      await press(); // title
      await change(field('title'), '   ');
      await press(); // title of spaces
      await change(field('title'), 'Taller Inventado');
      await press(); // date
      await change(field('session_date'), '2026-12-01');
      await change(field('start_time'), '');
      await press(); // times
      await change(field('start_time'), '09:00');
      await change(field('end_time'), '09:00');
      await press(); // end after start
      await change(field('end_time'), '08:30');
      await press(); // end before start
      await change(field('end_time'), '10:00');
      await modality('online');
      await press(); // link
      await click(screen.getByTestId('session-zoom-managed'));
      await modality('hibrida');
      await press(); // location (the managed box still ticked)
      await change(field('location'), 'Sala Inventada');
      await press(); // facilitator
      await addConsultant('u-c1');
      await addConsultant('u-c2');
      await click(removeButton('Ana Inventada'));
      await press(); // exactly one lead
      await click(leadBox('Bruno Ficticio'));
      await click(radioOf('Serie recurrente'));
      await frequency('custom');
      await change(customDateInputs()[0], '2026-12-08');
      await press(); // two custom dates
      await click(buttonStarting('Agregar fecha'));
      await change(customDateInputs()[1], '2026-12-15');
      await frequency('weekly');
      await change(countInput(), '1');
      await press(); // count 1
      await change(countInput(), '53');
      await press(); // count 53
      await change(countInput(), '');
      await press(); // count NaN passes the check
      return stages;
    });
  validation('19a. the checks one by one through «Guardar borrador»', draftButton);
  validation('19b. the checks one by one through «Programar sesión» (confirm answered no)', scheduleButton);

  pinned('20a. confirm for a single session answered no, then yes', async () => {
    await draw(admin({ confirm: false }));
    await fillValid();
    snap();
    await click(scheduleButton());
    const first = snap();
    S().confirm = true;
    await click(scheduleButton());
    return [...first, ...snap()];
  });

  pinned('20b. confirm for a series answered no', async () => {
    await draw(admin({ confirm: false }));
    await fillValid();
    await click(radioOf('Serie recurrente'));
    snap();
    await click(scheduleButton());
    return snap();
  });

  // Drafts
  pinned('21a. draft single, the plainest form: body, toast, detail page', async () => {
    await draw(admin());
    await fillValid();
    snap();
    await click(draftButton());
    return snap();
  });

  pinned('21b. draft single with everything filled, answered with a sessions list', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { body: { data: { sessions: [{ id: 'ses-lista-1' }, { id: 'ses-lista-2' }] } } } } }));
    await school('7');
    await community('com-7b');
    await change(field('title'), '  Taller Inventado Completo  ');
    await change(field('description'), '  Una descripción inventada  ');
    await change(field('objectives'), '   ');
    await change(field('session_date'), '2026-12-02');
    await change(field('start_time'), '14:15');
    await change(field('end_time'), '16:45');
    await addConsultant('u-c2');
    await addConsultant('u-c3');
    await click(roleButton('Carla Supuesta'));
    await change($('#hour-type-select'), 'taller');
    await change($('#contrato-select'), 'ctr-7');
    await modality('hibrida');
    await change(field('meeting_link'), 'https://meet.google.com/inv-ent-ado');
    await change(field('location'), 'Sala Inventada 2');
    snap();
    await click(draftButton());
    return snap();
  });

  pinned('21c. draft single, Zoom-managed online', async () => {
    await draw(admin());
    await fillValid();
    await modality('online');
    await click(screen.getByTestId('session-zoom-managed'));
    snap();
    await click(draftButton());
    return snap();
  });

  pinned('22a. draft series weekly: recurrence in the body, the server count in the toast', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { body: { data: { sessions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } } } }));
    await fillValid();
    await click(radioOf('Serie recurrente'));
    snap();
    await click(draftButton());
    return snap();
  });

  pinned('22b. draft series custom, answered without a sessions list', async () => {
    await draw(admin());
    await fillValid();
    await click(radioOf('Serie recurrente'));
    await frequency('custom');
    await change(customDateInputs()[0], '2026-12-08');
    await click(buttonStarting('Agregar fecha'));
    await change(customDateInputs()[1], '2026-12-15');
    await click(buttonStarting('Agregar fecha'));
    snap();
    await click(draftButton());
    return snap();
  });

  pinned('22c. draft series with the count empty (NaN)', async () => {
    await draw(admin());
    await fillValid();
    await click(radioOf('Serie recurrente'));
    await change(countInput(), '');
    snap();
    await click(draftButton());
    return snap();
  });

  pinned('22d. draft series at the edges of the count: 2 and 52 accepted', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { body: { data: { sessions: [{ id: 'a' }] } } } } }));
    await fillValid();
    await click(radioOf('Serie recurrente'));
    await change(countInput(), '2');
    snap();
    await click(draftButton());
    const first = snap();
    view.unmount();
    await draw(admin());
    await fillValid();
    await click(radioOf('Serie recurrente'));
    await change(countInput(), '52');
    snap();
    await click(draftButton());
    return [...first, ...snap()];
  });

  pinned('23. draft failures: error text, none, rejected, no token', async () => {
    await draw(
      admin({
        fetch: {
          'POST /api/sessions': [
            { status: 400, body: { error: 'Rechazo inventado del servidor' } },
            { status: 500, body: {} },
            'reject',
            { body: { data: { session: { id: 'never' } } } },
          ],
        },
      })
    );
    await fillValid();
    snap();
    const stages: string[] = [];
    await click(draftButton());
    stages.push(...snap());
    await click(draftButton());
    stages.push(...snap());
    await click(draftButton());
    stages.push(...snap());
    S().session = NO_TOKEN;
    await click(draftButton());
    stages.push(...snap());
    return stages;
  });

  // Scheduling
  pinned('24a. schedule single: create, approve, detail page', async () => {
    await draw(admin());
    await fillValid();
    snap();
    await click(scheduleButton());
    return snap();
  });

  pinned('24b. schedule single: approve fails with and without a text; create fails; no token', async () => {
    await draw(
      admin({
        fetch: {
          'POST /api/sessions/ses-inventada-1/approve': [
            { status: 409, body: { error: 'Conflicto inventado' } },
            { status: 500, body: {} },
          ],
        },
      })
    );
    await fillValid();
    snap();
    const stages: string[] = [];
    await click(scheduleButton());
    stages.push(...snap());
    await click(scheduleButton());
    stages.push(...snap());
    S().fetch!['POST /api/sessions'] = { status: 400, body: {} };
    await click(scheduleButton());
    stages.push(...snap());
    S().session = NO_TOKEN;
    await click(scheduleButton());
    stages.push(...snap());
    return stages;
  });

  pinned('25a. schedule series with a recurrence group: bulk approve', async () => {
    await draw(
      admin({
        fetch: {
          'POST /api/sessions': {
            body: { data: { recurrence_group_id: 'grp-inventado', sessions: [{ id: 's1' }, { id: 's2' }] } },
          },
        },
      })
    );
    await fillValid();
    await click(radioOf('Serie recurrente'));
    snap();
    await click(scheduleButton());
    return snap();
  });

  pinned('25b. schedule series without a recurrence group: the first session approved', async () => {
    await draw(admin({ fetch: { 'POST /api/sessions': { body: { data: { sessions: [{ id: 's-primera' }, { id: 's2' }] } } } } }));
    await fillValid();
    await click(radioOf('Serie recurrente'));
    snap();
    await click(scheduleButton());
    return snap();
  });

  pinned('25c. schedule series: bulk approve fails, with and without a text', async () => {
    await draw(
      admin({
        fetch: {
          'POST /api/sessions': { body: { data: { recurrence_group_id: 'grp-inventado', sessions: [{ id: 's1' }] } } },
          'POST /api/sessions/bulk-approve': [{ status: 400, body: { error: 'Serie rechazada' } }, { status: 500, body: {} }],
        },
      })
    );
    await fillValid();
    await click(radioOf('Serie recurrente'));
    snap();
    await click(scheduleButton());
    const first = snap();
    await click(scheduleButton());
    return [...first, ...snap()];
  });

  // The rest
  pinned('26. «Reintentar» after a failing consultants read', async () => {
    await draw(admin({ fetch: { 'GET /api/admin/consultants?school_id=7': [{ status: 500, body: { error: 'Caída inventada' } }, { body: { data: { consultants: CONSULTANTS } } }] } }));
    await school('7');
    snap();
    await click(buttonStarting('Reintentar'));
    return snap();
  });

  pinned('27. the layout marker: sign-out', async () => {
    await draw(admin());
    snap();
    await call(() => mocks.props.MainLayout.onLogout());
    return snap();
  });

  pinned('28. a router that is a new object on every render (as the older tests fake it)', async () => {
    mocks.freshRouter = true;
    await draw(admin());
    const first = snap();
    await school('7');
    const second = snap();
    await change(field('title'), 'T');
    return [...first, ...second, ...snap()];
  });

  // ── Added in send-back 1 (the review's finding 6), produced by today's page. ──

  pinned('29. the page component’s hooks, in order (a hook added, removed or moved changes this)', async () => {
    await draw(admin());
    return [hookSignature(view.container, SessionCreatePage), ...snap()];
  });
});

digestsFileHolds(78);

// ── Release SX: the three approved behaviour changes, as plain behaviour tests (not digests). ──
//
// The pin above cannot see them: a select's value and a checkbox's later ticks are DOM properties,
// not attributes. These read the properties, the toasts and the request bodies from the fakes' log.

describe('SX: the three approved behaviour changes of the form', () => {
  type Entry = Record<string, any>;
  const entries = () => (mocks.log as unknown[]).filter((e): e is Entry => Boolean(e) && typeof e === 'object');
  const sessionPosts = () =>
    entries()
      .filter((e) => e.fetch === '/api/sessions' && e.method === 'POST')
      .map((e) => JSON.parse(e.body as string));
  const toastErrors = () => entries().filter((e) => 'toast.error' in e).map((e) => e['toast.error']);
  const confirmsAsked = () => entries().filter((e) => 'confirm' in e);
  const communityValue = () => (field('growth_community_id') as HTMLSelectElement).value;
  const communityOptions = () =>
    Array.from((field('growth_community_id') as HTMLSelectElement).options).map((o) => o.value);
  const isLead = (name: string) => (leadBox(name) as HTMLInputElement | null)?.checked;
  const leads = (body: any) => (body.facilitators as any[]).filter((f) => f.is_lead).map((f) => f.user_id);

  /** Title, date and place: everything the checks insist on besides school, community and consultants. */
  async function fillTitleDatePlace() {
    await change(field('title'), 'Taller Inventado de Prueba');
    await change(field('session_date'), '2026-12-01');
    await change(field('location'), 'Sala Inventada 1');
  }

  describe('a school change clears the chosen community', () => {
    it('N1a. school 7 with com-7b, then school 9: «Guardar borrador» is refused with the community message, nothing sent', async () => {
      await draw(admin());
      await school('7');
      await community('com-7b');
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      await school('9');
      await addConsultant('u-c1');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe seleccionar una comunidad de crecimiento']);
      expect(sessionPosts()).toEqual([]);
    });

    it('N1b. the same through «Programar sesión»: refused with the community message, no question asked', async () => {
      await draw(admin({ confirm: false }));
      await school('7');
      await community('com-7b');
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      await school('9');
      await addConsultant('u-c1');
      mocks.log = [];
      await click(scheduleButton());
      expect(toastErrors()).toEqual(['Debe seleccionar una comunidad de crecimiento']);
      expect(confirmsAsked()).toEqual([]);
      expect(sessionPosts()).toEqual([]);
    });

    it("N2. after the change, the new school's community is sent with the new school", async () => {
      await draw(admin());
      await school('7');
      await community('com-7b');
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      await school('9');
      await addConsultant('u-c1');
      await community('com-9a');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual([]);
      const posts = sessionPosts();
      expect(posts).toHaveLength(1);
      expect(posts[0].school_id).toBe(9);
      expect(posts[0].growth_community_id).toBe('com-9a');
    });

    it('N3. school 7 with com-7b, school 9, school 7 again: no community chosen, and a submit asks for one', async () => {
      await draw(admin());
      await school('7');
      await community('com-7b');
      await school('9');
      await school('7');
      expect(communityValue()).toBe('');
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe seleccionar una comunidad de crecimiento']);
      expect(sessionPosts()).toEqual([]);
    });

    it('N4. school 7 with com-7a, «Seleccione un colegio», school 7 again: no community chosen, and a submit asks for one', async () => {
      await draw(admin());
      await school('7');
      await community('com-7a');
      await school('0');
      await school('7');
      expect(communityValue()).toBe('');
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe seleccionar una comunidad de crecimiento']);
      expect(sessionPosts()).toEqual([]);
    });

    it("N5. the new school's communities still loading: the community is cleared at once; the old list stays as today", async () => {
      await draw(admin({ tables: { growth_communities: [{ data: COMMUNITIES[7], error: null }, 'pending'] } }));
      await school('7');
      await community('com-7b');
      await school('9');
      expect(communityValue()).toBe('');
      // The list while the new school's read is pending is not part of the change (it stays as today).
      expect(communityOptions()).toEqual(['', 'com-7a', 'com-7b']);
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe seleccionar una comunidad de crecimiento']);
      expect(sessionPosts()).toEqual([]);
    });

    it('N6. the same school chosen again keeps the community (the browser sends no change for an equal value)', async () => {
      await draw(admin());
      await school('7');
      await community('com-7b');
      await school('7');
      expect(communityValue()).toBe('com-7b');
      await fillTitleDatePlace();
      await addConsultant('u-c1');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual([]);
      expect(sessionPosts().map((p) => p.growth_community_id)).toEqual(['com-7b']);
    });

    it('N7. the rest of a school change stays: the three reads in order, facilitators emptied, contract reset, hour type kept', async () => {
      await draw(admin());
      await school('7');
      await community('com-7b');
      await addConsultant('u-c1');
      await change($('#hour-type-select'), 'taller');
      await change($('#contrato-select'), 'ctr-7');
      mocks.log = [];
      await school('9');
      const begun = (mocks.log as unknown[])
        .map((e: any) => {
          if (e === 'auth.getSession') return 'auth.getSession';
          if (e && typeof e === 'object' && 'supabase.from' in e) return `from ${e['supabase.from']}`;
          if (e && typeof e === 'object' && 'fetch' in e) return `fetch ${e.fetch}`;
          return null;
        })
        .filter(Boolean);
      expect(begun.slice(0, 4)).toEqual([
        'from growth_communities',
        'auth.getSession',
        'from contratos',
        'fetch /api/admin/consultants?school_id=9',
      ]);
      expect(removeButton('Ana Inventada')).toBeNull();
      expect(($('#contrato-select') as HTMLSelectElement).value).toBe('');
      expect(($('#hour-type-select') as HTMLSelectElement).value).toBe('taller');
    });
  });

  describe("one lead consultant: today's rule, unchanged (lead's decision B)", () => {
    async function schoolWithCommunity() {
      await draw(admin());
      await school('7');
      await community('com-7a');
      await fillTitleDatePlace();
    }

    it('N8. two consultants, the lead removed: the other is not made lead, a third added is not lead, and the save is refused', async () => {
      await schoolWithCommunity();
      await addConsultant('u-c1');
      await addConsultant('u-c2');
      expect(isLead('Ana Inventada')).toBe(true);
      expect(isLead('Bruno Ficticio')).toBe(false);
      await click(removeButton('Ana Inventada'));
      expect(isLead('Bruno Ficticio')).toBe(false);
      await addConsultant('u-c3');
      expect(isLead('Carla Supuesta')).toBe(false);
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe haber exactamente un facilitador principal']);
      expect(sessionPosts()).toEqual([]);
    });

    it('N9. three consultants, the middle one ticked as lead and removed: nobody is lead and the save is refused', async () => {
      await schoolWithCommunity();
      await addConsultant('u-c1');
      await addConsultant('u-c2');
      await addConsultant('u-c3');
      await click(leadBox('Bruno Ficticio'));
      expect([isLead('Ana Inventada'), isLead('Bruno Ficticio'), isLead('Carla Supuesta')]).toEqual([false, true, false]);
      await click(removeButton('Bruno Ficticio'));
      expect([isLead('Ana Inventada'), isLead('Carla Supuesta')]).toEqual([false, false]);
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe haber exactamente un facilitador principal']);
      expect(sessionPosts()).toEqual([]);
    });

    it('N10. three consultants, a non-lead removed: the lead stays the only lead; the role toggle leaves is_lead alone', async () => {
      await schoolWithCommunity();
      await addConsultant('u-c1');
      await addConsultant('u-c2');
      await addConsultant('u-c3');
      await click(removeButton('Carla Supuesta'));
      await click(roleButton('Bruno Ficticio'));
      expect([isLead('Ana Inventada'), isLead('Bruno Ficticio')]).toEqual([true, false]);
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual([]);
      const [body] = sessionPosts();
      expect(body.facilitators).toEqual([
        { user_id: 'u-c1', facilitator_role: 'consultor_externo', is_lead: true },
        { user_id: 'u-c2', facilitator_role: 'equipo_interno', is_lead: false },
      ]);
    });

    it('N11. the only consultant removed: the list is empty and the save asks for a facilitator', async () => {
      await schoolWithCommunity();
      await addConsultant('u-c1');
      await click(removeButton('Ana Inventada'));
      expect(removeButton('Ana Inventada')).toBeNull();
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual(['Debe asignar al menos un facilitador a la sesión']);
      expect(sessionPosts()).toEqual([]);
    });

    it("N12. all removed, one added: it is lead; its own box keeps it lead; ticking another moves the lead (exactly one)", async () => {
      await schoolWithCommunity();
      await addConsultant('u-c1');
      await addConsultant('u-c2');
      await click(removeButton('Ana Inventada'));
      await click(removeButton('Bruno Ficticio'));
      await addConsultant('u-c3');
      expect(isLead('Carla Supuesta')).toBe(true);
      await click(leadBox('Carla Supuesta'));
      expect(isLead('Carla Supuesta')).toBe(true);
      await addConsultant('u-c1');
      expect([isLead('Carla Supuesta'), isLead('Ana Inventada')]).toEqual([true, false]);
      await click(leadBox('Ana Inventada'));
      expect([isLead('Carla Supuesta'), isLead('Ana Inventada')]).toEqual([false, true]);
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual([]);
      const [body] = sessionPosts();
      expect(leads(body)).toEqual(['u-c1']);
    });
  });

  describe('the earliest date offered is today in Chile (process zone UTC)', () => {
    /** The `min` of the main date field and of both custom-date rows, drawn at an instant. */
    async function earliestAt(instant: string) {
      vi.setSystemTime(new Date(instant));
      await draw(admin());
      await click(radioOf('Serie recurrente'));
      await frequency('custom');
      await click(buttonStarting('Agregar fecha'));
      const rows = customDateInputs();
      expect(rows).toHaveLength(2);
      return [field('session_date'), ...rows].map((input) => input?.getAttribute('min'));
    }

    it.each([
      // N14: summer, 22:30 in Chile, already the 20th in UTC.
      ['N14', '2026-11-20T01:30:00Z', '2026-11-19'],
      // N15: the last minute of the day in Chile, and midnight.
      ['N15', '2026-11-20T02:59:00Z', '2026-11-19'],
      ['N15', '2026-11-20T03:00:00Z', '2026-11-20'],
      // N16: 20:59 and 21:00 in Chile (the UTC date turns at 21:00 in summer).
      ['N16', '2026-11-19T23:59:00Z', '2026-11-19'],
      ['N16', '2026-11-20T00:00:00Z', '2026-11-19'],
      // N17: winter (UTC-4).
      ['N17', '2027-07-15T00:30:00Z', '2027-07-14'],
      ['N17', '2027-07-15T03:59:00Z', '2027-07-14'],
      ['N17', '2027-07-15T04:00:00Z', '2027-07-15'],
      // N18: summer time starts (00:00 becomes 01:00 on Sunday 6 Sep 2026) ...
      ['N18', '2026-09-06T03:59:00Z', '2026-09-05'],
      ['N18', '2026-09-06T04:00:00Z', '2026-09-06'],
      // ... and ends (00:00 becomes 23:00 on the night of Saturday 3 Apr 2027).
      ['N18', '2027-04-04T02:59:00Z', '2027-04-03'],
      ['N18', '2027-04-04T03:30:00Z', '2027-04-03'],
      ['N18', '2027-04-04T04:00:00Z', '2027-04-04'],
    ])('%s. at %s the main field and both custom rows offer %s first', async (_case, instant, expected) => {
      expect(await earliestAt(instant)).toEqual([expected, expected, expected]);
    });

    it('N19. the page left open across midnight in Chile: the next render offers the new day', async () => {
      expect(await earliestAt('2026-11-20T02:58:00Z')).toEqual(['2026-11-19', '2026-11-19', '2026-11-19']);
      vi.setSystemTime(new Date('2026-11-20T03:01:00Z'));
      await change(field('title'), 'Otra');
      const mins = [field('session_date'), ...customDateInputs()].map((input) => input?.getAttribute('min'));
      expect(mins).toEqual(['2026-11-20', '2026-11-20', '2026-11-20']);
    });

    it('N20. a typed date goes to the save as typed', async () => {
      await draw(admin());
      await school('7');
      await community('com-7a');
      await change(field('title'), 'Taller Inventado de Prueba');
      await change(field('session_date'), '2026-11-18');
      await addConsultant('u-c1');
      await change(field('location'), 'Sala Inventada 1');
      await click(radioOf('Serie recurrente'));
      await frequency('custom');
      await change(customDateInputs()[0], '2026-11-18');
      await click(buttonStarting('Agregar fecha'));
      await change(customDateInputs()[1], '2026-11-25');
      mocks.log = [];
      await click(draftButton());
      expect(toastErrors()).toEqual([]);
      const [body] = sessionPosts();
      expect(body.session_date).toBe('2026-11-18');
      expect(body.recurrence.dates).toEqual(['2026-11-18', '2026-11-25']);
    });
  });
});
