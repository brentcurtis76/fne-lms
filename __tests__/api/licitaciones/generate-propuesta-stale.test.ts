// @vitest-environment node
/**
 * LIC-E5 (GENERA fixes F14): an interrupted proposal generation stayed
 * «generando» for ever and blocked every new one («Ya hay una generación en
 * curso»). A generation still running 15 minutes after it started
 * (propuesta_generadas.created_at) is now marked failed («Generación
 * interrumpida») and the new one starts; a younger one still blocks, with the
 * minutes left to wait. Synthetic data only; no real AI, storage or PDF.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

const { h } = vi.hoisted(() => ({
  h: { running: [] as Array<Record<string, unknown>>, requests: [] as RecordedRequest[] },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => {
    const eqs = req.ops.filter(o => o.method === 'eq').map(o => o.args);
    if (req.target === 'licitaciones') return { data: { id: 'lic', numero_licitacion: 'LIC-1', nombre_licitacion: 'Licitación inventada', year: 2026, cliente_id: null, school_id: null }, error: null };
    if (req.target === 'propuesta_plantillas') return { data: { id: 'plant-1', ficha_id: 'ficha-1', ficha: { id: 'ficha-1', folio: 1, nombre_servicio: 'Servicio Inventado', destinatarios: [] } }, error: null };
    if (req.target === 'propuesta_generadas') {
      if (has(req, 'insert')) return { data: { id: 'prop-new' }, error: null };
      if (has(req, 'update')) return { data: null, error: null };
      if (eqs.some(([c, v]) => c === 'estado' && v === 'generando')) return terminal === 'await' ? { data: h.running, error: null } : { data: h.running[0] ?? null, error: null };
      return { data: { version: 1 }, error: null };
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

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const ofTable = (op: string) => h.requests.filter(r => r.target === 'propuesta_generadas' && r.ops.some(o => o.method === op));

async function post() {
  const { req, res } = createMocks({ method: 'POST', query: { id: '22222222-2222-4222-8222-222222222222' }, body: BODY });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

beforeEach(() => { h.requests.length = 0; h.running = []; });

describe('generate-propuesta — a stale «generando» row no longer blocks for ever', () => {
  it('marks a 16-minute-old running generation as failed and starts the new one', async () => {
    h.running = [{ id: 'prop-stale', created_at: minutesAgo(16) }];
    const r = await post();
    expect(r.status).toBe(200);
    const staleUpdate = ofTable('update').find(q => q.ops.some(o => o.method === 'eq' && o.args[0] === 'id' && o.args[1] === 'prop-stale'));
    expect(staleUpdate).toBeTruthy();
    expect(staleUpdate!.ops.find(o => o.method === 'update')!.args[0]).toEqual({ estado: 'error', error_message: 'Generación interrumpida' });
    expect(staleUpdate!.ops.some(o => o.method === 'eq' && o.args[0] === 'estado' && o.args[1] === 'generando')).toBe(true);
    expect(ofTable('insert')).toHaveLength(1);
  });

  it('still refuses while a 2-minute-old generation runs, saying how long to wait', async () => {
    h.running = [{ id: 'prop-young', created_at: minutesAgo(2) }];
    const r = await post();
    expect(r.status).toBe(409);
    expect(r.json.error).toContain('Ya hay una generación en curso para esta licitación.');
    expect(r.json.error).toContain('13 minutos');
    expect(ofTable('insert')).toHaveLength(0);
    expect(ofTable('update')).toHaveLength(0);
  });
});
