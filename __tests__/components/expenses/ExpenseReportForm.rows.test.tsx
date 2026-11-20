// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F21h (GES-3.27, GES-3.32): an incomplete row stops the save and is named
 * («El gasto 2 no tiene categoría.»), a completely empty row is dropped
 * silently, and amounts are read the Chilean way with lib/money/parse-es-cl
 * («15.990» pesos is 15990; pesos refuse decimals; a foreign amount takes two).
 * Synthetic data only.
 */

const fake = vi.hoisted(() => ({ ref: null as any }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../../lib/currency-service', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    convertToCLP: async (amount: number, from: string) => {
      const rate = from === 'CLP' ? 1 : 950;
      return { originalAmount: amount, originalCurrency: from, convertedAmount: Math.round(amount * rate), conversionRate: rate, conversionDate: '2026-11-19' };
    },
  };
});

(globalThis as any).React = React;

import { toast } from 'react-hot-toast';
import ExpenseReportForm from '../../../components/expenses/ExpenseReportForm';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};

const CATEGORIES = [{ id: 'cat-1', name: 'Transporte', description: '', color: '#000000', is_active: true }];

beforeEach(() => {
  h.requests.length = 0;
  h.respond = (req, terminal) =>
    req.target === 'expense_reports' && terminal === 'single' ? { data: { id: 'new-1' }, error: null } : { data: null, error: null };
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

function renderNew() {
  const onSuccess = vi.fn();
  const view = render(<ExpenseReportForm categories={CATEGORIES} onSuccess={onSuccess} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('Ej: Gastos Marzo 2025'), { target: { value: 'Viaje sintético' } });
  const dates = view.container.querySelectorAll('input[type="date"]');
  fireEvent.change(dates[0], { target: { value: '2026-11-01' } });
  fireEvent.change(dates[1], { target: { value: '2026-11-10' } });
  return { ...view, onSuccess };
}

async function fillRow(container: HTMLElement, index: number, row: { category?: boolean; description?: string; date?: string; amount?: string; currency?: string }) {
  if (row.category) fireEvent.change(screen.getAllByDisplayValue('Seleccionar categoría')[0], { target: { value: 'cat-1' } });
  if (row.description) fireEvent.change(screen.getAllByPlaceholderText('Descripción del gasto')[index], { target: { value: row.description } });
  if (row.date) fireEvent.change(container.querySelectorAll('input[type="date"]')[2 + index], { target: { value: row.date } });
  if (row.currency) {
    fireEvent.change(container.querySelectorAll('select')[index * 2 + 1], { target: { value: row.currency } });
    await waitFor(() => expect(screen.getAllByText(new RegExp(`Monto \\(${row.currency}\\)`)).length).toBeGreaterThan(0));
  }
  if (row.amount !== undefined) {
    fireEvent.change(screen.getAllByTestId('expense-amount-input')[index], { target: { value: row.amount } });
    await waitFor(() => expect((screen.getAllByTestId('expense-amount-input')[index] as HTMLInputElement).value).toBe(row.amount));
  }
}

const itemInserts = () => h.requests.filter((r) => r.target === 'expense_items' && r.ops.some((o) => o.method === 'insert'));
const reportInsert = () => h.requests.find((r) => r.target === 'expense_reports' && r.ops.some((o) => o.method === 'insert'));
const writes = () => h.requests.filter((r) => r.kind === 'rpc' || r.ops.some((o) => ['insert', 'update', 'delete', 'upsert'].includes(o.method)));
const errors = () => vi.mocked(toast.error).mock.calls.map((c) => String(c[0]));

describe('F21h GES-3.27 an incomplete row stops the save and is named', () => {
  it('a row without a category: the save stops, the sentence names row and field, nothing is sent', async () => {
    const { container, onSuccess } = renderNew();
    await fillRow(container, 0, { category: true, description: 'Taxi', date: '2026-11-02', amount: '5000' });
    fireEvent.click(screen.getByText('Agregar Gasto'));
    await fillRow(container, 1, { description: 'Almuerzo', date: '2026-11-03', amount: '8000' });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(errors().join(' ')).toContain('El gasto 2 no tiene categoría.'));
    expect(writes()).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('names a row without amount, date or description', async () => {
    const { container } = renderNew();
    await fillRow(container, 0, { category: true, description: 'Taxi', date: '2026-11-02', amount: '5000' });
    fireEvent.click(screen.getByText('Agregar Gasto'));
    await fillRow(container, 1, { category: true });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(errors().length).toBeGreaterThan(0));
    const text = errors().join(' ');
    expect(text).toContain('El gasto 2 no tiene descripción.');
    expect(text).toContain('El gasto 2 no tiene monto.');
    expect(text).toContain('El gasto 2 no tiene fecha.');
    expect(writes()).toEqual([]);
  });

  it('an untouched empty row is dropped silently; the stored total counts only the rows sent', async () => {
    const { container, onSuccess } = renderNew();
    await fillRow(container, 0, { category: true, description: 'Taxi', date: '2026-11-02', amount: '5000' });
    fireEvent.click(screen.getByText('Agregar Gasto'));
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(errors()).toEqual([]);
    const items = opArgs(itemInserts()[0], 'insert')?.[0] as any[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: 'Taxi', amount: 5000 });
    expect((opArgs(reportInsert()!, 'insert')?.[0] as any[])[0].total_amount).toBe(5000);
  });
});

describe('F21h GES-3.32 amounts are read the Chilean way', () => {
  it('«15.990» in pesos is sent as 15990', async () => {
    const { container, onSuccess } = renderNew();
    await fillRow(container, 0, { category: true, description: 'Taxi', date: '2026-11-02', amount: '15.990' });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const items = opArgs(itemInserts()[0], 'insert')?.[0] as any[];
    expect(items[0].amount).toBe(15990);
    expect((opArgs(reportInsert()!, 'insert')?.[0] as any[])[0].total_amount).toBe(15990);
  });

  it('«15,99» in pesos is refused with the sentence and nothing is sent', async () => {
    const { container, onSuccess } = renderNew();
    await fillRow(container, 0, { category: true, description: 'Taxi', date: '2026-11-02', amount: '15,99' });
    expect(screen.getByText('Los montos en pesos no llevan decimales.')).toBeTruthy();
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(errors().join(' ')).toContain('Los montos en pesos no llevan decimales.'));
    expect(writes()).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('a foreign amount «12,50» is read with two decimals as 12.5', async () => {
    const { container, onSuccess } = renderNew();
    await fillRow(container, 0, { category: true, description: 'Hotel', date: '2026-11-02', currency: 'USD', amount: '12,50' });
    fireEvent.click(screen.getByText('Guardar Reporte'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const items = opArgs(itemInserts()[0], 'insert')?.[0] as any[];
    expect(items[0]).toMatchObject({ currency: 'USD', original_amount: 12.5, amount: 11875, conversion_rate: 950 });
  });
});
