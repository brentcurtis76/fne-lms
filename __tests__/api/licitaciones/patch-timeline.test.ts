// @vitest-environment node
/**
 * LIC-D9 (GENERA fixes F14): the Admin's adjusted timeline is stored through
 * PATCH /api/licitaciones/[id] { timeline }; an Encargado is refused as today.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => ({ h: { role: 'admin', updates: [] as unknown[] } }));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has, opArgs } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req) => {
    if (req.target === 'licitaciones' && has(req, 'update')) {
      h.updates.push(opArgs(req, 'update')?.[0]);
      return { data: { id: 'lic-1', estado: 'recepcion_bases_pendiente', ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (req.target === 'licitaciones') return { data: { id: 'lic-1', fecha_limite_propuestas: '2026-11-20' }, error: null };
    return { data: null, error: null };
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => fake.client,
    createApiSupabaseClient: async () => fake.client,
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

const timeline = { fecha_limite_propuestas: '2026-11-27' };

async function patch() {
  const { req, res } = createMocks({ method: 'PATCH', query: { id: '22222222-2222-4222-8222-222222222222' }, body: { timeline } });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

beforeEach(() => { h.role = 'admin'; h.updates = []; });

describe('PATCH /api/licitaciones/[id] { timeline }', () => {
  it("stores the Admin's change", async () => {
    const r = await patch();
    expect(r.status).toBe(200);
    expect(h.updates).toEqual([timeline]);
    expect(r.json.data.licitacion.fecha_limite_propuestas).toBe('2026-11-27');
  });

  it("refuses an Encargado's change, as today", async () => {
    h.role = 'encargado_licitacion';
    const r = await patch();
    expect(r.status).toBe(403);
    expect(h.updates).toEqual([]);
  });
});
