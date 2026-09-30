// @vitest-environment jsdom
/**
 * NOTIF-11 — the legacy Header renders the current NotificationBell, which reads
 * /api/notifications with the session token and marks notices read through the
 * API. The retired realtime bell queried the table directly and asked for
 * browser notification permission; neither may happen here.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Header from '@/components/layout/Header';

(globalThis as any).React = React;

const mocks = vi.hoisted(() => {
  const from = vi.fn(() => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn().mockResolvedValue({ data: { school: 'Colegio Sintético' }, error: null }),
    };
    return query;
  });
  return {
    session: { current: null as null | { access_token: string } },
    supabase: {
      from,
      auth: { getSession: vi.fn() },
    },
    router: { push: vi.fn() },
  };
});

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => mocks.supabase }));
vi.mock('@/utils/notificationPermissions', () => ({
  checkUserAccess: vi.fn(),
  getAlternativeUrl: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const USER = { id: 'synthetic-user-a', email: 'persona@example.org' } as any;
const TOKEN = 'synthetic-access-token';
const UNREAD = {
  id: 'notice-1',
  user_id: USER.id,
  notification_type_id: 'assignment_created',
  title: 'Aviso sintético',
  description: 'Descripción sintética',
  related_url: '/dashboard',
  is_read: false,
  created_at: '2026-09-29T12:00:00Z',
  notification_type: { id: 'assignment_created', name: 'Tarea', category: 'assignments' },
};

const requestPermission = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function listResponse(unreadCount: number, data = [UNREAD]) {
  return json(200, { success: true, data, unreadCount });
}

function calls() {
  return fetchMock.mock.calls.map(([url, init]) => ({ url, method: init?.method ?? 'GET', init }));
}

async function renderHeader(user: any = USER) {
  render(<Header user={user} />);
  await act(async () => {});
}

const bells = () => screen.queryAllByRole('button', { name: /^Notificaciones/ });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.session.current = { access_token: TOKEN };
  mocks.supabase.auth.getSession.mockImplementation(async () => ({
    data: { session: mocks.session.current },
  }));
  fetchMock = vi.fn(() => listResponse(1));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('D1 — authenticated Header uses the current API-backed bell', () => {
  it('renders one bell that reads /api/notifications with the session token and shows the unread count', async () => {
    await renderHeader();

    await waitFor(() => expect(bells()).toHaveLength(1));
    expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)');
    expect(bells()[0]).toHaveTextContent('1');

    expect(calls()).toEqual([
      {
        url: '/api/notifications?limit=10',
        method: 'GET',
        init: {
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        },
      },
    ]);
  });

  it('never queries a notification table from the browser nor asks for browser notification permission', async () => {
    await renderHeader();
    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)'));
    fireEvent.click(bells()[0]);
    await screen.findByText('Aviso sintético');

    expect(mocks.supabase.from.mock.calls.map(([table]) => table)).toEqual(['profiles']);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('marks a single notice read through the API and clears the badge', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === `/api/notifications/${UNREAD.id}/read` ? json(200, { success: true }) : listResponse(1)
    );
    await renderHeader();
    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)'));

    fireEvent.click(bells()[0]);
    fireEvent.click(await screen.findByText('Aviso sintético'));

    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones'));
    const read = calls().filter((c) => c.method === 'POST');
    expect(read).toEqual([
      {
        url: `/api/notifications/${UNREAD.id}/read`,
        method: 'POST',
        init: {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        },
      },
    ]);
  });

  it('marks all notices read through the API', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === '/api/notifications/mark-all-read' ? json(200, { success: true }) : listResponse(1)
    );
    await renderHeader();
    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)'));

    fireEvent.click(bells()[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));

    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones'));
    expect(calls().filter((c) => c.method === 'POST').map((c) => c.url)).toEqual([
      '/api/notifications/mark-all-read',
    ]);
  });

  it('keeps the unread count when the read request is refused', async () => {
    fetchMock.mockImplementation((url: string) =>
      url === `/api/notifications/${UNREAD.id}/read` ? json(404, { error: 'Not found' }) : listResponse(1)
    );
    await renderHeader();
    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)'));

    fireEvent.click(bells()[0]);
    fireEvent.click(await screen.findByText('Aviso sintético'));

    await waitFor(() =>
      expect(calls().some((c) => c.url === `/api/notifications/${UNREAD.id}/read`)).toBe(true)
    );
    expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)');
  });

  it('shows the empty state when there are no notices', async () => {
    fetchMock.mockImplementation(() => listResponse(0, []));
    await renderHeader();
    await waitFor(() => expect(calls()).toHaveLength(1));

    fireEvent.click(bells()[0]);
    expect(await screen.findByText('No tienes notificaciones')).toBeInTheDocument();
    expect(bells()[0]).toHaveAccessibleName('Notificaciones');
  });

  it('shows the error state when the list request fails', async () => {
    fetchMock.mockImplementation(() => json(500, { success: false, error: 'boom' }));
    await renderHeader();
    await waitFor(() => expect(calls()).toHaveLength(1));

    fireEvent.click(bells()[0]);
    expect(await screen.findByText('No se pudieron cargar las notificaciones (código 500).')).toBeInTheDocument();
    expect(screen.queryByText(/boom|Failed/)).toBeNull();
    expect(bells()[0]).toHaveAccessibleName('Notificaciones');
  });

  it('announces a plural unread count in Spanish and keeps the badge', async () => {
    fetchMock.mockImplementation(() => listResponse(2, [UNREAD, { ...UNREAD, id: 'notice-2' }]));
    await renderHeader();

    await waitFor(() => expect(bells()[0]).toHaveAccessibleName('Notificaciones (2 no leídas)'));
    expect(bells()[0]).toHaveTextContent('2');
    bells()[0].focus();
    expect(bells()[0]).toHaveFocus();
  });

  it('shows Spanish fallback copy, not the API error text, when the list reports failure', async () => {
    fetchMock.mockImplementation(() =>
      json(200, { success: false, error: 'provider rejected token synthetic-access-token' })
    );
    await renderHeader();
    await waitFor(() => expect(calls()).toHaveLength(1));

    fireEvent.click(bells()[0]);
    expect(await screen.findByText('No se pudieron cargar las notificaciones.')).toBeInTheDocument();
    expect(screen.queryByText(/provider|token/)).toBeNull();
  });

  it('shows Spanish fallback copy when the request throws, and retry recovers', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    await renderHeader();
    await waitFor(() => expect(calls()).toHaveLength(1));

    fireEvent.click(bells()[0]);
    expect(await screen.findByText('No se pudieron cargar las notificaciones.')).toBeInTheDocument();
    expect(screen.queryByText(/Failed/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText('Aviso sintético')).toBeInTheDocument();
    expect(screen.queryByText('No se pudieron cargar las notificaciones.')).toBeNull();
    expect(bells()[0]).toHaveAccessibleName('Notificaciones (1 no leída)');
  });
});

describe('D6 — anonymous or forged session on a Header route', () => {
  it('anonymous: no bell, no notification request, login link retained', async () => {
    await renderHeader(null);

    expect(bells()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Iniciar Sesión' })).toHaveAttribute('href', '/login');
  });

  it('user prop without a live session: no notification request and no read mutation', async () => {
    mocks.session.current = null;
    await renderHeader();

    fireEvent.click(bells()[0]);
    await act(async () => {});
    const markAll = screen.queryByRole('button', { name: 'Marcar todas como leídas' });
    expect(markAll).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bells()[0]).toHaveAccessibleName('Notificaciones');
  });

  it('forged token rejected by the API: no notice data shown and no read mutation', async () => {
    mocks.session.current = { access_token: 'forged-token' };
    fetchMock.mockImplementation(() => json(401, { error: 'Unauthorized' }));
    await renderHeader();
    await waitFor(() => expect(calls()).toHaveLength(1));

    fireEvent.click(bells()[0]);
    expect(await screen.findByText('No se pudieron cargar las notificaciones (código 401).')).toBeInTheDocument();
    expect(screen.queryByText('Aviso sintético')).toBeNull();
    expect(bells()[0]).toHaveAccessibleName('Notificaciones');
    expect(calls().every((c) => c.method === 'GET')).toBe(true);
  });
});
