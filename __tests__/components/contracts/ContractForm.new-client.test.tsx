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

/**
 * F21b (GES-3.10): a new contract for an EXISTING client shows the client's
 * data read-only, with a line that sends corrections to Clientes. Before the
 * fix the fields were editable and what was typed was silently thrown away
 * (the contract prints the stored client).
 */
describe('ContractForm — an existing client chosen for a new contract', () => {
  const EXISTENTE = {
    id: 'cliente-1',
    nombre_legal: 'Colegio Existente SpA',
    nombre_fantasia: 'Colegio Existente',
    rut: '76.123.456-0',
    direccion: 'Calle Existente 1',
    comuna: 'Comuna Existente',
    ciudad: 'Ciudad Existente',
    nombre_representante: 'Persona Existente',
    rut_representante: '',
    fecha_escritura: '',
    nombre_notario: '',
    school_id: null,
  };
  const LINE = 'Para corregir los datos del cliente, use Clientes';
  const clientSelect = (container: HTMLElement) => container.querySelector('select') as HTMLSelectElement;
  const textInputsOfClient = () => [
    screen.getByPlaceholderText('Nombre legal de la empresa'),
    screen.getByPlaceholderText('Nombre comercial'),
    screen.getAllByPlaceholderText('12.345.678-9')[0],
    screen.getByPlaceholderText('Calle y número'),
    screen.getByPlaceholderText('Comuna'),
    screen.getByPlaceholderText('Ciudad'),
    screen.getByPlaceholderText('Nombre del representante'),
    screen.getAllByPlaceholderText('12.345.678-9')[1],
    screen.getByPlaceholderText('Nombre del notario'),
    screen.getByPlaceholderText('Santiago, Providencia, etc.'),
    screen.getByPlaceholderText('encargado@colegio.cl'),
    screen.getByPlaceholderText('administracion@colegio.cl'),
  ] as HTMLInputElement[];

  it('the client fields are read-only and the line is shown; typing changes nothing', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[EXISTENTE as any]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    typeInto(clientSelect(container), 'cliente-1');
    expect(screen.getByText(LINE)).toBeInTheDocument();
    for (const input of textInputsOfClient()) expect(input.readOnly).toBe(true);
    typeInto(screen.getByPlaceholderText('Nombre legal de la empresa'), 'Corrección perdida SpA');
    expect(screen.getByPlaceholderText('Nombre legal de la empresa')).toHaveValue('Colegio Existente SpA');

    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    fillCuotaDates(container);
    typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    // nothing is written into clientes from this form
    expect(currentClient.__writes.find((w: any) => w.table === 'clientes')).toBeUndefined();
    const contrato = currentClient.__writes.find((w: any) => w.table === 'contratos');
    expect(contrato.payload[0].cliente_id).toBe('cliente-1');
  });

  it('«-- Crear nuevo cliente --» keeps the fields editable and shows no line', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[EXISTENTE as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(clientSelect(container).value).toBe('');
    expect(screen.queryByText(LINE)).toBeNull();
    for (const input of textInputsOfClient()) expect(input.readOnly).toBe(false);
    typeInto(screen.getByPlaceholderText('Nombre legal de la empresa'), 'Colegio Nuevo SpA');
    expect(screen.getByPlaceholderText('Nombre legal de la empresa')).toHaveValue('Colegio Nuevo SpA');

    // choose the existing client, then back to a new one: editable again
    typeInto(clientSelect(container), 'cliente-1');
    expect(screen.getByText(LINE)).toBeInTheDocument();
    typeInto(clientSelect(container), '');
    expect(screen.queryByText(LINE)).toBeNull();
    for (const input of textInputsOfClient()) expect(input.readOnly).toBe(false);
  });

  it('editing a contract keeps the client fields editable (that save updates the client, as before)', () => {
    currentClient = createFakeSupabase();
    render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[EXISTENTE as any]}
        editingContract={{
          id: 'contrato-1', numero_contrato: 'FNE-2026-11-777', fecha_contrato: '2026-01-15', fecha_fin: '2026-12-15',
          cliente_id: 'cliente-1', programa_id: 'prog-a', precio_total_uf: 100, tipo_moneda: 'UF', es_manual: false,
          estado: 'activo', horas_contratadas: null, clientes: EXISTENTE,
          cuotas: [{ id: 'cuota-a', numero_cuota: 1, fecha_vencimiento: '2099-06-30', monto_uf: 100 }],
        }}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText(LINE)).toBeNull();
    for (const input of textInputsOfClient()) expect(input.readOnly).toBe(false);
  });
});
