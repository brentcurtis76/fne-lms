// @vitest-environment node
/**
 * GET /api/admin/sessions/[id]/hours-comparison (Z7-5).
 *
 * The §11 comparison read: admin-only, and every uncertain quantity arrives as a
 * STATE — a live occurrence, provisional webhook data and open intervals are
 * flags, never numbers. Presence comes from the merged CLOSED intervals only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockEffectiveStore } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockEffectiveStore: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/zoom/attendance-effective', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    defaultAttendanceEffectiveStore: mockEffectiveStore,
  };
});

import handler from '../../../pages/api/admin/sessions/[id]/hours-comparison';
import type { AttendanceEffectiveStore } from '../../../lib/zoom/attendance-effective';

const SESSION_ID = 'a7a7a7a7-0001-4000-8000-000000000001';
const LEAD_ID = 'facadfac-0001-4000-8000-000000000001';
const OTHER_FAC_ID = 'facadfac-0002-4000-8000-000000000002';
const ADMIN = { id: 'ad111111-1111-4111-8111-111111111111' };

/** Chainable thenable: every filter returns itself; awaiting resolves the result. */
function tableResult(data: unknown, error: { message: string } | null = null) {
  const self: Record<string, unknown> = {};
  const resolved = { data, error };
  for (const method of ['select', 'eq', 'order']) {
    self[method] = vi.fn(() => self);
  }
  self.maybeSingle = vi.fn(async () => ({
    data: Array.isArray(data) ? (data[0] ?? null) : data,
    error,
  }));
  self.then = (resolve: (value: unknown) => unknown) => resolve(resolved);
  return self;
}

function fakeServiceClient(
  tables: Record<string, unknown>,
  errors: Record<string, { message: string }> = {}
) {
  const from = vi.fn((table: string) => tableResult(tables[table] ?? null, errors[table] ?? null));
  return {
    from,
    schema: vi.fn(() => ({
      from: vi.fn((table: string) =>
        tableResult(
          tables[`zoom_internal.${table}`] ?? null,
          errors[`zoom_internal.${table}`] ?? null
        )
      ),
    })),
  };
}

function fakeEffective(rows: Array<Record<string, unknown>>, source: 'report' | 'webhook') {
  const store: AttendanceEffectiveStore = {
    findWinningBatchId: vi.fn(async () => (source === 'report' ? 'batch-1' : null)),
    listReportRows: vi.fn(async () => rows as never),
    listWebhookRows: vi.fn(async () => (source === 'webhook' ? (rows as never) : [])),
  };
  mockEffectiveStore.mockReturnValue(store);
}

function attendanceRow(userId: string | null, joinedAt: string, leftAt: string | null) {
  return {
    id: `row-${joinedAt}`,
    userId,
    customerKey: null,
    displayName: 'Sintetica',
    transientEmail: null,
    matchedBy: userId ? 'customer_key' : 'unmatched',
    joinedAt,
    leftAt,
    source: 'webhook',
  };
}

async function invoke(id: string = SESSION_ID) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'GET',
    query: { id },
  });
  await handler(req, res);
  return res;
}

const BASE_TABLES = () => ({
  consultor_sessions: { id: SESSION_ID, scheduled_duration_minutes: 90, status: 'completada' },
  contract_hours_ledger: {
    status: 'consumida',
    hours: 1.5,
    effective_minutes: null,
    admin_override: false,
    planned_minutes_snapshot: 90,
  },
  session_facilitators: [
    { user_id: LEAD_ID, is_lead: true, profiles: { first_name: 'Líder', last_name: 'Sintética' } },
    { user_id: OTHER_FAC_ID, is_lead: false, profiles: { first_name: 'Apoyo', last_name: 'Sintético' } },
  ],
  'zoom_internal.zoom_meetings': {
    zoom_meeting_uuid: 'z7Occ/HC==',
    status: 'ended',
    actual_started_at: '2026-07-29T23:55:00.000Z',
    actual_ended_at: '2026-07-30T01:00:00.000Z',
  },
  session_hour_overrides: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: ADMIN, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('authorization', () => {
  it('401s an unauthenticated caller and 403s a non-admin', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('no') });
    expect((await invoke())._getStatusCode()).toBe(401);

    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: 'x' }, error: null });
    expect((await invoke())._getStatusCode()).toBe(403);
  });

  it('400s a non-uuid id and 404s a missing session', async () => {
    expect((await invoke('not-a-uuid'))._getStatusCode()).toBe(400);

    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient({ ...BASE_TABLES(), consultor_sessions: null })
    );
    fakeEffective([], 'webhook');
    expect((await invoke())._getStatusCode()).toBe(404);
  });
});

describe('the comparison payload', () => {
  it('reports planned, elapsed, and the LEAD presence from merged CLOSED intervals', async () => {
    mockCreateServiceRoleClient.mockReturnValue(fakeServiceClient(BASE_TABLES()));
    // Two overlapping closed intervals for the lead: 23:56–00:20 and 00:10–00:41 →
    // merged 45 min, never 24+31.
    fakeEffective(
      [
        attendanceRow(LEAD_ID, '2026-07-29T23:56:00.000Z', '2026-07-30T00:20:00.000Z'),
        attendanceRow(LEAD_ID, '2026-07-30T00:10:00.000Z', '2026-07-30T00:41:00.000Z'),
      ],
      'report'
    );

    const res = await invoke();
    expect(res._getStatusCode()).toBe(200);
    const { data } = JSON.parse(res._getData());

    expect(data.planned_minutes).toBe(90);
    expect(data.zoom).toEqual({
      state: 'ended',
      actual_started_at: '2026-07-29T23:55:00.000Z',
      actual_ended_at: '2026-07-30T01:00:00.000Z',
      elapsed_minutes: 65,
    });
    expect(data.attendance).toEqual({ state: 'report', has_open_intervals: false });

    const lead = data.facilitator_presence.find(
      (facilitator: { is_lead: boolean }) => facilitator.is_lead
    );
    expect(lead).toMatchObject({
      user_id: LEAD_ID,
      name: 'Líder Sintética',
      observed_minutes: 45,
      has_open_interval: false,
    });
    // The other facilitator is DISPLAYED with no data, not defaulted to a number.
    const other = data.facilitator_presence.find(
      (facilitator: { is_lead: boolean }) => !facilitator.is_lead
    );
    expect(other).toMatchObject({ observed_minutes: null, has_open_interval: false });
  });

  it('renders open/provisional as STATES: webhook source, open interval, live meeting', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient({
        ...BASE_TABLES(),
        'zoom_internal.zoom_meetings': {
          zoom_meeting_uuid: 'z7Occ/HC==',
          status: 'started',
          actual_started_at: '2026-07-29T23:55:00.000Z',
          actual_ended_at: null,
        },
      })
    );
    fakeEffective([attendanceRow(LEAD_ID, '2026-07-29T23:56:00.000Z', null)], 'webhook');

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.zoom.state).toBe('live');
    expect(data.zoom.elapsed_minutes).toBeNull();
    expect(data.attendance).toEqual({ state: 'webhook_provisional', has_open_intervals: true });
    const lead = data.facilitator_presence.find(
      (facilitator: { is_lead: boolean }) => facilitator.is_lead
    );
    // The open interval is a FLAG; the minutes stay null — nothing closed.
    expect(lead).toMatchObject({ observed_minutes: null, has_open_interval: true });
  });

  it('a session with no managed meeting reports zoom none and attendance none', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient({ ...BASE_TABLES(), 'zoom_internal.zoom_meetings': null })
    );
    fakeEffective([], 'webhook');

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.zoom.state).toBe('none');
    expect(data.attendance.state).toBe('none');
    expect(mockEffectiveStore).not.toHaveBeenCalled();
  });

  it('surfaces the override audit trail with actor names', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient({
        ...BASE_TABLES(),
        session_hour_overrides: [
          {
            id: 'ovr-1',
            previous_minutes: null,
            new_minutes: 45,
            planned_minutes_snapshot: 90,
            reason: 'Presencia parcial',
            reason_category: 'consultant_shortfall',
            created_by: ADMIN.id,
            created_at: '2026-07-30T02:00:00.000Z',
            reverses_override_id: null,
            profiles: { first_name: 'Admin', last_name: 'Prueba' },
          },
        ],
      })
    );
    fakeEffective([], 'webhook');

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.overrides).toEqual([
      {
        id: 'ovr-1',
        previous_minutes: null,
        new_minutes: 45,
        planned_minutes_snapshot: 90,
        reason: 'Presencia parcial',
        reason_category: 'consultant_shortfall',
        created_by: ADMIN.id,
        created_by_name: 'Admin Prueba',
        created_at: '2026-07-30T02:00:00.000Z',
        reverses_override_id: null,
      },
    ]);
  });

  it.each([
    'contract_hours_ledger',
    'session_facilitators',
    'zoom_internal.zoom_meetings',
    'session_hour_overrides',
  ])('[Z7-R5] fails closed when the %s read fails', async (source) => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient(BASE_TABLES(), { [source]: { message: `synthetic ${source} failure` } })
    );
    fakeEffective([], 'webhook');

    const res = await invoke();
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error interno' });
    expect(res._getData()).not.toContain('synthetic');
  });
});
