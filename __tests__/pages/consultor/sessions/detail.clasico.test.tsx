// @vitest-environment jsdom
/**
 * Redesign 6S, release SA, step 0: today's consultor session page (`pages/consultor/sessions/[id].tsx`)
 * pinned BEFORE its data code moves into a hook and its markup into the classic view.
 *
 * Each case renders the page's default export with everything outside the page replaced by fakes
 * this file controls, and keeps ONE digest (through `makePin`) of two things together: (a) the
 * rendered markup, serialised as Vitest serialises a snapshot, and (b) the ordered log of what the
 * page asked for (every `auth.*` call, the role helper, every `fetch` with its address, method,
 * headers and body, every read of a response's body (a body is read once, as a real one), every
 * router push and event subscription, every toast, every `confirm`, the clearing of the file input,
 * and the error lines the page writes to the console), from the first render to the settled screen
 * and after each action of a behaviour case. The digests live in `detail.clasico.digests.json`,
 * produced by the page as it was before the move.
 *
 * To see a case's text set SES_DETAIL_CLASICO_SHOW to its name (or `all`) and SES_DETAIL_CLASICO_OUT
 * to a scratch folder; to accept a change ON PURPOSE set SES_DETAIL_CLASICO_ACCEPT the same way.
 *
 * The pin does not depend on the machine: the page writes timestamps with `format(parseISO(…),
 * '… HH:mm')`, which follows the process's time zone, so the zone is fixed to America/Santiago below
 * before any date is made (the first test fails by name if it did not take); the Spain line uses
 * `TZDate` and does not depend on it. The clock is fixed too, though the page does not read it.
 * Every person, school and address below is invented.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../../helpers/pin';

// The zone this process had before is kept and put back after the file (all test files of a run
// may share one process).
const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'America/Santiago';
  return before;
});

const HERE = dirname(fileURLToPath(import.meta.url));
const { pinned, digestsFileHolds } = makePin(join(HERE, 'detail.clasico.digests.json'), 'SES_DETAIL_CLASICO');

// ── The fakes. ──

type Answer = { status?: number; body?: unknown } | 'reject' | 'pending' | 'deferred';

interface Scenario {
  ready?: boolean;
  query?: Record<string, string>;
  /** What `auth.getSession` answers, consumed in order; the last one stays. */
  sessions: unknown[];
  role?: string | 'throw' | 'pending';
  /** By `METHOD address`; an array is consumed in order and its last answer stays. */
  fetch?: Record<string, Answer | Answer[]>;
  confirm?: boolean;
  /** Also write down a digest of the bytes of every file a `FormData` body carries. */
  fileBytes?: boolean;
}

const mocks = vi.hoisted(() => ({
  scenario: null as any,
  log: [] as unknown[],
  props: {} as Record<string, any>,
  router: {} as any,
  release: null as null | ((value?: unknown) => void),
  reads: [] as Promise<void>[],
}));

function log(entry: unknown) {
  mocks.log.push(entry);
}
const S = (): Scenario => mocks.scenario as Scenario;

function typeName(type: any): string {
  if (typeof type === 'string') return type;
  return type?.displayName || type?.name || type?.render?.displayName || type?.render?.name || '«component»';
}

/** Props as text: functions, elements, forms and `undefined` are named, so they differ from texts and null. */
function describeProps(props: Record<string, unknown>): string {
  const rest = { ...props };
  delete rest.children;
  return JSON.stringify(rest, (_key, value) => {
    if (value === undefined) return '«undefined»';
    if (typeof value === 'function') return '«function»';
    if (React.isValidElement(value)) return { element: typeName(value.type) };
    if (typeof FormData !== 'undefined' && value instanceof FormData) {
      return {
        formData: Array.from(value.entries()).map(([k, v]) =>
          [k, typeof v === 'string' ? v : `«file ${(v as File).name} ${(v as File).size} ${(v as File).type}»`]
        ),
      };
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

function resetRouter(s: Scenario) {
  mocks.router = {
    isReady: s.ready ?? true,
    query: { ...(s.query ?? { id: 'ses-1' }) },
    pathname: '/consultor/sessions/[id]',
    asPath: '/consultor/sessions/ses-1',
    push: vi.fn((...args: unknown[]) => {
      log({ 'router.push': args });
      return Promise.resolve(true);
    }),
    replace: vi.fn((...args: unknown[]) => {
      log({ 'router.replace': args });
      return Promise.resolve(true);
    }),
    prefetch: vi.fn((...args: unknown[]) => {
      log({ 'router.prefetch': args });
      return Promise.resolve();
    }),
    // Each subscription is written down with its event's name (send-back 2).
    events: {
      on: vi.fn((name: unknown) => log(`router.events.on: ${String(name)}`)),
      off: vi.fn((name: unknown) => log(`router.events.off: ${String(name)}`)),
    },
  };
}

function deferred<T>(value: () => T): Promise<T> {
  return new Promise((resolve) => {
    mocks.release = () => resolve(value());
  });
}

const client: any = {
  auth: {
    getSession: vi.fn((...args: unknown[]) => {
      log(args.length === 0 ? 'auth.getSession' : { 'auth.getSession': args });
      const list = S().sessions;
      const next = list.length > 1 ? list.shift() : list[0];
      if (next === 'pending') return new Promise(() => {});
      if (next && typeof next === 'object' && 'deferred' in (next as any)) {
        return deferred(() => ({ data: { session: (next as any).deferred }, error: null }));
      }
      return Promise.resolve({ data: { session: next ?? null }, error: null });
    }),
    signOut: vi.fn((...args: unknown[]) => {
      log(args.length === 0 ? 'auth.signOut' : { 'auth.signOut': args });
      return Promise.resolve({ error: null });
    }),
  },
  from: vi.fn((table: string) => {
    log({ 'unexpected supabase read': table });
    return { select: () => ({ then: (r: any) => Promise.resolve({ data: null, error: null }).then(r) }) };
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
vi.mock('@/components/sessions/AttendanceSuggestionsPanel', () => ({ default: marker('AttendanceSuggestionsPanel') }));
vi.mock('@/components/sessions/AudioReportUploader', () => ({ default: marker('AudioReportUploader') }));
vi.mock('@/components/sessions/AudioPlayer', () => ({ default: marker('AudioPlayer') }));
vi.mock('@/components/sessions/EditRequestModal', () => ({ default: marker('EditRequestModal') }));

import SessionDetailPage from '@/pages/consultor/sessions/[id]';

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

function readBytes(blob: Blob): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// ── The fetch fake: answers by method and address, can fail or stay pending, writes each call down. ──

function describeInit(init: unknown): unknown {
  if (init === undefined) return '«none»';
  return JSON.parse(describeProps({ init: init as Record<string, unknown> })).init;
}

function fakeFetch(url: string, ...args: unknown[]) {
  const init = args[0] as { method?: string } | undefined;
  const entry: Record<string, unknown> = { fetch: url, init: describeInit(init) };
  // The options as given: an explicit `undefined` or `null` second argument differs from none.
  if (args.length > 0 && args[0] === undefined) entry.init = '«undefined given»';
  if (args[0] === null) entry.init = '«null given»';
  const body = (init as { body?: unknown } | undefined)?.body;
  if (S().fileBytes && typeof FormData !== 'undefined' && body instanceof FormData) {
    // The content of each file, read when the page sends it (the read ends before the case's stage).
    const files = Array.from(body.entries()).filter(([, v]) => typeof v !== 'string');
    entry.fileBytes = '«reading»';
    mocks.reads.push(
      Promise.all(files.map(([k, v]) => readBytes(v as Blob).then((bytes) => `${k}: sha256 ${createHash('sha256').update(bytes).digest('hex')}`))).then(
        (digests) => {
          entry.fileBytes = digests;
        }
      )
    );
  }
  if (args.length > 1) entry.more = describeProps({ args: args.slice(1) });
  log(entry);
  const key = `${init?.method ?? 'GET'} ${url}`;
  const table = S().fetch ?? {};
  let answer: Answer | Answer[] | undefined = table[key];
  if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
  const given: Answer = answer ?? { status: 500, body: { error: `unhandled in the pin: ${key}` } };
  if (given === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (given === 'pending') return new Promise(() => {});
  const respond = (g: { status?: number; body?: unknown }) => {
    const status = g.status ?? 200;
    return fakeResponse(key, status, g.body);
  };
  if (given === 'deferred') return deferred(() => respond({ body: { data: { session: payload() } } }));
  return Promise.resolve(respond(given));
}

/**
 * A response whose body is read once, as a real `Response`'s is (send-back 2): every read is
 * written down, and a second read fails («body already read») instead of answering again.
 */
function fakeResponse(key: string, status: number, body: unknown) {
  let used = false;
  return {
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
  };
}

// ── Invented data. ──

const NOW = new Date('2026-11-19T12:00:00Z');
const ME = 'consultor-inventado';
const OTHER = 'otra-consultora-inventada';
const authFor = (id: string) => ({ access_token: `synthetic-token-${id}`, user: { id, email: `${id}@example.invalid` } });

const GET = 'GET /api/sessions/ses-1?include=activity_log';

const FAC_ME = {
  id: 'fac-1',
  user_id: ME,
  is_lead: true,
  facilitator_role: 'consultor_externo',
  profiles: { first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' },
};
const FAC_OTHER = {
  id: 'fac-2',
  user_id: OTHER,
  is_lead: false,
  facilitator_role: 'equipo_interno',
  profiles: { first_name: 'Berta', last_name: 'Ficticia', email: 'berta@example.invalid' },
};
const FAC_NO_PROFILE = { id: 'fac-3', user_id: 'sin-perfil', is_lead: false, facilitator_role: 'consultor_externo' };

const ATTENDEES = [
  { id: 'att-1', user_id: 'doc-1', attended: null, arrival_status: null, notes: null, expected: true, profiles: { first_name: 'Carla', last_name: 'Supuesta', email: 'c@example.invalid' } },
  { id: 'att-2', user_id: 'doc-2', attended: true, arrival_status: 'late', notes: 'Llegó con retraso inventado', expected: true, profiles: { first_name: 'Diego', last_name: '', email: 'd@example.invalid' } },
  { id: 'att-3', user_id: 'doc-3', attended: false, arrival_status: 'left_early', notes: null, expected: false, profiles: { first_name: 'Elena', last_name: 'Imaginaria', email: 'e@example.invalid' } },
  { id: 'att-4', user_id: 'doc-4', attended: true, arrival_status: 'on_time', notes: '', expected: true },
];

function payload(over: Record<string, unknown> = {}) {
  return {
    id: 'ses-1',
    title: 'Sesión Inventada de Acompañamiento',
    description: 'Una descripción inventada',
    objectives: 'Objetivos inventados',
    session_date: '2026-11-25',
    start_time: '09:00:00',
    end_time: '10:30:00',
    modality: 'presencial',
    has_meeting: false,
    join_path: null,
    status: 'programada',
    school_id: 1,
    schools: { name: 'Colegio Inventado Norte' },
    growth_communities: { name: 'Comunidad Inventada A' },
    facilitators: [FAC_ME],
    attendees: [ATTENDEES[1]],
    materials: [],
    reports: [],
    edit_requests: [],
    activity_log: [],
    recurrence_group_id: null,
    session_number: null,
    cancellation_reason: null,
    updated_at: '2026-11-18T10:00:00Z',
    ...over,
  };
}
const ok = (session: unknown) => ({ body: { data: { session } } });

function as(role: string, session: unknown, more: Record<string, Answer | Answer[]> = {}, who = ME): Scenario {
  return { sessions: [authFor(who)], role, fetch: { [GET]: ok(session), ...more } };
}

const REPORT_MINE = {
  id: 'rep-1',
  session_id: 'ses-1',
  author_id: ME,
  report_type: 'session_report',
  content: 'Informe inventado de la sesión.\nSegunda línea.',
  visibility: 'facilitators_only',
  created_at: '2026-11-18T15:45:00Z',
};
const MATERIALS = [
  { id: 'mat-1', session_id: 'ses-1', file_name: 'pauta-inventada.pdf', file_type: 'application/pdf', file_size: 500, uploaded_by: ME, created_at: '2026-11-17T23:30:00Z', profiles: { first_name: 'Ana', last_name: 'Inventada', email: 'a@example.invalid' }, download_url: 'https://files.example.invalid/mat-1' },
  { id: 'mat-2', session_id: 'ses-1', file_name: 'planilla-inventada.xlsx', file_type: 'application/vnd.ms-excel', file_size: 2048 * 1024 - 1, uploaded_by: OTHER, created_at: '2026-11-16T12:00:00Z' },
  { id: 'mat-3', session_id: 'ses-1', file_name: 'video-inventado.mp4', file_type: 'video/mp4', file_size: 3 * 1024 * 1024 + 512, uploaded_by: 'alguien-mas', created_at: '2026-11-15T03:10:00Z', profiles: { first_name: '', last_name: 'Solo Apellido', email: 'x@example.invalid' }, download_url: 'https://files.example.invalid/mat-3' },
];

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
  view = render(<SessionDetailPage />);
  await settle();
}
function stage(): string[] {
  const text = [serialise(view.asFragment()), serialise(mocks.log)];
  mocks.log = [];
  return text;
}
async function call(fn: () => unknown) {
  await act(async () => {
    await fn();
  });
  await settle();
}
async function click(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}
const button = (text: string) => screen.getByText(text).closest('button');
function tab(label: string) {
  const found = Array.from(view.container.querySelectorAll('.overflow-x-auto button')).find((b) => b.textContent === label);
  if (!found) throw new Error(`no tab ${label}`);
  return found;
}
async function openTab(label: string) {
  await click(tab(label));
}

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.log = [];
  mocks.props = {};
  mocks.release = null;
  mocks.reads = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal(
    'confirm',
    vi.fn((...args: unknown[]) => {
      log({ confirm: args });
      return S().confirm ?? true;
    })
  );
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

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
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

describe("today's consultor session page (pinned before SA)", () => {
  // ── Loading, refusals, redirects ──

  pinned('D01. getSession pending: loading', async () => {
    await draw({ sessions: ['pending'], role: 'consultor' });
    expect(screen.getByText('Cargando...')).toBeTruthy();
    return stage();
  });

  pinned('D02a. router not ready: loading stays, nothing asked', async () => {
    await draw({ ready: false, sessions: [authFor(ME)], role: 'consultor' });
    return stage();
  });

  pinned('D02b. no id in the query: loading stays, nothing asked', async () => {
    await draw({ query: {}, sessions: [authFor(ME)], role: 'consultor' });
    return stage();
  });

  pinned('D03. no session: push to /login, then «Sesión no encontrada»', async () => {
    await draw({ sessions: [null], role: 'consultor' });
    return stage();
  });

  pinned('D03b. a session without a token: push to /login', async () => {
    await draw({ sessions: [{ user: { id: ME } }], role: 'consultor' });
    return stage();
  });

  pinned('D04. role docente: push to /dashboard, no fetch', async () => {
    await draw(as('docente', payload()));
    return stage();
  });

  pinned('D04b. role helper throws: push to /login', async () => {
    await draw(as('throw', payload()));
    return stage();
  });

  pinned('D04c. role helper pending: loading stays', async () => {
    await draw(as('pending', payload()));
    return stage();
  });

  pinned('D05. 403: «Acceso denegado»', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: { status: 403, body: { error: 'Forbidden' } } } });
    return stage();
  });

  pinned('D06. 404: «Sesión no encontrada»', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: { status: 404, body: { error: 'Not found' } } } });
    return stage();
  });

  pinned('D07. 200 with session null', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: { body: { data: { session: null } } } } });
    return stage();
  });

  pinned('D07b. 200 without data', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: { body: {} } } });
    return stage();
  });

  pinned('D07c. 401: push to /login', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: { status: 401, body: {} } } });
    return stage();
  });

  pinned('D08. 500: push to /login', async () => {
    await draw({ sessions: [authFor(ME)], role: 'admin', fetch: { [GET]: { status: 500, body: { error: 'Synthetic' } } } });
    return stage();
  });

  pinned('D08b. fetch rejects: push to /login', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: 'reject' } });
    return stage();
  });

  // ── Who sees what ──

  pinned('D09a. admin not facilitating, programada online with meeting, three facilitators', async () => {
    await draw(
      as(
        'admin',
        payload({
          modality: 'online',
          has_meeting: true,
          join_path: '/meet/session/ses-1',
          facilitators: [{ ...FAC_ME, user_id: OTHER, id: 'fac-9' }, FAC_OTHER, FAC_NO_PROFILE],
        }),
        {},
        'admin-inventada'
      )
    );
    return stage();
  });

  pinned('D09b. empty description and objectives; a meeting without a join path; hybrid', async () => {
    await draw(as('consultor', payload({ description: '', objectives: null, modality: 'hibrida', has_meeting: true, join_path: null })));
    return stage();
  });

  pinned('D09c. a join path without has_meeting; unknown modality', async () => {
    await draw(as('consultor', payload({ modality: 'otra', has_meeting: false, join_path: '/meet/session/ses-1' })));
    return stage();
  });

  pinned('D10. facilitating consultor, en_progreso: every kind of attendee, counts, table and list', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso', facilitators: [FAC_ME, FAC_OTHER], attendees: ATTENDEES })));
    return stage();
  });

  pinned('D10b. facilitating consultor, no attendees', async () => {
    await draw(as('consultor', payload({ attendees: [] })));
    return stage();
  });

  pinned('D11. consultor not facilitating: band, no planning tab, read-mode cells', async () => {
    await draw(as('consultor', payload({ status: 'en_progreso', facilitators: [FAC_OTHER], attendees: ATTENDEES })));
    return stage();
  });

  pinned('D12. lider_comunidad: as a reader; the report tab says only facilitators', async () => {
    await draw(as('lider_comunidad', payload({ status: 'pendiente_informe', facilitators: [FAC_OTHER], attendees: ATTENDEES }), {}, 'lider-inventada'));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D13a. pendiente_informe, facilitator: finalize disabled with its reasons', async () => {
    await draw(
      as(
        'consultor',
        payload({
          status: 'pendiente_informe',
          attendees: ATTENDEES,
          reports: [{ ...REPORT_MINE, id: 'rep-p', report_type: 'planning_notes' }],
        })
      )
    );
    return stage();
  });

  pinned('D13b. pendiente_informe, facilitator: every condition met, finalize enabled', async () => {
    await draw(
      as('consultor', payload({ status: 'pendiente_informe', attendees: [ATTENDEES[1], ATTENDEES[2]], reports: [{ ...REPORT_MINE, author_id: OTHER }] }))
    );
    return stage();
  });

  pinned('D13c. pendiente_informe without attendees and reports arrays', async () => {
    await draw(as('consultor', payload({ status: 'pendiente_informe', attendees: [], reports: undefined, materials: undefined, edit_requests: undefined })));
    const first = stage();
    await openTab('Materiales');
    return [...first, ...stage()];
  });

  pinned('D14. completada as admin: read mode everywhere', async () => {
    await draw(
      as('admin', payload({ status: 'completada', attendees: ATTENDEES, materials: MATERIALS, reports: [{ ...REPORT_MINE, author_id: 'admin-inventada' }] }), {}, 'admin-inventada')
    );
    const stages = stage();
    await openTab('Materiales');
    stages.push(...stage());
    await openTab('Informe');
    stages.push(...stage());
    return stages;
  });

  pinned('D15a. cancelada with a reason', async () => {
    await draw(as('consultor', payload({ status: 'cancelada', cancellation_reason: 'Paro inventado' })));
    return stage();
  });

  pinned('D15b. cancelada without a reason', async () => {
    await draw(as('consultor', payload({ status: 'cancelada' })));
    return stage();
  });

  pinned('D16a. borrador', async () => {
    await draw(as('consultor', payload({ status: 'borrador' })));
    return stage();
  });

  pinned('D16b. pendiente_aprobacion', async () => {
    await draw(as('consultor', payload({ status: 'pendiente_aprobacion' })));
    return stage();
  });

  pinned('D16c. an unknown status: the pill falls back, no helper box', async () => {
    await draw(as('consultor', payload({ status: 'archivada' })));
    return stage();
  });

  pinned('D17a. a series session number 2', async () => {
    await draw(as('consultor', payload({ recurrence_group_id: 'grupo-1', session_number: 2 })));
    return stage();
  });

  pinned('D17b. a series session number 0 (renders 0)', async () => {
    await draw(as('consultor', payload({ recurrence_group_id: 'grupo-1', session_number: 0 })));
    return stage();
  });

  pinned('D18a. edit requests: pending by me, approved and rejected with notes, every field', async () => {
    await draw(
      as(
        'consultor',
        payload({
          edit_requests: [
            { id: 'er-1', session_id: 'ses-1', requested_by: ME, status: 'pending', changes: { session_date: { old: '2026-11-25', new: '2026-11-26' }, start_time: { old: '09:00', new: '10:00' } }, reason: 'Motivo inventado', review_notes: 'Nota oculta', created_at: '2026-11-18T13:05:00Z' },
            { id: 'er-2', session_id: 'ses-1', requested_by: OTHER, status: 'approved', changes: { end_time: { old: '10:30', new: '11:00' }, modality: { old: 'presencial', new: 'online' } }, reason: null, review_notes: 'Aprobada por invento', created_at: '2026-11-10T09:00:00Z' },
            { id: 'er-3', session_id: 'ses-1', requested_by: OTHER, status: 'rejected', changes: { otro_campo: { old: null, new: 3 } }, reason: '', review_notes: 'Rechazada por invento', created_at: '2026-07-10T09:00:00Z' },
          ],
        })
      )
    );
    return stage();
  });

  pinned('D18b. a pending request by another: «Solicitar Cambios» enabled', async () => {
    await draw(
      as('consultor', payload({ edit_requests: [{ id: 'er-4', session_id: 'ses-1', requested_by: OTHER, status: 'pending', changes: {}, reason: 'Otro motivo', review_notes: null, created_at: '2026-11-18T13:05:00Z' }] }))
    );
    return stage();
  });

  pinned('D19a. materials: none', async () => {
    await draw(as('consultor', payload()));
    const first = stage();
    await openTab('Materiales');
    return [...first, ...stage()];
  });

  pinned('D19b. materials as a facilitator: rows, sizes, links, bins, upload label', async () => {
    await draw(as('consultor', payload({ materials: MATERIALS })));
    const first = stage();
    await openTab('Materiales');
    return [...first, ...stage()];
  });

  pinned('D19c. materials as a reader: the bin only on my own upload, no upload label', async () => {
    await draw(as('consultor', payload({ facilitators: [FAC_OTHER], materials: MATERIALS })));
    const first = stage();
    await openTab('Materiales');
    return [...first, ...stage()];
  });

  pinned('D19d. materials on a cancelled session as a facilitator: no bin, no upload', async () => {
    await draw(as('consultor', payload({ status: 'cancelada', materials: MATERIALS })));
    const first = stage();
    await openTab('Materiales');
    return [...first, ...stage()];
  });

  pinned('D20. report tab, can edit, no report: uploader and «Crear Informe»; the editor; typing', async () => {
    await draw(as('consultor', payload()));
    const stages = stage();
    await openTab('Informe');
    stages.push(...stage());
    await click(button('Crear Informe'));
    stages.push(...stage());
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Texto inventado' } });
    await settle();
    stages.push(...stage());
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: '   ' } });
    await settle();
    stages.push(...stage());
    return stages;
  });

  pinned('D21a. my report, facilitators only: read view and «Editar Informe»', async () => {
    await draw(as('consultor', payload({ reports: [REPORT_MINE] })));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D21b. my report, all participants', async () => {
    await draw(as('consultor', payload({ reports: [{ ...REPORT_MINE, visibility: 'all_participants' }] })));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D21c. only another author’s report, can edit: treated as none', async () => {
    await draw(as('consultor', payload({ reports: [{ ...REPORT_MINE, author_id: OTHER }] })));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D21d. my planning_notes report is ignored', async () => {
    await draw(as('consultor', payload({ reports: [{ ...REPORT_MINE, report_type: 'planning_notes' }] })));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D21e. a reader with a report of their own: the read view', async () => {
    await draw(as('consultor', payload({ facilitators: [FAC_OTHER], reports: [REPORT_MINE] })));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D21f. my report on a completed session: read view, no edit button', async () => {
    await draw(as('consultor', payload({ status: 'completada', reports: [REPORT_MINE] })));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  const AUDIO = { ...REPORT_MINE, audio_url: 'audio/inventado.webm' };
  const AUDIO_GET = 'GET /api/sessions/ses-1/reports/rep-1';

  pinned('D22a. my report with audio: url and transcript', async () => {
    await draw(
      as('consultor', payload({ reports: [AUDIO] }), {
        [AUDIO_GET]: { body: { data: { signedAudioUrl: 'https://audio.example.invalid/firmado', report: { transcript: 'Transcripción inventada' } } } },
      })
    );
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D22b. my report with audio: url only', async () => {
    await draw(as('consultor', payload({ reports: [AUDIO] }), { [AUDIO_GET]: { body: { data: { signedAudioUrl: 'https://audio.example.invalid/firmado', report: {} } } } }));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D22c. my report with audio: the details answer non-ok', async () => {
    await draw(as('consultor', payload({ reports: [AUDIO] }), { [AUDIO_GET]: { status: 500, body: {} } }));
    const first = stage();
    await openTab('Informe');
    return [...first, ...stage()];
  });

  pinned('D22d. my report with audio: the second getSession has no token', async () => {
    await draw({ sessions: [authFor(ME), { user: { id: ME } }], role: 'consultor', fetch: { [GET]: ok(payload({ reports: [AUDIO] })) } });
    return stage();
  });

  pinned('D22e. my report with audio: the details reject', async () => {
    await draw(as('consultor', payload({ reports: [AUDIO] }), { [AUDIO_GET]: 'reject' }));
    return stage();
  });

  pinned('D23. the planning and communications tabs', async () => {
    await draw(as('consultor', payload()));
    const stages = stage();
    await openTab('Planificación');
    stages.push(...stage());
    await openTab('Comunicaciones');
    stages.push(...stage());
    return stages;
  });

  pinned('D24a. activity: entries with and without a profile', async () => {
    await draw(
      as(
        'consultor',
        payload({
          activity_log: [
            { id: 'log-1', session_id: 'ses-1', user_id: ME, action: 'attendance_updated', created_at: '2026-11-18T14:00:00Z', profiles: { first_name: 'Ana', last_name: 'Inventada' } },
            { id: 'log-2', session_id: 'ses-1', user_id: 'x', action: 'created', created_at: '2026-07-01T02:30:00Z' },
          ],
        })
      )
    );
    const first = stage();
    await openTab('Actividad');
    return [...first, ...stage()];
  });

  pinned('D24b. activity: no activity_log', async () => {
    await draw(as('consultor', payload({ activity_log: undefined })));
    const first = stage();
    await openTab('Actividad');
    return [...first, ...stage()];
  });

  pinned('D24c. activity: an empty list', async () => {
    await draw(as('consultor', payload()));
    const first = stage();
    await openTab('Actividad');
    return [...first, ...stage()];
  });

  pinned('D25. the finalize pop-up open, then finalizing', async () => {
    const met = payload({ status: 'pendiente_informe', attendees: [ATTENDEES[1]], reports: [REPORT_MINE] });
    await draw(as('consultor', met, { 'POST /api/sessions/ses-1/finalize': 'pending' }));
    const stages = stage();
    await click(button('Finalizar Sesión'));
    stages.push(...stage());
    await click(button('Finalizar'));
    stages.push(...stage());
    return stages;
  });

  pinned('D25b. the finalize pop-up closed by «Cancelar»', async () => {
    const met = payload({ status: 'pendiente_informe', attendees: [ATTENDEES[1]], reports: [REPORT_MINE] });
    await draw(as('consultor', met));
    const stages = stage();
    await click(button('Finalizar Sesión'));
    stages.push(...stage());
    const dialog = screen.getByText('¿Está seguro que desea finalizar esta sesión? Esta acción no se puede deshacer.').parentElement!;
    await click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Cancelar'));
    stages.push(...stage());
    return stages;
  });

  pinned('D26. the edit-request pop-up open, its onClose', async () => {
    await draw(as('consultor', payload()));
    const stages = stage();
    await click(button('Solicitar Cambios'));
    stages.push(...stage());
    await call(() => mocks.props.EditRequestModal.onClose());
    stages.push(...stage());
    return stages;
  });

  pinned('D28. schools and growth communities null: the empty wrappers stay', async () => {
    await draw(as('consultor', payload({ schools: null, growth_communities: null })));
    return stage();
  });

  pinned('D29a. the Spain line for a January date', async () => {
    await draw(as('consultor', payload({ session_date: '2027-01-14', start_time: '09:00', end_time: '17:45:00' })));
    return stage();
  });

  pinned('D29b. the Spain line for a July date', async () => {
    await draw(as('consultor', payload({ session_date: '2026-07-15', start_time: '22:30:00', end_time: '23:59:00' })));
    return stage();
  });

  // ── BEHAVIOUR CASES ──

  pinned('D30. each tab click, as a facilitator with data', async () => {
    await draw(as('consultor', payload({ attendees: ATTENDEES, materials: MATERIALS, reports: [REPORT_MINE] })));
    const stages = stage();
    for (const label of ['Planificación', 'Materiales', 'Informe', 'Comunicaciones', 'Actividad', 'Detalles']) {
      await openTab(label);
      stages.push(...stage());
    }
    return stages;
  });

  const ATT_PUT = 'PUT /api/sessions/ses-1/attendees';
  const attendanceCase = (name: string, answer: Answer, edit = false) =>
    pinned(name, async () => {
      const after = payload({ attendees: ATTENDEES, updated_at: '2026-11-19T12:30:00Z' });
      await draw(as('consultor', payload({ attendees: ATTENDEES }), { [ATT_PUT]: answer, [GET]: [ok(payload({ attendees: ATTENDEES })), ok(after)] }));
      const stages = stage();
      if (edit) {
        const table = view.container.querySelector('table')!;
        fireEvent.click(table.querySelectorAll('input[type="checkbox"]')[2]);
        fireEvent.change(table.querySelectorAll('select')[0], { target: { value: 'late' } });
        fireEvent.change(table.querySelectorAll('select')[1], { target: { value: '' } });
        fireEvent.change(table.querySelectorAll('input[type="text"]')[0], { target: { value: 'Nota inventada' } });
        fireEvent.change(table.querySelectorAll('input[type="text"]')[1], { target: { value: '' } });
        await settle();
      } else {
        await click(button('Marcar todos presentes'));
      }
      stages.push(...stage());
      await click(button('Guardar asistencia'));
      stages.push(...stage());
      return stages;
    });

  attendanceCase('D31a. «Marcar todos presentes», then save: the PUT body, the toast, the refresh', { body: { data: {} } });
  attendanceCase('D31b. edited cells, then save: the PUT body', { body: { data: {} } }, true);
  attendanceCase('D31c. save answers 409: the conflict band and its toast', { status: 409, body: { error: 'conflict' } });
  attendanceCase('D31d. save answers 500 with an error text', { status: 500, body: { error: 'Error inventado del servidor' } });
  attendanceCase('D31e. save answers 500 without an error text', { status: 500, body: {} });

  pinned('D31f. save without a token: «Error de autenticación»', async () => {
    await draw({ sessions: [authFor(ME), { user: { id: ME } }], role: 'consultor', fetch: { [GET]: ok(payload({ attendees: ATTENDEES })) } });
    const first = stage();
    await click(button('Guardar asistencia'));
    return [...first, ...stage()];
  });

  pinned('D31g. while saving: «Guardando...» and the button disabled', async () => {
    await draw(as('consultor', payload({ attendees: ATTENDEES }), { [ATT_PUT]: 'pending' }));
    const first = stage();
    await click(button('Guardar asistencia'));
    return [...first, ...stage()];
  });

  pinned('D27. the conflict band after a 409, then «Recargar»', async () => {
    await draw(as('consultor', payload({ attendees: ATTENDEES }), { [ATT_PUT]: { status: 409, body: {} } }));
    const stages = stage();
    await click(button('Guardar asistencia'));
    stages.push(...stage());
    await click(button('Recargar'));
    stages.push(...stage());
    return stages;
  });

  const REPORTS_POST = 'POST /api/sessions/ses-1/reports';
  const REPORT_PUT = 'PUT /api/sessions/ses-1/reports/rep-1';

  pinned('D32a. report create: POST body, toast, refresh', async () => {
    await draw(as('consultor', payload(), { [REPORTS_POST]: { status: 201, body: { data: {} } } }));
    const stages = stage();
    await openTab('Informe');
    await click(button('Crear Informe'));
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: '  Informe nuevo inventado  ' } });
    fireEvent.change(view.container.querySelector('select')!, { target: { value: 'all_participants' } });
    await settle();
    stages.push(...stage());
    await click(button('Crear'));
    stages.push(...stage());
    return stages;
  });

  pinned('D32b. report update: PUT body, toast, refresh', async () => {
    await draw(as('consultor', payload({ reports: [REPORT_MINE] }), { [REPORT_PUT]: { body: { data: {} } } }));
    const stages = stage();
    await openTab('Informe');
    await click(button('Editar Informe'));
    stages.push(...stage());
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Informe corregido' } });
    await settle();
    await click(button('Actualizar'));
    stages.push(...stage());
    return stages;
  });

  pinned('D32c. «Cancelar» restores the saved text and visibility', async () => {
    await draw(as('consultor', payload({ reports: [{ ...REPORT_MINE, visibility: 'all_participants' }] })));
    const stages = stage();
    await openTab('Informe');
    await click(button('Editar Informe'));
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Cambio que se descarta' } });
    fireEvent.change(view.container.querySelector('.p-6 select')!, { target: { value: 'facilitators_only' } });
    await settle();
    stages.push(...stage());
    await click(button('Cancelar'));
    stages.push(...stage());
    await click(button('Editar Informe'));
    stages.push(...stage());
    return stages;
  });

  pinned('D32d. «Cancelar» with no saved report keeps the typed text', async () => {
    await draw(as('consultor', payload()));
    const stages = stage();
    await openTab('Informe');
    await click(button('Crear Informe'));
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Borrador inventado' } });
    await settle();
    await click(button('Cancelar'));
    stages.push(...stage());
    await click(button('Crear Informe'));
    stages.push(...stage());
    return stages;
  });

  pinned('D32e. report save: 409, then 500 with text, then saving', async () => {
    await draw(as('consultor', payload(), { [REPORTS_POST]: [{ status: 409, body: {} }, { status: 500, body: { error: 'Informe rechazado inventado' } }, { status: 500, body: {} }, 'pending'] }));
    const stages = stage();
    await openTab('Informe');
    await click(button('Crear Informe'));
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'Texto' } });
    await settle();
    for (let i = 0; i < 4; i += 1) {
      await click(button('Crear'));
      stages.push(...stage());
    }
    return stages;
  });

  const MAT_POST = 'POST /api/sessions/ses-1/materials';
  const uploadCase = (name: string, size: number, answer: Answer) =>
    pinned(name, async () => {
      await draw(as('consultor', payload({ materials: MATERIALS }), { [MAT_POST]: answer }));
      const stages = stage();
      await openTab('Materiales');
      const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: () => '',
        set: (v: unknown) => log({ 'file input value set': v }),
      });
      const file = new File(['contenido inventado'], 'acta-inventada.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: size });
      fireEvent.change(input, { target: { files: [file] } });
      await settle();
      stages.push(...stage());
      return stages;
    });

  uploadCase('D33a. upload over 25 MB: toast, no call', 25 * 1024 * 1024 + 1, { body: {} });
  uploadCase('D33b. upload success: the FormData, toast, refresh, input cleared', 25 * 1024 * 1024, { status: 201, body: { data: {} } });
  uploadCase('D33c. upload failure with an error text', 1000, { status: 500, body: { error: 'Subida rechazada inventada' } });
  uploadCase('D33d. upload failure without an error text', 1000, { status: 400, body: {} });

  pinned('D33e. while uploading: «Subiendo...» and the input disabled', async () => {
    await draw(as('consultor', payload(), { [MAT_POST]: 'pending' }));
    await openTab('Materiales');
    const first = stage();
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'x.txt', { type: 'text/plain' })] } });
    await settle();
    return [...first, ...stage()];
  });

  pinned('D33f. a change with no file: nothing asked', async () => {
    await draw(as('consultor', payload()));
    await openTab('Materiales');
    const first = stage();
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [] } });
    await settle();
    return [...first, ...stage()];
  });

  const MAT_DELETE = 'DELETE /api/sessions/ses-1/materials/mat-1';
  pinned('D34a. delete, confirm answers no: nothing asked', async () => {
    await draw({ ...as('consultor', payload({ materials: MATERIALS })), confirm: false });
    await openTab('Materiales');
    const first = stage();
    await click(view.container.querySelector('button.text-red-600'));
    return [...first, ...stage()];
  });

  pinned('D34b. delete, confirm answers yes: DELETE, toast, refresh; then a failure', async () => {
    await draw(as('consultor', payload({ materials: MATERIALS }), { [MAT_DELETE]: [{ body: {} }, { status: 500, body: { error: 'No se pudo inventado' } }] }));
    await openTab('Materiales');
    const stages = stage();
    await click(view.container.querySelector('button.text-red-600'));
    stages.push(...stage());
    await click(view.container.querySelector('button.text-red-600'));
    stages.push(...stage());
    return stages;
  });

  const FINALIZE = 'POST /api/sessions/ses-1/finalize';
  const MET = () => payload({ status: 'pendiente_informe', attendees: [ATTENDEES[1]], reports: [REPORT_MINE] });

  pinned('D35a. finalize success: the pop-up closes, toast, refresh', async () => {
    await draw(as('consultor', MET(), { [FINALIZE]: { body: {} }, [GET]: [ok(MET()), ok(payload({ status: 'completada', reports: [REPORT_MINE] }))] }));
    const stages = stage();
    await click(button('Finalizar Sesión'));
    await click(button('Finalizar'));
    stages.push(...stage());
    return stages;
  });

  pinned('D35b. finalize failure, with and without an error text', async () => {
    await draw(as('consultor', MET(), { [FINALIZE]: [{ status: 400, body: { error: 'Faltan cosas inventadas' } }, { status: 500, body: {} }] }));
    const stages = stage();
    await click(button('Finalizar Sesión'));
    await click(button('Finalizar'));
    stages.push(...stage());
    await click(button('Finalizar'));
    stages.push(...stage());
    return stages;
  });

  const EDIT_POST = 'POST /api/sessions/ses-1/edit-requests';
  pinned('D36a. the pop-up marker onSubmit: POST body, toast, closes, refresh', async () => {
    await draw(as('consultor', payload(), { [EDIT_POST]: { status: 201, body: {} } }));
    const stages = stage();
    await click(button('Solicitar Cambios'));
    stages.push(...stage());
    await call(() => mocks.props.EditRequestModal.onSubmit({ start_time: { old: '09:00', new: '09:30' } }, 'Motivo inventado'));
    stages.push(...stage());
    return stages;
  });

  pinned('D36b. the pop-up marker onSubmit: failure keeps it open; submitting', async () => {
    await draw(as('consultor', payload(), { [EDIT_POST]: [{ status: 400, body: { error: 'Solicitud inventada inválida' } }, { status: 500, body: {} }, 'pending'] }));
    const stages = stage();
    await click(button('Solicitar Cambios'));
    for (let i = 0; i < 2; i += 1) {
      await call(() => mocks.props.EditRequestModal.onSubmit({ modality: { old: 'presencial', new: 'online' } }, ''));
      stages.push(...stage());
    }
    act(() => {
      void mocks.props.EditRequestModal.onSubmit({}, 'x');
    });
    await settle();
    stages.push(...stage());
    return stages;
  });

  pinned('D37. the uploader marker onReportCreated: the editor opens with the content; refresh', async () => {
    await draw(as('consultor', payload()));
    await openTab('Informe');
    const stages = stage();
    await call(() =>
      mocks.props.AudioReportUploader.onReportCreated(
        { ...REPORT_MINE, id: 'rep-audio', content: 'Resumen inventado por audio', visibility: 'all_participants' },
        'Transcripción inventada',
        { summary: 'x' }
      )
    );
    stages.push(...stage());
    return stages;
  });

  pinned('D38. the panel marker onApplied: the refresh log', async () => {
    await draw(as('consultor', payload({ attendees: ATTENDEES })));
    const stages = stage();
    await call(() => mocks.props.AttendanceSuggestionsPanel.onApplied());
    stages.push(...stage());
    return stages;
  });

  pinned('D38b. refresh failures: 500 toast, then no token, then 401', async () => {
    await draw({
      sessions: [authFor(ME), authFor(ME), { user: { id: ME } }, authFor(ME)],
      role: 'consultor',
      fetch: { [GET]: [ok(payload()), { status: 500, body: {} }, { status: 401, body: {} }] },
    });
    const stages = stage();
    for (let i = 0; i < 3; i += 1) {
      await call(() => mocks.props.AttendanceSuggestionsPanel.onApplied());
      stages.push(...stage());
    }
    return stages;
  });

  pinned('D38c. the layout marker onLogout: signOut, then push to /login', async () => {
    await draw(as('consultor', payload()));
    const first = stage();
    await call(() => mocks.props.MainLayout.onLogout());
    return [...first, ...stage()];
  });

  pinned('D39a. unmount while getSession waits: the log as it is', async () => {
    await draw({ sessions: [{ deferred: authFor(ME) }], role: 'consultor', fetch: { [GET]: ok(payload()) } });
    const first = stage();
    view.unmount();
    await act(async () => {
      mocks.release?.();
    });
    await settle();
    return [...first, serialise(mocks.log)];
  });

  pinned('D39b. unmount while the session fetch waits: the log as it is', async () => {
    await draw({ sessions: [authFor(ME)], role: 'consultor', fetch: { [GET]: 'deferred' } });
    const first = stage();
    view.unmount();
    await act(async () => {
      mocks.release?.();
    });
    await settle();
    return [...first, serialise(mocks.log)];
  });

  pinned('D40. the order of the load log: a facilitator with an audio report', async () => {
    await draw(
      as('consultor', payload({ reports: [{ ...REPORT_MINE, audio_url: 'audio/x.webm' }] }), {
        'GET /api/sessions/ses-1/reports/rep-1': { body: { data: { signedAudioUrl: 'https://audio.example.invalid/x', report: { transcript: 'T' } } } },
      })
    );
    return [serialise(mocks.log)];
  });

  pinned('D41. rerender with the same router: nothing re-asked', async () => {
    await draw(as('consultor', payload()));
    const first = stage();
    view.rerender(<SessionDetailPage />);
    await settle();
    return [...first, ...stage()];
  });

  // ── Added in send-back 1 (the review's findings 5 and 6), produced by today's page. ──

  pinned('D42. the address changes from one session to another: the second one is loaded', async () => {
    const second = payload({ id: 'ses-2', title: 'Segunda Sesión Inventada', status: 'pendiente_informe' });
    await draw(as('consultor', payload(), { 'GET /api/sessions/ses-2?include=activity_log': ok(second) }));
    const first = stage();
    mocks.router.query = { id: 'ses-2' };
    mocks.router.asPath = '/consultor/sessions/ses-2';
    view.rerender(<SessionDetailPage />);
    await settle();
    return [...first, ...stage()];
  });

  pinned('D43. the phone-layout attendance cards: each control, then save (the PUT body)', async () => {
    await draw(as('consultor', payload({ attendees: ATTENDEES }), { [ATT_PUT]: { body: { data: {} } } }));
    const stages = stage();
    const cards = view.container.querySelector('ul[aria-label="Lista de asistencia"]')!;
    fireEvent.click(cards.querySelectorAll('input[type="checkbox"]')[0]);
    fireEvent.click(cards.querySelectorAll('input[type="checkbox"]')[1]);
    fireEvent.change(cards.querySelectorAll('select')[2], { target: { value: 'on_time' } });
    fireEvent.change(cards.querySelectorAll('select')[1], { target: { value: '' } });
    fireEvent.change(cards.querySelectorAll('input[type="text"]')[3], { target: { value: 'Nota desde el teléfono' } });
    fireEvent.change(cards.querySelectorAll('input[type="text"]')[1], { target: { value: '' } });
    await settle();
    stages.push(...stage());
    await click(button('Guardar asistencia'));
    stages.push(...stage());
    return stages;
  });

  pinned('D33g. upload success: the bytes of the file sent', async () => {
    await draw({ ...as('consultor', payload({ materials: MATERIALS }), { [MAT_POST]: { status: 201, body: { data: {} } } }), fileBytes: true });
    const stages = stage();
    await openTab('Materiales');
    const file = new File(['contenido inventado del acta'], 'acta-inventada.pdf', { type: 'application/pdf' });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await settle();
    await Promise.all(mocks.reads);
    stages.push(...stage());
    return stages;
  });

  pinned('D44. the page component’s hooks, in order (a hook added, removed or moved changes this)', async () => {
    await draw(as('consultor', payload()));
    return [hookSignature(view.container, SessionDetailPage), ...stage()];
  });

  // ── Added in send-back 2 (the review's finding 2), produced by today's page. ──

  pinned('D45. the router turns ready after the first render, with the same id: the session loads then', async () => {
    await draw({ ...as('consultor', payload()), ready: false });
    const first = stage();
    mocks.router.isReady = true;
    view.rerender(<SessionDetailPage />);
    await settle();
    return [...first, ...stage()];
  });

  digestsFileHolds(100);
});
