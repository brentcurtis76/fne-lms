// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).React = React;

/**
 * F22e, E3: no annex for a contract whose client still has the filler RUT
 * 11.111.111-1 as its stored representative's RUT. The refusal is the form's
 * toast and nothing is written. A client with a real RUT gets its annex as
 * before. All data here is invented.
 */

type Row = Record<string, any>;

let contratoRows: Row[] = [];
let clienteRows: Row[] = [];
let writes: Array<{ table: string; op: 'insert' | 'update' | 'delete'; payload: any }> = [];
let reads: Array<{ table: string; filters: Row }> = [];

function makeFakeSupabase() {
  const from = (table: string) => {
    const ctx: {
      op: 'select' | 'insert' | 'update' | 'delete';
      payload?: any;
      filters: Record<string, any>;
      order?: { col: string; ascending: boolean };
      limit?: number;
      single?: boolean;
    } = { op: 'select', filters: {} };
    const resolve = () => {
      if (ctx.op !== 'select') {
        writes.push({ table, op: ctx.op, payload: ctx.payload });
        if (ctx.op === 'insert' && table === 'contratos') {
          return { data: { id: 'new-annex', ...ctx.payload[0] }, error: null };
        }
        return { data: null, error: null };
      }
      reads.push({ table, filters: { ...ctx.filters } });
      const source = table === 'contratos' ? contratoRows : table === 'clientes' ? clienteRows : [];
      let rows = source.filter((r) => Object.entries(ctx.filters).every(([k, v]) => r[k] === v));
      if (ctx.order) {
        const { col, ascending } = ctx.order;
        rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (ascending ? 1 : -1));
      }
      if (ctx.limit !== undefined) rows = rows.slice(0, ctx.limit);
      if (ctx.single) return { data: rows[0] ? { ...rows[0] } : null, error: rows[0] ? null : { message: 'not found' } };
      return { data: rows.map((r) => ({ ...r })), error: null };
    };
    const chain: any = {
      select: () => chain,
      order: (col: string, opts?: { ascending?: boolean }) => {
        ctx.order = { col, ascending: opts?.ascending !== false };
        return chain;
      },
      limit: (n: number) => {
        ctx.limit = n;
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
      eq: (col: string, value: any) => {
        ctx.filters[col] = value;
        return chain;
      },
      in: () => chain,
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
  return { from };
}

const fakeClient = makeFakeSupabase();

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => fakeClient,
}));
vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import AnnexForm from '../../../components/contracts/AnnexForm';
import { toast } from 'react-hot-toast';

const ANNEX_SENTENCE =
  'Este cliente aún no tiene el RUT de su representante legal. Complétalo en Clientes antes de crear el anexo.';

const clienteBase = {
  id: 'cli-1',
  nombre_legal: 'Fundación Escolar Inventada',
  nombre_fantasia: 'Colegio Inventado',
  rut: '76.123.456-0',
  direccion: 'Calle Falsa 123',
  comuna: 'Providencia',
  ciudad: 'Santiago',
  nombre_representante: 'Persona Inventada',
};

const contractOf = (cliente: Row) => ({
  id: 'ctr-prog',
  numero_contrato: 'C-100',
  fecha_contrato: '2026-03-01',
  cliente_id: 'cli-1',
  programa_id: 'prog-1',
  precio_total_uf: 120,
  tipo_moneda: 'UF',
  is_anexo: false,
  es_manual: false,
  descripcion_manual: null,
  clientes: cliente,
  programas: { id: 'prog-1', nombre: 'Programa de Prueba', descripcion: '', horas_totales: 10, modalidad: 'presencial' },
});

async function createAnnex(cliente: Row) {
  const { container } = render(<AnnexForm clientes={[cliente as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByText('Fundación Escolar Inventada'));
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  fireEvent.click(await screen.findByText('C-100'));
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  const [participantes, precio] = screen.getAllByRole('spinbutton');
  fireEvent.change(participantes, { target: { value: '4' } });
  fireEvent.change(precio, { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-01' } });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: /Crear Anexo/ }));
}

describe('AnnexForm — a client that still has the filler RUT (F22e)', () => {
  beforeEach(() => {
    writes = [];
    reads = [];
    clienteRows = [];
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it.each(['11.111.111-1', '11111111-1'])('stored representative RUT %j: refused with the annex sentence, nothing written', async (filler) => {
    const cliente = { ...clienteBase, rut_representante: filler };
    contratoRows = [contractOf(cliente)];
    await createAnnex(cliente);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ANNEX_SENTENCE));
    expect(writes).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a real stored representative RUT: the annex and its cuota are saved as before', async () => {
    const cliente = { ...clienteBase, rut_representante: '12.345.678-5' };
    contratoRows = [contractOf(cliente)];
    await createAnnex(cliente);
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes.map((w) => `${w.op}:${w.table}`)).toEqual(['insert:contratos', 'insert:cuotas']);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('the joined client row lacks the column: that one column is read, and a filler there is refused', async () => {
    contratoRows = [contractOf(clienteBase)];
    clienteRows = [{ id: 'cli-1', rut_representante: '11.111.111-1' }];
    await createAnnex(clienteBase);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(ANNEX_SENTENCE));
    expect(reads.some((r) => r.table === 'clientes' && r.filters.id === 'cli-1')).toBe(true);
    expect(writes).toEqual([]);
  });
});
