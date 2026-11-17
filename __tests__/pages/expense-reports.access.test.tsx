// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecordedRequest } from '../helpers/recordingSupabase';

/**
 * F7e S1 (GENERA fixes): who enters Rendición de Gastos (/expense-reports).
 * The role decides, through the database's own answer
 * (`auth_can_file_expenses`): admins, consultores and community managers come
 * in; everyone else goes to /dashboard. The old one-by-one switch
 * (expense_report_access) is not read any more. Synthetic people only.
 */

const fake = vi.hoisted(() => ({ ref: null as any, role: 'consultor' }));
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
vi.mock('../../components/expenses/ExpenseReportForm', () => ({ default: () => <div data-testid="form-stub" /> }));
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

const ME = 'f7e-user-1';
const OTHER = 'f7e-user-2';
const report = (id: string, by: string, name: string) => ({
  id, report_name: name, start_date: '2026-11-01', end_date: '2026-11-10', status: 'draft', total_amount: 1000,
  submitted_by: by, created_at: '2026-11-11T10:00:00Z', updated_at: '2026-11-11T10:00:00Z',
  profiles: { first_name: 'Persona', last_name: by === ME ? 'Uno' : 'Dos', email: `${by}@f7e.test.local` },
  expense_items: [],
});

/** What the database answers. `canFile` is the answer of auth_can_file_expenses; `accessRow` the old switch. */
function database({ canFile, accessRow, rpcError = false, reports = [report('r-own', ME, 'Viaje propio')] }: {
  canFile: boolean; accessRow: boolean; rpcError?: boolean; reports?: unknown[];
}) {
  h.respond = (req) => {
    if (req.kind === 'rpc' && req.target === 'auth_can_file_expenses') {
      return rpcError ? { data: null, error: { code: '42501', message: 'permission denied' } } : { data: canFile, error: null };
    }
    if (req.target === 'profiles') return { data: { avatar_url: null }, error: null };
    if (req.target === 'expense_report_access') return { data: accessRow ? { can_submit: true } : null, error: null };
    if (req.target === 'expense_reports') return { data: reports, error: null };
    if (req.target === 'expense_categories') return { data: [], error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  h.requests.length = 0;
  h.userId = ME;
  router.push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('F7e S1 the page lets in filers by role', () => {
  it('a consultor with NO access row stays on the page', async () => {
    fake.role = 'consultor';
    database({ canFile: true, accessRow: false });
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(screen.getByText('Viaje propio')).toBeTruthy());
    expect(router.push).not.toHaveBeenCalledWith('/dashboard');
    expect(h.requests.some((r) => r.target === 'expense_report_access')).toBe(false);
  });

  it('a community manager with no access row stays on the page', async () => {
    fake.role = 'community_manager';
    database({ canFile: true, accessRow: false });
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(screen.getByText('Viaje propio')).toBeTruthy());
    expect(router.push).not.toHaveBeenCalledWith('/dashboard');
  });

  it('a docente WITH an access row is sent to /dashboard', async () => {
    fake.role = 'docente';
    database({ canFile: false, accessRow: true });
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));
    expect(h.requests.some((r) => r.target === 'expense_reports')).toBe(false);
  });

  it('an error from the database answer sends the person to /dashboard', async () => {
    fake.role = 'consultor';
    database({ canFile: true, accessRow: true, rpcError: true });
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));
    expect(h.requests.some((r) => r.target === 'expense_reports')).toBe(false);
  });

  it('the page asks the database, not the old switch', async () => {
    fake.role = 'consultor';
    database({ canFile: true, accessRow: false });
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(screen.getByText('Viaje propio')).toBeTruthy());
    expect(h.requests.filter((r) => r.kind === 'rpc').map((r) => r.target)).toContain('auth_can_file_expenses');
  });

  it('an admin enters and sees every report (the list is read with the person\'s own session)', async () => {
    fake.role = 'admin';
    database({ canFile: true, accessRow: false, reports: [report('r-own', ME, 'Viaje propio'), report('r-other', OTHER, 'Viaje ajeno')] });
    render(<ExpenseReportsPage />);
    await waitFor(() => expect(screen.getByText('Viaje ajeno')).toBeTruthy());
    expect(screen.getByText('Viaje propio')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalledWith('/dashboard');
    const list = h.requests.find((r) => r.target === 'expense_reports')!;
    expect(list.ops.map((o) => o.method)).toEqual(['select', 'order']);
  });
});
