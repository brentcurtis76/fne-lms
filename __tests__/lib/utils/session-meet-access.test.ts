// @vitest-environment node
/**
 * SSR authorization for the meeting interstitial (`/meet/session/[id]`).
 *
 * The page's getServerSideProps is a thin mapper over this resolver
 * (`unauthenticated` → redirect /login, `not-found` → notFound: true), so the
 * decisions are all asserted here. Synthetic data only.
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

import { resolveMeetSessionAccess } from '../../../lib/utils/session-meet-access';

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
  growth_community_id: COMMUNITY_ID,
  status: 'programada',
  is_active: true,
};

/**
 * Chainable Supabase stub: `consultor_sessions` resolves the session row,
 * `session_facilitators` resolves the facilitator membership row.
 */
function buildService(opts: { session?: unknown; isFacilitator?: boolean } = {}) {
  const results: Record<string, unknown> = {
    consultor_sessions: {
      data: 'session' in opts ? opts.session : sessionRow,
      error: null,
    },
    session_facilitators: {
      data: opts.isFacilitator ? { id: 'sf-1' } : null,
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
}) {
  mockGetUserRoles.mockResolvedValue(opts.roles ?? []);
  mockGetHighestRole.mockReturnValue(opts.highestRole ?? null);

  return resolveMeetSessionAccess({
    sessionId: 'sessionId' in opts ? opts.sessionId : SESSION_ID,
    userId: opts.userId === undefined ? GC_USER_ID : opts.userId,
    service: buildService({
      ...('session' in opts ? { session: opts.session } : {}),
      isFacilitator: opts.isFacilitator,
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

  it('returns the session to an active GC member of its community', async () => {
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
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
      },
    });
  });

  it('returns the session with a null link when there is no meeting', async () => {
    const access = await run({
      roles: activeGcRole,
      highestRole: 'lider_comunidad',
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
