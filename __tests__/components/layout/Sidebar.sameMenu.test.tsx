// @vitest-environment jsdom
/**
 * Redesign 5b: THE SAME MENU IN BOTH FRAMES.
 *
 * For every combination below of an account and the menu's gates, the actual Sidebar is drawn with
 * the look `clasico` and with the look `nuevo`, every group is opened in each, and the two are
 * compared: the same top-level entries (by test id) in the same order, and under each the same
 * children (label and address) in the same order. Any difference fails.
 *
 * The superadmin feature flag is ON in this file (in the existing Sidebar tests it is off, which
 * makes the superadmin gate unreachable): with it on, «Roles y Permisos» depends on the superadmin
 * check, so that gate is compared too. The accounts are invented.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Permissions = 'loading' | 'granted' | 'refused';

interface Combo {
  roles: string[];
  isAdmin: boolean;
  community: boolean;
  qa: boolean;
  assessments: boolean;
  pasantia: boolean;
  superadmin: boolean;
  permissions: Permissions;
}

const mocks = vi.hoisted(() => ({
  combo: null as any,
  look: 'clasico' as 'clasico' | 'nuevo',
  router: { asPath: '/dashboard', push: vi.fn(), prefetch: vi.fn(), events: { on: vi.fn(), off: vi.fn() } },
}));

type Result = { data?: unknown; error: unknown; count?: number | null };

function builder(table: string): any {
  const c = mocks.combo as Combo;
  const list = (): Result => {
    switch (table) {
      case 'user_roles':
        return { data: c.community ? [{ community_id: 'synthetic-community' }] : [], error: null };
      case 'assessment_instance_assignees':
        return { count: c.assessments ? 1 : 0, error: null };
      case 'platform_feedback':
        return { count: 2, error: null };
      default:
        return { data: [], error: null };
    }
  };
  const single = (): Result => {
    switch (table) {
      case 'profiles':
        return { data: { can_run_qa_tests: c.qa }, error: null };
      case 'superadmins':
        return c.superadmin ? { data: { is_active: true }, error: null } : { data: null, error: { code: 'PGRST116' } };
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
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabase, useUser: () => null }));
vi.mock('@/contexts/PermissionContext', () => ({
  usePermissions: () => {
    const mode = (mocks.combo as Combo).permissions;
    const yes = mode === 'granted';
    return { hasPermission: () => yes, hasAnyPermission: () => yes, hasAllPermissions: () => yes, loading: mode === 'loading' };
  },
}));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: mocks.look, setLook: () => {} }) }));
vi.mock('@/components/notifications/ModernNotificationCenter', () => ({ default: () => null }));
vi.mock('@/utils/navigationManager', () => ({ navigationManager: { prefetchRoute: vi.fn() } }));
vi.mock('@/lib/featureFlags', () => ({ isFeatureEnabled: () => true }));

import Sidebar, { NAVIGATION_ITEMS } from '@/components/layout/Sidebar';

const OTHER_ROLES = [
  'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
  'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion',
];

const ACCOUNTS: Array<{ name: string; roles: string[]; isAdmin: boolean }> = [
  { name: 'admin', roles: ['admin'], isAdmin: true },
  ...OTHER_ROLES.map((role) => ({ name: role, roles: [role], isAdmin: false })),
  { name: 'docente + equipo_directivo', roles: ['docente', 'equipo_directivo'], isAdmin: false },
  { name: 'consultor + encargado_licitacion', roles: ['consultor', 'encargado_licitacion'], isAdmin: false },
];

const BOOL = [false, true];
const PERMISSIONS: Permissions[] = ['loading', 'granted', 'refused'];

function combosFor(account: { roles: string[]; isAdmin: boolean }): Combo[] {
  const out: Combo[] = [];
  // The superadmin check runs only for an admin; for anyone else its answer is never asked.
  const superadminStates = account.isAdmin ? BOOL : [false];
  for (const community of BOOL)
    for (const qa of BOOL)
      for (const assessments of BOOL)
        for (const pasantia of BOOL)
          for (const superadmin of superadminStates)
            for (const permissions of PERMISSIONS)
              out.push({ roles: account.roles, isAdmin: account.isAdmin, community, qa, assessments, pasantia, superadmin, permissions });
  return out;
}

/** The first piece of text inside an element, in document order: the child's label in both frames. */
function firstText(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text) return text;
  }
  return '';
}

type Menu = Array<{ id: string; children: Array<[string, string]> }>;

let userCounter = 0;

async function menuIn(look: 'clasico' | 'nuevo', combo: Combo): Promise<Menu> {
  mocks.look = look;
  mocks.combo = combo;
  window.sessionStorage.clear();
  userCounter += 1;
  const view = render(
    <Sidebar
      user={{ id: `synthetic-adult-${userCounter}` } as any}
      currentPage="dashboard"
      isDesktop
      isDesktopCollapsed={false}
      isMobileOpen={false}
      isAdmin={combo.isAdmin}
      userRole={combo.roles[0]}
      userRoles={combo.roles}
      onDesktopToggle={() => {}}
      onMobileClose={() => {}}
      onLogout={() => {}}
    />
  );
  for (let i = 0; i < 4; i += 1) await act(async () => {});
  const buttons = Array.from(view.container.querySelectorAll('[data-testid^="sidebar-item-"]'));
  for (const button of buttons) fireEvent.click(button);
  const menu: Menu = Array.from(view.container.querySelectorAll('[data-testid^="sidebar-item-"]')).map((button) => ({
    id: button.getAttribute('data-testid')!,
    children: Array.from(button.parentElement!.querySelectorAll('a')).map(
      (a) => [firstText(a), a.getAttribute('href') ?? ''] as [string, string]
    ),
  }));
  view.unmount();
  return menu;
}

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hasPasantia: !!(mocks.combo as Combo).pasantia }) })
    )
  );
});
afterAll(() => vi.unstubAllGlobals());

let compared = 0;

describe('the same menu in both frames', () => {
  for (const account of ACCOUNTS) {
    it(`${account.name}: every gate combination draws the same entries and children`, async () => {
      for (const combo of combosFor(account)) {
        const clasico = await menuIn('clasico', combo);
        const nuevo = await menuIn('nuevo', combo);
        expect(clasico.length, `${account.name} ${JSON.stringify(combo)}: an empty menu proves nothing`).toBeGreaterThan(0);
        expect(nuevo, `${account.name} ${JSON.stringify(combo)}`).toEqual(clasico);
        compared += 1;
      }
    }, 120_000);
  }

  it('compared every combination (11 accounts; 96 for the admin, 48 for each other account)', () => {
    expect(compared).toBe(96 + 48 * 10);
  });

  it('the comparison reads real children: an admin with everything granted sees every group\'s children', async () => {
    const admin = await menuIn('nuevo', {
      roles: ['admin'], isAdmin: true, community: true, qa: true, assessments: true, pasantia: true, superadmin: true, permissions: 'granted',
    });
    const children = admin.reduce((sum, entry) => sum + entry.children.length, 0);
    const all = NAVIGATION_ITEMS.reduce((sum, item) => sum + (item.children?.length ?? 0), 0);
    // Every entry but «Usuarios del Colegio», which is only for equipo_directivo.
    expect(admin.map((e) => e.id)).toEqual(
      NAVIGATION_ITEMS.filter((i) => i.id !== 'school-users').map((i) => `sidebar-item-${i.id}`)
    );
    // Nearly every child shows, and the labels read are the real ones.
    expect(children).toBeGreaterThan(all - 5);
    const gestion = admin.find((e) => e.id === 'sidebar-item-gestion')!;
    expect(gestion.children[0]).toEqual(['Clientes', '/admin/clients']);
  });
});
