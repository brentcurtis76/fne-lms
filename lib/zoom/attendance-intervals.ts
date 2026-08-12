/**
 * Attendance interval arithmetic — a PURE module (plan §11; Z7-2 [R7]/[R8]).
 *
 * §11 requires, verbatim, that *"reconnect intervals don't double-count"*. That is a
 * property of interval arithmetic, not of the database, so it lives here as plain
 * functions over plain data and is asserted by unit test. The alternative — deriving
 * presence with a SQL sum over stored rows — would make the requirement an integration
 * guess, and the double-count would already have happened by the time anything could
 * observe it.
 *
 * The table stores ONE ROW PER INTERVAL rather than a per-person total, precisely so
 * that merging is a decision made at read time by this module, where it can be tested,
 * rather than at write time by a webhook that has seen only half the story.
 *
 * ## Why a rejoin must not double-count
 *
 * §11 nominates *lead-facilitator presence* as the comparison metric an admin sees
 * beside meeting elapsed, and §11's frozen decision is that Zoom data never changes
 * billing automatically — but it IS the number a human looks at before deciding to
 * override. A consultant who drops and rejoins produces two overlapping intervals if
 * Zoom's instants disagree by a second; summing them raw inflates presence, which is
 * the direction that makes a shortfall invisible.
 *
 * Instants are UTC ISO-8601 strings throughout (§10). Nothing here constructs a session
 * instant, so `lib/utils/session-timezone.ts` is not involved.
 */

/** One observed presence interval. `leftAt` null = still open (no `participant_left`). */
export interface AttendanceInterval {
  joinedAt: string;
  leftAt: string | null;
}

/** An interval already stored, carrying the row identity the applier needs to close it. */
export interface StoredInterval extends AttendanceInterval {
  id: string;
}

function toMs(iso: string): number {
  return Date.parse(iso);
}

/**
 * True when `leftAt` is a usable close for `joinedAt` — same rule as the table's
 * `zoom_attendance_interval_order` CHECK.
 *
 * Equality is allowed: Zoom reports whole seconds, and a participant who joins and
 * leaves inside the same second is a zero-length interval that really happened. It is
 * the NEGATIVE case that is malformed, and [R7] requires the applier to leave such an
 * interval open rather than offer the database a row it will refuse — a constraint
 * violation raised out of the webhook route becomes a 500, and Zoom retries a malformed
 * body forever against an endpoint that can never accept it.
 */
export function isClosableBy(interval: AttendanceInterval, leftAt: string): boolean {
  const joined = toMs(interval.joinedAt);
  const left = toMs(leftAt);
  if (!Number.isFinite(joined) || !Number.isFinite(left)) return false;
  return left >= joined;
}

/**
 * Merges overlapping and adjacent intervals into the minimum set covering the same time.
 *
 * Rules, each of which has a case in the suite:
 *  - **Overlapping** intervals become one spanning interval.
 *  - **Adjacent** intervals (`leftAt === joinedAt`) merge too. A participant whose drop
 *    and rejoin land on the same second was present continuously; two touching rows are
 *    an artefact of how Zoom reports, not two absences.
 *  - **Contained** intervals vanish into their container.
 *  - An **open** interval (`leftAt === null`) absorbs everything that starts at or
 *    before it and is itself never closed by the merge — "still here" is not a duration,
 *    and inventing an end for it would fabricate the very number §11 is comparing.
 *  - Malformed intervals (unparseable `joinedAt`, or a negative span) are DROPPED rather
 *    than repaired. The direction of failure is understating presence, which shows up as
 *    a delta a human investigates; overstating it would silently justify a full payment.
 */
export function mergeIntervals(intervals: AttendanceInterval[]): AttendanceInterval[] {
  const usable = intervals.filter((interval) => {
    if (!Number.isFinite(toMs(interval.joinedAt))) return false;
    return interval.leftAt === null || isClosableBy(interval, interval.leftAt);
  });

  const sorted = [...usable].sort((a, b) => toMs(a.joinedAt) - toMs(b.joinedAt));

  const merged: AttendanceInterval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous === undefined) {
      merged.push({ ...interval });
      continue;
    }
    // An open predecessor swallows everything that follows: there is no end to compare
    // against, so nothing can start after it.
    if (previous.leftAt === null) continue;

    const previousEnd = toMs(previous.leftAt);
    const currentStart = toMs(interval.joinedAt);
    if (currentStart > previousEnd) {
      merged.push({ ...interval });
      continue;
    }
    // Touching or overlapping. Extend — or open — the predecessor.
    if (interval.leftAt === null) {
      previous.leftAt = null;
    } else if (toMs(interval.leftAt) > previousEnd) {
      previous.leftAt = interval.leftAt;
    }
  }
  return merged;
}

/**
 * Total observed presence in whole seconds, over the MERGED set — never over the raw
 * rows, which is the double-count §11 names.
 *
 * Open intervals contribute nothing. That is not an oversight: an interval with no
 * `participant_left` has no observed duration, and the honest answer for a meeting still
 * in progress is "less than you will eventually see", not a guess anchored on `now()`.
 * Z7-5 renders the open case as a state rather than a number.
 */
export function totalPresenceSeconds(intervals: AttendanceInterval[]): number {
  return mergeIntervals(intervals).reduce((total, interval) => {
    if (interval.leftAt === null) return total;
    return total + Math.round((toMs(interval.leftAt) - toMs(interval.joinedAt)) / 1000);
  }, 0);
}

/**
 * Picks the open interval a `participant_left` should close: the latest-joined open one
 * that the leave instant can legally close.
 *
 * Latest-joined because a rejoin means the earlier interval was already closed in
 * reality even if Zoom never said so, and closing the older one would attribute the
 * gap to presence. `isClosableBy` is what keeps [R7]'s out-of-order case from producing
 * a row the CHECK would refuse: when no open interval can absorb the instant, this
 * returns null and the applier records ledger-only.
 */
export function selectIntervalToClose(
  open: StoredInterval[],
  leftAt: string
): StoredInterval | null {
  const closable = open
    .filter((interval) => interval.leftAt === null && isClosableBy(interval, leftAt))
    .sort((a, b) => toMs(b.joinedAt) - toMs(a.joinedAt));
  return closable[0] ?? null;
}
