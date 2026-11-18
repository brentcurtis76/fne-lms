// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).React = React;

import {
  createFakeSupabase,
  CLIENT_COLUMNS_SORTED,
  PROGRAMAS,
  fillNewClientStep,
  fillContractStep,
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
 * F10b (GES-2.6): «Guardar Borrador» saves the whole draft or nothing.
 * Before the fix a brand-new client was inserted as a partial row the table
 * refuses (the error was only logged and a raw alert followed), and a cuota
 * without date was found only after the contract row had been written.
 */
const CLIENTE = {
  id: 'cliente-1',
  nombre_legal: 'Colegio Inventado SpA',
  nombre_fantasia: 'Colegio Inventado',
  rut: '76.123.456-0',
  direccion: 'Calle Falsa 123',
  comuna: 'Comuna Inventada',
  ciudad: 'Ciudad Inventada',
  nombre_representante: 'Persona Inventada',
  rut_representante: '11.222.333-4',
  fecha_escritura: '2020-01-02',
  nombre_notario: 'Notaría Inventada',
  school_id: null,
};

const amountInputs = (container: HTMLElement) => container.querySelectorAll('input[type="number"]');
const dateInputs = (container: HTMLElement) => container.querySelectorAll('input[type="date"]');

/** Up to step 3 with two cuotas, nothing filled in step 3. */
const toStep3 = (container: HTMLElement, newClient: boolean) => {
  if (newClient) fillNewClientStep();
  clickButton('Siguiente');
  fillContractStep(container, { programaId: 'prog-a', total: 100 });
  clickButton('Siguiente');
  clickButton(/Agregar Cuota/);
};

const fillBothCuotas = (container: HTMLElement) => {
  dateInputs(container).forEach((el) => typeInto(el, '2099-06-30'));
  amountInputs(container).forEach((el) => typeInto(el, '50'));
};

let alertSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe('ContractForm — «Guardar Borrador»', () => {
  it('with a brand-new client: inserts a complete client row, then the contract and its cuotas', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    toStep3(container, true);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('contrato-nuevo'));

    const writes = currentClient.__writes;
    expect(writes.map((w: any) => `${w.op}:${w.table}`)).toEqual(['insert:clientes', 'insert:contratos', 'insert:cuotas']);
    const clientRow = writes[0].payload[0];
    expect(Object.keys(clientRow).sort()).toEqual(CLIENT_COLUMNS_SORTED);
    // the same placeholders the full save uses
    expect(clientRow).toMatchObject({
      nombre_legal: 'Colegio Inventado SpA',
      nombre_fantasia: 'Colegio Inventado',
      rut: '76.123.456-0',
      nombre_representante: 'Persona Inventada',
      rut_representante: '11.111.111-1',
      nombre_notario: 'Notario Público',
      comuna_notaria: null,
    });
    expect(clientRow.fecha_escritura).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(writes[1].payload[0]).toMatchObject({ estado: 'borrador', cliente_id: 'cliente-nuevo' });
    expect(writes[2].payload).toHaveLength(2);
  });

  // Send-back 2, item 5: the success message is the page's toast, not a browser pop-up.
  it('a successful draft save calls no window.alert and shows the success toast', async () => {
    vi.mocked(toast.success).mockClear();
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      '✅ Contrato guardado como borrador. Puede continuar editándolo más tarde desde la lista de contratos.',
    );
  });

  it('if the client insert fails, nothing else is written and a readable message is shown', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null, clienteInsertError: { message: 'null value in column', code: '23502' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    toStep3(container, true);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se pudo guardar el cliente del borrador. Revise sus datos e inténtelo de nuevo.'),
    );
    expect(currentClient.__writes.map((w: any) => `${w.op}:${w.table}`)).toEqual(['insert:clientes']);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('a cuota without date: nothing is written and the message names the cuota', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    toStep3(container, true);
    typeInto(dateInputs(container)[0], '2099-06-30');
    amountInputs(container).forEach((el) => typeInto(el, '50'));
    clickButton(/Guardar Borrador/);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('La cuota 2 necesita una fecha de vencimiento para guardar el borrador.'),
    );
    expect(currentClient.__writes).toHaveLength(0);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('a cuota whose amount is not above zero: nothing is written and the message names the cuota', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    dateInputs(container).forEach((el) => typeInto(el, '2099-06-30'));
    typeInto(amountInputs(container)[1], '100');
    // cuota 1 keeps amount 0
    clickButton(/Guardar Borrador/);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('La cuota 1 necesita un monto mayor que cero para guardar el borrador.'),
    );
    expect(currentClient.__writes).toHaveLength(0);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a cuota with more decimals than its currency: nothing is written and the toast names the cuota (send-back 1)', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    dateInputs(container).forEach((el) => typeInto(el, '2099-06-30'));
    typeInto(amountInputs(container)[0], '50');
    typeInto(amountInputs(container)[1], '49.995');
    clickButton(/Guardar Borrador/);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Los montos en CLP no llevan decimales; en UF, hasta dos. Corrija la cuota 2.'),
    );
    expect(currentClient.__writes).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('saving over an existing draft keeps one draft and updates its cuotas in place', async () => {
    currentClient = createFakeSupabase({
      existingDraft: { id: 'borrador-1' },
      existingCuotas: [
        { id: 'cuota-a', numero_cuota: 1 },
        { id: 'cuota-b', numero_cuota: 2 },
      ],
    });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('borrador-1'));
    expect(currentClient.__writes.map((w: any) => `${w.op}:${w.table}:${w.filters.id ?? ''}`)).toEqual([
      'update:contratos:borrador-1',
      'update:cuotas:cuota-a',
      'update:cuotas:cuota-b',
    ]);
  });

  // Send-back 1, item 3: a draft found by its number does not lose hours already distributed.
  it('saving over a found draft that has allocations: the update carries no horas_contratadas', async () => {
    currentClient = createFakeSupabase({
      existingDraft: { id: 'borrador-1' },
      existingCuotas: [
        { id: 'cuota-a', numero_cuota: 1 },
        { id: 'cuota-b', numero_cuota: 2 },
      ],
      allocations: [{ id: 'alloc-1' }],
    });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('borrador-1'));
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.filters.id).toBe('borrador-1');
    expect(update.payload).not.toHaveProperty('horas_contratadas');
    expect(currentClient.__reads).toContainEqual({ table: 'contract_hour_allocations', filters: { contrato_id: 'borrador-1' } });
  });

  it('saving over a found draft whose allocation read fails: the update carries no horas_contratadas', async () => {
    currentClient = createFakeSupabase({
      existingDraft: { id: 'borrador-1' },
      existingCuotas: [
        { id: 'cuota-a', numero_cuota: 1 },
        { id: 'cuota-b', numero_cuota: 2 },
      ],
      allocationsError: { message: 'read failed' },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('borrador-1'));
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).not.toHaveProperty('horas_contratadas');
    errorSpy.mockRestore();
  });

  it('saving over a found draft without allocations still sends horas_contratadas', async () => {
    currentClient = createFakeSupabase({
      existingDraft: { id: 'borrador-1' },
      existingCuotas: [
        { id: 'cuota-a', numero_cuota: 1 },
        { id: 'cuota-b', numero_cuota: 2 },
      ],
      allocations: [],
    });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('borrador-1'));
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).toHaveProperty('horas_contratadas', 120);
  });

  it('a duplicate contract number still gives its own message', async () => {
    currentClient = createFakeSupabase({ contratoInsertError: { message: 'duplicate key value violates unique constraint' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Ya existe un contrato con este número. Por favor use un número diferente.'),
    );
    expect(alertSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('any other failure gives the generic draft toast, the technical text goes to the console', async () => {
    currentClient = createFakeSupabase({ contratoInsertError: { message: 'some technical failure' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    toStep3(container, false);
    fillBothCuotas(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo guardar el borrador. Inténtelo de nuevo.'));
    expect(errorSpy).toHaveBeenCalledWith('Error saving draft:', expect.objectContaining({ message: 'some technical failure' }));
    expect(alertSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('«Actualizar Contrato» still promotes a draft to pendiente', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = {
      id: 'borrador-1',
      numero_contrato: 'FNE-2026-11-321',
      fecha_contrato: '2026-01-15',
      fecha_fin: '2026-12-15',
      cliente_id: 'cliente-1',
      programa_id: 'prog-a',
      precio_total_uf: 100,
      tipo_moneda: 'UF',
      es_manual: false,
      estado: 'borrador',
      horas_contratadas: null,
      clientes: CLIENTE,
      cuotas: [{ id: 'cuota-a', numero_cuota: 1, fecha_vencimiento: '2099-06-30', monto_uf: 100 }],
    };
    render(<ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />);
    clickButton('Siguiente');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload.estado).toBe('pendiente');
    expect(screen.queryByText(/Error al guardar/)).toBeNull();
  });
});
