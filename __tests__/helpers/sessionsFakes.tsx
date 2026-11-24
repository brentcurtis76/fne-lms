/**
 * Fakes for the consultor's session screens in both looks (redesign 6S, release SB): the router, the
 * Supabase client, the role helper, the toasts, `fetch`, `confirm`, the look, and markers that stand in
 * for the frame and the shared pieces and count their mounts. Everything the page asks for is written
 * to `fakes.log` in order, so two looks can be compared call for call. Every person, school and address
 * here is invented.
 */
import React from 'react';
import { act } from '@testing-library/react';

export type Answer = { status?: number; body?: unknown } | 'pending';

export interface Scenario {
  query?: Record<string, string>;
  pathname?: string;
  session: unknown;
  role?: string | 'pending';
  /** By `METHOD address`; an array is consumed in order and its last answer stays. */
  fetch?: Record<string, Answer | Answer[]>;
  /** What the cancellation ledger read answers (the list). */
  ledger?: unknown[];
  confirm?: boolean;
}

export const fakes = {
  scenario: null as Scenario | null,
  log: [] as unknown[],
  mounts: {} as Record<string, number>,
  props: {} as Record<string, any>,
  look: 'clasico' as 'clasico' | 'nuevo',
  router: {} as any,
};

export const log = (entry: unknown) => {
  fakes.log.push(entry);
};
const S = () => fakes.scenario as Scenario;

export function resetFakes(scenario: Scenario) {
  fakes.scenario = scenario;
  fakes.log = [];
  fakes.mounts = {};
  fakes.props = {};
  fakes.router = {
    isReady: true,
    query: { ...(scenario.query ?? {}) },
    pathname: scenario.pathname ?? '/consultor/sessions/[id]',
    asPath: '/consultor/sessions',
    push: (...args: unknown[]) => {
      log({ 'router.push': args });
      return Promise.resolve(true);
    },
    replace: (...args: unknown[]) => {
      log({ 'router.replace': args });
      return Promise.resolve(true);
    },
    prefetch: () => Promise.resolve(),
    events: { on: () => {}, off: () => {} },
  };
}

/** A component that stands in for a piece: it counts its mounts and keeps its last props. */
export function marker(name: string, withChildren = false) {
  return function Marker(props: any) {
    fakes.props[name] = props;
    React.useEffect(() => {
      fakes.mounts[name] = (fakes.mounts[name] ?? 0) + 1;
    }, []);
    return (
      <div data-marker={name}>
        {withChildren ? props.children : null}
      </div>
    );
  };
}

export const client: any = {
  auth: {
    getSession: () => {
      log('auth.getSession');
      return Promise.resolve({ data: { session: S().session }, error: null });
    },
    signOut: () => {
      log('auth.signOut');
      return Promise.resolve({ error: null });
    },
  },
  from: (table: string) => {
    const chain: any = {
      select: (columns: string) => {
        log({ from: table, select: columns });
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        log({ in: column, values });
        return chain;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: S().ledger ?? [], error: null }).then(resolve, reject),
    };
    return chain;
  },
};

export function roleOf(userId: string) {
  log({ getUserPrimaryRole: userId });
  const role = S().role;
  if (role === 'pending') return new Promise(() => {});
  return Promise.resolve(role ?? null);
}

export const toast = {
  error: (...args: unknown[]) => log({ 'toast.error': args }),
  success: (...args: unknown[]) => log({ 'toast.success': args }),
};

/** A multipart body as its fields' names and values, in order (a file as its name, type and size). */
function formFields(body: FormData): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  body.forEach((value, name) => {
    fields.push([name, typeof value === 'string' ? value : `«file ${value.name} ${value.type} ${value.size}»`]);
  });
  return fields;
}

/** `fetch`: answers by method and address, writes each call down (address, method, headers, body). */
export function fakeFetch(url: string, init?: { method?: string; headers?: unknown; body?: unknown }) {
  const body = init?.body;
  log({
    fetch: url,
    method: init?.method ?? 'GET',
    headers: init?.headers ?? null,
    body: typeof FormData !== 'undefined' && body instanceof FormData ? formFields(body) : body ?? null,
  });
  const key = `${init?.method ?? 'GET'} ${url}`;
  const table = S().fetch ?? {};
  let answer = table[key];
  if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0];
  const given: Answer = answer ?? { status: 500, body: { error: `unhandled: ${key}` } };
  if (given === 'pending') return new Promise(() => {});
  const status = given.status ?? 200;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(given.body),
  });
}

export function fakeConfirm(...args: unknown[]) {
  log({ confirm: args });
  return S().confirm ?? true;
}

export async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Only what reaches the server or moves the browser: the comparison two looks must agree on. */
export function requests(entries: unknown[] = fakes.log): unknown[] {
  return entries.filter(
    (e) =>
      e === 'auth.getSession' ||
      e === 'auth.signOut' ||
      (e !== null &&
        typeof e === 'object' &&
        ['fetch', 'router.push', 'router.replace', 'getUserPrimaryRole', 'from', 'in', 'toast.error', 'toast.success', 'confirm'].some(
          (k) => k in (e as object)
        ))
  );
}

// ── Invented people and sessions. ──

export const ME = 'consultor-inventado';
export const OTHER = 'otra-consultora-inventada';
export const authFor = (id: string) => ({ access_token: `synthetic-token-${id}`, user: { id, email: `${id}@example.invalid` } });

export const FAC_ME = {
  id: 'fac-1',
  user_id: ME,
  is_lead: true,
  facilitator_role: 'consultor_externo',
  profiles: { first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' },
};
export const FAC_OTHER = {
  id: 'fac-2',
  user_id: OTHER,
  is_lead: false,
  facilitator_role: 'equipo_interno',
  profiles: { first_name: 'Berta', last_name: 'Ficticia', email: 'berta@example.invalid' },
};

export const ATTENDEES = [
  { id: 'att-1', user_id: 'doc-1', attended: null, arrival_status: null, notes: null, expected: true, profiles: { first_name: 'Carla', last_name: 'Supuesta', email: 'c@example.invalid' } },
  { id: 'att-2', user_id: 'doc-2', attended: true, arrival_status: 'late', notes: 'Llegó tarde, inventado', expected: true, profiles: { first_name: 'Diego', last_name: 'Ficticio', email: 'd@example.invalid' } },
  { id: 'att-3', user_id: 'doc-3', attended: false, arrival_status: 'left_early', notes: null, expected: false, profiles: { first_name: 'Elena', last_name: 'Imaginaria', email: 'e@example.invalid' } },
  { id: 'att-4', user_id: 'doc-4', attended: true, arrival_status: 'on_time', notes: '', expected: true },
];

export const MATERIALS = [
  { id: 'mat-1', session_id: 'ses-1', file_name: 'pauta-inventada.pdf', file_type: 'application/pdf', file_size: 500, uploaded_by: ME, created_at: '2026-11-17T23:30:00Z', profiles: { first_name: 'Ana', last_name: 'Inventada', email: 'a@example.invalid' }, download_url: 'https://files.example.invalid/mat-1' },
  { id: 'mat-2', session_id: 'ses-1', file_name: 'planilla-inventada.xlsx', file_type: 'application/vnd.ms-excel', file_size: 2048, uploaded_by: OTHER, created_at: '2026-11-16T12:00:00Z' },
];

export const REPORT_MINE = {
  id: 'rep-1',
  session_id: 'ses-1',
  author_id: ME,
  report_type: 'session_report',
  content: 'Informe inventado de la sesión.',
  visibility: 'all_participants',
  created_at: '2026-11-18T15:45:00Z',
};

export const REQUESTS = [
  {
    id: 'req-1',
    session_id: 'ses-1',
    requested_by: ME,
    changes: { session_date: { old: '2026-11-25', new: '2026-11-26' }, start_time: { old: '09:00:00', new: '10:00:00' }, modality: { old: 'online', new: 'hibrida' } },
    reason: 'Motivo inventado',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    created_at: '2026-11-18T12:00:00Z',
  },
  {
    id: 'req-2',
    session_id: 'ses-1',
    requested_by: OTHER,
    changes: { end_time: { old: '10:30:00', new: '11:00:00' } },
    reason: null,
    status: 'rejected',
    reviewed_by: 'admin-inventado',
    reviewed_at: '2026-11-18T13:00:00Z',
    review_notes: 'Nota inventada',
    created_at: '2026-11-17T12:00:00Z',
  },
];

export const ACTIVITY = [
  { id: 'log-1', session_id: 'ses-1', user_id: ME, action: 'status_changed', details: null, created_at: '2026-11-18T14:00:00Z', profiles: { first_name: 'Ana', last_name: 'Inventada' } },
  { id: 'log-2', session_id: 'ses-1', user_id: ME, action: 'something_new', details: null, created_at: '2026-11-18T13:00:00Z', profiles: { first_name: 'Ana', last_name: 'Inventada' } },
];

export function payload(over: Record<string, unknown> = {}) {
  return {
    id: 'ses-1',
    title: 'Sesión Inventada de Acompañamiento',
    description: 'Una descripción inventada',
    objectives: 'Objetivos inventados',
    session_date: '2026-11-25',
    start_time: '09:00:00',
    end_time: '10:30:00',
    modality: 'hibrida',
    has_meeting: true,
    join_path: '/meet/session/ses-1',
    status: 'programada',
    school_id: 1,
    schools: { name: 'Colegio Inventado Norte' },
    growth_communities: { name: 'Comunidad Inventada A' },
    facilitators: [FAC_ME, FAC_OTHER],
    attendees: ATTENDEES,
    materials: MATERIALS,
    reports: [],
    edit_requests: [],
    activity_log: [],
    recurrence_group_id: 'serie-1',
    session_number: 3,
    cancellation_reason: null,
    updated_at: '2026-11-18T10:00:00Z',
    ...over,
  };
}

export const DETAIL_GET = 'GET /api/sessions/ses-1?include=activity_log';
export const okSession = (session: unknown) => ({ body: { data: { session } } });
