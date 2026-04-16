// @vitest-environment jsdom
/**
 * Consultor Sessions List Page — Phase D UI Tests
 *
 * Exercises pages/consultor/sessions/index.tsx against the contract the
 * backend provides: the API (pages/api/sessions) narrows sessions by school
 * for school-scoped consultors (user_roles.school_id IS NOT NULL) and returns
 * the full set for global consultors (user_roles.school_id IS NULL). The
 * frontend does not re-filter by school — it simply renders what the API
 * returned. These tests assert that rendering is faithful to both shapes.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockRouterPush,
  mockRouterReplace,
  mockGetUserPrimaryRole,
  mockGetSession,
  mockSignOut,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockGetUserPrimaryRole: vi.fn(),
  mockGetSession: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({}),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: {},
    isReady: true,
    pathname: '/consultor/sessions',
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
    // contract_hours_ledger batch query used by the page to decorate cancelled
    // sessions. Returning empty data keeps the page from throwing.
    from: mockSupabaseFrom,
  }),
}));

vi.mock('../../../../utils/roleUtils', () => ({
  getUserPrimaryRole: mockGetUserPrimaryRole,
}));

vi.mock('../../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('../../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ children, title }: { children?: React.ReactNode; title: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('../../../../components/tutorials/HelpButton', () => ({
  default: () => null,
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Import AFTER mocks
import ConsultorSessionsPage from '../../../../pages/consultor/sessions/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CURRENT_USER_ID = 'consultor-me';
const OTHER_FACILITATOR = 'other-consultor';

function authSession() {
  return {
    data: {
      session: {
        access_token: 'tok_abc',
        user: { id: CURRENT_USER_ID },
      },
    },
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Default Session',
    session_date: '2026-05-10',
    start_time: '09:00:00',
    end_time: '10:00:00',
    modality: 'presencial',
    status: 'programada',
    school_id: 1,
    schools: { name: 'Colegio Uno' },
    growth_communities: { name: 'Comunidad A' },
    session_facilitators: [{ user_id: CURRENT_USER_ID }],
    recurrence_group_id: null,
    session_number: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * The page also calls supabase.from('contract_hours_ledger').select(...).in(...).then(...)
 * Provide a thenable chain that resolves to empty ledger data.
 */
function buildLedgerStub(data: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const thenable = {
    then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data }),
  };
  chain.select = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(thenable);
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Consultor Sessions List Page — scoping behavior', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockGetUserPrimaryRole.mockReset();
    mockGetSession.mockReset();
    mockSignOut.mockClear();
    mockSupabaseFrom.mockReset();
    mockSupabaseFrom.mockImplementation(() => buildLedgerStub());
  });

  afterEach(() => {
    cleanup();
  });

  it('renders sessions across multiple schools for a GLOBAL consultor', async () => {
    // The API (simulated via the fetch mock) returns sessions from three
    // different schools — which is what the backend would do for a consultor
    // whose user_roles.school_id IS NULL (global scope).
    mockGetSession.mockResolvedValue(authSession());
    mockGetUserPrimaryRole.mockResolvedValue('consultor');

    const globalSessions = [
      sessionRow({
        id: 'sess-a',
        title: 'Global Session A',
        school_id: 1,
        schools: { name: 'Colegio Uno' },
        session_facilitators: [{ user_id: CURRENT_USER_ID }],
      }),
      sessionRow({
        id: 'sess-b',
        title: 'Global Session B',
        school_id: 2,
        schools: { name: 'Colegio Dos' },
        session_facilitators: [{ user_id: OTHER_FACILITATOR }], // other's session
      }),
      sessionRow({
        id: 'sess-c',
        title: 'Global Session C',
        school_id: 3,
        schools: { name: 'Colegio Tres' },
        session_facilitators: [{ user_id: CURRENT_USER_ID }],
      }),
    ];

    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/sessions')) {
        return Promise.resolve(
          jsonResponse({ data: { sessions: globalSessions, total: 3 } })
        );
      }
      return Promise.resolve(jsonResponse({ error: 'unhandled' }, 500));
    }) as unknown as typeof fetch;

    render(<ConsultorSessionsPage />);

    // All three schools should render in the page — the global consultor sees
    // sessions from multiple schools.
    expect(await screen.findByText('Global Session A')).toBeInTheDocument();
    expect(await screen.findByText('Global Session C')).toBeInTheDocument();
    expect(await screen.findByText('Global Session B')).toBeInTheDocument();

    // School names should appear from at least three different schools.
    expect(screen.getAllByText('Colegio Uno').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Colegio Dos').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Colegio Tres').length).toBeGreaterThanOrEqual(1);
  });

  it('renders only in-school sessions for a SCHOOL-SCOPED consultor', async () => {
    // For a school-scoped consultor (user_roles.school_id = 1), the API only
    // returns sessions from that school. The page must faithfully render the
    // narrowed set; it must NOT leak sessions from other schools.
    mockGetSession.mockResolvedValue(authSession());
    mockGetUserPrimaryRole.mockResolvedValue('consultor');

    const scopedSessions = [
      sessionRow({
        id: 'sess-x',
        title: 'Scoped Session X',
        school_id: 1,
        schools: { name: 'Colegio Uno' },
        session_facilitators: [{ user_id: CURRENT_USER_ID }],
      }),
      sessionRow({
        id: 'sess-y',
        title: 'Scoped Session Y',
        school_id: 1,
        schools: { name: 'Colegio Uno' },
        session_facilitators: [{ user_id: OTHER_FACILITATOR }],
      }),
    ];

    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/sessions')) {
        return Promise.resolve(
          jsonResponse({ data: { sessions: scopedSessions, total: 2 } })
        );
      }
      return Promise.resolve(jsonResponse({ error: 'unhandled' }, 500));
    }) as unknown as typeof fetch;

    render(<ConsultorSessionsPage />);

    // Both in-scope sessions render...
    expect(await screen.findByText('Scoped Session X')).toBeInTheDocument();
    expect(await screen.findByText('Scoped Session Y')).toBeInTheDocument();

    // ...but no session from Colegio Dos / Tres should be present.
    expect(screen.queryByText('Colegio Dos')).not.toBeInTheDocument();
    expect(screen.queryByText('Colegio Tres')).not.toBeInTheDocument();
    expect(screen.queryByText('Global Session A')).not.toBeInTheDocument();
    expect(screen.queryByText('Global Session B')).not.toBeInTheDocument();
    expect(screen.queryByText('Global Session C')).not.toBeInTheDocument();
  });

  it('splits sessions into "Mis Sesiones" vs "Otras Sesiones" based on facilitator membership', async () => {
    // Verifies the per-user split the page computes in-memory — independent of
    // scope. A session where the current user is a facilitator must land in
    // "Mis Sesiones"; one where they are not must land in the "Otras" column.
    mockGetSession.mockResolvedValue(authSession());
    mockGetUserPrimaryRole.mockResolvedValue('consultor');

    const mine = sessionRow({
      id: 'sess-mine',
      title: 'Mine Session',
      session_facilitators: [{ user_id: CURRENT_USER_ID }],
    });
    const theirs = sessionRow({
      id: 'sess-theirs',
      title: 'Theirs Session',
      session_facilitators: [{ user_id: OTHER_FACILITATOR }],
    });

    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/sessions')) {
        return Promise.resolve(
          jsonResponse({ data: { sessions: [mine, theirs], total: 2 } })
        );
      }
      return Promise.resolve(jsonResponse({ error: 'unhandled' }, 500));
    }) as unknown as typeof fetch;

    render(<ConsultorSessionsPage />);

    // Headings visible in both columns. "Mis Sesiones" appears both in the
    // page header and as the column heading, so match all occurrences.
    const misSesionesLabels = await screen.findAllByText('Mis Sesiones');
    expect(misSesionesLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Otras Sesiones en Mis Colegios')).toBeInTheDocument();

    // Both session titles appear exactly once, in their respective columns.
    expect(await screen.findByText('Mine Session')).toBeInTheDocument();
    expect(await screen.findByText('Theirs Session')).toBeInTheDocument();

    // "No está asignado como facilitador" empty state for "Mis Sesiones"
    // must NOT appear, because the user has one assigned session.
    expect(
      screen.queryByText('No está asignado como facilitador en ninguna sesión')
    ).not.toBeInTheDocument();
  });

  it('redirects non-consultor users away from the list page', async () => {
    mockGetSession.mockResolvedValue(authSession());
    mockGetUserPrimaryRole.mockResolvedValue('docente');
    global.fetch = vi.fn() as unknown as typeof fetch;

    render(<ConsultorSessionsPage />);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
    });
    // Sessions fetch should never fire when the role check bounces the user.
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
