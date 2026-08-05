// @vitest-environment node
/**
 * Z2-2a [A1] — the §5 join matrix: `viewing ≠ sitting in`.
 *
 * Seven personas, seven distinct asserted outcomes. The two 403s are asserted
 * as *different* denials, not merely as "some 403": the GC member's copy names
 * the attendee list (their remedy is a facilitator adding them), the consultor's
 * does not. The other-school row is asserted against the nonexistent-session row
 * value-for-value — that byte-identity is the no-existence-oracle property, and
 * an assertion against a literal would not catch the two drifting apart.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUserRoles, mockGetHighestRole } = vi.hoisted(() => ({
  mockGetUserRoles: vi.fn(),
  mockGetHighestRole: vi.fn(),
}));

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserRoles: mockGetUserRoles,
    getHighestRole: mockGetHighestRole,
  };
});

import {
  authorizeMeetingJoin,
  NOT_IN_ATTENDEES_MESSAGE,
  CONSULTOR_NOT_FACILITATOR_MESSAGE,
} from '../../../lib/utils/meeting-join-policy';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const MISSING_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';
const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';
const OTHER_COMMUNITY_ID = 'c0222222-2222-4222-8222-222222222222';

const ADMIN_USER_ID = 'u-admin-0001';
const FACILITATOR_USER_ID = 'u-facilitator-0001';
const ATTENDEE_USER_ID = 'u-attendee-0001';
const GC_USER_ID = 'u-gc-member-0001';
const CONSULTOR_USER_ID = 'u-consultor-0001';
const OUTSIDER_USER_ID = 'u-outsider-0001';

const sessionRow = {
  id: SESSION_ID,
  school_id: SCHOOL_ID,
  growth_community_id: COMMUNITY_ID,
  is_active: true,
};

/**
 * A seeded row: the column values it actually carries (`match` — what Postgres
 * would compare every `.eq()` against) and the columns the `select()` returns.
 */
type TableEntry = { match?: Record<string, unknown>; data: unknown; error?: unknown };

/**
 * Resolve a lookup the way the database would: the seeded row is returned only
 * if EVERY recorded filter matches one of its column values. A filter the row
 * does not satisfy — a `user_id` that belongs to somebody else, an `expected`
 * that is `false` — resolves as "no row", which is the whole point of recording
 * them. A double that ignored filters would pass a policy that dropped one.
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

/** A facilitator / attendee row is owned by the caller unless a test says otherwise. */
type FacilitatorSeed = { userId?: string };
type AttendeeSeed = { userId?: string; expected?: boolean };

function buildService(opts: {
  sessionId: string;
  userId: string;
  session?: unknown;
  facilitator?: FacilitatorSeed | null;
  attendee?: AttendeeSeed | null;
}) {
  const session = 'session' in opts ? opts.session : sessionRow;

  const results: Record<string, TableEntry> = {
    consultor_sessions: {
      match: { id: (session as { id?: string } | null)?.id },
      data: session,
    },
    session_facilitators: opts.facilitator
      ? {
          match: {
            session_id: opts.sessionId,
            user_id: opts.facilitator.userId ?? opts.userId,
          },
          data: { id: 'sf-1' },
        }
      : { data: null },
    session_attendees: opts.attendee
      ? {
          match: {
            session_id: opts.sessionId,
            user_id: opts.attendee.userId ?? opts.userId,
            expected: opts.attendee.expected ?? true,
          },
          data: { id: 'sa-1' },
        }
      : { data: null },
  };

  return {
    from: vi.fn((table: string) => chainable(results[table] ?? { data: null })),
  };
}

function run(opts: {
  sessionId?: unknown;
  userId?: string | null;
  roles?: Record<string, unknown>[];
  highestRole?: string | null;
  session?: unknown;
  isFacilitator?: boolean;
  isExpectedAttendee?: boolean;
  /** Seeds a facilitator row owned by someone else — `isFacilitator` seeds one for the caller. */
  facilitator?: FacilitatorSeed;
  /** Same, for `session_attendees`, and it can carry `expected: false`. */
  attendee?: AttendeeSeed;
}) {
  mockGetUserRoles.mockResolvedValue(opts.roles ?? []);
  mockGetHighestRole.mockReturnValue(opts.highestRole ?? null);

  const sessionId = 'sessionId' in opts ? opts.sessionId : SESSION_ID;
  const userId = opts.userId === undefined ? GC_USER_ID : opts.userId;

  return authorizeMeetingJoin({
    sessionId,
    userId,
    service: buildService({
      sessionId: typeof sessionId === 'string' ? sessionId : SESSION_ID,
      userId: userId ?? GC_USER_ID,
      ...('session' in opts ? { session: opts.session } : {}),
      facilitator: opts.facilitator ?? (opts.isFacilitator ? {} : null),
      attendee: opts.attendee ?? (opts.isExpectedAttendee ? {} : null),
    }) as never,
  });
}

/** An active membership row in this session's growth community. */
const gcRole = {
  role_type: 'docente',
  is_active: true,
  school_id: SCHOOL_ID,
  community_id: COMMUNITY_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authorizeMeetingJoin — the §5 persona matrix [A1]', () => {
  it('admin → authorized, host-capable', async () => {
    const result = await run({
      userId: ADMIN_USER_ID,
      roles: [{ role_type: 'admin', is_active: true }],
      highestRole: 'admin',
    });

    expect(result).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'host' });
  });

  it('assigned facilitator → authorized, host', async () => {
    const result = await run({
      userId: FACILITATOR_USER_ID,
      roles: [{ role_type: 'consultor', is_active: true, school_id: String(SCHOOL_ID) }],
      highestRole: 'consultor',
      isFacilitator: true,
    });

    expect(result).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'host' });
  });

  it('expected attendee → authorized, participant', async () => {
    const result = await run({
      userId: ATTENDEE_USER_ID,
      roles: [gcRole],
      highestRole: 'docente',
      isExpectedAttendee: true,
    });

    expect(result).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'participant' });
  });

  it('active GC member NOT in attendees → 403 naming the attendee list', async () => {
    const result = await run({
      userId: GC_USER_ID,
      roles: [gcRole],
      highestRole: 'docente',
    });

    expect(result).toEqual({
      kind: 'forbidden',
      reason: 'not-in-attendees',
      message: NOT_IN_ATTENDEES_MESSAGE,
    });
    expect(NOT_IN_ATTENDEES_MESSAGE).toContain('lista de asistentes');
  });

  it('same-school non-facilitator consultor → 403 that does NOT name the roster', async () => {
    const result = await run({
      userId: CONSULTOR_USER_ID,
      roles: [
        { role_type: 'consultor', is_active: true, school_id: String(SCHOOL_ID) },
      ],
      highestRole: 'consultor',
    });

    expect(result).toEqual({
      kind: 'forbidden',
      reason: 'consultor-not-facilitator',
      message: CONSULTOR_NOT_FACILITATOR_MESSAGE,
    });
    expect(CONSULTOR_NOT_FACILITATOR_MESSAGE).not.toContain('asistentes');
  });

  it('the two 403 reasons are distinguishable to the caller', async () => {
    const gcDenial = await run({ userId: GC_USER_ID, roles: [gcRole], highestRole: 'docente' });
    const consultorDenial = await run({
      userId: CONSULTOR_USER_ID,
      roles: [{ role_type: 'consultor', is_active: true, school_id: String(SCHOOL_ID) }],
      highestRole: 'consultor',
    });

    expect(gcDenial).not.toEqual(consultorDenial);
    expect((gcDenial as { reason: string }).reason).not.toBe(
      (consultorDenial as { reason: string }).reason
    );
  });

  it('other-school user → not-found, byte-identical to a nonexistent session', async () => {
    const otherSchool = await run({
      userId: OUTSIDER_USER_ID,
      roles: [
        { role_type: 'consultor', is_active: true, school_id: String(OTHER_SCHOOL_ID) },
      ],
      highestRole: 'consultor',
    });

    const nonexistent = await run({
      sessionId: MISSING_SESSION_ID,
      userId: OUTSIDER_USER_ID,
      roles: [
        { role_type: 'consultor', is_active: true, school_id: String(OTHER_SCHOOL_ID) },
      ],
      highestRole: 'consultor',
      session: null,
    });

    // Against each other, not against a literal: the property is that they
    // cannot be told apart, and only this assertion catches them drifting.
    expect(otherSchool).toEqual(nonexistent);
    expect(otherSchool).toEqual({ kind: 'not-found' });
  });

  it('anonymous → unauthenticated', async () => {
    expect(await run({ userId: null })).toEqual({ kind: 'unauthenticated' });
  });
});

describe('authorizeMeetingJoin — it is NOT canViewSession', () => {
  it('a GC member who CAN view the session still cannot join it', async () => {
    const { canViewSession } = await import('../../../lib/utils/session-policy');

    const ctx = {
      highestRole: 'docente',
      userRoles: [gcRole] as never,
      session: {
        id: SESSION_ID,
        school_id: SCHOOL_ID,
        growth_community_id: COMMUNITY_ID,
        status: 'programada',
      },
      userId: GC_USER_ID,
      isFacilitator: false,
    };

    expect(canViewSession(ctx)).toBe(true);

    const join = await run({ userId: GC_USER_ID, roles: [gcRole], highestRole: 'docente' });
    expect(join.kind).toBe('forbidden');
  });

  it('a same-school consultor who CAN view the session still cannot join it', async () => {
    const { canViewSession } = await import('../../../lib/utils/session-policy');

    const consultorRole = {
      role_type: 'consultor',
      is_active: true,
      school_id: String(SCHOOL_ID),
    };

    expect(
      canViewSession({
        highestRole: 'consultor',
        userRoles: [consultorRole] as never,
        session: {
          id: SESSION_ID,
          school_id: SCHOOL_ID,
          growth_community_id: COMMUNITY_ID,
          status: 'programada',
        },
        userId: CONSULTOR_USER_ID,
        isFacilitator: false,
      })
    ).toBe(true);

    const join = await run({
      userId: CONSULTOR_USER_ID,
      roles: [consultorRole],
      highestRole: 'consultor',
    });
    expect(join.kind).toBe('forbidden');
  });
});

describe('authorizeMeetingJoin — edges', () => {
  it('a malformed session id is answered exactly like a nonexistent one', async () => {
    const malformed = await run({ sessionId: 'not-a-uuid', userId: GC_USER_ID });
    const missing = await run({ userId: GC_USER_ID, session: null });

    expect(malformed).toEqual(missing);
    expect(malformed).toEqual({ kind: 'not-found' });
  });

  it('a user with no usable roles gets not-found, never a partial answer', async () => {
    const result = await run({ userId: GC_USER_ID, roles: [], highestRole: null });
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('an archived session is not-found for a facilitator but joinable by an admin', async () => {
    const archived = { ...sessionRow, is_active: false };

    const facilitator = await run({
      userId: FACILITATOR_USER_ID,
      roles: [{ role_type: 'consultor', is_active: true, school_id: String(SCHOOL_ID) }],
      highestRole: 'consultor',
      isFacilitator: true,
      session: archived,
    });
    expect(facilitator).toEqual({ kind: 'not-found' });

    const admin = await run({
      userId: ADMIN_USER_ID,
      roles: [{ role_type: 'admin', is_active: true }],
      highestRole: 'admin',
      session: archived,
    });
    expect(admin).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'host' });
  });

  it('a facilitator who is also an expected attendee joins as host', async () => {
    const result = await run({
      userId: FACILITATOR_USER_ID,
      roles: [gcRole],
      highestRole: 'docente',
      isFacilitator: true,
      isExpectedAttendee: true,
    });

    expect(result).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'host' });
  });

  it('a global consultor (school_id NULL) gets the consultor 403, not a 404', async () => {
    const result = await run({
      userId: CONSULTOR_USER_ID,
      roles: [{ role_type: 'consultor', is_active: true, school_id: null }],
      highestRole: 'consultor',
    });

    expect(result).toEqual({
      kind: 'forbidden',
      reason: 'consultor-not-facilitator',
      message: CONSULTOR_NOT_FACILITATOR_MESSAGE,
    });
  });

  it('membership in a DIFFERENT community is not membership in this one', async () => {
    const result = await run({
      userId: OUTSIDER_USER_ID,
      roles: [
        {
          role_type: 'docente',
          is_active: true,
          school_id: OTHER_SCHOOL_ID,
          community_id: OTHER_COMMUNITY_ID,
        },
      ],
      highestRole: 'docente',
    });

    expect(result).toEqual({ kind: 'not-found' });
  });

  it('an INACTIVE membership in this community is not membership either', async () => {
    const result = await run({
      userId: OUTSIDER_USER_ID,
      roles: [{ ...gcRole, is_active: false }],
      highestRole: 'docente',
    });

    expect(result).toEqual({ kind: 'not-found' });
  });
});

/**
 * The join list is *defined* by the filters on these two lookups — `user_id` on
 * both, and `expected` on the attendee read. Dropping any one of them is a
 * one-line regression that authorizes a caller who is not on the roster, so
 * each is asserted against a row that exists but must not satisfy the lookup.
 */
describe('authorizeMeetingJoin — the roster lookups are bound to their filters', () => {
  it('an expected-attendee row belonging to ANOTHER user does not authorize', async () => {
    const result = await run({
      userId: GC_USER_ID,
      roles: [gcRole],
      highestRole: 'docente',
      attendee: { userId: ATTENDEE_USER_ID },
    });

    expect(result).toEqual({
      kind: 'forbidden',
      reason: 'not-in-attendees',
      message: NOT_IN_ATTENDEES_MESSAGE,
    });
  });

  it("an attendee row with `expected: false` does not authorize its own owner", async () => {
    const result = await run({
      userId: ATTENDEE_USER_ID,
      roles: [gcRole],
      highestRole: 'docente',
      attendee: { userId: ATTENDEE_USER_ID, expected: false },
    });

    expect(result).toEqual({
      kind: 'forbidden',
      reason: 'not-in-attendees',
      message: NOT_IN_ATTENDEES_MESSAGE,
    });
  });

  it('a facilitator row belonging to ANOTHER user does not make this caller host', async () => {
    const result = await run({
      userId: CONSULTOR_USER_ID,
      roles: [{ role_type: 'consultor', is_active: true, school_id: String(SCHOOL_ID) }],
      highestRole: 'consultor',
      facilitator: { userId: FACILITATOR_USER_ID },
    });

    expect(result).toEqual({
      kind: 'forbidden',
      reason: 'consultor-not-facilitator',
      message: CONSULTOR_NOT_FACILITATOR_MESSAGE,
    });
  });

  it('the same rows DO authorize the user they belong to — the double is not simply blind', async () => {
    const attendee = await run({
      userId: ATTENDEE_USER_ID,
      roles: [gcRole],
      highestRole: 'docente',
      attendee: { userId: ATTENDEE_USER_ID },
    });
    expect(attendee).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'participant' });

    const facilitator = await run({
      userId: FACILITATOR_USER_ID,
      roles: [{ role_type: 'consultor', is_active: true, school_id: String(SCHOOL_ID) }],
      highestRole: 'consultor',
      facilitator: { userId: FACILITATOR_USER_ID },
    });
    expect(facilitator).toEqual({ kind: 'authorized', sessionId: SESSION_ID, role: 'host' });
  });
});
