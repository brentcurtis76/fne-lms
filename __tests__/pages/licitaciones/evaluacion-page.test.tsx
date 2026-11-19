// @vitest-environment jsdom
/**
 * GENERA fixes F20b — the evaluation screen /licitaciones/[id]/evaluacion.
 * LIC-B3: the date field defaults to the day in Chile and shows the stored
 * date again when the evaluation is reopened.
 * Synthetic data only.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
