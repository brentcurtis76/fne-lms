// @vitest-environment node

/**
 * Unit tests for getCommunityRecipients in lib/notificationService.ts.
 * Uses a stub Supabase client and a mocked getCommunityMembers helper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCommunityMembers } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  return { mockGetCommunityMembers: vi.fn() };
});

vi.mock('../../utils/roleUtils', () => ({
  getCommunityMembers: mockGetCommunityMembers,
}));

import { getCommunityRecipients } from '../../lib/notificationService';

const MEETING_ID = 'mtg-0001';
const WORKSPACE_ID = 'wsp-0001';
const COMMUNITY_ID = 'com-0001';

type StubConfig = {
  meeting?: { id: string; workspace_id: string | null } | null;
  meetingError?: unknown;
  workspace?: { id: string; community_id: string | null } | null;
  workspaceError?: unknown;
  attendees?: Array<{ user_id: string | null }>;
  profiles?: Array<{
    id: string;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
  }>;
  prefs?: Array<{ user_id: string; email_enabled: boolean | null }>;
};

function makeSupabaseStub(cfg: StubConfig) {
  const buildThenable = (result: { data: unknown; error: unknown }) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      single: () => Promise.resolve(result),
      then: (resolve: any, reject?: any) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };

  return {
    from: (table: string) => {
      switch (table) {
        case 'community_meetings':
          return buildThenable({
            data: cfg.meeting ?? null,
            error: cfg.meetingError ?? (cfg.meeting ? null : { message: 'not found' }),
          });
        case 'community_workspaces':
          return buildThenable({
            data: cfg.workspace ?? null,
            error:
              cfg.workspaceError ?? (cfg.workspace ? null : { message: 'not found' }),
          });
        case 'meeting_attendees':
          return buildThenable({ data: cfg.attendees ?? [], error: null });
        case 'profiles':
          return buildThenable({ data: cfg.profiles ?? [], error: null });
        case 'user_notification_preferences':
          return buildThenable({ data: cfg.prefs ?? [], error: null });
        default:
          return buildThenable({ data: [], error: null });
      }
    },
  } as any;
}

beforeEach(() => {
  mockGetCommunityMembers.mockReset();
});

describe('getCommunityRecipients', () => {
  it('returns all eligible community members when onlyAttended is false', async () => {
    mockGetCommunityMembers.mockResolvedValue([
      { id: 'u1', email: 'u1@x.cl', first_name: 'Ana', last_name: 'Pérez' },
      { id: 'u2', email: 'u2@x.cl', first_name: 'Luis', last_name: 'Soto' },
    ]);
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: { id: WORKSPACE_ID, community_id: COMMUNITY_ID },
      prefs: [],
    });

    const result = await getCommunityRecipients(supabase, MEETING_ID, {
      onlyAttended: false,
    });

    expect(mockGetCommunityMembers).toHaveBeenCalledWith(supabase, COMMUNITY_ID);
    expect(result).toEqual([
      { id: 'u1', email: 'u1@x.cl', name: 'Ana Pérez' },
      { id: 'u2', email: 'u2@x.cl', name: 'Luis Soto' },
    ]);
  });

  it('returns only attended users when onlyAttended is true', async () => {
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: { id: WORKSPACE_ID, community_id: COMMUNITY_ID },
      attendees: [{ user_id: 'u1' }, { user_id: 'u3' }],
      profiles: [
        { id: 'u1', email: 'u1@x.cl', first_name: 'Ana', last_name: 'Pérez' },
        { id: 'u3', email: 'u3@x.cl', first_name: 'Mar', last_name: 'Lopez' },
      ],
      prefs: [],
    });

    const result = await getCommunityRecipients(supabase, MEETING_ID, {
      onlyAttended: true,
    });

    expect(mockGetCommunityMembers).not.toHaveBeenCalled();
    expect(result.map((r) => r.id).sort()).toEqual(['u1', 'u3']);
  });

  it('dedupes duplicate user ids from the member list', async () => {
    mockGetCommunityMembers.mockResolvedValue([
      { id: 'u1', email: 'u1@x.cl', first_name: 'Ana', last_name: 'Pérez' },
      { id: 'u1', email: 'u1@x.cl', first_name: 'Ana', last_name: 'Pérez' },
      { id: 'u2', email: 'u2@x.cl', first_name: 'Luis', last_name: 'Soto' },
    ]);
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: { id: WORKSPACE_ID, community_id: COMMUNITY_ID },
      prefs: [],
    });

    const result = await getCommunityRecipients(supabase, MEETING_ID, {
      onlyAttended: false,
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['u1', 'u2']);
  });

  it('excludes users with email_enabled = false', async () => {
    mockGetCommunityMembers.mockResolvedValue([
      { id: 'u1', email: 'u1@x.cl', first_name: 'Ana', last_name: 'Pérez' },
      { id: 'u2', email: 'u2@x.cl', first_name: 'Luis', last_name: 'Soto' },
    ]);
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: { id: WORKSPACE_ID, community_id: COMMUNITY_ID },
      prefs: [{ user_id: 'u2', email_enabled: false }],
    });

    const result = await getCommunityRecipients(supabase, MEETING_ID, {
      onlyAttended: false,
    });

    expect(result.map((r) => r.id)).toEqual(['u1']);
  });

  it('falls back to profile.name when first/last are missing', async () => {
    mockGetCommunityMembers.mockResolvedValue([
      { id: 'u1', email: 'u1@x.cl', name: 'Solo Nombre' },
    ]);
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: { id: WORKSPACE_ID, community_id: COMMUNITY_ID },
      prefs: [],
    });

    const result = await getCommunityRecipients(supabase, MEETING_ID, {
      onlyAttended: false,
    });

    expect(result).toEqual([
      { id: 'u1', email: 'u1@x.cl', name: 'Solo Nombre' },
    ]);
  });

  it('throws when the meeting is missing', async () => {
    const supabase = makeSupabaseStub({ meeting: null });
    await expect(
      getCommunityRecipients(supabase, MEETING_ID, { onlyAttended: false })
    ).rejects.toMatchObject({ message: 'meeting_not_found' });
  });

  it('throws when the meeting has no workspace_id', async () => {
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: null },
    });
    await expect(
      getCommunityRecipients(supabase, MEETING_ID, { onlyAttended: false })
    ).rejects.toMatchObject({ message: 'workspace_not_found' });
  });

  it('throws when the workspace is missing', async () => {
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: null,
    });
    await expect(
      getCommunityRecipients(supabase, MEETING_ID, { onlyAttended: false })
    ).rejects.toMatchObject({ message: 'workspace_not_found' });
  });

  it('throws when the workspace has no community_id', async () => {
    const supabase = makeSupabaseStub({
      meeting: { id: MEETING_ID, workspace_id: WORKSPACE_ID },
      workspace: { id: WORKSPACE_ID, community_id: null },
    });
    await expect(
      getCommunityRecipients(supabase, MEETING_ID, { onlyAttended: false })
    ).rejects.toMatchObject({ message: 'community_not_found' });
  });
});
