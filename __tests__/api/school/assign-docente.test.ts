// @vitest-environment node
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
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
  mockTriggerAutoAssignment: vi.fn(),
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
}));

import handler from '../../../pages/api/school/transversal-context/assign-docente';

// ── Helpers ────────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const DOCENTE_ID = 'd0000001-0000-0000-0000-000000000001';
const COURSE_STRUCTURE_ID = 'cs000001-0000-0000-0000-000000000001';
const SCHOOL_ID = 42;

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function denied() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false });
}

function directivo(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false });
}

/**
 * Build a user-scoped supabase client mock that routes by table name.
 * Each table maps to the data/error returned by the chainable query.
 */
function buildUserClient(
  tableHandlers: Record<string, { data?: unknown; error?: unknown; count?: number | null }>
) {
  return {
    from: vi.fn((table: string) => {
      const h = tableHandlers[table];
      if (h) {
        return buildChainableQuery(h.data ?? null, h.error ?? null, h.count ?? null);
      }
      return buildChainableQuery(null, null);
    }),
  };
}

function buildServiceClient() {
  return {
    from: vi.fn(() => buildChainableQuery(null, null)),
  };
}

function autoAssignmentSuccess(created = 2, skipped = 0) {
  mockTriggerAutoAssignment.mockResolvedValue({
    success: true,
    instancesCreated: created,
    instancesSkipped: skipped,
    errors: [],
    warnings: [],
    details: [],
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
  });

  // ── 1. Auth ──────────────────────────────────────────────────
  it('returns 401 without auth', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient({}));
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  // ── 2. Method not allowed ────────────────────────────────────
  it('returns 405 for non-POST/DELETE methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(mockHandleMethodNotAllowed).toHaveBeenCalledWith(expect.anything(), ['POST', 'DELETE']);
  });

  // ── 3. Permission denied ─────────────────────────────────────
  it('returns 403 for users without directivo/admin role', async () => {
    authed();
    denied();
    mockCreateApiSupabaseClient.mockResolvedValue(buildUserClient({}));
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('directivos');
  });

  // ── 4. Course not found ──────────────────────────────────────
  it('returns 404 when course not found', async () => {
    authed();
    directivo(SCHOOL_ID);
    const client = buildUserClient({
      school_course_structure: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('no encontrado');
  });

  // ── 5. POST: creates new assignment ──────────────────────────
  it('POST creates new assignment and calls triggerAutoAssignment', async () => {
    authed();
    directivo(SCHOOL_ID);
    autoAssignmentSuccess(3, 1);

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: null }, // no existing assignment (maybeSingle returns null)
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.message).toContain('asignado');
    expect(data.autoAssignment.instancesCreated).toBe(3);
    expect(data.autoAssignment.instancesSkipped).toBe(1);
    expect(data.autoAssignment.errors).toHaveLength(0);
    expect(data.warning).toBeUndefined();

    expect(mockTriggerAutoAssignment).toHaveBeenCalledWith(
      null,
      DOCENTE_ID,
      COURSE_STRUCTURE_ID,
      SCHOOL_ID,
      USER_ID
    );
  });

  // ── 6. POST: reactivates inactive assignment ─────────────────
  it('POST reactivates inactive assignment', async () => {
    authed();
    directivo(SCHOOL_ID);
    autoAssignmentSuccess(0, 0);

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: { id: 'assign-1', is_active: false } },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(mockTriggerAutoAssignment).toHaveBeenCalled();
  });

  // ── 7. POST: rejects duplicate active assignment ─────────────
  it('POST rejects duplicate active assignment (400)', async () => {
    authed();
    directivo(SCHOOL_ID);

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: { id: 'assign-1', is_active: true } },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('ya está asignado');
  });

  // ── 8. DELETE: soft-deletes assignment and revokes assessment access ──
  it('DELETE soft-deletes assignment and revokes assessment assignees', async () => {
    authed();
    directivo(SCHOOL_ID);

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

    // Service client returns instances for the course, then deletes assignees
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
    // triggerAutoAssignment should NOT be called on DELETE
    expect(mockTriggerAutoAssignment).not.toHaveBeenCalled();
    // Service client should have queried assessment_instances and assessment_instance_assignees
    expect(svcClient.from).toHaveBeenCalledWith('assessment_instances');
    expect(svcClient.from).toHaveBeenCalledWith('assessment_instance_assignees');
  });

  // ── 9. POST: auto-assignment failure returns 207 with warning ──
  it('POST auto-assignment failure returns 207 with warning', async () => {
    authed();
    directivo(SCHOOL_ID);
    mockTriggerAutoAssignment.mockRejectedValue(new Error('Auto-assignment service down'));

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    // Course assignment succeeds but auto-assignment failed — 207 partial
    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.warning).toBeDefined();
    expect(data.autoAssignment.errors.length).toBeGreaterThan(0);
  });

  // ── 10. DELETE: revocation failure returns 207 with warning ──
  it('DELETE revocation failure returns 207 with warning', async () => {
    authed();
    directivo(SCHOOL_ID);

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

    // Service client where assessment_instances query throws
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

  // ── 11. DELETE: Supabase error shape (not thrown) returns 207 ──
  it('DELETE returns 207 when instances lookup returns Supabase error object', async () => {
    authed();
    directivo(SCHOOL_ID);

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);

    // Service client returns { data: null, error: {...} } — standard Supabase error, not a throw
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

  // ── 12. POST: triggerAutoAssignment resolves with success:false returns 207 ──
  it('POST returns 207 when triggerAutoAssignment resolves with success:false', async () => {
    authed();
    directivo(SCHOOL_ID);

    // Service resolves (not rejects) with success: false and a warning
    mockTriggerAutoAssignment.mockResolvedValue({
      success: false,
      instancesCreated: 0,
      instancesSkipped: 0,
      errors: [],
      warnings: ['El curso "1_basico" no tiene grade_id asignado.'],
      details: [],
    });

    const client = buildUserClient({
      school_course_structure: { data: { id: COURSE_STRUCTURE_ID, school_id: SCHOOL_ID } },
      school_course_docente_assignments: { data: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient());

    const { req, res } = createMocks({
      method: 'POST',
      body: { course_structure_id: COURSE_STRUCTURE_ID, docente_id: DOCENTE_ID },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(207);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.warning).toBeDefined();
  });
});
