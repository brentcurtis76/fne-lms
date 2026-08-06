// @vitest-environment node
/**
 * Z2-3b [A7] [A8] [A10] — the two RESCHEDULE paths tell Zoom, and never fail because of
 * it.
 *
 * The routes are `PUT /api/sessions/[id]` and the approve branch of
 * `PUT /api/sessions/edit-requests/[eid]`. Z2-3a already moves the hour ledger from
 * both; this chunk adds the `meeting_sync` enqueue beside it — and the PUT route's
 * modality flip to `presencial` enqueues `meeting_delete` instead, because a presencial
 * session has nothing to join.
 *
 * Only the QUEUE seam is faked. The §14 gate, the dedupe key, the schedule derivation and
 * the route wiring are all the real thing, so a change to any of them shows up here.
 *
 * r9 ruling: the two gates now differ, and this file is where the difference is visible on
 * ONE route. `meeting_sync` stays gated by both §14 flags (the `[A10]` cases, unchanged);
 * the modality-flip `meeting_delete` is gated by neither (`[R2]`/`[R3]`), because §14's
 * kill switch never stops cleanup.
 *
 * The session double is FILTER-AWARE: a canned row resolves only when the recorded
 * `.eq()` filters actually match it, so a route that dropped a filter would stop finding
 * its row rather than sailing through on a table-name match.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const EDIT_REQUEST_ID = '99999999-8888-4777-8666-555544443333';
const SCHOOL_ID = 77;

/**
 * 2026-09-10 is Chile SUMMER time (DST began 2026-09-06), so it is UTC−3 and 11:00 local
 * is 14:00Z. A fixture inside DST on purpose: a handler that shipped a UTC-converted
 * instant to Zoom, or a key built by string concatenation, would agree with a UTC−4
 * fixture half the year and disagree here.
 */
const NEW_STARTS_AT = '2026-09-10T14:00:00.000Z';

const { mockGetApiUser, mockCheckIsAdmin, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole, mockEnqueue } =
  vi.hoisted(() => ({
    mockGetApiUser: vi.fn(),
    mockCheckIsAdmin: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockGetHighestRole: vi.fn(),
    mockEnqueue: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  checkIsAdmin: mockCheckIsAdmin,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res, message, status, details) => {
    res.status(status).json({ error: message, details });
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
  getUserRoles: mockGetUserRoles,
  getHighestRole: mockGetHighestRole,
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: vi.fn(async () => undefined) },
}));

// The ONLY faked seam. `provisioning-intent` builds the queue through this factory.
vi.mock('../../../lib/zoom/jobs/queue', () => ({
  defaultZoomJobQueue: () => ({
    enqueue: mockEnqueue,
    claim: vi.fn(),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));

import putHandler from '../../../pages/api/sessions/[id]/index';
import editRequestHandler from '../../../pages/api/sessions/edit-requests/[eid]';

interface MockState {
  row: Record<string, any>;
  editRequest: Record<string, any>;
  rpcCalls: string[];
}

let state: MockState;

/** Every recorded `.eq()` must hold on the row, or the query resolves to nothing. */
function matches(row: Record<string, any>, filters: Array<[string, unknown]>): boolean {
  return filters.every(([column, value]) => row[column] === value);
}

/** Minutes between two `HH:MM:SS` wall-clock times — the generated column's rule. */
function durationOf(start: string, end: string): number {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  return toMinutes(end) - toMinutes(start);
}

function createMockClient() {
  const sessionsBuilder = () => {
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, any> | null = null;

    const finalize = () => {
      if (!matches(state.row, filters)) return Promise.resolve({ data: null, error: null });
      if (op === 'select') return Promise.resolve({ data: { ...state.row }, error: null });
      state.row = { ...state.row, ...(payload || {}) };
      // `scheduled_duration_minutes` is a STORED generated column on the live table, so
      // a time change recomputes it. Modelled, because the dedupe key reads it.
      state.row.scheduled_duration_minutes = durationOf(
        state.row.start_time,
        state.row.end_time
      );
      return Promise.resolve({ data: { ...state.row }, error: null });
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, any>) => {
        op = 'update';
        payload = p;
        return api;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return api;
      }),
      single: vi.fn(() => finalize()),
      maybeSingle: vi.fn(() => finalize()),
      // The edit-request route updates WITHOUT a `.select()`, so the builder itself is
      // awaited. Without this the update would silently never apply and the suite would
      // assert against a row the route believes it changed.
      then: (resolve: any, reject: any) => finalize().then(resolve, reject),
    };
    return api;
  };

  const editRequestsBuilder = () => {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, any> | null = null;

    const finalize = () => {
      if (op === 'select') {
        return Promise.resolve({ data: { ...state.editRequest }, error: null });
      }
      state.editRequest = { ...state.editRequest, ...(payload || {}) };
      return Promise.resolve({ data: { ...state.editRequest }, error: null });
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, any>) => {
        op = 'update';
        payload = p;
        return api;
      }),
      eq: vi.fn(() => api),
      single: vi.fn(() => finalize()),
      maybeSingle: vi.fn(() => finalize()),
    };
    return api;
  };

  return {
    rpc: vi.fn(async (fn: string, args: Record<string, any> = {}) => {
      state.rpcCalls.push(fn);

      // r21: a reschedule's session write now happens INSIDE
      // `apply_session_reschedule` (20260808120000), in the same transaction as the
      // ledger write, so the double applies the column map itself.
      // `scheduled_duration_minutes` is recomputed here for the same reason the
      // `.update()` path recomputes it — it is a STORED generated column and the
      // dedupe key reads it.
      if (fn === 'apply_session_reschedule') {
        if (args.p_if_updated_at && args.p_if_updated_at !== state.row.updated_at) {
          return { data: { conflict: true, current: { ...state.row } }, error: null };
        }

        state.row = { ...state.row, ...(args.p_updates || {}) };
        state.row.scheduled_duration_minutes = durationOf(
          state.row.start_time,
          state.row.end_time
        );

        return {
          data: {
            conflict: false,
            session: { ...state.row },
            hours: { applied: true, revision_written: true },
          },
          error: null,
        };
      }

      return { data: { applied: true, revision_written: true }, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_edit_requests') return editRequestsBuilder();
      if (table === 'session_facilitators') {
        const api: any = {
          select: vi.fn(() => api),
          eq: vi.fn(async () => ({ data: [], error: null })),
          single: vi.fn(async () => ({ data: { id: 'fac-1' }, error: null })),
        };
        return api;
      }
      if (table === 'session_activity_log') {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

/** A managed, approved, remote session — one that really does have a Zoom meeting. */
function managedSession(overrides: Record<string, any> = {}) {
  return {
    id: SESSION_ID,
    school_id: SCHOOL_ID,
    growth_community_id: '44444444-4444-4444-8444-444444444444',
    title: 'Sesión de acompañamiento',
    status: 'programada',
    modality: 'online',
    meeting_provider: 'zoom',
    meeting_link: null,
    is_zoom_managed: true,
    is_active: true,
    session_date: '2026-09-10',
    start_time: '09:00:00',
    end_time: '10:30:00',
    scheduled_duration_minutes: 90,
    updated_at: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

function put(body: Record<string, any>) {
  return createMocks({
    method: 'PUT',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function approveEditRequest() {
  return createMocks({
    method: 'PUT',
    query: { eid: EDIT_REQUEST_ID },
    headers: { 'content-type': 'application/json' },
    body: { action: 'approve' },
  });
}

function editRequestRow(changes: Record<string, { old: unknown; new: unknown }>) {
  return {
    id: EDIT_REQUEST_ID,
    session_id: SESSION_ID,
    status: 'pending',
    requested_by: ADMIN_ID,
    changes,
    consultor_sessions: { title: 'Sesión de acompañamiento' },
  };
}

const ORIGINAL_FLAG = process.env.FEATURE_ZOOM_MEETINGS;
const ORIGINAL_ALLOWLIST = process.env.ZOOM_SCHOOL_ALLOWLIST;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv('FEATURE_ZOOM_MEETINGS', 'true');
  setEnv('ZOOM_SCHOOL_ALLOWLIST', undefined);

  state = { row: managedSession(), editRequest: editRequestRow({}), rpcCalls: [] };

  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_ID }, error: null });
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => createMockClient());
  mockGetUserRoles.mockResolvedValue(['admin']);
  mockGetHighestRole.mockReturnValue('admin');
  mockEnqueue.mockResolvedValue('enqueued');
});

afterEach(() => {
  setEnv('FEATURE_ZOOM_MEETINGS', ORIGINAL_FLAG);
  setEnv('ZOOM_SCHOOL_ALLOWLIST', ORIGINAL_ALLOWLIST);
});

// ---------------------------------------------------------------------------
// PUT /api/sessions/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/sessions/[id] — Zoom reschedule sync [A7] [A8] [A10]', () => {
  it('[A7] enqueues exactly one meeting_sync with the exact argument object', async () => {
    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    // The whole object, not the call count: the job type, the payload and the ruled key
    // (target instant + target duration) are each load-bearing.
    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_sync',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_sync:consultor_session:${SESSION_ID}:${NEW_STARTS_AT}:120`,
    });
  });

  it('[A7] a second identical reschedule derives the SAME key', async () => {
    const first = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(first.req as any, first.res as any);
    const second = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(second.req as any, second.res as any);

    expect(mockEnqueue.mock.calls[0][0].dedupe_key).toBe(mockEnqueue.mock.calls[1][0].dedupe_key);
  });

  it('[A7] a LATER reschedule to a different time derives a DIFFERENT key', async () => {
    const first = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(first.req as any, first.res as any);
    const second = put({ start_time: '15:00:00', end_time: '17:00:00' });
    await putHandler(second.req as any, second.res as any);

    expect(mockEnqueue.mock.calls[0][0].dedupe_key).not.toBe(
      mockEnqueue.mock.calls[1][0].dedupe_key
    );
  });

  it('[A7] a duration-only change still mints a fresh key', async () => {
    // 09:00–10:30 → 09:00–11:30 moves no start time at all. A key on the instant alone
    // would swallow this as a duplicate and leave Zoom holding the old 90 minutes.
    const { req, res } = put({ end_time: '11:30:00' });
    await putHandler(req as any, res as any);

    expect(mockEnqueue.mock.calls[0][0].dedupe_key).toBe(
      `meeting_sync:consultor_session:${SESSION_ID}:2026-09-10T12:00:00.000Z:150`
    );
  });

  it('does not enqueue when nothing schedule-related changed', async () => {
    const { req, res } = put({ title: 'Otro título' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A7] a modality flip to presencial enqueues meeting_delete, not meeting_sync', async () => {
    const { req, res } = put({ modality: 'presencial' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_delete',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_delete:consultor_session:${SESSION_ID}`,
    });
  });

  it('[A7] a flip to presencial that ALSO moves the time deletes rather than syncs', async () => {
    const { req, res } = put({
      modality: 'presencial',
      start_time: '11:00:00',
      end_time: '13:00:00',
    });
    await putHandler(req as any, res as any);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0].job_type).toBe('meeting_delete');
  });

  it('a flip from presencial TO online is not a delete', async () => {
    state.row = managedSession({ modality: 'presencial' });

    const { req, res } = put({ modality: 'online' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A8] returns its normal 200 and the same body when the queue THROWS', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.session.start_time).toBe('11:00:00');
    expect(body.data.session.end_time).toBe('13:00:00');
    // The session's own state change still committed, and the ledger still moved.
    expect(state.row.start_time).toBe('11:00:00');
    expect(state.rpcCalls).toContain('apply_session_reschedule');
    consoleError.mockRestore();
  });

  it('[A8] a duplicate enqueue is indistinguishable from a fresh one', async () => {
    mockEnqueue.mockResolvedValue('duplicate');

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.session.start_time).toBe('11:00:00');
  });

  it.each([
    ['the master flag is off', 'FEATURE_ZOOM_MEETINGS', 'false'],
    ['the master flag is unset', 'FEATURE_ZOOM_MEETINGS', undefined],
  ])('[A10] does not enqueue when %s', async (_label, name, value) => {
    setEnv(name, value);

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A10] does not enqueue when the school is outside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A10] DOES enqueue when the school is inside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', `12, ${SCHOOL_ID}`);

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('[R3] the allowlist does NOT gate the modality-flip DELETE', async () => {
    // §14: the allowlist is "checked at provision time". A flip to presencial is not a
    // provision, and a school leaving the wave must never strand a live meeting.
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = put({ modality: 'presencial' });
    await putHandler(req as any, res as any);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_delete',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_delete:consultor_session:${SESSION_ID}`,
    });
  });

  it.each([
    ['off', 'false'],
    ['unset', undefined],
  ])(
    '[R2] the modality-flip DELETE still enqueues with the master flag %s',
    async (_label, value) => {
      // The sync cases above prove the SAME request shape is gated when it only moves the
      // time; §14 stops new meetings and joins, never cleanup.
      setEnv('FEATURE_ZOOM_MEETINGS', value);

      const { req, res } = put({ modality: 'presencial' });
      await putHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue.mock.calls[0][0].job_type).toBe('meeting_delete');
    }
  );

  it('[R4] the modality-flip DELETE still refuses an unmanaged session', async () => {
    // The one refusal the cleanup gate keeps: nothing was ever provisioned to remove.
    state.row = managedSession({ is_zoom_managed: false });

    const { req, res } = put({ modality: 'presencial' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue for an unmanaged session', async () => {
    state.row = managedSession({ is_zoom_managed: false });

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the update itself was refused', async () => {
    // A stale optimistic-lock guard: the update matches zero rows, so nothing committed.
    const { req, res } = put({
      start_time: '11:00:00',
      end_time: '13:00:00',
      if_updated_at: '2020-01-01T00:00:00.000Z',
    });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when the hours reconciliation fails — the times never moved', async () => {
    // r21 INVERTS this case. It used to assert the opposite ("STILL enqueues"), and the
    // reason was sound while the session update and the ledger update were two separate
    // calls: the times HAD moved, so Zoom had to be told even though the ledger failed.
    // `apply_session_reschedule` makes them one transaction, so a failed reconciliation
    // rolls the session back too — there is no new time to tell Zoom about, and telling
    // it would move the meeting away from where the session actually still is.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServiceRoleClient.mockImplementation(() => {
      const client = createMockClient();
      client.rpc = vi.fn(async (fn: string) => {
        state.rpcCalls.push(fn);
        return {
          data: null,
          error: { message: 'ledger locked', hint: 'reschedule_hours' },
        };
      }) as any;
      return client;
    });

    const { req, res } = put({ start_time: '11:00:00', end_time: '13:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(mockEnqueue).not.toHaveBeenCalled();
    // The double's row was never touched, mirroring the transaction rollback.
    expect(state.row.start_time).toBe('09:00:00');
    expect(state.row.end_time).toBe('10:30:00');
    consoleError.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/sessions/edit-requests/[eid] — the approve branch
// ---------------------------------------------------------------------------

describe('edit-request approve — Zoom reschedule sync [A7] [A8] [A10]', () => {
  beforeEach(() => {
    state.editRequest = editRequestRow({
      start_time: { old: '09:00:00', new: '11:00:00' },
      end_time: { old: '10:30:00', new: '13:00:00' },
    });
  });

  it('[A7] enqueues exactly one meeting_sync with the exact argument object', async () => {
    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_sync',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_sync:consultor_session:${SESSION_ID}:${NEW_STARTS_AT}:120`,
    });
  });

  it('does not enqueue when the approved change touches no schedule field', async () => {
    // `old` must still match the stored value or the route's stale-value guard 409s
    // before it ever reaches the enqueue.
    state.editRequest = editRequestRow({
      title: { old: 'Sesión de acompañamiento', new: 'Otro título' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A8] returns its normal 200 and the same body when the queue THROWS', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.edit_request.status).toBe('approved');
    expect(body.data.edit_request.reviewed_by).toBe(ADMIN_ID);
    // The edit request was still approved and the session still moved.
    expect(state.editRequest.status).toBe('approved');
    expect(state.row.start_time).toBe('11:00:00');
    consoleError.mockRestore();
  });

  it('[A10] does not enqueue when the master flag is off', async () => {
    setEnv('FEATURE_ZOOM_MEETINGS', 'false');

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A10] does not enqueue when the school is outside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the approval itself was refused', async () => {
    // The stale-value guard: the session no longer holds the `old` the request recorded.
    state.editRequest = editRequestRow({
      start_time: { old: '08:00:00', new: '11:00:00' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
