// @vitest-environment jsdom
/**
 * Redesign 5b: the new look's frame (MainLayout + Sidebar with the look `nuevo`).
 *
 * The collapsed menu and its floating list, the phone's drawer, the current entry and child, the
 * support count, the breadcrumbs in the top bar, the one-line footer with the addresses of
 * `components/Footer.tsx`, the bell in the top bar, the avatar and «Salir», and the page kept
 * mounted while the look changes under it. The accounts are invented.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as LookModule from '@/contexts/LookContext';

type Result = { data?: unknown; error: unknown; count?: number | null };

interface Account {
  id: string;
  roles: string[];
  isAdmin?: boolean;
}

const mocks = vi.hoisted(() => ({
  account: { id: 'synthetic-docente', roles: ['docente'] } as { id: string; roles: string[]; isAdmin?: boolean },
  router: {
    asPath: '/dashboard',
    pathname: '/dashboard',
    query: {} as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(() => Promise.resolve()),
    events: { on: vi.fn(), off: vi.fn() },
  },
  logout: vi.fn(),
}));

function builder(table: string): any {
  const list = (): Result => {
    switch (table) {
      case 'platform_feedback':
        return { count: 4, error: null };
      case 'assessment_instance_assignees':
        return { count: 0, error: null };
      default:
        return { data: [], error: null };
    }
  };
  const single = (): Result =>
    table === 'profiles'
      ? { data: { school: 'Colegio Sintético del Valle', can_run_qa_tests: false }, error: null }
      : { data: null, error: { code: 'PGRST116' } };
  const self: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (r: Result) => unknown) => resolve(list());
        if (prop === 'single') return () => Promise.resolve(single());
        return () => self;
      },
    }
  );
  return self;
}

const supabase = { from: vi.fn((table: string) => builder(table)) };

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabase,
  useUser: () => null,
  useSessionContext: () => ({ session: null, isLoading: false }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mocks.account.id, email: `${mocks.account.id}@example.invalid`, user_metadata: {} },
    isAdmin: !!mocks.account.isAdmin,
    isGlobalAdmin: !!mocks.account.isAdmin,
    userRoles: mocks.account.roles.map((role_type) => ({ role_type, is_active: true, school_id: null, school: null })),
    avatarUrl: '',
    logout: mocks.logout,
    profile: { school_id: null, school: null },
    loading: false,
  }),
}));
// The look comes from a real React context here, as in the app: a change of look re-renders its
// readers even through `React.memo`.
vi.mock('@/contexts/LookContext', async () => {
  const ReactModule = await import('react');
  const LookTestContext = ReactModule.createContext({ look: 'clasico' as 'clasico' | 'nuevo', setLook: (_: unknown) => {} });
  return { useLook: () => ReactModule.useContext(LookTestContext), LookTestContext };
});
vi.mock('@/contexts/PermissionContext', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    loading: false,
  }),
}));
vi.mock('@/hooks/useAvatar', () => ({ useAvatar: () => ({ url: null, loading: false }) }));
vi.mock('@/components/common/Avatar', () => ({
  default: ({ size }: { size?: string }) => <span data-marker="avatar" data-size={size} />,
}));
vi.mock('@/components/notifications/ModernNotificationCenter', () => ({
  default: (props: Record<string, unknown>) => (
    <span data-marker="notification-center" data-panel-align={String(props.panelAlign ?? 'default')} />
  ),
}));
vi.mock('@/components/feedback/FeedbackButtonWithPermissions', () => ({
  default: () => <span data-marker="feedback-button" />,
}));
vi.mock('@/utils/navigationManager', () => ({ navigationManager: { prefetchRoute: vi.fn() } }));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));

import MainLayout from '@/components/layout/MainLayout';
import Footer from '@/components/Footer';

const LookTestContext = (LookModule as unknown as { LookTestContext: React.Context<{ look: string; setLook: () => void }> })
  .LookTestContext;

const ADMIN: Account = { id: 'synthetic-admin', roles: ['admin'], isAdmin: true };
const DOCENTE: Account = { id: 'synthetic-docente', roles: ['docente'] };

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {});
  }
}

function go(path: string) {
  mocks.router.asPath = path;
  mocks.router.pathname = path.split('?')[0];
}

type LayoutProps = Partial<React.ComponentProps<typeof MainLayout>>;

function frame(look: 'clasico' | 'nuevo', props: LayoutProps = {}, children: React.ReactNode = <p>Contenido de la página</p>) {
  return (
    <LookTestContext.Provider value={{ look, setLook: () => {} }}>
      <MainLayout {...props}>{children}</MainLayout>
    </LookTestContext.Provider>
  );
}

async function draw(props: LayoutProps = {}, account: Account = DOCENTE) {
  mocks.account = account;
  const view = render(frame('nuevo', props));
  await settle();
  return view;
}

const sidebar = () => screen.getByTestId('global-sidebar');
const topBar = () => document.querySelector('[data-frame="topbar"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  go('/dashboard');
  setWidth(1280);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hasPasantia: false }) })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  setWidth(1024);
});

describe('the new frame: the sidebar on a desktop', () => {
  it('is black and 264 px wide, with the mark, the two lines of the head, and the foot', async () => {
    await draw();
    expect(sidebar().className).toContain('bg-[#0a0a0a]');
    expect(sidebar().className).toContain('w-[264px]');
    expect(within(sidebar()).getByAltText('Genera')).toHaveAttribute('src', '/genera/icon-transparent.svg');
    expect(within(sidebar()).getByText('Genera')).toBeInTheDocument();
    expect(within(sidebar()).getByText('Hub de Transformación')).toBeInTheDocument();
    expect(within(sidebar()).getByText('by FNE')).toBeInTheDocument();
    expect(within(sidebar()).getByText('Fundación Nueva Educación')).toBeInTheDocument();
    expect(within(sidebar()).getByRole('button', { name: 'Contraer sidebar' })).toHaveAttribute('title', 'Contraer sidebar');
    const content = screen.getByRole('main').parentElement!.parentElement!;
    expect(content.className).toContain('lg:ml-[264px]');
  });

  it('prints no description: it is the entry\'s tooltip', async () => {
    await draw();
    const entry = screen.getByTestId('sidebar-item-dashboard');
    expect(entry).toHaveAttribute('title', 'Panel principal');
    expect(entry).toHaveTextContent(/^Mi Panel$/);
    expect(within(sidebar()).queryByText('Panel principal')).not.toBeInTheDocument();
  });

  it('collapsed (remembered): 68 px, icons only, the mark and the foot hidden, the label as tooltip', async () => {
    window.localStorage.setItem('fne-sidebar-collapsed', 'true');
    await draw();
    expect(sidebar().className).toContain('w-[68px]');
    expect(screen.getByRole('main').parentElement!.parentElement!.className).toContain('lg:ml-[68px]');
    expect(within(sidebar()).queryByAltText('Genera')).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Fundación Nueva Educación')).not.toBeInTheDocument();
    const entry = screen.getByTestId('sidebar-item-dashboard');
    expect(entry).toHaveAttribute('title', 'Mi Panel');
    expect(entry).toHaveTextContent(/^$/);
    // The same toggle and the same remembered state as today.
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Expandir sidebar' }));
    await settle();
    expect(window.localStorage.getItem('fne-sidebar-collapsed')).toBe('false');
    expect(sidebar().className).toContain('w-[264px]');
  });

  it('collapsed: a group\'s floating list opens by a click and closes by a click outside', async () => {
    window.localStorage.setItem('fne-sidebar-collapsed', 'true');
    await draw();
    const group = screen.getByTestId('sidebar-item-mi-aprendizaje');
    expect(group).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(group);
    const flyout = document.querySelector('[data-frame="flyout"]') as HTMLElement;
    expect(flyout).not.toBeNull();
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(within(flyout).getByText('Mi Aprendizaje')).toBeInTheDocument();
    expect(within(flyout).getByText('Rutas y cursos asignados')).toBeInTheDocument();
    const link = within(flyout).getByRole('link', { name: /^Mis Tareas/ });
    expect(link).toHaveAttribute('href', '/mi-aprendizaje/tareas');
    expect(within(link).getByText('Tareas de todas mis comunidades')).toBeInTheDocument();
    // No dot with the number of children (dropped with the mock-up).
    expect(group).toHaveTextContent(/^$/);
    fireEvent.mouseDown(document.body);
    expect(document.querySelector('[data-frame="flyout"]')).toBeNull();
  });

  it('collapsed: the floating list opens by hover after 150 ms and closes on leaving', async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem('fne-sidebar-collapsed', 'true');
      mocks.account = DOCENTE;
      render(frame('nuevo'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const wrapper = screen.getByTestId('sidebar-item-mi-aprendizaje').parentElement!;
      fireEvent.mouseEnter(wrapper);
      act(() => {
        vi.advanceTimersByTime(140);
      });
      expect(document.querySelector('[data-frame="flyout"]')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(document.querySelector('[data-frame="flyout"]')).not.toBeNull();
      fireEvent.mouseLeave(wrapper);
      expect(document.querySelector('[data-frame="flyout"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the current entry, and the current child with its group open', async () => {
    await draw();
    expect(screen.getByTestId('sidebar-item-dashboard')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('sidebar-item-profile')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('sidebar-item-dashboard').querySelector('.bg-\\[\\#fbbf24\\]')).not.toBeNull();
  });

  it('marks the current child, inside its open group', async () => {
    go('/mi-aprendizaje/tareas');
    await draw();
    const group = screen.getByTestId('sidebar-item-mi-aprendizaje');
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(group).not.toHaveAttribute('aria-current');
    const child = within(sidebar()).getByRole('link', { name: 'Mis Tareas' });
    expect(child).toHaveAttribute('aria-current', 'page');
    expect(child).toHaveAttribute('title', 'Tareas de todas mis comunidades');
    expect(within(sidebar()).getByRole('link', { name: 'Mis Cursos' })).not.toHaveAttribute('aria-current');
    fireEvent.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar()).queryByRole('link', { name: 'Mis Tareas' })).not.toBeInTheDocument();
  });

  it('shows the count of new support reports on «Gestión» and on «Soporte Técnico»', async () => {
    go('/admin/feedback');
    await draw({}, ADMIN);
    expect(screen.getByTestId('sidebar-item-gestion')).toHaveTextContent(/^Gestión4$/);
    const support = within(sidebar()).getByRole('link', { name: /^Soporte Técnico/ });
    expect(support).toHaveTextContent(/^Soporte Técnico4$/);
    expect(support).toHaveAttribute('aria-current', 'page');
    expect(within(support).getByText('4').className).toContain('bg-[#fbbf24]');
  });

  describe('every top-level button is named by its entry\'s label (5b, send-back 1)', () => {
    const named = (testId: string, label: string) => {
      const button = screen.getByTestId(testId);
      expect(within(sidebar()).getByRole('button', { name: label })).toBe(button);
      expect(button).toHaveAttribute('aria-label', label);
    };

    it('expanded: a group, a plain entry, and a group showing a count', async () => {
      go('/admin/feedback');
      await draw({}, ADMIN);
      named('sidebar-item-mi-aprendizaje', 'Mi Aprendizaje');
      named('sidebar-item-dashboard', 'Mi Panel');
      named('sidebar-item-gestion', 'Gestión');
      // What is drawn expanded does not change.
      expect(screen.getByTestId('sidebar-item-gestion')).toHaveTextContent(/^Gestión4$/);
      expect(screen.getByTestId('sidebar-item-dashboard')).toHaveTextContent(/^Mi Panel$/);
    });

    it('collapsed: a group and a plain entry', async () => {
      window.localStorage.setItem('fne-sidebar-collapsed', 'true');
      await draw();
      named('sidebar-item-mi-aprendizaje', 'Mi Aprendizaje');
      named('sidebar-item-dashboard', 'Mi Panel');
      expect(screen.getByTestId('sidebar-item-mi-aprendizaje')).toHaveTextContent(/^$/);
    });
  });

  it('a group without visible children and without an address is not drawn', async () => {
    await draw();
    // A docente sees none of «Comunicación»'s children.
    expect(screen.queryByTestId('sidebar-item-comunicacion')).not.toBeInTheDocument();
  });
});

describe('the new frame: the drawer on a phone', () => {
  async function phone() {
    setWidth(390);
    await draw({ pageTitle: 'Mi Panel' });
    expect(screen.queryByTestId('mobile-sidebar-overlay')).not.toBeInTheDocument();
    expect(sidebar().className).toContain('-translate-x-full');
    fireEvent.click(screen.getByTestId('mobile-sidebar-trigger'));
    await settle();
    expect(screen.getByTestId('mobile-sidebar-overlay')).toBeInTheDocument();
    expect(sidebar().className).toContain('translate-x-0');
    expect(sidebar().className).toContain('w-[min(300px,86vw)]');
    expect(document.body.style.overflow).toBe('hidden');
  }

  const closed = () => {
    expect(screen.queryByTestId('mobile-sidebar-overlay')).not.toBeInTheDocument();
    expect(sidebar().className).toContain('-translate-x-full');
    expect(document.body.style.overflow).not.toBe('hidden');
  };

  it('opens from the top bar and closes by its X', async () => {
    await phone();
    expect(screen.getByTestId('mobile-sidebar-trigger')).toHaveAttribute('aria-label', 'Abrir menú de navegación');
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Cerrar menú' }));
    await settle();
    closed();
  });

  it('closes by the veil', async () => {
    await phone();
    fireEvent.click(screen.getByTestId('mobile-sidebar-overlay'));
    await settle();
    closed();
  });

  it('closes by Escape', async () => {
    await phone();
    fireEvent.keyDown(window, { key: 'Escape' });
    await settle();
    closed();
  });

  it('closes after a navigation', async () => {
    const view = await (async () => {
      setWidth(390);
      mocks.account = DOCENTE;
      const v = render(frame('nuevo'));
      await settle();
      fireEvent.click(screen.getByTestId('mobile-sidebar-trigger'));
      await settle();
      return v;
    })();
    expect(screen.getByTestId('mobile-sidebar-overlay')).toBeInTheDocument();
    go('/profile');
    view.rerender(frame('nuevo'));
    await settle();
    closed();
  });
});

describe('the new frame: the top bar', () => {
  const crumbs = {
    pageTitle: 'Mis Tareas',
    breadcrumbs: [{ label: 'Inicio', href: '/dashboard' }, { label: 'Mi Aprendizaje', href: '/mi-aprendizaje' }, { label: 'Mis Tareas' }],
  };

  it('draws the breadcrumbs with today\'s labels and addresses; the last one is not a link', async () => {
    await draw(crumbs);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(topBar()).toContainElement(nav);
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Inicio', '/dashboard'],
      ['Mi Aprendizaje', '/mi-aprendizaje'],
    ]);
    const last = within(nav).getByText('Mis Tareas');
    expect(last.tagName).toBe('SPAN');
    expect(last.className).toContain('text-gray-900');
    // Not repeated under the bar: one breadcrumb trail only.
    expect(screen.getAllByRole('navigation', { name: 'Breadcrumb' })).toHaveLength(1);
    // The title under the bar: the same h1, the same text, outside the top bar.
    const h1 = screen.getByRole('heading', { level: 1, name: 'Mis Tareas' });
    expect(topBar()).not.toContainElement(h1);
    expect(h1.className).toBe('text-2xl sm:text-3xl font-bold text-[#0a0a0a]');
  });

  it('on a phone names only the current page: the last crumb, else the title, else nothing', async () => {
    const view = await draw(crumbs);
    expect(screen.getByTestId('topbar-current-page')).toHaveTextContent('Mis Tareas');
    expect(screen.getByTestId('topbar-current-page').className).toContain('lg:hidden');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).className).toContain('hidden lg:flex');
    view.rerender(frame('nuevo', { pageTitle: 'Solo un título' }));
    expect(screen.getByTestId('topbar-current-page')).toHaveTextContent('Solo un título');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    view.rerender(frame('nuevo', {}));
    expect(screen.queryByTestId('topbar-current-page')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('holds the bell; the sidebar does not', async () => {
    await draw();
    const bells = document.querySelectorAll('[data-marker="notification-center"]');
    expect(bells).toHaveLength(1);
    expect(topBar()).toContainElement(bells[0] as HTMLElement);
    expect(sidebar()).not.toContainElement(bells[0] as HTMLElement);
    expect(bells[0]).toHaveAttribute('data-panel-align', 'right');
  });

  it('shows the school\'s name, the avatar to «Mi Perfil», and «Salir» calling the frame\'s logout', async () => {
    await draw();
    expect(within(topBar()).getByText('Colegio Sintético del Valle').className).toContain('hidden lg:block');
    const avatar = topBar().querySelector('[data-marker="avatar"]')!.closest('a')!;
    expect(avatar).toHaveAttribute('href', '/profile');
    expect(avatar).toHaveAttribute('title', 'Mi Perfil');
    const salir = within(topBar()).getByRole('button', { name: 'Salir' });
    fireEvent.click(salir);
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it('«Salir» in today\'s frame calls the same handler', async () => {
    mocks.account = DOCENTE;
    render(frame('clasico'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Salir/ }));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});

describe('the new frame: its layers (5b, send-back 1)', () => {
  const layer = (element: Element | null) => {
    const found = (element?.getAttribute('class') ?? '').split(/\s+/).filter((c) => /^z-/.test(c));
    expect(found, `one layer on ${element?.outerHTML.slice(0, 80)}`).toHaveLength(1);
    const match = /^z-\[?(\d+)\]?$/.exec(found[0]);
    expect(match, found[0]).not.toBeNull();
    return Number(match![1]);
  };
  const SOURCE = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

  it('the feedback button and its tooltip are at 40 and dialogs at 50, as the numbers below assume', () => {
    const feedback = SOURCE('components/feedback/FeedbackButtonWithPermissions.tsx');
    expect(feedback).toContain('fixed bottom-6 right-6 z-40');
    expect(feedback).toContain('fixed bottom-24 right-6 z-40');
    expect(SOURCE('components/ui/dialog.tsx')).toContain('fixed inset-0 z-50');
  });

  it('desktop: the page < the feedback button < the top bar (and the bell\'s panel in it) < the sidebar < 50', async () => {
    await draw();
    const bar = layer(topBar());
    const side = layer(sidebar());
    expect(topBar()).toContainElement(document.querySelector('[data-marker="notification-center"]') as HTMLElement);
    expect(bar).toBe(45);
    expect(side).toBe(46);
    expect(bar).toBeGreaterThan(40);
    expect(side).toBeGreaterThan(bar);
    expect(side).toBeLessThan(50);
  });

  it('phone: the top bar < the veil < the open drawer < 50', async () => {
    setWidth(390);
    await draw();
    fireEvent.click(screen.getByTestId('mobile-sidebar-trigger'));
    await settle();
    const bar = layer(topBar());
    const veil = layer(screen.getByTestId('mobile-sidebar-overlay'));
    const drawer = layer(sidebar());
    expect([bar, veil, drawer]).toEqual([45, 48, 49]);
    expect(veil).toBeGreaterThan(bar);
    expect(drawer).toBeGreaterThan(veil);
    expect(drawer).toBeLessThan(50);
  });

  it('today\'s frame keeps its numbers: bar 20, sidebar 30, veil 40, phone drawer 50', async () => {
    mocks.account = DOCENTE;
    const desktop = render(frame('clasico'));
    await settle();
    expect(document.querySelector('.sticky')!.className).toContain('z-20');
    expect(sidebar().className).toContain('lg:z-30');
    desktop.unmount();
    setWidth(390);
    render(frame('clasico'));
    await settle();
    fireEvent.click(screen.getByTestId('mobile-sidebar-trigger'));
    await settle();
    expect(screen.getByTestId('mobile-sidebar-overlay').className).toContain('z-40');
    expect(sidebar().className).toContain('z-50 lg:z-30');
  });
});

describe('the new frame: the footer', () => {
  it('has today\'s six links with the addresses of components/Footer.tsx, the two pop-ups and the two lines', async () => {
    const reference = render(<Footer />);
    const labels = ['Pasantías', 'Programas', 'Noticias y Eventos', 'Nosotros', 'Equipo', 'Contacto'];
    const addresses = labels.map((label) => screen.getByRole('link', { name: label }).getAttribute('href'));
    expect(addresses.every(Boolean)).toBe(true);
    reference.unmount();

    await draw();
    const footer = screen.getByTestId('footer-nuevo');
    expect(within(footer).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      labels.map((label, i) => [label, addresses[i]])
    );
    expect(within(footer).getByText('ATE certificada por RPA Mineduc')).toBeInTheDocument();
    expect(within(footer).getByText('Santiago, Chile')).toBeInTheDocument();
    // Today's big footer is not drawn in the new frame.
    expect(screen.queryByText('Síguenos')).not.toBeInTheDocument();
    expect(screen.queryByText('info@nuevaeducacion.org')).not.toBeInTheDocument();

    fireEvent.click(within(footer).getByRole('button', { name: 'Política de Privacidad' }));
    expect(screen.getByRole('heading', { name: 'Política de Privacidad' })).toBeInTheDocument();
  });

  it('opens the terms of use as today', async () => {
    await draw();
    fireEvent.click(within(screen.getByTestId('footer-nuevo')).getByRole('button', { name: 'Términos de Uso' }));
    expect(screen.getAllByText('Términos de Uso').length).toBeGreaterThan(1);
  });

  it('keeps the feedback button, as today, in both frames', async () => {
    await draw();
    expect(document.querySelectorAll('[data-marker="feedback-button"]')).toHaveLength(1);
  });
});

describe('nothing is cut, and the footer sits at the bottom (5b, send-back 2)', () => {
  // The classes that cut a text, built from parts so that this file names none of them.
  const CUTTING = [
    ['trun', 'cate'],
    ['text-', 'ellipsis'],
    ['text-', 'clip'],
    ['whitespace-', 'nowrap'],
    ['overflow-', 'hidden'],
    ['overflow-x-', 'hidden'],
    ['line-', 'clamp'],
  ].map((parts) => parts.join(''));
  const classes = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  /** The cutting classes on an element and on its ancestors up to `top` (included). */
  const cutsFrom = (element: Element, top: Element) => {
    const found: string[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      for (const name of classes(node)) {
        if (CUTTING.some((word) => name === word || name.startsWith(`${word}-`))) found.push(name);
      }
      if (node === top) break;
    }
    return found;
  };
  /** The first element holding text and no other element: an entry's or a child's label. */
  const label = (row: Element) =>
    Array.from(row.querySelectorAll('*')).find((node) => node.children.length === 0 && (node.textContent ?? '').trim() !== '');

  function expectWholeLabels(container: HTMLElement) {
    const entries = Array.from(container.querySelectorAll('[data-testid^="sidebar-item-"]'));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const name = entry.getAttribute('aria-label')!;
      const text = label(entry);
      expect(text?.textContent, name).toBe(name);
      expect(cutsFrom(text!, entry), name).toEqual([]);
    }
  }

  function expectWholeChildren(container: HTMLElement) {
    const links = within(container).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const text = label(link);
      expect(text, link.outerHTML.slice(0, 80)).toBeTruthy();
      expect(cutsFrom(text!, link), text!.textContent!).toEqual([]);
    }
  }

  /** Opens every group in turn and checks its children's labels while it is open. */
  async function everyGroupOpen(check: () => void) {
    const groups = Array.from(sidebar().querySelectorAll('[data-testid^="sidebar-item-"][aria-expanded]'));
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      if (group.getAttribute('aria-expanded') === 'false') fireEvent.click(group);
      await settle();
      expect(group).toHaveAttribute('aria-expanded', 'true');
      check();
    }
  }

  it('the head holds the whole «Hub de Transformación · by FNE», and nothing on it cuts text', async () => {
    await draw();
    const first = within(sidebar()).getByText('Hub de Transformación');
    const head = first.parentElement!;
    expect(Array.from(head.children).map((line) => line.textContent)).toEqual(['Hub de Transformación', 'by FNE']);
    // The words of today's line, in their order.
    const words = (text: string) => text.split(/[\s·]+/).filter(Boolean);
    expect(Array.from(head.children).flatMap((line) => words(line.textContent ?? ''))).toEqual(
      words('Hub de Transformación · by FNE')
    );
    for (const line of Array.from(head.children)) expect(cutsFrom(line, sidebar())).toEqual([]);
  });

  it('expanded on a desktop: no entry\'s label and no child\'s label carries a class that cuts it', async () => {
    go('/admin/feedback');
    await draw({}, ADMIN);
    expect(within(sidebar()).getByTestId('sidebar-item-vias-transformacion')).toBeInTheDocument();
    expectWholeLabels(sidebar());
    await everyGroupOpen(() => expectWholeChildren(sidebar().querySelector('nav')!));
  });

  it('in the phone\'s drawer: the same', async () => {
    setWidth(390);
    await draw({}, ADMIN);
    fireEvent.click(screen.getByTestId('mobile-sidebar-trigger'));
    await settle();
    expect(sidebar().className).toContain('translate-x-0');
    expectWholeLabels(sidebar());
    await everyGroupOpen(() => expectWholeChildren(sidebar().querySelector('nav')!));
  });

  it('collapsed: no label in a group\'s floating list carries a class that cuts it', async () => {
    window.localStorage.setItem('fne-sidebar-collapsed', 'true');
    await draw({}, ADMIN);
    const groups = Array.from(sidebar().querySelectorAll('[data-testid^="sidebar-item-"][aria-expanded]'));
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      fireEvent.click(group);
      const flyout = document.querySelector('[data-frame="flyout"]') as HTMLElement;
      expect(flyout, group.getAttribute('aria-label')!).not.toBeNull();
      const heading = within(flyout).getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent(group.getAttribute('aria-label')!);
      expect(cutsFrom(heading, flyout)).toEqual([]);
      expectWholeChildren(flyout);
      fireEvent.mouseDown(document.body);
      expect(document.querySelector('[data-frame="flyout"]')).toBeNull();
    }
  });

  it('the new frame: <main>\'s wrapper is a column filling the window under the top bar, <main> grows, the footer follows it', async () => {
    await draw();
    const main = screen.getByRole('main');
    const wrapper = main.parentElement!;
    const area = wrapper.parentElement!;
    // The area beside the sidebar is a column at least as high as the window...
    expect(classes(area)).toEqual(expect.arrayContaining(['min-h-screen', 'flex', 'flex-col']));
    // ...the top bar keeps its height in it...
    expect(classes(topBar())).toEqual(expect.arrayContaining(['shrink-0']));
    expect(topBar().parentElement).toBe(area);
    // ...the wrapper takes what is left (not a window's height of its own, which would push the
    // footer a top bar's height below the window) and is a column too...
    expect(classes(wrapper)).toEqual(expect.arrayContaining(['flex-1', 'flex', 'flex-col']));
    expect(classes(wrapper)).not.toContain('min-h-screen');
    // ...in which <main> grows and the footer comes last, directly after it.
    expect(classes(main)).toEqual(expect.arrayContaining(['flex-1']));
    expect(main.nextElementSibling).toBe(screen.getByTestId('footer-nuevo'));
    // The page's light grey is the frame's own: nothing between it and the footer paints white.
    expect(classes(area).some((name) => name.startsWith('bg-'))).toBe(false);
    expect(classes(wrapper).some((name) => name.startsWith('bg-'))).toBe(false);
    expect(classes(main).some((name) => name.startsWith('bg-'))).toBe(false);
    expect(classes(area.parentElement!)).toContain('bg-gray-50');
  });

  it('today\'s frame: the same chain to <main>, with today\'s class names', async () => {
    mocks.account = DOCENTE;
    render(frame('clasico'));
    await settle();
    const main = screen.getByRole('main');
    expect(main.className).toBe('flex-1');
    expect(main.parentElement!.className).toBe('min-h-screen w-full');
    expect(main.parentElement!.parentElement!.className).toBe('min-h-screen transition-all duration-300 lg:ml-80');
    expect(document.querySelector('.sticky')!.className).toBe('bg-[#0a0a0a] sticky top-0 z-20 h-20 flex items-center');
  });
});

describe('the page is not remounted when the look changes', () => {
  it('a page mounted once while the look goes clasico → nuevo → clasico, with no data asked again', async () => {
    let mounts = 0;
    let unmounts = 0;
    function Page() {
      const [typed, setTyped] = React.useState('');
      React.useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <input aria-label="Campo de la página" value={typed} onChange={(e) => setTyped(e.target.value)} />;
    }

    mocks.account = DOCENTE;
    const props = { pageTitle: 'Mis Tareas', breadcrumbs: [{ label: 'Mi Aprendizaje', href: '/mi-aprendizaje' }, { label: 'Mis Tareas' }] };
    const view = render(frame('clasico', props, <Page />));
    await settle();
    fireEvent.change(screen.getByLabelText('Campo de la página'), { target: { value: 'escrito a medias' } });
    const callsBefore = supabase.from.mock.calls.length;
    const fetchesBefore = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(document.querySelector('[data-frame="topbar"]')).toBeNull();

    view.rerender(frame('nuevo', props, <Page />));
    await settle();
    expect(document.querySelector('[data-frame="topbar"]')).not.toBeNull();
    expect(screen.getByTestId('global-sidebar').className).toContain('bg-[#0a0a0a]');

    view.rerender(frame('clasico', props, <Page />));
    await settle();
    expect(document.querySelector('[data-frame="topbar"]')).toBeNull();

    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
    expect(screen.getByLabelText('Campo de la página')).toHaveValue('escrito a medias');
    expect(supabase.from.mock.calls.length).toBe(callsBefore);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchesBefore);
  });
});
