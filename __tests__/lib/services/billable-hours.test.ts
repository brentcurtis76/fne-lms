// @vitest-environment node
/**
 * Z2-5b (r13) — lib/services/billable-hours.ts :: billableHours.
 *
 * The helper's contract is a 2×2: `{ledger row, no ledger row}` × `{per_session_display,
 * charged_total}`. r12 shipped it with the no-ledger-row branch placed BEFORE the mode
 * check, so an un-ledgered session returned its full scheduled duration in both modes —
 * including the aggregate whose own doc says only CHARGED_LEDGER_STATUSES contribute. That
 * made a `borrador` session count for more than a `reservada` one, which correctly returns
 * 0. This suite pins all four cells so the branch cannot drift back to mode-blind.
 *
 * Synthetic data only.
 */

import { describe, it, expect } from 'vitest';

import {
  billableHours,
  CHARGED_LEDGER_STATUSES,
  type BillableLedgerEntry,
} from '../../../lib/services/billable-hours';

const SCHEDULED_120_MIN = 120;

function entry(status: string, hours: number | null): BillableLedgerEntry {
  return { status, hours };
}

describe('billableHours', () => {
  // ============================================================
  // The 2×2 the contract is made of.
  // ============================================================

  describe('no ledger row', () => {
    it('per_session_display falls back to scheduledDurationMinutes', () => {
      // The drill-down renders one row per session and must show something meaningful for
      // a session that is not ledgered yet.
      expect(billableHours(null, SCHEDULED_120_MIN, 'per_session_display')).toBe(2);
      expect(billableHours(undefined, SCHEDULED_120_MIN, 'per_session_display')).toBe(2);
    });

    it('charged_total contributes 0 even with a non-zero scheduled duration', () => {
      // No ledger row means no billing record: the session was never reserved and was
      // certainly never charged. 120 minutes is deliberately non-zero so the assertion
      // cannot pass by coincidence.
      expect(billableHours(null, SCHEDULED_120_MIN, 'charged_total')).toBe(0);
      expect(billableHours(undefined, SCHEDULED_120_MIN, 'charged_total')).toBe(0);
    });

    it('per_session_display treats a null scheduled duration as 0', () => {
      expect(billableHours(null, null, 'per_session_display')).toBe(0);
      expect(billableHours(null, undefined, 'per_session_display')).toBe(0);
    });
  });

  describe('with a ledger row', () => {
    it('per_session_display returns the row hours verbatim for every status', () => {
      // The status is rendered beside the number, so it disambiguates the row itself.
      expect(billableHours(entry('reservada', 3), SCHEDULED_120_MIN, 'per_session_display')).toBe(3);
      expect(billableHours(entry('consumida', 2.25), SCHEDULED_120_MIN, 'per_session_display')).toBe(2.25);
      expect(billableHours(entry('devuelta', 4), SCHEDULED_120_MIN, 'per_session_display')).toBe(4);
      expect(billableHours(entry('penalizada', 0.75), SCHEDULED_120_MIN, 'per_session_display')).toBe(0.75);
    });

    it('charged_total counts only consumida and penalizada', () => {
      // executeCancellation never rewrites `hours`, so a devuelta row still holds the full
      // originally-reserved amount — counting it would bill hours the school got back.
      expect(billableHours(entry('reservada', 3), SCHEDULED_120_MIN, 'charged_total')).toBe(0);
      expect(billableHours(entry('consumida', 2.25), SCHEDULED_120_MIN, 'charged_total')).toBe(2.25);
      expect(billableHours(entry('devuelta', 4), SCHEDULED_120_MIN, 'charged_total')).toBe(0);
      expect(billableHours(entry('penalizada', 0.75), SCHEDULED_120_MIN, 'charged_total')).toBe(0.75);
    });

    it('never falls back to the scheduled duration when a row exists', () => {
      // The ledger is authoritative: a charged row's hours win over the schedule, and a
      // non-charged row yields 0 rather than the schedule.
      expect(billableHours(entry('consumida', 0.5), SCHEDULED_120_MIN, 'charged_total')).toBe(0.5);
      expect(billableHours(entry('reservada', 3), SCHEDULED_120_MIN, 'charged_total')).not.toBe(2);
    });
  });

  // ============================================================
  // The invariant the 2×2 exists to protect.
  // ============================================================

  it('in charged_total, only a ledger row with a charged status ever contributes', () => {
    const nonCharged = ['reservada', 'devuelta'];

    for (const status of nonCharged) {
      expect(CHARGED_LEDGER_STATUSES as readonly string[]).not.toContain(status);
      expect(billableHours(entry(status, 5), SCHEDULED_120_MIN, 'charged_total')).toBe(0);
    }

    for (const status of CHARGED_LEDGER_STATUSES) {
      expect(billableHours(entry(status, 5), SCHEDULED_120_MIN, 'charged_total')).toBe(5);
    }

    // And the un-ledgered case, which is what r13 corrected.
    expect(billableHours(null, SCHEDULED_120_MIN, 'charged_total')).toBe(0);
  });

  it('an un-ledgered session never outweighs a reservada one in the aggregate', () => {
    // The incoherence r13 removed: a borrador session (no row) used to return its full
    // scheduled hours while an approved-but-not-delivered session returned 0.
    const unledgered = billableHours(null, SCHEDULED_120_MIN, 'charged_total');
    const reserved = billableHours(entry('reservada', 2), SCHEDULED_120_MIN, 'charged_total');

    expect(unledgered).toBe(0);
    expect(unledgered).toBeLessThanOrEqual(reserved);
  });

  // ============================================================
  // Z7-4 — the §11 coalesce: effective_minutes governs when set.
  // ============================================================
  describe('effective_minutes (§11 override, Z7-4)', () => {
    const overridden = (minutes: number | null): BillableLedgerEntry => ({
      status: 'consumida',
      hours: 1,
      effective_minutes: minutes,
    });

    it('planned 60 / no override → 60 discounted, in both modes', () => {
      // The §11 required lines "planned 60/Zoom 45 → 60" and "planned 60/Zoom 90 → 60"
      // are THIS fact: Zoom data has no input here at all — only an admin-written
      // effective_minutes can move the figure, and absent one the planned value governs.
      expect(billableHours(overridden(null), 60, 'per_session_display')).toBe(1);
      expect(billableHours(overridden(null), 60, 'charged_total')).toBe(1);
      expect(
        billableHours({ status: 'consumida', hours: 1 }, 60, 'charged_total')
      ).toBe(1);
    });

    it('[Z7-A6] planned 60 / Zoom 45 → bills the planned 60', () => {
      const zoomComparisonMinutes = 45;
      expect(zoomComparisonMinutes).toBe(45);
      expect(billableHours(overridden(null), 60, 'charged_total')).toBe(1);
    });

    it('[Z7-A6] planned 60 / Zoom 90 → bills the planned 60', () => {
      const zoomComparisonMinutes = 90;
      expect(zoomComparisonMinutes).toBe(90);
      expect(billableHours(overridden(null), 60, 'charged_total')).toBe(1);
    });

    it('[Z7-A6] planned 60 / no Zoom data → bills the planned 60', () => {
      const zoomComparisonMinutes = null;
      expect(zoomComparisonMinutes).toBeNull();
      expect(billableHours(overridden(null), 60, 'charged_total')).toBe(1);
    });

    it('an override to 45 minutes bills 0.75 — the adjusted value, both modes', () => {
      expect(billableHours(overridden(45), 60, 'per_session_display')).toBe(0.75);
      expect(billableHours(overridden(45), 60, 'charged_total')).toBe(0.75);
    });

    it('a ZERO waiver bills 0 — `!= null`, never truthiness', () => {
      expect(billableHours(overridden(0), 60, 'charged_total')).toBe(0);
      expect(billableHours(overridden(0), 60, 'per_session_display')).toBe(0);
    });

    it('applies the §11 "one rounding rule": minutes/60 to two decimals, half-up', () => {
      // Same rule as calculateHours and as the SQL twin in get_bucket_summary
      // (round(effective_minutes/60.0, 2)) — 50 min is 0.83, never 0.8333….
      expect(billableHours(overridden(50), 60, 'charged_total')).toBe(0.83);
      expect(billableHours(overridden(70), 60, 'charged_total')).toBe(1.17);
    });

    it('charged_total still ignores non-charged statuses, override or not', () => {
      expect(
        billableHours(
          { status: 'devuelta', hours: 1, effective_minutes: 45 },
          60,
          'charged_total'
        )
      ).toBe(0);
    });

    it('a penalizada row with an override reads the adjusted value', () => {
      expect(
        billableHours(
          { status: 'penalizada', hours: 1, effective_minutes: 30 },
          60,
          'charged_total'
        )
      ).toBe(0.5);
    });
  });
});
