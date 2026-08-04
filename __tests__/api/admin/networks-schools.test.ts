// @vitest-environment node
/**
 * Regression tests for DELETE /api/admin/networks/schools.
 *
 * The bug: the "active supervisors" guard ran an AMBIGUOUS PostgREST embed
 * (`user_roles` has two FKs into `profiles`), which PostgREST rejects with
 * PGRST201 / HTTP 300 before returning any row. The call destructured only
 * `{ data }`, so `activeSupervisors` was `null`, the guard evaluated falsy,
 * and the handler fell through to DELETE the red_escuelas assignment. The
 * protection failed OPEN and had never fired.
 *
 * WHY THESE TESTS ARE SHAPED THIS WAY
 * A behavioural unit test cannot catch the ambiguity itself: a mocked query
 * chain has no schema, so it can never produce a real PGRST201. Any double
 * that "raises PGRST201" only does so because the test told it which query
 * strings deserve one — which asserts the test's own opinion, not the
 * database's. So this suite attacks the two halves that ARE observable at the
 * unit layer:
 *
 *   1. the SHAPE OF THE QUERY the handler builds (the double records queries
 *      rather than only answering them) — catches the ambiguous embed, and
 *      catches anyone weakening the guard's filters;
 *   2. the ERROR-HANDLING BRANCH — inject any lookup error and assert the
 *      handler does not delete. This is the more important half: it holds
 *      even if a future query breaks for some entirely different reason.
 *
 * The real ambiguity is proven against live PostgREST, not here.
 *
 * All fixture data is synthetic (Ley 21.719 — no student or staff PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServerSupabaseClient, mockHasAdminPrivileges } = vi.hoisted(() => ({
  mockCreateServerSupabaseClient: vi.fn(),
  mockHasAdminPrivileges: vi.fn(),
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));

vi.mock('../../../utils/roleUtils', () => ({
  hasAdminPrivileges: mockHasAdminPrivileges,
}));

import handler from '../../../pages/api/admin/networks/schools';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NETWORK_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_ID = 4242;

/** Exactly what live PostgREST returns for the ambiguous `profiles(...)` embed. */
const PGRST201 = {
  code: 'PGRST201',
  message:
    "Could not embed because more than one relationship was found for 'user_roles' and 'profiles'",
  details: [
    { cardinality: 'many-to-one', relationship: 'user_roles_user_id_fkey using user_roles(user_id)' },
    { cardinality: 'many-to-one', relationship: 'user_roles_assigned_by_fkey using user_roles(assigned_by)' },
  ],
  hint: "Try changing 'profiles' to one of the following: 'profiles!user_roles_user_id_fkey', 'profiles!user_roles_assigned_by_fkey'.",
};

/** A valid red_escuelas assignment row, as the handler's first lookup returns it. */
const ASSIGNMENT_ROW = {
  red_id: NETWORK_ID,
  school_id: SCHOOL_ID,
  redes_de_colegios: { nombre: 'Red Sintética Norte' },
  schools: { name: 'Colegio Sintético 1' },
};

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  deletes: number;
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [] };
}

/**
 * Recording Supabase double: answers each `from(table)` call from
 * `resultsByTable` (indexed by call order for that table) while recording the
 * select strings, eq filters, and delete calls it was asked to build.
 */
function buildRecordingClient(resultsByTable: Record<string, TableResult[]>, tracker: Tracker) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = { table, index: idx, deletes: 0, selects: [], eqs: [] };
      tracker.fromCalls.push(fromCall);

      const resolved = { data: result.data ?? null, error: result.error ?? null };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'select') {
            return vi.fn((vals?: unknown) => {
              fromCall.selects.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'delete') {
            return vi.fn(() => {
              fromCall.deletes += 1;
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => new Proxy({}, proxyHandler));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };
}

/**
 * Wire an authenticated admin. The handler builds two clients: an anon one for
 * getSession(), then a service-role one that runs every query.
 */
function setupAdmin(resultsByTable: Record<string, TableResult[]>, tracker: Tracker) {
  mockCreateServerSupabaseClient.mockReturnValueOnce({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: ADMIN_ID } } },
        error: null,
      })),
    },
  });
  mockCreateServerSupabaseClient.mockReturnValueOnce(
    buildRecordingClient(resultsByTable, tracker),
  );
  mockHasAdminPrivileges.mockResolvedValueOnce(true);
}

async function callDelete(tracker: Tracker) {
  const { req, res } = createMocks({
    method: 'DELETE',
    body: { networkId: NETWORK_ID, schoolId: SCHOOL_ID },
  });
  await handler(req as never, res as never);
  return res;
}

/** Total DELETE statements issued against the assignment table. */
function deletesAgainstRedEscuelas(tracker: Tracker) {
  return tracker.fromCalls
    .filter((c) => c.table === 'red_escuelas')
    .reduce((sum, c) => sum + c.deletes, 0);
}

function userRolesSelect(tracker: Tracker) {
  const call = tracker.fromCalls.find((c) => c.table === 'user_roles');
  return call?.selects[0] as string | undefined;
}

describe('admin/networks/schools DELETE — active-supervisor guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- half 1: the shape of the query the handler builds -------------------

  it('disambiguates the profiles embed on user_roles (not a bare `profiles(`)', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
    );

    await callDelete(tracker);

    const select = userRolesSelect(tracker);
    expect(select).toBeDefined();
    // user_roles has two FKs into profiles; the embed must name the relationship.
    expect(select).toContain('profiles:user_id(');
    // A bare `profiles(` — at the start, or after a comma/space — is the bug.
    expect(select).not.toMatch(/(^|[\s,])profiles\s*\(/);
  });

  it('scopes the supervisor lookup to active supervisors of this network', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
    );

    await callDelete(tracker);

    const call = tracker.fromCalls.find((c) => c.table === 'user_roles');
    expect(call?.eqs).toEqual(
      expect.arrayContaining([
        { col: 'red_id', val: NETWORK_ID },
        { col: 'role_type', val: 'supervisor_de_red' },
        { col: 'is_active', val: true },
      ]),
    );
  });

  // ---- half 2: the error branch must fail CLOSED ---------------------------

  it('does NOT delete when the supervisor lookup returns PGRST201', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [{ data: null, error: PGRST201 }],
      },
      tracker,
    );

    const res = await callDelete(tracker);

    expect(res._getStatusCode()).toBe(500);
    expect(deletesAgainstRedEscuelas(tracker)).toBe(0);
  });

  it('does NOT delete when the supervisor lookup fails for any other reason', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [
          { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
        ],
      },
      tracker,
    );

    const res = await callDelete(tracker);

    expect(res._getStatusCode()).toBe(500);
    expect(deletesAgainstRedEscuelas(tracker)).toBe(0);
  });

  // ---- guard still blocks, and still permits, on real data ----------------

  it('blocks with 409 and names the supervisors when the network has active ones', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [
          {
            data: [
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                profiles: {
                  email: 'supervisor.sintetico@example.test',
                  first_name: 'Ana',
                  last_name: 'Sintética',
                },
              },
            ],
            error: null,
          },
        ],
      },
      tracker,
    );

    const res = await callDelete(tracker);

    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toContain('Ana Sintética (supervisor.sintetico@example.test)');
    expect(deletesAgainstRedEscuelas(tracker)).toBe(0);
  });

  it('still blocks with 409 when the embedded profile is missing or array-shaped', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [
          {
            data: [
              // orphan role row: no profile came back
              { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', profiles: null },
              // supabase-js can surface a to-one embed as a single-element array
              {
                id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                profiles: [{ email: 'otro.sintetico@example.test', first_name: 'Beto', last_name: 'Sintético' }],
              },
            ],
            error: null,
          },
        ],
      },
      tracker,
    );

    const res = await callDelete(tracker);

    // A null profile must not throw its way into a 500 — the guard has to fire.
    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toContain('Beto Sintético (otro.sintetico@example.test)');
    expect(deletesAgainstRedEscuelas(tracker)).toBe(0);
  });

  // ---- anti-vacuity: the fix must not simply block everything -------------

  it('deletes the assignment when the network has no active supervisors', async () => {
    const tracker = makeTracker();
    setupAdmin(
      {
        red_escuelas: [{ data: ASSIGNMENT_ROW, error: null }, { data: null, error: null }],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
    );

    const res = await callDelete(tracker);

    expect(res._getStatusCode()).toBe(200);
    expect(deletesAgainstRedEscuelas(tracker)).toBe(1);
  });
});
