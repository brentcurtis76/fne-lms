// @vitest-environment node
/**
 * Z2-2a [A2]–[A8] — POST /api/meet/session/[id]/join.
 *
 * The route runs against the REAL `authorizeMeetingJoin` and the REAL response
 * helpers; only the auth check and the Supabase clients are stubbed. That is
 * deliberate: [A2] and [A3] are claims about the bytes a caller receives, and a
 * mocked policy or a mocked `sendAuthError` would let the suite pass while the
 * shipped bodies differed.
 *
 * Synthetic data only. The fixture secrets below exist so the assertions can
 * prove they never appear in a response.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateServiceRoleClient, mockGetUserRoles, mockGetHighestRole } =
  vi.hoisted(() => ({
    mockGetApiUser: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockGetHighestRole: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
    logApiRequest: vi.fn(),
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

// The private schema is reached only through these two, so stubbing them is
// what keeps `zoom_internal` out of the test environment entirely.
vi.mock('../../../lib/zoom/service-client', () => ({
  createZoomServiceClient: vi.fn(() => ({ __internal: true })),
  zoomInternalSchema: vi.fn(() => mockInternalClient),
}));

import handler from '../../../pages/api/meet/session/[id]/join';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const MISSING_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';
/** A real, unrelated session — used to prove a meeting read is bound to its surface. */
const OTHER_SESSION_ID = '5b3e7171-2131-4f5a-9c33-4d8e0f203b44';
const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

const ADMIN_USER_ID = 'u-admin-0001';
const FACILITATOR_USER_ID = 'u-facilitator-0001';
const ATTENDEE_USER_ID = 'u-attendee-0001';
const GC_USER_ID = 'u-gc-member-0001';
const CONSULTOR_USER_ID = 'u-consultor-0001';
const OUTSIDER_USER_ID = 'u-outsider-0001';

/** Synthetic stand-ins for the three secret-shaped fields (§5). */
const JOIN_URL = 'https://example.test/j/900000001?pwd=SYNTHETIC_PWD';
const PASSCODE = 'SYNTHETIC_PWD';
const MEETING_NUMBER = 900000001;

const sessionRow = {
  id: SESSION_ID,
  school_id: SCHOOL_ID,
  growth_community_id: COMMUNITY_ID,
  is_active: true,
};

const gcRole = {
  role_type: 'docente',
  is_active: true,
  school_id: SCHOOL_ID,
  community_id: COMMUNITY_ID,
};

const consultorRole = (schoolId: number | null) => ({
  role_type: 'consultor',
  is_active: true,
  school_id: schoolId === null ? null : String(schoolId),
});

/**
 * A seeded row: the column values it actually carries (`match` — what Postgres
 * would compare every `.eq()` against) and the columns the `select()` returns.
 */
type TableEntry = { match?: Record<string, unknown>; data: unknown; error?: unknown };

type TableResults = Record<string, TableEntry>;

/** The stub `zoomInternalSchema()` hands back; reassigned per test. */
let mockInternalClient: { from: (table: string) => unknown };

/** Every table `from()` was called with, in order — the ordering evidence. */
let tablesRead: string[];

/**
 * Resolve a lookup the way the database would: the seeded row is returned only
 * if EVERY recorded filter matches one of its column values. A `surface_id`
 * that belongs to another session, or a `user_id` that belongs to another
 * caller, resolves as "no row" — which is what makes dropping one of those
 * filters visible to the assertions instead of invisible to them.
 */
function resolveEntry(entry: TableEntry, filters: Array<[string, unknown]>) {
  if (entry.error) {
    return { data: null, error: entry.error };
  }
  if (entry.data === null || entry.data === undefined) {
    return { data: null, error: null };
  }

  const match = entry.match ?? {};
  const satisfied = filters.every(
    ([column, value]) => column in match && Object.is(match[column], value)
  );

  return satisfied ? { data: entry.data, error: null } : { data: null, error: null };
}

/** Chainable Supabase stub — records the `(column, value)` pairs it is given. */
function chainable(entry: TableEntry) {
  const filters: Array<[string, unknown]> = [];
  const settle = () => resolveEntry(entry, filters);

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(settle());
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return vi.fn(() => ({
          then: (resolve: (v: unknown) => void) => resolve(settle()),
        }));
      }
      if (prop === 'eq') {
        return vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return chain;
        });
      }
      return vi.fn(() => chain);
    },
  };

  const chain = new Proxy({}, handler);
  return chain;
}

function buildClient(results: TableResults) {
  return {
    from: vi.fn((table: string) => {
      tablesRead.push(table);
      return chainable(results[table] ?? { data: null });
    }),
  };
}

/**
 * A roster row belongs to the persona that would legitimately hold it, so
 * `isFacilitator` / `isExpectedAttendee` keep meaning "this caller is on the
 * list". `facilitator` / `attendee` seed one for somebody else instead.
 */
type FacilitatorSeed = { userId?: string };
type AttendeeSeed = { userId?: string; expected?: boolean };

type Scenario = {
  session?: unknown;
  isFacilitator?: boolean;
  isExpectedAttendee?: boolean;
  facilitator?: FacilitatorSeed;
  attendee?: AttendeeSeed;
  projection?: unknown;
  meeting?: unknown;
  /** Which session the seeded `zoom_meetings` row actually belongs to. */
  meetingSurfaceId?: string;
  projectionError?: unknown;
  meetingError?: unknown;
};

function arrange(scenario: Scenario = {}) {
  const session = 'session' in scenario ? scenario.session : sessionRow;
  const facilitator = scenario.facilitator ?? (scenario.isFacilitator ? {} : null);
  const attendee = scenario.attendee ?? (scenario.isExpectedAttendee ? {} : null);

  mockCreateServiceRoleClient.mockImplementation(() =>
    buildClient({
      consultor_sessions: {
        match: { id: (session as { id?: string } | null)?.id },
        data: session,
      },
      session_facilitators: facilitator
        ? {
            match: {
              session_id: SESSION_ID,
              user_id: facilitator.userId ?? FACILITATOR_USER_ID,
            },
            data: { id: 'sf-1' },
          }
        : { data: null },
      session_attendees: attendee
        ? {
            match: {
              session_id: SESSION_ID,
              user_id: attendee.userId ?? ATTENDEE_USER_ID,
              expected: attendee.expected ?? true,
            },
            data: { id: 'sa-1' },
          }
        : { data: null },
      session_meetings_public: {
        match: { surface_type: 'consultor_session', surface_id: SESSION_ID },
        data: 'projection' in scenario ? scenario.projection : { meeting_status: 'scheduled' },
        error: scenario.projectionError ?? null,
      },
    })
  );

  mockInternalClient = buildClient({
    zoom_meetings: {
      match: {
        surface_type: 'consultor_session',
        surface_id: scenario.meetingSurfaceId ?? SESSION_ID,
      },
      data: 'meeting' in scenario ? scenario.meeting : null,
      error: scenario.meetingError ?? null,
    },
  });
}

/** A fully provisioned, joinable meeting — secrets and all. */
const provisionedMeeting = {
  status: 'provisioned',
  join_url: JOIN_URL,
  passcode: PASSCODE,
  zoom_meeting_number: MEETING_NUMBER,
};

function actAs(userId: string, roles: Record<string, unknown>[], highestRole: string | null) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockGetUserRoles.mockResolvedValue(roles);
  mockGetHighestRole.mockReturnValue(highestRole);
}

const asAdmin = () => actAs(ADMIN_USER_ID, [{ role_type: 'admin', is_active: true }], 'admin');
const asFacilitator = () =>
  actAs(FACILITATOR_USER_ID, [consultorRole(SCHOOL_ID)], 'consultor');
const asAttendee = () => actAs(ATTENDEE_USER_ID, [gcRole], 'docente');
const asGcMember = () => actAs(GC_USER_ID, [gcRole], 'docente');
const asSameSchoolConsultor = () =>
  actAs(CONSULTOR_USER_ID, [consultorRole(SCHOOL_ID)], 'consultor');
const asOtherSchoolUser = () =>
  actAs(OUTSIDER_USER_ID, [consultorRole(OTHER_SCHOOL_ID)], 'consultor');

async function post(sessionId: string = SESSION_ID) {
  const { req, res } = createMocks({
    method: 'POST',
    query: { id: sessionId },
  });
  await handler(req as never, res as never);
  return res;
}

let originalFlag: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  tablesRead = [];
  originalFlag = process.env.FEATURE_ZOOM_MEETINGS;
  process.env.FEATURE_ZOOM_MEETINGS = 'true';
  arrange();
});

afterEach(() => {
  // Restore by DELETING when it was absent — assigning `undefined` stores the
  // string "undefined", and this suite shares `process.env` with every other.
  if (originalFlag === undefined) {
    delete process.env.FEATURE_ZOOM_MEETINGS;
  } else {
    process.env.FEATURE_ZOOM_MEETINGS = originalFlag;
  }
});

describe('POST /api/meet/session/[id]/join — method and authentication', () => {
  it('GET is 405', async () => {
    asAdmin();
    const { req, res } = createMocks({ method: 'GET', query: { id: SESSION_ID } });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('POST');
  });

  it('anonymous is 401 and never reaches the database', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No active session') });

    const res = await post();

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('POST /api/meet/session/[id]/join — kill switch [A4]', () => {
  it("FEATURE_ZOOM_MEETINGS = 'false' → 503 es-CL with no lookup at all", async () => {
    process.env.FEATURE_ZOOM_MEETINGS = 'false';
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(503);
    expect(JSON.parse(res._getData()).error).toBe(
      'Las videollamadas están temporalmente deshabilitadas'
    );
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(tablesRead).toEqual([]);
  });

  it('FEATURE_ZOOM_MEETINGS unset → the same 503, still with no lookup', async () => {
    delete process.env.FEATURE_ZOOM_MEETINGS;
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(503);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(tablesRead).toEqual([]);
  });
});

describe('POST /api/meet/session/[id]/join — denials are one response [A2] [A3]', () => {
  it('other-school caller is byte-identical to a nonexistent session', async () => {
    asOtherSchoolUser();
    const denied = await post();
    const deniedStatus = denied._getStatusCode();
    const deniedBody = denied._getData();

    arrange({ session: null });
    asOtherSchoolUser();
    const absent = await post(MISSING_SESSION_ID);

    // Compared against EACH OTHER, not against a literal: the property is that
    // the two cannot be told apart.
    expect(deniedStatus).toBe(absent._getStatusCode());
    expect(deniedBody).toBe(absent._getData());
    expect(deniedStatus).toBe(404);
    expect(JSON.parse(deniedBody).error).toBe('Sesión no encontrada');
  });

  it('the GC member gets a 403 that names the attendee list', async () => {
    asGcMember();
    const res = await post();

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('lista de asistentes');
  });

  it('the same-school non-facilitator consultor gets a 403 that does not', async () => {
    asSameSchoolConsultor();
    const res = await post();

    expect(res._getStatusCode()).toBe(403);
    const message = JSON.parse(res._getData()).error;
    expect(message).not.toContain('asistentes');
    expect(message).toBe('No tienes acceso para unirte a esta reunión.');
  });

  it('no 403 or 404 body carries a join_url, passcode or meeting number [A3]', async () => {
    const personas: Array<[string, () => void]> = [
      ['gc-member', asGcMember],
      ['same-school-consultor', asSameSchoolConsultor],
      ['other-school', asOtherSchoolUser],
    ];

    for (const [label, persona] of personas) {
      // A fully provisioned meeting exists — so if any denial leaked meeting
      // state, these assertions would see the real values.
      arrange({ meeting: provisionedMeeting });
      persona();

      const res = await post();
      const body = res._getData();

      expect([403, 404]).toContain(res._getStatusCode());
      // Serialized body, not a field lookup: a leak in a nested or unexpected
      // key is exactly what a field lookup would miss.
      expect(body).not.toContain(JOIN_URL);
      expect(body).not.toContain(PASSCODE);
      expect(body).not.toContain(String(MEETING_NUMBER));
    }
  });
});

describe('POST /api/meet/session/[id]/join — closed meetings [A5] [A8]', () => {
  for (const closedStatus of ['cancelled', 'ended']) {
    it(`projection '${closedStatus}' → 410 for admin, facilitator and expected attendee`, async () => {
      const personas: Array<[string, () => void, Scenario]> = [
        ['admin', asAdmin, {}],
        ['facilitator', asFacilitator, { isFacilitator: true }],
        ['attendee', asAttendee, { isExpectedAttendee: true }],
      ];

      for (const [label, persona, extra] of personas) {
        arrange({
          ...extra,
          projection: { meeting_status: closedStatus },
          meeting: provisionedMeeting,
        });
        persona();

        const res = await post();

        expect(res._getStatusCode()).toBe(410);
        expect(res._getData()).not.toContain(JOIN_URL);
        expect(JSON.parse(res._getData()).error).toBe('Esta reunión ya no está disponible');
      }
    });
  }

  it('an other-school caller gets 404 for a CANCELLED meeting, not 410 [A8]', async () => {
    arrange({
      projection: { meeting_status: 'cancelled' },
      meeting: provisionedMeeting,
    });
    asOtherSchoolUser();

    const res = await post();

    expect(res._getStatusCode()).toBe(404);
    // Authorization ran to completion before any meeting row was touched.
    expect(tablesRead).not.toContain('session_meetings_public');
    expect(tablesRead).not.toContain('zoom_meetings');
  });
});

describe('POST /api/meet/session/[id]/join — pending [A6]', () => {
  it("no meeting row → 200 { mode: 'pending' } with no secrets", async () => {
    arrange({ meeting: null });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
  });

  it("a meeting still in 'pending' → 200 { mode: 'pending' }", async () => {
    arrange({ meeting: { status: 'pending', join_url: null } });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
  });

  it("a meeting in 'error' never yields a link even if it carries one", async () => {
    arrange({ meeting: { ...provisionedMeeting, status: 'error' } });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
    expect(res._getData()).not.toContain(JOIN_URL);
  });

  it('no projection row yet → pending, not 410', async () => {
    arrange({ projection: null, meeting: null });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
  });
});

describe('POST /api/meet/session/[id]/join — the link payload [A7]', () => {
  it('admin → host', async () => {
    arrange({ meeting: provisionedMeeting });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      data: { mode: 'link', join_url: JOIN_URL, role: 'host' },
    });
  });

  it('assigned facilitator → host', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting });
    asFacilitator();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      data: { mode: 'link', join_url: JOIN_URL, role: 'host' },
    });
  });

  it('expected attendee → participant', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      data: { mode: 'link', join_url: JOIN_URL, role: 'participant' },
    });
  });

  it('the payload carries the join_url and nothing else from the meeting row', async () => {
    arrange({ meeting: provisionedMeeting });
    asAdmin();

    const res = await post();
    const body = res._getData();

    expect(body).toContain(JOIN_URL);
    // The passcode and meeting number live in the same row and must not ride along.
    // (The join_url itself carries `?pwd=` — that is §5's documented residual risk,
    // and is why this asserts on the standalone fields rather than the substring.)
    expect(JSON.parse(body).data).toEqual({
      mode: 'link',
      join_url: JOIN_URL,
      role: 'host',
    });
    expect(Object.keys(JSON.parse(body).data)).toEqual(['mode', 'join_url', 'role']);
  });

  it('a started meeting is joinable too', async () => {
    arrange({
      projection: { meeting_status: 'live' },
      meeting: { ...provisionedMeeting, status: 'started' },
    });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.mode).toBe('link');
  });
});

/**
 * The two reads past the authorization line are keyed by `surface_id`, and the
 * roster read by `user_id`. Each of those filters is one line away from handing
 * another session's `join_url` — or this session's — to the wrong caller, so
 * each is asserted against a row that exists but belongs somewhere else.
 */
describe('POST /api/meet/session/[id]/join — the reads are bound to their filters', () => {
  it("a provisioned meeting for a DIFFERENT session is not this session's link", async () => {
    arrange({ meeting: provisionedMeeting, meetingSurfaceId: OTHER_SESSION_ID });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
    expect(res._getData()).not.toContain(JOIN_URL);
  });

  it('an expected-attendee row belonging to ANOTHER user does not yield a link', async () => {
    arrange({
      attendee: { userId: ATTENDEE_USER_ID },
      meeting: provisionedMeeting,
    });
    asGcMember();

    const res = await post();

    expect(res._getStatusCode()).toBe(403);
    expect(res._getData()).not.toContain(JOIN_URL);
  });
});

describe('POST /api/meet/session/[id]/join — read failures never become a link', () => {
  it('a projection read error is a 500, not a served link', async () => {
    arrange({ projectionError: { message: 'boom' }, meeting: provisionedMeeting });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(500);
    expect(res._getData()).not.toContain(JOIN_URL);
  });

  it('a meeting read error is a 500, not a pending answer', async () => {
    arrange({ meetingError: { message: 'boom' } });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(500);
  });
});
