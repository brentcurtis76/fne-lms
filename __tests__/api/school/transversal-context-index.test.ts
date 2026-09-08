// @vitest-environment node
/**
 * GET/POST /api/school/transversal-context (index)
 *
 * Review remediation (R1–R3, R5) on top of PR 2: the route validates FAIL
 * CLOSED (exact GradeLevel allowlist, integer year), denies consultores on
 * GET and POST, reads with the user client, and delegates the whole
 * context + course reconciliation to ONE transactional RPC
 * (save_transversal_context) on the user client — it never writes a table
 * itself and never answers a partial success. The real handler runs with the
 * real `lib/permissions/directivo` helpers; only `lib/api-auth` is mocked.
 * Table mocks RECORD every chained call and EVALUATE predicates against
 * fixture rows; the rpc mock records its arguments.
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

import handler, { validateContextBody, mapSaveRpcError, MAX_COURSES_PER_LEVEL } from '@/pages/api/school/transversal-context/index';

// ── Synthetic identities ───────────────────────────────────────
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;
const CONTEXT_ID = 'c0000000-0000-4000-8000-000000000001';
const COURSE_A = 'a0000000-0000-4000-8000-00000000000a';
const COURSE_B = 'b0000000-0000-4000-8000-00000000000b';
const DOCENTE_ID = 'd0000000-0000-4000-8000-00000000000d';
const SNAPSHOT_ID = 'f0000000-0000-4000-8000-00000000000f';

const CONTEXT_TABLE = 'school_transversal_context';
const COURSE_TABLE = 'school_course_structure';
const ASSIGNMENTS_TABLE = 'school_course_docente_assignments';
const INSTANCES_TABLE = 'assessment_instances';

// ── Recording, predicate-evaluating table mock ─────────────────
type Call = { method: string; args: unknown[] };
type Row = Record<string, unknown>;
type Outcome = { data: unknown; error: unknown; count: number | null };

interface TableSpec {
  rows?: Row[];
  readError?: unknown;
  /** Error for write chains; may target one verb only. */
  writeError?: unknown | ((write: Call, calls: Call[]) => unknown);
  /** id given to a single inserted row */
  insertId?: string;
}

const WRITES = ['insert', 'update', 'delete', 'upsert'];

function applyPredicates(rows: Row[], calls: Call[]): Row[] {
  let out = [...rows];
  for (const c of calls) {
    if (c.method === 'eq') out = out.filter(r => r[c.args[0] as string] === c.args[1]);
    if (c.method === 'neq') out = out.filter(r => r[c.args[0] as string] !== c.args[1]);
    if (c.method === 'in') out = out.filter(r => (c.args[1] as unknown[]).includes(r[c.args[0] as string]));
  }
  const limit = calls.find(c => c.method === 'limit');
  if (limit) out = out.slice(0, limit.args[0] as number);
  return out;
}

function shape(rows: Row[], calls: Call[]): Outcome {
  const single = calls.some(c => c.method === 'single');
  const maybe = calls.some(c => c.method === 'maybeSingle');
  if (single || maybe) {
    if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' }, count: null };
    if (rows.length === 0) return { data: null, error: single ? { code: 'PGRST116', message: 'no rows' } : null, count: null };
    return { data: rows[0], error: null, count: null };
  }
  return { data: rows, error: null, count: null };
}

function evaluate(calls: Call[], spec: TableSpec): Outcome {
  const write = calls.find(c => WRITES.includes(c.method));
  if (write) {
    const err = typeof spec.writeError === 'function'
      ? (spec.writeError as (w: Call, c: Call[]) => unknown)(write, calls)
      : spec.writeError ?? null;
    if (err) return { data: null, error: err, count: null };
    if (write.method === 'insert') {
      const payload = write.args[0] as Row | Row[];
      if (Array.isArray(payload)) return { data: payload, error: null, count: null };
      return shape([{ id: spec.insertId ?? 'inserted-id', ...payload }], calls);
    }
    const matched = applyPredicates(spec.rows ?? [], calls);
    if (write.method === 'update') {
      const patch = write.args[0] as Row;
      return shape(matched.map(r => ({ ...r, ...patch })), calls);
    }
    return { data: matched, error: null, count: null }; // delete: rows removed
  }
  if (spec.readError) return { data: null, error: spec.readError, count: null };
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

type RpcOutcome = { data: unknown; error: unknown } | (() => never);

function buildClient(tables: Record<string, RecordingTable>, rpcOutcome: RpcOutcome = { data: null, error: null }) {
  const fallback = recordingTable();
  return {
    from: vi.fn((table: string) => (tables[table] ?? fallback).open()),
    rpc: vi.fn(async (_fn: string, _args: unknown) => {
      if (typeof rpcOutcome === 'function') return rpcOutcome();
      return rpcOutcome;
    }),
    tables,
  };
}

const isWrite = (chain: Call[]) => chain.some(c => WRITES.includes(c.method));
const writeChains = (t: RecordingTable | undefined) => (t ? t.chains.filter(isWrite) : []);
const methods = (chain: Call[]) => chain.map(c => c.method);
const call = (chain: Call[], method: string) => chain.find(c => c.method === method);

// ── Fixtures ───────────────────────────────────────────────────
const roleRow = (roleType: string, schoolId: number | null = SCHOOL_ID): Row => ({
  user_id: USER_ID, role_type: roleType, school_id: schoolId, is_active: true,
});

const contextRow = (): Row => ({
  id: CONTEXT_ID,
  school_id: SCHOOL_ID,
  total_students: 100,
  grade_levels: ['1_basico'],
  courses_per_level: { '1_basico': 2 },
  implementation_year_2026: 1,
  period_system: 'semestral',
  created_at: '2026-01-01T00:00:00.000Z',
});

const courseRow = (id: string, name: string, gradeLevel = '1_basico'): Row => ({
  id, school_id: SCHOOL_ID, grade_level: gradeLevel, course_name: name, grade_id: 5,
});

const validBody = (overrides: Record<string, unknown> = {}) => ({
  school_id: SCHOOL_ID,
  total_students: 100,
  grade_levels: ['1_basico'],
  courses_per_level: { '1_basico': 1 },
  implementation_year_2026: 1,
  period_system: 'semestral',
  programa_inicia_completed: false,
  ...overrides,
});

interface Scenario {
  roles?: Row[];
  consultantAssignments?: Row[];
  contexts?: Row[];
  contextSpec?: Partial<TableSpec>;
  courses?: Row[];
  courseSpec?: Partial<TableSpec>;
  assignments?: Row[];
  instances?: Row[];
  instancesSpec?: Partial<TableSpec>;
  /** What the user client's rpc('save_transversal_context') answers (or throws). */
  rpc?: RpcOutcome;
}

/** A successful RPC payload as the database function returns it. */
const rpcSuccess = (overrides: Record<string, unknown> = {}) => ({
  data: {
    context: { ...contextRow(), is_completed: true },
    action: 'initial_save',
    courses_generated: 2,
    courses_deleted: 0,
    courses_relinked: 0,
    year_changed: false,
    ...overrides,
  },
  error: null,
});

function arrange(s: Scenario = {}) {
  const userTables = {
    user_roles: recordingTable({ rows: s.roles ?? [roleRow('equipo_directivo')] }),
    consultant_assignments: recordingTable({ rows: s.consultantAssignments ?? [] }),
    [CONTEXT_TABLE]: recordingTable({ rows: s.contexts ?? [], insertId: CONTEXT_ID, ...s.contextSpec }),
    [COURSE_TABLE]: recordingTable({ rows: s.courses ?? [], ...s.courseSpec }),
  };
  const serviceTables = {
    ab_grades: recordingTable({ rows: [{ id: 5, sort_order: 5 }, { id: 6, sort_order: 6 }] }),
    [COURSE_TABLE]: recordingTable({ rows: s.courses ?? [], ...s.courseSpec }),
    [ASSIGNMENTS_TABLE]: recordingTable({ rows: s.assignments ?? [] }),
    [INSTANCES_TABLE]: recordingTable({ rows: s.instances ?? [], ...s.instancesSpec }),
    profiles: recordingTable({ rows: [{ id: USER_ID, name: 'Directora Prueba' }] }),
    school_change_history: recordingTable(),
    [CONTEXT_TABLE]: recordingTable({ rows: s.contexts ?? [] }),
  };
  const userClient = buildClient(userTables, s.rpc ?? rpcSuccess());
  const serviceClient = buildClient(serviceTables);
  mockCreateApiSupabaseClient.mockResolvedValue(userClient);
  mockCreateServiceRoleClient.mockReturnValue(serviceClient);
  return { userClient, serviceClient, userTables, serviceTables };
}

async function post(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

async function get(query: Record<string, string>) {
  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

/** Nothing was written anywhere, on either client. */
function expectNoWrites(clients: { userClient: any; serviceClient: any }) {
  for (const client of [clients.userClient, clients.serviceClient]) {
    for (const table of Object.values(client.tables) as RecordingTable[]) {
      expect(writeChains(table)).toHaveLength(0);
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
});

// ══════════════════════════════════════════════════════════════

/** The RPC was never called and nothing was written anywhere. */
function expectNoSave(clients: { userClient: any; serviceClient: any }) {
  expect(clients.userClient.rpc).not.toHaveBeenCalled();
  expectNoWrites(clients);
}

const rpcArgs = (userClient: any) => userClient.rpc.mock.calls[0];

describe('validateContextBody', () => {
  it('normalises courses_per_level to the submitted grade levels and defaults missing ones to 1', () => {
    const result = validateContextBody(validBody({
      grade_levels: ['1_basico', '2_basico'],
      courses_per_level: { '1_basico': 3, '3_basico': 9 },
    }));
    expect(result).toEqual({ ok: true, coursesPerLevel: { '1_basico': 3, '2_basico': 1 } });
  });

  it.each([
    ['missing total_students', { total_students: undefined }],
    ['zero students', { total_students: 0 }],
    ['fractional students', { total_students: 10.5 }],
    ['empty grade_levels', { grade_levels: [] }],
    ['non-string grade level', { grade_levels: [1] }],
    ['unknown grade string', { grade_levels: ['grade 1'] }],
    ['case-different grade string', { grade_levels: ['1_BASICO'] }],
    ['duplicate grade levels', { grade_levels: ['1_basico', '1_basico'] }],
    ['year 0', { implementation_year_2026: 0 }],
    ['year 6', { implementation_year_2026: 6 }],
    ['fractional year', { implementation_year_2026: 1.5 }],
    ['string year', { implementation_year_2026: '2' }],
    ['unknown period', { period_system: 'anual' }],
    ['courses_per_level as array', { courses_per_level: [1] }],
    ['courses above the cap', { courses_per_level: { '1_basico': MAX_COURSES_PER_LEVEL + 1 } }],
    ['fractional courses', { courses_per_level: { '1_basico': 1.5 } }],
    ['zero courses', { courses_per_level: { '1_basico': 0 } }],
  ])('rejects %s', (_label, overrides) => {
    const result = validateContextBody(validBody(overrides as Record<string, unknown>));
    expect(result.ok).toBe(false);
  });

  it('accepts the cap itself and every GradeLevel', () => {
    const result = validateContextBody(validBody({
      grade_levels: ['medio_menor', 'medio_mayor', 'pre_kinder', 'kinder', '1_basico', '2_basico', '3_basico', '4_basico',
        '5_basico', '6_basico', '7_basico', '8_basico', '1_medio', '2_medio', '3_medio', '4_medio'],
      courses_per_level: { '4_medio': MAX_COURSES_PER_LEVEL },
    }));
    expect(result.ok).toBe(true);
  });
});

describe('mapSaveRpcError', () => {
  it('maps 42501 to 403 context_write_forbidden', () => {
    expect(mapSaveRpcError({ code: '42501', message: 'permission_denied' })).toMatchObject({ status: 403, code: 'context_write_forbidden' });
  });

  it('maps courses_have_dependencies with its DETAIL to 409 and the blocked list', () => {
    const detail = JSON.stringify([{ id: COURSE_B, course_name: '1 BASICO B', grade_level: '1_basico',
      activeAssignments: 0, inactiveAssignments: 1, instances: 0, archivedInstances: 2 }]);
    const mapped = mapSaveRpcError({ code: 'P0001', message: 'courses_have_dependencies', details: detail });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe('courses_have_dependencies');
    expect(mapped.error).toContain('1 BASICO B');
    expect(mapped.blockedCourses).toEqual([{ id: COURSE_B, course_name: '1 BASICO B', grade_level: '1_basico',
      activeAssignments: 0, inactiveAssignments: 1, instances: 0, archivedInstances: 2 }]);
  });

  it('tolerates a malformed DETAIL (still 409, empty list)', () => {
    const mapped = mapSaveRpcError({ code: 'P0001', message: 'courses_have_dependencies', details: 'not json' });
    expect(mapped).toMatchObject({ status: 409, code: 'courses_have_dependencies', blockedCourses: [] });
  });

  it.each([
    ['invalid_year', 400],
    ['invalid_grade_level:grade 1', 400],
    ['invalid_courses_per_level:1_basico', 400],
    ['duplicate_grade_levels', 400],
    ['invalid_payload', 400],
    ['grade_mapping_missing:4_medio', 409],
    ['grade_mapping_ambiguous:3_basico', 409],
  ])('maps P0001 %s to %i', (message, status) => {
    const mapped = mapSaveRpcError({ code: 'P0001', message });
    expect(mapped.status).toBe(status);
    expect(mapped.code).toBe(message.split(':')[0]);
  });

  it('maps an unknown P0001 and any other error to a generic 500', () => {
    expect(mapSaveRpcError({ code: 'P0001', message: 'something_else' })).toMatchObject({ status: 500, code: 'context_save_failed' });
    expect(mapSaveRpcError({ code: '40P01', message: 'deadlock detected' })).toMatchObject({ status: 500, code: 'context_save_failed' });
    expect(mapSaveRpcError(undefined)).toMatchObject({ status: 500 });
  });
});

describe('POST /api/school/transversal-context — validation before the RPC', () => {
  it.each([
    ['courses_per_level above the cap', { courses_per_level: { '1_basico': MAX_COURSES_PER_LEVEL + 1 } }],
    ['a non-string grade level', { grade_levels: [42] }],
    ['an unknown grade string', { grade_levels: ['primero'] }],
    ['a fractional year', { implementation_year_2026: 2.5 }],
    ['a string year', { implementation_year_2026: '2' }],
  ])('answers 400 for %s and never calls the RPC', async (_label, overrides) => {
    const clients = arrange();
    const { status, json } = await post(validBody(overrides as Record<string, unknown>));
    expect(status).toBe(400);
    expect(json).toMatchObject({ success: false, code: 'invalid_request' });
    expectNoSave(clients);
  });
});

describe('POST — the transactional RPC', () => {
  it('calls save_transversal_context ONCE on the USER client with the normalised payload', async () => {
    const clients = arrange();
    const { status, json } = await post(validBody({
      grade_levels: ['1_basico', '2_basico'],
      courses_per_level: { '1_basico': 2, '9_basico': 4 },
      programa_inicia_completed: true,
      programa_inicia_hours: 40,
    }));

    expect(status).toBe(200);
    expect(clients.userClient.rpc).toHaveBeenCalledTimes(1);
    expect(clients.serviceClient.rpc).not.toHaveBeenCalled();
    const [fn, args] = rpcArgs(clients.userClient);
    expect(fn).toBe('save_transversal_context');
    expect(args).toEqual({
      p_school_id: SCHOOL_ID,
      p_payload: {
        total_students: 100,
        grade_levels: ['1_basico', '2_basico'],
        courses_per_level: { '1_basico': 2, '2_basico': 1 },
        implementation_year_2026: 1,
        period_system: 'semestral',
        programa_inicia_completed: true,
        programa_inicia_hours: 40,
        programa_inicia_year: null,
      },
    });
    // No table write is issued by the route itself: the RPC is the only writer.
    expectNoWrites(clients);
    expect(json).toMatchObject({
      success: true,
      message: 'Contexto guardado exitosamente',
      coursesGenerated: 2,
      coursesDeleted: 0,
      yearChanged: false,
      warning: null,
    });
    expect(json.context).toMatchObject({ id: CONTEXT_ID, is_completed: true });
  });

  it('reports an update with its counts and warns explicitly when the year changed (instances stay frozen)', async () => {
    arrange({ rpc: rpcSuccess({ action: 'update', courses_generated: 1, courses_deleted: 1, courses_relinked: 2, year_changed: true }) });
    const { status, json } = await post(validBody({ implementation_year_2026: 3 }));
    expect(status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      message: 'Contexto actualizado exitosamente',
      coursesGenerated: 1,
      coursesDeleted: 1,
      coursesRelinked: 2,
      yearChanged: true,
    });
    expect(json.warning).toContain('conservan el año');
  });

  it('answers 409 courses_have_dependencies with the blocked courses (inactive assignment, archived instance) — nothing written', async () => {
    const detail = JSON.stringify([
      { id: COURSE_A, course_name: '1 BASICO A', grade_level: '1_basico', activeAssignments: 0, inactiveAssignments: 1, instances: 0, archivedInstances: 0 },
      { id: COURSE_B, course_name: '1 BASICO B', grade_level: '1_basico', activeAssignments: 0, inactiveAssignments: 0, instances: 0, archivedInstances: 1 },
    ]);
    const clients = arrange({ rpc: { data: null, error: { code: 'P0001', message: 'courses_have_dependencies', details: detail } } });
    const { status, json } = await post(validBody());
    expect(status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.code).toBe('courses_have_dependencies');
    expect(json.blockedCourses).toHaveLength(2);
    expect(json.blockedCourses[0]).toMatchObject({ id: COURSE_A, inactiveAssignments: 1, activeAssignments: 0 });
    expect(json.blockedCourses[1]).toMatchObject({ id: COURSE_B, archivedInstances: 1, instances: 0 });
    expect(json.error).toContain('1 BASICO A, 1 BASICO B');
    expectNoWrites(clients);
  });

  it('answers 409 when the grade mapping is missing (no course is ever created without a grade)', async () => {
    const clients = arrange({ rpc: { data: null, error: { code: 'P0001', message: 'grade_mapping_missing:4_medio' } } });
    const { status, json } = await post(validBody({ grade_levels: ['4_medio'] }));
    expect(status).toBe(409);
    expect(json.code).toBe('grade_mapping_missing');
    expectNoWrites(clients);
  });

  it('answers 400 when the database re-validation refuses (defence in depth)', async () => {
    arrange({ rpc: { data: null, error: { code: 'P0001', message: 'invalid_year' } } });
    const { status, json } = await post(validBody());
    expect(status).toBe(400);
    expect(json.code).toBe('invalid_year');
  });

  it('answers 403 when the database refuses the caller (42501)', async () => {
    arrange({ rpc: { data: null, error: { code: '42501', message: 'permission_denied' } } });
    const { status, json } = await post(validBody());
    expect(status).toBe(403);
    expect(json.code).toBe('context_write_forbidden');
  });

  it('answers 500 (never a partial success) on an unknown RPC error, a thrown call, or an empty result', async () => {
    arrange({ rpc: { data: null, error: { code: '40P01', message: 'deadlock detected' } } });
    expect((await post(validBody())).status).toBe(500);

    arrange({ rpc: () => { throw new Error('network'); } });
    expect((await post(validBody())).status).toBe(500);

    arrange({ rpc: { data: {}, error: null } });
    const { status, json } = await post(validBody());
    expect(status).toBe(500);
    expect(json).toMatchObject({ success: false, code: 'context_save_failed' });
  });
});

describe('GET — reads with the user client (RLS decides)', () => {
  it('reads the context and the course structure with the USER client; only profile names use the service role', async () => {
    const clients = arrange({
      contexts: [contextRow()],
      courses: [{ ...courseRow(COURSE_A, '1 BASICO A'), school_course_docente_assignments: [{ id: 'as-1', docente_id: DOCENTE_ID, is_active: true, assigned_at: null }] }],
    });
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(200);
    expect(json.context).toMatchObject({ id: CONTEXT_ID });
    expect(json.courseStructure).toHaveLength(1);
    expect(clients.userClient.from).toHaveBeenCalledWith(COURSE_TABLE);
    expect(clients.serviceClient.from).not.toHaveBeenCalledWith(COURSE_TABLE);
    expect(clients.serviceClient.from).not.toHaveBeenCalledWith(CONTEXT_TABLE);
    expect(clients.serviceClient.from).toHaveBeenCalledWith('profiles');
  });

  it('answers 500 when the course structure read fails (no silent empty list)', async () => {
    arrange({ courseSpec: { readError: { message: 'boom' } } });
    const { status } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(500);
  });
});

describe('tenancy (R5: consultor surface denied pending the product decision)', () => {
  const consultorScenario = () => ({
    roles: [roleRow('consultor', null)],
    consultantAssignments: [{ consultant_id: USER_ID, school_id: SCHOOL_ID, is_active: true }],
    contexts: [contextRow()],
    courses: [courseRow(COURSE_A, '1 BASICO A')],
  });

  it('refuses an assigned consultor on GET with 403 consultor_access_pending_decision and reads no context/course data', async () => {
    const clients = arrange(consultorScenario());
    const { status, json } = await get({ school_id: String(SCHOOL_ID) });
    expect(status).toBe(403);
    expect(json.code).toBe('consultor_access_pending_decision');
    expect(clients.userClient.from).not.toHaveBeenCalledWith(CONTEXT_TABLE);
    expect(clients.userClient.from).not.toHaveBeenCalledWith(COURSE_TABLE);
    expect(clients.serviceClient.from).not.toHaveBeenCalled();
  });

  it('refuses that consultor on POST with the same 403 before the RPC', async () => {
    const clients = arrange(consultorScenario());
    const { status, json } = await post(validBody());
    expect(status).toBe(403);
    expect(json.code).toBe('consultor_access_pending_decision');
    expectNoSave(clients);
  });

  it('refuses a directivo of another school with 403', async () => {
    const clients = arrange({ roles: [roleRow('equipo_directivo', OTHER_SCHOOL_ID)] });
    const { status } = await post(validBody());
    expect(status).toBe(403);
    expectNoSave(clients);
  });

  it('refuses a docente with 403', async () => {
    const clients = arrange({ roles: [roleRow('docente')] });
    expect((await post(validBody())).status).toBe(403);
    expect((await get({ school_id: String(SCHOOL_ID) })).status).toBe(403);
    expectNoSave(clients);
  });

  it('lets an admin write for the requested school (RPC gets that school id) without a write-role lookup', async () => {
    const clients = arrange({ roles: [roleRow('admin', null)] });
    const { status } = await post(validBody({ school_id: OTHER_SCHOOL_ID }));
    expect(status).toBe(200);
    expect(rpcArgs(clients.userClient)[1]).toMatchObject({ p_school_id: OTHER_SCHOOL_ID });
  });

  it('lets a directivo without a body school_id write for their own school', async () => {
    const clients = arrange();
    const { status } = await post(validBody({ school_id: undefined }));
    expect(status).toBe(200);
    expect(rpcArgs(clients.userClient)[1]).toMatchObject({ p_school_id: SCHOOL_ID });
  });

  it('requires school_id for admins', async () => {
    const clients = arrange({ roles: [roleRow('admin', null)] });
    const { status } = await post(validBody({ school_id: undefined }));
    expect(status).toBe(400);
    expectNoSave(clients);
  });

  it('answers 401 when unauthenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: { message: 'no session' } });
    const clients = arrange();
    const { status } = await post(validBody());
    expect(status).toBe(401);
    expectNoSave(clients);
  });

  it('answers 405 for other methods', async () => {
    arrange();
    const { req, res } = createMocks({ method: 'DELETE' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });
});
