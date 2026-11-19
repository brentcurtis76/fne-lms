// @vitest-environment node
/**
 * LIC-D5 + N117 (GENERA fixes F20d): the link between a tender and its contract.
 * - No notary data is ever required of the client (Brent, 17 Nov 2026).
 * - Only a contract that exists and belongs to this tender (licitacion_id equal
 *   to the tender's id, or empty) is accepted; a refusal writes nothing.
 * - The idempotent answer and the "already has another contract" refusal stay.
 * Synthetic data only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createRecordingSupabase, has, opArgs, type RecordedRequest } from '../helpers/recordingSupabase';
import { linkContractToLicitacion } from '@/lib/licitacionService';

const LIC = '22222222-2222-4222-8222-222222222222';
const OTHER_LIC = '55555555-5555-4555-8555-555555555555';
const CONTRATO = '44444444-4444-4444-8444-444444444444';
const OTHER_CONTRATO = '66666666-6666-4666-8666-666666666666';
const CLIENTE = 'cliente-sintetico-1';

let fake: ReturnType<typeof createRecordingSupabase>;
let licRow: Record<string, unknown>;
let clienteRow: Record<string, unknown> | null;
let contratoRow: Record<string, unknown> | null;

beforeEach(() => {
  fake = createRecordingSupabase();
  licRow = {
    id: LIC,
    estado: 'contrato_pendiente',
    ganador_es_fne: true,
    contrato_id: null,
    carta_adjudicacion_url: 'licitaciones/x/adjudicacion/carta.docx',
    school_id: 1,
    cliente_id: CLIENTE,
  };
  // A client that is not a SEP client: no escritura, no notario, no RUT of the representative.
  clienteRow = {
    id: CLIENTE,
    nombre_legal: 'Fundación Escuela Inventada',
    nombre_representante: '',
    rut_representante: '',
    fecha_escritura: null,
    nombre_notario: '',
  };
  contratoRow = { id: CONTRATO, licitacion_id: LIC };
  fake.state.respond = (req: RecordedRequest) => {
    if (req.target === 'licitaciones' && has(req, 'update')) {
      return { data: { ...licRow, ...(opArgs(req, 'update')?.[0] as object) }, error: null };
    }
    if (req.target === 'licitaciones') return { data: licRow, error: null };
    if (req.target === 'clientes') return { data: clienteRow, error: null };
    if (req.target === 'contratos') return { data: contratoRow, error: null };
    return { data: null, error: null };
  };
});

const writes = () =>
  fake.state.requests.filter(r => has(r, 'update') || has(r, 'insert') || has(r, 'upsert') || has(r, 'delete'));

describe('linkContractToLicitacion — a tender has one contract, and it really exists', () => {
  it('links a client without fecha escritura, notario or representative RUT', async () => {
    const updated = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1');
    expect(updated.estado).toBe('contrato_generado');
    expect(updated.contrato_id).toBe(CONTRATO);
    expect(fake.state.requests.some(r => r.target === 'licitacion_historial' && has(r, 'insert'))).toBe(true);
  });

  it('links a contract whose licitacion_id is still empty (as today, the contract row is not written)', async () => {
    contratoRow = { id: CONTRATO, licitacion_id: null };
    const updated = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1');
    expect(updated.contrato_id).toBe(CONTRATO);
    expect(writes().some(r => r.target === 'contratos')).toBe(false);
  });

  it('refuses a contrato_id that does not exist, in plain Spanish, and writes nothing', async () => {
    contratoRow = null;
    const err = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1').catch(e => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('El contrato indicado no existe. No se puede vincular a la licitación.');
    expect(writes()).toHaveLength(0);
  });

  it('refuses a contract that belongs to another tender, and writes nothing', async () => {
    contratoRow = { id: CONTRATO, licitacion_id: OTHER_LIC };
    const err = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1').catch(e => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('El contrato indicado pertenece a otra licitación. No se puede vincular a esta licitación.');
    expect(writes()).toHaveLength(0);
  });

  it('refuses when the tender has no client at all (the client must exist)', async () => {
    clienteRow = null;
    const err = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1').catch(e => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('contrato');
    expect(writes().some(r => r.target === 'licitaciones' && has(r, 'update') && 'contrato_id' in ((opArgs(r, 'update')?.[0] as object) ?? {}))).toBe(false);
  });

  it('already linked to this same contract: answers the current tender, writes nothing (unchanged)', async () => {
    licRow = { ...licRow, estado: 'contrato_generado', contrato_id: CONTRATO };
    const current = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1');
    expect(current.contrato_id).toBe(CONTRATO);
    expect(writes()).toHaveLength(0);
  });

  it('linked to another contract: refused as today', async () => {
    licRow = { ...licRow, contrato_id: OTHER_CONTRATO };
    const err = await linkContractToLicitacion(fake.client as never, LIC, CONTRATO, 'user-1').catch(e => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Esta licitacion ya tiene un contrato asociado. No se puede vincular otro contrato.');
    expect(writes()).toHaveLength(0);
  });
});
