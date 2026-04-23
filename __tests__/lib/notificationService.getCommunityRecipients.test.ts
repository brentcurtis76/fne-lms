// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

// notificationService.ts throws at import time if these are missing.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

type TableResponse = {
  // For tables whose chain ends in `.single()`.
  single?: { data: unknown; error: unknown };
  // For tables whose chain is awaited directly.
  data?: unknown[];
  error?: unknown;
};

type RecordedCall = {
  table: string;
  filters: Array<[string, string, unknown]>;
  terminator: 'single' | 'await';
};

function createFakeSupabase(responses: Record<string, TableResponse | undefined>) {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      const record: RecordedCall = { table, filters: [], terminator: 'await' };
      calls.push(record);
      const resp = responses[table];
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          record.filters.push(['eq', col, val]);
          return builder;
        },
        in(col: string, val: unknown) {
          record.filters.push(['in', col, val]);
          return builder;
        },
        single() {
          record.terminator = 'single';
          const r = resp?.single ?? { data: null, error: { message: 'not found' } };
          return Promise.resolve(r);
        },
        then(onFul: (value: unknown) => unknown, onRej?: (reason: unknown) => unknown) {
          const r = { data: resp?.data ?? [], error: resp?.error ?? null };
          return Promise.resolve(r).then(onFul, onRej);
        },
      };
      return builder;
    },
  };
  return { client: client as any, calls };
}

let getCommunityRecipients: typeof import('../../lib/notificationService').getCommunityRecipients;

beforeAll(async () => {
  ({ getCommunityRecipients } = await import('../../lib/notificationService'));
});

const MEETING_ID = 'meeting-1';
const COMMUNITY_ID = 'community-1';

function meetingRow() {
  return {
    single: {
      data: { id: MEETING_ID, workspace: { community_id: COMMUNITY_ID } },
      error: null,
    },
  } as TableResponse;
}

describe('getCommunityRecipients', () => {
  it('excludes users whose user_notification_preferences has email_enabled=false', async () => {
    const { client } = createFakeSupabase({
      community_meetings: meetingRow(),
      user_roles: { data: [{ user_id: 'u1' }, { user_id: 'u2' }] },
      profiles: {
        data: [
          { id: 'u1', email: 'u1@test.cl', first_name: 'One', last_name: 'User' },
          { id: 'u2', email: 'u2@test.cl', first_name: 'Two', last_name: 'User' },
        ],
      },
      user_notification_preferences: {
        data: [{ user_id: 'u1', email_enabled: false }],
      },
    });

    const recipients = await getCommunityRecipients(client, MEETING_ID, {
      onlyAttended: false,
    });

    expect(recipients.map((r) => r.id)).toEqual(['u2']);
    expect(recipients).toEqual([
      { id: 'u2', email: 'u2@test.cl', name: 'Two User' },
    ]);
  });

  it('includes a user with no preferences row by default', async () => {
    const { client } = createFakeSupabase({
      community_meetings: meetingRow(),
      user_roles: { data: [{ user_id: 'u1' }] },
      profiles: {
        data: [
          { id: 'u1', email: 'u1@test.cl', first_name: 'One', last_name: 'User' },
        ],
      },
      user_notification_preferences: { data: [] },
    });

    const recipients = await getCommunityRecipients(client, MEETING_ID, {
      onlyAttended: false,
    });

    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toEqual({
      id: 'u1',
      email: 'u1@test.cl',
      name: 'One User',
    });
  });

  it('dedupes u1 across multiple community-role rows (onlyAttended:false)', async () => {
    const { client, calls } = createFakeSupabase({
      community_meetings: meetingRow(),
      // Same user appearing under multiple role rows must collapse to one recipient.
      user_roles: {
        data: [
          { user_id: 'u1' },
          { user_id: 'u1' },
          { user_id: 'u1' },
        ],
      },
      profiles: {
        data: [
          { id: 'u1', email: 'u1@test.cl', first_name: 'One', last_name: 'User' },
        ],
      },
      user_notification_preferences: { data: [] },
    });

    const recipients = await getCommunityRecipients(client, MEETING_ID, {
      onlyAttended: false,
    });

    expect(recipients).toHaveLength(1);
    expect(recipients.map((r) => r.id)).toEqual(['u1']);

    // Exactly one profiles lookup issued with a deduped id list.
    const profilesCall = calls.find((c) => c.table === 'profiles');
    expect(profilesCall).toBeDefined();
    const idsFilter = profilesCall!.filters.find(
      ([op, col]) => op === 'in' && col === 'id'
    );
    expect(idsFilter?.[2]).toEqual(['u1']);

    // Community-role path, not attendee path, is queried.
    expect(calls.some((c) => c.table === 'user_roles')).toBe(true);
    expect(calls.some((c) => c.table === 'meeting_attendees')).toBe(false);
  });

  it('onlyAttended:true reads meeting_attendees filtered by attendance_status=attended', async () => {
    const { client, calls } = createFakeSupabase({
      community_meetings: meetingRow(),
      meeting_attendees: { data: [{ user_id: 'u1' }] },
      profiles: {
        data: [
          { id: 'u1', email: 'u1@test.cl', first_name: 'One', last_name: 'User' },
        ],
      },
      user_notification_preferences: { data: [] },
    });

    const recipients = await getCommunityRecipients(client, MEETING_ID, {
      onlyAttended: true,
    });

    expect(recipients.map((r) => r.id)).toEqual(['u1']);

    // Attendee path is used, community-role path is NOT.
    const attendeesCall = calls.find((c) => c.table === 'meeting_attendees');
    expect(attendeesCall).toBeDefined();
    expect(attendeesCall!.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'meeting_id', MEETING_ID],
        ['eq', 'attendance_status', 'attended'],
      ])
    );
    expect(calls.some((c) => c.table === 'user_roles')).toBe(false);
  });

  it('returns an empty list without throwing when user_roles is empty', async () => {
    const { client, calls } = createFakeSupabase({
      community_meetings: meetingRow(),
      user_roles: { data: [] },
      // profiles/prefs should never be queried; leave them unset to prove it.
    });

    const recipients = await getCommunityRecipients(client, MEETING_ID, {
      onlyAttended: false,
    });

    expect(recipients).toEqual([]);
    expect(calls.some((c) => c.table === 'profiles')).toBe(false);
    expect(calls.some((c) => c.table === 'user_notification_preferences')).toBe(
      false
    );
  });

  it('throws Error("meeting_not_found") when the meeting lookup returns null', async () => {
    const { client } = createFakeSupabase({
      community_meetings: {
        single: { data: null, error: { message: 'No rows' } },
      },
    });

    await expect(
      getCommunityRecipients(client, MEETING_ID, { onlyAttended: false })
    ).rejects.toThrow('meeting_not_found');
  });
});
