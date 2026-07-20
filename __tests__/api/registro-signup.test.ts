// @vitest-environment node
/**
 * /api/registro-signup — public generic self-registration endpoint.
 *
 * Mirrors the tractor-signup flow but accepts any school plus an optional
 * generation that must belong to the selected school. Uses the sequenced
 * supabase stub pattern from assign-role.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

// The module-level limiter is shared across tests in this file; disable it so
// the suite doesn't trip the 5-requests-per-minute bucket.
vi.mock('../../lib/rateLimit', () => ({
  rateLimit: () => async () => true,
}));

import handler from '../../pages/api/registro-signup';

const SCHOOL_ID = 55;
const GEN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  inserts: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [] };
}

function buildClient(resultsByTable: Record<string, TableResult[]>, tracker: Tracker) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = { table, index: idx, inserts: [], eqs: [] };
      tracker.fromCalls.push(fromCall);

      const resolved = { data: result.data ?? null, error: result.error ?? null };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'insert') {
            return vi.fn((arg: unknown) => {
              fromCall.inserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };
}

function countInserts(tracker: Tracker, table: string) {
  return tracker.fromCalls
    .filter((c) => c.table === table)
    .reduce((sum, c) => sum + c.inserts.length, 0);
}

function findInsertPayload(tracker: Tracker, table: string): Record<string, unknown> | undefined {
  for (const call of tracker.fromCalls) {
    if (call.table === table && call.inserts.length > 0) {
      return call.inserts[0] as Record<string, unknown>;
    }
  }
  return undefined;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Ana',
    lastName: 'Pérez',
    schoolId: SCHOOL_ID,
    email: 'ana@example.com',
    birthDate: '1990-05-10',
    profession: 'Docente de Historia',
    role: 'docente',
    consentAccepted: true,
    ...overrides,
  };
}

// Happy-path table results; override per test.
function happyTables(overrides: Record<string, TableResult[]> = {}): Record<string, TableResult[]> {
  return {
    schools: [{ data: { id: SCHOOL_ID } }],
    generations: [{ data: { id: GEN_ID } }],
    tractor_signups: [{ data: null }, { data: null }],
    ...overrides,
  };
}

async function run(body: Record<string, unknown>, tables: Record<string, TableResult[]>) {
  const tracker = makeTracker();
  // Plain mockReturnValue (not ...Once): tests that fail validation before
  // reaching supabase would otherwise leave a stale queued client behind.
  mockCreateServiceRoleClient.mockReturnValue(buildClient(tables, tracker));
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return { req, res, tracker };
}

describe('api/registro-signup — method and honeypot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-POST with 405', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });

  it('honeypot filled → fake success without touching the database', async () => {
    const { res, tracker } = await run(validBody({ website: 'https://spam.example' }), happyTables());
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(tracker.fromCalls).toHaveLength(0);
  });
});

describe('api/registro-signup — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empty body → 400 with per-field missing map', async () => {
    const { res } = await run({}, happyTables());
    expect(res._getStatusCode()).toBe(400);
    const json = res._getJSONData();
    expect(json.missing).toMatchObject({
      firstName: true,
      lastName: true,
      schoolId: true,
      email: true,
      birthDate: true,
      profession: true,
      role: true,
      consentAccepted: true,
    });
  });

  it('missing consent → 400', async () => {
    const { res } = await run(validBody({ consentAccepted: false }), happyTables());
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().missing.consentAccepted).toBe(true);
  });

  it('oversized firstName → 400', async () => {
    const { res } = await run(validBody({ firstName: 'a'.repeat(81) }), happyTables());
    expect(res._getStatusCode()).toBe(400);
  });

  it('oversized profession → 400', async () => {
    const { res } = await run(validBody({ profession: 'a'.repeat(141) }), happyTables());
    expect(res._getStatusCode()).toBe(400);
  });

  it('invalid email → 400', async () => {
    const { res } = await run(validBody({ email: 'not-an-email' }), happyTables());
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Formato de email inválido');
  });

  it('future birth date → 400', async () => {
    const { res } = await run(validBody({ birthDate: '2099-01-01' }), happyTables());
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Fecha de nacimiento inválida');
  });

  it('unknown role → 400', async () => {
    const { res } = await run(validBody({ role: 'admin' }), happyTables());
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Rol inválido');
  });

  it('malformed schoolId → 400', async () => {
    const { res } = await run(validBody({ schoolId: 'abc' }), happyTables());
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Colegio inválido');
  });

  it('nonexistent school → 400', async () => {
    const { res } = await run(validBody(), happyTables({ schools: [{ data: null }] }));
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Colegio inválido');
  });

  it('school lookup error → 500', async () => {
    const { res } = await run(
      validBody(),
      happyTables({ schools: [{ error: { message: 'boom' } }] })
    );
    expect(res._getStatusCode()).toBe(500);
  });
});

describe('api/registro-signup — generation handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('non-UUID generation → 400 without hitting the generations table', async () => {
    const { res, tracker } = await run(validBody({ generationId: 'tractor' }), happyTables());
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Generación inválida');
    expect(tracker.fromCalls.filter((c) => c.table === 'generations')).toHaveLength(0);
  });

  it('generation not found or belonging to another school → 400', async () => {
    const { res, tracker } = await run(
      validBody({ generationId: GEN_ID }),
      happyTables({ generations: [{ data: null }] })
    );
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toBe('Generación inválida para el colegio seleccionado');
    // Ownership is validated in a single query filtered by both id and school.
    const genCall = tracker.fromCalls.find((c) => c.table === 'generations');
    expect(genCall?.eqs).toEqual([
      { col: 'id', val: GEN_ID },
      { col: 'school_id', val: SCHOOL_ID },
    ]);
  });

  it('generation lookup error → 500', async () => {
    const { res } = await run(
      validBody({ generationId: GEN_ID }),
      happyTables({ generations: [{ error: { message: 'boom' } }] })
    );
    expect(res._getStatusCode()).toBe(500);
  });

  it('no generation → insert stores generation_id null with source registro_general', async () => {
    const { res, tracker } = await run(validBody(), happyTables());
    expect(res._getStatusCode()).toBe(200);
    const payload = findInsertPayload(tracker, 'tractor_signups');
    expect(payload).toMatchObject({
      source: 'registro_general',
      generation_id: null,
      school_id: SCHOOL_ID,
      role: 'docente',
      status: 'pending',
    });
  });

  it('empty-string generation is treated as null', async () => {
    const { res, tracker } = await run(validBody({ generationId: '' }), happyTables());
    expect(res._getStatusCode()).toBe(200);
    expect(tracker.fromCalls.filter((c) => c.table === 'generations')).toHaveLength(0);
    expect(findInsertPayload(tracker, 'tractor_signups')?.generation_id).toBeNull();
  });

  it('valid generation → insert stores the generation uuid', async () => {
    const { res, tracker } = await run(validBody({ generationId: GEN_ID }), happyTables());
    expect(res._getStatusCode()).toBe(200);
    expect(findInsertPayload(tracker, 'tractor_signups')?.generation_id).toBe(GEN_ID);
  });
});

describe('api/registro-signup — dedup and insert failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('existing signup with the same email → silent success, no insert', async () => {
    const { res, tracker } = await run(
      validBody(),
      happyTables({ tractor_signups: [{ data: { id: 'row-1', status: 'pending' } }] })
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(countInserts(tracker, 'tractor_signups')).toBe(0);
  });

  it('cross-source dedup: email already registered via the Tractor flow → silent success, original row untouched', async () => {
    // The dedup lookup is source-agnostic on purpose: one person = one signup.
    const { res, tracker } = await run(
      validBody(),
      happyTables({ tractor_signups: [{ data: { id: 'tractor-row', status: 'granted' } }] })
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(countInserts(tracker, 'tractor_signups')).toBe(0);
    // No update either — the tractor row is left exactly as it was.
    const signupCalls = tracker.fromCalls.filter((c) => c.table === 'tractor_signups');
    expect(signupCalls).toHaveLength(1);
  });

  it('missing table (42P01) on lookup → 503', async () => {
    const { res } = await run(
      validBody(),
      happyTables({ tractor_signups: [{ error: { code: '42P01' } }] })
    );
    expect(res._getStatusCode()).toBe(503);
  });

  it('unique violation (23505) on insert → silent success', async () => {
    const { res } = await run(
      validBody(),
      happyTables({ tractor_signups: [{ data: null }, { error: { code: '23505' } }] })
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it('unexpected insert failure → 500', async () => {
    const { res } = await run(
      validBody(),
      happyTables({ tractor_signups: [{ data: null }, { error: { code: 'XX000', message: 'boom' } }] })
    );
    expect(res._getStatusCode()).toBe(500);
  });
});
