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
import { SESSION_STATUS_CLOSES_JOIN } from '../../../lib/utils/meeting-join-policy';

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

/**
 * A live, joinable session. `status` and `modality` are NOT NULL columns the
 * route now gates on before it touches any meeting row (item 4); a fixture
 * without them would describe a row Postgres cannot hold.
 */
const sessionRow = {
  id: SESSION_ID,
  school_id: SCHOOL_ID,
  growth_community_id: COMMUNITY_ID,
  is_active: true,
  status: 'programada',
  modality: 'online',
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

/** A fully provisioned, joinable meeting — secrets and all. NO audio plan. */
const provisionedMeeting = {
  status: 'provisioned',
  join_url: JOIN_URL,
  passcode: PASSCODE,
  zoom_meeting_number: MEETING_NUMBER,
};

/**
 * Z2-4e: synthetic dial-in entries, in Chile's reserved-for-fiction 55xx block. The
 * second carries a field this code does not know (`quality`) and the third carries no
 * usable number at all — both are the whitelist's job.
 */
const DIAL_IN_NUMBER_A = '+56 2 5555 0130';
const DIAL_IN_NUMBER_B = '+56 32 5555 0131';
const UNKNOWN_PASSENGER = 'SYNTHETIC_UNKNOWN_FIELD';

/** The same meeting on a tenant that DOES have an audio plan. */
const dialInMeeting = {
  ...provisionedMeeting,
  dial_in_numbers: [
    { country: 'CL', country_name: 'Chile', city: 'Santiago', number: DIAL_IN_NUMBER_A, type: 'toll' },
    { country_name: 'Chile', number: DIAL_IN_NUMBER_B, quality: UNKNOWN_PASSENGER },
    { country_name: 'Chile', city: 'Concepción' },
  ],
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

/**
 * Z2-4e [G2] [G3] [G4] — the dial-in widening.
 *
 * Ruling 1 permits the dial-in set, the meeting number and the passcode to leave
 * through THIS opening, because it already returns the passcode-embedded `join_url`
 * to exactly the caller entitled to join. The claim these tests carry is that the
 * widening reached the SUCCESSFUL response and nothing else.
 */
describe('POST /api/meet/session/[id]/join — dial-in on the link payload [G2]', () => {
  it('carries the numbers, the meeting number and the passcode to an authorized caller', async () => {
    arrange({ meeting: dialInMeeting });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      data: {
        mode: 'link',
        join_url: JOIN_URL,
        role: 'host',
        dial_in: {
          numbers: [
            { number: DIAL_IN_NUMBER_A, country_name: 'Chile', city: 'Santiago', type: 'toll' },
            { number: DIAL_IN_NUMBER_B, country_name: 'Chile' },
          ],
          meeting_number: String(MEETING_NUMBER),
          passcode: PASSCODE,
        },
      },
    });
  });

  it('an expected attendee gets it too — it is the join policy that decides, not the role', async () => {
    arrange({ isExpectedAttendee: true, meeting: dialInMeeting });
    asAttendee();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData()).data;
    expect(payload.role).toBe('participant');
    expect(payload.dial_in.numbers[0].number).toBe(DIAL_IN_NUMBER_A);
  });

  it('drops an entry with no dialable number, and every field the whitelist does not name', async () => {
    arrange({ meeting: dialInMeeting });
    asAdmin();

    const res = await post();
    const body = res._getData();

    // The third fixture entry (Concepción, no number) would render as a blank line.
    expect(JSON.parse(body).data.dial_in.numbers).toHaveLength(3 - 1);
    expect(body).not.toContain('Concepción');
    // A field Zoom added that nobody has read must not travel: `zoom_meetings.
    // dial_in_numbers` holds the array verbatim and the client parses with no
    // whitelist, so this is the only place it can be stopped.
    expect(body).not.toContain(UNKNOWN_PASSENGER);
    expect(body).not.toContain('quality');
  });

  it("never appears on a 'pending' answer, whatever the row holds [G4]", async () => {
    arrange({ meeting: { ...dialInMeeting, status: 'error' } });
    asAdmin();

    const res = await post();

    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
    expect(res._getData()).not.toContain(DIAL_IN_NUMBER_A);
  });
});

describe('POST /api/meet/session/[id]/join — no audio plan still joins [G4]', () => {
  for (const [label, column] of [
    ['a NULL dial_in_numbers (no audio plan)', null],
    ['an empty array', []],
    ['entries that carry no usable number', [{ country_name: 'Chile' }]],
  ] as Array<[string, unknown]>) {
    it(`${label} → a normal successful join with no dial_in key at all`, async () => {
      arrange({ meeting: { ...provisionedMeeting, dial_in_numbers: column } });
      asAdmin();

      const res = await post();

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({
        data: { mode: 'link', join_url: JOIN_URL, role: 'host' },
      });
      // Absent, not `null` and not `[]` — the page renders nothing off an absent key.
      expect(Object.keys(JSON.parse(res._getData()).data)).not.toContain('dial_in');
    });
  }

  it('a meeting with numbers but no meeting number withholds the whole block', async () => {
    // Half a dial-in is a phone call that reaches a prompt the caller cannot answer.
    arrange({ meeting: { ...dialInMeeting, zoom_meeting_number: null } });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.dial_in).toBeUndefined();
    expect(res._getData()).not.toContain(DIAL_IN_NUMBER_A);
  });
});

/**
 * [G3] — the criterion that proves ruling 1 was implemented as a widening of the
 * SUCCESSFUL response only.
 *
 * Each refusal is produced twice against the very same scenario: once with a meeting
 * row that has no audio plan, once with the dial-in row. The bytes are compared
 * against EACH OTHER, so the assertion is the property itself — a refused caller
 * cannot tell whether this meeting has dial-in data, let alone read it.
 */
describe('POST /api/meet/session/[id]/join — every refusal is byte-identical [G3]', () => {
  const refusals: Array<[string, () => void, Scenario]> = [
    ['404 — other-school caller', asOtherSchoolUser, {}],
    ['403 — growth-community member', asGcMember, {}],
    ['403 — same-school non-facilitator consultor', asSameSchoolConsultor, {}],
    [
      '410 — cancelled projection, admin',
      asAdmin,
      { projection: { meeting_status: 'cancelled' } },
    ],
    ['410 — ended projection, facilitator', asFacilitator, {
      isFacilitator: true,
      projection: { meeting_status: 'ended' },
    }],
    ['500 — projection read failure', asAdmin, { projectionError: { message: 'boom' } }],
  ];

  for (const [label, persona, scenario] of refusals) {
    it(`${label} is the same status and the same bytes with and without dial-in data`, async () => {
      arrange({ ...scenario, meeting: provisionedMeeting });
      persona();
      const before = await post();
      const beforeStatus = before._getStatusCode();
      const beforeBody = before._getData();

      arrange({ ...scenario, meeting: dialInMeeting });
      persona();
      const after = await post();

      expect(after._getStatusCode()).toBe(beforeStatus);
      expect(after._getData()).toBe(beforeBody);
      expect(after._getData()).not.toContain(DIAL_IN_NUMBER_A);
      expect(after._getData()).not.toContain(DIAL_IN_NUMBER_B);
      expect(after._getData()).not.toContain(PASSCODE);
      expect(after._getData()).not.toContain(String(MEETING_NUMBER));
    });
  }

  it('the 503 kill switch and the 405 are unreachable by any meeting state', async () => {
    // Both answer before a client is built, so a dial-in row cannot reach them at all.
    arrange({ meeting: dialInMeeting });
    process.env.FEATURE_ZOOM_MEETINGS = 'false';
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(503);
    expect(res._getData()).not.toContain(DIAL_IN_NUMBER_A);
    expect(tablesRead).toEqual([]);
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

/**
 * Sol item 4 — the source of truth is what closes the join.
 *
 * The window this closes: cancelling a session writes `consultor_sessions` and
 * ENQUEUES `meeting_delete`. Until that job runs, `session_meetings_public`
 * still says `scheduled` and `zoom_internal.zoom_meetings` still holds a live
 * `join_url`, passcode, meeting number and dial-in set. Every scenario below
 * reproduces exactly that state — the projection stale, the credentials intact
 * — and the caller is an AUTHORIZED one, because an intruder was never the
 * problem here.
 */
describe('POST /api/meet/session/[id]/join — the source of truth closes the join [item 4]', () => {
  /** The projection saying "joinable" while the source row says otherwise. */
  const STALE_PROJECTION = { meeting_status: 'scheduled' };

  /** Every authorized persona, since a cancelled session is gone for all of them. */
  const authorizedPersonas: Array<[string, () => void, Scenario]> = [
    ['admin', asAdmin, {}],
    ['assigned facilitator', asFacilitator, { isFacilitator: true }],
    ['expected attendee', asAttendee, { isExpectedAttendee: true }],
  ];

  for (const [label, persona, extra] of authorizedPersonas) {
    it(`[K1] a CANCELLED session refuses ${label} while the projection still says joinable`, async () => {
      arrange({
        ...extra,
        session: { ...sessionRow, status: 'cancelada' },
        projection: STALE_PROJECTION,
        meeting: dialInMeeting,
      });
      persona();

      const res = await post();
      const body = res._getData();

      expect(res._getStatusCode()).toBe(410);
      expect(JSON.parse(body).error).toBe('Esta reunión ya no está disponible');

      // The four values the stale internal row is still holding. Asserted on the
      // serialized body, so a leak through an unexpected key is caught too.
      expect(body).not.toContain(JOIN_URL);
      expect(body).not.toContain(PASSCODE);
      expect(body).not.toContain(String(MEETING_NUMBER));
      expect(body).not.toContain(DIAL_IN_NUMBER_A);
      expect(body).not.toContain(DIAL_IN_NUMBER_B);
    });

    it(`[K2] a flip to 'presencial' refuses ${label} on the same stale state`, async () => {
      arrange({
        ...extra,
        session: { ...sessionRow, modality: 'presencial' },
        projection: STALE_PROJECTION,
        meeting: dialInMeeting,
      });
      persona();

      const res = await post();
      const body = res._getData();

      expect(res._getStatusCode()).toBe(410);
      expect(body).not.toContain(JOIN_URL);
      expect(body).not.toContain(PASSCODE);
      expect(body).not.toContain(String(MEETING_NUMBER));
      expect(body).not.toContain(DIAL_IN_NUMBER_A);
    });
  }

  it('[K1] every status the closed set names refuses, and the open ones do not', async () => {
    for (const [status, isClosed] of Object.entries(SESSION_STATUS_CLOSES_JOIN)) {
      arrange({
        session: { ...sessionRow, status },
        projection: STALE_PROJECTION,
        meeting: provisionedMeeting,
      });
      asAdmin();

      const res = await post();

      expect(res._getStatusCode(), `status '${status}'`).toBe(isClosed ? 410 : 200);
      if (isClosed) {
        expect(res._getData(), `status '${status}'`).not.toContain(JOIN_URL);
      }
    }
  });

  it('[K3] the credentials are not READ on the refusal path, not merely not returned', async () => {
    arrange({
      session: { ...sessionRow, status: 'cancelada' },
      projection: STALE_PROJECTION,
      meeting: dialInMeeting,
    });
    // A double that detonates on contact. `mockInternalClient` is what
    // `zoomInternalSchema()` hands the route, so this fails the test if the
    // route addresses `zoom_internal` at all — the ordering claim is that the
    // refusal is reachable with the internal row fully populated and untouched.
    mockInternalClient = {
      from: (table: string) => {
        tablesRead.push(table);
        throw new Error(`zoom_internal.${table} was addressed on a refusal path`);
      },
    };
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(410);
    // Not a 500: had the throwing double been reached, the route's catch would
    // have turned it into one. 410 is the proof it was never called.
    expect(tablesRead).not.toContain('zoom_meetings');
    // And the gate runs before the projection read too, so the whole tail of
    // the route is unreached.
    expect(tablesRead).not.toContain('session_meetings_public');
    expect(tablesRead).toEqual(['consultor_sessions']);
  });

  it('[K3] the same throwing double DOES detonate on the joinable path — it is not inert', async () => {
    // The negative control for the assertion above: if the double could never
    // fire, `expect(410)` would prove nothing about ordering.
    arrange({ projection: STALE_PROJECTION, meeting: dialInMeeting });
    mockInternalClient = {
      from: (table: string) => {
        tablesRead.push(table);
        throw new Error(`zoom_internal.${table} was addressed on a refusal path`);
      },
    };
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(500);
    expect(tablesRead).toContain('zoom_meetings');
  });

  it('[K4] a refusal that already existed does not become a 410', async () => {
    // The order rule: the source-of-truth gate runs AFTER authorization, so it
    // can never convert a 403/404 into a 410 — the other-school caller must not
    // learn that this session was cancelled, which is a fact about a session
    // they may not know exists.
    for (const [label, persona, expected] of [
      ['other-school', asOtherSchoolUser, 404],
      ['growth-community member', asGcMember, 403],
      ['same-school consultor', asSameSchoolConsultor, 403],
    ] as Array<[string, () => void, number]>) {
      arrange({
        session: { ...sessionRow, status: 'cancelada' },
        projection: STALE_PROJECTION,
        meeting: dialInMeeting,
      });
      persona();

      const res = await post();

      expect(res._getStatusCode(), label).toBe(expected);
      expect(res._getData(), label).not.toContain(JOIN_URL);
    }
  });

  it('[K4] every pre-existing refusal is byte-identical to itself on a live session', async () => {
    // The baseline is the suite's own live fixture: the same persona, the same
    // scenario, once with the session live and once with it cancelled. The
    // bytes are compared against each other, so this fails if the new gate
    // moved a single character of an existing denial.
    for (const [label, persona] of [
      ['other-school', asOtherSchoolUser],
      ['growth-community member', asGcMember],
      ['same-school consultor', asSameSchoolConsultor],
    ] as Array<[string, () => void]>) {
      arrange({ meeting: dialInMeeting });
      persona();
      const live = await post();
      const liveStatus = live._getStatusCode();
      const liveBody = live._getData();

      arrange({
        session: { ...sessionRow, status: 'cancelada' },
        projection: STALE_PROJECTION,
        meeting: dialInMeeting,
      });
      persona();
      const cancelled = await post();

      expect(cancelled._getStatusCode(), label).toBe(liveStatus);
      expect(cancelled._getData(), label).toBe(liveBody);
    }
  });

  it('[K5] the happy path is untouched — a live online session still yields the link', async () => {
    arrange({ meeting: dialInMeeting });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData()).data;
    expect(payload.mode).toBe('link');
    expect(payload.join_url).toBe(JOIN_URL);
    expect(payload.role).toBe('host');
    expect(payload.dial_in.meeting_number).toBe(String(MEETING_NUMBER));
  });

  it("[K5] a 'hibrida' session is as joinable as an online one", async () => {
    arrange({ session: { ...sessionRow, modality: 'hibrida' }, meeting: provisionedMeeting });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.mode).toBe('link');
  });

  it("a draft session still answers 'pending', not 410 — 'not yet' is not 'no longer'", async () => {
    arrange({
      session: { ...sessionRow, status: 'borrador' },
      projection: null,
      meeting: null,
    });
    asAdmin();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ data: { mode: 'pending' } });
  });
});
