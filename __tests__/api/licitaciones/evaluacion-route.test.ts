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

  it('saves without a date and leaves the stored one as it was', async () => {
    tender().fecha_evaluacion = '2026-11-04';
    const r = await post({ fecha_evaluacion: null });
    expect(r.status).toBe(200);
    expect(tender().fecha_evaluacion).toBe('2026-11-04');
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
