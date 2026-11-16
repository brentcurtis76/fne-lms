// @vitest-environment jsdom
/**
 * Redesign 5b, step 0: today's frame (MainLayout + Sidebar) pinned BEFORE the new frame is built.
 *
 * The snapshots in `__snapshots__/frame.clasico.test.tsx.snap` were written by the code as it was
 * before 5b. With the look `clasico` the frame must stay exactly that: the same elements, classes,
 * attributes, texts and order. If a later change makes one of these snapshots fail, it changed
 * today's frame. Never update the snapshot file to make it pass.
 *
 * The accounts are invented. Components the frame only places (the bell, the avatar, the feedback
 * button) are replaced by markers that carry the props the frame gives them, so their own data
 * calls stay out of the picture while their place in the frame is pinned.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QA_SIMULATION_SCHOOL_IDS } from '@/lib/simulation/constants';

type Result = { data?: unknown; error: unknown; count?: number | null };

interface Account {
  id: string;
  roles: string[];
  isAdmin?: boolean;
  community?: boolean;
  qaTester?: boolean;
  qaSchool?: boolean;
  assessments?: boolean;
  pasantia?: boolean;
  permissions?: string[];
}

const mocks = vi.hoisted(() => ({
  account: null as any,
  router: {
    asPath: '/mi-aprendizaje/tareas',
    pathname: '/mi-aprendizaje/tareas',
    query: {} as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(() => Promise.resolve()),
    events: { on: vi.fn(), off: vi.fn() },
  },
  logout: vi.fn(),
  look: 'clasico' as 'clasico' | 'nuevo',
}));

/** A Supabase query builder: filters return the builder; awaiting it or `.single()` gives the table's answer. */
function builder(table: string): any {
  const a = mocks.account as Account;
  const list = (): Result => {
    switch (table) {
      case 'user_roles':
        return { data: a.community ? [{ community_id: 'synthetic-community' }] : [], error: null };
      case 'assessment_instance_assignees':
        return { count: a.assessments ? 1 : 0, error: null };
      case 'platform_feedback':
        return { count: 4, error: null };
      default:
        return { data: [], error: null };
    }
  };
  const single = (): Result => {
    switch (table) {
      case 'profiles':
        return {
          data: {
            first_name: 'Persona',
            last_name: 'Sintética',
            school: 'Colegio Sintético del Valle',
            growth_community: null,
            avatar_url: null,
            can_run_qa_tests: !!a.qaTester,
          },
          error: null,
        };
      case 'superadmins':
        return { data: null, error: { code: 'PGRST116' } };
      default:
        return { data: null, error: null };
    }
  };
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
  useAuth: () => {
    const a = mocks.account as Account;
    return {
      user: { id: a.id, email: `${a.id}@example.invalid`, user_metadata: {} },
      isAdmin: !!a.isAdmin,
      isGlobalAdmin: !!a.isAdmin,
      userRoles: a.roles.map((role_type) => ({
        role_type,
        is_active: true,
        school_id: a.qaSchool ? QA_SIMULATION_SCHOOL_IDS[0] : null,
        school: a.qaSchool ? { tenant_kind: 'qa' } : null,
      })),
      avatarUrl: '',
      logout: mocks.logout,
      profile: a.qaSchool
        ? { school_id: QA_SIMULATION_SCHOOL_IDS[0], school: { tenant_kind: 'qa' } }
        : { school_id: null, school: null },
      loading: false,
    };
  },
}));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: mocks.look, setLook: vi.fn() }) }));
vi.mock('@/contexts/PermissionContext', () => ({
  usePermissions: () => {
    const granted = new Set((mocks.account as Account).permissions ?? []);
    return {
      hasPermission: (p: string) => granted.has(p),
      hasAnyPermission: (ps: string[]) => ps.some((p) => granted.has(p)),
      hasAllPermissions: (ps: string[]) => ps.every((p) => granted.has(p)),
      loading: false,
    };
  },
}));
vi.mock('@/hooks/useAvatar', () => ({ useAvatar: () => ({ url: null, loading: false }) }));
vi.mock('@/components/common/Avatar', () => ({
  default: ({ size, className }: { size?: string; className?: string }) => (
    <span data-marker="avatar" data-size={size} data-class={className} />
  ),
}));
vi.mock('@/components/notifications/ModernNotificationCenter', () => ({
  default: (props: Record<string, unknown>) => <span data-marker="notification-center" data-props={JSON.stringify(props)} />,
}));
vi.mock('@/components/feedback/FeedbackButtonWithPermissions', () => ({
  default: () => <span data-marker="feedback-button" />,
}));
vi.mock('@/utils/navigationManager', () => ({ navigationManager: { prefetchRoute: vi.fn() } }));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => false }));

import MainLayout from '@/components/layout/MainLayout';

const ACCOUNTS: Record<string, Account> = {
  admin: { id: 'synthetic-admin', roles: ['admin'], isAdmin: true },
  consultor: { id: 'synthetic-consultor', roles: ['consultor'] },
  docente: { id: 'synthetic-docente', roles: ['docente'] },
  'equipo directivo': { id: 'synthetic-directivo', roles: ['equipo_directivo'] },
  'encargado de licitación': {
    id: 'synthetic-licitacion',
    roles: ['encargado_licitacion'],
    permissions: ['view_contracts_own', 'view_internship_proposals_own'],
  },
  'docente with a community': { id: 'synthetic-community', roles: ['docente'], community: true },
  'QA tester on a QA school': { id: 'synthetic-qa', roles: ['docente'], qaTester: true, qaSchool: true },
  'docente with assessments': { id: 'synthetic-assessments', roles: ['lider_comunidad'], assessments: true },
  'docente with a pasantía': { id: 'synthetic-pasantia', roles: ['docente'], pasantia: true },
};

type State = 'desktop expanded' | 'desktop collapsed' | 'phone with the drawer open';
const STATES: State[] = ['desktop expanded', 'desktop collapsed', 'phone with the drawer open'];

const TITLE = {
  pageTitle: 'Mis Tareas',
  breadcrumbs: [{ label: 'Mi Aprendizaje', href: '/mi-aprendizaje' }, { label: 'Mis Tareas' }],
};

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {});
  }
}

async function draw(accountName: string, state: State, withTitle: boolean) {
  mocks.account = ACCOUNTS[accountName];
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hasPasantia: !!mocks.account.pasantia }) })
    )
  );
  if (state === 'desktop collapsed') window.localStorage.setItem('fne-sidebar-collapsed', 'true');
  setWidth(state === 'phone with the drawer open' ? 390 : 1280);
  const view = render(
    <MainLayout {...(withTitle ? TITLE : {})}>
      <p>Contenido de la página</p>
    </MainLayout>
  );
  await settle();
  if (state === 'phone with the drawer open') {
    fireEvent.click(screen.getByTestId('mobile-sidebar-trigger'));
    await settle();
  }
  return view;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.router.asPath = '/mi-aprendizaje/tareas';
  mocks.router.pathname = '/mi-aprendizaje/tareas';
  mocks.look = 'clasico';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setWidth(1024);
});

describe("today's frame, look clasico (pinned before 5b)", () => {
  for (const accountName of Object.keys(ACCOUNTS)) {
    for (const state of STATES) {
      it(`${accountName}, ${state}, with a title and breadcrumbs`, async () => {
        const { asFragment } = await draw(accountName, state, true);
        expect(asFragment()).toMatchSnapshot();
      });
    }
  }

  for (const accountName of ['admin', 'docente']) {
    for (const state of STATES) {
      it(`${accountName}, ${state}, without a title or breadcrumbs`, async () => {
        const { asFragment } = await draw(accountName, state, false);
        expect(asFragment()).toMatchSnapshot();
      });
    }
  }

  for (const accountName of Object.keys(ACCOUNTS)) {
    it(`${accountName}, desktop expanded, every group opened`, async () => {
      const { asFragment } = await draw(accountName, 'desktop expanded', true);
      for (const button of screen.queryAllByTestId(/^sidebar-item-/)) {
        if (button.getAttribute('data-testid') === 'sidebar-item-mi-aprendizaje') continue; // already open
        fireEvent.click(button);
      }
      await settle();
      expect(asFragment()).toMatchSnapshot();
    });
  }

  it('admin on its own panel (an active entry without children), desktop expanded', async () => {
    mocks.router.asPath = '/dashboard';
    mocks.router.pathname = '/dashboard';
    const { asFragment } = await draw('admin', 'desktop expanded', false);
    expect(asFragment()).toMatchSnapshot();
  });

  it('admin, desktop collapsed, the floating list of «Gestión» opened by a click', async () => {
    mocks.router.asPath = '/admin/feedback';
    mocks.router.pathname = '/admin/feedback';
    const { asFragment } = await draw('admin', 'desktop collapsed', true);
    fireEvent.click(screen.getByTestId('sidebar-item-gestion'));
    await settle();
    expect(asFragment()).toMatchSnapshot();
  });
});
