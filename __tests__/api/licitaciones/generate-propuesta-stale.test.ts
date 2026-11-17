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
import { has } from '../../helpers/recordingSupabase';

const { h } = vi.hoisted(() => ({
  h: {
    running: [] as Array<Record<string, unknown>>,
    requests: [] as RecordedRequest[],
    // When set, answers propuesta_generadas requests (send-back 1, S4).
    table: null as null | ((req: RecordedRequest, terminal: string) => unknown),
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  h.requests = fake.state.requests;
  fake.state.respond = (req, terminal) => {
    const eqs = req.ops.filter(o => o.method === 'eq').map(o => o.args);
    if (req.target === 'licitaciones') return { data: { id: 'lic', numero_licitacion: 'LIC-1', nombre_licitacion: 'Licitación inventada', year: 2026, cliente_id: null, school_id: null }, error: null };
    if (req.target === 'propuesta_plantillas') return { data: { id: 'plant-1', ficha_id: 'ficha-1', ficha: { id: 'ficha-1', folio: 1, nombre_servicio: 'Servicio Inventado', destinatarios: [] } }, error: null };
    if (req.target === 'propuesta_generadas' && h.table) return h.table(req, terminal) as never;
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

beforeEach(() => { vi.clearAllMocks(); h.requests.length = 0; h.running = []; h.table = null; });

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

// -----------------------------------------------------------------------------
// Send-back 1 (S4): one running generation per tender, decided by the database.
// A small stateful propuesta_generadas that enforces, like the migration
// 20261116179700_one_running_proposal_generation.sql, one «generando» row per
// licitacion (and the existing unique (licitacion_id, version)), and applies
// conditional updates (eq / lt filters) the way PostgREST does.
// -----------------------------------------------------------------------------
type Row = { id: string; licitacion_id: string; estado: string; version: number; created_at: string; error_message?: string };

function statefulTable(rows: Row[], opts: { holdRunningReadsUntil?: number; secondVersionReadAfterInsert?: boolean } = {}) {
  let runningReads: Array<() => void> = [];
  let inserted = 0;
  let versionReads = 0;
  let heldReads = 0;
  let afterInsert: Array<() => void> = [];
  const filters = (req: RecordedRequest) => req.ops.filter(o => o.method === 'eq' || o.method === 'lt');
  const matches = (row: Row, req: RecordedRequest) => filters(req).every(({ method, args: [c, v] }) => {
    const value = (row as Record<string, unknown>)[c as string];
    return method === 'eq' ? value === v : String(value) < String(v);
  });
  return (req: RecordedRequest, terminal: string) => {
    if (has(req, 'insert')) {
      const values = req.ops.find(o => o.method === 'insert')!.args[0] as Row;
      if (rows.some(r => r.licitacion_id === values.licitacion_id && r.version === values.version)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_version_per_licitacion"' } };
      }
      if (values.estado === 'generando' && rows.some(r => r.licitacion_id === values.licitacion_id && r.estado === 'generando')) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "propuesta_generadas_one_running_per_licitacion"' } };
      }
      inserted += 1;
      const row = { ...values, id: `prop-new-${inserted}`, created_at: new Date().toISOString() };
      rows.push(row);
      afterInsert.forEach(f => f()); afterInsert = [];
      return { data: { id: row.id }, error: null };
    }
    if (has(req, 'update')) {
      const patch = req.ops.find(o => o.method === 'update')!.args[0] as Partial<Row>;
      const hit = rows.filter(r => matches(r, req));
      hit.forEach(r => Object.assign(r, patch));
      return { data: hit.map(r => ({ id: r.id })), error: null };
    }
    if (has(req, 'order')) {
      versionReads += 1;
      const read = () => {
        const mine = rows.filter(r => matches(r, req)).sort((a, b) => b.version - a.version);
        return { data: mine[0] ? { version: mine[0].version } : null, error: null };
      };
      // The second request reads the version only after the first has inserted
      // (the code read's example: it then inserts the NEXT version, which the
      // version constraint alone would allow).
      if (opts.secondVersionReadAfterInsert && versionReads === 2 && inserted === 0) {
        return new Promise(resolve => afterInsert.push(() => resolve(read())));
      }
      return read();
    }
    const found = rows.filter(r => matches(r, req)).map(r => ({ ...r }));
    const isRunningRead = req.ops.some(o => o.method === 'eq' && o.args[0] === 'estado' && o.args[1] === 'generando');
    const answer = terminal === 'await' ? { data: found, error: null } : { data: found[0] ?? null, error: null };
    if (isRunningRead && opts.holdRunningReadsUntil && heldReads < opts.holdRunningReadsUntil) {
      heldReads += 1;
      // Both requests read the stale row before either recovers it.
      return new Promise(resolve => {
        runningReads.push(() => resolve(answer));
        if (runningReads.length >= opts.holdRunningReadsUntil!) { runningReads.forEach(f => f()); runningReads = []; }
      });
    }
    return answer;
  };
}

const LIC = '22222222-2222-4222-8222-222222222222';

describe('generate-propuesta — one running generation per tender (send-back 1, S4)', () => {
  it.each([
    ['the second reads the version after the first inserted (next version)', true],
    ['both read the same version', false],
  ])('two recoveries of the same stale row start exactly one new generation; the other gets the message — %s', async (_label, secondVersionReadAfterInsert) => {
    const rows: Row[] = [{ id: 'prop-stale', licitacion_id: LIC, estado: 'generando', version: 1, created_at: minutesAgo(16) }];
    h.table = statefulTable(rows, { holdRunningReadsUntil: 2, secondVersionReadAfterInsert });
    const [a, b] = await Promise.all([post(), post()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const refused = a.status === 409 ? a : b;
    expect(refused.json.error).toContain('Ya hay una generación en curso para esta licitación.');
    // Exactly one new row was created; the stale one is marked failed.
    expect(rows.filter(r => r.id.startsWith('prop-new-'))).toHaveLength(1);
    expect(rows.find(r => r.id === 'prop-stale')).toMatchObject({ estado: 'error', error_message: 'Generación interrumpida' });
    // The recovery is conditional: still running AND started before the 15-minute cutoff.
    const staleUpdates = ofTable('update').filter(q => q.ops.some(o => o.method === 'eq' && o.args[0] === 'id' && o.args[1] === 'prop-stale'));
    expect(staleUpdates.length).toBeGreaterThan(0);
    for (const u of staleUpdates) {
      expect(u.ops.some(o => o.method === 'eq' && o.args[0] === 'estado' && o.args[1] === 'generando')).toBe(true);
      const lt = u.ops.find(o => o.method === 'lt');
      expect(lt?.args[0]).toBe('created_at');
      expect(Date.parse(String(lt?.args[1]))).toBeLessThanOrEqual(Date.now() - 15 * 60_000 + 1000);
    }
  });

  it('a unique-violation answer from the insert gives the message and starts nothing', async () => {
    const rows: Row[] = [];
    const table = statefulTable(rows);
    h.table = (req, terminal) => has(req, 'insert')
      ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "propuesta_generadas_one_running_per_licitacion"', details: `Key (licitacion_id)=(${LIC}) already exists.` } }
      : table(req, terminal);
    const r = await post();
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('Ya hay una generación en curso para esta licitación. Espere a que finalice antes de generar una nueva propuesta.');
    // Nothing started: no PDF, no upload, no update of any row.
    const { generateProposalPDFBuffer } = await import('@/lib/propuestas-web/pdf-generator');
    const { uploadFile } = await import('@/lib/propuestas/storage');
    expect(generateProposalPDFBuffer).not.toHaveBeenCalled();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(ofTable('update')).toHaveLength(0);
  });
});
