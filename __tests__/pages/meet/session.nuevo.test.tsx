// @vitest-environment jsdom
/**
 * Redesign 6S, release SC: «Reunión» (`/meet/session/[id]`) in the new look (scenarios sc.md, part I).
 * No frame and no second tree: the look chooses the classes of the same elements. Pinned here: today's
 * markup while the look is today's (and while it is unknown, the server's and the first paint's), the
 * same words, `data-testid`s, link and address in the new look, the press targets at least 44 px by
 * class, and a look that arrives later moving no element (the same nodes; `JoinMeetingButton` is not
 * mounted again). Synthetic data only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const look = vi.hoisted(() => ({ value: 'clasico' as 'clasico' | 'nuevo', joinMounts: 0 }));

vi.mock('@supabase/auth-helpers-nextjs', () => ({ createPagesServerClient: () => ({ auth: { getSession: vi.fn() } }) }));
vi.mock('../../../lib/api-auth', () => ({ createServiceRoleClient: () => ({}), getServerSideUser: async () => null }));
vi.mock('../../../lib/utils/session-meet-access', () => ({ resolveMeetSessionAccess: vi.fn() }));
vi.mock('next/router', () => ({ useRouter: () => ({ replace: vi.fn(), asPath: '/meet/session/x' }) }));
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: look.value, setLook: () => {} }) }));
vi.mock('@/components/sessions/JoinMeetingButton', async () => {
  const R = await import('react');
  return {
    default: function JoinStandIn({ sessionId }: { sessionId: string }) {
      R.useEffect(() => {
        look.joinMounts += 1;
      }, []);
      return R.createElement('div', { 'data-testid': 'join-stand-in' }, sessionId);
    },
  };
});

import MeetSessionPage from '../../../pages/meet/session/[id]';
import type { MeetSessionView } from '../../../lib/utils/session-meet-access';

const base: MeetSessionView = {
  id: '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22',
  title: 'Sesión sintética con un título bastante largo para ver cómo se parte en un teléfono angosto',
  session_date: '2026-03-10',
  start_time: '09:00:00',
  end_time: '10:30:00',
  meeting_link: 'https://meet.example.test/abc-def',
  is_zoom_managed: false,
  join_access: 'allowed',
  join_denial_message: null,
};
const views: [string, MeetSessionView, string][] = [
  ['a pasted link', base, 'meet-join-link'],
  ['no link', { ...base, meeting_link: null }, 'meet-no-link'],
  ['refused', { ...base, meeting_link: null, join_access: 'denied', join_denial_message: 'No tienes acceso para unirte a esta reunión.' }, 'meet-join-denied'],
  ['closed', { ...base, meeting_link: null, join_access: 'closed', join_denial_message: null }, 'meet-join-closed'],
  ['switched off', { ...base, meeting_link: null, is_zoom_managed: true, join_access: 'disabled' }, 'meet-join-disabled'],
];

function drawIn(which: 'clasico' | 'nuevo', session: MeetSessionView) {
  cleanup();
  look.value = which;
  return render(<MeetSessionPage session={session} />);
}
const words = (root: HTMLElement) => root.textContent;
const testids = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
const tags = (root: HTMLElement) => Array.from(root.querySelectorAll('*')).map((el) => el.tagName);

beforeEach(() => {
  look.joinMounts = 0;
});

describe('/meet/session/[id], new look: the same page, other classes', () => {
  for (const [name, session, testid] of views) {
    it(`${name}: same words, same elements, same testids, other classes`, () => {
      const before = drawIn('clasico', session).container;
      const clasico = { words: words(before), testids: testids(before), tags: tags(before), html: before.innerHTML };
      const after = drawIn('nuevo', session).container;
      expect(words(after)).toBe(clasico.words);
      expect(testids(after)).toEqual(clasico.testids);
      expect(tags(after)).toEqual(clasico.tags);
      expect(after.innerHTML).not.toBe(clasico.html);
      expect(screen.getByTestId(testid)).toBeTruthy();
      expect(screen.getByTestId('meet-back-link').getAttribute('href')).toBe('/dashboard');
      expect(screen.getByTestId('meet-back-link').className).toContain('min-h-[44px]');
      expect(document.querySelector('main')!.className).not.toContain('bg-gray-50');
    });
  }

  it('the pasted link keeps its address and new tab, and is a 44 px press target', () => {
    drawIn('nuevo', base);
    const link = screen.getByTestId('meet-join-link');
    expect(link.getAttribute('href')).toBe('https://meet.example.test/abc-def');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.className).toContain('min-h-[44px]');
    expect(link.className).toContain('w-full');
    expect(link.textContent).toBe('Abrir enlace de reunión');
  });

  it('the title wraps; the date and the Chile time are today’s words', () => {
    drawIn('nuevo', base);
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('break-words');
    expect(screen.getByText('martes 10 de marzo de 2026')).toBeTruthy();
    expect(screen.getByText('(hora Chile)')).toBeTruthy();
  });

  it('a look that arrives later changes classes only: the same nodes, the join piece not mounted again', () => {
    const managed = { ...base, meeting_link: null, is_zoom_managed: true };
    const { rerender, container } = drawIn('clasico', managed);
    const nodes = Array.from(container.querySelectorAll('*'));
    expect(look.joinMounts).toBe(1);
    look.value = 'nuevo';
    rerender(<MeetSessionPage session={managed} />);
    expect(Array.from(container.querySelectorAll('*'))).toEqual(nodes);
    expect(look.joinMounts).toBe(1);
    look.value = 'clasico';
    rerender(<MeetSessionPage session={managed} />);
    expect(look.joinMounts).toBe(1);
  });
});
