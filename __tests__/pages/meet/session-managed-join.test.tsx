// @vitest-environment jsdom
/**
 * The meeting interstitial's two shapes (Z2-2b).
 *
 * A managed session (plan §8) has no raw link on its source row, so the page
 * renders the POST-per-click join control instead of the legacy anchor. An
 * unmanaged session must be untouched by that — the frozen markup below is the
 * literal output of this page at `6c71eda`, captured by rendering HEAD's copy of
 * the file and this one side by side, so any future drift in the legacy branches
 * fails here rather than in production.
 *
 * The `join_url` assertions are the security half: §5's one narrow opening is
 * the POST, and a URL that reached the props would be exactly the disclosure
 * Z1a closed — frozen into a payload that outlives the viewer's permissions.
 *
 * Synthetic data only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GetServerSidePropsContext } from 'next';

const { mockResolveMeetSessionAccess, mockGetSession } = vi.hoisted(() => ({
  mockResolveMeetSessionAccess: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({ auth: { getSession: mockGetSession } }),
}));

vi.mock('../../../lib/api-auth', () => ({
  createServiceRoleClient: () => ({}),
}));

vi.mock('../../../lib/utils/session-meet-access', () => ({
  resolveMeetSessionAccess: mockResolveMeetSessionAccess,
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ replace: vi.fn(), asPath: '/meet/session/x' }),
}));

import MeetSessionPage, { getServerSideProps } from '../../../pages/meet/session/[id]';
import type { MeetSessionView } from '../../../lib/utils/session-meet-access';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const MEETING_LINK = 'https://meet.example.test/abc-def';

const unmanagedWithLink: MeetSessionView = {
  id: SESSION_ID,
  title: 'Sesión sintética',
  session_date: '2026-03-10',
  start_time: '09:00:00',
  end_time: '10:30:00',
  meeting_link: MEETING_LINK,
  is_zoom_managed: false,
  join_access: 'allowed',
  join_denial_message: null,
};

const unmanagedNoLink: MeetSessionView = { ...unmanagedWithLink, meeting_link: null };

/** §8: a managed session's source row never carries the link. */
const managed: MeetSessionView = { ...unmanagedWithLink, meeting_link: null, is_zoom_managed: true };

/**
 * The viewer the §5 join list refuses. `resolveMeetSessionAccess` has already
 * stripped the link — the page never sees it, which is the point.
 */
const joinDenied: MeetSessionView = {
  ...unmanagedWithLink,
  meeting_link: null,
  join_access: 'denied',
  join_denial_message: 'No tienes acceso para unirte a esta reunión.',
};

/** §14 kill switch: a viewer who WOULD be allowed, on a managed session. */
const joinDisabled: MeetSessionView = { ...managed, join_access: 'disabled' };

/** Frozen at 6c71eda — see the module header. */
const LEGACY_WITH_LINK_MARKUP =
  '<main class="min-h-screen bg-gray-50 px-4 py-10"><div class="mx-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"><p class="text-xs font-medium uppercase tracking-wide text-gray-500">Reunión</p><h1 class="mt-1 text-xl font-semibold text-brand_primary sm:text-2xl">Sesión sintética</h1><dl class="mt-5 space-y-3 text-sm text-gray-700"><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg><dt class="sr-only">Fecha</dt><dd class="first-letter:uppercase">martes 10 de marzo de 2026</dd></div><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><dt class="sr-only">Horario</dt><dd>09:00 - 10:30 <span class="text-gray-500">(hora Chile)</span></dd></div></dl><div class="mt-6"><a href="https://meet.example.test/abc-def" target="_blank" rel="noopener noreferrer" data-testid="meet-join-link" class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand_primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link h-4 w-4" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>Abrir enlace de reunión</a><p class="mt-3 text-xs text-gray-500">El enlace abre un servicio de reuniones externo a GENERA, en una pestaña nueva.</p></div><div class="mt-6 border-t border-gray-100 pt-4"><a data-testid="meet-back-link" class="text-sm font-medium text-gray-600 hover:text-brand_primary" href="/dashboard">Volver al inicio</a></div></div></main>';

/** Frozen at 6c71eda — see the module header. */
const LEGACY_NO_LINK_MARKUP =
  '<main class="min-h-screen bg-gray-50 px-4 py-10"><div class="mx-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"><p class="text-xs font-medium uppercase tracking-wide text-gray-500">Reunión</p><h1 class="mt-1 text-xl font-semibold text-brand_primary sm:text-2xl">Sesión sintética</h1><dl class="mt-5 space-y-3 text-sm text-gray-700"><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg><dt class="sr-only">Fecha</dt><dd class="first-letter:uppercase">martes 10 de marzo de 2026</dd></div><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><dt class="sr-only">Horario</dt><dd>09:00 - 10:30 <span class="text-gray-500">(hora Chile)</span></dd></div></dl><div data-testid="meet-no-link" class="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">Esta sesión no tiene enlace de reunión.</div><div class="mt-6 border-t border-gray-100 pt-4"><a data-testid="meet-back-link" class="text-sm font-medium text-gray-600 hover:text-brand_primary" href="/dashboard">Volver al inicio</a></div></div></main>';

function context(): GetServerSidePropsContext {
  return {
    params: { id: SESSION_ID },
    resolvedUrl: `/meet/session/${SESSION_ID}`,
    req: { headers: {} },
    res: {},
    query: {},
  } as unknown as GetServerSidePropsContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } });
});

describe('/meet/session/[id] — managed sessions', () => {
  it('renders the join button and not the legacy anchor', () => {
    render(<MeetSessionPage session={managed} />);

    expect(screen.getByTestId('meet-join-button')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-join-link')).toBeNull();
    expect(screen.queryByTestId('meet-no-link')).toBeNull();
  });

  it('keeps the back link', () => {
    render(<MeetSessionPage session={managed} />);
    expect(screen.getByTestId('meet-back-link')).toBeInTheDocument();
  });

  it('puts no join URL in the rendered HTML', () => {
    const { container } = render(<MeetSessionPage session={managed} />);
    expect(container.innerHTML).not.toMatch(/join_url|zoom\.us|\/j\/\d/);
    expect(container.querySelector('a[href^="http"]')).toBeNull();
  });

  it('puts no join URL in the serialized getServerSideProps props', async () => {
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'ok', session: managed });

    const result = await getServerSideProps(context());
    const serialized = JSON.stringify('props' in result ? result.props : {});

    expect(serialized).not.toMatch(/join_url/);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(JSON.parse(serialized)).toEqual({
      session: {
        id: SESSION_ID,
        title: 'Sesión sintética',
        session_date: '2026-03-10',
        start_time: '09:00:00',
        end_time: '10:30:00',
        meeting_link: null,
        is_zoom_managed: true,
        join_access: 'allowed',
        join_denial_message: null,
      },
    });
  });
});

/**
 * The join capability is not page visibility (plan §5, amended 2026-08-06 by owner
 * decision). These render the page for a viewer who HAS it and may not join: they
 * get the session's date and time and no way into the meeting, whichever provider
 * the scheduler picked.
 */
describe('/meet/session/[id] — a viewer the join list refuses', () => {
  it('renders no join control on a pasted-link session', () => {
    render(<MeetSessionPage session={joinDenied} />);

    expect(screen.getByTestId('meet-join-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-join-link')).toBeNull();
    expect(screen.queryByTestId('meet-join-button')).toBeNull();
    // Not the no-link state either: whether the session HAS a link is part of
    // the capability, not something a refused viewer gets to learn.
    expect(screen.queryByTestId('meet-no-link')).toBeNull();
  });

  it('renders no join control on a Zoom-managed session — the same answer', () => {
    render(<MeetSessionPage session={{ ...joinDenied, is_zoom_managed: true }} />);

    expect(screen.getByTestId('meet-join-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('meet-join-button')).toBeNull();
    expect(screen.queryByTestId('meet-join-link')).toBeNull();
  });

  it('still shows the session itself — page visibility did not move', () => {
    render(<MeetSessionPage session={joinDenied} />);

    expect(screen.getByText('Sesión sintética')).toBeInTheDocument();
    expect(screen.getByTestId('meet-back-link')).toBeInTheDocument();
  });

  it('carries the §5 refusal copy in es-CL', () => {
    render(
      <MeetSessionPage
        session={{
          ...joinDenied,
          join_denial_message:
            'No estás en la lista de asistentes de esta sesión. Pídele a un facilitador que te agregue.',
        }}
      />
    );

    expect(screen.getByTestId('meet-join-denied')).toHaveTextContent(
      'No estás en la lista de asistentes de esta sesión.'
    );
  });

  it('puts no URL of any kind in the document', () => {
    const { container } = render(<MeetSessionPage session={joinDenied} />);

    expect(container.innerHTML).not.toContain(MEETING_LINK);
    expect(container.querySelector('a[href^="http"]')).toBeNull();
  });

  it('is what getServerSideProps serialises — the link is absent from __NEXT_DATA__', async () => {
    mockResolveMeetSessionAccess.mockResolvedValue({ kind: 'ok', session: joinDenied });

    const result = await getServerSideProps(context());
    const serialized = JSON.stringify('props' in result ? result.props : {});

    expect(serialized).not.toContain(MEETING_LINK);
    expect(serialized).not.toMatch(/https?:\/\//);
  });
});

describe('/meet/session/[id] — §14 kill switch', () => {
  it('replaces the managed join control with the disabled notice', () => {
    render(<MeetSessionPage session={joinDisabled} />);

    expect(screen.getByTestId('meet-join-disabled')).toHaveTextContent(
      'Las videollamadas están temporalmente deshabilitadas'
    );
    expect(screen.queryByTestId('meet-join-button')).toBeNull();
    expect(screen.queryByTestId('meet-join-link')).toBeNull();
  });
});

describe('/meet/session/[id] — unmanaged sessions are untouched', () => {
  it('renders the has-link branch exactly as it did at 6c71eda', () => {
    const { container } = render(<MeetSessionPage session={unmanagedWithLink} />);

    expect(container.innerHTML).toBe(LEGACY_WITH_LINK_MARKUP);
    expect(screen.queryByTestId('meet-join-button')).toBeNull();
  });

  it('renders the no-link branch exactly as it did at 6c71eda', () => {
    const { container } = render(<MeetSessionPage session={unmanagedNoLink} />);

    expect(container.innerHTML).toBe(LEGACY_NO_LINK_MARKUP);
    expect(screen.queryByTestId('meet-join-button')).toBeNull();
  });
});
