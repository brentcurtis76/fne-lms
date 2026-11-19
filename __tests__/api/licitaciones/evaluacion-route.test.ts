// @vitest-environment node
/**
 * GENERA fixes F20b — the evaluation route POST/GET /api/licitaciones/[id]/evaluacion.
 * LIC-B3: the evaluation date typed by the commission is stored with the hours
 * and returned again. Runs against a small in-memory database. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { createMemoryTenderDb } from './memoryTenderDb';

const { h } = vi.hoisted(() => ({ h: { db: null as any } }));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
  createServiceRoleClient: () => h.db.client,
  sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
  sendApiResponse: (res: any, data: unknown, status = 200) => res.status(status).json({ data }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
}));
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'admin', is_active: true }]),
}));

import handler from '@/pages/api/licitaciones/[id]/evaluacion';

const LIC = '22222222-2222-4222-8222-222222222222';
const OTHER_LIC = '33333333-3333-4333-8333-333333333333';
const ATE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ATE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ATE_FOREIGN = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CRIT_1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

function seed() {
  const db = createMemoryTenderDb();
  db.tables.licitaciones = [
    {
      id: LIC, school_id: 1, estado: 'evaluacion_pendiente', programa_id: 'prog-1',
      peso_evaluacion_tecnica: 70, peso_evaluacion_economica: 30, tipo_moneda: 'UF',
      hora_inicio_evaluacion: null, hora_fin_evaluacion: null, fecha_evaluacion: null, ganador_ate_id: null,
    },
    { id: OTHER_LIC, school_id: 2, estado: 'evaluacion_pendiente', programa_id: 'prog-1', ganador_ate_id: null },
  ];
  db.tables.licitacion_ates = [
    { id: ATE_A, licitacion_id: LIC, nombre_ate: 'ATE Inventada A', propuesta_url: 'x/a.pdf', es_ganador: false },
    { id: ATE_B, licitacion_id: LIC, nombre_ate: 'ATE Inventada B', propuesta_url: 'x/b.pdf', es_ganador: false },
    { id: ATE_FOREIGN, licitacion_id: OTHER_LIC, nombre_ate: 'ATE Ajena', propuesta_url: 'x/f.pdf', es_ganador: false },
  ];
  db.tables.programa_evaluacion_criterios = [
    { id: CRIT_1, programa_id: 'prog-1', nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, orden: 1, is_active: true },
  ];
  db.tables.licitacion_comision = [];
  db.tables.licitacion_evaluaciones = [];
  db.tables.licitacion_historial = [];
  return db;
}

const committee = [
  { nombre: 'Persona Inventada Uno', orden: 1 },
  { nombre: 'Persona Inventada Dos', orden: 2 },
  { nombre: 'Persona Inventada Tres', orden: 3 },
];

async function post(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'POST', query: { id: LIC }, body: { committee, scores: [], montos: [], ...body } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

async function get() {
  const { req, res } = createMocks({ method: 'GET', query: { id: LIC } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const tender = () => h.db.tables.licitaciones.find((l: any) => l.id === LIC);

beforeEach(() => { h.db = seed(); });

describe('evaluation route — the evaluation date (LIC-B3)', () => {
  it('stores the typed date with the hours', async () => {
    const r = await post({ fecha_evaluacion: '2026-11-05', hora_inicio: '10:00', hora_fin: '11:30' });
    expect(r.status).toBe(200);
    expect(tender().fecha_evaluacion).toBe('2026-11-05');
    expect(tender().hora_inicio_evaluacion).toBe('10:00');
    expect(tender().hora_fin_evaluacion).toBe('11:30');
  });

  it('stores the date even when no hour is typed', async () => {
    const r = await post({ fecha_evaluacion: '2026-11-06' });
    expect(r.status).toBe(200);
    expect(tender().fecha_evaluacion).toBe('2026-11-06');
  });

  it('a request that does not send the date leaves the stored one as it was', async () => {
    tender().fecha_evaluacion = '2026-11-04';
    const r = await post({});
    expect(r.status).toBe(200);
    expect(tender().fecha_evaluacion).toBe('2026-11-04');
  });

  // Send-back 1 (b): an empty value means "no date" and is stored as null
  it('an empty date «» is stored as null', async () => {
    tender().fecha_evaluacion = '2026-11-04';
    const r = await post({ fecha_evaluacion: '' });
    expect(r.status).toBe(200);
    expect(tender().fecha_evaluacion).toBeNull();
  });

  it('a null date (the screen\'s empty field) is stored as null', async () => {
    tender().fecha_evaluacion = '2026-11-04';
    const r = await post({ fecha_evaluacion: null });
    expect(r.status).toBe(200);
    expect(tender().fecha_evaluacion).toBeNull();
  });

  it.each(['2026-02-31', '2026-13-01', '2026-11-5', 'mañana'])('refuses the date «%s» with 400 before anything is written', async (fecha) => {
    h.db.tables.licitacion_comision = [{ id: 'm-old', licitacion_id: LIC, nombre: 'Persona Previa', orden: 1 }];
    const r = await post({ fecha_evaluacion: fecha });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/fecha de evaluación/i);
    expect(h.db.writes).toEqual([]);
    expect(h.db.tables.licitacion_comision).toEqual([{ id: 'm-old', licitacion_id: LIC, nombre: 'Persona Previa', orden: 1 }]);
    expect(tender().fecha_evaluacion).toBeNull();
  });

  it('GET returns the stored date so the screen can show it again', async () => {
    tender().fecha_evaluacion = '2026-11-05';
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.data.fecha_evaluacion).toBe('2026-11-05');
  });

  it('GET returns null when no date was stored', async () => {
    const r = await get();
    expect(r.json.data.fecha_evaluacion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LIC-D16 + N46: a re-save leaves no stale winner; another tender's provider is refused
// ---------------------------------------------------------------------------
const score = (ate_id: string, puntaje: number) => ({ ate_id, criterio_id: CRIT_1, puntaje });
const ate = (id: string) => h.db.tables.licitacion_ates.find((a: any) => a.id === id);
const SCORE_COLUMNS = ['puntaje_tecnico', 'puntaje_economico', 'puntaje_tecnico_ponderado', 'puntaje_economico_ponderado', 'puntaje_total'];

async function saveBoth() {
  // Weights 70/30. A: technical 80, 400 → economic 100, total 86. B: technical 60, 500 → economic 80, total 66.
  const r = await post({
    scores: [score(ATE_A, 80), score(ATE_B, 60)],
    montos: [{ ate_id: ATE_A, monto_propuesto: 400 }, { ate_id: ATE_B, monto_propuesto: 500 }],
  });
  expect(r.status).toBe(200);
  expect(ate(ATE_A).es_ganador).toBe(true);
  expect(ate(ATE_B).es_ganador).toBe(false);
  expect(tender().ganador_ate_id).toBe(ATE_A);
}

describe('evaluation route — no stale winner after a re-save (LIC-D16)', () => {
  it('a save with B\'s amount only unmarks A, empties A\'s scores and makes B the winner', async () => {
    await saveBoth();
    const r = await post({
      scores: [score(ATE_A, 80), score(ATE_B, 60)],
      montos: [{ ate_id: ATE_B, monto_propuesto: 500 }],
    });
    expect(r.status).toBe(200);
    expect(ate(ATE_A).es_ganador).toBe(false);
    for (const col of SCORE_COLUMNS) expect(ate(ATE_A)[col], col).toBeNull();
    expect(ate(ATE_B).es_ganador).toBe(true);
    // B alone: technical 60 → 42, economic 100 → 30, total 72
    expect(ate(ATE_B).puntaje_total).toBe(72);
    expect(tender().ganador_ate_id).toBe(ATE_B);
    expect(h.db.tables.licitacion_ates.filter((a: any) => a.licitacion_id === LIC && a.es_ganador)).toHaveLength(1);
  });

  it('a save where nobody has an amount marks no winner and empties the tender\'s winner', async () => {
    await saveBoth();
    const r = await post({ scores: [score(ATE_A, 80), score(ATE_B, 60)], montos: [] });
    expect(r.status).toBe(200);
    expect(ate(ATE_A).es_ganador).toBe(false);
    expect(ate(ATE_B).es_ganador).toBe(false);
    for (const col of SCORE_COLUMNS) {
      expect(ate(ATE_A)[col], col).toBeNull();
      expect(ate(ATE_B)[col], col).toBeNull();
    }
    expect(tender().ganador_ate_id).toBeNull();
  });

  it('does not touch the providers of another tender', async () => {
    ate(ATE_FOREIGN).es_ganador = true;
    ate(ATE_FOREIGN).puntaje_total = 90;
    await saveBoth();
    expect(ate(ATE_FOREIGN).es_ganador).toBe(true);
    expect(ate(ATE_FOREIGN).puntaje_total).toBe(90);
  });

  it('a tie at the top stays as today: both marked winner, the tender\'s winner is the first in the amounts list', async () => {
    // The owner decides ties (F20 decision, 19 Nov 2026): this pins today's behaviour, it does not choose it.
    const r = await post({
      scores: [score(ATE_A, 80), score(ATE_B, 80)],
      montos: [{ ate_id: ATE_B, monto_propuesto: 400 }, { ate_id: ATE_A, monto_propuesto: 400 }],
    });
    expect(r.status).toBe(200);
    expect(ate(ATE_A).es_ganador).toBe(true);
    expect(ate(ATE_B).es_ganador).toBe(true);
    expect(ate(ATE_A).puntaje_total).toBe(86);
    expect(ate(ATE_B).puntaje_total).toBe(86);
    expect(tender().ganador_ate_id).toBe(ATE_B);
    expect(r.json.data).toEqual({ saved: true });
  });
});

describe('evaluation route — an amount for another tender\'s provider (N46)', () => {
  it('answers 400 and writes nothing', async () => {
    const r = await post({
      fecha_evaluacion: '2026-11-05',
      scores: [score(ATE_A, 80)],
      montos: [{ ate_id: ATE_A, monto_propuesto: 400 }, { ate_id: ATE_FOREIGN, monto_propuesto: 100 }],
    });
    expect(r.status).toBe(400);
    expect(h.db.writes).toEqual([]);
    expect(tender().ganador_ate_id).toBeNull();
    expect(tender().fecha_evaluacion).toBeNull();
    expect(ate(ATE_FOREIGN).es_ganador).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Send-back 1 (a): a cleared amount stays cleared
// ---------------------------------------------------------------------------
describe('evaluation route — a cleared amount stays cleared (send-back 1)', () => {
  it('after a save with B only, A\'s stored amount is empty and GET returns none for A', async () => {
    await saveBoth();
    expect(ate(ATE_A).monto_propuesto).toBe(400);
    const r = await post({ scores: [score(ATE_A, 80), score(ATE_B, 60)], montos: [{ ate_id: ATE_B, monto_propuesto: 500 }] });
    expect(r.status).toBe(200);
    expect(ate(ATE_A).monto_propuesto).toBeNull();
    expect(ate(ATE_B).monto_propuesto).toBe(500);
    const g = await get();
    const a = g.json.data.ates.find((x: any) => x.id === ATE_A);
    expect(a.monto_propuesto).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Send-back 1 (c): every write of the save is checked
// ---------------------------------------------------------------------------
const INCOMPLETE = 'No se pudo guardar la evaluación completa. Vuelva a guardar antes de generar el Acta.';

describe('evaluation route — every write of the save is checked (send-back 1)', () => {
  const cases: Array<[string, (w: any) => boolean]> = [
    ['the date and hours', w => w.table === 'licitaciones' && w.op === 'update' && 'fecha_evaluacion' in (w.values ?? {})],
    ['the technical scores', w => w.table === 'licitacion_evaluaciones' && w.op === 'upsert'],
    ['the unmarking', w => w.table === 'licitacion_ates' && w.op === 'update' && w.values?.es_ganador === false && !('puntaje_total' in w.values)],
    ['the clearing', w => w.table === 'licitacion_ates' && w.op === 'update' && w.values?.puntaje_total === null],
    ['the new calculated scores', w => w.table === 'licitacion_ates' && w.op === 'update' && typeof w.values?.puntaje_total === 'number'],
    ['the tender\'s winner', w => w.table === 'licitaciones' && w.op === 'update' && 'ganador_ate_id' in (w.values ?? {})],
  ];

  it.each(cases)('a failure of %s → 500 with the sentence, and no later write', async (_name, match) => {
    h.db.failWrite.match = match;
    const r = await post({
      fecha_evaluacion: '2026-11-05', hora_inicio: '10:00',
      scores: [score(ATE_A, 80), score(ATE_B, 60)],
      montos: [{ ate_id: ATE_A, monto_propuesto: 400 }],
    });
    expect(r.status).toBe(500);
    expect(r.json.error).toBe(INCOMPLETE);
    const failedAt = h.db.writes.findIndex((w: any) => w.failed);
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(h.db.writes.slice(failedAt + 1)).toEqual([]);
    expect(h.db.writes.some((w: any) => w.table === 'licitacion_historial')).toBe(false);
  });
});
