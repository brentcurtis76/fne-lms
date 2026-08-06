// @vitest-environment node
/**
 * Z2-4a [A1]–[A6] — the three session lifecycle notifications.
 *
 * `session_created`, `session_rescheduled` and `session_cancelled` were declared types
 * with no registry config and no emitter, so a reschedule notified nobody. These tests
 * assert the registry, the recipient derivation, the disclosure invariant and the
 * never-fail-the-request guarantee THROUGH the six real handlers.
 *
 * Only the notification service, the Zoom queue and the hour-tracking writes are faked.
 * The registry, the helper, the recipient union and the changed-fields comparison are
 * all the real thing, so a change to any of them shows up here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID_2 = '66666666-6666-4666-8666-666666666666';
const EDIT_REQUEST_ID = '99999999-9999-4999-8999-999999999999';
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** A user who is BOTH a facilitator and an attendee — must be notified exactly once. */
const BOTH_ID = '22222222-2222-4222-8222-222222222222';
const FACILITATOR_ONLY_ID = '33333333-3333-4333-8333-333333333333';
const ATTENDEE_ONLY_ID = '44444444-4444-4444-8444-444444444444';

/**
 * A passcode-bearing raw link, synthetic. The [A4] assertion is only meaningful if this
 * string is distinctive enough that its absence from a payload proves something.
 */
const RAW_MEETING_LINK =
  'https://us06web.zoom.us/j/98765432101?pwd=SyNtHeTiCpAsScOdE0000';

const {
  mockTriggerNotification,
  mockCheckIsAdmin,
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockGetUserRoles,
  mockGetHighestRole,
  mockValidateFacilitatorIntegrity,
  mockCreateReservation,
  mockExecuteCancellation,
  mockSyncRescheduleHours,
} = vi.hoisted(() => ({
  mockTriggerNotification: vi.fn(),
  mockCheckIsAdmin: vi.fn(),
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
  mockValidateFacilitatorIntegrity: vi.fn(),
  mockCreateReservation: vi.fn(),
  mockExecuteCancellation: vi.fn(),
  mockSyncRescheduleHours: vi.fn(),
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: mockTriggerNotification },
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getUserRoles: mockGetUserRoles, getHighestRole: mockGetHighestRole };
});

vi.mock('../../../lib/utils/facilitator-validation', () => ({
  validateFacilitatorIntegrity: mockValidateFacilitatorIntegrity,
}));

// `isDurationRelevantChange` stays REAL — it gates the reschedule paths.
vi.mock('../../../lib/services/hour-tracking', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createReservation: mockCreateReservation,
    executeCancellation: mockExecuteCancellation,
    syncRescheduleHours: mockSyncRescheduleHours,
  };
});

vi.mock('../../../lib/zoom/provisioning-intent', () => ({
  enqueueSessionProvision: vi.fn(),
  enqueueSessionMeetingDelete: vi.fn(),
  enqueueSessionMeetingSync: vi.fn(),
}));

import { getEventConfig, hasEventConfig } from '../../../lib/notificationEvents';
import approveHandler from '../../../pages/api/sessions/[id]/approve';
import bulkApproveHandler from '../../../pages/api/sessions/bulk-approve';
import sessionDetailHandler from '../../../pages/api/sessions/[id]/index';
import editRequestHandler from '../../../pages/api/sessions/edit-requests/[eid]';
import cancelHandler from '../../../pages/api/sessions/[id]/cancel';
import seriesCancelHandler from '../../../pages/api/sessions/series/[groupId]/cancel';

// ---------------------------------------------------------------------------
// Fixtures + a fake Supabase client good enough for all six routes
// ---------------------------------------------------------------------------

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    title: 'Sesión de acompañamiento',
    status: 'programada',
    is_active: true,
    school_id: 77,
    growth_community_id: null,
    session_date: '2026-09-14',
    start_time: '09:00:00',
    end_time: '10:30:00',
    modality: 'online',
    meeting_link: RAW_MEETING_LINK,
    meeting_provider: 'zoom',
    is_zoom_managed: true,
    hour_type_key: null,
    contrato_id: null,
    scheduled_duration_minutes: 90,
    ...overrides,
  };
}

interface ClientState {
  sessions: Record<string, unknown>[];
  facilitators: { user_id: string }[];
  attendees: { user_id: string }[];
  editRequest: Record<string, unknown> | null;
  /** Every `update()` payload, in order, keyed by table. */
  updates: { table: string; payload: Record<string, unknown> }[];
}

function makeState(overrides: Partial<ClientState> = {}): ClientState {
  return {
    sessions: [baseSession()],
    facilitators: [{ user_id: BOTH_ID }, { user_id: FACILITATOR_ONLY_ID }],
    attendees: [{ user_id: BOTH_ID }, { user_id: ATTENDEE_ONLY_ID }],
    editRequest: null,
    updates: [],
    ...overrides,
  };
}

/**
 * A chainable, thenable query builder. Every route in this file selects, filters and
 * then either awaits the builder or calls `.single()`/`.maybeSingle()`.
 */
function createClient(state: ClientState) {
  function builder(table: string) {
    let kind: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let payload: Record<string, unknown> = {};

    const rows = (): Record<string, unknown>[] => {
      switch (table) {
        case 'consultor_sessions':
          return kind === 'update'
            ? state.sessions.map((s) => ({ ...s, ...payload }))
            : state.sessions.map((s) => ({ ...s }));
        case 'session_facilitators':
          return state.facilitators.map((f) => ({ ...f }));
        case 'session_attendees':
          return state.attendees.map((a) => ({ ...a }));
        case 'session_edit_requests':
          return state.editRequest ? [{ ...state.editRequest, ...payload }] : [];
        default:
          return [];
      }
    };

    const api: Record<string, unknown> = {};
    const self = () => api;

    Object.assign(api, {
      select: self,
      eq: self,
      in: self,
      not: self,
      gte: self,
      lte: self,
      order: self,
      limit: self,
      delete: () => {
        kind = 'delete';
        return api;
      },
      update: (p: Record<string, unknown>) => {
        kind = 'update';
        payload = p;
        state.updates.push({ table, payload: p });
        return api;
      },
      insert: (p: Record<string, unknown>) => {
        kind = 'insert';
        payload = p;
        return api;
      },
      single: async () => {
        const list = rows();
        return list.length > 0
          ? { data: list[0], error: null }
          : { data: null, error: { message: 'not found' } };
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected),
    });

    return api;
  }

  return { from: vi.fn((table: string) => builder(table)) };
}

/** The event payload the handler produced for `eventType`. */
function payloadFor(eventType: string): Record<string, any> | null {
  const call = mockTriggerNotification.mock.calls.find((c) => c[0] === eventType);
  return call ? (call[1] as Record<string, any>) : null;
}

/** The deduplicated recipient set the payload carries. */
function recipientsFor(eventType: string): string[] {
  const payload = payloadFor(eventType);
  if (!payload) return [];
  return [
    ...((payload.facilitator_ids as string[]) || []),
    ...((payload.attendee_ids as string[]) || []),
  ];
}

/**
 * The recipient set every fixture in this file expects: the three distinct people, the
 * both-roles user exactly once. Asserted on LENGTH before identity — a `Set` comparison
 * alone silently dedups a broken derivation.
 */
function expectDedupedRecipients(recipients: string[]) {
  expect(recipients).toHaveLength(3);
  expect(new Set(recipients)).toEqual(
    new Set([BOTH_ID, FACILITATOR_ONLY_ID, ATTENDEE_ONLY_ID])
  );
  expect(recipients.filter((id) => id === BOTH_ID)).toHaveLength(1);
}

function mocked(method: string, extra: Record<string, unknown> = {}) {
  return createMocks({
    method: method as any,
    headers: { host: 'genera.test' },
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTriggerNotification.mockResolvedValue({ success: true, notificationsCreated: 3 });
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_ID }, error: null });
  mockGetUserRoles.mockResolvedValue([{ role: 'admin' }]);
  mockGetHighestRole.mockReturnValue('admin');
  mockValidateFacilitatorIntegrity.mockResolvedValue({ valid: true, errors: [] });
  mockCreateReservation.mockResolvedValue({ skipped: true, error: null });
  mockExecuteCancellation.mockResolvedValue({ success: true, clause_result: null });
  mockSyncRescheduleHours.mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// [A1] the registry
// ---------------------------------------------------------------------------

describe('[A1] the three lifecycle events resolve through the registry', () => {
  for (const eventType of ['session_created', 'session_rescheduled', 'session_cancelled']) {
    it(`${eventType} has a real config, not the fallback`, () => {
      expect(hasEventConfig(eventType)).toBe(true);

      const config = getEventConfig(eventType);
      const fallback = getEventConfig('definitely_not_a_registered_event');

      expect(config.category).toBe('sessions');
      expect(['low', 'normal', 'high']).toContain(config.importance);
      expect(config.defaultUrl).not.toBe(fallback.defaultUrl);
      expect(config.defaultTitle({ session: { title: 'Taller de aula' } })).toContain(
        'Taller de aula'
      );
    });
  }
});

// ---------------------------------------------------------------------------
// [A2] the reschedule copy carries BOTH schedules
// ---------------------------------------------------------------------------

describe('[A2] session_rescheduled renders the previous AND the new schedule', () => {
  it('names both, so a dropped field cannot pass', () => {
    const description = getEventConfig('session_rescheduled').defaultDescription({
      session: {
        title: 'Taller de aula',
        previous_date: 'lunes 14 de septiembre',
        previous_time: '09:00',
        date: 'jueves 17 de septiembre',
        time: '15:30',
      },
    });

    expect(description).toContain('lunes 14 de septiembre');
    expect(description).toContain('09:00');
    expect(description).toContain('jueves 17 de septiembre');
    expect(description).toContain('15:30');
  });

  it('degrades to prose rather than "undefined" when the previous schedule is missing', () => {
    const description = getEventConfig('session_rescheduled').defaultDescription({
      session: { date: 'jueves 17 de septiembre', time: '15:30' },
    });

    expect(description).not.toContain('undefined');
    expect(description).not.toContain('null');
  });
});

// ---------------------------------------------------------------------------
// [A3] + [A4] each route emits, to the dedup union, with no raw link
// ---------------------------------------------------------------------------

describe('[A3] POST /api/sessions/[id]/approve emits session_created', () => {
  it('notifies the dedup union of facilitators and attendees', async () => {
    const state = makeState({ sessions: [baseSession({ status: 'borrador' })] });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', { query: { id: SESSION_ID } });
    await approveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);

    expectDedupedRecipients(recipientsFor('session_created'));
  });

  it('[A4] carries the platform path and NEVER the raw meeting link', async () => {
    const state = makeState({ sessions: [baseSession({ status: 'borrador' })] });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', { query: { id: SESSION_ID } });
    await approveHandler(req as any, res as any);

    const payload = payloadFor('session_created');
    expect(payload).not.toBeNull();
    expect(payload!.session.join_url).toContain(`/meet/session/${SESSION_ID}`);

    // The whole payload, not just the field we happen to know about.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(RAW_MEETING_LINK);
    expect(serialized).not.toContain('pwd=');
  });

  it('emits nothing when the session has no facilitators and no attendees', async () => {
    const state = makeState({
      sessions: [baseSession({ status: 'borrador' })],
      facilitators: [],
      attendees: [],
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', { query: { id: SESSION_ID } });
    await approveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockTriggerNotification).not.toHaveBeenCalled();
  });

  it('passes null join_url when the session has no meeting', async () => {
    const state = makeState({
      sessions: [baseSession({ status: 'borrador', meeting_link: null })],
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', { query: { id: SESSION_ID } });
    await approveHandler(req as any, res as any);

    expect(payloadFor('session_created')!.session.join_url).toBeNull();
  });
});

describe('[A3] POST /api/sessions/bulk-approve emits session_created per session', () => {
  it('emits once per approved session', async () => {
    const state = makeState({
      sessions: [
        baseSession({ id: SESSION_ID, status: 'borrador' }),
        baseSession({ id: SESSION_ID_2, status: 'borrador' }),
      ],
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', { body: { session_ids: [SESSION_ID, SESSION_ID_2] } });
    await bulkApproveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);

    const created = mockTriggerNotification.mock.calls.filter(
      (c) => c[0] === 'session_created'
    );
    expect(created).toHaveLength(2);
    expect(created.map((c) => (c[1] as any).session.id).sort()).toEqual(
      [SESSION_ID, SESSION_ID_2].sort()
    );
    for (const call of created) {
      expectDedupedRecipients([
        ...((call[1] as any).facilitator_ids || []),
        ...((call[1] as any).attendee_ids || []),
      ]);
    }
  });
});

describe('[A3] PUT /api/sessions/[id] emits session_rescheduled', () => {
  it('emits when the date moves, carrying both schedules', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { id: SESSION_ID },
      body: { session_date: '2026-09-17', start_time: '15:30:00' },
    });
    await sessionDetailHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);

    const payload = payloadFor('session_rescheduled');
    expect(payload).not.toBeNull();
    expect(payload!.session.previous_date).toBeTruthy();
    expect(payload!.session.previous_time).toBe('09:00');
    expect(payload!.session.time).toBe('15:30');
    expect(payload!.session.previous_date).not.toBe(payload!.session.date);
    expectDedupedRecipients(recipientsFor('session_rescheduled'));
    expect(JSON.stringify(payload)).not.toContain(RAW_MEETING_LINK);
  });

  it('emits when only the start time moves', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { id: SESSION_ID },
      body: { start_time: '11:00:00' },
    });
    await sessionDetailHandler(req as any, res as any);

    expect(payloadFor('session_rescheduled')).not.toBeNull();
  });

  it('[A5] does NOT emit when only the title changes', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { id: SESSION_ID },
      body: { title: 'Sesión de acompañamiento (rev. 2)' },
    });
    await sessionDetailHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockTriggerNotification).not.toHaveBeenCalled();
  });

  it('[A5] does NOT emit when the date is resubmitted unchanged', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { id: SESSION_ID },
      body: { session_date: '2026-09-14', start_time: '09:00:00' },
    });
    await sessionDetailHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockTriggerNotification).not.toHaveBeenCalled();
  });
});

describe('[A3] PUT /api/sessions/edit-requests/[eid] emits session_rescheduled on approve', () => {
  function editRequestState(changes: Record<string, { old: unknown; new: unknown }>) {
    return makeState({
      editRequest: {
        id: EDIT_REQUEST_ID,
        session_id: SESSION_ID,
        status: 'pending',
        requested_by: FACILITATOR_ONLY_ID,
        changes,
        consultor_sessions: { title: 'Sesión de acompañamiento' },
      },
    });
  }

  it('emits when the approved change set moves the date', async () => {
    const state = editRequestState({
      session_date: { old: '2026-09-14', new: '2026-09-21' },
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { eid: EDIT_REQUEST_ID },
      body: { action: 'approve' },
    });
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);

    const payload = payloadFor('session_rescheduled');
    expect(payload).not.toBeNull();
    expect(payload!.session.previous_date).not.toBe(payload!.session.date);
    expectDedupedRecipients(recipientsFor('session_rescheduled'));
    expect(JSON.stringify(payload)).not.toContain(RAW_MEETING_LINK);
  });

  it('does NOT emit when the approved change set is title-only', async () => {
    const state = editRequestState({
      title: { old: 'Sesión de acompañamiento', new: 'Sesión de acompañamiento (rev. 2)' },
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { eid: EDIT_REQUEST_ID },
      body: { action: 'approve' },
    });
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(
      mockTriggerNotification.mock.calls.filter((c) => c[0] === 'session_rescheduled')
    ).toHaveLength(0);
  });
});

describe('[A3] POST /api/sessions/[id]/cancel emits session_cancelled', () => {
  it('emits on the legacy path', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', {
      query: { id: SESSION_ID },
      body: { cancellation_reason: 'El colegio suspendió las clases.' },
    });
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expectDedupedRecipients(recipientsFor('session_cancelled'));
    expect(JSON.stringify(payloadFor('session_cancelled'))).not.toContain(RAW_MEETING_LINK);
  });

  it('emits on the hour-tracking clause path', async () => {
    const state = makeState({
      sessions: [baseSession({ hour_type_key: 'acompanamiento', contrato_id: 4321 })],
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', {
      query: { id: SESSION_ID },
      body: { cancellation_reason: 'Reasignación de horas.', cancelled_by: 'school' },
    });
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expectDedupedRecipients(recipientsFor('session_cancelled'));
  });
});

describe('[A3] POST /api/sessions/series/[groupId]/cancel emits per cancelled session', () => {
  it('emits once per session in the batch', async () => {
    const state = makeState({
      sessions: [baseSession({ id: SESSION_ID }), baseSession({ id: SESSION_ID_2 })],
    });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', {
      query: { groupId: GROUP_ID },
      body: { cancellation_reason: 'Se reprograma la serie completa.', scope: 'all_future' },
    });
    await seriesCancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);

    const cancelled = mockTriggerNotification.mock.calls.filter(
      (c) => c[0] === 'session_cancelled'
    );
    expect(cancelled).toHaveLength(2);
    expect(cancelled.map((c) => (c[1] as any).session.id).sort()).toEqual(
      [SESSION_ID, SESSION_ID_2].sort()
    );
    for (const call of cancelled) {
      expectDedupedRecipients([
        ...((call[1] as any).facilitator_ids || []),
        ...((call[1] as any).attendee_ids || []),
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// [A6] a failing notification never fails the request
// ---------------------------------------------------------------------------

describe('[A6] a notification failure does not fail the request', () => {
  beforeEach(() => {
    mockTriggerNotification.mockRejectedValue(new Error('notification backend down'));
  });

  it('approve still returns 200', async () => {
    const state = makeState({ sessions: [baseSession({ status: 'borrador' })] });
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', { query: { id: SESSION_ID } });
    await approveHandler(req as any, res as any);

    expect(mockTriggerNotification).toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.session.status).toBe('programada');
  });

  it('cancel still returns 200', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('POST', {
      query: { id: SESSION_ID },
      body: { cancellation_reason: 'El colegio suspendió las clases.' },
    });
    await cancelHandler(req as any, res as any);

    expect(mockTriggerNotification).toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.session.status).toBe('cancelada');
  });

  it('the reschedule PUT still returns 200', async () => {
    const state = makeState();
    mockCreateServiceRoleClient.mockReturnValue(createClient(state));

    const { req, res } = mocked('PUT', {
      query: { id: SESSION_ID },
      body: { session_date: '2026-09-17' },
    });
    await sessionDetailHandler(req as any, res as any);

    expect(mockTriggerNotification).toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
  });
});
