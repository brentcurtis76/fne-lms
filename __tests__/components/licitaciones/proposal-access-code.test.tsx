// @vitest-environment jsdom
/**
 * LIC-E3 (GENERA fixes F14): after a reload the proposal panel shows the Admin
 * the access code of each generated version (it used to be shown once only,
 * right after generation). Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicitacionDetail } from '@/types/licitaciones';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ProposalConfigPanel from '@/components/licitaciones/ProposalConfigPanel';

const fetchMock = vi.fn();
const PROPUESTA = {
  id: 'prop-1', licitacion_id: 'lic-1', estado: 'completada', version: 2, created_at: '2026-11-10T12:00:00Z',
  web_slug: 'escuela-inventada-evoluciona-2026-v2', web_status: 'published', access_code_plain: 'K7MQ2X',
  download_url: null, view_count: 0, viewed_at: null, error_message: null,
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/licitaciones/lic-1/propuestas') return { ok: true, json: async () => ({ data: { propuestas: [PROPUESTA] } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('ProposalConfigPanel — the access code after a reload', () => {
  it('shows the stored code of a generated version in the history', async () => {
    const lic = { id: 'lic-1', numero_licitacion: 'LIC-1', year: 2026, school: { id: 1, name: 'Escuela Inventada' }, cliente: null } as unknown as LicitacionDetail;
    render(<ProposalConfigPanel licitacionId="lic-1" licitacion={lic} />);
    fireEvent.click(screen.getByRole('button', { name: /Generar Propuesta FNE/ }));
    fireEvent.click(await screen.findByText(/Historial de Propuestas \(1\)/));
    expect(await screen.findByText('K7MQ2X')).toBeInTheDocument();
    expect(screen.getByTitle('Copiar código de acceso')).toHaveTextContent('K7MQ2X');
  });
});
