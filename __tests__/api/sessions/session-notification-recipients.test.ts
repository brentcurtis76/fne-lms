// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockTriggerNotification } = vi.hoisted(() => ({
  mockTriggerNotification: vi.fn().mockResolvedValue({ success: true, notificationsCreated: 1 }),
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: mockTriggerNotification },
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: vi.fn(),
    checkIsAdmin: vi.fn(),
    createServiceRoleClient: vi.fn(),
  };
});

vi.mock('../../../utils/roleUtils');

vi.mock('../../../lib/services/hour-tracking', () => ({
  completeReservation: vi.fn().mockResolvedValue({ success: true }),
  executeCancellation: vi.fn().mockResolvedValue({ success: true, clause_result: null }),
  evaluateCancellationClause: vi.fn().mockReturnValue(null),
  calculateNoticeHours: vi.fn().mockReturnValue(48),
}));

import editRequestsHandler from '../../../pages/api/sessions/[id]/edit-requests';
import cancelHandler from '../../../pages/api/sessions/[id]/cancel';
import finalizeHandler from '../../../pages/api/sessions/[id]/finalize';

const SESSION_ID = '99999999-9999-4999-8999-999999999999';
const SESSION_SCHOOL_ID = 7;
const SESSION_GC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FACILITATOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ADMIN_ACTIVE_A = '10000000-0000-4000-8000-000000000001';
const ADMIN_ACTIVE_B = '10000000-0000-4000-8000-000000000002';
const ADMIN_INACTIVE = '10000000-0000-4000-8000-000000000003';
const CONSULTOR_AT_SCHOOL = '20000000-0000-4000-8000-000000000001';
const CONSULTOR_OTHER_SCHOOL = '20000000-0000-4000-8000-000000000002';
const LIDER_AT_GC = '30000000-0000-4000-8000-000000000001';
const LIDER_OTHER_GC = '30000000-0000-4000-8000-000000000002';
const DOCENTE_ID = '40000000-0000-4000-8000-000000000001';

type SessionRow = {
  id: string;
  title: string;
  status: string;
  school_id: number;
  growth_community_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: string;
  hour_type_key: string | null;
  contrato_id: string | null;
  is_active: boolean;
};

function baseSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    title: 'Test Session',
    status: 'programada',
    school_id: SESSION_SCHOOL_ID,
    growth_community_id: SESSION_GC_ID,
    session_date: '2026-05-01',
    start_time: '09:00:00',
    end_time: '11:00:00',
    modality: 'presencial',
    hour_type_key: null,
    contrato_id: null,
    is_active: true,
    ...overrides,
  };
}

/**
 * A mixed user_roles fixture used to validate no leakage:
 * only active admins should ever be included in admin_user_ids,
 * and the mock supabase filter mimics .eq('role_type','admin').eq('is_active',true).
 */
const MIXED_USER_ROLES = [
  { user_id: ADMIN_ACTIVE_A, role_type: 'admin', is_active: true, school_id: null, community_id: null },
  { user_id: ADMIN_ACTIVE_B, role_type: 'admin', is_active: true, school_id: null, community_id: null },
  { user_id: ADMIN_INACTIVE, role_type: 'admin', is_active: false, school_id: null, community_id: null },
  { user_id: CONSULTOR_AT_SCHOOL, role_type: 'consultor', is_active: true, school_id: SESSION_SCHOOL_ID, community_id: null },
  { user_id: CONSULTOR_OTHER_SCHOOL, role_type: 'consultor', is_active: true, school_id: 999, community_id: null },
  { user_id: LIDER_AT_GC, role_type: 'lider_comunidad', is_active: true, school_id: null, community_id: SESSION_GC_ID },
  { user_id: LIDER_OTHER_GC, role_type: 'lider_comunidad', is_active: true, school_id: null, community_id: 'other-gc' },
  { user_id: DOCENTE_ID, role_type: 'docente', is_active: true, school_id: SESSION_SCHOOL_ID, community_id: null },
];

function filterUserRoles(filters: Record<string, any>): Array<{ user_id: string }> {
  return MIXED_USER_ROLES.filter((r: any) =>
    Object.entries(filters).every(([k, v]) => r[k] === v)
  ).map((r) => ({ user_id: r.user_id }));
}

describe('Session notification recipients — no leakage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('edit-request submission fans out to active admins only', () => {
    it('admin_user_ids contains only active admins — no consultor, lider_comunidad, or docente leakage', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');

      vi.mocked(getApiUser).mockResolvedValue({
        user: {
          id: FACILITATOR_ID,
          email: 'fac@example.com',
          user_metadata: { first_name: 'Fa', last_name: 'Ci' },
        },
        error: null,
      } as any);

      const session = baseSession();
      const capturedUserRolesFilters: Record<string, any> = {};

      const client = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: session, error: null }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: 'fac-link' }, error: null }),
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
                    data: { id: 'er-1', session_id: SESSION_ID, requested_by: FACILITATOR_ID },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'session_activity_log') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          if (table === 'user_roles') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn((col: string, val: any) => {
                  capturedUserRolesFilters[col] = val;
                  return {
                    eq: vi.fn((col2: string, val2: any) => {
                      capturedUserRolesFilters[col2] = val2;
                      return Promise.resolve({
                        data: filterUserRoles(capturedUserRolesFilters),
                        error: null,
                      });
                    }),
                  };
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(client as any);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: SESSION_ID },
        body: {
          changes: { session_date: { old: '2026-05-01', new: '2026-05-02' } },
          reason: 'Reschedule',
        },
      });

      await editRequestsHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(201);
      expect(capturedUserRolesFilters).toMatchObject({
        role_type: 'admin',
        is_active: true,
      });

      expect(mockTriggerNotification).toHaveBeenCalledTimes(1);
      const [eventType, payload] = mockTriggerNotification.mock.calls[0];
      expect(eventType).toBe('session_edit_request_submitted');

      const adminIds = payload.admin_user_ids as string[];
      expect(new Set(adminIds)).toEqual(new Set([ADMIN_ACTIVE_A, ADMIN_ACTIVE_B]));

      // No leakage of inactive admins, consultors, lider_comunidad or docente
      expect(adminIds).not.toContain(ADMIN_INACTIVE);
      expect(adminIds).not.toContain(CONSULTOR_AT_SCHOOL);
      expect(adminIds).not.toContain(CONSULTOR_OTHER_SCHOOL);
      expect(adminIds).not.toContain(LIDER_AT_GC);
      expect(adminIds).not.toContain(LIDER_OTHER_GC);
      expect(adminIds).not.toContain(DOCENTE_ID);

      // Session payload itself should expose only the session id/title — no PII about users
      expect(payload.session).toMatchObject({ id: SESSION_ID, title: 'Test Session' });
      expect(payload.session).not.toHaveProperty('school_id');
      expect(payload.session).not.toHaveProperty('growth_community_id');
    });
  });

  describe('session cancel — no stale reminder leakage', () => {
    it('cancelling a programada session marks pending session_notifications as cancelled and fires no lifecycle notification', async () => {
      const { checkIsAdmin, createServiceRoleClient } = await import('../../../lib/api-auth');

      vi.mocked(checkIsAdmin).mockResolvedValue({
        isAdmin: true,
        user: { id: ADMIN_ACTIVE_A },
        error: null,
      } as any);

      const session = baseSession();
      const notificationUpdateFilters: Record<string, any> = {};

      const client = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: session, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...session, status: 'cancelada' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_notifications') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn((col: string, val: any) => {
                  notificationUpdateFilters[col] = val;
                  return {
                    eq: vi.fn((col2: string, val2: any) => {
                      notificationUpdateFilters[col2] = val2;
                      return Promise.resolve({ error: null });
                    }),
                  };
                }),
              }),
            };
          }
          if (table === 'session_activity_log') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(client as any);

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: SESSION_ID },
        body: { cancellation_reason: 'No longer needed' },
      });

      await cancelHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      // Ensure scheduled reminders are scoped to this session and dropped before recipients ever receive them
      expect(notificationUpdateFilters).toMatchObject({
        session_id: SESSION_ID,
        status: 'scheduled',
      });

      // No lifecycle notification fires on cancel today — keep this contract explicit
      expect(mockTriggerNotification).not.toHaveBeenCalled();
    });
  });

  describe('session finalize — no lifecycle notification leak', () => {
    it('finalizing a session does not fan out notifications to unrelated users', async () => {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      vi.mocked(getApiUser).mockResolvedValue({
        user: { id: FACILITATOR_ID },
        error: null,
      } as any);

      const session = {
        ...baseSession({ status: 'pendiente_informe' }),
        reports: [{ id: 'rep-1', report_type: 'session_report' }],
        attendees: [{ attended: true }, { attended: false }],
        actual_duration_minutes: null,
        scheduled_duration_minutes: 120,
      };

      const client = {
        from: vi.fn((table: string) => {
          if (table === 'consultor_sessions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: session, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...session, status: 'completada' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_facilitators') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: { id: 'fac-link' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'session_activity_log') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };

      vi.mocked(createServiceRoleClient).mockReturnValue(client as any);
      (getUserRoles as any).mockResolvedValue([
        { role_type: 'consultor', is_active: true, school_id: SESSION_SCHOOL_ID, community_id: null },
      ]);
      (getHighestRole as any).mockReturnValue('consultor');

      const { req, res } = createMocks({
        method: 'POST',
        query: { id: SESSION_ID },
      });

      await finalizeHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTriggerNotification).not.toHaveBeenCalled();
    });
  });

  describe('role-scoped recipient filter helpers', () => {
    it('only active admins are returned from the admin user_roles query', () => {
      const result = filterUserRoles({ role_type: 'admin', is_active: true });
      expect(result.map((r) => r.user_id).sort()).toEqual(
        [ADMIN_ACTIVE_A, ADMIN_ACTIVE_B].sort()
      );
    });

    it('active consultors at the session school are isolated — no other schools leak', () => {
      const result = filterUserRoles({
        role_type: 'consultor',
        is_active: true,
        school_id: SESSION_SCHOOL_ID,
      });
      expect(result.map((r) => r.user_id)).toEqual([CONSULTOR_AT_SCHOOL]);
    });

    it('active lider_comunidad of session GC are isolated — other GCs do not leak', () => {
      const result = filterUserRoles({
        role_type: 'lider_comunidad',
        is_active: true,
        community_id: SESSION_GC_ID,
      });
      expect(result.map((r) => r.user_id)).toEqual([LIDER_AT_GC]);
    });

    it('docentes are never pulled via admin/consultor/lider recipient queries', () => {
      expect(filterUserRoles({ role_type: 'admin', is_active: true }).map((r) => r.user_id))
        .not.toContain(DOCENTE_ID);
      expect(
        filterUserRoles({ role_type: 'consultor', is_active: true, school_id: SESSION_SCHOOL_ID })
          .map((r) => r.user_id)
      ).not.toContain(DOCENTE_ID);
      expect(
        filterUserRoles({
          role_type: 'lider_comunidad',
          is_active: true,
          community_id: SESSION_GC_ID,
        }).map((r) => r.user_id)
      ).not.toContain(DOCENTE_ID);
    });
  });
});
