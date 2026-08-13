// @vitest-environment node
/**
 * GET /api/sessions/[id]/attendance-suggestions (Z7-5).
 *
 * Visibility is the §7 zoom_attendance row: admin, or THIS session's facilitator —
 * a consultor who is not the facilitator gets the same not-found a stranger gets.
 * Suggestion semantics follow the direction-of-failure rule: `present` only from
 * matched rows; `absent` only under the authoritative complete report; provisional
 * webhook silence is `no_data`; open intervals are a state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockEffectiveStore,
  mockGetUserRoles,
  mockGetHighestRole,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockEffectiveStore: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserRoles: mockGetUserRoles,
    getHighestRole: mockGetHighestRole,
  };
});

vi.mock('../../../lib/zoom/attendance-effective', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    defaultAttendanceEffectiveStore: mockEffectiveStore,
  };
});

import handler from '../../../pages/api/sessions/[id]/attendance-suggestions';
import type { AttendanceEffectiveStore } from '../../../lib/zoom/attendance-effective';

const SESSION_ID = 'a7a7a7a7-0001-4000-8000-000000000001';
const FACILITATOR = { id: 'facadfac-0001-4000-8000-000000000001' };
const ATTENDEE_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const ATTENDEE_B = 'aaaaaaaa-0002-4000-8000-000000000002';

function tableResult(data: unknown) {
  const self: Record<string, unknown> = {};
  const resolved = { data, error: null };
  for (const method of ['select', 'eq', 'order']) {
    self[method] = vi.fn(() => self);
  }
  self.maybeSingle = vi.fn(async () => ({
    data: Array.isArray(data) ? (data[0] ?? null) : data,
    error: null,
  }));
  self.then = (resolve: (value: unknown) => unknown) => resolve(resolved);
  return self;
}

function fakeServiceClient(tables: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => tableResult(tables[table] ?? null)),
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => tableResult(tables[`zoom_internal.${table}`] ?? null)),
    })),
  };
}

function fakeEffective(rows: Array<Record<string, unknown>>, source: 'report' | 'webhook' | 'none') {
  const store: AttendanceEffectiveStore = {
    findWinningBatchId: vi.fn(async () => (source === 'report' ? 'batch-1' : null)),
    listReportRows: vi.fn(async () => rows as never),
    listWebhookRows: vi.fn(async () => (source === 'webhook' ? (rows as never) : [])),
  };
  mockEffectiveStore.mockReturnValue(store);
}

function row(userId: string | null, displayName: string, joinedAt: string, leftAt: string | null) {
  return {
    id: `row-${displayName}-${joinedAt}`,
    userId,
    customerKey: null,
    displayName,
    transientEmail: null,
    matchedBy: userId ? 'customer_key' : 'unmatched',
    joinedAt,
    leftAt,
    source: 'webhook',
  };
}

const BASE_TABLES = (facilitatorRow: unknown) => ({
  consultor_sessions: { id: SESSION_ID, school_id: 9901 },
  session_facilitators: facilitatorRow,
  session_attendees: [
    {
      user_id: ATTENDEE_A,
      expected: true,
      attended: null,
      profiles: { first_name: 'Ana', last_name: 'Sintética' },
    },
    {
      user_id: ATTENDEE_B,
      expected: true,
      attended: null,
      profiles: { first_name: 'Benjamín', last_name: 'Sintético' },
    },
  ],
  'zoom_internal.zoom_meetings': { zoom_meeting_uuid: 'z7Occ/SG==' },
});

async function invoke(id: string = SESSION_ID) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'GET',
    query: { id },
  });
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: FACILITATOR, error: null });
  mockGetUserRoles.mockResolvedValue([{ role_type: 'consultor' }]);
  mockGetHighestRole.mockReturnValue('consultor');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('visibility — the §7 zoom_attendance row', () => {
  it('a consultor who is NOT the facilitator gets the same not-found a stranger gets', async () => {
    mockCreateServiceRoleClient.mockReturnValue(fakeServiceClient(BASE_TABLES(null)));
    fakeEffective([], 'none');

    const res = await invoke();
    expect(res._getStatusCode()).toBe(404);
  });

  it('a docente gets not-found too — no school role reaches Zoom attendance', async () => {
    mockGetHighestRole.mockReturnValue('docente');
    mockCreateServiceRoleClient.mockReturnValue(fakeServiceClient(BASE_TABLES(null)));
    fakeEffective([], 'none');

    const res = await invoke();
    expect(res._getStatusCode()).toBe(404);
  });

  it('the facilitator of THIS session reads suggestions', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient(BASE_TABLES({ id: 'sf-1' }))
    );
    fakeEffective([], 'webhook');

    const res = await invoke();
    expect(res._getStatusCode()).toBe(200);
  });

  it('an admin reads suggestions without being the facilitator', async () => {
    mockGetHighestRole.mockReturnValue('admin');
    mockCreateServiceRoleClient.mockReturnValue(fakeServiceClient(BASE_TABLES(null)));
    fakeEffective([], 'webhook');

    const res = await invoke();
    expect(res._getStatusCode()).toBe(200);
  });

  it('401s an unauthenticated caller and 400s a bad id', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('none') });
    expect((await invoke())._getStatusCode()).toBe(401);

    mockGetApiUser.mockResolvedValue({ user: FACILITATOR, error: null });
    expect((await invoke('nope'))._getStatusCode()).toBe(400);
  });
});

describe('suggestion semantics — the direction of failure', () => {
  beforeEach(() => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient(BASE_TABLES({ id: 'sf-1' }))
    );
  });

  it('under the COMPLETE report: matched rows are present, silence is absent', async () => {
    fakeEffective(
      [row(ATTENDEE_A, 'Ana Sintética', '2026-07-29T23:56:00.000Z', '2026-07-30T00:26:00.000Z')],
      'report'
    );

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.state).toBe('report');
    expect(data.provisional).toBe(false);
    const byId = Object.fromEntries(
      data.suggestions.map((suggestion: { user_id: string }) => [suggestion.user_id, suggestion])
    );
    expect(byId[ATTENDEE_A]).toMatchObject({
      suggestion: 'present',
      observed_minutes: 30,
      has_open_interval: false,
    });
    // The authoritative report not naming B IS data.
    expect(byId[ATTENDEE_B]).toMatchObject({ suggestion: 'absent', observed_minutes: null });
  });

  it('under PROVISIONAL webhook data: silence is no_data, never a suggested absence', async () => {
    fakeEffective(
      [row(ATTENDEE_A, 'Ana Sintética', '2026-07-29T23:56:00.000Z', null)],
      'webhook'
    );

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.state).toBe('webhook_provisional');
    expect(data.provisional).toBe(true);
    const byId = Object.fromEntries(
      data.suggestions.map((suggestion: { user_id: string }) => [suggestion.user_id, suggestion])
    );
    // A's interval is OPEN: present (a row exists) but minutes stay null — a state.
    expect(byId[ATTENDEE_A]).toMatchObject({
      suggestion: 'present',
      observed_minutes: null,
      has_open_interval: true,
    });
    expect(byId[ATTENDEE_B]).toMatchObject({ suggestion: 'no_data' });
  });

  it('rows the ingestion could not attribute are listed for the facilitator, grouped by name', async () => {
    fakeEffective(
      [
        row(null, 'Invitada Anónima', '2026-07-29T23:56:00.000Z', '2026-07-30T00:11:00.000Z'),
        row(null, 'Invitada Anónima', '2026-07-30T00:20:00.000Z', '2026-07-30T00:35:00.000Z'),
      ],
      'report'
    );

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.unmatched_rows).toEqual([
      { display_name: 'Invitada Anónima', observed_minutes: 30, has_open_interval: false },
    ]);
  });

  it('a session with no managed meeting reports no_meeting and no suggestions beyond attendees', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeServiceClient({ ...BASE_TABLES({ id: 'sf-1' }), 'zoom_internal.zoom_meetings': null })
    );

    const res = await invoke();
    const { data } = JSON.parse(res._getData());

    expect(data.state).toBe('no_meeting');
    expect(mockEffectiveStore).not.toHaveBeenCalled();
    expect(
      data.suggestions.every(
        (suggestion: { suggestion: string }) => suggestion.suggestion === 'no_data'
      )
    ).toBe(true);
  });
});
