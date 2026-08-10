// @vitest-environment node
/**
 * Z3-1 [A2]–[A9] — the SDK outcome of POST /api/meet/session/[id]/join.
 *
 * Same construction as `session-join.test.ts`, and for the same reason: the route
 * runs against the REAL `authorizeMeetingJoin`, the REAL signer and the REAL
 * response helpers, with only the auth check and the Supabase clients stubbed.
 * Every criterion below is a claim about the bytes a caller receives, and a mocked
 * policy or a mocked signer would let the suite pass while the shipped payload
 * differed.
 *
 * Synthetic data only. The fixture SDK secret exists so [A9] can prove it never
 * leaves, and the fixture UUID exists so [A6] can assert its stripped form
 * literally rather than by recomputing it the way the route does.
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

vi.mock('../../../lib/zoom/service-client', () => ({
  createZoomServiceClient: vi.fn(() => ({ __internal: true })),
  zoomInternalSchema: vi.fn(() => mockInternalClient),
}));

import handler from '../../../pages/api/meet/session/[id]/join';
import { SDK_JOIN_TTL_SECONDS } from '../../../lib/zoom/signer';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const MISSING_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';
const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

/**
 * Real UUIDs here, unlike the Z2 suite's opaque ids: `customer_key` is the caller's
 * UUID with its hyphens removed, and [A6] asserts the stripped form as a literal.
 */
const ADMIN_USER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const FACILITATOR_USER_ID = '2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e';
const ATTENDEE_USER_ID = '7d2f9a41-58c3-4e77-9b10-6a4e2c8d0f31';
/** The same UUID with every hyphen removed — written out, not recomputed. */
const ATTENDEE_CUSTOMER_KEY = '7d2f9a4158c34e779b106a4e2c8d0f31';
const GC_USER_ID = '3c4d5e6f-7081-4c9d-8e0f-2a3b4c5d6e7f';
const OUTSIDER_USER_ID = '4d5e6f70-8192-4d0e-9f10-3b4c5d6e7f80';

/** Synthetic stand-ins for the secret-shaped fields (§5). */
const JOIN_URL = 'https://example.test/j/900000001?pwd=SYNTHETIC_PWD';
const PASSCODE = 'SYNTHETIC_PWD';
const MEETING_NUMBER = 900000001;

/** Synthetic Meeting SDK credentials. The secret must never reach a response. */
const SDK_CLIENT_ID = 'SYNTHETIC_SDK_CLIENT_ID';
const SDK_CLIENT_SECRET = 'SYNTHETIC_SDK_CLIENT_SECRET';

const ATTENDEE_FIRST_NAME = 'Camila';
const ATTENDEE_LAST_NAME = 'Sintética';

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

type TableEntry = { match?: Record<string, unknown>; data: unknown; error?: unknown };
type TableResults = Record<string, TableEntry>;

let mockInternalClient: { from: (table: string) => unknown };
let tablesRead: string[];

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

/** Every `select()` the route issued, in order — the disclosure evidence for [A9]. */
let columnsSelected: string[];

function buildClient(results: TableResults) {
  return {
    from: vi.fn((table: string) => {
      tablesRead.push(table);
      const chain = chainable(results[table] ?? { data: null });
      return new Proxy(chain as Record<string, unknown>, {
        get(target, prop, receiver) {
          if (prop === 'select') {
            return vi.fn((columns: string) => {
              columnsSelected.push(columns);
              return (target as { select: (c: string) => unknown }).select(columns);
            });
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    }),
  };
}

type Scenario = {
  session?: unknown;
  isFacilitator?: boolean;
  isExpectedAttendee?: boolean;
  projection?: unknown;
  meeting?: unknown;
  /** Seeded `profiles` row for the attendee; `null` seeds no row at all. */
  profile?: { first_name?: unknown; last_name?: unknown } | null;
};

function arrange(scenario: Scenario = {}) {
  const session = 'session' in scenario ? scenario.session : sessionRow;
  const profile =
    'profile' in scenario
      ? scenario.profile
      : { first_name: ATTENDEE_FIRST_NAME, last_name: ATTENDEE_LAST_NAME };

  mockCreateServiceRoleClient.mockImplementation(() =>
    buildClient({
      consultor_sessions: {
        match: { id: (session as { id?: string } | null)?.id },
        data: session,
      },
      session_facilitators: scenario.isFacilitator
        ? {
            match: { session_id: SESSION_ID, user_id: FACILITATOR_USER_ID },
            data: { id: 'sf-1' },
          }
        : { data: null },
      session_attendees: scenario.isExpectedAttendee
        ? {
            match: { session_id: SESSION_ID, user_id: ATTENDEE_USER_ID, expected: true },
            data: { id: 'sa-1' },
          }
        : { data: null },
      session_meetings_public: {
        match: { surface_type: 'consultor_session', surface_id: SESSION_ID },
        data: 'projection' in scenario ? scenario.projection : { meeting_status: 'scheduled' },
      },
      profiles: {
        match: { id: ATTENDEE_USER_ID },
        data: profile,
      },
    })
  );

  mockInternalClient = buildClient({
    zoom_meetings: {
      match: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      data: 'meeting' in scenario ? scenario.meeting : null,
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

/** The same meeting on a tenant that DOES have an audio plan (ruling ④). */
const dialInMeeting = {
  ...provisionedMeeting,
  dial_in_numbers: [
    { country_name: 'Chile', city: 'Santiago', number: '+56 2 5555 0130', type: 'toll' },
  ],
};

function actAs(userId: string, roles: Record<string, unknown>[], highestRole: string | null) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockGetUserRoles.mockResolvedValue(roles);
  mockGetHighestRole.mockReturnValue(highestRole);
}

const asAdmin = () => actAs(ADMIN_USER_ID, [{ role_type: 'admin', is_active: true }], 'admin');
const asFacilitator = () => actAs(FACILITATOR_USER_ID, [consultorRole(SCHOOL_ID)], 'consultor');
const asAttendee = () => actAs(ATTENDEE_USER_ID, [gcRole], 'docente');
const asGcMember = () => actAs(GC_USER_ID, [gcRole], 'docente');
const asOtherSchoolUser = () =>
  actAs(OUTSIDER_USER_ID, [consultorRole(OTHER_SCHOOL_ID)], 'consultor');

async function post(sessionId: string = SESSION_ID) {
  const { req, res } = createMocks({ method: 'POST', query: { id: sessionId } });
  await handler(req as never, res as never);
  return res;
}

/** The `data` envelope `sendApiResponse` wraps every success in. */
function payloadOf(res: ReturnType<typeof createMocks>['res']) {
  return JSON.parse(res._getData()).data as Record<string, unknown>;
}

/** Reads the claims back out of the minted JWT — no secret required. */
function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

const ENV_KEYS = [
  'FEATURE_ZOOM_MEETINGS',
  'FEATURE_ZOOM_EMBED',
  'ZOOM_SDK_CLIENT_ID',
  'ZOOM_SDK_CLIENT_SECRET',
] as const;

let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  tablesRead = [];
  columnsSelected = [];
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  process.env.FEATURE_ZOOM_MEETINGS = 'true';
  process.env.FEATURE_ZOOM_EMBED = 'true';
  process.env.ZOOM_SDK_CLIENT_ID = SDK_CLIENT_ID;
  process.env.ZOOM_SDK_CLIENT_SECRET = SDK_CLIENT_SECRET;
  arrange();
});

afterEach(() => {
  // Restore by DELETING what was absent — assigning `undefined` stores the string
  // "undefined", and this suite shares `process.env` with every other.
  for (const key of ENV_KEYS) {
    const previous = originalEnv[key];
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

describe('POST /api/meet/session/[id]/join — the SDK payload [A2] [A3]', () => {
  it('flag on + participant + joinable meeting → mode sdk with every field [A2]', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    const body = payloadOf(res);

    expect(body.mode).toBe('sdk');
    expect(body.sdk_key).toBe(SDK_CLIENT_ID);
    expect(body.meeting_number).toBe(String(MEETING_NUMBER));
    expect(body.passcode).toBe(PASSCODE);
    expect(body.user_name).toBe(`${ATTENDEE_FIRST_NAME} ${ATTENDEE_LAST_NAME}`);
    expect(body.customer_key).toBe(ATTENDEE_CUSTOMER_KEY);
    // Ruling ⑤: the descriptive role, never the numeric one.
    expect(body.role).toBe('participant');
    expect(typeof body.signature).toBe('string');

    expect(Object.keys(body)).toEqual([
      'mode',
      'signature',
      'sdk_key',
      'meeting_number',
      'passcode',
      'user_name',
      'customer_key',
      'role',
    ]);
  });

  it('the SDK payload has no join_url KEY at all [A3]', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const res = await post();
    const body = payloadOf(res);

    // Key-presence, not value: `toBeUndefined()` passes for an absent key AND for
    // a present-but-undefined one, and §5 says absent.
    expect(Object.keys(body)).not.toContain('join_url');
    expect(res._getData()).not.toContain(JOIN_URL);
  });

  it('dial_in rides on the SDK payload too, unchanged (ruling ④)', async () => {
    arrange({ isExpectedAttendee: true, meeting: dialInMeeting });
    asAttendee();

    const body = payloadOf(await post());

    expect(body.mode).toBe('sdk');
    expect(body.dial_in).toEqual({
      numbers: [
        { number: '+56 2 5555 0130', country_name: 'Chile', city: 'Santiago', type: 'toll' },
      ],
      meeting_number: String(MEETING_NUMBER),
      passcode: PASSCODE,
    });
    expect(Object.keys(body)).not.toContain('join_url');
  });

  it('the display name falls back to a non-identifying es-CL label', async () => {
    arrange({
      isExpectedAttendee: true,
      meeting: provisionedMeeting,
      profile: { first_name: '  ', last_name: null },
    });
    asAttendee();

    const body = payloadOf(await post());

    expect(body.user_name).toBe('Participante');
  });

  it('the profile read never selects the e-mail column', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    await post();

    expect(tablesRead).toContain('profiles');
    expect(columnsSelected).toContain('first_name, last_name');
    expect(columnsSelected.join(' | ')).not.toContain('email');
  });
});

describe('POST /api/meet/session/[id]/join — host keeps link mode [A4]', () => {
  it('flag on + admin → mode link with join_url (ruling ①)', async () => {
    arrange({ meeting: provisionedMeeting });
    asAdmin();

    const body = payloadOf(await post());

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
  });

  it('flag on + assigned facilitator → mode link with join_url (ruling ①)', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting });
    asFacilitator();

    const body = payloadOf(await post());

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(body.mode).not.toBe('sdk');
  });
});

describe('POST /api/meet/session/[id]/join — the minted signature [A5]', () => {
  it('decodes to role 0, the right mn, and exp === tokenExp === iat + 7200', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const body = payloadOf(await post());
    const claims = decodeJwtClaims(body.signature as string);

    // §5: the role is decided server-side, and Z3-1 issues participants only.
    expect(claims.role).toBe(0);
    expect(claims.mn).toBe(String(MEETING_NUMBER));
    expect(claims.appKey).toBe(SDK_CLIENT_ID);
    expect(claims.sdkKey).toBe(SDK_CLIENT_ID);
    expect(claims.exp).toBe(claims.tokenExp);
    expect(claims.exp).toBe((claims.iat as number) + SDK_JOIN_TTL_SECONDS);
    expect(SDK_JOIN_TTL_SECONDS).toBe(7200);
  });
});

describe('POST /api/meet/session/[id]/join — customer_key [A6]', () => {
  it('is the caller UUID with hyphens stripped, 32 hex characters', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const body = payloadOf(await post());

    expect(body.customer_key).toBe(ATTENDEE_CUSTOMER_KEY);
    expect(body.customer_key).toMatch(/^[0-9a-f]{32}$/);
    expect(body.customer_key).not.toContain('-');
  });
});

describe('POST /api/meet/session/[id]/join — SDK failures fall back to link [A7]', () => {
  const fallbackCases: Array<[string, () => void]> = [
    ['ZOOM_SDK_CLIENT_ID absent', () => delete process.env.ZOOM_SDK_CLIENT_ID],
    ['ZOOM_SDK_CLIENT_SECRET absent', () => delete process.env.ZOOM_SDK_CLIENT_SECRET],
    ['both absent', () => {
      delete process.env.ZOOM_SDK_CLIENT_ID;
      delete process.env.ZOOM_SDK_CLIENT_SECRET;
    }],
  ];

  for (const [label, breakConfig] of fallbackCases) {
    it(`${label} → the link payload, 200, nothing thrown`, async () => {
      arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
      asAttendee();
      breakConfig();

      const res = await post();

      expect(res._getStatusCode()).toBe(200);
      expect(payloadOf(res)).toEqual({
        mode: 'link',
        join_url: JOIN_URL,
        role: 'participant',
      });
    });
  }

  const badMeetingNumbers: Array<[string, unknown]> = [
    ['too short for the signer', 12345],
    ['too long for the signer', 123456789012],
    ['not digits', 'not-a-number'],
    ['null', null],
  ];

  for (const [label, meetingNumber] of badMeetingNumbers) {
    it(`a meeting number ${label} → the link payload, 200, nothing thrown`, async () => {
      arrange({
        isExpectedAttendee: true,
        meeting: { ...provisionedMeeting, zoom_meeting_number: meetingNumber },
      });
      asAttendee();

      const res = await post();

      expect(res._getStatusCode()).toBe(200);
      expect(payloadOf(res).mode).toBe('link');
      expect(payloadOf(res).join_url).toBe(JOIN_URL);
    });
  }
});

describe('POST /api/meet/session/[id]/join — the flag moves no denial [A8]', () => {
  it('other-school caller is still 404, byte-identical to a nonexistent session', async () => {
    asOtherSchoolUser();
    const denied = await post();
    const deniedStatus = denied._getStatusCode();
    const deniedBody = denied._getData();

    arrange({ session: null });
    asOtherSchoolUser();
    const absent = await post(MISSING_SESSION_ID);

    expect(deniedStatus).toBe(absent._getStatusCode());
    expect(deniedBody).toBe(absent._getData());
    expect(deniedStatus).toBe(404);
    expect(JSON.parse(deniedBody).error).toBe('Sesión no encontrada');
  });

  it('the GC non-attendee is still the 403 that names the attendee list', async () => {
    arrange({ meeting: provisionedMeeting });
    asGcMember();

    const res = await post();

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('lista de asistentes');
  });

  it('the master kill switch still wins: 503 with no lookup at all', async () => {
    process.env.FEATURE_ZOOM_MEETINGS = 'false';
    asAttendee();

    const res = await post();

    expect(res._getStatusCode()).toBe(503);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(tablesRead).toEqual([]);
  });

  for (const closedStatus of ['cancelled', 'ended']) {
    it(`projection '${closedStatus}' is still 410 for admin, facilitator and attendee`, async () => {
      const personas: Array<[() => void, Scenario]> = [
        [asAdmin, {}],
        [asFacilitator, { isFacilitator: true }],
        [asAttendee, { isExpectedAttendee: true }],
      ];

      for (const [persona, extra] of personas) {
        arrange({
          ...extra,
          projection: { meeting_status: closedStatus },
          meeting: provisionedMeeting,
        });
        persona();

        const res = await post();

        expect(res._getStatusCode()).toBe(410);
        expect(JSON.parse(res._getData()).error).toBe('Esta reunión ya no está disponible');
        expect(res._getData()).not.toContain(JOIN_URL);
        expect(res._getData()).not.toContain(PASSCODE);
      }
    });
  }

  it('a pending meeting is still pending for a participant with the flag on', async () => {
    arrange({ isExpectedAttendee: true, meeting: { status: 'pending', join_url: null } });
    asAttendee();

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(payloadOf(res)).toEqual({ mode: 'pending' });
  });
});

describe('POST /api/meet/session/[id]/join — the SDK secret never leaves [A9]', () => {
  it('no response body in the whole matrix contains it', async () => {
    const matrix: Array<[() => void, Scenario]> = [
      [asAttendee, { isExpectedAttendee: true, meeting: provisionedMeeting }],
      [asAttendee, { isExpectedAttendee: true, meeting: dialInMeeting }],
      [asAttendee, { isExpectedAttendee: true, meeting: null }],
      [asAdmin, { meeting: provisionedMeeting }],
      [asFacilitator, { isFacilitator: true, meeting: provisionedMeeting }],
      [asGcMember, { meeting: provisionedMeeting }],
      [asOtherSchoolUser, { meeting: provisionedMeeting }],
      [asAdmin, { projection: { meeting_status: 'cancelled' }, meeting: provisionedMeeting }],
    ];

    for (const [persona, scenario] of matrix) {
      arrange(scenario);
      persona();

      const body = (await post())._getData();

      // Serialized body, not a field lookup: a leak in a nested or unexpected key
      // is exactly what a field lookup would miss.
      expect(body).not.toContain(SDK_CLIENT_SECRET);
    }
  });
});

/**
 * Z3-3 [C5] [C6] — the client's link-fallback intent (ruling ②).
 *
 * §5 forbids `join_url` in an SDK payload, so a browser whose embed failed cannot fall
 * back to something it already holds: it has to ask. The whole contract of that ask is
 * that it can only ever get LESS — the payload this same persona received before Z3
 * existed — so the two claims below are (a) the answer is byte-identical to Z2's and
 * (b) the intent moves no gate above outcome 8.
 */
async function postFallback(sessionId: string = SESSION_ID, fallback: unknown = 'link') {
  const { req, res } = createMocks({
    method: 'POST',
    query: { id: sessionId },
    body: { fallback },
  });
  await handler(req as never, res as never);
  return res;
}

describe('POST /api/meet/session/[id]/join — the link fallback intent [C5]', () => {
  it('answers a participant with the byte-identical Z2 link payload', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const res = await postFallback();

    expect(res._getStatusCode()).toBe(200);
    // The same expected object the Z2 suite asserts, written out rather than derived.
    expect(JSON.parse(res._getData())).toEqual({
      data: { mode: 'link', join_url: JOIN_URL, role: 'participant' },
    });
  });

  it('is byte-for-byte the answer the flag-off route gives, not merely equivalent', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();
    const withIntent = (await postFallback())._getData();

    process.env.FEATURE_ZOOM_EMBED = 'false';
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();
    const withFlagOff = (await post())._getData();

    expect(withIntent).toBe(withFlagOff);
  });

  it('skips the SDK branch entirely rather than building a payload and discarding it', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    await postFallback();

    // `buildSdkJoinPayload` is the only thing on this route that reads `profiles`.
    expect(tablesRead).not.toContain('profiles');
  });

  it('gives a host the link too, and never asks Zoom for a ZAK', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting });
    asFacilitator();

    const res = await postFallback();

    expect(JSON.parse(res._getData())).toEqual({
      data: { mode: 'link', join_url: JOIN_URL, role: 'host' },
    });
    // The §9 path reads `zoom_hosts` before it issues anything; it was never entered.
    expect(tablesRead).not.toContain('zoom_hosts');
  });

  it('keeps the dial-in block, which the intent has nothing to do with', async () => {
    arrange({ isExpectedAttendee: true, meeting: dialInMeeting });
    asAttendee();

    const body = payloadOf(await postFallback());

    expect(body.mode).toBe('link');
    expect(body.dial_in).toBeDefined();
  });

  it('ignores a value it does not recognise instead of failing the join', async () => {
    for (const value of ['sdk', '', 'LINK', 42, null, { nested: 'link' }]) {
      arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
      asAttendee();

      const body = payloadOf(await postFallback(SESSION_ID, value));

      // Anything but the one recognised value leaves the route exactly as it was.
      expect(body.mode).toBe('sdk');
    }
  });

  it('a pending meeting is still pending, intent or no intent', async () => {
    arrange({ isExpectedAttendee: true, meeting: { status: 'pending', join_url: null } });
    asAttendee();

    expect(payloadOf(await postFallback())).toEqual({ mode: 'pending' });
  });
});

describe('POST /api/meet/session/[id]/join — the intent cannot escalate [C6]', () => {
  it('the other-school caller is still 404, byte-identical to a nonexistent session', async () => {
    asOtherSchoolUser();
    const denied = await postFallback();

    arrange({ session: null });
    asOtherSchoolUser();
    const absent = await postFallback(MISSING_SESSION_ID);

    expect(denied._getStatusCode()).toBe(404);
    expect(denied._getStatusCode()).toBe(absent._getStatusCode());
    expect(denied._getData()).toBe(absent._getData());
  });

  it('the GC non-attendee is still the 403 that names the attendee list', async () => {
    arrange({ meeting: provisionedMeeting });
    asGcMember();

    const res = await postFallback();

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('lista de asistentes');
  });

  it('the master kill switch still wins: 503 with no lookup at all', async () => {
    process.env.FEATURE_ZOOM_MEETINGS = 'false';
    asAttendee();

    const res = await postFallback();

    expect(res._getStatusCode()).toBe(503);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(tablesRead).toEqual([]);
  });

  it('a closed meeting is still 410, and still carries no credential', async () => {
    arrange({
      isExpectedAttendee: true,
      projection: { meeting_status: 'cancelled' },
      meeting: provisionedMeeting,
    });
    asAttendee();

    const res = await postFallback();

    expect(res._getStatusCode()).toBe(410);
    expect(res._getData()).not.toContain(JOIN_URL);
    expect(res._getData()).not.toContain(PASSCODE);
  });

  it('is not a method: the intent on a GET is still 405', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { id: SESSION_ID },
      body: { fallback: 'link' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
  });
});
