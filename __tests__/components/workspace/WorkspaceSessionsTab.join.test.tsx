// @vitest-environment jsdom
/**
 * [N5] r26 — the join control on the workspace Sesiones tab.
 *
 * §15 names "JoinMeetingButton in detail pages + workspace Sesiones tab". The
 * detail pages had it; this tab had a row that navigated to the session and
 * nothing else, so a participant living in the workspace could not tell there
 * was a meeting at all.
 *
 * The claims asserted here are the four the ruling makes: it appears only where
 * there is something to join, it points at `/meet/session/{id}`, it never
 * renders a raw provider URL, and the row still navigates.
 *
 * Synthetic data only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockPush, mockGetSession, mockLedgerSelect } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGetSession: vi.fn(),
  mockLedgerSelect: vi.fn(),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: () => ({
      select: () => ({
        in: () => ({
          then: (resolve: (v: unknown) => unknown) => {
            mockLedgerSelect();
            return Promise.resolve({ data: [] }).then(resolve);
          },
        }),
      }),
    }),
  },
}));

import WorkspaceSessionsTab from '../../../components/workspace/WorkspaceSessionsTab';

const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';
const MANAGED_ID = '11111111-1111-4111-8111-111111111111';
const PASTED_ID = '22222222-2222-4222-8222-222222222222';
const PRESENCIAL_ID = '33333333-3333-4333-8333-333333333333';
const CANCELLED_ID = '44444444-4444-4444-8444-444444444444';

/**
 * A raw provider URL the list must never render. The API strips `meeting_link`
 * from unprivileged payloads, but this fixture carries one anyway: the claim is
 * that the control does not render it even when the row happens to hold it.
 */
const RAW_MEETING_LINK = 'https://us06web.zoom.us/j/98765432101?pwd=SyNtHeTiCpAsScOdE0000';

const workspace = { community_id: COMMUNITY_ID } as never;

function sessionRow(overrides: Record<string, unknown>) {
  return {
    id: MANAGED_ID,
    title: 'Sesión sintética',
    session_date: '2099-03-10',
    start_time: '09:00:00',
    end_time: '10:30:00',
    modality: 'online',
    status: 'programada',
    schools: null,
    growth_communities: null,
    session_facilitators: [],
    session_number: null,
    recurrence_group_id: null,
    has_meeting: false,
    is_zoom_managed: false,
    ...overrides,
  };
}

async function renderTab(sessions: Record<string, unknown>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { sessions } }),
    }))
  );

  render(
    <WorkspaceSessionsTab workspace={workspace} workspaceAccess={null} user={{ id: 'u-1' }} />
  );

  await waitFor(() => expect(screen.getByText(sessions[0].title as string)).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } });
});

describe('[N5] the workspace Sesiones tab join control', () => {
  it('appears for a Zoom-managed session and points at the platform surface', async () => {
    await renderTab([sessionRow({ id: MANAGED_ID, is_zoom_managed: true })]);

    const control = screen.getByTestId('workspace-session-join');
    expect(control).toHaveAttribute('href', `/meet/session/${MANAGED_ID}`);
    expect(control).toHaveTextContent('Unirse a la reunión');
  });

  it('appears for a session with a pasted link, and never renders the raw URL', async () => {
    await renderTab([
      sessionRow({
        id: PASTED_ID,
        title: 'Sesión con enlace pegado',
        has_meeting: true,
        meeting_link: RAW_MEETING_LINK,
      }),
    ]);

    const control = screen.getByTestId('workspace-session-join');
    expect(control).toHaveAttribute('href', `/meet/session/${PASTED_ID}`);
    expect(document.body.innerHTML).not.toContain(RAW_MEETING_LINK);
    expect(document.body.innerHTML).not.toContain('zoom.us');
  });

  it('does not appear when there is nothing to join', async () => {
    await renderTab([sessionRow({ title: 'Sesión sin reunión' })]);

    expect(screen.queryByTestId('workspace-session-join')).toBeNull();
  });

  it('does not appear for a presencial session — the same closed set the join route uses', async () => {
    await renderTab([
      sessionRow({
        id: PRESENCIAL_ID,
        title: 'Sesión presencial',
        modality: 'presencial',
        is_zoom_managed: true,
      }),
    ]);

    expect(screen.queryByTestId('workspace-session-join')).toBeNull();
  });

  it('does not appear for a cancelled session', async () => {
    await renderTab([
      sessionRow({
        id: CANCELLED_ID,
        title: 'Sesión cancelada',
        status: 'cancelada',
        session_date: '2099-03-10',
        is_zoom_managed: true,
      }),
    ]);

    expect(screen.queryByTestId('workspace-session-join')).toBeNull();
  });

  it('does not swallow the row click — row navigation still works', async () => {
    await renderTab([sessionRow({ id: MANAGED_ID, is_zoom_managed: true })]);

    fireEvent.click(screen.getByLabelText('Ver detalles de Sesión sintética'));

    expect(mockPush).toHaveBeenCalledWith(`/consultor/sessions/${MANAGED_ID}`);
  });

  it('and clicking the control does not ALSO navigate the row', async () => {
    await renderTab([sessionRow({ id: MANAGED_ID, is_zoom_managed: true })]);

    fireEvent.click(screen.getByTestId('workspace-session-join'));

    expect(mockPush).not.toHaveBeenCalled();
  });
});
