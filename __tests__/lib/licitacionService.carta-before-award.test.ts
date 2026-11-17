// @vitest-environment node
/**
 * LIC-A1 (GENERA fixes F14): confirming an award to the foundation (esFne)
 * before the Carta de adjudicación has been generated used to move the tender
 * to contrato_pendiente, where the contract step then refused for want of the
 * letter. The service now refuses the confirmation until the Carta exists;
 * the external-provider path is unchanged. Synthetic data only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createRecordingSupabase, has, opArgs, type RecordedRequest } from '../helpers/recordingSupabase';
import { confirmAdjudicacion, linkContractToLicitacion } from '@/lib/licitacionService';

const LIC = '22222222-2222-4222-8222-222222222222';
const ATE = '33333333-3333-4333-8333-333333333333';

let fake: ReturnType<typeof createRecordingSupabase>;
let row: Record<string, unknown>;

beforeEach(() => {
  fake = createRecordingSupabase();
  row = { id: LIC, estado: 'adjudicacion_pendiente', ganador_ate_id: ATE, carta_adjudicacion_url: null };
  fake.state.respond = (req: RecordedRequest) => {
    if (req.target === 'licitaciones' && has(req, 'update')) {
      return { data: { ...row, ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (req.target === 'licitaciones') return { data: row, error: null };
    return { data: null, error: null };
  };
});

const updates = () => fake.state.requests.filter(r => r.target === 'licitaciones' && has(r, 'update'));

describe('confirmAdjudicacion — the Carta comes before an award to the foundation', () => {
  it('refuses an esFne confirmation while no Carta has been generated, and changes nothing', async () => {
    await expect(confirmAdjudicacion(fake.client as never, LIC, true, 'user-1')).rejects.toThrow(
      'Genere la Carta de adjudicación antes de confirmar la adjudicación.'
    );
    expect(updates()).toHaveLength(0);
    expect(fake.state.requests.some(r => r.target === 'licitacion_historial')).toBe(false);
  });

  it('confirms an esFne award once the Carta has been generated', async () => {
    row.carta_adjudicacion_url = 'licitaciones/x/adjudicacion/carta.docx';
    const updated = await confirmAdjudicacion(fake.client as never, LIC, true, 'user-1');
    expect(updated.estado).toBe('contrato_pendiente');
    expect(updates()).toHaveLength(1);
  });

  it('an award to an external provider still needs no Carta (unchanged path)', async () => {
    const updated = await confirmAdjudicacion(fake.client as never, LIC, false, 'user-1');
    expect(updated.estado).toBe('adjudicada_externo');
    expect(updates()).toHaveLength(1);
  });
});

describe('linkContractToLicitacion — the message names the letter it really needs', () => {
  it('asks for the generated Carta, not a signed upload', async () => {
    row = { id: LIC, estado: 'contrato_pendiente', ganador_es_fne: true, contrato_id: null, carta_adjudicacion_url: null, school_id: 1, cliente_id: 'c1' };
    const err = await linkContractToLicitacion(fake.client as never, LIC, '44444444-4444-4444-8444-444444444444', 'user-1').catch(e => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Carta de adjudicación generada');
    expect(err.message).not.toContain('firmada');
  });
});
