// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F20d (LIC-D4): after «Guardar Contrato» of a tender's contract the page must
 * not open a fresh, prefilled form again. The page's session effect depends on
 * [router] and reads `tab=nuevo&licitacion_id` from the address; the test opens
 * the page with that address, calls the form's success handler, then makes the
 * router change (a new router object, as Next gives after a route event) so
 * the effect runs again. Synthetic data only.
 */

type Row = Record<string, any>;
let currentClient: any;

function createFakeSupabase() {
  const makeChain = (table: string) => {
    const ctx: { single?: boolean } = {};
    const resolve = () => {
      if (table === 'profiles') return { data: { avatar_url: null }, error: null };
      if (table === 'contratos' && ctx.single) return { data: null, error: { message: 'not found' } };
      return { data: [], error: null };
    };
    const chain: any = {
      select: () => chain,
      order: () => chain,
      eq: () => chain,
      single: () => {
        ctx.single = true;
        return chain;
      },
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return chain;
  };
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@ejemplo.test' } } } }) },
    storage: { from: () => ({}) },
    from: (table: string) => makeChain(table),
  };
}

const LIC_ID = '22222222-2222-4222-8222-222222222222';

// A router whose object can be swapped, so the page's [router] effect runs again.
const routerHolder: { current: Row } = { current: {} };
const replaceMock = vi.fn();
const makeRouter = (query: Row): Row => ({ query, push: vi.fn(), replace: replaceMock, pathname: '/contracts' });

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => currentClient }));
vi.mock('next/router', () => ({ useRouter: () => routerHolder.current }));
vi.mock('../../utils/roleUtils', () => ({ getUserPrimaryRole: async () => 'admin' }));
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ children }: any) => <div>{children}</div>,
}));
// The form is a marker: it shows which tender it was opened for and a button
// that calls the success handler with the saved contract's id.
vi.mock('../../components/contracts/ContractForm', () => ({
  default: (props: any) => (
    <div data-testid="tender-form" data-licitacion={props.licitacionId ?? ''}>
      <button onClick={() => props.onSuccess('contrato-nuevo')}>fake-save</button>
      <button onClick={() => props.onSuccess('contrato-existente', { reused: true, withoutCuotas: false })}>fake-reuse</button>
      <button onClick={() => props.onSuccess('contrato-existente', { reused: true, withoutCuotas: true })}>fake-reuse-sin-cuotas</button>
    </div>
  ),
}));
vi.mock('../../components/contracts/AnnexForm', () => ({ default: () => null }));
vi.mock('../../components/contracts/CashFlowView', () => ({ default: () => null }));
vi.mock('../../components/contracts/ContractPDFImporter', () => ({ default: () => null }));
vi.mock('../../components/contracts/HourAllocationPanel', () => ({ default: () => null }));

import ContractsPage from '../../pages/contracts';
import { toast } from 'react-hot-toast';

let fetchMock: ReturnType<typeof vi.fn>;
const tenderReads = () => fetchMock.mock.calls.filter(([url]) => url === `/api/licitaciones/${LIC_ID}`).length;

beforeEach(() => {
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  currentClient = createFakeSupabase();
  replaceMock.mockReset();
  routerHolder.current = makeRouter({ tab: 'nuevo', licitacion_id: LIC_ID });
  fetchMock = vi.fn(async (url: string) => {
    if (url === `/api/licitaciones/${LIC_ID}`) {
      return {
        ok: true,
        json: async () => ({
          data: { licitacion: { cliente_id: 'cliente-1', programa_id: 'prog-1', monto_adjudicado_uf: 100, tipo_moneda: 'UF' } },
        }),
      };
    }
    if (url === `/api/licitaciones/${LIC_ID}/generate-contract`) {
      return { ok: true, json: async () => ({ data: { licitacion: { id: LIC_ID } } }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  (globalThis as any).fetch = fetchMock;
});

const openAndSave = async () => {
  const utils = render(<ContractsPage />);
  const form = await screen.findByTestId('tender-form');
  expect(form.getAttribute('data-licitacion')).toBe(LIC_ID);
  fireEvent.click(screen.getByText('fake-save'));
  await waitFor(() => expect(screen.queryByTestId('tender-form')).not.toBeInTheDocument());
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/licitaciones/${LIC_ID}/generate-contract`)).toBe(true)
  );
  return utils;
};

/** The router changes (new object); its query is whatever the address says now. */
const routerChanges = async (rerender: (ui: React.ReactElement) => void, query: Row) => {
  await act(async () => {
    routerHolder.current = makeRouter(query);
    rerender(<ContractsPage />);
  });
  // Let the re-run session effect finish its reads.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};

describe('Contracts page — a saved tender contract does not reopen the form', () => {
  it('after a successful link the address leaves tab=nuevo&licitacion_id for the contract view (shallow)', async () => {
    await openAndSave();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith(
      { pathname: '/contracts', query: { contrato_id: 'contrato-nuevo' } },
      undefined,
      { shallow: true }
    );
  });

  it('the router changing while the address still says tab=nuevo&licitacion_id does not open a new form', async () => {
    const { rerender } = await openAndSave();
    expect(tenderReads()).toBe(1);
    await routerChanges(rerender, { tab: 'nuevo', licitacion_id: LIC_ID });
    expect(screen.queryByTestId('tender-form')).not.toBeInTheDocument();
    expect(tenderReads()).toBe(1);
  });

  it('the router changing to the contract view does not open a new form either', async () => {
    const { rerender } = await openAndSave();
    await routerChanges(rerender, { contrato_id: 'contrato-nuevo' });
    expect(screen.queryByTestId('tender-form')).not.toBeInTheDocument();
    expect(tenderReads()).toBe(1);
  });

  // Send-back 1 (1) and (3): reusing an existing contract says so.
  const REUSED = 'Esta licitación ya tenía un contrato: se abrió el contrato existente. Los cambios de este formulario no se guardaron; edite el contrato desde Gestión.';
  const NO_CUOTAS = 'El contrato existente no tiene cuotas registradas: revíselo antes de continuar.';
  const OLD_SUCCESS = 'Contrato generado y vinculado a la licitacion exitosamente';

  const openAndReuse = async (button: string) => {
    render(<ContractsPage />);
    await screen.findByTestId('tender-form');
    fireEvent.click(screen.getByText(button));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
  };

  it('a reused contract: the warning sentence, not the old success sentence; linked and opened', async () => {
    await openAndReuse('fake-reuse');
    const link = fetchMock.mock.calls.find(([url]) => url === `/api/licitaciones/${LIC_ID}/generate-contract`);
    expect(JSON.parse(link![1].body)).toEqual({ contrato_id: 'contrato-existente' });
    expect(toast).toHaveBeenCalledWith(REUSED, expect.objectContaining({ icon: '⚠️' }));
    expect(toast.success).not.toHaveBeenCalledWith(OLD_SUCCESS);
    expect(replaceMock).toHaveBeenCalledWith(
      { pathname: '/contracts', query: { contrato_id: 'contrato-existente' } },
      undefined,
      { shallow: true }
    );
  });

  it('a reused contract without cuotas: the second sentence too', async () => {
    await openAndReuse('fake-reuse-sin-cuotas');
    expect(toast).toHaveBeenCalledWith(`${REUSED} ${NO_CUOTAS}`, expect.objectContaining({ icon: '⚠️' }));
    expect(toast.success).not.toHaveBeenCalledWith(OLD_SUCCESS);
  });

  it('a new contract still gets the old success sentence', async () => {
    await openAndSave();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(OLD_SUCCESS));
    expect(toast).not.toHaveBeenCalledWith(REUSED, expect.anything());
  });
});
