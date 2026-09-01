// @vitest-environment node
/**
 * POST/DELETE /api/school/transversal-context/assign-docente
 *
 * PROC-CONTAIN-01 (A-02): authorization ordering is preserved, the assignment
 * is preflighted before any write, a failed preflight answers 422 with nothing
 * written, a same-active-docente retry reconciles instead of returning early,
 * and success is only reported when at least one assessment is confirmed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { buildChainableQuery } from '../assessment-builder/_helpers';

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

// ── Helpers ────────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const DOCENTE_ID = 'd0000001-0000-0000-0000-000000000001';
const COURSE_STRUCTURE_ID = 'cs000001-0000-0000-0000-000000000001';
const SCHOOL_ID = 42;
const ASSIGNMENTS_TABLE = 'school_course_docente_assignments';

type Call = { method: string; args: unknown[] };

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function denied() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false });
}

function directivo(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false });
}

/** Chainable query that records method calls so a test can prove nothing was inserted/updated. */
function recordingQuery(data: unknown = null, error: unknown = null) {
  const calls: Call[] = [];
  const proxyHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve({ data, error, count: null });
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return new Proxy({}, proxyHandler);
      };
    },
  };
  return { query: new Proxy({}, proxyHandler) as any, calls };
}

const writes = (calls: Call[]) => calls.filter(c => c.method === 'insert' || c.method === 'update');

type TableHandler = { data?: unknown; error?: unknown; count?: number | null } | { query: any };

/** User-scoped supabase client mock routed by table name. */
function buildUserClient(tableHandlers: Record<string, TableHandler>) {
  return {
    from: vi.fn((table: string) => {
      const h = tableHandlers[table];
      if (!h) return buildChainableQuery(null, null);
      if ('query' in h) return h.query;
      return buildChainableQuery(h.data ?? null, h.error ?? null, h.count ?? null);
    }),
  };
}

function buildServiceClient() {
  return {
    from: vi.fn(() => buildChainableQuery(null, null)),
  };
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

function postReq() {
  return createMocks({
    method: 'POST',
    body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
  });
}

function courseClient(extra: Record<string, TableHandler> = {}, schoolId = SCHOOL_ID) {
  return buildUserClient({
    school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: schoolId } },
    ...extra,
  });
}

// ── Tests ──────────────────────────────────────────────────────
describe('POST/DELETE /api/school/transversal-context/assign-docente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAuthError.mockImplementation((res: any, msg: string) => {
      res.status(401).json({ error: msg });
    });
    mockHandleMethodNotAllowed.mockImplementation((res: any, methods: string[]) => {
      res.setHeader('Allow', methods.join(', '));
      res.status(405).json({ error: 'Method not allowed' });
    });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());
  });

  // ── Authentication / authorization ordering (preserved) ──────
  it('returns 401 without auth and never preflights', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient({}));

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST/DELETE methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(mockHandleMethodNotAllowed).toHaveBeenCalledWith(expect.anything(), ['POST', 'DELETE']);
  });

  it('returns 403 for users without directivo/admin role and never preflights', async () => {
    authed();
    denied();
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient({}));

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('directivos');
    expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
  });

  it('returns 404 when course not found and never preflights', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient({
      school_course_structure: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    }));

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData()).error).toContain('no encontrado');
    expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
  });

  it('returns 403 for a course of another school before any preflight or write', async () => {
    authed();
    directivo(SCHOOL_ID);
    const assignments = recordingQuery(null, null);
    mockCreateApiSupabaseClient.mockResolvedValue(
      courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } }, 99)
    );

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(mockPreflightAutoAssignment).not.toHaveBeenCalled();
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
    expect(writes(assignments.calls)).toHaveLength(0);
  });

  // ── Preflight (A-02) ──────────────────────────────────────────
  it('preflights after course authorization and before the assignment write, then creates the assignment', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ created: 3, alreadyExisting: 1 }));

    const assignments = recordingQuery(null, null); // no existing assignment
    const client = courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

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

    // Ordering: course lookup → preflight → assignment table access → auto-assignment
    const fromCalls = client.from.mock.calls.map(c => c[0]);
    const courseLookupOrder = client.from.mock.invocationCallOrder[fromCalls.indexOf('school_course_structure')];
    const assignmentsOrder = client.from.mock.invocationCallOrder[fromCalls.indexOf(ASSIGNMENTS_TABLE)];
    const preflightOrder = mockPreflightAutoAssignment.mock.invocationCallOrder[0];
    const triggerOrder = mockTriggerAutoAssignment.mock.invocationCallOrder[0];
    expect(courseLookupOrder).toBeLessThan(preflightOrder);
    expect(preflightOrder).toBeLessThan(assignmentsOrder);
    expect(assignmentsOrder).toBeLessThan(triggerOrder);

    expect(writes(assignments.calls).map(c => c.method)).toEqual(['insert']);
    expect(writes(assignments.calls)[0].args[0]).toEqual({
      course_structure_id: COURSE_STRUCTURE_ID,
      docente_id: DOCENTE_ID,
      is_active: true,
    });
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

    const assignments = recordingQuery(null, null);
    const client = courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.code).toBe('no_eligible_templates');
    expect(data.error).toContain('3° Básico');
    expect(data.grade).toEqual({ id: 7, name: '3° Básico', level: '3_basico' });
    expect(data.assignment).toEqual({ created: false, reactivated: false, alreadyActive: false, mutated: false });
    expect(data.assessments).toMatchObject({ created: 0, attached: 0, alreadyExisting: 0, errors: [expect.stringContaining('3° Básico')] });
    expect(data.autoAssignment.success).toBe(false);

    // No assignment insert/reactivation and no auto-assignment after a failed preflight
    expect(client.from).not.toHaveBeenCalledWith(ASSIGNMENTS_TABLE);
    expect(writes(assignments.calls)).toHaveLength(0);
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

    const assignments = recordingQuery({ id: 'assign-1', is_active: false });
    const client = courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    const data = JSON.parse(res._getData());
    expect(data.code).toBe('snapshot_missing');
    expect(data.error).toContain('Sin snapshot');
    expect(data.templates).toEqual([{ id: 'tpl-nosnap', name: 'Sin snapshot' }]);
    // The inactive row is NOT reactivated
    expect(client.from).not.toHaveBeenCalledWith(ASSIGNMENTS_TABLE);
    expect(writes(assignments.calls)).toHaveLength(0);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  it('returns 422 when the course has no grade (configuration missing) without mutating', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(
      planBlocked('grade_missing', 'El curso "1_basico" no tiene nivel (grade_id) asignado.', { gradeId: null, gradeName: null, gradeLevel: '1_basico' })
    );
    const client = courseClient({ [ASSIGNMENTS_TABLE]: { data: null } });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(422);
    const data = JSON.parse(res._getData());
    expect(data.code).toBe('grade_missing');
    expect(data.warning).toContain('grade_id');
    expect(client.from).not.toHaveBeenCalledWith(ASSIGNMENTS_TABLE);
  });

  // ── Assignment write paths ────────────────────────────────────
  it('reactivates an inactive assignment and reports the created assessments', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ created: 1 }));

    const assignments = recordingQuery({ id: 'assign-1', is_active: false });
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } }));

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.assignment).toEqual({ created: false, reactivated: true, alreadyActive: false, mutated: true });
    expect(writes(assignments.calls).map(c => c.method)).toEqual(['update']);
    expect(writes(assignments.calls)[0].args[0]).toEqual({ is_active: true });
    expect(mockTriggerAutoAssignment).toHaveBeenCalled();
  });

  it('does not return early for a same active docente: it reconciles and repairs missing work', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    // Repair: one instance was missing its assignee link
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ attached: 1, alreadyExisting: 1 }));

    const assignments = recordingQuery({ id: 'assign-1', is_active: true });
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } }));

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.assignment).toEqual({ created: false, reactivated: false, alreadyActive: true, mutated: false });
    expect(data.assessments).toMatchObject({ created: 0, attached: 1, alreadyExisting: 1 });
    expect(data.message).toContain('1 vinculada(s)');
    // No duplicate insert and no update on the already-active row
    expect(writes(assignments.calls)).toHaveLength(0);
    expect(mockTriggerAutoAssignment).toHaveBeenCalledWith(null, DOCENTE_ID, COURSE_STRUCTURE_ID, SCHOOL_ID, USER_ID);
  });

  it('a fully reconciled retry is an idempotent success that reports already-existing work', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    mockTriggerAutoAssignment.mockResolvedValue(serviceResult({ alreadyExisting: 2 }));

    const assignments = recordingQuery({ id: 'assign-1', is_active: true });
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { query: assignments.query } }));

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.assessments).toMatchObject({ created: 0, attached: 0, alreadyExisting: 2, errors: [] });
    expect(data.message).toContain('al día');
    expect(data.message).toContain('2 ya existente(s)');
    expect(data.warning).toBeUndefined();
    expect(writes(assignments.calls)).toHaveLength(0);
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

    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
    authed();
    directivo(SCHOOL_ID);
    mockPreflightAutoAssignment.mockResolvedValue(planOk());
    const assignments = {
      from: vi.fn((table: string) => {
        if (table === 'school_course_structure') return buildChainableQuery({ id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID });
        if (table === ASSIGNMENTS_TABLE) {
          // First call: existence check → none; second call: insert → error
          return buildChainableQuery(null, assignments.from.mock.calls.filter(c => c[0] === ASSIGNMENTS_TABLE).length > 1 ? { message: 'insert denied' } : null);
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(assignments);

    const { req, res } = postReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
  });

  // ── DELETE (unchanged behavior) ───────────────────────────────
  it('DELETE soft-deletes assignment and revokes assessment assignees', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
  });

  it('DELETE revocation failure returns 207 with warning', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
    mockCreateApiSupabaseClient.mockResolvedValue(courseClient({ [ASSIGNMENTS_TABLE]: { data: null } }));

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
