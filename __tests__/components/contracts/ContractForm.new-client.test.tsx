// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/**
 * F21b send-back 2: for an existing client, a field this form REQUIRES to go on
 * and that the stored client has EMPTY stays editable, with the line «Los datos
 * que faltan en la ficha del cliente se guardarán en ella.»; on save only those
 * fields are written to the client, each only where it is still empty. Every
 * field with a stored value stays read-only and is not written.
 */
describe('ContractForm — a required field the existing client lacks', () => {
  const FILL_LINE = 'Los datos que faltan en la ficha del cliente se guardarán en ella.';
  const SIN_EMAIL = {
    id: 'cliente-1',
    nombre_legal: 'Colegio Existente SpA',
    nombre_fantasia: 'Colegio Existente',
    rut: '76.123.456-0',
    direccion: 'Calle Existente 1',
    comuna: 'Comuna Existente',
    ciudad: 'Ciudad Existente',
    nombre_representante: 'Persona Existente',
    nombre_contacto_administrativo: 'Contacto Existente',
    email_contacto_administrativo: null,
    school_id: null,
  };
  const clientSelect = (container: HTMLElement) => container.querySelector('select') as HTMLSelectElement;
  const email = () => screen.getByPlaceholderText('administracion@colegio.cl') as HTMLInputElement;

  it('manual contract, client without a contact e-mail: only that field is editable; the save writes it and nothing else', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[SIN_EMAIL as any]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    typeInto(clientSelect(container), 'cliente-1');
    fireEvent.click(screen.getByRole('checkbox', { name: /Contrato Manual/ }));
    expect(email().readOnly).toBe(false);
    for (const placeholder of ['Nombre legal de la empresa', 'Nombre comercial', 'Calle y número', 'Comuna', 'Ciudad', 'Nombre del representante']) {
      expect((screen.getByPlaceholderText(placeholder) as HTMLInputElement).readOnly).toBe(true);
    }
    expect((screen.getAllByPlaceholderText('12.345.678-9')[0] as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getAllByPlaceholderText('Nombre completo').at(-1) as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText(FILL_LINE)).toBeInTheDocument();
    expect(screen.getByText('Para corregir los datos del cliente, use Clientes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    typeInto(email(), 'facturacion@ejemplo.test');
    clickButton('Siguiente');
    typeInto(container.querySelectorAll('input[type="date"]')[1], '2099-12-31');
    typeInto(screen.getByPlaceholderText(/Asesoría personalizada/), 'Asesoría inventada');
    typeInto(screen.getByPlaceholderText('0.00'), '100');
    clickButton('Siguiente');
    fillCuotaDates(container);
    typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const clientWrites = currentClient.__writes.filter((w: any) => w.table === 'clientes');
    expect(clientWrites).toHaveLength(1);
    expect(clientWrites[0].op).toBe('update');
    expect(clientWrites[0].payload).toEqual({ email_contacto_administrativo: 'facturacion@ejemplo.test' });
    // conditional on the exact stored value the form read: null (send-back 3)
    expect(clientWrites[0].filters).toEqual({ id: 'cliente-1', 'email_contacto_administrativo.is': null });
    expect(currentClient.__writes.find((w: any) => w.table === 'contratos').payload[0].cliente_id).toBe('cliente-1');
  });

  it('programme contract, client without comuna: comuna is editable and is the only field written', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[{ ...SIN_EMAIL, comuna: '' } as any]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    typeInto(clientSelect(container), 'cliente-1');
    expect((screen.getByPlaceholderText('Comuna') as HTMLInputElement).readOnly).toBe(false);
    expect((screen.getByPlaceholderText('Ciudad') as HTMLInputElement).readOnly).toBe(true);
    // the e-mail is not required for a programme contract: it stays read-only even though empty
    expect(email().readOnly).toBe(true);
    expect(screen.getByText(FILL_LINE)).toBeInTheDocument();
    typeInto(screen.getByPlaceholderText('Comuna'), 'Comuna Completada');
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    fillCuotaDates(container);
    typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const clientWrites = currentClient.__writes.filter((w: any) => w.table === 'clientes');
    expect(clientWrites.map((w: any) => w.payload)).toEqual([{ comuna: 'Comuna Completada' }]);
  });

  it('the draft save writes the filled field the same way', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[{ ...SIN_EMAIL, comuna: '' } as any]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    typeInto(clientSelect(container), 'cliente-1');
    typeInto(screen.getByPlaceholderText('Comuna'), 'Comuna Completada');
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    fillCuotaDates(container);
    typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const clientWrites = currentClient.__writes.filter((w: any) => w.table === 'clientes');
    expect(clientWrites).toHaveLength(1);
    expect(clientWrites[0]).toMatchObject({ op: 'update', payload: { comuna: 'Comuna Completada' }, filters: { id: 'cliente-1', comuna: '' } });
  });

  it('a client that has everything: no fill line, all read-only', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[{ ...SIN_EMAIL, email_contacto_administrativo: 'a@ejemplo.test' } as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />,
    );
    typeInto(clientSelect(container), 'cliente-1');
    fireEvent.click(screen.getByRole('checkbox', { name: /Contrato Manual/ }));
    expect(screen.queryByText(FILL_LINE)).toBeNull();
    expect(email().readOnly).toBe(true);
  });
});

/**
 * F21b send-back 3: "empty" is the same when the field is offered and when it is
 * written (null, '' or only spaces); the write is conditional on the exact stored
 * value the form read; when it changes no row, the contract is still saved and
 * the admin is told which fields were not completed.
 */
describe('ContractForm — a blank field is blank when read and when written', () => {
  const CLIENTE_ESPACIOS = {
    id: 'cliente-1',
    nombre_legal: 'Colegio Existente SpA',
    nombre_fantasia: 'Colegio Existente',
    rut: '76.123.456-0',
    direccion: 'Calle Existente 1',
    comuna: '   ',
    ciudad: 'Ciudad Existente',
    nombre_representante: 'Persona Existente',
    school_id: null,
  };
  const NOT_FILLED = 'El contrato se guardó, pero no se pudo completar la comuna en la ficha del cliente. Corríjalo en Clientes.';

  const saveWithComuna = async (options: Record<string, unknown>) => {
    currentClient = createFakeSupabase(options as any);
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm programas={PROGRAMAS} clientes={[CLIENTE_ESPACIOS as any]} onSuccess={onSuccess} onCancel={vi.fn()} />,
    );
    typeInto(container.querySelector('select') as Element, 'cliente-1');
    const comuna = screen.getByPlaceholderText('Comuna') as HTMLInputElement;
    expect(comuna.readOnly).toBe(false);
    typeInto(comuna, 'Santiago');
    clickButton('Siguiente');
    fillContractStep(container, { programaId: 'prog-a', total: 100 });
    clickButton('Siguiente');
    fillCuotaDates(container);
    typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    return currentClient.__writes;
  };

  it('a stored comuna of three spaces is editable and «Santiago» is written over exactly those spaces', async () => {
    const writes = await saveWithComuna({});
    const clientWrites = writes.filter((w: any) => w.table === 'clientes');
    expect(clientWrites).toHaveLength(1);
    expect(clientWrites[0]).toMatchObject({ op: 'update', payload: { comuna: 'Santiago' }, filters: { id: 'cliente-1', comuna: '   ' } });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('another admin filled the field meanwhile: not overwritten, the contract is saved, the sentence is shown', async () => {
    const writes = await saveWithComuna({ clienteUpdateNoRows: true });
    expect(writes.filter((w: any) => w.table === 'contratos' && w.op === 'insert')).toHaveLength(1);
    expect(writes.filter((w: any) => w.table === 'cuotas' && w.op === 'insert')).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith(NOT_FILLED);
  });
});

