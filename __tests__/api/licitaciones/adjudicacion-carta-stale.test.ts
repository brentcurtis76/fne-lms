// @vitest-environment node
/**
 * LIC-D2 (GENERA fixes F20c): a Carta de adjudicación generated for one winner,
 * amount, payment conditions, offer date or contacts stops counting when any of
 * those is changed and saved — the tender's pointer to it is emptied in the
 * same update (the document row stays), the answer says so and a history line
 * is written. A save that changes none of them keeps the Carta.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => ({
  h: {
    licitacion: {} as Record<string, unknown>,
    updates: [] as Array<{ table: string; payload: Record<string, unknown>; eqs: unknown[][] }>,
    pointerChanged: false, // another Carta was generated after the route read the tender
    historyFails: false, // the invalidation's history insert answers an error
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    deletes: [] as string[],
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const { createRecordingSupabase, has, opArgs } = await import('../../helpers/recordingSupabase');
  const fake = createRecordingSupabase();
  fake.state.respond = (req) => {
    if (has(req, 'update')) {
      const payload = opArgs(req, 'update')?.[0] as Record<string, unknown>;
      const eqs = req.ops.filter(o => o.method === 'eq').map(o => o.args);
      h.updates.push({ table: req.target, payload, eqs });
      // The narrow pointer update: matches a row only while the pointer is unchanged.
      if (req.target === 'licitaciones' && 'carta_adjudicacion_url' in payload) {
        return { data: h.pointerChanged ? [] : [{ id: h.licitacion.id }], error: null };
      }
      return { data: { ...h.licitacion, ...payload }, error: null };
    }
    if (has(req, 'insert')) {
      const payload = opArgs(req, 'insert')?.[0] as Record<string, unknown>;
      if (h.historyFails && payload.accion === 'Carta de Adjudicacion anulada por cambio de datos') {
        return { data: null, error: { message: 'historial inventado caído' } };
      }
      h.inserts.push({ table: req.target, payload });
      return { data: null, error: null };
    }
    if (has(req, 'delete')) { h.deletes.push(req.target); return { data: null, error: null }; }
    if (req.target === 'licitaciones') return { data: h.licitacion, error: null };
    if (req.target === 'licitacion_ates') return { data: { id: 'ok' }, error: null };
    return { data: null, error: null };
  };
  return {
    getApiUser: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, error: null }),
    createServiceRoleClient: () => fake.client,
    sendAuthError: (res: any, error: string, status: number) => res.status(status).json({ error }),
    sendApiResponse: (res: any, data: unknown, status = 200, message?: string) =>
      res.status(status).json(message ? { data, message } : { data }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
  };
});
vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(async () => [{ role_type: 'encargado_licitacion', is_active: true, school_id: 1 }]),
}));

import adjudicacion from '@/pages/api/licitaciones/[id]/adjudicacion';

const LIC = '22222222-2222-4222-8222-222222222222';
const ATE_A = '33333333-3333-4333-8333-333333333333';
const ATE_B = '44444444-4444-4444-8444-444444444444';
const CARTA = 'licitaciones/x/adjudicacion/carta-a.docx';

// What the screen sends when nothing was edited (the stored values).
const sameBody = () => ({
  ganador_ate_id: ATE_A,
  monto_adjudicado_uf: 1200.5,
  condiciones_pago: '50% al inicio, 50% al cierre',
  fecha_oferta_ganadora: '2026-11-10',
  contacto_coordinacion_nombre: 'Persona Inventada',
  contacto_coordinacion_email: 'coordinacion@inventado.test',
  contacto_coordinacion_telefono: '+56 9 0000 0000',
});

beforeEach(() => {
  h.updates = []; h.inserts = []; h.deletes = []; h.pointerChanged = false; h.historyFails = false;
  h.licitacion = {
    id: LIC, school_id: 1, estado: 'adjudicacion_pendiente', carta_adjudicacion_url: CARTA,
    ganador_ate_id: ATE_A,
    monto_adjudicado_uf: '1200.50', // Postgres numeric arrives as text
    condiciones_pago: '50% al inicio, 50% al cierre',
    fecha_oferta_ganadora: '2026-11-10',
    contacto_coordinacion_nombre: 'Persona Inventada',
    contacto_coordinacion_email: 'coordinacion@inventado.test',
    contacto_coordinacion_telefono: '+56 9 0000 0000',
  };
});

async function save(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', query: { id: LIC }, body: body as never });
  await adjudicacion(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const tenderUpdate = () => h.updates.find(u => u.table === 'licitaciones' && !('carta_adjudicacion_url' in u.payload))!;
const pointerUpdates = () => h.updates.filter(u => u.table === 'licitaciones' && 'carta_adjudicacion_url' in u.payload);
const historyActions = () => h.inserts.filter(i => i.table === 'licitacion_historial').map(i => i.payload.accion);

describe('adjudicacion — a Carta made for earlier values stops counting (LIC-D2)', () => {
  const changes: Array<[string, Record<string, unknown>]> = [
    ['the winner', { ganador_ate_id: ATE_B }],
    ['the amount', { monto_adjudicado_uf: 1300 }],
    ['the payment conditions', { condiciones_pago: 'Pago único al cierre' }],
    ['the offer date', { fecha_oferta_ganadora: '2026-11-12' }],
    ['the coordination name', { contacto_coordinacion_nombre: 'Otra Persona Inventada' }],
    ['the coordination e-mail', { contacto_coordinacion_email: 'otra@inventado.test' }],
    ['the coordination phone', { contacto_coordinacion_telefono: '+56 9 1111 1111' }],
  ];

  it.each(changes)('a change of %s empties the Carta pointer (only while it still holds that Carta), says so and logs it', async (_name, change) => {
    const r = await save({ ...sameBody(), ...change });
    expect(r.status).toBe(200);
    expect(tenderUpdate().payload).toMatchObject(change);
    expect(pointerUpdates()).toEqual([
      { table: 'licitaciones', payload: { carta_adjudicacion_url: null }, eqs: [['id', LIC], ['carta_adjudicacion_url', CARTA]] },
    ]);
    expect(r.json.data.carta_invalidada).toBe(true);
    expect(r.json.data.licitacion.carta_adjudicacion_url).toBeNull();
    expect(r.json.data.historial_registrado).toBe(true);
    expect(r.json.message).toBe('La Carta de adjudicación ya no corresponde a los datos guardados. Genérela de nuevo antes de confirmar.');
    expect(historyActions()).toContain('Carta de Adjudicacion anulada por cambio de datos');
    // The document itself stays in the tender's documents as history.
    expect(h.deletes).toHaveLength(0);
    expect(h.updates.some(u => u.table === 'licitacion_documentos')).toBe(false);
  });

  it('a save with the same values keeps the Carta', async () => {
    const r = await save(sameBody());
    expect(r.status).toBe(200);
    expect(pointerUpdates()).toHaveLength(0);
    expect(r.json.data.carta_invalidada).toBe(false);
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados']);
  });

  it('fields the screen leaves out (empty inputs) change nothing and keep the Carta', async () => {
    const r = await save({ ganador_ate_id: ATE_A });
    expect(r.status).toBe(200);
    expect(pointerUpdates()).toHaveLength(0);
    expect(r.json.data.carta_invalidada).toBe(false);
  });

  it('with no Carta yet, a change clears nothing and says nothing about a Carta', async () => {
    h.licitacion = { ...h.licitacion, carta_adjudicacion_url: null };
    const r = await save({ ...sameBody(), ganador_ate_id: ATE_B });
    expect(r.status).toBe(200);
    expect(pointerUpdates()).toHaveLength(0);
    expect(r.json.data.carta_invalidada).toBe(false);
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados']);
  });

  it('a cleared printed value is saved as cleared and counts as a change (send-back 1)', async () => {
    const r = await save({ ...sameBody(), condiciones_pago: null });
    expect(r.status).toBe(200);
    expect(tenderUpdate().payload).toMatchObject({ condiciones_pago: null });
    expect(pointerUpdates()).toHaveLength(1);
    expect(r.json.data.carta_invalidada).toBe(true);
    const line = h.inserts.find(i => i.payload.accion === 'Carta de Adjudicacion anulada por cambio de datos')!;
    expect((line.payload.detalles as { campos_cambiados: string[] }).campos_cambiados).toEqual(['condiciones_pago']);
  });

  it('a newer Carta generated after the read is left alone, and the answer does not claim an invalidation (send-back 1)', async () => {
    h.pointerChanged = true;
    const r = await save({ ...sameBody(), monto_adjudicado_uf: 1300 });
    expect(r.status).toBe(200);
    expect(tenderUpdate().payload).toMatchObject({ monto_adjudicado_uf: 1300 });
    expect(pointerUpdates()).toHaveLength(1); // tried, guarded by the Carta read
    expect(r.json.data.carta_invalidada).toBe(false);
    expect(r.json.message).toBeUndefined();
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados']);
  });

  it('when the invalidation\'s history line fails, the failure is logged and the answer stays honest (send-back 1)', async () => {
    h.historyFails = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await save({ ...sameBody(), ganador_ate_id: ATE_B });
    expect(r.status).toBe(200);
    expect(r.json.data.carta_invalidada).toBe(true);
    expect(r.json.data.historial_registrado).toBe(false);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('licitacion_historial'), 'historial inventado caído');
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados']);
    logged.mockRestore();
  });
});
