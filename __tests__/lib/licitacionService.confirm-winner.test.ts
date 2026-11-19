// @vitest-environment node
/**
 * LIC-D2 send-back 1 (GENERA fixes F20c): the winner check and the award are one
 * step. With an expected winner, the update that awards the tender only matches
 * the row while the stored winner is still that provider; when it matches none
 * (someone saved another winner meanwhile), the service refuses with the 409
 * sentence and writes no history. Without the parameter: as before.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordingSupabase, has, opArgs, type RecordedRequest } from '../helpers/recordingSupabase';
import { confirmAdjudicacion } from '@/lib/licitacionService';

const LIC = '22222222-2222-4222-8222-222222222222';
const ATE_A = '33333333-3333-4333-8333-333333333333';
const ATE_B = '44444444-4444-4444-8444-444444444444';
const SENTENCE = 'El ganador seleccionado no está guardado. Guarde la adjudicación y vuelva a confirmar.';

let fake: ReturnType<typeof createRecordingSupabase>;
let row: Record<string, unknown>;
let storedAtUpdate: string; // the winner the database holds when the award update runs

beforeEach(() => {
  fake = createRecordingSupabase();
  row = { id: LIC, estado: 'adjudicacion_pendiente', ganador_ate_id: ATE_A, carta_adjudicacion_url: 'licitaciones/x/c.docx' };
  storedAtUpdate = ATE_A;
  fake.state.respond = (req: RecordedRequest) => {
    if (req.target === 'licitaciones' && has(req, 'update')) {
      const guard = req.ops.find(o => o.method === 'eq' && o.args[0] === 'ganador_ate_id');
      if (guard && guard.args[1] !== storedAtUpdate) return { data: null, error: null }; // no row matched
      return { data: { ...row, ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (req.target === 'licitaciones') return { data: row, error: null };
    return { data: null, error: null };
  };
});

const awardUpdates = () => fake.state.requests.filter(r => r.target === 'licitaciones' && has(r, 'update'));
const history = () => fake.state.requests.filter(r => r.target === 'licitacion_historial');

describe('confirmAdjudicacion — the expected winner guards the award itself', () => {
  it('awards when the stored winner is still the expected one; the update carries the guard', async () => {
    const updated = await confirmAdjudicacion(fake.client as never, LIC, false, 'user-1', ATE_A);
    expect(updated.estado).toBe('adjudicada_externo');
    expect(awardUpdates()[0].ops).toContainEqual({ method: 'eq', args: ['ganador_ate_id', ATE_A] });
    expect(history()).toHaveLength(1);
  });

  it('refuses with the sentence and writes no history when the winner changed between the read and the update', async () => {
    storedAtUpdate = ATE_B; // another person saved B after the service read A
    await expect(confirmAdjudicacion(fake.client as never, LIC, false, 'user-1', ATE_A)).rejects.toThrow(SENTENCE);
    expect(history()).toHaveLength(0);
  });

  it('refuses before any update when the stored winner is already another provider', async () => {
    await expect(confirmAdjudicacion(fake.client as never, LIC, true, 'user-1', ATE_B)).rejects.toThrow(SENTENCE);
    expect(awardUpdates()).toHaveLength(0);
    expect(history()).toHaveLength(0);
  });

  it('without the parameter: no guard, as before', async () => {
    storedAtUpdate = ATE_B;
    const updated = await confirmAdjudicacion(fake.client as never, LIC, true, 'user-1');
    expect(updated.estado).toBe('contrato_pendiente');
    expect(awardUpdates()[0].ops.some(o => o.method === 'eq' && o.args[0] === 'ganador_ate_id')).toBe(false);
    expect(history()).toHaveLength(1);
  });
});

describe('confirmAdjudicacion — after the award exactly one provider is flagged as winner (join fix 2)', () => {
  const OTHER_LIC = '55555555-5555-4555-8555-555555555555';
  const ATE_C = '66666666-6666-4666-8666-666666666666'; // a provider of another tender
  let ates: Array<{ id: string; licitacion_id: string; es_ganador: boolean }>;
  let atesFail: boolean;

  beforeEach(() => {
    // Two interleaved saves left both providers of the tender flagged; B is the stored winner.
    row = { ...row, ganador_ate_id: ATE_B };
    storedAtUpdate = ATE_B;
    atesFail = false;
    ates = [
      { id: ATE_A, licitacion_id: LIC, es_ganador: true },
      { id: ATE_B, licitacion_id: LIC, es_ganador: true },
      { id: ATE_C, licitacion_id: OTHER_LIC, es_ganador: true },
    ];
    const tenderRespond = fake.state.respond;
    fake.state.respond = (req: RecordedRequest, terminal) => {
      if (req.target === 'licitacion_ates' && has(req, 'update')) {
        if (atesFail) return { data: null, error: { message: 'proveedores inventados caídos' } };
        const payload = opArgs(req, 'update')?.[0] as { es_ganador: boolean };
        const filters = req.ops.filter(o => o.method === 'eq' || o.method === 'neq');
        for (const ate of ates) {
          const matches = filters.every(({ method, args: [col, val] }) =>
            method === 'eq' ? (ate as Record<string, unknown>)[col as string] === val
                            : (ate as Record<string, unknown>)[col as string] !== val);
          if (matches) ate.es_ganador = payload.es_ganador;
        }
        return { data: null, error: null };
      }
      return tenderRespond(req, terminal);
    };
  });

  const flag = (id: string) => ates.find(a => a.id === id)!.es_ganador;

  it('awarding B while A and B are both flagged leaves A false and B true; another tender\'s provider is untouched', async () => {
    const updated = await confirmAdjudicacion(fake.client as never, LIC, false, 'user-1', ATE_B);
    expect(updated.estado).toBe('adjudicada_externo');
    expect(flag(ATE_A)).toBe(false);
    expect(flag(ATE_B)).toBe(true);
    expect(flag(ATE_C)).toBe(true);
    // Each flag write is limited to the tender's own providers.
    const ateWrites = fake.state.requests.filter(r => r.target === 'licitacion_ates' && has(r, 'update'));
    expect(ateWrites).toHaveLength(2);
    for (const w of ateWrites) expect(w.ops).toContainEqual({ method: 'eq', args: ['licitacion_id', LIC] });
  });

  it('a failure of the flag writes is logged and the award is still reported', async () => {
    atesFail = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const updated = await confirmAdjudicacion(fake.client as never, LIC, false, 'user-1', ATE_B);
    expect(updated.estado).toBe('adjudicada_externo');
    expect(history()).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('licitacion_ates'), 'proveedores inventados caídos');
    logged.mockRestore();
  });

  it('no flag is written when the award is refused', async () => {
    storedAtUpdate = ATE_A;
    await expect(confirmAdjudicacion(fake.client as never, LIC, false, 'user-1', ATE_B)).rejects.toThrow(SENTENCE);
    expect(fake.state.requests.some(r => r.target === 'licitacion_ates')).toBe(false);
  });
});
