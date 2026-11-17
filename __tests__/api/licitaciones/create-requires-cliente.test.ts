// @vitest-environment node
/**
 * LIC-D6 (GENERA fixes F14): a tender could be created for a school with no
 * linked client, and every later step then refused. Creation is now refused in
 * the service (so every caller is covered), and the route answers that as a
 * 400 with nothing inserted. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

const { h } = vi.hoisted(() => ({
  h: { schoolClienteId: null as string | null, requests: [] as RecordedRequest[] },
}));

function respond(req: RecordedRequest, terminal: string) {
  const isInsert = req.ops.some(o => o.method === 'insert');
  if (req.target === 'schools') return { data: { id: 7, name: 'Escuela Inventada', cliente_id: h.schoolClienteId }, error: null };
  if (req.target === 'programas') return { data: { id: 'prog-1', nombre: 'Programa Inventado' }, error: null };
  if (req.target === 'licitaciones' && isInsert) {
    const row = req.ops.find(o => o.method === 'insert')?.args[0] as Record<string, unknown>;
    return { data: { id: 'lic-new', ...row }, error: null };
  }
  if (req.target === 'licitaciones' && terminal === 'await') return { data: [], error: null };
  return { data: null, error: null };
}

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => respond(req, terminal);
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => fake.client,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown, status = 200) => res.status(status).json({ data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'admin', is_active: true, from_cache: false, school_id: null }]),
}));
vi.mock('@/lib/notificationService', () => ({ default: { triggerNotification: vi.fn(async () => undefined) } }));

import handler from '@/pages/api/licitaciones/index';
import { createLicitacion } from '@/lib/licitacionService';
import { createRecordingSupabase } from '../../helpers/recordingSupabase';

const MESSAGE = 'Esta escuela no tiene un cliente vinculado. Vincule un cliente antes de crear la licitación.';
const BODY = {
  school_id: 7, programa_id: 'prog-1', nombre_licitacion: 'Licitación inventada', email_licitacion: 'licitacion@inventado.test',
  monto_minimo: 10, monto_maximo: 100, tipo_moneda: 'UF', duracion_minima: '6 meses', duracion_maxima: '12 meses',
  peso_evaluacion_tecnica: 70, year: 2026,
};

const inserted = (reqs: RecordedRequest[]) =>
  reqs.filter(r => r.target === 'licitaciones' && r.ops.some(o => o.method === 'insert'));

beforeEach(() => { h.schoolClienteId = null; h.requests.length = 0; });

describe('createLicitacion — refused for a school with no client', () => {
  it('refuses and inserts nothing', async () => {
    const fake = createRecordingSupabase();
    fake.state.respond = (req, t) => respond(req, t);
    await expect(createLicitacion(fake.client as never, BODY as never, 'user-1')).rejects.toThrow(MESSAGE);
    expect(inserted(fake.state.requests)).toHaveLength(0);
  });

  it('creates when the school has a client', async () => {
    h.schoolClienteId = 'cliente-1';
    const fake = createRecordingSupabase();
    fake.state.respond = (req, t) => respond(req, t);
    const created = await createLicitacion(fake.client as never, BODY as never, 'user-1');
    expect(created.cliente_id).toBe('cliente-1');
    expect(inserted(fake.state.requests)).toHaveLength(1);
  });
});

describe('POST /api/licitaciones — refused for a school with no client', () => {
  async function post() {
    const { req, res } = createMocks({ method: 'POST', body: BODY });
    await handler(req, res);
    return { status: res._getStatusCode(), json: res._getJSONData() };
  }

  it('answers 400 with the reason and inserts nothing', async () => {
    const r = await post();
    expect(r.status).toBe(400);
    expect(r.json.error).toBe(MESSAGE);
    expect(inserted(h.requests)).toHaveLength(0);
  });

  it('creates (201) when the school has a client', async () => {
    h.schoolClienteId = 'cliente-1';
    const r = await post();
    expect(r.status).toBe(201);
    expect(inserted(h.requests)).toHaveLength(1);
  });
});

describe('POST /api/licitaciones — a historical record is not refused for want of a client (send-back 1, S3)', () => {
  // Deliberate (lead's decision, 16 Nov 2026): an Admin recording a school's
  // past, already closed tender is not the dead end LIC-D6 closes — a closed
  // tender has no later step that could refuse for want of a client — and
  // refusing it would stop the Admin recording past tenders. A LIVE tender for
  // the same school is still refused.
  it('accepts a historical closed tender for a school without a client; refuses a live one', async () => {
    h.schoolClienteId = null;
    const historico = createMocks({
      method: 'POST',
      body: { school_id: 7, programa_id: 'prog-1', nombre_licitacion: 'Licitación histórica inventada', year: 2022, estado: 'cerrada' },
    });
    await handler(historico.req, historico.res);
    expect(historico.res._getStatusCode()).toBe(201);
    const row = inserted(h.requests)[0]?.ops.find(o => o.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ estado: 'cerrada', cliente_id: null });

    h.requests.length = 0;
    const live = createMocks({ method: 'POST', body: BODY });
    await handler(live.req, live.res);
    expect(live.res._getStatusCode()).toBe(400);
    expect(live.res._getJSONData().error).toBe(MESSAGE);
    expect(inserted(h.requests)).toHaveLength(0);
  });
});
