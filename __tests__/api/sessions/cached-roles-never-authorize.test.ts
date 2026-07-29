// @vitest-environment node
/**
 * Cached role rows must never authorize (Z1a-5 / Sol R2 finding ①).
 *
 * Z1a-4 made a SUCCESSFUL `user_roles` query authoritative — zero rows means
 * zero roles — and stamped the cache-fallback rows `is_active: null` +
 * `from_cache: true` so they could not hand out school or community scope. What
 * it did NOT do was stop them counting in `getHighestRole()`, which still read
 * `is_active !== false` as active. So on the remaining reachable path — the
 * authoritative query ERRORS and `user_roles_cache` answers — a stale cached
 * `admin` row still produced `highestRole === 'admin'` and collected every
 * admin grant in the codebase. A degraded mode where ordinary users lose access
 * but administrators keep everything is fail-open exactly where fail-closed
 * matters most.
 *
 * `getHighestRole()` now skips `from_cache` rows outright, so a cache-only role
 * list resolves to `null` and each endpoint's existing "no roles" branch denies.
 *
 * These tests run at the REAL boundary: `roleUtils` is NOT mocked, only the
 * Supabase client is. `user_roles` errors; the cache answers with a stale row.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import detailHandler from '../../../pages/api/sessions/[id]/index';
import listHandler from '../../../pages/api/sessions/index';
import reportHandler from '../../../pages/api/sessions/[id]/reports/[rid]';
import singleIcalHandler from '../../../pages/api/sessions/[id]/ical';
import batchIcalHandler from '../../../pages/api/sessions/ical';
import { resolveMeetSessionAccess } from '../../../lib/utils/session-meet-access';

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: vi.fn(),
    createServiceRoleClient: vi.fn(),
    checkIsAdmin: vi.fn(),
    sendAuthError: vi.fn((res: any, message: string, status: number) => {
      res.status(status).json({ error: message });
    }),
    sendApiResponse: vi.fn((res: any, data: unknown, status = 200) => {
      res.status(status).json({ data });
    }),
    logApiRequest: vi.fn(),
    handleMethodNotAllowed: vi.fn((res: any) => {
      res.status(405).json({ error: 'Method not allowed' });
    }),
  };
});

const SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const REPORT_ID = '5b3e7171-2131-4f5f-9c33-4d8e0f2a3b44';
const SESSION_SCHOOL_ID = 7;
const SESSION_COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

const STALE_USER_ID = 'u-stale-0001';

const SESSION_TITLE = 'Sesión sintética';
const MEETING_LINK = 'https://meet.example.test/abc-def';
const AUTHOR_EMAIL = 'autora@test.local';

const sessionRow = {
  id: SESSION_ID,
  title: SESSION_TITLE,
  description: 'Descripción sintética',
  objectives: 'Objetivos sintéticos',
  school_id: SESSION_SCHOOL_ID,
  growth_community_id: SESSION_COMMUNITY_ID,
  status: 'programada',
  is_active: true,
  session_date: '2026-03-10',
  start_time: '09:00:00',
  end_time: '10:30:00',
  location: null,
  meeting_link: MEETING_LINK,
  schools: { name: 'Colegio Sintético' },
  growth_communities: { name: 'Comunidad Sintética' },
  session_facilitators: [],
};

const reportRow = {
  id: REPORT_ID,
  session_id: SESSION_ID,
  author_id: 'u-author-0001',
  visibility: 'all_participants',
  content: 'Contenido del informe',
  profiles: { first_name: 'Ana', last_name: 'Autora', email: AUTHOR_EMAIL },
};

/**
 * The stale rows `user_roles_cache` still serves after a revocation: built while
 * the role was active, never refreshed since. The view has no `is_active`
 * column at all — see the mapper in roleUtils.
 */
const staleCachedAdminRow = {
  user_id: STALE_USER_ID,
  role: 'admin',
  school_id: null,
  generation_id: null,
  community_id: null,
  cached_at: '2026-07-01T00:00:00.000Z',
};

const staleCachedCommunityRow = {
  user_id: STALE_USER_ID,
  role: 'lider_comunidad',
  school_id: SESSION_SCHOOL_ID,
  generation_id: null,
  community_id: SESSION_COMMUNITY_ID,
  cached_at: '2026-07-01T00:00:00.000Z',
};

type TableResults = Record<string, unknown[]>;

/**
 * Chainable Supabase stub keyed by table, with a per-table call queue (the
 * detail GET hits several tables more than once). Unlisted tables resolve
 * empty, which is what the cache mapper's schools/generations/communities
 * lookups want.
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

/**
 * The degraded path: the authoritative query ERRORS (the only way the cache is
 * reachable at all since Z1a-4) and the cache answers with `cachedRows`.
 */
function outageClient(cachedRows: unknown[], extra: TableResults = {}) {
  return buildClient({
    user_roles: [{ data: null, error: { message: 'connection terminated' } }],
    user_roles_cache: [{ data: cachedRows, error: null }],
    consultor_sessions: [{ data: sessionRow, error: null }],
    session_reports: [{ data: reportRow, error: null }],
    session_facilitators: [
      { data: null, error: null },
      { data: [], error: null },
    ],
    session_attendees: [{ data: [], error: null }],
    session_materials: [{ data: [], error: null }],
    session_communications: [{ data: [], error: null }],
    session_activity_log: [{ data: null, error: null }],
    session_edit_requests: [{ data: [], error: null }],
    ...extra,
  });
}

async function run(
  handler: (req: unknown, res: unknown) => unknown,
  client: unknown,
  query: Record<string, string>
) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  (getApiUser as any).mockResolvedValue({ user: { id: STALE_USER_ID }, error: null });
  (createServiceRoleClient as any).mockReturnValue(client);

  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as any, res as any);
  return res;
}

/** Nothing about the session may appear in ANY denial body. */
function expectNoSessionMetadata(body: string) {
  expect(body).not.toContain(SESSION_TITLE);
  expect(body).not.toContain(MEETING_LINK);
  expect(body).not.toContain(SESSION_COMMUNITY_ID);
  expect(body).not.toContain('Colegio Sintético');
}

// ------------------------------------------------------------------
// Group 1 — stale cached ADMIN row, authoritative query erroring
// ------------------------------------------------------------------

describe('authoritative ERROR + stale cached admin row → every surface denies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getHighestRole refuses a cache-only role list', async () => {
    const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
    const client = outageClient([staleCachedAdminRow]);

    const roles = await getUserRoles(client as any, STALE_USER_ID);

    // The row IS returned — the shell still knows the user exists…
    expect(roles).toHaveLength(1);
    expect(roles[0].role_type).toBe('admin');
    expect(roles[0].from_cache).toBe(true);
    expect(roles[0].is_active).toBeNull();

    // …but it authorizes nothing.
    expect(getHighestRole(roles)).toBeNull();
  });

  it('session detail denies', async () => {
    const res = await run(detailHandler, outageClient([staleCachedAdminRow]), { id: SESSION_ID });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expectNoSessionMetadata(res._getData());
  });

  it('session list denies', async () => {
    const res = await run(
      listHandler,
      outageClient([staleCachedAdminRow], {
        consultor_sessions: [{ data: [sessionRow], error: null, count: 1 }],
      }),
      {}
    );

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expectNoSessionMetadata(res._getData());
  });

  it('report disclosure denies, leaking no author e-mail', async () => {
    const res = await run(reportHandler, outageClient([staleCachedAdminRow]), {
      id: SESSION_ID,
      rid: REPORT_ID,
    });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expect(res._getData()).not.toContain(AUTHOR_EMAIL);
    expect(res._getData()).not.toContain('Contenido del informe');
  });

  it('single-session iCal denies', async () => {
    const res = await run(singleIcalHandler, outageClient([staleCachedAdminRow]), {
      id: SESSION_ID,
    });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expectNoSessionMetadata(res._getData());
    expect(res._getData()).not.toContain('BEGIN:VCALENDAR');
  });

  it('batch iCal denies', async () => {
    const res = await run(
      batchIcalHandler,
      outageClient([staleCachedAdminRow], {
        consultor_sessions: [{ data: [sessionRow], error: null }],
      }),
      {}
    );

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expectNoSessionMetadata(res._getData());
    expect(res._getData()).not.toContain('BEGIN:VCALENDAR');
  });

  it('the /meet resolver returns not-found', async () => {
    const access = await resolveMeetSessionAccess({
      sessionId: SESSION_ID,
      userId: STALE_USER_ID,
      service: outageClient([staleCachedAdminRow]) as any,
    });

    expect(access).toEqual({ kind: 'not-found' });
  });
});

// ------------------------------------------------------------------
// Group 2 — stale cached COMMUNITY row, authoritative query erroring
// ------------------------------------------------------------------

describe('authoritative ERROR + stale cached community row → batch iCal exports nothing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Sol's group 2 asked for "an empty calendar, zero session metadata". The
   * empty-calendar branch is no longer REACHED on this input: with finding ①
   * fixed the cached row never becomes a role, so the handler denies at the
   * `highestRole` gate before the scope builder runs. That is strictly stronger
   * than a 200 with an empty VCALENDAR — the requirement it enforces (zero
   * session metadata) is asserted here, and the empty-calendar shape itself is
   * asserted below on the input that still reaches it.
   */
  it('denies before scoping, exporting zero session metadata', async () => {
    const res = await run(
      batchIcalHandler,
      outageClient([staleCachedCommunityRow], {
        consultor_sessions: [{ data: [sessionRow], error: null }],
      }),
      {}
    );

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Usuario sin roles asignados');
    expectNoSessionMetadata(res._getData());
    expect(res._getData()).not.toContain('BEGIN:VEVENT');
  });

  it('the stale community membership grants no scope even as a raw role list', async () => {
    const { getUserRoles } = await import('../../../utils/roleUtils');
    const { buildSessionScope } = await import('../../../lib/utils/session-scope');
    const roles = await getUserRoles(
      outageClient([staleCachedCommunityRow]) as any,
      STALE_USER_ID
    );

    // Even if a future caller resolved a role type some other way, the cached
    // row's `is_active: null` still yields no community scope.
    expect(buildSessionScope('lider_comunidad', roles)).toEqual({ kind: 'none' });
  });

  it('an ACTIVE role with no session scope still gets a 200 empty calendar', async () => {
    // The empty-calendar branch, exercised where it is genuinely reachable: an
    // authoritative, active role that simply grants no session scope.
    const client = buildClient({
      user_roles: [
        {
          data: [
            {
              id: 'ur-1',
              user_id: STALE_USER_ID,
              role_type: 'docente',
              school_id: 99,
              generation_id: null,
              community_id: null,
              is_active: true,
            },
          ],
          error: null,
        },
      ],
      consultor_sessions: [{ data: [sessionRow], error: null }],
    });

    const res = await run(batchIcalHandler, client, {});

    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toContain('BEGIN:VCALENDAR');
    expect(res._getData()).not.toContain('BEGIN:VEVENT');
    expectNoSessionMetadata(res._getData());
  });
});
