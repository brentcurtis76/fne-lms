// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  resolveEffectiveAttendance,
  type AttendanceEffectiveStore,
  type EffectiveAttendanceRow,
} from '../../../lib/zoom/attendance-effective';

/**
 * Supersession as a READ-TIME rule (§15.3.9): the highest-seq complete batch's rows,
 * else the webhook rows marked PROVISIONAL — never a union, never a cross-source
 * match, and webhook rows never rewritten.
 */

const OCCURRENCE = 'z7Effective/Occ==';

function row(id: string, source: 'webhook' | 'report', leftAt: string | null): EffectiveAttendanceRow {
  return {
    id,
    userId: null,
    customerKey: null,
    displayName: 'Sintetica',
    transientEmail: null,
    matchedBy: 'unmatched',
    joinedAt: '2026-07-29T23:56:00.000Z',
    leftAt,
    source,
  };
}

function fakeStore(options: {
  winningBatchId?: string | null;
  reportRows?: EffectiveAttendanceRow[];
  webhookRows?: EffectiveAttendanceRow[];
}) {
  const store: AttendanceEffectiveStore = {
    findWinningBatchId: vi.fn(async () => options.winningBatchId ?? null),
    listReportRows: vi.fn(async () => options.reportRows ?? []),
    listWebhookRows: vi.fn(async () => options.webhookRows ?? []),
  };
  return store;
}

describe('resolveEffectiveAttendance — wholesale supersession, never a union', () => {
  it('[matrix 10] a complete batch supersedes the webhook rows WHOLESALE', async () => {
    const store = fakeStore({
      winningBatchId: 'batch-9',
      reportRows: [row('r1', 'report', '2026-07-30T00:30:00.000Z')],
      webhookRows: [row('w1', 'webhook', null), row('w2', 'webhook', null)],
    });

    const effective = await resolveEffectiveAttendance(store, OCCURRENCE);

    expect(effective).toEqual({
      source: 'report',
      provisional: false,
      batchId: 'batch-9',
      rows: [row('r1', 'report', '2026-07-30T00:30:00.000Z')],
    });
    // Wholesale means the webhook set is not even READ, let alone merged: there is
    // no cross-source key (§6.2 — report rows carry no participant_uuid), so any
    // combination would be a guess.
    expect(store.listWebhookRows).not.toHaveBeenCalled();
  });

  it('[matrix 11] no complete batch: webhook rows stay effective and PROVISIONAL', async () => {
    const store = fakeStore({
      winningBatchId: null,
      webhookRows: [row('w1', 'webhook', null)],
    });

    const effective = await resolveEffectiveAttendance(store, OCCURRENCE);

    expect(effective.source).toBe('webhook');
    expect(effective.provisional).toBe(true);
    expect(effective.batchId).toBeNull();
    expect(effective.rows).toHaveLength(1);
    // The open interval survives AS an open interval — never closed, never filled.
    expect(effective.rows[0].leftAt).toBeNull();
  });

  it('an occurrence with nothing observed is source none, still provisional', async () => {
    const store = fakeStore({ winningBatchId: null, webhookRows: [] });
    const effective = await resolveEffectiveAttendance(store, OCCURRENCE);
    expect(effective).toEqual({ source: 'none', provisional: true, batchId: null, rows: [] });
  });

  it('a complete batch that says NOBODY attended supersedes with an empty set', async () => {
    // The report is data even when it is empty; falling back to webhook rows here
    // would resurrect exactly the double-count supersession removes.
    const store = fakeStore({
      winningBatchId: 'batch-3',
      reportRows: [],
      webhookRows: [row('w1', 'webhook', null)],
    });

    const effective = await resolveEffectiveAttendance(store, OCCURRENCE);

    expect(effective.source).toBe('report');
    expect(effective.provisional).toBe(false);
    expect(effective.rows).toEqual([]);
  });
});
