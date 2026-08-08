// @vitest-environment jsdom
/**
 * Dual-zone wiring in the session scheduler (Z2-4c, plan §15).
 *
 * Sessions are scheduled in Chile and delivered in part from Spain, and every
 * stored time is Chile time. The claim under test is that the admin form now
 * says so, and that the Spain figure it shows comes from a real timezone
 * conversion rather than a constant: Chile and Spain shift their clocks in
 * opposite directions, so the same 09:00 is 13:00 in January and 15:00 in July.
 * A hard-coded offset would satisfy one of those fixtures and fail the other —
 * that is the whole point of asserting both.
 *
 * The real page is rendered, not a mirror of it. Synthetic schools, consultants
 * and ids only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockPush, mockGetUserPrimaryRole } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGetUserPrimaryRole: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, query: {}, asPath: '/admin/sessions/create' }),
}));

vi.mock('../../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getUserPrimaryRole: mockGetUserPrimaryRole };
});

vi.mock('../../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: () => null,
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const SCHOOL = { id: 7, name: 'Colegio Sintético' };
const COMMUNITY = { id: 'c0111111-1111-4111-8111-111111111111', name: 'CC Sintética', school_id: 7 };
const CONSULTANT = {
  id: 'u-consultor-0001',
  first_name: 'Ana',
  last_name: 'Sintética',
  email: 'ana@example.test',
};

/** Chainable Supabase stub: every builder resolves the table's canned rows. */
function buildSupabase() {
  const rows: Record<string, unknown[]> = {
    schools: [SCHOOL],
    growth_communities: [COMMUNITY],
    contratos: [],
  };

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'u-admin-0001' }, access_token: 'synthetic-token' } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn((table: string) => {
      const resolved = { data: rows[table] ?? [], error: null };
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          return () => new Proxy({}, handler);
        },
      };
      return new Proxy({}, handler);
    }),
  };
}

let supabase = buildSupabase();

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabase,
}));

import SessionCreatePage from '../../../../pages/admin/sessions/create';

const mockFetch = vi.fn();

function routeFetch(url: string) {
  if (url.startsWith('/api/admin/consultants')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { consultants: [CONSULTANT] } }),
    });
  }
  if (url.startsWith('/api/hour-types')) {
    return Promise.resolve({ ok: true, json: async () => ({ data: { hour_types: [] } }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ data: { session: {} } }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase = buildSupabase();
  mockGetUserPrimaryRole.mockResolvedValue('admin');
  mockFetch.mockImplementation((url: string) => routeFetch(url));
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderForm() {
  render(<SessionCreatePage />);
  await screen.findByText('* Campos obligatorios');
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/hour-types', expect.anything()));
}

function setField(name: string, value: string) {
  fireEvent.change(document.querySelector(`input[name="${name}"]`) as Element, {
    target: { value },
  });
}

describe('scheduler — dual-zone time inputs', () => {
  it('marks both time inputs as Chile time', async () => {
    await renderForm();

    const startLabel = screen.getByText('Hora de inicio', { exact: false }).closest('label');
    const endLabel = screen.getByText('Hora de término', { exact: false }).closest('label');

    expect(startLabel?.textContent).toContain('(hora Chile)');
    expect(endLabel?.textContent).toContain('(hora Chile)');
  });

  it('renders no Spain preview until a date is chosen, and does not throw', async () => {
    await renderForm();

    // start_time/end_time default to 09:00/10:00; session_date starts empty, and
    // without a date there is no offset to be right about.
    expect(document.querySelector('input[name="session_date"]')).toHaveValue('');
    expect(screen.queryByTestId('create-session-spain-preview')).toBeNull();
  });

  it.each([
    // Chile is on summer time and Spain on winter time → +4h.
    ['a January date', '2027-01-15', '13:00 a 14:30 (hora España)'],
    // Chile is on winter time and Spain on summer time → +6h.
    ['a July date', '2027-07-15', '15:00 a 16:30 (hora España)'],
  ])('shows the real Spain equivalent for %s', async (_label, date, expected) => {
    await renderForm();

    setField('session_date', date);
    setField('start_time', '09:00');
    setField('end_time', '10:30');

    expect(await screen.findByTestId('create-session-spain-preview')).toHaveTextContent(expected);
  });

  it('drops the preview again when the date is cleared', async () => {
    await renderForm();

    setField('session_date', '2027-07-15');
    expect(await screen.findByTestId('create-session-spain-preview')).toBeInTheDocument();

    setField('session_date', '');
    await waitFor(() =>
      expect(screen.queryByTestId('create-session-spain-preview')).toBeNull()
    );
  });

  it('never submits anything about Spain', async () => {
    await renderForm();

    setField('session_date', '2027-07-15');
    await screen.findByTestId('create-session-spain-preview');

    // The preview is derived on render; no state, no field, nothing to send.
    expect(document.querySelector('input[name="start_time_spain"]')).toBeNull();
    expect(document.querySelector('input[name="end_time_spain"]')).toBeNull();
  });
});
