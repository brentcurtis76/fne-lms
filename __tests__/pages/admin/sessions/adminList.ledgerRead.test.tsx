// @vitest-environment jsdom
/**
 * Redesign 6S, release SC (second send-back): «Sesiones de Consultoría» (`/admin/sessions`) under the
 * REAL look provider, with Supabase's session and AuthContext faked in the shape and timing of the real
 * ones (`__tests__/helpers/lookAuthHarness.tsx`). The view follows the look by SB's rule (today's look
 * wins at once; a new look arriving within four seconds of the body's first drawing is followed once;
 * otherwise the view is kept). With cancelled rows shown, the page's rows piece reads their marks when it
 * mounts; it is one instance for both views, so a change of view, either way, does not mount it again:
 * a change of the LOOK alone does not repeat the read, with the look known early, arriving late, never,
 * and on the way back to today's look. These tests measure only that: the look changes here through the
 * same account's profile, never through a change of the session (another account, a refreshed token),
 * which renders the page itself again and is today's page as it stands. While the look is unknown
 * today's view is drawn at once. Every person, school and session here is invented.
 *
 * `useSupabaseClient` is faked as the installed hook behaves: it reads Supabase's session context, so a
 * change of the session renders the page again, as it does live.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakes, fakeFetch, resetFakes, settle } from '../../../helpers/sessionsFakes';
import { ADMIN, LIST_NOW, listScenarioAdmin } from '../../../helpers/adminSessionsFakes';
import { AuthHarness, account, auth } from '../../../helpers/lookAuthHarness';

const ORIGINAL_TZ = vi.hoisted(() => {
  const before = process.env.TZ;
  process.env.TZ = 'UTC';
  return before;
});

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

import { LookProvider } from '@/contexts/LookContext';
import AdminSessionsPage from '@/pages/admin/sessions/index';
import { LATE_LOOK_WINDOW_MS } from '@/components/sessions/detail-nuevo/useViewLatch';

const tree = () => (
  <AuthHarness>
    <LookProvider>
      <AdminSessionsPage />
    </LookProvider>
  </AuthHarness>
);
let view: ReturnType<typeof render>;
function draw(signedIn: Parameters<typeof auth.startWith>[0] = null) {
  resetFakes(JSON.parse(JSON.stringify(listScenarioAdmin())));
  auth.startWith(signedIn);
  view = render(tree());
}
/** The reads of the cancelled rows' marks. */
const ledgerReads = () => fakes.log.filter((e: any) => e && e.from === 'contract_hours_ledger' && 'select' in e).length;
const isNuevo = () => screen.queryByTestId('admin-sessions-nuevo') !== null;
const isClasico = () => !isNuevo() && screen.queryByText('Total Sesiones') !== null;
const cancelledShown = () => screen.getByText('Penalizada inventada') && screen.getByText('Devuelta inventada');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  vi.setSystemTime(LIST_NOW);
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

describe('a change of the look alone does not repeat the read of the cancelled rows’ marks', () => {
  it('(e) the look never arriving (not a tester): today’s view, one read', async () => {
    draw(account(ADMIN, 'not-a-tester'));
    await settle();
    expect(isClasico()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
  });

  it('(e) the profile failing to load: today’s view, one read', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    await auth.profileFails();
    await settle();
    expect(isClasico()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
  });

  it('the new look known before the body: the new view, one read', async () => {
    draw(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
  });

  it('(a, b) the new look arriving after the body is drawn, within four seconds, is followed: one read', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    // Nobody waits: the look is still unknown, today's view is drawn with its cancelled rows.
    expect(isClasico()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(document.documentElement.getAttribute('data-look')).toBe('nuevo');
    expect(isNuevo()).toBe(true);
    // The marks read by the piece are drawn by the new view's rows, without a second read.
    cancelledShown();
    expect(screen.getByTestId('admin-sessions-nuevo').contains(screen.getByText('Penalizada inventada'))).toBe(true);
    expect(ledgerReads()).toBe(1);
  });

  it('(c) and back to today’s look (the same account’s profile now holds today’s look): today’s view at once, still one read', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    expect(isClasico()).toBe(true);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    expect(ledgerReads()).toBe(1);
    await auth.profileArrives(account(ADMIN, 'clasico'));
    expect(isClasico()).toBe(true);
    await settle();
    expect(isClasico()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
  });

  it('a new look arriving more than four seconds late: today’s view kept, one read', async () => {
    draw();
    await auth.signIn(ADMIN);
    await settle();
    expect(isClasico()).toBe(true);
    vi.advanceTimersByTime(LATE_LOOK_WINDOW_MS + 1);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    expect(isClasico()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
  });

  it('(d) today’s look wins at once: the new look known early, then today’s, then the new one again: today’s view at once, and kept; one read', async () => {
    draw(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    await auth.profileArrives(account(ADMIN, 'clasico'));
    expect(isClasico()).toBe(true);
    await auth.profileArrives(account(ADMIN, 'nuevo'));
    await settle();
    // One way: today's view stays.
    expect(isClasico()).toBe(true);
    cancelledShown();
    expect(ledgerReads()).toBe(1);
  });

  it('today’s view: the rows piece sits in today’s content box inside one kept element with no class, in a place of its own; in «Mes» the box holds only the month', async () => {
    draw(account(ADMIN, 'not-a-tester'));
    await settle();
    expect(isClasico()).toBe(true);
    const rows = document.querySelector('div.overflow-x-auto')!;
    const kept = rows.parentElement!;
    expect(kept.tagName).toBe('DIV');
    expect(kept.getAttribute('class')).toBeNull();
    expect(kept.style.display).toBe('contents');
    const place = kept.parentElement!;
    expect(place.tagName).toBe('DIV');
    expect(place.getAttribute('class')).toBeNull();
    expect(place.style.display).toBe('contents');
    expect(Array.from(place.childNodes)).toEqual([kept]);
    const box = place.parentElement!;
    expect(box.className).toBe('p-4');
    expect(box.children.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    await settle();
    expect(box.isConnected).toBe(true);
    expect(box.contains(kept)).toBe(false);
    expect(box.children.length).toBe(1);
    expect(box.firstElementChild!.getAttribute('style')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    await settle();
    expect(box.children.length).toBe(1);
    const placeAgain = box.firstElementChild as HTMLElement;
    expect(placeAgain.getAttribute('class')).toBeNull();
    expect(placeAgain.style.display).toBe('contents');
    expect(Array.from(placeAgain.childNodes)).toEqual([kept]);
    expect(kept.firstElementChild!.className).toBe('overflow-x-auto');
  });

  it('the new view: in «Lista» the rows piece sits in a place of its own inside the content box; in «Mes» the box holds only the month', async () => {
    draw(account(ADMIN, 'nuevo'));
    await settle();
    expect(isNuevo()).toBe(true);
    // From a cell of the rows up to the child of the content box.
    let place = screen.getByText('Penalizada inventada') as HTMLElement;
    while (place.parentElement!.getAttribute('class') !== 'min-w-0') place = place.parentElement!;
    expect(place.getAttribute('class')).toBeNull();
    expect(place.style.display).toBe('contents');
    expect(place.childNodes.length).toBe(1);
    const keptNode = place.firstElementChild as HTMLElement;
    expect(keptNode.getAttribute('class')).toBeNull();
    expect(keptNode.style.display).toBe('contents');
    const box = place.parentElement!;
    expect(box.children.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    await settle();
    expect(box.isConnected).toBe(true);
    expect(box.contains(keptNode)).toBe(false);
    expect(box.children.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    await settle();
    expect(box.children.length).toBe(1);
    expect(Array.from((box.firstElementChild as HTMLElement).childNodes)).toEqual([keptNode]);
  });
});
