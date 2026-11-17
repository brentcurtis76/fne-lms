// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * F7e send-back 1 (GENERA fixes): the report's detail offers «Editar» and
 * «Eliminar» only where the database allows them — an author (admin or not)
 * only on a draft or rejected report, an admin who is not the author always.
 * Synthetic people only.
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

const ADMIN = 'f7e-admin-2';
const OTHER = 'f7e-consultor-1';
type Status = 'draft' | 'submitted' | 'approved' | 'rejected';
const report = (status: Status, by: string) => ({
  id: `r-${status}-${by}`, report_name: 'Viaje a Valparaíso', start_date: '2026-11-01', end_date: '2026-11-10', status,
  total_amount: 5000, submitted_by: by, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-14T10:00:00Z',
  profiles: { first_name: 'Carla', last_name: 'Prueba', email: 'carla@f7e.test.local' },
  expense_items: [],
});

async function mount(status: Status, by: string, isAdmin: boolean, me = ADMIN) {
  render(
    <ExpenseReportDetails
      report={report(status, by)} isOpen onClose={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
      currentUser={{ id: me }} isAdmin={isAdmin}
    />
  );
  await waitFor(() => expect(h.requests.some((r) => r.target === 'expense_report_events')).toBe(true));
}
const editButton = () => screen.queryByRole('button', { name: /Editar/ });
const deleteButton = () => screen.queryByRole('button', { name: /Eliminar/ });

beforeEach(() => {
  h.requests.length = 0;
  h.respond = () => ({ data: [], error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('F7e send-back 1 the detail offers edit and delete only where the rules allow them', () => {
  it('an admin looking at their OWN sent report: neither «Editar» nor «Eliminar»', async () => {
    await mount('submitted', ADMIN, true);
    expect(screen.getByText('Viaje a Valparaíso')).toBeTruthy();
    expect(editButton()).toBeNull();
    expect(deleteButton()).toBeNull();
  });

  it('an admin looking at their OWN approved report: neither', async () => {
    await mount('approved', ADMIN, true);
    expect(editButton()).toBeNull();
    expect(deleteButton()).toBeNull();
  });

  it('an admin looking at their own draft: both', async () => {
    await mount('draft', ADMIN, true);
    expect(editButton()).toBeTruthy();
    expect(deleteButton()).toBeTruthy();
  });

  it('an admin looking at another person\'s sent report: both', async () => {
    await mount('submitted', OTHER, true);
    expect(editButton()).toBeTruthy();
    expect(deleteButton()).toBeTruthy();
  });

  it('a non-admin author: both on a rejected report, neither on a sent one', async () => {
    const first = render(
      <ExpenseReportDetails
        report={report('rejected', OTHER)} isOpen onClose={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
        currentUser={{ id: OTHER }} isAdmin={false}
      />
    );
    expect(editButton()).toBeTruthy();
    expect(deleteButton()).toBeTruthy();
    first.unmount();
    await mount('submitted', OTHER, false, OTHER);
    expect(editButton()).toBeNull();
    expect(deleteButton()).toBeNull();
  });

  it('someone else\'s draft, not an admin: neither', async () => {
    await mount('draft', ADMIN, false, OTHER);
    expect(editButton()).toBeNull();
    expect(deleteButton()).toBeNull();
  });
});
