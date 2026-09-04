/**
 * Zoom hourly reconciler (plan §8 lifecycle drift, §9 host inventory). Scheduled
 * `0 * * * *` in `vercel.json`.
 *
 * This endpoint ENQUEUES; it does not do work. Anything slow or fallible belongs on
 * the queue, where it gets a lease, bounded retries and a dead-letter — a reconcile
 * that did its own work inside the request would lose all three, and Vercel crons
 * never retry.
 *
 * Same auth as the ticker (see `lib/zoom/cron-auth.ts`), and for the same §14
 * kill-switch reason it is NOT gated on `FEATURE_ZOOM_MEETINGS`.
 *
 * ## What is here now
 *
 * Two GLOBAL jobs are deduped on the UTC hour — `host_sync:<hour>` and
 * `webhook_sweep:<hour>` — plus one `attendance_reconcile` candidate job per ended
 * occurrence without a complete report batch. Candidate keys include occurrence UUID
 * and hour. Against the UNIQUE index that means the same pass enqueues each exactly
 * once even if Vercel double-fires or an operator calls the endpoint again; the next
 * hour may retry a still-unresolved candidate.
 *
 * The hour is taken in UTC, deliberately: the key must be stable regardless of the
 * invoking region's local time, and America/Santiago's DST transitions would
 * otherwise make one hour of the year enqueue twice and another not at all.
 *
 * ## What is deliberately NOT here yet
 *
 * The remaining §8/§9 drift checks land in later chunks and each becomes another
 * enqueue in `planReconcileJobs()` below:
 *
 *  - **Stalled lifecycle** (§8): `zoom_meetings` rows still `provisioned` well past
 *    `ends_at`, i.e. a `meeting.ended` webhook that never arrived.
 *  - **Settings drift** (§12/§18): re-read `auto_recording` for active meetings.
 *    Keys on `auto_recording`, never on `recording_disclaimer` (ledger §9.4).
 *  - **Recording transfer sweep** (§12): `zoom_recording_files` stuck in
 *    `transferring`. Arrives with Z4.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  authorizeCronRequest,
  CRON_ALLOWED_METHODS,
  isAllowedCronMethod,
} from '../../../lib/zoom/cron-auth';
import { defaultZoomJobQueue, type ZoomJobQueue } from '../../../lib/zoom/jobs/queue';
import {
  defaultZoomAttendanceReportStore,
  type ReconcileCandidate,
  type ZoomAttendanceReportStore,
} from '../../../lib/zoom/attendance-report-store';
import type { ZoomJobInsert } from '../../../lib/zoom/db-types';
import {
  defaultZoomTenantGate,
  enforceZoomTenantBoundary,
  type ZoomTenantGate,
} from '../../../lib/zoom/tenant-boundary';

/** `2026-07-30T12` — UTC hour, the dedupe granularity of an hourly reconcile. */
export function utcHourKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 13);
}

/**
 * How far back the attendance reconcile looks for ended-but-uncaptured occurrences.
 * Zoom retains reports for months; the window bounds how long a permanently-failing
 * report keeps re-enqueueing (hourly, visibly, via rejected batches) before going
 * quiet. Dead-lettered jobs stay on the §18 panel regardless.
 */
export const ATTENDANCE_RECONCILE_WINDOW_DAYS = 7;
/** Occurrences per pass — a backlog beyond this is picked up next hour. */
export const ATTENDANCE_RECONCILE_MAX_CANDIDATES = 50;

/**
 * The jobs one reconcile pass wants enqueued. Still a pure function: the DB read the
 * attendance candidates need happens in the route, which hands the result in — so
 * this stays unit-testable as plain data in, plain data out.
 *
 * The attendance dedupe key is per occurrence AND per hour: per occurrence so a
 * double-fired cron enqueues each occurrence once, per hour so an occurrence whose
 * candidates keep getting REJECTED (a §15.3.9 outcome, not a job crash) is retried
 * on the next pass rather than never again.
 */
export function planReconcileJobs(
  nowMs: number,
  attendanceCandidates: ReconcileCandidate[] = []
): ZoomJobInsert[] {
  const hour = utcHourKey(nowMs);
  return [
    {
      job_type: 'host_sync',
      payload: { source: 'reconcile' },
      dedupe_key: `host_sync:${hour}`,
    },
    {
      job_type: 'webhook_sweep',
      payload: { source: 'reconcile' },
      dedupe_key: `webhook_sweep:${hour}`,
    },
    // Z7-3: the authoritative participant-report capture, one job per ended
    // occurrence that has no COMPLETE batch yet.
    ...attendanceCandidates.map((candidate) => ({
      job_type: 'attendance_reconcile',
      payload: {
        source: 'reconcile',
        meeting_id: candidate.meetingId,
        occurrence_uuid: candidate.zoomMeetingUuid,
      },
      dedupe_key: `attendance_reconcile:${candidate.zoomMeetingUuid}:${hour}`,
    })),
    // Future: stalled-lifecycle, settings-drift and recording-sweep jobs. See the
    // module header for what each one is waiting on.
  ];
}

export interface ZoomReconcileHandlerDeps {
  queue?: ZoomJobQueue;
  reportStore?: ZoomAttendanceReportStore;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  tenantGate?: ZoomTenantGate;
}

export async function handleZoomReconcile(
  req: NextApiRequest,
  res: NextApiResponse,
  deps: ZoomReconcileHandlerDeps = {}
): Promise<void> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => Date.now());

  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', CRON_ALLOWED_METHODS.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = authorizeCronRequest(req, env);
  if (auth.ok === false) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const queue = deps.queue ?? defaultZoomJobQueue(env);
    const reportStore = deps.reportStore ?? defaultZoomAttendanceReportStore(env);
    const windowStart = new Date(
      now() - ATTENDANCE_RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const candidates = await reportStore.listReconcileCandidates(
      windowStart,
      ATTENDANCE_RECONCILE_MAX_CANDIDATES
    );
    const reportableCandidates: ReconcileCandidate[] = [];
    let suppressedQa = 0;
    const tenantGate = deps.tenantGate ?? defaultZoomTenantGate(env);
    for (const candidate of candidates) {
      const suppression = await enforceZoomTenantBoundary({
        schoolId: candidate.schoolId,
        operation: 'zoom_reconcile',
        gate: tenantGate,
      });
      if (suppression) suppressedQa += 1;
      else reportableCandidates.push(candidate);
    }
    let enqueued = 0;
    for (const job of planReconcileJobs(now(), reportableCandidates)) {
      const outcome = await queue.enqueue(job);
      if (outcome === 'enqueued') enqueued += 1;
    }
    res.status(200).json({ enqueued, suppressed_qa: suppressedQa });
  } catch (error) {
    console.error('[zoom-reconcile] enqueue failed:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  return handleZoomReconcile(req, res);
}
