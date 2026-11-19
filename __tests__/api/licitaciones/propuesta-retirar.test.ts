// @vitest-environment node
/**
 * LIC-E2 (GENERA fixes F20g, the button only): an Admin can retire a proposal's
 * link by hand. POST /api/licitaciones/[id]/propuestas
 * `{ propuesta_id, accion: 'retirar' }` sets web_status 'expired' on that
 * version of THIS tender; the public page then answers as for an expired
 * proposal. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { RecordedRequest } from '../../helpers/recordingSupabase';
import { has } from '../../helpers/recordingSupabase';

const LIC = '22222222-2222-4222-8222-222222222222';
const OTHER_LIC = '33333333-3333-4333-8333-333333333333';
const PROP = '55555555-5555-4555-8555-555555555555';

const { h } = vi.hoisted(() => ({
  h: {
    role: 'admin',
    roleRow: {} as Record<string, unknown>,
    rows: [] as Array<Record<string, unknown>>,
    requests: [] as RecordedRequest[],
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => {
    if (req.target !== 'propuesta_generadas') return { data: null, error: null };
    const eqs = req.ops.filter(o => o.method === 'eq').map(o => o.args as [string, unknown]);
    const ins = req.ops.filter(o => o.method === 'in').map(o => o.args as [string, unknown[]]);
    const hit = h.rows.filter(r => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, vs]) => vs.includes(r[c])));
    if (has(req, 'update')) {
      const patch = req.ops.find(o => o.method === 'update')!.args[0] as Record<string, unknown>;
      hit.forEach(r => Object.assign(r, patch));
    }
    const data = hit.map(r => ({ ...r }));
    return terminal === 'await' ? { data, error: null } : { data: data[0] ?? null, error: null };
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => fake.client,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown) => res.status(200).json({ data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: h.role, is_active: true, from_cache: false, school_id: 1, ...h.roleRow }]),
}));
vi.mock('@/lib/propuestas/storage', () => ({ getSignedUrl: vi.fn(async () => 'http://localhost/signed.pdf') }));

import handler from '@/pages/api/licitaciones/[id]/propuestas';

async function post(body: unknown, tender = LIC) {
  const { req, res } = createMocks({ method: 'POST', query: { id: tender }, body });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const updates = () => h.requests.filter(r => r.target === 'propuesta_generadas' && has(r, 'update'));

beforeEach(() => {
  h.role = 'admin';
  h.roleRow = {};
  h.requests.length = 0;
  h.rows = [
    { id: PROP, licitacion_id: LIC, version: 1, estado: 'completada', web_slug: 'escuela-inventada-evoluciona-2026-v1-55555555', web_status: 'published' },
  ];
});

describe('POST /api/licitaciones/[id]/propuestas — «Retirar enlace» (LIC-E2)', () => {
  it('an Admin retires a version of THIS tender: web_status becomes expired', async () => {
    const r = await post({ propuesta_id: PROP, accion: 'retirar' });
    expect(r.status).toBe(200);
    expect(r.json.data.propuesta).toMatchObject({ id: PROP, web_status: 'expired' });
    expect(h.rows[0].web_status).toBe('expired');
    expect(updates()).toHaveLength(1);
    const u = updates()[0];
    expect(u.ops.find(o => o.method === 'update')!.args[0]).toEqual({ web_status: 'expired' });
    // The write is scoped to the version AND the tender.
    expect(u.ops.some(o => o.method === 'eq' && o.args[0] === 'id' && o.args[1] === PROP)).toBe(true);
    expect(u.ops.some(o => o.method === 'eq' && o.args[0] === 'licitacion_id' && o.args[1] === LIC)).toBe(true);
    // Send-back 1 (3): the update itself only matches a live version.
    const live = u.ops.find(o => o.method === 'in');
    expect(live?.args).toEqual(['web_status', ['published', 'viewed']]);
  });

  it('a version of another tender → 404, nothing written', async () => {
    const r = await post({ propuesta_id: PROP, accion: 'retirar' }, OTHER_LIC);
    expect(r.status).toBe(404);
    expect(h.rows[0].web_status).toBe('published');
    expect(updates()).toHaveLength(0);
  });

  it('a non-admin gets the route\'s existing refusal, nothing read or written', async () => {
    for (const role of ['encargado_licitacion', 'consultor', 'equipo_directivo']) {
      h.role = role;
      h.requests.length = 0;
      const r = await post({ propuesta_id: PROP, accion: 'retirar' });
      expect(r.status).toBe(403);
      expect(r.json.error).toBe('Solo administradores pueden acceder');
      expect(h.requests.filter(q => q.target === 'propuesta_generadas')).toHaveLength(0);
    }
    expect(h.rows[0].web_status).toBe('published');
  });

  it('an unknown action → 400, nothing written', async () => {
    for (const body of [{ propuesta_id: PROP, accion: 'borrar' }, { propuesta_id: PROP }, { propuesta_id: 'no-uuid', accion: 'retirar' }]) {
      const r = await post(body);
      expect(r.status).toBe(400);
    }
    expect(updates()).toHaveLength(0);
    expect(h.rows[0].web_status).toBe('published');
  });

  it('GET still lists the versions; other methods are still refused', async () => {
    const { req, res } = createMocks({ method: 'GET', query: { id: LIC } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.propuestas).toHaveLength(1);
    const del = createMocks({ method: 'DELETE', query: { id: LIC } });
    await handler(del.req, del.res);
    expect(del.res._getStatusCode()).toBe(405);
  });

  // ── Send-back 1 ─────────────────────────────────────────────────────────
  it('(2) a cached admin row is refused with the route\'s existing refusal, nothing written', async () => {
    h.roleRow = { from_cache: true };
    const r = await post({ propuesta_id: PROP, accion: 'retirar' });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('Solo administradores pueden acceder');
    expect(updates()).toHaveLength(0);
    expect(h.rows[0].web_status).toBe('published');
  });

  it('(2) an inactive admin row is refused, nothing written', async () => {
    h.roleRow = { is_active: false };
    const r = await post({ propuesta_id: PROP, accion: 'retirar' });
    expect(r.status).toBe(403);
    expect(updates()).toHaveLength(0);
    expect(h.rows[0].web_status).toBe('published');
  });

  it('(3) a version still «generando» → 409, unchanged', async () => {
    h.rows = [{ id: PROP, licitacion_id: LIC, version: 2, estado: 'generando', web_slug: null, web_status: null }];
    const r = await post({ propuesta_id: PROP, accion: 'retirar' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('Solo se puede retirar un enlace que está publicado.');
    expect(h.rows[0].web_status).toBeNull();
    expect(h.rows[0].estado).toBe('generando');
  });

  it('(3) a version in error → 409, unchanged', async () => {
    h.rows = [{ id: PROP, licitacion_id: LIC, version: 2, estado: 'error', web_slug: null, web_status: null }];
    const r = await post({ propuesta_id: PROP, accion: 'retirar' });
    expect(r.status).toBe(409);
    expect(h.rows[0].web_status).toBeNull();
  });

  it('(3) an already expired version → 409, unchanged', async () => {
    h.rows[0].web_status = 'expired';
    const r = await post({ propuesta_id: PROP, accion: 'retirar' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('Solo se puede retirar un enlace que está publicado.');
    expect(h.rows[0].web_status).toBe('expired');
  });
});
