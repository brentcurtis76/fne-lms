// @vitest-environment jsdom
/**
 * Release SX: the earliest date the admin's «Programar Sesión» form offers is today's date in Chile
 * (America/Santiago), whatever the time zone of the computer the form runs on.
 *
 * The process time zone is changed per case (Node reads a change of `process.env.TZ` at run time;
 * Vitest runs this file in its own process). It is set before anything else runs and put back
 * after the file. The clock is fixed per case; only `Date` is faked, so promises and waits run on
 * real timers. Every school, community, person and address below is invented.
 */
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati';
  return before;
});

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

const SCHOOL = { id: 7, name: 'Colegio Inventado' };
const COMMUNITY = { id: 'c0222222-2222-4222-8222-222222222222', name: 'Comunidad Inventada', school_id: 7 };

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
        data: { session: { user: { id: 'u-admin-0002' }, access_token: 'synthetic-token' } },
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
  if (url.startsWith('/api/hour-types')) {
    return Promise.resolve({ ok: true, json: async () => ({ data: { hour_types: [] } }) });
  }
  return Promise.resolve({ ok: true, json: async () => ({ data: { consultants: [] } }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase = buildSupabase();
  mockGetUserPrimaryRole.mockResolvedValue('admin');
  mockFetch.mockImplementation((url: string) => routeFetch(url));
  vi.stubGlobal('fetch', mockFetch);
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** The process zone set and proven to have taken, then the clock fixed. */
function computerAt(zone: string, instant: string) {
  process.env.TZ = zone;
  const taken = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (taken !== zone) throw new Error(`The process time zone did not take: wanted ${zone}, got ${taken}`);
  vi.setSystemTime(new Date(instant));
}

/** The `min` of the main date field and of both custom-date rows. */
async function earliestDates() {
  render(<SessionCreatePage />);
  await screen.findByText('* Campos obligatorios');
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/hour-types', expect.anything()));
  const series = screen.getByText('Serie recurrente').closest('label')?.querySelector('input');
  fireEvent.click(series as Element);
  fireEvent.change(screen.getByText('Semanal').closest('select') as Element, { target: { value: 'custom' } });
  const add = await screen.findByText('Agregar fecha');
  fireEvent.click(add.closest('button') as Element);
  const rows = await waitFor(() => {
    const found = Array.from(document.querySelectorAll('input[type="date"]:not([name])'));
    expect(found).toHaveLength(2);
    return found;
  });
  const main = document.querySelector('input[name="session_date"]');
  return [main, ...rows].map((input) => input?.getAttribute('min'));
}

describe('the earliest date offered does not follow the computer’s time zone', () => {
  it('N21. a computer at UTC+14 (its own date already the 20th) at 12:00 in Chile on the 19th: 2026-11-19', async () => {
    computerAt('Pacific/Kiritimati', '2026-11-19T15:00:00Z');
    expect(new Date().getDate()).toBe(20);
    expect(await earliestDates()).toEqual(['2026-11-19', '2026-11-19', '2026-11-19']);
  });

  it.each([
    // UTC-11: the computer's own date is the 19th, the UTC date the 20th, Chile 23:00 on the 19th.
    ['Pacific/Pago_Pago', '2026-11-20T02:00:00Z'],
    // UTC+9: the computer's own date and the UTC date are the 20th, Chile 22:30 on the 19th.
    ['Asia/Tokyo', '2026-11-20T01:30:00Z'],
  ])('N22. a computer in %s at %s: 2026-11-19', async (zone, instant) => {
    computerAt(zone, instant);
    expect(await earliestDates()).toEqual(['2026-11-19', '2026-11-19', '2026-11-19']);
  });
});
