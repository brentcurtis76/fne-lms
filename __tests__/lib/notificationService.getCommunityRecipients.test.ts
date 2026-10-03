// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';

// notificationService.ts builds a Supabase client at import time and throws if
// the URL is missing OR invalid. Set known-good values UNCONDITIONALLY: a `||`
// fallback only triggers on a falsy value, so a truthy-but-invalid value left
// behind by a sibling suite (e.g. the string "undefined") would survive and
// make createClient throw. vitest runs with threads:false, so process.env is
// shared across files. getCommunityRecipients takes a fake client, so the
// module-level client these vars feed is never actually used here.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

type TableResponse = {
  // For tables whose chain ends in `.single()`.
  single?: { data: unknown; error: unknown };
  // For tables whose chain is awaited directly.
  data?: unknown[];
  error?: unknown;
  // The awaited chain rejects, or building it throws, with this value.
  rejects?: unknown;
  throws?: unknown;
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
          if (resp?.throws) throw resp.throws;
          return builder;
        },
        single() {
          record.terminator = 'single';
          const r = resp?.single ?? { data: null, error: { message: 'not found' } };
          return Promise.resolve(r);
        },
        then(onFul: (value: unknown) => unknown, onRej?: (reason: unknown) => unknown) {
          if (resp?.rejects) return Promise.reject(resp.rejects).then(onFul, onRej);
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
  // Re-assert valid env right before the import, in case a sibling suite
  // mutated process.env after this file's top-level ran (threads:false shares it).
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
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

  it('dedupes u1 across multiple leader-role rows (onlyAttended:false)', async () => {
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

    // SM-H8: the 'community' audience is the people with access — community
    // LEADERS (not every member), participants and read grants.
    const rolesCall = calls.find((c) => c.table === 'user_roles');
    expect(rolesCall?.filters).toContainEqual(['eq', 'role_type', 'lider_comunidad']);
    expect(calls.some((c) => c.table === 'meeting_attendees')).toBe(true);
    expect(calls.some((c) => c.table === 'meeting_read_grants')).toBe(true);
  });

  it('SM-H8: mails the creator, facilitator, secretary, participants, added readers and leaders — nobody else', async () => {
    const { client } = createFakeSupabase({
      community_meetings: {
        single: {
          data: {
            id: MEETING_ID, created_by: 'creator', facilitator_id: 'facil', secretary_id: null,
            workspace: { community_id: COMMUNITY_ID },
          },
          error: null,
        },
      },
      user_roles: { data: [{ user_id: 'leader' }] },
      meeting_attendees: { data: [{ user_id: 'part' }, { user_id: 'creator' }] },
      meeting_read_grants: { data: [{ user_id: 'reader' }] },
      profiles: {
        data: ['creator', 'facil', 'leader', 'part', 'reader'].map((id) => ({ id, email: `${id}@test.cl`, first_name: id, last_name: '' })),
      },
      user_notification_preferences: { data: [] },
    });
    const recipients = await getCommunityRecipients(client, MEETING_ID, { onlyAttended: false });
    expect(recipients.map((r) => r.id).sort()).toEqual(['creator', 'facil', 'leader', 'part', 'reader']);
  });

  it('SM-H8: if the access list cannot be read, nobody is mailed', async () => {
    const { client } = createFakeSupabase({
      community_meetings: meetingRow(),
      user_roles: { data: [{ user_id: 'u1' }] },
      meeting_attendees: { error: { message: 'boom' } },
      profiles: { data: [{ id: 'u1', email: 'u1@test.cl', first_name: 'One', last_name: 'User' }] },
      user_notification_preferences: { data: [] },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getCommunityRecipients(client, MEETING_ID, { onlyAttended: false })).resolves.toEqual([]);
    consoleError.mockRestore();
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

  it('D2: a non-default community category mode decides over any legacy false row; default restores it', async () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    const { client, calls } = createFakeSupabase({
      community_meetings: meetingRow(),
      user_roles: { data: ids.map((user_id) => ({ user_id })) },
      profiles: {
        data: ids.map((id) => ({ id, email: `${id}@qa.local.test`, first_name: id, last_name: 'Sintetico' })),
      },
      // Any false row counts for the meeting summary, whatever its notification type.
      user_notification_preferences: {
        data: [
          { user_id: 'u1', email_enabled: false },
          { user_id: 'u2', email_enabled: false },
          { user_id: 'u3', email_enabled: false },
          { user_id: 'u6', email_enabled: false },
          { user_id: 'u6', email_enabled: true },
        ],
      },
      user_notification_category_prefs: {
        data: [
          { user_id: 'u1', email_mode: 'immediate' },
          { user_id: 'u2', email_mode: 'digest' },
          { user_id: 'u3', email_mode: 'default' },
          { user_id: 'u4', email_mode: 'off' },
          { user_id: 'u6', email_mode: 'weekly' },
        ],
      },
    });

    const recipients = await getCommunityRecipients(client, MEETING_ID, { onlyAttended: false });

    // u1 immediate and u2 digest (compat: sent now) override the false row; u3 default
    // and u6 invalid mode keep it; u4 off suppresses; u5 has no rows and gets the catalog default.
    expect(recipients.map((r) => r.id)).toEqual(['u1', 'u2', 'u5']);

    const categoryCall = calls.find((c) => c.table === 'user_notification_category_prefs');
    expect(categoryCall?.filters).toEqual([
      ['eq', 'category', 'community'],
      ['in', 'user_id', ids],
    ]);
  });

  it.each(['user_notification_preferences', 'user_notification_category_prefs'])(
    'D4: a failed %s read suppresses every meeting-summary email and logs only a status',
    async (failing) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { client } = createFakeSupabase({
          community_meetings: meetingRow(),
          user_roles: { data: [{ user_id: 'u1' }] },
          profiles: { data: [{ id: 'u1', email: 'u1@qa.local.test', first_name: 'One', last_name: 'User' }] },
          [failing]: { error: { code: '57014', message: 'timeout reading u1@qa.local.test' } },
        });

        const recipients = await getCommunityRecipients(client, MEETING_ID, { onlyAttended: false });

        expect(recipients).toEqual([]);
        const text = JSON.stringify(errorSpy.mock.calls);
        expect(text).toContain('preference_unavailable');
        expect(text).not.toContain('u1');
        expect(text).not.toContain('timeout');
      } finally {
        errorSpy.mockRestore();
      }
    }
  );

  it.each([
    ['user_notification_preferences', 'rejects'],
    ['user_notification_category_prefs', 'rejects'],
    ['user_notification_preferences', 'throws'],
    ['user_notification_category_prefs', 'throws'],
  ])(
    'D8: a %s read that %s resolves to no recipients and logs only a status',
    async (failing, kind) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { client } = createFakeSupabase({
          community_meetings: meetingRow(),
          user_roles: { data: [{ user_id: 'u1' }] },
          profiles: { data: [{ id: 'u1', email: 'u1@qa.local.test', first_name: 'One', last_name: 'User' }] },
          user_notification_preferences: { data: [] },
          user_notification_category_prefs: { data: [] },
          [failing]: { [kind]: new Error('connection reset reading u1@qa.local.test') },
        });

        await expect(getCommunityRecipients(client, MEETING_ID, { onlyAttended: false })).resolves.toEqual([]);
        const text = JSON.stringify(errorSpy.mock.calls);
        expect(text).toContain('preference_unavailable');
        expect(text).not.toContain('u1');
        expect(text).not.toContain('connection reset');
      } finally {
        errorSpy.mockRestore();
      }
    }
  );

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
