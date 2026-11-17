// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opArgs, type RecordedRequest } from '../helpers/recordingSupabase';

/**
 * F7e (GENERA fixes): what a person can do with a report on Rendición de
 * Gastos (/expense-reports), by role and by the report's state.
 *   S2 — any admin approves and rejects, and is recorded as the reviewer.
 *   S3 — rejecting asks for the reason inside the page; «Cancelar» cancels.
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
import { EXPENSE_APPROVER_EMAIL } from '../../utils/expenseConfig';

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
      // The fixed e-mail person's profile, if anyone looks it up by e-mail
      if (opArgs(req, 'eq')?.[0] === 'email') return { data: { id: FIXED_PERSON_ID, first_name: 'Fija', last_name: 'Persona' }, error: null };
      return { data: { avatar_url: null }, error: null };
    }
    if (req.target === 'expense_reports') return { data: reports, error: null };
    if (req.target === 'expense_categories') return { data: [], error: null };
    return { data: null, error: null };
  };
}

/** The session of the person using the page (never the fixed e-mail person here). */
function signIn(id: string, email = `${id}@f7e.test.local`) {
  h.userId = id;
  client.auth.getSession = async () => ({
    data: { session: { user: { id, email }, access_token: 'synthetic-token' } },
  });
}

const updates = () =>
  h.requests.filter((r) => r.target === 'expense_reports' && r.ops.some((o) => o.method === 'update'));
const notifyCalls = () =>
  (global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0])).filter((u: string) => u.includes('/notify'));

async function mount(role: string) {
  fake.role = role;
  database();
  render(<ExpenseReportsPage />);
  await waitFor(() => expect(screen.getAllByText(/^Reporte /).length).toBeGreaterThan(0));
}
const row = (id: string) => screen.getByText(`Reporte ${id}`).closest('tr') as HTMLElement;

beforeEach(() => {
  h.requests.length = 0;
  router.push.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as any;
  signIn(ME);
  reports = [];
});

describe('F7e S2 any admin approves and rejects, and is recorded as the reviewer', () => {
  it('the person using the page is not the fixed e-mail person', () => {
    expect(`${ME}@f7e.test.local`).not.toBe(EXPENSE_APPROVER_EMAIL);
  });

  it('an admin who is not the fixed e-mail person sees «Aprobar reporte» and «Rechazar reporte» on a sent report', async () => {
    reports = [report('s-other', OTHER, 'submitted')];
    await mount('admin');
    expect(within(row('s-other')).getByTitle('Aprobar reporte')).toBeTruthy();
    expect(within(row('s-other')).getByTitle('Rechazar reporte')).toBeTruthy();
  });

  it('an admin sees both on their OWN sent report too', async () => {
    reports = [report('s-own', ME, 'submitted')];
    await mount('admin');
    expect(within(row('s-own')).getByTitle('Aprobar reporte')).toBeTruthy();
    expect(within(row('s-own')).getByTitle('Rechazar reporte')).toBeTruthy();
  });

  it('pressing approve records the admin who pressed it as the reviewer, and asks for the notification', async () => {
    reports = [report('s-other', OTHER, 'submitted')];
    await mount('admin');
    fireEvent.click(within(row('s-other')).getByTitle('Aprobar reporte'));
    await waitFor(() => expect(updates()).toHaveLength(1));
    const payload = opArgs(updates()[0], 'update')?.[0] as Record<string, unknown>;
    expect(payload.status).toBe('approved');
    expect(payload.reviewed_by).toBe(ME);
    expect(typeof payload.reviewed_at).toBe('string');
    expect(opArgs(updates()[0], 'eq')).toEqual(['id', 's-other']);
    // nobody is looked up by e-mail any more
    expect(h.requests.some((r) => r.target === 'profiles' && opArgs(r, 'eq')?.[0] === 'email')).toBe(false);
    await waitFor(() => expect(notifyCalls()).toEqual(['/api/expense-reports/s-other/notify']));
  });

  it('a non-admin filer sees neither button, not even on their own sent report', async () => {
    reports = [report('s-own', ME, 'submitted')];
    await mount('consultor');
    expect(within(row('s-own')).queryByTitle('Aprobar reporte')).toBeNull();
    expect(within(row('s-own')).queryByTitle('Rechazar reporte')).toBeNull();
  });

  it('no decision buttons on a draft, an approved or a rejected report', async () => {
    reports = [report('d', OTHER, 'draft'), report('a', OTHER, 'approved'), report('x', OTHER, 'rejected')];
    await mount('admin');
    for (const id of ['d', 'a', 'x']) {
      expect(within(row(id)).queryByTitle('Aprobar reporte')).toBeNull();
      expect(within(row(id)).queryByTitle('Rechazar reporte')).toBeNull();
    }
  });
});

describe('F7e S3 rejecting asks for the reason inside the page, and «Cancelar» cancels', () => {
  let promptSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // A browser pop-up that is cancelled answers null
    promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
  });

  async function openReject() {
    reports = [report('s-other', OTHER, 'submitted')];
    await mount('admin');
    fireEvent.click(within(row('s-other')).getByTitle('Rechazar reporte'));
  }

  it('pressing «Rechazar reporte» opens a window in the page, not a browser pop-up', async () => {
    await openReject();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Rechazar reporte' })).toBeTruthy();
    const reason = screen.getByTestId('reject-reason') as HTMLTextAreaElement;
    expect(reason.tagName).toBe('TEXTAREA');
    expect(reason.maxLength).toBe(500);
    expect(screen.getByLabelText('Motivo del rechazo')).toBe(reason);
    expect(screen.getByText('Escribe el motivo: la persona lo verá y podrá corregir y reenviar el reporte.')).toBeTruthy();
    expect(screen.getByTestId('reject-confirm').textContent).toBe('Rechazar');
    expect(screen.getByTestId('reject-cancel').textContent).toBe('Cancelar');
  });

  it('pressing «Rechazar reporte» alone never rejects (a cancelled pop-up used to)', async () => {
    await openReject();
    // either the window opened or an update went out: then nothing may have been sent
    await waitFor(() => expect(screen.queryByTestId('reject-reason') ?? (updates().length || null)).toBeTruthy());
    expect(updates()).toHaveLength(0);
    expect(notifyCalls()).toEqual([]);
  });

  it('«Cancelar» closes the window with no change and no notification', async () => {
    await openReject();
    fireEvent.click(await screen.findByTestId('reject-cancel'));
    await waitFor(() => expect(screen.queryByTestId('reject-reason')).toBeNull());
    expect(updates()).toHaveLength(0);
    expect(notifyCalls()).toEqual([]);
  });

  it('«Rechazar» with an empty or blank reason sends nothing and asks for the reason', async () => {
    await openReject();
    fireEvent.click(await screen.findByTestId('reject-confirm'));
    expect(await screen.findByText('Escribe el motivo del rechazo.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('reject-reason'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('reject-confirm'));
    expect(screen.getByText('Escribe el motivo del rechazo.')).toBeTruthy();
    expect(screen.getByTestId('reject-reason')).toBeTruthy();
    expect(updates()).toHaveLength(0);
    expect(notifyCalls()).toEqual([]);
  });

  it('«Rechazar» with a reason rejects, records the admin and the reason, and asks for the notification', async () => {
    await openReject();
    fireEvent.change(await screen.findByTestId('reject-reason'), { target: { value: 'Falta la boleta del taxi' } });
    fireEvent.click(screen.getByTestId('reject-confirm'));
    await waitFor(() => expect(updates()).toHaveLength(1));
    const payload = opArgs(updates()[0], 'update')?.[0] as Record<string, unknown>;
    expect(payload.status).toBe('rejected');
    expect(payload.reviewed_by).toBe(ME);
    expect(typeof payload.reviewed_at).toBe('string');
    expect(payload.review_comments).toBe('Falta la boleta del taxi');
    expect(opArgs(updates()[0], 'eq')).toEqual(['id', 's-other']);
    await waitFor(() => expect(notifyCalls()).toEqual(['/api/expense-reports/s-other/notify']));
    await waitFor(() => expect(screen.queryByTestId('reject-reason')).toBeNull());
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
