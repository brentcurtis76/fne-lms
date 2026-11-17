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
  STATS_BARE, STATS_NULLS, FULL_FETCH, badge, lessonDocente, type Scenario,
} from '../helpers/panelFakes';
import { installMatchMedia } from '../helpers/motionFake';
import { NetflixCourseCard } from '@/components/courses/NetflixCourseCard';
import { CourseCardNuevo } from '@/components/panel/CourseCardNuevo';
import type { CourseWithEnrollment, NetflixCourseCardProps } from '@/types/courses';

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

/** Waits out today's cards' 300 ms opening delay (nothing to wait for when no card was hovered). */
async function waitOpen(hovered = 1) {
  if (hovered === 0) return;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
}

type Course = { title: string; action: string; goesTo: string | undefined };

/** The new view's course cards of a section (not their parts, whose test ids extend the card's). */
const newCourseCards = (section: Element) =>
  [...section.querySelectorAll('[data-testid^="panel-course-"]')].filter(
    (el) => !/-(picture|action|details|details-toggle|difficulty|lessons)$/.test(el.getAttribute('data-testid') ?? '')
  );

async function courseRow(look: 'clasico' | 'nuevo', title: string, testId: string): Promise<Course[] | '«absent»'> {
  if (look === 'clasico') {
    const section = headingSection(title);
    if (!section) return '«absent»';
    const scroller = section.querySelector('.overflow-x-auto')!;
    const cards = [...scroller.children].map((wrapper) => wrapper.firstElementChild as HTMLElement);
    cards.forEach((card) => fireEvent.mouseEnter(card));
    await waitOpen(cards.length);
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
  const cards = newCourseCards(section);
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

// ── An opened card, read as texts (6B, send-back 2) ──

/**
 * The texts of an element in reading order, consecutive text nodes of one element read as ONE text
 * (`{x} de {n} lecciones` is four text nodes in today's markup and one in the new view's), each
 * trimmed, the empty ones left out, the markers' insides skipped. `skip` leaves out a node.
 */
function texts(element: Element | null, skip: (node: Text) => boolean = () => false): string[] {
  if (!element) return [];
  const out: string[] = [];
  let last: Text | null = null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.parentElement?.closest('[data-marker]:not([data-marker="MainLayout"])') || skip(node)) {
      last = null;
      continue;
    }
    if (last && last.nextSibling === node) out[out.length - 1] += node.textContent ?? '';
    else out.push(node.textContent ?? '');
    last = node;
  }
  return out.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Inside `container`: the text node is in it. */
const inside = (container: Element | null) => (node: Text) => Boolean(container?.contains(node));

/**
 * THE ONE NAMED EXCEPTION of the opened course card: today's card prints a stray «0» for a course
 * with zero lessons (`showsLessons` answers the number 0, which React prints). It is a text node «0»
 * standing alone, the direct child of a `div` (the pills' row, and the card's body where the lesson
 * line would be); every number today's card means to print sits in a `span` or a `p`. Exactly such a
 * node is stripped from today's card, and nothing else.
 */
const isStrayZero = (node: Text) =>
  node.textContent === '0' &&
  node.parentElement?.tagName === 'DIV' &&
  node.previousSibling?.nodeType !== Node.TEXT_NODE &&
  node.nextSibling?.nodeType !== Node.TEXT_NODE;

type OpenedCourse = {
  title: string;
  /** The course's picture: its images (`src`, `alt`) and the texts drawn on it (the generated thumbnail's, the state's). */
  picture: { images: Array<[string | null, string | null]>; texts: string[] };
  /** The thin bar's width, or null without a bar. */
  bar: string | null;
  /** Every other text of the opened card, sorted (the order inside a card is the new design's). */
  texts: string[];
};

const imagesOf = (element: Element | null) =>
  [...(element?.querySelectorAll('img') ?? [])].map((img): [string | null, string | null] => [img.getAttribute('src'), img.getAttribute('alt')]);

/**
 * Each course card of a row, OPENED: today's under the pointer (its 300 ms delay, waited for), the
 * new one after «Detalles». What the new card adds by design is left out of its side and named:
 * the word «Detalles»; the difficulty pill on its picture (the approved mock-up has it there and again
 * among the opened pills); and the percentage it prints beside its bar when today's card shows no
 * lesson line (the mock-up has the figure with the bar; the bar itself is compared by its width).
 */
async function openedCourses(look: 'clasico' | 'nuevo', title: string, testId: string): Promise<OpenedCourse[] | '«absent»'> {
  if (look === 'clasico') {
    const section = headingSection(title);
    if (!section) return '«absent»';
    const cards = [...section.querySelector('.overflow-x-auto')!.children].map((wrapper) => wrapper.firstElementChild as HTMLElement);
    cards.forEach((card) => fireEvent.mouseEnter(card));
    await waitOpen(cards.length);
    const out = cards.map(readTodayCourse);
    cards.forEach((card) => fireEvent.mouseLeave(card));
    return out;
  }
  const section = document.querySelector(`[data-testid="${testId}"]`);
  if (!section) return '«absent»';
  const cards = newCourseCards(section);
  for (const card of cards) await openNewCard(card);
  return cards.map(readNewCourse);
}

/** Opens a new card's «Detalles» (when it is closed). */
async function openNewCard(card: Element) {
  const toggle = card.querySelector('[data-testid$="-details-toggle"]') as HTMLElement | null;
  if (!toggle || toggle.getAttribute('aria-expanded') === 'true') return;
  await act(async () => {
    fireEvent.click(toggle);
  });
}

/** Today's course card (the root of `NetflixCourseCard`), read once opened. */
function readTodayCourse(card: Element): OpenedCourse {
  const picture = card.firstElementChild!.firstElementChild!;
  const bar = picture.querySelector<HTMLElement>('[style*="width"]');
  return {
    title: card.querySelector('h3')!.textContent!.trim(),
    picture: { images: imagesOf(picture), texts: texts(picture).sort() },
    bar: bar ? bar.style.width : null,
    texts: texts(card, (node) => inside(picture)(node) || isStrayZero(node)).sort(),
  };
}

/** The new course card (the root of `CourseCardNuevo`), read once «Detalles» is open. */
function readNewCourse(card: Element): OpenedCourse {
  const picture = card.querySelector('[data-testid$="-picture"]')!;
  const pill = picture.querySelector('[data-testid$="-difficulty"]');
  const progressbar = card.querySelector('[role="progressbar"]');
  const bar = progressbar?.querySelector<HTMLElement>('[style*="width"]') ?? null;
  const barBlock = progressbar?.parentElement ?? null;
  const barHasLessonLine = texts(barBlock).some((text) => text.includes('lecciones'));
  const toggle = card.querySelector('[data-testid$="-details-toggle"]');
  return {
    title: card.querySelector('h3')!.textContent!.trim(),
    picture: { images: imagesOf(picture), texts: texts(picture, inside(pill)).sort() },
    bar: bar ? bar.style.width : null,
    texts: texts(
      card,
      (node) =>
        inside(picture)(node) ||
        inside(toggle)(node) ||
        (!barHasLessonLine && inside(barBlock)(node) && /^\d+%?$|^%$/.test(node.textContent ?? ''))
    ).sort(),
  };
}

// ── Opened upcoming cards, the pictures, the links and buttons (6B, send-back 2, point 4) ──

/**
 * Each upcoming card OPENED: today's under the pointer, the new one after «Detalles». Left out of the
 * new side, by design: «Detalles», and the month (or «Fecha por confirmar») the new card keeps on its
 * face beside «Disponible en …» (as the approved mock-up shows).
 */
async function openedUpcoming(look: 'clasico' | 'nuevo') {
  if (look === 'clasico') {
    const section = headingSection('Próximos Cursos');
    if (!section) return '«absent»';
    const cards = [...section.querySelector('.overflow-x-auto')!.children].map((wrapper) => wrapper.firstElementChild as HTMLElement);
    cards.forEach((card) => fireEvent.mouseEnter(card));
    await waitOpen(cards.length);
    const out = cards.map((card) => ({ images: imagesOf(card), texts: texts(card).sort() }));
    cards.forEach((card) => fireEvent.mouseLeave(card));
    return out;
  }
  const section = document.querySelector('[data-testid="panel-section-upcoming"]');
  if (!section) return '«absent»';
  const cards = [...section.querySelectorAll('[data-testid^="panel-upcoming-"]')].filter(
    (el) => !/-(details|details-toggle|date)$/.test(el.getAttribute('data-testid') ?? '')
  );
  for (const card of cards) await openNewCard(card);
  return cards.map((card) => {
    const toggle = card.querySelector('[data-testid$="-details-toggle"]');
    const date = card.querySelector('[data-testid$="-date"]');
    return { images: imagesOf(card), texts: texts(card, (node) => inside(toggle)(node) || inside(date)(node)).sort() };
  });
}

/** Every picture of the page at rest (nothing opened), as «src | alt», sorted. */
const pictures = () =>
  [...document.querySelectorAll('img')]
    .filter((img) => !img.closest('[data-marker]:not([data-marker="MainLayout"])'))
    .map((img) => `${img.getAttribute('src')} | ${img.getAttribute('alt')}`)
    .sort();

/** What the signed-in person's avatar is drawn from (its frame is each design's own). */
function avatarProps() {
  const { className: _className, ...rest } = fakes.props.Avatar ?? {};
  void _className;
  return describeProps(rest);
}

/** An element's accessible name, as a person hears it: its label, else its texts, else its title. */
const nameOf = (el: Element) => el.getAttribute('aria-label') || texts(el).join(' ') || el.getAttribute('title') || '';

/**
 * THE LINKS AND BUTTONS of a view, with everything opened (today's cards under the pointer, the new
 * ones after «Detalles», the community bar as `communityOf` left it): each `a` and `button` by kind,
 * accessible name, address and new tab, sorted. Left out, and only these (the brief's list): the new
 * view's «Detalles» buttons, the course pictures' links (approved change 4) and the route cards'
 * links (approved change 6; today's route card is a clickable box, compared by `routes`), and the
 * row arrows «Desplazar izquierda» / «Desplazar derecha» on both sides (today's course rows have
 * them too; the new view shows them only when a row holds more than fits, which jsdom never
 * measures). «Mi Perfil» is the brief's last exception: it is present in both markups here (today's
 * hides it from sight under 640 px by a class), so it is compared, not left out.
 */
async function controls(look: 'clasico' | 'nuevo') {
  if (look === 'clasico') {
    const cards = [...document.querySelectorAll('.overflow-x-auto > div > :first-child')];
    cards.forEach((card) => fireEvent.mouseEnter(card));
    await waitOpen(cards.length);
  } else {
    for (const toggle of [...document.querySelectorAll('[data-testid$="-details-toggle"]')]) {
      await openNewCard(toggle.closest('[data-testid^="panel-course-"], [data-testid^="panel-upcoming-"]')!);
    }
  }
  const isException = (el: Element) => {
    const id = el.getAttribute('data-testid') ?? '';
    const name = el.getAttribute('aria-label') ?? '';
    if (name === 'Desplazar izquierda' || name === 'Desplazar derecha') return true;
    if (look === 'clasico') return false;
    return /-details-toggle$/.test(id) || /^panel-course-.*-picture$/.test(id) || (el.tagName === 'A' && /^panel-route-/.test(id));
  };
  return [...document.querySelectorAll('a, button')]
    .filter((el) => !el.closest('[data-marker]:not([data-marker="MainLayout"])') && !isException(el))
    .map((el) => [el.tagName.toLowerCase(), nameOf(el), el.getAttribute('href') ?? '', el.getAttribute('target') ?? ''].join(' | '))
    .sort();
}

/** The loading placeholders of the news and of the videos. */
function placeholders(look: 'clasico' | 'nuevo', title: string, testId: string, newTestId: string) {
  const section = look === 'clasico' ? headingSection(title) : document.querySelector(`[data-testid="${testId}"]`);
  if (!section) return '«absent»';
  return look === 'clasico'
    ? section.querySelectorAll('.animate-pulse').length
    : section.querySelectorAll(`[data-testid="${newTestId}"]`).length;
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
    // The pictures of the opened block: the workspace's, the bar's small avatars, the members' photos.
    images: imagesOf(root),
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
    second = `${leaves(now.querySelector('button'))} ${JSON.stringify(imagesOf(now.querySelector('button')))}`;
  }
  return { ...opened, memberPopUp, second };
}

/** A card holds a loading placeholder (today's pulsing shape, or the kit's Skeleton). */
const isLoading = (card: Element | null) => Boolean(card?.querySelector('.animate-pulse, [data-kit="skeleton"]'));

function stats(look: 'clasico' | 'nuevo') {
  if (look === 'clasico') {
    const h2 = document.querySelector('section > h2.mb-6');
    const cards = [...h2!.parentElement!.querySelector('.grid')!.children];
    return { heading: h2!.textContent, cards: cards.map((card) => leaves(card)), loading: cards.map(isLoading), images: imagesOf(h2!.parentElement) };
  }
  const section = document.querySelector('[data-testid="panel-section-stats"]')!;
  const cards = ['users', 'course', 'learner'].map((id) => section.querySelector(`[data-testid="panel-stats-${id}"]`));
  return {
    heading: section.querySelector('h2')!.textContent,
    cards: cards.map((card) => leaves(card)),
    loading: cards.map(isLoading),
    images: imagesOf(section),
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
    // Every picture at rest, and what the avatar is drawn from (before anything is opened)
    pictures: pictures(),
    avatar: avatarProps(),
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
    continueOpened: await openedCourses(look, 'Continuar Aprendiendo', 'panel-section-continue'),
    openOpened: await openedCourses(look, 'Mis Cursos Abiertos', 'panel-section-open'),
    routes: await routes(look),
    upcoming: upcoming(look),
    upcomingOpened: await openedUpcoming(look),
    proposals: proposals(look),
    badges: badges(look),
    stats: stats(look),
    news: links(look, 'Últimas Noticias', 'panel-section-news'),
    newsEmpty: emptyLines(look, 'Últimas Noticias', 'panel-section-news'),
    videos: links(look, 'Videos Recientes', 'panel-section-videos'),
    videosEmpty: emptyLines(look, 'Videos Recientes', 'panel-section-videos'),
    newsLoading: placeholders(look, 'Últimas Noticias', 'panel-section-news', 'panel-news-placeholder'),
    videosLoading: placeholders(look, 'Videos Recientes', 'panel-section-videos', 'panel-video-placeholder'),
    community: await communityOf(look),
    // Last, with everything opened: every link and button by name, address and new tab
    controls: await controls(look),
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
  ['docente whose courses exercise the opened card (lessons 0 and 10, progress 0 and 70, objectives)', () => lessonDocente({ fetch: FULL_FETCH })],
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
    }, 30_000);
  }

  it('the opened course cards: the lesson line and its percentage under today\'s condition (send-back 2)', async () => {
    const read = async (look: 'clasico' | 'nuevo') => {
      resetFakes();
      fakes.scenario = lessonDocente();
      fakes.look = look;
      const view = render(<Dashboard />);
      await settle();
      const got = {
        continue: await openedCourses(look, 'Continuar Aprendiendo', 'panel-section-continue'),
        open: await openedCourses(look, 'Mis Cursos Abiertos', 'panel-section-open'),
      };
      view.unmount();
      return got;
    };
    const today = await read('clasico');
    const nuevo = await read('nuevo');
    expect(nuevo).toEqual(today);
    // The comparison sees the two cases: lessons without progress, progress without lessons.
    const byTitle = (rows: typeof today) =>
      Object.fromEntries([...(rows.continue as OpenedCourse[]), ...(rows.open as OpenedCourse[])].map((c) => [c.title, c]));
    const cards = byTitle(today);
    expect(cards['Curso con Lecciones sin Avance'].texts).toEqual(expect.arrayContaining(['0 de 10 lecciones', '0%', '10 lecciones']));
    expect(cards['Curso con Lecciones sin Avance'].bar).toBeNull();
    expect(cards['Curso sin Lecciones con Avance'].bar).toBe('70%');
    expect(cards['Curso sin Lecciones con Avance'].texts.some((t) => t.includes('lecciones'))).toBe(false);
    expect(cards['Curso Abierto con Lecciones'].texts).toEqual(expect.arrayContaining(['0 de 4 lecciones', '0%']));
  });

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

    // Send-back 2: the opened cards, the pictures, the loading states and the controls are read.
    expect((docenteToday.continueOpened as OpenedCourse[]).map((c) => c.texts.length).every((n) => n > 3)).toBe(true);
    expect((docenteToday.upcomingOpened as Array<{ texts: string[] }>)[0].texts).toEqual(
      expect.arrayContaining(['Disponible en marzo de 2027', 'Pronto', 'Relatora Ficticia'])
    );
    expect((docenteToday.upcomingOpened as Array<{ texts: string[] }>)[1].texts).toContain('Fecha por confirmar');
    expect(docenteToday.pictures).toEqual(
      expect.arrayContaining([
        'https://img.example.invalid/news-1.png | Noticia Inventada de Hoy',
        'https://img.example.invalid/video-1.jpg | Video Inventado de Hace Semanas',
        'https://img.example.invalid/up-2.png | Próximo Curso Inventado Dos',
        'https://img.example.invalid/learner-1.png | ',
      ])
    );
    expect(JSON.parse(docenteToday.avatar)).toMatchObject({ size: 'lg' });
    expect(docenteToday.controls).toEqual(
      expect.arrayContaining([
        'a | Mi Perfil | /profile | ',
        'a | Ver canal | https://www.youtube.com/@NuevaEducacionFundacion | _blank',
        'a | Ver todas | /noticias | ',
        'a | Ver todas | /mi-aprendizaje | ',
        'a | Ver todos | /mi-aprendizaje/logros | ',
        'button | Continuar |  | ',
        'button | Comenzar |  | ',
      ])
    );
    expect(docenteToday.controls.some((c) => c.startsWith('a | ') && c.includes('/noticias/noticia-inventada-de-hoy | _blank'))).toBe(true);
    const loading = await whatAPersonGets(() => fullDocente({ fetch: { ...FULL_FETCH, '/api/news?limit=3': 'pending', '/api/youtube/latest?limit=2': 'pending', '/api/dashboard/stats': 'pending' } }), 'clasico');
    expect([loading.newsLoading, loading.videosLoading]).toEqual([3, 2]);
    expect(loading.stats.loading).toEqual([true, true, true]);
    expect((community.community as any).images).toEqual(expect.arrayContaining([['https://img.example.invalid/m1.png', '']]));
  }, 60_000);
});

// ── The handlers, USED in both views (6B, send-back 2, point 4) ──

/** Draws the page in one look, runs `use`, and answers what it read. */
async function usedIn<T>(scenario: () => Scenario, look: 'clasico' | 'nuevo', use: (look: 'clasico' | 'nuevo') => Promise<T>): Promise<T> {
  resetFakes();
  fakes.scenario = scenario();
  fakes.look = look;
  const view = render(<Dashboard />);
  await settle();
  const got = await use(look);
  view.unmount();
  return got;
}

/** The requests made while `run` runs (address and, when given, its method and body). */
async function requestsDuring(run: () => Promise<void> | void) {
  const before = fakes.log.length;
  await act(async () => {
    await run();
  });
  await settle(2);
  return fakes.log.slice(before).filter((e: any) => e && typeof e === 'object' && 'fetch' in e);
}

const buttonNamed = (name: string) => [...document.querySelectorAll('button')].find((b) => nameOf(b) === name) as HTMLButtonElement | undefined;

const communityBar = (look: 'clasico' | 'nuevo') =>
  (look === 'clasico'
    ? [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Mi Comunidad de Crecimiento'))?.closest('button')
    : document.querySelector('[data-testid="panel-community-bar"]')) as HTMLButtonElement | null;

describe('the handlers, used in both views (6B, send-back 2)', () => {
  // Already used by the comparison above, in both views: a course's action (the push it makes), a
  // route card (today's click's push against the new link's address), a member's tile (the profile
  // pop-up's props) and a community pill (the community then drawn).

  it('«Reintentar» after a failed load of the proposals asks again, the same request', async () => {
    const scenario = () =>
      consultor({ fetch: { '/api/course-proposals': { status: 403, body: { error: 'Solo administradores y consultores pueden ver propuestas' } } } });
    const use = async () => {
      const retry = buttonNamed('Reintentar');
      if (!retry) return '«no Reintentar»';
      return requestsDuring(() => fireEvent.click(retry));
    };
    const today = await usedIn(scenario, 'clasico', use);
    expect(await usedIn(scenario, 'nuevo', use)).toEqual(today);
    expect(today).toEqual([{ fetch: '/api/course-proposals' }]);
  });

  it('the pencil opens the form in edit mode with that proposal', async () => {
    const use = async () => {
      const pencil = document.querySelector('[title="Editar propuesta"]') as HTMLElement | null;
      if (!pencil) return '«no pencil»';
      await act(async () => {
        fireEvent.click(pencil);
      });
      return describeProps(fakes.props.CourseProposalModal);
    };
    const today = await usedIn(() => admin(), 'clasico', use);
    expect(await usedIn(() => admin(), 'nuevo', use)).toEqual(today);
    expect(JSON.parse(today).isOpen).toBe(true);
    expect(JSON.parse(today).editingProposal.id).toBe('prop-1');
  });

  it('the bin, then «Eliminar»: the same confirmation, the same request, the card gone', async () => {
    const use = async () => {
      const bin = document.querySelector('[title="Eliminar propuesta"]') as HTMLElement | null;
      if (!bin) return '«no bin»';
      await act(async () => {
        fireEvent.click(bin);
      });
      const asked = describeProps(fakes.props.ConfirmDialog);
      const requests = await requestsDuring(() => fakes.props.ConfirmDialog.onConfirm());
      return {
        asked,
        requests,
        after: describeProps(fakes.props.ConfirmDialog),
        bins: document.querySelectorAll('[title="Eliminar propuesta"]').length,
      };
    };
    const today = await usedIn(() => admin(), 'clasico', use);
    expect(await usedIn(() => admin(), 'nuevo', use)).toEqual(today);
    expect((today as any).requests).toEqual([{ fetch: '/api/course-proposals/prop-1', init: expect.stringContaining('"method":"DELETE"') }]);
    expect((today as any).bins).toBe(0);
  });

  it('«Nueva Propuesta» and «Crear Propuesta» open the form in create mode', async () => {
    const open = (name: string) => async () => {
      const button = buttonNamed(name);
      if (!button) return `«no ${name}»`;
      await act(async () => {
        fireEvent.click(button);
      });
      return describeProps(fakes.props.CourseProposalModal);
    };
    const newToday = await usedIn(() => admin(), 'clasico', open('Nueva Propuesta'));
    expect(await usedIn(() => admin(), 'nuevo', open('Nueva Propuesta'))).toEqual(newToday);
    expect(JSON.parse(newToday)).toMatchObject({ isOpen: true, editingProposal: null });
    const empty = () =>
      consultor({ session: sessionFor('user-consultor', { roles: ['consultor'] }), roles: [], fetch: { '/api/course-proposals': { body: { data: [] } } } });
    const createToday = await usedIn(empty, 'clasico', open('Crear Propuesta'));
    expect(await usedIn(empty, 'nuevo', open('Crear Propuesta'))).toEqual(createToday);
    expect(JSON.parse(createToday)).toMatchObject({ isOpen: true, editingProposal: null });
  });

  it('the gear gives the settings pop-up the same props', async () => {
    const scenario = () =>
      withCommunity(
        { workspaces: { 'com-n': { id: 'ws-n', community_id: 'com-n', name: 'Espacio Norte', custom_name: 'Nuestro Espacio', image_url: 'https://img.example.invalid/ws.png' } } },
        { role_type: 'community_manager' }
      );
    const use = async (look: 'clasico' | 'nuevo') => {
      const bar = communityBar(look);
      if (!bar) return '«no bar»';
      await act(async () => {
        fireEvent.click(bar);
      });
      const gear = document.querySelector('[title="Configuración"]') as HTMLElement | null;
      if (!gear) return '«no gear»';
      const before = describeProps(fakes.props.WorkspaceSettingsModal);
      await act(async () => {
        fireEvent.click(gear);
      });
      return { before, after: describeProps(fakes.props.WorkspaceSettingsModal) };
    };
    const today = await usedIn(scenario, 'clasico', use);
    expect(await usedIn(scenario, 'nuevo', use)).toEqual(today);
    expect(JSON.parse((today as any).after).isOpen).toBe(true);
  });
});

// ── One course card, today's and the new, fed the same inputs (6B, send-back 2, points 3 and 4) ──

type CardCase = { name: string; course: NetflixCourseCardProps['course']; enrollment: NetflixCourseCardProps['enrollment'] };

const CARD_CASES: CardCase[] = [
  {
    name: 'not enrolled, without a relator, five objectives, a duration over an hour',
    course: {
      id: 'card-1', title: 'Curso Inventado Uno', description: 'Una descripción', thumbnail_url: 'https://img.example.invalid/card-1.png',
      estimated_duration_hours: 1.5, difficulty_level: 'intermediate', learning_objectives: ['A', 'B', 'C', 'D', 'E'], instructor: null,
    },
    enrollment: null,
  },
  {
    name: 'approved, with its assignments, a relator with a photo, lessons all done',
    course: {
      id: 'card-2', title: 'Curso Inventado Dos', description: null, thumbnail_url: null,
      estimated_duration_hours: 0.5, difficulty_level: 'advanced', learning_objectives: ['Solo uno'],
      instructor: { full_name: 'Relatora Ficticia', photo_url: 'https://img.example.invalid/relatora.png' },
    },
    enrollment: { progress_percentage: 100, is_completed: true, lessons_completed: 10, total_lessons: 10, completion_status: 'aprobado', assignments_submitted: 3, assignments_total: 3 },
  },
  {
    name: 'completed with assignments pending, no lessons, 70% progress (today\'s stray «0»)',
    course: {
      id: 'card-3', title: 'Curso Inventado Tres', description: 'Tres', thumbnail_url: null,
      estimated_duration_hours: null, difficulty_level: null, learning_objectives: null,
      instructor: { full_name: 'Relator Imaginario', photo_url: null },
    },
    enrollment: { progress_percentage: 70, is_completed: false, lessons_completed: 0, total_lessons: 0, completion_status: 'completado', assignments_total: 2 },
  },
  {
    name: 'lessons and no progress',
    course: {
      id: 'card-4', title: 'Curso Inventado Cuatro', description: 'Cuatro', thumbnail_url: 'https://img.example.invalid/card-4.png',
      estimated_duration_hours: 2, difficulty_level: 'beginner', learning_objectives: [], instructor: { full_name: 'Relatora Ficticia', photo_url: null },
    },
    enrollment: { progress_percentage: 0, is_completed: false, lessons_completed: 0, total_lessons: 10, completion_status: 'in_progress' },
  },
  {
    name: 'lessons and progress, an unknown difficulty',
    course: {
      id: 'card-5', title: 'Curso Inventado Cinco', description: 'Cinco', thumbnail_url: null,
      estimated_duration_hours: 3, difficulty_level: 'experto', learning_objectives: ['Uno', 'Dos', 'Tres', 'Cuatro'], instructor: null,
    },
    enrollment: { progress_percentage: 70, is_completed: false, lessons_completed: 7, total_lessons: 10 },
  },
];

describe('one course card, today\'s and the new, fed the same course (6B, send-back 2)', () => {
  for (const { name, course, enrollment } of CARD_CASES) {
    it(name, async () => {
      const chosenToday = vi.fn();
      const today = render(<NetflixCourseCard course={course} enrollment={enrollment} onSelect={chosenToday} />);
      const todayCard = today.container.firstElementChild!;
      fireEvent.mouseEnter(todayCard);
      await waitOpen();
      const todayRead = readTodayCourse(todayCard);
      await act(async () => {
        fireEvent.click(todayCard.querySelector('button')!);
      });
      today.unmount();

      const chosenNew = vi.fn();
      const nuevo = render(
        <CourseCardNuevo
          course={{ ...course, instructor: course.instructor ? { id: 'relator', ...course.instructor } : null, enrollment } as unknown as CourseWithEnrollment}
          href={`/student/course/${course.id}`}
          onOpen={chosenNew}
          testId="panel-course-case"
        />
      );
      const newCard = nuevo.getByTestId('panel-course-case');
      await openNewCard(newCard);
      const newRead = readNewCourse(newCard);
      await act(async () => {
        fireEvent.click(nuevo.getByTestId('panel-course-case-action'));
      });
      nuevo.unmount();

      expect(newRead).toEqual(todayRead);
      expect(chosenNew.mock.calls).toEqual(chosenToday.mock.calls);
      expect(chosenToday.mock.calls).toEqual([[course.id]]);
    });
  }
});
