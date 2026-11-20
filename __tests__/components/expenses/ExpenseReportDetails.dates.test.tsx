// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F21h (GES-3.25): in a report's detail the dates of type date (the period,
 * each expense's date) are shown as typed — «2026-11-01» reads 01-11-2026 in
 * Chile — while the timestamps (created, sent, reviewed) keep their present
 * formatting. Synthetic people only.
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
vi.mock('../../../lib/expenseReportExport', () => ({ ExpenseReportExporter: {} }));

(globalThis as any).React = React;

import '@supabase/auth-helpers-react';
import ExpenseReportDetails from '../../../components/expenses/ExpenseReportDetails';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
};

const AUTHOR = 'f21h-consultor-1';
const REPORT = {
  id: 'r-1', report_name: 'Viaje sintético', start_date: '2026-11-01', end_date: '2026-11-10', status: 'approved' as const,
  total_amount: 5000, submitted_by: AUTHOR, created_at: '2026-11-01T02:00:00Z', submitted_at: '2026-11-12T12:00:00Z',
  reviewed_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:00Z',
  profiles: { first_name: 'Carla', last_name: 'Prueba', email: 'carla@f21h.test.local' },
  expense_items: [{
    id: 'i-1', report_id: 'r-1', category_id: 'cat-1', description: 'Taxi', amount: 5000, currency: 'CLP' as const,
    expense_date: '2026-11-01', vendor: 'Taxi Sintético',
  }],
};

let previousTz: string | undefined;
beforeAll(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'America/Santiago';
});
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

beforeEach(() => {
  h.requests.length = 0;
  h.respond = () => ({ data: [], error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('F21h GES-3.25 the detail shows dates as typed', () => {
  it('the period and the expense\'s date read 01-11-2026; the timestamps keep their formatting', () => {
    render(
      <ExpenseReportDetails report={REPORT as any} isOpen onClose={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} currentUser={{ id: AUTHOR }} />
    );
    expect(screen.getByText(/01-11-2026 - 10-11-2026/)).toBeTruthy();
    const row = screen.getByText('Taxi').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('01-11-2026');
    // created at 02:00 UTC on 1 Nov is still 31 Oct in Chile: a timestamp, formatted as before
    const created = screen.getByText('Creado').nextElementSibling as HTMLElement;
    expect(created.textContent).toBe(new Date('2026-11-01T02:00:00Z').toLocaleDateString('es-CL'));
    expect(created.textContent).toBe('31-10-2026');
    expect((screen.getByText('Enviado').nextElementSibling as HTMLElement).textContent)
      .toBe(new Date('2026-11-12T12:00:00Z').toLocaleDateString('es-CL'));
  });
});
