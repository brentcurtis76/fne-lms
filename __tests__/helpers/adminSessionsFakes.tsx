/**
 * Fakes for the four admin session screens in both looks (redesign 6S, release SC). They reuse the
 * consultor screens' fakes (`sessionsFakes.tsx`: the router, the role helper, the toasts, `fetch`,
 * the look, the markers, the log) and add the Supabase client these pages use: table reads with
 * `select`, `order`, `in`, `eq` and `maybeSingle`, each written to the same log so two looks can be
 * compared call for call. Every person, school and session here is invented.
 */
import { fakes, log } from './sessionsFakes';
import type { Scenario } from './sessionsFakes';

export interface AdminScenario extends Scenario {
  /** What a table read answers, by table (the ledger read answers `ledger`). */
  tables?: Record<string, unknown>;
}

const S = () => fakes.scenario as AdminScenario;

function answerOf(table: string) {
  const scenario = S();
  if (table === 'contract_hours_ledger') return { data: scenario.ledger ?? [], error: null };
  const given = scenario.tables?.[table];
  return { data: given ?? [], error: null };
}

export const adminClient: any = {
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
      order: (column: string) => {
        log({ from: table, order: column });
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        log({ in: column, values });
        return chain;
      },
      eq: (column: string, value: unknown) => {
        log({ from: table, eq: [column, value] });
        return chain;
      },
      maybeSingle: () => {
        log({ from: table, maybeSingle: true });
        const answer = answerOf(table);
        const data = Array.isArray(answer.data) ? answer.data[0] ?? null : answer.data;
        return Promise.resolve({ data, error: null });
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(answerOf(table)).then(resolve, reject),
    };
    return chain;
  },
};

/** Which ledger reads were made: the set of id lists, each sorted (the list piece remounts). */
export function ledgerReads(entries: unknown[] = fakes.log): string[] {
  const reads = entries
    .filter((e): e is { in: string; values: string[] } => e !== null && typeof e === 'object' && 'in' in (e as object))
    .map((e) => JSON.stringify([...e.values].sort()));
  return Array.from(new Set(reads)).sort();
}

/** The log without the ledger reads (compared apart, as a set). */
export function withoutLedger(entries: unknown[]): unknown[] {
  return entries.filter(
    (e) =>
      !(
        e !== null &&
        typeof e === 'object' &&
        ('in' in (e as object) || (e as { from?: string }).from === 'contract_hours_ledger')
      )
  );
}

// ── Invented data. ──

export const ADMIN = 'admin-inventado';
export const adminSession = { access_token: 'synthetic-token-admin', user: { id: ADMIN, email: 'admin@example.invalid' } };

export const SCHOOLS = [
  { id: 1, name: 'Colegio Inventado Norte' },
  { id: 2, name: 'Colegio Ficticio Sur' },
];
export const COMMUNITIES = [{ id: 'gc-1', name: 'Comunidad Inventada A' }];
export const CONSULTANTS = [
  { id: 'con-1', first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' },
  { id: 'con-2', first_name: 'Berta', last_name: 'Ficticia', email: 'berta@example.invalid' },
];

// ── «Aprobaciones de Sesiones». ──

export const REQ_PENDING = {
  id: 'req-1',
  session_id: 'ses-1',
  requested_by: 'con-1',
  changes: { modality: { old: 'presencial', new: 'hibrida' }, session_date: { old: '2026-12-01', new: '2026-12-02' } },
  reason: 'Motivo inventado',
  status: 'pending',
  created_at: '2026-11-18T12:00:00Z',
  consultor_sessions: { title: 'Mesa inventada de gestión', session_date: '2026-12-01' },
  profiles: { first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' },
};
export const REQ_PENDING_2 = { ...REQ_PENDING, id: 'req-2', changes: '"{\\"end_time\\":{\\"old\\":\\"10:00\\",\\"new\\":\\"11:00\\"}}"', reason: null, consultor_sessions: null, profiles: null };
export const REQ_APPROVED = { ...REQ_PENDING, id: 'req-3', status: 'approved' };
export const REQ_REJECTED = { ...REQ_PENDING, id: 'req-4', status: 'rejected', changes: 'no es json' };

const list = (rows: unknown[]) => ({ body: { data: { edit_requests: rows } } });

export function approvalsScenario(over: Partial<AdminScenario> = {}): AdminScenario {
  return {
    session: adminSession,
    role: 'admin',
    fetch: {
      'GET /api/sessions/edit-requests?status=pending': list([REQ_PENDING, REQ_PENDING_2]),
      'GET /api/sessions/edit-requests?status=approved': list([REQ_APPROVED]),
      'GET /api/sessions/edit-requests?status=rejected': list([REQ_REJECTED]),
      'GET /api/sessions/edit-requests?status=all': list([REQ_PENDING, REQ_PENDING_2, REQ_APPROVED, REQ_REJECTED]),
      'PUT /api/sessions/edit-requests/req-1': { body: { data: {} } },
      'PUT /api/sessions/edit-requests/req-2': { status: 400, body: { error: 'Error inventado' } },
    },
    ...over,
  };
}


// ── «Clasificar Sesiones». ──

export const UNCLASSIFIED = [
  { id: 'bt-1', title: 'Sesión inventada sin tipo uno', scheduled_date: '2026-10-05', status: 'completada', hour_type_key: null, contrato_id: null, schools: { id: 1, name: 'Colegio Inventado Norte' }, session_facilitators: [{ profiles: { first_name: 'Ana', last_name: 'Inventada' } }] },
  { id: 'bt-2', title: 'Sesión inventada sin tipo dos', scheduled_date: null, status: 'programada', hour_type_key: null, contrato_id: null, schools: null, session_facilitators: [] },
];
export const HOUR_TYPES = [
  { id: 'ht-1', key: 'asesoria_tecnica', display_name: 'Asesoría técnica inventada' },
  { id: 'ht-2', key: 'online_learning', display_name: 'Aprendizaje en línea inventado' },
  { id: 'ht-3', key: 'taller', display_name: 'Taller inventado' },
];
export const bulkAddress = (params: Record<string, string> = {}, page = 1) =>
  `GET /api/admin/bulk-tag-sessions?${new URLSearchParams({ page: String(page), page_size: '50', ...params }).toString()}`;

export function bulkScenario(over: Partial<AdminScenario> = {}, total = 2): AdminScenario {
  const rows = { body: { data: { sessions: UNCLASSIFIED, total } } };
  return {
    session: adminSession,
    role: 'admin',
    tables: { schools: SCHOOLS },
    fetch: {
      [bulkAddress()]: rows,
      [bulkAddress({}, 2)]: rows,
      [bulkAddress({ date_from: '2026-10-01' })]: rows,
      [bulkAddress({ date_from: '2026-10-01', date_to: '2026-10-31' })]: rows,
      [bulkAddress({ date_from: '2026-10-01', date_to: '2026-10-31', school_id: '1' })]: { body: { data: { sessions: [], total: 0 } } },
      'GET /api/hour-types': { body: { data: { hour_types: HOUR_TYPES } } },
      'PATCH /api/admin/bulk-tag-sessions': { body: { data: { message: 'Mensaje inventado del servidor' } } },
    },
    ...over,
  };
}

// ── «Detalle de Sesión» (admin). ──

export const ADMIN_FACILITATORS = [
  { id: 'fac-1', user_id: 'con-1', is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'Ana', last_name: 'Inventada', email: 'ana@example.invalid' } },
  { id: 'fac-2', user_id: 'con-3', is_lead: false, facilitator_role: 'equipo_interno', profiles: null },
];

export function adminDetail(over: Record<string, unknown> = {}) {
  return {
    id: 'ses-1',
    title: 'Sesión Inventada de Gestión del Cambio',
    description: 'Una descripción inventada',
    objectives: 'Objetivos inventados',
    session_date: '2026-12-02',
    start_time: '09:00:00',
    end_time: '10:30:00',
    scheduled_duration_minutes: 90,
    modality: 'presencial',
    location: 'Sala inventada 3',
    has_meeting: true,
    join_path: '/meet/session/ses-1',
    status: 'programada',
    school_id: 1,
    recurrence_group_id: 'serie-1',
    session_number: 1,
    cancellation_reason: null,
    is_zoom_managed: false,
    facilitators: ADMIN_FACILITATORS,
    ...over,
  };
}

export const SERIES_ROWS = [
  { id: 'ses-1', title: 'Sesión Inventada de Gestión del Cambio', session_date: '2026-12-02', start_time: '09:00:00', end_time: '10:30:00', status: 'programada', session_number: 1 },
  { id: 'ses-2', title: 'Sesión Inventada de Gestión del Cambio', session_date: '2026-12-09', start_time: '09:00:00', end_time: '10:30:00', status: 'programada', session_number: 2 },
  { id: 'ses-3', title: 'Sesión Inventada de Gestión del Cambio', session_date: '2026-12-16', start_time: '09:00:00', end_time: '10:30:00', status: 'borrador', session_number: 3 },
];

export const DETAIL = 'GET /api/sessions/ses-1';

export function detailScenario(session: Record<string, unknown> = adminDetail(), over: Partial<AdminScenario> = {}): AdminScenario {
  return {
    query: { id: 'ses-1' },
    pathname: '/admin/sessions/[id]',
    session: adminSession,
    role: 'admin',
    confirm: true,
    tables: { session_meetings_public: [{ meeting_status: 'scheduled' }] },
    fetch: {
      [DETAIL]: { body: { data: { session } } },
      'POST /api/sessions/ses-1/approve': { body: { data: {} } },
      'POST /api/sessions/ses-1/cancel': { body: { data: {} } },
      'PUT /api/sessions/ses-1': { body: { data: {} } },
      'GET /api/sessions/series/serie-1': {
        body: { data: { sessions: SERIES_ROWS, stats: { programada: 2, borrador: 1, completada: 0 }, total_sessions: 3 } },
      },
      'POST /api/sessions/series/serie-1/cancel': { body: { data: { cancelled_count: 2 } } },
      'GET /api/admin/consultants?school_id=1': { body: { data: { consultants: CONSULTANTS } } },
      'PUT /api/sessions/ses-1/facilitators': { body: { data: {} } },
    },
    ...over,
  };
}

// ── «Sesiones de Consultoría» (admin list). ──

/** «Now» for the list: Thursday 19 November 2026, noon UTC (the month and week the views open on). */
export const LIST_NOW = new Date('2026-11-19T12:00:00Z');

const fac = (id: string, first: string, last: string, lead: boolean) => ({
  user_id: id,
  is_lead: lead,
  profiles: { first_name: first, last_name: last, email: `${id}@example.invalid` },
});
const row = (id: string, over: Record<string, unknown>) => ({
  id,
  title: `Sesión inventada ${id}`,
  session_date: '2026-11-20',
  start_time: '09:00:00',
  end_time: '10:30:00',
  scheduled_duration_minutes: 90,
  modality: 'presencial',
  status: 'programada',
  school_id: 1,
  growth_community_id: 'gc-1',
  recurrence_group_id: null,
  session_number: null,
  schools: { name: 'Colegio Inventado Norte' },
  growth_communities: { name: 'Comunidad Inventada A' },
  session_facilitators: [fac('con-2', 'Berta', 'Ficticia', false), fac('con-1', 'Ana', 'Inventada', true)],
  ...over,
});

export const LIST_ROWS = [
  row('s-borrador', { status: 'borrador', title: 'Borrador inventado', session_facilitators: [] }),
  row('s-pendiente', { status: 'pendiente_aprobacion', title: 'Pendiente inventada', schools: null, growth_communities: null }),
  row('s-serie-1', { title: 'Serie inventada', recurrence_group_id: 'serie-1', session_number: 1 }),
  row('s-serie-2', { title: 'Serie inventada dos', recurrence_group_id: 'serie-1', session_number: 2, session_date: '2026-11-27' }),
  row('s-completada', { status: 'completada', title: 'Completada inventada', session_date: '2026-11-05' }),
  row('s-penalizada', { status: 'cancelada', title: 'Penalizada inventada', session_date: '2026-11-06' }),
  row('s-devuelta', { status: 'cancelada', title: 'Devuelta inventada', session_date: '2026-11-06' }),
];
export const LIST_LEDGER = [
  { session_id: 's-penalizada', status: 'penalizada', admin_override: true },
  { session_id: 's-devuelta', status: 'devuelta', admin_override: false },
];

/** The list's request: `page`, `limit`, then the filters and dates in the page's order. */
export function listAddress(params: Record<string, string> = {}) {
  const q = new URLSearchParams({ page: '1', limit: '50' });
  for (const key of ['school_id', 'growth_community_id', 'consultant_id', 'status', 'date_from', 'date_to']) {
    if (params[key]) q.append(key, params[key]);
  }
  return `GET /api/sessions?${q.toString()}`;
}
const rowsAnswer = (rows: unknown[]) => ({ body: { data: { sessions: rows, total: rows.length } } });

export function listScenarioAdmin(over: Partial<AdminScenario> = {}, rows: unknown[] = LIST_ROWS): AdminScenario {
  return {
    pathname: '/admin/sessions',
    session: adminSession,
    role: 'admin',
    ledger: LIST_LEDGER,
    tables: { schools: SCHOOLS, growth_communities: COMMUNITIES },
    fetch: {
      [listAddress()]: rowsAnswer(rows),
      'GET /api/admin/consultants': { body: { data: { consultants: CONSULTANTS } } },
      'GET /api/sessions/stats': { body: { data: { total: 21, by_status: { programada: 7, pendiente_informe: 1 } } } },
      // «Mes» and «Semana» of the 19 November 2026.
      [listAddress({ date_from: '2026-11-01', date_to: '2026-11-30' })]: rowsAnswer(rows),
      [listAddress({ date_from: '2026-11-16', date_to: '2026-11-22' })]: rowsAnswer(rows),
      [listAddress({ date_from: '2026-12-01', date_to: '2026-12-31' })]: rowsAnswer([]),
      [listAddress({ date_from: '2026-11-23', date_to: '2026-11-29' })]: rowsAnswer([]),
      'POST /api/sessions/s-borrador/approve': { body: { data: {} } },
      'POST /api/sessions/s-serie-1/cancel': { body: { data: {} } },
    },
    ...over,
  };
}
export { rowsAnswer };
