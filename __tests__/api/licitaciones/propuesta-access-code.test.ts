// @vitest-environment node
/**
 * LIC-E3 (GENERA fixes F14): the proposal's access code is stored readable
 * (propuesta_generadas.access_code_plain, next to its bcrypt hash in
 * access_code). The admin-only history route that loads the panel's data
 * returns it to an Admin and to nobody else, and the code it returns is the
 * one the public page accepts. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { generateAccessCode, hashAccessCode } from '@/lib/propuestas-web/access-code';

const { h } = vi.hoisted(() => ({ h: { role: 'admin', row: {} as Record<string, unknown>, tables: [] as string[] } }));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req, terminal) => {
    h.tables.push(req.target);
    if (req.target === 'propuesta_generadas') return { data: terminal === 'await' ? [h.row] : h.row, error: null };
    return { data: null, error: null };
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
  getUserRoles: vi.fn(async () => [{ role_type: h.role, is_active: true, from_cache: false, school_id: 1 }]),
}));
vi.mock('@/lib/propuestas/storage', () => ({ getSignedUrl: vi.fn(async () => 'http://localhost/signed.pdf') }));
vi.mock('@/lib/propuestas-web/access-rate-limit', () => ({
  getProposalRequestIp: () => '127.0.0.1',
  reserveProposalAccessAttempt: vi.fn(async () => ({ allowed: true, degraded: false, remaining: 4, attemptId: 'a1' })),
  releaseProposalAccessAttempt: vi.fn(async () => undefined),
}));
vi.mock('@/lib/propuestas-web/resolve-urls', () => ({ resolveSnapshotUrls: vi.fn(async (s: unknown) => s) }));

import historial from '@/pages/api/licitaciones/[id]/propuestas';
import verify from '@/pages/api/propuestas/web/[slug]/verify';

let code: string;

beforeEach(async () => {
  h.role = 'admin'; h.tables = [];
  code = generateAccessCode();
  h.row = {
    id: 'prop-1', licitacion_id: '22222222-2222-4222-8222-222222222222', estado: 'completada', version: 1,
    archivo_path: null, web_slug: 'escuela-inventada-evoluciona-2026-v1', web_status: 'published',
    access_code: await hashAccessCode(code), access_code_plain: code, snapshot_json: { synthetic: true },
    view_count: 0, viewed_at: null,
  };
});

async function getHistorial() {
  const { req, res } = createMocks({ method: 'GET', query: { id: '22222222-2222-4222-8222-222222222222' } });
  await historial(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

describe('the access code reaches the Admin after a reload, and works', () => {
  it('the history route gives the Admin the readable code of each generated version', async () => {
    const r = await getHistorial();
    expect(r.status).toBe(200);
    expect(r.json.data.propuestas[0].access_code_plain).toBe(code);
  });

  it('a non-admin gets no code (refused before any read)', async () => {
    for (const role of ['encargado_licitacion', 'consultor', 'equipo_directivo']) {
      h.role = role; h.tables = [];
      const r = await getHistorial();
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.json)).not.toContain(code);
      expect(h.tables).toEqual([]);
    }
  });

  it('the public page accepts the code the Admin was given', async () => {
    const shown = (await getHistorial()).json.data.propuestas[0].access_code_plain;
    const { req, res } = createMocks({ method: 'POST', query: { slug: h.row.web_slug as string }, body: { code: shown } });
    await verify(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});
