// @vitest-environment jsdom
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime and don't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

/**
 * GES-3.15 (F21a): the /contracts page gives «Flujo de caja» its existing
 * reload of contracts (refreshContratos) as onChanged, so an upload or a paid
 * mark made there shows at once. Harness copied from
 * contracts-activation.test.tsx; the cash flow itself is a stand-in that keeps
 * its props. All ids and names are invented.
 */

type Row = Record<string, any>;

let state: { contratos: Row[]; updateError: { message: string } | null };
let currentClient: any;
const cashFlowProps: { current: any } = { current: null };
let listReads = 0;

function createFakeSupabase() {
  const updates: Array<{ table: string; payload: Row; id: any }> = [];

  const makeChain = (table: string) => {
    const ctx: { op: 'select' | 'update'; payload?: Row; id?: any; single?: boolean } = { op: 'select' };
    const resolve = () => {
      if (ctx.op === 'update') {
        if (state.updateError) return { data: null, error: state.updateError };
        updates.push({ table, payload: ctx.payload!, id: ctx.id });
        if (table === 'contratos') {
          const row = state.contratos.find((c) => c.id === ctx.id);
          if (row) Object.assign(row, ctx.payload);
        }
        return { data: null, error: null };
      }
      if (table === 'contratos') {
        if (ctx.single) {
          const row = state.contratos.find((c) => c.id === ctx.id) ?? null;
          return { data: row, error: row ? null : { message: 'not found' } };
        }
        listReads += 1;
        return { data: state.contratos.map((c) => JSON.parse(JSON.stringify(c))), error: null };
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
      getSession: async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@fne.cl' } } } }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'x' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/signed.pdf' } }),
      }),
    },
    from: (table: string) => makeChain(table),
    __updates: updates,
  };
}

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
// The page's session effect depends on [router] — the mock must return a
// STABLE object or every render re-fires checkSession in an infinite loop.
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
// The cash flow is replaced by a stand-in that keeps the props the page gives it.
vi.mock('../../components/contracts/CashFlowView', () => ({
  default: (props: any) => {
    cashFlowProps.current = props;
    return <div data-testid="cashflow-stub">{props.contratos.map((c: any) => `${c.id}:${c.cuotas?.[0]?.factura_pagada ? 'pagada' : 'pendiente'}`).join(',')}</div>;
  },
}));
vi.mock('../../components/contracts/ContractPDFImporter', () => ({ default: () => null }));
vi.mock('../../components/contracts/HourAllocationPanel', () => ({ default: () => null }));

import ContractsPage from '../../pages/contracts';

const makeContrato = (overrides: Row = {}): Row => ({
  id: 'c1',
  numero_contrato: 'C-001',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2026-12-15',
  cliente_id: 'cl1',
  programa_id: 'p1',
  precio_total_uf: 100,
  tipo_moneda: 'UF',
  firmado: false,
  estado: 'pendiente',
  incluir_en_flujo: false,
  contrato_url: null,
  es_manual: false,
  clientes: {
    id: 'cl1',
    nombre_legal: 'Colegio Test SpA',
    nombre_fantasia: 'Colegio Test',
    rut: '76.000.000-0',
    direccion: 'Calle Uno 123',
    comuna: 'Providencia',
    ciudad: 'Santiago',
    nombre_representante: 'Rep Test',
  },
  programas: {
    id: 'p1',
    nombre: 'Programa Test',
    descripcion: 'Descripción test',
    horas_totales: 100,
    modalidad: 'mixta',
    codigo_servicio: 'PT-1',
  },
  cuotas: [],
  ...overrides,
});

const renderPage = async (rows: Row[], opts: { updateError?: { message: string } | null } = {}) => {
  state = { contratos: rows, updateError: opts.updateError ?? null };
  currentClient = createFakeSupabase();
  render(<ContractsPage />);
  await screen.findByText(`Contratos Registrados (${rows.length})`);
  return currentClient;
};

const openContractModal = async (user: ReturnType<typeof userEvent.setup>, numero: string) => {
  await user.click(screen.getByText(numero));
  await screen.findByText('Información del Cliente');
};

const uploadSignedDoc = async (testid: string) => {
  const input = screen.getByTestId(testid);
  const file = new File(['pdf'], 'contrato-firmado.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
};

describe('Contracts page — the cash flow is given the reload of contracts', () => {
  it('onChanged reloads the contracts and the cash flow receives the new rows', async () => {
    const user = userEvent.setup();
    await renderPage([
      makeContrato({
        estado: 'activo',
        incluir_en_flujo: true,
        cuotas: [{ id: 'q1', contrato_id: 'c1', numero_cuota: 1, fecha_vencimiento: '2026-12-15', monto_uf: 50, factura_url: 'cuota_q1_1.pdf', factura_pagada: false }],
      }),
    ]);
    await user.click(screen.getByText('Flujo de Caja'));
    await waitFor(() => expect(screen.getByTestId('cashflow-stub')).toHaveTextContent('c1:pendiente'));
    expect(typeof cashFlowProps.current.onChanged).toBe('function');

    // what an action in the cash flow stores, then its call of onChanged
    state.contratos[0].cuotas[0].factura_pagada = true;
    const readsBefore = listReads;
    await act(async () => { await cashFlowProps.current.onChanged(); });
    expect(listReads).toBe(readsBefore + 1);
    expect(screen.getByTestId('cashflow-stub')).toHaveTextContent('c1:pagada');
  });
});
