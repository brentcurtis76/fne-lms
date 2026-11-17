// @vitest-environment jsdom
/**
 * Redesign 6B, step 3 (c): the new view of «Mi Panel» on its own, drawn by the page with the look
 * `nuevo` (fakes of `__tests__/helpers/panelFakes.tsx`; every person and place invented).
 *
 * The loading placeholders in the new look and today's spinner in today's; the breadcrumb in the new
 * look only; the frame and the pop-ups not mounted again when the look changes, and the page's data
 * asked once; the sections that load their own data asked once when the look is known first;
 * «Detalles»; the action and the picture going to the course; the route card a link; the one yellow
 * button; every interactive element a real button or link; and the decisions worked out only where
 * today's view works them out (the same checks 6A's pin makes for today's view).
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakes, settle, resetFakes, fakeFetch, NOW, admin, consultor, docente, fullDocente, withCommunity, PATHS, FULL_FETCH,
} from '../helpers/panelFakes';
import { installMatchMedia } from '../helpers/motionFake';

vi.hoisted(() => {
  process.env.TZ = 'UTC';
});

vi.mock('next/router', async () => {
  const f = await import('../helpers/panelFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock('framer-motion', () => import('../helpers/motionFake'));
vi.mock('@supabase/auth-helpers-react', async () => {
  const f = await import('../helpers/panelFakes');
  return { useSupabaseClient: () => f.client, useSession: () => f.S().session };
});
vi.mock('@/lib/supabase-wrapper', () => ({ supabase: { from: () => { throw new Error('unexpected supabase-wrapper read'); } } }));
vi.mock('@/utils/roleUtils', async (importOriginal) => (await import('../helpers/panelFakes')).roleUtilsFactory(await importOriginal()));
vi.mock('@/utils/workspaceUtils', async () => (await import('../helpers/panelFakes')).workspaceUtilsFactory());
vi.mock('@/lib/services/badgeService', async () => (await import('../helpers/panelFakes')).badgeServiceFactory());
vi.mock('@/hooks/useAvatar', () => ({ updateAvatarCache: () => {}, useAvatar: () => ({ url: null, loading: false }) }));
vi.mock('@/utils/toastUtils', () => ({ toastSuccess: () => {}, toastError: () => {} }));
vi.mock('@/contexts/LookContext', async () => {
  const f = await import('../helpers/panelFakes');
  return { useLook: () => ({ look: f.fakes.look, setLook: () => {} }) };
});
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../helpers/panelFakes')).marker('MainLayout', true) }));
vi.mock('@/components/common/Avatar', async () => ({ default: (await import('../helpers/panelFakes')).marker('Avatar') }));
vi.mock('@/components/community/WorkspaceSettingsModal', async () => ({
  default: (await import('../helpers/panelFakes')).marker('WorkspaceSettingsModal'),
}));
vi.mock('@/components/community/MemberProfileModal', async () => ({
  MemberProfileModal: (await import('../helpers/panelFakes')).marker('MemberProfileModal'),
}));
vi.mock('@/components/course-proposals/CourseProposalModal', async () => ({
  CourseProposalModal: (await import('../helpers/panelFakes')).marker('CourseProposalModal'),
}));
vi.mock('@/components/course-proposals/ConfirmDialog', async () => ({
  ConfirmDialog: (await import('../helpers/panelFakes')).marker('ConfirmDialog'),
}));
// The real rules, watched: where the decisions run.
vi.mock('@/lib/services/communityWorkspace', async (importOriginal) => {
  const real = await importOriginal<any>();
  return { ...real, canEditWorkspaceWithRoles: vi.fn(real.canEditWorkspaceWithRoles) };
});
vi.mock('@/constants/externalSchools', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/constants/externalSchools')>();
  return { ...real, getExternalSchoolLabel: vi.fn(real.getExternalSchoolLabel) };
});
const watch = vi.hoisted(() => ({ decide: 0, routeCards: 0 }));
vi.mock('@/hooks/usePanel', async (importOriginal) => {
  const real = await importOriginal<any>();
  return {
    ...real,
    usePanel: () => {
      const panel = real.usePanel();
      return {
        ...panel,
        decide: () => {
          watch.decide += 1;
          const decisions = panel.decide();
          return {
            ...decisions,
            learningPathCards: () => {
              watch.routeCards += 1;
              return decisions.learningPathCards();
            },
          };
        },
      };
    },
  };
});

import Dashboard from '@/pages/dashboard';
import { canEditWorkspaceWithRoles } from '@/lib/services/communityWorkspace';

const calls = (what: string) =>
  fakes.log.filter((e: any) => e && typeof e === 'object' && (e.fetch === what || e.getUserBadges === what || what in e)).length;
const pushes = () => fakes.log.filter((e: any) => e && typeof e === 'object' && 'router.push' in e).map((e: any) => e['router.push']);

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  resetFakes();
  watch.decide = 0;
  watch.routeCards = 0;
  vi.mocked(canEditWorkspaceWithRoles).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  installMatchMedia({ mobile: false });
  window.sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  consoleError?.mockRestore();
});

async function draw(scenario: ReturnType<typeof docente>, look: 'clasico' | 'nuevo' = 'nuevo') {
  fakes.scenario = scenario;
  fakes.look = look;
  const view = render(<Dashboard />);
  await settle();
  return view;
}

const primaryButtons = () =>
  [...document.querySelectorAll('button, a')].filter((el) => (el.getAttribute('class') ?? '').split(/\s+/).includes('hover:bg-brand_accent_hover'));

describe('the loading mark and the breadcrumb', () => {
  it('the new look: placeholders inside the frame, «Cargando...» for screen readers, the breadcrumb «Mi Panel»', async () => {
    await draw(docente({ getUser: 'pending' }));
    const loading = screen.getByTestId('panel-nuevo-loading');
    expect(loading.getAttribute('role')).toBe('status');
    expect(within(loading).getByText('Cargando...').className).toContain('sr-only');
    expect(loading.querySelectorAll('[data-kit="skeleton"]').length).toBeGreaterThan(4);
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(loading.closest('[data-marker="MainLayout"]')).not.toBeNull();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Mi Panel' }]);
    // Nothing of the decisions is worked out while loading.
    expect(watch.decide).toBe(0);
  });

  it("today's look: today's spinner, no placeholders, no breadcrumb", async () => {
    await draw(docente({ getUser: 'pending' }), 'clasico');
    expect(document.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByTestId('panel-nuevo-loading')).toBeNull();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
  });

  it('the breadcrumb once loaded: «Mi Panel» in the new look, none in today\'s', async () => {
    const view = await draw(docente());
    expect(screen.getByTestId('panel-nuevo')).toBeTruthy();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Mi Panel' }]);
    view.unmount();
    await draw(docente(), 'clasico');
    expect(screen.queryByTestId('panel-nuevo')).toBeNull();
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
  });
});

describe('the look changing under the page', () => {
  it('the frame and the pop-ups stay mounted (clasico → nuevo → clasico), the page asks its data once', async () => {
    const view = await draw(withCommunity({ fetch: FULL_FETCH }), 'clasico');
    expect(fakes.mounts.MainLayout).toBe(1);
    expect(fakes.mounts.MemberProfileModal).toBe(1);
    fakes.look = 'nuevo';
    view.rerender(<Dashboard />);
    await settle();
    expect(screen.getByTestId('panel-nuevo')).toBeTruthy();
    fakes.look = 'clasico';
    view.rerender(<Dashboard />);
    await settle();
    expect(screen.queryByTestId('panel-nuevo')).toBeNull();
    expect(fakes.mounts.MainLayout).toBe(1);
    expect(fakes.mounts.MemberProfileModal).toBe(1);
    for (const address of ['/api/news?limit=3', '/api/youtube/latest?limit=2', '/api/dashboard/stats', '/api/upcoming-courses', '/api/learning-paths/my-paths']) {
      expect(calls(address)).toBe(1);
    }
    expect(fakes.log.filter((e) => e === 'auth.getUser')).toHaveLength(1);
    expect(calls('getUserRoles')).toBe(1);
  });

  it('the look arriving while the panel loads: the frame mounted once, the loading mark swapped in place', async () => {
    const view = await draw(docente({ getUser: 'pending' }), 'clasico');
    fakes.look = 'nuevo';
    view.rerender(<Dashboard />);
    await settle();
    expect(screen.getByTestId('panel-nuevo-loading')).toBeTruthy();
    expect(fakes.mounts.MainLayout).toBe(1);
  });

  it('the look known before the panel has loaded: the proposals and the badges are asked once each', async () => {
    await draw(consultor({ badges: { badges: [], total_points: 0 } }));
    expect(screen.getByTestId('panel-section-proposals')).toBeTruthy();
    expect(calls('/api/course-proposals')).toBe(1);
    expect(calls('user-consultor')).toBe(1);
  });
});

describe('the course cards', () => {
  it('«Detalles» opens and closes the rest of the card, with aria-expanded', async () => {
    await draw(admin());
    const toggle = screen.getByTestId('panel-course-open-course-a1-details-toggle');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('panel-course-open-course-a1-details')).toBeNull();
    fireEvent.click(toggle);
    const details = screen.getByTestId('panel-course-open-course-a1-details');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(details.id);
    expect(within(details).getByText('6h')).toBeTruthy();
    expect(within(details).getAllByText('Intermedio').length).toBe(1);
    expect(within(details).getByText('Una descripción inventada')).toBeTruthy();
    expect(within(details).getByText('Objetivos de aprendizaje')).toBeTruthy();
    expect(within(details).getByText('+1 más...')).toBeTruthy();
    // No stray «0» for a course with zero lessons.
    expect([...details.querySelectorAll('*')].some((el) => el.childNodes.length === 1 && el.textContent === '0')).toBe(false);
    expect(details.textContent).not.toMatch(/(^|\D)0(\D|$)/);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('panel-course-open-course-a1-details')).toBeNull();
  });

  it('the action is a real button that goes to the course; the picture is a link to the same address', async () => {
    await draw(fullDocente());
    const action = screen.getByTestId('panel-course-continue-course-d2-action');
    expect(action.tagName).toBe('BUTTON');
    expect(action.textContent).toBe('Continuar');
    fakes.log = [];
    await act(async () => {
      fireEvent.click(action);
    });
    expect(pushes()).toEqual(['/student/course/course-d2']);
    expect(screen.getByTestId('panel-course-continue-course-d2-picture').getAttribute('href')).toBe('/student/course/course-d2');
    expect(screen.getByTestId('panel-course-open-course-d4-action').textContent).toBe('Comenzar');
  });

  it('the progress bar: 6 px, its values and its name, with «{x} de {n} lecciones» only where today shows it', async () => {
    await draw(fullDocente());
    const card = screen.getByTestId('panel-course-continue-course-d1');
    const bar = within(card).getByRole('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('Avance: 70%');
    expect(bar.getAttribute('aria-valuenow')).toBe('70');
    expect(bar.className).toContain('h-1.5');
    expect(card.textContent).not.toContain('lecciones');
    // Not started: no bar.
    expect(within(screen.getByTestId('panel-course-continue-course-d3')).queryByRole('progressbar')).toBeNull();
  });
});

describe('the route cards', () => {
  it('each card is ONE link to its route, at most three', async () => {
    await draw(fullDocente());
    const cards = screen.getAllByTestId(/^panel-route-/);
    expect(cards.map((card) => card.tagName)).toEqual(['A', 'A', 'A']);
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(PATHS.slice(0, 3).map((p) => `/mi-aprendizaje/ruta/${p.id}`));
    for (const card of cards) expect(card.querySelectorAll('a, button')).toHaveLength(0);
    expect(cards[2].textContent).toContain('Completado');
    expect(cards[2].textContent).not.toContain('Comenzar ruta');
    expect(cards[0].textContent).toContain('Continuar aprendiendo');
    expect(cards[1].textContent).toContain('Comenzar ruta');
  });
});

describe('the one yellow button', () => {
  it('with «Continuar Aprendiendo»: one, the first course\'s action', async () => {
    await draw(fullDocente());
    expect(primaryButtons()).toEqual([screen.getByTestId('panel-course-continue-course-d1-action')]);
  });

  it('without «Continuar Aprendiendo»: none (an admin with proposals, badges and the catalogue)', async () => {
    await draw(admin());
    expect(screen.queryByTestId('panel-section-continue')).toBeNull();
    expect(screen.getByTestId('panel-section-proposals')).toBeTruthy();
    expect(primaryButtons()).toEqual([]);
  });
});

describe('every interactive element is a real button or link', () => {
  it('no click handler sits on anything else, and only the pictures leave the tab order', async () => {
    const community = withCommunity();
    await draw(fullDocente({ roles: community.roles, members: community.members, workspaces: community.workspaces }));
    fireEvent.click(screen.getByTestId('panel-community-bar'));
    for (const toggle of screen.getAllByText('Detalles')) fireEvent.click(toggle.closest('button')!);
    const root = screen.getByTestId('panel-nuevo');
    const offenders: string[] = [];
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const key = Object.keys(element).find((k) => k.startsWith('__reactProps$'));
      const props = key ? (element as any)[key] : null;
      if (props && (props.onClick || props.onKeyDown || props.onMouseEnter) && !['BUTTON', 'A'].includes(element.tagName)) {
        offenders.push(`${element.tagName}.${element.getAttribute('class')}`);
      }
    }
    expect(offenders).toEqual([]);
    const outOfTabOrder = [...root.querySelectorAll('[tabindex="-1"]')].map((el) => el.getAttribute('data-testid'));
    expect(outOfTabOrder.every((id) => /-picture$/.test(id ?? ''))).toBe(true);
    for (const button of root.querySelectorAll('button')) {
      expect(button.getAttribute('type')).toBe('button');
      expect((button.textContent ?? '').trim() || button.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('the decisions run only where today\'s view runs them', () => {
  it('a community whose bar is closed: the gear rule is asked only once the bar is opened', async () => {
    await draw(withCommunity({}, { role_type: 'community_manager' }));
    expect(watch.decide).toBeGreaterThan(0);
    expect(canEditWorkspaceWithRoles).not.toHaveBeenCalled();
    expect(screen.queryByTitle('Configuración')).toBeNull();
    fireEvent.click(screen.getByTestId('panel-community-bar'));
    expect(canEditWorkspaceWithRoles).toHaveBeenCalled();
    expect(screen.getByTestId('panel-community-settings').getAttribute('aria-label')).toBe('Configuración');
  });

  it('the route cards are worked out only for an account with routes', async () => {
    const view = await draw(docente());
    expect(watch.decide).toBeGreaterThan(0);
    expect(watch.routeCards).toBe(0);
    view.unmount();
    await draw(fullDocente());
    expect(watch.routeCards).toBeGreaterThan(0);
  });

  it('the member pop-up and the gear open through the hook\'s handlers', async () => {
    await draw(withCommunity({}, { role_type: 'community_manager' }));
    fireEvent.click(screen.getByTestId('panel-community-bar'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-member-member-2'));
    });
    expect(fakes.props.MemberProfileModal.isOpen).toBe(true);
    expect(fakes.props.MemberProfileModal.member.id).toBe('member-2');
    await act(async () => {
      fireEvent.click(screen.getByTestId('panel-community-settings'));
    });
    expect(fakes.props.WorkspaceSettingsModal.isOpen).toBe(true);
    // The bar is still open: the gear's click does not reach the bar.
    expect(screen.getByTestId('panel-community-bar').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('«Nueva Propuesta» and «Mi Perfil»', () => {
  it('«Nueva Propuesta» keeps its name under 640 px (hidden from sight only) and opens today\'s form', async () => {
    await draw(consultor());
    const button = screen.getByTestId('panel-proposals-new');
    expect(within(button).getByText('Nueva Propuesta').className).toBe('sr-only sm:not-sr-only');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(fakes.props.CourseProposalModal.isOpen).toBe(true);
    expect(fakes.props.CourseProposalModal.editingProposal).toBeNull();
  });

  it('«Mi Perfil» is a link to /profile, with nothing hiding it at any width', async () => {
    await draw(docente());
    const link = screen.getByTestId('panel-nuevo-profile');
    expect(link.getAttribute('href')).toBe('/profile');
    expect(link.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});

describe('the headings of the new view', () => {
  it('badge names are third-level headings, like every other card title; no fourth level anywhere', async () => {
    await draw(admin());
    const section = screen.getByTestId('panel-section-badges');
    const names = [...section.querySelectorAll('[data-testid^="panel-badge-"]')].map((card) => card.querySelector('h3')?.textContent);
    expect(names).toEqual(['Insignia Inventada 1', 'Insignia Inventada 2', 'Insignia Inventada 3', 'Insignia Inventada 4']);
    expect(screen.getByTestId('panel-nuevo').querySelectorAll('h4, h5, h6')).toHaveLength(0);
  });
});
