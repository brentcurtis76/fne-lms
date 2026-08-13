// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  createAttendanceReconcileHandler,
  REPORT_PAGE_SIZE,
} from '../../../../lib/zoom/jobs/attendance-reconcile';
import { ZoomJobLeaseLostError, type ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import { createZoomFake } from '../../../../lib/zoom/fake';
import { ZoomRetryableError } from '../../../../lib/zoom/errors';
import type {
  PromoteBatchInput,
  PromoteBatchResult,
  ReconcileMeeting,
  ZoomAttendanceReportStore,
} from '../../../../lib/zoom/attendance-report-store';
import type { ParticipantMatchLookups } from '../../../../lib/zoom/participant-lifecycle';
import type { ZoomJobRow } from '../../../../lib/zoom/db-types';

/**
 * `attendance_reconcile` under the §15.3.9 contract, against the REAL fake ZoomApi —
 * whose report endpoint paginates exactly as Zoom does, because single-fetch
 * consumers are the defect the completeness rule exists to catch.
 *
 * The store double records rather than persists; the promotion ATOMICITY itself is
 * pgTAP 011's to prove against the real `promote_attendance_report_batch`. What this
 * suite pins is the JOB's discipline: full traversal with unchanged parameters,
 * whole-candidate rejection, nothing written page-by-page, and the same identity
 * hierarchy as the webhook path.
 */

const OCCURRENCE = 'z7Report/Occurrence/A==';
const MEETING: ReconcileMeeting = {
  meetingId: 'a7a7a7a7-2222-0000-0000-000000000001',
  surfaceType: 'consultor_session',
  surfaceId: 'a7a7a7a7-3333-0000-0000-000000000001',
  schoolId: 9901,
  zoomMeetingUuid: OCCURRENCE,
  status: 'ended',
};
const KNOWN_PROFILE = '47d97a10-7c8f-4c34-8519-b4c77ed439d9';

function fakeReportStore(options: {
  meeting?: ReconcileMeeting | null;
  promoteResult?: PromoteBatchResult;
  promoteError?: Error;
} = {}) {
  const rejections: { batchId: string; reason: string }[] = [];
  const promotions: PromoteBatchInput[] = [];
  let batchCounter = 0;

  const store: ZoomAttendanceReportStore = {
    readMeeting: vi.fn(async () => (options.meeting === undefined ? MEETING : options.meeting)),
    createPendingBatch: vi.fn(async () => {
      batchCounter += 1;
      return `batch-${batchCounter}`;
    }),
    rejectBatch: vi.fn(async (batchId: string, reason: string) => {
      rejections.push({ batchId, reason });
    }),
    promoteBatch: vi.fn(async (input: PromoteBatchInput) => {
      if (options.promoteError) throw options.promoteError;
      promotions.push(input);
      return options.promoteResult ?? 'promoted';
    }),
    listReconcileCandidates: vi.fn(async () => []),
  };
  return { store, rejections, promotions };
}

function fakeLookups(options: { profiles?: string[]; byEmail?: Record<string, string> } = {}) {
  const lookups: ParticipantMatchLookups = {
    profileExists: vi.fn(async (id: string) => (options.profiles ?? []).includes(id)),
    findProfileIdByEmail: vi.fn(
      async (email: string) => (options.byEmail ?? {})[email.toLowerCase()] ?? null
    ),
    listExpectedAttendees: vi.fn(async () => []),
  };
  return lookups;
}

function context(): ZoomJobContext & { heartbeats: unknown[] } {
  const heartbeats: unknown[] = [];
  return {
    job: {
      id: 'job-1',
      job_type: 'attendance_reconcile',
      payload: { meeting_id: MEETING.meetingId },
    } as unknown as ZoomJobRow,
    workerId: 'worker-1',
    heartbeat: vi.fn(async (state?: Record<string, unknown>) => {
      heartbeats.push(state);
      return true;
    }),
    heartbeats,
  };
}

function seedReport(count: number) {
  const api = createZoomFake();
  api.setReportParticipants(
    OCCURRENCE,
    Array.from({ length: count }, (_, index) => ({
      name: `Participante ${index + 1}`,
      user_email: '',
      customer_key: index === 0 ? KNOWN_PROFILE.replace(/-/g, '') : '',
      join_time: '2026-07-29T23:56:00Z',
      leave_time: '2026-07-30T00:30:00Z',
    }))
  );
  return api;
}

describe('attendance_reconcile — the complete-batch capture', () => {
  it('traverses EVERY page with unchanged parameters and promotes once, whole', async () => {
    // 230 rows at page size 100 = 3 pages. One promotion, all rows, no per-page write.
    const api = seedReport(230);
    const { store, promotions, rejections } = fakeReportStore();
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups({ profiles: [KNOWN_PROFILE] }),
      now: () => Date.parse('2026-07-30T02:00:00Z'),
    });

    const result = await handler(context());

    expect(result).toMatchObject({
      batch: 'promoted',
      batch_id: 'batch-1',
      pages: 3,
      rows: 230,
      matched_rows: 1,
    });
    expect(rejections).toEqual([]);
    expect(promotions).toHaveLength(1);
    expect(promotions[0]).toMatchObject({
      batchId: 'batch-1',
      pageSize: REPORT_PAGE_SIZE,
      totalRecords: 230,
      reportFetchedAt: '2026-07-30T02:00:00.000Z',
    });
    expect(promotions[0].rows).toHaveLength(230);
    // The §15 hierarchy decided the evidence: the customer_key row matched a person,
    // and every row carries a CLOSED interval — the report arrives paired.
    expect(promotions[0].rows[0]).toMatchObject({
      userId: KNOWN_PROFILE,
      matchedBy: 'customer_key',
      joinedAt: '2026-07-29T23:56:00.000Z',
      leftAt: '2026-07-30T00:30:00.000Z',
    });
    expect(promotions[0].rows[1]).toMatchObject({ userId: null, matchedBy: 'unmatched' });
  });

  it('[matrix 13] a page failure mid-traversal rejects the ENTIRE candidate and promotes nothing', async () => {
    const api = seedReport(230);
    api.failReportPage(OCCURRENCE, 1);
    const { store, promotions, rejections } = fakeReportStore();
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).rejects.toThrow();

    expect(promotions).toEqual([]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].batchId).toBe('batch-1');
    expect(rejections[0].reason).toMatch(/^page_fetch_failed/);
  });

  it('[Z7-R6] an exhausted retryable page failure still rejects the pending batch', async () => {
    const api = createZoomFake();
    api.listReportParticipants = vi.fn(async () => {
      throw new ZoomRetryableError('synthetic transport retries exhausted', {
        status: 503,
        operation: 'list_report_participants',
      });
    });
    const { store, promotions, rejections } = fakeReportStore();
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).rejects.toThrow(ZoomRetryableError);
    expect(promotions).toEqual([]);
    expect(rejections).toEqual([
      {
        batchId: 'batch-1',
        reason: 'page_fetch_failed: synthetic transport retries exhausted',
      },
    ]);
  });

  it('[matrix 14] count drift rejects the candidate with the failed clause named', async () => {
    const api = seedReport(50);
    api.driftReportTotal(OCCURRENCE, 51);
    const { store, promotions, rejections } = fakeReportStore();
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).rejects.toThrow(ZoomRetryableError);

    expect(promotions).toEqual([]);
    expect(rejections).toEqual([{ batchId: 'batch-1', reason: 'row_count_mismatch' }]);
  });

  it('a missing report (404) is retryable — Zoom generates it minutes after the end', async () => {
    const api = createZoomFake(); // no report seeded at all
    const { store, rejections } = fakeReportStore();
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).rejects.toThrow(ZoomRetryableError);
    expect(rejections[0].reason).toMatch(/^page_fetch_failed/);
  });

  it('an occurrence the meeting never started is ledger-only, not an error', async () => {
    const { store } = fakeReportStore({
      meeting: { ...MEETING, zoomMeetingUuid: null },
    });
    const handler = createAttendanceReconcileHandler({
      api: createZoomFake(),
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).resolves.toEqual({ skipped: 'no_occurrence_uuid' });
    expect(store.createPendingBatch).not.toHaveBeenCalled();
  });

  it('a vanished meeting row is ledger-only too', async () => {
    const { store } = fakeReportStore({ meeting: null });
    const handler = createAttendanceReconcileHandler({
      api: createZoomFake(),
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).resolves.toEqual({ skipped: 'meeting_not_found' });
  });

  it('a batch another run already resolved reports batch_not_pending and stays calm', async () => {
    const api = seedReport(3);
    const { store } = fakeReportStore({ promoteResult: 'batch_not_pending' });
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).resolves.toMatchObject({ batch: 'batch_not_pending' });
  });

  it('a promotion the DATABASE refuses is rejected and rethrown — the DB is the arbiter', async () => {
    const api = seedReport(3);
    const { store, rejections } = fakeReportStore({
      promoteError: new Error(
        'promote_attendance_report_batch: 3 rows inserted but total_records is 4 — batch incomplete'
      ),
    });
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(context())).rejects.toThrow(/batch incomplete/);
    expect(rejections[0].reason).toMatch(/^promotion_failed/);
  });

  it('a lost lease stops the work without marking the candidate rejected', async () => {
    const api = seedReport(230);
    const { store, rejections } = fakeReportStore();
    const ctx = context();
    (ctx.heartbeat as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const handler = createAttendanceReconcileHandler({
      api,
      reportStore: store,
      matchLookups: fakeLookups(),
    });

    await expect(handler(ctx)).rejects.toThrow(ZoomJobLeaseLostError);
    // Another worker owns the job now; ITS batch is the one that gets resolved.
    expect(rejections).toEqual([]);
  });

  it('the store this job drives has NO member that could touch a webhook row', () => {
    // Structural, like the participant path's no-status rule: "webhook rows are
    // never edited, closed or deleted by reconcile" is a property of the TYPE.
    const { store } = fakeReportStore();
    expect(Object.keys(store).sort()).toEqual([
      'createPendingBatch',
      'listReconcileCandidates',
      'promoteBatch',
      'readMeeting',
      'rejectBatch',
    ]);
  });
});
