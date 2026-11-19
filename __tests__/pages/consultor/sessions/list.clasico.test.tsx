// @vitest-environment jsdom
/**
 * Redesign 6S, release SA, step 0: today's consultor sessions list («Mis Sesiones»,
 * `pages/consultor/sessions/index.tsx`) pinned BEFORE its data code moves into a hook and its
 * markup into the classic view.
 *
 * Each case renders the page's default export with everything outside the page replaced by fakes
 * this file controls, and keeps ONE digest (through `makePin`) of two things together: (a) the
 * rendered markup, serialised as Vitest serialises a snapshot, and (b) the ordered log of what the
 * page asked for (every `auth.*` call, the role helper, every Supabase read with its table, columns
 * and filters, every `fetch` with its address and options, every router push and replace, every
 * toast, and the error lines the page writes to the console), from the first render to the settled
 * screen and after each action of a behaviour case. The digests live in
 * `list.clasico.digests.json`, produced by the page as it was before the move.
 *
 * To see a case's text set SES_LIST_CLASICO_SHOW to its name (or `all`) and SES_LIST_CLASICO_OUT to
 * a scratch folder; to accept a change ON PURPOSE set SES_LIST_CLASICO_ACCEPT the same way.
 *
 * The pin does not depend on the machine: the time zone is fixed to America/Santiago below before
 * any date is made (the first test fails by name if it did not take), and the clock is fixed per
 * case with `vi.setSystemTime`. Every person, school and address below is invented.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../../helpers/pin';

vi.hoisted(() => {
  process.env.TZ = 'America/Santiago';
});

const HERE = dirname(fileURLToPath(import.meta.url));
const { pinned, digestsFileHolds } = makePin(join(HERE, 'list.clasico.digests.json'), 'SES_LIST_CLASICO');

// ── The fakes. ──

type Answer = { status?: number; body?: unknown } | 'reject' | 'pending';

interface Scenario {
  ready?: boolean;
  query?: Record<string, string>;
  /** What `auth.getSession` answers, consumed in order; the last one stays. */
  sessions: (unknown | 'pending')[];
  role?: string | 'throw' | 'pending';
  /** By address; an array is consumed in order and its last answer stays. */
  fetch?: Record<string, Answer | Answer[]>;
  /** Answers of the ledger read, consumed in order. */
  ledger?: { data: unknown; error?: unknown }[];
}

const mocks = vi.hoisted(() => ({
  scenario: null as any,
  log: [] as unknown[],
  props: {} as Record<string, any>,
  router: {} as any,
}));

function log(entry: unknown) {
  mocks.log.push(entry);
}
const S = (): Scenario => mocks.scenario as Scenario;

function isElement(value: unknown): value is { type: any; props: Record<string, unknown> } {
  return React.isValidElement(value);
}
function typeName(type: any): string {
  if (typeof type === 'string') return type;
  return type?.displayName || type?.name || type?.render?.displayName || type?.render?.name || '«component»';
}

/** Props as text: functions, elements and `undefined` are named, so they differ from texts and null. */
function describeProps(props: Record<string, unknown>): string {
  const rest = { ...props };
  delete rest.children;
  return JSON.stringify(rest, (_key, value) => {
    if (value === undefined) return '«undefined»';
    if (typeof value === 'function') return '«function»';
    if (isElement(value)) return { element: typeName(value.type), props: { ...value.props, children: undefined } };
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

function resetRouter(s: Scenario) {
  mocks.router = {
    isReady: s.ready ?? true,
    query: { ...(s.query ?? {}) },
    pathname: '/consultor/sessions',
    asPath: '/consultor/sessions',
    push: vi.fn((...args: unknown[]) => {
      log({ 'router.push': args });
      return Promise.resolve(true);
    }),
    replace: vi.fn((...args: unknown[]) => {
      log({ 'router.replace': args });
      return Promise.resolve(true);
    }),
    prefetch: vi.fn(() => Promise.resolve()),
    events: { on: () => {}, off: () => {} },
  };
}

/** A Supabase query: every filter is written down; `.then` (as the page awaits it) logs and answers. */
function query(table: string): any {
  const ops: unknown[] = [];
  const answer = () => {
    log({ supabase: table, ops });
    const next = S().ledger?.shift();
    return next ?? { data: [], error: null };
  };
  const q: any = {};
  for (const method of ['select', 'eq', 'in', 'order', 'neq', 'is', 'limit', 'match', 'filter', 'or', 'gte', 'lte']) {
    q[method] = (...args: unknown[]) => {
      ops.push([method, ...args]);
      return q;
    };
  }
  q.single = () => {
    ops.push(['single']);
    return Promise.resolve(answer());
  };
  q.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(answer()).then(resolve, reject);
  return q;
}

const client: any = {
  auth: {
    getSession: vi.fn((...args: unknown[]) => {
      log(args.length === 0 ? 'auth.getSession' : { 'auth.getSession': args });
      const list = S().sessions;
      const next = list.length > 1 ? list.shift() : list[0];
      if (next === 'pending') return new Promise(() => {});
      return Promise.resolve({ data: { session: next ?? null }, error: null });
    }),
    signOut: vi.fn((...args: unknown[]) => {
      log(args.length === 0 ? 'auth.signOut' : { 'auth.signOut': args });
      return Promise.resolve({ error: null });
    }),
  },
  from: vi.fn((table: string, ...rest: unknown[]) => {
    if (rest.length > 0) log({ 'from with more': rest });
    return query(table);
  }),
};

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => client,
  useSession: () => {
    log('unexpected useSession');
    return null;
  },
}));
vi.mock('@/utils/roleUtils', () => ({
  getUserPrimaryRole: vi.fn((userId: string, ...rest: unknown[]) => {
    log(rest.length === 0 ? { getUserPrimaryRole: userId } : { getUserPrimaryRole: userId, rest });
    const role = S().role;
    if (role === 'throw') return Promise.reject(new Error('Synthetic role failure'));
    if (role === 'pending') return new Promise(() => {});
    return Promise.resolve(role ?? null);
  }),
}));
vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn((...args: unknown[]) => log({ 'toast.error': args })),
    success: vi.fn((...args: unknown[]) => log({ 'toast.success': args })),
  },
}));
vi.mock('@/components/layout/MainLayout', () => ({ default: marker('MainLayout', true) }));
vi.mock('@/components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: marker('ResponsiveFunctionalPageHeader', true),
}));
vi.mock('@/components/tutorials/HelpButton', () => ({ default: marker('HelpButton') }));

import ConsultorSessionsPage from '@/pages/consultor/sessions/index';

// ── The fetch fake: answers by address, can fail or stay pending, writes each call down. ──

function describeInit(init: unknown): unknown {
  if (init === undefined) return '«none»';
  return JSON.parse(describeProps({ init: init as Record<string, unknown> })).init;
}

function fakeFetch(url: string, ...args: unknown[]) {
  const entry: Record<string, unknown> = { fetch: url, init: describeInit(args[0]) };
  if (args.length > 1) entry.more = describeProps({ args: args.slice(1) });
  log(entry);
  const table = S().fetch ?? {};
  let answer: Answer | Answer[] | undefined = table[url];
  if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
  const given: Answer = answer ?? { status: 200, body: { data: { sessions: [], total: 0 } } };
  if (given === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (given === 'pending') return new Promise(() => {});
  const status = given.status ?? 200;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(given.body),
  });
}

// ── Invented data. ──

// 09:00 in Santiago (summer time, UTC-3), Thursday 19 November 2026.
const NOW = new Date('2026-11-19T12:00:00Z');
const ME = 'consultor-inventado';
const OTHER = 'otra-consultora-inventada';

const authFor = (id: string) => ({ access_token: `synthetic-token-${id}`, user: { id, email: `${id}@example.invalid` } });

let rowCount = 0;
function row(over: Record<string, unknown> = {}) {
  rowCount += 1;
  return {
    id: `ses-${rowCount}`,
    title: `Sesión Inventada ${rowCount}`,
    session_date: '2026-11-25',
    start_time: '10:00:00',
    end_time: '11:30:00',
    modality: 'presencial',
    status: 'programada',
    school_id: 1,
    schools: { name: 'Colegio Inventado Norte' },
    growth_communities: { name: 'Comunidad Inventada A' },
    session_facilitators: [{ user_id: ME }],
    recurrence_group_id: null,
    session_number: null,
    ...over,
  };
}

const page = (sessions: unknown[], total = sessions.length) => ({ body: { data: { sessions, total } } });
const FIRST = '/api/sessions?page=1&limit=20';
const SECOND = '/api/sessions?page=2&limit=20';

function consultor(over: Partial<Scenario> = {}): Scenario {
  return { sessions: [authFor(ME)], role: 'consultor', ...over };
}

function richRows() {
  rowCount = 0;
  return [
    row({ title: 'Mía Programada Presencial', session_date: '2026-11-25', status: 'programada' }),
    row({ title: 'Mía Borrador Online', session_date: '2026-11-25', status: 'borrador', modality: 'online', school_id: 2, schools: { name: 'Colegio Inventado Austral' } }),
    row({ title: 'Mía Serie Número Tres', session_date: '2026-11-20', status: 'pendiente_aprobacion', modality: 'hibrida', recurrence_group_id: 'grupo-1', session_number: 3 }),
    row({ title: 'Mía Serie Sin Número', session_date: '2026-11-20', status: 'en_progreso', modality: 'remota_desconocida', recurrence_group_id: 'grupo-2', session_number: null }),
    row({ title: 'Mía Serie Número Cero', session_date: '2026-11-10', status: 'pendiente_informe', recurrence_group_id: 'grupo-3', session_number: 0 }),
    row({ title: 'Otra Completada', session_date: '2026-11-10', status: 'completada', session_facilitators: [{ user_id: OTHER }], schools: null, growth_communities: null }),
    row({ title: 'Otra Pendiente Informe', session_date: '2026-11-05', status: 'pendiente_informe', session_facilitators: [{ user_id: OTHER }], school_id: 3, schools: null }),
    row({ title: 'Otra Programada Colegio Norte', session_date: '2026-11-05', status: 'programada', session_facilitators: [], school_id: 1 }),
  ];
}

// ── Drawing. ──

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let view: ReturnType<typeof render>;
async function draw(scenario: Scenario) {
  mocks.scenario = scenario;
  resetRouter(scenario);
  view = render(<ConsultorSessionsPage />);
  await settle();
}
/** The markup and the log since the last stage. */
function stage(): string[] {
  const text = [serialise(view.asFragment()), serialise(mocks.log)];
  mocks.log = [];
  return text;
}
async function act_(fn: () => unknown) {
  await act(async () => {
    await fn();
  });
  await settle();
}
const selects = () => Array.from(view.container.querySelectorAll('select'));
const dates = () => Array.from(view.container.querySelectorAll('input[type="date"]'));
async function change(element: Element, value: string) {
  fireEvent.change(element, { target: { value } });
  await settle();
}
async function click(element: Element | null) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}
const button = (text: string) => screen.getByText(text).closest('button');

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.log = [];
  mocks.props = {};
  rowCount = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown, ...rest: unknown[]) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) {
      const second = rest[0];
      log({ 'console.error': first, given: second instanceof Error ? second.message : typeof second });
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  consoleError?.mockRestore();
  consoleError = null;
});

describe('the machine does not reach the pin', () => {
  it('the time zone fixed at the top of this file took (America/Santiago)', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = new Date('2026-11-19T12:00:00Z').getHours();
    if (zone !== 'America/Santiago' || hour !== 9) {
      throw new Error(
        `The time zone of this test process is ${zone} (12:00Z is ${hour}h), not America/Santiago: ` +
          'process.env.TZ set in vi.hoisted holds only while Vitest runs each file in a child process (threads: false).'
      );
    }
  });
});

describe("today's consultor sessions list (pinned before SA)", () => {
  // ── PIN CASES ──

  pinned('L01. router not ready: loading, nothing asked', async () => {
    await draw(consultor({ ready: false }));
    expect(screen.getByText('Cargando...')).toBeTruthy();
    return stage();
  });

  pinned('L02. ready, getSession pending: still loading', async () => {
    await draw(consultor({ sessions: ['pending'] }));
    return stage();
  });

  pinned('L03. no session: push to /login, then the empty page', async () => {
    await draw(consultor({ sessions: [null] }));
    return stage();
  });

  pinned('L03b. a session without a user: push to /login', async () => {
    await draw(consultor({ sessions: [{ access_token: 'synthetic-token-x' }] }));
    return stage();
  });

  pinned('L04. role docente: push to /dashboard, empty page, no fetch', async () => {
    await draw(consultor({ role: 'docente' }));
    return stage();
  });

  pinned('L04b. role lider_comunidad: push to /dashboard (the list does not admit it)', async () => {
    await draw(consultor({ role: 'lider_comunidad' }));
    return stage();
  });

  pinned('L04c. role helper pending: loading stays', async () => {
    await draw(consultor({ role: 'pending' }));
    return stage();
  });

  pinned('L05. role helper throws: push to /login', async () => {
    await draw(consultor({ role: 'throw' }));
    return stage();
  });

  pinned('L06. consultor, API answers no sessions', async () => {
    await draw(consultor({ fetch: { [FIRST]: page([], 0) } }));
    return stage();
  });

  pinned('L06b. consultor, API answers without data (fallbacks to [] and 0)', async () => {
    await draw(consultor({ fetch: { [FIRST]: { body: {} } } }));
    return stage();
  });

  pinned('L06c. consultor, sessions fetch pending: the empty page drawn', async () => {
    await draw(consultor({ fetch: { [FIRST]: 'pending' } }));
    return stage();
  });

  pinned('L07. consultor, rich first page: both columns, statuses, modalities, series, schools, load more', async () => {
    await draw(consultor({ fetch: { [FIRST]: page(richRows(), 25) } }));
    return stage();
  });

  pinned('L08. cancelled rows: ledger penalizada, devuelta by admin, reservada ignored, no entry', async () => {
    rowCount = 0;
    const rows = [
      row({ title: 'Cancelada Penalizada', status: 'cancelada' }),
      row({ title: 'Cancelada Devuelta Admin', status: 'cancelada', session_facilitators: [{ user_id: OTHER }] }),
      row({ title: 'Cancelada Reservada', status: 'cancelada' }),
      row({ title: 'Cancelada Sin Registro', status: 'cancelada', session_date: '2026-11-30' }),
      row({ title: 'Programada Normal' }),
      row({ title: 'Cancelada Devuelta Sin Marca', status: 'cancelada', session_date: '2026-11-30' }),
    ];
    await draw(
      consultor({
        fetch: { [FIRST]: page(rows) },
        ledger: [
          {
            data: [
              { session_id: 'ses-1', status: 'penalizada', admin_override: false },
              { session_id: 'ses-2', status: 'devuelta', admin_override: true },
              { session_id: 'ses-3', status: 'reservada', admin_override: false },
              { session_id: 'ses-6', status: 'devuelta', admin_override: null },
              { session_id: null, status: 'penalizada', admin_override: false },
            ],
            error: null,
          },
        ],
      })
    );
    return stage();
  });

  pinned('L08b. cancelled rows, the ledger answers data null (map unchanged)', async () => {
    rowCount = 0;
    const rows = [row({ title: 'Cancelada A', status: 'cancelada' }), row({ title: 'Programada B' })];
    await draw(consultor({ fetch: { [FIRST]: page(rows) }, ledger: [{ data: null, error: { message: 'synthetic' } }] }));
    return stage();
  });

  const countdown = (name: string, rows: () => unknown[]) =>
    pinned(name, async () => {
      rowCount = 0;
      await draw(consultor({ fetch: { [FIRST]: page(rows()) } }));
      return [screen.getByText('Próxima Sesión').parentElement!.outerHTML, ...stage()];
    });

  countdown('L09a. countdown: next start in 30 minutes («Hoy»)', () => [
    row({ session_date: '2026-11-19', start_time: '09:30:00' }),
    row({ session_date: '2026-11-22' }),
  ]);
  countdown('L09b. countdown: today five hours ahead («Hoy a las»)', () => [row({ session_date: '2026-11-19', start_time: '14:00:00' })]);
  countdown('L09c. countdown: tomorrow twenty hours ahead (still «Hoy a las»)', () => [row({ session_date: '2026-11-20', start_time: '05:00:00' })]);
  countdown('L09d. countdown: thirty hours ahead («Mañana»)', () => [row({ session_date: '2026-11-20', start_time: '15:00:00' })]);
  countdown('L09e. countdown: five days ahead («En 5 días»)', () => [row({ session_date: '2026-11-24', start_time: '10:00:00' })]);
  countdown('L09f. countdown: only past or completed rows («Sin sesiones próximas»)', () => [
    row({ session_date: '2026-11-18' }),
    row({ session_date: '2026-11-25', status: 'completada' }),
    row({ session_date: '2026-11-26', status: 'pendiente_informe' }),
  ]);
  countdown('L09g. countdown: a future en_progreso row counts, earliest first', () => [
    row({ session_date: '2026-11-28', status: 'programada' }),
    row({ session_date: '2026-11-21', start_time: '08:00', status: 'en_progreso' }),
    row({ session_date: '2026-11-19', start_time: '08:00:00', status: 'programada' }),
  ]);

  pinned('L10. admin: allowed, facilitates nothing: left column empty, all rows dimmed', async () => {
    rowCount = 0;
    await draw({
      sessions: [authFor('admin-inventada')],
      role: 'admin',
      fetch: { [FIRST]: page([row({ title: 'Del Consultor' }), row({ title: 'De la Otra', session_facilitators: [{ user_id: OTHER }] })]) },
    });
    return stage();
  });

  pinned('L11. the four filters in router.query at the first render', async () => {
    rowCount = 0;
    const url = '/api/sessions?page=1&limit=20&school_id=2&status=programada&date_from=2026-11-01&date_to=2026-11-30';
    await draw(
      consultor({
        query: { school_id: '2', status: 'programada', date_from: '2026-11-01', date_to: '2026-11-30' },
        fetch: { [url]: page([row({ school_id: 2, schools: { name: 'Colegio Inventado Austral' } })]) },
      })
    );
    return stage();
  });

  pinned('L11b. two filters in router.query: the ical address carries only those', async () => {
    rowCount = 0;
    const url = '/api/sessions?page=1&limit=20&status=borrador&date_to=2026-12-31';
    await draw(consultor({ query: { status: 'borrador', date_to: '2026-12-31' }, fetch: { [url]: page([row({ status: 'borrador' })]) } }));
    return stage();
  });

  pinned('L12a. sessions fetch answers 500: toast «Error al cargar sesiones»', async () => {
    await draw(consultor({ fetch: { [FIRST]: { status: 500, body: { error: 'Synthetic server error' } } } }));
    return stage();
  });

  pinned('L12b. sessions fetch rejects: toast with its own message', async () => {
    await draw(consultor({ fetch: { [FIRST]: 'reject' } }));
    return stage();
  });

  pinned('L12c. second getSession without a token: nothing asked, no toast', async () => {
    await draw(consultor({ sessions: [authFor(ME), { user: { id: ME } }] }));
    return stage();
  });

  pinned('L12d. the first getSession without a token: user set, fetch skipped silently', async () => {
    await draw(consultor({ sessions: [{ user: { id: ME } }] }));
    return stage();
  });

  // ── BEHAVIOUR CASES ──

  pinned('L13. status filter changed: replace with {status}, fetch with status, page back to 1', async () => {
    rowCount = 0;
    await draw(
      consultor({
        fetch: {
          [FIRST]: page([row(), row({ status: 'cancelada' })]),
          '/api/sessions?page=1&limit=20&status=cancelada': page([row({ status: 'cancelada', title: 'Solo Cancelada' })]),
        },
      })
    );
    const first = stage();
    await change(selects()[1], 'cancelada');
    return [...first, ...stage()];
  });

  pinned('L14. «Cargar más»: page 2 appended; the button goes once all are loaded', async () => {
    rowCount = 0;
    const one = [row({ title: 'Primera Página A' }), row({ title: 'Primera Página B', session_date: '2026-11-26' })];
    const two = [row({ title: 'Segunda Página A', session_date: '2026-11-25' }), row({ title: 'Segunda Página B', session_facilitators: [{ user_id: OTHER }] })];
    await draw(consultor({ fetch: { [FIRST]: page(one, 4), [SECOND]: page(two, 4) } }));
    const first = stage();
    await click(button('Cargar más'));
    return [...first, ...stage()];
  });

  pinned('L15. «Cargar más», then a filter: the log as it is (page 2 with the filter, then page 1)', async () => {
    rowCount = 0;
    await draw(
      consultor({
        fetch: {
          [FIRST]: page([row({ title: 'Uno' })], 3),
          [SECOND]: page([row({ title: 'Dos' })], 3),
          '/api/sessions?page=2&limit=20&date_from=2026-11-21': page([row({ title: 'Filtrada Dos' })], 2),
          '/api/sessions?page=1&limit=20&date_from=2026-11-21': page([row({ title: 'Filtrada Uno' })], 2),
        },
      })
    );
    const first = stage();
    await click(button('Cargar más'));
    const second = stage();
    await change(dates()[0], '2026-11-21');
    return [...first, ...second, ...stage()];
  });

  pinned('L16. «Limpiar filtros»: all four empty, page 1, fetch without filters, replace with {}', async () => {
    rowCount = 0;
    const filtered = '/api/sessions?page=1&limit=20&school_id=1&status=programada&date_from=2026-11-01&date_to=2026-11-30';
    await draw(
      consultor({
        query: { school_id: '1', status: 'programada', date_from: '2026-11-01', date_to: '2026-11-30' },
        fetch: { [filtered]: page([row()]), [FIRST]: page([row(), row({ school_id: 2, schools: { name: 'Colegio Inventado Austral' } })]) },
      })
    );
    const first = stage();
    await click(button('Limpiar filtros'));
    return [...first, ...stage()];
  });

  pinned('L16b. «Limpiar filtros» with nothing set: the same object state, nothing re-asked', async () => {
    rowCount = 0;
    await draw(consultor({ fetch: { [FIRST]: page([row()]) } }));
    const first = stage();
    await click(button('Limpiar filtros'));
    return [...first, ...stage()];
  });

  pinned('L17. each date input and the school select (its value is the id as text)', async () => {
    rowCount = 0;
    await draw(
      consultor({
        fetch: {
          [FIRST]: page([row(), row({ school_id: 2, schools: { name: 'Colegio Inventado Austral' } })]),
          '/api/sessions?page=1&limit=20&school_id=2': page([row({ school_id: 2, schools: { name: 'Colegio Inventado Austral' } })]),
        },
      })
    );
    const stages = [...stage()];
    await change(selects()[0], '2');
    stages.push(...stage());
    await change(dates()[0], '2026-11-02');
    stages.push(...stage());
    await change(dates()[1], '2026-11-28');
    stages.push(...stage());
    await change(selects()[0], '');
    stages.push(...stage());
    return stages;
  });

  pinned('L18. a card click pushes to the session page', async () => {
    rowCount = 0;
    await draw(consultor({ fetch: { [FIRST]: page([row({ title: 'Para Abrir' }), row({ title: 'Otra Para Abrir', session_facilitators: [] })]) } }));
    const first = stage();
    await click(screen.getByLabelText('Ver detalles de Para Abrir'));
    await click(screen.getByLabelText('Ver detalles de Otra Para Abrir'));
    return [...first, ...stage()];
  });

  pinned('L19. the layout marker onLogout: signOut, then push to /login', async () => {
    await draw(consultor({ fetch: { [FIRST]: page([], 0) } }));
    const first = stage();
    await act_(() => mocks.props.MainLayout.onLogout());
    return [...first, ...stage()];
  });

  pinned('L19b. onLogout from the loading frame', async () => {
    await draw(consultor({ sessions: ['pending'] }));
    const first = stage();
    await act_(() => mocks.props.MainLayout.onLogout());
    return [...first, ...stage()];
  });

  pinned('L20a. the order of the load log: consultor with cancelled rows', async () => {
    rowCount = 0;
    await draw(
      consultor({
        fetch: { [FIRST]: page([row({ status: 'cancelada' }), row(), row({ status: 'cancelada', session_facilitators: [] })]) },
        ledger: [{ data: [{ session_id: 'ses-3', status: 'penalizada', admin_override: false }] }],
      })
    );
    return [serialise(mocks.log)];
  });

  pinned('L20b. the order of the load log: admin', async () => {
    rowCount = 0;
    await draw({ sessions: [authFor('admin-inventada')], role: 'admin', fetch: { [FIRST]: page([row()]) } });
    return [serialise(mocks.log)];
  });

  pinned('L21. rerender with the same router: nothing re-asked', async () => {
    rowCount = 0;
    await draw(consultor({ fetch: { [FIRST]: page([row()]) } }));
    const first = stage();
    view.rerender(<ConsultorSessionsPage />);
    await settle();
    return [...first, ...stage()];
  });

  digestsFileHolds(40);
});
