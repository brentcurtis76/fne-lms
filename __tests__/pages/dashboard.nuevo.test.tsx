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
  fakes, settle, resetFakes, fakeFetch, NOW, admin, consultor, docente, fullDocente, withCommunity, twoCommunities, PATHS, FULL_FETCH,
  assigned, profile, proposal, badge, NEWS, VIDEOS, STATS_FULL, UPCOMING, DOCENTE_ASSIGNMENTS, DOCENTE_ENROLMENTS,
} from '../helpers/panelFakes';
import { installMatchMedia } from '../helpers/motionFake';
import { CARD_TITLE, CARD_TITLE_OPEN, cardTitleClass } from '../../components/panel/PanelSection';

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

/*
 * Send-back «by sight», point 1: the keyboard ring is never suppressed nor clipped in the new view.
 * The look draws its ring with an outline 2 px outside the element (`styles/look-nuevo.css`, one step
 * more specific than the kit's `focus:outline-none`, pinned in `__tests__/styles/look-nuevo.test.ts`).
 * jsdom lays nothing out, so this reads classes: (a) no element that takes the focus carries an
 * outline class other than the kit's overridden one and the panel's inset ring; (b) an element inside
 * an ancestor that clips (a card or a row with an overflow class) either draws its ring inside
 * (`INSET_RING`) or has at least 4 px of padding between itself and the clipping edge, given by the
 * clipping ancestor or an element between them.
 */
describe('the keyboard ring shows on every stop of the new view', () => {
  const INSET = 'nuevo:focus-visible:[outline-offset:-4px]';
  const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  const CLIPS = /^(overflow-hidden|overflow-auto|overflow-x-auto|overflow-y-auto|overflow-clip)$/;
  // An element gives room when its padding classes (unprefixed: p-, px-, py-, pt-, pr-, pb-, pl-, on
  // Tailwind's scale or in px) leave at least 4 px on each of its four sides.
  const PADDING = /^p([xytrbl]?)-(\d+(?:\.\d+)?|\[(\d+(?:\.\d+)?)px\])$/;
  const SIDES: Record<string, Array<'t' | 'r' | 'b' | 'l'>> = { '': ['t', 'r', 'b', 'l'], x: ['l', 'r'], y: ['t', 'b'], t: ['t'], r: ['r'], b: ['b'], l: ['l'] };
  const roomy = (el: Element) => {
    const side = { t: 0, r: 0, b: 0, l: 0 };
    for (const name of classes(el)) {
      const m = PADDING.exec(name);
      if (!m) continue;
      const px = m[3] !== undefined ? Number(m[3]) : Number(m[2]) * 4;
      for (const s of SIDES[m[1]]) side[s] = px;
    }
    return side.t >= 4 && side.r >= 4 && side.b >= 4 && side.l >= 4;
  };

  const focusables = (root: Element) =>
    [...root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((el) => el.getAttribute('tabindex') !== '-1');

  function offenders(root: Element) {
    const found: string[] = [];
    for (const element of focusables(root)) {
      const name = element.getAttribute('data-testid') ?? element.getAttribute('aria-label') ?? (element.textContent ?? '').trim().slice(0, 40);
      const outline = classes(element).filter((c) => /outline/.test(c) && c !== 'focus:outline-none' && c !== INSET);
      if (outline.length) found.push(`${name}: removes or changes the ring (${outline.join(' ')})`);
      if (classes(element).includes(INSET)) continue;
      let room = false;
      for (let up = element.parentElement; up && up !== root.parentElement; up = up.parentElement) {
        if (roomy(up)) room = true;
        if (classes(up).some((c) => CLIPS.test(c))) {
          if (!room) found.push(`${name}: its ring is clipped by ${up.tagName}.${classes(up).join('.')}`);
          break;
        }
      }
    }
    return found;
  }

  async function openEverything() {
    if (screen.queryByTestId('panel-community-bar')) fireEvent.click(screen.getByTestId('panel-community-bar'));
    for (const toggle of screen.queryAllByText('Detalles')) fireEvent.click(toggle.closest('button')!);
  }

  it('the community bar draws its ring inside the card that clips it, and the news rows too', async () => {
    await draw(withCommunity({ fetch: FULL_FETCH }, { role_type: 'community_manager' }));
    const bar = screen.getByTestId('panel-community-bar');
    expect(bar.tagName).toBe('BUTTON');
    expect(classes(bar)).toContain(INSET);
    expect(classes(bar).filter((c) => /outline/.test(c))).toEqual([INSET]);
    expect(classes(bar.closest('[data-testid="panel-community"]')!)).toContain('overflow-hidden');
    for (const row of screen.getAllByTestId(/^panel-news-(?!placeholder)/)) expect(classes(row)).toContain(INSET);
  });

  it('no stop suppresses or clips the ring: community (bar, gear, tiles), courses, routes, upcoming, news, videos', async () => {
    const community = withCommunity({}, { role_type: 'community_manager' });
    await draw(fullDocente({ roles: community.roles, members: community.members, workspaces: community.workspaces }));
    await openEverything();
    const root = screen.getByTestId('panel-nuevo');
    expect(screen.getByTestId('panel-community-settings')).toBeTruthy();
    expect(focusables(root).length).toBeGreaterThan(20);
    expect(offenders(root)).toEqual([]);
  });

  it('no stop suppresses or clips the ring: the picker\'s pills', async () => {
    await draw(twoCommunities());
    await openEverything();
    expect(screen.getByText('Seleccionar comunidad:')).toBeTruthy();
    expect(offenders(screen.getByTestId('panel-nuevo'))).toEqual([]);
  });

  it('no stop suppresses or clips the ring: proposals (pencil, bin), badges and the tile «+n más»', async () => {
    await draw(admin());
    await openEverything();
    expect(screen.getByTestId('panel-badges-more')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Eliminar propuesta' }).length).toBeGreaterThan(0);
    expect(offenders(screen.getByTestId('panel-nuevo'))).toEqual([]);
  });
});

/*
 * Send-back «by sight», point 2: in the side column the news titles and the video titles run to three
 * lines before they are cut (they keep their whole text as `title`); the news excerpt stays at two.
 */
describe('news and video titles get three lines in the side column', () => {
  const clamps = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => /^line-clamp-\d+$/.test(c));

  it('each news title is cut at three lines, its excerpt at two; each video title at three', async () => {
    await draw(fullDocente());
    const news = screen.getAllByTestId(/^panel-news-(?!placeholder)/);
    expect(news.length).toBe(NEWS.articles.length);
    for (const row of news) {
      const title = row.querySelector('h3')!;
      expect(clamps(title)).toEqual(['line-clamp-3']);
      expect(title.getAttribute('title')).toBe(title.textContent);
      const excerpt = title.nextElementSibling!;
      expect(clamps(excerpt)).toEqual(['line-clamp-2']);
    }
    const videos = screen.getAllByTestId(/^panel-video-(?!placeholder)/);
    expect(videos.length).toBe(VIDEOS.videos.length);
    for (const card of videos) {
      const title = card.querySelector('h3')!;
      expect(clamps(title)).toEqual(['line-clamp-3']);
      expect(title.getAttribute('title')).toBe(title.textContent);
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

/*
 * Send-back 3, point 3: a title the new view cuts to its lines (a CSS clamp) carries its whole text as
 * `title`, the browser's own tooltip under the pointer, and the DOM holds the whole text (the screen
 * reader's name is not cut). Walked over an account whose every title is long. Invented texts only.
 */
describe('a title cut to its lines says the whole of itself on hover', () => {
  const LONG = (what: string) => `${what} Inventado con un Título Larguísimo que No Cabe en Dos Líneas de la Tarjeta del Panel`;
  const longTitles = {
    course: LONG('Curso'),
    path: LONG('Ruta'),
    upcoming: LONG('Próximo Curso'),
    proposal: LONG('Propuesta'),
    badge: LONG('Logro'),
    badgeCourse: LONG('Curso del Logro'),
    news: LONG('Artículo'),
    video: LONG('Video'),
    learner: 'Bartolomeo Ficticio de las Mercedes Inventadas y Supuestas',
    school: LONG('Colegio'),
  };
  const longAccount = () =>
    fullDocente({
      tables: {
        profiles: [{ data: profile(), error: null }],
        course_assignments: [{ data: [assigned('course-long', longTitles.course), ...DOCENTE_ASSIGNMENTS], error: null }],
        course_enrollments: [
          { data: [{ course_id: 'course-long', progress_percentage: 40, is_completed: false, enrolled_at: '2026-10-12T10:00:00Z' }, ...DOCENTE_ENROLMENTS], error: null },
        ],
      },
      fetch: {
        ...FULL_FETCH,
        '/api/learning-paths/my-paths': { body: [{ ...PATHS[0], name: longTitles.path }, ...PATHS.slice(1)] },
        '/api/upcoming-courses': { body: [{ ...UPCOMING[0], title: longTitles.upcoming }, ...UPCOMING.slice(1)] },
        '/api/news?limit=3': { body: { articles: [{ ...NEWS.articles[0], title: longTitles.news }, ...NEWS.articles.slice(1)] } },
        '/api/youtube/latest?limit=2': { body: { videos: [{ ...VIDEOS.videos[0], title: longTitles.video }, ...VIDEOS.videos.slice(1)] } },
        '/api/dashboard/stats': { body: { ...STATS_FULL, topLearner: { ...STATS_FULL.topLearner, name: longTitles.learner, school_name: longTitles.school } } },
      },
      badges: { badges: [badge(1, { badge_name: longTitles.badge, course_title: longTitles.badgeCourse }), badge(2)], total_points: 10 },
    });

  const isCut = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).some((name) => /^(line-clamp-\d+|truncate)$/.test(name));

  it('every cut heading has a `title` equal to its whole text; each long title is whole in the DOM', async () => {
    await draw(longAccount());
    const view = screen.getByTestId('panel-nuevo');
    const cutHeadings = [...view.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(isCut);
    // The course, the route, the upcoming course, the badge, the news, the video, the top learner.
    expect(cutHeadings.length).toBeGreaterThanOrEqual(7);
    for (const heading of cutHeadings) {
      expect(heading.getAttribute('title'), heading.outerHTML).toBe(heading.textContent);
    }
    const headingTexts = [...view.querySelectorAll('h3')].map((h) => h.textContent);
    for (const key of ['course', 'path', 'upcoming', 'badge', 'news', 'video', 'learner'] as const) {
      expect(headingTexts, key).toContain(longTitles[key]);
      const heading = [...view.querySelectorAll('h3')].find((h) => h.textContent === longTitles[key])!;
      expect(isCut(heading), key).toBe(true);
      expect(heading.getAttribute('title'), key).toBe(longTitles[key]);
    }
    // The single-line names cut beside a title say themselves whole too: the badge's course, the school.
    for (const text of [longTitles.badgeCourse, longTitles.school]) {
      const line = within(view).getByText(text);
      expect(isCut(line)).toBe(true);
      expect(line.getAttribute('title')).toBe(text);
    }
  });

  it('the proposals (a consultor\'s panel): the cut title and the cut creator\'s name say themselves whole', async () => {
    const creator = { first_name: 'Persona Inventada de Nombre', last_name: 'Muy Largo y Compuesto Ficticio', email: 'larga@example.invalid' };
    await draw(
      consultor({
        fetch: { '/api/course-proposals': { body: { data: [proposal(1, { titulo: longTitles.proposal, creator, created_by: 'user-consultor' }), proposal(2)] } } },
      })
    );
    const section = screen.getByTestId('panel-section-proposals');
    const cutHeadings = [...section.querySelectorAll('h3')].filter(isCut);
    expect(cutHeadings).toHaveLength(2);
    for (const heading of cutHeadings) expect(heading.getAttribute('title')).toBe(heading.textContent);
    expect(cutHeadings.map((h) => h.textContent)).toContain(longTitles.proposal);
    const name = within(section).getByText('Persona Inventada de Nombre Muy Largo y Compuesto Ficticio');
    expect(isCut(name)).toBe(true);
    expect(name.getAttribute('title')).toBe(name.textContent);
  });
});

/*
 * Blind-test send-back, point 1: at 320 px «Mi Perfil» lay over the welcome sentence. The cause: the
 * text's column started from a width of nothing (it grew into whatever room was left), so the row
 * never wrapped and the column shrank under the button's fixed width until its words ran out of it.
 * The band's structure now lets the button go to a row of its own; no layout here, so the classes and
 * the structure are what is checked (the widths themselves are the browser's to measure).
 */
describe('the welcome band never lays its button over its text', () => {
  const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

  it('one wrapping row; the text column starts from a width of its own and breaks long words; nothing positioned', async () => {
    await draw(consultor());
    const band = screen.getByTestId('panel-nuevo-welcome');
    const row = band.firstElementChild!;
    expect(classes(row)).toContain('flex');
    expect(classes(row)).toContain('flex-wrap');
    const heading = within(band).getByRole('heading', { level: 1 });
    const column = heading.parentElement!;
    expect(column.parentElement).toBe(row);
    expect(classes(column)).toEqual(expect.arrayContaining(['min-w-0', 'grow', 'basis-[10rem]', '[overflow-wrap:anywhere]']));
    expect(classes(column)).not.toContain('flex-1');
    const link = screen.getByTestId('panel-nuevo-profile');
    expect(link.parentElement).toBe(row);
    expect(link.getAttribute('href')).toBe('/profile');
    expect(link.textContent).toBe('Mi Perfil');
    // Nothing of the band is lifted out of the flow.
    for (const el of [band, ...band.querySelectorAll('*')]) {
      expect(classes(el).filter((c) => /^(absolute|fixed|sticky)$/.test(c)), el.outerHTML.slice(0, 120)).toEqual([]);
    }
    // Every part stays: the avatar, the greeting, the sentence, the consultor's line, the button.
    expect(row.children).toHaveLength(3);
    expect(within(column).getByText('Bienvenido de vuelta al hub de transformación de tu colegio')).toBeTruthy();
    expect(column.children).toHaveLength(3);
  });
});

/*
 * Blind-test send-back, point 2: ONE rule for every card title of the new view (the course, upcoming,
 * route and proposal cards), written once in `PanelSection`: closed, three lines before the cut;
 * while «Detalles» is open, the whole title. The cards of a row take the row's height, so their last
 * rows line up without a reserved line.
 */
describe('one rule for the card titles', () => {
  const clamps = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => /^(line-clamp-\d+|truncate)$/.test(c));
  const CARD_SECTIONS = ['panel-section-continue', 'panel-section-open', 'panel-section-upcoming', 'panel-section-routes', 'panel-section-proposals'];
  const cardTitles = () =>
    CARD_SECTIONS.flatMap((id) => {
      const section = screen.queryByTestId(id);
      // The generated course picture (today's `CourseThumbnail`, inside the picture's link) draws a title
      // of its own: not a card title.
      return section
        ? [...section.querySelectorAll('h3')].filter((h) => !h.closest('[data-testid$="-picture"]')).map((h) => ({ id, h }))
        : [];
    });

  it('the rule: closed, three lines; opened, no cut at all', () => {
    expect(cardTitleClass()).toBe(CARD_TITLE);
    expect(cardTitleClass(false)).toBe(CARD_TITLE);
    expect(cardTitleClass(true)).toBe(CARD_TITLE_OPEN);
    expect(clamps({ getAttribute: () => CARD_TITLE } as unknown as Element)).toEqual(['line-clamp-3']);
    expect(clamps({ getAttribute: () => CARD_TITLE_OPEN } as unknown as Element)).toEqual([]);
    // The same style, with and without the cut.
    expect(CARD_TITLE.replace('line-clamp-3', '').trim()).toBe(CARD_TITLE_OPEN);
  });

  it('every closed card title of the new view uses it (courses, routes, upcoming; then proposals)', async () => {
    const view = await draw(fullDocente());
    let titles = cardTitles();
    const sections = new Set(titles.map((t) => t.id));
    for (const id of ['panel-section-continue', 'panel-section-upcoming', 'panel-section-routes']) expect(sections, id).toContain(id);
    for (const { id, h } of titles) {
      expect(h.className, `${id}: ${h.textContent}`).toBe(CARD_TITLE);
      expect(h.getAttribute('title')).toBe(h.textContent);
    }
    view.unmount();
    await draw(consultor());
    titles = cardTitles().filter((t) => t.id === 'panel-section-proposals');
    expect(titles.length).toBeGreaterThan(0);
    for (const { h } of titles) expect(h.className).toBe(CARD_TITLE);
  });

  it('an opened course card and an opened upcoming card write their title whole; closed again, cut at three', async () => {
    await draw(fullDocente());
    const course = screen.getByTestId('panel-section-continue').querySelector('[data-testid$="-details-toggle"]')!;
    const upcoming = screen.getByTestId('panel-section-upcoming').querySelector('[data-testid$="-details-toggle"]')!;
    for (const toggle of [course, upcoming]) {
      const card = screen.getByTestId(toggle.getAttribute('data-testid')!.replace(/-details-toggle$/, ''));
      const title = [...card.querySelectorAll('h3')].find((h) => !h.closest('[data-testid$="-picture"]'))!;
      expect(clamps(title)).toEqual(['line-clamp-3']);
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(title.className).toBe(CARD_TITLE_OPEN);
      expect(clamps(title)).toEqual([]);
      expect(title.getAttribute('title')).toBe(title.textContent);
      fireEvent.click(toggle);
      expect(title.className).toBe(CARD_TITLE);
    }
  });

  it('the cards of a row fill the row\'s height, and their last row sits at their bottom', async () => {
    const view = await draw(fullDocente());
    const check = (sectionId: string) => {
      const track = screen.getByTestId(`${sectionId}-row`);
      expect(track.className.split(/\s+/)).toContain('items-stretch');
      expect(track.className.split(/\s+/)).not.toContain('items-start');
      for (const slot of [...track.children]) {
        const card = slot.firstElementChild!;
        expect(card.className.split(/\s+/), sectionId).toEqual(expect.arrayContaining(['flex', 'h-full', 'flex-col']));
        // The last row is pushed down: the course card's foot, the upcoming card's «Detalles», the proposal's foot.
        expect(card.querySelector('.mt-auto'), sectionId).not.toBeNull();
      }
    };
    check('panel-section-continue');
    check('panel-section-upcoming');
    // The routes are a grid (its cells stretch by default); each card fills its cell.
    for (const card of [...screen.getByTestId('panel-section-routes').querySelectorAll('[data-testid^="panel-route-"]')]) {
      expect(card.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'h-full', 'flex-col']));
      expect(card.querySelector('.mt-auto')).not.toBeNull();
    }
    view.unmount();
    await draw(consultor());
    check('panel-section-proposals');
  });
});
