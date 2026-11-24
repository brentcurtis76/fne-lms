// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

/**
 * F22e, E4: the Clientes page refuses the filler RUT 11.111.111-1 as the
 * representative's RUT: a new client with it is refused, a real stored RUT
 * replaced by it is refused, and a client whose stored RUT already is the
 * filler still saves when that field is left as it is. The real page is
 * rendered (only the page frame, the router and the role lookup are mocked).
 * All data here is invented.
 */

type Row = Record<string, any>;

let storedClientes: Row[] = [];
let writes: Array<{ table: string; op: string; payload: any; filters: Row }> = [];

function makeFakeSupabase() {
  const from = (table: string) => {
    const ctx: { op: string; payload?: any; filters: Row; single: boolean } = { op: 'select', filters: {}, single: false };
    const resolve = () => {
      if (ctx.op !== 'select') {
        writes.push({ table, op: ctx.op, payload: ctx.payload, filters: { ...ctx.filters } });
        return { data: null, error: null };
      }
      if (table === 'clientes') {
        const rows = storedClientes.filter((r) =>
          Object.entries(ctx.filters).every(([k, v]) => (k.startsWith('neq:') ? r[k.slice(4)] !== v : r[k] === v)),
        );
        if (ctx.single) return { data: rows[0] ? { ...rows[0] } : null, error: null };
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      if (table === 'profiles') return { data: { id: 'admin-inventado' }, error: null };
      if (ctx.single) return { data: null, error: null };
      return { data: [], error: null };
    };
    const chain: any = {
      select: () => chain,
      order: () => chain,
      eq: (col: string, value: any) => {
        ctx.filters[col] = value;
        return chain;
      },
      neq: (col: string, value: any) => {
        ctx.filters[`neq:${col}`] = value;
        return chain;
      },
      single: () => {
        ctx.single = true;
        return chain;
      },
      maybeSingle: () => {
        ctx.single = true;
        return chain;
      },
      insert: (payload: any) => {
        ctx.op = 'insert';
        ctx.payload = payload;
        return chain;
      },
      update: (payload: any) => {
        ctx.op = 'update';
        ctx.payload = payload;
        return chain;
      },
      delete: () => {
        ctx.op = 'delete';
        return chain;
      },
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return chain;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-inventado' } } }) },
    from,
  };
}

const fakeClient = makeFakeSupabase();

vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => fakeClient }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn(), query: {} }) }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/utils/roleUtils', () => ({ getUserPrimaryRole: async () => 'admin' }));
vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import ClientsManagement from '../../../pages/admin/clients';
import { toast } from 'react-hot-toast';

const FILLER_SENTENCE = 'Ingresa el RUT real del representante legal; 11.111.111-1 no es válido.';

const baseCliente = {
  id: 'cli-1',
  nombre_legal: 'Fundación Escolar Inventada',
  nombre_fantasia: 'Colegio Inventado',
  rut: '76.123.456-0',
  direccion: 'Calle Falsa 123',
  comuna: 'Providencia',
  ciudad: 'Santiago',
  nombre_representante: 'Persona Inventada',
  fecha_escritura: '2020-01-02',
  nombre_notario: 'Notaría Inventada',
  schools: null,
};

// The client's RUT and the representative's RUT share the placeholder; the representative's is the second.
const repRutInput = () => screen.getAllByPlaceholderText('XX.XXX.XXX-X')[1];

async function openNewClient() {
  render(<ClientsManagement />);
  fireEvent.click(await screen.findByRole('button', { name: /Nuevo Cliente/ }));
  fireEvent.change(screen.getByPlaceholderText('Nombre legal de la organización'), { target: { value: 'Colegio Nuevo SpA' } });
  fireEvent.change(screen.getByPlaceholderText('Nombre comercial'), { target: { value: 'Colegio Nuevo' } });
  fireEvent.change(screen.getAllByPlaceholderText('XX.XXX.XXX-X')[0], { target: { value: '76.555.444-6' } });
  fireEvent.change(screen.getByPlaceholderText('Dirección completa'), { target: { value: 'Calle Nueva 1' } });
  fireEvent.change(screen.getAllByPlaceholderText('Nombre completo')[0], { target: { value: 'Persona Nueva' } });
}

async function openEdit(stored: Row) {
  storedClientes = [stored];
  render(<ClientsManagement />);
  fireEvent.click(await screen.findByTitle('Editar'));
  await screen.findByText(`Editar Cliente: ${stored.nombre_fantasia}`);
}

describe('Clientes — the filler representative RUT (F22e)', () => {
  beforeEach(() => {
    writes = [];
    storedClientes = [];
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('a new client with the filler is refused with the sentence and nothing is written', async () => {
    await openNewClient();
    fireEvent.change(repRutInput(), { target: { value: '11.111.111-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cliente' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FILLER_SENTENCE));
    expect(writes).toEqual([]);
  });

  it('a new client with a real RUT is created as before', async () => {
    await openNewClient();
    fireEvent.change(repRutInput(), { target: { value: '12.345.678-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Cliente' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cliente creado exitosamente'));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: 'clientes', op: 'insert' });
    expect(writes[0].payload.rut_representante).toBe('12.345.678-5');
  });

  it('a stored real RUT replaced by the filler is refused and nothing is written', async () => {
    await openEdit({ ...baseCliente, rut_representante: '12.345.678-5' });
    fireEvent.change(repRutInput(), { target: { value: '11111111-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FILLER_SENTENCE));
    expect(writes).toEqual([]);
  });

  it('a stored filler left untouched: the other changes save as before', async () => {
    await openEdit({ ...baseCliente, rut_representante: '11.111.111-1' });
    fireEvent.change(screen.getByPlaceholderText('Ciudad'), { target: { value: 'Valparaíso' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cliente actualizado exitosamente'));
    expect(toast.error).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: 'clientes', op: 'update', filters: { id: 'cli-1' } });
    expect(writes[0].payload).toMatchObject({ ciudad: 'Valparaíso', rut_representante: '11.111.111-1' });
  });

  it('a stored filler replaced by a real RUT saves', async () => {
    await openEdit({ ...baseCliente, rut_representante: '11.111.111-1' });
    fireEvent.change(repRutInput(), { target: { value: '12.345.678-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cliente actualizado exitosamente'));
    expect(writes[0].payload.rut_representante).toBe('12.345.678-5');
  });
});
