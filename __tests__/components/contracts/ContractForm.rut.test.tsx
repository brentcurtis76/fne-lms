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

/**
 * F21b (GES-3.11 and the importer's date, GES-3.6): a client's RUT is formatted
 * as it is typed and checked with utils/rutValidation.ts; every lookup by RUT
 * compares the formatted value, so «761234560» finds the client stored as
 * «76.123.456-0». An imported contract's new client gets no invented escritura
 * date: the form asks for it. Synthetic data only. (76.123.456-0 is a valid RUT;
 * 76.123.456-7 is not.)
 */
const RUT_INVALID = 'El RUT del cliente no es válido. Revise los números y el dígito verificador.';
const ASK_DATE = 'El PDF no indica la fecha de la escritura pública. Escríbala para crear el cliente.';
const clientRut = () => screen.getAllByPlaceholderText('12.345.678-9')[0] as HTMLInputElement;

const finishAndSave = (container: HTMLElement) => {
  clickButton('Siguiente');
  fillContractStep(container, { programaId: 'prog-a', total: 100 });
  clickButton('Siguiente');
  fillCuotaDates(container);
  typeInto(container.querySelector('[data-testid="cuota-amount-input"]') as Element, '100');
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ContractForm — the client RUT', () => {
  it('is formatted as it is typed', () => {
    currentClient = createFakeSupabase();
    render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    typeInto(clientRut(), '761234560');
    expect(clientRut()).toHaveValue('76.123.456-0');
  });

  it('«761234560» typed for a new contract finds the client stored as «76.123.456-0»: no second client', async () => {
    currentClient = createFakeSupabase({
      clienteByRut: { id: 'cliente-existente', nombre_legal: 'Colegio Inventado SpA', nombre_fantasia: 'X', ciudad: 'X', nombre_representante: 'Y' },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '761234560');
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__reads).toContainEqual({ table: 'clientes', filters: { rut: ['76.123.456-0', '76123456-0', '761234560'] } });
    expect(currentClient.__writes.filter((w: any) => w.table === 'clientes' && w.op === 'insert')).toHaveLength(0);
    expect(currentClient.__writes.find((w: any) => w.table === 'contratos').payload[0].cliente_id).toBe('cliente-existente');
    confirmSpy.mockRestore();
  });

  it('a brand-new client is inserted with the formatted RUT', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '76123456-0');
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'insert');
    expect(insert.payload[0].rut).toBe('76.123.456-0');
  });

  it('the draft path looks the client up by the formatted RUT', async () => {
    currentClient = createFakeSupabase({ clienteByRut: { id: 'cliente-existente' } });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '761234560');
    finishAndSave(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__reads).toContainEqual({ table: 'clientes', filters: { rut: ['76.123.456-0', '76123456-0', '761234560'] } });
    expect(currentClient.__writes.filter((w: any) => w.table === 'clientes')).toHaveLength(0);
  });

  it('an invalid check digit is refused with a plain sentence; nothing can be saved', () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '761234567');
    expect(clientRut()).toHaveValue('76.123.456-7');
    expect(screen.getByText(RUT_INVALID)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(currentClient.__writes).toHaveLength(0);

    typeInto(clientRut(), '76.123.456-0');
    expect(screen.queryByText(RUT_INVALID)).toBeNull();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });
});

describe('ContractForm — a contract imported from a PDF', () => {
  const STORED = {
    id: 'cliente-1',
    nombre_legal: 'Colegio Guardado SpA',
    nombre_fantasia: 'Colegio Guardado',
    rut: '76.123.456-0',
    direccion: 'Calle Guardada 1',
    comuna: 'Comuna',
    ciudad: 'Ciudad',
    nombre_representante: 'Persona Guardada',
    nombre_contacto_administrativo: 'Contacto Guardado',
    email_contacto_administrativo: 'guardado@ejemplo.test',
    school_id: null,
  };
  const extracted = (client: Record<string, unknown>) => ({
    contract: { numero_contrato: 'SYN-IMP-1', fecha_contrato: '2026-01-01', fecha_fin: '2026-12-31' },
    client: { nombre_legal: 'Colegio Importado SpA', ...client },
    financial: { precio_total: 100, moneda: 'UF' },
    payment_schedule: [{ numero_cuota: 1, fecha_vencimiento: '2026-06-30', monto: 100 }],
    overall_confidence: 0.9,
  });

  it('a PDF RUT «761234560» finds the client stored as «76.123.456-0»', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[STORED as any]}
        extractedData={extracted({ rut: '761234560' })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('cliente-1');
    expect(screen.getByPlaceholderText('Nombre legal de la empresa')).toHaveValue('Colegio Guardado SpA');
  });

  it('a new client without an escritura date in the PDF: the form asks for it and invents none', async () => {
    currentClient = createFakeSupabase({ clienteByRut: null });
    const onSuccess = vi.fn();
    const { container } = render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[]}
        extractedData={extracted({
          rut: '761234560',
          nombre_contacto: 'Contacto Importado',
          email_contacto: 'importado@ejemplo.test',
          // F22e: a new client needs the representative's real RUT (no filler default any more)
          rut_representante: '12.345.678-5',
        })}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );
    expect(clientRut()).toHaveValue('76.123.456-0');
    expect(screen.getByText(ASK_DATE)).toBeInTheDocument();
    const fecha = screen.getByTestId('client-fecha-escritura-input') as HTMLInputElement;
    expect(fecha.value).toBe('');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    typeInto(fecha, '2019-03-04');
    expect(screen.queryByText(ASK_DATE)).toBeNull();
    clickButton('Siguiente');
    clickButton('Siguiente');
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const insert = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'insert');
    expect(insert.payload[0].fecha_escritura).toBe('2019-03-04');
    expect(insert.payload[0].rut).toBe('76.123.456-0');
  });

  it('a date the PDF gives is kept', () => {
    currentClient = createFakeSupabase();
    render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[]}
        extractedData={extracted({ rut: '761234560', fecha_escritura: '2018-05-06' })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText(ASK_DATE)).toBeNull();
  });
});

/**
 * F21b send-back 2: a client is found by RUT however the STORED value is
 * written; no second client is inserted and no stored row is rewritten.
 */
describe('ContractForm — the client found by RUT whatever its stored spelling', () => {
  const stored = (rut: string) => ({ id: 'cliente-guardado', rut, nombre_legal: 'Colegio Guardado SpA', nombre_fantasia: 'X', ciudad: 'X', nombre_representante: 'Y' });

  it.each(['761234560', '76123456-0'])('full save: a client stored as «%s» is found when «76.123.456-0» is typed', async (storedRut) => {
    currentClient = createFakeSupabase({ clientesStored: [stored(storedRut)] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '76.123.456-0');
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalled();
    expect(currentClient.__writes.filter((w: any) => w.table === 'clientes')).toHaveLength(0);
    expect(currentClient.__writes.find((w: any) => w.table === 'contratos').payload[0].cliente_id).toBe('cliente-guardado');
  });

  it.each(['761234560', '76123456-0'])('draft save: a client stored as «%s» is found when «76.123.456-0» is typed', async (storedRut) => {
    currentClient = createFakeSupabase({ clientesStored: [stored(storedRut)] });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '76.123.456-0');
    finishAndSave(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__writes.filter((w: any) => w.table === 'clientes')).toHaveLength(0);
    expect(currentClient.__writes.find((w: any) => w.table === 'contratos').payload[0].cliente_id).toBe('cliente-guardado');
  });

  it('a K check letter: «12.345.670-K» typed finds the client stored «12345670-k»', async () => {
    currentClient = createFakeSupabase({ clientesStored: [stored('12345670-k')] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    typeInto(clientRut(), '12.345.670-K');
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__writes.filter((w: any) => w.table === 'clientes')).toHaveLength(0);
  });

  it('nothing stored under any spelling: one new client is inserted, as before', async () => {
    currentClient = createFakeSupabase({ clientesStored: [stored('99.999.999-9')] });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(currentClient.__writes.filter((w: any) => w.table === 'clientes' && w.op === 'insert')).toHaveLength(1);
  });

  it('the PDF import matches a client stored «761234560» from a PDF RUT «76.123.456-0»', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[{ ...stored('761234560'), id: 'cliente-1' } as any]}
        extractedData={{
          contract: { numero_contrato: 'SYN-IMP-2', fecha_contrato: '2026-01-01' },
          client: { nombre_legal: 'Colegio Importado SpA', rut: '76.123.456-0' },
          financial: { precio_total: 100, moneda: 'UF' },
        }}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('cliente-1');
  });
});

/**
 * F21b send-back 3: two stored rows of the same client — the OLDER one is taken
 * everywhere (earliest created_at, then the smaller id), never the one that
 * comes first by name or by the order the rows arrive in.
 */
describe('ContractForm — two stored rows of one client: the older is taken', () => {
  const OLDER = { id: 'cliente-viejo', rut: '761234560', nombre_legal: 'Zeta SpA', nombre_fantasia: 'Z', ciudad: 'X', nombre_representante: 'Y', created_at: '2026-01-01T00:00:00Z' };
  const NEWER = { id: 'cliente-nuevo-dup', rut: '76.123.456-0', nombre_legal: 'Alfa SpA', nombre_fantasia: 'A', ciudad: 'X', nombre_representante: 'Y', created_at: '2026-02-01T00:00:00Z' };
  const contratoClient = () => currentClient.__writes.find((w: any) => w.table === 'contratos').payload[0].cliente_id;

  it('full save: the newer row arrives first, the older is used', async () => {
    currentClient = createFakeSupabase({ clientesStored: [NEWER, OLDER] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(contratoClient()).toBe('cliente-viejo');
  });

  it('draft save: the older is used', async () => {
    currentClient = createFakeSupabase({ clientesStored: [NEWER, OLDER] });
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    finishAndSave(container);
    clickButton(/Guardar Borrador/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(contratoClient()).toBe('cliente-viejo');
  });

  it.each([
    [['b-id', 'a-id']],
    [['a-id', 'b-id']],
  ])('equal created_at (ids in order %j): the smaller id, every time', async (ids) => {
    const same = '2026-01-01T00:00:00Z';
    currentClient = createFakeSupabase({
      clientesStored: ids.map((id) => ({ ...OLDER, id, created_at: same })),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSuccess = vi.fn();
    const { container } = render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
    fillNewClientStep();
    finishAndSave(container);
    clickButton(/Guardar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(contratoClient()).toBe('a-id');
  });

  it('the PDF import match in the list the page holds (ordered by name): the older is selected', () => {
    currentClient = createFakeSupabase();
    const { container } = render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[NEWER as any, OLDER as any]}
        extractedData={{
          contract: { numero_contrato: 'SYN-IMP-3', fecha_contrato: '2026-01-01' },
          client: { nombre_legal: 'Colegio Importado SpA', rut: '76.123.456-0' },
          financial: { precio_total: 100, moneda: 'UF' },
        }}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('cliente-viejo');
  });
});
