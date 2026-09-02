// @vitest-environment node
/**
 * POST/DELETE /api/school/transversal-context/assign-docente
 *
 * PROC-CONTAIN-01 (A-02): authorization ordering is preserved, the assignment
 * is preflighted before any write, a failed preflight answers 422 with nothing
 * written, a same-active-docente retry reconciles instead of returning early,
 * and success is only reported when at least one assessment is confirmed.
 *
 * PROC-COURSE-OWNER-01 (C-01): after course/school authorization a course-wide
 * ACTIVE guard refuses a different active docente (409 course_already_assigned)
 * and a multiple-active state (409 assignment_invariant_violation) before any
 * target inspection, preflight, write or automatic assignment; the requested
 * docente must hold an active teaching-eligible role at the course's exact
 * school (422 docente_not_eligible_for_school); both reads fail closed (500).
 *
 * The Supabase mocks below RECORD every chained call and EVALUATE eq/in/limit/
 * maybeSingle against fixture rows, so a test proves the exact predicates the
 * handler sent — an "other school" refusal is a real predicate mismatch, not a
 * mock that returns nothing regardless.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { buildChainableQuery } from '../assessment-builder/_helpers';
import { TEACHING_ELIGIBLE_ROLES } from '../../../utils/roleUtils';

// ── Hoisted mocks ──────────────────────────────────────────────
const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
  mockSendAuthError,
  mockHandleMethodNotAllowed,
  mockHasDirectivoPermission,
  mockTriggerAutoAssignment,
  mockPreflightAutoAssignment,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
  mockTriggerAutoAssignment: vi.fn(),
  mockPreflightAutoAssignment: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: mockSendAuthError,
  handleMethodNotAllowed: mockHandleMethodNotAllowed,
}));

vi.mock('../../../lib/permissions/directivo', () => ({
  hasDirectivoPermission: mockHasDirectivoPermission,
}));

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  triggerAutoAssignment: mockTriggerAutoAssignment,
  preflightAutoAssignment: mockPreflightAutoAssignment,
}));

import handler from '../../../pages/api/school/transversal-context/assign-docente';

// ── Synthetic identities (UUID-shaped, .test domain) ───────────
const USER_ID = '11111111-1111-4111-8111-111111111111';
const DOCENTE_ID = '2a2b2c2d-2e2f-4a2b-8c2d-2e2f2a2b2c2d';
/** Sentinel: the course's CURRENT active docente. Must never appear in a response. */
const CURRENT_DOCENTE_ID = '33333333-3333-4333-8333-333333333333';
const THIRD_DOCENTE_ID = '55555555-5555-4555-8555-555555555555';
const FOURTH_DOCENTE_ID = '66666666-6666-4666-8666-666666666666';
/** The requested docente spelled with upper-case hex digits — the same PostgreSQL uuid VALUE as DOCENTE_ID. */
const DOCENTE_ID_UPPER = DOCENTE_ID.toUpperCase();
const COURSE_STRUCTURE_ID = '44444444-4444-4444-8444-444444444444';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;
const SENTINEL_NAME = 'Docente Sentinela Vigente';
const SENTINEL_EMAIL = 'sentinela.vigente@example.test';
const SENTINEL_ROLE = 'lider_generacion';

const ASSIGNMENTS_TABLE = 'school_course_docente_assignments';
const COURSE_TABLE = 'school_course_structure';

// ── Recording, predicate-evaluating table mock ─────────────────
type Call = { method: string; args: unknown[] };
type Row = Record<string, unknown>;
type Outcome = { data: unknown; error: unknown; count: number | null };
type ErrorSpec = unknown | ((calls: Call[]) => unknown);

interface TableSpec {
  rows?: Row[];
  /** Error returned by read chains (object, or a function of the recorded calls). */
  readError?: ErrorSpec;
  /** Error returned by insert/update/delete chains. */
  writeError?: ErrorSpec;
  /** Replaces the evaluated outcome of a READ chain (e.g. a null or non-array payload). Return undefined to keep the evaluation. */
  readOverride?: (calls: Call[]) => Outcome | undefined;
  /** Runs after each READ is evaluated and may mutate the live fixture rows, so the NEXT read observes a different state. */
  afterRead?: (calls: Call[], rows: Row[]) => void;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostgreSQL compares `uuid` columns by value, so a UUID written with upper-case hex
 * digits equals the canonical lower-case row. The mock mirrors that for UUID-shaped
 * strings only; everything else is strict equality. This keeps the fixture faithful
 * to the database — production validation (the UUID-shape check and the guard's own
 * comparison) is exercised unchanged.
 */
function pgEquals(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string' && UUID_SHAPE.test(a) && UUID_SHAPE.test(b)) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

const resolveError = (spec: ErrorSpec, calls: Call[]) =>
  typeof spec === 'function' ? (spec as (c: Call[]) => unknown)(calls) : spec ?? null;

function evaluate(calls: Call[], spec: TableSpec): Outcome {
  if (calls.some(c => ['insert', 'update', 'delete'].includes(c.method))) {
    return { data: null, error: resolveError(spec.writeError, calls), count: null };
  }
  const readError = resolveError(spec.readError, calls);
  if (readError) return { data: null, error: readError, count: null };
  const override = spec.readOverride?.(calls);
  if (override) return override;

  let rows = [...(spec.rows ?? [])];
  for (const c of calls) {
    if (c.method === 'eq') rows = rows.filter(r => pgEquals(r[c.args[0] as string], c.args[1]));
    if (c.method === 'in') rows = rows.filter(r => (c.args[1] as unknown[]).some(v => pgEquals(r[c.args[0] as string], v)));
  }
  const limit = calls.find(c => c.method === 'limit');
  if (limit) rows = rows.slice(0, limit.args[0] as number);

  const wantsSingle = calls.some(c => c.method === 'single');
  const wantsMaybeSingle = calls.some(c => c.method === 'maybeSingle');
  if (wantsSingle || wantsMaybeSingle) {
    if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' }, count: null };
    if (rows.length === 0) {
      return { data: null, error: wantsSingle ? { code: 'PGRST116', message: 'no rows' } : null, count: null };
    }
    return { data: rows[0], error: null, count: null };
  }
  return { data: rows, error: null, count: null };
}

/**
 * Every from(<table>) opens a new chain. The chain records each method call and,
 * when awaited, evaluates the recorded predicates against the fixture rows.
 */
function recordingTable(spec: TableSpec = {}) {
  const chains: Call[][] = [];
  /** The outcome each chain resolved to, by chain index — proof of what the handler actually received. */
  const outcomes: Outcome[] = [];
  const open = () => {
    const calls: Call[] = [];
    const index = chains.push(calls) - 1;
    const proxyHandler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop) {
        if (prop === 'then') {
          const outcome = evaluate(calls, spec);
          outcomes[index] = outcome;
          if (!isWrite(calls)) spec.afterRead?.(calls, spec.rows ?? []);
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
  return { open, chains, outcomes };
}
type RecordingTable = ReturnType<typeof recordingTable>;

function buildClient(tables: Record<string, RecordingTable>) {
  return {
    from: vi.fn((table: string) => (tables[table] ? tables[table].open() : buildChainableQuery(null, null))),
  };
}

const flat = (chain: Call[]) => chain.map(c => [c.method, ...c.args]);
const isGuard = (chain: Call[]) =>
  chain.some(c => c.method === 'eq' && c.args[0] === 'is_active' && c.args[1] === true) &&
  chain.some(c => c.method === 'limit');
const isPairLookup = (chain: Call[]) => chain.some(c => c.method === 'maybeSingle');
const isWrite = (chain: Call[]) => chain.some(c => ['insert', 'update', 'delete'].includes(c.method));
const guardChains = (t: RecordingTable) => t.chains.filter(isGuard);
const pairChains = (t: RecordingTable) => t.chains.filter(isPairLookup);
const writeChains = (t: RecordingTable) => t.chains.filter(isWrite);

/** invocationCallOrder of the nth from(<table>) call on a client. */
function fromOrder(client: { from: ReturnType<typeof vi.fn> }, table: string, nth = 0): number {
  const indices = client.from.mock.calls
    .map((c, i) => (c[0] === table ? i : -1))
    .filter(i => i >= 0);
  expect(indices.length).toBeGreaterThan(nth);
  return client.from.mock.invocationCallOrder[indices[nth]];
}

// ── Fixture builders ───────────────────────────────────────────
const assignmentRow = (id: string, docenteId: string, isActive: boolean): Row => ({
  id,
  course_structure_id: COURSE_STRUCTURE_ID,
  docente_id: docenteId,
  is_active: isActive,
});

const roleRow = (userId: string, roleType: string, schoolId: number | null = SCHOOL_ID, isActive = true): Row => ({
  user_id: userId,
  role_type: roleType,
  school_id: schoolId,
  is_active: isActive,
});

const ELIGIBLE_TARGET_ROLE = roleRow(DOCENTE_ID, 'docente');

interface UserClientOptions {
  assignments?: Row[];
  assignmentsSpec?: Partial<TableSpec>;
  courseSchoolId?: number;
  courseError?: unknown;
}

/** User-scoped client: the course row plus the assignments table under test. */
function buildUserClient(opts: UserClientOptions = {}) {
  const assignments = recordingTable({ rows: opts.assignments ?? [], ...opts.assignmentsSpec });
  const course = recordingTable({
    rows: [{ id: COURSE_STRUCTURE_ID, school_id: opts.courseSchoolId ?? SCHOOL_ID }],
    readError: opts.courseError,
  });
  const client = buildClient({ [ASSIGNMENTS_TABLE]: assignments, [COURSE_TABLE]: course });
  return { client, assignments, course };
}

interface ServiceClientOptions {
  roles?: Row[];
  rolesError?: unknown;
  rolesOverride?: TableSpec['readOverride'];
}

/** Service-role client: user_roles for eligibility; profiles carries sentinel data that must never be read. */
function buildServiceClient(opts: ServiceClientOptions = {}) {
  const userRoles = recordingTable({ rows: opts.roles ?? [ELIGIBLE_TARGET_ROLE], readError: opts.rolesError, readOverride: opts.rolesOverride });
  const profiles = recordingTable({
    rows: [{ id: CURRENT_DOCENTE_ID, name: SENTINEL_NAME, email: SENTINEL_EMAIL, role_type: SENTINEL_ROLE }],
  });
  const client = buildClient({ user_roles: userRoles, profiles });
  return { client, userRoles, profiles };
}

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function denied() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false });
}

function directivo(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false });
}

const ELIGIBLE = {
  id: 'tpl-1',
  name: 'Lectura',
  area: 'lenguaje',
  gradeId: 7,
  gradeName: '3° Básico',
  snapshotId: 'snap-1',
  snapshotVersion: '1.0',
};

function planOk(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    warnings: [],
    skipped: [],
    gradeId: 7,
    gradeName: '3° Básico',
    gradeLevel: '3_basico',
    transformationYear: 2,
    generationType: 'GT',
    eligibleTemplates: [ELIGIBLE],
    ...overrides,
  };
}

function planBlocked(code: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    ok: false,
    blockingError: { code, message, gradeId: 7, gradeName: '3° Básico', gradeLevel: '3_basico', ...extra },
    warnings: [],
    skipped: [],
    gradeId: 7,
    gradeName: '3° Básico',
    gradeLevel: '3_basico',
    transformationYear: 2,
    generationType: 'GT',
    eligibleTemplates: [],
  };
}

/** Mirrors the service's truthful success rule. */
function serviceResult(
  c: Partial<{ created: number; attached: number; alreadyExisting: number; skipped: number }> = {},
  extra: { errors?: string[]; warnings?: string[]; blockingError?: Record<string, unknown> } = {}
) {
  const errors = extra.errors ?? [];
  const counts = { created: 0, attached: 0, alreadyExisting: 0, skipped: 0, ...c, errors: errors.length };
  const confirmed = counts.created + counts.attached + counts.alreadyExisting;
  return {
    success: !extra.blockingError && errors.length === 0 && confirmed > 0,
    instancesCreated: counts.created + counts.attached,
    instancesSkipped: counts.alreadyExisting + counts.skipped,
    counts,
    blockingError: extra.blockingError,
    errors,
    warnings: extra.warnings ?? [],
    details: [],
  };
}

function postReq(docenteId: unknown = DOCENTE_ID) {
  return createMocks({
    method: 'POST',
    body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: docenteId },
  });
}

/** Wires a ready-to-proceed request: eligible target, ok preflight, one created assessment. */
function readyToProceed() {
  authed();
  directivo(SCHOOL_ID);
  mockPreflightAutoAssignment.mockResolvedValue(planOk());
  mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ created: 1 }));
}

const REFUSAL_KEYS = ['assignment', 'code', 'error', 'message', 'success'];
const NOTHING_MUTATED = { created: false, reactivated: false, alreadyActive: false, mutated: false };

function expectRefusal(res: any, status: number, code: string) {
  expect(res._getStatusCode()).toBe(status);
  const data = JSON.parse(res._getData());
  expect(Object.keys(data).sort()).toEqual(REFUSAL_KEYS);
  expect(data.success).toBe(false);
  expect(data.code).toBe(code);
  expect(typeof data.error).toBe('string');
  expect(data.message).toBe(data.error);
  expect(data.assignment).toEqual(NOTHING_MUTATED);
  return data;
}

function expectNoIdentityLeak(res: any) {
  const raw = res._getData();
  for (const sentinel of [CURRENT_DOCENTE_ID, SENTINEL_NAME, SENTINEL_EMAIL, SENTINEL_ROLE]) {
    expect(raw).not.toContain(sentinel);
  }
}

/** Nothing after a refusal: no target read, no preflight, no write, no cleanup, no trigger. */
function expectNothingAfterGuard(user: ReturnType<typeof buildUserClient>, svc: ReturnType<typeof buildServiceClient>) {
  expect(svc.client.from).not.toHaveBeenCalledWith('user_roles');
  expect(svc.client.from).not.toHaveBeenCalledWith('profiles');
  expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
  expect(writeChains(user.assignments)).toHaveLength(0);
  expect(pairChains(user.assignments)).toHaveLength(0);
  expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
}

// ── Tests ──────────────────────────────────────────────────────
describe('POST/DELETE /api/school/transversal-context/assign-docente', () => {
  let svc: ReturnType<typeof buildServiceClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAuthError.mockImplementation((res: any, msg: string) => {
      res.status(401).json({ error: msg });
    });
    mockHandleMethodNotAllowed.mockImplementation((res: any, methods: string[]) => {
      res.setHeader('Allow', methods.join(', '));
      res.status(405).json({ error: 'Method not allowed' });
    });
    svc = buildServiceClient();
    mockCreateServiceRoleClient.mockReturnValue(svc.client);
  });

  // ── Authentication / authorization ordering (preserved) ──────
  it('returns 401 without auth and never inspects the course, the assignments or the target', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(user.client.from).not.toHaveBeenCalled();
    expectNothingAfterGuard(user, svc);
  });

  it('returns 405 for non-POST/DELETE methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(mockHandleMethodNotAllowed).toHaveBeenCalledWith(expect.anything(), ['POST', 'DELETE']);
  });

  it('returns 403 for users without directivo/admin role before any course-wide or target inspection', async () => {
    authed();
    denied();
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('directivos');
    expect(user.client.from).not.toHaveBeenCalled();
    expectNothingAfterGuard(user, svc);
  });

  it('returns 404 when the course is not found before any course-wide or target inspection', async () => {
    authed();
    directivo(SCHOOL_ID);
    const user = buildUserClient({ courseError: { code: 'PGRST116', message: 'not found' } });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData()).error).toContain('no encontrado');
    expect(user.client.from).not.toHaveBeenCalledWith(ASSIGNMENTS_TABLE);
    expectNothingAfterGuard(user, svc);
  });

  it('returns 403 for a course of another school before any course-wide guard, target read, preflight or write', async () => {
    authed();
    directivo(SCHOOL_ID);
    const user = buildUserClient({
      courseSchoolId: OTHER_SCHOOL_ID,
      assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)],
    });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(user.client.from).not.toHaveBeenCalledWith(ASSIGNMENTS_TABLE);
    expectNothingAfterGuard(user, svc);
    expectNoIdentityLeak(res);
  });

  // ── C-01: course-wide active guard ───────────────────────────
  describe('course-wide active guard (C-01)', () => {
    it('reads the active assignments with the exact predicates, id + docente_id only, limit(2), array semantics', async () => {
      readyToProceed();
      const user = buildUserClient();
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const guards = guardChains(user.assignments);
      expect(guards).toHaveLength(1);
      expect(flat(guards[0])).toEqual([
        ['select', 'id, docente_id'],
        ['eq', 'course_structure_id', COURSE_STRUCTURE_ID],
        ['eq', 'is_active', true],
        ['limit', 2],
      ]);
    });

    it('refuses a different active docente with 409 course_already_assigned before target inspection, preflight or any write', async () => {
      readyToProceed();
      const user = buildUserClient({ assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 409, 'course_already_assigned');
      expect(data.error).toContain('ya tiene un docente activo');
      expect(data.error).toContain('proceso controlado');
      expect(guardChains(user.assignments)).toHaveLength(1);
      expectNothingAfterGuard(user, svc);
      expectNoIdentityLeak(res);
    });

    it('fails closed on more than one active docente with 409 assignment_invariant_violation, choosing or changing nothing', async () => {
      readyToProceed();
      const user = buildUserClient({
        assignments: [
          assignmentRow('a-cur', CURRENT_DOCENTE_ID, true),
          assignmentRow('a-third', THIRD_DOCENTE_ID, true),
        ],
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 409, 'assignment_invariant_violation');
      expect(data.error).toContain('más de una asignación activa');
      expect(data.error).toContain('resolución administrativa controlada');
      expectNothingAfterGuard(user, svc);
      // No deactivation or cleanup of either row
      expect(user.assignments.chains.filter(ch => ch.some(c => c.method === 'update' || c.method === 'delete'))).toHaveLength(0);
      expectNoIdentityLeak(res);
      expect(res._getData()).not.toContain(THIRD_DOCENTE_ID);
    });

    it('fails closed even when the REQUESTED docente is one of several active rows', async () => {
      readyToProceed();
      const user = buildUserClient({
        assignments: [
          assignmentRow('a-req', DOCENTE_ID, true),
          assignmentRow('a-cur', CURRENT_DOCENTE_ID, true),
        ],
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expectRefusal(res, 409, 'assignment_invariant_violation');
      expectNothingAfterGuard(user, svc);
      expectNoIdentityLeak(res);
    });

    it('fails closed with a generic 500 assignment_state_unavailable when the active-assignment read fails', async () => {
      readyToProceed();
      const user = buildUserClient({
        assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)],
        assignmentsSpec: {
          readError: (calls: Call[]) =>
            isGuard(calls) ? { code: '42501', message: 'permission denied for table school_course_docente_assignments' } : null,
        },
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 500, 'assignment_state_unavailable');
      expect(data.error).toContain('No se pudo verificar el estado de asignación');
      expect(res._getData()).not.toContain('permission denied');
      expect(res._getData()).not.toContain('42501');
      expectNothingAfterGuard(user, svc);
      expectNoIdentityLeak(res);
    });

    it('does not reactivate an inactive same-pair row while another docente is active', async () => {
      readyToProceed();
      const user = buildUserClient({
        assignments: [
          assignmentRow('a-old', DOCENTE_ID, false),
          assignmentRow('a-cur', CURRENT_DOCENTE_ID, true),
        ],
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expectRefusal(res, 409, 'course_already_assigned');
      expectNothingAfterGuard(user, svc);
    });

    it('a malformed target behind an active different docente is still refused by the guard first (409, no role read)', async () => {
      readyToProceed();
      const user = buildUserClient({ assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq('not-a-uuid');
      await handler(req, res);

      expectRefusal(res, 409, 'course_already_assigned');
      expectNothingAfterGuard(user, svc);
    });
  });

  // ── C-01: target eligibility ─────────────────────────────────
  describe('target eligibility (C-01)', () => {
    it('the shared role list excludes the non-teaching roles by design', () => {
      expect(TEACHING_ELIGIBLE_ROLES).toEqual(
        expect.arrayContaining(['docente', 'admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'])
      );
      for (const excluded of ['supervisor_de_red', 'community_manager', 'encargado_licitacion']) {
        expect(TEACHING_ELIGIBLE_ROLES).not.toContain(excluded);
      }
    });

    it('proceeds for an eligible active target at the exact course school, using exact predicates, user_id only, limit(1) and no single/maybeSingle', async () => {
      readyToProceed();
      const user = buildUserClient();
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).success).toBe(true);
      expect(svc.userRoles.chains).toHaveLength(1);
      expect(flat(svc.userRoles.chains[0])).toEqual([
        ['select', 'user_id'],
        ['eq', 'user_id', DOCENTE_ID],
        ['eq', 'school_id', SCHOOL_ID],
        ['eq', 'is_active', true],
        ['in', 'role_type', TEACHING_ELIGIBLE_ROLES],
        ['limit', 1],
      ]);
      expect(svc.client.from).not.toHaveBeenCalledWith('profiles');
      // No role row or identity detail is echoed back
      expect(res._getData()).not.toContain('role_type');
      expect(res._getData()).not.toContain('"docente"');
    });

    it('proceeds when the target holds several eligible roles at the correct school (array semantics, not single)', async () => {
      readyToProceed();
      svc = buildServiceClient({
        roles: [roleRow(DOCENTE_ID, 'docente'), roleRow(DOCENTE_ID, 'equipo_directivo'), roleRow(DOCENTE_ID, 'lider_comunidad')],
      });
      mockCreateServiceRoleClient.mockReturnValue(svc.client);
      const user = buildUserClient();
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockPreflightAutoAssignment).toHaveBeenCalledTimes(1);
      expect(writeChains(user.assignments).map(ch => ch[0].method)).toEqual(['insert']);
    });

    const ineligibleCases: Array<[string, Row[]]> = [
      ['a role only at another school', [roleRow(DOCENTE_ID, 'docente', OTHER_SCHOOL_ID)]],
      ['a role with no school', [roleRow(DOCENTE_ID, 'docente', null)]],
      ['an inactive eligible-role row', [roleRow(DOCENTE_ID, 'docente', SCHOOL_ID, false)]],
      [
        'only excluded roles at the school',
        [
          roleRow(DOCENTE_ID, 'supervisor_de_red'),
          roleRow(DOCENTE_ID, 'community_manager'),
          roleRow(DOCENTE_ID, 'encargado_licitacion'),
        ],
      ],
      ['an unknown target with no role row at all', [roleRow(CURRENT_DOCENTE_ID, 'docente')]],
    ];

    it.each(ineligibleCases)('refuses %s with 422 docente_not_eligible_for_school and no preflight, write or trigger', async (_label, roles) => {
      readyToProceed();
      svc = buildServiceClient({ roles });
      mockCreateServiceRoleClient.mockReturnValue(svc.client);
      const user = buildUserClient();
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 422, 'docente_not_eligible_for_school');
      expect(data.error).toContain('no está habilitada como docente activo en esta escuela');
      expect(svc.userRoles.chains).toHaveLength(1);
      expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
      expect(writeChains(user.assignments)).toHaveLength(0);
      expect(pairChains(user.assignments)).toHaveLength(0);
      expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
      expectNoIdentityLeak(res);
    });

    it.each([['not-a-uuid'], ['22222222-2222-4222-8222-22222222222'], [42], [{ id: DOCENTE_ID }], ['22222222222242228222222222222222']])(
      'refuses the malformed target %j with 422 without sending it to the role query',
      async (malformed) => {
        readyToProceed();
        const user = buildUserClient();
        mockCreateApiSupabaseClient.mockResolvedValue(user.client);

        const { req, res } = postReq(malformed);
        await handler(req, res);

        expectRefusal(res, 422, 'docente_not_eligible_for_school');
        expect(svc.client.from).not.toHaveBeenCalledWith('user_roles');
        expect(svc.userRoles.chains).toHaveLength(0);
        expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
        expect(writeChains(user.assignments)).toHaveLength(0);
        expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
      }
    );

    it('fails closed with a generic 500 docente_eligibility_unavailable when the role read fails', async () => {
      readyToProceed();
      svc = buildServiceClient({ rolesError: { code: '42501', message: 'permission denied for table user_roles' } });
      mockCreateServiceRoleClient.mockReturnValue(svc.client);
      const user = buildUserClient();
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 500, 'docente_eligibility_unavailable');
      expect(data.error).toContain('No se pudo verificar la habilitación');
      expect(res._getData()).not.toContain('permission denied');
      expect(res._getData()).not.toContain('42501');
      expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
      expect(writeChains(user.assignments)).toHaveLength(0);
      expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
      expectNoIdentityLeak(res);
    });

    it('a same active docente that is no longer eligible is refused with 422 and no preflight or repair', async () => {
      readyToProceed();
      svc = buildServiceClient({ roles: [roleRow(DOCENTE_ID, 'docente', SCHOOL_ID, false)] });
      mockCreateServiceRoleClient.mockReturnValue(svc.client);
      const user = buildUserClient({ assignments: [assignmentRow('a-same', DOCENTE_ID, true)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expectRefusal(res, 422, 'docente_not_eligible_for_school');
      expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
      expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
      expect(writeChains(user.assignments)).toHaveLength(0);
    });
  });

  // ── Adversarial edges (final assurance pass) ──────────────────
  describe('adversarial edges (final assurance pass)', () => {
    it('classifies an upper-case spelling of the active docente as the SAME docente (PostgreSQL uuid equality) and reconciles without touching the row', async () => {
      // Same uuid value, different spelling: the canonical row is lower-case, the request is upper-case.
      expect(DOCENTE_ID_UPPER).not.toBe(DOCENTE_ID);
      expect(DOCENTE_ID_UPPER.toLowerCase()).toBe(DOCENTE_ID);
      readyToProceed();
      mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ attached: 1 }));
      const user = buildUserClient({ assignments: [assignmentRow('a-same', DOCENTE_ID, true)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq(DOCENTE_ID_UPPER);
      await handler(req, res);

      // Not "another docente": no 409, the retry proceeds as a same-docente repair
      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.assignment).toEqual({ created: false, reactivated: false, alreadyActive: true, mutated: false });
      expect(data.assessments).toMatchObject({ attached: 1 });
      // Eligibility ran with the request value as given …
      expect(svc.userRoles.chains).toHaveLength(1);
      expect(flat(svc.userRoles.chains[0])).toEqual([
        ['select', 'user_id'],
        ['eq', 'user_id', DOCENTE_ID_UPPER],
        ['eq', 'school_id', SCHOOL_ID],
        ['eq', 'is_active', true],
        ['in', 'role_type', TEACHING_ELIGIBLE_ROLES],
        ['limit', 1],
      ]);
      // … and matched the canonical lower-case role row exactly as PostgreSQL uuid equality would (pgEquals)
      expect(svc.userRoles.outcomes[0].data).toEqual([expect.objectContaining({ user_id: DOCENTE_ID })]);
      // A-02 preflight and reconciliation still ran
      expect(mockPreflightAutoAssignment).toHaveBeenCalledWith(COURSE_STRUCTURE_ID, SCHOOL_ID);
      expect(mockTriggerAutoAssignment).toHaveBeenCalledWith(null, DOCENTE_ID_UPPER, COURSE_STRUCTURE_ID, SCHOOL_ID, USER_ID);
      // The active row was neither looked up again nor inserted, updated or deleted
      expect(pairChains(user.assignments)).toHaveLength(0);
      expect(writeChains(user.assignments)).toHaveLength(0);
      expect(user.assignments.chains.filter(ch => ch.some(c => c.method === 'delete'))).toHaveLength(0);
      // No identity in the response, in either spelling
      expectNoIdentityLeak(res);
      expect(res._getData()).not.toContain(DOCENTE_ID);
      expect(res._getData()).not.toContain(DOCENTE_ID_UPPER);
    });

    it('an upper-case spelling of a DIFFERENT docente is still refused by the guard (control for the case above)', async () => {
      readyToProceed();
      const user = buildUserClient({ assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq(DOCENTE_ID_UPPER);
      await handler(req, res);

      expectRefusal(res, 409, 'course_already_assigned');
      expectNothingAfterGuard(user, svc);
      expectNoIdentityLeak(res);
    });

    it('fails closed on THREE active docentes with 409 assignment_invariant_violation while reading only limit(2), choosing and disclosing nothing', async () => {
      readyToProceed();
      const user = buildUserClient({
        assignments: [
          assignmentRow('a-cur', CURRENT_DOCENTE_ID, true),
          assignmentRow('a-third', THIRD_DOCENTE_ID, true),
          assignmentRow('a-fourth', FOURTH_DOCENTE_ID, true),
        ],
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expectRefusal(res, 409, 'assignment_invariant_violation');
      const guards = guardChains(user.assignments);
      expect(guards).toHaveLength(1);
      expect(flat(guards[0])).toEqual([
        ['select', 'id, docente_id'],
        ['eq', 'course_structure_id', COURSE_STRUCTURE_ID],
        ['eq', 'is_active', true],
        ['limit', 2],
      ]);
      // The read handed the handler two of the three rows (the limit applied): enough to refuse, never a full or chosen set
      expect(user.assignments.outcomes[0].data).toHaveLength(2);
      expectNothingAfterGuard(user, svc);
      expect(user.assignments.chains.filter(ch => ch.some(c => c.method === 'update' || c.method === 'delete'))).toHaveLength(0);
      expectNoIdentityLeak(res);
      for (const id of [THIRD_DOCENTE_ID, FOURTH_DOCENTE_ID]) expect(res._getData()).not.toContain(id);
    });

    it.each([
      ['null', null],
      ['a single object instead of a row set', { id: 'a-cur', docente_id: CURRENT_DOCENTE_ID }],
      ['a string', 'not-a-row-set'],
    ])('fails closed with 500 assignment_state_unavailable when the active-guard read resolves to %s', async (_label, payload) => {
      readyToProceed();
      const user = buildUserClient({
        assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)],
        assignmentsSpec: {
          readOverride: (calls: Call[]) => (isGuard(calls) ? { data: payload, error: null, count: null } : undefined),
        },
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 500, 'assignment_state_unavailable');
      expect(data.error).toContain('No se pudo verificar el estado de asignación');
      // The override really reached the handler
      expect(user.assignments.outcomes[0]).toEqual({ data: payload, error: null, count: null });
      expectNothingAfterGuard(user, svc);
      expectNoIdentityLeak(res);
      expect(res._getData()).not.toContain('not-a-row-set');
    });

    it.each([
      ['null', null],
      ['a single object instead of a row set', { user_id: DOCENTE_ID }],
    ])('fails closed with 500 docente_eligibility_unavailable when the role read resolves to %s', async (_label, payload) => {
      readyToProceed();
      svc = buildServiceClient({ rolesOverride: () => ({ data: payload, error: null, count: null }) });
      mockCreateServiceRoleClient.mockReturnValue(svc.client);
      const user = buildUserClient();
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      const data = expectRefusal(res, 500, 'docente_eligibility_unavailable');
      expect(data.error).toContain('No se pudo verificar la habilitación');
      expect(svc.userRoles.outcomes[0]).toEqual({ data: payload, error: null, count: null });
      expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
      expect(pairChains(user.assignments)).toHaveLength(0);
      expect(writeChains(user.assignments)).toHaveLength(0);
      expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
      expect(res._getData()).not.toContain(DOCENTE_ID);
      expectNoIdentityLeak(res);
    });

    it('retains a same-pair row that becomes active between the guard and the pair lookup: no write, reconciliation continues, alreadyActive=true', async () => {
      readyToProceed();
      mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ alreadyExisting: 1 }));
      const user = buildUserClient({
        assignments: [assignmentRow('a-same', DOCENTE_ID, false)],
        assignmentsSpec: {
          // The state genuinely changes between the two reads: the guard sees the row inactive
          // (zero active rows); a concurrent same-docente retry activates it before the pair lookup.
          afterRead: (calls: Call[], rows: Row[]) => {
            if (isGuard(calls)) rows.forEach(r => { if (r.id === 'a-same') r.is_active = true; });
          },
        },
      });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.assignment).toEqual({ created: false, reactivated: false, alreadyActive: true, mutated: false });
      expect(data.message).toContain('ya estaba asignado');
      // The two reads observed different states
      const guardIdx = user.assignments.chains.findIndex(isGuard);
      const pairIdx = user.assignments.chains.findIndex(isPairLookup);
      expect(guardIdx).toBeGreaterThanOrEqual(0);
      expect(pairIdx).toBeGreaterThan(guardIdx);
      expect(user.assignments.outcomes[guardIdx].data).toEqual([]);
      expect(user.assignments.outcomes[pairIdx].data).toMatchObject({ id: 'a-same', is_active: true });
      // Retained: no insert, update or delete; reconciliation ran
      expect(writeChains(user.assignments)).toHaveLength(0);
      expect(user.assignments.chains.filter(ch => ch.some(c => c.method === 'delete'))).toHaveLength(0);
      expect(mockTriggerAutoAssignment).toHaveBeenCalledWith(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, USER_ID);
    });

    it('control: the same fixture WITHOUT the between-reads activation reactivates the row (the transition test is not static)', async () => {
      readyToProceed();
      const user = buildUserClient({ assignments: [assignmentRow('a-same', DOCENTE_ID, false)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq();
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).assignment).toEqual({ created: false, reactivated: true, alreadyActive: false, mutated: true });
      const pairIdx = user.assignments.chains.findIndex(isPairLookup);
      expect(user.assignments.outcomes[pairIdx].data).toMatchObject({ id: 'a-same', is_active: false });
      expect(writeChains(user.assignments).map(ch => flat(ch))).toEqual([[['update', { is_active: true }], ['eq', 'id', 'a-same']]]);
    });

    it.each([
      ['an object', { id: DOCENTE_ID }],
      ['a number', 42],
      ['an array', [DOCENTE_ID]],
      ['a boolean', true],
    ])('a non-string malformed target (%s) behind an active different docente is refused by the guard first — no UUID validation, no role read, nothing echoed', async (_label, malformed) => {
      readyToProceed();
      const user = buildUserClient({ assignments: [assignmentRow('a-cur', CURRENT_DOCENTE_ID, true)] });
      mockCreateApiSupabaseClient.mockResolvedValue(user.client);

      const { req, res } = postReq(malformed);
      await handler(req, res);

      expectRefusal(res, 409, 'course_already_assigned');
      expect(svc.client.from).not.toHaveBeenCalledWith('user_roles');
      expect(svc.userRoles.chains).toHaveLength(0);
      expectNothingAfterGuard(user, svc);
      expectNoIdentityLeak(res);
      expect(res._getData()).not.toContain('[object Object]');
      expect(res._getData()).not.toContain(JSON.stringify(malformed));
      expect(res._getData()).not.toContain(DOCENTE_ID);
    });
  });

  // ── Ordering pin ─────────────────────────────────────────────
  it('pins the order: course authorization → active guard → target eligibility → preflight → same-pair lookup → insert → trigger', async () => {
    readyToProceed();
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const courseLookup = fromOrder(user.client, COURSE_TABLE, 0);
    const guard = fromOrder(user.client, ASSIGNMENTS_TABLE, 0);
    const eligibility = fromOrder(svc.client, 'user_roles', 0);
    const preflight = mockPreflightAutoAssignment.mock.invocationCallOrder[0];
    const pairLookup = fromOrder(user.client, ASSIGNMENTS_TABLE, 1);
    const insert = fromOrder(user.client, ASSIGNMENTS_TABLE, 2);
    const trigger = mockTriggerAutoAssignment.mock.invocationCallOrder[0];

    expect(courseLookup).toBeLessThan(guard);
    expect(guard).toBeLessThan(eligibility);
    expect(eligibility).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(pairLookup);
    expect(pairLookup).toBeLessThan(insert);
    expect(insert).toBeLessThan(trigger);

    // The chains are what they claim to be
    expect(isGuard(user.assignments.chains[0])).toBe(true);
    expect(isPairLookup(user.assignments.chains[1])).toBe(true);
    expect(user.assignments.chains[2][0].method).toBe('insert');
    expect(user.client.from.mock.calls.filter(c => c[0] === ASSIGNMENTS_TABLE)).toHaveLength(3);
  });

  // ── Preflight (A-02) ──────────────────────────────────────────
  it('preflights after the guard and eligibility and before the assignment write, then creates the assignment', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ created: 3, alreadyExisting: 1 }));
    const user = buildUserClient(); // no existing assignment
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.message).toContain('asignado');
    expect(data.assignment).toEqual({ created: true, reactivated: false, alreadyActive: false, mutated: true });
    expect(data.assessments).toMatchObject({ created: 3, attached: 0, alreadyExisting: 1, skipped: 0, warnings: [], errors: [] });
    expect(data.autoAssignment).toMatchObject({ instancesCreated: 3, instancesSkipped: 1, success: true });
    expect(data.warning).toBeUndefined();

    expect(mockPreflightAutoAssignment).toHaveBeenCalledWith(COURSE_STRUCTURE_ID, SCHOOL_ID);
    expect(mockTriggerAutoAssignment).toHaveBeenCalledWith(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, USER_ID);

    expect(mockPreflightAutoAssignment.mock.invocationCallOrder[0]).toBeLessThan(fromOrder(user.client, ASSIGNMENTS_TABLE, 1));

    const writes = writeChains(user.assignments);
    expect(writes).toHaveLength(1);
    expect(flat(writes[0])).toEqual([
      ['insert', { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID, is_active: true }],
    ]);
  });

  it('returns 422 with a grade-identifiable error and writes nothing when zero eligible templates exist', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(
      planBlocked(
        'no_eligible_templates',
        'No hay evaluaciones publicadas y vigentes para el nivel "3° Básico" (grade_id 7). Publique un template para este nivel antes de asignar docentes.'
      )
    );
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.code).toBe('no_eligible_templates');
    expect(data.error).toContain('3° Básico');
    expect(data.grade).toEqual({ id: 7, name: '3° Básico', level: '3_basico' });
    expect(data.assignment).toEqual(NOTHING_MUTATED);
    expect(data.assessments).toMatchObject({ created: 0, attached: 0, alreadyExisting: 0, errors: [expect.stringContaining('3° Básico')] });
    expect(data.autoAssignment.success).toBe(false);

    // Only the read-only guard touched the table: no pair lookup, insert or reactivation, and no trigger
    expect(guardChains(user.assignments)).toHaveLength(1);
    expect(pairChains(user.assignments)).toHaveLength(0);
    expect(writeChains(user.assignments)).toHaveLength(0);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  it('returns 422 naming the misconfigured template when a required snapshot is missing', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(
      planBlocked(
        'snapshot_missing',
        'Configuración incompleta para el nivel "3° Básico": 1 template(s) publicado(s) sin snapshot vigente ("Sin snapshot").',
        { templates: [{ id: 'tpl-nosnap', name: 'Sin snapshot' }] }
      )
    );
    const user = buildUserClient({ assignments: [assignmentRow('a-old', DOCENTE_ID, false)] });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    const data = JSON.parse(res._getData());
    expect(data.code).toBe('snapshot_missing');
    expect(data.error).toContain('Sin snapshot');
    expect(data.templates).toEqual([{ id: 'tpl-nosnap', name: 'Sin snapshot' }]);
    // The inactive row is NOT reactivated
    expect(writeChains(user.assignments)).toHaveLength(0);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  it('returns 422 when the course has no grade (configuration missing) without mutating', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(
      planBlocked('grade_missing', 'El curso "1_basico" no tiene nivel (grade_id) asignado.', { gradeId: null, gradeName: null, gradeLevel: '1_basico' })
    );
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    const data = JSON.parse(res._getData());
    expect(data.code).toBe('grade_missing');
    expect(data.warning).toContain('grade_id');
    expect(writeChains(user.assignments)).toHaveLength(0);
  });

  // ── Assignment write paths ────────────────────────────────────
  it('reactivates an inactive same-pair assignment when the course has no active docente', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ created: 1 }));
    const user = buildUserClient({ assignments: [assignmentRow('a-old', DOCENTE_ID, false)] });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.assignment).toEqual({ created: false, reactivated: true, alreadyActive: false, mutated: true });
    const pair = pairChains(user.assignments);
    expect(pair).toHaveLength(1);
    expect(flat(pair[0])).toEqual([
      ['select', 'id, is_active'],
      ['eq', 'course_structure_id', COURSE_STRUCTURE_ID],
      ['eq', 'docente_id', DOCENTE_ID],
      ['maybeSingle'],
    ]);
    const writes = writeChains(user.assignments);
    expect(writes).toHaveLength(1);
    expect(flat(writes[0])).toEqual([['update', { is_active: true }], ['eq', 'id', 'a-old']]);
    expect(mockTriggerAutoAssignment).toHaveBeenCalled();
  });

  it('inactive rows of other docentes do not block a valid new assignment', async () => {
    readyToProceed();
    const user = buildUserClient({
      assignments: [assignmentRow('a-prev', CURRENT_DOCENTE_ID, false), assignmentRow('a-prev2', THIRD_DOCENTE_ID, false)],
    });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.assignment).toEqual({ created: true, reactivated: false, alreadyActive: false, mutated: true });
    const writes = writeChains(user.assignments);
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toEqual({
      method: 'insert',
      args: [{ course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID, is_active: true }],
    });
    // Neither inactive row was touched
    expect(user.assignments.chains.filter(ch => ch.some(c => c.method === 'update'))).toHaveLength(0);
    expectNoIdentityLeak(res);
  });

  it('does not return early for a same active eligible docente: it reconciles and repairs missing work', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    // Repair: one instance was missing its assignee link
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ attached: 1, alreadyExisting: 1 }));
    const user = buildUserClient({ assignments: [assignmentRow('a-same', DOCENTE_ID, true)] });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.assignment).toEqual({ created: false, reactivated: false, alreadyActive: true, mutated: false });
    expect(data.assessments).toMatchObject({ created: 0, attached: 1, alreadyExisting: 1 });
    expect(data.message).toContain('1 vinculada(s)');
    // Eligibility was re-validated, preflight ran, and the active row was neither inserted nor updated
    expect(svc.userRoles.chains).toHaveLength(1);
    expect(mockPreflightAutoAssignment).toHaveBeenCalledWith(COURSE_STRUCTURE_ID, SCHOOL_ID);
    expect(writeChains(user.assignments)).toHaveLength(0);
    expect(mockTriggerAutoAssignment).toHaveBeenCalledWith(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, USER_ID);
  });

  it('a fully reconciled retry is an idempotent success that reports already-existing work', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ alreadyExisting: 2 }));
    const user = buildUserClient({ assignments: [assignmentRow('a-same', DOCENTE_ID, true)] });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.assessments).toMatchObject({ created: 0, attached: 0, alreadyExisting: 2, errors: [] });
    expect(data.message).toContain('al día');
    expect(data.message).toContain('2 ya existente(s)');
    expect(data.warning).toBeUndefined();
    expect(writeChains(user.assignments)).toHaveLength(0);
  });

  it('a same active docente is retained without any write even if the preflight now blocks (422)', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(
      planBlocked('no_eligible_templates', 'No hay evaluaciones publicadas y vigentes para el nivel "3° Básico" (grade_id 7).')
    );
    const user = buildUserClient({ assignments: [assignmentRow('a-same', DOCENTE_ID, true)] });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    expect(writeChains(user.assignments)).toHaveLength(0);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  // ── Truthful success (A-02) ───────────────────────────────────
  it('cannot report success when zero assessments were created or already existing', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    // Service resolved "cleanly" but confirmed nothing (e.g. templates archived between preflight and write)
    mockTriggerAutoAssignment.mockResolvedValue(
      serviceResult({}, { blockingError: { code: 'no_eligible_templates', message: 'No hay evaluaciones publicadas y vigentes para el nivel "3° Básico" (grade_id 7).' }, errors: ['No hay evaluaciones publicadas y vigentes para el nivel "3° Básico" (grade_id 7).'] })
    );
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.code).toBe('no_eligible_templates');
    expect(data.error).toContain('no se pudo confirmar ninguna evaluación');
    expect(data.error).toContain('3° Básico');
    expect(data.assignment.mutated).toBe(true);
    expect(data.assessments).toMatchObject({ created: 0, attached: 0, alreadyExisting: 0 });
  });

  it('returns 207 success:false when the service resolves with zero counts and no errors', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue({
      // A malformed "clean" result: success:true but nothing confirmed must still be refused
      ...serviceResult({}),
      success: true,
    });
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.code).toBe('assessments_not_confirmed');
    expect(data.error).toBeDefined();
  });

  it('returns 207 with the error when the auto-assignment service throws', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockRejectedValue(new Error('Auto-assignment service down'));
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.error).toContain('Auto-assignment service down');
    expect(data.assessments.errors).toEqual(['Auto-assignment service down']);
    expect(data.autoAssignment.errors.length).toBeGreaterThan(0);
    expect(data.warning).toContain('Auto-assignment service down');
  });

  it('returns 207 success:false when a per-template error occurred even if another was created', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(
      serviceResult({ created: 1 }, { errors: ['Template Lectura: Instance created but assignee failed: permission denied'] })
    );
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.assessments.created).toBe(1);
    expect(data.warning).toContain('assignee failed');
  });

  it('keeps warnings visible on a successful assignment without hiding them', async () => {
    authed();
    directivo(SCHOOL_ID);
    const warning = 'No se encontró plan de migración para el nivel "3° Básico" (grade_id 7) en el año 2. Se usará GT por defecto.';
    mockPreflightAutoAssignment.mockResolvedValue(planOk({ warnings: [warning] }));
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ created: 2 }, { warnings: [warning] }));
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.warnings).toEqual([warning]);
    expect(data.assessments.warnings).toEqual([warning]);
    expect(data.warning).toContain('plan de migración');
    expect(data.message).toContain('2 creada(s)');
  });

  it('returns 500 and does not run auto-assignment when the assignment insert fails', async () => {
    readyToProceed();
    const user = buildUserClient({ assignmentsSpec: { writeError: { code: '42501', message: 'insert denied' } } });
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  // ── DELETE (unchanged behavior) ───────────────────────────────
  it('DELETE soft-deletes assignment and revokes assessment assignees', async () => {
    authed();
    directivo(SCHOOL_ID);
    const user = buildUserClient();
    mockCreateApiSupabaseClient.mockResolvedValue(user.client);

    const svcClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_instances') {
          return buildChainableQuery([{ id: 'inst-1' }, { id: 'inst-2' }]);
        }
        if (table === 'assessment_instance_assignees') {
          return buildChainableQuery([{ id: 'aa-1' }]); // 1 row deleted
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(svcClient);

    const { req, res } = createMocks({
      method: 'DELETE',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.message).toContain('desasignado');
    expect(data.assigneesRevoked).toBe(1);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
    expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
    expect(svcClient.from).toHaveBeenCalledWith('assessment_instances');
    expect(svcClient.from).toHaveBeenCalledWith('assessment_instance_assignees');
    // DELETE is untouched by C-01: no course-wide guard and no eligibility read
    expect(guardChains(user.assignments)).toHaveLength(0);
    expect(svcClient.from).not.toHaveBeenCalledWith('user_roles');
    const writes = writeChains(user.assignments);
    expect(writes).toHaveLength(1);
    expect(flat(writes[0])).toEqual([
      ['update', { is_active: false }],
      ['eq', 'course_structure_id', COURSE_STRUCTURE_ID],
      ['eq', 'docente_id', DOCENTE_ID],
    ]);
  });

  it('DELETE revocation failure returns 207 with warning', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient().client);

    const svcClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_instances') {
          throw new Error('Service unavailable');
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(svcClient);

    const { req, res } = createMocks({
      method: 'DELETE',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.warning).toContain('revocar');
  });

  it('DELETE returns 207 when instances lookup returns a Supabase error object', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient().client);

    const svcClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_instances') {
          return buildChainableQuery(null, { message: 'permission denied for table assessment_instances' });
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(svcClient);

    const { req, res } = createMocks({
      method: 'DELETE',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.warning).toContain('revocar');
  });
});
