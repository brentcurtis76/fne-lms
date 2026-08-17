// @vitest-environment node
/**
 * `webhook_sweep` suite (Z1b-3 finding ⑤, delivered in Z1b-4).
 *
 * The sweep's whole job is to finish deliveries the route recorded but never applied,
 * so the double here is a ledger with a real `processed_at` column and a real age
 * filter — a store that returned everything would let a passing test hide both.
 *
 * The lifecycle itself is NOT re-asserted in detail here; it is the shared
 * `lib/zoom/webhook-lifecycle.ts` the route uses, covered by the route's own suite and
 * by the provisioning round trip. What this suite pins is the sweep's selection,
 * marking and idempotence.
 */
import { describe, it, expect, vi } from 'vitest';

import { createWebhookSweepHandler } from '../../../../lib/zoom/jobs/webhook-sweep';
import {
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
  PROJECTION_ENDED_APPLIES_FROM,
  PROJECTION_LIVE_APPLIES_FROM,
  type MeetingSurfaceKeys,
  type ProjectionLifecycleStatus,
  type UnappliedWebhookEvent,
  type ZoomLifecycleStatus,
  type ZoomWebhookSweepStore,
} from '../../../../lib/zoom/webhook-store';
import type { ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import type { ZoomJobRow } from '../../../../lib/zoom/db-types';

const NOW_MS = Date.parse('2026-08-05T12:00:00.000Z');
const MEETING_NUMBER = 82000000777;
const MEETING_ID = 'meeting-777';
const OCCURRENCE_UUID = 'Fk+SyntheticUuid/0042==';

interface LedgerRow extends UnappliedWebhookEvent {
  received_at: string;
  processed_at: string | null;
}

function startedEvent(): Record<string, unknown> {
  return {
    event: 'meeting.started',
    payload: { object: { id: String(MEETING_NUMBER), uuid: OCCURRENCE_UUID } },
  };
}

function endedEvent(): Record<string, unknown> {
  return {
    event: 'meeting.ended',
    payload: { object: { id: String(MEETING_NUMBER), uuid: OCCURRENCE_UUID } },
  };
}

const SURFACE_ID = 'cccc1111-2222-4333-8444-555566667777';

/**
 * Like the route suite's double, this one MODELS THE MONOTONIC GUARD — and here it
 * matters most: the sweep is the mechanism that replays a `meeting.started` long after
 * its `meeting.ended` landed, so a double that wrote unconditionally would let the very
 * bug this job could cause pass unnoticed.
 */
function createMemorySweepStore(
  rows: LedgerRow[],
  seed: { status?: string; projectionStatus?: string | null } = {}
) {
  const meetings = new Map<number, { id: string; status: string; uuid: string | null }>([
    [MEETING_NUMBER, { id: MEETING_ID, status: seed.status ?? 'provisioned', uuid: null }],
  ]);
  const projection =
    seed.projectionStatus === null
      ? null
      : { meeting_status: seed.projectionStatus ?? 'scheduled' };

  const store: ZoomWebhookSweepStore = {
    listUnappliedEvents: vi.fn(async (receivedBeforeIso: string, limit: number) =>
      rows
        .filter((row) => row.processed_at === null && row.received_at < receivedBeforeIso)
        .slice(0, limit)
        .map((row) => ({
          dedupe_key: row.dedupe_key,
          event_type: row.event_type,
          raw_payload: row.raw_payload,
        }))
    ),
    markProcessed: vi.fn(async (dedupeKey: string, processedAt: string) => {
      const row = rows.find((candidate) => candidate.dedupe_key === dedupeKey);
      if (row) row.processed_at = processedAt;
    }),
    findMeetingIdByNumber: vi.fn(async (number: number) => meetings.get(number)?.id ?? null),
    setMeetingStatus: vi.fn(
      async (meetingId: string, status: ZoomLifecycleStatus, uuid: string | null) => {
        const entry = [...meetings.values()].find((candidate) => candidate.id === meetingId);
        if (!entry) return { applied: false, surface: null };
        const appliesFrom: readonly string[] =
          status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
        if (!appliesFrom.includes(entry.status)) return { applied: false, surface: null };
        entry.status = status;
        if (uuid !== null) entry.uuid = uuid;
        return {
          applied: true,
          surface: { surfaceType: 'consultor_session' as const, surfaceId: SURFACE_ID },
        };
      }
    ),
    setProjectionStatus: vi.fn(
      async (_surface: MeetingSurfaceKeys, status: ProjectionLifecycleStatus) => {
        if (projection === null) return;
        const appliesFrom: readonly string[] =
          status === 'live' ? PROJECTION_LIVE_APPLIES_FROM : PROJECTION_ENDED_APPLIES_FROM;
        if (!appliesFrom.includes(projection.meeting_status)) return;
        projection.meeting_status = status;
      }
    ),
    recordEvent: vi.fn(async () => 'inserted' as const),
    readProcessedAt: vi.fn(async () => undefined),
  };

  return { store, rows, meetings, projection };
}

function context(): ZoomJobContext {
  const job: ZoomJobRow = {
    id: 'job-sweep',
    job_type: 'webhook_sweep',
    payload: { source: 'reconcile' },
    dedupe_key: 'webhook_sweep:2026-08-05T12',
    status: 'leased',
    attempts: 1,
    max_attempts: 5,
    run_after: new Date(0).toISOString(),
    lease_expires_at: null,
    heartbeat_at: null,
    stage_state: {},
    last_error: null,
    worker_id: 'worker-1',
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
  return { job, workerId: 'worker-1', heartbeat: vi.fn(async () => true) };
}

describe('webhook_sweep', () => {
  it('heals a row the route recorded but never applied', async () => {
    const harness = createMemorySweepStore([
      {
        dedupe_key: 'sha-unapplied',
        event_type: 'meeting.started',
        raw_payload: startedEvent(),
        // 30 min old — past the 15-min floor.
        received_at: '2026-08-05T11:30:00.000Z',
        processed_at: null,
      },
    ]);

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ scanned: 1, applied: 1, skipped_no_payload: 0 });
    // The lifecycle really ran: status moved AND the occurrence uuid was captured.
    expect(harness.meetings.get(MEETING_NUMBER)).toMatchObject({
      status: 'started',
      uuid: OCCURRENCE_UUID,
    });
    expect(harness.rows[0].processed_at).toBe(new Date(NOW_MS).toISOString());
  });

  it('leaves already-processed rows untouched', async () => {
    const harness = createMemorySweepStore([
      {
        dedupe_key: 'sha-done',
        event_type: 'meeting.started',
        raw_payload: startedEvent(),
        received_at: '2026-08-05T11:30:00.000Z',
        processed_at: '2026-08-05T11:30:05.000Z',
      },
    ]);

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ scanned: 0, applied: 0 });
    expect(harness.store.setMeetingStatus).not.toHaveBeenCalled();
    expect(harness.store.markProcessed).not.toHaveBeenCalled();
    expect(harness.rows[0].processed_at).toBe('2026-08-05T11:30:05.000Z');
  });

  it('ignores rows younger than the age floor, so it cannot race a live delivery', async () => {
    const harness = createMemorySweepStore([
      {
        dedupe_key: 'sha-fresh',
        event_type: 'meeting.started',
        raw_payload: startedEvent(),
        // 2 min old — the route may still be handling it.
        received_at: '2026-08-05T11:58:00.000Z',
        processed_at: null,
      },
    ]);

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ scanned: 0, applied: 0 });
    expect(harness.rows[0].processed_at).toBeNull();
  });

  it('marks a scrubbed row processed instead of sweeping it forever', async () => {
    const harness = createMemorySweepStore([
      {
        dedupe_key: 'sha-scrubbed',
        event_type: 'meeting.started',
        // The 30-day retention scrub nulls raw_payload but keeps the dedupe row.
        raw_payload: null,
        received_at: '2026-08-05T11:30:00.000Z',
        processed_at: null,
      },
    ]);

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ scanned: 1, applied: 0, skipped_no_payload: 1 });
    expect(harness.store.setMeetingStatus).not.toHaveBeenCalled();
    expect(harness.rows[0].processed_at).not.toBeNull();
  });

  it('is idempotent: a second run finds nothing left to do', async () => {
    const harness = createMemorySweepStore([
      {
        dedupe_key: 'sha-unapplied',
        event_type: 'meeting.started',
        raw_payload: startedEvent(),
        received_at: '2026-08-05T11:30:00.000Z',
        processed_at: null,
      },
    ]);
    const handler = createWebhookSweepHandler({ store: harness.store, now: () => NOW_MS });

    const first = await handler(context());
    const second = await handler(context());

    expect(first).toMatchObject({ scanned: 1, applied: 1 });
    expect(second).toMatchObject({ scanned: 0, applied: 0 });
    expect(harness.store.setMeetingStatus).toHaveBeenCalledTimes(1);
  });

  it('falls back to the denormalised event_type when the payload omits it', async () => {
    const harness = createMemorySweepStore([
      {
        dedupe_key: 'sha-noevent',
        event_type: 'meeting.started',
        raw_payload: { payload: { object: { id: String(MEETING_NUMBER), uuid: OCCURRENCE_UUID } } },
        received_at: '2026-08-05T11:30:00.000Z',
        processed_at: null,
      },
    ]);

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ applied: 1 });
    expect(harness.meetings.get(MEETING_NUMBER)?.status).toBe('started');
  });

  it('caps a backlog at maxRows and leaves the rest for the next hour', async () => {
    const rows: LedgerRow[] = Array.from({ length: 5 }, (_, index) => ({
      dedupe_key: `sha-${index}`,
      event_type: 'meeting.started',
      raw_payload: startedEvent(),
      received_at: '2026-08-05T11:30:00.000Z',
      processed_at: null,
    }));
    const harness = createMemorySweepStore(rows);

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
      maxRows: 2,
    })(context());

    expect(result).toMatchObject({ scanned: 2, applied: 2 });
    expect(harness.rows.filter((row) => row.processed_at === null)).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Sol F1 — the sweep is the reachable out-of-order replay
  // -------------------------------------------------------------------------

  /**
   * The scenario the age floor makes INEVITABLE rather than unlikely: a
   * `meeting.started` whose first delivery died is only swept 15+ minutes later, by
   * which time the meeting has ended and the route applied `meeting.ended` normally.
   * Before F1 this sweep flipped the row back to `started` — re-entering the §9
   * EXCLUDE active set and re-acquiring a host for a window that was over.
   */
  it('a SWEPT older started, replayed after ended, cannot reopen the meeting', async () => {
    const harness = createMemorySweepStore(
      [
        {
          dedupe_key: 'sha-late-started',
          event_type: 'meeting.started',
          raw_payload: startedEvent(),
          // Received first, swept last — 40 min old.
          received_at: '2026-08-05T11:20:00.000Z',
          processed_at: null,
        },
      ],
      // The route already applied `meeting.ended` in the meantime.
      { status: 'ended', projectionStatus: 'ended' }
    );

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    // The sweep did its job — the ledger row is finished, so it stops reappearing.
    expect(result).toMatchObject({ scanned: 1, applied: 1 });
    expect(harness.rows[0].processed_at).not.toBeNull();

    // ...and the transition it replayed was refused at the store.
    expect(harness.meetings.get(MEETING_NUMBER)?.status).toBe('ended');
    expect(harness.projection?.meeting_status).toBe('ended');
    expect(['pending', 'provisioned', 'started']).not.toContain(
      harness.meetings.get(MEETING_NUMBER)?.status
    );
    // The refusal is what stops the projection call — `live` never even attempted.
    expect(harness.store.setProjectionStatus).not.toHaveBeenCalled();
  });

  it('a swept ended lands on a still-provisioned row and moves the projection too', async () => {
    const harness = createMemorySweepStore(
      [
        {
          dedupe_key: 'sha-late-ended',
          event_type: 'meeting.ended',
          raw_payload: endedEvent(),
          received_at: '2026-08-05T11:20:00.000Z',
          processed_at: null,
        },
      ],
      // `ended` applies from anything but cancelled/deleted — including a row whose
      // `started` never arrived at all.
      { status: 'provisioned', projectionStatus: 'scheduled' }
    );

    const result = await createWebhookSweepHandler({
      store: harness.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ scanned: 1, applied: 1 });
    expect(harness.meetings.get(MEETING_NUMBER)?.status).toBe('ended');
    expect(harness.projection?.meeting_status).toBe('ended');
  });
});

// ---------------------------------------------------------------------------
// Z7-2 — the sweep dispatches participant events to the SAME applier the route uses
// ---------------------------------------------------------------------------

describe('webhook_sweep · participant events ([R1])', () => {
  /**
   * This is the drift test, and it is the reason both appliers were extracted rather
   * than inlined at their call sites. The sweep exists to re-apply events the route
   * recorded but never applied, so if the route grew participant handling and the sweep
   * did not, the gap would be invisible: it would only ever show up for events whose
   * first delivery died mid-flight, i.e. exactly the ones nobody is watching.
   */
  function participantLedgerRow(): LedgerRow {
    return {
      dedupe_key: 'sweep-participant-1',
      event_type: 'meeting.participant_joined',
      raw_payload: {
        event: 'meeting.participant_joined',
        event_ts: 1785369357392,
        payload: {
          object: {
            id: String(MEETING_NUMBER),
            uuid: OCCURRENCE_UUID,
            participant: {
              customer_key: '47d97a107c8f4c348519b4c77ed439d9',
              user_name: 'Anfitrion Spike',
              email: 'host-1213@example-synthetic.test',
              join_time: '2026-07-29T23:55:56Z',
              participant_uuid: '364B3A17-05C0-6B63-F4FA-2180DCC26971',
            },
          },
        },
      },
      received_at: '2026-08-05T11:00:00.000Z',
      processed_at: null,
    };
  }

  function attendanceDouble() {
    const inserted: unknown[] = [];
    const store = {
      findSurfaceByOccurrence: vi.fn(async () => ({
        surfaceType: 'consultor_session' as const,
        surfaceId: SURFACE_ID,
        schoolId: 9901,
        zoomMeetingUuid: OCCURRENCE_UUID,
      })),
      findSurfaceByMeetingNumber: vi.fn(async () => null),
      profileExists: vi.fn(async () => false),
      findProfileIdByEmail: vi.fn(async () => null),
      listExpectedAttendees: vi.fn(async () => []),
      insertInterval: vi.fn(async (row: unknown) => {
        inserted.push(row);
        return 'inserted' as const;
      }),
      applyLeave: vi.fn(async () => 'no_open_interval' as const),
    };
    return { store, inserted };
  }

  it('applies a swept participant_joined through the attendance store', async () => {
    const harness = createMemorySweepStore([participantLedgerRow()]);
    const attendance = attendanceDouble();

    const result = await createWebhookSweepHandler({
      store: harness.store,
      attendanceStore: attendance.store,
      now: () => NOW_MS,
    })(context());

    expect(result).toMatchObject({ scanned: 1, applied: 1 });
    expect(attendance.inserted).toHaveLength(1);
    expect(attendance.inserted[0]).toMatchObject({
      surfaceId: SURFACE_ID,
      schoolId: 9901,
      zoomMeetingUuid: OCCURRENCE_UUID,
      joinedAt: '2026-07-29T23:55:56.000Z',
      matchedBy: 'unmatched',
      userId: null,
      // Codex P1-2: the row carries the LEDGER's dedupe_key, so the sweep replaying an
      // event the route already applied conflicts on the unique index instead of
      // opening a second interval. The sweep and the route must supply the SAME key —
      // that is what makes "the same ingestion" true for idempotency too, not just for
      // the applier's code path.
      sourceEventKey: 'sweep-participant-1',
    });
    // ...and the row is marked processed, so it does not reappear in every later sweep.
    expect(harness.rows[0].processed_at).not.toBeNull();
  });

  it('never touches the meeting status or the projection while doing it ([B8])', async () => {
    const harness = createMemorySweepStore([participantLedgerRow()]);

    await createWebhookSweepHandler({
      store: harness.store,
      attendanceStore: attendanceDouble().store,
      now: () => NOW_MS,
    })(context());

    expect(harness.store.setMeetingStatus).not.toHaveBeenCalled();
    expect(harness.store.setProjectionStatus).not.toHaveBeenCalled();
    expect(harness.store.findMeetingIdByNumber).not.toHaveBeenCalled();
    expect(harness.meetings.get(MEETING_NUMBER)?.status).toBe('provisioned');
    expect(harness.projection?.meeting_status).toBe('scheduled');
  });
});
