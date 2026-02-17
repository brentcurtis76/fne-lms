// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { NOTIFICATION_EVENTS } from '../../../lib/notificationEvents';

// Use vi.hoisted so the mock fn is available during vi.mock hoisting
const { mockTriggerNotification } = vi.hoisted(() => ({
  mockTriggerNotification: vi.fn().mockResolvedValue({ success: true, notificationsCreated: 1 }),
}));

vi.mock('../../../lib/notificationService', () => ({
  default: {
    triggerNotification: mockTriggerNotification,
  },
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: vi.fn(),
    checkIsAdmin: vi.fn(),
    createServiceRoleClient: vi.fn(),
  };
});
vi.mock('../../../utils/roleUtils');

// Mock session-timezone so cron time-window checks are deterministic
const { mockGetHoursUntilSession } = vi.hoisted(() => ({
  mockGetHoursUntilSession: vi.fn().mockReturnValue(24),
}));

vi.mock('../../../lib/utils/session-timezone', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getHoursUntilSession: mockGetHoursUntilSession,
  };
});

// Import handlers AFTER mocks are set up
import editRequestsHandler from '../../../pages/api/sessions/[id]/edit-requests';
import editRequestDetailHandler from '../../../pages/api/sessions/edit-requests/[eid]';
import cronHandler from '../../../pages/api/cron/session-reminders';

// Valid UUIDs for test data
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const FACILITATOR_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID_1 = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID_2 = '44444444-4444-4444-8444-444444444444';
const EDIT_REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const FACILITATOR_LINK_ID = '66666666-6666-4666-8666-666666666666';

describe('Session Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Event Registration', () => {
    it('should register all 5 session event types with category sessions', () => {
      const sessionEventTypes = [
        'session_edit_request_submitted',
        'session_edit_request_approved',
        'session_edit_request_rejected',
        'session_reminder_24h',
        'session_reminder_1h',
      ] as const;

      for (const eventType of sessionEventTypes) {
        expect(NOTIFICATION_EVENTS).toHaveProperty(eventType);
        expect(NOTIFICATION_EVENTS[eventType].category).toBe('sessions');
      }
    });

    it('should have correct importance levels for session events', () => {
      expect(NOTIFICATION_EVENTS.session_edit_request_submitted.importance).toBe('high');
      expect(NOTIFICATION_EVENTS.session_edit_request_approved.importance).toBe('normal');
      expect(NOTIFICATION_EVENTS.session_edit_request_rejected.importance).toBe('normal');
      expect(NOTIFICATION_EVENTS.session_reminder_24h.importance).toBe('normal');
      expect(NOTIFICATION_EVENTS.session_reminder_1h.importance).toBe('high');
    });
  });

  describe('Edit Request Submitted Notification', () => {
    it('should trigger notification when edit request is submitted', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      const mockUser = {
        id: FACILITATOR_ID,
        email: 'facilitator@example.com',
        user_metadata: { first_name: 'John', last_name: 'Doe' },
      };

      const mockSession = {
        id: SESSION_ID,
        title: 'Test Session',
        status: 'programada',
        session_date: '2026-02-15',
        start_time: '09:00:00',
        end_time: '12:00:00',
        growth_community_id: null,
        school_id: null,
        modality: 'presencial',
      };

      const mockAdmins = [{ id: ADMIN_ID_1 }, { id: ADMIN_ID_2 }];

      vi.mocked(getApiUser).mockResolvedValue({ user: mockUser, error: null } as any);

      const mockSupabaseClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: FACILITATOR_LINK_ID }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_edit_requests') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: EDIT_REQUEST_ID, session_id: SESSION_ID, requested_by: FACILITATOR_ID },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_activity_log') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: mockAdmins, error: null }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }) as any,
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseClient as any);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: SESSION_ID },
        body: {
          changes: { session_date: { old: '2026-02-15', new: '2026-02-16' } },
          reason: 'Conflict in schedule',
        },
      });

      await editRequestsHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(201);
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        'session_edit_request_submitted',
        expect.objectContaining({
          session: expect.objectContaining({ id: SESSION_ID }),
          admin_user_ids: [ADMIN_ID_1, ADMIN_ID_2],
        })
      );
    });
  });

  describe('Edit Request Approved Notification', () => {
    it('should trigger notification when edit request is approved', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      const mockAdminUser = { id: ADMIN_ID_1, email: 'admin@example.com' };

      const mockEditRequest = {
        id: EDIT_REQUEST_ID,
        session_id: SESSION_ID,
        requested_by: FACILITATOR_ID,
        status: 'pending',
        changes: { session_date: { old: '2026-02-15', new: '2026-02-16' } },
        consultor_sessions: { title: 'Test Session' },
      };

      const mockSession = {
        id: SESSION_ID,
        title: 'Test Session',
        session_date: '2026-02-15',
      };

      vi.mocked(checkIsAdmin).mockResolvedValue({ isAdmin: true, user: mockAdminUser, error: null } as any);

      const mockSupabaseClient = {
        from: vi.fn((table: string) => {
          if (table === 'session_edit_requests') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockEditRequest, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { ...mockEditRequest, status: 'approved' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'session_activity_log') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }) as any,
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseClient as any);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: EDIT_REQUEST_ID },
        body: { action: 'approve', review_notes: 'Approved' },
      });

      await editRequestDetailHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        'session_edit_request_approved',
        expect.objectContaining({
          requester_id: FACILITATOR_ID,
          review_notes: 'Approved',
        })
      );
    });
  });

  describe('Edit Request Rejected Notification', () => {
    it('should trigger notification when edit request is rejected', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      const mockAdminUser = { id: ADMIN_ID_1, email: 'admin@example.com' };

      const mockEditRequest = {
        id: EDIT_REQUEST_ID,
        session_id: SESSION_ID,
        requested_by: FACILITATOR_ID,
        status: 'pending',
        changes: { session_date: { old: '2026-02-15', new: '2026-02-16' } },
        consultor_sessions: { title: 'Test Session' },
      };

      vi.mocked(checkIsAdmin).mockResolvedValue({ isAdmin: true, user: mockAdminUser, error: null } as any);

      const mockSupabaseClient = {
        from: vi.fn((table: string) => {
          if (table === 'session_edit_requests') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockEditRequest, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { ...mockEditRequest, status: 'rejected' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_activity_log') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }) as any,
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseClient as any);

      const { req, res } = createMocks({
        method: 'PUT',
        query: { eid: EDIT_REQUEST_ID },
        body: { action: 'reject', review_notes: 'Not approved due to conflicts' },
      });

      await editRequestDetailHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        'session_edit_request_rejected',
        expect.objectContaining({
          requester_id: FACILITATOR_ID,
          review_notes: 'Not approved due to conflicts',
        })
      );
    });
  });

  describe('Session Reminder Cron', () => {
    it('should reject requests without valid CRON_API_KEY', async () => {
      const originalKey = process.env.CRON_API_KEY;
      process.env.CRON_API_KEY = 'secret-key';

      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-cron-key': 'wrong-key' },
      });

      await cronHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData()).toEqual({ error: 'Unauthorized' });

      process.env.CRON_API_KEY = originalKey;
    });

    it('should send 24h reminders for sessions 24h away', async () => {
      const { createServiceRoleClient } = await import('../../../lib/api-auth');

      // Mock getHoursUntilSession to return 24 (within 23-25 window)
      mockGetHoursUntilSession.mockReturnValue(24);

      const mockSessions = [
        {
          id: SESSION_ID,
          title: 'Test Session',
          session_date: '2026-02-18',
          start_time: '10:00:00',
          end_time: '16:00:00',
          modality: 'online',
          meeting_link: 'https://zoom.us/j/123',
          session_facilitators: [{ user_id: FACILITATOR_ID }],
          session_attendees: [{ user_id: ADMIN_ID_1 }],
        },
      ];

      const mockSupabaseClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      lte: vi.fn().mockResolvedValue({ data: mockSessions, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_notifications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }) as any,
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseClient as any);

      const originalKey = process.env.CRON_API_KEY;
      process.env.CRON_API_KEY = 'test-key';

      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-cron-key': 'test-key' },
      });

      await cronHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        'session_reminder_24h',
        expect.objectContaining({
          session: expect.objectContaining({ id: SESSION_ID }),
        })
      );

      process.env.CRON_API_KEY = originalKey;
    });

    it('should send 1h reminders for sessions 1h away', async () => {
      const { createServiceRoleClient } = await import('../../../lib/api-auth');

      // Mock getHoursUntilSession to return 1 (within 0.5-1.5 window)
      mockGetHoursUntilSession.mockReturnValue(1);

      const SESSION_ID_2 = '77777777-7777-4777-8777-777777777777';

      const mockSessions = [
        {
          id: SESSION_ID_2,
          title: 'Urgent Session',
          session_date: '2026-02-17',
          start_time: '11:00:00',
          end_time: '16:00:00',
          modality: 'online',
          meeting_link: 'https://zoom.us/j/456',
          session_facilitators: [{ user_id: FACILITATOR_ID }],
          session_attendees: [{ user_id: ADMIN_ID_2 }],
        },
      ];

      const mockSupabaseClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      lte: vi.fn().mockResolvedValue({ data: mockSessions, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_notifications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }) as any,
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseClient as any);

      const originalKey = process.env.CRON_API_KEY;
      process.env.CRON_API_KEY = 'test-key';

      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-cron-key': 'test-key' },
      });

      await cronHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTriggerNotification).toHaveBeenCalledWith(
        'session_reminder_1h',
        expect.objectContaining({
          session: expect.objectContaining({ id: SESSION_ID_2 }),
        })
      );

      process.env.CRON_API_KEY = originalKey;
    });

    it('should not send duplicate reminders', async () => {
      const { createServiceRoleClient } = await import('../../../lib/api-auth');

      // Mock getHoursUntilSession to return 24 (within 23-25 window)
      mockGetHoursUntilSession.mockReturnValue(24);

      const SESSION_ID_3 = '88888888-8888-4888-8888-888888888888';

      const mockSessions = [
        {
          id: SESSION_ID_3,
          title: 'Already Reminded',
          session_date: '2026-02-18',
          start_time: '10:00:00',
          end_time: '16:00:00',
          modality: 'online',
          meeting_link: null,
          session_facilitators: [{ user_id: FACILITATOR_ID }],
          session_attendees: [],
        },
      ];

      const mockSupabaseClient = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      lte: vi.fn().mockResolvedValue({ data: mockSessions, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_notifications') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-reminder' }], error: null }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
        }) as any,
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabaseClient as any);

      const originalKey = process.env.CRON_API_KEY;
      process.env.CRON_API_KEY = 'test-key';

      const { req, res } = createMocks({
        method: 'POST',
        headers: { 'x-cron-key': 'test-key' },
      });

      mockTriggerNotification.mockClear();

      await cronHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.reminders24h).toBe(0);
      expect(mockTriggerNotification).not.toHaveBeenCalledWith('session_reminder_24h', expect.anything());

      process.env.CRON_API_KEY = originalKey;
    });
  });
});
