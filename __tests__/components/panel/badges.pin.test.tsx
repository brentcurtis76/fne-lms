// @vitest-environment jsdom
/**
 * Redesign 6B, step 0: today's «Mis Logros» section (`BadgesSection`, with the real `BadgeCard` and
 * `GeneraBadgeIcon`) pinned BEFORE its state and data call move into `useBadges(userId)` and the
 * words of a badge into a module both looks import. Each case keeps one digest of the markup and of
 * the calls made to `BadgeService.getUserBadges` (`badges.pin.digests.json`; see
 * `__tests__/helpers/pin.ts`). Every badge and course is invented; the clock and the time zone are fixed.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';

vi.hoisted(() => {
  process.env.TZ = 'UTC';
});

const fake = vi.hoisted(() => ({
  log: [] as unknown[],
  answer: null as null | 'pending' | 'reject' | { badges: unknown[]; total_points: number },
  answers: {} as Record<string, { badges: unknown[]; total_points: number }>,
}));

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/services/badgeService', () => ({
  BadgeService: {
    getUserBadges: vi.fn((...args: unknown[]) => {
      fake.log.push({ getUserBadges: args });
      const userId = args[0] as string;
      const answer = fake.answers[userId] ?? fake.answer;
      if (answer === 'pending') return new Promise(() => {});
      if (answer === 'reject') return Promise.reject(new Error('Synthetic badge failure'));
      return Promise.resolve(answer ?? { badges: [], total_points: 0 });
    }),
  },
}));

import { BadgesSection } from '@/components/badges/BadgesSection';

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'badges.pin.digests.json'),
  'PANEL_BADGES'
);

const NOW = new Date('2026-11-16T12:00:00Z');

const badge = (n: number, over: Record<string, unknown> = {}) => ({
  id: `user-badge-${n}`,
  user_id: 'user-x',
  badge_id: `badge-${n}`,
  course_id: `course-${n}`,
  earned_at: new Date(NOW.getTime() - n * 9 * 24 * 60 * 60 * 1000).toISOString(),
  metadata: {},
  badge_name: `Insignia Inventada ${n}`,
  badge_description: null,
  badge_type: 'course_completion',
  icon_name: 'genera',
  color_primary: '',
  color_secondary: '',
  points_value: 0,
  course_title: `Curso Inventado ${n}`,
  ...over,
});

let view: ReturnType<typeof render>;
const markup = () => serialise(view.asFragment());
const theLog = () => serialise(fake.log);

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fake.log = [];
  fake.answer = null;
  fake.answers = {};
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) fake.log.push({ 'console.error': first });
  });
});
afterEach(() => {
  vi.useRealTimers();
  consoleError?.mockRestore();
});

async function draw(props: { userId: string; maxDisplay?: number; showViewAll?: boolean }) {
  view = render(<BadgesSection {...props} />);
  await settle();
  return [markup(), theLog()];
}

describe("today's «Mis Logros» (BadgesSection)", () => {
  pinned('B1. loading: the header, three placeholders', () => {
    fake.answer = 'pending';
    return draw({ userId: 'user-x', maxDisplay: 4 });
  });

  pinned('B2. no badges: nothing drawn', () => draw({ userId: 'user-x', maxDisplay: 4 }));

  pinned('B3. one badge without points (the singular line), course from metadata', () => {
    fake.answer = { badges: [badge(1, { metadata: { course_name: 'Curso del Metadato' } })], total_points: 0 };
    return draw({ userId: 'user-x', maxDisplay: 4 });
  });

  pinned('B4. several with points and colours, one without a course, one with a date that is not a date', () => {
    fake.answer = {
      badges: [
        badge(1, { points_value: 10, color_primary: '#f59e0b', color_secondary: '#1f1f1f' }),
        badge(2, { points_value: 20, course_title: undefined }),
        badge(3, { earned_at: 'no es una fecha' }),
      ],
      total_points: 30,
    };
    return draw({ userId: 'user-x', maxDisplay: 4 });
  });

  pinned('B5. more than maxDisplay: four shown and the «+2 más» tile', () => {
    fake.answer = { badges: [1, 2, 3, 4, 5, 6].map((n) => badge(n, { points_value: 5 })), total_points: 30 };
    return draw({ userId: 'user-x', maxDisplay: 4, showViewAll: true });
  });

  pinned('B6. more than maxDisplay with showViewAll off: no «Ver todos», no tile', () => {
    fake.answer = { badges: [1, 2, 3, 4, 5, 6].map((n) => badge(n)), total_points: 0 };
    return draw({ userId: 'user-x', maxDisplay: 4, showViewAll: false });
  });

  pinned('B7. the defaults (maxDisplay 6, showViewAll on) with seven badges', () => {
    fake.answer = { badges: [1, 2, 3, 4, 5, 6, 7].map((n) => badge(n)), total_points: 0 };
    return draw({ userId: 'user-x' });
  });

  pinned('B8. the service failing: nothing drawn, the error written to the console', () => {
    fake.answer = 'reject';
    return draw({ userId: 'user-x', maxDisplay: 4 });
  });

  pinned('B9. no user id: no call, the loading state stays', () => draw({ userId: '', maxDisplay: 4 }));

  pinned('B10. the user id changes: asked again, the new list drawn', async () => {
    fake.answers = {
      'user-x': { badges: [badge(1)], total_points: 0 },
      'user-y': { badges: [badge(2, { points_value: 15 }), badge(3)], total_points: 15 },
    };
    const first = await draw({ userId: 'user-x', maxDisplay: 4 });
    view.rerender(<BadgesSection userId="user-y" maxDisplay={4} />);
    await settle();
    view.rerender(<BadgesSection userId="user-y" maxDisplay={4} />);
    await settle();
    return [...first, markup(), theLog()];
  });
});

it('the call is made once per user id, and never without one', async () => {
  await draw({ userId: 'user-x', maxDisplay: 4 });
  expect(fake.log.filter((e: any) => e.getUserBadges)).toEqual([{ getUserBadges: ['user-x'] }]);
  view.unmount();
  fake.log = [];
  await draw({ userId: '', maxDisplay: 4 });
  expect(fake.log).toEqual([]);
});

digestsFileHolds(10);
