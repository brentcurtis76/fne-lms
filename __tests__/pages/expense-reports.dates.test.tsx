// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { opArgs, type RecordedRequest } from '../helpers/recordingSupabase';

/**
 * F21h (GES-3.25): a report's period in the list of Rendición de Gastos is
 * shown as typed: «2026-11-01» reads 01-11-2026 in Chile (it read 31-10-2026,
 * the UTC midnight of that day). Same page mocks as expense-reports.review.
 * Synthetic people only.
 */

const fake = vi.hoisted(() => ({ ref: null as any, role: 'admin' }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const router = { query: {}, push: vi.fn() };
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}));
vi.mock('../../components/expenses/ExpenseReportForm', () => ({
  default: ({ editingReport }: { editingReport?: { id: string } }) => (
    <div data-testid="form-stub">{editingReport ? `editing ${editingReport.id}` : 'new'}</div>
  ),
}));
vi.mock('../../components/expenses/ExpenseReportDetails', () => ({ default: () => null }));
vi.mock('../../lib/expenseReportExport', () => ({ ExpenseReportExporter: {} }));
vi.mock('../../utils/roleUtils', () => ({ getUserPrimaryRole: async () => fake.role }));

(globalThis as any).React = React;

import ExpenseReportsPage from '../../pages/expense-reports';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};
const client = fake.ref.client as any;

const ME = 'f7e-admin-2';
const OTHER = 'f7e-consultor-1';
const FIXED_PERSON_ID = 'f7e-fixed-approver';
type Status = 'draft' | 'submitted' | 'approved' | 'rejected';
const report = (id: string, by: string, status: Status, extra: Record<string, unknown> = {}) => ({
  id, report_name: `Reporte ${id}`, start_date: '2026-11-01', end_date: '2026-11-10', status, total_amount: 1000,
  submitted_by: by, created_at: '2026-11-11T10:00:00Z', updated_at: '2026-11-11T10:00:00Z',
  profiles: { first_name: 'Persona', last_name: by === ME ? 'Uno' : 'Dos', email: `${by}@f7e.test.local` },
  expense_items: [],
  ...extra,
});

let reports: unknown[] = [];

function database() {
  h.respond = (req) => {
    if (req.kind === 'rpc' && req.target === 'auth_can_file_expenses') return { data: true, error: null };
    if (req.target === 'profiles') {
      if (opArgs(req, 'eq')?.[0] === 'email') return { data: { id: FIXED_PERSON_ID, first_name: 'Fija', last_name: 'Persona' }, error: null };
      return { data: { avatar_url: null }, error: null };
    }
    if (req.target === 'expense_reports') return { data: reports, error: null };
    if (req.target === 'expense_categories') return { data: [], error: null };
    return { data: null, error: null };
  };
}

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
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as any;
  h.userId = ME;
  client.auth.getSession = async () => ({
    data: { session: { user: { id: ME, email: `${ME}@f7e.test.local` }, access_token: 'synthetic-token' } },
  });
});

describe('F21h GES-3.25 the list shows a report\'s period as typed', () => {
  it('«2026-11-01» to «2026-11-10» reads 01-11-2026 - 10-11-2026', async () => {
    reports = [report('d-1', OTHER, 'submitted')];
    fake.role = 'admin';
    database();
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(screen.getByText('Reporte d-1')).toBeTruthy());
    const row = screen.getByText('Reporte d-1').closest('tr') as HTMLElement;
    expect(row.textContent).toContain('01-11-2026 - 10-11-2026');
    expect(row.textContent).not.toContain('31-10-2026');
  });
});
