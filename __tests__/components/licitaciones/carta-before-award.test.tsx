// @vitest-environment jsdom
/**
 * LIC-A1 (GENERA fixes F14): step 6 no longer lets an award to the foundation
 * be confirmed before the Carta exists (control disabled, reason shown), and
 * step 7 offers the Carta generation to a tender already stuck in
 * contrato_pendiente without one. Synthetic data only.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicitacionDetail } from '@/types/licitaciones';

vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Step6Adjudicacion from '@/components/licitaciones/Step6Adjudicacion';
import Step7Contrato from '@/components/licitaciones/Step7Contrato';

const fetchMock = vi.fn();
const ATE = { id: 'ate-1', nombre_ate: 'ATE Inventada', puntaje_total: 90 };

function lic(over: Partial<LicitacionDetail> = {}): LicitacionDetail {
  return {
    id: 'lic-1', numero_licitacion: 'LIC-1-2026-001', estado: 'adjudicacion_pendiente',
    ganador_ate_id: 'ate-1', carta_adjudicacion_url: null, ganador_es_fne: null, contrato_id: null,
    ...over,
  } as unknown as LicitacionDetail;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/ates')) return { ok: true, json: async () => ({ data: { ates: [ATE] } }) };
    if (url.endsWith('/generate-carta')) return { ok: true, json: async () => ({ data: { url: null } }) };
    return { ok: true, json: async () => ({ data: {} }) };
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Step 6 — the foundation award waits for the Carta', () => {
  it('disables «Sí — Proveedor FNE» with the reason while no Carta exists; external stays enabled', async () => {
    render(<Step6Adjudicacion licitacion={lic()} isAdmin onRefresh={vi.fn()} />);
    const fne = await screen.findByRole('button', { name: /Proveedor FNE/ });
    expect(fne).toBeDisabled();
    expect(screen.getByText('Genere la Carta de adjudicación antes de confirmar la adjudicación.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proveedor Externo/ })).toBeEnabled();
  });

  it('enables it once the tender carries a generated Carta', async () => {
    render(<Step6Adjudicacion licitacion={lic({ carta_adjudicacion_url: 'licitaciones/x/c.docx' })} isAdmin onRefresh={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Proveedor FNE/ })).toBeEnabled();
    expect(screen.queryByText('Genere la Carta de adjudicación antes de confirmar la adjudicación.')).not.toBeInTheDocument();
  });
});

describe('Step 7 — a stuck contrato_pendiente tender is offered the Carta', () => {
  const stuck = () => lic({ estado: 'contrato_pendiente', ganador_es_fne: true });

  it('offers the Admin «Generar Carta de adjudicación», which calls the Carta route and refreshes', async () => {
    const onRefresh = vi.fn();
    render(<Step7Contrato licitacion={stuck()} isAdmin onRefresh={onRefresh} />);
    expect(screen.getByText(/Carta de adjudicación generada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generar Carta de adjudicación/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/licitaciones/lic-1/generate-carta'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('tells a non-admin that an administrator must generate it (no dead message)', () => {
    render(<Step7Contrato licitacion={stuck()} isAdmin={false} onRefresh={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Generar Carta de adjudicación/ })).not.toBeInTheDocument();
    expect(screen.getByText(/un administrador debe generar la Carta de adjudicación/i)).toBeInTheDocument();
  });

  it('no longer asks for a signed upload', () => {
    render(<Step7Contrato licitacion={stuck()} isAdmin onRefresh={vi.fn()} />);
    expect(screen.queryByText(/firmada/)).not.toBeInTheDocument();
  });
});

describe('Step 7 — the awarded amount in the tender\'s currency (LIC-B8)', () => {
  it('writes a UF award with two decimals and a peso award with the dollar sign', () => {
    const { unmount } = render(
      <Step7Contrato licitacion={lic({ estado: 'contrato_generado', tipo_moneda: 'UF', monto_adjudicado_uf: 1200.5 })} isAdmin onRefresh={vi.fn()} />
    );
    expect(screen.getByText('UF 1.200,50')).toBeInTheDocument();
    unmount();
    render(<Step7Contrato licitacion={lic({ estado: 'cerrada', tipo_moneda: 'CLP', monto_adjudicado_uf: 35000000 })} isAdmin onRefresh={vi.fn()} />);
    expect(screen.getByText('$35.000.000')).toBeInTheDocument();
    expect(screen.queryByText(/CLP 35/)).not.toBeInTheDocument();
  });
});
