// @vitest-environment jsdom
/**
 * LIC-E6: the configuration panel shows totalUf(pricing), the same total as
 * the PDF and the public page. Synthetic data only.
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

describe('ProposalConfigPanel — the one price', () => {
  it('«Precio fijo» left blank shows 0.00 UF, like the PDF and the page, even with an hourly rate typed', async () => {
    const lic = { id: 'lic-1', numero_licitacion: 'LIC-1', year: 2026, school: { id: 1, name: 'Escuela Inventada' }, cliente: null } as unknown as LicitacionDetail;
    render(<ProposalConfigPanel licitacionId="lic-1" licitacion={lic} />);
    fireEvent.click(screen.getByRole('button', { name: /Generar Propuesta FNE/ }));
    fireEvent.change(await screen.findByPlaceholderText('Ej: 1.2'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Precio fijo' }));
    expect(screen.getByPlaceholderText('Ej: 888')).toHaveValue(null);
    expect(screen.getByTestId('proposal-total-uf')).toHaveTextContent('0.00 UF');
    fireEvent.change(screen.getByPlaceholderText('Ej: 888'), { target: { value: '150' } });
    expect(screen.getByTestId('proposal-total-uf')).toHaveTextContent('150.00 UF');
  });
});
