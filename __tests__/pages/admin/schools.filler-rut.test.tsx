// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

/**
 * F22e, E4: the client form of the Escuelas page («Editar cliente») refuses
 * the filler RUT 11.111.111-1 when it replaces a real stored representative's
 * RUT, and still saves a client whose stored RUT already is the filler when
 * that field is left as it is. The real page is rendered (only the page frame,
 * the router and the role lookup are mocked). All data here is invented.
 */

type Row = Record<string, any>;

let storedCliente: Row = {};
let writes: Array<{ table: string; op: string; payload: any; filters: Row }> = [];

const SCHOOL = {
  id: 7,
  name: 'Escuela Inventada',
  has_generations: false,
  cliente_id: 'cli-1',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  generations: [],
};

function makeFakeSupabase() {
  const from = (table: string) => {
    const ctx: { op: string; payload?: any; filters: Row; single: boolean } = { op: 'select', filters: {}, single: false };
    const resolve = () => {
      if (ctx.op !== 'select') {
        writes.push({ table, op: ctx.op, payload: ctx.payload, filters: { ...ctx.filters } });
        return { data: null, error: null };
      }
      if (table === 'profiles') return { data: { id: 'admin-inventado' }, error: null };
      if (table === 'schools') return { data: [{ ...SCHOOL }], error: null };
      if (table === 'clientes') {
        if (ctx.single && ctx.filters.id === storedCliente.id) return { data: { ...storedCliente }, error: null };
        if (ctx.single) return { data: null, error: null };
        return { data: [{ ...storedCliente }], error: null };
      }
      if (ctx.single) return { data: null, error: null };
      return { data: [], error: null };
    };
    const chain: any = {
      select: () => chain,
      order: () => chain,
      not: () => chain,
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
    rpc: async () => ({ data: [], error: null }),
  };
}

const fakeClient = makeFakeSupabase();

vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => fakeClient }));
vi.mock('@/lib/supabase', () => ({ supabase: fakeClient }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn(), query: {} }) }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/utils/roleUtils', () => ({ getUserPrimaryRole: async () => 'admin' }));
vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import SchoolsManagement from '../../../pages/admin/schools';
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
};

// The client's RUT and the representative's RUT share the placeholder; the representative's is the second.
const repRutInput = () => screen.getAllByPlaceholderText('XX.XXX.XXX-X')[1];

async function openEdit(stored: Row) {
  storedCliente = stored;
  render(<SchoolsManagement />);
  fireEvent.click(await screen.findByTitle('Editar cliente'));
  await screen.findByText(`Editar Cliente: ${stored.nombre_fantasia}`);
}

describe('Escuelas, «Editar cliente» — the filler representative RUT (F22e)', () => {
  beforeEach(() => {
    writes = [];
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('a stored real RUT replaced by the filler is refused and nothing is written', async () => {
    await openEdit({ ...baseCliente, rut_representante: '12.345.678-5' });
    fireEvent.change(repRutInput(), { target: { value: '11.111.111-1' } });
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
    const clientWrites = writes.filter((w) => w.table === 'clientes');
    expect(clientWrites).toHaveLength(1);
    expect(clientWrites[0]).toMatchObject({ op: 'update', filters: { id: 'cli-1' } });
    expect(clientWrites[0].payload).toMatchObject({ ciudad: 'Valparaíso', rut_representante: '11.111.111-1' });
  });

  it('a stored real RUT changed to another real RUT saves', async () => {
    await openEdit({ ...baseCliente, rut_representante: '12.345.678-5' });
    fireEvent.change(repRutInput(), { target: { value: '76.555.444-6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cliente actualizado exitosamente'));
    expect(writes.find((w) => w.table === 'clientes')!.payload.rut_representante).toBe('76.555.444-6');
  });
});
