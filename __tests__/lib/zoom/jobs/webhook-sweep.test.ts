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
import type {
  UnappliedWebhookEvent,
  ZoomWebhookSweepStore,
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

function createMemorySweepStore(rows: LedgerRow[]) {
  const meetings = new Map<number, { id: string; status: string; uuid: string | null }>([
    [MEETING_NUMBER, { id: MEETING_ID, status: 'provisioned', uuid: null }],
  ]);

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
    setMeetingStatus: vi.fn(async (meetingId: string, status: string, uuid: string | null) => {
      const entry = [...meetings.values()].find((candidate) => candidate.id === meetingId);
      if (!entry) return;
      entry.status = status;
      if (uuid !== null) entry.uuid = uuid;
    }),
    recordEvent: vi.fn(async () => 'inserted' as const),
    readProcessedAt: vi.fn(async () => undefined),
  };

  return { store, rows, meetings };
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
});
