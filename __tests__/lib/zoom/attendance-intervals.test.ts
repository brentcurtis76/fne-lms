// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  isClosableBy,
  mergeIntervals,
  totalPresenceSeconds,
  type AttendanceInterval,
} from '../../../lib/zoom/attendance-intervals';

/**
 * Interval arithmetic (Z7-2; plan §11).
 *
 * §11's requirement is verbatim: *"reconnect intervals don't double-count"*. This file is
 * that requirement, as a unit test over a pure function, which is the reason the module is
 * pure at all — as a SQL sum over stored rows the double-count would already have happened
 * before anything could observe it.
 *
 * Direction of failure matters as much as correctness here. Understating presence surfaces
 * as a delta a human investigates; overstating it silently justifies a full payment.
 */

function iv(joinedAt: string, leftAt: string | null = null): AttendanceInterval {
  return { joinedAt, leftAt };
}

describe('isClosableBy — the applier-side twin of the interval-order CHECK', () => {
  it('accepts a later leave and an equal one', () => {
    expect(isClosableBy(iv('2026-07-29T23:55:00Z'), '2026-07-30T00:05:00Z')).toBe(true);
    // Zoom reports whole seconds; join-and-leave inside one second really happens.
    expect(isClosableBy(iv('2026-07-29T23:55:00Z'), '2026-07-29T23:55:00Z')).toBe(true);
  });

  it('refuses a leave that precedes the join — the [R7] case', () => {
    expect(isClosableBy(iv('2026-07-30T00:05:00Z'), '2026-07-29T23:55:00Z')).toBe(false);
  });

  it('refuses unparseable instants rather than coercing them', () => {
    expect(isClosableBy(iv('not-a-date'), '2026-07-30T00:05:00Z')).toBe(false);
    expect(isClosableBy(iv('2026-07-29T23:55:00Z'), 'not-a-date')).toBe(false);
  });
});

describe('mergeIntervals — the §11 no-double-count table', () => {
  it('THE REJOIN: two disjoint intervals stay two, and presence is their sum', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'), // 10 min
      iv('2026-07-30T00:10:00Z', '2026-07-30T00:20:00Z'), // 10 min
    ];
    expect(mergeIntervals(intervals)).toEqual(intervals);
    expect(totalPresenceSeconds(intervals)).toBe(1200);
  });

  it('OVERLAPPING: a rejoin whose instants disagree does not double-count', () => {
    // The actual failure this guards: Zoom's leave and the rejoin's join overlap by a
    // minute, and a raw sum would bill 21 minutes for 20 minutes of presence.
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:06:00Z'),
      iv('2026-07-30T00:05:00Z', '2026-07-30T00:15:00Z'),
    ];
    expect(mergeIntervals(intervals)).toEqual([
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:15:00Z'),
    ]);
    expect(totalPresenceSeconds(intervals)).toBe(1200);
  });

  it('ADJACENT: touching intervals merge — a same-second rejoin was continuous presence', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'),
      iv('2026-07-30T00:05:00Z', '2026-07-30T00:15:00Z'),
    ];
    expect(mergeIntervals(intervals)).toEqual([
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:15:00Z'),
    ]);
    expect(totalPresenceSeconds(intervals)).toBe(1200);
  });

  it('CONTAINED: an interval inside another vanishes into it', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:30:00Z'),
      iv('2026-07-30T00:00:00Z', '2026-07-30T00:10:00Z'),
    ];
    expect(mergeIntervals(intervals)).toEqual([
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:30:00Z'),
    ]);
    expect(totalPresenceSeconds(intervals)).toBe(2100);
  });

  it('STILL OPEN: an open interval absorbs what follows and is never closed by the merge', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', null),
      iv('2026-07-30T00:05:00Z', '2026-07-30T00:15:00Z'),
    ];
    expect(mergeIntervals(intervals)).toEqual([iv('2026-07-29T23:55:00Z', null)]);
    // "Still here" is not a duration. Inventing an end would fabricate the very number
    // §11 is comparing against planned hours.
    expect(totalPresenceSeconds(intervals)).toBe(0);
  });

  it('a closed interval followed by an open one leaves the open one open', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'),
      iv('2026-07-30T00:04:00Z', null),
    ];
    expect(mergeIntervals(intervals)).toEqual([iv('2026-07-29T23:55:00Z', null)]);
    expect(totalPresenceSeconds(intervals)).toBe(0);
  });

  it('is order-independent — Zoom does not deliver participant events in order', () => {
    const forward = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'),
      iv('2026-07-30T00:10:00Z', '2026-07-30T00:20:00Z'),
    ];
    expect(mergeIntervals([...forward].reverse())).toEqual(mergeIntervals(forward));
  });

  it('DROPS a malformed interval rather than repairing it', () => {
    // Understating presence is the safe direction; a negative span would SUBTRACT from a
    // total that decides what a school is billed.
    const intervals = [
      iv('2026-07-30T00:10:00Z', '2026-07-29T23:55:00Z'), // negative
      iv('not-a-date', '2026-07-30T00:05:00Z'),
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'), // the only usable one
    ];
    expect(mergeIntervals(intervals)).toEqual([
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'),
    ]);
    expect(totalPresenceSeconds(intervals)).toBe(600);
  });

  it('handles the empty and single cases without special-casing them', () => {
    expect(mergeIntervals([])).toEqual([]);
    expect(totalPresenceSeconds([])).toBe(0);
    expect(mergeIntervals([iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z')])).toEqual([
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'),
    ]);
  });

  it('does not mutate its input', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:06:00Z'),
      iv('2026-07-30T00:05:00Z', '2026-07-30T00:15:00Z'),
    ];
    const snapshot = JSON.parse(JSON.stringify(intervals));
    mergeIntervals(intervals);
    expect(intervals).toEqual(snapshot);
  });

  it('collapses a three-way rejoin chain into one span', () => {
    const intervals = [
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:05:00Z'),
      iv('2026-07-30T00:05:00Z', '2026-07-30T00:12:00Z'),
      iv('2026-07-30T00:11:00Z', '2026-07-30T00:20:00Z'),
    ];
    expect(mergeIntervals(intervals)).toEqual([
      iv('2026-07-29T23:55:00Z', '2026-07-30T00:20:00Z'),
    ]);
    expect(totalPresenceSeconds(intervals)).toBe(1500);
  });
});

// `selectIntervalToClose` and its suite were removed with the fallback-closure path
// (§15.3.9): the close decision now lives inside `zoom_internal.apply_participant_leave`
// and is exercised by the participant-lifecycle matrix and by pgTAP 011.
