// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  Array.from(container.querySelectorAll('input[type="number"]')).map((el) => (el as HTMLInputElement).value);

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
    const inputs = container.querySelectorAll('input[type="number"]');
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
    container.querySelectorAll('input[type="number"]').forEach((el) => typeInto(el, '333333'));
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
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(12);
    expect(screen.getByRole('button', { name: /Agregar Cuota/ })).toBeDisabled();
  });
});
