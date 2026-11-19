// @vitest-environment node
/**
 * LIC-D2 (GENERA fixes F20c): a Carta de adjudicación generated for one winner,
 * amount, payment conditions, offer date or contacts stops counting when any of
 * those is changed and saved. The award data and the emptied pointer are ONE
 * update, guarded by the pointer the route read (the document row stays):
 * one row → saved and invalidated together; no row (another Carta meanwhile)
 * → nothing saved, 409; a database error → nothing saved, 500. A save that
 * changes no printed value, or a tender without a Carta, is one plain update.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { h } = vi.hoisted(() => ({
  h: {
    stored: {} as Record<string, unknown>, // the tender row in the "database"
    updates: [] as Array<{ table: string; payload: Record<string, unknown>; eqs: unknown[][] }>,
    pointerChanged: false, // another Carta was generated after the route read the tender
    updateFails: false, // the tender update answers a database error
    historyFails: false, // the invalidation's history insert answers an error
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    deletes: [] as string[],
    ates: {} as Record<string, boolean>, // es_ganador per provider of the tender
    otherSaveWins: null as string | null, // another save stores this winner right after the route's tender write
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
      if (req.target === 'licitacion_ates') {
        // The tender's own providers: an eq on id narrows to one, an eq on licitacion_id keeps all.
        const idEq = eqs.find(([col]) => col === 'id');
        for (const ateId of Object.keys(h.ates)) {
          if (!idEq || idEq[1] === ateId) h.ates[ateId] = payload.es_ganador as boolean;
        }
        return { data: null, error: null };
      }
      if (req.target !== 'licitaciones') return { data: null, error: null };
      if (h.updateFails) return { data: null, error: { message: 'base inventada caída' } };
      // The row matches only if every eq filter holds on the stored row.
      const current = h.pointerChanged
        ? { ...h.stored, carta_adjudicacion_url: 'licitaciones/x/adjudicacion/carta-nueva.docx' }
        : h.stored;
      const matches = eqs.every(([col, val]) => current[col as string] === val);
      if (!matches) return { data: null, error: null };
      h.stored = { ...current, ...payload };
      const answer = { ...h.stored };
      if (h.otherSaveWins) h.stored = { ...h.stored, ganador_ate_id: h.otherSaveWins };
      return { data: answer, error: null };
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
    if (req.target === 'licitaciones') return { data: { ...h.stored }, error: null };
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
const INVALIDATED_MSG = 'La Carta de adjudicación ya no corresponde a los datos guardados. Genérela de nuevo antes de confirmar.';
const CONFLICT_MSG = 'Otra persona generó o cambió la Carta mientras guardaba. Recargue la página y revise los datos antes de continuar.';

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

const initialRow = () => ({
  id: LIC, school_id: 1, estado: 'adjudicacion_pendiente', carta_adjudicacion_url: CARTA,
  ganador_ate_id: ATE_A,
  monto_adjudicado_uf: '1200.50', // Postgres numeric arrives as text
  condiciones_pago: '50% al inicio, 50% al cierre',
  fecha_oferta_ganadora: '2026-11-10',
  contacto_coordinacion_nombre: 'Persona Inventada',
  contacto_coordinacion_email: 'coordinacion@inventado.test',
  contacto_coordinacion_telefono: '+56 9 0000 0000',
});

beforeEach(() => {
  h.updates = []; h.inserts = []; h.deletes = [];
  h.pointerChanged = false; h.updateFails = false; h.historyFails = false;
  h.stored = initialRow();
  h.ates = {}; h.otherSaveWins = null;
});

async function save(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', query: { id: LIC }, body: body as never });
  await adjudicacion(req, res);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const tenderUpdates = () => h.updates.filter(u => u.table === 'licitaciones');
const historyActions = () => h.inserts.filter(i => i.table === 'licitacion_historial').map(i => i.payload.accion);
const atesTouched = () => h.updates.some(u => u.table === 'licitacion_ates');

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

  it.each(changes)('(a) a change of %s: one update, guarded by the Carta read, saves it and empties the pointer; says so and logs it', async (_name, change) => {
    const r = await save({ ...sameBody(), ...change });
    expect(r.status).toBe(200);
    expect(tenderUpdates()).toHaveLength(1);
    expect(tenderUpdates()[0].payload).toMatchObject({ ...change, carta_adjudicacion_url: null });
    expect(tenderUpdates()[0].eqs).toEqual([['id', LIC], ['carta_adjudicacion_url', CARTA]]);
    expect(h.stored).toMatchObject({ ...change, carta_adjudicacion_url: null });
    expect(r.json.data.carta_invalidada).toBe(true);
    expect(r.json.data.licitacion.carta_adjudicacion_url).toBeNull();
    expect(r.json.data.historial_registrado).toBe(true);
    expect(r.json.message).toBe(INVALIDATED_MSG);
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados', 'Carta de Adjudicacion anulada por cambio de datos']);
    // The document itself stays in the tender's documents as history.
    expect(h.deletes).toHaveLength(0);
    expect(h.updates.some(u => u.table === 'licitacion_documentos')).toBe(false);
  });

  it('a save with the same values is one plain update and keeps the Carta', async () => {
    const r = await save(sameBody());
    expect(r.status).toBe(200);
    expect(tenderUpdates()).toHaveLength(1);
    expect(tenderUpdates()[0].payload).not.toHaveProperty('carta_adjudicacion_url');
    expect(tenderUpdates()[0].eqs).toEqual([['id', LIC]]);
    expect(h.stored.carta_adjudicacion_url).toBe(CARTA);
    expect(r.json.data.carta_invalidada).toBe(false);
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados']);
  });

  it('fields left out of the request (an older client) change nothing and keep the Carta', async () => {
    const r = await save({ ganador_ate_id: ATE_A });
    expect(r.status).toBe(200);
    expect(tenderUpdates()[0].payload).not.toHaveProperty('carta_adjudicacion_url');
    expect(h.stored.carta_adjudicacion_url).toBe(CARTA);
    expect(r.json.data.carta_invalidada).toBe(false);
  });

  it('with no Carta yet, a change is one plain update and says nothing about a Carta', async () => {
    h.stored = { ...initialRow(), carta_adjudicacion_url: null };
    const r = await save({ ...sameBody(), ganador_ate_id: ATE_B });
    expect(r.status).toBe(200);
    expect(tenderUpdates()).toHaveLength(1);
    expect(tenderUpdates()[0].payload).not.toHaveProperty('carta_adjudicacion_url');
    expect(tenderUpdates()[0].eqs).toEqual([['id', LIC]]);
    expect(h.stored.ganador_ate_id).toBe(ATE_B);
    expect(r.json.data.carta_invalidada).toBe(false);
    expect(historyActions()).toEqual(['Datos de adjudicacion guardados']);
  });

  it('a cleared printed value is saved as cleared and counts as a change', async () => {
    const r = await save({ ...sameBody(), condiciones_pago: null });
    expect(r.status).toBe(200);
    expect(tenderUpdates()[0].payload).toMatchObject({ condiciones_pago: null, carta_adjudicacion_url: null });
    expect(h.stored.condiciones_pago).toBeNull();
    expect(r.json.data.carta_invalidada).toBe(true);
    const line = h.inserts.find(i => i.payload.accion === 'Carta de Adjudicacion anulada por cambio de datos')!;
    expect((line.payload.detalles as { campos_cambiados: string[] }).campos_cambiados).toEqual(['condiciones_pago']);
  });

  it('(b) another Carta was generated since the read: nothing is saved, 409 with the sentence', async () => {
    h.pointerChanged = true;
    const r = await save({ ...sameBody(), monto_adjudicado_uf: 1300 });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe(CONFLICT_MSG);
    // The stored award data is unchanged (only the newer Carta's pointer differs).
    const { carta_adjudicacion_url: _newer, ...rest } = h.stored;
    const { carta_adjudicacion_url: _old, ...initialRest } = initialRow();
    expect(rest).toEqual(initialRest);
    expect(atesTouched()).toBe(false);
    expect(h.inserts).toHaveLength(0);
  });

  it('(c) a database error on the guarded update: nothing is saved, 500 with the route\'s general sentence', async () => {
    h.updateFails = true;
    const r = await save({ ...sameBody(), ganador_ate_id: ATE_B });
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('Error al guardar adjudicacion');
    expect(h.stored).toEqual(initialRow());
    expect(atesTouched()).toBe(false);
    expect(h.inserts).toHaveLength(0);
  });

  it('when the invalidation\'s history line fails, the failure is logged and the answer stays honest', async () => {
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

describe('adjudicacion — the flags follow the stored winner, re-read after the writes (join fix 2)', () => {
  it('sent winner A, but another save stored B meanwhile: the flags end as B true, A false', async () => {
    h.stored = { ...initialRow(), carta_adjudicacion_url: null };
    h.ates = { [ATE_A]: false, [ATE_B]: true }; // the other save already flagged B
    h.otherSaveWins = ATE_B;
    const r = await save({ ...sameBody(), ganador_ate_id: ATE_A });
    expect(r.status).toBe(200);
    expect(h.stored.ganador_ate_id).toBe(ATE_B);
    expect(h.ates).toEqual({ [ATE_A]: false, [ATE_B]: true });
  });

  it('with no other save, the flags follow the winner it was sent', async () => {
    h.stored = { ...initialRow(), carta_adjudicacion_url: null };
    h.ates = { [ATE_A]: true, [ATE_B]: false };
    const r = await save({ ...sameBody(), ganador_ate_id: ATE_B });
    expect(r.status).toBe(200);
    expect(h.ates).toEqual({ [ATE_A]: false, [ATE_B]: true });
  });
});
