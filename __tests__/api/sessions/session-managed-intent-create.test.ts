// @vitest-environment node
/**
 * Z2-1 [A8] — POST /api/sessions accepts durable managed intent (plan §8).
 *
 * The interesting part is what a managed request is EXEMPT from: `meeting_link` does not
 * exist yet at creation time, because the meeting is provisioned asynchronously at
 * approval. Everything an unmanaged request does must be untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_ID = '22222222-2222-4222-8222-222222222222';
const GROWTH_COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const SCHOOL_ID = 1;

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockValidateFacilitatorIntegrity } =
  vi.hoisted(() => ({
    mockCheckIsAdmin: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockValidateFacilitatorIntegrity: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/utils/facilitator-validation', () => ({
  validateFacilitatorIntegrity: mockValidateFacilitatorIntegrity,
}));

import handler from '../../../pages/api/sessions/index';

/** Captures the rows the route tried to insert into `consultor_sessions`. */
const inserted: Array<Record<string, any>> = [];

function thenable(data: unknown, error: unknown = null) {
  const proxy: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data, error });
      }
      return vi.fn(() => new Proxy({}, proxy));
    },
  };
  return new Proxy({}, proxy);
}

function mockClient() {
  return {
    from: vi.fn((table: string) => {
      // Unit B1: the route reads the selected school's tenant controls first. A client
      // tenant keeps the §8 managed-intent behaviour this file pins.
      if (table === 'schools') {
        return thenable({ id: SCHOOL_ID, tenant_kind: 'client', internal_zoom_testing_enabled: false });
      }
      if (table === 'growth_communities') return thenable([{ id: GROWTH_COMMUNITY_ID }]);
      if (table === 'consultor_sessions') {
        const api: any = {
          insert: vi.fn((rows: Array<Record<string, any>>) => {
            inserted.push(...rows);
            return api;
          }),
          select: vi.fn(() => api),
          in: vi.fn(() => api),
          delete: vi.fn(() => api),
          eq: vi.fn(() => api),
        };
        api.then = (resolve: (v: unknown) => void) =>
          resolve({
            data: inserted.map((row, i) => ({ ...row, id: `session-${i + 1}` })),
            error: null,
          });
        return api;
      }
      return thenable([]);
    }),
  };
}

const FACILITATORS = [
  { user_id: CONSULTANT_ID, facilitator_role: 'consultor_externo', is_lead: true },
];

function body(overrides: Record<string, unknown> = {}) {
  return {
    school_id: SCHOOL_ID,
    growth_community_id: GROWTH_COMMUNITY_ID,
    title: 'Sesión de acompañamiento',
    session_date: '2099-08-05',
    start_time: '15:00:00',
    end_time: '16:30:00',
    modality: 'online',
    facilitators: FACILITATORS,
    ...overrides,
  };
}

function post(payload: Record<string, unknown>) {
  return createMocks({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => mockClient());
  mockValidateFacilitatorIntegrity.mockResolvedValue({ valid: true, errors: [] });
});

describe('POST /api/sessions — durable managed intent', () => {
  it('[A8] creates a managed online session with NO meeting_link', async () => {
    const { req, res } = post(body({ is_zoom_managed: true }));
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      is_zoom_managed: true,
      meeting_provider: 'zoom',
      meeting_link: null,
    });
  });

  it('[A8] the same request WITHOUT the flag still returns the existing 400', async () => {
    const { req, res } = post(body());
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe(
      'meeting_link es requerido para modalidad online o hibrida'
    );
    expect(inserted).toHaveLength(0);
  });

  it('[A8] a managed presencial request is rejected in es-CL', async () => {
    const { req, res } = post(
      body({ is_zoom_managed: true, modality: 'presencial', location: 'Sala 3' })
    );
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe(
      'Solo las sesiones online o híbridas pueden usar una reunión Zoom gestionada por la plataforma'
    );
    expect(inserted).toHaveLength(0);
  });

  it('[A8] a managed hibrida request is allowed', async () => {
    const { req, res } = post(
      body({ is_zoom_managed: true, modality: 'hibrida', location: 'Sala 3' })
    );
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(inserted[0]).toMatchObject({ is_zoom_managed: true, meeting_provider: 'zoom' });
  });

  it('[A8] managed intent wins over a link the caller sent anyway', async () => {
    const { req, res } = post(
      body({ is_zoom_managed: true, meeting_link: 'https://meet.google.com/abc-defg-hij' })
    );
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(inserted[0].meeting_link).toBeNull();
    expect(inserted[0].meeting_provider).toBe('zoom');
  });

  it('[A8] every row of a managed recurrence series carries the flag', async () => {
    const { req, res } = post(
      body({ is_zoom_managed: true, recurrence: { frequency: 'weekly', count: 3 } })
    );
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(inserted).toHaveLength(3);
    expect(inserted.every((row) => row.is_zoom_managed === true)).toBe(true);
    expect(inserted.every((row) => row.meeting_link === null)).toBe(true);
    expect(inserted.every((row) => row.meeting_provider === 'zoom')).toBe(true);
  });

  it('[A8] an unmanaged request is unchanged — flag false, link kept, provider detected', async () => {
    const { req, res } = post(
      body({ is_zoom_managed: false, meeting_link: 'https://zoom.us/j/123456789' })
    );
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(inserted[0]).toMatchObject({
      is_zoom_managed: false,
      meeting_link: 'https://zoom.us/j/123456789',
    });
  });

  it('[A8] a request that never mentions the flag stores it as false', async () => {
    const { req, res } = post(body({ meeting_link: 'https://zoom.us/j/123456789' }));
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(inserted[0].is_zoom_managed).toBe(false);
  });

  it('rejects a non-boolean flag rather than writing it to a NOT NULL column', async () => {
    const { req, res } = post(body({ is_zoom_managed: 'true' }));
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('is_zoom_managed debe ser un booleano');
    expect(inserted).toHaveLength(0);
  });
});
