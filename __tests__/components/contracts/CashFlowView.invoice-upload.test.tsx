// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// CashFlowView uses the automatic JSX runtime and doesn't import React, but
// vitest's esbuild transform here is classic — provide the global it expects.
(globalThis as any).React = React;

// GES-1.4 (F2c, A3): an invoice uploaded from «Flujo de caja» is stored by its
// file NAME in cuotas.factura_url (only that column, as before); the store is
// never asked for a public address. All ids and names are invented.

const { calls } = vi.hoisted(() => ({
  calls: { storage: [] as Array<{ bucket: string; op: string; arg: unknown }>, updates: [] as Array<Record<string, any>> },
}));

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@supabase/auth-helpers-react', () => {
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (name: string) => {
          calls.storage.push({ bucket, op: 'upload', arg: name });
          return { data: { path: name }, error: null };
        },
        getPublicUrl: (name: string) => {
          calls.storage.push({ bucket, op: 'getPublicUrl', arg: name });
          return { data: { publicUrl: `https://example-project.supabase.co/storage/v1/object/public/${bucket}/${name}` } };
        },
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
vi.mock('../../../lib/uf-service', () => ({
  default: {
    getCurrentUF: vi.fn(async () => ({ valor: 37500 })),
    getProjectedUF: vi.fn(async () => ({ valor: 37500 })),
    formatCurrency: (n: number, c: string) => `${c} ${Math.round(n)}`,
  },
}));

import CashFlowView from '../../../components/contracts/CashFlowView';
import { invoiceObjectName } from '../../../lib/contracts/invoice-path';

const CUOTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function nextMonthDay(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

const contratos = [
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
        factura_url: undefined,
      },
    ],
  },
];

beforeEach(() => {
  calls.storage = [];
  calls.updates = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('CashFlowView — an uploaded invoice is stored by name', () => {
  it('writes the uploaded file NAME to factura_url and asks for no public address', async () => {
    const user = userEvent.setup();
    const { container } = render(<CashFlowView contratos={contratos as any} />);
    await user.click(screen.getByText('Vista Detallada'));
    await waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'factura-abril.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(calls.updates.filter((u) => u.table === 'cuotas')).toHaveLength(1));
    const uploaded = calls.storage.find((c) => c.op === 'upload')!;
    expect(uploaded.bucket).toBe('facturas');
    expect(uploaded.arg).toMatch(new RegExp(`^cuota_${CUOTA}_\\d+\\.pdf$`));
    expect(calls.updates[0]).toEqual({ table: 'cuotas', id: CUOTA, payload: { factura_url: uploaded.arg } });
    expect(calls.storage.some((c) => c.op === 'getPublicUrl')).toBe(false);
  });

  it('send-back 1: a file with a 250-letter extension gets a stored name the link route accepts', async () => {
    const user = userEvent.setup();
    const { container } = render(<CashFlowView contratos={contratos as any} />);
    await user.click(screen.getByText('Vista Detallada'));
    await waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'a.' + 'x'.repeat(250), { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => expect(calls.updates.filter((u) => u.table === 'cuotas')).toHaveLength(1));
    const uploaded = calls.storage.find((c) => c.op === 'upload')!;
    expect(uploaded.arg).toMatch(new RegExp(`^cuota_${CUOTA}_\\d+\\.xxxxxxxxxx$`));
    expect(invoiceObjectName(uploaded.arg)).toBe(uploaded.arg);
    expect(calls.updates[0].payload).toEqual({ factura_url: uploaded.arg });
  });
});
