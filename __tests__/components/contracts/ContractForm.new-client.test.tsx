// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

import {
  createFakeSupabase,
  CLIENT_COLUMNS_SORTED,
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
 * F10b (GES-2.1): creating a contract together with a brand-new client
 * («-- Crear nuevo cliente --») inserts a clientes row made only of that
 * table's columns. Before the fix the row carried a stray `telefono` key,
 * which the table does not have, and the insert failed.
 */
describe('ContractForm — new contract with a brand-new client', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it('inserts a client row without telefono and with only clientes columns', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );

    fillNewClientStep();
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    fillCuotaDates(container);
    // one cuota of the full amount
    const amount = container.querySelector('[data-testid="cuota-amount-input"]') as HTMLInputElement;
    typeInto(amount, '100');
    clickButton(/Guardar Contrato/);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const clientInsert = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'insert');
    expect(clientInsert).toBeTruthy();
    const row = clientInsert.payload[0];
    expect(row).not.toHaveProperty('telefono');
    expect(Object.keys(row).sort()).toEqual(CLIENT_COLUMNS_SORTED);
    // The placeholders for missing legal fields stay as today (a later phase removes them).
    expect(row.rut_representante).toBe('11.111.111-1');
    expect(row.nombre_notario).toBe('Notario Público');
    expect(row.fecha_escritura).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.nombre_legal).toBe('Colegio Inventado SpA');
    expect(row.school_id).toBeNull();
    expect(row.comuna_notaria).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    // contract and cuota follow
    expect(currentClient.__writes.map((w: any) => `${w.op}:${w.table}`)).toEqual([
      'insert:clientes',
      'insert:contratos',
      'insert:cuotas',
    ]);
    expect(screen.queryByText(/Error al guardar el contrato/)).toBeNull();
  });

  it('with a RUT that already exists, still offers the existing client and uses it on yes', async () => {
    currentClient = createFakeSupabase({
      clienteByRut: { id: 'cliente-existente', nombre_legal: 'Otro SpA', nombre_fantasia: 'Otro', ciudad: 'X', nombre_representante: 'Y' },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    fillNewClientStep();
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    fillCuotaDates(container);
    const amount = container.querySelector('[data-testid="cuota-amount-input"]') as HTMLInputElement;
    typeInto(amount, '100');
    clickButton(/Guardar Contrato/);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('¿Deseas usar este cliente existente para el contrato?'));
    expect(currentClient.__writes.find((w: any) => w.table === 'clientes')).toBeUndefined();
    const contrato = currentClient.__writes.find((w: any) => w.table === 'contratos');
    expect(contrato.payload[0].cliente_id).toBe('cliente-existente');
    confirmSpy.mockRestore();
  });
});
