// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

import {
  createFakeSupabase,
  PROGRAMAS,
  fillContractStep,
  fillCuotaDates,
  clickButton,
  typeInto,
} from './contract-form-harness';

let currentClient: any;
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import ContractForm from '../../../components/contracts/ContractForm';
import { toast } from 'react-hot-toast';

/**
 * F22e, E2 send-back 1: the client list the contracts page loaded can be stale
 * (the client was corrected meanwhile, here or in Clientes). Before refusing an
 * existing client because the value it holds is the filler 11.111.111-1, the
 * form reads that client's rut_representante afresh and decides on it; a
 * failed read refuses and writes nothing. All data here is invented.
 */

const EXISTING_SENTENCE =
  'Este cliente aún no tiene el RUT de su representante legal. Complétalo en Clientes antes de crear el contrato.';
const REAL_REP_RUT = '12.345.678-5';

type FreshAnswer = { data: { rut_representante?: string | null } | null; error: { message: string } | null };
/** `respond`, when given, answers each read itself (for a read still pending: a deferred promise). */
type Fresh = { value?: string | null; error?: boolean; respond?: (id: string) => Promise<FreshAnswer> };

/**
 * The shared fake, with one more answer: `clientes … select('rut_representante')
 * … eq('id', x)` returns what the database holds now (or an error). Those reads
 * are counted.
 */
function fakeWithFreshRead(fresh: Fresh) {
  const base = createFakeSupabase();
  const freshReads: string[] = [];
  const wrap = (inner: any) => {
    let columns = '';
    let id: string | undefined;
    let writing = false;
    const proxy: any = new Proxy(inner, {
      get(target, prop) {
        if (prop === 'then') {
          return (onFulfilled: any, onRejected: any) => {
            if (!writing && columns === 'rut_representante' && id !== undefined) {
              freshReads.push(id);
              if (fresh.respond) return fresh.respond(id).then(onFulfilled, onRejected);
              const answer = fresh.error
                ? { data: null, error: { message: 'lectura fallida' } }
                : { data: { rut_representante: fresh.value }, error: null };
              return Promise.resolve(answer).then(onFulfilled, onRejected);
            }
            return target.then(onFulfilled, onRejected);
          };
        }
        const value = target[prop];
        if (typeof value !== 'function') return value;
        return (...args: any[]) => {
          if (prop === 'select') columns = args[0];
          if (prop === 'eq' && args[0] === 'id') id = args[1];
          if (prop === 'insert' || prop === 'update' || prop === 'delete') writing = true;
          value(...args);
          return proxy;
        };
      },
    });
    return proxy;
  };
  return {
    ...base,
    from: (table: string) => (table === 'clientes' ? wrap(base.from(table)) : base.from(table)),
    __freshReads: freshReads,
  };
}

const cliente = (overrides: Record<string, any> = {}) => ({
  id: 'cliente-1',
  nombre_legal: 'Colegio Existente SpA',
  nombre_fantasia: 'Colegio Existente',
  rut: '76.123.456-0',
  direccion: 'Calle Existente 1',
  comuna: 'Comuna Existente',
  ciudad: 'Ciudad Existente',
  nombre_representante: 'Persona Existente',
  rut_representante: '11.111.111-1',
  fecha_escritura: '2020-01-02',
  nombre_notario: 'Notaría Inventada',
  school_id: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const contrato = (overrides: Record<string, any> = {}) => ({
  id: 'contrato-1',
  numero_contrato: 'FNE-2026-11-123',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2099-12-15',
  cliente_id: 'cliente-1',
  programa_id: 'prog-a',
  precio_total_uf: 100,
  tipo_moneda: 'UF',
  es_manual: false,
  descripcion_manual: null,
  contrato_url: null,
  estado: 'pendiente',
  horas_contratadas: null,
  clientes: cliente(),
  programas: PROGRAMAS[0],
  cuotas: [{ id: 'cuota-1', numero_cuota: 1, fecha_vencimiento: '2099-06-30', monto_uf: 100 }],
  ...overrides,
});

const repRutInput = () => screen.getAllByPlaceholderText('12.345.678-9')[1];
const nextButton = () => screen.getByRole('button', { name: 'Siguiente' });

/** A new contract for the client of the (stale) list, chosen in the select. */
const chooseListedClient = (fresh: Fresh) => {
  currentClient = fakeWithFreshRead(fresh);
  const onSuccess = vi.fn();
  const view = render(
    <ContractForm programas={PROGRAMAS} clientes={[cliente() as any]} onSuccess={onSuccess} onCancel={vi.fn()} />,
  );
  typeInto(view.container.querySelector('select') as Element, 'cliente-1');
  return { ...view, onSuccess };
};

const toStep3AndFill = (container: HTMLElement) => {
  clickButton('Siguiente');
  fillContractStep(container, { programaId: 'prog-a', total: 100 });
  clickButton('Siguiente');
  fillCuotaDates(container);
  typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
};

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe('ContractForm — the filler check reads the stored RUT afresh (F22e, send-back 1)', () => {
  it('the journey: an old contract fixed with a real RUT, then the same client (stale list) gets a new contract', async () => {
    // 1. The old non-draft contract of the filler client: the RUT is replaced by a real one and saved.
    currentClient = fakeWithFreshRead({ value: REAL_REP_RUT });
    const editSaved = vi.fn();
    const editing = contrato();
    render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={editSaved} onCancel={vi.fn()} />,
    );
    typeInto(repRutInput(), REAL_REP_RUT);
    clickButton('Siguiente');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(editSaved).toHaveBeenCalled());
    const clientUpdate = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'update');
    expect(clientUpdate.payload.rut_representante).toBe(REAL_REP_RUT);
    cleanup();

    // 2. A new contract: the page's client list still holds the filler; the database holds the real RUT.
    const { container, onSuccess } = chooseListedClient({ value: REAL_REP_RUT });
    await waitFor(() => expect(nextButton()).toBeEnabled());
    expect(screen.queryByText(EXISTING_SENTENCE)).toBeNull();
    expect(currentClient.__freshReads).toContain('cliente-1');
    toStep3AndFill(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(insert.payload[0].cliente_id).toBe('cliente-1');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('stale list, real RUT in the database: the draft save goes through too', async () => {
    const { container, onSuccess } = chooseListedClient({ value: REAL_REP_RUT });
    await waitFor(() => expect(nextButton()).toBeEnabled());
    toStep3AndFill(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__writes.some((w: any) => w.table === 'contratos' && w.op === 'insert')).toBe(true);
  });

  it('the list and the database both hold the filler: refused, nothing written', async () => {
    chooseListedClient({ value: '11.111.111-1' });
    await waitFor(() => expect(currentClient.__freshReads).toContain('cliente-1'));
    expect(screen.getByText(EXISTING_SENTENCE)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    expect(currentClient.__writes).toEqual([]);
  });

  it('the fresh read fails: refused, nothing written', async () => {
    chooseListedClient({ error: true });
    await waitFor(() => expect(currentClient.__freshReads).toContain('cliente-1'));
    expect(screen.getByText(EXISTING_SENTENCE)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    expect(currentClient.__writes).toEqual([]);
  });

  it('a client the list shows with a real RUT: no extra read', async () => {
    currentClient = fakeWithFreshRead({ value: '11.111.111-1' });
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[cliente({ rut_representante: REAL_REP_RUT }) as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    typeInto(container.querySelector('select') as Element, 'cliente-1');
    expect(nextButton()).toBeEnabled();
    expect(currentClient.__freshReads).toEqual([]);
  });

  it.each([
    ['a real RUT in the database: the draft becomes a contract', { value: REAL_REP_RUT }, true],
    ['the filler in the database: refused, nothing written', { value: '11.111.111-1' }, false],
    ['the read fails: refused, nothing written', { error: true }, false],
  ])('an old draft whose held client has the filler — %s', async (_name, fresh, saves) => {
    currentClient = fakeWithFreshRead(fresh as Fresh);
    const onSuccess = vi.fn();
    const editing = contrato({ estado: 'borrador' });
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    clickButton('Siguiente');
    fillCuotaDates(container);
    clickButton(/Actualizar Contrato/);
    if (saves) {
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
      expect(update.payload.estado).toBe('pendiente');
    } else {
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(EXISTING_SENTENCE));
      expect(currentClient.__writes).toEqual([]);
      expect(onSuccess).not.toHaveBeenCalled();
    }
    expect(currentClient.__freshReads).toContain('cliente-1');
  });

  it('promoting an old draft whose held filler was corrected meanwhile: the client write keeps the real RUT (send-back 2)', async () => {
    currentClient = fakeWithFreshRead({ value: REAL_REP_RUT });
    const onSuccess = vi.fn();
    const editing = contrato({ estado: 'borrador' });
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    clickButton('Siguiente');
    fillCuotaDates(container);
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const clientWrites = currentClient.__writes.filter((w: any) => w.table === 'clientes');
    expect(clientWrites.length).toBeGreaterThan(0);
    for (const w of clientWrites) {
      // the stale filler is never sent over the stored real RUT
      expect(w.payload.rut_representante).not.toBe('11.111.111-1');
    }
    const clientUpdate = clientWrites.find((w: any) => w.op === 'update');
    expect(clientUpdate.payload.rut_representante).toBe(REAL_REP_RUT);
    const promotion = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(promotion.payload.estado).toBe('pendiente');
  });

  it.each([
    ['the draft save', /Guardar Borrador/],
    ['the full save of a new contract', /Guardar Contrato/],
  ])('stale list, real RUT in the database: %s never writes the filler into clientes (send-back 2)', async (_name, button) => {
    const { container, onSuccess } = chooseListedClient({ value: REAL_REP_RUT });
    await waitFor(() => expect(nextButton()).toBeEnabled());
    toStep3AndFill(container);
    clickButton(button);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    for (const w of currentClient.__writes.filter((x: any) => x.table === 'clientes')) {
      const rows = Array.isArray(w.payload) ? w.payload : [w.payload];
      for (const row of rows) expect(row.rut_representante).not.toBe('11.111.111-1');
    }
  });

  it('a new selection clears the verification of an earlier one: A verified, B pending, A again pending then failing (send-back 2)', async () => {
    const pending: Record<string, Array<(answer: FreshAnswer) => void>> = {};
    const deferredRead = (id: string) =>
      new Promise<FreshAnswer>(resolve => {
        (pending[id] ||= []).push(resolve);
      });
    currentClient = fakeWithFreshRead({ respond: deferredRead });
    const clienteA = cliente({ id: 'cliente-a', nombre_legal: 'Colegio A SpA' });
    const clienteB = cliente({ id: 'cliente-b', nombre_legal: 'Colegio B SpA', rut: '77.111.222-3' });
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[clienteA as any, clienteB as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    const select = container.querySelector('select') as Element;

    // A: the list holds the filler, the database answers with a real RUT
    typeInto(select, 'cliente-a');
    await waitFor(() => expect(pending['cliente-a']?.length).toBe(1));
    expect(nextButton()).toBeDisabled();
    await act(async () => {
      pending['cliente-a'][0]({ data: { rut_representante: REAL_REP_RUT }, error: null });
    });
    await waitFor(() => expect(nextButton()).toBeEnabled());

    // B, whose answer has not arrived; then A again before it does
    typeInto(select, 'cliente-b');
    await waitFor(() => expect(pending['cliente-b']?.length).toBe(1));
    expect(nextButton()).toBeDisabled();
    typeInto(select, 'cliente-a');
    await waitFor(() => expect(pending['cliente-a']?.length).toBe(2));
    // A's earlier verification does not count for this new selection
    expect(nextButton()).toBeDisabled();

    // B's late answer changes nothing for A
    await act(async () => {
      pending['cliente-b'][0]({ data: { rut_representante: REAL_REP_RUT }, error: null });
    });
    expect(nextButton()).toBeDisabled();

    // A's new read fails: refused
    await act(async () => {
      pending['cliente-a'][1]({ data: null, error: { message: 'lectura fallida' } });
    });
    await waitFor(() => expect(screen.getByText(EXISTING_SENTENCE)).toBeInTheDocument());
    expect(nextButton()).toBeDisabled();
    expect(currentClient.__writes).toEqual([]);
  });

  it.each([
    ["''", ''],
    ['null', null],
    ['spaces', '   '],
  ])('promoting an old draft whose held filler reads afresh as %s: promoted, the column is left out, the filler written nowhere (send-back 3)', async (_name, stored) => {
    currentClient = fakeWithFreshRead({ value: stored as string | null });
    const onSuccess = vi.fn();
    const editing = contrato({ estado: 'borrador' });
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    clickButton('Siguiente');
    fillCuotaDates(container);
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    const clientUpdate = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'update');
    expect(clientUpdate).toBeDefined();
    expect('rut_representante' in clientUpdate.payload).toBe(false);
    for (const w of currentClient.__writes) {
      expect(JSON.stringify(w.payload ?? null)).not.toContain('11.111.111-1');
    }
    const promotion = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(promotion.payload.estado).toBe('pendiente');
    expect('snapshot_rut_representante' in promotion.payload).toBe(false);
    // the form no longer holds the filler for anything that follows
    clickButton('Anterior');
    clickButton('Anterior');
    await waitFor(() => expect(repRutInput()).toHaveValue(''));
  });
});

