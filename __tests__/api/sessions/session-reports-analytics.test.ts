// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Hoisted mock functions
const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
  getHighestRole: mockGetHighestRole,
}));

// Import handler AFTER mocks
import handler from '../../../pages/api/sessions/reports/analytics';

// Valid UUIDs for test data
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTOR_ID = '22222222-2222-4222-8222-222222222222';
const DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID_1 = '44444444-4444-4444-8444-444444444444';
const SESSION_ID_2 = '55555555-5555-4555-8555-555555555555';
const GC_ID = '66666666-6666-4666-8666-666666666666';

// ============================================================
// Schema-faithful Supabase double
//
// A table-name-keyed double answers every query with the same canned rows regardless of
// what was selected or filtered, so a handler that asks for a column the table does not
// have — or drops a filter — passes anyway. This double parses the select string, applies
// the recorded eq/in/gte/lte filters, and answers an unknown column the way PostgREST
// does (42703). Column lists are mirrored from
// supabase/migrations/00000000000000_baseline.sql.
// ============================================================

type Row = Record<string, unknown>;

type PgError = { code: string; message: string; details: string | null; hint: string | null };

function pgError(code: string, message: string): PgError {
  return { code, message, details: null, hint: null };
}

type TableDef = { columns: string[] };

const BASE_SCHEMA: Record<string, TableDef> = {
  consultor_sessions: {
    columns: [
      'id',
      'title',
      'session_date',
      'status',
      'modality',
      'school_id',
      'growth_community_id',
      'scheduled_duration_minutes',
      'actual_duration_minutes',
      'is_active',
    ],
  },
  session_attendees: { columns: ['id', 'session_id', 'user_id', 'expected', 'attended'] },
  session_facilitators: {
    columns: ['id', 'session_id', 'user_id', 'facilitator_role', 'is_lead'],
  },
  schools: { columns: ['id', 'name', 'tenant_kind'] },
  growth_communities: { columns: ['id', 'school_id', 'name'] },
  profiles: { columns: ['id', 'first_name', 'last_name'] },
  contract_hours_ledger: {
    columns: [
      'id',
      'session_id',
      'status',
      'hours',
      'is_over_budget',
      'admin_override',
      'effective_minutes',
    ],
  },
};

type Filter = { column: string; kind: 'eq' | 'in' | 'gte' | 'lte'; value?: unknown; values?: unknown[] };

type QueryLog = { table: string; select: string; filters: Filter[] };

function splitColumns(select: string): string[] {
  return select.split(',').map((part) => part.trim()).filter(Boolean);
}

function matchesFilter(row: Row, filter: Filter): boolean {
  const cell = row[filter.column];

  switch (filter.kind) {
    case 'eq':
      return Object.is(cell, filter.value);
    case 'in':
      return (filter.values ?? []).some((candidate) => Object.is(cell, candidate));
    case 'gte':
      return (cell as string) >= (filter.value as string);
    case 'lte':
      return (cell as string) <= (filter.value as string);
  }
}

function buildClient(
  tables: Record<string, Row[]>,
  log: QueryLog[],
  schema: Record<string, TableDef>
) {
  return {
    from: vi.fn((table: string) => {
      const filters: Filter[] = [];
      let selectStr = '*';

      function settle(): { data: unknown; error: PgError | null } {
        log.push({ table, select: selectStr, filters: [...filters] });

        const def = schema[table];
        if (!def) {
          return {
            data: null,
            error: pgError('42P01', `relation "public.${table}" does not exist`),
          };
        }

        for (const column of splitColumns(selectStr)) {
          if (column !== '*' && !def.columns.includes(column)) {
            return { data: null, error: pgError('42703', `column ${table}.${column} does not exist`) };
          }
        }

        // A filter on a column the table does not have fails the same way.
        for (const filter of filters) {
          if (!def.columns.includes(filter.column)) {
            return {
              data: null,
              error: pgError('42703', `column ${table}.${filter.column} does not exist`),
            };
          }
        }

        const matched = (tables[table] ?? []).filter((row) =>
          filters.every((filter) => matchesFilter(row, filter))
        );

        // PostgREST returns only what was asked for.
        const projected = matched.map((row) => {
          if (selectStr === '*') return { ...row };
          const out: Row = {};
          for (const column of splitColumns(selectStr)) out[column] = row[column] ?? null;
          return out;
        });

        return { data: projected, error: null };
      }

      const query = {
        select(value: string) {
          selectStr = value;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, kind: 'eq', value });
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push({ column, kind: 'in', values });
          return query;
        },
        gte(column: string, value: unknown) {
          filters.push({ column, kind: 'gte', value });
          return query;
        },
        lte(column: string, value: unknown) {
          filters.push({ column, kind: 'lte', value });
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        then(resolve: (value: unknown) => void) {
          resolve(settle());
        },
      };

      return query;
    }),
  };
}

type ClientOverrides = {
  sessions?: Row[];
  attendees?: Row[];
  facilitators?: Row[];
  schools?: Row[];
  gcs?: Row[];
  profiles?: Row[];
  ledger?: Row[];
  /** Per-table column-list overrides, for reproducing a table that lacks a column. */
  schemaOverrides?: Record<string, TableDef>;
};

function createMockSupabaseClient(overrides: ClientOverrides = {}, log: QueryLog[] = []) {
  // Hours live in contract_hours_ledger, not in actual_duration_minutes: SESSION_ID_1 was
  // consumed (1.75 billed) and SESSION_ID_2 was cancelled with the hours returned.
  const defaultSessions: Row[] = [
    {
      id: SESSION_ID_1,
      title: 'Sesion 1',
      session_date: '2026-01-15',
      status: 'completada',
      modality: 'presencial',
      school_id: 1,
      growth_community_id: GC_ID,
      scheduled_duration_minutes: 120,
      is_active: true,
    },
    {
      id: SESSION_ID_2,
      title: 'Sesion 2',
      session_date: '2026-01-20',
      status: 'cancelada',
      modality: 'online',
      school_id: 1,
      growth_community_id: GC_ID,
      scheduled_duration_minutes: 90,
      is_active: true,
    },
  ];

  const defaultLedger: Row[] = [
    { session_id: SESSION_ID_1, status: 'consumida', hours: 1.75 },
    { session_id: SESSION_ID_2, status: 'devuelta', hours: 1.5 },
  ];

  const defaultAttendees: Row[] = [
    { session_id: SESSION_ID_1, expected: true, attended: true },
    { session_id: SESSION_ID_1, expected: true, attended: true },
    { session_id: SESSION_ID_1, expected: true, attended: false },
  ];

  const defaultFacilitators: Row[] = [
    { session_id: SESSION_ID_1, user_id: CONSULTOR_ID, is_lead: true },
  ];

  const tables: Record<string, Row[]> = {
    consultor_sessions: overrides.sessions ?? defaultSessions,
    session_attendees: overrides.attendees ?? defaultAttendees,
    session_facilitators: overrides.facilitators ?? defaultFacilitators,
    schools: overrides.schools ?? [{ id: 1, name: 'Escuela Test', tenant_kind: 'client' }],
    growth_communities: overrides.gcs ?? [{ id: GC_ID, name: 'Comunidad Test' }],
    profiles: overrides.profiles ?? [
      { id: CONSULTOR_ID, first_name: 'Test', last_name: 'Consultor' },
    ],
    contract_hours_ledger: overrides.ledger ?? defaultLedger,
  };

  return buildClient(tables, log, { ...BASE_SCHEMA, ...(overrides.schemaOverrides ?? {}) });
}

function asAdmin() {
  mockGetApiUser.mockResolvedValue({
    user: { id: ADMIN_ID, email: 'admin@test.com' },
    error: null,
  });
  mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
  mockGetHighestRole.mockReturnValue('admin');
}

describe('Session Reports Analytics API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // Test 1: Unauthenticated request returns 401
  // ============================================================
  it('should return 401 for unauthenticated request', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    const data = res._getJSONData();
    expect(data.error).toContain('Autenticación requerida');
  });

  // ============================================================
  // Test 2: Non-admin/non-consultor role returns 403
  // ============================================================
  it('should return 403 for unauthorized role (docente)', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: DOCENTE_ID, email: 'docente@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'docente' }]);
    mockGetHighestRole.mockReturnValue('docente');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error).toContain('Acceso denegado');
  });

  // ============================================================
  // Test 3: Admin gets full analytics including top_consultants
  // ============================================================
  it('should return full analytics for admin including top_consultants', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data).toBeDefined();
    expect(data.data.kpis).toBeDefined();
    expect(data.data.kpis.total_sessions).toBe(2);
    expect(data.data.kpis.completed_sessions).toBe(1);
    expect(data.data.kpis.cancelled_sessions).toBe(1);
    expect(data.data.status_distribution).toBeDefined();
    expect(data.data.modality_distribution).toBeDefined();
    expect(data.data.sessions_by_month).toBeDefined();
    expect(data.data.sessions_by_school).toBeDefined();
    expect(data.data.attendance_trends).toBeDefined();
    expect(data.data.top_consultants).toBeDefined();
    expect(data.data.recent_sessions).toBeDefined();
  });

  // ============================================================
  // Test 4: Consultant gets filtered analytics, no top_consultants
  // ============================================================
  it('should return filtered analytics for consultor without top_consultants', async () => {
    const mockClient = createMockSupabaseClient({
      facilitators: [{ session_id: SESSION_ID_1, user_id: CONSULTOR_ID, is_lead: true }],
    });
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID, email: 'consultor@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data).toBeDefined();
    expect(data.data.kpis).toBeDefined();
    // Consultant should NOT have top_consultants
    expect(data.data.top_consultants).toBeUndefined();
  });

  // ============================================================
  // Test 5: School filter works correctly
  // ============================================================
  it('should accept school_id filter parameter', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    const mockClient = createMockSupabaseClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '1' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    // The query was built with school_id filter - mock returns same data regardless
    // but the handler accepted the parameter without error
    expect(mockClient.from).toHaveBeenCalled();
  });

  // ============================================================
  // Test 6: Date range filter works correctly
  // ============================================================
  it('should accept date range filter parameters', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    const mockClient = createMockSupabaseClient();
    mockCreateServiceRoleClient.mockReturnValue(mockClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { date_from: '2026-01-01', date_to: '2026-12-31' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data.kpis).toBeDefined();
  });

  // ============================================================
  // Test 7: Empty result set returns zero-valued KPIs
  // ============================================================
  it('should return zero-valued KPIs for empty results', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    const emptyClient = createMockSupabaseClient({ sessions: [] });
    mockCreateServiceRoleClient.mockReturnValue(emptyClient);
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.data.kpis.total_sessions).toBe(0);
    expect(data.data.kpis.completed_sessions).toBe(0);
    expect(data.data.kpis.cancelled_sessions).toBe(0);
    expect(data.data.kpis.completion_rate).toBe(0);
    expect(data.data.kpis.total_hours_scheduled).toBe(0);
    expect(data.data.kpis.total_hours_actual).toBe(0);
    expect(data.data.kpis.avg_attendance_rate).toBe(0);
    expect(data.data.kpis.sessions_pending_report).toBe(0);
    expect(data.data.kpis.upcoming_sessions).toBe(0);
    expect(data.data.status_distribution).toEqual([]);
    expect(data.data.sessions_by_month).toEqual([]);
    expect(data.data.recent_sessions).toEqual([]);
  });

  // ============================================================
  // Test 8: Invalid school_id returns 400
  // ============================================================
  it('should return 400 for invalid school_id', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: 'not-a-number' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toContain('school_id debe ser un entero válido');
  });

  // ============================================================
  // Test 9: Method not allowed for POST
  // ============================================================
  it('should return 405 for POST method', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
  });

  // ============================================================
  // Test 10: Invalid growth_community_id UUID returns 400
  // ============================================================
  it('should return 400 for invalid growth_community_id UUID', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: ADMIN_ID, email: 'admin@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin' }]);
    mockGetHighestRole.mockReturnValue('admin');

    const { req, res } = createMocks({
      method: 'GET',
      query: { growth_community_id: 'not-a-uuid' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toContain('growth_community_id debe ser un UUID válido');
  });

  // ============================================================
  // Test 11: Consultant cannot use consultant_id filter
  // ============================================================
  it('should return 403 when consultor tries to use consultant_id filter', async () => {
    mockGetApiUser.mockResolvedValue({
      user: { id: CONSULTOR_ID, email: 'consultor@test.com' },
      error: null,
    });
    mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient());
    mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
    mockGetHighestRole.mockReturnValue('consultor');

    const { req, res } = createMocks({
      method: 'GET',
      query: { consultant_id: ADMIN_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error).toContain('Solo administradores pueden filtrar por consultant_id');
  });

  // ============================================================
  // total_hours_actual is derived from the hours ledger, not from
  // actual_duration_minutes (Zoom plan §11 hours-consumer audit).
  // ============================================================

  describe('total_hours_actual from contract_hours_ledger', () => {
    const S_RESERVADA = '77777777-7777-4777-8777-000000000001';
    const S_CONSUMIDA = '77777777-7777-4777-8777-000000000002';
    const S_DEVUELTA = '77777777-7777-4777-8777-000000000003';
    const S_PENALIZADA = '77777777-7777-4777-8777-000000000004';
    const S_SIN_LEDGER = '77777777-7777-4777-8777-000000000005';
    const S_OVERRIDE = '77777777-7777-4777-8777-000000000006';

    function ledgerSession(
      id: string,
      day: string,
      scheduledMinutes: number,
      status = 'completada'
    ): Row {
      return {
        id,
        title: `Sesion ${day}`,
        session_date: `2026-06-${day}`,
        status,
        modality: 'online',
        school_id: 1,
        growth_community_id: GC_ID,
        scheduled_duration_minutes: scheduledMinutes,
        is_active: true,
      };
    }

    const statusMatrix: ClientOverrides = {
      sessions: [
        ledgerSession(S_RESERVADA, '01', 240),
        ledgerSession(S_CONSUMIDA, '02', 240),
        ledgerSession(S_DEVUELTA, '03', 240),
        ledgerSession(S_PENALIZADA, '04', 240),
        ledgerSession(S_SIN_LEDGER, '05', 90),
        ledgerSession(S_OVERRIDE, '06', 240),
      ],
      ledger: [
        { session_id: S_RESERVADA, status: 'reservada', hours: 3 },
        { session_id: S_CONSUMIDA, status: 'consumida', hours: 2.25 },
        // executeCancellation rewrites only the status, so a devuelta row still holds the
        // full originally-reserved amount. Counting it would bill returned hours.
        { session_id: S_DEVUELTA, status: 'devuelta', hours: 4 },
        { session_id: S_PENALIZADA, status: 'penalizada', hours: 0.75 },
        // S_SIN_LEDGER deliberately has no row.
        { session_id: S_OVERRIDE, status: 'consumida', hours: 1.1, admin_override: true },
      ],
      attendees: [],
      facilitators: [],
    };

    async function kpisFor(overrides: ClientOverrides, log: QueryLog[] = []) {
      asAdmin();
      mockCreateServiceRoleClient.mockReturnValue(createMockSupabaseClient(overrides, log));

      const { req, res } = createMocks({ method: 'GET' });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(200);
      return res._getJSONData().data.kpis;
    }

    it('counts consumida and penalizada, and excludes reservada and devuelta', async () => {
      const kpis = await kpisFor(statusMatrix);

      // 2.25 (consumida) + 0.75 (penalizada) + 1.1 (override) = 4.1. The reservada 3h and
      // devuelta 4h contribute nothing, and neither does S_SIN_LEDGER: with no ledger row
      // there is no billing record for this aggregate to report.
      expect(kpis.total_hours_actual).toBe(4.1);

      // The scheduled KPI is untouched by this change: (240 * 5 + 90) / 60.
      expect(kpis.total_hours_scheduled).toBe(21.5);
    });

    it('contributes 0 for an unapproved session with no ledger row', async () => {
      const kpis = await kpisFor({
        sessions: [ledgerSession(S_SIN_LEDGER, '05', 90, 'borrador')],
        ledger: [],
        attendees: [],
        facilitators: [],
      });

      // STEP 2's query filters on is_active, school, date and consultant — there is no
      // status filter — so borrador and pendiente_aprobacion sessions reach this KPI. They
      // have no billing record, so the ledger-derived aggregate must not claim the school
      // was charged for them. A `reservada` session, which at least reached approval,
      // already returns 0; a borrador one cannot honestly return more.
      expect(kpis.total_hours_actual).toBe(0);

      // The fixture's scheduled duration is non-zero, so the 0 above is the mode's answer
      // and not an artefact of an empty fixture. total_hours_scheduled is not ledger-
      // derived and still counts it.
      expect(kpis.total_hours_scheduled).toBe(1.5);
    });

    it('passes an admin_override row through with its adjusted hours', async () => {
      const kpis = await kpisFor({
        sessions: [ledgerSession(S_OVERRIDE, '06', 240)],
        ledger: [{ session_id: S_OVERRIDE, status: 'consumida', hours: 1.1, admin_override: true }],
        attendees: [],
        facilitators: [],
      });

      // The override-adjusted value, not the 4h the session was scheduled for.
      expect(kpis.total_hours_actual).toBe(1.1);
    });

    it('reads the ledger with one .in() over the sessions it already loaded', async () => {
      const log: QueryLog[] = [];
      await kpisFor(statusMatrix, log);

      const ledgerQueries = log.filter((entry) => entry.table === 'contract_hours_ledger');
      expect(ledgerQueries).toHaveLength(1);
      expect(ledgerQueries[0].select).toBe('session_id, status, hours, effective_minutes');
      expect(ledgerQueries[0].filters).toEqual([
        {
          column: 'session_id',
          kind: 'in',
          values: statusMatrix.sessions!.map((s) => s.id),
        },
      ]);

      // The deprecated column is no longer read by this consumer.
      const sessionQueries = log.filter((entry) => entry.table === 'consultor_sessions');
      expect(sessionQueries.length).toBeGreaterThan(0);
      for (const entry of sessionQueries) {
        expect(entry.select).not.toMatch(/actual_duration_minutes/);
      }
    });

    it('fails with 500 rather than reporting zero hours when the ledger read errors', async () => {
      asAdmin();
      mockCreateServiceRoleClient.mockReturnValue(
        createMockSupabaseClient({
          ...statusMatrix,
          // The ledger without its hours column: PostgREST answers 42703.
          schemaOverrides: {
            contract_hours_ledger: { columns: ['id', 'session_id', 'status'] },
          },
        })
      );

      const { req, res } = createMocks({ method: 'GET' });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toContain('libro de horas');
    });
  });
});
