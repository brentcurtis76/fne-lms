// @vitest-environment jsdom
/**
 * Redesign 6B, step 3 (b): THE SAME PANEL IN BOTH VIEWS. For each account and state below (6A's pin's
 * accounts, from `__tests__/helpers/panelFakes.tsx`), the page is drawn once with the look `clasico`
 * (today's view, `PanelClasico`, with today's real pieces) and once with `nuevo` (`PanelNuevo`), and
 * what a person gets is read from each and compared: the section titles; under each course row the
 * titles in order with the action's word and where it goes; the routes' texts and addresses; the
 * upcoming courses' titles and dates; proposals and badges placed or not, and their cards' texts; the
 * community bar, its members and their texts, the gear and the picker; the numbers; the news and the
 * videos (texts, address, new tab); «Mi Perfil»; the props given to `MainLayout` (apart from the
 * breadcrumb) and to the pop-ups. Any difference fails.
 *
 * Only the data around the page is faked (Supabase, fetch, the badge service, the router) and the
 * pieces that are not drawn by either view (the frame, the avatar, the pop-ups: markers that print
 * their props). `framer-motion` draws plain elements. Every person and place is invented.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakes, client, describeProps, settle, resetFakes, fakeFetch, NOW,
  admin, consultor, docente, fullDocente, withCommunity, twoCommunities, sessionFor, profile, MEMBERS,
  STATS_BARE, STATS_NULLS, FULL_FETCH, badge, type Scenario,
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

import Dashboard from '@/pages/dashboard';

// ── Reading what a person gets ──

/** The texts inside an element, in order, trimmed, without the markers' insides. */
function leaves(element: Element | null): string {
  if (!element) return '«absent»';
  const out: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node.parentElement as Element | null)?.closest('[data-marker]:not([data-marker="MainLayout"])')) continue;
    const text = (node.textContent ?? '').trim();
    if (text) out.push(text);
  }
  return out.join(' ').replace(/\s+/g, ' ');
}

const headingSection = (text: string) =>
  [...document.querySelectorAll('h2')].find((h) => h.textContent?.trim() === text)?.closest('section') ?? null;

const pushes = () => fakes.log.filter((e: any) => e && typeof e === 'object' && 'router.push' in e).map((e: any) => e['router.push']);

async function lastPushOf(click: () => void): Promise<string | undefined> {
  const before = pushes().length;
  await act(async () => {
    click();
  });
  const after = pushes();
  return after.length > before ? after[after.length - 1] : undefined;
}

async function waitOpen() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
}

type Course = { title: string; action: string; goesTo: string | undefined };

async function courseRow(look: 'clasico' | 'nuevo', title: string, testId: string): Promise<Course[] | '«absent»'> {
  if (look === 'clasico') {
    const section = headingSection(title);
    if (!section) return '«absent»';
    const scroller = section.querySelector('.overflow-x-auto')!;
    const cards = [...scroller.children].map((wrapper) => wrapper.firstElementChild as HTMLElement);
    cards.forEach((card) => fireEvent.mouseEnter(card));
    await waitOpen();
    const out: Course[] = [];
    for (const card of cards) {
      const button = card.querySelector('button')!;
      out.push({
        title: card.querySelector('h3')!.textContent!.trim(),
        action: button.textContent!.trim(),
        goesTo: await lastPushOf(() => fireEvent.click(button)),
      });
    }
    cards.forEach((card) => fireEvent.mouseLeave(card));
    return out;
  }
  const section = document.querySelector(`[data-testid="${testId}"]`);
  if (!section) return '«absent»';
  const cards = [...section.querySelectorAll(`[data-testid^="panel-course-"]:not([data-testid*="-details"]):not([data-testid$="-action"]):not([data-testid$="-picture"])`)];
  const out: Course[] = [];
  for (const card of cards) {
    const button = card.querySelector('[data-testid$="-action"]') as HTMLElement;
    const picture = card.querySelector('[data-testid$="-picture"]')!.getAttribute('href');
    const goesTo = await lastPushOf(() => fireEvent.click(button));
    // The picture's link (approved change 4) goes where the action goes.
    expect(picture).toBe(goesTo);
    out.push({ title: card.querySelector('h3')!.textContent!.trim(), action: button.textContent!.trim(), goesTo });
  }
  return out;
}

async function routes(look: 'clasico' | 'nuevo') {
  if (look === 'clasico') {
    const section = headingSection('Mis Rutas de Aprendizaje');
    if (!section) return '«absent»';
    const all = section.querySelector('a')?.getAttribute('href');
    const cards = [...section.querySelector('.grid')!.children] as HTMLElement[];
    const out = [];
    for (const card of cards) out.push({ texts: leaves(card), goesTo: await lastPushOf(() => fireEvent.click(card)) });
    return { all, cards: out };
  }
  const section = document.querySelector('[data-testid="panel-section-routes"]');
  if (!section) return '«absent»';
  const all = section.querySelector('a[href="/mi-aprendizaje"]')?.getAttribute('href');
  const cards = [...section.querySelectorAll('a[data-testid^="panel-route-"]')];
  return { all, cards: cards.map((card) => ({ texts: leaves(card), goesTo: card.getAttribute('href') ?? undefined })) };
}

function upcoming(look: 'clasico' | 'nuevo') {
  if (look === 'clasico') {
    const section = headingSection('Próximos Cursos');
    if (!section) return '«absent»';
    return {
      sub: section.querySelector('p')!.textContent,
      cards: [...section.querySelector('.overflow-x-auto')!.children].map((card) => leaves(card)),
    };
  }
  const section = document.querySelector('[data-testid="panel-section-upcoming"]');
  if (!section) return '«absent»';
  return {
    sub: section.querySelector('p')!.textContent,
    cards: [...section.querySelectorAll('[data-testid^="panel-upcoming-"]:not([data-testid*="-d"])')].map((card) =>
      leaves(card).replace(/ Detalles$/, '')
    ),
  };
}

function proposals(look: 'clasico' | 'nuevo') {
  const section = look === 'clasico' ? headingSection('Propuestas de Cursos') : document.querySelector('[data-testid="panel-section-proposals"]');
  if (!section) return '«absent»';
  const cards =
    look === 'clasico'
      ? [...(section.querySelector('.overflow-x-auto')?.children ?? [])].filter((card) => !card.classList.contains('animate-pulse'))
      : [...section.querySelectorAll('[data-testid^="panel-proposal-"]')];
  return {
    head: section.querySelector('h2')!.textContent,
    cards: cards.map((card) => ({
      texts: leaves(card),
      edit: card.querySelectorAll('[title="Editar propuesta"]').length,
      remove: card.querySelectorAll('[title="Eliminar propuesta"]').length,
    })),
    loading: section.querySelectorAll(look === 'clasico' ? '.animate-pulse' : '[data-kit="skeleton"]').length,
    empty: section.textContent!.includes('Sin propuestas aún'),
    error: section.textContent!.includes('Reintentar'),
    newButton: [...section.querySelectorAll('button')].some((b) => b.textContent?.includes('Nueva Propuesta')),
    modal: describeProps(fakes.props.CourseProposalModal ?? {}),
    confirm: describeProps(fakes.props.ConfirmDialog ?? {}),
  };
}

function badges(look: 'clasico' | 'nuevo') {
  const section = look === 'clasico' ? headingSection('Mis Logros') : document.querySelector('[data-testid="panel-section-badges"]');
  if (!section) return '«absent»';
  const cards =
    look === 'clasico'
      ? [...section.querySelectorAll('.overflow-x-auto > div')]
      : [...section.querySelectorAll('[data-testid^="panel-badge-"]')];
  const more = [...section.querySelectorAll('a')].filter((a) => a.textContent?.includes('más'));
  const all = [...section.querySelectorAll('a')].filter((a) => a.textContent?.includes('Ver todos'));
  return {
    summary: leaves(section.querySelector('h2')!.closest('div')!.parentElement!.querySelector('p')),
    cards: cards.map((card) => leaves(card)),
    more: more.map((a) => [a.getAttribute('href'), leaves(a)]),
    all: all.map((a) => a.getAttribute('href')),
    loading: section.querySelectorAll(look === 'clasico' ? '.animate-pulse' : '[data-kit="skeleton"]').length,
  };
}

async function communityOf(look: 'clasico' | 'nuevo') {
  const bar =
    look === 'clasico'
      ? [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Mi Comunidad de Crecimiento'))?.closest('button')
      : (document.querySelector('[data-testid="panel-community-bar"]') as HTMLButtonElement | null);
  if (!bar) return '«absent»';
  const closed = leaves(bar);
  const gearClosed = document.querySelectorAll('[title="Configuración"]').length;
  await act(async () => {
    fireEvent.click(bar);
  });
  await settle(1);
  const root = look === 'clasico' ? bar.closest('section')! : document.querySelector('[data-testid="panel-community"]')!;
  const tiles =
    look === 'clasico'
      ? [...root.querySelectorAll('.grid > button')]
      : [...root.querySelectorAll('[data-testid^="panel-member-"]')];
  const picker = root.textContent!.includes('Seleccionar comunidad:');
  const pills = picker
    ? [...root.querySelectorAll('button')].filter((b) => !tiles.includes(b) && b !== bar && !b.title).map((b) => b.textContent!.trim())
    : [];
  const opened = {
    closed,
    gearClosed,
    picker,
    pills,
    place: leaves(root.querySelector('h3')),
    gear: root.querySelectorAll('[title="Configuración"]').length,
    workspaceLink: [...root.querySelectorAll('a')].map((a) => [a.getAttribute('href'), leaves(a)]),
    members: tiles.map((tile) => leaves(tile)),
  };
  // A member tile: the same props reach the pop-up.
  let memberPopUp = '«no tiles»';
  if (tiles.length > 0) {
    await act(async () => {
      fireEvent.click(tiles[tiles.length - 1]);
    });
    memberPopUp = describeProps(fakes.props.MemberProfileModal);
    await act(async () => {
      fakes.props.MemberProfileModal.onClose();
    });
  }
  // The second community, where there is one.
  let second = '«one community»';
  if (picker && pills.length > 1) {
    const pill = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === pills[1])!;
    await act(async () => {
      fireEvent.click(pill);
    });
    await settle(1);
    const now = look === 'clasico' ? root : document.querySelector('[data-testid="panel-community"]')!;
    second = leaves(now.querySelector('button'));
  }
  return { ...opened, memberPopUp, second };
}

function stats(look: 'clasico' | 'nuevo') {
  if (look === 'clasico') {
    const h2 = document.querySelector('section > h2.mb-6');
    const cards = [...h2!.parentElement!.querySelector('.grid')!.children];
    return { heading: h2!.textContent, cards: cards.map((card) => leaves(card)) };
  }
  const section = document.querySelector('[data-testid="panel-section-stats"]')!;
  return {
    heading: section.querySelector('h2')!.textContent,
    cards: ['users', 'course', 'learner'].map((id) => leaves(section.querySelector(`[data-testid="panel-stats-${id}"]`))),
  };
}

function links(look: 'clasico' | 'nuevo', title: string, testId: string) {
  const section = look === 'clasico' ? headingSection(title) : document.querySelector(`[data-testid="${testId}"]`);
  if (!section) return '«absent»';
  return [...section.querySelectorAll('a')].map((a) => ({
    href: a.getAttribute('href'),
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
    texts: leaves(a),
  }));
}

function emptyLines(look: 'clasico' | 'nuevo', title: string, testId: string) {
  const section = look === 'clasico' ? headingSection(title) : document.querySelector(`[data-testid="${testId}"]`);
  const text = section?.textContent ?? '';
  return ['No hay noticias disponibles', 'No hay videos disponibles'].filter((line) => text.includes(line));
}

function frameProps() {
  const { breadcrumbs: _ignored, ...rest } = fakes.props.MainLayout ?? {};
  void _ignored;
  return describeProps(rest);
}

async function whatAPersonGets(scenario: () => Scenario, look: 'clasico' | 'nuevo') {
  resetFakes();
  fakes.scenario = scenario();
  fakes.look = look;
  const view = render(<Dashboard />);
  await settle();
  const profileLink = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Mi Perfil'));
  const got = {
    sections: [...document.querySelectorAll('h2')].map((h) => h.textContent!.trim()).sort(),
    h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent),
    // The greeting, the line under it and the consultor's line, as they read
    welcomeBand: [...document.querySelectorAll('h1')].map((h) => leaves(h.parentElement)),
    profile: profileLink?.getAttribute('href') ?? '«absent»',
    frame: frameProps(),
    workspacePopUp: describeProps(fakes.props.WorkspaceSettingsModal ?? {}),
    memberPopUpAtRest: describeProps(fakes.props.MemberProfileModal ?? {}),
    continue: await courseRow(look, 'Continuar Aprendiendo', 'panel-section-continue'),
    open: await courseRow(look, 'Mis Cursos Abiertos', 'panel-section-open'),
    routes: await routes(look),
    upcoming: upcoming(look),
    proposals: proposals(look),
    badges: badges(look),
    stats: stats(look),
    news: links(look, 'Últimas Noticias', 'panel-section-news'),
    newsEmpty: emptyLines(look, 'Últimas Noticias', 'panel-section-news'),
    videos: links(look, 'Videos Recientes', 'panel-section-videos'),
    videosEmpty: emptyLines(look, 'Videos Recientes', 'panel-section-videos'),
    community: await communityOf(look),
  };
  view.unmount();
  return got;
}

// ── The accounts and states (6A's pin's, plus the sections that load their own data) ──

const ACCOUNTS: Array<[string, () => Scenario]> = [
  ['admin: the whole catalogue, proposals (own and others\'), six badges', () => admin()],
  ['consultor with an affiliation, proposals by a user_roles row', () => consultor()],
  [
    'consultor by the metadata alone, proposals empty',
    () =>
      consultor({
        session: sessionFor('user-consultor', { roles: ['consultor'] }),
        roles: [],
        fetch: { '/api/course-proposals': { body: { data: [] } } },
      }),
  ],
  ['consultor whose proposals fail', () => consultor({ fetch: { '/api/course-proposals': { status: 403, body: { error: 'Solo administradores y consultores pueden ver propuestas' } } } })],
  ['consultor whose proposals still load', () => consultor({ fetch: { '/api/course-proposals': 'pending' } })],
  ['docente with everything', () => fullDocente()],
  ['docente, bare numbers', () => fullDocente({ fetch: { ...FULL_FETCH, '/api/dashboard/stats': { body: STATS_BARE } } })],
  ['docente, the numbers still loading', () => fullDocente({ fetch: { ...FULL_FETCH, '/api/dashboard/stats': 'pending' } })],
  ['docente, news and videos still loading', () => fullDocente({ fetch: { ...FULL_FETCH, '/api/news?limit=3': 'pending', '/api/youtube/latest?limit=2': 'pending' } })],
  ['docente, badges still loading', () => fullDocente({ badges: 'pending' })],
  ['nothing anywhere, numbers with null values', () => docente({ fetch: { '/api/dashboard/stats': { body: STATS_NULLS } } })],
  [
    'every fetch rejected',
    () =>
      docente({
        fetch: Object.fromEntries(
          ['/api/news?limit=3', '/api/youtube/latest?limit=2', '/api/dashboard/stats', '/api/upcoming-courses', '/api/learning-paths/my-paths'].map((u) => [u, 'reject' as const])
        ),
      }),
  ],
  ['one community, no right to edit', () => withCommunity()],
  ['one community, the right to edit (the gear), a workspace with a picture', () =>
    withCommunity(
      { workspaces: { 'com-n': { id: 'ws-n', community_id: 'com-n', name: 'Espacio Norte', custom_name: 'Nuestro Espacio', image_url: 'https://img.example.invalid/ws.png' } } },
      { role_type: 'community_manager' }
    )],
  ['one community with zero members', () => withCommunity({ members: { 'com-n': [] } })],
  ['one community with exactly four members', () => withCommunity({ members: { 'com-n': MEMBERS.slice(0, 4) } })],
  ['two communities: the picker and the second one', () => twoCommunities()],
  [
    'a first name only («¡Hola, Usuario!»), many badges',
    () =>
      docente({
        tables: { profiles: [{ data: profile({ last_name: null }), error: null }], course_assignments: [{ data: [], error: null }] },
        badges: { badges: [1, 2, 3, 4, 5].map((n) => badge(n, { points_value: 5 })), total_points: 25 },
      }),
  ],
];

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
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

describe('the same panel in both views (6B)', () => {
  for (const [name, scenario] of ACCOUNTS) {
    it(name, async () => {
      const today = await whatAPersonGets(scenario, 'clasico');
      const nuevo = await whatAPersonGets(scenario, 'nuevo');
      expect(nuevo).toEqual(today);
    });
  }

  it('the comparison reads something: an account with everything has every part', async () => {
    const today = await whatAPersonGets(() => admin(), 'clasico');
    expect(today.sections.length).toBeGreaterThanOrEqual(8);
    expect(Array.isArray(today.open) && today.open.length).toBe(3);
    expect(today.routes).not.toBe('«absent»');
    expect(today.news).toHaveLength(4); // «Ver todas» and three articles
    expect(today.videos).toHaveLength(3); // «Ver canal» and two videos
    expect(today.badges).not.toBe('«absent»');
    // The texts are read (the frame's marker wraps the page and must not hide them).
    expect(today.news[0]).toEqual({ href: '/noticias', target: null, rel: null, texts: 'Ver todas' });
    const docenteToday = await whatAPersonGets(() => fullDocente(), 'clasico');
    expect(Array.isArray(docenteToday.continue) && docenteToday.continue.map((c) => c.goesTo)).toEqual([
      '/student/course/course-d1',
      '/student/course/course-d2',
      '/student/course/course-d3',
    ]);
    const community = await whatAPersonGets(() => twoCommunities(), 'clasico');
    expect(community.community).not.toBe('«absent»');
    expect((community.community as any).pills).toHaveLength(2);
    expect((community.community as any).members).toEqual(['D Diego Imaginario', 'C Carla Ficticia Líder de Comunidad', 'U Solo Nombre Inventado'].map((t) => expect.stringContaining(t.split(' ').slice(1).join(' '))));
    expect((community.community as any).closed).toContain('Colegio Inventado del Norte • 3 miembros');
    expect(String((docenteToday.routes as any).cards[0].texts)).toMatch(/^Nivel 2 Ruta Inventada con Avance .*Progreso 25 % 1 de 4 cursos .* Continuar aprendiendo$/);
    expect((docenteToday.upcoming as any).cards[0]).toBe('Próximamente Próximo Curso Inventado Uno Relatora Ficticia marzo de 2027');
    expect(docenteToday.stats.cards[0]).toBe('Educadores Activos 987 en tu alcance');
    expect(client.from).toHaveBeenCalled();
  });
});
