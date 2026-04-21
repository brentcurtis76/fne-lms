// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/meetings/[id]/autosave';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

vi.mock('../../../lib/utils/meeting-policy', () => ({
  canEditMeeting: vi.fn(),
}));

vi.mock('../../../lib/tiptap/helpers', () => ({
  plainTextFromDoc: vi.fn(() => ''),
}));

const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-123';

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

describe('/api/meetings/[id]/autosave — draft gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 { error: "meeting_not_draft" } when status is not borrador', async () => {
    const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
    const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
    const { canEditMeeting } = await import('../../../lib/utils/meeting-policy');

    (getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (getUserRoles as any).mockResolvedValue(['facilitator']);
    (getHighestRole as any).mockReturnValue('facilitator');
    (canEditMeeting as any).mockReturnValue(true);

    (createServiceRoleClient as any).mockReturnValue(
      buildClient({
        id: MEETING_ID,
        status: 'en_progreso',
        created_by: USER_ID,
        facilitator_id: USER_ID,
        secretary_id: null,
        version: 0,
        updated_at: new Date().toISOString(),
        updated_by: USER_ID,
        workspace: { community_id: 'community-1' },
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { summary_doc: {}, notes_doc: {}, version: 0 },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData())).toEqual({ error: 'meeting_not_draft' });
  });

  it('allows autosave when status is borrador (passes draft gate)', async () => {
    const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
    const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
    const { canEditMeeting } = await import('../../../lib/utils/meeting-policy');

    (getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (getUserRoles as any).mockResolvedValue(['facilitator']);
    (getHighestRole as any).mockReturnValue('facilitator');
    (canEditMeeting as any).mockReturnValue(true);

    const updateChain = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: MEETING_ID,
                  version: 1,
                  updated_at: new Date().toISOString(),
                  updated_by: USER_ID,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: MEETING_ID,
              status: 'borrador',
              created_by: USER_ID,
              facilitator_id: USER_ID,
              secretary_id: null,
              version: 0,
              updated_at: new Date().toISOString(),
              updated_by: USER_ID,
              workspace: { community_id: 'community-1' },
            },
            error: null,
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'ws-1' }, error: null }),
        }),
      }),
    };

    (createServiceRoleClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'community_meetings') return updateChain;
        if (table === 'meeting_attendees') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'meeting_work_sessions') return updateChain;
        return updateChain;
      }),
    });

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { summary_doc: {}, notes_doc: {}, version: 0 },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.data.version).toBe(1);
  });
});
