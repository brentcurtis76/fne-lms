// @vitest-environment jsdom
/**
 * N4-03 — every personal notification-settings entry point leads to the
 * owner-only `/configuracion/notificaciones` page (NOTIF plan D7).
 *
 * D1: the gear of both bell menus (the MainLayout sidebar's active
 * ModernNotificationCenter and the legacy header's NotificationDropdown, in
 * every list state), the `/notifications` cog and
 * Mi Perfil, for an administrator and for a docente, navigate through the Next
 * router to the settings page. D2: notification e-mails link to the same page,
 * escaped, while invitation and recovery mail stay as they were. D3: the admin
 * "Preferencias de Usuario" tab and the dead preference APIs are gone, the
 * other admin tabs and the admin-only redirect remain, and the notification URL
 * helpers no longer treat `/configuracion` as admin-only.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';

(globalThis as any).React = React;

const SETTINGS = '/configuracion/notificaciones';
const ROOT = join(__dirname, '..', '..');

type Result = { data: unknown; error: unknown };

/** A Supabase query builder: every filter returns itself, awaiting it yields the table's result. */
function query(result: Result): any {
  const builder: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: Result) => unknown) => resolve(result);
        return () => builder;
      },
    }
  );
  return builder;
}

const mocks = vi.hoisted(() => ({
  session: { current: null as any },
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  metadataRoles: [] as string[],
  primaryRole: { current: 'docente' as string | null },
  router: { push: vi.fn(), replace: vi.fn(), query: {} as Record<string, string>, pathname: '/' },
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn() },
  },
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => mocks.supabase,
  useSession: () => mocks.session.current,
}));
vi.mock('../../lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('../../lib/supabase-wrapper', () => ({ supabase: mocks.supabase }));
vi.mock('../../utils/roleUtils', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/roleUtils')>()),
  getUserPrimaryRole: vi.fn(async () => mocks.primaryRole.current),
}));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('../../components/profile/PasswordChangeSection', () => ({ default: () => <div>Seguridad</div> }));
vi.mock('../../components/admin/FeedbackPermissionsManager', () => ({
  default: () => <div data-testid="feedback-permissions">Permisos de feedback</div>,
}));
vi.mock('../../hooks/useAvatar', () => ({ invalidateAvatarCache: vi.fn(), updateAvatarCache: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import NotificationBell from '../../components/notifications/NotificationBell';
import ModernNotificationCenter from '../../components/notifications/ModernNotificationCenter';
import NotificationsPage from '../../pages/notifications';
import ProfilePage from '../../pages/profile';
import {
  checkUserAccess,
  getAccessibleUrl,
  getRequiredRole,
  isAdminOnlyRoute,
} from '../../utils/notificationPermissions';
import { buildNotificationEmail, NOTIFICATION_SETTINGS_PATH } from '../../lib/email/notifications';
import { sendPasswordRecoveryEmail, sendPasswordSetupEmail } from '../../lib/email/invitations';
import { PUBLIC_OUTBOUND_EMAIL } from '../../lib/email/outbound-policy';
import { dailyDigestTemplate, immediateNotificationTemplate } from '../../lib/emailTemplates';

const ADMIN = { id: 'synthetic-admin', email: 'admin@example.org', user_metadata: { roles: ['admin'] } };
const DOCENTE = { id: 'synthetic-docente', email: 'docente@example.org', user_metadata: {} };
const NOTICE = {
  id: 'notice-1',
  user_id: DOCENTE.id,
  notification_type_id: 'assignment_created',
  title: 'Aviso sintético',
  description: 'Descripción sintética',
  related_url: '/dashboard',
  is_read: false,
  created_at: '2026-10-08T12:00:00Z',
  notification_type: { id: 'assignment_created', name: 'Tarea', category: 'assignments' },
};

/** The Pages Router `Link` reads, as in the running app. */
const nextRouter = {
  push: vi.fn(async () => true),
  replace: vi.fn(async () => true),
  prefetch: vi.fn(async () => undefined),
  beforePopState: vi.fn(),
  route: '/',
  pathname: '/',
  asPath: '/',
  query: {},
  isFallback: false,
  isReady: true,
  isPreview: false,
  isLocaleDomain: false,
  basePath: '',
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
};

async function renderWithRouter(ui: React.ReactElement) {
  const utils = render(<RouterContext.Provider value={nextRouter as any}>{ui}</RouterContext.Provider>);
  await act(async () => {});
  return utils;
}

function signIn(user: typeof ADMIN | typeof DOCENTE, role: string) {
  mocks.session.current = { access_token: 'synthetic-token', user };
  mocks.primaryRole.current = role;
  mocks.tables = {
    profiles: { data: { id: user.id, first_name: 'Persona', last_name: 'Sintética', avatar_url: null }, error: null },
    user_roles: { data: [{ role_type: role, school_id: null }], error: null },
    user_notifications: { data: [], error: null },
    schools: { data: [], error: null },
  };
}

/** The settings-page navigation the Next router received: href, then `as`. */
function navigatedTo(): string[] {
  return nextRouter.push.mock.calls.map((call: unknown[]) => String(call[0]));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.router.query = {};
  mocks.supabase.from.mockImplementation((table: string) => query(mocks.tables[table] ?? { data: [], error: null }));
  mocks.supabase.auth.getSession.mockImplementation(async () => ({ data: { session: mocks.session.current } }));
  mocks.supabase.auth.getUser.mockImplementation(async () => ({ data: { user: mocks.session.current?.user ?? null }, error: null }));
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [], unreadCount: 0 }) }));
  vi.stubGlobal('fetch', fetchMock);
  signIn(DOCENTE, 'docente');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// D1 — the entry points
// ---------------------------------------------------------------------------

const bell = () => screen.getByRole('button', { name: /^Notificaciones/ });
const bellSettings = () => screen.queryByRole('link', { name: 'Configuración de notificaciones' });

describe('D1 — the bell menu gear', () => {
  const listStates: Array<[string, () => Promise<unknown>, RegExp]> = [
    ['an empty list', async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [], unreadCount: 0 }) }), /No tienes notificaciones/],
    ['a populated list', async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [NOTICE], unreadCount: 1 }) }), /Aviso sintético/],
    ['a failed read', async () => ({ ok: false, status: 500, json: async () => ({ success: false, error: 'Error sintético' }) }), /Intentar de nuevo/],
  ];

  it.each(listStates)('with %s, opens the settings page and closes the menu', async (_label, answer, shown) => {
    fetchMock.mockImplementation(answer);
    await renderWithRouter(<NotificationBell />);
    fireEvent.click(bell());
    await screen.findByText(shown);

    const gear = bellSettings()!;
    expect(gear).toHaveAttribute('href', SETTINGS);
    expect(gear).toHaveAttribute('data-testid', 'notification-dropdown-settings');
    fireEvent.click(gear);

    expect(navigatedTo()).toEqual([SETTINGS]);
    await waitFor(() => expect(bellSettings()).toBeNull());
  });

  it('is offered while the list is still loading', async () => {
    let release: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await renderWithRouter(<NotificationBell />);
    fireEvent.click(bell());

    expect(screen.getByText('Cargando notificaciones...')).toBeInTheDocument();
    expect(bellSettings()).toHaveAttribute('href', SETTINGS);
    await act(async () => release({ ok: true, status: 200, json: async () => ({ success: true, data: [], unreadCount: 0 }) }));
  });

  it('is reached and followed from the keyboard', async () => {
    const user = userEvent.setup();
    await renderWithRouter(<NotificationBell />);
    bell().focus();
    await user.keyboard('{Enter}');
    await screen.findByText('No tienes notificaciones');

    await user.tab();
    expect(bellSettings()).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(navigatedTo()).toEqual([SETTINGS]);
    await waitFor(() => expect(bellSettings()).toBeNull());
  });
});

describe('D1 — the gear of the active MainLayout bell (ModernNotificationCenter)', () => {
  const centerSettings = () => screen.queryByTestId('notification-center-settings');
  const listStates: Array<[string, Result, RegExp]> = [
    ['an empty list', { data: [], error: null }, /Sin notificaciones/],
    ['a populated list', { data: [NOTICE], error: null }, /Aviso sintético/],
    ['a failed read', { data: null, error: { message: 'lectura sintética fallida' } }, /Error al cargar/],
  ];

  it('is the bell the MainLayout sidebar renders', () => {
    const sidebar = readFileSync(join(ROOT, 'components/layout/Sidebar.tsx'), 'utf8');
    expect(sidebar).toContain("import ModernNotificationCenter from '../notifications/ModernNotificationCenter';");
    expect(sidebar).toMatch(/<ModernNotificationCenter \/>/);
    expect(readFileSync(join(ROOT, 'components/layout/MainLayout.tsx'), 'utf8')).toContain("import Sidebar from './Sidebar';");
  });

  it.each(listStates)('with %s, opens the settings page and closes the panel without touching notifications', async (_label, result, shown) => {
    mocks.tables.user_notifications = result;
    await renderWithRouter(<ModernNotificationCenter />);
    fireEvent.click(bell());
    await screen.findByText(shown);
    const reads = mocks.supabase.from.mock.calls.length;

    const gear = bellSettings()!;
    expect(gear).toHaveAttribute('href', SETTINGS);
    expect(gear).toHaveAttribute('data-testid', 'notification-center-settings');
    expect(gear).toHaveAttribute('title', 'Configuración de notificaciones');
    fireEvent.click(gear);

    expect(navigatedTo()).toEqual([SETTINGS]);
    expect(mocks.router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(centerSettings()).toBeNull());
    expect(mocks.supabase.from.mock.calls.length).toBe(reads);
  });

  it('is offered while the list is still loading', async () => {
    let release: (value: unknown) => void = () => {};
    mocks.supabase.auth.getSession.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await renderWithRouter(<ModernNotificationCenter />);
    fireEvent.click(bell());

    expect(screen.getByText('Cargando notificaciones...')).toBeInTheDocument();
    expect(centerSettings()).toHaveAttribute('href', SETTINGS);
    await act(async () => release({ data: { session: mocks.session.current } }));
  });

  it('is reached and followed from the keyboard', async () => {
    const user = userEvent.setup();
    await renderWithRouter(<ModernNotificationCenter />);
    await screen.findByRole('button', { name: 'Notificaciones' });
    bell().focus();
    await user.keyboard('{Enter}');
    await screen.findByText('Sin notificaciones');

    await user.tab();
    expect(centerSettings()).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(navigatedTo()).toEqual([SETTINGS]);
    await waitFor(() => expect(centerSettings()).toBeNull());
  });

  it.each([['ctrlKey'], ['metaKey'], ['shiftKey']])('a %s click keeps the native link behaviour (no client-side navigation)', async (modifier) => {
    await renderWithRouter(<ModernNotificationCenter />);
    fireEvent.click(bell());
    await screen.findByText('Sin notificaciones');

    const gear = centerSettings()!;
    expect(gear).toHaveAttribute('href', SETTINGS);
    // fireEvent returns false only when a handler called preventDefault: the browser keeps the open-elsewhere default.
    expect(fireEvent.click(gear, { [modifier]: true })).toBe(true);
    expect(nextRouter.push).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});

describe('D1 — the /notifications cog and Mi Perfil, for an administrator and a docente', () => {
  const people: Array<[string, typeof ADMIN | typeof DOCENTE, string]> = [
    ['admin', ADMIN, 'admin'],
    ['docente', DOCENTE, 'docente'],
  ];

  it.each(people)('%s: the /notifications cog opens the settings page', async (_label, person, role) => {
    signIn(person, role);
    await renderWithRouter(<NotificationsPage />);

    const cog = await screen.findByRole('link', { name: 'Configuración de notificaciones' });
    expect(cog).toHaveAttribute('href', SETTINGS);
    expect(cog).toHaveAttribute('data-testid', 'notifications-page-settings');
    cog.focus();
    expect(cog).toHaveFocus();
    fireEvent.click(cog);
    expect(navigatedTo()).toEqual([SETTINGS]);
  });

  it('the /notifications cog stays available when the notification read fails', async () => {
    mocks.tables.user_notifications = { data: null, error: { message: 'lectura sintética fallida' } };
    await renderWithRouter(<NotificationsPage />);

    expect(await screen.findByRole('link', { name: 'Configuración de notificaciones' })).toHaveAttribute('href', SETTINGS);
  });

  it.each(people)('%s: Mi Perfil links to the settings page', async (_label, person, role) => {
    signIn(person, role);
    await renderWithRouter(<ProfilePage />);

    const link = await screen.findByRole('link', { name: /Notificaciones por correo/ });
    expect(link).toHaveAttribute('href', SETTINGS);
    expect(link).toHaveAttribute('data-testid', 'profile-notification-settings');
    expect(link).toHaveAccessibleName(/Elige qué notificaciones recibes por correo/);
    fireEvent.click(link);
    expect(navigatedTo()).toEqual([SETTINGS]);
  });
});

// ---------------------------------------------------------------------------
// D2 — e-mail footers
// ---------------------------------------------------------------------------

describe('D2 — notification e-mails link to the settings page', () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL', 'EMAIL_FROM_ADDRESS', 'RESEND_API_KEY'];

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('the shared notification renderer links the canonical settings URL on the configured origin', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.example.cl';
    const { subject, html } = buildNotificationEmail({ title: 'Aviso', description: 'Texto', url: 'https://genera.example.cl/notifications' });

    expect(NOTIFICATION_SETTINGS_PATH).toBe(SETTINGS);
    expect(subject).toBe('Aviso');
    expect(html).toContain('Configuración de notificaciones: <a href="https://genera.example.cl/configuracion/notificaciones"');
    expect(html).toContain('>https://genera.example.cl/configuracion/notificaciones</a>');
    expect(html).toContain('href="https://genera.example.cl/notifications"');
    expect(html).not.toContain('/admin/configuration');
    expect(html).not.toContain('tab=preferences');
  });

  it('the settings URL is escaped for the attribute and the visible text', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.example.cl/a&b"c';
    const { html } = buildNotificationEmail({ title: 'Aviso', url: 'https://genera.example.cl/notifications' });

    expect(html).toContain('href="https://genera.example.cl/a&amp;b&quot;c/configuracion/notificaciones"');
    expect(html).not.toContain('a&b"c');
  });

  it('an unresolvable production origin still fails as before, before any message exists', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(() => buildNotificationEmail({ title: 'Aviso', url: '/x' })).toThrow(/URL pública/);
  });

  it('legacy template footers link the settings page, escaped, never the retired admin tab', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://genera.example.cl/"x';
    const html = [
      dailyDigestTemplate.generateHTML({ notifications: [], totalCount: 0, date: new Date('2026-10-08T12:00:00Z'), userName: 'Persona' }),
      immediateNotificationTemplate.generateHTML({ title: 'Aviso', description: 'Texto', category: 'system', priority: 'normal', url: '/notifications', userName: 'Persona' }),
    ];
    for (const body of html) {
      expect(body).toContain('href="https://genera.example.cl/&quot;x/configuracion/notificaciones"');
      expect(body).not.toContain('/admin/configuration');
      expect(body).not.toContain('tab=preferences');
    }
  });

  it('invitation and recovery mail carry no settings link and keep their own', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://genera.example.cl';
    const sent: Array<{ to: string; subject: string; html: string }> = [];
    const transport = vi.fn(async (message: any) => {
      sent.push(message);
      return { data: { id: 'synthetic-provider-id' }, error: null };
    });

    await sendPasswordRecoveryEmail(
      { to: 'persona@example.org', firstName: 'Persona', recoveryUrl: 'https://genera.example.cl/reset-password#token', authorization: PUBLIC_OUTBOUND_EMAIL },
      transport as any
    );
    await sendPasswordSetupEmail(
      { to: 'persona@example.org', firstName: 'Persona', bodyLine: 'Bienvenida', recoveryUrl: 'https://genera.example.cl/reset-password#setup', authorization: PUBLIC_OUTBOUND_EMAIL } as any,
      transport as any
    );

    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.to)).toEqual(['persona@example.org', 'persona@example.org']);
    expect(sent[0].html).toContain('https://genera.example.cl/reset-password#token');
    expect(sent[1].html).toContain('https://genera.example.cl/reset-password#setup');
    for (const message of sent) {
      expect(message.html).not.toContain('/configuracion');
      expect(message.html).not.toContain('Configuración de notificaciones');
    }
  });
});

// ---------------------------------------------------------------------------
// D3 — retirement of the admin tab and the dead preference APIs
// ---------------------------------------------------------------------------

describe('D3 — the admin configuration page', () => {
  // Imported here: the page builds its tab icons at module scope, which needs the global React set above.
  const page = () => import('../../pages/admin/configuration').then((module) => module.default);

  it('an administrator keeps every other tab and no longer sees personal preferences', async () => {
    signIn(ADMIN, 'admin');
    mocks.tables.user_roles = { data: [{ role_type: 'admin' }], error: null };
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) }));
    const AdminConfiguration = await page();
    await renderWithRouter(<AdminConfiguration />);

    const nav = await screen.findByRole('navigation');
    expect(within(nav).getAllByRole('button').map((tab) => tab.textContent)).toEqual([
      'Notificaciones',
      'Sistema General',
      'Usuarios y Permisos',
      'Personalización',
    ]);
    expect(screen.queryByText('Preferencias de Usuario')).toBeNull();
    // The notification-types tab points to the personal settings page instead of promising a future update.
    expect(await screen.findByTestId('admin-config-personal-settings')).toHaveAttribute('href', SETTINGS);
    expect(screen.queryByText(/futura actualización/)).toBeNull();
    expect(new Set(fetchMock.mock.calls.map(([url]) => url))).toEqual(new Set(['/api/admin/notification-types']));

    fireEvent.click(within(nav).getByRole('button', { name: 'Usuarios y Permisos' }));
    expect(await screen.findByTestId('feedback-permissions')).toBeInTheDocument();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/user/notification-preferences');
  });

  it('a non-administrator is still sent to the dashboard', async () => {
    signIn(DOCENTE, 'docente');
    const AdminConfiguration = await page();
    await renderWithRouter(<AdminConfiguration />);

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.router.push.mock.calls).toEqual([['/dashboard']]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('D3 — the dead preference routes and component are gone', () => {
  const RETIRED = [
    'pages/api/user/notification-preferences/bulk-update.ts',
    'pages/api/test/notification-preferences.ts',
    'components/configuration/UserPreferences.tsx',
  ];

  it.each(RETIRED)('%s no longer exists, so no route serves it', (path) => {
    expect(existsSync(join(ROOT, path))).toBe(false);
  });

  it('the owner preferences API and settings page remain', () => {
    expect(existsSync(join(ROOT, 'pages/api/user/notification-preferences.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'pages/configuracion/notificaciones.tsx'))).toBe(true);
  });

  it('no entry point still targets a retired surface', () => {
    for (const path of [
      'components/notifications/ModernNotificationCenter.tsx',
      'components/notifications/NotificationDropdown.tsx',
      'pages/notifications.tsx',
      'pages/profile.tsx',
      'pages/admin/configuration.tsx',
      'lib/emailTemplates.ts',
      'lib/email/notifications.ts',
    ]) {
      const source = readFileSync(join(ROOT, path), 'utf8');
      expect(source, path).not.toMatch(/tab=preferences|UserPreferences|notification-preferences\/bulk-update|api\/test\/notification-preferences/);
    }
  });
});

describe('D3 — notification URL helpers treat the personal settings as open to every role', () => {
  it.each(['/configuracion', SETTINGS])('%s is not admin-only and needs no role', (url) => {
    expect(isAdminOnlyRoute(url)).toBe(false);
    expect(getRequiredRole(url)).toBeNull();
    expect(getAccessibleUrl(url, 'docente')).toBe(url);
  });

  it('a docente may open the settings page, but the admin area stays admin-only', async () => {
    mocks.primaryRole.current = 'docente';
    expect(await checkUserAccess(SETTINGS, DOCENTE.id)).toBe(true);
    expect(await checkUserAccess('/admin/configuration', DOCENTE.id)).toBe(false);
    expect(isAdminOnlyRoute('/admin/configuration')).toBe(true);
    expect(getRequiredRole('/admin/configuration')).toBe('admin');
    expect(getAccessibleUrl('/admin/configuration', 'docente')).toBeNull();
  });

  it('a user with no role still gets no access anywhere', async () => {
    mocks.primaryRole.current = null;
    expect(await checkUserAccess(SETTINGS, DOCENTE.id)).toBe(false);
  });
});
