// @vitest-environment node
/**
 * Z2-1 [A9] [A10] — PUT /api/sessions/[id] and the managed-meeting guard (plan §8).
 *
 * The guard keys on the STORED `is_zoom_managed`, never on the request: intent is
 * durable, and a session can be managed long before a meeting exists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/index';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status, details) => {
    res.status(status).json({ error: message, details });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const CONSULTANT_ID = '22222222-2222-4222-8222-222222222222';

type MockState = {
  row: Record<string, any>;
  /** The payloads the route actually sent to `.update(...)`. */
  updates: Array<Record<string, any>>;
};

function createMockClient(state: MockState) {
  const sessionsBuilder = () => {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, any> | null = null;

    const finalize = () => {
      if (op === 'select') return Promise.resolve({ data: { ...state.row }, error: null });
      state.updates.push(payload || {});
      state.row = { ...state.row, ...(payload || {}) };
      return Promise.resolve({ data: { ...state.row }, error: null });
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, any>) => {
        op = 'update';
        payload = p;
        return api;
      }),
      eq: vi.fn(() => api),
      single: vi.fn(() => finalize()),
      maybeSingle: vi.fn(() => finalize()),
    };
    return api;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_facilitators') {
        const api: any = {
          select: vi.fn(() => api),
          eq: vi.fn(() => api),
          single: vi.fn(async () => ({ data: { id: 'fac-1' }, error: null })),
        };
        return api;
      }
      if (table === 'session_activity_log') {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function sessionRow(overrides: Record<string, any> = {}) {
  return {
    id: SESSION_ID,
    title: 'Sesión de acompañamiento',
    description: 'd',
    objectives: 'o',
    status: 'programada',
    modality: 'online',
    meeting_provider: 'zoom',
    meeting_link: null,
    is_zoom_managed: true,
    is_active: true,
    updated_at: '2026-08-04T10:00:00.000Z',
    ...overrides,
  };
}

function put(body: Record<string, any>) {
  return createMocks({
    method: 'PUT',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
    body,
  });
}

let state: MockState;

async function actAs(role: 'admin' | 'consultor') {
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
  (getUserRoles as any).mockResolvedValue([
    { role_type: role, is_active: true, school_id: null, community_id: null },
  ]);
  (getHighestRole as any).mockReturnValue(role);
}

beforeEach(async () => {
  vi.clearAllMocks();
  state = { row: sessionRow(), updates: [] };

  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  (getApiUser as any).mockResolvedValue({ user: { id: CONSULTANT_ID }, error: null });
  (createServiceRoleClient as any).mockImplementation(() => createMockClient(state));

  await actAs('admin');
});

describe('PUT /api/sessions/[id] — managed meeting_link guard [A9]', () => {
  it('rejects setting meeting_link on a managed session with 409 in es-CL', async () => {
    const { req, res } = put({ meeting_link: 'https://zoom.us/j/999' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('ZOOM_MANAGED_SESSION');
    expect(body.error).toBe(
      'Esta sesión usa una reunión Zoom gestionada por la plataforma; el enlace no se edita manualmente.'
    );
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a managed session moving off the zoom provider with 409', async () => {
    const { req, res } = put({ meeting_provider: 'google_meet' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).code).toBe('ZOOM_MANAGED_SESSION');
    expect(state.updates).toHaveLength(0);
  });

  it("allows re-sending meeting_provider: 'zoom' on a managed session", async () => {
    const { req, res } = put({ meeting_provider: 'zoom', title: 'Nuevo título' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toMatchObject({ meeting_provider: 'zoom', title: 'Nuevo título' });
  });

  it('the same PUT on an UNMANAGED session is unchanged', async () => {
    state.row = sessionRow({ is_zoom_managed: false });

    const { req, res } = put({ meeting_link: 'https://zoom.us/j/999' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toMatchObject({ meeting_link: 'https://zoom.us/j/999' });
  });

  it('a PUT of an unrelated field on a managed session is unchanged', async () => {
    const { req, res } = put({ title: 'Nuevo título' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ title: 'Nuevo título' });
  });

  it('a consultant editing an unrelated field on a managed session is unaffected', async () => {
    await actAs('consultor');

    const { req, res } = put({ description: 'Notas actualizadas' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ description: 'Notas actualizadas' });
  });

  it('a consultant setting meeting_link on a managed session also gets 409', async () => {
    await actAs('consultor');

    const { req, res } = put({ meeting_link: 'https://zoom.us/j/999' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    expect(state.updates).toHaveLength(0);
  });
});

describe('PUT /api/sessions/[id] — managed intent toggle [A10]', () => {
  it('admin + borrador: allowed', async () => {
    state.row = sessionRow({ status: 'borrador', is_zoom_managed: false });

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ is_zoom_managed: true });
  });

  it('admin + pendiente_aprobacion: allowed', async () => {
    state.row = sessionRow({ status: 'pendiente_aprobacion', is_zoom_managed: false });

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ is_zoom_managed: true });
  });

  it('admin + programada: 409 in es-CL, nothing written', async () => {
    const { req, res } = put({ is_zoom_managed: false });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('ZOOM_MANAGED_LOCKED');
    expect(body.error).toBe(
      'La reunión Zoom gestionada solo se puede activar o desactivar mientras la sesión está en borrador o pendiente de aprobación.'
    );
    expect(state.updates).toHaveLength(0);
  });

  it('admin + completada: 409', async () => {
    state.row = sessionRow({ status: 'completada' });

    const { req, res } = put({ is_zoom_managed: false });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    expect(state.updates).toHaveLength(0);
  });

  it('consultant: 403 even on a borrador session', async () => {
    await actAs('consultor');
    state.row = sessionRow({ status: 'borrador', is_zoom_managed: false });

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe(
      'Los consultores no pueden activar ni desactivar la reunión Zoom gestionada por la plataforma.'
    );
    expect(state.updates).toHaveLength(0);
  });

  it('rejects a non-boolean flag rather than writing it to a NOT NULL column', async () => {
    state.row = sessionRow({ status: 'borrador', is_zoom_managed: false });

    const { req, res } = put({ is_zoom_managed: null });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('is_zoom_managed debe ser un booleano');
    expect(state.updates).toHaveLength(0);
  });
});
