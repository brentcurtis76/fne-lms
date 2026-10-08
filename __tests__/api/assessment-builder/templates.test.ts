// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  buildChainableQuery,
} from './_helpers';

// Hoisted mocks
const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockHasReadPerm,
  mockHasWritePerm,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasReadPerm: vi.fn(),
  mockHasWritePerm: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any, methods: string[]) => {
    res.status(405).json({ error: `Method not allowed. Use: ${methods.join(', ')}` });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/index';

describe('GET /api/admin/assessment-builder/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks read permission', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({});
    mockHasReadPerm.mockResolvedValue(false);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with templates list for admin', async () => {
    const templates = [
      { id: TEMPLATE_DRAFT_1, area: 'evaluacion', name: 'Test', status: 'draft' },
    ];
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') {
          return buildChainableQuery(templates);
        }
        if (table === 'assessment_modules') {
          return buildChainableQuery([{ template_id: TEMPLATE_DRAFT_1 }]);
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.templates).toBeDefined();
  });
});

/** The seeded vía rules of migration 20261008120000. */
const VIA_RULES = [
  { area: 'personalizacion', target: 'course_docente' },
  { area: 'aprendizaje', target: 'course_docente' },
  { area: 'evaluacion', target: 'course_docente' },
  { area: 'trabajo_docente', target: 'course_docente' },
  { area: 'familias', target: 'course_docente' },
  { area: 'liderazgo', target: 'school_responsible' },
  { area: 'proposito', target: 'school_responsible' },
];

/** Records the calls made on each table so tests can assert exact filters and payloads. */
function recordingClient(results: Record<string, unknown[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const queue = results[table] ?? [];
    const data = queue.length > 1 ? queue.shift() : queue[0] ?? null;
    const handler: ProxyHandler<object> = {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data, error: null, count: 0 });
        return (...args: unknown[]) => {
          calls.push({ table, method: String(prop), args });
          return new Proxy({}, handler);
        };
      },
    };
    return new Proxy({}, handler);
  });
  return { client: { from }, calls };
}

describe('POST /api/admin/assessment-builder/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'New Template', grade_id: 7 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks write permission', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({});
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'New Template', grade_id: 7 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when area or name is missing', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery([])),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion' }, // missing name and grade_id
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when grade_id is missing', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => buildChainableQuery(table === 'ab_via_assignment_rules' ? VIA_RULES : [])),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'Test' }, // missing grade_id
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 201 when creating a template successfully', async () => {
    const newTemplate = {
      id: 'new-id',
      area: 'evaluacion',
      name: 'New Template',
      status: 'draft',
      grade_id: 7,
    };

    // Track call count to distinguish version query from insert query
    let callCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'ab_via_assignment_rules') return buildChainableQuery(VIA_RULES);
        callCount++;
        if (table === 'assessment_templates' && callCount === 1) {
          // First call: nextTemplateVersion → select().eq().eq()
          return buildChainableQuery([{ version: '1.0.0' }]);
        }
        // Second call: insert().select().single()
        return buildChainableQuery(newTemplate);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'New Template', grade_id: 7 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.template).toBeDefined();
  });
});

describe('POST /api/admin/assessment-builder/templates — vía rules (20261008120000)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
  });

  const post = async (body: Record<string, unknown>, client: unknown) => {
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    const { req, res } = createMocks({ method: 'POST', body });
    await handler(req as any, res as any);
    return res;
  };

  it('refuses a grade on a school-level vía', async () => {
    const { client, calls } = recordingClient({ ab_via_assignment_rules: [VIA_RULES] });
    const res = await post({ area: 'liderazgo', name: 'LID Equipo', grade_id: 7 }, client);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain('no lleva nivel');
    expect(calls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('creates a grade-less school-level template, versioned by area + trimmed name', async () => {
    const { client, calls } = recordingClient({
      ab_via_assignment_rules: [VIA_RULES],
      assessment_templates: [
        [{ version: '1.0.3', name: 'LID Equipo' }, { version: '1.0.9', name: 'LID Otro' }],
        { id: 'new-id', area: 'liderazgo', grade_id: null },
      ],
    });
    const res = await post({ area: 'liderazgo', name: '  LID Equipo  ' }, client);
    expect(res._getStatusCode()).toBe(201);
    expect(calls).toContainEqual({ table: 'assessment_templates', method: 'is', args: ['grade_id', null] });
    const insert = calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ area: 'liderazgo', name: 'LID Equipo', grade_id: null, version: '1.0.4' });
  });

  it('fails closed when the rules cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      from: vi.fn((table: string) =>
        table === 'ab_via_assignment_rules' ? buildChainableQuery(null, { message: 'down' }) : buildChainableQuery([])
      ),
    };
    const res = await post({ area: 'evaluacion', name: 'EVA', grade_id: 7 }, client);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getData()).not.toContain('down');
  });

  it('maps a database guard refusal to 409', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let templateCalls = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'ab_via_assignment_rules') return buildChainableQuery(VIA_RULES);
        templateCalls++;
        // first call: version scan (empty scope); second: the refused insert
        return templateCalls === 1
          ? buildChainableQuery([])
          : buildChainableQuery(null, { message: 'template_grade_required', code: 'P0001' });
      }),
    };
    const res = await post({ area: 'evaluacion', name: 'EVA', grade_id: 7 }, client);
    expect(res._getStatusCode()).toBe(409);
  });
});

describe('GET count_only — grade-less count (20261008120000)', () => {
  it('grade_id=none counts templates without grade only', async () => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    const { client, calls } = recordingClient({ assessment_templates: [[]] });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    const { req, res } = createMocks({ method: 'GET', query: { count_only: 'true', area: 'liderazgo', grade_id: 'none' } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    expect(calls).toContainEqual({ table: 'assessment_templates', method: 'is', args: ['grade_id', null] });
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'grade_id')).toBe(false);
  });
});
