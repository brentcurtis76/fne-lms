// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CashFlowView uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

// GES-1.4 (F2c, A2): in «Flujo de caja», the detailed view's «Ver» asks
// /api/contracts/invoice-link?cuotaId=<id> on press and opens the five-minute
// link it answers; the stored address is never put into an href. Modelled on
// the receipts' «Ver boleta». All ids, names and addresses are invented.

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  toast: { error: mockToastError, success: vi.fn() },
  default: { error: mockToastError, success: vi.fn() },
}));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ storage: { from: vi.fn() }, from: vi.fn() }),
}));
vi.mock('../../../lib/uf-service', () => ({
  default: {
    getCurrentUF: vi.fn(async () => ({ valor: 37500 })),
    getProjectedUF: vi.fn(async () => ({ valor: 37500 })),
    formatCurrency: (n: number, c: string) => `${c} ${Math.round(n)}`,
  },
}));

import CashFlowView from '../../../components/contracts/CashFlowView';

const CUOTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STORED = `https://example-project.supabase.co/storage/v1/object/public/facturas/cuota_${CUOTA}_1700000000000.pdf`;
const SIGNED = 'https://example-project.supabase.co/storage/v1/object/sign/facturas/cuota_x.pdf?token=fresh';

function nextMonthDay(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

const contratos = () => [
  {
    id: 'c1',
    numero_contrato: 'C-001',
    fecha_contrato: '2026-01-15',
    cliente_id: 'cl1',
    programa_id: 'p1',
    precio_total_uf: 100,
    tipo_moneda: 'UF' as const,
    incluir_en_flujo: true,
    clientes: { nombre_legal: 'Colegio Inventado SpA', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0' },
    programas: { nombre: 'Programa Inventado' },
    cuotas: [
      {
        id: CUOTA,
        contrato_id: 'c1',
        numero_cuota: 1,
        fecha_vencimiento: nextMonthDay(),
        monto_uf: 50,
        pagada: false,
        created_at: '2026-01-15T00:00:00Z',
        factura_url: STORED,
      },
    ],
  },
];

const okResponse = () => ({ ok: true, json: async () => ({ url: SIGNED, expiresIn: 300 }) });

let fetchMock: ReturnType<typeof vi.fn>;
let openMock: ReturnType<typeof vi.fn>;

async function renderDetailed() {
  const user = userEvent.setup();
  const view = render(<CashFlowView contratos={contratos() as any} />);
  await user.click(screen.getByText('Vista Detallada'));
  const control = await screen.findByText('Ver', { exact: true });
  return { user, control, container: view.container };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal('fetch', fetchMock);
  openMock = vi.fn();
  window.open = openMock as any;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CashFlowView — «Ver» opens the invoice through the link route', () => {
  it('no stored address is put into any href; the control keeps its text and gets its testid', async () => {
    const { control, container } = await renderDetailed();
    const hrefs = Array.from(container.querySelectorAll('[href]')).map((el) => el.getAttribute('href'));
    expect(hrefs.some((href) => href?.includes('facturas'))).toBe(false);
    expect(control).toHaveAttribute('data-testid', `invoice-view-${CUOTA}`);
  });

  it('pressing «Ver» asks the route and opens the answered link in a new tab', async () => {
    const { user, control } = await renderDetailed();
    await user.click(control);
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/invoice-link?cuotaId=${CUOTA}`);
    expect(openMock.mock.calls[0][0]).toBe(SIGNED);
    expect(openMock.mock.calls[0][1]).toBe('_blank');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('the control is disabled while the request is in flight', async () => {
    let answer: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const { user, control } = await renderDetailed();
    await user.click(control);
    await waitFor(() => expect(screen.getByText('Ver', { exact: true })).toBeDisabled());
    answer(okResponse());
    await waitFor(() => expect(screen.getByText('Ver', { exact: true })).not.toBeDisabled());
    expect(openMock).toHaveBeenCalledWith(SIGNED, '_blank');
  });

  it.each([
    ['a refused request', () => ({ ok: false, json: async () => ({ error: 'Factura no encontrada' }) })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('%s → toast «No se pudo abrir la factura», nothing opened', async (_l, answer) => {
    fetchMock.mockImplementation(answer as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user, control } = await renderDetailed();
    await user.click(control);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudo abrir la factura'));
    expect(openMock).not.toHaveBeenCalled();
  });
});
