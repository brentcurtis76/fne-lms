// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

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

/**
 * F10b (GES-2.7): «Calcular Automático» gives a schedule the form accepts.
 * Before the fix 100 UF in three cuotas became 33.33 × 3 = 99.99, the check
 * refused it and «Guardar Contrato» stayed disabled.
 */
const goToCuotas = (container: HTMLElement, total: number, currency: 'UF' | 'CLP' = 'UF') => {
  fillNewClientStep();
  clickButton('Siguiente');
  if (currency === 'CLP') {
    fireEvent.click(container.querySelector('input[value="CLP"]') as Element);
  }
  fillContractStep(container, { programaId: 'prog-a', total });
  clickButton('Siguiente');
};

const amounts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="cuota-amount-input"]')).map((el) => (el as HTMLInputElement).value);

describe('ContractForm — «Calcular Automático»', () => {
  it('100 UF in three cuotas: the step is valid after Calcular Automático', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);

    expect(amounts(container)).toEqual(['33.33', '33.33', '33.34']);
    expect(screen.queryByText(/La suma de las cuotas no coincide/)).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeEnabled();
  });

  it('1.000.000 CLP in three cuotas: whole pesos, the last takes the remainder', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 1000000, 'CLP');
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);

    expect(amounts(container)).toEqual(['333333', '333333', '333334']);
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeEnabled();
  });

  it('a hand-typed schedule that does not add up shows the real difference and blocks saving', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    const inputs = container.querySelectorAll('[data-testid="cuota-amount-input"]');
    inputs.forEach((el) => typeInto(el, '33.33'));
    fillCuotaDates(container);

    expect(screen.getByText(/La suma de las cuotas no coincide/)).toHaveTextContent('Diferencia: UF 0,01');
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();

    // typed by hand so that it adds up: accepted
    typeInto(inputs[2], '33.34');
    expect(screen.queryByText(/La suma de las cuotas no coincide/)).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeEnabled();
  });

  it('CLP: the difference is printed in whole pesos', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 1000000, 'CLP');
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    container.querySelectorAll('[data-testid="cuota-amount-input"]').forEach((el) => typeInto(el, '333333'));
    fillCuotaDates(container);

    expect(screen.getByText(/La suma de las cuotas no coincide/)).toHaveTextContent(/Diferencia: CLP 1$/);
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  it('keeps the twelve-cuota limit', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    for (let i = 0; i < 15; i++) {
      const add = screen.getByRole('button', { name: /Agregar Cuota/ });
      if ((add as HTMLButtonElement).disabled) break;
      clickButton(/Agregar Cuota/);
    }
    expect(container.querySelectorAll('[data-testid="cuota-amount-input"]')).toHaveLength(12);
    expect(screen.getByRole('button', { name: /Agregar Cuota/ })).toBeDisabled();
  });

  // Send-back 1, item 1: the amounts that are checked are the amounts that are saved.
  it('CLP 100 in two cuotas of 50.49: the step is not valid and the message names the cuota', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100, 'CLP');
    clickButton(/Agregar Cuota/);
    container.querySelectorAll('[data-testid="cuota-amount-input"]').forEach((el) => typeInto(el, '50.49'));
    fillCuotaDates(container);

    expect(
      screen.getByText('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija la cuota 1.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();

    // corrected to whole pesos: accepted
    container.querySelectorAll('[data-testid="cuota-amount-input"]').forEach((el) => typeInto(el, '50'));
    expect(screen.queryByText(/no llevan decimales/)).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeEnabled();
  });

  it('UF with a cuota of three decimals: refused, the message names that cuota', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    clickButton(/Agregar Cuota/);
    const inputs = container.querySelectorAll('[data-testid="cuota-amount-input"]');
    typeInto(inputs[0], '50');
    typeInto(inputs[1], '49,995');
    fillCuotaDates(container);
    expect(
      screen.getByText('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija la cuota 2.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  it('a total with more decimals than its currency: refused, the message names the total', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100.5, 'CLP');
    typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
    fillCuotaDates(container);
    expect(
      screen.getByText('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija el precio total.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  it('changing the currency after typing amounts re-runs the check', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    clickButton(/Agregar Cuota/);
    const inputs = container.querySelectorAll('[data-testid="cuota-amount-input"]');
    typeInto(inputs[0], '49.75');
    typeInto(inputs[1], '50.25');
    fillCuotaDates(container);
    expect(screen.queryByText(/no llevan decimales/)).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeEnabled();

    // back to step 2, switch to CLP, forward again: the same amounts are now refused
    clickButton('Anterior');
    fireEvent.click(container.querySelector('input[value="CLP"]') as Element);
    clickButton('Siguiente');
    expect(
      screen.getByText('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija la cuota 1.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  // Send-back 2, item 4: the form says why a schedule with a zero cuota cannot be saved.
  it('1 CLP in three cuotas after «Calcular Automático»: the message names cuota 1', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 1, 'CLP');
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);

    expect(amounts(container)).toEqual(['0', '0', '1']);
    expect(screen.getByText('La cuota 1 necesita un monto mayor que cero.')).toBeInTheDocument();
    expect(screen.queryByText(/La cuota 2 necesita/)).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar Contrato/ })).toBeDisabled();
  });

  it('a schedule whose cuotas are all above zero shows no zero-cuota message', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);
    expect(screen.queryByText(/necesita un monto mayor que cero/)).toBeNull();
  });

  it('after «Calcular Automático» on 100 UF in three, the save writes exactly 33.33, 33.33, 33.34', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    goToCuotas(container, 100);
    clickButton(/Agregar Cuota/);
    clickButton(/Agregar Cuota/);
    clickButton('Calcular Automático');
    fillCuotaDates(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const cuotasInsert = currentClient.__writes.find((w: any) => w.table === 'cuotas' && w.op === 'insert');
    expect(cuotasInsert.payload.map((c: any) => c.monto_uf)).toEqual([33.33, 33.33, 33.34]);
  });
});
