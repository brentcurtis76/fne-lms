// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdminOrEquipoDirectivo, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdminOrEquipoDirectivo: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdminOrEquipoDirectivo: mockCheckIsAdminOrEquipoDirectivo,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

import handler from '../../../pages/api/admin/growth-communities/index';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const GENERATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMMUNITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCHOOL_ID = 1;
const OTHER_SCHOOL_ID = 999;
const FORBIDDEN_MESSAGE = 'No tienes permiso para crear comunidades';

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

interface FromCall {
  table: string;
  inserts: unknown[];
  updates: unknown[];
  inArgs: unknown[];
}

interface Tracker {
  fromCalls: FromCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [] };
}

/**
 * Mirrors the sequenced from() builder in growth-communities-leaders.test.ts:
 * each from(table) call consumes the next configured result for that table.
 * The chain proxy supports await, .single() / .maybeSingle(), and records
 * inserts so tests can assert the exact insert payload.
 */
function buildSequencedClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker?: Tracker,
) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null };

      const fromCall: FromCall = { table, inserts: [], updates: [], inArgs: [] };
      tracker?.fromCalls.push(fromCall);

      const resolved = {
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count,
      };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'insert') {
            return vi.fn((arg: unknown) => {
              fromCall.inserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'update') {
            return vi.fn((arg: unknown) => {
              fromCall.updates.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'in') {
            return vi.fn((_col: string, ids: unknown) => {
              fromCall.inArgs.push(ids);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };
}

function setupAdmin() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'admin',
    schoolId: null,
    user: { id: ADMIN_ID } as any,
    error: null,
  });
}

function setupEquipoDirectivo(schoolId: number) {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'equipo_directivo',
    schoolId,
    user: { id: ED_ID } as any,
    error: null,
  });
}

function setupUnauthorized() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: null,
    schoolId: null,
    user: null,
    error: null,
  });
}

const SCHOOL_WITH_GENS = { id: SCHOOL_ID, has_generations: true };
const SCHOOL_WITHOUT_GENS = { id: SCHOOL_ID, has_generations: false };

describe('admin/growth-communities — POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin creates in school with generations and a valid generation_id — 201, payload normalized', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITH_GENS }],
          generations: [{ data: { id: GENERATION_ID } }],
          growth_communities: [{
            data: {
              id: COMMUNITY_ID,
              name: 'Comunidad A',
              school_id: SCHOOL_ID,
              generation_id: GENERATION_ID,
              max_teachers: 16,
              description: null,
            },
          }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: '  Comunidad A  ',
        school_id: SCHOOL_ID,
        generation_id: GENERATION_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(201);
    expect(JSON.parse(res._getData()).community.id).toBe(COMMUNITY_ID);

    const inserts = tracker.fromCalls.flatMap((c) => c.inserts);
    expect(inserts).toHaveLength(1);
    const payload = inserts[0] as Record<string, unknown>;
    // name trimmed, default max_teachers, omitted description normalized to null,
    // and the schema-foreign `transformation_enabled` must NEVER be sent.
    expect(payload).toEqual({
      name: 'Comunidad A',
      school_id: SCHOOL_ID,
      generation_id: GENERATION_ID,
      max_teachers: 16,
      description: null,
    });
    expect(payload).not.toHaveProperty('transformation_enabled');
  });

  it('admin creates in school WITHOUT generations and omits generation_id — 201, generation_id null', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITHOUT_GENS }],
          growth_communities: [{ data: { id: COMMUNITY_ID } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'Sin Generaciones', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(201);

    // generations table must NOT be queried when the school has no generations.
    expect(tracker.fromCalls.map((c) => c.table)).toEqual([
      'schools',
      'growth_communities',
    ]);

    const payload = tracker.fromCalls
      .flatMap((c) => c.inserts)[0] as Record<string, unknown>;
    expect(payload).toEqual({
      name: 'Sin Generaciones',
      school_id: SCHOOL_ID,
      generation_id: null,
      max_teachers: 16,
      description: null,
    });
    expect(payload).not.toHaveProperty('transformation_enabled');
  });

  it('admin creates with custom max_teachers=8 and a description — 201, both forwarded', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITHOUT_GENS }],
          growth_communities: [{ data: { id: COMMUNITY_ID } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: 'Pequeña',
        school_id: SCHOOL_ID,
        max_teachers: 8,
        description: 'Una descripción válida.',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(201);
    const payload = tracker.fromCalls
      .flatMap((c) => c.inserts)[0] as Record<string, unknown>;
    expect(payload.max_teachers).toBe(8);
    expect(payload.description).toBe('Una descripción válida.');
    expect(payload).not.toHaveProperty('transformation_enabled');
  });

  it('400 when name is missing — no supabase call', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: { school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 when max_teachers=1 (below minimum) — no supabase call', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'X', school_id: SCHOOL_ID, max_teachers: 1 },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 when max_teachers=17 (above maximum) — no supabase call', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'X', school_id: SCHOOL_ID, max_teachers: 17 },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 when description exceeds 500 characters — no supabase call', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: 'X',
        school_id: SCHOOL_ID,
        description: 'a'.repeat(501),
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('404 when school is not found — no insert', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { schools: [{ data: null, error: { message: 'not found' } }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'X', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
  });

  it('400 generation_required when school has generations and generation_id is omitted', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        { schools: [{ data: SCHOOL_WITH_GENS }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'X', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('generation_required');
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
  });

  it('400 generation_invalid when generation_id belongs to another school', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITH_GENS }],
          generations: [{ data: null, error: { message: 'no rows' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: 'X',
        school_id: SCHOOL_ID,
        generation_id: GENERATION_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('generation_invalid');
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(0);
  });

  it('school without generations + generation_id provided → normalized to null in insert payload', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITHOUT_GENS }],
          growth_communities: [{ data: { id: COMMUNITY_ID } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: 'Ignora generación',
        school_id: SCHOOL_ID,
        generation_id: GENERATION_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(201);
    // generations table is never consulted; the offered generation_id is dropped.
    expect(tracker.fromCalls.map((c) => c.table)).toEqual([
      'schools',
      'growth_communities',
    ]);
    const payload = tracker.fromCalls
      .flatMap((c) => c.inserts)[0] as Record<string, unknown>;
    expect(payload.generation_id).toBeNull();
  });

  it('insert returning Postgres 23505 maps to 409 duplicate_name', async () => {
    setupAdmin();
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITHOUT_GENS }],
          growth_communities: [{
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'Dup', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toBe('duplicate_name');
  });
});

describe('admin/growth-communities — equipo_directivo school scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ED creates in own school — 201', async () => {
    setupEquipoDirectivo(SCHOOL_ID);
    const tracker = makeTracker();

    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildSequencedClient(
        {
          schools: [{ data: SCHOOL_WITHOUT_GENS }],
          growth_communities: [{ data: { id: COMMUNITY_ID } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'ED Comunidad', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(201);
    expect(tracker.fromCalls.flatMap((c) => c.inserts)).toHaveLength(1);
  });

  it('ED targeting a different school is forbidden — no supabase call', async () => {
    setupEquipoDirectivo(OTHER_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'X', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_MESSAGE });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('admin/growth-communities — auth + method guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unauthorized helper result → 403, no supabase call', async () => {
    setupUnauthorized();

    const { req, res } = createMocks({
      method: 'POST',
      body: { name: 'X', school_id: SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({ error: FORBIDDEN_MESSAGE });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('GET → 405 with Allow: POST header', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('POST');
    // Method gate runs before auth — the auth helper must not be consulted.
    expect(mockCheckIsAdminOrEquipoDirectivo).not.toHaveBeenCalled();
  });
});
