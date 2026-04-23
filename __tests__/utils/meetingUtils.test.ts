// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake Supabase client that records the filter chain so we can assert on
// which clauses were applied for a given filter input. Each `.from()` call
// returns a fresh chain; the chain terminates at `.order()` (awaited directly
// by `getMeetings`) or earlier for the attendee lookup (also awaited).
type CallRecord = {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
};

function createFakeSupabase(tableResponses: Record<string, { data?: unknown[]; error?: unknown }>) {
  const log: CallRecord[] = [];

  function builder(table: string) {
    const record: CallRecord = { table, calls: [] };
    log.push(record);
    const resp = tableResponses[table] ?? { data: [] };
    const thenable: any = {
      select: (...args: unknown[]) => {
        record.calls.push({ method: 'select', args });
        return thenable;
      },
      eq: (...args: unknown[]) => {
        record.calls.push({ method: 'eq', args });
        return thenable;
      },
      in: (...args: unknown[]) => {
        record.calls.push({ method: 'in', args });
        return thenable;
      },
      or: (...args: unknown[]) => {
        record.calls.push({ method: 'or', args });
        return thenable;
      },
      gte: (...args: unknown[]) => {
        record.calls.push({ method: 'gte', args });
        return thenable;
      },
      lte: (...args: unknown[]) => {
        record.calls.push({ method: 'lte', args });
        return thenable;
      },
      order: (...args: unknown[]) => {
        record.calls.push({ method: 'order', args });
        return thenable;
      },
      then: (onFul: (value: unknown) => unknown, onRej?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: resp.data ?? [], error: resp.error ?? null }).then(onFul, onRej),
    };
    return thenable;
  }

  return {
    client: { from: (table: string) => builder(table) },
    log,
  };
}

const fakeSupabase = createFakeSupabase({});

vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: new Proxy(
    {},
    {
      get(_t, prop) {
        return (fakeSupabase.client as any)[prop];
      },
    },
  ),
}));

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../utils/workspaceUtils', () => ({ logWorkspaceActivity: vi.fn() }));

describe('getMeetings — myDrafts filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when userId is missing (regression: pre-wiring behavior preserved)', async () => {
    // When myDrafts=true but the caller passes no userId, the helper must
    // not silently filter everyone out — fall back to the regular status
    // filter (or no filter). The UI can only hit this path when the user
    // has somehow ticked the checkbox while unauthenticated; fail-safe is
    // to ignore the flag rather than show an empty list.
    const harness = createFakeSupabase({
      community_meetings: { data: [{ id: 'm1', status: 'programada' }] },
    });
    swapClient(harness.client);

    const { getMeetings } = await import('../../utils/meetingUtils');
    const result = await getMeetings('ws-1', { myDrafts: true, status: [] } as any, undefined, null);

    expect(result).toEqual([{ id: 'm1', status: 'programada' }]);
    // No `.or(...created_by.eq...)` call should have been issued.
    const meetingsCall = harness.log.find((c) => c.table === 'community_meetings');
    const orCall = meetingsCall?.calls.find((c) => c.method === 'or');
    expect(orCall?.args?.[0]).toBeUndefined();
  });

  it('restricts to status=borrador and ORs creator/facilitator/secretary when userId is provided', async () => {
    const harness = createFakeSupabase({
      community_meetings: { data: [{ id: 'm1', status: 'borrador' }] },
      meeting_attendees: { data: [] }, // user has no co_editor attendee row
    });
    swapClient(harness.client);

    const { getMeetings } = await import('../../utils/meetingUtils');
    await getMeetings('ws-1', { myDrafts: true, status: [] } as any, undefined, 'user-123');

    const meetingsCall = harness.log.find((c) => c.table === 'community_meetings');
    expect(meetingsCall).toBeDefined();

    // status=borrador via .eq (overriding .in filter)
    const eqStatus = meetingsCall!.calls.find(
      (c) => c.method === 'eq' && c.args[0] === 'status',
    );
    expect(eqStatus?.args[1]).toBe('borrador');

    // OR clause with the three policy ids — no id.in.() clause (attendee list empty)
    const orCall = meetingsCall!.calls.find((c) => c.method === 'or');
    expect(orCall).toBeDefined();
    const orExpr = orCall!.args[0] as string;
    expect(orExpr).toContain('created_by.eq.user-123');
    expect(orExpr).toContain('facilitator_id.eq.user-123');
    expect(orExpr).toContain('secretary_id.eq.user-123');
    expect(orExpr).not.toContain('id.in.');
  });

  it('adds id.in.(...) clause when the user has co_editor attendee rows', async () => {
    const harness = createFakeSupabase({
      community_meetings: { data: [] },
      meeting_attendees: {
        data: [{ meeting_id: 'meet-a' }, { meeting_id: 'meet-b' }],
      },
    });
    swapClient(harness.client);

    const { getMeetings } = await import('../../utils/meetingUtils');
    await getMeetings('ws-1', { myDrafts: true, status: [] } as any, undefined, 'user-456');

    // Attendee lookup issued with correct filters.
    const attCall = harness.log.find((c) => c.table === 'meeting_attendees');
    expect(attCall).toBeDefined();
    const attendeeEqs = attCall!.calls.filter((c) => c.method === 'eq');
    expect(attendeeEqs).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['user_id', 'user-456'] },
        { method: 'eq', args: ['role', 'co_editor'] },
      ]),
    );

    // Meetings OR clause includes id.in.(meet-a,meet-b).
    const meetingsCall = harness.log.find((c) => c.table === 'community_meetings');
    const orCall = meetingsCall!.calls.find((c) => c.method === 'or');
    const orExpr = orCall!.args[0] as string;
    expect(orExpr).toContain('id.in.(meet-a,meet-b)');
  });

  it('overrides the status filter when myDrafts is active', async () => {
    // User ticks status=['programada'] AND myDrafts. myDrafts wins — the
    // label "Mis borradores" means drafts only, regardless of status chips.
    const harness = createFakeSupabase({
      community_meetings: { data: [] },
      meeting_attendees: { data: [] },
    });
    swapClient(harness.client);

    const { getMeetings } = await import('../../utils/meetingUtils');
    await getMeetings(
      'ws-1',
      { myDrafts: true, status: ['programada'] } as any,
      undefined,
      'user-999',
    );

    const meetingsCall = harness.log.find((c) => c.table === 'community_meetings');
    // No `.in('status', [...])` call — the status-chip filter branch must be
    // skipped when myDrafts is active.
    const inStatus = meetingsCall!.calls.find(
      (c) => c.method === 'in' && c.args[0] === 'status',
    );
    expect(inStatus).toBeUndefined();
  });
});

// Swap the shared mock's backing client so each test sees a fresh recorder.
function swapClient(next: { from: (table: string) => unknown }) {
  (fakeSupabase.client as any).from = next.from.bind(next);
}
