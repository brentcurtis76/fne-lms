// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F7e S4 (GENERA fixes): the form opens a REJECTED report for editing, as it
 * does a draft, and saving it leaves its status as it is (the author sends it
 * again from the list). Synthetic data only.
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
const REJECTED = {
  id: 'x-own', report_name: 'Viaje a Valparaíso', description: 'Visita sintética', start_date: '2026-11-01',
  end_date: '2026-11-10', status: 'rejected', total_amount: 5000, submitted_by: 'f7e-consultor-1',
  review_comments: 'Falta la boleta del taxi',
  expense_items: [{
    id: 'i-1', report_id: 'x-own', category_id: 'cat-1', description: 'Taxi', amount: 5000, currency: 'CLP',
    expense_date: '2026-11-02', vendor: 'Taxi Sintético', expense_number: '', notes: '',
  }],
};

beforeEach(() => {
  h.requests.length = 0;
  h.respond = () => ({ data: null, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('F7e S4 the form opens a rejected report for editing', () => {
  it('shows the rejected report\'s values and saves them without changing its status', async () => {
    const onSuccess = vi.fn();
    render(<ExpenseReportForm categories={CATEGORIES} editingReport={REJECTED} onSuccess={onSuccess} onCancel={vi.fn()} />);
    expect(screen.getByText('Editar Reporte de Gastos')).toBeTruthy();
    await waitFor(() => expect(screen.getByDisplayValue('Viaje a Valparaíso')).toBeTruthy());
    expect(screen.getByDisplayValue('Taxi')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Viaje a Valparaíso'), { target: { value: 'Viaje a Valparaíso (corregido)' } });
    fireEvent.click(screen.getByText('Actualizar Reporte'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const reportUpdate = h.requests.find((r) => r.target === 'expense_reports' && r.ops.some((o) => o.method === 'update'))!;
    const payload = opArgs(reportUpdate, 'update')?.[0] as Record<string, unknown>;
    expect(payload.report_name).toBe('Viaje a Valparaíso (corregido)');
    expect('status' in payload).toBe(false);
    expect(opArgs(reportUpdate, 'eq')).toEqual(['id', 'x-own']);
    const itemOps = h.requests.filter((r) => r.target === 'expense_items').map((r) => r.ops[0].method);
    expect(itemOps).toEqual(['delete', 'insert']);
  });
});
