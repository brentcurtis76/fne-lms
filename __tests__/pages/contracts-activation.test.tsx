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
 * Behavioral coverage for /contracts activation writes (feat/ctr-activate,
 * review R1). Renders the REAL page and REAL details modal against a fake
 * Supabase client that records update payloads and applies them to the seeded
 * rows, so list/modal refreshes reflect the mutation like production does:
 * - pending AND vigente activation writes estado='activo' + incluir_en_flujo;
 * - a failed activation update leaves the confirmation dialog open;
 * - a pending upload writes firmado + contrato_url + estado + flujo;
 * - a late upload on an active opted-out contract preserves the opt-out;
 * - an imported active contract can be marked signed (firmado only);
 * - the firma-pendiente filter stays recoverable when its count hits zero.
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
vi.mock('../../components/contracts/ContractForm', () => ({ default: () => null }));
vi.mock('../../components/contracts/AnnexForm', () => ({ default: () => null }));
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

const uploadSignedDoc = async (testid: string) => {
  const input = screen.getByTestId(testid);
  const file = new File(['pdf'], 'contrato-firmado.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
};

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe('Contracts page — activation writes', () => {
  it.each(['pendiente', 'vigente'])(
    'activating a %s contract writes estado=activo and incluir_en_flujo=true',
    async (estado) => {
      const user = userEvent.setup();
      const client = await renderPage([makeContrato({ estado })]);

      await openContractModal(user, 'C-001');
      await user.click(screen.getByTestId('activate-without-doc-btn'));
      await user.click(screen.getByTestId('confirm-activate-btn'));

      await waitFor(() => expect(client.__updates).toHaveLength(1));
      expect(client.__updates[0]).toEqual({
        table: 'contratos',
        id: 'c1',
        payload: { estado: 'activo', incluir_en_flujo: true },
      });
      // Dialog closes after the successful write.
      await waitFor(() => {
        expect(screen.queryByTestId('confirm-activate-btn')).not.toBeInTheDocument();
      });
    },
  );

  it('a failed activation update keeps the confirmation dialog open', async () => {
    const user = userEvent.setup();
    const client = await renderPage([makeContrato()], { updateError: { message: 'boom' } });

    await openContractModal(user, 'C-001');
    await user.click(screen.getByTestId('activate-without-doc-btn'));
    await user.click(screen.getByTestId('confirm-activate-btn'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByTestId('confirm-activate-btn')).toBeInTheDocument();
    expect(client.__updates).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('uploading the signed doc on a pending contract activates it into the cash flow', async () => {
    const user = userEvent.setup();
    const client = await renderPage([makeContrato({ estado: 'pendiente' })]);

    await openContractModal(user, 'C-001');
    await uploadSignedDoc('signed-doc-upload-input');

    await waitFor(() => expect(client.__updates).toHaveLength(1));
    expect(client.__updates[0].payload).toEqual({
      firmado: true,
      contrato_url: 'https://storage.test/signed.pdf',
      estado: 'activo',
      incluir_en_flujo: true,
    });
  });

  it('a late upload on an active opted-out contract preserves incluir_en_flujo=false', async () => {
    const user = userEvent.setup();
    const client = await renderPage([
      makeContrato({ estado: 'activo', firmado: false, incluir_en_flujo: false }),
    ]);

    await openContractModal(user, 'C-001');
    await uploadSignedDoc('late-upload-input');

    await waitFor(() => expect(client.__updates).toHaveLength(1));
    expect(client.__updates[0].payload).toEqual({
      firmado: true,
      contrato_url: 'https://storage.test/signed.pdf',
    });
    expect(client.__updates[0].payload).not.toHaveProperty('estado');
    expect(client.__updates[0].payload).not.toHaveProperty('incluir_en_flujo');
    expect(state.contratos[0].incluir_en_flujo).toBe(false);
  });

  it('an imported active contract with contrato_url and firmado=false can be marked signed', async () => {
    const user = userEvent.setup();
    const client = await renderPage([
      makeContrato({
        estado: 'activo',
        firmado: false,
        es_manual: true,
        programa_id: null,
        contrato_url: 'https://storage.test/imported.pdf',
        descripcion_manual: 'Contrato importado desde PDF - C-001',
      }),
    ]);

    await openContractModal(user, 'C-001');
    await user.click(screen.getByTestId('mark-signed-btn'));

    await waitFor(() => expect(client.__updates).toHaveLength(1));
    expect(client.__updates[0]).toEqual({
      table: 'contratos',
      id: 'c1',
      payload: { firmado: true },
    });
  });

  it('the firma-pendiente filter stays recoverable when its count reaches zero', async () => {
    const user = userEvent.setup();
    await renderPage([
      makeContrato({
        estado: 'activo',
        firmado: false,
        contrato_url: 'https://storage.test/imported.pdf',
      }),
    ]);

    const chip = screen.getByTestId('firma-pendiente-filter');
    expect(chip).toHaveTextContent('Firma pendiente (1)');
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip);
    expect(screen.getByTestId('firma-pendiente-filter')).toHaveAttribute('aria-pressed', 'true');

    // Resolve the only pending signature while the filter is active.
    await openContractModal(user, 'C-001');
    await user.click(screen.getByTestId('mark-signed-btn'));
    await user.keyboard('{Escape}'); // close the modal

    // Count reaches zero but the toggle must remain to recover the list.
    const chipAfter = await screen.findByTestId('firma-pendiente-filter');
    expect(chipAfter).toHaveTextContent('Firma pendiente (0)');
    expect(screen.getByText(/Desactiva el filtro/)).toBeInTheDocument();

    await user.click(chipAfter);
    expect(await screen.findByText('C-001')).toBeInTheDocument();
    // Filter off + count 0: the chip has no reason to exist anymore.
    expect(screen.queryByTestId('firma-pendiente-filter')).not.toBeInTheDocument();
  });
});
