// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

import {
  createFakeSupabase,
  PROGRAMAS,
  fillNewClientStep,
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
 * F22e, E2: the contract form no longer writes or accepts the filler RUT
 * 11.111.111-1 as the representative's RUT. A new client needs a real, valid
 * one; an existing client that still has the filler cannot get a new contract
 * or a new draft, and its old draft cannot be turned into a contract; an old
 * contract that is not a draft saves as before when the RUT is not touched.
 * Every refusal writes nothing. All data here is invented.
 */

const FILLER_SENTENCE = 'Ingresa el RUT real del representante legal; 11.111.111-1 no es válido.';
const INVALID_SENTENCE = 'El RUT del representante legal no es válido.';
const EXISTING_SENTENCE =
  'Este cliente aún no tiene el RUT de su representante legal. Complétalo en Clientes antes de crear el contrato.';
const REAL_REP_RUT = '12.345.678-5';

const repRutInput = () => screen.getAllByPlaceholderText('12.345.678-9')[1];
const nextButton = () => screen.getByRole('button', { name: 'Siguiente' });

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

/** From step 1 (already valid) to step 3 with one cuota of the full amount. */
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

describe('ContractForm — a new client needs the representative\'s real RUT (F22e)', () => {
  const renderNew = () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    return render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
  };

  it('empty: «Siguiente» stays disabled and nothing is written', () => {
    renderNew();
    fillNewClientStep();
    typeInto(repRutInput(), '');
    expect(nextButton()).toBeDisabled();
    expect(screen.queryByText(FILLER_SENTENCE)).toBeNull();
    expect(currentClient.__writes).toEqual([]);
  });

  it.each(['11.111.111-1', '11111111-1', '111111111'])('the filler %j: the sentence is shown, «Siguiente» disabled, nothing written', (filler) => {
    renderNew();
    fillNewClientStep();
    typeInto(repRutInput(), filler);
    expect(screen.getByText(FILLER_SENTENCE)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    expect(currentClient.__writes).toEqual([]);
  });

  it('a bad check digit: the invalid sentence is shown and «Siguiente» disabled', () => {
    renderNew();
    fillNewClientStep();
    typeInto(repRutInput(), '12.345.678-9');
    expect(screen.getByText(INVALID_SENTENCE)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });

  it.each([[/Guardar Contrato/], [/Guardar Borrador/]])('a real RUT: the client row carries it (%s)', async (button) => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(repRutInput(), REAL_REP_RUT);
    expect(nextButton()).toBeEnabled();
    toStep3AndFill(container);
    clickButton(button);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const clientInsert = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'insert');
    expect(clientInsert.payload[0].rut_representante).toBe(REAL_REP_RUT);
  });
});

describe('ContractForm — an existing client that still has the filler (F22e)', () => {
  it('chosen in the list: the sentence is shown, «Siguiente» disabled, nothing written', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[cliente() as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    typeInto(container.querySelector('select') as Element, 'cliente-1');
    expect(screen.getByText(EXISTING_SENTENCE)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    expect(currentClient.__writes).toEqual([]);
  });

  it('the same client with a real RUT goes on as before', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[cliente({ rut_representante: REAL_REP_RUT }) as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    typeInto(container.querySelector('select') as Element, 'cliente-1');
    expect(screen.queryByText(EXISTING_SENTENCE)).toBeNull();
    expect(nextButton()).toBeEnabled();
  });

  it.each([[/Guardar Contrato/], [/Guardar Borrador/]])(
    'found by its RUT while a new client is typed: refused with the sentence and nothing written (%s)',
    async (button) => {
      currentClient = createFakeSupabase({ clientesStored: [cliente()] });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const onSuccess = vi.fn();
      const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
      fillNewClientStep();
      typeInto(repRutInput(), REAL_REP_RUT);
      toStep3AndFill(container);
      clickButton(button);
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(EXISTING_SENTENCE));
      expect(currentClient.__writes).toEqual([]);
      expect(onSuccess).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    },
  );
});

describe('ContractForm — old contracts of a client that still has the filler (F22e)', () => {
  it('an old draft turned into a contract: refused with the sentence and nothing written', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = contrato({ estado: 'borrador' });
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    clickButton('Siguiente');
    fillCuotaDates(container);
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(EXISTING_SENTENCE));
    expect(currentClient.__writes).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('the same old draft saved again as a draft: saves as before', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = contrato({ estado: 'borrador' });
    render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    clickButton('Siguiente');
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__writes.some((w: any) => w.table === 'contratos' && w.op === 'update')).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a contract that is not a draft, edited without touching the RUT: saves as before', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = contrato();
    render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    typeInto(screen.getByPlaceholderText('Ciudad'), 'Ciudad Corregida');
    clickButton('Siguiente');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const clientUpdate = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'update');
    expect(clientUpdate.payload).toMatchObject({ ciudad: 'Ciudad Corregida', rut_representante: '11.111.111-1' });
    expect(currentClient.__writes.some((w: any) => w.table === 'contratos' && w.op === 'update')).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a contract of a client with a real RUT, edited to the filler: refused, «Siguiente» disabled', () => {
    currentClient = createFakeSupabase();
    const editing = contrato({ clientes: cliente({ rut_representante: REAL_REP_RUT }) });
    render(
      <ContractForm programas={PROGRAMAS} clientes={[editing.clientes as any]} editingContract={editing} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    typeInto(repRutInput(), '11.111.111-1');
    expect(screen.getByText(FILLER_SENTENCE)).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    expect(currentClient.__writes).toEqual([]);
  });
});
