// @vitest-environment node
/**
 * PASANT-PARTICIPANT-INTAKE (FIRST §8) — the admin routes:
 * GET/POST /api/admin/pasantia-participants and
 * GET/PATCH /api/admin/pasantia-participants/[rosterId].
 *
 * `lib/api-auth` is faked at the module boundary as in
 * `__tests__/api/admin/pasantia-leads.test.ts`: the identity/admin decision,
 * the forced-password verdict and the service-role client are I/O; the
 * forced-password response helpers and `loggableError` are the real ones.
 * Whether cookie and Bearer callers really reach `checkIsAdmin` the same way is
 * proven against the real stack in the Playwright spec.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  PASSWORD_CHANGE_REQUIRED_CODE,
  PASSWORD_STATE_UNAVAILABLE_CODE,
} from '../../../lib/auth/forced-password-change';
import { fakeSupabase, type Answer, type FakeSupabase, type RecordedQuery } from '../../lib/pasantias/participants/fake-supabase';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockGetVerdict } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetVerdict: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/api-auth')>('../../../lib/api-auth');
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
    getForcedPasswordChangeVerdict: mockGetVerdict,
  };
});

import indexHandler from '../../../pages/api/admin/pasantia-participants/index';
import rosterHandler from '../../../pages/api/admin/pasantia-participants/[rosterId]';

const ADMIN_ID = '99999999-8888-4777-8666-555555555555';
const ROSTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ROSTER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const STORED_HASH = 'f'.repeat(64);

function rosterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROSTER_ID,
    cohort: 'enero-2027',
    program: 'mirada-profunda',
    school_name: 'Colegio Sintético Dos',
    status: 'open',
    version: 1,
    submitted_at: null,
    last_submitted_at: null,
    expires_at: '2027-01-25T00:00:00.000Z',
    revoked_at: null,
    created_at: '2026-10-27T10:00:00.000Z',
    updated_at: '2026-10-27T10:00:00.000Z',
    participants: [{ count: 2 }],
    ...overrides,
  };
}

function asAdmin() {
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockGetVerdict.mockResolvedValue('allowed');
}

function install(onQuery: (query: RecordedQuery) => Answer): FakeSupabase {
  const fake = fakeSupabase(onQuery);
  mockCreateServiceRoleClient.mockReturnValue(fake.client);
  return fake;
}

async function call(
  handler: (req: any, res: any) => Promise<unknown>,
  c: { method: string; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> }
) {
  const { req, res } = createMocks({
    method: c.method as any,
    body: c.body as any,
    query: c.query ?? {},
    headers: { 'content-type': 'application/json', ...(c.headers ?? {}) },
  });
  await handler(req, res);
  const raw = res._getData();
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res._getStatusCode(), json, raw: text, res };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

let logged: string[] = [];

beforeEach(() => {
  mockCheckIsAdmin.mockReset();
  mockCreateServiceRoleClient.mockReset();
  mockGetVerdict.mockReset();
  logged = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  expect(logged.join('\n')).not.toContain(STORED_HASH);
  vi.restoreAllMocks();
});

describe('admin guard', () => {
  it('401 for an anonymous caller, before any client is built', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: new Error('no session') });
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('403 for a signed-in non-admin, before any client is built', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: 'docente' }, error: null });
    for (const handler of [indexHandler, rosterHandler]) {
      const result = await call(handler, { method: 'GET', query: { rosterId: ROSTER_ID } });
      expect(result.status).toBe(403);
      expect(result.json.code).not.toBe(PASSWORD_CHANGE_REQUIRED_CODE);
    }
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each([
    ['cookie', {}],
    ['Bearer', { authorization: 'Bearer synthetic.jwt.value' }],
  ])('a flagged admin (%s) is held before ANY intake query, on every verb', async (_label, headers) => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    mockGetVerdict.mockResolvedValue('required');
    const fake = install(() => ({ data: null, error: { code: 'MUST_NOT_RUN' } }));
    const calls = [
      call(indexHandler, { method: 'GET', headers }),
      call(indexHandler, { method: 'POST', headers, body: { schoolName: 'Colegio X', program: 'inspira', validDays: 90 } }),
      call(rosterHandler, { method: 'GET', headers, query: { rosterId: ROSTER_ID } }),
      call(rosterHandler, { method: 'PATCH', headers, query: { rosterId: ROSTER_ID }, body: { action: 'revoke' } }),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result.status).toBe(403);
      expect(result.json.code).toBe(PASSWORD_CHANGE_REQUIRED_CODE);
      expect(result.json).not.toHaveProperty('token');
      expect(result.json).not.toHaveProperty('rosters');
    }
    expect(fake.queries).toHaveLength(0);
  });

  it('an unreadable password state is held too, never allowed', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
    mockGetVerdict.mockRejectedValue(new Error('down'));
    const fake = install(() => ({ data: null, error: { code: 'MUST_NOT_RUN' } }));
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.json.code).toBe(PASSWORD_STATE_UNAVAILABLE_CODE);
    expect(fake.queries).toHaveLength(0);
  });

  it('405 with Allow and no-store for other methods', async () => {
    const result = await call(indexHandler, { method: 'DELETE' });
    expect(result.status).toBe(405);
    expect(result.res.getHeader('Allow')).toBe('GET, POST');
    expect(result.res.getHeader('Cache-Control')).toBe('no-store');
    expect(mockCheckIsAdmin).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/pasantia-participants', () => {
  it('lists rosters with counts, newest first, at most 200, and never selects the hash', async () => {
    asAdmin();
    const fake = install(() => ({ data: [rosterRow()], error: null, count: 1 }));
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.status).toBe(200);
    expect(result.res.getHeader('Cache-Control')).toBe('no-store');
    expect(result.json.total).toBe(1);
    expect(result.json.rosters[0]).toMatchObject({
      id: ROSTER_ID,
      schoolName: 'Colegio Sintético Dos',
      program: 'mirada-profunda',
      programName: 'INSPIRA Mirada Profunda',
      participantCount: 2,
      revokedAt: null,
    });
    const query = fake.queries[0];
    expect(query.columns).not.toContain('token_hash');
    expect(query.columns).not.toContain('first_names');
    expect(query.options).toEqual({ count: 'exact' });
    expect(query.orders).toEqual(['created_at', 'id']);
    expect(query.limit).toBe(200);
  });
});

describe('POST /api/admin/pasantia-participants', () => {
  it('creates a roster, stores only the SHA-256 and answers the token once', async () => {
    asAdmin();
    const before = Date.now();
    const fake = install((q) => (q.op === 'insert' ? { data: rosterRow({ participants: [{ count: 0 }] }), error: null } : { data: null, error: null }));
    const result = await call(indexHandler, {
      method: 'POST',
      body: { schoolName: '  Colegio   Sintético Dos ', program: 'mirada-profunda', validDays: 60 },
    });
    expect(result.status).toBe(201);
    const token = result.json.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const insert = fake.queries.find((q) => q.op === 'insert');
    expect(insert?.payload).toMatchObject({
      cohort: 'enero-2027',
      program: 'mirada-profunda',
      school_name: 'Colegio Sintético Dos',
      token_hash: sha256(token),
      created_by: ADMIN_ID,
    });
    expect(insert?.payload).not.toHaveProperty('school_name_key');
    const expires = Date.parse(String(insert?.payload?.expires_at));
    expect(expires).toBeGreaterThanOrEqual(before + 60 * 86_400_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 60 * 86_400_000);
    expect(insert?.columns).not.toContain('token_hash');

    expect(result.raw).not.toContain(sha256(token));
    expect(logged.join('\n')).not.toContain(token);
  });

  it.each([45, 0, '90', null])('refuses validDays %j with 422 and writes nothing', async (validDays) => {
    asAdmin();
    const fake = install(() => ({ data: null, error: null }));
    const result = await call(indexHandler, {
      method: 'POST',
      body: { schoolName: 'Colegio Uno', program: 'inspira', validDays },
    });
    expect(result.status).toBe(422);
    expect(result.json.fields.validDays).toBeDefined();
    expect(fake.queries).toHaveLength(0);
  });

  it('a second roster for the same school and program is 409 ROSTER_EXISTS with the existing id', async () => {
    asAdmin();
    const fake = install((q) => {
      if (q.op === 'insert') {
        return {
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "pasantias_intake_rosters_school_key"' },
        };
      }
      return { data: { id: OTHER_ROSTER_ID }, error: null };
    });
    const result = await call(indexHandler, {
      method: 'POST',
      body: { schoolName: 'COLEGIO  sintético dos', program: 'inspira', validDays: 90 },
    });
    expect(result.status).toBe(409);
    expect(result.json).toMatchObject({ code: 'ROSTER_EXISTS', rosterId: OTHER_ROSTER_ID });
    expect(result.json).not.toHaveProperty('token');
    const lookup = fake.queries.find((q) => q.op === 'select');
    expect(lookup?.eq).toEqual({ cohort: 'enero-2027', program: 'inspira', school_name_key: 'colegio sintético dos' });
  });

  it('a token-hash collision is retried with a fresh token, never surfaced', async () => {
    asAdmin();
    let inserts = 0;
    const fake = install((q) => {
      if (q.op !== 'insert') return { data: null, error: null };
      inserts += 1;
      return inserts === 1
        ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "pasantias_intake_rosters_token_hash_key"' } }
        : { data: rosterRow(), error: null };
    });
    const result = await call(indexHandler, { method: 'POST', body: { schoolName: 'Colegio Uno', program: 'inspira', validDays: 90 } });
    expect(result.status).toBe(201);
    const hashes = fake.queries.filter((q) => q.op === 'insert').map((q) => q.payload?.token_hash);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes[1]).toBe(sha256(result.json.token));
  });

  it('refuses unknown keys', async () => {
    asAdmin();
    install(() => ({ data: null, error: null }));
    const result = await call(indexHandler, {
      method: 'POST',
      body: { schoolName: 'Colegio Uno', program: 'inspira', validDays: 90, token_hash: STORED_HASH },
    });
    expect(result.status).toBe(422);
  });
});

describe('GET /api/admin/pasantia-participants/[rosterId]', () => {
  it('a non-UUID id is 404 after the guard, with no query', async () => {
    asAdmin();
    const fake = install(() => ({ data: null, error: null }));
    const result = await call(rosterHandler, { method: 'GET', query: { rosterId: 'nope' } });
    expect(result.status).toBe(404);
    expect(fake.queries).toHaveLength(0);
  });

  it('answers the roster and its participants with acknowledgement evidence, never the hash', async () => {
    asAdmin();
    const fake = install((q) => {
      if (q.table === 'pasantias_intake_rosters') return { data: rosterRow(), error: null };
      return {
        data: [
          {
            id: '11111111-2222-4333-8444-555555555555',
            version: 1,
            first_names: 'Ana',
            last_names: 'Sintetica',
            rut: '12345678-5',
            passport_number: null,
            flights_funding: 'sep',
            lodging_funding: 'sep',
            arrival_date: null,
            departure_date: null,
            focus: null,
            dietary_restrictions: [],
            dietary_other: null,
            updated_at: '2026-10-27T11:00:00.000Z',
            created_at: '2026-10-27T11:00:00.000Z',
            acknowledged_at: '2026-10-27T11:00:00.000Z',
            notice_version: 'pasant-intake-2026-10-v1',
          },
        ],
        error: null,
      };
    });
    const result = await call(rosterHandler, { method: 'GET', query: { rosterId: ROSTER_ID } });
    expect(result.status).toBe(200);
    expect(result.json.participants[0]).toMatchObject({ firstNames: 'Ana', acknowledgedAt: '2026-10-27T11:00:00.000Z' });
    for (const q of fake.queries) expect(q.columns).not.toContain('token_hash');
    expect(fake.queries[1].eq).toEqual({ roster_id: ROSTER_ID });
  });

  it('an unknown roster is 404', async () => {
    asAdmin();
    install(() => ({ data: null, error: null }));
    const result = await call(rosterHandler, { method: 'GET', query: { rosterId: ROSTER_ID } });
    expect(result.status).toBe(404);
  });
});

describe('PATCH /api/admin/pasantia-participants/[rosterId]', () => {
  it('rotate writes a fresh hash and expiry, clears revoked_at, and answers the new token once', async () => {
    asAdmin();
    const fake = install(() => ({ data: rosterRow(), error: null }));
    const result = await call(rosterHandler, {
      method: 'PATCH',
      query: { rosterId: ROSTER_ID },
      body: { action: 'rotate', validDays: 30 },
    });
    expect(result.status).toBe(200);
    const update = fake.queries[0];
    expect(update.op).toBe('update');
    expect(update.eq).toEqual({ id: ROSTER_ID });
    expect(update.payload).toMatchObject({ token_hash: sha256(result.json.token), revoked_at: null });
    // Exactly the link fields: never version, status or the submission timestamps.
    expect(Object.keys(update.payload ?? {}).sort()).toEqual(['expires_at', 'revoked_at', 'token_hash']);
    for (const untouched of ['version', 'status', 'submitted_at', 'last_submitted_at', 'school_name', 'program']) {
      expect(update.payload).not.toHaveProperty(untouched);
    }
    expect(result.raw).not.toContain(sha256(result.json.token));
  });

  it('rotate on an unknown roster is 404', async () => {
    asAdmin();
    install(() => ({ data: null, error: null }));
    const result = await call(rosterHandler, {
      method: 'PATCH',
      query: { rosterId: ROSTER_ID },
      body: { action: 'rotate', validDays: 30 },
    });
    expect(result.status).toBe(404);
  });

  it('revoke writes revoked_at only where it is still null and answers no token', async () => {
    asAdmin();
    const fake = install(() => ({ data: rosterRow({ revoked_at: '2026-10-27T12:00:00.000Z' }), error: null }));
    const result = await call(rosterHandler, { method: 'PATCH', query: { rosterId: ROSTER_ID }, body: { action: 'revoke' } });
    expect(result.status).toBe(200);
    expect(fake.queries[0].is).toEqual({ revoked_at: null });
    expect(fake.queries[0].eq).toEqual({ id: ROSTER_ID });
    // Exactly revoked_at: never version, status, expiry or the submission timestamps.
    expect(Object.keys(fake.queries[0].payload ?? {})).toEqual(['revoked_at']);
    expect(result.json).not.toHaveProperty('token');
    expect(result.json.roster.revokedAt).toBe('2026-10-27T12:00:00.000Z');
  });

  it('revoking an already revoked roster answers it unchanged; an unknown one is 404', async () => {
    asAdmin();
    install((q) =>
      q.op === 'update' ? { data: null, error: null } : { data: rosterRow({ revoked_at: '2026-10-01T00:00:00.000Z' }), error: null }
    );
    const again = await call(rosterHandler, { method: 'PATCH', query: { rosterId: ROSTER_ID }, body: { action: 'revoke' } });
    expect(again.status).toBe(200);
    expect(again.json.roster.revokedAt).toBe('2026-10-01T00:00:00.000Z');

    asAdmin();
    install(() => ({ data: null, error: null }));
    const missing = await call(rosterHandler, { method: 'PATCH', query: { rosterId: ROSTER_ID }, body: { action: 'revoke' } });
    expect(missing.status).toBe(404);
  });

  it('refuses unknown actions and malformed rotate bodies', async () => {
    asAdmin();
    const fake = install(() => ({ data: rosterRow(), error: null }));
    for (const body of [{ action: 'delete' }, { action: 'rotate' }, { action: 'rotate', validDays: 7 }, { action: 'revoke', extra: 1 }]) {
      const result = await call(rosterHandler, { method: 'PATCH', query: { rosterId: ROSTER_ID }, body });
      expect(result.status).toBe(422);
    }
    expect(fake.queries).toHaveLength(0);
  });
});
