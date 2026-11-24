// @vitest-environment jsdom
/**
 * Redesign 6S, release SB, the reviewer's second send-back: the consultor's session page under the REAL
 * look provider, with Supabase's session and AuthContext faked in the shape and timing of the real ones
 * (`__tests__/helpers/lookAuthHarness.tsx`: the tests set the account's states by hand, a fresh value
 * object on every render). The lead's decisions:
 *   1. an account whose live look is today's is never drawn the new body: not while another account
 *      replaces the previous one in the same tab, not when its profile fails to load;
 *   2. the latch belongs to the session the body draws, not to the address: a new id in the address
 *      while the previous session is still shown swaps nothing and mounts nothing again;
 *   3. updates of the account's state that change neither the account nor the look do not render
 *      today's body again.
 * Every account, school and session here is invented.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, resetFakes, settle, fakeFetch, payload, okSession, authFor, ME, DETAIL_GET } from '../../../helpers/sessionsFakes';
import type { Scenario } from '../../../helpers/sessionsFakes';
import { AuthHarness, account, auth, counts, resetCounts } from '../../../helpers/lookAuthHarness';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'America/Santiago';
  return before;
});

vi.mock('next/router', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  return { useRouter: () => f.fakes.router };
});
vi.mock('@supabase/auth-helpers-react', async () => {
  const f = await import('../../../helpers/sessionsFakes');
  const h = await import('../../../helpers/lookAuthHarness');
  return { useSupabaseClient: () => f.client, useSessionContext: h.useSessionContext };
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
vi.mock('@/components/sessions/AttendanceSuggestionsPanel', async () => ({
  default: (await import('../../../helpers/lookAuthHarness')).counted('AttendanceSuggestionsPanel'),
}));
vi.mock('@/components/sessions/AudioReportUploader', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('AudioReportUploader'),
}));
vi.mock('@/components/sessions/AudioPlayer', async () => ({ default: (await import('../../../helpers/sessionsFakes')).marker('AudioPlayer') }));
vi.mock('@/components/sessions/EditRequestModal', async () => ({
  default: (await import('../../../helpers/sessionsFakes')).marker('EditRequestModal'),
}));

import { LookProvider } from '@/contexts/LookContext';
import SessionDetailPage from '@/pages/consultor/sessions/[id]';
import { LATE_LOOK_WINDOW_MS } from '@/components/sessions/detail-nuevo/useViewLatch';

const NOW = new Date('2026-11-19T12:00:00Z');
const OTHER_ACCOUNT = 'segunda-cuenta-inventada';
const PANEL = 'AttendanceSuggestionsPanel';
const SES2_GET = 'GET /api/sessions/ses-2?include=activity_log';

function scenario(more: Scenario['fetch'] = {}): Scenario {
  return {
    query: { id: 'ses-1' },
    session: authFor(ME),
    role: 'consultor',
    fetch: { [DETAIL_GET]: okSession(payload({ status: 'en_progreso' })), ...more },
  };
}

const tree = () => (
  <AuthHarness>
    <LookProvider>
      <SessionDetailPage />
    </LookProvider>
  </AuthHarness>
);
let view: ReturnType<typeof render>;
function draw(s: Scenario, signedIn: Parameters<typeof auth.startWith>[0] = null) {
  resetFakes(s);
  resetCounts();
  auth.startWith(signedIn);
  view = render(tree());
}
const isNuevoBody = () => screen.queryByTestId('session-detail-nuevo') !== null;
const isClasicoBody = () => !isNuevoBody() && document.querySelector(`[data-counted="${PANEL}"]`) !== null;
const asked = (address: string) => fakes.log.filter((e: any) => e && e.fetch === address).length;

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
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** A tester on the new look, signed in with the profile loaded, then the session drawn in the new body. */
async function drawnInTheNewLook(s: Scenario = scenario()) {
  draw(s, account(ME, 'nuevo'));
  await settle();
  expect(isNuevoBody()).toBe(true);
}

describe('decision 1: today’s look is never drawn the new body', () => {
  it('another account signs in on the same tab: today’s body at once, while the previous profile is still held', async () => {
    await drawnInTheNewLook();
    await auth.switchTo(OTHER_ACCOUNT);
    // AuthContext still holds the previous account; the look provider answers today's look.
    expect(isNuevoBody()).toBe(false);
    expect(isClasicoBody()).toBe(true);
    expect(document.documentElement.hasAttribute('data-look')).toBe(false);
    await auth.profileArrives(account(OTHER_ACCOUNT, 'not-a-tester'));
    await settle();
    expect(isClasicoBody()).toBe(true);
    expect(asked('/api/sessions/ses-1?include=activity_log')).toBe(1);
  });

  it('the new account’s profile fails to load: today’s body, and it stays', async () => {
    await drawnInTheNewLook();
    await auth.switchTo(OTHER_ACCOUNT);
    expect(isNuevoBody()).toBe(false);
    await auth.profileFails();
    await settle();
    expect(isNuevoBody()).toBe(false);
    expect(isClasicoBody()).toBe(true);
  });

  it('one way: once today’s body was drawn, a new-look account arriving after it keeps today’s body (the accepted cost)', async () => {
    await drawnInTheNewLook();
    await auth.switchTo(OTHER_ACCOUNT);
    await auth.profileArrives(account(OTHER_ACCOUNT, 'nuevo'));
    await settle();
    expect(isClasicoBody()).toBe(true);
    // The one remount: the new body's panel, then today's body's panel; no more.
    expect(counts.mounts[PANEL]).toEqual(['ses-1', 'ses-1']);
  });
});

describe('decision 2: the latch belongs to the session the body draws, not to the address', () => {
  /**
   * A tester whose profile arrives more than four seconds after the session (send-back B7: a profile
   * within the four seconds is followed): today's body, latched; then the live look is the new one.
   */
  async function latchedToTodayWithTheNewLookLive(s: Scenario) {
    draw(s);
    await auth.signIn(ME);
    await settle();
    expect(isClasicoBody()).toBe(true);
    vi.advanceTimersByTime(NOW.getTime() + LATE_LOOK_WINDOW_MS + 1 - Date.now());
    await auth.profileArrives(account(ME, 'nuevo'));
    expect(isClasicoBody()).toBe(true);
    expect(document.documentElement.getAttribute('data-look')).toBe('nuevo');
  }

  it('a new id in the address while the previous session is still shown: no swap, no second mount, no second request', async () => {
    await latchedToTodayWithTheNewLookLive(scenario({ [SES2_GET]: 'pending' }));
    fakes.router.query = { id: 'ses-2' };
    view.rerender(tree());
    await settle();
    // The page still shows the first session (the hook keeps it until the next one arrives).
    expect(screen.getByRole('heading', { name: 'Sesión Inventada de Acompañamiento' })).toBeTruthy();
    expect(isClasicoBody()).toBe(true);
    expect(counts.mounts[PANEL]).toEqual(['ses-1']);
    expect(asked('/api/sessions/ses-1?include=activity_log')).toBe(1);
    expect(asked('/api/sessions/ses-2?include=activity_log')).toBe(1);
  });

  it('the next session’s body latches at its own first render', async () => {
    const second = okSession(payload({ id: 'ses-2', title: 'Segunda Sesión Inventada', status: 'en_progreso' }));
    await latchedToTodayWithTheNewLookLive(scenario({ [SES2_GET]: second }));
    fakes.router.query = { id: 'ses-2' };
    view.rerender(tree());
    await settle();
    expect(isNuevoBody()).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'Segunda Sesión Inventada' })).toBeTruthy();
    expect(counts.mounts[PANEL]).toEqual(['ses-1', 'ses-2']);
    expect(asked('/api/sessions/ses-2?include=activity_log')).toBe(1);
  });
});

describe('decision 3: today’s body is not rendered again by updates that change neither the account nor the look', () => {
  it('a refreshed token and a new auth value for the same account: the panel of today’s body is not rendered again', async () => {
    draw(scenario(), account(ME, 'not-a-tester'));
    await settle();
    expect(isClasicoBody()).toBe(true);
    const before = counts.renders[PANEL];
    await auth.sameAccountUpdates();
    await settle();
    expect(counts.renders[PANEL]).toBe(before);
    expect(counts.mounts[PANEL]).toEqual(['ses-1']);
  });
});
