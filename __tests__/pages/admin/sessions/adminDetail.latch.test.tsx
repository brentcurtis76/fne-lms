// @vitest-environment jsdom
/**
 * Redesign 6S, release SC (second send-back): the admin's «Detalle de Sesión» under the REAL look
 * provider, with Supabase's session and AuthContext faked in the shape and timing of the real ones
 * (`__tests__/helpers/lookAuthHarness.tsx`), and the REAL hours panel, wrapped only to count its mounts.
 * The view follows the look by SB's rule (today's look wins at once; a new look arriving within four
 * seconds of the session's first drawing is followed once; otherwise the view is kept), and the panel is
 * one instance for both views: a change of view, either way, does not mount it again, its comparison is
 * read once, and the minutes, category and reason typed into it stay. The keyboard stays with it too
 * (third send-back): a field of the panel that has the focus when the view changes keeps the focus and
 * its caret, and typing goes on in it; a focus outside the panel is left where it is. Nobody waits:
 * while the look is unknown today's view is drawn at once. Every account, session and number here is
 * invented.
 *
 * `useSupabaseClient` is faked as the installed hook behaves: it reads Supabase's session context, so a
 * change of the session (another account, a refreshed token) renders the page again, as it does live.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { ADMIN, adminDetail, detailScenario } from '../../../helpers/adminSessionsFakes';
import type { AdminScenario } from '../../../helpers/adminSessionsFakes';
import { AuthHarness, account, auth } from '../../../helpers/lookAuthHarness';

const panel = vi.hoisted(() => ({ mounts: [] as string[] }));

vi.mock('next/router', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('@supabase/auth-helpers-react', async () => {
  const a = await import('../../../helpers/adminSessionsFakes');
  const h = await import('../../../helpers/lookAuthHarness');
  // As the installed hook: it reads the session context, so a change of session renders its reader.
  const useSupabaseClient = () => {
    h.useSessionContext();
    return a.adminClient;
  };
  return { useSupabaseClient, useSessionContext: h.useSessionContext };
});
vi.mock('@/contexts/AuthContext', async () => {
  const h = await import('../../../helpers/lookAuthHarness');
  return { useAuth: h.useAuth };
});
vi.mock('@/utils/roleUtils', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { getUserPrimaryRole: (id: string) => f.roleOf(id) };
});
vi.mock('react-hot-toast', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { toast: f.toast };
});
vi.mock('@/components/layout/MainLayout', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('MainLayout', true) }));
// The real panel, at its own place, wrapped by a piece that writes down each mount's session.
vi.mock('@/components/sessions/HoursComparisonPanel', async (importOriginal) => {
  const real = (await importOriginal()) as { default: React.ComponentType<{ sessionId: string }> };
  const R = await import('react');
  function CountedHoursPanel(props: { sessionId: string }) {
    R.useEffect(() => {
      panel.mounts.push(props.sessionId);
      // Only at the mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return R.createElement(real.default, props);
  }
  return { ...real, default: CountedHoursPanel };
});

import { LookProvider } from '@/contexts/LookContext';
import AdminSessionDetailPage from '@/pages/admin/sessions/[id]';
import { LATE_LOOK_WINDOW_MS } from '@/components/sessions/detail-nuevo/useViewLatch';

const NOW = new Date('2026-11-19T12:00:00Z');
const OTHER_ACCOUNT = 'segunda-cuenta-inventada';
const comparisonOf = (id: string) => `/api/admin/sessions/${id}/hours-comparison`;

/** An invented comparison whose hours are consumed, so the adjustment form can be opened. */
const comparison = (id: string) => ({
  body: {
    data: {
      session_id: id,
      planned_minutes: 90,
      ledger: { status: 'consumida', hours: 1.5, effective_minutes: null, admin_override: false },
      zoom: { state: 'ended', actual_started_at: '2026-11-18T12:00:00.000Z', actual_ended_at: '2026-11-18T13:05:00.000Z', elapsed_minutes: 65 },
      attendance: { state: 'report', has_open_intervals: false },
      facilitator_presence: [
        { user_id: 'con-1', name: 'Consultora Inventada', is_lead: true, observed_minutes: 60, has_open_interval: false },
      ],
      overrides: [],
    },
  },
});

function scenario(): AdminScenario {
  const s = detailScenario(adminDetail({ status: 'completada', recurrence_group_id: null }));
  s.fetch![`GET ${comparisonOf('ses-1')}`] = comparison('ses-1');
  s.fetch!['GET /api/sessions/ses-2'] = {
    body: { data: { session: adminDetail({ id: 'ses-2', title: 'Segunda Sesión Inventada', status: 'completada', recurrence_group_id: null }) } },
  };
  s.fetch![`GET ${comparisonOf('ses-2')}`] = comparison('ses-2');
  return s;
}

const tree = () => (
  <AuthHarness>
    <LookProvider>
      <AdminSessionDetailPage />
    </LookProvider>
  </AuthHarness>
);
let view: ReturnType<typeof render>;
function draw(signedIn: Parameters<typeof auth.startWith>[0] = null) {
  resetFakes(scenario());
  panel.mounts = [];
  auth.startWith(signedIn);
  view = render(tree());
}
const isNuevo = () => screen.queryByTestId('admin-session-detail-nuevo') !== null;
const isClasico = () => !isNuevo() && screen.queryByTestId('hours-comparison-panel') !== null;
const asked = (address: string) => fakes.log.filter((e: any) => e && e.fetch === address).length;

/** Opens the panel's adjustment form and types minutes, a category and a reason into it. */
function typeAnAdjustment() {
  fireEvent.click(screen.getByTestId('override-open-button'));
  fireEvent.change(screen.getByTestId('override-minutes-input'), { target: { value: '30' } });
  fireEvent.change(screen.getByTestId('override-category-select'), { target: { value: 'technical_failure' } });
  const reason = screen.getByTestId('override-reason-input') as HTMLTextAreaElement;
  fireEvent.change(reason, { target: { value: 'Motivo inventado' } });
  return reason;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  view?.unmount();
  document.documentElement.removeAttribute('data-look');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const typed = () => ({
  minutes: (screen.getByTestId('override-minutes-input') as HTMLInputElement).value,
  category: (screen.getByTestId('override-category-select') as HTMLSelectElement).value,
  reason: (screen.getByTestId('override-reason-input') as HTMLTextAreaElement).value,
});
const TYPED = { minutes: '30', category: 'technical_failure', reason: 'Motivo inventado' };

/** Puts the focus in the reason, with the caret in the middle of its text (after «Motivo»). */
function caretInTheReason(reason: HTMLTextAreaElement) {
  reason.focus();
  reason.setSelectionRange(6, 6);
  expect(document.activeElement).toBe(reason);
}
/** The reason has the focus, with the caret where `caretInTheReason` put it. */
function caretStillInTheReason(reason: HTMLTextAreaElement) {
  expect(screen.getByTestId('override-reason-input')).toBe(reason);
  expect(document.activeElement).toBe(reason);
  expect([reason.selectionStart, reason.selectionEnd]).toEqual([6, 6]);
}

describe('the view follows the look, and the hours panel is one instance across it', () => {
  it('the new look known before the session: the new view, one mount, one read', async () => {
    draw(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    expect(screen.getByTestId('hours-comparison-panel')).toBeTruthy();
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Sesiones', href: '/admin/sessions' }, { label: 'Detalle de Sesión' }]);
  });

  it('(a, b) a new look arriving late, within four seconds, is followed: the panel is not mounted again and the typed adjustment stays', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    // Nobody waits: the look is still unknown, today's view is drawn.
    expect(isClasico()).toBe(true);
    const reason = typeAnAdjustment();
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(document.documentElement.getAttribute('data-look')).toBe('nuevo');
    expect(isNuevo()).toBe(true);
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([{ label: 'Sesiones', href: '/admin/sessions' }, { label: 'Detalle de Sesión' }]);
    // The same panel, inside the new view's card.
    expect(screen.getByTestId('admin-session-detail-nuevo').contains(screen.getByTestId('hours-comparison-panel'))).toBe(true);
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
    expect(screen.getByTestId('override-reason-input')).toBe(reason);
    expect(reason.isConnected).toBe(true);
    expect(typed()).toEqual(TYPED);
    await auth.sameAccountUpdates();
    await settle();
    expect(isNuevo()).toBe(true);
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
    expect(asked('/api/sessions/ses-1')).toBe(1);
  });

  it('(c) and back to today’s look (another account on the same tab): today’s view at once, the same panel, the typed adjustment still there', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    expect(isClasico()).toBe(true);
    typeAnAdjustment();
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    await auth.switchTo(OTHER_ACCOUNT);
    expect(isClasico()).toBe(true);
    await settle();
    expect(isClasico()).toBe(true);
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
    expect(typed()).toEqual(TYPED);
    // The panel is back where today's view has it: right after the session's box, as the last child of
    // the frame around it (inside the kept element, inside today's own place for it).
    const panelBox = screen.getByTestId('hours-comparison-panel').parentElement!;
    expect(panelBox.getAttribute('class')).toBeNull();
    expect(panelBox.style.display).toBe('contents');
    const place = panelBox.parentElement!;
    expect(place.getAttribute('class')).toBeNull();
    expect(place.style.display).toBe('contents');
    expect(place.children.length).toBe(1);
    expect(place.parentElement!.className).toBe('container mx-auto px-4 sm:px-6 lg:px-8 py-6');
    expect(place.parentElement!.lastElementChild).toBe(place);
    expect(place.previousElementSibling!.className).toBe('bg-white rounded-lg shadow-lg p-6');
  });

  it('a new look arriving more than four seconds late: today’s view kept, one mount, one read', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    expect(isClasico()).toBe(true);
    vi.advanceTimersByTime(LATE_LOOK_WINDOW_MS + 1);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isClasico()).toBe(true);
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
    expect(fakes.props.MainLayout.breadcrumbs).toEqual([]);
  });

  it('(e) the look never arriving (not a tester, or the profile failing): today’s view, one mount, one read', async () => {
    draw(account(ADMIN, 'not-a-tester'));
    await settle();
    expect(isClasico()).toBe(true);
    await auth.sameAccountUpdates();
    await settle();
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);

    view.unmount();
    draw();
    await auth.signIn(ADMIN);
    await settle();
    await auth.profileFails();
    await settle();
    expect(isClasico()).toBe(true);
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
  });

  it('(d) today’s look wins at once: another account on the same tab gets today’s view at once, and keeps it; the panel stays mounted', async () => {
    draw(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    await auth.switchTo(OTHER_ACCOUNT);
    expect(isClasico()).toBe(true);
    await auth.profileArrives(account(OTHER_ACCOUNT, 'nuevo'));
    await settle();
    // One way: today's view stays for this session.
    expect(isClasico()).toBe(true);
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
  });

  it('the next session: the view it takes at its own first drawing, the same panel reading the next session once', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    expect(isClasico()).toBe(true);
    vi.advanceTimersByTime(LATE_LOOK_WINDOW_MS + 1);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isClasico()).toBe(true);
    fakes.router.query = { id: 'ses-2' };
    view.rerender(tree());
    await settle();
    expect(isNuevo()).toBe(true);
    expect(screen.getByText('Segunda Sesión Inventada', { selector: 'p' })).toBeTruthy();
    // As on today's page, the panel is not mounted again for the next session: it reads it once.
    expect(panel.mounts).toEqual(['ses-1']);
    expect(asked(comparisonOf('ses-1'))).toBe(1);
    expect(asked(comparisonOf('ses-2'))).toBe(1);
  });

  it('(a, b) the focus in the reason, with its caret, stays when a late new look is followed, and typing goes on there', async () => {
    const user = userEvent.setup();
    draw();
    await auth.signIn(ADMIN);
    await settle();
    expect(isClasico()).toBe(true);
    const reason = typeAnAdjustment();
    caretInTheReason(reason);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    expect(screen.getByTestId('admin-session-detail-nuevo').contains(reason)).toBe(true);
    caretStillInTheReason(reason);
    await user.keyboard(' X');
    expect(reason.value).toBe('Motivo X inventado');
    expect(typed()).toEqual({ ...TYPED, reason: 'Motivo X inventado' });
    expect(panel.mounts).toEqual(['ses-1']);
  });

  it('(c) the focus in the reason, with its caret, stays on the way back to today’s look, and typing goes on there', async () => {
    const user = userEvent.setup();
    draw();
    await auth.signIn(ADMIN);
    await settle();
    const reason = typeAnAdjustment();
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    caretInTheReason(reason);
    // Another account on the same tab: today's look at once (the page is rendered again as well).
    await auth.switchTo(OTHER_ACCOUNT);
    await settle();
    expect(isClasico()).toBe(true);
    caretStillInTheReason(reason);
    await user.keyboard(' X');
    expect(typed()).toEqual({ ...TYPED, reason: 'Motivo X inventado' });
    expect(panel.mounts).toEqual(['ses-1']);
  });

  it('(c) also when the same account’s profile turns to today’s look: the focus and caret stay in the reason', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    const reason = typeAnAdjustment();
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    caretInTheReason(reason);
    await auth.profileArrives(account(ADMIN, 'clasico'));
    await settle();
    expect(isClasico()).toBe(true);
    caretStillInTheReason(reason);
    expect(typed()).toEqual(TYPED);
  });

  it('a focus outside the panel stays where it is, in both directions, and the panel does not take it', async () => {
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Campo inventado fuera de la página');
    document.body.appendChild(outside);
    try {
      draw();
      await auth.signIn(ADMIN);
      await settle();
      const reason = typeAnAdjustment();
      outside.focus();
      await auth.profileArrives(account(ADMIN, 'nuevo'));
      await settle();
      expect(isNuevo()).toBe(true);
      expect(document.activeElement).toBe(outside);
      await auth.switchTo(OTHER_ACCOUNT);
      await settle();
      expect(isClasico()).toBe(true);
      expect(document.activeElement).toBe(outside);
      expect(document.activeElement).not.toBe(reason);
    } finally {
      outside.remove();
    }
  });

  it('nothing focused before the change: nothing in the panel is focused after it, in both directions', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    typeAnAdjustment();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    expect(document.activeElement).toBe(document.body);
    await auth.profileArrives(account(ADMIN, 'clasico'));
    await settle();
    expect(isClasico()).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});
