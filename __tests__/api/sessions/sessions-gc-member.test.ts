// @vitest-environment node
/**
 * GC-member access to GET /api/sessions.
 *
 * The scope filter moved from a single `.in('growth_community_id', …)` to a
 * `.or(…)` clause that unions consultor school scope with community
 * memberships (Z1a-4 / T4), so these assert the OR clause rather than the old
 * `in`. Every behavioural property is unchanged: communities scope the list,
 * only ACTIVE rows count, drafts stay hidden, ids deduplicate, pagination and
 * the status/date filters still compose.
 *
 * Community ids are real UUIDs here because `growth_community_id` is a uuid
 * column and the handler will not interpolate a non-UUID into a filter string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/index';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
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

const COMMUNITY_A = 'c0111111-1111-4111-8111-111111111111';
const COMMUNITY_B = 'c0222222-2222-4222-8222-222222222222';

interface QuerySpy {
  ors: string[];
  ins: Array<{ col: string; values: unknown }>;
  neqs: Array<{ col: string; value: unknown }>;
  gtes: Array<{ col: string; value: unknown }>;
  ltes: Array<{ col: string; value: unknown }>;
  ranges: Array<{ from: number; to: number }>;
}

function makeSpy(): QuerySpy {
  return { ors: [], ins: [], neqs: [], gtes: [], ltes: [], ranges: [] };
}

/** Chainable Supabase stub that records the filters the handler applies. */
function buildClient(rows: unknown[], spy: QuerySpy) {
  const resolved = { data: rows, error: null, count: rows.length };

  const record = (
    bucket: Array<{ col: string; value: unknown }>,
    handlerRef: ProxyHandler<Record<string, unknown>>
  ) =>
    vi.fn((col: string, value: unknown) => {
      bucket.push({ col, value });
      return new Proxy({}, handlerRef);
    });

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
      if (prop === 'neq') return record(spy.neqs, handler);
      if (prop === 'gte') return record(spy.gtes, handler);
      if (prop === 'lte') return record(spy.ltes, handler);
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

async function run(opts: {
  userId: string;
  roles: Record<string, unknown>[];
  highestRole: string;
  rows?: unknown[];
  query?: Record<string, string>;
}) {
  const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

  const spy = makeSpy();

  (getApiUser as any).mockResolvedValue({ user: { id: opts.userId }, error: null });
  (getUserRoles as any).mockResolvedValue(opts.roles);
  (getHighestRole as any).mockReturnValue(opts.highestRole);
  (createServiceRoleClient as any).mockReturnValue(buildClient(opts.rows ?? [], spy));

  const { req, res } = createMocks({ method: 'GET', query: opts.query ?? {} });
  await handler(req as any, res as any);
  return { res, spy };
}

/** The single community id the OR clause scoped the query to, if any. */
function scopedCommunityIds(spy: QuerySpy): string[] {
  const clause = spy.ors[0] ?? '';
  const match = clause.match(/growth_community_id\.in\.\(([^)]*)\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((v) => v.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

describe('/api/sessions - GC Member Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET - GC Member with community', () => {
    const roles = [
      {
        role_type: 'lider_comunidad',
        community_id: COMMUNITY_A,
        is_active: true,
        school_id: null,
      },
    ];

    it("should return sessions for the GC member's community (not drafts)", async () => {
      const rows = [
        {
          id: 'session-1',
          title: 'Session 1',
          status: 'programada',
          growth_community_id: COMMUNITY_A,
          session_date: '2026-03-01',
        },
        {
          id: 'session-2',
          title: 'Session 2',
          status: 'completada',
          growth_community_id: COMMUNITY_A,
          session_date: '2026-02-15',
        },
      ];

      const { res, spy } = await run({
        userId: 'gc-user-123',
        roles,
        highestRole: 'lider_comunidad',
        rows,
      });

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).data.sessions).toHaveLength(2);
      expect(scopedCommunityIds(spy)).toEqual([COMMUNITY_A]);
      expect(spy.neqs).toContainEqual({ col: 'status', value: 'borrador' });
    });

    it('should exclude borrador sessions for GC members', async () => {
      const { spy } = await run({
        userId: 'gc-user-123',
        roles: [
          { role_type: 'docente', community_id: COMMUNITY_A, is_active: true, school_id: 1 },
        ],
        highestRole: 'docente',
      });

      expect(spy.neqs).toContainEqual({ col: 'status', value: 'borrador' });
    });

    it('should not return sessions from other communities', async () => {
      const { spy } = await run({
        userId: 'gc-user-123',
        roles,
        highestRole: 'lider_comunidad',
      });

      expect(scopedCommunityIds(spy)).toEqual([COMMUNITY_A]);
      expect(spy.ors[0]).not.toContain(COMMUNITY_B);
    });
  });

  describe('GET - GC Member with a revoked role', () => {
    it('should ignore community scope granted by an is_active=false role row', async () => {
      const { res } = await run({
        userId: 'gc-user-revoked',
        roles: [
          {
            role_type: 'lider_comunidad',
            community_id: COMMUNITY_A,
            is_active: false,
            school_id: null,
          },
        ],
        highestRole: 'lider_comunidad',
      });

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData()).data;
      expect(data.sessions).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  describe('GET - GC Member without community', () => {
    it('should return empty result (not 403) when user has no community roles', async () => {
      const { res } = await run({
        userId: 'gc-user-no-comm',
        roles: [{ role_type: 'docente', community_id: null, school_id: 1, is_active: true }],
        highestRole: 'docente',
      });

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData()).data;
      expect(data.sessions).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  describe('GET - GC Member with filters', () => {
    const roles = [
      {
        role_type: 'lider_comunidad',
        community_id: COMMUNITY_A,
        is_active: true,
        school_id: null,
      },
    ];

    it('should filter by status when provided', async () => {
      const { res, spy } = await run({
        userId: 'gc-user-123',
        roles,
        highestRole: 'lider_comunidad',
        query: { status: 'programada,en_progreso' },
      });

      expect(res._getStatusCode()).toBe(200);
      expect(spy.ins).toContainEqual({
        col: 'status',
        values: ['programada', 'en_progreso'],
      });
      // Scope survives alongside the status filter
      expect(scopedCommunityIds(spy)).toEqual([COMMUNITY_A]);
    });

    it('should filter by date_from and date_to when provided', async () => {
      const { res, spy } = await run({
        userId: 'gc-user-123',
        roles,
        highestRole: 'lider_comunidad',
        query: { date_from: '2026-02-01', date_to: '2026-03-31' },
      });

      expect(res._getStatusCode()).toBe(200);
      expect(spy.gtes).toContainEqual({ col: 'session_date', value: '2026-02-01' });
      expect(spy.ltes).toContainEqual({ col: 'session_date', value: '2026-03-31' });
      expect(scopedCommunityIds(spy)).toEqual([COMMUNITY_A]);
    });

    it('should handle pagination correctly', async () => {
      const { spy } = await run({
        userId: 'gc-user-123',
        roles,
        highestRole: 'lider_comunidad',
        query: { page: '2', limit: '10' },
      });

      expect(spy.ranges).toEqual([{ from: 10, to: 19 }]);
    });
  });

  describe('GET - GC Member with multiple communities', () => {
    it('should deduplicate community IDs and query all of them', async () => {
      const { spy } = await run({
        userId: 'gc-user-multi',
        roles: [
          {
            role_type: 'lider_comunidad',
            community_id: COMMUNITY_A,
            is_active: true,
            school_id: null,
          },
          { role_type: 'docente', community_id: COMMUNITY_B, is_active: true, school_id: 1 },
          // duplicate
          { role_type: 'docente', community_id: COMMUNITY_A, is_active: true, school_id: 2 },
        ],
        highestRole: 'lider_comunidad',
      });

      const ids = scopedCommunityIds(spy);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(COMMUNITY_A);
      expect(ids).toContain(COMMUNITY_B);
    });
  });
});
