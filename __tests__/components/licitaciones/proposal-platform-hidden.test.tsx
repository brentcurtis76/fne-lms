// @vitest-environment jsdom
/**
 * LIC-E6 (GENERA fixes F24, Brent 20 Nov 2026): the «Plataforma de
 * Crecimiento» section with its tick did nothing (the route always sends
 * `plataforma: false`), so it is hidden until it is built. The hours bucket
 * «Plataforma de Crecimiento» in «Distribución de Actividades» is a different
 * thing and stays. Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicitacionDetail } from '@/types/licitaciones';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ProposalConfigPanel from '@/components/licitaciones/ProposalConfigPanel';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/licitaciones/lic-1/propuestas') return { ok: true, json: async () => ({ data: { propuestas: [] } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function openPanel() {
  const lic = { id: 'lic-1', numero_licitacion: 'LIC-1', year: 2026, school: { id: 1, name: 'Escuela Inventada' }, cliente: null } as unknown as LicitacionDetail;
  render(<ProposalConfigPanel licitacionId="lic-1" licitacion={lic} />);
  fireEvent.click(screen.getByRole('button', { name: /Generar Propuesta FNE/ }));
  await screen.findByText(/Historial de Propuestas \(0\)/);
}

describe('ProposalConfigPanel — the «Plataforma de Crecimiento» tick is hidden (LIC-E6)', () => {
  it('shows no platform section and no tick', async () => {
    await openPanel();
    expect(screen.queryByRole('button', { name: 'Plataforma de Crecimiento' })).not.toBeInTheDocument();
    expect(screen.queryByText('Plataforma de Crecimiento')).not.toBeInTheDocument();
    expect(screen.queryByText('Incluir acceso a Plataforma de Crecimiento')).not.toBeInTheDocument();
    expect(screen.queryByText('Beneficios de la plataforma')).not.toBeInTheDocument();
  });

  it('keeps the hours bucket «Plataforma de Crecimiento» in «Distribución de Actividades»', async () => {
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Distribución de Actividades' }));
    expect(screen.getByText('Plataforma de Crecimiento')).toBeInTheDocument();
    expect(screen.queryByText('Incluir acceso a Plataforma de Crecimiento')).not.toBeInTheDocument();
  });
});
