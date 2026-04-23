// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/meetings/[id]/work-session/start';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendMeetingError: vi.fn((res, status, code, message, extra) => {
    res.status(status).json({ ...(extra ?? {}), error: message, code });
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
  MEETING_STATUS: {
    BORRADOR: 'borrador',
    PROGRAMADA: 'programada',
    EN_PROGRESO: 'en_progreso',
    COMPLETADA: 'completada',
    CANCELADA: 'cancelada',
    POSPUESTA: 'pospuesta',
  },
}));

const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-123';

function buildClient(meetingRow: any, insertResult: any = { data: { id: 'ws-1' }, error: null }) {
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
      if (table === 'meeting_work_sessions') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(insertResult),
            }),
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

describe('/api/meetings/[id]/work-session/start — draft gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 with unified { error, code: "meeting_not_draft" } shape when status is not borrador', async () => {
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
        workspace: { community_id: 'community-1' },
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: {},
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('meeting_not_draft');
    expect(typeof body.error).toBe('string');
    expect(body.error).not.toBe('meeting_not_draft'); // must be a human message, not the code
  });

  it('allows start when status is borrador (passes draft gate)', async () => {
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
        status: 'borrador',
        created_by: USER_ID,
        facilitator_id: USER_ID,
        secretary_id: null,
        workspace: { community_id: 'community-1' },
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: {},
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    const payload = JSON.parse(res._getData());
    expect(payload.data.id).toBe('ws-1');
  });
});
