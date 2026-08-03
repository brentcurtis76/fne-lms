// @vitest-environment node
/**
 * planned_minutes_snapshot (Zoom plan §11, Z1b slice).
 *
 * createReservation must snapshot the session's approved duration in minutes
 * onto the ledger row at reservation time — and change NOTHING else about the
 * existing hours behavior. Assertions are pinned to absolute values so the
 * suite is timezone-independent: it must pass identically under TZ=UTC,
 * TZ=America/Santiago and TZ=Europe/Madrid (repo 3-TZ matrix precedent:
 * notice-hours-timezone.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { createReservation } from '../../../lib/services/hour-tracking';

/** Builds a mock service client that records the contract_hours_ledger insert payload. */
function makeMockClient(options?: { availableHours?: number }) {
  const inserted: Record<string, unknown>[] = [];

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'hour_types') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'ht-1' }, error: null }),
        };
      }
      if (table === 'contract_hour_allocations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'alloc-1',
              contrato_id: '550e8400-e29b-41d4-a716-446655440000',
              hour_type_id: 'ht-1',
              allocated_hours: 100,
            },
            error: null,
          }),
        };
      }
      if (table === 'contract_hours_ledger') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            inserted.push(payload);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'ledger-1' }, error: null }),
            };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          hour_type_key: 'asesoria_tecnica_presencial',
          available_hours: options?.availableHours ?? 50,
          allocated_hours: 100,
          reserved_hours: 50,
          consumed_hours: 0,
        },
      ],
      error: null,
    }),
  } as any;

  return { client, inserted };
}

const baseSession = {
  id: 'session-snap-1',
  hour_type_key: 'asesoria_tecnica_presencial',
  contrato_id: '550e8400-e29b-41d4-a716-446655440000',
  session_date: '2026-03-10',
  start_time: '09:00:00',
  end_time: '10:00:00',
  scheduled_duration_minutes: 60,
  modality: 'presencial',
} as any;

describe('createReservation — planned_minutes_snapshot (§11 Z1b slice)', () => {
  it('writes the snapshot equal to scheduled_duration_minutes at reservation time', async () => {
    const { client, inserted } = makeMockClient();

    const result = await createReservation(client, baseSession, 'user-1');

    expect(result.skipped).toBe(false);
    expect(result.error).toBeUndefined();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].planned_minutes_snapshot).toBe(60);
    expect(inserted[0].planned_minutes_snapshot).toBe(
      baseSession.scheduled_duration_minutes
    );
  });

  it('leaves the existing hours behavior untouched (hours still bill from the same duration)', async () => {
    const { client, inserted } = makeMockClient();

    const result = await createReservation(client, baseSession, 'user-1');

    // Same figures as before the snapshot column existed:
    expect(result.hours).toBe(1);
    expect(inserted[0]).toMatchObject({
      allocation_id: 'alloc-1',
      session_id: 'session-snap-1',
      hours: 1,
      status: 'reservada',
      session_date: '2026-03-10',
      recorded_by: 'user-1',
      is_over_budget: false,
      is_manual: false,
    });
  });

  it('snapshots the computed duration on the start/end fallback path (no generated column)', async () => {
    const { client, inserted } = makeMockClient();
    const session = {
      ...baseSession,
      id: 'session-snap-2',
      start_time: '09:00:00',
      end_time: '10:30:00',
      scheduled_duration_minutes: null,
    };

    const result = await createReservation(client, session, 'user-1');

    expect(result.skipped).toBe(false);
    expect(inserted[0].planned_minutes_snapshot).toBe(90);
    expect(result.hours).toBe(1.5);
    expect(inserted[0].hours).toBe(1.5);
  });

  it('still writes the snapshot on over-budget reservations (flag behavior unchanged)', async () => {
    const { client, inserted } = makeMockClient({ availableHours: 0.25 });
    const session = {
      ...baseSession,
      id: 'session-snap-3',
      end_time: '11:00:00',
      scheduled_duration_minutes: 120,
    };

    const result = await createReservation(client, session, 'user-1');

    expect(result.is_over_budget).toBe(true);
    expect(result.error).toBeUndefined();
    expect(inserted[0].planned_minutes_snapshot).toBe(120);
    expect(inserted[0].is_over_budget).toBe(true);
  });

  it('writes nothing at all for legacy sessions without hour tracking (skip guard intact)', async () => {
    const { client, inserted } = makeMockClient();
    const session = { ...baseSession, hour_type_key: null, contrato_id: null };

    const result = await createReservation(client, session, 'user-1');

    expect(result.skipped).toBe(true);
    expect(inserted).toHaveLength(0);
    expect(client.from).not.toHaveBeenCalled();
  });
});
