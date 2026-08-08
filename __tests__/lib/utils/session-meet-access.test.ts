// @vitest-environment node
/**
 * SSR authorization for the meeting interstitial (`/meet/session/[id]`).
 *
 * The page's getServerSideProps is a thin mapper over this resolver
 * (`unauthenticated` → redirect /login, `not-found` → notFound: true), so the
 * decisions are all asserted here. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { resolveMeetSessionAccess } from '../../../lib/utils/session-meet-access';
import {
  CONSULTOR_NOT_FACILITATOR_MESSAGE,
  MEETING_CLOSED_MESSAGE,
  NOT_IN_ATTENDEES_MESSAGE,
  SESSION_STATUS_CLOSES_JOIN,
} from '../../../lib/utils/meeting-join-policy';

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const OTHER_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';
const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;
const COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';
const OTHER_COMMUNITY_ID = 'c0222222-2222-4222-8222-222222222222';

const GC_USER_ID = 'u-gc-member-0001';
const ADMIN_USER_ID = 'u-admin-0001';
const FACILITATOR_USER_ID = 'u-facilitator-0001';

const MEETING_LINK = 'https://meet.example.test/abc-def';

const sessionRow = {
  id: SESSION_ID,
  title: 'Sesión sintética',
  session_date: '2026-03-10',
  start_time: '09:00:00',
  end_time: '10:30:00',
  meeting_link: MEETING_LINK,
  is_zoom_managed: false,
  school_id: SCHOOL_ID,
  // r26: the join policy reads `status` + `modality` off this same row and the
  // page now gates on both, so the fixture has to carry a real modality — an
  // unrecognised one is closed by the §5 allowlist, which is the correct default.
  modality: 'online',
  growth_community_id: COMMUNITY_ID,
  status: 'programada',
  is_active: true,
};

/**
 * Chainable Supabase stub: `consultor_sessions` resolves the session row,
 * `session_facilitators` the facilitator membership row, `session_attendees` the
 * expected-attendee row the join policy reads.
 */
function buildService(
  opts: { session?: unknown; isFacilitator?: boolean; isAttendee?: boolean } = {}
) {
  const results: Record<string, unknown> = {
    consultor_sessions: {
      data: 'session' in opts ? opts.session : sessionRow,
      error: null,
    },
    session_facilitators: {
      data: opts.isFacilitator ? { id: 'sf-1' } : null,
      error: null,
    },
    session_attendees: {
      data: opts.isAttendee ? { id: 'sa-1' } : null,
      error: null,
    },
  };

  return {
    from: vi.fn((table: string) => {
      const resolved = results[table] ?? { data: null, error: null };
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, handler));
        },
      };
      return new Proxy({}, handler);
    }),
  };
}

function run(opts: {
  sessionId?: unknown;
  userId?: string | null;
  roles?: Record<string, unknown>[];
  highestRole?: string | null;
  session?: unknown;
  isFacilitator?: boolean;
  isAttendee?: boolean;
}) {
  mockGetUserRoles.mockResolvedValue(opts.roles ?? []);
  mockGetHighestRole.mockReturnValue(opts.highestRole ?? null);

  return resolveMeetSessionAccess({
    sessionId: 'sessionId' in opts ? opts.sessionId : SESSION_ID,
    userId: opts.userId === undefined ? GC_USER_ID : opts.userId,
    service: buildService({
      ...('session' in opts ? { session: opts.session } : {}),
      isFacilitator: opts.isFacilitator,
      isAttendee: opts.isAttendee,
    }) as never,
  });
}

const activeGcRole = [
  {
    role_type: 'lider_comunidad',
    community_id: COMMUNITY_ID,
    school_id: SCHOOL_ID,
    is_active: true,
  },
];

describe('resolveMeetSessionAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports unauthenticated when there is no user', async () => {
    await expect(run({ userId: null })).resolves.toEqual({ kind: 'unauthenticated' });
  });

  it('returns the session to an active GC member on the attendee list', async () => {
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      isAttendee: true,
    });

    expect(access).toEqual({
      kind: 'ok',
      session: {
        id: SESSION_ID,
        title: 'Sesión sintética',
        session_date: '2026-03-10',
        start_time: '09:00:00',
        end_time: '10:30:00',
        meeting_link: MEETING_LINK,
        is_zoom_managed: false,
        join_access: 'allowed',
        join_denial_message: null,
      },
    });
  });

  it('returns the session with a null link when there is no meeting', async () => {
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      isAttendee: true,
      session: { ...sessionRow, meeting_link: null },
    });

    expect(access.kind).toBe('ok');
    expect(access.kind === 'ok' && access.session.meeting_link).toBeNull();
  });

  // Zoom plan §8: the page picks its join control from this flag, so it has to
  // survive the resolver rather than being re-derived from the (always NULL)
  // link of a managed session.
  it('carries managed intent through to the view', async () => {
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      session: { ...sessionRow, meeting_link: null, is_zoom_managed: true },
    });

    expect(access.kind === 'ok' && access.session.is_zoom_managed).toBe(true);
  });

  it('treats a missing managed flag as unmanaged', async () => {
    const { is_zoom_managed: _omitted, ...withoutFlag } = sessionRow;
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      session: withoutFlag,
    });

    expect(access.kind === 'ok' && access.session.is_zoom_managed).toBe(false);
  });

  it('is not-found for a viewer of a different community', async () => {
    const access = await run({
      roles: [
        {
          role_type: 'lider_comunidad',
          community_id: OTHER_COMMUNITY_ID,
          school_id: OTHER_SCHOOL_ID,
          is_active: true,
        },
      ],
      highestRole: 'lider_comunidad',
    });

    expect(access).toEqual({ kind: 'not-found' });
  });

  it('is not-found when the community role has been revoked', async () => {
    const access = await run({
      roles: [{ ...activeGcRole[0], is_active: false }],
      highestRole: 'lider_comunidad',
    });

    expect(access).toEqual({ kind: 'not-found' });
  });

  it('is not-found for a nonexistent session — indistinguishable from a denied one', async () => {
    const denied = await run({
      roles: [
        {
          role_type: 'consultor',
          school_id: OTHER_SCHOOL_ID,
          community_id: null,
          is_active: true,
        },
      ],
      highestRole: 'consultor',
    });

    const missing = await run({
      sessionId: OTHER_SESSION_ID,
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      session: null,
    });

    expect(missing).toEqual({ kind: 'not-found' });
    expect(JSON.stringify(missing)).toBe(JSON.stringify(denied));
  });

  it('is not-found for a malformed session id', async () => {
    await expect(
      run({ sessionId: 'not-a-uuid', roles: activeGcRole, highestRole: 'lider_comunidad' })
    ).resolves.toEqual({ kind: 'not-found' });
  });

  it('is not-found for a user with no roles at all', async () => {
    await expect(run({ roles: [], highestRole: null })).resolves.toEqual({ kind: 'not-found' });
  });

  it('hides an archived session from a GC member but not from an admin', async () => {
    const archived = { ...sessionRow, is_active: false };

    await expect(
      run({ roles: activeGcRole, highestRole: 'lider_comunidad', session: archived })
    ).resolves.toEqual({ kind: 'not-found' });

    const adminAccess = await run({
      userId: ADMIN_USER_ID,
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
      highestRole: 'admin',
      session: archived,
    });

    expect(adminAccess.kind).toBe('ok');
  });

  it('defers to canViewSession: facilitating alone does not grant view access', async () => {
    // canViewSession has no facilitator branch — scope (community or school)
    // is what grants a view. Asserted here so the interstitial can never drift
    // into a second, looser copy of the policy.
    const outOfScopeFacilitator = await run({
      userId: FACILITATOR_USER_ID,
      roles: [
        {
          role_type: 'docente',
          school_id: OTHER_SCHOOL_ID,
          community_id: OTHER_COMMUNITY_ID,
          is_active: true,
        },
      ],
      highestRole: 'docente',
      isFacilitator: true,
    });

    expect(outOfScopeFacilitator).toEqual({ kind: 'not-found' });

    const scopedFacilitator = await run({
      userId: FACILITATOR_USER_ID,
      roles: [
        {
          role_type: 'docente',
          school_id: SCHOOL_ID,
          community_id: COMMUNITY_ID,
          is_active: true,
        },
      ],
      highestRole: 'docente',
      isFacilitator: true,
    });

    expect(scopedFacilitator.kind).toBe('ok');
  });
});

/**
 * The join capability (plan §5, amended 2026-08-06 by owner decision).
 *
 * Page visibility is `canViewSession` and does not move — every case below that
 * is refused a join still resolves to `kind: 'ok'`, which is the property the
 * amendment turns on. What the refusal removes is the way IN: the affordance and
 * the raw pasted link alike, and the link is removed from the RESULT, not from
 * the markup, because props are serialised into `__NEXT_DATA__`.
 */
describe('resolveMeetSessionAccess — the join capability is not page visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // §14 on unless a test says otherwise; the kill switch is asserted below.
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const sameSchoolConsultor = [
    { role_type: 'consultor', school_id: SCHOOL_ID, community_id: null, is_active: true },
  ];

  it('refuses the join to a GC member who is not on the attendee list, and keeps the page', async () => {
    const access = await run({ roles: activeGcRole, highestRole: 'lider_comunidad' });

    expect(access.kind).toBe('ok');
    expect(access.kind === 'ok' && access.session.join_access).toBe('denied');
    // §5 names the roster and the remedy for this persona and only this one.
    expect(access.kind === 'ok' && access.session.join_denial_message).toBe(
      NOT_IN_ATTENDEES_MESSAGE
    );
  });

  it('withholds the raw link from the RESULT, not merely from the markup', async () => {
    const access = await run({ roles: activeGcRole, highestRole: 'lider_comunidad' });

    expect(access.kind === 'ok' && access.session.meeting_link).toBeNull();
    // What getServerSideProps would serialise. The distinctive synthetic value
    // must not appear anywhere in it.
    expect(JSON.stringify(access)).not.toContain(MEETING_LINK);
  });

  it('refuses the join to a same-school consultor who is not a facilitator, without naming the roster', async () => {
    const access = await run({
      userId: 'u-consultor-0001',
      roles: sameSchoolConsultor,
      highestRole: 'consultor',
    });

    expect(access.kind).toBe('ok');
    expect(access.kind === 'ok' && access.session.join_access).toBe('denied');
    expect(access.kind === 'ok' && access.session.join_denial_message).toBe(
      CONSULTOR_NOT_FACILITATOR_MESSAGE
    );
    expect(access.kind === 'ok' && access.session.meeting_link).toBeNull();
  });

  it('allows the join — and the link — to an expected attendee', async () => {
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      isAttendee: true,
    });

    expect(access.kind === 'ok' && access.session.join_access).toBe('allowed');
    expect(access.kind === 'ok' && access.session.meeting_link).toBe(MEETING_LINK);
  });

  it('allows the join to the session facilitator and to an admin', async () => {
    const facilitator = await run({
      userId: FACILITATOR_USER_ID,
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      isFacilitator: true,
    });

    expect(facilitator.kind === 'ok' && facilitator.session.join_access).toBe('allowed');
    expect(facilitator.kind === 'ok' && facilitator.session.meeting_link).toBe(MEETING_LINK);

    const admin = await run({
      userId: ADMIN_USER_ID,
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
      highestRole: 'admin',
    });

    expect(admin.kind === 'ok' && admin.session.join_access).toBe('allowed');
    expect(admin.kind === 'ok' && admin.session.meeting_link).toBe(MEETING_LINK);
  });

  // The whole point of the amendment: the same viewer, the same refusal,
  // whichever provider the scheduler happened to pick.
  it('refuses the same viewer on a Zoom-managed session and on a pasted-link session alike', async () => {
    const pasted = await run({ roles: activeGcRole, highestRole: 'lider_comunidad' });
    const managed = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
      session: { ...sessionRow, meeting_link: null, is_zoom_managed: true },
    });

    expect(pasted.kind === 'ok' && pasted.session.join_access).toBe('denied');
    expect(managed.kind === 'ok' && managed.session.join_access).toBe('denied');
  });

  describe('§14 kill switch', () => {
    it('withdraws the managed join when the master flag is off', async () => {
      vi.stubEnv('FEATURE_ZOOM_MEETINGS', '');

      const access = await run({
        roles: activeGcRole,
        highestRole: 'lider_comunidad',
        isAttendee: true,
        session: { ...sessionRow, meeting_link: null, is_zoom_managed: true },
      });

      expect(access.kind).toBe('ok');
      expect(access.kind === 'ok' && access.session.join_access).toBe('disabled');
    });

    it('leaves a pasted Meet/Teams link alone — the flag governs Zoom', async () => {
      vi.stubEnv('FEATURE_ZOOM_MEETINGS', '');

      const access = await run({
        roles: activeGcRole,
        highestRole: 'lider_comunidad',
        isAttendee: true,
      });

      expect(access.kind === 'ok' && access.session.join_access).toBe('allowed');
    });

    it('never reveals its own state to a viewer the join list already refused', async () => {
      vi.stubEnv('FEATURE_ZOOM_MEETINGS', '');

      const access = await run({
        roles: activeGcRole,
        highestRole: 'lider_comunidad',
        session: { ...sessionRow, meeting_link: null, is_zoom_managed: true },
      });

      expect(access.kind === 'ok' && access.session.join_access).toBe('denied');
    });

    it('is not an existence oracle: a non-entitled viewer still gets exactly the nonexistent-session answer', async () => {
      vi.stubEnv('FEATURE_ZOOM_MEETINGS', '');

      const denied = await run({
        roles: [
          {
            role_type: 'consultor',
            school_id: OTHER_SCHOOL_ID,
            community_id: null,
            is_active: true,
          },
        ],
        highestRole: 'consultor',
      });

      const missing = await run({
        sessionId: OTHER_SESSION_ID,
        roles: activeGcRole,
        highestRole: 'lider_comunidad',
        session: null,
      });

      expect(denied).toEqual({ kind: 'not-found' });
      expect(JSON.stringify(denied)).toBe(JSON.stringify(missing));
    });
  });
});

/**
 * [N6]/[N7] r26 — the session-state half of the source-of-truth rule.
 *
 * r23 gave the join ROUTE `joinIsClosedBySource`, so a cancelled or `presencial`
 * session answers 410 there. The PAGE went on handing the same authorized
 * persona the pasted link for the same session. These assert the page now closes
 * from the SAME predicate, for both providers, with the link out of the props —
 * not merely out of the markup, since props are serialised into `__NEXT_DATA__`.
 */
describe('[N6] a session the source of truth has closed offers no join path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Authorized beyond doubt: an expected attendee of this very session. */
  const authorized = {
    roles: activeGcRole,
    highestRole: 'lider_comunidad',
    isAttendee: true,
  };

  it('a cancelled session: no affordance, no raw link in the props', async () => {
    const access = await run({
      ...authorized,
      session: { ...sessionRow, status: 'cancelada' },
    });

    expect(access.kind).toBe('ok');
    expect(access.kind === 'ok' && access.session.join_access).toBe('closed');
    expect(access.kind === 'ok' && access.session.meeting_link).toBeNull();
    expect(JSON.stringify(access)).not.toContain(MEETING_LINK);
  });

  it('a presencial session: same answer, same absent link', async () => {
    const access = await run({
      ...authorized,
      session: { ...sessionRow, modality: 'presencial' },
    });

    expect(access.kind).toBe('ok');
    expect(access.kind === 'ok' && access.session.join_access).toBe('closed');
    expect(access.kind === 'ok' && access.session.meeting_link).toBeNull();
    expect(JSON.stringify(access)).not.toContain(MEETING_LINK);
  });

  it('a MANAGED session closes identically — one rule, both providers', async () => {
    const access = await run({
      ...authorized,
      session: { ...sessionRow, meeting_link: null, is_zoom_managed: true, status: 'cancelada' },
    });

    expect(access.kind === 'ok' && access.session.join_access).toBe('closed');
  });

  it('carries the same sentence the join route answers 410 with', async () => {
    const access = await run({
      ...authorized,
      session: { ...sessionRow, status: 'cancelada' },
    });

    expect(access.kind === 'ok' && access.session.join_denial_message).toBe(
      MEETING_CLOSED_MESSAGE
    );
  });

  it('[N7] every status the closed set closes, closes the page too', async () => {
    // Driven off the exported record rather than a list retyped here: a new
    // SessionStatus classified as closing must close the page without anyone
    // remembering to add a case.
    for (const [status, closes] of Object.entries(SESSION_STATUS_CLOSES_JOIN)) {
      const access = await run({ ...authorized, session: { ...sessionRow, status } });

      expect(access.kind).toBe('ok');
      expect(access.kind === 'ok' && access.session.join_access).toBe(
        closes ? 'closed' : 'allowed'
      );
    }
  });

  it('a live session is untouched — this is what makes the assertions above mean something', async () => {
    const access = await run(authorized);

    expect(access.kind === 'ok' && access.session.join_access).toBe('allowed');
    expect(access.kind === 'ok' && access.session.meeting_link).toBe(MEETING_LINK);
  });
});
