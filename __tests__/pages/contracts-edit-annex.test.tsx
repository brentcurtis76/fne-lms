// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime and don't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

/**
 * F10a (GES-2.9): «Editar» in the details window of an ANNEX opens the annex
 * form (tab «editar-anexo»); any other contract still opens the contract form.
 * Renders the real page and details window; the two forms are stand-ins.
 * Harness copied from contracts-activation.test.tsx. Invented data only.
 */

type Row = Record<string, any>;

let state: { contratos: Row[]; updateError: { message: string } | null };
let currentClient: any;

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
        return { data: state.contratos.map((c) => ({ ...c })), error: null };
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
// The two forms are stand-ins that say which one opened and for which row.
vi.mock('../../components/contracts/ContractForm', () => ({
  default: ({ editingContract }: any) => (
    <div data-testid="contract-form-stub">{editingContract?.id ?? 'new'}</div>
  ),
}));
vi.mock('../../components/contracts/AnnexForm', () => ({
  default: ({ editingAnnex, onCancel }: any) => (
    <div data-testid="annex-form-stub">
      {editingAnnex?.id ?? 'new'}
      <button type="button" onClick={onCancel}>stub-cancel</button>
    </div>
  ),
}));
vi.mock('../../components/contracts/CashFlowView', () => ({ default: () => null }));
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

const annex = (): Row =>
  makeContrato({
    id: 'a1',
    numero_contrato: 'C-001A1',
    is_anexo: true,
    parent_contrato_id: 'c1',
    anexo_numero: 1,
    anexo_fecha: '2026-03-01',
    numero_participantes: 3,
    nombre_ciclo: 'Segundo Ciclo',
  });

describe('Contracts page — «Editar» opens the right form (GES-2.9)', () => {
  it('an annex opens the annex form, not the contract form', async () => {
    const user = userEvent.setup();
    await renderPage([makeContrato(), annex()]);

    await user.click(screen.getByRole('button', { name: /C-001A1/ }));
    await screen.findByText('Información del Cliente');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByTestId('annex-form-stub')).toHaveTextContent('a1');
    expect(screen.queryByTestId('contract-form-stub')).not.toBeInTheDocument();
  });

  it('a contract that is not an annex still opens the contract form', async () => {
    const user = userEvent.setup();
    await renderPage([makeContrato(), annex()]);

    await user.click(screen.getByRole('button', { name: /^C-001$/ }));
    await screen.findByText('Información del Cliente');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByTestId('contract-form-stub')).toHaveTextContent('c1');
    expect(screen.queryByTestId('annex-form-stub')).not.toBeInTheDocument();
  });

  it('closing the annex form returns to the list', async () => {
    const user = userEvent.setup();
    await renderPage([makeContrato(), annex()]);

    await user.click(screen.getByRole('button', { name: /C-001A1/ }));
    await screen.findByText('Información del Cliente');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(await screen.findByRole('button', { name: 'stub-cancel' }));

    expect(await screen.findByText('Contratos Registrados (2)')).toBeInTheDocument();
    expect(screen.queryByTestId('annex-form-stub')).not.toBeInTheDocument();
  });
});
