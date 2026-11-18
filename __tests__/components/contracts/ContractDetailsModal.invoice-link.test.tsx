// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GES-1.4 (F2c, A2): in the contract's details, «Ver factura» and «Descargar
// factura» ask /api/contracts/invoice-link?cuotaId=<id> on press and open the
// five-minute link it answers; the stored address is never put into an href.
// Modelled on the receipts' «Ver boleta» (components/expenses/
// ExpenseReportDetails.tsx). All ids, names and addresses are invented.

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  toast: { error: mockToastError, success: vi.fn() },
  default: { error: mockToastError, success: vi.fn() },
}));

import ContractDetailsModal from '../../../components/contracts/ContractDetailsModal';

const CUOTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STORED = `https://example-project.supabase.co/storage/v1/object/public/facturas/invoice_${CUOTA}_1700000000000.pdf`;
const SIGNED = 'https://example-project.supabase.co/storage/v1/object/sign/facturas/invoice_x.pdf?token=fresh';

const makeContrato = () => ({
  id: 'c1',
  numero_contrato: 'C-001',
  fecha_contrato: '2026-01-15',
  fecha_fin: '2026-12-15',
  cliente_id: 'cl1',
  programa_id: 'p1',
  precio_total_uf: 100,
  tipo_moneda: 'UF' as const,
  firmado: true,
  estado: 'activo' as const,
  incluir_en_flujo: false,
  contrato_url: undefined,
  es_manual: false,
  clientes: {
    id: 'cl1',
    nombre_legal: 'Colegio Inventado SpA',
    nombre_fantasia: 'Colegio Inventado',
    rut: '76.000.000-0',
    direccion: 'Calle Uno 123',
    comuna: 'Providencia',
    ciudad: 'Santiago',
    nombre_representante: 'Rep Inventado',
  },
  programas: {
    id: 'p1',
    nombre: 'Programa Inventado',
    descripcion: 'Descripción',
    horas_totales: 100,
    modalidad: 'mixta',
    codigo_servicio: 'PI-1',
  },
  cuotas: [
    {
      id: CUOTA,
      contrato_id: 'c1',
      numero_cuota: 1,
      fecha_vencimiento: '2026-03-15',
      monto_uf: 50,
      pagada: false,
      created_at: '2026-01-15T00:00:00Z',
      factura_url: STORED,
      factura_filename: 'factura-marzo.pdf',
      factura_size: 1024,
      factura_type: 'application/pdf',
      factura_uploaded_at: '2026-03-01T12:00:00Z',
    },
  ],
});

const renderModal = () =>
  render(
    <ContractDetailsModal
      contrato={makeContrato() as any}
      isOpen
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggleCashFlow={vi.fn()}
      onUploadContract={vi.fn()}
      onActivateWithoutDocument={vi.fn(async () => true)}
      onMarkSigned={vi.fn()}
      onGeneratePDF={vi.fn()}
      onUploadInvoice={vi.fn(async () => {})}
      onTogglePaymentStatus={vi.fn(async () => {})}
      onDeleteInvoice={vi.fn(async () => {})}
      isAdmin
    />
  );

const okResponse = () => ({ ok: true, json: async () => ({ url: SIGNED, expiresIn: 300 }) });

let fetchMock: ReturnType<typeof vi.fn>;
let openMock: ReturnType<typeof vi.fn>;
let reservedTab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal('fetch', fetchMock);
  reservedTab = { opener: {}, location: { href: '' }, close: vi.fn() };
  openMock = vi.fn(() => reservedTab);
  vi.stubGlobal('open', openMock);
  window.open = openMock as any;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ContractDetailsModal — invoices open through the link route', () => {
  it('no stored address is put into any href', () => {
    const { container } = renderModal();
    const hrefs = Array.from(container.querySelectorAll('[href]')).map((el) => el.getAttribute('href'));
    expect(hrefs.some((href) => href?.includes('facturas'))).toBe(false);
    expect(screen.getByTestId(`invoice-view-${CUOTA}`)).toHaveAttribute('title', 'Ver factura');
    expect(screen.getByTestId(`invoice-download-${CUOTA}`)).toHaveAttribute('title', 'Descargar factura');
  });

  it('«Ver factura» asks the route and opens the answered link in a new tab', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTitle('Ver factura'));
    await waitFor(() => expect(reservedTab.location.href).toBe(SIGNED));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/invoice-link?cuotaId=${CUOTA}`);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('«Descargar factura» asks the route with download=1 and sends the current window to the answered link', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const createSpy = vi.spyOn(document, 'createElement');
    renderModal();
    createSpy.mockClear();
    await user.click(screen.getByTitle('Descargar factura'));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith(SIGNED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/invoice-link?cuotaId=${CUOTA}&download=1`);
    expect(openMock).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalledWith('a');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('«Descargar factura» is disabled while its request is in flight', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    let answer: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    renderModal();
    await user.click(screen.getByTestId(`invoice-download-${CUOTA}`));
    await waitFor(() => expect(screen.getByTestId(`invoice-download-${CUOTA}`)).toBeDisabled());
    answer(okResponse());
    await waitFor(() => expect(screen.getByTestId(`invoice-download-${CUOTA}`)).not.toBeDisabled());
    expect(assign).toHaveBeenCalledWith(SIGNED);
  });

  it('the control is disabled while the request is in flight', async () => {
    const user = userEvent.setup();
    let answer: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    renderModal();
    await user.click(screen.getByTestId(`invoice-view-${CUOTA}`));
    await waitFor(() => expect(screen.getByTestId(`invoice-view-${CUOTA}`)).toBeDisabled());
    answer(okResponse());
    await waitFor(() => expect(screen.getByTestId(`invoice-view-${CUOTA}`)).not.toBeDisabled());
    expect(reservedTab.location.href).toBe(SIGNED);
  });

  it.each([
    ['a refused request', () => ({ ok: false, json: async () => ({ error: 'Factura no encontrada' }) })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('%s → toast «No se pudo abrir la factura», the reserved tab is closed, nothing opened', async (_l, answer) => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(answer as any);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderModal();
    await user.click(screen.getByTitle('Ver factura'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('No se pudo abrir la factura'));
    await user.click(screen.getByTitle('Descargar factura'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(2));
    expect(reservedTab.close).toHaveBeenCalledTimes(1);
    expect(reservedTab.location.href).toBe('');
    expect(clickSpy).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

// GES-1.4 (F2c, send-back 1): the new tab is reserved DURING the click, so a
// slow link request cannot leave the browser blocking a late window.open.
describe('ContractDetailsModal — «Ver factura» reserves the tab during the click', () => {
  const BLOCKED = 'El navegador bloqueó la ventana. Permite las ventanas emergentes para ver la factura.';

  it('a late window.open is blocked: the reserved tab is sent to the answered link', async () => {
    const user = userEvent.setup();
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    let resolved = false;
    fetchMock.mockImplementation(async () => {
      resolved = true;
      return okResponse();
    });
    openMock.mockImplementation((url?: string) => (!url && !resolved ? tab : null));
    renderModal();
    await user.click(screen.getByTitle('Ver factura'));
    await waitFor(() => expect(tab.location.href).toBe(SIGNED));
    expect(tab.opener).toBeNull();
    expect(tab.close).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('pop-ups blocked outright: the person is told, and no request is made', async () => {
    const user = userEvent.setup();
    openMock.mockImplementation(() => null);
    renderModal();
    await user.click(screen.getByTitle('Ver factura'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(BLOCKED));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
