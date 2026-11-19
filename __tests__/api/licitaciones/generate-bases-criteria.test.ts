// @vitest-environment node
/**
 * LIC-B5 (GENERA fixes F20a), bases side: a programme without active
 * evaluation criteria used to get bases with an empty evaluation table. The
 * route now refuses with a 422 in the shape of its template refusal, and
 * nothing is generated or stored. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => {
  const h = {
    criterios: [] as Array<Record<string, unknown>>,
    criteriosError: null as { message: string } | null,
    estado: 'publicada' as string,
    template: { nombre_servicio: 'Servicio inventado', objetivo: 'Objetivo inventado', version: 1 } as Record<string, unknown> | null,
    uploads: [] as string[],
    inserts: [] as string[],
  };
  return { h };
});

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req) => {
    if (has(req, 'insert')) { h.inserts.push(req.target); return { data: { id: 'doc-1' }, error: null }; }
    if (req.target === 'licitaciones') {
      return {
        data: {
          id: '22222222-2222-4222-8222-222222222222', school_id: 1, cliente_id: 'cliente-1', programa_id: 'prog-1',
          numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada', estado: h.estado,
          year: 2026, monto_minimo: 100, monto_maximo: 200, tipo_moneda: 'UF', duracion_minima: '6', duracion_maxima: '12',
          peso_evaluacion_tecnica: 70, peso_evaluacion_economica: 30, email_licitacion: 'lic@example.test',
        },
        error: null,
      };
    }
    if (req.target === 'schools') return { data: { id: 1, name: 'Colegio Inventado' }, error: null };
    if (req.target === 'clientes') return { data: { id: 'cliente-1', nombre_legal: 'Fundación Ficticia' }, error: null };
    if (req.target === 'programas') return { data: { id: 'prog-1', nombre: 'Programa Inventado' }, error: null };
    if (req.target === 'programa_bases_templates') {
      return h.template ? { data: h.template, error: null } : { data: null, error: { message: 'none' } };
    }
    if (req.target === 'programa_evaluacion_criterios') {
      return h.criteriosError ? { data: null, error: h.criteriosError } : { data: h.criterios, error: null };
    }
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
  getUserRoles: vi.fn(async () => [{ role_type: 'admin', is_active: true, from_cache: false }]),
}));
const generateBasesDocument = vi.fn(async () => Buffer.from('synthetic-docx'));
vi.mock('@/lib/docxGenerator', () => ({ generateBasesDocument: (...a: unknown[]) => generateBasesDocument(...(a as [])) }));

import handler from '@/pages/api/licitaciones/[id]/generate-bases';

async function call() {
  const { req, res } = createMocks({ method: 'GET', query: { id: '22222222-2222-4222-8222-222222222222' } });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

beforeEach(() => {
  h.criterios = []; h.criteriosError = null; h.estado = 'publicada'; h.uploads = []; h.inserts = [];
  h.template = { nombre_servicio: 'Servicio inventado', objetivo: 'Objetivo inventado', version: 1 };
  generateBasesDocument.mockClear();
});

describe('generate-bases — a programme without active evaluation criteria', () => {
  it('answers 422 with the reason, and nothing is generated or stored', async () => {
    const r = await call();
    expect(r.status).toBe(422);
    expect(r.json.error).toBe(
      'El programa no tiene criterios de evaluación activos. Configúrelos en /admin/licitaciones/criterios antes de generar las Bases.'
    );
    expect(generateBasesDocument).not.toHaveBeenCalled();
    expect(h.uploads).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it('answers a server error, not the «no criteria» 422, when the criteria query fails (send-back 1)', async () => {
    h.criteriosError = { message: 'synthetic query failure' };
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('Error al generar el documento de Bases');
    expect(r.json.error).not.toContain('criterios de evaluación activos');
    expect(generateBasesDocument).not.toHaveBeenCalled();
    expect(h.uploads).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it('still answers the missing-template 422 first', async () => {
    h.template = null;
    const r = await call();
    expect(r.status).toBe(422);
    expect(r.json.error).toContain('No se encontro una plantilla activa');
  });

  it('generates and stores the bases when the programme has an active criterion', async () => {
    h.criterios = [{ nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, descripcion: null, orden: 1 }];
    const r = await call();
    expect(r.status).toBe(200);
    expect(generateBasesDocument).toHaveBeenCalledTimes(1);
    expect(h.uploads).toHaveLength(1);
    expect(h.inserts).toContain('licitacion_documentos');
  });
});

// join fix 1: no new Bases once the tender is awarded; the state check comes first of all.
describe('generate-bases — the state of the tender', () => {
  const SENTENCE = 'La licitación ya fue adjudicada: no se pueden generar nuevas Bases.';
  const CRITERIO = [{ nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, descripcion: null, orden: 1 }];

  it.each(['contrato_pendiente', 'contrato_generado', 'adjudicada_externo', 'cerrada'])(
    '%s: 409 with the sentence; nothing generated, stored or written',
    async (estado) => {
      h.estado = estado;
      h.criterios = CRITERIO;
      const r = await call();
      expect(r.status).toBe(409);
      expect(r.json.error).toBe(SENTENCE);
      expect(generateBasesDocument).not.toHaveBeenCalled();
      expect(h.uploads).toHaveLength(0);
      expect(h.inserts).toHaveLength(0);
    },
  );

  it('contrato_generado: the state check comes before the template and criteria refusals', async () => {
    h.estado = 'contrato_generado';
    h.template = null;
    h.criteriosError = { message: 'synthetic query failure' };
    const r = await call();
    expect(r.status).toBe(409);
    expect(r.json.error).toBe(SENTENCE);
  });

  it.each(['propuestas_pendientes', 'evaluacion_pendiente', 'adjudicacion_pendiente'])(
    '%s: generates and stores the bases as today',
    async (estado) => {
      h.estado = estado;
      h.criterios = CRITERIO;
      const r = await call();
      expect(r.status).toBe(200);
      expect(generateBasesDocument).toHaveBeenCalledTimes(1);
      expect(h.uploads).toHaveLength(1);
      expect(h.inserts).toContain('licitacion_documentos');
    },
  );

  it.each(['propuestas_pendientes', 'evaluacion_pendiente'])('%s: the existing refusals keep their order', async (estado) => {
    h.estado = estado;
    h.template = null;
    h.criteriosError = { message: 'synthetic query failure' };
    expect((await call()).status).toBe(422); // no template first
    h.template = { nombre_servicio: 'Servicio inventado', objetivo: 'Objetivo inventado', version: 1 };
    expect((await call()).status).toBe(500); // then the failed criteria query
    h.criteriosError = null;
    const r = await call();
    expect(r.status).toBe(422); // then no active criteria
    expect(r.json.error).toContain('criterios de evaluación activos');
    expect(generateBasesDocument).not.toHaveBeenCalled();
  });
});
