// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  readReportIdentity,
  validateReportBatch,
} from '../../../lib/zoom/attendance-report';
import type { ZoomReportParticipantsPage } from '../../../lib/zoom/api';

/**
 * The §15.3.9 complete-batch rule, as unit tests over plain pages — matrix rows
 * 12–14. The defect this module exists to prevent is concrete: the earlier contract
 * promoted "every row of a successful fetch" wholesale, and a 31-person meeting
 * would have silently suppressed participant 31 to pagination.
 */

function page(
  overrides: Partial<ZoomReportParticipantsPage> & { names?: string[] }
): ZoomReportParticipantsPage {
  const names = overrides.names ?? ['Participante Uno'];
  return {
    participants: names.map((name, index) => ({
      name,
      user_email: '',
      customer_key: '',
      join_time: '2026-07-29T23:56:00Z',
      leave_time: `2026-07-30T00:0${index % 10}:00Z`,
    })),
    nextPageToken: overrides.nextPageToken ?? '',
    pageSize: overrides.pageSize ?? 100,
    pageCount: overrides.pageCount ?? 1,
    totalRecords: overrides.totalRecords ?? names.length,
  };
}

describe('validateReportBatch — the complete-batch rule (matrix 12–14)', () => {
  it('accepts a single complete page and parses every interval', () => {
    const result = validateReportBatch([
      page({ names: ['Ana Uno', 'Ana Dos'], totalRecords: 2 }),
    ]);
    expect(result).toMatchObject({ ok: true, totalRecords: 2 });
    if (result.ok === false) throw new Error('unreachable');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      joinedAt: '2026-07-29T23:56:00.000Z',
      leftAt: '2026-07-30T00:00:00.000Z',
      identity: { customerKey: null, email: null, displayName: 'Ana Uno' },
    });
  });

  it('[matrix 12] a multi-page occurrence is complete only across ALL its pages', () => {
    // 3 pages of 2 with total_records 5 — the last page is short, as Zoom serves it.
    const pages: ZoomReportParticipantsPage[] = [
      page({ names: ['P1', 'P2'], nextPageToken: 'pg:1', pageSize: 2, pageCount: 3, totalRecords: 5 }),
      page({ names: ['P3', 'P4'], nextPageToken: 'pg:2', pageSize: 2, pageCount: 3, totalRecords: 5 }),
      page({ names: ['P5'], nextPageToken: '', pageSize: 2, pageCount: 3, totalRecords: 5 }),
    ];
    const result = validateReportBatch(pages);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('unreachable');
    expect(result.rows.map((row) => row.identity.displayName)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
    ]);
  });

  it('[matrix 12] the truncated candidate — page one alone of a 31-person meeting — is REJECTED', () => {
    // The exact defect: one successful fetch, non-empty next_page_token. Promoting
    // it wholesale would suppress participant 31.
    const result = validateReportBatch([
      page({ names: Array.from({ length: 30 }, (_, i) => `P${i + 1}`), nextPageToken: 'pg:1', pageSize: 30, pageCount: 2, totalRecords: 31 }),
    ]);
    expect(result).toEqual({ ok: false, reason: 'pagination_not_exhausted' });
  });

  it('[matrix 14] accumulated count ≠ total_records rejects the batch', () => {
    const result = validateReportBatch([
      page({ names: ['P1', 'P2'], totalRecords: 3 }),
    ]);
    expect(result).toEqual({ ok: false, reason: 'row_count_mismatch' });
  });

  it('[matrix 14] metadata drifting between pages rejects the batch', () => {
    const result = validateReportBatch([
      page({ names: ['P1'], nextPageToken: 'pg:1', pageSize: 1, pageCount: 2, totalRecords: 2 }),
      page({ names: ['P2'], nextPageToken: '', pageSize: 1, pageCount: 2, totalRecords: 3 }),
    ]);
    expect(result).toEqual({ ok: false, reason: 'metadata_drift_across_pages' });
  });

  it('an empty token in the MIDDLE of the traversal rejects the batch', () => {
    const result = validateReportBatch([
      page({ names: ['P1'], nextPageToken: '', pageSize: 1, pageCount: 2, totalRecords: 2 }),
      page({ names: ['P2'], nextPageToken: '', pageSize: 1, pageCount: 2, totalRecords: 2 }),
    ]);
    expect(result).toEqual({ ok: false, reason: 'pages_after_end_of_data' });
  });

  it('zero pages is a rejection, never an empty complete batch', () => {
    expect(validateReportBatch([])).toEqual({ ok: false, reason: 'no_pages_fetched' });
  });

  it('an occurrence with genuinely zero participants IS a valid complete batch', () => {
    // total_records 0, one page, no rows: complete, and it supersedes the webhook
    // rows with an empty set — the report saying "nobody attended" is data.
    const result = validateReportBatch([
      page({ names: [], totalRecords: 0 }),
    ]);
    expect(result).toMatchObject({ ok: true, totalRecords: 0 });
  });

  it('a row missing either instant rejects the WHOLE batch', () => {
    const missingLeave = page({ names: ['P1', 'P2'], totalRecords: 2 });
    delete missingLeave.participants[1].leave_time;
    expect(validateReportBatch([missingLeave])).toEqual({
      ok: false,
      reason: 'invalid_interval_instant',
    });
  });

  it('a leave preceding its join rejects the WHOLE batch', () => {
    const backwards = page({ names: ['P1'], totalRecords: 1 });
    backwards.participants[0].join_time = '2026-07-30T00:10:00Z';
    backwards.participants[0].leave_time = '2026-07-30T00:05:00Z';
    expect(validateReportBatch([backwards])).toEqual({
      ok: false,
      reason: 'invalid_interval_order',
    });
  });

  it('an implausible instant (unit error) rejects rather than becoming evidence', () => {
    const seconds = page({ names: ['P1'], totalRecords: 1 });
    // An epoch-SECONDS-shaped string parse lands in 1970 — outside the band.
    seconds.participants[0].join_time = '1970-01-21T00:00:00Z';
    expect(validateReportBatch([seconds])).toEqual({
      ok: false,
      reason: 'invalid_interval_instant',
    });
  });

  it.each([
    ['null', null],
    ['number', 7],
    ['string', 'not-a-row'],
    ['array', []],
  ])(
    '[Z7-R3.1] is total over a %s participant runtime value',
    (_label, participant) => {
      const malformed = page({ totalRecords: 1 });
      malformed.participants = [participant] as unknown as ZoomReportParticipantsPage['participants'];

      expect(() => validateReportBatch([malformed])).not.toThrow();
      expect(validateReportBatch([malformed])).toEqual({
        ok: false,
        reason: 'malformed_participant_row',
      });
    }
  );
});

describe('readReportIdentity — the report field names, and "" is absent', () => {
  it('reads name/user_email/customer_key and nulls the empty strings', () => {
    expect(
      readReportIdentity({
        name: 'Invitada Spike',
        user_email: '',
        customer_key: '38a578a26df462bfe9cd1d7bbe5a0b77',
      })
    ).toEqual({
      customerKey: '38a578a26df462bfe9cd1d7bbe5a0b77',
      email: null,
      displayName: 'Invitada Spike',
    });
  });

  it('a row with nothing presentable is all-null identity, never a phantom', () => {
    expect(readReportIdentity({})).toEqual({
      customerKey: null,
      email: null,
      displayName: null,
    });
  });
});
