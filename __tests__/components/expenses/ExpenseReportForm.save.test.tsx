// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F21h (GES-3.26): saving an edited report is one call of
 * public.save_expense_report. The form lists only the items it removed itself;
 * an item it never knew (e.g. added by the Telegram assistant meanwhile) is
 * never named. Synthetic data only.
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

(globalThis as any).React = React;

import ExpenseReportForm from '../../../components/expenses/ExpenseReportForm';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};

const CATEGORIES = [{ id: 'cat-1', name: 'Transporte', description: '', color: '#000000', is_active: true }];
const item = (id: string, description: string, amount: number) => ({
  id, report_id: 'r-1', category_id: 'cat-1', description, amount, currency: 'CLP', original_amount: amount,
  conversion_rate: 1, expense_date: '2026-11-02', vendor: '', expense_number: '', notes: '',
});
const DRAFT = {
  id: 'r-1', report_name: 'Viaje sintético', description: '', start_date: '2026-11-01', end_date: '2026-11-10',
  status: 'draft', total_amount: 3000, submitted_by: 'u-1',
  expense_items: [item('i-1', 'Taxi', 1000), item('i-2', 'Metro', 2000)],
};

beforeEach(() => {
  h.requests.length = 0;
  h.respond = () => ({ data: null, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('F21h saving an edited report is one database function call', () => {
  it('lists the removed item, keeps the other by id, and sends no total', async () => {
    const onSuccess = vi.fn();
    render(<ExpenseReportForm categories={CATEGORIES} editingReport={DRAFT} onSuccess={onSuccess} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue('Metro')).toBeTruthy());

    fireEvent.click(screen.getAllByTitle('Eliminar gasto')[1]);
    await waitFor(() => expect(screen.queryByDisplayValue('Metro')).toBeNull());
    fireEvent.click(screen.getByText('Actualizar Reporte'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const calls = h.requests.filter((r) => r.kind === 'rpc');
    expect(calls.map((r) => r.target)).toEqual(['save_expense_report']);
    const args = calls[0].args as any;
    expect(args.p_report_id).toBe('r-1');
    expect(args.p_removed).toEqual(['i-2']);
    expect(args.p_items).toHaveLength(1);
    expect(args.p_items[0]).toMatchObject({ id: 'i-1', description: 'Taxi', amount: 1000, category_id: 'cat-1' });
    expect('total_amount' in args.p_report).toBe(false);
    expect(h.requests.filter((r) => r.kind === 'from')).toEqual([]);
  });

  it('a failed save shows the error and does not report success', async () => {
    const onSuccess = vi.fn();
    h.respond = (req) => (req.kind === 'rpc' ? { data: null, error: { message: 'expense_report_not_editable' } } : { data: null, error: null });
    const { toast } = await import('react-hot-toast');
    render(<ExpenseReportForm categories={CATEGORIES} editingReport={DRAFT} onSuccess={onSuccess} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue('Metro')).toBeTruthy());
    fireEvent.click(screen.getByText('Actualizar Reporte'));
    await waitFor(() => expect((toast as any).error).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
