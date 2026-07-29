// @vitest-environment node
/**
 * Batch iCal shares the canonical session scope (Z1a-5 / Sol R2 finding ②).
 *
 * `GET /api/sessions/ical` kept its own one-branch scope: anyone who was not
 * admin or consultor was filtered to every row carrying a `community_id`, with
 * NO `is_active` check and no consultor/community union. Two consequences:
 *
 *   - under the cache fallback that was an authorization hole, not a
 *     completeness nit — a stale membership would have returned real session
 *     metadata (covered in `cached-roles-never-authorize.test.ts`);
 *   - for legitimate mixed-role users it reproduced exactly the list/detail
 *     divergence T4 fixed in `pages/api/sessions/index.ts`.
 *
 * The translation from `canViewSession()` to a query filter now lives once in
 * `lib/utils/session-scope.ts` and both collection endpoints consume it. These
 * tests assert the filter that actually reaches Supabase from EACH endpoint and
 * compare them, so a future copy-paste cannot let them drift apart again.
 *
 * `roleUtils` is NOT mocked — roles come from the stubbed `user_roles` table
 * through the real `getUserRoles()`/`getHighestRole()`.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import listHandler from '../../../pages/api/sessions/index';
import batchIcalHandler from '../../../pages/api/sessions/ical';
import detailHandler from '../../../pages/api/sessions/[id]/index';

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

const MIXED_USER_ID = 'u-mixed-0001';

const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;

const IN_SCHOOL_COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';
/** The community the user belongs to — deliberately in ANOTHER school. */
const OUT_OF_SCHOOL_COMMUNITY_ID = 'c0222222-2222-4222-8222-222222222222';

const SCHOOL_SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const COMMUNITY_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';

/** School-scoped consultor AND an active membership in another school's GC. */
const MIXED_ROLES = [
  {
    id: 'ur-1',
    user_id: MIXED_USER_ID,
    role_type: 'consultor',
    school_id: SCHOOL_ID,
    generation_id: null,
    community_id: null,
    is_active: true,
  },
  {
    id: 'ur-2',
    user_id: MIXED_USER_ID,
    role_type: 'docente',
    school_id: OTHER_SCHOOL_ID,
    generation_id: null,
    community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
    is_active: true,
  },
];

function makeSession(overrides: Record<string, unknown>) {
  return {
    title: 'Sesión sintética',
    description: null,
    objectives: null,
    session_date: '2026-03-10',
    start_time: '09:00:00',
    end_time: '10:30:00',
    location: null,
    meeting_link: null,
    status: 'programada',
    is_active: true,
    session_facilitators: [],
    schools: { name: 'Colegio Sintético' },
    growth_communities: { name: 'Comunidad Sintética' },
    ...overrides,
  };
}

/** Reached via the consultor school scope. */
const schoolSession = makeSession({
  id: SCHOOL_SESSION_ID,
  title: 'Sesion del colegio',
  school_id: SCHOOL_ID,
  growth_community_id: IN_SCHOOL_COMMUNITY_ID,
});

/** Reached via the out-of-school community membership. */
const communitySession = makeSession({
  id: COMMUNITY_SESSION_ID,
  title: 'Sesion de la comunidad',
  school_id: OTHER_SCHOOL_ID,
  growth_community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
});

interface QuerySpy {
  ors: string[];
  neqs: Array<{ col: string; value: unknown }>;
  ins: Array<{ col: string; values: unknown }>;
}

/**
 * Table-keyed chainable stub that records the scope calls made against
 * `consultor_sessions` only — the role lookups use `.eq()`/`.in()` too and
 * would otherwise pollute the assertions.
 */
function buildClient(
  perTable: Record<string, { data: unknown; error?: unknown; count?: number }>,
  spy: QuerySpy
) {
  return {
    from: vi.fn((table: string) => {
      const resolved = perTable[table] ?? { data: null, error: null };
      const value = {
        data: resolved.data ?? null,
        error: resolved.error ?? null,
        count: resolved.count,
      };
      const record = table === 'consultor_sessions';

      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(value);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(value),
            }));
          }
          if (record && prop === 'or') {
            return vi.fn((clause: string) => {
              spy.ors.push(clause);
              return new Proxy({}, handler);
            });
          }
          if (record && prop === 'neq') {
            return vi.fn((col: string, v: unknown) => {
              spy.neqs.push({ col, value: v });
              return new Proxy({}, handler);
            });
          }
          if (record && prop === 'in') {
            return vi.fn((col: string, values: unknown) => {
              spy.ins.push({ col, values });
              return new Proxy({}, handler);
            });
          }
          return vi.fn(() => new Proxy({}, handler));
        },
      };
      return new Proxy({}, handler);
    }),
  };
}

async function run(
  handler: (req: unknown, res: unknown) => unknown,
  opts: {
    roles: unknown[];
    rows: unknown[] | Record<string, unknown>;
    query?: Record<string, string>;
    count?: number;
  }
) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const spy: QuerySpy = { ors: [], neqs: [], ins: [] };

  const client = buildClient(
    {
      user_roles: { data: opts.roles, error: null },
      consultor_sessions: {
        data: opts.rows,
        error: null,
        count: opts.count ?? (Array.isArray(opts.rows) ? opts.rows.length : 1),
      },
      session_facilitators: { data: [], error: null },
      session_attendees: { data: [], error: null },
      session_reports: { data: [], error: null },
      session_materials: { data: [], error: null },
      session_communications: { data: [], error: null },
      session_activity_log: { data: null, error: null },
      session_edit_requests: { data: [], error: null },
    },
    spy
  );

  (getApiUser as any).mockResolvedValue({ user: { id: MIXED_USER_ID }, error: null });
  (createServiceRoleClient as any).mockReturnValue(client);

  const { req, res } = createMocks({ method: 'GET', query: opts.query ?? {} });
  await handler(req as any, res as any);
  return { res, spy };
}

const runList = (opts: Parameters<typeof run>[1]) => run(listHandler, opts);
const runBatchIcal = (opts: Parameters<typeof run>[1]) => run(batchIcalHandler, opts);

function countEvents(ics: string): number {
  return ics.split('BEGIN:VEVENT').length - 1;
}

describe('batch iCal scope === list scope (the union canViewSession grants)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mixed role: the batch export unions school scope OR community memberships', async () => {
    const { res, spy } = await runBatchIcal({
      roles: MIXED_ROLES,
      rows: [schoolSession, communitySession],
    });

    expect(res._getStatusCode()).toBe(200);
    expect(spy.ors).toHaveLength(1);
    expect(spy.ors[0]).toContain(`school_id.in.(${SCHOOL_ID})`);
    expect(spy.ors[0]).toContain(`growth_community_id.in.("${OUT_OF_SCHOOL_COMMUNITY_ID}")`);

    // The old one-branch shapes are gone: no bare school_id / community_id `in`.
    expect(spy.ins.filter((f) => f.col === 'school_id')).toHaveLength(0);
    expect(spy.ins.filter((f) => f.col === 'growth_community_id')).toHaveLength(0);
  });

  it('list and batch iCal build the byte-identical scope clause', async () => {
    const list = await runList({ roles: MIXED_ROLES, rows: [schoolSession, communitySession] });
    const ical = await runBatchIcal({ roles: MIXED_ROLES, rows: [schoolSession, communitySession] });

    expect(ical.spy.ors).toEqual(list.spy.ors);
    expect(ical.spy.neqs).toEqual(list.spy.neqs);
  });

  it('both scopes reach the exported calendar', async () => {
    const { res } = await runBatchIcal({
      roles: MIXED_ROLES,
      rows: [schoolSession, communitySession],
    });

    const ics = res._getData();
    expect(countEvents(ics)).toBe(2);
    expect(ics).toContain('Sesion del colegio');
    expect(ics).toContain('Sesion de la comunidad');
  });

  it('detail agrees for the school-scope session', async () => {
    const { res } = await run(detailHandler, {
      roles: MIXED_ROLES,
      rows: schoolSession,
      query: { id: SCHOOL_SESSION_ID },
    });

    expect(res._getStatusCode()).toBe(200);
  });

  it('detail agrees for the out-of-school community session', async () => {
    const { res } = await run(detailHandler, {
      roles: MIXED_ROLES,
      rows: communitySession,
      query: { id: COMMUNITY_SESSION_ID },
    });

    expect(res._getStatusCode()).toBe(200);
  });

  it('the same two sessions come back from the list', async () => {
    const { res } = await runList({
      roles: MIXED_ROLES,
      rows: [schoolSession, communitySession],
    });

    const data = JSON.parse(res._getData()).data;
    expect(data.sessions.map((s: { id: string }) => s.id)).toEqual([
      SCHOOL_SESSION_ID,
      COMMUNITY_SESSION_ID,
    ]);
  });
});

describe('batch iCal — scope behaviours that must not regress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin stays unfiltered and still sees drafts', async () => {
    const { res, spy } = await runBatchIcal({
      roles: [
        {
          id: 'ur-a',
          user_id: MIXED_USER_ID,
          role_type: 'admin',
          school_id: null,
          generation_id: null,
          community_id: null,
          is_active: true,
        },
      ],
      rows: [schoolSession, communitySession],
    });

    expect(res._getStatusCode()).toBe(200);
    expect(spy.ors).toHaveLength(0);
    expect(spy.neqs).toHaveLength(0);
  });

  it('a global consultor stays unfiltered and still sees drafts', async () => {
    const { spy } = await runBatchIcal({
      roles: [
        {
          id: 'ur-gc',
          user_id: MIXED_USER_ID,
          role_type: 'consultor',
          school_id: null,
          generation_id: null,
          community_id: null,
          is_active: true,
        },
      ],
      rows: [schoolSession],
    });

    expect(spy.ors).toHaveLength(0);
    expect(spy.neqs).toHaveLength(0);
  });

  it('a plain GC member is scoped to their communities and sees no drafts', async () => {
    const { spy } = await runBatchIcal({
      roles: [
        {
          id: 'ur-l',
          user_id: MIXED_USER_ID,
          role_type: 'lider_comunidad',
          school_id: OTHER_SCHOOL_ID,
          generation_id: null,
          community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
          is_active: true,
        },
      ],
      rows: [communitySession],
    });

    expect(spy.ors).toEqual([`growth_community_id.in.("${OUT_OF_SCHOOL_COMMUNITY_ID}")`]);
    expect(spy.neqs).toContainEqual({ col: 'status', value: 'borrador' });
  });

  it('a REVOKED community membership grants no scope — empty calendar', async () => {
    // The user keeps an active role (so they still HAVE a highestRole) but the
    // community membership itself is revoked: the question under test is scope,
    // not authentication. A sole revoked role is covered by
    // `role-revocation-fail-closed.test.ts` and denies with 403 instead.
    const { res, spy } = await runBatchIcal({
      roles: [
        {
          id: 'ur-d',
          user_id: MIXED_USER_ID,
          role_type: 'docente',
          school_id: OTHER_SCHOOL_ID,
          generation_id: null,
          community_id: null,
          is_active: true,
        },
        {
          id: 'ur-l',
          user_id: MIXED_USER_ID,
          role_type: 'lider_comunidad',
          school_id: OTHER_SCHOOL_ID,
          generation_id: null,
          community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
          is_active: false,
        },
      ],
      rows: [communitySession],
    });

    // Pre-Z1a-5 this branch ignored `is_active` entirely and exported the row.
    expect(res._getStatusCode()).toBe(200);
    expect(spy.ors).toHaveLength(0);
    expect(countEvents(res._getData())).toBe(0);
    expect(res._getData()).not.toContain('Sesion de la comunidad');
  });

  it('a consultor with a revoked community membership keeps only the school scope', async () => {
    const { spy } = await runBatchIcal({
      roles: [MIXED_ROLES[0], { ...MIXED_ROLES[1], is_active: false }],
      rows: [schoolSession],
    });

    expect(spy.ors).toEqual([`school_id.in.(${SCHOOL_ID})`]);
    expect(spy.ors[0]).not.toContain(OUT_OF_SCHOOL_COMMUNITY_ID);
  });

  it('the union composes with the existing status and date filters', async () => {
    const { res, spy } = await runBatchIcal({
      roles: MIXED_ROLES,
      rows: [schoolSession],
      query: { status: 'programada', date_from: '2026-03-01', date_to: '2026-03-31' },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(spy.ors).toHaveLength(1);
  });

  it('an invalid status filter is still rejected before anything is exported', async () => {
    const { res } = await runBatchIcal({
      roles: MIXED_ROLES,
      rows: [schoolSession],
      query: { status: 'no-existe' },
    });

    expect(res._getStatusCode()).toBe(400);
  });
});
