// @vitest-environment node
/**
 * GENERA fixes F20, LIC-D1: the tender routes refuse, with 409 and a plain
 * sentence and without writing anything, what the tender's state no longer
 * allows; what stays allowed is still accepted. Synthetic data only.
 */
import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks, createResponse } from 'node-mocks-http';

type Op = { method: string; args: unknown[] };
type Req = { client: 'service' | 'user'; table: string; ops: Op[] };

const { h } = vi.hoisted(() => {
  const h = {
    estado: 'propuestas_pendientes' as string,
    roles: [{ role_type: 'admin', school_id: 1, is_active: true, from_cache: false }] as Array<Record<string, unknown>>,
    requests: [] as Req[],
    storage: [] as Array<{ op: string; args: unknown[] }>,
    // historical probe: rows found in each table (an empty list everywhere = historical record)
    comision: [] as unknown[],
    evaluaciones: [] as unknown[],
    atesConPropuesta: [] as unknown[],
    fields: {} as Record<string, string[]>,
    files: {} as Record<string, unknown[]>,
    updateTimelineDates: null as unknown as ReturnType<typeof vi.fn>,
  };
  return { h };
});

const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert'];
const has = (r: Req, m: string) => r.ops.some(o => o.method === m);

function makeClient(client: 'service' | 'user') {
  const respond = (r: Req) => {
    if (r.table === 'licitaciones') {
      if (has(r, 'update')) return { data: { id: TENDER_ID, estado: h.estado, ...(r.ops.find(o => o.method === 'update')!.args[0] as object) }, error: null };
      return { data: { id: TENDER_ID, school_id: 1, estado: h.estado }, error: null };
    }
    if (r.table === 'licitacion_ates') {
      if (has(r, 'not')) return { data: h.atesConPropuesta, error: null };
      return { data: { id: ATE_ID, licitacion_id: TENDER_ID, nombre_ate: 'ATE Inventada', propuesta_url: null }, error: null };
    }
    if (r.table === 'licitacion_comision') return { data: h.comision, error: null };
    if (r.table === 'licitacion_evaluaciones') return { data: h.evaluaciones, error: null };
    if (r.table === 'licitacion_documentos') {
      return { data: { id: DOC_ID, licitacion_id: TENDER_ID, nombre: 'Doc inventado', storage_path: 'licitaciones/x/doc.pdf' }, error: null };
    }
    if (r.table === 'licitacion_consultas') return { data: { id: 'consulta-1' }, error: null };
    return { data: null, error: null };
  };
  return {
    from(table: string) {
      const r: Req = { client, table, ops: [] };
      h.requests.push(r);
      const chain: any = new Proxy({}, {
        get(_t, prop: string | symbol) {
          if (prop === 'then') return (ok: any, ko: any) => Promise.resolve(respond(r)).then(ok, ko);
          if (typeof prop !== 'string') return undefined;
          if (prop === 'single' || prop === 'maybeSingle') return () => { r.ops.push({ method: prop, args: [] }); return Promise.resolve(respond(r)); };
          return (...args: unknown[]) => { r.ops.push({ method: prop, args }); return chain; };
        },
      });
      return chain;
    },
    storage: {
      from: () => ({
        upload: async (...args: unknown[]) => { h.storage.push({ op: 'upload', args }); return { error: null }; },
        remove: async (...args: unknown[]) => { h.storage.push({ op: 'remove', args }); return { error: null }; },
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.invalid/signed' } }),
      }),
    },
  };
}

vi.mock('@/lib/api-auth', () => ({
  getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
  createServiceRoleClient: () => makeClient('service'),
  createApiSupabaseClient: async () => makeClient('user'),
  getForcedPasswordChangeVerdict: async () => 'allowed',
  sendForcedPasswordChangeResponse: () => false,
  sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
  sendApiResponse: (res: any, data: unknown, status = 200) => res.status(status).json({ data }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
}));
vi.mock('@/utils/roleUtils', () => ({ getUserRoles: vi.fn(async () => h.roles) }));
vi.mock('@/lib/licitacionService', () => {
  h.updateTimelineDates = vi.fn(async () => ({ id: 'synthetic-timeline-result' }));
  return { getLicitacionDetail: vi.fn(), updateTimelineDates: (...a: unknown[]) => h.updateTimelineDates(...a) };
});
vi.mock('formidable', () => ({
  default: () => ({ parse: (_req: unknown, cb: (e: unknown, f: unknown, fi: unknown) => void) => cb(null, h.fields, h.files) }),
}));
vi.mock('file-type', () => ({ fromFile: async () => ({ mime: 'application/pdf' }) }));
vi.mock('fs', async (orig) => {
  const actual = await orig<typeof import('fs')>();
  return { ...actual, default: actual, readFileSync: () => Buffer.from('%PDF-synthetic') };
});

import atesHandler from '@/pages/api/licitaciones/[id]/ates';
import consultasHandler from '@/pages/api/licitaciones/[id]/consultas';
import uploadHandler from '@/pages/api/licitaciones/[id]/upload';
import documentosHandler from '@/pages/api/licitaciones/[id]/documentos';
import detailHandler from '@/pages/api/licitaciones/[id]';
import {
  MENSAJE_ADJUDICADA,
  MENSAJE_CERRADA,
  MENSAJE_EVALUACION_INICIADA,
  MENSAJE_SOLO_ANEXOS,
} from '@/lib/licitaciones/estados';

const TENDER_ID = '22222222-2222-4222-8222-222222222222';
const ATE_ID = '33333333-3333-4333-8333-333333333333';
const DOC_ID = '44444444-4444-4444-8444-444444444444';

const FILE = { size: 1000, filepath: '/nonexistent/synthetic.pdf', originalFilename: 'Propuesta.pdf', mimetype: 'application/pdf' };

/** A request whose JSON body arrives as a stream (the ates route has bodyParser off). */
async function streamed(handler: any, method: string, body?: unknown) {
  const req: any = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.query = { id: TENDER_ID };
  req.headers = { 'content-type': 'application/json' };
  const res = createResponse();
  await handler(req, res);
  return res;
}

async function json(handler: any, method: string, body?: unknown, query: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: method as any, query: { id: TENDER_ID, ...query }, body: body as any });
  await handler(req as any, res as any);
  return res;
}

const writes = () => h.requests.filter(r => r.ops.some(o => WRITE_METHODS.includes(o.method)));
const nothingWritten = () => {
  expect(writes()).toEqual([]);
  expect(h.storage.filter(s => s.op === 'upload' || s.op === 'remove')).toEqual([]);
};
const wrote = (table: string, method: string) =>
  h.requests.some(r => r.table === table && has(r, method));

const admin = () => [{ role_type: 'admin', school_id: 1, is_active: true, from_cache: false }];
const encargado = () => [{ role_type: 'encargado_licitacion', school_id: 1, is_active: true, from_cache: false }];

beforeEach(() => {
  h.estado = 'propuestas_pendientes';
  h.roles = admin();
  h.requests = [];
  h.storage = [];
  h.comision = [];
  h.evaluaciones = [];
  h.atesConPropuesta = [];
  h.fields = {};
  h.files = {};
  h.updateTimelineDates.mockClear();
});

// ============================================================
// Rule 1 — providers and proposals once the evaluation has begun
// ============================================================

describe('ates route — rule 1', () => {
  const create = { nombre_ate: 'ATE Inventada SPA' };
  const update = { ate_id: ATE_ID, nombre_contacto: 'Contacto Inventado' };

  it('POST in evaluacion_pendiente → 409, nothing written', async () => {
    h.estado = 'evaluacion_pendiente';
    const res = await streamed(atesHandler, 'POST', create);
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_EVALUACION_INICIADA });
    nothingWritten();
  });

  it('PUT in evaluacion_pendiente → 409, nothing written', async () => {
    h.estado = 'evaluacion_pendiente';
    const res = await streamed(atesHandler, 'PUT', update);
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_EVALUACION_INICIADA });
    nothingWritten();
  });

  it('DELETE in evaluacion_pendiente → 409, nothing written', async () => {
    h.estado = 'evaluacion_pendiente';
    const res = await streamed(atesHandler, 'DELETE', { ate_id: ATE_ID });
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_EVALUACION_INICIADA });
    nothingWritten();
  });

  it('proposal upload (PATCH) in evaluacion_pendiente → 409, nothing written', async () => {
    h.estado = 'evaluacion_pendiente';
    h.roles = encargado();
    h.fields = { ate_id: [ATE_ID] };
    h.files = { file: [FILE] };
    const res = await streamed(atesHandler, 'PATCH');
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_EVALUACION_INICIADA });
    nothingWritten();
  });

  it('proposal upload in contrato_generado → 409 as well', async () => {
    h.estado = 'contrato_generado';
    h.fields = { ate_id: [ATE_ID] };
    h.files = { file: [FILE] };
    const res = await streamed(atesHandler, 'PATCH');
    expect(res._getStatusCode()).toBe(409);
    nothingWritten();
  });

  it('POST in propuestas_pendientes → 201, as today', async () => {
    const res = await streamed(atesHandler, 'POST', create);
    expect(res._getStatusCode()).toBe(201);
    expect(wrote('licitacion_ates', 'insert')).toBe(true);
  });

  it('PUT in propuestas_pendientes → 200, as today', async () => {
    const res = await streamed(atesHandler, 'PUT', update);
    expect(res._getStatusCode()).toBe(200);
    expect(wrote('licitacion_ates', 'update')).toBe(true);
  });

  it('DELETE in propuestas_pendientes → 200, as today', async () => {
    const res = await streamed(atesHandler, 'DELETE', { ate_id: ATE_ID });
    expect(res._getStatusCode()).toBe(200);
    expect(wrote('licitacion_ates', 'delete')).toBe(true);
  });

  it('proposal upload in propuestas_pendientes → 200, as today', async () => {
    h.roles = encargado();
    h.fields = { ate_id: [ATE_ID] };
    h.files = { file: [FILE] };
    const res = await streamed(atesHandler, 'PATCH');
    expect(res._getStatusCode()).toBe(200);
    expect(h.storage.some(s => s.op === 'upload')).toBe(true);
    expect(wrote('licitacion_documentos', 'insert')).toBe(true);
  });

  it('GET in cerrada still lists the providers', async () => {
    h.estado = 'cerrada';
    const res = await streamed(atesHandler, 'GET');
    expect(res._getStatusCode()).toBe(200);
  });
});

// ============================================================
// Rule 2 — an awarded tender's own data
// ============================================================

describe('admin PATCH of the tender — rule 2', () => {
  it('the amount in contrato_pendiente → 409, nothing written', async () => {
    h.estado = 'contrato_pendiente';
    const res = await json(detailHandler, 'PATCH', { monto_maximo: 999 });
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_ADJUDICADA });
    nothingWritten();
  });

  it('the currency in cerrada → 409, nothing written', async () => {
    h.estado = 'cerrada';
    const res = await json(detailHandler, 'PATCH', { tipo_moneda: 'CLP' });
    expect(res._getStatusCode()).toBe(409);
    nothingWritten();
  });

  it('notes together with an amount in contrato_generado → 409, nothing written', async () => {
    h.estado = 'contrato_generado';
    const res = await json(detailHandler, 'PATCH', { notas: 'Nota inventada', monto_minimo: 1 });
    expect(res._getStatusCode()).toBe(409);
    nothingWritten();
  });

  it('only notas in contrato_pendiente → accepted', async () => {
    h.estado = 'contrato_pendiente';
    const res = await json(detailHandler, 'PATCH', { notas: 'Nota inventada' });
    expect(res._getStatusCode()).toBe(200);
    expect(wrote('licitaciones', 'update')).toBe(true);
  });

  it('only notas in cerrada → accepted', async () => {
    h.estado = 'cerrada';
    const res = await json(detailHandler, 'PATCH', { notas: 'Nota inventada' });
    expect(res._getStatusCode()).toBe(200);
  });

  it('the publication image by the admin in cerrada → accepted, as today', async () => {
    h.estado = 'cerrada';
    const res = await json(detailHandler, 'PATCH', { publicacion_imagen_url: 'licitaciones/x/imagen.jpg' });
    expect(res._getStatusCode()).toBe(200);
  });

  it('the publication image by the encargado in cerrada → accepted, as today', async () => {
    h.estado = 'cerrada';
    h.roles = encargado();
    const res = await json(detailHandler, 'PATCH', { publicacion_imagen_url: 'licitaciones/x/imagen.jpg' });
    expect(res._getStatusCode()).toBe(200);
  });

  it('the timeline branch («Ajustar fechas») in contrato_pendiente → as today', async () => {
    h.estado = 'contrato_pendiente';
    const res = await json(detailHandler, 'PATCH', { timeline: { fecha_limite_consultas: '2026-03-23' } });
    expect(res._getStatusCode()).toBe(200);
    expect(h.updateTimelineDates).toHaveBeenCalledTimes(1);
  });

  it('the amount in adjudicacion_pendiente → accepted, as today', async () => {
    h.estado = 'adjudicacion_pendiente';
    const res = await json(detailHandler, 'PATCH', { monto_maximo: 999 });
    expect(res._getStatusCode()).toBe(200);
  });
});

// ============================================================
// Rule 3 — questions, deletions and uploads in an end state
// ============================================================

describe('consultas — rule 3', () => {
  const body = { pregunta: '¿Pregunta inventada?' };

  it('POST in cerrada → 409, nothing written', async () => {
    h.estado = 'cerrada';
    const res = await json(consultasHandler, 'POST', body);
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_CERRADA });
    nothingWritten();
  });

  it('POST in propuestas_pendientes → 201, as today', async () => {
    const res = await json(consultasHandler, 'POST', body);
    expect(res._getStatusCode()).toBe(201);
    expect(wrote('licitacion_consultas', 'insert')).toBe(true);
  });
});

describe('documentos DELETE — rule 3', () => {
  it('in cerrada → 409, nothing written or removed', async () => {
    h.estado = 'cerrada';
    const res = await json(documentosHandler, 'DELETE', undefined, { doc_id: DOC_ID });
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_CERRADA });
    nothingWritten();
  });

  it('in adjudicacion_pendiente → 200, as today', async () => {
    h.estado = 'adjudicacion_pendiente';
    const res = await json(documentosHandler, 'DELETE', undefined, { doc_id: DOC_ID });
    expect(res._getStatusCode()).toBe(200);
    expect(wrote('licitacion_documentos', 'delete')).toBe(true);
  });
});

describe('upload — rule 3 (and rule 1 for the proposal kind)', () => {
  const upload = async (tipo: string) => {
    h.fields = { tipo: [tipo], nombre: ['Documento inventado'] };
    h.files = { file: [FILE] };
    const { req, res } = createMocks({ method: 'POST', query: { id: TENDER_ID } });
    await uploadHandler(req as any, res as any);
    return res;
  };
  const notHistorical = () => { h.atesConPropuesta = [{ id: ATE_ID }]; h.comision = [{ id: 'c-1' }]; };

  it.each(['otro', 'anexos'])('tipo %s in contrato_generado → 201', async (tipo) => {
    h.estado = 'contrato_generado';
    notHistorical();
    const res = await upload(tipo);
    expect(res._getStatusCode()).toBe(201);
    expect(h.storage.some(s => s.op === 'upload')).toBe(true);
  });

  it.each(['bases_enviadas', 'evaluacion_firmada', 'carta_adjudicacion_firmada', 'publicacion_imagen'])(
    'tipo %s in contrato_generado → 409, nothing written', async (tipo) => {
      h.estado = 'contrato_generado';
      notHistorical();
      const res = await upload(tipo);
      expect(res._getStatusCode()).toBe(409);
      expect(res._getJSONData()).toEqual({ error: MENSAJE_SOLO_ANEXOS });
      nothingWritten();
    });

  it('tipo bases_enviadas in a closed tender that went through the workflow → 409', async () => {
    h.estado = 'cerrada';
    notHistorical();
    const res = await upload('bases_enviadas');
    expect(res._getStatusCode()).toBe(409);
    nothingWritten();
  });

  it.each(['bases_enviadas', 'propuesta', 'evaluacion_firmada', 'publicacion_imagen'])(
    'archive upload of tipo %s into a closed HISTORICAL tender → 201', async (tipo) => {
      h.estado = 'cerrada';
      const res = await upload(tipo);
      expect(res._getStatusCode()).toBe(201);
      expect(h.storage.some(s => s.op === 'upload')).toBe(true);
      expect(wrote('licitacion_documentos', 'insert')).toBe(true);
    });

  it('tipo propuesta in evaluacion_pendiente → 409 (rule 1), nothing written', async () => {
    h.estado = 'evaluacion_pendiente';
    const res = await upload('propuesta');
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData()).toEqual({ error: MENSAJE_EVALUACION_INICIADA });
    nothingWritten();
  });

  it('signed Acta in evaluacion_pendiente → 201, as today', async () => {
    h.estado = 'evaluacion_pendiente';
    const res = await upload('evaluacion_firmada');
    expect(res._getStatusCode()).toBe(201);
  });

  it('signed Carta in adjudicacion_pendiente → 201, as today', async () => {
    h.estado = 'adjudicacion_pendiente';
    const res = await upload('carta_adjudicacion_firmada');
    expect(res._getStatusCode()).toBe(201);
  });
});
