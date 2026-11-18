// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).React = React;

import { createFakeSupabase, PROGRAMAS, clickButton, typeInto, fillCuotaDates } from './contract-form-harness';

let currentClient: any;
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import ContractForm from '../../../components/contracts/ContractForm';

/**
 * F10b (GES-2.2): a contract gets its «horas contratadas». The form fills the
 * field from the chosen programme's horas_totales; the admin may change it;
 * create, update and draft write it as a number (null when empty); it is
 * read-only once the contract has a distribution of hours. Before the fix the
 * form had no such field and no payload carried the column.
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
  nombre_contacto_administrativo: 'Contacto Inventado',
  email_contacto_administrativo: 'contacto@ejemplo.test',
  school_id: null,
};

const editingContract = (overrides: Record<string, any> = {}) => ({
  id: 'contrato-1',
  numero_contrato: 'FNE-2026-11-123',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2026-12-15',
  cliente_id: 'cliente-1',
  programa_id: 'prog-a',
  precio_total_uf: 100,
  tipo_moneda: 'UF',
  es_manual: false,
  descripcion_manual: null,
  contrato_url: null,
  estado: 'pendiente',
  horas_contratadas: 40,
  clientes: CLIENTE,
  cuotas: [{ id: 'cuota-1', numero_cuota: 1, fecha_vencimiento: '2026-06-30', monto_uf: 100 }],
  ...overrides,
});

const hours = () => screen.getByTestId('contract-hours-input') as HTMLInputElement;
const programmeSelect = (container: HTMLElement) => container.querySelector('select') as HTMLSelectElement;
const HOURS_MESSAGE = 'Las horas contratadas deben ser un número entre 0 y 999999,99 con hasta dos decimales.';

/** New contract for the pre-selected client, up to step 2. */
const renderNewAtStep2 = (props: Record<string, any> = {}) => {
  const onSuccess = vi.fn();
  const utils = render(
    <ContractForm
      programas={PROGRAMAS}
      clientes={[CLIENTE as any]}
      preSelectedClientId="cliente-1"
      onSuccess={onSuccess}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  clickButton('Siguiente');
  const dates = utils.container.querySelectorAll('input[type="date"]');
  typeInto(dates[1], '2099-12-31');
  typeInto(screen.getByPlaceholderText('0.00'), '100');
  return { ...utils, onSuccess };
};

const finishStep3 = (container: HTMLElement) => {
  clickButton('Siguiente');
  fillCuotaDates(container);
  typeInto(container.querySelector('input[type="number"]') as Element, '100');
};

let alertSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe('ContractForm — «Horas contratadas»', () => {
  it('choosing a programme fills the field from its horas_totales, and another programme replaces it', () => {
    currentClient = createFakeSupabase();
    const { container } = renderNewAtStep2();
    expect(hours().value).toBe('');
    typeInto(programmeSelect(container), 'prog-a');
    expect(hours().value).toBe('120');
    typeInto(programmeSelect(container), 'prog-b');
    expect(hours().value).toBe('80');
    expect(screen.getByText('Se completa con las horas del programa; puede cambiarlas antes de guardar.')).toBeInTheDocument();
  });

  it('a number the admin typed is not overwritten by choosing another programme', () => {
    currentClient = createFakeSupabase();
    const { container } = renderNewAtStep2();
    typeInto(programmeSelect(container), 'prog-a');
    typeInto(hours(), '95.5');
    typeInto(programmeSelect(container), 'prog-b');
    expect(hours().value).toBe('95.5');
  });

  it('create writes horas_contratadas as a number', async () => {
    currentClient = createFakeSupabase();
    const { container, onSuccess } = renderNewAtStep2();
    typeInto(programmeSelect(container), 'prog-a');
    typeInto(hours(), '110.25');
    finishStep3(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(insert.payload[0].horas_contratadas).toBe(110.25);
  });

  it('create writes null when the field is left empty', async () => {
    currentClient = createFakeSupabase();
    const { container, onSuccess } = renderNewAtStep2();
    typeInto(programmeSelect(container), 'prog-a');
    typeInto(hours(), '');
    finishStep3(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(insert.payload[0]).toHaveProperty('horas_contratadas', null);
  });

  it('the draft writes horas_contratadas', async () => {
    currentClient = createFakeSupabase();
    const { container, onSuccess } = renderNewAtStep2();
    typeInto(programmeSelect(container), 'prog-b');
    finishStep3(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(insert.payload[0]).toMatchObject({ estado: 'borrador', horas_contratadas: 80 });
  });

  it('a licitación contract (programme set by the effect, select disabled) is filled too', () => {
    currentClient = createFakeSupabase();
    const { container } = renderNewAtStep2({
      preSelectedClientId: undefined,
      licitacionId: 'lic-1',
      licitacionData: { cliente_id: 'cliente-1', programa_id: 'prog-b', precio_total_uf: 100, tipo_moneda: 'UF' },
    });
    expect(programmeSelect(container)).toBeDisabled();
    expect(hours().value).toBe('80');
  });

  it('the manual branch shows the field with its own help text, empty for typing', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} preSelectedClientId="cliente-1" onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Contrato Manual/ }));
    clickButton('Siguiente');
    expect(hours().value).toBe('');
    expect(screen.getByText('Horas de la bolsa de este contrato (opcional).')).toBeInTheDocument();
    const dates = container.querySelectorAll('input[type="date"]');
    typeInto(dates[1], '2099-12-31');
    typeInto(screen.getByPlaceholderText(/Asesoría personalizada/), 'Asesoría inventada');
    typeInto(screen.getByPlaceholderText('0.00'), '100');
    typeInto(hours(), '30');
    finishStep3(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'insert');
    expect(insert.payload[0]).toMatchObject({ es_manual: true, horas_contratadas: 30 });
  });

  it.each(['1.234', '-1', '1000000', '1e7'])('refuses %s with the message and blocks «Siguiente»', (value) => {
    currentClient = createFakeSupabase();
    const { container } = renderNewAtStep2();
    typeInto(programmeSelect(container), 'prog-a');
    typeInto(hours(), value);
    expect(screen.getByText(HOURS_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('accepts 0 and 999999.99', () => {
    currentClient = createFakeSupabase();
    const { container } = renderNewAtStep2();
    typeInto(programmeSelect(container), 'prog-a');
    for (const value of ['0', '999999.99']) {
      typeInto(hours(), value);
      expect(screen.queryByText(HOURS_MESSAGE)).toBeNull();
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    }
  });

  it('an edit loads the stored value, does not replace it with the programme’s, and the update carries it', async () => {
    currentClient = createFakeSupabase({ allocations: [] });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} editingContract={editingContract()} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    await waitFor(() => expect(hours().readOnly).toBe(false));
    expect(hours().value).toBe('40');
    typeInto(programmeSelect(container), 'prog-b');
    expect(hours().value).toBe('40');
    typeInto(hours(), '45');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload.horas_contratadas).toBe(45);
    const allocationRead = currentClient.__reads.find((r: any) => r.table === 'contract_hour_allocations');
    expect(allocationRead.filters).toEqual({ contrato_id: 'contrato-1' });
  });

  it('an edit that empties the field writes null', async () => {
    currentClient = createFakeSupabase({ allocations: [] });
    const onSuccess = vi.fn();
    render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} editingContract={editingContract()} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    await waitFor(() => expect(hours().readOnly).toBe(false));
    typeInto(hours(), '');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).toHaveProperty('horas_contratadas', null);
  });

  it('with existing allocations the field is read-only and the update does not send the column', async () => {
    currentClient = createFakeSupabase({ allocations: [{ id: 'alloc-1' }] });
    const onSuccess = vi.fn();
    render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} editingContract={editingContract({ estado: 'activo' })} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    await screen.findByText('No se puede cambiar: el contrato ya tiene una distribución de horas.');
    expect(hours().readOnly).toBe(true);
    typeInto(hours(), '99');
    expect(hours().value).toBe('40');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).not.toHaveProperty('horas_contratadas');
  });

  it('an edit of a contract without stored hours is filled from its programme (no stored value was loaded)', async () => {
    currentClient = createFakeSupabase({ allocations: [] });
    render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} editingContract={editingContract({ horas_contratadas: null })} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    await waitFor(() => expect(hours().readOnly).toBe(false));
    expect(hours().value).toBe('120');
  });

  it('when the allocation read fails, the field stays read-only and the update does not send the column', async () => {
    currentClient = createFakeSupabase({ allocationsError: { message: 'read failed' } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSuccess = vi.fn();
    render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE as any]} editingContract={editingContract()} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    clickButton('Siguiente');
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Error reading contract hour allocations:', expect.anything()));
    expect(hours().readOnly).toBe(true);
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).not.toHaveProperty('horas_contratadas');
    errorSpy.mockRestore();
  });
});
