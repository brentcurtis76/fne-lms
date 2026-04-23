// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/meetings/[id]/finalize';

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

vi.mock('../../../lib/emailService', () => ({
  sendMeetingSummary: vi.fn(),
}));

vi.mock('../../../lib/notificationService', () => ({
  default: {
    triggerNotification: vi.fn().mockResolvedValue({ success: true }),
  },
  getCommunityRecipients: vi.fn(),
}));

vi.mock('../../../lib/tiptap/render', () => ({
  docToHtml: vi.fn((doc) => (doc ? '<p>x</p>' : '')),
  EMAIL_PARAGRAPH_STYLE:
    'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 12px 0;',
  EMAIL_PARAGRAPH_TIGHT_STYLE:
    'font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333333; margin: 0 0 8px 0;',
  EMAIL_PARAGRAPH_COMPACT_STYLE:
    'font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #333333; margin: 0;',
}));

const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'user-123';

type BuildClientOpts = {
  meetingRow: any;
  attendees?: any[];
  updateResult?: any; // row returned by the atomic update (null => already finalized)
  commitments?: any[];
};

function buildClient({ meetingRow, attendees = [], updateResult, commitments = [] }: BuildClientOpts) {
  const updateMaybeSingle = vi.fn().mockResolvedValue({
    data: updateResult === undefined ? { id: MEETING_ID, finalized_at: new Date().toISOString() } : updateResult,
    error: null,
  });

  const meetingUpdateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: updateMaybeSingle,
        }),
      }),
    }),
  });

  const makeMeetingSelect = () => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: meetingRow, error: null }),
      }),
    }),
    update: meetingUpdateFn,
  });

  const simpleListSelect = (rows: any[]) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
        // also resolve when not ordered
        then: undefined,
      }),
    }),
  });

  return {
    __meetingUpdateFn: meetingUpdateFn,
    from: vi.fn((table: string) => {
      if (table === 'community_meetings') return makeMeetingSelect();
      if (table === 'meeting_attendees') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: attendees, error: null }),
          }),
        };
      }
      if (table === 'meeting_work_sessions') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'meeting_agreements') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'meeting_commitments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: commitments, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com' },
                error: null,
              }),
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

async function loadMocks() {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
  const { canFinalizeMeeting } = await import('../../../lib/utils/meeting-policy');
  const { sendMeetingSummary } = await import('../../../lib/emailService');
  const notifModule: any = await import('../../../lib/notificationService');
  const { getCommunityRecipients } = notifModule as any;
  const triggerNotification = notifModule.default.triggerNotification;
  return {
    getApiUser,
    createServiceRoleClient,
    getUserRoles,
    getHighestRole,
    canFinalizeMeeting,
    sendMeetingSummary,
    getCommunityRecipients,
    triggerNotification,
  };
}

const meetingRow = {
  id: MEETING_ID,
  title: 'Retro Q2',
  status: 'borrador',
  created_by: USER_ID,
  facilitator_id: USER_ID,
  secretary_id: null,
  meeting_date: '2026-04-20T16:00:00Z',
  summary_doc: { type: 'doc' },
  notes_doc: { type: 'doc' },
  finalized_at: null,
  workspace: {
    community_id: 'community-1',
    community: { id: 'community-1', name: 'Comunidad Alfa' },
  },
};

describe('/api/meetings/[id]/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user cannot finalize', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('docente');
    (m.canFinalizeMeeting as any).mockReturnValue(false);
    (m.createServiceRoleClient as any).mockReturnValue(buildClient({ meetingRow }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 409 with unified { error, code } shape when meeting is not in borrador', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.createServiceRoleClient as any).mockReturnValue(
      buildClient({ meetingRow: { ...meetingRow, status: 'completada' } })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({
      error: 'La reunión ya no está en borrador',
      code: 'meeting_not_draft',
    });
    expect(typeof body.error).toBe('string');
    expect(body.code).toBe('meeting_not_draft');
  });

  it('returns 409 with unified { error, code } shape when finalize loses the race', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    // updateResult = null → atomic UPDATE matched zero rows (another caller won)
    (m.createServiceRoleClient as any).mockReturnValue(
      buildClient({ meetingRow, updateResult: null })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({
      error: 'La reunión ya fue finalizada por otro usuario',
      code: 'meeting_already_finalized',
    });
    expect(body.code).toBe('meeting_already_finalized');
  });

  it('happy path — community audience returns sent count', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
      { id: 'u2', email: 'u2@example.com', name: 'U2' },
      { id: 'u3', email: 'u3@example.com', name: 'U3' },
    ]);
    (m.sendMeetingSummary as any).mockResolvedValue({ sent: 3, failed: 0, errors: [] });
    (m.createServiceRoleClient as any).mockReturnValue(buildClient({ meetingRow }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.data).toMatchObject({
      ok: true,
      recipients_count: 3,
      sent: 3,
      failed: 0,
    });
    // getCommunityRecipients should have been called with onlyAttended=false
    expect(m.getCommunityRecipients).toHaveBeenCalledWith(
      expect.anything(),
      MEETING_ID,
      { onlyAttended: false }
    );
    expect(m.triggerNotification).toHaveBeenCalledWith('meeting_finalized', expect.objectContaining({
      meeting_id: MEETING_ID,
      audience: 'community',
    }));
  });

  it('happy path — attended audience only includes attended users', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
    ]);
    (m.sendMeetingSummary as any).mockResolvedValue({ sent: 1, failed: 0, errors: [] });
    (m.createServiceRoleClient as any).mockReturnValue(buildClient({ meetingRow }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'attended' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(m.getCommunityRecipients).toHaveBeenCalledWith(
      expect.anything(),
      MEETING_ID,
      { onlyAttended: true }
    );
  });

  it('escapes user-controlled commitment_text in fallback commitmentsHtml (XSS regression)', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
    ]);
    (m.sendMeetingSummary as any).mockResolvedValue({ sent: 1, failed: 0, errors: [] });
    (m.createServiceRoleClient as any).mockReturnValue(
      buildClient({
        meetingRow,
        commitments: [
          {
            commitment_text: '<script>alert(1)</script>',
            commitment_doc: null,
            due_date: null,
            assigned_to_profile: null,
          },
        ],
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(m.sendMeetingSummary).toHaveBeenCalledTimes(1);
    const templateData = (m.sendMeetingSummary as any).mock.calls[0][0];
    expect(templateData.commitmentsHtml).toContain('&lt;script&gt;');
    expect(templateData.commitmentsHtml).not.toContain('<script>');
  });

  it('bumps version on the atomic update to invalidate in-flight autosave tokens', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([]);
    (m.sendMeetingSummary as any).mockResolvedValue({ sent: 0, failed: 0, errors: [] });

    const client = buildClient({ meetingRow: { ...meetingRow, version: 4 } });
    (m.createServiceRoleClient as any).mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const updateArgs = (client as any).__meetingUpdateFn.mock.calls[0][0];
    expect(updateArgs).toMatchObject({
      status: 'completada',
      version: 5,
    });
  });

  it('falls back to plain summary/notes text when rich *_doc is empty', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
    ]);
    (m.sendMeetingSummary as any).mockResolvedValue({ sent: 1, failed: 0, errors: [] });
    (m.createServiceRoleClient as any).mockReturnValue(
      buildClient({
        meetingRow: {
          ...meetingRow,
          summary: 'Plain <b>summary</b> text',
          summary_doc: null,
          notes: 'Plain notes',
          notes_doc: null,
        },
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const templateData = (m.sendMeetingSummary as any).mock.calls[0][0];
    expect(templateData.summaryHtml).toContain('Plain &lt;b&gt;summary&lt;/b&gt; text');
    expect(templateData.summaryHtml).toMatch(/^<p style="[^"]+">/);
    expect(templateData.notesHtml).toContain('Plain notes');
    expect(templateData.notesHtml).toMatch(/^<p style="[^"]+">/);
  });

  it('rich summary/notes doc wins over stale plain text', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
    ]);
    (m.sendMeetingSummary as any).mockResolvedValue({ sent: 1, failed: 0, errors: [] });
    (m.createServiceRoleClient as any).mockReturnValue(
      buildClient({
        meetingRow: {
          ...meetingRow,
          summary: 'STALE_PLAIN_SUMMARY',
          summary_doc: { type: 'doc' },
          notes: 'STALE_PLAIN_NOTES',
          notes_doc: { type: 'doc' },
        },
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const templateData = (m.sendMeetingSummary as any).mock.calls[0][0];
    // The render.ts mock returns '<p>x</p>' when a truthy doc is provided.
    expect(templateData.summaryHtml).toBe('<p>x</p>');
    expect(templateData.notesHtml).toBe('<p>x</p>');
    expect(templateData.summaryHtml).not.toContain('STALE_PLAIN_SUMMARY');
    expect(templateData.notesHtml).not.toContain('STALE_PLAIN_NOTES');
  });

  it('returns 200 with summary_email_sent=false when email dispatch throws (DB already committed)', async () => {
    // F2 regression — before the fix, a thrown email error surfaced as 500
    // even though the meeting row was already `status='completada'`. The
    // client then retried and hit `meeting_already_finalized`, masking the
    // orphan-email state. Now the DB commit is the point-of-no-return and
    // the email call is wrapped in its own try/catch with a warning field.
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
    ]);
    (m.sendMeetingSummary as any).mockRejectedValue(new Error('resend_outage'));
    (m.createServiceRoleClient as any).mockReturnValue(buildClient({ meetingRow }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.data).toMatchObject({
      ok: true,
      summary_email_sent: false,
      summary_email_error: 'resend_outage',
      recipients_count: 1,
    });
    // meeting_finalized notification still fires — commitments still need
    // in-app notifications even if the summary email failed.
    expect(m.triggerNotification).toHaveBeenCalledWith(
      'meeting_finalized',
      expect.objectContaining({ meeting_id: MEETING_ID }),
    );
  });

  it('reports partial failure without aborting when one recipient send fails', async () => {
    const m = await loadMocks();
    (m.getApiUser as any).mockResolvedValue({ user: { id: USER_ID }, error: null });
    (m.getUserRoles as any).mockResolvedValue([]);
    (m.getHighestRole as any).mockReturnValue('admin');
    (m.canFinalizeMeeting as any).mockReturnValue(true);
    (m.getCommunityRecipients as any).mockResolvedValue([
      { id: 'u1', email: 'u1@example.com', name: 'U1' },
      { id: 'u2', email: 'bad@example.com', name: 'U2' },
    ]);
    (m.sendMeetingSummary as any).mockResolvedValue({
      sent: 1,
      failed: 1,
      errors: [{ email: 'bad@example.com', error: 'provider_fail' }],
    });
    (m.createServiceRoleClient as any).mockReturnValue(buildClient({ meetingRow }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: MEETING_ID },
      body: { audience: 'community' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.data).toMatchObject({ ok: true, sent: 1, failed: 1, recipients_count: 2 });
  });
});
