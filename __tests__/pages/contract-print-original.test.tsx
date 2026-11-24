// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).React = React;

/**
 * F26 (N146): the print page of an imported contract offers its original
 * document. «Descargar documento original» is a button that asks
 * /api/contracts/contract-link for a five-minute download link and sends the
 * current window to it (no permanent public address in the page). A failure
 * shows «No se pudo abrir el documento del contrato.». All data is invented.
 */

const CONTRATO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SIGNED = 'https://example-project.supabase.co/storage/v1/object/sign/contracts/x.pdf?token=fresh';

type Row = Record<string, any>;
let row: Row | null = null;

const fakeClient = {
  from: () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      single: () => chain,
      then: (ok: any, ko: any) =>
        Promise.resolve(row ? { data: { ...row }, error: null } : { data: null, error: { message: 'not found' } }).then(
          ok,
          ko
        ),
    };
    return chain;
  },
};

vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => fakeClient }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { id: CONTRATO_ID }, back: vi.fn() }) }));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));

import ContractPrintPage from '../../pages/contract-print/[id]';

const imported = (contrato_url: string | null): Row => ({
  id: CONTRATO_ID,
  numero_contrato: 'C-IMP-1',
  fecha_contrato: '2026-03-01',
  precio_total_uf: 10,
  tipo_moneda: 'UF',
  is_anexo: false,
  es_manual: true,
  programa_id: null,
  programas: null,
  contrato_url,
  clientes: { nombre_legal: 'Corporación de Ejemplo', nombre_fantasia: 'Colegio de Ejemplo' },
  cuotas: [],
});

let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: SIGNED, expiresIn: 300 }) }));
  vi.stubGlobal('fetch', fetchMock);
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('contract print page — the original document of an imported contract', () => {
  it('«Descargar documento original» is a button that downloads through the link route', async () => {
    row = imported('importado_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_1700000000000.pdf');
    const user = userEvent.setup();
    render(<ContractPrintPage />);
    const control = await screen.findByText('Descargar documento original');
    expect(control.tagName).toBe('BUTTON');
    expect(control).not.toHaveAttribute('href');
    expect(document.querySelector('a[href*="importado_"]')).toBeNull();

    await user.click(control);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(SIGNED));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/contract-link?contratoId=${CONTRATO_ID}&download=1`);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a failure shows «No se pudo abrir el documento del contrato.» and the window goes nowhere', async () => {
    row = imported('importado_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_1700000000000.pdf');
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({ error: 'Contrato no encontrado' }) }));
    const user = userEvent.setup();
    render(<ContractPrintPage />);
    await user.click(await screen.findByText('Descargar documento original'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo abrir el documento del contrato.');
    expect(assign).not.toHaveBeenCalled();
  });

  it('an imported contract without a file still says there is none, as before', async () => {
    row = imported(null);
    render(<ContractPrintPage />);
    expect(await screen.findByText(/No hay un documento original cargado/)).toBeInTheDocument();
    expect(screen.queryByText('Descargar documento original')).not.toBeInTheDocument();
  });
});
