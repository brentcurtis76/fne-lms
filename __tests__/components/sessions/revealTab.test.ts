// @vitest-environment jsdom
/**
 * Send-back B9, point 2: a tab of the session page's sideways-scrolling row is brought fully into view
 * inside the row (`components/sessions/detail-nuevo/revealTab.ts`). Only the row's own sideways scroll
 * moves, by the least amount, with a small edge to spare.
 */
import { describe, expect, it } from 'vitest';
import { REVEAL_EDGE_PX, revealTabInRow, rowOf } from '@/components/sessions/detail-nuevo/revealTab';

/** A row 288 px wide at x 16 (a 320 px phone), scrolled to `scroll`, and one tab at `left`..`right` on screen. */
function setUp(scroll: number, left: number, right: number) {
  const row = document.createElement('div');
  row.setAttribute('role', 'tablist');
  const tab = document.createElement('button');
  tab.setAttribute('role', 'tab');
  row.appendChild(tab);
  let scrollLeft = scroll;
  Object.defineProperty(row, 'scrollLeft', { get: () => scrollLeft, set: (v: number) => (scrollLeft = v) });
  row.getBoundingClientRect = () => ({ left: 16, right: 304, width: 288, top: 0, bottom: 44, height: 44, x: 16, y: 0, toJSON: () => ({}) });
  tab.getBoundingClientRect = () => ({ left, right, width: right - left, top: 0, bottom: 44, height: 44, x: left, y: 0, toJSON: () => ({}) });
  return { row, tab, scrollLeft: () => scrollLeft };
}

describe('revealTabInRow', () => {
  it('a tab cut at the right (the walk: «Actividad» ending at 376.5 px): the row scrolls right just enough', () => {
    const { row, tab, scrollLeft } = setUp(100, 250, 376.5);
    revealTabInRow(row, tab);
    expect(scrollLeft()).toBeCloseTo(100 + (376.5 - (304 - REVEAL_EDGE_PX)));
  });

  it('a tab cut at the left: the row scrolls left just enough', () => {
    const { row, tab, scrollLeft } = setUp(200, -40, 60);
    revealTabInRow(row, tab);
    expect(scrollLeft()).toBeCloseTo(200 - (16 + REVEAL_EDGE_PX - -40));
  });

  it('a tab already fully in view leaves the row where it is', () => {
    const { row, tab, scrollLeft } = setUp(50, 100, 200);
    revealTabInRow(row, tab);
    expect(scrollLeft()).toBe(50);
  });

  it('a tab wider than the row minus its edges: its start is shown, with no negative edge', () => {
    const { row, tab, scrollLeft } = setUp(0, 30, 310);
    revealTabInRow(row, tab);
    // Room left: (288 - 280) / 2 = 4 px on each side; the right end needs 310 - (304 - 4) = 10 px.
    expect(scrollLeft()).toBeCloseTo(10);
  });

  it('rowOf finds the tab’s row', () => {
    const { row, tab } = setUp(0, 20, 60);
    expect(rowOf(tab)).toBe(row);
  });
});
