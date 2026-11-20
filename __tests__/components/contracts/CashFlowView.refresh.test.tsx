// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// CashFlowView uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

// GES-3.15 (F21a): after an invoice upload or a paid mark made in «Flujo de
// caja», the page's reload of contracts is called and awaited, so the row
// shows the new state at once. Same harness as CashFlowView.invoice-upload.
// All ids and names are invented.

const { calls, svc } = vi.hoisted(() => ({
  calls: { updates: [] as Array<Record<string, any>> },
  svc: { getCurrentUF: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@supabase/auth-helpers-react', () => {
  const client = {
    storage: {
      from: () => ({
        upload: async (name: string) => ({ data: { path: name }, error: null }),
      }),
    },
    from: (table: string) => {
      const entry: Record<string, any> = { table };
      const chain: any = {
        update: (payload: unknown) => ((entry.payload = payload), chain),
        eq: (_c: string, v: unknown) => {
          entry.id = v;
          calls.updates.push(entry);
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
  return { useSupabaseClient: () => client };
});
vi.mock('../../../lib/uf-service', async (importOriginal) => ({
  todayInChile: ((await importOriginal()) as any).todayInChile,
  default: {
    getCurrentUF: svc.getCurrentUF,
    getProjectedUF: vi.fn(async () => ({ valor: 37500 })),
    formatCurrency: (n: number, c: string) => `${c} ${Math.round(n)}`,
  },
  projectUF: vi.fn((base: { source: string }, fecha: string) => ({ fecha, valor: 37500, source: base.source })),
}));

import CashFlowView from '../../../components/contracts/CashFlowView';

function nextMonthDay(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

const contratos = (cuota: Record<string, unknown>) => [
  {
    id: 'c1',
    numero_contrato: 'C-001',
    fecha_contrato: '2026-01-15',
    cliente_id: 'cl1',
    programa_id: 'p1',
    precio_total_uf: 100,
    tipo_moneda: 'UF' as const,
    incluir_en_flujo: true,
    estado: 'activo',
    clientes: { nombre_legal: 'Colegio Inventado SpA', nombre_fantasia: 'Colegio Inventado', rut: '76.000.000-0' },
    programas: { nombre: 'Programa Inventado' },
    cuotas: [
      { id: 'q1', contrato_id: 'c1', numero_cuota: 1, fecha_vencimiento: nextMonthDay(), monto_uf: 50, pagada: false, created_at: '2026-01-15T00:00:00Z', ...cuota },
    ],
  },
];

beforeEach(() => {
  calls.updates = [];
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  svc.getCurrentUF.mockResolvedValue({ valor: 37500, fecha: '2026-11-18', source: 'live' });
});

describe('CashFlowView — an action asks the page to reload its contracts', () => {
  it('after an invoice upload, onChanged is called once and awaited (the spinner stays until it ends)', async () => {
    let finish: () => void = () => {};
    const onChanged = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const { container } = render(<CashFlowView contratos={contratos({ factura_url: undefined }) as any} onChanged={onChanged} />);
    await user.click(screen.getByText('Vista Detallada'));
    await waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'factura-abril.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.updates).toHaveLength(1);
    // still uploading while the page reloads
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await act(async () => { finish(); });
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('after a paid mark, onChanged is called once and awaited', async () => {
    let finished = false;
    const onChanged = vi.fn(async () => { await Promise.resolve(); finished = true; });
    const user = userEvent.setup();
    render(<CashFlowView contratos={contratos({ factura_url: 'cuota_q1_1.pdf', factura_pagada: false }) as any} onChanged={onChanged} />);
    await user.click(screen.getByText('Vista Detallada'));
    await user.click(await screen.findByTestId('cashflow-paid-toggle-q1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.updates[0]).toEqual({ table: 'cuotas', id: 'q1', payload: { factura_pagada: true } });
    await waitFor(() => expect(finished).toBe(true));
  });

  it('the row shows the new state once the page gives the reloaded contracts', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CashFlowView contratos={contratos({ factura_url: 'cuota_q1_1.pdf', factura_pagada: false }) as any} onChanged={vi.fn(async () => {})} />);
    await user.click(screen.getByText('Vista Detallada'));
    const row = () => screen.getByText('Cuota 1').closest('tr')!;
    await waitFor(() => expect(row()).toHaveTextContent('Pendiente'));
    rerender(<CashFlowView contratos={contratos({ factura_url: 'cuota_q1_1.pdf', factura_pagada: true }) as any} onChanged={vi.fn(async () => {})} />);
    await waitFor(() => expect(row()).toHaveTextContent('Pagada'));
  });

  it('without onChanged (as before), the screen recomputes by itself', async () => {
    const user = userEvent.setup();
    render(<CashFlowView contratos={contratos({ factura_url: 'cuota_q1_1.pdf', factura_pagada: false }) as any} />);
    await user.click(screen.getByText('Vista Detallada'));
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByTestId('cashflow-paid-toggle-q1'));
    await waitFor(() => expect(svc.getCurrentUF).toHaveBeenCalledTimes(2));
  });
});
