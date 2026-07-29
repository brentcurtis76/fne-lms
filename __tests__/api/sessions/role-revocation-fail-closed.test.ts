// @vitest-environment node
/**
 * Role revocation must fail closed (Z1a-4 / T1).
 *
 * Revoking a role sets `user_roles.is_active = false`, which makes the
 * authoritative query return "success, zero rows". `getUserRoles()` used to
 * read that shape as a cache miss and fall through to `user_roles_cache` — a
 * materialized view refreshed only by the role GRANT paths — so a revoked user
 * with a stale cache row stayed authorized everywhere.
 *
 * These tests run at the REAL boundary: `roleUtils` is NOT mocked, only the
 * Supabase client is. The authoritative table answers `[]`; the cache answers
 * with one stale, still-active role row. Every session surface must deny.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import detailHandler from '../../../pages/api/sessions/[id]/index';
import listHandler from '../../../pages/api/sessions/index';
import { resolveMeetSessionAccess } from '../../../lib/utils/session-meet-access';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  checkIsAdmin: vi.fn(),
  sendAuthError: vi.fn((res, message, status) => {
    res.status(status).json({ error: message });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const SESSION_SCHOOL_ID = 7;
const SESSION_COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

const REVOKED_USER_ID = 'u-revoked-0001';

const MEETING_LINK = 'https://meet.example.test/abc-def';

const sessionRow = {
  id: SESSION_ID,
  title: 'Sesión sintética',
  school_id: SESSION_SCHOOL_ID,
  growth_community_id: SESSION_COMMUNITY_ID,
  status: 'programada',
  is_active: true,
  session_date: '2026-03-10',
  start_time: '09:00:00',
  end_time: '10:30:00',
  meeting_link: MEETING_LINK,
  schools: { name: 'Colegio Sintético' },
  growth_communities: { name: 'Comunidad Sintética' },
};

/**
 * The stale row the materialized view still serves after a revocation: it was
 * built while the role was active and nothing refreshed it afterwards. Note the
 * view has no `is_active` column at all — see the mapper in roleUtils.
 */
const staleCacheRow = {
  user_id: REVOKED_USER_ID,
  role: 'consultor',
  school_id: SESSION_SCHOOL_ID,
  generation_id: null,
  community_id: SESSION_COMMUNITY_ID,
  approval_status: 'approved',
  is_admin: false,
  is_teacher: true,
  cached_at: '2026-07-01T00:00:00.000Z',
};

/** The same role, still live in `user_roles` — the positive control. */
const activeAuthoritativeRow = {
  id: 'ur-1',
  user_id: REVOKED_USER_ID,
  role_type: 'consultor',
  school_id: SESSION_SCHOOL_ID,
  generation_id: null,
  community_id: null,
  is_active: true,
};

type TableResults = Record<string, unknown[]>;

/**
 * Chainable Supabase stub keyed by table, with a per-table call queue (the
 * detail GET hits `consultor_sessions` and `session_facilitators` more than
 * once). Unlisted tables resolve empty.
 */
function buildClient(perTable: TableResults) {
  const counters: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      const results = perTable[table] ?? [];
      const resolved =
        results.length > 0
          ? results[Math.min(idx, results.length - 1)]
          : { data: null, error: null };

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

/** Authoritative query succeeds with ZERO rows; the cache still has the role. */
function revokedClient(extra: TableResults = {}) {
  return buildClient({
    user_roles: [{ data: [], error: null }],
    user_roles_cache: [{ data: [staleCacheRow], error: null }],
    consultor_sessions: [{ data: sessionRow, error: null }],
    session_facilitators: [
      { data: null, error: null },
      { data: [], error: null },
    ],
    session_attendees: [{ data: [], error: null }],
    session_reports: [{ data: [], error: null }],
    session_materials: [{ data: [], error: null }],
    session_communications: [{ data: [], error: null }],
    session_activity_log: [{ data: null, error: null }],
    session_edit_requests: [{ data: [], error: null }],
    ...extra,
  });
}

/** Same fixture, but the role is still live in `user_roles`. */
function activeClient(extra: TableResults = {}) {
  return revokedClient({
    user_roles: [{ data: [activeAuthoritativeRow], error: null }],
    ...extra,
  });
}

async function runDetail(client: unknown) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  (getApiUser as any).mockResolvedValue({ user: { id: REVOKED_USER_ID }, error: null });
  (createServiceRoleClient as any).mockReturnValue(client);

  const { req, res } = createMocks({ method: 'GET', query: { id: SESSION_ID } });
  await detailHandler(req as any, res as any);
  return res;
}

async function runList(client: unknown) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  (getApiUser as any).mockResolvedValue({ user: { id: REVOKED_USER_ID }, error: null });
  (createServiceRoleClient as any).mockReturnValue(client);

  const { req, res } = createMocks({ method: 'GET', query: {} });
  await listHandler(req as any, res as any);
  return res;
}

describe('revoked role + stale user_roles_cache → every session surface denies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/sessions/[id] denies (403), leaking neither session nor meeting link', async () => {
    const res = await runDetail(revokedClient());

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expect(res._getData()).not.toContain(MEETING_LINK);
    expect(res._getData()).not.toContain('Sesión sintética');
  });

  it('GET /api/sessions denies (403) and returns no rows', async () => {
    const res = await runList(
      revokedClient({ consultor_sessions: [{ data: [sessionRow], error: null, count: 1 }] })
    );

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expect(res._getData()).not.toContain(MEETING_LINK);
  });

  it('resolveMeetSessionAccess returns not-found', async () => {
    const access = await resolveMeetSessionAccess({
      sessionId: SESSION_ID,
      userId: REVOKED_USER_ID,
      service: revokedClient() as any,
    });

    expect(access).toEqual({ kind: 'not-found' });
  });
});

describe('positive control — the same fixture with the role still active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/sessions/[id] returns 200', async () => {
    const res = await runDetail(activeClient());
    expect(res._getStatusCode()).toBe(200);
  });

  it('GET /api/sessions returns the row', async () => {
    const res = await runList(
      activeClient({ consultor_sessions: [{ data: [sessionRow], error: null, count: 1 }] })
    );

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.sessions).toHaveLength(1);
  });

  it('resolveMeetSessionAccess returns ok', async () => {
    const access = await resolveMeetSessionAccess({
      sessionId: SESSION_ID,
      userId: REVOKED_USER_ID,
      service: activeClient() as any,
    });

    expect(access.kind).toBe('ok');
  });
});

describe('getUserRoles — cache is reachable only on an authoritative ERROR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not touch user_roles_cache when the query succeeds with zero rows', async () => {
    const { getUserRoles } = await import('../../../utils/roleUtils');
    const client = revokedClient();

    const roles = await getUserRoles(client as any, REVOKED_USER_ID);

    expect(roles).toEqual([]);
    const tables = (client.from as any).mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).toContain('user_roles');
    expect(tables).not.toContain('user_roles_cache');
  });

  it('falls back to the cache when the authoritative query errors', async () => {
    const { getUserRoles } = await import('../../../utils/roleUtils');
    const client = revokedClient({
      user_roles: [{ data: null, error: { message: 'connection terminated' } }],
    });

    const roles = await getUserRoles(client as any, REVOKED_USER_ID);

    expect(roles).toHaveLength(1);
    expect(roles[0].role_type).toBe('consultor');
    const tables = (client.from as any).mock.calls.map((c: unknown[]) => c[0]);
    expect(tables).toContain('user_roles_cache');
  });

  it('never stamps a fabricated is_active=true on a cached row', async () => {
    const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
    const client = revokedClient({
      user_roles: [{ data: null, error: { message: 'connection terminated' } }],
    });

    const roles = await getUserRoles(client as any, REVOKED_USER_ID);

    // Activity is UNKNOWN, not true, and provenance is explicit.
    expect(roles[0].is_active).toBeNull();
    expect(roles[0].from_cache).toBe(true);

    // Z1a-5 (Sol R2): unknown is not a licence to act either. Z1a-4 let this
    // resolve to 'consultor' so an outage would not sign the user out; that was
    // fail-open — a stale cached `admin` collected every admin grant. A
    // cache-only role list now resolves to null and every gate denies.
    expect(getHighestRole(roles)).toBeNull();
  });

  it('a cached row cannot authorize at all, so the degraded path denies the session', async () => {
    const res = await runDetail(
      revokedClient({
        user_roles: [{ data: null, error: { message: 'connection terminated' } }],
      })
    );

    // Denial now happens one gate EARLIER than in Z1a-4: not "you may not see
    // this session" (canViewSession refusing a scopeless role) but "you have no
    // roles" — the cached row never became a role in the first place.
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
  });
});
