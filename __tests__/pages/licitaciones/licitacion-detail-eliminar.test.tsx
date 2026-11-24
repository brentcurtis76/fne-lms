// @vitest-environment jsdom
/**
 * GENERA fixes F24a (Brent, 20 Nov 2026, "No, keep it off"): an awarded or
 * closed tender cannot be deleted, so the detail page offers «Eliminar» only
 * where the delete route's own state rule (puedeEliminarLicitacion) allows it.
 * Render harness copied from licitacion-detail-step2.test.tsx.
 * Synthetic data only.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { h } = vi.hoisted(() => ({
  h: {
    detail: {} as Record<string, unknown>, role: 'admin', evaluacion: {} as Record<string, unknown>,
    evaluacionOutcome: 'ok' as 'ok' | 'error' | 'throw' | 'never',
    routeId: 'lic-1',
    // Second tender (lic-2) for the navigation cases; null outcome means "never answers".
    detail2: {} as Record<string, unknown>,
    evaluacion2: null as null | (() => Promise<unknown>),
    // When set, lic-1's /evaluacion answers only when the test calls it (a late answer).
    evaluacionDeferred: null as null | Promise<unknown>,
  },
}));

vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: h.routeId }, push: vi.fn() }) }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/licitaciones/Step3Bases', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step4Propuestas', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step6Adjudicacion', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/Step7Contrato', () => ({ default: () => <div>Paso de contrato (simulado)</div> }));
vi.mock('@/components/licitaciones/DocumentCenter', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ProposalConfigPanel', () => ({ default: () => null }));
vi.mock('@/components/licitaciones/ArchiveView', () => ({ default: () => <div>Vista de archivo (simulada)</div> }));

import LicitacionDetailPage from '@/pages/licitaciones/[id]';

const fetchMock = vi.fn();

const tender = (estado: string, id = 'lic-1', nombre = 'Licitación inventada') => ({
  id, numero_licitacion: `${id.toUpperCase()}-2026-001`, nombre_licitacion: nombre, year: 2026,
  estado, email_licitacion: 'licitacion@inventado.test',
  fecha_publicacion: null, fecha_limite_solicitud_bases: null, fecha_limite_consultas: null,
  fecha_inicio_propuestas: null, fecha_limite_propuestas: null, fecha_limite_evaluacion: null,
  school_id: 1, cliente_id: 'cliente-1',
  school: { id: 1, name: 'Escuela Inventada' },
  cliente: { nombre_legal: 'Fundación Inventada', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0', nombre_representante: 'Representante Inventado', comuna: 'Comuna Ficticia' },
});

beforeEach(() => {
  h.role = 'admin';
  h.evaluacion = { committee: [{ id: 'm-1' }], ates: [{ id: 'ate-1' }], scores: [] };
  h.evaluacionOutcome = 'ok';
  h.routeId = 'lic-1';
  h.detail2 = {};
  h.evaluacion2 = null;
  h.evaluacionDeferred = null;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/my-roles') return { ok: true, json: async () => ({ roles: [{ role_type: h.role }] }) };
    // Each load answers a fresh object, as res.json() does in the browser.
    if (url === '/api/licitaciones/lic-1') return { ok: true, json: async () => ({ data: { licitacion: { ...h.detail } } }) };
    if (url === '/api/licitaciones/lic-2') return { ok: true, json: async () => ({ data: { licitacion: { ...h.detail2 } } }) };
    if (url === '/api/licitaciones/lic-2/evaluacion') {
      if (!h.evaluacion2) return new Promise(() => { /* never settles */ });
      return h.evaluacion2();
    }
    if (url === '/api/licitaciones/lic-1/evaluacion') {
      if (h.evaluacionDeferred) return h.evaluacionDeferred;
      if (h.evaluacionOutcome === 'error') return { ok: false, status: 500, json: async () => ({ error: 'fallo inventado' }) };
      if (h.evaluacionOutcome === 'throw') throw new Error('red inventada caída');
      if (h.evaluacionOutcome === 'never') return new Promise(() => { /* never settles */ });
      return { ok: true, json: async () => ({ data: h.evaluacion }) };
    }
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function renderPage() {
  const view = render(<LicitacionDetailPage />);
  await screen.findByText('Licitación inventada');
  return view;
}

// Records whether an «Eliminar» button was in the document at any moment after
// the watch started — read from the mutation records (added and removed nodes),
// so a render that React replaces before the observer runs (a stale first
// render) is still caught. Every case starts the watch on the loading screen of
// the tender it names, so any button seen afterwards was offered for that tender.
function watchEliminarAdded() {
  const seen = { shown: false };
  const isEliminar = (n: Node) =>
    n instanceof HTMLElement &&
    [n, ...Array.from(n.querySelectorAll('button'))].some(
      (el) => el.tagName === 'BUTTON' && /Eliminar/.test(el.textContent || ''),
    );
  const observer = new MutationObserver((records) => {
    for (const r of records) [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].forEach((n) => { if (isEliminar(n)) seen.shown = true; });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    seen,
    stop: () => {
      for (const r of observer.takeRecords()) [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].forEach((n) => { if (isEliminar(n)) seen.shown = true; });
      if (screen.queryByRole('button', { name: 'Eliminar' })) seen.shown = true;
      observer.disconnect();
    },
  };
}

const archiveAnswer = { ok: true, json: async () => ({ data: { committee: [], ates: [], scores: [] } }) };

describe('Tender detail — «Eliminar» only where the tender may be deleted', () => {
  it('offers «Eliminar» to an admin before the award (publicacion_pendiente)', async () => {
    h.detail = tender('publicacion_pendiente');
    await renderPage();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('does not offer it for an awarded tender (contrato_pendiente)', async () => {
    h.detail = tender('contrato_pendiente');
    await renderPage();
    await screen.findByText('Paso de contrato (simulado)');
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not offer it for a closed tender shown with the workflow view (cerrada)', async () => {
    h.detail = tender('cerrada');
    await renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1/evaluacion'));
    await screen.findByText('Paso de contrato (simulado)');
    expect(screen.queryByText('Vista de archivo (simulada)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('still offers it for a historical record shown with the archive view (the route\'s exception, unchanged here)', async () => {
    h.detail = tender('cerrada');
    h.evaluacion = { committee: [], ates: [], scores: [] };
    await renderPage();
    await screen.findByText('Vista de archivo (simulada)');
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  // SOL-a1: a failed historical check falls back to the archive view, but it is
  // never permission to delete — the route would find the committee and answer 409.
  it('does not offer it for a closed tender when the historical check answers with an error', async () => {
    h.detail = tender('cerrada');
    h.evaluacionOutcome = 'error';
    await renderPage();
    await screen.findByText('Vista de archivo (simulada)');
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not offer it for a closed tender when the historical check request throws', async () => {
    h.detail = tender('cerrada');
    h.evaluacionOutcome = 'throw';
    await renderPage();
    await screen.findByText('Vista de archivo (simulada)');
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not offer it for a closed tender while the historical check is still pending', async () => {
    h.detail = tender('cerrada');
    h.evaluacionOutcome = 'never';
    await renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1/evaluacion'));
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('still offers it to an admin before the award even if the historical check would fail', async () => {
    h.detail = tender('publicacion_pendiente');
    h.evaluacionOutcome = 'error';
    await renderPage();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  // Send-back 2: the successful detection belongs to the tender and load it was made for.
  it('does not carry a historical tender\'s permission to another closed tender after client navigation', async () => {
    h.detail = tender('cerrada');
    h.evaluacion = { committee: [], ates: [], scores: [] };
    const view = await renderPage();
    await screen.findByText('Vista de archivo (simulada)');
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();

    h.detail2 = tender('cerrada', 'lic-2', 'Licitación con comité inventada');
    h.evaluacion2 = null; // B's detection never answers during the test
    h.routeId = 'lic-2';
    view.rerender(<LicitacionDetailPage />);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument(); // B's loading screen
    const watch = watchEliminarAdded();
    await screen.findByText('Licitación con comité inventada');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-2/evaluacion'));
    watch.stop();
    expect(watch.seen.shown).toBe(false);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not keep an earlier success when a later detection of the same tender fails', async () => {
    h.detail = tender('cerrada');
    h.evaluacion = { committee: [], ates: [], scores: [] };
    const view = await renderPage();
    await screen.findByText('Vista de archivo (simulada)');
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();

    // Away to an awarded tender (no detection runs for it), then back to the same historical tender,
    // whose detection now fails.
    h.detail2 = tender('contrato_pendiente', 'lic-2', 'Licitación adjudicada inventada');
    h.routeId = 'lic-2';
    view.rerender(<LicitacionDetailPage />);
    await screen.findByText('Licitación adjudicada inventada');
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();

    h.evaluacionOutcome = 'error';
    h.routeId = 'lic-1';
    view.rerender(<LicitacionDetailPage />);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument(); // A's loading screen
    const watch = watchEliminarAdded();
    await screen.findByText('Licitación inventada');
    await screen.findByText('Vista de archivo (simulada)');
    watch.stop();
    expect(watch.seen.shown).toBe(false);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not let a late historical answer for tender A grant «Eliminar» on tender B', async () => {
    let answerA: (v: unknown) => void = () => {};
    h.evaluacionDeferred = new Promise((resolve) => { answerA = resolve; });
    h.detail = tender('cerrada');
    const view = await renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1/evaluacion'));

    h.detail2 = tender('cerrada', 'lic-2', 'Licitación con comité inventada');
    h.evaluacion2 = null;
    h.routeId = 'lic-2';
    view.rerender(<LicitacionDetailPage />);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument(); // B's loading screen
    const watch = watchEliminarAdded();
    await screen.findByText('Licitación con comité inventada');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-2/evaluacion'));
    answerA(archiveAnswer); // A's answer arrives late, while B is shown
    await new Promise((r) => setTimeout(r, 20));
    watch.stop();
    expect(watch.seen.shown).toBe(false);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('does not offer it to a non-admin, even before the award', async () => {
    h.role = 'encargado_licitacion';
    h.detail = tender('publicacion_pendiente');
    await renderPage();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});
