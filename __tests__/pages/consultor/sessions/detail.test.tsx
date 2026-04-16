// @vitest-environment jsdom
/**
 * Consultor Session Detail Page — Phase D UI Tests
 *
 * Exercises pages/consultor/sessions/[id].tsx end-to-end at the component
 * boundary: mocks useRouter, Supabase client, fetch, and heavy child
 * components so the page's own state machine (auth → role → fetch → save)
 * is the thing under test.
 *
 * Covered scenarios:
 *   1. Unauthenticated visitor is redirected to /login.
 *   2. Authenticated non-consultor is redirected to /dashboard.
 *   3. 404 from GET /api/sessions/:id renders "Sesión no encontrada".
 *   4. 409 conflict on PUT attendees surfaces toast + reload banner.
 *   5. GET returning { data: { session: null } } is treated as not_found
 *      (safe null render — no crash).
 *   6. "Solicitar Cambios" (edit) button is hidden for a consultor who is
 *      not a facilitator on the session.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Hoisted mocks (must be declared with vi.hoisted so imports pick them up)
// ---------------------------------------------------------------------------
const {
  mockRouterPush,
  mockRouterReplace,
  mockGetUserPrimaryRole,
  mockGetSession,
  mockSignOut,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockGetUserPrimaryRole: vi.fn(),
  mockGetSession: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({}),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

// next/router
vi.mock('next/router', () => ({
  useRouter: () => ({
    query: { id: 'session-1' },
    isReady: true,
    pathname: '/consultor/sessions/[id]',
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

// Supabase auth helpers
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  }),
}));

// roleUtils — the page only uses getUserPrimaryRole
vi.mock('../../../../utils/roleUtils', () => ({
  getUserPrimaryRole: mockGetUserPrimaryRole,
}));

// Heavy layout / modal / audio dependencies: render as passthroughs so the
// page tree can mount without dragging in MainLayout's full context (Supabase
// provider, nav, etc.).
vi.mock('../../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('../../../../components/sessions/EditRequestModal', () => ({
  default: () => null,
}));

vi.mock('../../../../components/sessions/AudioReportUploader', () => ({
  default: () => null,
}));

vi.mock('../../../../components/sessions/AudioPlayer', () => ({
  default: () => null,
}));

// HelpButton / tutorials are not referenced here, but react-hot-toast is.
vi.mock('react-hot-toast', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

// ---------------------------------------------------------------------------
// Import the page AFTER mocks are registered.
// ---------------------------------------------------------------------------
import SessionDetailPage from '../../../../pages/consultor/sessions/[id]';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AUTH_USER_ID = 'user-current';
const OTHER_USER_ID = 'user-other';

function authenticatedSession(userId: string = AUTH_USER_ID) {
  return {
    data: {
      session: {
        access_token: 'tok_abc',
        user: { id: userId },
      },
    },
  };
}

function unauthenticatedSession() {
  return { data: { session: null } };
}

function makeSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    title: 'Sesión de prueba',
    description: 'Descripción',
    objectives: 'Objetivos',
    session_date: '2026-05-01',
    start_time: '09:00:00',
    end_time: '10:00:00',
    modality: 'presencial',
    meeting_link: null,
    status: 'programada',
    school_id: 1,
    schools: { name: 'Colegio Test' },
    growth_communities: { name: 'Comunidad Test' },
    facilitators: [{ id: 'f1', user_id: AUTH_USER_ID, is_lead: true, facilitator_role: 'consultor_externo', profiles: { first_name: 'Ana', last_name: 'Ruiz', email: 'ana@t.com' } }],
    attendees: [
      {
        id: 'a1',
        user_id: 'stu-1',
        attended: null,
        arrival_status: null,
        notes: null,
        expected: true,
        profiles: { first_name: 'Alumno', last_name: 'Uno', email: 'a1@t.com' },
      },
    ],
    materials: [],
    reports: [],
    edit_requests: [],
    activity_log: [],
    recurrence_group_id: null,
    session_number: null,
    cancellation_reason: null,
    updated_at: '2026-04-15T00:00:00Z',
    ...overrides,
  };
}

/**
 * Build a fetch mock whose behavior is keyed on URL + method so individual
 * tests can wire per-endpoint responses (initial GET vs subsequent PUT, etc.).
 */
function mockFetchMatrix(routes: Array<{
  match: (url: string, init?: RequestInit) => boolean;
  response: Response | (() => Response);
}>) {
  return vi.fn((url: string, init?: RequestInit) => {
    for (const route of routes) {
      if (route.match(url, init)) {
        const resp = typeof route.response === 'function' ? route.response() : route.response;
        return Promise.resolve(resp);
      }
    }
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'unhandled in test fetch mock' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Consultor Session Detail Page', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockGetUserPrimaryRole.mockReset();
    mockGetSession.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockSignOut.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects unauthenticated visitors to /login', async () => {
    mockGetSession.mockResolvedValue(unauthenticatedSession());
    global.fetch = mockFetchMatrix([]) as unknown as typeof fetch;

    render(<SessionDetailPage />);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/login');
    });
    // Auth failed before role check — getUserPrimaryRole should not have fired.
    expect(mockGetUserPrimaryRole).not.toHaveBeenCalled();
  });

  it('redirects a non-consultor (estudiante) to /dashboard — 403 denied access', async () => {
    mockGetSession.mockResolvedValue(authenticatedSession());
    mockGetUserPrimaryRole.mockResolvedValue('estudiante');
    global.fetch = mockFetchMatrix([]) as unknown as typeof fetch;

    render(<SessionDetailPage />);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
    });
    // Session fetch must not happen when role check fails.
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('renders "Sesión no encontrada" when the session API returns 404', async () => {
    mockGetSession.mockResolvedValue(authenticatedSession());
    mockGetUserPrimaryRole.mockResolvedValue('consultor');
    global.fetch = mockFetchMatrix([
      {
        match: (url) => url.includes('/api/sessions/session-1'),
        response: jsonResponse({ error: 'not found' }, 404),
      },
    ]) as unknown as typeof fetch;

    render(<SessionDetailPage />);

    expect(await screen.findByText('Sesión no encontrada')).toBeInTheDocument();
    expect(
      screen.getByText('La sesión solicitada no existe o fue eliminada.')
    ).toBeInTheDocument();
  });

  it('treats a null session payload as not_found (safe null render)', async () => {
    mockGetSession.mockResolvedValue(authenticatedSession());
    mockGetUserPrimaryRole.mockResolvedValue('consultor');
    global.fetch = mockFetchMatrix([
      {
        match: (url) => url.includes('/api/sessions/session-1'),
        // 200 OK but payload has no session — should NOT crash the render.
        response: jsonResponse({ data: { session: null } }, 200),
      },
    ]) as unknown as typeof fetch;

    render(<SessionDetailPage />);

    // Falls through to the "not_found" branch without throwing.
    expect(await screen.findByText('Sesión no encontrada')).toBeInTheDocument();
  });

  it('shows conflict banner with toast + Recargar button when PUT attendees returns 409', async () => {
    mockGetSession.mockResolvedValue(authenticatedSession());
    mockGetUserPrimaryRole.mockResolvedValue('consultor');

    // First call: GET session loads successfully (current user IS facilitator).
    // Second call: PUT attendees returns 409.
    const getResponse = () =>
      jsonResponse({ data: { session: makeSessionPayload() } }, 200);
    const putConflict = () =>
      jsonResponse({ error: 'conflict' }, 409);

    const fetchMock = mockFetchMatrix([
      {
        match: (url, init) =>
          url.includes('/api/sessions/session-1/attendees') && init?.method === 'PUT',
        response: putConflict,
      },
      {
        match: (url) => url.includes('/api/sessions/session-1'),
        response: getResponse,
      },
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<SessionDetailPage />);

    // Wait for the session to render (Guardar asistencia button becomes visible
    // once the facilitator view loads).
    const saveButton = await screen.findByRole('button', { name: /Guardar asistencia/i });

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/Otra persona editó esta sesión/i)
      );
    });

    // The orange conflict alert banner + Recargar button must now be rendered.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Otra persona editó esta sesión/i);
    expect(screen.getByRole('button', { name: /Recargar/i })).toBeInTheDocument();
  });

  it('hides the "Solicitar Cambios" edit button for a non-facilitator consultor', async () => {
    // Viewing user is a consultor but NOT in the facilitators list.
    mockGetSession.mockResolvedValue(authenticatedSession(AUTH_USER_ID));
    mockGetUserPrimaryRole.mockResolvedValue('consultor');

    const payload = makeSessionPayload({
      facilitators: [
        {
          id: 'f1',
          user_id: OTHER_USER_ID, // not the current user
          is_lead: true,
          facilitator_role: 'consultor_externo',
          profiles: { first_name: 'Otro', last_name: 'Consultor', email: 'o@t.com' },
        },
      ],
    });

    global.fetch = mockFetchMatrix([
      {
        match: (url) => url.includes('/api/sessions/session-1'),
        response: jsonResponse({ data: { session: payload } }, 200),
      },
    ]) as unknown as typeof fetch;

    render(<SessionDetailPage />);

    // Wait for the header title (confirms session rendered) before asserting.
    await screen.findByText(payload.title);

    // Read-only banner for non-facilitators should be present.
    expect(
      screen.getByText(/Está viendo esta sesión en modo lectura/i)
    ).toBeInTheDocument();

    // The "Solicitar Cambios" button (gated by canEdit = isFacilitator || admin)
    // must NOT appear for this user.
    expect(screen.queryByRole('button', { name: /Solicitar Cambios/i })).not.toBeInTheDocument();

    // The "Guardar asistencia" save button must also be absent (non-editor view).
    expect(screen.queryByRole('button', { name: /Guardar asistencia/i })).not.toBeInTheDocument();
  });
});
