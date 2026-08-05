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
    // Three keys, not one: the Z2-1 r3 ruling forces the managed shape on the ON
    // transition unconditionally. This literal IS the ruling, not drift.
    expect(state.updates[0]).toEqual({
      is_zoom_managed: true,
      meeting_link: null,
      meeting_provider: 'zoom',
    });
  });

  it('admin + pendiente_aprobacion: allowed', async () => {
    state.row = sessionRow({ status: 'pendiente_aprobacion', is_zoom_managed: false });

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    // Three keys, not one: the Z2-1 r3 ruling forces the managed shape on the ON
    // transition unconditionally. This literal IS the ruling, not drift.
    expect(state.updates[0]).toEqual({
      is_zoom_managed: true,
      meeting_link: null,
      meeting_provider: 'zoom',
    });
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

/**
 * Z2-1 r3 — the ON transition forces the managed shape (ruling: Reading A, force
 * unconditionally). The r1 toggle tests above ran on a fixture whose stored link was
 * already null and whose provider was already 'zoom', so they could not tell forcing
 * apart from doing nothing. These start from the opposite shape.
 */
describe('PUT /api/sessions/[id] — managed ON transition forces the shape [R1] [R2]', () => {
  /** Unmanaged, pre-approval, and carrying a rival link on a non-zoom provider. */
  function unmanagedWithManualLink(overrides: Record<string, any> = {}) {
    return sessionRow({
      status: 'borrador',
      is_zoom_managed: false,
      modality: 'online',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      meeting_provider: 'google_meet',
      ...overrides,
    });
  }

  it('discards a stored manual link and forces provider zoom, in ONE update [R1]', async () => {
    state.row = unmanagedWithManualLink();

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toEqual({
      is_zoom_managed: true,
      meeting_link: null,
      meeting_provider: 'zoom',
    });
  });

  it('a manual link sent WITH the toggle is discarded, not stored [R1]', async () => {
    state.row = unmanagedWithManualLink();

    const { req, res } = put({
      is_zoom_managed: true,
      meeting_link: 'https://zoom.us/j/999',
      meeting_provider: 'otro',
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toEqual({
      is_zoom_managed: true,
      meeting_link: null,
      meeting_provider: 'zoom',
    });
  });

  it('re-sending true on an already-managed row forces nothing extra [R2]', async () => {
    // Deliberately mismatched stored values: if forcing were keyed on "stored differs"
    // rather than on the transition, this row would be rewritten. It must not be.
    state.row = sessionRow({
      status: 'borrador',
      is_zoom_managed: true,
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      meeting_provider: 'google_meet',
    });

    const { req, res } = put({ is_zoom_managed: true, title: 'Nuevo título' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ is_zoom_managed: true, title: 'Nuevo título' });
  });
});

describe('PUT /api/sessions/[id] — modality rule on the ON transition [R3]', () => {
  const MODALITY_ERROR =
    'Solo las sesiones online o híbridas pueden usar una reunión Zoom gestionada por la plataforma';

  it('refuses the toggle on a stored presencial session with 400 es-CL, nothing written', async () => {
    state.row = sessionRow({
      status: 'borrador',
      is_zoom_managed: false,
      modality: 'presencial',
    });

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe(MODALITY_ERROR);
    expect(state.updates).toHaveLength(0);
  });

  it('refuses the toggle when the request itself moves modality to presencial', async () => {
    state.row = sessionRow({ status: 'borrador', is_zoom_managed: false, modality: 'online' });

    const { req, res } = put({ is_zoom_managed: true, modality: 'presencial' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe(MODALITY_ERROR);
    expect(state.updates).toHaveLength(0);
  });

  it("allows modality: 'online' sent together with the toggle on a presencial row", async () => {
    state.row = sessionRow({
      status: 'borrador',
      is_zoom_managed: false,
      modality: 'presencial',
      meeting_link: null,
      meeting_provider: null,
    });

    const { req, res } = put({ is_zoom_managed: true, modality: 'online' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({
      is_zoom_managed: true,
      modality: 'online',
      meeting_link: null,
      meeting_provider: 'zoom',
    });
  });

  it('allows the toggle on a hibrida session', async () => {
    state.row = sessionRow({
      status: 'borrador',
      is_zoom_managed: false,
      modality: 'hibrida',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      meeting_provider: 'google_meet',
    });

    const { req, res } = put({ is_zoom_managed: true });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({
      is_zoom_managed: true,
      meeting_link: null,
      meeting_provider: 'zoom',
    });
  });
});
