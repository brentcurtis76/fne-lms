// @vitest-environment node
/**
 * LIC-A1 (GENERA fixes F14): a tender already in contrato_pendiente without a
 * generated Carta had no way forward — the Carta route only accepted
 * adjudicacion_pendiente. It now also accepts that stuck state, for the same
 * people as before (the route's own admin check, unchanged). The award
 * confirmation route answers the new "Carta first" refusal as a 400.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => {
  const h = {
    role: 'admin',
    licitacion: {} as Record<string, unknown>,
    updates: [] as Array<{ table: string; payload: unknown }>,
    uploads: [] as string[],
    tables: [] as string[],
  };
  return { h };
});

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has, opArgs } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req) => {
    h.tables.push(req.target);
    if (has(req, 'update')) {
      h.updates.push({ table: req.target, payload: opArgs(req, 'update')?.[0] });
      return { data: { ...h.licitacion, ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (req.target === 'licitaciones') return { data: h.licitacion, error: null };
    if (req.target === 'licitacion_ates') return { data: { nombre_ate: 'ATE Sintética', rut_ate: '1-9', nombre_contacto: 'Persona Inventada' }, error: null };
    if (req.target === 'schools') return { data: { name: 'Escuela Inventada' }, error: null };
    if (req.target === 'clientes') return { data: { ciudad: 'Ciudad Ficticia', nombre_representante: 'Representante Inventado' }, error: null };
    if (req.target === 'licitacion_documentos' && has(req, 'insert')) return { data: { id: 'doc-1' }, error: null };
    return { data: null, error: null };
  };
  const client = {
    ...fake.client,
    storage: {
      from: () => ({
        upload: async (path: string) => { h.uploads.push(path); return { error: null }; },
        remove: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'http://localhost/signed' } }),
      }),
    },
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => client,
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
vi.mock('@/lib/cartaGenerator', () => ({ generateCartaDocument: vi.fn(async () => Buffer.from('synthetic-docx')) }));
vi.mock('@/lib/notificationService', () => ({ default: { triggerNotification: vi.fn(async () => undefined) } }));

import carta from '@/pages/api/licitaciones/[id]/generate-carta';
import confirmar from '@/pages/api/licitaciones/[id]/adjudicacion-confirmar';

const LIC = '22222222-2222-4222-8222-222222222222';
const stuck = () => ({
  id: LIC, estado: 'contrato_pendiente', ganador_es_fne: true, ganador_ate_id: '33333333-3333-4333-8333-333333333333',
  carta_adjudicacion_url: null, contrato_id: null, school_id: 1, cliente_id: 'cliente-1',
  numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada',
});

beforeEach(() => {
  h.role = 'admin'; h.updates = []; h.uploads = []; h.tables = [];
  h.licitacion = stuck();
});

async function call(handler: typeof carta, method: string, body?: unknown) {
  const { req, res } = createMocks({ method: method as 'GET', query: { id: LIC }, body: body as never });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

describe('generate-carta — the stuck contrato_pendiente tender gets its way out', () => {
  it('lets the Admin generate the Carta for a contrato_pendiente tender that has none', async () => {
    const r = await call(carta, 'GET');
    expect(r.status).toBe(200);
    expect(h.uploads).toHaveLength(1);
    expect(h.updates).toContainEqual({ table: 'licitaciones', payload: { carta_adjudicacion_url: h.uploads[0] } });
  });

  it('still refuses an Encargado (the route refused them before, it still does)', async () => {
    h.role = 'encargado_licitacion';
    const r = await call(carta, 'GET');
    expect(r.status).toBe(403);
    expect(h.tables).toEqual([]);
    expect(h.uploads).toHaveLength(0);
  });

  it('keeps refusing contrato_pendiente once the Carta exists (no silent replacement)', async () => {
    h.licitacion = { ...stuck(), carta_adjudicacion_url: 'licitaciones/x/adjudicacion/old.docx' };
    const r = await call(carta, 'GET');
    expect(r.status).toBe(422);
    expect(h.uploads).toHaveLength(0);
  });

  it('keeps refusing other states (e.g. contrato_generado)', async () => {
    h.licitacion = { ...stuck(), estado: 'contrato_generado' };
    const r = await call(carta, 'GET');
    expect(r.status).toBe(422);
  });
});

describe('adjudicacion-confirmar — an award to the foundation waits for the Carta', () => {
  it('answers 400 with the reason when no Carta has been generated', async () => {
    h.licitacion = { ...stuck(), estado: 'adjudicacion_pendiente' };
    const r = await call(confirmar as typeof carta, 'POST', { es_fne: true });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('Genere la Carta de adjudicación antes de confirmar la adjudicación.');
    expect(h.updates).toHaveLength(0);
  });

  it('confirms once the Carta exists', async () => {
    h.licitacion = { ...stuck(), estado: 'adjudicacion_pendiente', carta_adjudicacion_url: 'licitaciones/x/adjudicacion/c.docx' };
    const r = await call(confirmar as typeof carta, 'POST', { es_fne: true });
    expect(r.status).toBe(200);
    expect(h.updates[0]).toMatchObject({ table: 'licitaciones', payload: { estado: 'contrato_pendiente' } });
  });
});
