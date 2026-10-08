// @vitest-environment node
import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks, type RequestMethod } from 'node-mocks-http';

/**
 * N4-01: `/api/user/notification-preferences`, driven through the real handler,
 * the real `requireVerifiedCaller` (Bearer and cookie identity, forced-password
 * gate) and the real resolver. Replaced edges: every Supabase client (one
 * in-memory database that applies the owner-only row policies to a caller's
 * client and the pref_version trigger) and the auth server's token answers.
 * Synthetic ids and text only.
 */

const u = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ROLES = [
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'supervisor_de_red',
  'community_manager',
  'docente',
  'encargado_licitacion',
] as const;
const A = u(1);
const B = u(2);
const FLAGGED = u(3);
const UNREADABLE = u(4);
const ROLE_USERS = ROLES.map((role, i) => ({ role, id: u(10 + i) }));
const SENSITIVE = ['SINTETICO-RAW-DB', 'qa.local.test', 'token-', 'synthetic-service-key'];
const ANY_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const { db, fakeClient } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-service-key';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'synthetic-anon-key';
  type Row = Record<string, any>;
  const db = {
    tables: {} as Record<string, Row[]>,
    /** token → user id; a token mapped to null is revoked. */
    tokens: new Map<string, string | null>(),
    faults: {} as Record<string, unknown>,
    calls: [] as Array<{ table: string; op: string; actor: string | null; payload?: unknown; onConflict?: string }>,
    rpc: [] as Array<{ fn: string; args: unknown }>,
    suppressed: false,
    /** Creating a service-role client throws once a write has happened. */
    serviceFailsAfterWrite: false,
    seq: 1,
  };
  const ownerColumn = (table: string) => (table === 'profiles' ? 'id' : 'user_id');

  // actor: a user id for a caller's client (row policies apply), null for the service role, '' for anon.
  const run = (table: string, actor: string | null, q: any, mode: 'many' | 'maybe') => {
    db.calls.push({ table, op: q.op, actor, payload: q.payload, onConflict: q.onConflict });
    const fault = db.faults[`${table}.${q.op}`];
    if (fault instanceof Error) throw fault;
    if (fault) return Promise.resolve({ data: null, error: fault });
    const rows = (db.tables[table] ??= []);
    const visible = (r: Row) => actor === null || r[ownerColumn(table)] === actor;
    let out: Row[];
    if (q.op === 'upsert') {
      const input: Row[] = [q.payload].flat();
      if (actor !== null && input.some((p) => p.user_id !== actor)) {
        return Promise.resolve({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
      }
      out = [];
      for (const p of input) {
        const keys: string[] = q.onConflict.split(',');
        const existing = rows.find((r) => keys.every((k) => r[k] === p[k]));
        // The pref_version trigger: a new value on insert and on a changed mode; a sent version is ignored.
        const { pref_version: _ignored, ...values } = p;
        if (existing) {
          if (existing.email_mode !== values.email_mode) existing.pref_version = ++db.seq;
          Object.assign(existing, values, { updated_at: `t${db.seq}` });
          out.push(existing);
        } else {
          const row = { ...values, pref_version: ++db.seq, created_at: `t${db.seq}`, updated_at: `t${db.seq}` };
          rows.push(row);
          out.push(row);
        }
      }
    } else {
      out = rows.filter((r) => visible(r) && q.filters.every((f: (r: Row) => boolean) => f(r)));
    }
    const pick = (r: Row) => (q.columns ? Object.fromEntries(q.columns.split(',').map((c: string) => [c.trim(), r[c.trim()]])) : { ...r });
    if (mode === 'maybe') return Promise.resolve({ data: out[0] ? pick(out[0]) : null, error: null });
    return Promise.resolve({ data: out.map(pick), error: null });
  };

  const from = (actor: string | null) => (table: string) => {
    const q: any = { op: 'select', filters: [], columns: '' };
    const b: any = {
      select: (columns: string) => ((q.columns = columns), b),
      eq: (column: string, value: unknown) => (q.filters.push((r: Row) => r[column] === value), b),
      upsert: (payload: unknown, opts: { onConflict: string }) => ((q.op = 'upsert'), (q.payload = payload), (q.onConflict = opts.onConflict), b),
      maybeSingle: () => run(table, actor, q, 'maybe'),
      then: (resolve: any, reject: any) => {
        try {
          return run(table, actor, q, 'many').then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return b;
  };

  const getUser = async (token: string) => {
    if (!db.tokens.has(token)) return { data: { user: null }, error: { code: 'bad_jwt', status: 403, message: `invalid JWT ${token}` } };
    const id = db.tokens.get(token);
    if (!id) return { data: { user: null }, error: { code: 'session_not_found', status: 403, message: `SINTETICO-RAW-DB ${token}` } };
    return { data: { user: { id, email: `persona-${id.slice(-2)}@qa.local.test`, user_metadata: {} } }, error: null };
  };

  const client = (actor: string | null, sessionToken?: string) => ({
    from: from(actor),
    rpc: async (fn: string, args: unknown) => (db.rpc.push({ fn, args }), { data: db.suppressed, error: null }),
    auth: {
      getUser,
      getSession: async () => ({ data: { session: sessionToken ? { access_token: sessionToken } : null }, error: null }),
    },
  });
  const actorFor = (token: string | undefined) => (token ? db.tokens.get(token) ?? '' : '');
  const fakeClient = {
    create: (_url: string, key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
      const bearer = opts?.global?.headers?.Authorization?.replace('Bearer ', '');
      if (bearer) return client(actorFor(bearer));
      const service = key === process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (service && db.serviceFailsAfterWrite && db.calls.some((c) => c.op !== 'select')) throw new Error('Server configuration error');
      return client(service ? null : '');
    },
    forCookie: (req: { headers: { cookie?: string } }) => {
      const token = /synthetic-session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
      return client(actorFor(token), token);
    },
  };
  return { db, fakeClient };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: fakeClient.create,
}));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerSupabaseClient: ({ req }: { req: { headers: { cookie?: string } } }) => fakeClient.forCookie(req),
  createPagesServerClient: ({ req }: { req: { headers: { cookie?: string } } }) => fakeClient.forCookie(req),
}));

import handler from '../../pages/api/user/notification-preferences';
import { NOTIFICATION_CATALOG } from '../../lib/notifications/catalog';
import { notificationAddressDigest } from '../../lib/email/notification-worker';

const tokenOf = (id: string) => `token-${id}`;
const logs: string[] = [];

type Call = { token?: string | null; cookie?: string; body?: unknown; query?: Record<string, string> };
async function call(method: RequestMethod, { token, cookie, body, query }: Call = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const { req, res } = createMocks({ method, headers, body: body as any, query });
  await handler(req as any, res as any);
  const text = res._getData();
  return { status: res._getStatusCode(), json: text ? JSON.parse(text) : null, text: String(text), headers: res._getHeaders() };
}
const get = (id: string) => call('GET', { token: tokenOf(id) });
const put = (id: string, body: unknown, query?: Record<string, string>) => call('PUT', { token: tokenOf(id), body, query });

const writes = () => db.calls.filter((c) => c.op !== 'select');
const prefReads = () => db.calls.filter((c) => c.table.startsWith('user_notification'));
const categoryRows = (id: string) => (db.tables.user_notification_category_prefs ?? []).filter((r) => r.user_id === id);
const view = (json: any, category: string) => json.categories.find((c: any) => c.category === category);
const event = (json: any, eventType: string) =>
  json.categories.flatMap((c: any) => c.events).find((e: any) => e.event_type === eventType);
const seedCategory = (user_id: string, category: string, email_mode: string) =>
  db.tables.user_notification_category_prefs.push({ user_id, category, email_mode, pref_version: ++db.seq });
const seedLegacy = (user_id: string, notification_type: string, email_enabled: boolean) =>
  db.tables.user_notification_preferences.push({ id: `legacy-${db.seq++}`, user_id, notification_type, email_enabled, in_app_enabled: false });

function expectNoLeak(text: string) {
  for (const s of SENSITIVE) expect(text).not.toContain(s);
  expect(text).not.toMatch(ANY_ID);
}

beforeEach(() => {
  db.tables = {
    user_notification_category_prefs: [],
    user_notification_preferences: [],
    profiles: [
      ...[A, B, ...ROLE_USERS.map((r) => r.id)].map((id) => ({ id, must_change_password: false })),
      { id: FLAGGED, must_change_password: true },
    ],
    user_roles: ROLE_USERS.map((r) => ({ user_id: r.id, role_type: r.role, is_active: true })),
  };
  db.tokens = new Map([A, B, FLAGGED, UNREADABLE, ...ROLE_USERS.map((r) => r.id)].map((id) => [tokenOf(id), id]));
  db.tokens.set('token-revoked', null);
  db.faults = {};
  db.calls = [];
  db.rpc = [];
  db.suppressed = false;
  db.serviceFailsAfterWrite = false;
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
  delete process.env.NOTIFICATION_SUPPRESSION_SECRET;
  logs.length = 0;
  for (const level of ['log', 'error', 'warn'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(format(...args)));
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
  delete process.env.NOTIFICATION_SUPPRESSION_SECRET;
});

describe('D1 — GET returns the effective settings and writes nothing', () => {
  it('with no category rows: every category is default and every event follows its catalog default', async () => {
    const res = await get(A);
    expect(res.status).toBe(200);
    expect(res.json.categories.map((c: any) => c.category)).toEqual([
      'courses', 'assignments', 'community', 'sessions', 'advisory', 'licitaciones', 'qa_support', 'system',
    ]);
    const events = res.json.categories.flatMap((c: any) => c.events);
    expect(events.map((e: any) => e.event_type).sort()).toEqual(Object.keys(NOTIFICATION_CATALOG).sort());
    for (const category of res.json.categories) {
      expect(category).toMatchObject({ email_mode: 'default', stored: false });
      expect(typeof category.label).toBe('string');
    }
    for (const e of events) {
      const entry = NOTIFICATION_CATALOG[e.event_type];
      expect(e.catalog_default).toBe(entry.emailDefault);
      expect(e.mandatory).toBe(entry.mandatory);
      expect(e.legacy_suppressed).toBe(false);
      expect(e.reason).toBe(entry.mandatory ? 'mandatory' : 'catalog_default');
    }
    expect(event(res.json, 'system_update')).toMatchObject({ mode: 'off', delivery: 'off', reason: 'catalog_default' });
    expect(res.json.digest).toEqual({ available: false });
    expect(writes()).toEqual([]);
  });

  it('a stored category mode overrides the catalog default and the legacy row; mandatory stays immediate', async () => {
    seedCategory(A, 'courses', 'off');
    seedCategory(A, 'sessions', 'off');
    seedLegacy(A, 'assignment_created', true);
    seedLegacy(A, 'course_assigned', false);
    const res = await get(A);
    expect(view(res.json, 'courses')).toMatchObject({ email_mode: 'off', stored: true });
    expect(event(res.json, 'course_assigned')).toMatchObject({ mode: 'off', reason: 'category_mode', legacy_suppressed: true });
    expect(event(res.json, 'session_created')).toMatchObject({ mode: 'off', delivery: 'off', reason: 'category_mode' });
    expect(event(res.json, 'session_cancelled')).toMatchObject({ mandatory: true, mode: 'immediate', delivery: 'immediate', reason: 'mandatory' });
    expect(writes()).toEqual([]);
  });

  it('legacy suppression uses the exact event row; the meeting summary counts any false row; Predeterminado re-applies it', async () => {
    seedLegacy(A, 'assignment_created', false);
    seedCategory(A, 'assignments', 'default');
    const res = await get(A);
    expect(view(res.json, 'assignments')).toMatchObject({ email_mode: 'default', stored: true });
    expect(event(res.json, 'assignment_created')).toMatchObject({ mode: 'off', delivery: 'off', reason: 'legacy_suppressed', legacy_suppressed: true });
    expect(event(res.json, 'assignment_feedback')).toMatchObject({ mode: 'immediate', reason: 'catalog_default', legacy_suppressed: false });
    // A false row for an unrelated event suppresses the meeting summary, and only that.
    expect(event(res.json, 'meeting_finalized')).toMatchObject({ mode: 'off', reason: 'legacy_suppressed', legacy_suppressed: true });
    expect(event(res.json, 'message_sent')).toMatchObject({ mode: 'immediate', legacy_suppressed: false });

    // A true legacy row suppresses nothing; another user's false row does not count.
    db.tables.user_notification_preferences = [];
    seedLegacy(A, 'meeting_finalized', true);
    seedLegacy(B, 'meeting_finalized', false);
    const clear = await get(A);
    expect(event(clear.json, 'meeting_finalized')).toMatchObject({ mode: 'immediate', legacy_suppressed: false });
    expect(writes()).toEqual([]);
  });

  it('mixed per-event defaults: a digest mode is shown as digest and delivered immediately while the flag is off', async () => {
    const off = await get(A);
    expect(off.json.digest).toEqual({ available: false });
    expect(event(off.json, 'qa_scenario_assigned')).toMatchObject({ catalog_default: 'immediate', mode: 'immediate', delivery: 'immediate' });
    expect(event(off.json, 'new_feedback')).toMatchObject({ catalog_default: 'digest', mode: 'digest', delivery: 'immediate' });

    seedCategory(A, 'courses', 'digest');
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    const on = await get(A);
    expect(on.json.digest).toEqual({ available: true });
    expect(event(on.json, 'new_feedback')).toMatchObject({ mode: 'digest', delivery: 'digest' });
    expect(event(on.json, 'course_assigned')).toMatchObject({ mode: 'digest', delivery: 'digest', reason: 'category_mode' });
    expect(writes()).toEqual([]);
  });

  it('reads only the caller’s own rows, through the caller’s own client, and leaks no id, address or digest', async () => {
    seedCategory(B, 'courses', 'off');
    seedLegacy(B, 'course_assigned', false);
    process.env.NOTIFICATION_SUPPRESSION_SECRET = 'synthetic-suppression-secret-0123456789abcdef';
    db.suppressed = true;
    const res = await get(A);
    expect(res.status).toBe(200);
    expect(view(res.json, 'courses')).toMatchObject({ email_mode: 'default', stored: false });
    expect(event(res.json, 'course_assigned').legacy_suppressed).toBe(false);
    expect(res.json.address_suppression).toBe('suppressed');
    for (const read of prefReads()) expect(read.actor).toBe(A);
    const digest = notificationAddressDigest('persona-01@qa.local.test');
    expect(db.rpc).toEqual([{ fn: 'notification_email_address_suppressed', args: { p_address_digest: digest } }]);
    expect(res.text).not.toContain(digest!);
    expect(Object.keys(res.json).sort()).toEqual(['address_suppression', 'categories', 'digest']);
    expectNoLeak(res.text);
    expect(writes()).toEqual([]);
  });

  it('address suppression is unavailable without the server key, and not a reason to fail', async () => {
    const res = await get(A);
    expect(res.status).toBe(200);
    expect(res.json.address_suppression).toBe('unavailable');
    expect(db.rpc).toEqual([]);
  });
});

describe('D2 — PUT saves the owner’s category choices in one write', () => {
  it('saves default, immediate and off in one upsert; the reload shows them; legacy and in-app rows are untouched', async () => {
    seedLegacy(A, 'assignment_created', false);
    const legacyBefore = JSON.stringify(db.tables.user_notification_preferences);
    const body = {
      categories: [
        { category: 'courses', email_mode: 'off' },
        { category: 'assignments', email_mode: 'default' },
        { category: 'community', email_mode: 'immediate' },
      ],
    };
    const res = await put(A, body);
    expect(res.status).toBe(200);
    expect(writes()).toEqual([
      {
        table: 'user_notification_category_prefs',
        op: 'upsert',
        actor: A,
        onConflict: 'user_id,category',
        payload: [
          { user_id: A, category: 'courses', email_mode: 'off' },
          { user_id: A, category: 'assignments', email_mode: 'default' },
          { user_id: A, category: 'community', email_mode: 'immediate' },
        ],
      },
    ]);
    expect(view(res.json, 'courses')).toMatchObject({ email_mode: 'off', stored: true });
    expect(event(res.json, 'assignment_created')).toMatchObject({ mode: 'off', reason: 'legacy_suppressed' });
    expect(event(res.json, 'meeting_finalized')).toMatchObject({ mode: 'immediate', reason: 'category_mode' });

    const reload = await get(A);
    expect(reload.json).toEqual(res.json);
    expect(JSON.stringify(db.tables.user_notification_preferences)).toBe(legacyBefore);
    expectNoLeak(res.text);
  });

  it('the version is the database’s: a new value only when a mode changes', async () => {
    await put(A, { categories: [{ category: 'courses', email_mode: 'off' }] });
    const [first] = categoryRows(A);
    const version = first.pref_version;
    await put(A, { categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(categoryRows(A)[0].pref_version).toBe(version);
    await put(A, { categories: [{ category: 'courses', email_mode: 'immediate' }] });
    expect(categoryRows(A)[0].pref_version).toBeGreaterThan(version);
    for (const w of writes()) for (const row of w.payload as object[]) expect(Object.keys(row).sort()).toEqual(['category', 'email_mode', 'user_id']);
  });

  it('with the digest flag on, digest can be chosen', async () => {
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'true';
    const res = await put(A, { categories: [{ category: 'qa_support', email_mode: 'digest' }] });
    expect(res.status).toBe(200);
    expect(categoryRows(A)).toMatchObject([{ category: 'qa_support', email_mode: 'digest' }]);
    expect(event(res.json, 'qa_scenario_assigned')).toMatchObject({ mode: 'digest', delivery: 'digest' });
  });

  it('flag off: a stored digest survives an unrelated update, may be resent unchanged, and shows as delivered immediately', async () => {
    seedCategory(A, 'courses', 'digest');
    const unrelated = await put(A, { categories: [{ category: 'system', email_mode: 'immediate' }] });
    expect(unrelated.status).toBe(200);
    expect(view(unrelated.json, 'courses')).toMatchObject({ email_mode: 'digest', stored: true });
    expect(event(unrelated.json, 'course_assigned')).toMatchObject({ mode: 'digest', delivery: 'immediate' });
    const same = await put(A, { categories: [{ category: 'courses', email_mode: 'digest' }, { category: 'system', email_mode: 'off' }] });
    expect(same.status).toBe(200);
    expect(categoryRows(A).map((r) => [r.category, r.email_mode])).toEqual([['courses', 'digest'], ['system', 'off']]);
  });

  it('concurrent owners each change only their own rows', async () => {
    const [a, b] = await Promise.all([
      put(A, { categories: [{ category: 'courses', email_mode: 'off' }] }),
      put(B, { categories: [{ category: 'courses', email_mode: 'immediate' }, { category: 'system', email_mode: 'immediate' }] }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(categoryRows(A).map((r) => [r.category, r.email_mode])).toEqual([['courses', 'off']]);
    expect(categoryRows(B).map((r) => [r.category, r.email_mode])).toEqual([['courses', 'immediate'], ['system', 'immediate']]);
    expect(view(a.json, 'system')).toMatchObject({ email_mode: 'default', stored: false });
    expect(view(b.json, 'courses')).toMatchObject({ email_mode: 'immediate' });
    for (const w of writes()) for (const row of w.payload as Array<{ user_id: string }>) expect(row.user_id).toBe(w.actor);
  });
});

describe('D3 — invalid bodies are refused whole, and nobody can edit another person', () => {
  const ok = { category: 'courses', email_mode: 'off' };
  const invalid: Array<[string, unknown, string]> = [
    ['a string body', 'categories=courses', 'invalid_body'],
    ['an array body', [ok], 'invalid_body'],
    ['a null body', null, 'invalid_body'],
    ['an empty object', {}, 'invalid_body'],
    ['categories not an array', { categories: ok }, 'invalid_body'],
    ['an empty list', { categories: [] }, 'invalid_body'],
    ['more entries than categories', { categories: Array.from({ length: 9 }, () => ok) }, 'invalid_body'],
    ['an entry that is not an object', { categories: ['courses'] }, 'invalid_body'],
    ['an entry without a mode', { categories: [{ category: 'courses' }] }, 'invalid_body'],
    ['a mode of the wrong type', { categories: [{ category: 'courses', email_mode: false }] }, 'invalid_body'],
    ['a category of the wrong type', { categories: [{ category: 3, email_mode: 'off' }] }, 'invalid_body'],
    ['an unknown category', { categories: [{ category: 'cursos', email_mode: 'off' }] }, 'unknown_category'],
    ['an inherited key as category', { categories: [{ category: 'constructor', email_mode: 'off' }] }, 'unknown_category'],
    ['an unknown mode', { categories: [{ category: 'courses', email_mode: 'weekly' }] }, 'invalid_mode'],
    ['a duplicate category', { categories: [ok, { category: 'courses', email_mode: 'immediate' }] }, 'duplicate_category'],
    ['a valid entry followed by an invalid one', { categories: [ok, { category: 'system', email_mode: 'never' }] }, 'invalid_mode'],
    ['a user id', { user_id: B, categories: [ok] }, 'unknown_field'],
    ['global settings', { global_settings: { email_frequency: 'daily' }, categories: [ok] }, 'unknown_field'],
    ['the old preferences map', { preferences: { course_assigned: { email_enabled: false } } }, 'unknown_field'],
    ['an in-app switch', { in_app_enabled: false, categories: [ok] }, 'unknown_field'],
    ['an entry user id', { categories: [{ ...ok, user_id: B }] }, 'unknown_field'],
    ['an entry in-app switch', { categories: [{ ...ok, in_app_enabled: false }] }, 'unknown_field'],
    ['an entry mandatory flag', { categories: [{ category: 'sessions', email_mode: 'off', mandatory: false }] }, 'unknown_field'],
    ['an entry version', { categories: [{ ...ok, pref_version: 99 }] }, 'unknown_field'],
    ['an entry timestamp', { categories: [{ ...ok, updated_at: '2000-01-01' }] }, 'unknown_field'],
    ['per-event settings', { categories: [{ ...ok, events: { course_assigned: 'off' } }] }, 'unknown_field'],
  ];

  it.each(invalid)('refuses %s with 400 and writes nothing', async (_name, body, code) => {
    seedCategory(A, 'courses', 'immediate');
    const before = JSON.stringify(db.tables);
    const res = await put(A, body);
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: 'La solicitud de preferencias no es válida.', code });
    expect(writes()).toEqual([]);
    expect(JSON.stringify(db.tables)).toBe(before);
  });

  it('refuses a new digest choice while the flag is off, the whole request with it', async () => {
    const res = await put(A, { categories: [{ category: 'system', email_mode: 'off' }, { category: 'courses', email_mode: 'digest' }] });
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: 'El resumen diario aún no está disponible.', code: 'digest_unavailable' });
    expect(writes()).toEqual([]);
    expect(categoryRows(A)).toEqual([]);
  });

  it.each(ROLE_USERS)('$role can save and read only their own choices', async ({ id }) => {
    seedCategory(B, 'courses', 'immediate');
    const res = await put(id, { categories: [{ category: 'licitaciones', email_mode: 'off' }] });
    expect(res.status).toBe(200);
    expect(categoryRows(id)).toMatchObject([{ category: 'licitaciones', email_mode: 'off' }]);
    const targeted = await put(id, { user_id: B, categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(targeted.status).toBe(400);
    expect(categoryRows(B)).toMatchObject([{ category: 'courses', email_mode: 'immediate' }]);
    const read = await call('GET', { token: tokenOf(id), query: { user_id: B } });
    expect(view(read.json, 'courses')).toMatchObject({ email_mode: 'default', stored: false });
  });

  it('an admin naming someone else in the query string still writes only their own row', async () => {
    const admin = ROLE_USERS[0].id;
    const res = await put(admin, { categories: [{ category: 'courses', email_mode: 'off' }] }, { user_id: B, userId: B });
    expect(res.status).toBe(200);
    expect(categoryRows(B)).toEqual([]);
    expect(categoryRows(admin)).toMatchObject([{ category: 'courses', email_mode: 'off' }]);
    expect(writes().map((w) => w.actor)).toEqual([admin]);
  });

  it('switching a category off never switches a mandatory event off', async () => {
    const res = await put(A, { categories: [{ category: 'sessions', email_mode: 'off' }] });
    expect(res.status).toBe(200);
    expect(event(res.json, 'session_cancelled')).toMatchObject({ mandatory: true, mode: 'immediate', delivery: 'immediate', reason: 'mandatory' });
    expect(event(res.json, 'session_reminder_24h')).toMatchObject({ mode: 'off', reason: 'category_mode' });
  });
});

describe('D4 — verified callers only, safe failures', () => {
  it.each(['POST', 'DELETE', 'PATCH'] as const)('%s is 405 with Allow, before any auth or read', async (method) => {
    const res = await call(method, { token: tokenOf(A), body: { categories: [] } });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, PUT');
    expect(db.calls).toEqual([]);
  });

  it.each([
    ['no credentials', undefined],
    ['an invalid token', 'token-unknown'],
    ['a revoked session', 'token-revoked'],
  ])('%s is 401 and reads no preference', async (_name, token) => {
    for (const method of ['GET', 'PUT'] as const) {
      const res = await call(method, { token, body: { categories: [{ category: 'courses', email_mode: 'off' }] } });
      expect(res.status).toBe(401);
      expect(res.json).toEqual({ error: 'No autorizado' });
    }
    expect(prefReads()).toEqual([]);
    expectNoLeak(logs.join('\n'));
  });

  it('a caller who must change their password is held with 403 and nothing is read or written', async () => {
    const res = await put(FLAGGED, { categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(prefReads()).toEqual([]);
  });

  it('an unreadable password-change state is 503', async () => {
    db.faults['profiles.select'] = { code: 'XX000', message: 'SINTETICO-RAW-DB' };
    const res = await get(UNREADABLE);
    expect(res.status).toBe(503);
    expect(res.json.code).toBe('PASSWORD_STATE_UNAVAILABLE');
    expect(prefReads()).toEqual([]);
  });

  it('the cookie session is verified with the auth server and reads as that user', async () => {
    seedCategory(A, 'courses', 'off');
    const res = await call('GET', { cookie: `synthetic-session=${tokenOf(A)}` });
    expect(res.status).toBe(200);
    expect(view(res.json, 'courses')).toMatchObject({ email_mode: 'off' });
    expect((await call('GET', { cookie: 'synthetic-session=token-revoked' })).status).toBe(401);
  });

  it.each([
    ['category', 'user_notification_category_prefs.select'],
    ['legacy', 'user_notification_preferences.select'],
  ])('a failed %s read is 500 for GET and PUT, with no write and no raw error', async (_name, fault) => {
    db.faults[fault] = { code: 'XX000', message: 'SINTETICO-RAW-DB persona@qa.local.test' };
    const read = await get(A);
    expect(read.status).toBe(500);
    expect(read.json).toEqual({ error: 'No pudimos cargar tus preferencias de notificación. Inténtalo nuevamente.', code: 'read_failed' });
    const save = await put(A, { categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(save.status).toBe(500);
    expect(writes()).toEqual([]);
    expect(logs.join('\n')).toContain('XX000');
    expectNoLeak(logs.join('\n') + read.text + save.text);
  });

  it('a failed write is 500 and claims no success', async () => {
    db.faults['user_notification_category_prefs.upsert'] = { code: '23514', message: 'SINTETICO-RAW-DB check violation' };
    const res = await put(A, { categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(res.status).toBe(500);
    expect(res.json).toEqual({ error: 'No pudimos guardar tus preferencias de notificación. Inténtalo nuevamente.', code: 'write_failed' });
    expect(categoryRows(A)).toEqual([]);
    expectNoLeak(logs.join('\n') + res.text);
  });

  it('a thrown database error is 500 with a generic body', async () => {
    db.faults['user_notification_category_prefs.upsert'] = new Error('SINTETICO-RAW-DB socket persona@qa.local.test');
    const res = await put(A, { categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(res.status).toBe(500);
    expect(res.json.code).toBe('unexpected');
    expect(res.json).not.toHaveProperty('categories');
    expectNoLeak(logs.join('\n') + res.text);
  });

  it('a failing suppression lookup after a saved PUT still reports the save', async () => {
    process.env.NOTIFICATION_SUPPRESSION_SECRET = 'synthetic-suppression-secret-0123456789abcdef';
    db.serviceFailsAfterWrite = true;
    const res = await put(A, { categories: [{ category: 'courses', email_mode: 'off' }] });
    expect(res.status).toBe(200);
    expect(res.json.address_suppression).toBe('unavailable');
    expect(categoryRows(A)).toMatchObject([{ category: 'courses', email_mode: 'off' }]);
    expect(db.rpc).toEqual([]);
  });
});
