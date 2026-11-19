// @vitest-environment node
/**
 * LIC-E4 (GENERA fixes F20g): two proposals of the same school, year, type and
 * version used to ask for the same link; the unique index refused the second
 * one after its PDF was stored. The link now carries a short part of the
 * proposal's own id. Synthetic data only; no real storage or PDF.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

const { h } = vi.hoisted(() => ({
  h: { requests: [] as RecordedRequest[], nextId: 0 },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => {
    if (req.target === 'licitaciones') return { data: { id: 'lic', numero_licitacion: 'LIC-1', nombre_licitacion: 'Licitación inventada', year: 2026, cliente_id: null, school_id: null }, error: null };
    if (req.target === 'propuesta_plantillas') return { data: { id: 'plant-1', ficha_id: 'ficha-1', ficha: { id: 'ficha-1', folio: 1, nombre_servicio: 'Servicio Inventado', destinatarios: [] } }, error: null };
    if (req.target === 'propuesta_generadas') {
      if (has(req, 'insert')) {
        h.nextId += 1;
        const id = h.nextId === 1 ? 'aaaa1111-1111-4111-8111-111111111111' : 'bbbb2222-2222-4222-8222-222222222222';
        return { data: { id }, error: null };
      }
      if (has(req, 'update')) return { data: null, error: null };
      const running = req.ops.some(o => o.method === 'eq' && o.args[0] === 'estado' && o.args[1] === 'generando');
      if (running) return terminal === 'await' ? { data: [], error: null } : { data: null, error: null };
      // Every tender is at version 0: both proposals become version 1.
      return { data: null, error: null };
    }
    if (req.target === 'propuesta_consultores') return { data: [], error: null };
    return { data: null, error: null };
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => fake.client,
    getForcedPasswordChangeVerdict: async () => 'allowed',
    sendForcedPasswordChangeResponse: () => false,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown) => res.status(200).json({ data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'admin', is_active: true, from_cache: false, school_id: null }]),
}));
vi.mock('@/lib/propuestas/storage', () => ({ uploadFile: vi.fn(async () => undefined), fileExists: vi.fn(async () => true) }));
vi.mock('@/lib/propuestas-web/pdf-generator', () => ({ generateProposalPDFBuffer: vi.fn(() => Buffer.from('synthetic-pdf')) }));
vi.mock('@/lib/propuestas/validation', () => ({ validateProposalConfig: vi.fn(() => ({ valid: true, errors: [], warnings: [] })) }));
vi.mock('@/lib/propuestas-web/snapshot', () => ({ buildProposalSnapshot: vi.fn(() => ({ synthetic: true })) }));

import handler from '@/pages/api/licitaciones/[id]/generate-propuesta';

const BODY = {
  plantilla_id: '44444444-4444-4444-8444-444444444444',
  config: {
    type: 'evoluciona', schoolName: 'Escuela Inventada', programYear: 2026, serviceName: 'Servicio Inventado',
    consultants: [], modules: [], horasPresenciales: 10, horasSincronicas: 0, horasAsincronicas: 0,
    pricing: { mode: 'per_hour', precioUf: 1, totalHours: 10, formaPago: 'Contado' }, contentBlocks: [],
  },
};

async function post(tender: string) {
  const { req, res } = createMocks({ method: 'POST', query: { id: tender }, body: BODY });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const storedSlugs = () => h.requests
  .filter(r => r.target === 'propuesta_generadas' && r.ops.some(o => o.method === 'update'))
  .map(r => (r.ops.find(o => o.method === 'update')!.args[0] as { web_slug?: string }).web_slug)
  .filter(Boolean);

beforeEach(() => { vi.clearAllMocks(); h.requests.length = 0; h.nextId = 0; });

describe('generate-propuesta — LIC-E4 a proposal link can no longer collide', () => {
  it('two tenders of the same school, year and type, both at version 1, store two different slugs', async () => {
    const a = await post('22222222-2222-4222-8222-222222222222');
    const b = await post('33333333-3333-4333-8333-333333333333');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.json.data.version).toBe(1);
    expect(b.json.data.version).toBe(1);
    const slugs = storedSlugs();
    expect(slugs).toEqual([
      'escuela-inventada-evoluciona-2026-v1-aaaa1111',
      'escuela-inventada-evoluciona-2026-v1-bbbb2222',
    ]);
    expect(a.json.data.web_slug).toBe(slugs[0]);
    expect(b.json.data.web_slug).toBe(slugs[1]);
  });
});
