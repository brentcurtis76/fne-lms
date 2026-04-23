// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// Mock the Supabase client + getApiUser so the helper never touches a real
// DB, but intentionally leave `lib/utils/meeting-policy` UNMOCKED so the
// real `canEditMeeting` runs against the policyInput we construct. This is
// the explicit F3 regression: with the old ordering, a non-admin facilitator
// hitting a concurrently-finalized (`completada`) meeting fell through the
// real `canEditMeeting` 403 branch before the `requireDraft` 409 branch
// could fire.
vi.mock('../../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res: any, message: string, status: number) => {
    res.status(status).json({ error: message });
  }),
  sendMeetingError: vi.fn((res: any, status: number, code: string, message: string, extra?: Record<string, unknown>) => {
    res.status(status).json({ ...(extra ?? {}), error: message, code });
  }),
}));

vi.mock('../../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-facilitator';

function buildClient(meetingRow: any) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'community_meetings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: meetingRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'meeting_attendees') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    }),
  };
}

describe('loadMeetingAuthContext — requireDraft reorder (F3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 meeting_not_draft (not 403) for a non-admin facilitator on a completada meeting', async () => {
    const { getApiUser, createServiceRoleClient } = await import(
      '../../../../lib/api-auth'
    );
    const { getUserRoles, getHighestRole } = await import(
      '../../../../utils/roleUtils'
    );
    const { loadMeetingAuthContext } = await import(
      '../../../../lib/api/meetings/load-context'
    );

    // Facilitator role — explicitly non-admin, non-consultor. The real
    // `canEditMeeting` denies this user when status is outside
    // EDITABLE_STATUSES (borrador/programada/en_progreso) — so the whole
    // point of this test is that we never get to `canEditMeeting` because
    // the requireDraft check fires first.
    (getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (getUserRoles as any).mockResolvedValue([
      { role_type: 'docente', is_active: true, community_id: null },
    ]);
    (getHighestRole as any).mockReturnValue('docente');

    (createServiceRoleClient as any).mockReturnValue(
      buildClient({
        id: MEETING_ID,
        status: 'completada',
        created_by: 'someone-else',
        facilitator_id: USER_ID, // would allow edit if status were draft
        secretary_id: null,
        workspace: { community_id: 'community-1' },
      }),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: {},
    });

    const ctx = await loadMeetingAuthContext(req as any, res as any, {
      meetingSelect: 'id, status, created_by, facilitator_id, secretary_id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)',
      require: 'edit',
      requireDraft: true,
    });

    expect(ctx).toBeNull();
    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('meeting_not_draft');
    // Crucially NOT 403 — before the reorder, the real canEditMeeting
    // would have denied the non-admin on status=completada and the client
    // could not distinguish "lost write race" from "you are forbidden".
    expect(res._getStatusCode()).not.toBe(403);
  });

  it('still grants the context when the same facilitator edits a borrador meeting (happy path)', async () => {
    const { getApiUser, createServiceRoleClient } = await import(
      '../../../../lib/api-auth'
    );
    const { getUserRoles, getHighestRole } = await import(
      '../../../../utils/roleUtils'
    );
    const { loadMeetingAuthContext } = await import(
      '../../../../lib/api/meetings/load-context'
    );

    (getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (getUserRoles as any).mockResolvedValue([
      { role_type: 'docente', is_active: true, community_id: null },
    ]);
    (getHighestRole as any).mockReturnValue('docente');

    (createServiceRoleClient as any).mockReturnValue(
      buildClient({
        id: MEETING_ID,
        status: 'borrador',
        created_by: 'someone-else',
        facilitator_id: USER_ID,
        secretary_id: null,
        workspace: { community_id: 'community-1' },
      }),
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: {},
    });

    const ctx = await loadMeetingAuthContext(req as any, res as any, {
      meetingSelect: 'id, status, created_by, facilitator_id, secretary_id, workspace:community_workspaces!community_meetings_workspace_id_fkey(community_id)',
      require: 'edit',
      requireDraft: true,
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.meeting).toBeDefined();
    expect(ctx?.workspace?.community_id).toBe('community-1');
  });
});
