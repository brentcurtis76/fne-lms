// @vitest-environment jsdom
// The month-title defect shows only behind UTC: run this file on Chile's clock.
process.env.TZ = 'America/Santiago';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CashFlowView uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

// GES-3.3 / GES-3.12 / GES-3.4 (F21a): in «Flujo de caja» the invoice decides
// what is paid, «Vencida» and the overdue card go by the day in Chile and only
// count contracts in the flow, and the month titles are the right month.
// Same harness as CashFlowView.uf.test.tsx. All ids, names and amounts are invented.

const { svc, updates } = vi.hoisted(() => ({
  svc: { getCurrentUF: vi.fn(), getProjectedUF: vi.fn() },
  updates: [] as Array<{ table: string; payload: unknown; id: unknown }>,
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  default: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@supabase/auth-helpers-react', () => {
  const client = {
    storage: { from: vi.fn() },
    from: (table: string) => {
      const entry: { table: string; payload: unknown; id: unknown } = { table, payload: undefined, id: undefined };
      const chain: any = {
        update: (payload: unknown) => ((entry.payload = payload), chain),
        eq: (_c: string, v: unknown) => {
          entry.id = v;
          updates.push(entry);
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
  return { useSupabaseClient: () => client };
});
vi.mock('../../../lib/uf-service', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    default: {
      getCurrentUF: svc.getCurrentUF,
      getProjectedUF: svc.getProjectedUF,
      formatCurrency: actual.default.formatCurrency.bind(actual.default),
    },
  };
});

import CashFlowView from '../../../components/contracts/CashFlowView';

function dayInMonths(n: number, day: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + n, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const client = { nombre_legal: 'Colegio Inventado SpA', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0' };
const cuota = (over: Record<string, unknown>) => ({
  contrato_id: 'c1',
  monto_uf: 50,
  pagada: false,
  created_at: '2026-01-15T00:00:00Z',
  ...over,
});
const contrato = (over: Record<string, unknown>) => ({
  id: 'c1',
  numero_contrato: 'C-001',
  fecha_contrato: '2026-01-15',
  cliente_id: 'cl1',
  programa_id: 'p1',
  precio_total_uf: 100,
  tipo_moneda: 'UF' as const,
  incluir_en_flujo: true,
  estado: 'activo',
  clientes: client,
  programas: { nombre: 'Programa Inventado' },
  ...over,
});

// One UF contract of 100 UF, two cuotas next month: 30 UF paid by its invoice,
// 70 UF marked only the old way (pagada) with no invoice.
const paidContratos = () => [
  contrato({
    cuotas: [
      cuota({ id: 'q1', numero_cuota: 1, monto_uf: 30, fecha_vencimiento: dayInMonths(1, 10), factura_url: 'cuota_q1_1.pdf', factura_pagada: true }),
      cuota({ id: 'q2', numero_cuota: 2, monto_uf: 70, fecha_vencimiento: dayInMonths(1, 20), pagada: true }),
    ],
  }),
];

const valueUnder = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

beforeEach(() => {
  updates.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  svc.getCurrentUF.mockResolvedValue({ fecha: '2026-11-18', valor: 40000, source: 'live' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CashFlowView — the invoice decides what is paid', () => {
  it('«Total Pagado», «Pagado (período)», the pending totals and «% Cobrado» count only the cuota paid by its invoice', async () => {
    render(<CashFlowView contratos={paidContratos() as any} />);
    await waitFor(() => expect(valueUnder('Total de Contratos')).toBe('UF 100,00 ($4.000.000)'));
    expect(valueUnder('Total Pagado')).toBe('UF 30,00 ($1.200.000)');
    expect(valueUnder('Total Pendiente')).toBe('UF 70,00 ($2.800.000)');
    expect(valueUnder('Pagado (período)')).toMatch(/^UF 30,00 /);
    expect(valueUnder('Pendiente (período)')).toMatch(/^UF 70,00 /);
    expect(screen.getByText('30.0%')).toBeInTheDocument();
  });

  it('the badge says «Pagada» only for the cuota paid by its invoice', async () => {
    const user = userEvent.setup();
    render(<CashFlowView contratos={paidContratos() as any} />);
    await user.click(screen.getByText('Vista Detallada'));
    const rows = await screen.findAllByText(/^Cuota [12]$/);
    const row1 = rows.find((r) => r.textContent === 'Cuota 1')!.closest('tr')!;
    const row2 = rows.find((r) => r.textContent === 'Cuota 2')!.closest('tr')!;
    expect(within(row1).getByText('Pagada')).toBeInTheDocument();
    expect(within(row2).queryByText('Pagada')).toBeNull();
    expect(within(row2).getByText('Pendiente')).toBeInTheDocument();
  });

  it('the paid control is off with «Suba la factura primero» without an invoice, and writes factura_pagada with one', async () => {
    const user = userEvent.setup();
    const rowsData = [
      contrato({
        cuotas: [
          cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: dayInMonths(1, 10), factura_url: 'cuota_q1_1.pdf', factura_pagada: false }),
          cuota({ id: 'q2', numero_cuota: 2, fecha_vencimiento: dayInMonths(1, 20) }),
        ],
      }),
    ];
    render(<CashFlowView contratos={rowsData as any} />);
    await user.click(screen.getByText('Vista Detallada'));
    const without = await screen.findByTestId('cashflow-paid-toggle-q2');
    expect(without).toBeDisabled();
    expect(without).toHaveAttribute('title', 'Suba la factura primero');
    await user.click(without);
    expect(updates).toHaveLength(0);

    const withInvoice = screen.getByTestId('cashflow-paid-toggle-q1');
    expect(withInvoice).toBeEnabled();
    await user.click(withInvoice);
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({ table: 'cuotas', id: 'q1', payload: { factura_pagada: true } });
  });
});

describe('CashFlowView — overdue by the day in Chile, only contracts in the flow', () => {
  it('the overdue card leaves out a draft\'s, a cancelled and an out-of-flow contract\'s cuotas', async () => {
    const past = dayInMonths(-1, 10);
    const rowsData = [
      contrato({ id: 'c1', numero_contrato: 'C-001', cuotas: [cuota({ id: 'q1', contrato_id: 'c1', numero_cuota: 1, fecha_vencimiento: past })] }),
      contrato({ id: 'c2', numero_contrato: 'C-002', estado: 'borrador', cuotas: [cuota({ id: 'q2', contrato_id: 'c2', numero_cuota: 1, fecha_vencimiento: past })] }),
      contrato({ id: 'c3', numero_contrato: 'C-003', incluir_en_flujo: false, cuotas: [cuota({ id: 'q3', contrato_id: 'c3', numero_cuota: 1, fecha_vencimiento: past })] }),
      contrato({ id: 'c4', numero_contrato: 'C-004', estado: 'anulado', cuotas: [cuota({ id: 'q4', contrato_id: 'c4', numero_cuota: 1, fecha_vencimiento: past })] }),
      // overdue by date but paid by its invoice: not overdue
      contrato({ id: 'c5', numero_contrato: 'C-005', cuotas: [cuota({ id: 'q5', contrato_id: 'c5', numero_cuota: 1, fecha_vencimiento: past, factura_url: 'cuota_q5_1.pdf', factura_pagada: true })] }),
    ];
    render(<CashFlowView contratos={rowsData as any} />);
    expect(await screen.findByText('Cuotas Vencidas (1)')).toBeInTheDocument();
    expect(screen.getByText('Contrato C-001 - Cuota 1')).toBeInTheDocument();
    for (const n of ['C-002', 'C-003', 'C-004', 'C-005']) {
      expect(screen.queryByText(`Contrato ${n} - Cuota 1`)).toBeNull();
    }
  });

  it('a cuota due today is not «Vencida» at 22:00 Chile time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T01:00:00Z')); // 22:00 on 19 Nov in Chile
    const user = userEvent.setup();
    const rowsData = [contrato({ cuotas: [cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-11-19' })] })];
    render(<CashFlowView contratos={rowsData as any} />);
    await user.click(screen.getByText('Vista Detallada'));
    const row = (await screen.findByText('Cuota 1')).closest('tr')!;
    expect(within(row).getByText('Pendiente')).toBeInTheDocument();
    expect(within(row).queryByText('Vencida')).toBeNull();
    expect(screen.queryByText(/^Cuotas Vencidas \(/)).toBeNull();
  });
});

describe('CashFlowView — month titles', () => {
  it('a cuota due 2026-11-15 sits under «noviembre de 2026», not October', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
    const rowsData = [contrato({ cuotas: [cuota({ id: 'q1', numero_cuota: 1, fecha_vencimiento: '2026-11-15' })] })];
    render(<CashFlowView contratos={rowsData as any} />);
    const title = await screen.findByRole('heading', { level: 4, name: 'noviembre de 2026' });
    const card = title.parentElement!.parentElement!;
    expect(within(card).getByText('1 cuotas programadas')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 4, name: 'octubre de 2026' })).toBeNull();
  });
});
