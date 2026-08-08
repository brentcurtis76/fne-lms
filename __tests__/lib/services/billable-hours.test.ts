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
});
