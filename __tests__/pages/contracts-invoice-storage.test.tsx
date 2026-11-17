// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime and don't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'react-hot-toast';

/**
 * GES-1.4 (F2c, A3): the /contracts page's invoice upload and removal, against
 * a fake Supabase client (as in contracts-activation.test.tsx) that records
 * storage calls and update payloads:
 * - an upload stores the uploaded file's NAME in cuotas.factura_url and never
 *   asks the store for a public address;
 * - removal finds the file name from an old full address AND from a bare name;
 * - a stored value the helper refuses: the columns are still cleared and no
 *   file is removed.
 * All people, ids and files are invented.
 */

type Row = Record<string, any>;

const CUOTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NAME = `invoice_${CUOTA}_1700000000000.pdf`;
const ADDRESS = `https://example-project.supabase.co/storage/v1/object/public/facturas/${NAME}`;

let state: { contratos: Row[] };
let currentClient: any;

function createFakeSupabase() {
  const updates: Array<{ table: string; payload: Row; id: any }> = [];
  const storageCalls: Array<{ bucket: string; op: string; arg: unknown }> = [];

  const cuotaRow = (id: any) => {
    for (const c of state.contratos) {
      const found = (c.cuotas || []).find((q: Row) => q.id === id);
      if (found) return found;
    }
    return null;
  };

  const makeChain = (table: string) => {
    const ctx: { op: 'select' | 'update'; payload?: Row; id?: any; single?: boolean } = { op: 'select' };
    const resolve = () => {
      if (ctx.op === 'update') {
        updates.push({ table, payload: ctx.payload!, id: ctx.id });
        if (table === 'cuotas') {
          const row = cuotaRow(ctx.id);
          if (row) Object.assign(row, ctx.payload);
        }
        return { data: null, error: null };
      }
      if (table === 'contratos') {
        if (ctx.single) {
          const row = state.contratos.find((c) => c.id === ctx.id) ?? null;
          return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: row ? null : { message: 'not found' } };
        }
        return { data: JSON.parse(JSON.stringify(state.contratos)), error: null };
      }
      if (table === 'cuotas' && ctx.single) {
        const row = cuotaRow(ctx.id);
        return { data: row ? { factura_url: row.factura_url } : null, error: row ? null : { message: 'not found' } };
      }
      if (table === 'profiles') return { data: { avatar_url: null }, error: null };
      return { data: [], error: null };
    };
    const chain: any = {
      select: () => chain,
      order: () => chain,
      update: (payload: Row) => {
        ctx.op = 'update';
        ctx.payload = payload;
        return chain;
      },
      eq: (_col: string, value: any) => {
        ctx.id = value;
        return chain;
      },
      single: () => {
        ctx.single = true;
        return chain;
      },
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return chain;
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@example.test' } } } }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (name: string) => {
          storageCalls.push({ bucket, op: 'upload', arg: name });
          return { data: { path: name }, error: null };
        },
        getPublicUrl: (name: string) => {
          storageCalls.push({ bucket, op: 'getPublicUrl', arg: name });
          return { data: { publicUrl: `https://example-project.supabase.co/storage/v1/object/public/${bucket}/${name}` } };
        },
        remove: async (names: string[]) => {
          storageCalls.push({ bucket, op: 'remove', arg: names });
          return { data: null, error: null };
        },
      }),
    },
    from: (table: string) => makeChain(table),
    __updates: updates,
    __storage: storageCalls,
  };
}

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
const routerMock = { query: {}, push: vi.fn(), replace: vi.fn(), pathname: '/contracts' };
vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('../../utils/roleUtils', () => ({ getUserPrimaryRole: async () => 'admin' }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../../components/contracts/ContractForm', () => ({ default: () => null }));
vi.mock('../../components/contracts/AnnexForm', () => ({ default: () => null }));
vi.mock('../../components/contracts/CashFlowView', () => ({ default: () => null }));
vi.mock('../../components/contracts/ContractPDFImporter', () => ({ default: () => null }));
vi.mock('../../components/contracts/HourAllocationPanel', () => ({ default: () => null }));

import ContractsPage from '../../pages/contracts';
import { invoiceObjectName } from '../../lib/contracts/invoice-path';

const makeContrato = (facturaUrl: string | null): Row => ({
  id: 'c1',
  numero_contrato: 'C-001',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2026-12-15',
  cliente_id: 'cl1',
  programa_id: 'p1',
  precio_total_uf: 100,
  tipo_moneda: 'UF',
  firmado: true,
  estado: 'activo',
  incluir_en_flujo: true,
  contrato_url: null,
  es_manual: false,
  clientes: {
    id: 'cl1',
    nombre_legal: 'Colegio Inventado SpA',
    nombre_fantasia: 'Colegio Inventado',
    rut: '76.000.000-0',
    direccion: 'Calle Uno 123',
    comuna: 'Providencia',
    ciudad: 'Santiago',
    nombre_representante: 'Rep Inventado',
  },
  programas: {
    id: 'p1',
    nombre: 'Programa Inventado',
    descripcion: 'Descripción',
    horas_totales: 100,
    modalidad: 'mixta',
    codigo_servicio: 'PI-1',
  },
  cuotas: [
    {
      id: CUOTA,
      contrato_id: 'c1',
      numero_cuota: 1,
      fecha_vencimiento: '2026-03-15',
      monto_uf: 50,
      pagada: false,
      created_at: '2026-01-15T00:00:00Z',
      factura_url: facturaUrl,
      factura_filename: facturaUrl ? 'factura-marzo.pdf' : null,
      factura_size: facturaUrl ? 1024 : null,
      factura_type: facturaUrl ? 'application/pdf' : null,
      factura_uploaded_at: facturaUrl ? '2026-03-01T12:00:00Z' : null,
    },
  ],
});

const renderAndOpen = async (facturaUrl: string | null) => {
  state = { contratos: [makeContrato(facturaUrl)] };
  currentClient = createFakeSupabase();
  const user = userEvent.setup();
  render(<ContractsPage />);
  await screen.findByText('Contratos Registrados (1)');
  await user.click(screen.getByText('C-001'));
  await screen.findByText(/Cronograma de Pagos/);
  return { user, client: currentClient };
};

const remove = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTitle('Eliminar factura'));
  await user.click(screen.getByRole('button', { name: 'Eliminar Factura', exact: true } as any));
};

const CLEARED = {
  factura_url: null,
  factura_pagada: false,
  factura_filename: null,
  factura_size: null,
  factura_type: null,
  factura_uploaded_at: null,
};

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Contracts page — invoices stored by name, removal reads both forms', () => {
  it('an upload stores the file NAME in factura_url, with the four metadata columns, and asks for no public address', async () => {
    const { client } = await renderAndOpen(null);
    const input = document.querySelector('input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'factura-marzo.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(client.__updates.filter((u: Row) => u.table === 'cuotas')).toHaveLength(1));
    const uploaded = client.__storage.find((c: Row) => c.op === 'upload');
    expect(uploaded.bucket).toBe('facturas');
    expect(uploaded.arg).toMatch(new RegExp(`^invoice_${CUOTA}_\\d+\\.pdf$`));
    const update = client.__updates.find((u: Row) => u.table === 'cuotas');
    expect(update.id).toBe(CUOTA);
    expect(update.payload).toEqual({
      factura_url: uploaded.arg,
      factura_filename: 'factura-marzo.pdf',
      factura_size: file.size,
      factura_type: 'application/pdf',
      factura_uploaded_at: expect.any(String),
    });
    expect(client.__storage.some((c: Row) => c.op === 'getPublicUrl')).toBe(false);
  });

  it('send-back 1: a file with a 250-letter extension gets a stored name the link route accepts', async () => {
    const { client } = await renderAndOpen(null);
    const input = document.querySelector('input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'a.' + 'x'.repeat(250), { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(client.__updates.filter((u: Row) => u.table === 'cuotas')).toHaveLength(1));
    const uploaded = client.__storage.find((c: Row) => c.op === 'upload');
    expect(uploaded.arg).toMatch(new RegExp(`^invoice_${CUOTA}_\\d+\\.xxxxxxxxxx$`));
    expect(invoiceObjectName(uploaded.arg)).toBe(uploaded.arg);
    const update = client.__updates.find((u: Row) => u.table === 'cuotas');
    expect(update.payload.factura_url).toBe(uploaded.arg);
  });

  it.each([
    ['an old full address', ADDRESS],
    ['a bare name', NAME],
  ])('removal with %s removes exactly that file from facturas and clears the columns', async (_l, stored) => {
    const { user, client } = await renderAndOpen(stored);
    await remove(user);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Factura eliminada exitosamente'));
    expect(client.__storage.filter((c: Row) => c.op === 'remove')).toEqual([
      { bucket: 'facturas', op: 'remove', arg: [NAME] },
    ]);
    const update = client.__updates.find((u: Row) => u.table === 'cuotas');
    expect(update).toEqual({ table: 'cuotas', id: CUOTA, payload: CLEARED });
  });

  it.each([
    ['another store', 'https://example-project.supabase.co/storage/v1/object/public/resources/x.pdf'],
    ['a value with ..', '../boletas/x.pdf'],
  ])('removal with a refused stored value (%s): the columns are cleared, no file removed', async (_l, stored) => {
    const { user, client } = await renderAndOpen(stored);
    await remove(user);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Factura eliminada exitosamente'));
    expect(client.__storage.some((c: Row) => c.op === 'remove')).toBe(false);
    const update = client.__updates.find((u: Row) => u.table === 'cuotas');
    expect(update).toEqual({ table: 'cuotas', id: CUOTA, payload: CLEARED });
  });
});
