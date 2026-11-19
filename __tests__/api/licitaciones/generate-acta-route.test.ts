// @vitest-environment node
/**
 * GENERA fixes F20b — GET /api/licitaciones/[id]/generate-acta.
 * LIC-B3: the Acta prints the evaluation date stored by the commission; with
 * none, the day in Chile (not the UTC day). The real Acta generator runs and
 * word/document.xml is read back from the stored file. In-memory database.
 * Synthetic data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import JSZip from 'jszip';
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

import handler from '@/pages/api/licitaciones/[id]/generate-acta';

const LIC = '22222222-2222-4222-8222-222222222222';
const ATE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ATE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CRIT_1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

function seed(tipoMoneda: 'UF' | 'CLP' = 'UF') {
  const db = createMemoryTenderDb();
  db.tables.licitaciones = [{
    id: LIC, school_id: 1, estado: 'evaluacion_pendiente', programa_id: 'prog-1',
    numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada',
    peso_evaluacion_tecnica: 70, peso_evaluacion_economica: 30, tipo_moneda: tipoMoneda,
    hora_inicio_evaluacion: '10:00', hora_fin_evaluacion: '11:00', fecha_evaluacion: null,
  }];
  const monto = (uf: number, clp: number) => (tipoMoneda === 'UF' ? uf : clp);
  db.tables.licitacion_ates = [
    {
      id: ATE_A, licitacion_id: LIC, nombre_ate: 'ATE Inventada A', rut_ate: '1-9', propuesta_url: 'x/a.pdf',
      puntaje_total: 86, puntaje_tecnico: 80, puntaje_economico: 100, puntaje_tecnico_ponderado: 56,
      puntaje_economico_ponderado: 30, monto_propuesto: monto(450, 15000000), es_ganador: true,
    },
    {
      id: ATE_B, licitacion_id: LIC, nombre_ate: 'ATE Inventada B', rut_ate: '2-7', propuesta_url: 'x/b.pdf',
      puntaje_total: 70, puntaje_tecnico: 70, puntaje_economico: 70, puntaje_tecnico_ponderado: 49,
      puntaje_economico_ponderado: 21, monto_propuesto: monto(640.25, 21500000), es_ganador: false,
    },
  ];
  db.tables.programa_evaluacion_criterios = [
    { id: CRIT_1, programa_id: 'prog-1', nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, orden: 1, is_active: true },
  ];
  db.tables.licitacion_comision = [
    { id: 'm1', licitacion_id: LIC, nombre: 'Persona Inventada Uno', rut: null, cargo: null, orden: 1 },
    { id: 'm2', licitacion_id: LIC, nombre: 'Persona Inventada Dos', rut: null, cargo: null, orden: 2 },
    { id: 'm3', licitacion_id: LIC, nombre: 'Persona Inventada Tres', rut: null, cargo: null, orden: 3 },
  ];
  db.tables.licitacion_evaluaciones = [
    { id: 'e1', licitacion_id: LIC, ate_id: ATE_A, criterio_id: CRIT_1, puntaje: 80 },
    { id: 'e2', licitacion_id: LIC, ate_id: ATE_B, criterio_id: CRIT_1, puntaje: 70 },
  ];
  db.tables.licitacion_documentos = [];
  db.tables.licitacion_historial = [];
  return db;
}

async function call() {
  const { req, res } = createMocks({ method: 'GET', query: { id: LIC } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

async function storedXml(): Promise<string> {
  const buffer = h.db.client.lastUpload as Buffer;
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

const tender = () => h.db.tables.licitaciones[0];

beforeEach(() => { h.db = seed(); });
afterEach(() => { vi.useRealTimers(); });

describe('generate-acta — the evaluation date (LIC-B3)', () => {
  it('prints the date the commission stored', async () => {
    tender().fecha_evaluacion = '2026-11-05';
    const r = await call();
    expect(r.status).toBe(200);
    expect(await storedXml()).toContain('Con fecha 5 de noviembre de 2026, siendo las 10:00 Hrs.');
  });

  it('with no stored date, prints the day in Chile even when UTC is already the next day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 23:30 on 19 Nov 2026 in Santiago (UTC-3 in summer) is 02:30 on 20 Nov in UTC.
    vi.setSystemTime(new Date('2026-11-20T02:30:00Z'));
    const r = await call();
    expect(r.status).toBe(200);
    const xml = await storedXml();
    expect(xml).toContain('Con fecha 19 de noviembre de 2026,');
    expect(xml).not.toContain('20 de noviembre de 2026');
  });
});

describe('generate-acta — amounts in the tender\'s currency (LIC-B2)', () => {
  it('passes the currency: a UF tender\'s Acta reads «UF 450,00», never «$»', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    const xml = await storedXml();
    expect(xml).toContain('UF 450,00');
    expect(xml).not.toContain('$');
  });

  it('a tender in pesos reads «$15.000.000»', async () => {
    h.db = seed('CLP');
    const r = await call();
    expect(r.status).toBe(200);
    expect(await storedXml()).toContain('$15.000.000');
  });
});
