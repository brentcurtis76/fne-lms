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
    getCurrentUF: vi.fn(async () => ({ valor: 37500, fecha: '2026-11-18', source: 'live' })),
    getProjectedUF: vi.fn(async () => ({ valor: 37500 })),
    formatCurrency: (n: number, c: string) => `${c} ${Math.round(n)}`,
  },
  // F15d send-back 1: the screen projects with projectUF (same number as the fake getProjectedUF).
  projectUF: vi.fn((base: { source: string }, fecha: string) => ({ fecha, valor: 37500, source: base.source })),
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
let reservedTab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };

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
  reservedTab = { opener: {}, location: { href: '' }, close: vi.fn() };
  openMock = vi.fn(() => reservedTab);
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
    await waitFor(() => expect(reservedTab.location.href).toBe(SIGNED));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/invoice-link?cuotaId=${CUOTA}`);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
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
    expect(reservedTab.location.href).toBe(SIGNED);
  });

  it.each([
    ['a refused request', () => ({ ok: false, json: async () => ({ error: 'Factura no encontrada' }) })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('%s → toast «No se pudo abrir la factura», the reserved tab is closed, nothing opened', async (_l, answer) => {
    fetchMock.mockImplementation(answer as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user, control } = await renderDetailed();
    await user.click(control);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudo abrir la factura'));
    expect(reservedTab.close).toHaveBeenCalledTimes(1);
    expect(reservedTab.location.href).toBe('');
  });
});

// GES-1.4 (F2c, send-back 1): the new tab is reserved DURING the click, so a
// slow link request cannot leave the browser blocking a late window.open.
describe('CashFlowView — «Ver» reserves the tab during the click', () => {
  const BLOCKED = 'El navegador bloqueó la ventana. Permite las ventanas emergentes para ver la factura.';

  it('a late window.open is blocked: the reserved tab is sent to the answered link', async () => {
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    let resolved = false;
    fetchMock.mockImplementation(async () => {
      resolved = true;
      return okResponse();
    });
    openMock.mockImplementation((url?: string) => (!url && !resolved ? tab : null));
    const { user, control } = await renderDetailed();
    await user.click(control);
    await waitFor(() => expect(tab.location.href).toBe(SIGNED));
    expect(tab.opener).toBeNull();
    expect(tab.close).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('pop-ups blocked outright: the person is told, and no request is made', async () => {
    openMock.mockImplementation(() => null);
    const { user, control } = await renderDetailed();
    await user.click(control);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(BLOCKED));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
