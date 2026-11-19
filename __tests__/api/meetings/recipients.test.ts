// @vitest-environment node
// GENERA fixes F18c, EC-R7: the recipients preview also says how many attendee
// rows are marked 'attended', as a number only, so the finalize dialog can
// refuse «Solo los asistentes» while nobody attended. Mocks follow the form of
// finalize.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/meetings/[id]/recipients';

const verifiedEditorMock = vi.hoisted(() => ({ isVerifiedMeetingEditor: vi.fn(async () => true) }));
vi.mock('../../../lib/api/meetings/verified-editor', () => verifiedEditorMock);

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  sendMeetingError: vi.fn((res, status, code, message, extra) => {
    res.status(status).json({ ...(extra ?? {}), error: message, code });
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
  canFinalizeMeeting: vi.fn(),
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

vi.mock('../../../lib/notificationService', () => ({
  getCommunityRecipients: vi.fn(),
}));

const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-123';

const meetingRow = {
  id: MEETING_ID,
  status: 'borrador',
  created_by: USER_ID,
  facilitator_id: USER_ID,
  secretary_id: null,
  workspace: { community_id: 'community-1' },
};

function buildClient(attendees: any[]) {
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
            eq: vi.fn().mockResolvedValue({ data: attendees, error: null }),
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

async function loadMocks() {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
  const { canFinalizeMeeting } = await import('../../../lib/utils/meeting-policy');
  const { getCommunityRecipients } = (await import('../../../lib/notificationService')) as any;
  return { getApiUser, createServiceRoleClient, getUserRoles, getHighestRole, canFinalizeMeeting, getCommunityRecipients };
}

async function preview(opts: { attendees: any[]; audience?: string; canFinalize?: boolean }) {
  const m = await loadMocks();
  (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
  (m.getUserRoles as any).mockResolvedValue([]);
  (m.getHighestRole as any).mockReturnValue(opts.canFinalize === false ? 'docente' : 'admin');
  (m.canFinalizeMeeting as any).mockReturnValue(opts.canFinalize !== false);
  (m.getCommunityRecipients as any).mockResolvedValue([
    { id: 'u1', email: 'u1@example.com', name: 'U1' },
    { id: 'u2', email: 'u2@example.com', name: 'U2' },
    { id: 'u3', email: 'u3@example.com', name: 'U3' },
  ]);
  (m.createServiceRoleClient as any).mockReturnValue(buildClient(opts.attendees));
  const { req, res } = createMocks({
    method: 'GET',
    query: { id: MEETING_ID, audience: opts.audience ?? 'with_access' },
  });
  await handler(req as any, res as any);
  return { m, res };
}

describe('/api/meetings/[id]/recipients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers attended_count 0 when nobody is marked as attending', async () => {
    const { res } = await preview({
      attendees: [
        { user_id: 'u1', role: 'participant', attendance_status: 'invited' },
        { user_id: 'u2', role: 'participant', attendance_status: 'absent' },
      ],
    });
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { count: 3, attended_count: 0 } });
  });

  it('answers attended_count 2 with two attendee rows marked attended, numbers only', async () => {
    const { res } = await preview({
      audience: 'attended',
      attendees: [
        { user_id: 'u1', role: 'participant', attendance_status: 'attended' },
        { user_id: 'u2', role: 'participant', attendance_status: 'attended' },
        { user_id: 'u3', role: 'participant', attendance_status: 'invited' },
      ],
    });
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({ data: { count: 3, attended_count: 2 } });
    expect(JSON.stringify(body)).not.toMatch(/u1|u2|u3|@/);
  });

  it('refuses a caller without rights as today (403), with no count', async () => {
    const { m, res } = await preview({ attendees: [], canFinalize: false });
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).not.toHaveProperty('data');
    expect(m.getCommunityRecipients).not.toHaveBeenCalled();
  });

  it('refuses an unknown audience as today (400)', async () => {
    const { res } = await preview({ attendees: [], audience: 'community' });
    expect(res._getStatusCode()).toBe(400);
  });
});
