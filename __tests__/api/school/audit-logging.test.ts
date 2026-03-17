// @vitest-environment node
/**
 * Tests for audit logging behavior in the 3 save endpoints:
 *  - transversal-context (POST)
 *  - custom-responses (POST)
 *  - migration-plan (PUT)
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
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
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

// Dynamic imports — must come after vi.mock()
import transversalHandler from '../../../pages/api/school/transversal-context/index';
import customResponsesHandler from '../../../pages/api/school/transversal-context/custom-responses';
import migrationPlanHandler from '../../../pages/api/school/migration-plan/index';

// ── Helpers ────────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const SCHOOL_ID = 42;

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function setupPermission() {
  mockHasDirectivoPermission.mockResolvedValue({
    hasPermission: true,
    schoolId: SCHOOL_ID,
    isAdmin: false,
  });
}

/**
 * Captures calls to serviceClient.from('school_change_history').insert(...)
 * by tracking sequential from() calls with a call-recording proxy.
 */
function buildRecordingServiceClient(opts: {
  profileName?: string;
  previousTransversal?: Record<string, unknown> | null;
}) {
  const historyInserts: unknown[] = [];

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return buildChainableQuery({ name: opts.profileName ?? 'Test User' });
        }
        if (table === 'school_change_history') {
          // Capture insert payloads
          const handler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'insert') {
                return (payload: unknown) => {
                  historyInserts.push(payload);
                  return buildChainableQuery({ id: 'hist-1' });
                };
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, handler));
            },
          };
          return new Proxy({}, handler);
        }
        if (table === 'school_transversal_context') {
          return buildChainableQuery(opts.previousTransversal ?? null);
        }
        if (table === 'school_plan_completion_status') {
          return buildChainableQuery({ id: 'status-1' });
        }
        if (table === 'context_general_questions') {
          return buildChainableQuery([]);
        }
        if (table === 'context_general_responses') {
          return buildChainableQuery([]);
        }
        return buildChainableQuery(null, null);
      }),
    },
    historyInserts,
  };
}

// ── Transversal Context Audit Tests ────────────────────────────
describe('Transversal context POST — audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAuthError.mockImplementation((res: any, msg: string) => {
      res.status(401).json({ error: msg });
    });
  });

  const validBody = {
    school_id: SCHOOL_ID,
    total_students: 200,
    grade_levels: ['1_basico', '2_basico'],
    courses_per_level: { '1_basico': 2, '2_basico': 2 },
    implementation_year_2026: 1,
    period_system: 'semestral',
  };

  it('creates history entry with correct previous_state/new_state', async () => {
    authed();
    setupPermission();

    const previousContext = {
      id: 'ctx-1',
      school_id: SCHOOL_ID,
      total_students: 100,
      grade_levels: ['1_basico'],
      implementation_year_2026: 1,
      period_system: 'semestral',
    };

    const savedContext = {
      id: 'ctx-1',
      school_id: SCHOOL_ID,
      total_students: 200,
      grade_levels: ['1_basico', '2_basico'],
      implementation_year_2026: 1,
      period_system: 'semestral',
    };

    // User-scoped client: first call to school_transversal_context returns previous,
    // second call (update().select().single()) returns saved
    let tcCallCount = 0;
    const userClient = {
      from: vi.fn((table: string) => {
        if (table === 'school_transversal_context') {
          tcCallCount++;
          if (tcCallCount === 1) {
            return buildChainableQuery(previousContext);
          }
          return buildChainableQuery(savedContext);
        }
        if (table === 'school_course_structure') {
          return buildChainableQuery(null);
        }
        return buildChainableQuery(savedContext);
      }),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);

    // Service client (for audit logging)
    const { client: serviceClient, historyInserts } = buildRecordingServiceClient({
      profileName: 'Ana García',
      previousTransversal: previousContext,
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: validBody,
    });
    await transversalHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // History was logged
    expect(historyInserts.length).toBeGreaterThanOrEqual(1);
    const historyEntry = historyInserts[0] as any;
    expect(historyEntry.feature).toBe('transversal_context');
    expect(historyEntry.action).toBe('update');
    expect(historyEntry.previous_state).toBeTruthy();
    expect(historyEntry.new_state).toBeTruthy();
    expect(historyEntry.user_name).toBe('Ana García');
  });

  it('filters noise fields (school_id, updated_at, etc.) from changed_fields', async () => {
    authed();
    setupPermission();

    const previousContext = {
      id: 'ctx-1',
      school_id: SCHOOL_ID,
      total_students: 100,
      grade_levels: ['1_basico'],
      implementation_year_2026: 1,
      period_system: 'semestral',
      updated_at: '2026-03-15T00:00:00Z',
      created_at: '2026-03-14T00:00:00Z',
    };

    const savedContext = {
      ...previousContext,
      total_students: 200,
      grade_levels: ['1_basico', '2_basico'],
      updated_at: '2026-03-16T00:00:00Z',
    };

    let tcCallCount = 0;
    const userClient = {
      from: vi.fn((table: string) => {
        if (table === 'school_transversal_context') {
          tcCallCount++;
          if (tcCallCount === 1) return buildChainableQuery(previousContext);
          return buildChainableQuery(savedContext);
        }
        if (table === 'school_course_structure') {
          return buildChainableQuery(null);
        }
        return buildChainableQuery(savedContext);
      }),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);

    const { client: serviceClient, historyInserts } = buildRecordingServiceClient({
      previousTransversal: previousContext,
    });
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({ method: 'POST', body: validBody });
    await transversalHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(historyInserts.length).toBeGreaterThanOrEqual(1);

    const entry = historyInserts[0] as any;
    // Noise fields should NOT be in changed_fields
    const noiseFields = ['school_id', 'updated_at', 'created_at', 'id', 'is_completed', 'completed_at', 'completed_by'];
    for (const field of noiseFields) {
      expect(entry.changed_fields || []).not.toContain(field);
    }
  });

  it('wraps history logging in try/catch — audit failure does not break save', async () => {
    authed();
    setupPermission();

    const savedContext = {
      id: 'ctx-new',
      school_id: SCHOOL_ID,
      total_students: 200,
      grade_levels: ['1_basico'],
      implementation_year_2026: 1,
      period_system: 'semestral',
    };

    const userClient = {
      from: vi.fn((table: string) => {
        if (table === 'school_course_structure') {
          return buildChainableQuery(null);
        }
        return buildChainableQuery(savedContext);
      }),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);

    // Service client where profile lookup throws inside the audit try/catch
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          throw new Error('Profile lookup failed');
        }
        // Return empty/success for all other tables (course reconciliation, ab_grades, etc.)
        return buildChainableQuery([]);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({ method: 'POST', body: validBody });
    await transversalHandler(req, res);

    // The save should still succeed (200) even though audit logging failed
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });
});

// ── Custom Responses Audit Tests ───────────────────────────────
describe('Custom responses POST — audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAuthError.mockImplementation((res: any, msg: string) => {
      res.status(401).json({ error: msg });
    });
  });

  const Q1 = 'a0000001-0000-0000-0000-000000000001';
  const Q2 = 'a0000001-0000-0000-0000-000000000002';

  it('creates history entry when responses change', async () => {
    authed();
    setupPermission();

    const previousResponses = [{ question_id: Q1, response: 'Old answer' }];

    // Service client with call tracking
    const historyInserts: unknown[] = [];
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === 'context_general_responses') {
          return buildChainableQuery(previousResponses);
        }
        if (table === 'profiles') {
          return buildChainableQuery({ name: 'Test User' });
        }
        if (table === 'school_change_history') {
          const handler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'insert') {
                return (payload: unknown) => {
                  historyInserts.push(payload);
                  return buildChainableQuery({ id: 'hist-1' });
                };
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, handler));
            },
          };
          return new Proxy({}, handler);
        }
        if (table === 'context_general_questions') {
          return buildChainableQuery([]);
        }
        if (table === 'school_plan_completion_status') {
          return buildChainableQuery({ id: 'status-1' });
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        responses: [
          { question_id: Q1, response: 'New answer' },
        ],
      },
    });
    await customResponsesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(historyInserts.length).toBeGreaterThanOrEqual(1);
    const entry = historyInserts[0] as any;
    expect(entry.feature).toBe('context_responses');
    expect(entry.changed_fields).toContain(Q1);
  });

  it('does NOT create history entry when no values changed', async () => {
    authed();
    setupPermission();

    const existingResponse = 'Same answer';
    const previousResponses = [{ question_id: Q1, response: existingResponse }];

    const historyInserts: unknown[] = [];
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === 'context_general_responses') {
          // For both the previous fetch and the upsert
          return buildChainableQuery(previousResponses);
        }
        if (table === 'school_change_history') {
          const handler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'insert') {
                return (payload: unknown) => {
                  historyInserts.push(payload);
                  return buildChainableQuery({ id: 'hist-1' });
                };
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, handler));
            },
          };
          return new Proxy({}, handler);
        }
        if (table === 'context_general_questions') {
          return buildChainableQuery([]);
        }
        if (table === 'school_plan_completion_status') {
          return buildChainableQuery({ id: 'status-1' });
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        responses: [
          { question_id: Q1, response: existingResponse },
        ],
      },
    });
    await customResponsesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    // No history entry should be created since nothing changed
    expect(historyInserts).toHaveLength(0);
  });

  it('wraps history logging in try/catch — audit failure does not break save', async () => {
    authed();
    setupPermission();

    // Service client that works for upsert but throws on history logging
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === 'context_general_responses') {
          return buildChainableQuery([{ question_id: Q1, response: 'Saved' }]);
        }
        if (table === 'profiles') {
          throw new Error('Profile lookup failed');
        }
        if (table === 'school_change_history') {
          throw new Error('History logging failed');
        }
        if (table === 'context_general_questions') {
          return buildChainableQuery([]);
        }
        if (table === 'school_plan_completion_status') {
          return buildChainableQuery({ id: 'status-1' });
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        responses: [{ question_id: Q1, response: 'New answer' }],
      },
    });
    await customResponsesHandler(req, res);

    // Save succeeds despite audit failure
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });
});

// ── Migration Plan Audit Tests ─────────────────────────────────
describe('Migration plan PUT — audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAuthError.mockImplementation((res: any, msg: string) => {
      res.status(401).json({ error: msg });
    });
  });

  const entries = [
    { year_number: 1, grade_id: 1, generation_type: 'GT' },
    { year_number: 1, grade_id: 7, generation_type: 'GI' },
  ];

  it('creates history entry with year-grade key format', async () => {
    authed();
    setupPermission();

    const previousEntries = [
      { year_number: 1, grade_id: 1, generation_type: 'GT' },
      { year_number: 1, grade_id: 7, generation_type: 'GT' },
    ];

    // User-scoped client (for CRUD)
    const userClient = {
      from: vi.fn((table: string) => {
        if (table === 'ab_migration_plan') {
          return buildChainableQuery(previousEntries);
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);

    // Service client with history tracking
    const historyInserts: unknown[] = [];
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return buildChainableQuery({ name: 'Test User' });
        }
        if (table === 'school_change_history') {
          const handler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'insert') {
                return (payload: unknown) => {
                  historyInserts.push(payload);
                  return buildChainableQuery({ id: 'hist-1' });
                };
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, handler));
            },
          };
          return new Proxy({}, handler);
        }
        if (table === 'school_plan_completion_status') {
          return buildChainableQuery({ id: 'status-1' });
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: { school_id: SCHOOL_ID, entries },
    });
    await migrationPlanHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(historyInserts.length).toBeGreaterThanOrEqual(1);

    const entry = historyInserts[0] as any;
    expect(entry.feature).toBe('migration_plan');
    // Keys should be in year-grade format
    expect(entry.new_state).toHaveProperty('1-1');
    expect(entry.new_state).toHaveProperty('1-7');
    // Changed field: grade 7 changed from GT to GI
    expect(entry.changed_fields).toContain('1-7');
  });

  it('records initial_save action when no previous entries exist', async () => {
    authed();
    setupPermission();

    // No previous entries
    const userClient = {
      from: vi.fn(() => buildChainableQuery([])),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);

    const historyInserts: unknown[] = [];
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return buildChainableQuery({ name: 'Test User' });
        }
        if (table === 'school_change_history') {
          const handler: ProxyHandler<Record<string, unknown>> = {
            get(_target, prop) {
              if (prop === 'insert') {
                return (payload: unknown) => {
                  historyInserts.push(payload);
                  return buildChainableQuery({ id: 'hist-1' });
                };
              }
              if (prop === 'then') {
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
              }
              return vi.fn(() => new Proxy({}, handler));
            },
          };
          return new Proxy({}, handler);
        }
        if (table === 'school_plan_completion_status') {
          return buildChainableQuery({ id: 'status-1' });
        }
        return buildChainableQuery(null, null);
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceClient);

    const { req, res } = createMocks({
      method: 'PUT',
      body: { school_id: SCHOOL_ID, entries },
    });
    await migrationPlanHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(historyInserts.length).toBeGreaterThanOrEqual(1);
    const historyEntry = historyInserts[0] as any;
    expect(historyEntry.action).toBe('initial_save');
  });

  it('wraps history logging in try/catch — audit failure does not break save', async () => {
    authed();
    setupPermission();

    const userClient = {
      from: vi.fn(() => buildChainableQuery([])),
    };
    mockCreateApiSupabaseClient.mockResolvedValue(userClient);

    // Throw on service client creation
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('Service role connection failed');
    });

    const { req, res } = createMocks({
      method: 'PUT',
      body: { school_id: SCHOOL_ID, entries },
    });
    await migrationPlanHandler(req, res);

    // Save should still succeed
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });
});
