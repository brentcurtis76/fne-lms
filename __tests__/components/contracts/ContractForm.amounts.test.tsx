// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

(globalThis as any).React = React;

import {
  createFakeSupabase,
  PROGRAMAS,
  fillNewClientStep,
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

/**
 * F21b (N171): the total price and the cuota amounts are typed the Chilean way
 * and read by lib/money/parse-es-cl.ts. Before the fix «100.01» typed in
 * «Precio Total» became 1 in a Spanish-format browser. Synthetic data only.
 */
const totalInput = () => screen.getByTestId('contract-total-input') as HTMLInputElement;
const cuotaInputs = (container: HTMLElement) => container.querySelectorAll('[data-testid="cuota-amount-input"]');

const toStep3 = (container: HTMLElement, total: string, currency: 'UF' | 'CLP' = 'UF') => {
  fillNewClientStep();
  clickButton('Siguiente');
  if (currency === 'CLP') fireEvent.click(container.querySelector('input[value="CLP"]') as Element);
  const dates = container.querySelectorAll('input[type="date"]');
  typeInto(dates[1], '2099-12-31');
  typeInto(screen.getByDisplayValue('-- Seleccionar programa --'), 'prog-a');
  typeInto(totalInput(), total);
  clickButton('Siguiente');
};

describe('ContractForm — amounts typed the Chilean way (N171)', () => {
  it('the total and the cuota amount are text fields', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fillNewClientStep();
    clickButton('Siguiente');
    expect(totalInput().type).toBe('text');
    typeInto(container.querySelectorAll('input[type="date"]')[1], '2099-12-31');
    typeInto(screen.getByDisplayValue('-- Seleccionar programa --'), 'prog-a');
    typeInto(totalInput(), '100');
    clickButton('Siguiente');
    expect((cuotaInputs(container)[0] as HTMLInputElement).type).toBe('text');
  });

  // Send-back 1: «15.990» in UF can be read two ways (see below); in pesos it is thousands.
  it.each([
    ['100.01', 100.01],
    ['1.200,50', 1200.5],
    ['15.990,5', 15990.5],
  ])('UF: «%s» typed as total and as the cuota is stored as %d', async (text, expected) => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    toStep3(container, text);
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], text);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const contrato = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(contrato.payload[0].precio_total_uf).toBe(expected);
    const cuotas = currentClient.__writes.find((w: any) => w.table === 'cuotas' && w.op === 'insert');
    expect(cuotas.payload.map((c: any) => c.monto_uf)).toEqual([expected]);
  });

  it('CLP: «$15.990» is stored as 15990', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    toStep3(container, '$15.990', 'CLP');
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], '15.990');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const contrato = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(contrato.payload[0].precio_total_uf).toBe(15990);
  });

  it('CLP: a cuota typed «15.990» is stored as 15990', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    toStep3(container, '15990', 'CLP');
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], '15.990');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const cuotas = currentClient.__writes.find((w: any) => w.table === 'cuotas' && w.op === 'insert');
    expect(cuotas.payload.map((c: any) => c.monto_uf)).toEqual([15990]);
  });

  // Send-back 1: an amount that can be read two ways is refused, not guessed.
  it('UF: «49.995» as the total is not saved; the sentence names both readings with the typed digits', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fillNewClientStep();
    clickButton('Siguiente');
    typeInto(container.querySelectorAll('input[type="date"]')[1], '2099-12-31');
    typeInto(screen.getByDisplayValue('-- Seleccionar programa --'), 'prog-a');
    typeInto(totalInput(), '49.995');
    expect(screen.getByText('Monto ambiguo: escriba 49,995 si son decimales o 49995 si son miles.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(currentClient.__writes).toHaveLength(0);
  });

  it('UF: «49,995» as the total is read as 49.995 (then refused for its three decimals, as before)', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    toStep3(container, '49,995');
    expect(screen.queryByText(/Monto ambiguo/)).toBeNull();
    expect(
      screen.getByText('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija el precio total.'),
    ).toBeInTheDocument();
  });

  it('«49.995» typed in UF, then the currency switched to CLP: read again as 49995 pesos', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    clickButton('Siguiente');
    typeInto(container.querySelectorAll('input[type="date"]')[1], '2099-12-31');
    typeInto(screen.getByDisplayValue('-- Seleccionar programa --'), 'prog-a');
    typeInto(totalInput(), '49.995');
    expect(screen.getByText(/Monto ambiguo/)).toBeInTheDocument();
    fireEvent.click(container.querySelector('input[value="CLP"]') as Element);
    expect(screen.queryByText(/Monto ambiguo/)).toBeNull();
    clickButton('Siguiente');
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], '49.995');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const contrato = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(contrato.payload[0]).toMatchObject({ precio_total_uf: 49995, tipo_moneda: 'CLP' });
  });

  it('UF: a cuota typed «1.200» is refused with the ambiguity sentence', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    toStep3(container, '1200');
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], '1.200');
    expect(screen.getByText('Monto ambiguo: escriba 1,200 si son decimales o 1200 si son miles.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  it('CLP: a cuota typed «100,5» is refused with the decimals message', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    toStep3(container, '100', 'CLP');
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], '100,5');
    expect(
      screen.getByText('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija la cuota 1.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  it('a cuota that is not an amount is refused with a plain sentence and nothing is saved', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    toStep3(container, '100');
    fillCuotaDates(container);
    typeInto(cuotaInputs(container)[0], '1,2,3');
    expect(
      screen.getByText('No se entiende el monto de la cuota 1. Escríbalo con punto de miles y coma decimal, por ejemplo 1.200,50.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
    expect(currentClient.__writes).toHaveLength(0);
  });

  it('a total that is not an amount says so under the field and blocks «Siguiente»', () => {
    currentClient = createFakeSupabase();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fillNewClientStep();
    clickButton('Siguiente');
    typeInto(container.querySelectorAll('input[type="date"]')[1], '2099-12-31');
    typeInto(screen.getByDisplayValue('-- Seleccionar programa --'), 'prog-a');
    typeInto(totalInput(), 'abc');
    expect(
      screen.getByText('No se entiende el precio total. Escríbalo con punto de miles y coma decimal, por ejemplo 1.200,50.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
