// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// AnnexForm uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

/**
 * F10a (GES-2.5): step 2 of «Nuevo Anexo» lists the chosen client's contracts.
 * A manual or imported contract has no programme (programa_id null, so the
 * joined `programas` is null); the list used to read `programas.nombre` and
 * the page went blank. Such a contract is now listed by its description.
 * All data here is invented.
 */

type Row = Record<string, any>;

let contratoRows: Row[] = [];
let writes: Array<{ table: string; op: 'insert' | 'update' | 'delete'; payload: any }> = [];

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

async function goToStep2() {
  const view = render(<AnnexForm clientes={[cliente as any]} onSuccess={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByText('Fundación Escolar Inventada'));
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  return view;
}

describe('AnnexForm — contract list of step 2 (GES-2.5)', () => {
  beforeEach(() => {
    writes = [];
    contratoRows = [
      programmeContract,
      manualContract,
      manualNoDescription,
      // Two earlier annexes of the manual contract: the next one is number 3.
      { id: 'anx-1', is_anexo: true, parent_contrato_id: 'ctr-manual', anexo_numero: 1 },
      { id: 'anx-2', is_anexo: true, parent_contrato_id: 'ctr-manual', anexo_numero: 2 },
    ];
  });

  it('lists a manual contract by its description and does not throw', async () => {
    await goToStep2();
    expect(await screen.findByText('C-200')).toBeInTheDocument();
    expect(screen.getByText('Asesoría acordada a mano')).toBeInTheDocument();
  });

  it('a manual contract without a description is listed as «Contrato manual»', async () => {
    await goToStep2();
    expect(await screen.findByText('C-300')).toBeInTheDocument();
    expect(screen.getByText('Contrato manual')).toBeInTheDocument();
  });

  it('a programme contract still shows its programme name', async () => {
    await goToStep2();
    expect(await screen.findByText('C-100')).toBeInTheDocument();
    expect(screen.getByText('Programa de Prueba')).toBeInTheDocument();
  });

  async function createAnnexOf(numeroContrato: string) {
    const { container } = await goToStep2();
    fireEvent.click(await screen.findByText(numeroContrato));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const [participantes, precio] = screen.getAllByRole('spinbutton');
    fireEvent.change(participantes, { target: { value: '4' } });
    fireEvent.change(precio, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Anexo/ }));
    await waitFor(() => expect(writes).toHaveLength(2));
    return writes[0].payload[0];
  }

  // Send-back 1, item 1: the annex of a manual contract is itself stored as
  // manual, carrying the parent's description, so the list and the details
  // window show that description instead of the client's trade name.
  it('the annex of a manual contract is stored as manual with the parent\'s description', async () => {
    const payload = await createAnnexOf('C-200');
    expect(payload.es_manual).toBe(true);
    expect(payload.descripcion_manual).toBe('Asesoría acordada a mano');
  });

  it('the annex of a programme contract is stored as today (not manual, no description)', async () => {
    const payload = await createAnnexOf('C-100');
    expect(payload.programa_id).toBe('prog-1');
    expect(payload.es_manual).not.toBe(true);
    expect(payload.descripcion_manual).toBeUndefined();
  });

  it('creates the annex of a manual contract as today, numbered the highest plus one', async () => {
    const { container } = await goToStep2();
    fireEvent.click(await screen.findByText('C-200'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const [participantes, precio] = screen.getAllByRole('spinbutton');
    fireEvent.change(participantes, { target: { value: '4' } });
    fireEvent.change(precio, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Anexo/ }));

    await waitFor(() => expect(writes).toHaveLength(2));
    const [annexInsert, cuotasInsert] = writes;
    expect(annexInsert.table).toBe('contratos');
    expect(annexInsert.op).toBe('insert');
    expect(annexInsert.payload[0]).toMatchObject({
      numero_contrato: 'C-200A3',
      anexo_numero: 3,
      parent_contrato_id: 'ctr-manual',
      programa_id: null,
      is_anexo: true,
      numero_participantes: 4,
      precio_total_uf: 30,
    });
    expect(cuotasInsert).toMatchObject({
      table: 'cuotas',
      op: 'insert',
      payload: [{ contrato_id: 'new-annex', numero_cuota: 1, fecha_vencimiento: '2026-12-01', monto_uf: 30, pagada: false }],
    });
  });
});
