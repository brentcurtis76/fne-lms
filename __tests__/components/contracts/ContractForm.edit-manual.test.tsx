// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

(globalThis as any).React = React;

import { createFakeSupabase, CLIENT_COLUMNS_SORTED, PROGRAMAS, clickButton } from './contract-form-harness';

let currentClient: any;
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import ContractForm from '../../../components/contracts/ContractForm';

/**
 * F10b (GES-2.8 with GES-3.1): a manual or imported contract opens for editing
 * as what it is, and an edit keeps the client's school link. Before the fix the
 * edit effect never set esManual nor selectedSchoolId: the form opened as a
 * programme contract and the client update wrote school_id null.
 */
const client = (overrides: Record<string, any> = {}) => ({
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
  comuna_notaria: '',
  nombre_encargado_proyecto: '',
  telefono_encargado_proyecto: '',
  email_encargado_proyecto: '',
  nombre_contacto_administrativo: 'Contacto Inventado',
  telefono_contacto_administrativo: '',
  email_contacto_administrativo: 'contacto@ejemplo.test',
  school_id: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const contract = (overrides: Record<string, any> = {}) => ({
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
  horas_contratadas: null,
  clientes: client(),
  programas: PROGRAMAS[0],
  cuotas: [{ id: 'cuota-1', numero_cuota: 1, fecha_vencimiento: '2026-06-30', monto_uf: 100 }],
  ...overrides,
});

const manualCheckbox = () => screen.getByRole('checkbox', { name: /Contrato Manual/ }) as HTMLInputElement;

describe('ContractForm — editing a manual or imported contract', () => {
  it('opens as manual, shows the description and saves es_manual true with its description', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = contract({
      es_manual: true,
      programa_id: null,
      programas: null,
      descripcion_manual: 'Contrato importado desde PDF - FNE-2026-11-123',
      contrato_url: 'contratos/importado-sintetico.pdf',
    });
    render(<ContractForm programas={PROGRAMAS} clientes={[editing.clientes]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />);

    expect(manualCheckbox().checked).toBe(true);
    expect(manualCheckbox()).toBeDisabled();

    clickButton('Siguiente');
    expect(screen.getByDisplayValue('Contrato importado desde PDF - FNE-2026-11-123')).toBeInTheDocument();
    expect(screen.queryByText('Programa Contratado *')).toBeNull();

    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).toMatchObject({
      es_manual: true,
      descripcion_manual: 'Contrato importado desde PDF - FNE-2026-11-123',
      programa_id: null,
      // the stored PDF of an imported contract stays attached
      contrato_url: 'contratos/importado-sintetico.pdf',
    });
  });

  it('a programme contract still opens and saves as a programme contract', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = contract();
    render(<ContractForm programas={PROGRAMAS} clientes={[editing.clientes]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />);

    expect(manualCheckbox().checked).toBe(false);
    expect(manualCheckbox()).toBeDisabled();
    clickButton('Siguiente');
    expect(screen.getByText('Programa Contratado *')).toBeInTheDocument();
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const update = currentClient.__writes.find((w: any) => w.table === 'contratos' && w.op === 'update');
    expect(update.payload).toMatchObject({ es_manual: false, descripcion_manual: null, programa_id: 'prog-a' });
  });

  it('keeps the client’s school link on edit', async () => {
    currentClient = createFakeSupabase();
    const onSuccess = vi.fn();
    const editing = contract({ clientes: client({ school_id: 7 }) });
    render(<ContractForm programas={PROGRAMAS} clientes={[editing.clientes]} editingContract={editing} onSuccess={onSuccess} onCancel={vi.fn()} />);

    clickButton('Siguiente');
    clickButton('Siguiente');
    clickButton(/Actualizar Contrato/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const clientUpdate = currentClient.__writes.find((w: any) => w.table === 'clientes' && w.op === 'update');
    expect(clientUpdate.payload.school_id).toBe(7);
    expect(clientUpdate.filters.id).toBe('cliente-1');
    // GES-2.1: the edit update carries only clientes columns
    expect(Object.keys(clientUpdate.payload).sort()).toEqual(CLIENT_COLUMNS_SORTED);
    const schoolLink = currentClient.__writes.find((w: any) => w.table === 'schools' && w.op === 'update');
    expect(schoolLink).toMatchObject({ payload: { cliente_id: 'cliente-1' }, filters: { id: 7 } });
  });

  it('a NEW contract can still be ticked manual', () => {
    currentClient = createFakeSupabase();
    render(<ContractForm programas={PROGRAMAS} clientes={[]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(manualCheckbox()).toBeEnabled();
    fireEvent.click(manualCheckbox());
    expect(manualCheckbox().checked).toBe(true);
  });

  it('the PDF import still forces manual', () => {
    currentClient = createFakeSupabase();
    render(
      <ContractForm
        programas={PROGRAMAS}
        clientes={[]}
        extractedData={{ contract: { numero_contrato: 'IMP-1' }, client: { nombre_legal: 'Colegio Inventado SpA' }, financial: {} }}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(manualCheckbox().checked).toBe(true);
  });
});
