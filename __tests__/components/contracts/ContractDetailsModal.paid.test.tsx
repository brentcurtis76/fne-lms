// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
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
