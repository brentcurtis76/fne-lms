// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/attendees';

// Mock dependencies
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

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

/**
 * A supabase double that RECORDS the queries the handler builds, rather than only
 * answering them. See the "embed shape" describe block below for why that distinction is
 * the whole point of this helper.
 */
function makeRecordingServiceClient(rowsByTable: Record<string, unknown>) {
  const queries: { table: string; select?: string }[] = [];

  const client = {
    from(table: string) {
      const entry: { table: string; select?: string } = { table };
      queries.push(entry);
      const result = { data: rowsByTable[table] ?? null, error: null };
      const builder: any = {
        select(query: string) {
          entry.select = query;
          return builder;
        },
        eq: () => builder,
        order: () => builder,
        single: async () => result,
        maybeSingle: async () => result,
        // `.order()` is the terminal call on the attendees query — awaiting the builder
        // itself has to resolve, exactly as supabase-js's thenable builder does.
        then: (resolve: (value: typeof result) => unknown) => resolve(result),
      };
      return builder;
    },
  };

  return { client, queries };
}

describe('/api/sessions/[id]/attendees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return 400 if session ID is invalid', async () => {
      const { req, res } = createMocks({
        method: 'GET',
        query: { id: 'invalid-uuid' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('inválido');
    });

    it('should return 401 if user is not authenticated', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({ user: null, error: new Error('Not authenticated') });

      const { req, res } = createMocks({
        method: 'GET',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe('PUT', () => {
    it('should return 400 if attendees array is missing', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const { req, res } = createMocks({
        method: 'PUT',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: {},
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('array de asistentes');
    });

    it('should return 400 if attended is not boolean', async () => {
      const { getApiUser } = await import('../../../lib/api-auth');
      (getApiUser as any).mockResolvedValue({
        user: { id: 'user-123' },
        error: null,
      });

      const { req, res } = createMocks({
        method: 'PUT',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: {
          attendees: [
            {
              user_id: '123e4567-e89b-12d3-a456-426614174001',
              attended: 'yes', // Invalid - should be boolean
            },
          ],
        },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toContain('booleano');
    });
  });

  /**
   * Z1c-3 — why this file passed while the endpoint answered 500 to everybody.
   *
   * Not because a double returned something friendly. Because until now NO test in this
   * file reached the database at all: every case returns at a guard clause above the query
   * (400 bad UUID, 401 unauthenticated, 400 ×2 PUT payload, 405 method). `createServiceRoleClient`
   * was mocked as a bare `vi.fn()` — it returns `undefined`, so any test that HAD reached
   * line 116 would have thrown on `undefined.from(...)`, been swallowed by the handler's
   * catch, and produced a 500 that looked like the bug rather than exposing it. The
   * handler's happy path was untested, and a broken embed inside untested code is invisible
   * at any assertion strength.
   *
   * So: can a shape error of this class be caught at the unit layer at all?
   *
   * Not by observing behaviour. PGRST201 is PostgREST's answer to a schema fact — that
   * `session_attendees` has two FKs into `profiles` — and a mock has no schema. Any double
   * that "raised PGRST201" would only do so because the test told it which query strings
   * deserve that error, i.e. the test would be asserting the string it was written to
   * verify. That is the tautology, and it is not worth writing.
   *
   * It CAN be caught as a property of the query the handler builds, which is what the test
   * below does. Two assertions, both about the SQL-side contract and neither about the
   * double's return value:
   *
   *   1. the embed names a relationship — a bare `profiles(` is the defect verbatim
   *   2. it names it via the `profiles:<fk column>` ALIAS form rather than
   *      `profiles!<constraint>`, because the response key is load-bearing:
   *      redactProfileEmails (session-disclosure.ts:175) strips e-mails only from an embed
   *      keyed `profiles`, and the alias states that key instead of inheriting PostgREST's
   *      default for it
   *
   * The honest limit: assertion 1 encodes a schema fact this layer cannot check. If a
   * future migration adds a second FK into `profiles` on some other table, nothing here
   * notices. Only `supabase test db` sees the constraints and only the e2e layer sees a real
   * PostgREST — which is precisely why the fix ships with an e2e assertion
   * (tests/e2e/session-disclosure.spec.ts) and not with this test alone.
   */
  describe('GET — the shape of the profiles embed', () => {
    async function driveGetAsAdmin() {
      const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
      const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');

      const { client, queries } = makeRecordingServiceClient({
        consultor_sessions: { id: SESSION_ID, growth_community_id: null, school_id: 990001 },
        session_facilitators: null,
        session_attendees: [
          {
            id: 'attendee-1',
            user_id: 'user-1',
            profiles: { id: 'user-1', first_name: 'Sintetico', last_name: 'Uno', email: 's1@example.com' },
          },
        ],
      });

      (getApiUser as any).mockResolvedValue({ user: { id: 'user-admin' }, error: null });
      (createServiceRoleClient as any).mockReturnValue(client);
      (getUserRoles as any).mockResolvedValue([]);
      (getHighestRole as any).mockReturnValue('admin');

      const { req, res } = createMocks({ method: 'GET', query: { id: SESSION_ID } });
      await handler(req as any, res as any);

      return { res, queries };
    }

    it('reaches the attendees query at all — the precondition every assertion below rests on', async () => {
      const { res, queries } = await driveGetAsAdmin();

      // Before Z1c-3 no test in this file got this far, which is the whole finding.
      expect(res._getStatusCode()).toBe(200);
      expect(queries.map((q) => q.table)).toContain('session_attendees');
    });

    it('names the FK in the profiles embed — a bare profiles(...) is PGRST201 on this table', async () => {
      const { queries } = await driveGetAsAdmin();
      const attendeesQuery = queries.find((q) => q.table === 'session_attendees');

      expect(attendeesQuery?.select).toBeDefined();
      const select = attendeesQuery!.select!;

      // `session_attendees` has TWO foreign keys into `profiles` (user_id, marked_by), so an
      // unqualified embed is ambiguous and PostgREST refuses the whole request.
      expect(select, 'the profiles embed must name a relationship').not.toMatch(
        /(^|[\s,(])profiles\s*\(/
      );

      // Aliased, not constraint-hinted: the response key must be `profiles`, because that is
      // the only key redactProfileEmails strips e-mails from.
      expect(select, 'the profiles embed must be aliased to `profiles`').toMatch(
        /(^|[\s,(])profiles:[a-z_]+\s*\(/
      );
    });
  });

  describe('Method handling', () => {
    it('should return 405 for unsupported methods', async () => {
      const { req, res } = createMocks({
        method: 'DELETE',
        query: { id: '123e4567-e89b-12d3-a456-426614174000' },
      });

      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(405);
    });
  });
});
