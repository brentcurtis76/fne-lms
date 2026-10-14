// @vitest-environment jsdom
/**
 * W-B4a-01 — the read-only workspace session detail page.
 *
 * getServerSideProps and the page are both exercised for real; only their
 * environment is stubbed: the server Supabase client (the caller's session),
 * `fetch` (which stands in for GET /api/sessions/[id]), the router, the auth
 * context and the layout chrome. Authorization belongs to that API, so these
 * tests feed it the API's possible answers and assert what reaches props and
 * the screen for each one.
 *
 * Synthetic data only.
 */
import React from 'react';
import type { GetServerSidePropsContext } from 'next';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    router: {
      asPath: '/community/workspace/sessions/x',
      push: vi.fn(),
      replace: vi.fn(),
      events: {
        on: (event: string, fn: (...args: unknown[]) => void) => {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event)!.add(fn);
        },
        off: (event: string, fn: (...args: unknown[]) => void) => handlers.get(event)?.delete(fn),
        emit: (event: string, ...args: unknown[]) => handlers.get(event)?.forEach((fn) => fn(...args)),
      },
    },
    handlers,
    auth: {
      user: { id: 'u-directora' } as { id: string } | null,
      profile: { role: 'equipo_directivo' } as { role: string } | null,
      loading: false,
      logout: vi.fn(),
      isAdmin: false,
      avatarUrl: null,
    },
    getSession: vi.fn(),
    from: vi.fn(),
  };
});

vi.mock('next/router', () => ({ useRouter: () => h.router }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  // The caller's own session, and nothing else: the page must not query tables.
  createPagesServerClient: () => ({ auth: { getSession: h.getSession } }),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../../../lib/supabase', () => ({ supabase: { from: h.from } }));

import WorkspaceSessionDetailPage, { getServerSideProps } from '../../../pages/community/workspace/sessions/[id]';

const SESSION_ID = 'a3700000-0000-4000-8000-00000000a501';
const OTHER_ID = 'a3700000-0000-4000-8000-00000000a502';
const TOKEN = 'synthetic-access-token';
const APP_ORIGIN = 'http://app.qa.local.test';
const RAW_MEETING_LINK = 'https://us06web.zoom.us/j/98765432101?pwd=SyNtHeTiCpAsScOdE0000';
const TRANSCRIPT = 'Transcripción sintética que nunca debe mostrarse';
const FACILITATOR_EMAIL = 'facilitadora.sintetica@qa.local.test';

function apiSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    title: 'Sesión sintética de convivencia',
    session_date: '2026-12-03',
    start_time: '09:00:00',
    end_time: '10:30:00',
    modality: 'online',
    status: 'programada',
    schools: { name: 'Colegio Sintético SM37' },
    growth_communities: { name: 'Comunidad Sintética SM37 A' },
    has_meeting: true,
    join_path: `/meet/session/${SESSION_ID}`,
    facilitators: [],
    attendees: [],
    reports: [],
    materials: [],
    communications: [],
    edit_requests: [],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function okSession(overrides: Record<string, unknown> = {}) {
  return jsonResponse(200, { data: { session: apiSession(overrides) } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function context(id: string | string[] = SESSION_ID, resolvedUrl?: string): GetServerSidePropsContext {
  const path = `/community/workspace/sessions/${Array.isArray(id) ? id.join('/') : id}`;
  return {
    params: { id },
    resolvedUrl: resolvedUrl ?? path,
    // An attacker-chosen Host must never become the API origin.
    req: { headers: { host: 'evil.example.invalid' } },
    res: {},
    query: {},
  } as unknown as GetServerSidePropsContext;
}

async function serverProps(id: string | string[] = SESSION_ID) {
  const result = await getServerSideProps(context(id));
  if (!('props' in result)) throw new Error(`expected props, got ${JSON.stringify(result)}`);
  return await result.props;
}

async function openPage(id: string = SESSION_ID) {
  const props = await serverProps(id);
  h.router.asPath = `/community/workspace/sessions/${id}`;
  return { props, view: render(<WorkspaceSessionDetailPage {...props} />) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.handlers.clear();
  h.auth.user = { id: 'u-directora' };
  h.auth.profile = { role: 'equipo_directivo' };
  h.getSession.mockResolvedValue({ data: { session: { access_token: TOKEN, user: { id: 'u-directora' } } } });
  fetchMock = vi.fn(async () => okSession());
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', APP_ORIGIN);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('D2 — authorized members see the basic detail through the existing API', () => {
  it('authenticates on the server, then GETs /api/sessions/[id] at the configured origin with the caller credentials, and renders the basic fields in es-CL', async () => {
    await openPage();

    expect(h.getSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${APP_ORIGIN}/api/sessions/${SESSION_ID}`);
    expect(url).not.toContain('evil.example.invalid');
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.method ?? 'GET').toBe('GET');
    expect(h.getSession.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);

    const detail = screen.getByTestId('workspace-session-detail');
    expect(screen.getByRole('heading', { name: 'Sesión sintética de convivencia' })).toBeInTheDocument();
    expect(detail).toHaveTextContent('jueves 03 de diciembre 2026');
    expect(detail).toHaveTextContent('09:00 - 10:30');
    expect(detail).toHaveTextContent('En línea');
    expect(detail).toHaveTextContent('Programada');
    expect(detail).toHaveTextContent('Colegio Sintético SM37');
    expect(detail).toHaveTextContent('Comunidad Sintética SM37 A');
  });

  it('serializes only the basic fields into props', async () => {
    const props = await serverProps();

    expect(props).toEqual({
      state: 'ready',
      session: {
        id: SESSION_ID,
        title: 'Sesión sintética de convivencia',
        session_date: '2026-12-03',
        start_time: '09:00:00',
        end_time: '10:30:00',
        modality: 'online',
        status: 'programada',
        schoolName: 'Colegio Sintético SM37',
        communityName: 'Comunidad Sintética SM37 A',
        hasMeeting: true,
      },
    });
  });

  it('renders the same detail for an active non-director member — the page adds no role policy of its own', async () => {
    h.auth.user = { id: 'u-docente' };
    h.auth.profile = { role: 'docente' };
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'docente-token', user: { id: 'u-docente' } } } });

    await openPage();

    expect(screen.getByTestId('workspace-session-detail')).toHaveTextContent('Sesión sintética de convivencia');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer docente-token');
    expect(h.from).not.toHaveBeenCalled();
    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it('offers no editing, finalization or attendance controls', async () => {
    await openPage();

    // The only buttons-or-links on the page are the way back and the platform join.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/community/workspace?section=sessions', `/meet/session/${SESSION_ID}`]);
    expect(screen.queryByText(/editar|finalizar|asistencia|guardar/i)).toBeNull();
  });
});

describe('D3 — denial, missing, failure, loading and navigation never leak detail', () => {
  it('redirects an anonymous visitor to login carrying the destination, without calling the API', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });

    const result = await getServerSideProps(context());

    expect(result).toEqual({
      redirect: {
        destination: `/login?next=${encodeURIComponent(`/community/workspace/sessions/${SESSION_ID}`)}`,
        permanent: false,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes the login destination so it cannot inject extra login query params', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });

    const result = await getServerSideProps(context(SESSION_ID, `/community/workspace/sessions/${SESSION_ID}?a=1&next=//evil`));
    const destination = 'redirect' in result ? result.redirect.destination : '';

    expect(destination.startsWith('/login?next=')).toBe(true);
    expect(destination.slice('/login?next='.length)).not.toMatch(/[&?#]/);
  });

  it('redirects an expired session (401) to login and serializes no detail', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Autenticación requerida' }));

    const result = await getServerSideProps(context());

    expect(result).toEqual({
      redirect: {
        destination: `/login?next=${encodeURIComponent(`/community/workspace/sessions/${SESSION_ID}`)}`,
        permanent: false,
      },
    });
  });

  it('renders an unrelated member (404) and a missing session identically', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'Sesión no encontrada' }));
    const denied = await openPage();
    const deniedHtml = denied.view.container.innerHTML;
    denied.view.unmount();

    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'Sesión no encontrada' }));
    const missing = await openPage(OTHER_ID);

    expect(denied.props).toEqual({ state: 'unavailable' });
    expect(missing.props).toEqual(denied.props);
    expect(missing.view.container.innerHTML).toBe(deniedHtml);
    expect(screen.getByRole('heading', { name: 'Sesión no disponible' })).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-session-detail')).toBeNull();
  });

  it('renders a malformed id (400) the same as a denied one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    const denied = await openPage();
    const deniedHtml = denied.view.container.innerHTML;
    denied.view.unmount();

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'ID de sesión inválido' }));
    const invalid = await openPage('no-es-un-uuid');

    expect(invalid.props).toEqual({ state: 'unavailable' });
    expect(invalid.view.container.innerHTML).toBe(deniedHtml);
    expect(fetchMock).toHaveBeenLastCalledWith(`${APP_ORIGIN}/api/sessions/no-es-un-uuid`, expect.anything());
  });

  it('treats a missing or repeated route id, or an empty API answer, as unavailable', async () => {
    expect(await serverProps(['a', 'b'])).toEqual({ state: 'unavailable' });
    const noId = await getServerSideProps({ ...context(), params: {} } as GetServerSidePropsContext);
    expect(noId).toEqual({ props: { state: 'unavailable' } });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    expect(await serverProps()).toEqual({ state: 'unavailable' });
  });

  it('shows a safe es-CL error on API failure (403, 500) and retries by re-requesting the same page', async () => {
    for (const status of [403, 500]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { error: 'Error inesperado al obtener sesión', details: 'stack' }));

      const { props, view } = await openPage();

      expect(props).toEqual({ state: 'error' });
      expect(screen.getByRole('heading', { name: 'No se pudo cargar la sesión' })).toBeInTheDocument();
      expect(document.body.innerHTML).not.toContain('stack');
      expect(screen.queryByTestId('workspace-session-detail')).toBeNull();

      fireEvent.click(screen.getByTestId('workspace-session-retry'));
      expect(h.router.replace).toHaveBeenLastCalledWith(`/community/workspace/sessions/${SESSION_ID}`);
      view.unmount();
    }
  });

  it('shows the error state when the request itself throws, and logs no credential', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { props } = await openPage();

    expect(props).toEqual({ state: 'error' });
    expect(screen.getByTestId('workspace-session-error')).toBeInTheDocument();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(TOKEN);
  });

  it('shows an es-CL loading state instead of the current detail while the next route loads', async () => {
    const { view } = await openPage();
    expect(screen.getByTestId('workspace-session-detail')).toBeInTheDocument();

    act(() => h.router.events.emit('routeChangeStart', `/community/workspace/sessions/${OTHER_ID}`));

    expect(screen.getByRole('status')).toHaveTextContent('Cargando sesión…');
    expect(screen.queryByText('Sesión sintética de convivencia')).toBeNull();

    // A failed navigation leaves the page as it was.
    act(() => h.router.events.emit('routeChangeError'));
    expect(screen.getByTestId('workspace-session-detail')).toBeInTheDocument();
    view.unmount();
  });

  it('shows only the new session after a route change', async () => {
    const { view } = await openPage(SESSION_ID);
    await screen.findByText('Sesión sintética de convivencia');

    fetchMock.mockResolvedValueOnce(okSession({ id: OTHER_ID, title: 'Segunda sesión sintética' }));
    const next = await serverProps(OTHER_ID);
    act(() => h.router.events.emit('routeChangeStart', `/community/workspace/sessions/${OTHER_ID}`));
    view.rerender(<WorkspaceSessionDetailPage {...next} />);
    act(() => h.router.events.emit('routeChangeComplete', `/community/workspace/sessions/${OTHER_ID}`));

    expect(screen.getByRole('heading', { name: 'Segunda sesión sintética' })).toBeInTheDocument();
    expect(screen.queryByText('Sesión sintética de convivencia')).toBeNull();
    expect(screen.getByTestId('workspace-session-detail-join')).toHaveAttribute('href', `/meet/session/${OTHER_ID}`);
  });

  it('never serializes or renders a raw provider URL, transcript or participant e-mail even when the payload carries them', async () => {
    fetchMock.mockResolvedValueOnce(
      okSession({
        meeting_link: RAW_MEETING_LINK,
        meeting_transcript: TRANSCRIPT,
        facilitators: [{ user_id: 'f-1', profiles: { first_name: 'Facilitadora', last_name: 'Sintética', email: FACILITATOR_EMAIL } }],
        attendees: [{ user_id: 'a-1', profiles: { first_name: 'Asistente', last_name: 'Sintético', email: 'asistente@qa.local.test' } }],
      })
    );

    const { props } = await openPage();

    for (const serialized of [JSON.stringify(props), document.body.innerHTML]) {
      expect(serialized).not.toContain(RAW_MEETING_LINK);
      expect(serialized).not.toContain('zoom.us');
      expect(serialized).not.toContain(TRANSCRIPT);
      expect(serialized).not.toContain(FACILITATOR_EMAIL);
      expect(serialized).not.toContain('@qa.local.test');
      expect(serialized).not.toContain(TOKEN);
    }
  });
});

describe('D4 — existing API behaviour retained: drafts by direct link, platform-only join', () => {
  it('renders an authorized borrador returned by the API, labelled as a draft and still read-only', async () => {
    fetchMock.mockResolvedValueOnce(okSession({ status: 'borrador', has_meeting: false, join_path: null }));

    await openPage();

    const detail = screen.getByTestId('workspace-session-detail');
    expect(detail).toHaveTextContent('Borrador');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('workspace-session-detail-join')).toBeNull();
  });

  it('joins only through /meet/session/[id], never through the payload link', async () => {
    fetchMock.mockResolvedValueOnce(
      okSession({ meeting_link: RAW_MEETING_LINK, join_path: 'https://evil.example.invalid/' })
    );

    const { props } = await openPage();

    expect(JSON.stringify(props)).not.toContain('evil.example.invalid');
    const join = screen.getByTestId('workspace-session-detail-join');
    expect(join).toHaveAttribute('href', `/meet/session/${SESSION_ID}`);
    expect(join).toHaveTextContent('Unirse a la reunión');
  });

  it('offers no join control for a session with nothing to join, a cancelled one or a presencial one', async () => {
    for (const overrides of [
      { has_meeting: false },
      { status: 'cancelada' },
      { modality: 'presencial' },
    ]) {
      fetchMock.mockResolvedValueOnce(okSession(overrides));
      const { view } = await openPage();
      expect(screen.getByTestId('workspace-session-detail')).toBeInTheDocument();
      expect(screen.queryByTestId('workspace-session-detail-join')).toBeNull();
      view.unmount();
    }
  });
});
