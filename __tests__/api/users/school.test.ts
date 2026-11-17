// @vitest-environment node
/**
 * GET /api/users/{userId}/school — GENERA fixes F11, send-back 3 (X2).
 *
 * A person's school is answered only to that person and to an active admin
 * (the admin check is hasAdminPrivileges, the one admin routes use after
 * requireVerifiedCaller). Anyone else — a co-member, a stranger — gets the
 * same 404 an unknown id gets, and the service-role read of the person's
 * school is not even made. Synthetic ids only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const h = vi.hoisted(() => ({
  /** The verified caller requireVerifiedCaller answers with (null → 401). */
  caller: null as null | { id: string },
  /** Every service-role read: table and its filters. */
  reads: [] as Array<{ table: string; ops: Array<[string, ...unknown[]]> }>,
}));

const PERSON = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const COMEMBER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';
const UNKNOWN = '55555555-5555-4555-8555-555555555555';
const SCHOOL_ID = 7;

/** user_roles as the service role sees it: PERSON and COMEMBER share a school. */
const ROLES = [
  { user_id: PERSON, role_type: 'docente', school_id: SCHOOL_ID, is_active: true, id: 'r-1' },
  { user_id: COMEMBER, role_type: 'docente', school_id: SCHOOL_ID, is_active: true, id: 'r-2' },
  { user_id: ADMIN, role_type: 'admin', school_id: null, is_active: true, id: 'r-3' },
  { user_id: STRANGER, role_type: 'admin', school_id: null, is_active: false, id: 'r-4' },
];

function serviceChain(table: string) {
  const entry = { table, ops: [] as Array<[string, ...unknown[]]> };
  h.reads.push(entry);
  const rows = () => {
    if (table === 'schools') return [{ id: SCHOOL_ID, name: 'Escuela Inventada' }];
    if (table !== 'user_roles') return [];
    return ROLES.filter((row) =>
      entry.ops.every(([op, col, value]) => {
        const cell = (row as Record<string, unknown>)[col as string];
        if (op === 'eq') return cell === value;
        if (op === 'not') return cell !== null;
        return true;
      })
    );
  };
  const c: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null });
        if (prop === 'single') return async () => ({ data: rows()[0] ?? null, error: null });
        return (...args: unknown[]) => {
          entry.ops.push([prop, ...args]);
          return c;
        };
      },
    }
  );
  return c;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (table: string) => serviceChain(table) })),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createApiSupabaseClient: vi.fn(async () => ({})),
    requireVerifiedCaller: vi.fn(async () =>
      h.caller
        ? { user: h.caller, status: null, body: null }
        : { user: null, status: 401, body: { error: 'No autorizado' } }
    ),
  };
});

import handler from '../../../pages/api/users/[userId]/school';

async function ask(userId: string) {
  const { req, res } = createMocks({ method: 'GET', query: { userId } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

/** Reads of the asked person's school (their user_roles row, or schools). */
const schoolReads = (userId: string) =>
  h.reads.filter(
    (read) =>
      read.table === 'schools' ||
      (read.table === 'user_roles' && read.ops.some(([op, col, v]) => op === 'eq' && col === 'user_id' && v === userId))
  );

beforeEach(() => {
  h.caller = null;
  h.reads.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('GET /api/users/{userId}/school', () => {
  it('the person themself → 200 with their school', async () => {
    h.caller = { id: PERSON };
    expect(await ask(PERSON)).toEqual({ status: 200, body: { school_name: 'Escuela Inventada' } });
  });

  it('an active admin → 200 with the person\'s school', async () => {
    h.caller = { id: ADMIN };
    expect(await ask(PERSON)).toEqual({ status: 200, body: { school_name: 'Escuela Inventada' } });
  });

  it('a co-member of the same school → 404 «Usuario no encontrado», no read of the school', async () => {
    h.caller = { id: COMEMBER };
    expect(await ask(PERSON)).toEqual({ status: 404, body: { error: 'Usuario no encontrado' } });
    expect(schoolReads(PERSON)).toEqual([]);
  });

  it('a stranger (an ended admin role) → the same 404, no read of the school', async () => {
    h.caller = { id: STRANGER };
    expect(await ask(PERSON)).toEqual({ status: 404, body: { error: 'Usuario no encontrado' } });
    expect(schoolReads(PERSON)).toEqual([]);
  });

  it('an existing person and an id that does not exist get identical answers', async () => {
    h.caller = { id: STRANGER };
    const known = await ask(PERSON);
    const unknown = await ask(UNKNOWN);
    expect(unknown).toEqual(known);
    expect(JSON.stringify(known.body)).not.toContain('Escuela');
  });

  it('signed out → the existing 401, nothing read', async () => {
    expect(await ask(PERSON)).toEqual({ status: 401, body: { error: 'No autorizado' } });
    expect(h.reads).toEqual([]);
  });
});
