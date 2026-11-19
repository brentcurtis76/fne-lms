// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

// GES-3.3 / GES-3.12 (F21a): in the contract's details window the invoice
// decides «Pagada», «Vencida» goes by the day in Chile, and the paid control
// needs an invoice. All ids, names and amounts are invented.

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  default: { error: vi.fn(), success: vi.fn() },
}));

import ContractDetailsModal from '../../../components/contracts/ContractDetailsModal';

const cuota = (over: Record<string, unknown>) => ({
  contrato_id: 'c1',
  monto_uf: 50,
  pagada: false,
  created_at: '2026-01-15T00:00:00Z',
  ...over,
});

const makeContrato = (cuotas: unknown[]) => ({
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
  incluir_en_flujo: true,
  es_manual: false,
  clientes: {
    id: 'cl1', nombre_legal: 'Colegio Inventado SpA', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0',
    direccion: 'Calle Uno 123', comuna: 'Providencia', ciudad: 'Santiago', nombre_representante: 'Rep Inventado',
  },
  programas: {
    id: 'p1', nombre: 'Programa Inventado', descripcion: 'Descripción', horas_totales: 100, modalidad: 'mixta', codigo_servicio: 'PI-1',
  },
  cuotas,
});

const renderModal = (cuotas: unknown[]) =>
  render(
    <ContractDetailsModal
      contrato={makeContrato(cuotas) as any}
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
    />,
  );

const badgeOf = (n: number) =>
  screen.getByText(`Cuota ${n}`).closest('tr')!.querySelector('span.rounded-full')!.textContent;

afterEach(() => {
  vi.useRealTimers();
});

describe('ContractDetailsModal — the invoice decides, by the day in Chile', () => {
  it('«Pagada» only for a cuota whose invoice is marked paid; the old mark alone reads as not paid', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T15:00:00Z'));
    renderModal([
      cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-12-15', factura_url: 'invoice_q1_1.pdf', factura_pagada: true }),
      cuota({ id: 'q2', numero_cuota: 2, fecha_vencimiento: '2026-12-15', pagada: true }),
      cuota({ id: 'q3', numero_cuota: 3, fecha_vencimiento: '2026-12-15', factura_pagada: true }),
    ]);
    expect(badgeOf(1)).toBe('Pagada');
    expect(badgeOf(2)).toBe('Pendiente');
    expect(badgeOf(3)).toBe('Pendiente');
  });

  it('a cuota due today is «Pendiente» at 22:00 Chile time; one due yesterday is «Vencida»', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T01:00:00Z')); // 22:00 on 19 Nov in Chile
    renderModal([
      cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-11-19' }),
      cuota({ id: 'q2', numero_cuota: 2, fecha_vencimiento: '2026-11-18' }),
    ]);
    expect(badgeOf(1)).toBe('Pendiente');
    expect(badgeOf(2)).toBe('Vencida');
  });

  it('the paid control is off with «Suba la factura primero» without an invoice and on with one', () => {
    renderModal([
      cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-12-15', factura_url: 'invoice_q1_1.pdf', factura_pagada: false }),
      cuota({ id: 'q2', numero_cuota: 2, fecha_vencimiento: '2026-12-15', pagada: true }),
    ]);
    const without = screen.getByTestId('details-paid-toggle-q2');
    expect(without).toBeDisabled();
    expect(without).toHaveAttribute('title', 'Suba la factura primero');
    const withInvoice = screen.getByTestId('details-paid-toggle-q1');
    expect(withInvoice).toBeEnabled();
    expect(withInvoice).toHaveAttribute('title', 'Marcar como pagado');
  });
});

describe('ContractDetailsModal — a replaced invoice in the same window (send-back 1)', () => {
  // The page's handlers, as a stand-in that keeps the contract in state: delete
  // clears the invoice (and its paid mark), upload stores a new one; each then
  // gives the window the refreshed contract, as refreshContratos does.
  function Harness() {
    const [contrato, setContrato] = React.useState(() =>
      makeContrato([
        cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-12-15', factura_url: 'invoice_q1_1.pdf', factura_filename: 'factura-vieja.pdf', factura_pagada: false }),
      ]),
    );
    const setCuota = (patch: Record<string, unknown>) =>
      setContrato((prev) => ({ ...prev, cuotas: prev.cuotas.map((q: any) => ({ ...q, ...patch })) }));
    return (
      <ContractDetailsModal
        contrato={contrato as any}
        isOpen
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleCashFlow={vi.fn()}
        onUploadContract={vi.fn()}
        onActivateWithoutDocument={vi.fn(async () => true)}
        onMarkSigned={vi.fn()}
        onGeneratePDF={vi.fn()}
        onUploadInvoice={async (_id: string, file: File) => {
          await Promise.resolve();
          setCuota({ factura_url: 'invoice_q1_2.pdf', factura_filename: file.name, factura_pagada: false });
        }}
        onTogglePaymentStatus={vi.fn(async () => {})}
        onDeleteInvoice={async () => {
          await Promise.resolve();
          setCuota({ factura_url: null, factura_filename: null, factura_pagada: false });
        }}
        isAdmin
      />
    );
  }

  it('delete the invoice, upload a replacement without closing: the replacement shows and the paid control is on', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByTitle('Eliminar factura'));
    await user.click(screen.getByRole('button', { name: 'Eliminar Factura' }));
    await waitFor(() => expect(screen.getByTestId('details-paid-toggle-q1')).toBeDisabled());

    const input = container.querySelector('input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'factura-nueva.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText('factura-nueva.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-view-q1')).toBeInTheDocument();
    const toggle = screen.getByTestId('details-paid-toggle-q1');
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('title', 'Marcar como pagado');
  });

  it('a refresh of the same contract that brings the cuota WITH a new invoice shows it, even without an upload here', async () => {
    const user = userEvent.setup();
    const props = (url: string | null, name: string | null) => ({
      contrato: makeContrato([
        cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-12-15', factura_url: url, factura_filename: name, factura_pagada: false }),
      ]) as any,
      isOpen: true,
      onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggleCashFlow: vi.fn(), onUploadContract: vi.fn(),
      onActivateWithoutDocument: vi.fn(async () => true), onMarkSigned: vi.fn(), onGeneratePDF: vi.fn(),
      onUploadInvoice: vi.fn(async () => {}), onTogglePaymentStatus: vi.fn(async () => {}),
      onDeleteInvoice: vi.fn(async () => {}), isAdmin: true,
    });
    const { rerender } = render(<ContractDetailsModal {...props('invoice_q1_1.pdf', 'factura-vieja.pdf')} />);
    await user.click(screen.getByTitle('Eliminar factura'));
    await user.click(screen.getByRole('button', { name: 'Eliminar Factura' }));
    // the same row still carries the old invoice: it stays hidden
    rerender(<ContractDetailsModal {...props('invoice_q1_1.pdf', 'factura-vieja.pdf')} />);
    expect(screen.queryByText('factura-vieja.pdf')).toBeNull();
    // a refresh brings a new invoice: shown, and the paid control is on
    rerender(<ContractDetailsModal {...props('invoice_q1_2.pdf', 'factura-nueva.pdf')} />);
    expect(await screen.findByText('factura-nueva.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('details-paid-toggle-q1')).toBeEnabled();
  });

  it('send-back 2: delete A, its reload fails (A still in the props), a replacement upload fails → still «Subir factura», paid control off', async () => {
    const user = userEvent.setup();
    const contrato = makeContrato([
      cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-12-15', factura_url: 'invoice_q1_1.pdf', factura_filename: 'factura-vieja.pdf', factura_pagada: false }),
    ]);
    const props = {
      contrato: contrato as any,
      isOpen: true,
      onClose: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onToggleCashFlow: vi.fn(), onUploadContract: vi.fn(),
      onActivateWithoutDocument: vi.fn(async () => true), onMarkSigned: vi.fn(), onGeneratePDF: vi.fn(),
      // the page's handlers catch their own errors and resolve; nothing is reloaded
      onUploadInvoice: vi.fn(async () => {}), onTogglePaymentStatus: vi.fn(async () => {}),
      onDeleteInvoice: vi.fn(async () => {}), isAdmin: true,
    };
    const { container } = render(<ContractDetailsModal {...props} />);
    await user.click(screen.getByTitle('Eliminar factura'));
    await user.click(screen.getByRole('button', { name: 'Eliminar Factura' }));
    await waitFor(() => expect(screen.queryByText('factura-vieja.pdf')).toBeNull());

    const input = container.querySelector('input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'factura-nueva.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(props.onUploadInvoice).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText('factura-vieja.pdf')).toBeNull();
    expect(screen.getByTitle('Subir factura')).toBeInTheDocument();
    const toggle = screen.getByTestId('details-paid-toggle-q1');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('title', 'Suba la factura primero');
  });
});

