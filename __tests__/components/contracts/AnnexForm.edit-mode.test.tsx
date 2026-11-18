// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// AnnexForm uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

/**
 * F10a (GES-2.9): an annex opened for editing stays on its own parent (no
 * «Anterior» from the «anexo» step back to the client and contract choice),
 * and a save with a cuota that lacks a date or an amount above zero is
 * refused with a message and writes nothing. Before, that cuota was dropped
 * silently and, when editing, its stored row was deleted (even one with an
 * invoice). Fake Supabase client records every write. Invented data only.
 */

type Row = Record<string, any>;

let contratoRows: Row[] = [];
let cuotaRows: Row[] = [];
let writes: Array<{ table: string; op: 'insert' | 'update' | 'delete'; payload: any; filters: Record<string, any> }> = [];

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
        writes.push({ table, op: ctx.op, payload: ctx.payload, filters: { ...ctx.filters } });
        if (ctx.op === 'insert' && table === 'contratos') {
          return { data: { id: 'new-annex', ...ctx.payload[0] }, error: null };
        }
        return { data: null, error: null };
      }
      if (table === 'contratos') {
        let rows = contratoRows.filter((r) =>
          Object.entries(ctx.filters).every(([k, v]) => r[k] === v)
        );
        if (ctx.order) {
          const { col, ascending } = ctx.order;
          rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (ascending ? 1 : -1));
        }
        if (ctx.limit !== undefined) rows = rows.slice(0, ctx.limit);
        if (ctx.single) return { data: rows[0] ? { ...rows[0] } : null, error: rows[0] ? null : { message: 'not found' } };
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      if (table === 'cuotas') {
        const rows = cuotaRows.filter((r) =>
          Object.entries(ctx.filters).every(([k, v]) => r[k] === v)
        );
        return { data: rows.map((r) => ({ id: r.id })), error: null };
      }
      return { data: [], error: null };
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
      eq: (col: string, value: any) => {
        ctx.filters[col] = value;
        return chain;
      },
      in: (col: string, values: any[]) => {
        ctx.filters[col] = values;
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
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
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
import { toast } from 'react-hot-toast';

import AnnexForm from '../../../components/contracts/AnnexForm';

const cliente = {
  id: 'cli-1',
  nombre_legal: 'Fundación Escolar Inventada',
  nombre_fantasia: 'Colegio Inventado',
  rut: '11.111.111-1',
  direccion: 'Calle Falsa 123',
  comuna: 'Providencia',
  ciudad: 'Santiago',
  nombre_representante: 'Persona Inventada',
};

const programmeContract = {
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
};

const manualContract = {
  ...programmeContract,
  id: 'ctr-manual',
  numero_contrato: 'C-200',
  programa_id: null,
  es_manual: true,
  descripcion_manual: 'Asesoría acordada a mano',
  programas: null,
};

const manualNoDescription = {
  ...manualContract,
  id: 'ctr-manual-2',
  numero_contrato: 'C-300',
  descripcion_manual: null,
};

const EDIT_REFUSAL = 'La cuota 2 necesita fecha y un monto mayor que cero.';

const editingAnnex = {
  id: 'anx-1',
  is_anexo: true,
  parent_contrato_id: 'ctr-manual',
  anexo_numero: 1,
  anexo_fecha: '2026-04-01',
  numero_participantes: 3,
  nombre_ciclo: 'Segundo Ciclo',
  precio_total_uf: 30,
  tipo_moneda: 'UF',
  cuotas: [
    // The first cuota carries an invoice; reconciling by id must keep it.
    { id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-12-01', monto_uf: 20, factura_url: 'facturas/q1.pdf' },
    { id: 'q2', numero_cuota: 2, fecha_vencimiento: '2027-01-01', monto_uf: 10 },
  ],
};

function renderEdit() {
  return render(
    <AnnexForm clientes={[cliente as any]} editingAnnex={editingAnnex} onSuccess={vi.fn()} onCancel={vi.fn()} />
  );
}

/** Edit mode: wait for the parent, optionally set the price, go to «Cuotas». */
async function editToCuotas(price?: string) {
  const view = renderEdit();
  await screen.findByText('Detalles del Anexo para C-200');
  if (price !== undefined) {
    const [, precio] = screen.getAllByRole('spinbutton');
    fireEvent.change(precio, { target: { value: price } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Configurar Cuotas');
  return view;
}

/** The save has answered: either an error or a success toast. */
async function waitForSaveOutcome() {
  await waitFor(() =>
    expect(vi.mocked(toast.error).mock.calls.length + vi.mocked(toast.success).mock.calls.length).toBeGreaterThan(0)
  );
}

describe('AnnexForm — editing an annex (GES-2.9)', () => {
  beforeEach(() => {
    writes = [];
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    contratoRows = [manualContract];
    cuotaRows = [
      { id: 'q1', contrato_id: 'anx-1' },
      { id: 'q2', contrato_id: 'anx-1' },
    ];
  });

  it('the «anexo» step offers no «Anterior» back to the client or contract choice', async () => {
    renderEdit();
    await screen.findByText('Detalles del Anexo para C-200');
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
  });

  it('a cuota without a date is refused and nothing is written', async () => {
    const { container } = await editToCuotas('20');
    const dates = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[1], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar Anexo/ }));

    await waitForSaveOutcome();
    expect(writes).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(EDIT_REFUSAL);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a cuota with an amount that is not above zero is refused and nothing is written', async () => {
    await editToCuotas('20');
    const montos = screen.getAllByRole('spinbutton');
    fireEvent.change(montos[1], { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar Anexo/ }));

    await waitForSaveOutcome();
    expect(writes).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(EDIT_REFUSAL);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a complete edit still reconciles the cuotas by id: updates in place, deletes nothing', async () => {
    const { container } = await editToCuotas();
    fireEvent.change(container.querySelectorAll('input[type="date"]')[1], { target: { value: '2027-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Actualizar Anexo/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Anexo actualizado exitosamente'));
    expect(writes.map((w) => `${w.table}:${w.op}:${w.filters.id ?? ''}`)).toEqual([
      'contratos:update:anx-1',
      'cuotas:update:q1',
      'cuotas:update:q2',
    ]);
    expect(writes[2].payload).toEqual({ numero_cuota: 2, fecha_vencimiento: '2027-02-01', monto_uf: 10 });
  });

  it('a new annex with an incomplete cuota is refused too and nothing is written', async () => {
    const { container } = render(<AnnexForm clientes={[cliente as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Fundación Escolar Inventada'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(await screen.findByText('C-200'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const [, precio] = screen.getAllByRole('spinbutton');
    fireEvent.change(precio, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar Cuota/ }));
    fireEvent.click(screen.getByRole('button', { name: /Crear Anexo/ }));

    await waitForSaveOutcome();
    expect(writes).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(EDIT_REFUSAL);
  });
});
