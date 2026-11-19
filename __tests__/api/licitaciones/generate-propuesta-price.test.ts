// @vitest-environment node
/**
 * LIC-E6 (GENERA fixes F20g): a proposal whose price is zero or less is not
 * generated: 400 «Indique el precio de la propuesta» before anything is
 * stored. Synthetic data only; no real storage or PDF.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

const { h } = vi.hoisted(() => ({ h: { requests: [] as RecordedRequest[] } }));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => {
    if (req.target === 'licitaciones') return { data: { id: 'lic', numero_licitacion: 'LIC-1', nombre_licitacion: 'Licitación inventada', year: 2026, cliente_id: null, school_id: null }, error: null };
    if (req.target === 'propuesta_plantillas') return { data: { id: 'plant-1', ficha_id: 'ficha-1', ficha: { id: 'ficha-1', folio: 1, nombre_servicio: 'Servicio Inventado', destinatarios: [] } }, error: null };
    if (req.target === 'propuesta_generadas') {
      if (has(req, 'insert')) return { data: { id: 'cccc3333-3333-4333-8333-333333333333' }, error: null };
      if (has(req, 'update')) return { data: null, error: null };
      const running = req.ops.some(o => o.method === 'eq' && o.args[0] === 'estado' && o.args[1] === 'generando');
      if (running) return terminal === 'await' ? { data: [], error: null } : { data: null, error: null };
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

import handler from '@/pages/api/licitaciones/[id]/generate-propuesta';
import { uploadFile } from '@/lib/propuestas/storage';
import { generateProposalPDFBuffer } from '@/lib/propuestas-web/pdf-generator';

const configWith = (pricing: Record<string, unknown>) => ({
  plantilla_id: '44444444-4444-4444-8444-444444444444',
  config: {
    type: 'evoluciona', schoolName: 'Escuela Inventada', programYear: 2026, serviceName: 'Servicio Inventado',
    consultants: [], modules: [], horasPresenciales: 10, horasSincronicas: 0, horasAsincronicas: 0,
    pricing: { formaPago: 'Contado', ...pricing }, contentBlocks: [],
  },
});

async function post(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', query: { id: '22222222-2222-4222-8222-222222222222' }, body });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const writes = () => h.requests.filter(r => r.ops.some(o => o.method === 'insert' || o.method === 'update'));

beforeEach(() => { vi.clearAllMocks(); h.requests.length = 0; });

describe('generate-propuesta — LIC-E6 a proposal without a price is not generated', () => {
  it.each([
    ['«Precio fijo» left blank', { mode: 'fixed', precioUf: 2, totalHours: 10 }],
    ['«Precio fijo» 0', { mode: 'fixed', precioUf: 2, totalHours: 10, fixedUf: 0 }],
    ['a negative fixed price', { mode: 'fixed', precioUf: 0, totalHours: 10, fixedUf: -5 }],
    ['a per-hour rate of 0', { mode: 'per_hour', precioUf: 0, totalHours: 10 }],
    ['a negative per-hour rate', { mode: 'per_hour', precioUf: -1, totalHours: 10 }],
  ])('%s → 400 «Indique el precio de la propuesta», nothing stored', async (_label, pricing) => {
    const r = await post(configWith(pricing));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('Indique el precio de la propuesta');
    expect(writes()).toHaveLength(0);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(generateProposalPDFBuffer).not.toHaveBeenCalled();
  });

  it('the total uses the hours of the proposal, not the hours the client sent', async () => {
    // Rate 2, client claims 0 hours, the proposal has 10: the total is 20, generated.
    const r = await post(configWith({ mode: 'per_hour', precioUf: 2, totalHours: 0 }));
    expect(r.status).toBe(200);
    const update = h.requests.find(q => q.target === 'propuesta_generadas' && q.ops.some(o => o.method === 'update'));
    const stored = update!.ops.find(o => o.method === 'update')!.args[0] as { snapshot_json: { pricing: { totalHours: number } } };
    expect(stored.snapshot_json.pricing.totalHours).toBe(10);
  });

  it('a fixed price above zero is generated', async () => {
    const r = await post(configWith({ mode: 'fixed', precioUf: 0, totalHours: 10, fixedUf: 888 }));
    expect(r.status).toBe(200);
  });
});
