// @vitest-environment jsdom
/**
 * GENERA fixes F20b — the evaluation screen /licitaciones/[id]/evaluacion.
 * LIC-B3: the date field defaults to the day in Chile and shows the stored
 * date again when the evaluation is reopened.
 * Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { h } = vi.hoisted(() => ({
  h: {
    detail: {} as Record<string, unknown>,
    evalData: {} as Record<string, unknown>,
  },
}));

vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'lic-1' }, push: vi.fn() }) }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/MainLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import EvaluacionPage from '@/pages/licitaciones/[id]/evaluacion';

const fetchMock = vi.fn();

const tender = (overrides: Record<string, unknown> = {}) => ({
  id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', nombre_licitacion: 'Licitación inventada',
  estado: 'evaluacion_pendiente', tipo_moneda: 'UF', peso_evaluacion_tecnica: 70, peso_evaluacion_economica: 30,
  hora_inicio_evaluacion: null, hora_fin_evaluacion: null, school_id: 1,
  ...overrides,
});

const evaluation = (overrides: Record<string, unknown> = {}) => ({
  committee: [], scores: [],
  ates: [{ id: 'ate-a', nombre_ate: 'ATE Inventada A', monto_propuesto: null }],
  criterios: [{ id: 'crit-1', nombre_criterio: 'Criterio inventado', puntaje_maximo: 100, orden: 1 }],
  fecha_evaluacion: null,
  ...overrides,
});

beforeEach(() => {
  h.detail = tender();
  h.evalData = evaluation();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/my-roles') return { ok: true, json: async () => ({ roles: [{ role_type: 'admin' }] }) };
    if (url === '/api/licitaciones/lic-1') return { ok: true, json: async () => ({ data: { licitacion: h.detail } }) };
    if (url === '/api/licitaciones/lic-1/evaluacion') return { ok: true, json: async () => ({ data: h.evalData }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

async function renderPage() {
  render(<EvaluacionPage />);
  await screen.findByText('Licitación inventada');
}

const dateInput = () => document.getElementById('fecha-evaluacion') as HTMLInputElement;

describe('evaluation screen — the evaluation date (LIC-B3)', () => {
  it('defaults to the day in Chile when UTC is already the next day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T02:30:00Z')); // 23:30 on 19 Nov in Santiago
    await renderPage();
    expect(dateInput().value).toBe('2026-11-19');
  });

  it('shows the stored date again when the evaluation is reopened', async () => {
    h.evalData = evaluation({ fecha_evaluacion: '2026-11-05' });
    await renderPage();
    await waitFor(() => expect(dateInput().value).toBe('2026-11-05'));
  });
});

describe('evaluation screen — the amount field names the tender\'s currency (LIC-B2)', () => {
  it('a UF tender: «Monto propuesto (UF)», cents allowed, a UF example', async () => {
    await renderPage();
    const input = screen.getByLabelText('Monto propuesto (UF)') as HTMLInputElement;
    expect(input.getAttribute('step')).toBe('0.01');
    expect(input.getAttribute('placeholder')).toBe('450');
    expect(screen.queryByText(/Monto propuesto \(CLP\)/)).not.toBeInTheDocument();
  });

  it('a tender in pesos: «Monto propuesto (CLP)», whole pesos, a peso example', async () => {
    h.detail = tender({ tipo_moneda: 'CLP' });
    await renderPage();
    const input = screen.getByLabelText('Monto propuesto (CLP)') as HTMLInputElement;
    expect(input.getAttribute('step')).toBe('1');
    expect(input.getAttribute('placeholder')).toBe('15000000');
  });
});

describe('evaluation screen — «Generar Acta» (LIC-B5)', () => {
  const ready = (overrides: Record<string, unknown> = {}) => evaluation({
    committee: [
      { nombre: 'Persona Inventada Uno', rut: null, cargo: null, orden: 1 },
      { nombre: 'Persona Inventada Dos', rut: null, cargo: null, orden: 2 },
      { nombre: 'Persona Inventada Tres', rut: null, cargo: null, orden: 3 },
    ],
    scores: [{ ate_id: 'ate-a', criterio_id: 'crit-1', puntaje: 80, comentario: null }],
    ates: [{ id: 'ate-a', nombre_ate: 'ATE Inventada A', monto_propuesto: 450 }],
    ...overrides,
  });

  it('is offered when the programme has criteria and the evaluation is complete', async () => {
    h.evalData = ready();
    await renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Generar Acta/ })).toBeEnabled());
    expect(screen.queryByText(/no tiene criterios de evaluación activos/)).not.toBeInTheDocument();
  });

  it('without active criteria: a short notice, and no «Generar Acta»', async () => {
    h.evalData = ready({ criterios: [], scores: [] });
    await renderPage();
    expect(await screen.findByText(/no tiene criterios de evaluación activos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar Acta/ })).not.toBeInTheDocument();
  });

  it('a failed save stops «Generar Acta»: no Acta is asked for and the error is shown', async () => {
    const { toast } = await import('react-hot-toast');
    h.evalData = ready();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (url === '/api/licitaciones/lic-1/evaluacion' && opts?.method === 'POST') {
        return { ok: false, json: async () => ({ error: 'Fallo inventado al guardar' }) };
      }
      return base(url, opts);
    });
    await renderPage();
    const button = await screen.findByRole('button', { name: /Generar Acta/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Fallo inventado al guardar'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Generar Acta/ })).toBeEnabled());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('generate-acta'))).toBe(false);
  });
});
