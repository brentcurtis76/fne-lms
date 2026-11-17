// @vitest-environment node
/**
 * LIC-A2 (GENERA fixes F14): since only admins read `clientes`, the tender
 * detail read with an Encargado's own session came back without its client,
 * so the publication text and the Cliente block were empty. After the route's
 * existing visibility check (the tender read with the caller's own session),
 * the client is now read with the service role and only the printed fields
 * are returned. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h, LIC, FULL_CLIENTE } = vi.hoisted(() => ({
  h: {
    role: 'admin',
    userSeesTender: true,
    userSeesCliente: false,
    serviceReads: [] as Array<{ table: string; select: string }>,
  },
  LIC: '22222222-2222-4222-8222-222222222222',
  FULL_CLIENTE: {
    id: 'cliente-1', nombre_legal: 'Fundación Educacional Inventada', nombre_fantasia: 'Colegio Inventado',
    rut: '76.000.000-0', direccion: 'Calle Ficticia 123', comuna: 'Comuna Ficticia', ciudad: 'Ciudad Ficticia',
    nombre_representante: 'Representante Inventado', rut_representante: '11.111.111-1',
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, selects } = await import('../../helpers/recordingSupabase');
  const tender = { id: LIC, school_id: 1, cliente_id: 'cliente-1', programa_id: null, estado: 'publicacion_pendiente', email_licitacion: 'licitacion@inventado.test' };
  const user = createRecordingSupabase();
  user.state.respond = (req) => {
    if (req.target === 'licitaciones') return h.userSeesTender ? { data: tender, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    if (req.target === 'schools') return { data: { id: 1, name: 'Escuela Inventada', cliente_id: 'cliente-1' }, error: null };
    if (req.target === 'clientes') return h.userSeesCliente ? { data: FULL_CLIENTE, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    return { data: null, error: null };
  };
  const service = createRecordingSupabase();
  service.state.respond = (req) => {
    h.serviceReads.push({ table: req.target, select: selects(req).join(',') });
    if (req.target === 'clientes') {
      const cols = selects(req).join(',').split(',').map(c => c.trim()).filter(Boolean);
      return { data: Object.fromEntries(cols.map(c => [c, (FULL_CLIENTE as Record<string, unknown>)[c]])), error: null };
    }
    return { data: null, error: null };
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => service.client,
    createApiSupabaseClient: async () => user.client,
    getForcedPasswordChangeVerdict: async () => 'allowed',
    sendForcedPasswordChangeResponse: () => false,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown) => res.status(200).json({ data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: h.role, is_active: true, from_cache: false, school_id: 1 }]),
}));

import handler from '@/pages/api/licitaciones/[id]';

const PRINTED = ['nombre_legal', 'nombre_fantasia', 'rut', 'nombre_representante', 'comuna'];

async function get() {
  const { req, res } = createMocks({ method: 'GET', query: { id: LIC } });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

beforeEach(() => {
  h.role = 'admin'; h.userSeesTender = true; h.userSeesCliente = false; h.serviceReads = [];
});

describe('GET /api/licitaciones/[id] — the Encargado gets the printed client fields', () => {
  it('returns the client to the Encargado of the school, limited to the printed fields', async () => {
    h.role = 'encargado_licitacion';
    const r = await get();
    expect(r.status).toBe(200);
    const cliente = r.json.data.licitacion.cliente;
    expect(cliente).not.toBeNull();
    expect(Object.keys(cliente).sort()).toEqual([...PRINTED].sort());
    expect(cliente.nombre_fantasia).toBe('Colegio Inventado');
    expect(cliente.comuna).toBe('Comuna Ficticia');
    expect(cliente).not.toHaveProperty('rut_representante');
    expect(cliente).not.toHaveProperty('direccion');
  });

  it('never widens what an Encargado sees, even if their own session did return the client', async () => {
    h.role = 'encargado_licitacion';
    h.userSeesCliente = true;
    const r = await get();
    expect(Object.keys(r.json.data.licitacion.cliente).sort()).toEqual([...PRINTED].sort());
  });

  it('refuses the Encargado of another school as today, without reading the client', async () => {
    h.role = 'encargado_licitacion';
    h.userSeesTender = false;
    const r = await get();
    expect(r.status).toBe(404);
    expect(h.serviceReads.some(x => x.table === 'clientes')).toBe(false);
  });

  it('leaves the Admin body unchanged (client from their own session, no service read)', async () => {
    h.userSeesCliente = true;
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.data.licitacion.cliente).toEqual(FULL_CLIENTE);
    expect(h.serviceReads.some(x => x.table === 'clientes')).toBe(false);
  });
});
