// @vitest-environment node
/**
 * Z3-2 [B1]–[B10] — ZAK, `role: 1` and the §9 audit event on
 * POST /api/meet/session/[id]/join.
 *
 * Constructed like its Z3-1 sibling and for the same reason: the route runs against
 * the REAL `authorizeMeetingJoin`, the REAL signer, the REAL §9 issuance rule and
 * the REAL response helpers, with only the auth check, the Supabase clients and the
 * `ZoomApi` factory stubbed. Every criterion here is a claim about the bytes a
 * caller receives OR about a call that must not happen, and a mocked policy would
 * let this file pass while the shipped payload differed.
 *
 * The `ZoomApi` stub is a SPY, not a stand-in for the rule: [B5] asserts that
 * `getUserZak` was never invoked, because "the payload has no zak" is satisfied by
 * a route that requested a consultant's credential and then dropped it, and that is
 * not what §9 says.
 *
 * Synthetic data only. `SYNTHETIC_ZAK` exists so [B7] can grep for it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockGetUserRoles,
  mockGetHighestRole,
  mockGetZoomApi,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
  mockGetZoomApi: vi.fn(),
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

vi.mock('../../../lib/zoom/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getZoomApi: mockGetZoomApi };
});

import handler, { ZAK_REQUEST_BUDGET_MS } from '../../../pages/api/meet/session/[id]/join';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const MISSING_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';
const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

const ADMIN_USER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const FACILITATOR_USER_ID = '2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e';
/** A colleague. Never this session's facilitator — only its host identity's owner. */
const OTHER_CONSULTOR_ID = '5e6f7081-9203-4e1f-8021-4c5d6e7f8091';
const ATTENDEE_USER_ID = '7d2f9a41-58c3-4e77-9b10-6a4e2c8d0f31';
const GC_USER_ID = '3c4d5e6f-7081-4c9d-8e0f-2a3b4c5d6e7f';
const OUTSIDER_USER_ID = '4d5e6f70-8192-4d0e-9f10-3b4c5d6e7f80';

const MEETING_ROW_ID = '8f0e1d2c-3b4a-4958-8677-56453423120a';
const JOIN_URL = 'https://example.test/j/900000001?pwd=SYNTHETIC_PWD';
const PASSCODE = 'SYNTHETIC_PWD';
const MEETING_NUMBER = 900000001;

const SDK_CLIENT_ID = 'SYNTHETIC_SDK_CLIENT_ID';
const SDK_CLIENT_SECRET = 'SYNTHETIC_SDK_CLIENT_SECRET';

/** The bearer credential under test. Distinctive so [B7] can grep for it. */
const SYNTHETIC_ZAK = 'SYNTHETIC_ZAK_VALUE_0001';

/** Zoom host identities (`zoom_internal.zoom_hosts.zoom_user_id`). */
const FACILITATOR_HOST = 'zoom_host_facilitator_1';
const COLLEAGUE_HOST = 'zoom_host_colleague_1';
const POOL_HOST = 'zoom_host_pool_1';
const ORG_OWNED_HOST = 'zoom_host_org_owned_1';

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
let columnsSelected: string[];
/** Every write the route made, in order. The §8 evidence. */
let insertsMade: Array<{ table: string; row: Record<string, unknown> }>;
/** Seeded per table: makes the next insert into it fail. */
let insertFailures: Record<string, { message: string }>;
/** The `ZoomApi` double. `getUserZak` is a spy so a NON-call is assertable. */
let zoomApiDouble: { getUserZak: ReturnType<typeof vi.fn> };

function resolveEntry(entry: TableEntry, filters: Array<[string, unknown]>) {
  if (entry.error) return { data: null, error: entry.error };
  if (entry.data === null || entry.data === undefined) return { data: null, error: null };

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
        return vi.fn(() => ({ then: (resolve: (v: unknown) => void) => resolve(settle()) }));
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
      const chain = chainable(results[table] ?? { data: null });
      return new Proxy(chain as Record<string, unknown>, {
        get(target, prop, receiver) {
          if (prop === 'select') {
            return vi.fn((columns: string) => {
              columnsSelected.push(columns);
              return (target as { select: (c: string) => unknown }).select(columns);
            });
          }
          if (prop === 'insert') {
            return vi.fn((row: Record<string, unknown>) => {
              insertsMade.push({ table, row });
              const failure = insertFailures[table];
              return {
                then: (resolve: (v: unknown) => void) =>
                  resolve({ data: null, error: failure ?? null }),
              };
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
  /** The `zoom_hosts` row keyed by the meeting's `host_zoom_user_id`. */
  host?: unknown;
  hostError?: { message: string };
};

/** A fully provisioned, joinable meeting on the facilitator's own host identity. */
const provisionedMeeting = {
  id: MEETING_ROW_ID,
  status: 'provisioned',
  join_url: JOIN_URL,
  passcode: PASSCODE,
  zoom_meeting_number: MEETING_NUMBER,
  host_zoom_user_id: FACILITATOR_HOST,
};

const meetingOn = (hostZoomUserId: string | null) => ({
  ...provisionedMeeting,
  host_zoom_user_id: hostZoomUserId,
});

/** `zoom_hosts` rows. `profile_id: null` is what makes an identity a pool host. */
const facilitatorOwnHostRow = {
  zoom_user_id: FACILITATOR_HOST,
  profile_id: FACILITATOR_USER_ID,
  org_owned: false,
};
const colleagueHostRow = {
  zoom_user_id: COLLEAGUE_HOST,
  profile_id: OTHER_CONSULTOR_ID,
  org_owned: false,
};
const poolHostRow = { zoom_user_id: POOL_HOST, profile_id: null, org_owned: false };
const orgOwnedHostRow = {
  zoom_user_id: ORG_OWNED_HOST,
  profile_id: OTHER_CONSULTOR_ID,
  org_owned: true,
};

function arrange(scenario: Scenario = {}) {
  const session = 'session' in scenario ? scenario.session : sessionRow;
  const meeting = 'meeting' in scenario ? scenario.meeting : null;
  const hostZoomUserId = (meeting as { host_zoom_user_id?: unknown } | null)?.host_zoom_user_id;

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
        // One row for every persona — `user_name` is not what this suite is about.
        data: { first_name: 'Persona', last_name: 'Sintética' },
      },
    })
  );

  mockInternalClient = buildClient({
    zoom_meetings: {
      match: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      data: meeting,
    },
    zoom_hosts: scenario.hostError
      ? { data: null, error: scenario.hostError }
      : {
          match: { zoom_user_id: hostZoomUserId },
          data: 'host' in scenario ? scenario.host : null,
        },
  });
}

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

/**
 * The same request carrying the client's link-mode intent (Z3-3 ruling ②) — which since
 * Z3-r9 is what a browser that cannot host Component View sends on its FIRST request,
 * not only after an embed failed. [B12] is the server half of that claim.
 */
async function postAskingForLink(sessionId: string = SESSION_ID) {
  const { req, res } = createMocks({
    method: 'POST',
    query: { id: sessionId },
    body: { fallback: 'link' },
  });
  await handler(req as never, res as never);
  return res;
}

function payloadOf(res: ReturnType<typeof createMocks>['res']) {
  return JSON.parse(res._getData()).data as Record<string, unknown>;
}

/** Reads the claims back out of the minted JWT — no secret required. */
function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

/** The `zak_issued` rows written during one request. */
function auditRows() {
  return insertsMade.filter((entry) => entry.table === 'zoom_zak_issuances');
}

const ENV_KEYS = [
  'FEATURE_ZOOM_MEETINGS',
  'FEATURE_ZOOM_EMBED',
  'ZOOM_SDK_CLIENT_ID',
  'ZOOM_SDK_CLIENT_SECRET',
  'ZOOM_MODE',
  'ZOOM_S2S_ACCOUNT_ID',
  'ZOOM_S2S_CLIENT_ID',
  'ZOOM_S2S_CLIENT_SECRET',
] as const;

let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  tablesRead = [];
  columnsSelected = [];
  insertsMade = [];
  insertFailures = {};
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  process.env.FEATURE_ZOOM_MEETINGS = 'true';
  process.env.FEATURE_ZOOM_EMBED = 'true';
  process.env.ZOOM_SDK_CLIENT_ID = SDK_CLIENT_ID;
  process.env.ZOOM_SDK_CLIENT_SECRET = SDK_CLIENT_SECRET;

  zoomApiDouble = { getUserZak: vi.fn(async () => SYNTHETIC_ZAK) };
  mockGetZoomApi.mockImplementation(() => zoomApiDouble);

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

describe('[B1] the flag off leaves every outcome exactly as Z3-1 shipped it', () => {
  beforeEach(() => {
    process.env.FEATURE_ZOOM_EMBED = 'false';
  });

  it('a facilitator on their own mapped host still gets mode link, and no ZAK is requested', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();

    const body = payloadOf(await post());

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('an admin on a pool host still gets mode link, and no ZAK is requested', async () => {
    arrange({ meeting: meetingOn(POOL_HOST), host: poolHostRow });
    asAdmin();

    const body = payloadOf(await post());

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  it('a participant still gets mode link — the flag gates the SDK outcome entirely', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    expect(payloadOf(await post())).toEqual({
      mode: 'link',
      join_url: JOIN_URL,
      role: 'participant',
    });
  });
});

describe('[B2] the assigned facilitator, on their OWN mapped host', () => {
  beforeEach(() => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();
  });

  it('receives an SDK payload carrying the ZAK', async () => {
    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    const body = payloadOf(res);

    expect(body.mode).toBe('sdk');
    expect(body.zak).toBe(SYNTHETIC_ZAK);
    expect(body.role).toBe('host');
    expect(zoomApiDouble.getUserZak).toHaveBeenCalledOnce();
    // Z3-r9: the second argument is the request budget (Sol M4) — see [B11].
    expect(zoomApiDouble.getUserZak).toHaveBeenCalledWith(FACILITATOR_HOST, {
      signal: expect.any(AbortSignal),
    });

    // The Z3-1 shape, plus `zak`, and still no `join_url` KEY at all (§5).
    expect(Object.keys(body)).toEqual([
      'mode',
      'signature',
      'sdk_key',
      'meeting_number',
      'passcode',
      'user_name',
      'customer_key',
      'zak',
      'role',
    ]);
    expect(res._getData()).not.toContain(JOIN_URL);
  });

  it('and a signature that decodes to role 1', async () => {
    const claims = decodeJwtClaims(payloadOf(await post()).signature as string);

    expect(claims.role).toBe(1);
    expect(claims.mn).toBe(String(MEETING_NUMBER));
  });
});

describe('[B3] a facilitator whose mapped host is not the meeting host', () => {
  it("gets NO ZAK and falls back to link when the meeting runs on a colleague's identity", async () => {
    arrange({
      isFacilitator: true,
      meeting: meetingOn(COLLEAGUE_HOST),
      host: colleagueHostRow,
    });
    asFacilitator();

    const res = await post();
    const body = payloadOf(res);

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(Object.keys(body)).not.toContain('zak');
    // §9's remedy is host-reassignment, not impersonation — so nothing is even asked for.
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('gets NO ZAK when there is no host row for the meeting identity at all', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: null });
    asFacilitator();

    expect(payloadOf(await post()).mode).toBe('link');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  it('gets NO ZAK when the meeting has no assigned host identity', async () => {
    arrange({ isFacilitator: true, meeting: meetingOn(null) });
    asFacilitator();

    expect(payloadOf(await post()).mode).toBe('link');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  it('gets NO ZAK when the host lookup fails', async () => {
    arrange({
      isFacilitator: true,
      meeting: provisionedMeeting,
      hostError: { message: 'synthetic host read failure' },
    });
    asFacilitator();

    // A failure to establish whose identity this is is not a reason to issue.
    expect(payloadOf(await post()).mode).toBe('link');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });
});

describe('[B4] admins, on organization-controlled identities', () => {
  it('pool host (profile_id IS NULL) → ZAK and a role 1 signature', async () => {
    arrange({ meeting: meetingOn(POOL_HOST), host: poolHostRow });
    asAdmin();

    const body = payloadOf(await post());

    expect(body.mode).toBe('sdk');
    expect(body.zak).toBe(SYNTHETIC_ZAK);
    expect(decodeJwtClaims(body.signature as string).role).toBe(1);
    expect(zoomApiDouble.getUserZak).toHaveBeenCalledOnce();
    expect(zoomApiDouble.getUserZak).toHaveBeenCalledWith(POOL_HOST, {
      signal: expect.any(AbortSignal),
    });
    expect(auditRows()[0].row.persona).toBe('admin_pool_host');
  });

  it('org_owned = true → ZAK and a role 1 signature', async () => {
    arrange({ meeting: meetingOn(ORG_OWNED_HOST), host: orgOwnedHostRow });
    asAdmin();

    const body = payloadOf(await post());

    expect(body.mode).toBe('sdk');
    expect(body.zak).toBe(SYNTHETIC_ZAK);
    expect(decodeJwtClaims(body.signature as string).role).toBe(1);
    expect(auditRows()[0].row.persona).toBe('admin_org_owned_host');
  });
});

describe("[B5] an admin NEVER receives a consultant's personal ZAK", () => {
  it('does not even ASK Zoom for it, and falls back to link', async () => {
    arrange({ meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow });
    asAdmin();

    const res = await post();
    const body = payloadOf(res);

    // The assertion that matters: not "the payload lacks a zak" — which a route that
    // fetched the credential and then dropped it would also satisfy — but that the
    // credential was never requested.
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(Object.keys(body)).not.toContain('zak');
    expect(res._getData()).not.toContain(SYNTHETIC_ZAK);
    expect(auditRows()).toEqual([]);
  });

  it("holds for the admin's own personal identity too — (b) is about org identities", async () => {
    arrange({
      meeting: meetingOn(COLLEAGUE_HOST),
      host: { zoom_user_id: COLLEAGUE_HOST, profile_id: ADMIN_USER_ID, org_owned: false },
    });
    asAdmin();

    expect(payloadOf(await post()).mode).toBe('link');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  it('holds when the host row cannot be read cleanly (a malformed profile_id)', async () => {
    // Fail-closed: `profile_id` neither a string nor null is an unreadable row, not a
    // pool host — and reading it as a pool host is what would hand an admin a ZAK.
    arrange({
      meeting: meetingOn(POOL_HOST),
      host: { zoom_user_id: POOL_HOST, profile_id: 42, org_owned: false },
    });
    asAdmin();

    expect(payloadOf(await post()).mode).toBe('link');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });
});

describe('[B6] the §5 matrix is unmoved with the flag on and the ZAK path present', () => {
  it('an other-school caller is still 404, byte-identical to a nonexistent session', async () => {
    arrange({ meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asOtherSchoolUser();
    const denied = await post();

    arrange({ session: null });
    asOtherSchoolUser();
    const absent = await post(MISSING_SESSION_ID);

    expect(denied._getStatusCode()).toBe(absent._getStatusCode());
    expect(denied._getData()).toBe(absent._getData());
    expect(denied._getStatusCode()).toBe(404);
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  it('a same-school consultor who is not this session’s facilitator is still 403', async () => {
    arrange({ meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    // Same school, no facilitator row — the §5 `consultor-not-facilitator` denial.
    actAs(OTHER_CONSULTOR_ID, [consultorRole(SCHOOL_ID)], 'consultor');

    const res = await post();

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('No tienes acceso para unirte a esta reunión.');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('the GC non-attendee is still the 403 that names the attendee list', async () => {
    arrange({ meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asGcMember();

    const res = await post();

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain('lista de asistentes');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  it('the master kill switch still wins: 503, no lookup, no ZAK', async () => {
    process.env.FEATURE_ZOOM_MEETINGS = 'false';
    asFacilitator();

    const res = await post();

    expect(res._getStatusCode()).toBe(503);
    expect(tablesRead).toEqual([]);
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });

  for (const closedStatus of ['cancelled', 'ended']) {
    it(`projection '${closedStatus}' is still 410 for a host who would otherwise qualify`, async () => {
      arrange({
        isFacilitator: true,
        projection: { meeting_status: closedStatus },
        meeting: provisionedMeeting,
        host: facilitatorOwnHostRow,
      });
      asFacilitator();

      const res = await post();

      expect(res._getStatusCode()).toBe(410);
      expect(res._getData()).not.toContain(SYNTHETIC_ZAK);
      expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    });
  }

  it('a pending meeting is still pending for a host, and asks for nothing', async () => {
    arrange({ isFacilitator: true, meeting: { status: 'pending', join_url: null } });
    asFacilitator();

    expect(payloadOf(await post())).toEqual({ mode: 'pending' });
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });
});

describe('[B7] the ZAK reaches the host payload and nothing else', () => {
  it('appears in no audit row and no stderr line, across the whole matrix', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const matrix: Array<[() => void, Scenario]> = [
      [asFacilitator, { isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow }],
      [asFacilitator, { isFacilitator: true, meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow }],
      [asAdmin, { meeting: meetingOn(POOL_HOST), host: poolHostRow }],
      [asAdmin, { meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow }],
      [asAttendee, { isExpectedAttendee: true, meeting: provisionedMeeting }],
      [asGcMember, { meeting: provisionedMeeting, host: facilitatorOwnHostRow }],
    ];

    try {
      for (const [persona, scenario] of matrix) {
        arrange(scenario);
        persona();
        insertsMade = [];

        await post();

        // Serialized rows, not a field lookup: a leak into a nested or unexpected key
        // is exactly what a field lookup would miss.
        expect(JSON.stringify(insertsMade)).not.toContain(SYNTHETIC_ZAK);
      }

      const stderr = errorSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
      expect(stderr).not.toContain(SYNTHETIC_ZAK);
      expect(stderr).not.toContain(SDK_CLIENT_SECRET);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('no denied or degraded response body contains it', async () => {
    const matrix: Array<[() => void, Scenario]> = [
      [asFacilitator, { isFacilitator: true, meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow }],
      [asAdmin, { meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow }],
      [asAttendee, { isExpectedAttendee: true, meeting: provisionedMeeting }],
      [asGcMember, { meeting: provisionedMeeting, host: facilitatorOwnHostRow }],
      [asOtherSchoolUser, { meeting: provisionedMeeting, host: facilitatorOwnHostRow }],
      [asAdmin, { projection: { meeting_status: 'cancelled' }, meeting: meetingOn(POOL_HOST), host: poolHostRow }],
    ];

    for (const [persona, scenario] of matrix) {
      arrange(scenario);
      persona();

      expect((await post())._getData()).not.toContain(SYNTHETIC_ZAK);
    }
  });

  it('the participant SDK payload has no zak KEY at all', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const body = payloadOf(await post());

    expect(body.mode).toBe('sdk');
    expect(Object.keys(body)).not.toContain('zak');
    expect(decodeJwtClaims(body.signature as string).role).toBe(0);
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
  });
});

describe('[B8] every issuance writes exactly one zak_issued row; a refusal writes none', () => {
  it('records the persona branch, the meeting, the identity and the recipient', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();

    await post();

    expect(auditRows()).toHaveLength(1);
    expect(auditRows()[0].row).toEqual({
      profile_id: FACILITATOR_USER_ID,
      meeting_id: MEETING_ROW_ID,
      zoom_user_id: FACILITATOR_HOST,
      persona: 'facilitator_own_host',
    });
    // The credential is not among the columns, and there is no column for it.
    expect(Object.keys(auditRows()[0].row)).not.toContain('zak');
  });

  it('writes nothing when the rule refuses', async () => {
    arrange({ meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow });
    asAdmin();

    await post();

    expect(auditRows()).toEqual([]);
  });

  it('withholds the ZAK when the audit write fails — the log is part of the rule', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();
    insertFailures.zoom_zak_issuances = { message: 'synthetic audit write failure' };

    const res = await post();
    const body = payloadOf(res);

    expect(zoomApiDouble.getUserZak).toHaveBeenCalledOnce();
    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(res._getData()).not.toContain(SYNTHETIC_ZAK);
  });

  it('writes nothing, and degrades to link, when Zoom refuses the ZAK', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();
    zoomApiDouble.getUserZak.mockRejectedValueOnce(new Error('synthetic Zoom refusal'));

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(payloadOf(res)).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(auditRows()).toEqual([]);
  });

  it('asks for no credential when the SDK payload cannot be built at all', async () => {
    // Ordering: the payload is signed BEFORE the credential is requested, so a broken
    // embed config costs neither a Zoom call nor an audit row for an issuance nobody
    // received.
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();
    delete process.env.ZOOM_SDK_CLIENT_SECRET;

    expect(payloadOf(await post())).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });
});

describe('[B10] a missing or blank passcode falls back to link, never to passcode: ""', () => {
  const blankPasscodes: Array<[string, unknown]> = [
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
    ['not a string', 12345],
  ];

  for (const [label, passcode] of blankPasscodes) {
    it(`a ${label} passcode → mode link for a participant`, async () => {
      arrange({
        isExpectedAttendee: true,
        meeting: { ...provisionedMeeting, passcode },
      });
      asAttendee();

      const res = await post();
      const body = payloadOf(res);

      expect(res._getStatusCode()).toBe(200);
      expect(body.mode).toBe('link');
      expect(body.join_url).toBe(JOIN_URL);
      expect(Object.keys(body)).not.toContain('passcode');
    });

    it(`a ${label} passcode → mode link for a host, and no ZAK is requested`, async () => {
      arrange({
        isFacilitator: true,
        meeting: { ...provisionedMeeting, passcode },
        host: facilitatorOwnHostRow,
      });
      asFacilitator();

      expect(payloadOf(await post()).mode).toBe('link');
      expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    });
  }

  it('a real passcode still ships verbatim', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    expect(payloadOf(await post()).passcode).toBe(PASSCODE);
  });
});

describe('[B9] ZOOM_MODE=mock serves the whole matrix with no Zoom S2S secrets', () => {
  beforeEach(async () => {
    // The REAL factory, the REAL `resolveZoomMode`, the REAL in-memory fake — the
    // point of this block is that the code path CI runs is the one under test, so
    // `getZoomApi` is un-stubbed here rather than swapped for another double.
    const actual = await vi.importActual<typeof import('../../../lib/zoom/api')>(
      '../../../lib/zoom/api'
    );
    actual.resetZoomApiForTests();
    mockGetZoomApi.mockImplementation((env?: NodeJS.ProcessEnv) => actual.getZoomApi(env));

    process.env.ZOOM_MODE = 'mock';
    // The S2S credentials the live client would need. Absent, exactly as in CI.
    delete process.env.ZOOM_S2S_ACCOUNT_ID;
    delete process.env.ZOOM_S2S_CLIENT_ID;
    delete process.env.ZOOM_S2S_CLIENT_SECRET;
  });

  it('issues a real fake ZAK to the facilitator on their own host', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();

    const body = payloadOf(await post());

    expect(body.mode).toBe('sdk');
    expect(typeof body.zak).toBe('string');
    expect(body.zak as string).toContain('SyntheticZak');
    expect(decodeJwtClaims(body.signature as string).role).toBe(1);
    expect(auditRows()).toHaveLength(1);
  });

  it('issues to the admin on a pool host', async () => {
    arrange({ meeting: meetingOn(POOL_HOST), host: poolHostRow });
    asAdmin();

    expect(typeof payloadOf(await post()).zak).toBe('string');
    expect(auditRows()[0].row.persona).toBe('admin_pool_host');
  });

  it("still refuses the admin on a consultant's personal identity [B5]", async () => {
    arrange({ meeting: meetingOn(COLLEAGUE_HOST), host: colleagueHostRow });
    asAdmin();

    const body = payloadOf(await post());

    expect(body.mode).toBe('link');
    expect(Object.keys(body)).not.toContain('zak');
    expect(auditRows()).toEqual([]);
  });

  it('serves the participant embed unchanged', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    const body = payloadOf(await post());

    expect(body.mode).toBe('sdk');
    expect(Object.keys(body)).not.toContain('zak');
  });

  it('mints a FRESH credential per request — nothing is cached across joins', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();

    const first = payloadOf(await post()).zak;
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();
    const second = payloadOf(await post()).zak;

    // §5: fetched at start-click, never persisted. A route that cached one would
    // hand out a token that has been ageing since the first click.
    expect(first).not.toBe(second);
  });
});

/**
 * Z3-r9 [B11] (Sol M4) — the ZAK call is on a request budget, and exhausting it is an
 * ordinary §9 refusal.
 *
 * The defect: `getUserZak` runs on the HTTP request path over a client written for the
 * cron worker — three attempts, exponential backoff, two 60 s `Retry-After` sleeps, and
 * a `fetch` with no default timeout. A call that never settles never reaches this
 * route's link response, so the platform's timeout answers with an error instead —
 * contradicting the route's own promise that every SDK failure degrades to link mode.
 *
 * The transport-level proof that the signal reaches `fetch`, the token wait and every
 * retry sleep is `__tests__/lib/zoom/client-request-budget.test.ts`. What is asserted
 * HERE is the route's half: that a budget is handed down at all, and that exhausting it
 * produces the 200 link payload **and no audit row**. A row for a credential that never
 * arrived would be the §9 log describing an issuance that did not happen.
 */
describe('[B11] the ZAK call carries a request budget', () => {
  beforeEach(() => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();
  });

  it('hands `getUserZak` a live AbortSignal, and cancels it once the call has answered', async () => {
    let captured: AbortSignal | undefined;
    zoomApiDouble.getUserZak.mockImplementation(
      async (_host: string, options?: { signal?: AbortSignal }) => {
        captured = options?.signal;
        // Live WHILE the call is in flight — a signal already aborted here would mean
        // the budget was never really the call's.
        expect(captured?.aborted).toBe(false);
        return SYNTHETIC_ZAK;
      }
    );

    expect(payloadOf(await post()).zak).toBe(SYNTHETIC_ZAK);
    expect(captured).toBeInstanceOf(AbortSignal);
    // Still not aborted after a fast answer: the timer is cleared rather than left to
    // fire for the rest of the budget on a function this platform keeps warm.
    expect(captured?.aborted).toBe(false);
  });

  it('the budget is a stated number, not an implicit one', () => {
    // [V1] asks for a STATED budget. It is a module constant so this assertion and the
    // clock below are talking about the same value the route ships.
    expect(ZAK_REQUEST_BUDGET_MS).toBe(8_000);
  });

  it('a never-settling ZAK ends in the 200 link payload, and writes NO audit row', async () => {
    // The transport never answers on its own — the route may only escape through the
    // budget it set. Zoom's own clock is faked so this costs no wall time; the real
    // timing proof is at the transport layer.
    zoomApiDouble.getUserZak.mockImplementation(
      (_host: string, options?: { signal?: AbortSignal }) =>
        new Promise<string>((_, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new Error('synthetic budget exhaustion')),
            { once: true }
          );
        })
    );

    vi.useFakeTimers();
    let res: Awaited<ReturnType<typeof post>>;
    try {
      const pending = post();
      // One tick short of the budget the request is still waiting; the assertion that
      // matters is that it does not wait a millisecond longer.
      await vi.advanceTimersByTimeAsync(ZAK_REQUEST_BUDGET_MS - 1);
      expect(auditRows()).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      res = await pending;
    } finally {
      vi.useRealTimers();
    }

    expect(res._getStatusCode()).toBe(200);
    const body = payloadOf(res);
    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(Object.keys(body)).not.toContain('zak');
    // The whole point: a credential that never arrived was never issued.
    expect(auditRows()).toEqual([]);
  });

  it('a repeatedly rate-limited ZAK ends the same way — link, no row', async () => {
    // What the transport surfaces once its own budget has run out under repeated
    // 429/`Retry-After`; the timing of that is asserted at the client layer.
    zoomApiDouble.getUserZak.mockRejectedValue(
      Object.assign(new Error('Zoom rate limit on GET /users/{id}/token'), {
        name: 'ZoomRateLimitError',
      })
    );

    const body = payloadOf(await post());

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(auditRows()).toEqual([]);
  });
});

/**
 * Z3-r9 [B12] (plan §15, Sol re-review MAJOR 2) — the server half of structural
 * unreachability.
 *
 * Z3 ships Component View on desktop only. Every other browser — mobile, tablet,
 * Firefox, AND a desktop window narrower than 768 px — now sends `{fallback:'link'}` on
 * its FIRST request rather than after an embed failed. The claim this file can make is
 * the one that matters most for §9: on that request a host **mints no ZAK and writes no
 * `zoom_zak_issuances` row**, because the SDK branch is never entered at all.
 *
 * Asserted as a NON-CALL. "The payload has no zak" is satisfied by a route that
 * requested a credential and then dropped it, and that is precisely the discard §15's
 * Z3 row forbids.
 */
describe('[B12] a first request that asks for link mode mints nothing', () => {
  it('the assigned facilitator on their own host: no ZAK requested, no audit row', async () => {
    arrange({ isFacilitator: true, meeting: provisionedMeeting, host: facilitatorOwnHostRow });
    asFacilitator();

    const body = payloadOf(await postAskingForLink());

    expect(body).toEqual({ mode: 'link', join_url: JOIN_URL, role: 'host' });
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('the admin on a pool host — the other persona §9 would have issued to', async () => {
    arrange({ meeting: meetingOn(POOL_HOST), host: poolHostRow });
    asAdmin();

    const body = payloadOf(await postAskingForLink());

    expect(body.mode).toBe('link');
    expect(Object.keys(body)).not.toContain('zak');
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it('a participant gets the link and no SDK payload is signed for them either', async () => {
    arrange({ isExpectedAttendee: true, meeting: provisionedMeeting });
    asAttendee();

    expect(payloadOf(await postAskingForLink())).toEqual({
      mode: 'link',
      join_url: JOIN_URL,
      role: 'participant',
    });
  });

  it('changes nothing about the gates above outcome 8 — a cancelled session is still 410', async () => {
    arrange({
      isFacilitator: true,
      session: { ...sessionRow, status: 'cancelada' },
      meeting: provisionedMeeting,
      host: facilitatorOwnHostRow,
    });
    asFacilitator();

    const res = await postAskingForLink();

    expect(res._getStatusCode()).toBe(410);
    expect(zoomApiDouble.getUserZak).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });
});
