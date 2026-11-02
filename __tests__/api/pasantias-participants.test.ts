// @vitest-environment node
/**
 * PASANT-PARTICIPANT-INTAKE (FIRST §8, I01, I06–I08) — the coordinator routes:
 * GET/POST /api/pasantias/participants, PUT /api/pasantias/participants/[id],
 * POST /api/pasantias/participants/finalize.
 *
 * The real handlers, real validators and the REAL rate limiter run here. Only
 * the service-role client is replaced, at the `lib/api-auth` boundary, by a
 * recording fake (`fake-supabase.ts`). Each request carries its own synthetic
 * X-Forwarded-For so the limiter's per-IP buckets never couple two tests; one
 * test deliberately shares an IP to prove the 429.
 *
 * LIMIT: a fake cannot prove the RPC lock, PostgREST or real concurrency. The
 * real-stack Playwright spec and pgTAP 114 own those.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { fakeSupabase, type Answer, type FakeSupabase, type RecordedQuery, type RecordedRpc } from '../lib/pasantias/participants/fake-supabase';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({ mockCreateServiceRoleClient: vi.fn() }));

vi.mock('../../lib/api-auth', async () => {
  // loggableError and the rest are the real ones; only the client is faked.
  const actual = await vi.importActual<typeof import('../../lib/api-auth')>('../../lib/api-auth');
  return { ...actual, createServiceRoleClient: mockCreateServiceRoleClient };
});

import indexHandler from '../../pages/api/pasantias/participants/index';
import idHandler from '../../pages/api/pasantias/participants/[id]';
import finalizeHandler from '../../pages/api/pasantias/participants/finalize';
import schoolHandler from '../../pages/api/pasantias/participants/school';
import { INTAKE_NOTICE_VERSION } from '../../lib/pasantias/participants/notice';

// 1 + 40 + 2 = 43 base64url characters, synthetic — the exact shape of
// randomBytes(32).toString('base64url'). (r1 had 45 here, so every "valid"
// request was correctly refused as malformed.)
const TOKEN = 'T' + 'a1B2c3D4e5'.repeat(4) + '_-';
const HASH = createHash('sha256').update(TOKEN).digest('hex');
const ROSTER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PARTICIPANT_ID = '11111111-2222-4333-8444-555555555555';
const REQUEST_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PII = ['12345678-5', '12.345.678-5', 'Valentina', 'Sintetica', 'AB12345'];

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function rosterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROSTER_ID,
    school_name: 'Colegio Sintético Uno',
    program: 'inspira',
    status: 'open',
    version: 3,
    submitted_at: null,
    last_submitted_at: null,
    expires_at: '2027-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function participantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANT_ID,
    version: 1,
    first_names: 'Valentina',
    last_names: 'Sintetica',
    rut: '12345678-5',
    passport_number: 'AB12345',
    arrival_date: '2027-01-17',
    departure_date: '2027-01-29',
    focus: 'infantil',
    dietary_restrictions: ['otra', 'vegano'],
    dietary_other: 'Sin frutos secos',
    updated_at: '2026-10-27T12:00:00.000Z',
    ...overrides,
  };
}

function fields(overrides: Record<string, unknown> = {}) {
  return {
    firstNames: 'Valentina',
    lastNames: 'Sintetica',
    rut: '12.345.678-5',
    passportNumber: 'AB12345',
    arrivalDate: '2027-01-17',
    departureDate: '2027-01-29',
    focus: 'infantil',
    dietaryRestrictions: ['vegano', 'otra'],
    dietaryOther: 'Sin frutos secos',
    ...overrides,
  };
}

const saveRow = (overrides: Record<string, unknown> = {}) => ({
  data: [{ participant_id: PARTICIPANT_ID, participant_version: 1, replayed: false, roster_status: 'open', roster_version: 4, ...overrides }],
  error: null,
});

/** F01: the routes call the corrections participant save (14 args, no funding). */
const SAVE_FN = 'pasantias_nomina_save_participant';
const FUNDING_FN = 'pasantias_nomina_save_school_funding';

const refusal = (fn: string, code: string): Answer => ({
  data: null,
  error: { code: '22023', message: `${fn}: ${code}`, details: 'detail with 12345678-5 Valentina', hint: null },
});

/** F01: the roster's saved "Datos del colegio" row (snake_case, as stored). */
function fundingRow(overrides: Record<string, unknown> = {}) {
  return { flights_funding: 'sep', lodging_funding: 'colegio', version: 1, ...overrides };
}

const SCHOOL_FUNDING = { flightsFunding: 'sep', lodgingFunding: 'colegio', version: 1 };

/**
 * Default world: the token names a live roster that HAS school funding (F01);
 * the participant exists in it; no participant is "Todos" (F04) unless
 * `todosIds` says so.
 */
function world(
  options: {
    live?: Record<string, unknown> | null;
    afterRoster?: Record<string, unknown> | null;
    participant?: Record<string, unknown> | null;
    list?: Record<string, unknown>[];
    funding?: Record<string, unknown> | null;
    todosIds?: string[];
    rpc?: (rpc: RecordedRpc) => Answer;
  } = {}
): FakeSupabase {
  const live = options.live === undefined ? rosterRow() : options.live;
  const funding = options.funding === undefined ? fundingRow() : options.funding;
  const fake = fakeSupabase((query: RecordedQuery): Answer => {
    if (query.table === 'pasantias_intake_rosters') {
      const isLiveLookup = 'revoked_at' in query.is;
      if (isLiveLookup) return { data: live, error: null };
      return { data: options.afterRoster === undefined ? live : options.afterRoster, error: null };
    }
    if (query.table === 'pasantias_intake_participants') {
      if ('id' in query.eq) {
        return { data: options.participant === undefined ? participantRow() : options.participant, error: null };
      }
      return { data: options.list ?? [participantRow()], error: null };
    }
    if (query.table === 'pasantias_nomina_school_funding') {
      return { data: funding, error: null };
    }
    if (query.table === 'pasantias_nomina_participant_focus') {
      const ids = (query.in.participant_id ?? []) as string[];
      return {
        data: ids.map((id) => ({ participant_id: id, all_levels: (options.todosIds ?? []).includes(id) })),
        error: null,
      };
    }
    return { data: null, error: { code: 'UNEXPECTED_TABLE' } };
  }, options.rpc ?? (() => saveRow()));
  mockCreateServiceRoleClient.mockReturnValue(fake.client);
  return fake;
}

interface Call {
  method: string;
  body?: unknown;
  query?: Record<string, string>;
  authorization?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

async function call(handler: (req: any, res: any) => Promise<unknown>, c: Call) {
  const headers: Record<string, string> = {
    'x-forwarded-for': c.ip ?? nextIp(),
    'content-type': 'application/json',
    ...(c.headers ?? {}),
  };
  if (c.authorization !== null) headers.authorization = c.authorization ?? `Intake ${TOKEN}`;
  const { req, res } = createMocks({ method: c.method as any, headers, body: c.body as any, query: c.query ?? {} });
  await handler(req, res);
  const raw = res._getData();
  let json: any = null;
  try {
    json = typeof raw === 'string' && raw.length > 0 ? JSON.parse(raw) : raw;
  } catch {
    json = raw;
  }
  return { status: res._getStatusCode(), json, res, raw: typeof raw === 'string' ? raw : JSON.stringify(raw) };
}

let logged: string[] = [];

beforeEach(() => {
  mockCreateServiceRoleClient.mockReset();
  logged = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  // Ley 21.719: whatever happened in the test, nothing sensitive reached a log.
  const all = logged.join('\n');
  expect(all).not.toContain(TOKEN);
  expect(all).not.toContain(HASH);
  for (const value of PII) expect(all).not.toContain(value);
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------- token failures */

describe('link authentication', () => {
  it('uses a well-formed synthetic token fixture (43 base64url characters)', () => {
    // Guards the fixture itself: a malformed TOKEN would turn every positive
    // case below into a correct-but-misleading 401.
    expect(TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(TOKEN.slice(1)).toHaveLength(42); // the "wrong length" negative case stays malformed
  });

  const malformed: [string, string | null][] = [
    ['a missing header', null],
    ['a Bearer header', `Bearer ${TOKEN}`],
    ['a wrong length', `Intake ${TOKEN.slice(1)}`],
    ['extra spaces', `Intake  ${TOKEN}`],
  ];

  const routes: [string, (req: any, res: any) => Promise<unknown>, Call][] = [
    ['GET index', indexHandler, { method: 'GET' }],
    ['POST index', indexHandler, { method: 'POST', body: { ...fields(), clientRequestId: REQUEST_ID, acknowledged: true } }],
    ['PUT [id]', idHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: { ...fields(), expectedVersion: 1, acknowledged: true } }],
    ['POST finalize', finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } }],
    // F01: the new school route follows the same FIRST §4 link rules.
    [
      'PUT school',
      schoolHandler,
      { method: 'PUT', body: { flightsFunding: 'sep', lodgingFunding: 'colegio', expectedFundingVersion: null } },
    ],
  ];

  for (const [routeLabel, handler, base] of routes) {
    for (const [label, authorization] of malformed) {
      it(`${routeLabel}: ${label} is the identical 401 with no database call`, async () => {
        const result = await call(handler, { ...base, authorization });
        expect(result.status).toBe(401);
        expect(result.json).toEqual({
          code: 'LINK_UNAVAILABLE',
          error: 'Enlace incompleto o no disponible — contacta a FNE.',
        });
        expect(result.res.getHeader('Cache-Control')).toBe('no-store');
        expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      });
    }
  }

  it('an unknown, expired or revoked token needs the lookup, which filters all three, and answers the same 401', async () => {
    const fake = world({ live: null });
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.status).toBe(401);
    expect(result.json).toEqual({ code: 'LINK_UNAVAILABLE', error: 'Enlace incompleto o no disponible — contacta a FNE.' });
    const lookup = fake.queries[0];
    expect(lookup.table).toBe('pasantias_intake_rosters');
    expect(lookup.eq).toEqual({ token_hash: HASH });
    expect(lookup.is).toEqual({ revoked_at: null });
    expect(typeof lookup.gt.expires_at).toBe('string');
    expect(lookup.columns).not.toContain('token_hash');
    expect(fake.queries).toHaveLength(1);
    expect(fake.rpcs).toHaveLength(0);
  });

  it('the raw token never reaches the database, only its SHA-256', async () => {
    const fake = world();
    await call(indexHandler, { method: 'POST', body: { ...fields(), clientRequestId: REQUEST_ID, acknowledged: true } });
    expect(JSON.stringify(fake.queries)).not.toContain(TOKEN);
    expect(JSON.stringify(fake.rpcs)).not.toContain(TOKEN);
    expect(fake.rpcs[0].args.p_token_hash).toBe(HASH);
  });

  it('finalize with a dead link answers the same 401 from the RPC', async () => {
    world({ rpc: () => refusal('pasantias_intake_finalize', 'link_unavailable') });
    const result = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } });
    expect(result.status).toBe(401);
    expect(result.json.code).toBe('LINK_UNAVAILABLE');
  });
});

/* ------------------------------------------------------------- protocol */

describe('protocol', () => {
  it.each([
    ['index', indexHandler, 'DELETE', 'GET, POST'],
    ['[id]', idHandler, 'GET', 'PUT'],
    ['finalize', finalizeHandler, 'GET', 'POST'],
    ['school', schoolHandler, 'POST', 'PUT'],
  ] as const)('%s answers 405 with Allow and no-store for %s', async (_label, handler, method, allow) => {
    const result = await call(handler, { method, query: { id: PARTICIPANT_ID } });
    expect(result.status).toBe(405);
    expect(result.res.getHeader('Allow')).toBe(allow);
    expect(result.res.getHeader('Cache-Control')).toBe('no-store');
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('a body over 8 kB is refused with 413 before any database call', async () => {
    const result = await call(indexHandler, {
      method: 'POST',
      body: { ...fields({ dietaryOther: 'x'.repeat(9000) }), clientRequestId: REQUEST_ID, acknowledged: true },
    });
    expect(result.status).toBe(413);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('a declared Content-Length over 8 kB is refused too', async () => {
    const result = await call(finalizeHandler, {
      method: 'POST',
      body: { expectedRosterVersion: 3 },
      headers: { 'content-length': '9000' },
    });
    expect(result.status).toBe(413);
  });

  it('the 61st request in a minute from one client is 429, and the 60 before it were served', async () => {
    const ip = '10.200.0.1';
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) {
      statuses.push((await call(indexHandler, { method: 'GET', authorization: null, ip })).status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(statuses[60]).toBe(429);
    // A different client is unaffected: the bucket is per IP.
    expect((await call(indexHandler, { method: 'GET', authorization: null })).status).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('the bucket is shared by every coordinator route', async () => {
    const ip = '10.200.0.2';
    for (let i = 0; i < 60; i += 1) {
      await call(i % 2 === 0 ? indexHandler : finalizeHandler, { method: 'POST', authorization: null, ip, body: {} });
    }
    expect((await call(idHandler, { method: 'PUT', authorization: null, ip, query: { id: PARTICIPANT_ID } })).status).toBe(429);
  });
});

/* ------------------------------------------------------------- GET */

describe('GET /api/pasantias/participants', () => {
  it('answers the roster and its participants, without the roster id or any hash', async () => {
    const fake = world();
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.status).toBe(200);
    expect(result.res.getHeader('Cache-Control')).toBe('no-store');
    expect(result.json.roster).toEqual({
      schoolName: 'Colegio Sintético Uno',
      program: 'inspira',
      programName: 'Pasantía INSPIRA',
      status: 'open',
      version: 3,
      submittedAt: null,
      lastSubmittedAt: null,
      expiresAt: '2027-03-01T00:00:00.000Z',
      // F01/C4: every roster carries the school's funding.
      schoolFunding: SCHOOL_FUNDING,
    });
    // F01: participants no longer carry flightsFunding / lodgingFunding.
    expect(result.json.participants).toEqual([
      {
        id: PARTICIPANT_ID,
        version: 1,
        firstNames: 'Valentina',
        lastNames: 'Sintetica',
        rut: '12345678-5',
        passportNumber: 'AB12345',
        arrivalDate: '2027-01-17',
        departureDate: '2027-01-29',
        focus: 'infantil',
        dietaryRestrictions: ['otra', 'vegano'],
        dietaryOther: 'Sin frutos secos',
        updatedAt: '2026-10-27T12:00:00.000Z',
      },
    ]);
    expect(result.raw).not.toContain(ROSTER_ID);
    expect(result.raw).not.toContain(HASH);
    const list = fake.queries.find((q) => q.table === 'pasantias_intake_participants') as RecordedQuery;
    expect(list.eq).toEqual({ roster_id: ROSTER_ID });
    expect(list.orders).toEqual(['created_at', 'id']);
    expect(list.limit).toBe(60);
    // C2: the copied funding columns are never selected.
    expect(list.columns).not.toMatch(/funding/);
    const funding = fake.queries.find((q) => q.table === 'pasantias_nomina_school_funding') as RecordedQuery;
    expect(funding.eq).toEqual({ roster_id: ROSTER_ID });
  });

  it('a roster without saved school data answers schoolFunding: null (never a guess)', async () => {
    world({ funding: null });
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.status).toBe(200);
    expect(result.json.roster.schoolFunding).toBeNull();
  });

  // F04: Todos round-trips from the side table; focus is read only for this roster's ids.
  it('answers focus todos for an all-levels participant, reading focus only for listed ids', async () => {
    const other = '99999999-2222-4333-8444-555555555555';
    const fake = world({
      list: [participantRow({ focus: null }), participantRow({ id: other, focus: 'segundo_ciclo', rut: '11111111-1' })],
      todosIds: [PARTICIPANT_ID],
    });
    const result = await call(indexHandler, { method: 'GET' });
    expect(result.json.participants.map((p: { focus: string | null }) => p.focus)).toEqual(['todos', 'segundo_ciclo']);
    const focusRead = fake.queries.find((q) => q.table === 'pasantias_nomina_participant_focus') as RecordedQuery;
    expect(focusRead.in).toEqual({ participant_id: [PARTICIPANT_ID, other] });
  });
});

/* ------------------------------------------------------------- POST create */

describe('POST /api/pasantias/participants', () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    ...fields(),
    clientRequestId: REQUEST_ID,
    acknowledged: true,
    ...overrides,
  });

  // F01: was "all sixteen arguments" on the DB-01 save; now the corrections
  // save with fourteen — no funding argument exists.
  it('creates through the RPC with all fourteen arguments and answers 201 with the stored row', async () => {
    const fake = world();
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(201);
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0].name).toBe(SAVE_FN);
    expect(fake.rpcs[0].args).toEqual({
      p_token_hash: HASH,
      p_participant_id: null,
      p_expected_version: null,
      p_client_request_id: REQUEST_ID,
      p_first_names: 'Valentina',
      p_last_names: 'Sintetica',
      p_rut: '12345678-5',
      p_passport_number: 'AB12345',
      p_arrival_date: '2027-01-17',
      p_departure_date: '2027-01-29',
      p_focus: 'infantil',
      p_dietary_restrictions: ['otra', 'vegano'],
      p_dietary_other: 'Sin frutos secos',
      p_notice_version: INTAKE_NOTICE_VERSION,
    });
    // The stored row is read back within the verified roster, never by id alone.
    const read = fake.queries.find((q) => q.table === 'pasantias_intake_participants' && 'id' in q.eq);
    expect(read?.eq).toEqual({ id: PARTICIPANT_ID, roster_id: ROSTER_ID });
    expect(result.json.participant.id).toBe(PARTICIPANT_ID);
    expect(result.json.replayed).toBe(false);
    expect(result.json.roster.schoolFunding).toEqual(SCHOOL_FUNDING);
    expect(result.raw).not.toContain(HASH);
  });

  // F04: 'todos' is sent as p_focus and answered back as the effective focus.
  it('creates a Todos participant: p_focus todos, answered focus todos', async () => {
    const fake = world({ participant: participantRow({ focus: null }), todosIds: [PARTICIPANT_ID] });
    const result = await call(indexHandler, { method: 'POST', body: body({ focus: 'todos' }) });
    expect(result.status).toBe(201);
    expect(fake.rpcs[0].args.p_focus).toBe('todos');
    expect(result.json.participant.focus).toBe('todos');
  });

  // F01 / C3: no participant write before the school's funding exists.
  it('maps school_data_missing to 422 SCHOOL_DATA_MISSING', async () => {
    world({ rpc: () => refusal(SAVE_FN, 'school_data_missing') });
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(422);
    expect(result.json.code).toBe('SCHOOL_DATA_MISSING');
  });

  it('a replay answers 200 with the row AS STORED, not the retried input', async () => {
    world({
      rpc: () => saveRow({ replayed: true, participant_version: 2 }),
      participant: participantRow({ version: 2, last_names: 'Guardado' }),
    });
    const result = await call(indexHandler, { method: 'POST', body: body({ lastNames: 'Cambiado' }) });
    expect(result.status).toBe(200);
    expect(result.json.replayed).toBe(true);
    expect(result.json.participant.lastNames).toBe('Guardado');
    expect(result.json.participant.version).toBe(2);
  });

  it('validates against the token’s program before any write', async () => {
    const fake = world();
    const result = await call(indexHandler, { method: 'POST', body: body({ departureDate: '2027-01-30' }) });
    expect(result.status).toBe(422);
    expect(result.json.code).toBe('VALIDATION');
    expect(result.json.fields.departureDate).toBeDefined();
    expect(fake.rpcs).toHaveLength(0);
  });

  it.each(['program', 'school', 'rosterId'])('a body naming %j is refused as an unknown key', async (key) => {
    const fake = world();
    const result = await call(indexHandler, { method: 'POST', body: body({ [key]: 'mirada-profunda' }) });
    expect(result.status).toBe(422);
    expect(result.json.code).toBe('VALIDATION');
    expect(fake.rpcs).toHaveLength(0);
  });

  // F01 (replaces "missing funding and a missing acknowledgement are field
  // errors"): per-person funding keys are refused before any RPC (FIRST R4);
  // the acknowledgement rule is unchanged.
  it.each(['flightsFunding', 'lodgingFunding'])('a participant body carrying %j is 422 with no RPC call', async (key) => {
    const fake = world();
    const result = await call(indexHandler, { method: 'POST', body: body({ [key]: 'sep' }) });
    expect(result.status).toBe(422);
    expect(result.json.code).toBe('VALIDATION');
    expect(fake.rpcs).toHaveLength(0);
  });

  it('a missing acknowledgement is a field error', async () => {
    const fake = world();
    const result = await call(indexHandler, { method: 'POST', body: body({ acknowledged: false }) });
    expect(result.status).toBe(422);
    expect(Object.keys(result.json.fields)).toEqual(['acknowledged']);
    expect(fake.rpcs).toHaveLength(0);
  });

  it('maps duplicate_rut to 409 DUPLICATE_RUT and roster_full to 422 ROSTER_FULL', async () => {
    world({ rpc: () => refusal(SAVE_FN,'duplicate_rut') });
    const dup = await call(indexHandler, { method: 'POST', body: body() });
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe('DUPLICATE_RUT');
    expect(dup.json.fields.rut).toBeDefined();

    world({ rpc: () => refusal(SAVE_FN,'roster_full') });
    const full = await call(indexHandler, { method: 'POST', body: body() });
    expect(full.status).toBe(422);
    expect(full.json.code).toBe('ROSTER_FULL');
  });

  it('a link that dies between lookup and lock answers 401 from the RPC', async () => {
    world({ rpc: () => refusal(SAVE_FN,'link_unavailable') });
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(401);
    expect(result.json.code).toBe('LINK_UNAVAILABLE');
  });

  it('matches refusal codes exactly, never by prefix; anything else fails closed as 500', async () => {
    world({ rpc: () => refusal(SAVE_FN,'duplicate_rut_extra') });
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(500);
    expect(result.json.code).toBe('INTERNAL');
  });

  it('a field refused by the SQL (validator drift) is a 422 on that field, logged by code only', async () => {
    world({ rpc: () => refusal(SAVE_FN,'invalid_rut') });
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(422);
    expect(Object.keys(result.json.fields)).toEqual(['rut']);
    expect(logged.join('\n')).toContain('invalid_rut');
  });

  it('a raw database error is 500 and logs nothing but safe codes', async () => {
    world({
      rpc: () => ({
        data: null,
        error: { code: '23505', message: 'duplicate key 12345678-5 Valentina', details: `Key (token_hash)=(${HASH})`, hint: TOKEN },
      }),
    });
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(500);
    expect(result.raw).not.toContain('12345678-5');
  });

  it('the objects not being deployed is 503', async () => {
    world({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'no function' } }) });
    const result = await call(indexHandler, { method: 'POST', body: body() });
    expect(result.status).toBe(503);
  });
});

/* ------------------------------------------------------------- PUT */

describe('PUT /api/pasantias/participants/[id]', () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    ...fields(),
    expectedVersion: 1,
    acknowledged: true,
    ...overrides,
  });

  it('a non-UUID id is 404 without any database call', async () => {
    const result = await call(idHandler, { method: 'PUT', query: { id: 'not-a-uuid' }, body: body() });
    expect(result.status).toBe(404);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('updates through the RPC in update mode and answers the stored row', async () => {
    const fake = world({
      rpc: () => saveRow({ participant_version: 2, roster_status: 'open', roster_version: 5 }),
      participant: participantRow({ version: 2 }),
      afterRoster: rosterRow({ version: 5, last_submitted_at: '2026-10-26T10:00:00.000Z' }),
    });
    const result = await call(idHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: body() });
    expect(result.status).toBe(200);
    expect(fake.rpcs[0].args).toMatchObject({
      p_token_hash: HASH,
      p_participant_id: PARTICIPANT_ID,
      p_expected_version: 1,
      p_client_request_id: null,
    });
    expect(result.json.participant.version).toBe(2);
    expect(result.json.roster.version).toBe(5);
    expect(result.json.roster.lastSubmittedAt).toBe('2026-10-26T10:00:00.000Z');
  });

  it('another roster’s participant is 404 NOT_FOUND', async () => {
    world({ rpc: () => refusal(SAVE_FN,'unknown_participant') });
    const result = await call(idHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: body() });
    expect(result.status).toBe(404);
    expect(result.json.code).toBe('NOT_FOUND');
  });

  it('stale_version is 409 STALE carrying the current row, read within this roster', async () => {
    const fake = world({
      rpc: () => refusal(SAVE_FN,'stale_version'),
      participant: participantRow({ version: 4, first_names: 'Otra' }),
    });
    const result = await call(idHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: body() });
    expect(result.status).toBe(409);
    expect(result.json.code).toBe('STALE');
    expect(result.json.current.version).toBe(4);
    const read = fake.queries.find((q) => q.table === 'pasantias_intake_participants');
    expect(read?.eq).toEqual({ id: PARTICIPANT_ID, roster_id: ROSTER_ID });
  });

  it('an update body with clientRequestId is refused as an unknown key', async () => {
    const fake = world();
    const result = await call(idHandler, {
      method: 'PUT',
      query: { id: PARTICIPANT_ID },
      body: body({ clientRequestId: REQUEST_ID }),
    });
    expect(result.status).toBe(422);
    expect(fake.rpcs).toHaveLength(0);
  });

  it('a no-op edit is 200 with replayed: true', async () => {
    world({ rpc: () => saveRow({ replayed: true }) });
    const result = await call(idHandler, { method: 'PUT', query: { id: PARTICIPANT_ID }, body: body() });
    expect(result.status).toBe(200);
    expect(result.json.replayed).toBe(true);
  });
});

/* ------------------------------------------------------------- finalize */

describe('POST /api/pasantias/participants/finalize', () => {
  it('finalizes with the expected version and answers the stored roster', async () => {
    const fake = world({
      rpc: () => ({ data: [{ roster_status: 'submitted', roster_version: 4, submitted_at: '2026-10-27T15:00:00.000Z' }], error: null }),
      afterRoster: rosterRow({ status: 'submitted', version: 4, submitted_at: '2026-10-27T15:00:00.000Z', last_submitted_at: '2026-10-27T15:00:00.000Z' }),
    });
    const result = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } });
    expect(result.status).toBe(200);
    expect(fake.rpcs[0]).toEqual({
      name: 'pasantias_intake_finalize',
      args: { p_token_hash: HASH, p_expected_roster_version: 3 },
    });
    expect(result.json.roster.status).toBe('submitted');
    expect(result.raw).not.toContain(HASH);
  });

  it('maps stale_version to 409 STALE and empty_roster to 422 EMPTY_ROSTER', async () => {
    world({ rpc: () => refusal('pasantias_intake_finalize', 'stale_version') });
    const stale = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 2 } });
    expect(stale.status).toBe(409);
    expect(stale.json.code).toBe('STALE');
    expect(stale.json.roster.version).toBe(3);

    world({ rpc: () => refusal('pasantias_intake_finalize', 'empty_roster') });
    const empty = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } });
    expect(empty.status).toBe(422);
    expect(empty.json.code).toBe('EMPTY_ROSTER');
  });

  it('refuses a malformed body or an extra key without calling the RPC', async () => {
    const fake = world();
    expect((await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 0 } })).status).toBe(422);
    expect((await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3, program: 'inspira' } })).status).toBe(422);
    expect(fake.rpcs).toHaveLength(0);
  });

  // F01 / C3: the app gate — no school funding, no finalize RPC at all.
  it('without school funding answers 422 SCHOOL_DATA_MISSING and never calls the finalize RPC', async () => {
    const fake = world({ funding: null });
    const result = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } });
    expect(result.status).toBe(422);
    expect(result.json.code).toBe('SCHOOL_DATA_MISSING');
    expect(fake.rpcs).toHaveLength(0);
    const funding = fake.queries.find((q) => q.table === 'pasantias_nomina_school_funding') as RecordedQuery;
    expect(funding.eq).toEqual({ roster_id: ROSTER_ID });
  });

  it('a dead link is the identical 401 from the live lookup, before the funding read', async () => {
    const fake = world({ live: null });
    const result = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } });
    expect(result.status).toBe(401);
    expect(result.json.code).toBe('LINK_UNAVAILABLE');
    expect(fake.queries.map((q) => q.table)).toEqual(['pasantias_intake_rosters']);
    expect(fake.rpcs).toHaveLength(0);
  });

  it('every roster it answers carries schoolFunding (C4)', async () => {
    world({
      rpc: () => ({ data: [{ roster_status: 'submitted', roster_version: 4, submitted_at: '2026-10-27T15:00:00.000Z' }], error: null }),
      afterRoster: rosterRow({ status: 'submitted', version: 4 }),
    });
    const ok = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 3 } });
    expect(ok.json.roster.schoolFunding).toEqual(SCHOOL_FUNDING);
    world({ rpc: () => refusal('pasantias_intake_finalize', 'stale_version') });
    const stale = await call(finalizeHandler, { method: 'POST', body: { expectedRosterVersion: 2 } });
    expect(stale.json.roster.schoolFunding).toEqual(SCHOOL_FUNDING);
  });
});

/* ------------------------------------------------------------- school (F01) */

describe('PUT /api/pasantias/participants/school', () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    flightsFunding: 'sep',
    lodgingFunding: 'colegio',
    expectedFundingVersion: null,
    ...overrides,
  });
  const fundingRpcRow = (overrides: Record<string, unknown> = {}): Answer => ({
    data: [
      {
        funding_flights: 'sep',
        funding_lodging: 'colegio',
        funding_version: 1,
        replayed: false,
        roster_status: 'open',
        roster_version: 4,
        ...overrides,
      },
    ],
    error: null,
  });

  it('saves through the funding RPC with exactly the four named arguments and answers the stored roster', async () => {
    const fake = world({ rpc: () => fundingRpcRow(), afterRoster: rosterRow({ version: 4 }) });
    const result = await call(schoolHandler, { method: 'PUT', body: body() });
    expect(result.status).toBe(200);
    expect(result.res.getHeader('Cache-Control')).toBe('no-store');
    expect(fake.rpcs).toEqual([
      {
        name: FUNDING_FN,
        args: {
          p_token_hash: HASH,
          p_expected_funding_version: null,
          p_flights_funding: 'sep',
          p_lodging_funding: 'colegio',
        },
      },
    ]);
    expect(result.json.replayed).toBe(false);
    expect(result.json.roster.version).toBe(4);
    expect(result.json.roster.schoolFunding).toEqual(SCHOOL_FUNDING);
    expect(result.raw).not.toContain(HASH);
    expect(result.raw).not.toContain(ROSTER_ID);
  });

  it('a replay (same values) answers 200 replayed: true', async () => {
    world({ rpc: () => fundingRpcRow({ replayed: true }) });
    const result = await call(schoolHandler, { method: 'PUT', body: body({ expectedFundingVersion: 7 }) });
    expect(result.status).toBe(200);
    expect(result.json.replayed).toBe(true);
  });

  it('stale_version is 409 STALE carrying the current roster with its stored funding', async () => {
    world({
      rpc: () => refusal(FUNDING_FN, 'stale_version'),
      funding: fundingRow({ flights_funding: 'colegio', version: 2 }),
    });
    const result = await call(schoolHandler, { method: 'PUT', body: body() });
    expect(result.status).toBe(409);
    expect(result.json.code).toBe('STALE');
    expect(result.json.current.schoolFunding).toEqual({ flightsFunding: 'colegio', lodgingFunding: 'colegio', version: 2 });
  });

  it('a dead link (link_unavailable from the RPC) is the identical 401', async () => {
    world({ rpc: () => refusal(FUNDING_FN, 'link_unavailable') });
    const result = await call(schoolHandler, { method: 'PUT', body: body() });
    expect(result.status).toBe(401);
    expect(result.json).toEqual({ code: 'LINK_UNAVAILABLE', error: 'Enlace incompleto o no disponible — contacta a FNE.' });
  });

  // A4 + FIRST §4: refused bodies never reach the RPC.
  it.each([
    ['an invalid funding value', { flightsFunding: 'SEP' }],
    ['a missing funding value', { lodgingFunding: undefined }],
    ['expectedFundingVersion 0', { expectedFundingVersion: 0 }],
    ['expectedFundingVersion "1"', { expectedFundingVersion: '1' }],
    ['a missing expectedFundingVersion', { expectedFundingVersion: undefined }],
    ['an unknown key rosterId', { rosterId: ROSTER_ID }],
    ['an acknowledgement key', { acknowledged: true }],
  ])('%s is 422 VALIDATION with no RPC call', async (_label, overrides) => {
    const fake = world({ rpc: () => fundingRpcRow() });
    const payload = body(overrides) as Record<string, unknown>;
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
    const result = await call(schoolHandler, { method: 'PUT', body: payload });
    expect(result.status).toBe(422);
    expect(result.json.code).toBe('VALIDATION');
    expect(fake.rpcs).toHaveLength(0);
  });

  it('a funding value refused by the SQL (drift) is a 422 on that field; invalid_argument fails closed', async () => {
    world({ rpc: () => refusal(FUNDING_FN, 'invalid_lodging_funding') });
    const drift = await call(schoolHandler, { method: 'PUT', body: body() });
    expect(drift.status).toBe(422);
    expect(Object.keys(drift.json.fields)).toEqual(['lodgingFunding']);
    world({ rpc: () => refusal(FUNDING_FN, 'invalid_argument') });
    const bug = await call(schoolHandler, { method: 'PUT', body: body() });
    expect(bug.status).toBe(500);
  });

  it('a body over 8 kB is refused with 413 before any database call', async () => {
    const result = await call(schoolHandler, { method: 'PUT', body: body({ padding: 'x'.repeat(9000) }) });
    expect(result.status).toBe(413);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});
