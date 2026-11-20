// @vitest-environment node
/**
 * LIC-E2 (GENERA fixes F24, Brent 20 Nov 2026): a new version of a proposal
 * left the older versions' public links live, so a school holding an older
 * link kept reading an old price. Once the new version is published, the
 * older live versions of the same tender become 'expired'; a failure of that
 * step does not undo the new version, the answer says so instead. Synthetic
 * data only; no real storage or PDF.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

type Row = { id: string; licitacion_id: string; version: number; estado: string; web_status: string | null };

const TENDER = '22222222-2222-4222-8222-222222222222';
const OTHER_TENDER = '33333333-3333-4333-8333-333333333333';
const NEW_ID = 'dddd4444-4444-4444-8444-444444444444';

const { h } = vi.hoisted(() => ({
  h: {
    requests: [] as RecordedRequest[],
    rows: [] as Array<{ id: string; licitacion_id: string; version: number; estado: string; web_status: string | null }>,
    failRetire: false,
  },
}));

/** The rows of propuesta_generadas a request's filters (eq, neq, in) select. */
function matching(req: RecordedRequest) {
  return h.rows.filter(row => req.ops.every(op => {
    const [col, val] = op.args as [keyof Row, unknown];
    if (op.method === 'eq') return row[col] === val;
    if (op.method === 'neq') return row[col] !== val;
    if (op.method === 'in') return (val as unknown[]).includes(row[col]);
    return true;
  }));
}

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has, opArgs } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => {
    if (req.target === 'licitaciones') return { data: { id: 'lic', numero_licitacion: 'LIC-1', nombre_licitacion: 'Licitación inventada', year: 2026, cliente_id: null, school_id: null }, error: null };
    if (req.target === 'propuesta_plantillas') return { data: { id: 'plant-1', ficha_id: 'ficha-1', ficha: { id: 'ficha-1', folio: 1, nombre_servicio: 'Servicio Inventado', destinatarios: [] } }, error: null };
    if (req.target === 'propuesta_generadas') {
      if (has(req, 'insert')) {
        const values = opArgs(req, 'insert')![0] as { licitacion_id: string; version: number; estado: string };
        h.rows.push({ id: NEW_ID, licitacion_id: values.licitacion_id, version: values.version, estado: values.estado, web_status: null });
        return { data: { id: NEW_ID }, error: null };
      }
      if (has(req, 'update')) {
        const patch = opArgs(req, 'update')![0] as Partial<Row>;
        if (h.failRetire && patch.web_status === 'expired') {
          return { data: null, error: { message: 'synthetic retire failure', code: 'XX000' } };
        }
        const hit = matching(req);
        hit.forEach(row => Object.assign(row, patch));
        return { data: has(req, 'select') ? hit.map(row => ({ id: row.id })) : null, error: null };
      }
      // The one-running guard: no running generation blocks this one.
      const running = req.ops.some(o => o.method === 'eq' && o.args[0] === 'estado' && o.args[1] === 'generando');
      if (running) return terminal === 'await' ? { data: [], error: null } : { data: null, error: null };
      // Step 5: the highest version of this tender.
      const ofTender = matching(req).sort((a, b) => b.version - a.version);
      return { data: ofTender[0] ? { version: ofTender[0].version } : null, error: null };
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
import { uploadFile } from '@/lib/propuestas/storage';

const BODY = {
  plantilla_id: '44444444-4444-4444-8444-444444444444',
  config: {
    type: 'evoluciona', schoolName: 'Escuela Inventada', programYear: 2026, serviceName: 'Servicio Inventado',
    consultants: [], modules: [], horasPresenciales: 10, horasSincronicas: 0, horasAsincronicas: 0,
    pricing: { mode: 'per_hour', precioUf: 1, totalHours: 10, formaPago: 'Contado' }, contentBlocks: [],
  },
};

async function post() {
  const { req, res } = createMocks({ method: 'POST', query: { id: TENDER }, body: BODY });
  await handler(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const statusOf = (id: string) => h.rows.find(r => r.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  h.requests.length = 0;
  h.failRetire = false;
  h.rows = [
    { id: 'v1', licitacion_id: TENDER, version: 1, estado: 'completada', web_status: 'published' },
    { id: 'v2', licitacion_id: TENDER, version: 2, estado: 'completada', web_status: 'viewed' },
    { id: 'err', licitacion_id: TENDER, version: 0, estado: 'error', web_status: null },
    { id: 'gen', licitacion_id: TENDER, version: 0, estado: 'generando', web_status: 'draft' },
    { id: 'other', licitacion_id: OTHER_TENDER, version: 1, estado: 'completada', web_status: 'published' },
  ];
});

describe('generate-propuesta — LIC-E2 a new version retires the older links', () => {
  it('v3 is published, v1 and v2 expire, another tender and non-live rows are untouched', async () => {
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.json.data.version).toBe(3);
    expect(r.json.data.enlaces_anteriores_retirados).toBe(2);
    expect(statusOf(NEW_ID)).toMatchObject({ estado: 'completada', web_status: 'published' });
    expect(statusOf('v1').web_status).toBe('expired');
    expect(statusOf('v2').web_status).toBe('expired');
    expect(statusOf('other').web_status).toBe('published');
    expect(statusOf('err')).toMatchObject({ estado: 'error', web_status: null });
    expect(statusOf('gen')).toMatchObject({ estado: 'generando', web_status: 'draft' });
  });

  it('the retirement fails → still 200, v3 published, enlaces_anteriores_retirados null', async () => {
    h.failRetire = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.json.data.enlaces_anteriores_retirados).toBeNull();
    expect(statusOf(NEW_ID)).toMatchObject({ estado: 'completada', web_status: 'published' });
    expect(statusOf('v1').web_status).toBe('published');
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('a generation that fails before Step 11 changes no older version', async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error('synthetic upload failure'));
    const r = await post();
    expect(r.status).toBe(500);
    expect(statusOf(NEW_ID).estado).toBe('error');
    expect(statusOf('v1').web_status).toBe('published');
    expect(statusOf('v2').web_status).toBe('viewed');
    expect(statusOf('other').web_status).toBe('published');
  });
});
