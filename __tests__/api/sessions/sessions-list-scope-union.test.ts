// @vitest-environment node
/**
 * List scope must equal canViewSession() semantics (Z1a-4 / T4).
 *
 * GET /api/sessions used to pick ONE scope by highestRole: a consultor got the
 * school filter and nothing else. A school-scoped consultor who also belonged
 * to an out-of-school growth community could therefore open that community's
 * sessions on the detail endpoint — canViewSession()'s GC branch grants them —
 * but never saw them in the list. List and detail disagreed.
 *
 * The scope is now the UNION, built in the QUERY so pagination and
 * `count: 'exact'` stay correct. These tests assert the filter that reaches
 * Supabase, not just the rows that come back, and cross-check one session from
 * each set against the detail endpoint.
 *
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import listHandler from '../../../pages/api/sessions/index';
import detailHandler from '../../../pages/api/sessions/[id]/index';

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

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 9;

/** The community the user belongs to — deliberately in ANOTHER school. */
const OUT_OF_SCHOOL_COMMUNITY_ID = 'c0222222-2222-4222-8222-222222222222';
const IN_SCHOOL_COMMUNITY_ID = 'c0111111-1111-4111-8111-111111111111';

const SCHOOL_SESSION_ID = '3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const COMMUNITY_SESSION_ID = '4a2d6060-1020-4e4f-8b22-3c7d9e1f2a33';

const MIXED_USER_ID = 'u-mixed-0001';

/** School-scoped consultor AND an active membership in another school's GC. */
const MIXED_ROLES = [
  {
    role_type: 'consultor',
    school_id: SCHOOL_ID,
    community_id: null,
    is_active: true,
  },
  {
    role_type: 'docente',
    school_id: OTHER_SCHOOL_ID,
    community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
    is_active: true,
  },
];

/** Reached via the consultor school scope. */
const schoolSession = {
  id: SCHOOL_SESSION_ID,
  title: 'Sesión del colegio',
  school_id: SCHOOL_ID,
  growth_community_id: IN_SCHOOL_COMMUNITY_ID,
  status: 'programada',
  is_active: true,
  meeting_link: null,
  session_facilitators: [],
  schools: { name: 'Colegio Sintético' },
  growth_communities: { name: 'Comunidad Sintética' },
};

/** Reached via the out-of-school community membership. */
const communitySession = {
  id: COMMUNITY_SESSION_ID,
  title: 'Sesión de la comunidad',
  school_id: OTHER_SCHOOL_ID,
  growth_community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
  status: 'programada',
  is_active: true,
  meeting_link: null,
  session_facilitators: [],
  schools: { name: 'Otro Colegio' },
  growth_communities: { name: 'Otra Comunidad' },
};

interface QuerySpy {
  ors: string[];
  ins: Array<{ col: string; values: unknown }>;
  neqs: Array<{ col: string; value: unknown }>;
  eqs: Array<{ col: string; value: unknown }>;
  ranges: Array<{ from: number; to: number }>;
}

function buildListClient(rows: unknown[], spy: QuerySpy) {
  const resolved = { data: rows, error: null, count: rows.length };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolved);
      }
      if (prop === 'or') {
        return vi.fn((clause: string) => {
          spy.ors.push(clause);
          return new Proxy({}, handler);
        });
      }
      if (prop === 'in') {
        return vi.fn((col: string, values: unknown) => {
          spy.ins.push({ col, values });
          return new Proxy({}, handler);
        });
      }
      if (prop === 'neq') {
        return vi.fn((col: string, value: unknown) => {
          spy.neqs.push({ col, value });
          return new Proxy({}, handler);
        });
      }
      if (prop === 'eq') {
        return vi.fn((col: string, value: unknown) => {
          spy.eqs.push({ col, value });
          return new Proxy({}, handler);
        });
      }
      if (prop === 'range') {
        return vi.fn((from: number, to: number) => {
          spy.ranges.push({ from, to });
          return new Proxy({}, handler);
        });
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };

  return { from: vi.fn(() => new Proxy({}, handler)) };
}

async function runList(opts: {
  roles: Record<string, unknown>[];
  highestRole: string | null;
  rows: unknown[];
  query?: Record<string, string>;
}) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

  const spy: QuerySpy = { ors: [], ins: [], neqs: [], eqs: [], ranges: [] };

  (getApiUser as any).mockResolvedValue({ user: { id: MIXED_USER_ID }, error: null });
  (getUserRoles as any).mockResolvedValue(opts.roles);
  (getHighestRole as any).mockReturnValue(opts.highestRole);
  (createServiceRoleClient as any).mockReturnValue(buildListClient(opts.rows, spy));

  const { req, res } = createMocks({ method: 'GET', query: opts.query ?? {} });
  await listHandler(req as any, res as any);
  return { res, spy };
}

// ------------------------------------------------------------------
// Detail cross-check
// ------------------------------------------------------------------

function buildDetailClient(session: unknown) {
  const perTable: Record<string, unknown[]> = {
    consultor_sessions: [{ data: session, error: null }],
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
  };
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

async function runDetail(session: { id: string }) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

  (getApiUser as any).mockResolvedValue({ user: { id: MIXED_USER_ID }, error: null });
  (getUserRoles as any).mockResolvedValue(MIXED_ROLES);
  (getHighestRole as any).mockReturnValue('consultor');
  (createServiceRoleClient as any).mockReturnValue(buildDetailClient(session));

  const { req, res } = createMocks({ method: 'GET', query: { id: session.id } });
  await detailHandler(req as any, res as any);
  return res;
}

describe('GET /api/sessions — scope is the union canViewSession grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mixed role: the query unions school scope OR community memberships', async () => {
    const { res, spy } = await runList({
      roles: MIXED_ROLES,
      highestRole: 'consultor',
      rows: [schoolSession, communitySession],
    });

    expect(res._getStatusCode()).toBe(200);

    // A single OR clause carrying BOTH scopes — the union is in the query,
    // not applied after fetching.
    expect(spy.ors).toHaveLength(1);
    expect(spy.ors[0]).toContain(`school_id.in.(${SCHOOL_ID})`);
    expect(spy.ors[0]).toContain(`growth_community_id.in.("${OUT_OF_SCHOOL_COMMUNITY_ID}")`);

    // The old school-only filter is gone
    expect(spy.ins.filter((f) => f.col === 'school_id')).toHaveLength(0);
  });

  it('mixed role: both sets come back, with a correct count', async () => {
    const { res } = await runList({
      roles: MIXED_ROLES,
      highestRole: 'consultor',
      rows: [schoolSession, communitySession],
    });

    const data = JSON.parse(res._getData()).data;
    expect(data.sessions.map((s: any) => s.id)).toEqual([
      SCHOOL_SESSION_ID,
      COMMUNITY_SESSION_ID,
    ]);
    expect(data.total).toBe(2);
  });

  it('pagination survives the union', async () => {
    const { spy } = await runList({
      roles: MIXED_ROLES,
      highestRole: 'consultor',
      rows: [schoolSession],
      query: { page: '2', limit: '10' },
    });

    expect(spy.ranges).toEqual([{ from: 10, to: 19 }]);
    expect(spy.ors).toHaveLength(1);
  });

  it('the union composes with the status/date/school filters', async () => {
    const { spy } = await runList({
      roles: MIXED_ROLES,
      highestRole: 'consultor',
      rows: [schoolSession],
      query: { status: 'programada', date_from: '2026-03-01', school_id: String(SCHOOL_ID) },
    });

    expect(spy.ors).toHaveLength(1);
    expect(spy.eqs).toContainEqual({ col: 'status', value: 'programada' });
    expect(spy.eqs).toContainEqual({ col: 'school_id', value: SCHOOL_ID });
  });

  it('detail agrees for the school-scope session', async () => {
    const res = await runDetail(schoolSession);
    expect(res._getStatusCode()).toBe(200);
  });

  it('detail agrees for the out-of-school community session', async () => {
    const res = await runDetail(communitySession);
    expect(res._getStatusCode()).toBe(200);
  });
});

describe('GET /api/sessions — scope regressions that must NOT change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin is still unfiltered', async () => {
    const { res, spy } = await runList({
      roles: [{ role_type: 'admin', school_id: null, community_id: null, is_active: true }],
      highestRole: 'admin',
      rows: [schoolSession, communitySession],
    });

    expect(res._getStatusCode()).toBe(200);
    expect(spy.ors).toHaveLength(0);
    expect(spy.neqs).toHaveLength(0);
  });

  it('a global consultor is still unfiltered', async () => {
    const { spy } = await runList({
      roles: [
        { role_type: 'consultor', school_id: null, community_id: null, is_active: true },
      ],
      highestRole: 'consultor',
      rows: [schoolSession],
    });

    expect(spy.ors).toHaveLength(0);
  });

  it('a plain GC member is still scoped to their communities and sees no drafts', async () => {
    const { spy } = await runList({
      roles: [
        {
          role_type: 'lider_comunidad',
          school_id: OTHER_SCHOOL_ID,
          community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
          is_active: true,
        },
      ],
      highestRole: 'lider_comunidad',
      rows: [communitySession],
    });

    expect(spy.ors).toHaveLength(1);
    expect(spy.ors[0]).toBe(
      `growth_community_id.in.("${OUT_OF_SCHOOL_COMMUNITY_ID}")`
    );
    // Draft visibility is unchanged by the union
    expect(spy.neqs).toContainEqual({ col: 'status', value: 'borrador' });
  });

  it('a user with no scope at all still gets an empty list', async () => {
    const { res } = await runList({
      roles: [{ role_type: 'docente', school_id: OTHER_SCHOOL_ID, community_id: null, is_active: true }],
      highestRole: 'docente',
      rows: [schoolSession],
    });

    const data = JSON.parse(res._getData()).data;
    expect(data.sessions).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('a revoked (is_active=false) community membership grants no scope', async () => {
    const { res } = await runList({
      roles: [
        {
          role_type: 'lider_comunidad',
          school_id: OTHER_SCHOOL_ID,
          community_id: OUT_OF_SCHOOL_COMMUNITY_ID,
          is_active: false,
        },
      ],
      highestRole: 'lider_comunidad',
      rows: [communitySession],
    });

    expect(JSON.parse(res._getData()).data.sessions).toEqual([]);
  });

  it('a consultor with a revoked community membership keeps only the school scope', async () => {
    const { spy } = await runList({
      roles: [
        MIXED_ROLES[0],
        { ...MIXED_ROLES[1], is_active: false },
      ],
      highestRole: 'consultor',
      rows: [schoolSession],
    });

    expect(spy.ors).toHaveLength(1);
    expect(spy.ors[0]).toBe(`school_id.in.(${SCHOOL_ID})`);
    expect(spy.ors[0]).not.toContain(OUT_OF_SCHOOL_COMMUNITY_ID);
  });
});
