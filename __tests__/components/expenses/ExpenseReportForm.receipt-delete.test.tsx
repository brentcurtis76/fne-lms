// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F21h send-back 1, second part: deleting a receipt («Eliminar») changes only
 * the receipt fields of the row it was pressed on (by the row's stable key),
 * on the LATEST form state: text typed meanwhile stays; a row removed
 * meanwhile gets nothing and no error shows; while a row's delete runs, its
 * «Eliminar» is off. What happens to the stored file is unchanged.
 * Synthetic data only.
 */

const fake = vi.hoisted(() => ({ ref: null as any, pending: [] as Array<{ paths: string[]; resolve: () => void }> }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  fake.ref.client.storage = {
    from: () => ({
      remove: (paths: string[]) =>
        new Promise((resolve) => {
          fake.pending.push({ paths, resolve: () => resolve({ data: [], error: null }) });
        }),
    }),
  };
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});

(globalThis as any).React = React;

import { toast } from 'react-hot-toast';
import ExpenseReportForm from '../../../components/expenses/ExpenseReportForm';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};
const CATEGORIES = [{ id: 'cat-1', name: 'Transporte', description: '', color: '#000000', is_active: true }];
const item = (id: string, description: string, receipt?: string) => ({
  id, report_id: 'r-1', category_id: 'cat-1', description, amount: 1000, currency: 'CLP', original_amount: 1000,
  conversion_rate: 1, expense_date: '2026-11-02', vendor: '', expense_number: '', notes: '',
  receipt_url: receipt ? `boletas/${receipt}` : null, receipt_filename: receipt ?? null,
});
const report = () => ({
  id: 'r-1', report_name: 'Viaje sintético', description: '', start_date: '2026-11-01', end_date: '2026-11-10', status: 'draft',
  expense_items: [item('i-1', 'Taxi', 'boleta-taxi.pdf'), item('i-2', 'Hotel')],
});

beforeEach(() => {
  h.requests.length = 0;
  h.respond = () => ({ data: null, error: null });
  fake.pending.length = 0;
  vi.mocked(toast.error).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const deleteButtons = () => screen.queryAllByTitle('Eliminar y reemplazar') as HTMLButtonElement[];

describe('F21h send-back 1 deleting a receipt keeps what was typed meanwhile', () => {
  it('text typed in another row and in the same row while the delete runs is still there; only the receipt goes', async () => {
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} editingReport={report()} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/boleta-taxi\.pdf/)).toBeTruthy());
    fireEvent.click(deleteButtons()[0]);
    await waitFor(() => expect(fake.pending).toHaveLength(1));
    expect(fake.pending[0].paths).toEqual(['boleta-taxi.pdf']);

    fireEvent.change(screen.getByDisplayValue('Taxi'), { target: { value: 'Taxi al aeropuerto' } });
    fireEvent.change(screen.getByDisplayValue('Hotel'), { target: { value: 'Hotel Sintético' } });

    await act(async () => fake.pending[0].resolve());
    await waitFor(() => expect(screen.queryByText(/boleta-taxi\.pdf/)).toBeNull());
    expect(screen.getByDisplayValue('Taxi al aeropuerto')).toBeTruthy();
    expect(screen.getByDisplayValue('Hotel Sintético')).toBeTruthy();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(2);
    const update = h.requests.find((r) => r.target === 'expense_items' && r.ops.some((o) => o.method === 'update'))!;
    expect(update.ops.find((o) => o.method === 'eq')!.args).toEqual(['id', 'i-1']);
  });

  it('while a row\'s delete runs, its «Eliminar» is off', async () => {
    render(<ExpenseReportForm categories={CATEGORIES} editingReport={report()} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/boleta-taxi\.pdf/)).toBeTruthy());
    fireEvent.click(deleteButtons()[0]);
    await waitFor(() => expect(deleteButtons()[0].disabled).toBe(true));
    fireEvent.click(deleteButtons()[0]);
    expect(fake.pending).toHaveLength(1);
    await act(async () => fake.pending[0].resolve());
    await waitFor(() => expect(deleteButtons()).toHaveLength(0));
  });

  it('the row removed while its receipt delete runs: no error, nothing written to the form', async () => {
    const { container } = render(<ExpenseReportForm categories={CATEGORIES} editingReport={report()} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/boleta-taxi\.pdf/)).toBeTruthy());
    fireEvent.click(deleteButtons()[0]);
    await waitFor(() => expect(fake.pending).toHaveLength(1));
    fireEvent.click(screen.getAllByTitle('Eliminar gasto')[0]);
    await waitFor(() => expect(container.querySelectorAll('h4')).toHaveLength(1));
    fireEvent.change(screen.getByDisplayValue('Hotel'), { target: { value: 'Hotel Sintético' } });

    await act(async () => fake.pending[0].resolve());
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(container.querySelectorAll('h4')).toHaveLength(1);
    expect(screen.getByDisplayValue('Hotel Sintético')).toBeTruthy();
    expect(screen.queryByDisplayValue('Taxi')).toBeNull();
  });
});
