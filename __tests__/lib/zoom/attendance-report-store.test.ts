/**
 * Candidate selection for attendance reconciliation (Z7-R3).
 *
 * The production store must page past complete occurrences instead of limiting
 * before it filters them. These doubles model PostgREST's ordered range queries
 * and the complete-batch lookup for each bounded page.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAttendanceReportStore } from '../../../lib/zoom/attendance-report-store';

interface CandidateRow {
  id: string;
  zoom_meeting_uuid: string | null;
}

function candidate(index: number): CandidateRow {
  return {
    id: `a7a7a7a7-3000-4000-8000-${String(index).padStart(12, '0')}`,
    zoom_meeting_uuid: `z7Candidate/${String(index).padStart(4, '0')}==`,
  };
}

function clientFor(rows: CandidateRow[], completeUuids: Set<string>) {
  const ranges: Array<[number, number]> = [];
  const orders: Array<[string, boolean]> = [];

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === 'zoom_meetings') {
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.gte = vi.fn(() => chain);
          chain.order = vi.fn((column: string, options: { ascending: boolean }) => {
            orders.push([column, options.ascending]);
            return chain;
          });
          chain.limit = vi.fn(async (count: number) => ({
            data: rows.slice(0, count),
            error: null,
          }));
          chain.range = vi.fn(async (from: number, to: number) => {
            ranges.push([from, to]);
            return { data: rows.slice(from, to + 1), error: null };
          });
          return chain;
        }

        const chain: Record<string, unknown> = {};
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn(async (_column: string, uuids: string[]) => ({
          data: uuids
            .filter((uuid) => completeUuids.has(uuid))
            .map((zoom_meeting_uuid) => ({ zoom_meeting_uuid })),
          error: null,
        }));
        return chain;
      }),
    })),
  };

  return { client, ranges, orders };
}

describe('listReconcileCandidates', () => {
  it('pages past more than one full page of complete occurrences to find unresolved work', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => candidate(index + 1));
    const complete = new Set(
      rows.slice(0, 200).map((row) => row.zoom_meeting_uuid as string)
    );
    const { client, ranges, orders } = clientFor(rows, complete);
    const store = createSupabaseAttendanceReportStore(client as never);

    await expect(store.listReconcileCandidates('2026-07-01T00:00:00.000Z', 1)).resolves.toEqual([
      { meetingId: rows[200].id, zoomMeetingUuid: rows[200].zoom_meeting_uuid },
    ]);
    expect(ranges).toEqual([
      [0, 99],
      [100, 199],
      [200, 299],
    ]);
    expect(orders).toEqual([
      ['updated_at', false], ['id', true],
      ['updated_at', false], ['id', true],
      ['updated_at', false], ['id', true],
    ]);
  });

  it('returns the requested unresolved limit in deterministic database order', async () => {
    const rows = Array.from({ length: 105 }, (_, index) => candidate(index + 1));
    const unresolvedIndexes = new Set([2, 101, 102]);
    const complete = new Set(
      rows
        .filter((_row, index) => !unresolvedIndexes.has(index))
        .map((row) => row.zoom_meeting_uuid as string)
    );
    const { client } = clientFor(rows, complete);
    const store = createSupabaseAttendanceReportStore(client as never);

    const result = await store.listReconcileCandidates('2026-07-01T00:00:00.000Z', 2);
    expect(result).toEqual([
      { meetingId: rows[2].id, zoomMeetingUuid: rows[2].zoom_meeting_uuid },
      { meetingId: rows[101].id, zoomMeetingUuid: rows[101].zoom_meeting_uuid },
    ]);
  });
});
