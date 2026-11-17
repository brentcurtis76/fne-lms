// @vitest-environment jsdom
/**
 * GENERA fixes F14, send-back 1 (S1): after «Generar Carta» the foundation's
 * confirm control becomes available without a reload, whatever order the Carta
 * generation and the page's own refresh of the tender finish in.
 * The REAL parent page and the REAL step 6 are rendered (no refresh spy); only
 * fetch is mocked, with responses released by hand. Synthetic data only.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'lic-1' }, push: vi.fn() }) }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/licitaciones/Step3Bases', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step4Propuestas', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step7Contrato', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/DocumentCenter', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ProposalConfigPanel', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ArchiveView', () => ({ default: () => null }));

import LicitacionDetailPage from '@/pages/licitaciones/[id]';

type Resp = { ok: boolean; json: () => Promise<unknown> };
const ok = (body: unknown): Resp => ({ ok: true, json: async () => body });

const state = {
  cartaStored: false, // the database: set when the generation has answered
  firstDetailServed: false,
  autoResolveDetails: false,
  pendingDetails: [] as Array<() => void>,
  // Send-back 2: refreshes answered with the picture of the database taken when
  // they were ASKED, released by the test in whatever order it chooses.
  snapshotAtRequest: false,
  heldDetails: [] as Array<() => void>,
  releaseGeneration: null as null | (() => void),
};

const detail = () => ({
  id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada', year: 2026,
  estado: 'adjudicacion_pendiente', email_licitacion: 'licitacion@inventado.test',
  fecha_publicacion: '2026-11-02', school_id: 1, cliente_id: 'cliente-1',
  school: { id: 1, name: 'Escuela Inventada' },
  cliente: { nombre_legal: 'Fundación Inventada', comuna: 'Comuna Ficticia' },
  ganador_ate_id: 'ate-1', ganador_es_fne: null, contrato_id: null,
  carta_adjudicacion_url: state.cartaStored ? 'licitaciones/lic-1/carta.docx' : null,
});

const fetchMock = vi.fn();

beforeEach(() => {
  state.cartaStored = false;
  state.firstDetailServed = false;
  state.autoResolveDetails = false;
  state.pendingDetails = [];
  state.snapshotAtRequest = false;
  state.heldDetails = [];
  state.releaseGeneration = null;
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('open', vi.fn());
  fetchMock.mockImplementation((url: string, opts?: { method?: string }) => {
    if (url === '/api/auth/my-roles') return Promise.resolve(ok({ roles: [{ role_type: 'admin' }] }));
    if (url === '/api/licitaciones/lic-1' && !opts?.method) {
      if (!state.firstDetailServed || state.autoResolveDetails) {
        state.firstDetailServed = true;
        return Promise.resolve(ok({ data: { licitacion: detail() } }));
      }
      if (state.snapshotAtRequest) {
        const snapshot = detail(); // what the database holds when this refresh is read
        return new Promise<Resp>(resolve => {
          state.heldDetails.push(() => resolve(ok({ data: { licitacion: snapshot } })));
        });
      }
      // A refresh: answered when the test releases it, with the database as it is then.
      return new Promise<Resp>(resolve => {
        state.pendingDetails.push(() => resolve(ok({ data: { licitacion: detail() } })));
      });
    }
    if (url.endsWith('/ates')) {
      return Promise.resolve(ok({ data: { ates: [{ id: 'ate-1', nombre_ate: 'ATE Inventada', puntaje_total: 90 }] } }));
    }
    if (url.endsWith('/adjudicacion')) return Promise.resolve(ok({ data: {} }));
    if (url.endsWith('/generate-carta')) {
      return new Promise<Resp>(resolve => {
        state.releaseGeneration = () => {
          state.cartaStored = true;
          resolve(ok({ data: { url: null } }));
        };
      });
    }
    return Promise.resolve(ok({ data: {} }));
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function flushDetails() {
  await act(async () => {
    while (state.pendingDetails.length) state.pendingDetails.shift()!();
    await Promise.resolve();
  });
}

async function startGeneration() {
  render(<LicitacionDetailPage />);
  const fne = await screen.findByRole('button', { name: /Proveedor FNE/ });
  expect(fne).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Generar Carta de Adjudicacion/ }));
  await waitFor(() => expect(state.releaseGeneration).not.toBeNull());
}

async function releaseGeneration() {
  await act(async () => { state.releaseGeneration!(); await Promise.resolve(); });
}

async function finish() {
  state.autoResolveDetails = true;
  await flushDetails();
  await waitFor(() => expect(screen.getByRole('button', { name: /Proveedor FNE/ })).toBeEnabled());
  expect(screen.queryByText('Genere la Carta de adjudicación antes de confirmar la adjudicación.')).not.toBeInTheDocument();
}

describe('Step 6 inside the detail page — «Generar Carta» unlocks the FNE confirmation without a reload (S1)', () => {
  it('when the page refresh would finish before the generation', async () => {
    await startGeneration();
    await flushDetails(); // any refresh asked for so far answers first (no Carta stored yet)
    await releaseGeneration();
    await finish();
  });

  it('when the generation finishes before the page refresh', async () => {
    await startGeneration();
    await releaseGeneration();
    await finish();
  });
});

describe('Step 6 inside the detail page — overlapping refreshes keep the newest picture of the tender (send-back 2)', () => {
  const loaderShown = (container: HTMLElement) => container.querySelector('.animate-spin.h-12') !== null;

  // Refresh A (a save during the generation) reads the tender WITHOUT the Carta;
  // the generation then stores it and refresh B reads it WITH the Carta.
  async function twoOverlappingRefreshes() {
    state.snapshotAtRequest = true;
    const view = render(<LicitacionDetailPage />);
    const fne = await screen.findByRole('button', { name: /Proveedor FNE/ });
    expect(fne).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Generar Carta de Adjudicacion/ }));
    await waitFor(() => expect(state.releaseGeneration).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Guardar Adjudicacion/ }));
    await waitFor(() => expect(state.heldDetails).toHaveLength(1)); // A asked, Carta not stored
    await releaseGeneration();
    await waitFor(() => expect(state.heldDetails).toHaveLength(2)); // B asked, Carta stored
    const [answerA, answerB] = state.heldDetails;
    return { container: view.container, answerA, answerB };
  }

  async function expectAvailableAndNoLoader(container: HTMLElement) {
    await waitFor(() => expect(screen.getByRole('button', { name: /Proveedor FNE/ })).toBeEnabled());
    // Stays so: let any late answer and re-render land, then look again.
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.getByRole('button', { name: /Proveedor FNE/ })).toBeEnabled();
    expect(screen.queryByText('Genere la Carta de adjudicación antes de confirmar la adjudicación.')).not.toBeInTheDocument();
    expect(loaderShown(container)).toBe(false);
  }

  it('B (with the Carta) answers first, then the older A (without it)', async () => {
    const { container, answerA, answerB } = await twoOverlappingRefreshes();
    await act(async () => { answerB(); await Promise.resolve(); });
    await act(async () => { answerA(); await Promise.resolve(); });
    await expectAvailableAndNoLoader(container);
  });

  it('A answers first, then B (plain order)', async () => {
    const { container, answerA, answerB } = await twoOverlappingRefreshes();
    await act(async () => { answerA(); await Promise.resolve(); });
    await act(async () => { answerB(); await Promise.resolve(); });
    await expectAvailableAndNoLoader(container);
  });
});
