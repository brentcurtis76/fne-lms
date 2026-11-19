// @vitest-environment jsdom
/**
 * LIC-E2 (GENERA fixes F20g, the button only): the panel's history shows
 * «Retirar enlace» on each version whose link is live, asks for confirmation
 * inside the row (the panel has no dialog of its own; no browser dialog is
 * used), and shows the version as retired afterwards. Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicitacionDetail } from '@/types/licitaciones';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ProposalConfigPanel from '@/components/licitaciones/ProposalConfigPanel';

const fetchMock = vi.fn();
const base = { licitacion_id: 'lic-1', estado: 'completada', created_at: '2026-11-10T12:00:00Z', access_code_plain: 'K7MQ2X', download_url: null, view_count: 0, viewed_at: null, error_message: null };
const V3 = { ...base, id: 'prop-3', version: 3, web_slug: 'escuela-inventada-evoluciona-2026-v3-aaaa', web_status: 'viewed' };
const V2 = { ...base, id: 'prop-2', version: 2, web_slug: 'escuela-inventada-evoluciona-2026-v2-bbbb', web_status: 'published' };
const V1 = { ...base, id: 'prop-1', version: 1, web_slug: 'escuela-inventada-evoluciona-2026-v1-cccc', web_status: 'expired' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => { throw new Error('no browser dialog'); }));
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/licitaciones/lic-1/propuestas' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { propuesta: { id: body.propuesta_id, web_status: 'expired' } } }) };
    }
    if (url === '/api/licitaciones/lic-1/propuestas') return { ok: true, json: async () => ({ data: { propuestas: [V3, V2, V1] } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function openHistory() {
  const lic = { id: 'lic-1', numero_licitacion: 'LIC-1', year: 2026, school: { id: 1, name: 'Escuela Inventada' }, cliente: null } as unknown as LicitacionDetail;
  render(<ProposalConfigPanel licitacionId="lic-1" licitacion={lic} />);
  fireEvent.click(screen.getByRole('button', { name: /Generar Propuesta FNE/ }));
  fireEvent.click(await screen.findByText(/Historial de Propuestas \(3\)/));
  await screen.findByTestId('propuesta-row-prop-3');
}

describe('ProposalConfigPanel — «Retirar enlace» (LIC-E2)', () => {
  it('shows «Retirar enlace» only on versions whose link is live', async () => {
    await openHistory();
    expect(within(screen.getByTestId('propuesta-row-prop-3')).getByRole('button', { name: 'Retirar enlace' })).toBeInTheDocument();
    expect(within(screen.getByTestId('propuesta-row-prop-2')).getByRole('button', { name: 'Retirar enlace' })).toBeInTheDocument();
    expect(within(screen.getByTestId('propuesta-row-prop-1')).queryByRole('button', { name: 'Retirar enlace' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('propuesta-row-prop-1')).getByText('Enlace retirado')).toBeInTheDocument();
  });

  it('asks for confirmation in the row; cancelling sends nothing', async () => {
    await openHistory();
    const row = screen.getByTestId('propuesta-row-prop-2');
    fireEvent.click(within(row).getByRole('button', { name: 'Retirar enlace' }));
    expect(within(row).getByText(/La escuela ya no podrá abrir esta versión/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Cancelar' }));
    expect(within(row).queryByText(/La escuela ya no podrá abrir esta versión/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('after confirming, sends the retire action and shows the version as retired', async () => {
    await openHistory();
    const row = screen.getByTestId('propuesta-row-prop-2');
    fireEvent.click(within(row).getByRole('button', { name: 'Retirar enlace' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Sí, retirar enlace' }));
    await waitFor(() => expect(within(row).getByText('Enlace retirado')).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(post?.[0]).toBe('/api/licitaciones/lic-1/propuestas');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ propuesta_id: 'prop-2', accion: 'retirar' });
    expect(within(row).getByText('Expirada')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Retirar enlace' })).not.toBeInTheDocument();
    // The other live version is untouched.
    expect(within(screen.getByTestId('propuesta-row-prop-3')).getByRole('button', { name: 'Retirar enlace' })).toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
