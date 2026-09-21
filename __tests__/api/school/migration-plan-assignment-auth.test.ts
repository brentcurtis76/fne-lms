// @vitest-environment node
/**
 * GET/PUT /api/school/migration-plan — assignment-scoped consultor access
 * (PROC-CONSULTOR-C1, R1-F1 / R2-F1).
 *
 * `consultant_assignments` is readable only by global admins under RLS, so the
 * route gives the permission lookup a trusted read of that one table for the
 * authenticated user, while the role lookup and every plan read and write stay
 * on the caller client. An admitted consultor is read-only: the route refuses
 * its PUT with 403 before any plan, history or completion-status access. These
 * tests run the real handler with the real `lib/permissions/directivo` helper
 * and mock only `lib/api-auth`, so each assertion names the exact client that
 * touched each table. Table mocks record every chained call and evaluate
 * predicates against fixture rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Autenticación requerida' });
  }),
  handleMethodNotAllowed: vi.fn((res: any) => {
    res.status(405).json({ error: 'Método no permitido' });
  }),
}));

import handler from '@/pages/api/school/migration-plan/index';

// ── Synthetic identities ───────────────────────────────────────
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_ID = 9980;
const OTHER_SCHOOL_ID = 9981;

const PLAN_TABLE = 'ab_migration_plan';
const CONTEXT_TABLE = 'school_transversal_context';
const GRADES_TABLE = 'ab_grades';
const ROLES_TABLE = 'user_roles';
const ASSIGNMENTS_TABLE = 'consultant_assignments';
const HISTORY_TABLE = 'school_change_history';
const STATUS_TABLE = 'school_plan_completion_status';
/** Every table that holds or derives migration-plan data. */
const PLAN_DATA_TABLES = [PLAN_TABLE, CONTEXT_TABLE, GRADES_TABLE];
/** Every table a successful save writes, on either client. */
const SAVE_WRITE_TABLES = [PLAN_TABLE, HISTORY_TABLE, STATUS_TABLE];

const DENIED = 'Solo directivos y administradores pueden acceder al plan de migración';

// ── Recording, predicate-evaluating table mock ─────────────────
type Call = { method: string; args: unknown[] };
type Row = Record<string, unknown>;
type Outcome = { data: unknown; error: unknown };

interface TableSpec {
  rows?: Row[];
  readError?: unknown;
  /** Error for write chains; may target one verb only. */
  writeError?: unknown | ((write: Call) => unknown);
}

const WRITES = ['insert', 'update', 'delete', 'upsert'];

function applyPredicates(rows: Row[], calls: Call[]): Row[] {
  let out = [...rows];
  for (const c of calls) {
    if (c.method === 'eq') out = out.filter(r => r[c.args[0] as string] === c.args[1]);
  }
  const limit = calls.find(c => c.method === 'limit');
  if (limit) out = out.slice(0, limit.args[0] as number);
  return out;
}

function shape(rows: Row[], calls: Call[]): Outcome {
  if (calls.some(c => c.method === 'single')) {
    if (rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null };
}

function evaluate(calls: Call[], spec: TableSpec): Outcome {
  const write = calls.find(c => WRITES.includes(c.method));
  if (write) {
    const err = typeof spec.writeError === 'function'
      ? (spec.writeError as (w: Call) => unknown)(write)
      : spec.writeError ?? null;
    if (err) return { data: null, error: err };
    if (write.method === 'insert') return { data: write.args[0], error: null };
    return { data: applyPredicates(spec.rows ?? [], calls), error: null };
  }
  if (spec.readError) return { data: null, error: spec.readError };
  return shape(applyPredicates(spec.rows ?? [], calls), calls);
}

function recordingTable(spec: TableSpec = {}) {
  const chains: Call[][] = [];
  const open = () => {
    const calls: Call[] = [];
    chains.push(calls);
    const proxyHandler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop) {
        if (prop === 'then') {
          const outcome = evaluate(calls, spec);
          return (resolve: (value: unknown) => void) => resolve(outcome);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return new Proxy({}, proxyHandler);
        };
      },
    };
    return new Proxy({}, proxyHandler) as any;
  };
  return { open, chains };
}
type RecordingTable = ReturnType<typeof recordingTable>;

function buildClient(tables: Record<string, RecordingTable>) {
  const fallback = recordingTable();
  return {
    from: vi.fn((table: string) => (tables[table] ?? fallback).open()),
    tables,
  };
}

const isWrite = (chain: Call[]) => chain.some(c => WRITES.includes(c.method));
const writeChains = (t: RecordingTable | undefined) => (t ? t.chains.filter(isWrite) : []);
/** Tables a client actually opened a chain against. */
const touched = (client: any) =>
  Object.entries(client.tables as Record<string, RecordingTable>)
    .filter(([, t]) => t.chains.length > 0)
    .map(([name]) => name);
const eqValues = (chain: Call[], column: string) =>
  chain.filter(c => c.method === 'eq' && c.args[0] === column).map(c => c.args[1]);
/** Every table a client was asked to open, in order — including ones with no mock. */
const fromCalls = (client: any): string[] => client.from.mock.calls.map(([table]: [string]) => table);
const writeVerb = (chain: Call[]) => chain.find(c => WRITES.includes(c.method))?.method;

// ── Fixtures ───────────────────────────────────────────────────
const roleRow = (roleType: string, schoolId: number | null = null): Row => ({
  user_id: USER_ID, role_type: roleType, school_id: schoolId, is_active: true,
});

const assignmentRow = (schoolId: number, isActive = true): Row => ({
  consultant_id: USER_ID, school_id: schoolId, is_active: isActive,
});

const planRow = (schoolId: number, yearNumber: number, gradeId: number): Row => ({
  id: `plan-${schoolId}-${yearNumber}-${gradeId}`,
  school_id: schoolId,
  year_number: yearNumber,
  grade_id: gradeId,
  generation_type: gradeId <= 6 ? 'GT' : 'GI',
});

const GRADE_ROWS: Row[] = [
  { id: 6, name: 'Segundo Básico', sort_order: 6, is_always_gt: true },
  { id: 7, name: 'Tercero Básico', sort_order: 7, is_always_gt: false },
];

/** A valid save that flips the fixture's grade-7 entry from GI to GT. */
const saveBody = (schoolId: number) => ({
  school_id: schoolId,
  entries: [{ year_number: 1, grade_id: 7, generation_type: 'GT' }],
});

interface Scenario {
  roles?: Row[];
  assignments?: Row[];
  assignmentsSpec?: Partial<TableSpec>;
  planRows?: Row[];
  /** Makes `createServiceRoleClient()` throw, as a missing service key does. */
  serviceClientThrows?: boolean;
}

function arrange(s: Scenario = {}) {
  const callerTables = {
    [PLAN_TABLE]: recordingTable({ rows: s.planRows ?? [] }),
    [CONTEXT_TABLE]: recordingTable({ rows: [{ school_id: SCHOOL_ID, implementation_year_2026: 1, created_at: '2026-01-01' }] }),
    [GRADES_TABLE]: recordingTable({ rows: GRADE_ROWS }),
    // RLS lets a caller read its own roles, but exposes no assignment row.
    [ROLES_TABLE]: recordingTable({ rows: s.roles ?? [roleRow('consultor')] }),
    [ASSIGNMENTS_TABLE]: recordingTable({ rows: [] }),
  };
  const serviceTables = {
    [ROLES_TABLE]: recordingTable({ rows: s.roles ?? [roleRow('consultor')] }),
    [ASSIGNMENTS_TABLE]: recordingTable({ rows: s.assignments ?? [], ...s.assignmentsSpec }),
    [PLAN_TABLE]: recordingTable({ rows: s.planRows ?? [] }),
    [CONTEXT_TABLE]: recordingTable(),
    [GRADES_TABLE]: recordingTable({ rows: GRADE_ROWS }),
    profiles: recordingTable({ rows: [{ id: USER_ID, name: 'Consultora Prueba' }] }),
    school_change_history: recordingTable(),
    school_plan_completion_status: recordingTable(),
  };
  const callerClient = buildClient(callerTables);
  const serviceClient = buildClient(serviceTables);
  mockCreateApiSupabaseClient.mockResolvedValue(callerClient);
  if (s.serviceClientThrows) {
    mockCreateServiceRoleClient.mockImplementation(() => { throw new Error('Server configuration error'); });
  } else {
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);
  }
  return { callerClient, serviceClient, callerTables, serviceTables };
}

async function get(query: Record<string, string>) {
  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

async function put(body: unknown) {
  const { req, res } = createMocks({ method: 'PUT', body });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

/** No plan table was read or written on either client. */
function expectNoPlanDataAccess(clients: { callerClient: any; serviceClient: any }) {
  for (const client of [clients.callerClient, clients.serviceClient]) {
    for (const table of PLAN_DATA_TABLES) {
      expect(touched(client)).not.toContain(table);
    }
  }
}

/**
 * The request opened exactly the two permission reads — roles on the caller
 * client, the assignment on the trusted one — and nothing else on either, so
 * no plan, history or status table was read or written.
 */
function expectRefusedBeforePlanAccess(ctx: ReturnType<typeof arrange>) {
  expect(fromCalls(ctx.callerClient)).toEqual([ROLES_TABLE]);
  expect(fromCalls(ctx.serviceClient)).toEqual([ASSIGNMENTS_TABLE]);
  expectNoPlanDataAccess(ctx);
  for (const table of SAVE_WRITE_TABLES) {
    expect(writeChains(ctx.callerTables[table as keyof typeof ctx.callerTables])).toHaveLength(0);
    expect(writeChains(ctx.serviceTables[table as keyof typeof ctx.serviceTables])).toHaveLength(0);
  }
}

/** A full-scope save ran: plan delete + insert on the caller client, audit rows on the trusted one. */
function expectSavePerformed(ctx: ReturnType<typeof arrange>, schoolId: number) {
  const planWrites = writeChains(ctx.callerTables[PLAN_TABLE]);
  expect(planWrites.map(writeVerb)).toEqual(['delete', 'insert']);
  expect(eqValues(planWrites[0], 'school_id')).toEqual([schoolId]);
  expect(planWrites[1].find(c => c.method === 'insert')?.args[0]).toEqual([
    { school_id: schoolId, year_number: 1, grade_id: 7, generation_type: 'GT' },
  ]);
  expect(writeChains(ctx.serviceTables[PLAN_TABLE])).toHaveLength(0);
  expect(writeChains(ctx.serviceTables[HISTORY_TABLE]).map(writeVerb)).toEqual(['insert']);
  expect(writeChains(ctx.serviceTables[STATUS_TABLE]).map(writeVerb)).toEqual(['upsert']);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
});

// ══════════════════════════════════════════════════════════════

describe('D8 — active assigned consultor: GET admitted, PUT refused before plan data', () => {
  it('GET returns that school\'s plan and uses the trusted client for the auth lookup only', async () => {
    const rows = [planRow(SCHOOL_ID, 1, 7), planRow(OTHER_SCHOOL_ID, 1, 7)];
    const ctx = arrange({ assignments: [assignmentRow(SCHOOL_ID)], planRows: rows });

    const { status, json } = await get({ school_id: String(SCHOOL_ID) });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.entries).toEqual([planRow(SCHOOL_ID, 1, 7)]);
    expect(json.grades).toEqual(GRADE_ROWS);
    expect(json.transformation_year).toBe(1);

    // Trusted client: the assignment table for this user, and nothing else.
    expect(touched(ctx.serviceClient)).toEqual([ASSIGNMENTS_TABLE]);
    expect(eqValues(ctx.serviceTables[ASSIGNMENTS_TABLE].chains[0], 'consultant_id')).toEqual([USER_ID]);
    // Roles and all plan data: caller client only, scoped to the requested school.
    expect(touched(ctx.callerClient).sort()).toEqual([ROLES_TABLE, ...PLAN_DATA_TABLES].sort());
    expect(eqValues(ctx.callerTables[PLAN_TABLE].chains[0], 'school_id')).toEqual([SCHOOL_ID]);
    expect(writeChains(ctx.callerTables[PLAN_TABLE])).toHaveLength(0);
  });

  it('PUT of the assigned school is refused with 403 before any plan, history or status access', async () => {
    const ctx = arrange({ assignments: [assignmentRow(SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });

    const { status, json } = await put(saveBody(SCHOOL_ID));

    expect(status).toBe(403);
    expect(json).toEqual({ error: DENIED });
    expectRefusedBeforePlanAccess(ctx);
  });

  it('PUT is refused before body validation, so a malformed body still gets the 403', async () => {
    const ctx = arrange({ assignments: [assignmentRow(SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });

    const { status, json } = await put({ school_id: SCHOOL_ID, entries: 'not-an-array' });

    expect(status).toBe(403);
    expect(json).toEqual({ error: DENIED });
    expectRefusedBeforePlanAccess(ctx);
  });

  it('GET of the exact assigned school still answers 200 after the refused PUT', async () => {
    const ctx = arrange({ assignments: [assignmentRow(SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });

    expect((await put(saveBody(SCHOOL_ID))).status).toBe(403);
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });

    expect(status).toBe(200);
    expect(json.entries).toEqual([planRow(SCHOOL_ID, 1, 7)]);
    expect(writeChains(ctx.callerTables[PLAN_TABLE])).toHaveLength(0);
    expect(writeChains(ctx.serviceTables[HISTORY_TABLE])).toHaveLength(0);
    expect(writeChains(ctx.serviceTables[STATUS_TABLE])).toHaveLength(0);
  });
});

describe('D9 — every other consultor case is denied before plan data, on GET and on PUT', () => {
  it('denies a consultor with no assignment rows', async () => {
    const ctx = arrange({ assignments: [] });
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(403);
    expect(json.error).toBe(DENIED);
    expectNoPlanDataAccess(ctx);
  });

  it('denies a consultor whose only assignment is inactive', async () => {
    const ctx = arrange({ assignments: [assignmentRow(SCHOOL_ID, false)] });
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(403);
    expect(json.error).toBe(DENIED);
    expectNoPlanDataAccess(ctx);
  });

  it('denies a consultor when the assignment lookup errors', async () => {
    const ctx = arrange({ assignmentsSpec: { readError: { code: '42501', message: 'permission denied' } } });
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(403);
    expect(json.error).toBe(DENIED);
    expectNoPlanDataAccess(ctx);
  });

  it('denies a consultor requesting a school it is not assigned to, with no fallback to the assigned one', async () => {
    const ctx = arrange({
      assignments: [assignmentRow(SCHOOL_ID)],
      planRows: [planRow(SCHOOL_ID, 1, 7), planRow(OTHER_SCHOOL_ID, 1, 7)],
    });
    const { status, json } = await get({ school_id: String(OTHER_SCHOOL_ID) });
    expect(status).toBe(403);
    expect(json.error).toBe(DENIED);
    expectNoPlanDataAccess(ctx);
  });

  it('denies when the trusted permission client cannot be created', async () => {
    const ctx = arrange({ serviceClientThrows: true, assignments: [assignmentRow(SCHOOL_ID)] });
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(403);
    expect(json.error).toBe(DENIED);
    // Falls back to the caller client, which RLS shows no assignment row.
    expect(touched(ctx.callerClient)).toEqual([ROLES_TABLE, ASSIGNMENTS_TABLE]);
    expectNoPlanDataAccess(ctx);
  });

  it('refuses a PUT from a consultor with no assignment rows', async () => {
    const ctx = arrange({ assignments: [], planRows: [planRow(SCHOOL_ID, 1, 7)] });
    const { status, json } = await put(saveBody(SCHOOL_ID));
    expect(status).toBe(403);
    expect(json).toEqual({ error: DENIED });
    expectRefusedBeforePlanAccess(ctx);
  });

  it('refuses a PUT from a consultor whose only assignment is inactive', async () => {
    const ctx = arrange({ assignments: [assignmentRow(SCHOOL_ID, false)], planRows: [planRow(SCHOOL_ID, 1, 7)] });
    const { status, json } = await put(saveBody(SCHOOL_ID));
    expect(status).toBe(403);
    expect(json).toEqual({ error: DENIED });
    expectRefusedBeforePlanAccess(ctx);
  });

  it('refuses a consultor PUT for a school it is not assigned to', async () => {
    const ctx = arrange({
      assignments: [assignmentRow(SCHOOL_ID)],
      planRows: [planRow(SCHOOL_ID, 1, 7), planRow(OTHER_SCHOOL_ID, 1, 7)],
    });
    const { status, json } = await put(saveBody(OTHER_SCHOOL_ID));
    expect(status).toBe(403);
    expect(json).toEqual({ error: DENIED });
    expectRefusedBeforePlanAccess(ctx);
  });
});

describe('D9 — admin and equipo_directivo access and mutation are retained', () => {
  it('lets an admin read any requested school', async () => {
    const ctx = arrange({ roles: [roleRow('admin')], planRows: [planRow(OTHER_SCHOOL_ID, 1, 7)] });
    const { status, json } = await get({ school_id: String(OTHER_SCHOOL_ID) });
    expect(status).toBe(200);
    expect(json.entries).toEqual([planRow(OTHER_SCHOOL_ID, 1, 7)]);
    // An admin never reaches the consultor branch, so no trusted client is created.
    expect(touched(ctx.serviceClient)).toEqual([]);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(eqValues(ctx.callerTables[PLAN_TABLE].chains[0], 'school_id')).toEqual([OTHER_SCHOOL_ID]);
  });

  it('lets an equipo_directivo read its own school and denies another one', async () => {
    const own = arrange({ roles: [roleRow('equipo_directivo', SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });
    const allowed = await get({ school_id: String(SCHOOL_ID) });
    expect(allowed.status).toBe(200);
    expect(allowed.json.entries).toEqual([planRow(SCHOOL_ID, 1, 7)]);
    expect(touched(own.serviceClient)).toEqual([]);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
    const cross = arrange({ roles: [roleRow('equipo_directivo', SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });
    const refused = await get({ school_id: String(OTHER_SCHOOL_ID) });
    expect(refused.status).toBe(403);
    expect(refused.json.error).toBe(DENIED);
    expectNoPlanDataAccess(cross);
  });

  it('lets an admin PUT any requested school and keeps the audit writes', async () => {
    const ctx = arrange({ roles: [roleRow('admin')], planRows: [planRow(OTHER_SCHOOL_ID, 1, 7)] });

    const { status, json } = await put(saveBody(OTHER_SCHOOL_ID));

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expectSavePerformed(ctx, OTHER_SCHOOL_ID);
  });

  it('lets an equipo_directivo PUT its own school and refuses another one', async () => {
    const own = arrange({ roles: [roleRow('equipo_directivo', SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });
    const allowed = await put(saveBody(SCHOOL_ID));
    expect(allowed.status).toBe(200);
    expect(allowed.json.success).toBe(true);
    expectSavePerformed(own, SCHOOL_ID);

    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
    const cross = arrange({ roles: [roleRow('equipo_directivo', SCHOOL_ID)], planRows: [planRow(SCHOOL_ID, 1, 7)] });
    const refused = await put(saveBody(OTHER_SCHOOL_ID));
    expect(refused.status).toBe(403);
    expect(refused.json).toEqual({ error: DENIED });
    expectNoPlanDataAccess(cross);
    for (const table of SAVE_WRITE_TABLES) {
      expect(writeChains(cross.serviceTables[table as keyof typeof cross.serviceTables])).toHaveLength(0);
    }
    expect(writeChains(cross.callerTables[PLAN_TABLE])).toHaveLength(0);
  });
});
