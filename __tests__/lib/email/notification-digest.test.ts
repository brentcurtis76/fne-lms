// @vitest-environment node
/**
 * N5-01 digest consumer, through the real entry point `runNotificationDigest`.
 *
 * The database is an in-memory stand-in: plain tables behind the query calls the
 * consumer makes, and the digest run RPCs with the semantics pgTAP 105 proves for
 * the real functions (one run per user and date with a derived key, a token
 * lease, an exact-member-set freeze that never replaces stored bytes, retries
 * refused after 24 hours or once the frozen address is suppressed, settlement
 * only for the live token, 22023 on malformed arguments). Access, preferences,
 * tenant policy, unsubscribe links, the snapshot and the provider boundary are
 * the real modules; the provider is a captured transport. Everything is
 * synthetic: no real address, tenant or credential appears here.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/email/outbound-policy', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/email/outbound-policy');
  return { ...actual, authorizeUserEmail: vi.fn(actual.authorizeUserEmail) };
});
vi.mock('../../../lib/email/provider', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../lib/email/provider');
  return { ...actual, deliverOutboundEmail: vi.fn(actual.deliverOutboundEmail) };
});

import { runNotificationDigest } from '../../../lib/email/notification-digest';
import { authorizeUserEmail } from '../../../lib/email/outbound-policy';
import { deliverOutboundEmail } from '../../../lib/email/provider';
import { notificationAddressDigest, openSnapshot } from '../../../lib/email/notification-worker';
import { verifyUnsubscribeToken } from '../../../lib/email/notification-unsubscribe';

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = uuid(1); // the recipient
const COURSE_ID = uuid(10);
const OTHER_COURSE = uuid(11);
const SCHOOL = 11;
const QA_SCHOOL = 257; // config/production-qa-simulation-target.json
const ADDRESS = 'destinataria.sintetica@ejemplo.invalid';
const BASE_URL = 'https://genera.test';
const SNAPSHOT_SECRET = 'synthetic-snapshot-secret-0123456789abcdef';
const UNSUBSCRIBE_SECRET = 'synthetic-unsubscribe-secret-0123456789abcdef';
const SUPPRESSION_SECRET = 'synthetic-suppression-secret-0123456789abcdef';
const LOCAL_DATE = '2026-10-08';
const DAY = 86400;
const providerKey = (user: string, date: string) =>
  `notif-digest-${createHash('sha256').update(JSON.stringify([user, date])).digest('hex')}`;

class Invalid extends Error {}
const ERROR_CODE = /^[a-z0-9_:]{1,100}$/;

function createDb(tables: Tables = {}) {
  const db = {
    tables: {
      outbox: [], sources: [], runs: [], members: [], addresses: [], suppressions: [], recovery: [],
      profiles: [{ id: U, email: ADDRESS, school_id: null }],
      schools: [{ id: SCHOOL, tenant_kind: 'client', internal_zoom_testing_enabled: false }],
      user_roles: [{ user_id: U, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: null, is_active: true }],
      course_enrollments: [{ user_id: U, course_id: COURSE_ID, access_origin: 'independent' }],
      ...tables,
    } as Tables,
    /** Table or RPC names whose next calls answer an error naming the recipient. */
    failing: new Set<string>(),
    /** RPC names whose calls throw. */
    throwing: new Set<string>(),
    /** First-attempt begins still to refuse as if a member row were held by another transaction. */
    held: 0,
    calls: [] as string[],
    now: 1000,
    nextToken: 1,
    nextVersion: 2,
    afterRpc: (_name: string) => undefined as void,
    client: null as any,
  };
  const failure = { data: null, error: { message: `synthetic failure naming ${U} and ${ADDRESS}` } };
  const run = (id: string) => db.tables.runs.find((r) => r.id === id);
  const live = (id: unknown, token: unknown) => {
    const r = run(id as string);
    return r && r.lease_token === token && r.lease_expires_at > db.now ? r : null;
  };
  const expired = (r: Row) => r.send_snapshot !== null && r.first_attempt_at <= db.now - DAY;
  const suppressed = (digest: unknown) => db.tables.suppressions.some((s) => s.address_digest === digest);
  const membersOf = (id: string) =>
    db.tables.members.filter((m) => m.run_id === id).map((m) => db.tables.outbox.find((o) => o.id === m.outbox_id)!);
  const pendingDigest = (o: Row) => o.email_mode === 'digest' && o.status === 'pending' && o.send_snapshot === null;
  const recoveryDue = () => db.tables.recovery.some((r) => r.due);

  const rpcs: Record<string, (a: Row) => unknown> = {
    password_recovery_email_due: recoveryDue,
    notification_email_address_suppressed: ({ p_address_digest }) => suppressed(p_address_digest),
    open_notification_digest_runs: ({ p_limit, p_max_members }) => {
      if (!(p_limit >= 1 && p_limit <= 100 && p_max_members >= 1 && p_max_members <= 200)) throw new Invalid();
      const users = [...new Set(db.tables.outbox
        .filter((o) => pendingDigest(o) && o.email_reason !== 'mandatory' && !db.tables.members.some((m) => m.outbox_id === o.id))
        .map((o) => o.user_id))]
        .filter((user) => !db.tables.runs.some((r) => r.user_id === user && r.local_date === LOCAL_DATE))
        .slice(0, p_limit);
      return users.map((user) => {
        const id = uuid(5000 + db.tables.runs.length);
        db.tables.runs.push({
          id, user_id: user, local_date: LOCAL_DATE, provider_key: providerKey(user, LOCAL_DATE), status: 'pending',
          attempt_count: 0, next_attempt_at: db.now, lease_token: null, lease_expires_at: null, first_attempt_at: null,
          send_snapshot: null, address_digest: null, last_error_code: null, provider_message_id: null,
        });
        const rows = db.tables.outbox
          .filter((o) => o.user_id === user && pendingDigest(o) && o.email_reason !== 'mandatory' && !db.tables.members.some((m) => m.outbox_id === o.id))
          .slice(0, p_max_members);
        for (const o of rows) db.tables.members.push({ run_id: id, outbox_id: o.id });
        return { run_id: id, user_id: user, local_date: LOCAL_DATE, members: rows.length };
      });
    },
    claim_notification_digest_runs: ({ p_limit, p_lease_seconds }) => {
      if (!(p_limit >= 1 && p_limit <= 100 && p_lease_seconds >= 30 && p_lease_seconds <= 900)) throw new Invalid();
      if (recoveryDue()) return [];
      return db.tables.runs
        .filter((r) => ['pending', 'sending'].includes(r.status) && r.next_attempt_at <= db.now &&
          (r.lease_expires_at === null || r.lease_expires_at <= db.now))
        .slice(0, p_limit)
        .map((r) => {
          Object.assign(r, { lease_token: uuid(9000 + db.nextToken++), lease_expires_at: db.now + p_lease_seconds });
          return {
            run_id: r.id, lease_token: r.lease_token, user_id: r.user_id, local_date: r.local_date, provider_key: r.provider_key,
            status: r.status, attempt_count: r.attempt_count, has_snapshot: r.send_snapshot !== null, expired: expired(r),
          };
        });
    },
    renew_notification_digest_run: ({ p_run_id, p_lease_token, p_lease_seconds }) => {
      if (!(p_lease_seconds >= 30 && p_lease_seconds <= 900)) throw new Invalid();
      const r = live(p_run_id, p_lease_token);
      if (r) r.lease_expires_at = db.now + p_lease_seconds;
      return !!r;
    },
    notification_digest_run_state: ({ p_run_id, p_lease_token }) => {
      const r = live(p_run_id, p_lease_token);
      return r ? [{
        status: r.status, attempt_count: r.attempt_count, has_snapshot: r.send_snapshot !== null, expired: expired(r),
        address_suppressed: r.address_digest !== null && suppressed(r.address_digest),
      }] : [];
    },
    notification_digest_run_members: ({ p_run_id, p_lease_token }) => {
      if (!live(p_run_id, p_lease_token)) return [];
      return membersOf(p_run_id).map((o) => {
        const source = db.tables.sources.find((s) => s.outbox_id === o.id);
        return {
          outbox_id: o.id, status: o.status, event_type: o.event_type, category: o.category, email_reason: o.email_reason,
          related_url: o.related_url, payload: o.payload, notification_id: o.notification_id, created_at: o.created_at,
          source_kind: source?.source_kind ?? null, source_id: source?.source_id ?? null,
        };
      });
    },
    cancel_notification_digest_member: ({ p_run_id, p_lease_token, p_outbox_id, p_error_code }) => {
      if (!ERROR_CODE.test(p_error_code ?? '')) throw new Invalid();
      const r = live(p_run_id, p_lease_token);
      if (!r || r.status !== 'pending' || r.send_snapshot !== null) return false;
      const o = membersOf(p_run_id).find((m) => m.id === p_outbox_id);
      if (!o || !pendingDigest(o)) return false;
      Object.assign(o, { status: 'cancelled', last_error_code: p_error_code });
      return true;
    },
    begin_notification_digest_attempt: ({ p_run_id, p_lease_token, p_snapshot, p_member_ids, p_address_digest }) => {
      if (p_address_digest !== null && !/^[0-9a-f]{64}$/.test(p_address_digest)) throw new Invalid();
      if (p_member_ids !== null && (!Array.isArray(p_member_ids) || p_member_ids.length < 1 || p_member_ids.length > 200 ||
        new Set(p_member_ids).size !== p_member_ids.length)) throw new Invalid();
      if (p_snapshot !== null && (typeof p_snapshot !== 'string' || (p_snapshot.length - 2) / 2 > 262144)) throw new Invalid();
      const r = live(p_run_id, p_lease_token);
      if (!r || !['pending', 'sending'].includes(r.status)) return null;
      if (r.status === 'sending') {
        if (expired(r) || suppressed(r.address_digest)) return null;
        r.attempt_count += 1;
        return r.send_snapshot;
      }
      if (db.held > 0) {
        db.held--;
        return null;
      }
      const pending = membersOf(r.id).filter(pendingDigest).map((o) => o.id).sort();
      if (!p_snapshot || !p_member_ids || !p_address_digest || suppressed(p_address_digest)) return null;
      if (pending.length === 0 || JSON.stringify(pending) !== JSON.stringify([...p_member_ids].sort())) return null;
      for (const id of pending) {
        Object.assign(db.tables.outbox.find((o) => o.id === id)!, { status: 'sending' });
        db.tables.addresses.push({ outbox_id: id, address_digest: p_address_digest });
      }
      Object.assign(r, { status: 'sending', send_snapshot: p_snapshot, address_digest: p_address_digest, first_attempt_at: db.now });
      r.attempt_count += 1;
      return r.send_snapshot;
    },
    finish_notification_digest_run: ({ p_run_id, p_lease_token, p_outcome, p_error_code, p_provider_message_id, p_retry_seconds }) => {
      if (!['sent', 'failed', 'cancelled', 'retry'].includes(p_outcome)) throw new Invalid();
      if ((p_error_code !== null && !ERROR_CODE.test(p_error_code)) || (p_error_code === null && p_outcome !== 'sent')) throw new Invalid();
      if (p_outcome === 'retry' && !(p_retry_seconds >= 60 && p_retry_seconds <= 86400)) throw new Invalid();
      const r = live(p_run_id, p_lease_token);
      if (!r || !['pending', 'sending'].includes(r.status)) return false;
      if ((['sent', 'failed'].includes(p_outcome) && r.status !== 'sending') || (p_outcome === 'cancelled' && r.status !== 'pending')) return false;
      Object.assign(r, { lease_token: null, lease_expires_at: null, last_error_code: p_outcome === 'sent' ? null : p_error_code });
      if (p_outcome === 'retry') {
        r.next_attempt_at = db.now + p_retry_seconds;
        return true;
      }
      Object.assign(r, { status: p_outcome, send_snapshot: null, provider_message_id: p_outcome === 'sent' ? p_provider_message_id : null });
      for (const o of membersOf(r.id)) {
        if (p_outcome === 'cancelled' ? pendingDigest(o) : o.status === 'sending') {
          Object.assign(o, { status: p_outcome, last_error_code: p_outcome === 'sent' ? null : p_error_code });
        }
      }
      return true;
    },
    settle_ambiguous_notification_digest_run: ({ p_run_id, p_lease_token, p_outcome, p_error_code }) => {
      if (!['cancelled_after_ambiguous', 'unknown'].includes(p_outcome) || !ERROR_CODE.test(p_error_code ?? '')) throw new Invalid();
      const r = live(p_run_id, p_lease_token);
      if (!r || r.status !== 'sending' || (p_outcome === 'unknown' && !expired(r))) return false;
      Object.assign(r, { status: p_outcome, last_error_code: p_error_code, send_snapshot: null, lease_token: null, lease_expires_at: null });
      for (const o of membersOf(r.id)) if (o.status === 'sending') Object.assign(o, { status: p_outcome, last_error_code: p_error_code });
      return true;
    },
  };

  db.client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const read = (single: boolean) => {
        db.calls.push(table);
        if (db.failing.has(table)) return failure;
        const found = (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        return { data: single ? found[0] ?? null : found, error: null };
      };
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
        not: (column: string) => (filters.push((row) => row[column] !== null && row[column] !== undefined), builder),
        maybeSingle: () => Promise.resolve(read(true)),
        then: (resolve: any, reject: any) => Promise.resolve(read(false)).then(resolve, reject),
        // ON CONFLICT DO NOTHING on (user_id, category), the mode default and the version trigger.
        upsert: async (value: Row) => {
          db.calls.push(`${table}:upsert`);
          if (db.failing.has(`${table}:upsert`)) return failure;
          const rows = (db.tables[table] ??= []);
          if (!rows.some((r) => r.user_id === value.user_id && r.category === value.category)) {
            rows.push({ email_mode: 'default', pref_version: db.nextVersion++, ...value });
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
    async rpc(name: string, args: Row = {}) {
      db.calls.push(`rpc:${name}`);
      if (db.throwing.has(name)) throw new Error(`synthetic throw naming ${U}`);
      let result: { data: unknown; error: unknown };
      if (db.failing.has(name)) result = failure;
      else {
        try {
          result = { data: rpcs[name](args), error: null };
        } catch (error) {
          if (!(error instanceof Invalid)) throw error;
          result = { data: null, error: { code: '22023', message: `${name}: invalid` } };
        }
      }
      db.afterRpc(name);
      return result;
    },
  };
  return db;
}

type Db = ReturnType<typeof createDb>;
let nextRow = 100;
/** One pending digest outbox row of the recipient (or `user`), with its source reference when given. */
function queue(db: Db, event: string, source: [string, string] | null, extra: Row = {}): Row {
  const id = uuid(nextRow++);
  const row: Row = {
    id, user_id: U, event_type: event, category: null, email_mode: 'digest', email_reason: 'optional', notification_id: uuid(nextRow + 3000),
    related_url: '/mi-aprendizaje', payload: {}, status: 'pending', send_snapshot: null, last_error_code: null, created_at: nextRow, ...extra,
  };
  db.tables.outbox.push(row);
  if (source) db.tables.sources.push({ outbox_id: id, source_kind: source[0], source_id: source[1] });
  return row;
}
const COURSE: [string, string] = ['course', COURSE_ID];
const course = (db: Db, extra: Row = {}) => queue(db, 'course_assigned', COURSE, { payload: { 'course.name': 'Curso sintético' }, ...extra });
/** system_update defaults to off: a stored digest choice keeps it. */
const SYSTEM_DIGEST: Row = { user_id: U, category: 'system', email_mode: 'digest', pref_version: 5 };

const accepted = () => vi.fn(async (_message: Row, _options?: Row) => ({ data: { id: 'provider-message-1' }, error: null }));
const answering = (statusCode: number) =>
  vi.fn(async (_message: Row, _options?: Row) => ({ data: null, error: { message: `provider text naming ${ADDRESS}`, statusCode } }));
const digestRun = (db: Db, user = U) => db.tables.runs.find((r) => r.user_id === user)!;
const run = (db: Db, transport: any, random = () => 0.5) => runNotificationDigest(db.client, { transport, random });
const SNAPSHOT_KEY = createHash('sha256').update('genera/notification-email-snapshot/').update(SNAPSHOT_SECRET).digest();
const ZERO = { opened: 0, claimed: 0, sent: 0, failed: 0, cancelled: 0, unknown: 0, retried: 0, deferred: 0, lost: 0, membersCancelled: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', 'on');
  vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', SNAPSHOT_SECRET);
  vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET);
  vi.stubEnv('NOTIFICATION_SUPPRESSION_SECRET', SUPPRESSION_SECRET);
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', BASE_URL);
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
  vi.stubEnv('RESEND_API_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('C6 — dormant unless the flag is on and the configuration is there', () => {
  it.each([['unset', undefined], ['off', 'off'], ['empty', ''], ['unrecognised', 'yes']])('flag %s: disabled, no database call', async (_name, value) => {
    vi.stubEnv('NOTIFICATION_OUTBOX_DELIVERY', value ?? '');
    if (value === undefined) delete process.env.NOTIFICATION_OUTBOX_DELIVERY;
    const db = createDb();
    course(db);
    const transport = accepted();

    expect(await run(db, transport)).toEqual({ enabled: false, status: 'disabled', ...ZERO });
    expect(db.calls).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['no snapshot key', 'NOTIFICATION_SNAPSHOT_SECRET', ''],
    ['a snapshot key under 32 characters', 'NOTIFICATION_SNAPSHOT_SECRET', 'short'],
    ['an invalid sender', 'EMAIL_FROM_ADDRESS', 'no es un remitente'],
  ])('%s: not_configured, nothing opened or claimed', async (_name, variable, value) => {
    vi.stubEnv(variable, value);
    const db = createDb();
    course(db);

    expect(await run(db, accepted())).toEqual({ enabled: true, status: 'not_configured', ...ZERO });
    expect(db.calls).toEqual([]);
  });

  it('a failed open or claim throws a message that names nothing', async () => {
    for (const name of ['open_notification_digest_runs', 'claim_notification_digest_runs']) {
      const db = createDb();
      course(db);
      db.failing.add(name);
      const error = await run(db, accepted()).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/^digest_(open|claim)_failed$/);
      expect((error as Error).message).not.toContain(U);
    }
  });
});

describe('C1/D2 — open, claim, lease and one send per user and date', () => {
  it('in-app and email-only rows go out in one digest under the database key; a repeated call sends nothing', async () => {
    const db = createDb({ user_notification_category_prefs: [SYSTEM_DIGEST] });
    const rows = [course(db), queue(db, 'system_update', null, { notification_id: null })];
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ status: 'ok', opened: 1, claimed: 1, sent: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]).toEqual({ idempotencyKey: providerKey(U, LOCAL_DATE) });
    expect(rows.map((r) => r.status)).toEqual(['sent', 'sent']);
    expect(digestRun(db)).toMatchObject({ status: 'sent', send_snapshot: null, provider_message_id: 'provider-message-1', lease_token: null });

    expect(await run(db, transport)).toMatchObject({ opened: 0, claimed: 0, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('two concurrent calls give each run to one owner and send it once', async () => {
    const db = createDb();
    const users = [U, uuid(2), uuid(3)];
    for (const user of users.slice(1)) {
      db.tables.profiles.push({ id: user, email: `otra.${user.slice(-1)}@ejemplo.invalid`, school_id: null });
      db.tables.user_roles.push({ user_id: user, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: null, is_active: true });
      db.tables.course_enrollments.push({ user_id: user, course_id: COURSE_ID, access_origin: 'independent' });
    }
    for (const user of users) course(db, { user_id: user });
    const transport = accepted();

    const results = await Promise.all([run(db, transport), run(db, transport)]);

    expect(results.map((r) => r.claimed).sort()).toEqual([0, 3]);
    expect(transport.mock.calls.map(([, options]) => options?.idempotencyKey).sort()).toEqual(users.map((u) => providerKey(u, LOCAL_DATE)).sort());
    expect(db.tables.runs.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
  });

  it('one call claims and sends at most 10 runs; the next call takes the rest', async () => {
    const db = createDb();
    for (let i = 0; i < 12; i++) {
      const user = uuid(200 + i);
      db.tables.profiles.push({ id: user, email: `persona${i}@ejemplo.invalid`, school_id: null });
      db.tables.user_roles.push({ user_id: user, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: null, is_active: true });
      db.tables.course_enrollments.push({ user_id: user, course_id: COURSE_ID, access_origin: 'independent' });
      course(db, { user_id: user });
    }
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ opened: 12, claimed: 10, sent: 10 });
    expect(await run(db, transport)).toMatchObject({ opened: 0, claimed: 2, sent: 2 });
    expect(transport).toHaveBeenCalledTimes(12);
  });

  it('recovery mail due: nothing is claimed; recovery due mid-call: the remaining runs are handed back unfrozen', async () => {
    const db = createDb();
    course(db);
    db.tables.recovery.push({ due: true });
    const transport = accepted();
    expect(await run(db, transport)).toMatchObject({ opened: 1, claimed: 0, sent: 0 });

    db.tables.recovery = [];
    const other = uuid(2);
    db.tables.profiles.push({ id: other, email: 'otra@ejemplo.invalid', school_id: null });
    db.tables.user_roles.push({ user_id: other, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: null, is_active: true });
    db.tables.course_enrollments.push({ user_id: other, course_id: COURSE_ID, access_origin: 'independent' });
    course(db, { user_id: other });
    db.afterRpc = (name) => { if (name === 'finish_notification_digest_run') db.tables.recovery.push({ due: true }); };

    expect(await run(db, transport)).toMatchObject({ claimed: 2, sent: 1, deferred: 1 });
    const held = db.tables.runs.find((r) => r.status === 'pending')!;
    expect(held).toMatchObject({ send_snapshot: null, last_error_code: 'recovery_priority', next_attempt_at: db.now + 60 });
  });

  it('an unreadable recovery queue fails closed: nothing is frozen or sent', async () => {
    const db = createDb();
    course(db);
    db.failing.add('password_recovery_email_due');

    expect(await run(db, accepted())).toMatchObject({ claimed: 1, deferred: 1, sent: 0 });
    expect(digestRun(db)).toMatchObject({ status: 'pending', send_snapshot: null, last_error_code: 'priority_unavailable' });
  });

  it('a member cancelled by an unsubscribe between the reads and the freeze is left out; the rest freeze and go', async () => {
    const db = createDb({ user_notification_category_prefs: [SYSTEM_DIGEST] });
    const kept = course(db);
    const gone = queue(db, 'system_update', null, { payload: { title: 'Aviso que ya no va' } });
    let raced = false;
    db.afterRpc = (name) => {
      if (name === 'renew_notification_digest_run' && !raced) {
        raced = true;
        gone.status = 'cancelled';
      }
    };
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ sent: 1, membersCancelled: 0 });
    expect(db.calls.filter((c) => c === 'rpc:begin_notification_digest_attempt')).toHaveLength(2);
    expect(transport.mock.calls[0][0].subject).toBe('Tu resumen diario de Genera: 1 notificación');
    expect([kept.status, gone.status]).toEqual(['sent', 'cancelled']);
  });

  it('a member an unsubscribe took before its cancellation is not counted as cancelled by the digest', async () => {
    const db = createDb();
    const kept = course(db);
    const off = queue(db, 'system_update', null);
    db.afterRpc = (name) => { if (name === 'notification_digest_run_members' && off.status === 'pending') off.status = 'cancelled'; };

    expect(await run(db, accepted())).toMatchObject({ sent: 1, membersCancelled: 0 });
    expect([kept.status, off.status]).toEqual(['sent', 'cancelled']);
  });

  it('a member row held by another transaction: the freeze is tried again, and after 3 refusals the run is handed back unsent', async () => {
    const db = createDb();
    course(db);
    db.held = 1;
    const transport = accepted();
    expect(await run(db, transport)).toMatchObject({ sent: 1 });

    const second = createDb();
    course(second);
    second.held = 9;
    expect(await run(second, transport)).toMatchObject({ retried: 1, sent: 0 });
    expect(second.calls.filter((c) => c === 'rpc:begin_notification_digest_attempt')).toHaveLength(3);
    expect(digestRun(second)).toMatchObject({ status: 'pending', send_snapshot: null, last_error_code: 'freeze_contention', next_attempt_at: second.now + 60 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('C2/D3 — current access, preference, recipient and tenant, failing closed', () => {
  it('a revoked, malformed, switched-off or email-suppressed member is cancelled and never rendered; the rest go out', async () => {
    const db = createDb();
    const ok = course(db);
    const revoked = queue(db, 'course_assigned', ['course', OTHER_COURSE], { payload: { 'course.name': 'Curso revocado' } });
    const malformed = queue(db, 'course_assigned', ['course', 'no-es-un-uuid'], { payload: { 'course.name': 'Curso malformado' } });
    const meeting = queue(db, 'meeting_finalized', null, { payload: { title: 'Reunión suprimida' } });
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ sent: 1, membersCancelled: 3 });
    expect([ok, revoked, malformed, meeting].map((r) => [r.status, r.last_error_code])).toEqual([
      ['sent', null], ['cancelled', 'source_access_revoked'], ['cancelled', 'source_malformed'], ['cancelled', 'email_suppressed'],
    ]);
    const html = transport.mock.calls[0][0].html;
    expect(html).toContain('Curso sintético');
    for (const text of ['Curso revocado', 'Curso malformado', 'Reunión suprimida']) expect(html).not.toContain(text);
  });

  it('a category switched off, or a legacy row that suppresses the event, cancels those members', async () => {
    const db = createDb({
      user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'off', pref_version: 2 }, SYSTEM_DIGEST],
    });
    const off = course(db);
    const system = queue(db, 'system_update', null);
    const legacy = createDb({ user_notification_preferences: [{ user_id: U, notification_type: 'course_assigned', email_enabled: false }] });
    const legacyRow = course(legacy);

    expect(await run(db, accepted())).toMatchObject({ sent: 1, membersCancelled: 1 });
    expect([off.status, off.last_error_code, system.status]).toEqual(['cancelled', 'preference_off', 'sent']);
    expect(await run(legacy, accepted())).toMatchObject({ cancelled: 1, membersCancelled: 1 });
    expect([legacyRow.status, legacyRow.last_error_code]).toEqual(['cancelled', 'preference_off']);
  });

  it('a member whose category is now immediate is delivered in the digest, not swallowed', async () => {
    const db = createDb({ user_notification_category_prefs: [{ user_id: U, category: 'courses', email_mode: 'immediate', pref_version: 2 }] });
    const row = course(db);

    expect(await run(db, accepted())).toMatchObject({ sent: 1, membersCancelled: 0 });
    expect(row.status).toBe('sent');
  });

  it('a mandatory event is delivered even with unreadable preferences, and carries no unsubscribe link', async () => {
    const SESSION_ID = uuid(12);
    const db = createDb({
      user_roles: [{ user_id: U, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: uuid(20), is_active: true }],
      consultor_sessions: [{ id: SESSION_ID, school_id: SCHOOL, growth_community_id: uuid(20), status: 'programada', is_active: true }],
    });
    const row = queue(db, 'session_cancelled', ['session', SESSION_ID]);
    db.failing.add('user_notification_category_prefs');
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ sent: 1 });
    expect(row.status).toBe('sent');
    expect(transport.mock.calls[0][0].headers).toBeUndefined();
    expect(transport.mock.calls[0][0].html).not.toContain('/notificaciones/baja');
  });

  it('every member cancelled: the run is cancelled and nothing is frozen or sent', async () => {
    const db = createDb();
    course(db, { event_type: 'meeting_finalized' });
    queue(db, 'course_assigned', ['course', OTHER_COURSE]);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, cancelled: 1, membersCancelled: 2, sent: 0 });
    expect(digestRun(db)).toMatchObject({ status: 'cancelled', last_error_code: 'no_members', send_snapshot: null });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['the access read', 'user_roles', 'access_lookup_failed'],
    ['the preference read', 'user_notification_category_prefs', 'preference_unavailable'],
    ['the legacy preference read', 'user_notification_preferences', 'preference_unavailable'],
    ['the member read', 'notification_digest_run_members', 'members_unavailable'],
    ['the state read', 'notification_digest_run_state', 'state_unavailable'],
    ['the recipient read', 'profiles', 'recipient_lookup_failed'],
    ['the suppression read', 'notification_email_address_suppressed', 'suppression_unavailable'],
  ])('%s fails: nothing is cancelled, frozen or sent; the run waits', async (_name, failing, code) => {
    const db = createDb({ user_notification_category_prefs: [SYSTEM_DIGEST] });
    const rows = [course(db), queue(db, 'system_update', null)];
    db.failing.add(failing);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0, membersCancelled: 0 });
    expect(digestRun(db)).toMatchObject({ status: 'pending', send_snapshot: null, last_error_code: code, next_attempt_at: db.now + 900 });
    expect(rows.map((r) => r.status)).toEqual(['pending', 'pending']);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['a suppressed address', (db: Db) => db.tables.suppressions.push({ address_digest: notificationAddressDigest(ADDRESS) }), 'cancelled', 'address_suppressed'],
    ['no address', (db: Db) => (db.tables.profiles[0].email = '  '), 'cancelled', 'missing_recipient'],
    ['a QA tenant recipient', (db: Db) => {
      db.tables.user_roles[0].school_id = QA_SCHOOL;
      db.tables.schools.push({ id: QA_SCHOOL, tenant_kind: 'qa', internal_zoom_testing_enabled: false });
    }, 'cancelled', 'suppressed_qa'],
    ['a school that cannot be read', (db: Db) => db.failing.add('schools'), 'pending', 'refused_school_lookup_failed'],
    ['no suppression key', () => vi.stubEnv('NOTIFICATION_SUPPRESSION_SECRET', ''), 'pending', 'suppression_unavailable'],
    ['no unsubscribe signing secret', () => vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', ''), 'pending', 'unsubscribe_unavailable'],
    ['no preference row and it cannot be written', (db: Db) => db.failing.add('user_notification_category_prefs:upsert'), 'pending', 'unsubscribe_unavailable'],
  ])('%s: run %s with %s, nothing frozen or sent', async (_name, arrange, status, code) => {
    const db = createDb();
    const row = course(db);
    arrange(db);
    const transport = accepted();

    await run(db, transport);
    expect(digestRun(db)).toMatchObject({ status, send_snapshot: null, last_error_code: code });
    expect(row.status).toBe(status);
    expect(transport).not.toHaveBeenCalled();
  });

  it('no provider key: the run waits unfrozen, no call is made, and it goes out once the key is there', async () => {
    const db = createDb();
    course(db);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(await run(db, undefined)).toMatchObject({ retried: 1, sent: 0 });
    expect(digestRun(db)).toMatchObject({ status: 'pending', send_snapshot: null, last_error_code: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deliverOutboundEmail).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    db.now += 900;
    expect(await run(db, accepted())).toMatchObject({ sent: 1 });
  });

  it('neither the result, the stored codes nor a log line names the recipient', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const db = createDb();
    course(db);
    db.throwing.add('renew_notification_digest_run');
    const first = await run(db, accepted());
    db.throwing.clear();
    db.now += 301;
    const second = await run(db, answering(422));

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    const stored = JSON.stringify([...db.tables.runs, ...db.tables.outbox].map((r) => [r.last_error_code, r.provider_message_id]));
    for (const text of [JSON.stringify(first), JSON.stringify(second), logged, stored]) {
      expect(text).not.toContain(ADDRESS);
      expect(text).not.toContain(U);
    }
    expect(first).toMatchObject({ claimed: 1, lost: 1 });
    expect(second).toMatchObject({ claimed: 1, failed: 1 });
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe('C3/D4 — the rendered, frozen digest', () => {
  it('es-CL notices from allowlisted fields only, escaped, with the settings page, a body link per category and the RFC 8058 header', async () => {
    const db = createDb({ user_notification_category_prefs: [SYSTEM_DIGEST] });
    course(db, { payload: { 'course.name': 'Curso <b>sintético</b>', nota: 'Texto libre privado' }, related_url: '//externo.invalid/x' });
    queue(db, 'system_update', null, { notification_id: null, payload: { title: 'Versión 2', update_message: 'Mensaje libre' } });
    const transport = accepted();

    await run(db, transport);
    const [message, options] = transport.mock.calls[0];
    expect(message.to).toBe(ADDRESS);
    expect(message.subject).toBe('Tu resumen diario de Genera: 2 notificaciones');
    expect(message.html).toContain('Tu resumen diario');
    expect(message.html).toContain('8 de octubre de 2026');
    expect(message.html).toContain('Curso &lt;b&gt;sintético&lt;/b&gt;');
    expect(message.html).not.toContain('<b>sintético');
    for (const text of ['Texto libre privado', 'Mensaje libre', 'externo.invalid']) expect(message.html).not.toContain(text);
    expect(message.html).toContain(`href="${BASE_URL}/notifications"`);
    expect(message.html).toContain(`${BASE_URL}/configuracion/notificaciones`);
    expect(options).toEqual({ idempotencyKey: providerKey(U, LOCAL_DATE) });

    const bodyTokens = [...message.html.matchAll(/notificaciones\/baja\?t=([^"]+)"/g)].map((m) => verifyUnsubscribeToken(m[1]));
    expect(bodyTokens).toEqual([
      { ok: true, kind: 'category', userId: U, scopes: [{ category: 'courses', prefVersion: 2 }] },
      { ok: true, kind: 'category', userId: U, scopes: [{ category: 'system', prefVersion: 5 }] },
    ]);
    expect(message.html).toContain('No recibir más correos de Cursos y aprendizaje');
    expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const header = /^<https:\/\/genera\.test\/api\/notifications\/unsubscribe\?t=(.+)>$/.exec(message.headers['List-Unsubscribe']);
    expect(verifyUnsubscribeToken(header?.[1])).toEqual({
      ok: true, kind: 'digest', userId: U, scopes: [{ category: 'courses', prefVersion: 2 }, { category: 'system', prefVersion: 5 }],
    });
    expect(db.tables.user_notification_category_prefs).toContainEqual(expect.objectContaining({ category: 'courses', email_mode: 'default', pref_version: 2 }));
  });

  it('the frozen snapshot is the encrypted message that was sent, with the exact member set and the address digest', async () => {
    const db = createDb();
    const row = course(db);
    let frozen: Row | null = null;
    db.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') frozen = { ...digestRun(db) }; };
    const transport = accepted();

    await run(db, transport);
    expect(frozen).toMatchObject({ status: 'sending', address_digest: notificationAddressDigest(ADDRESS), attempt_count: 1 });
    expect(transport.mock.calls[0][0]).toEqual({ ...openSnapshot(SNAPSHOT_KEY, frozen!.send_snapshot), from: 'Genera <notificaciones@nuevaeducacion.org>' });
    expect(frozen!.send_snapshot).not.toContain(Buffer.from(ADDRESS).toString('hex'));
    expect(db.tables.addresses).toEqual([{ outbox_id: row.id, address_digest: notificationAddressDigest(ADDRESS) }]);
  });

  it('a retry sends the frozen bytes under the same key, whatever the payload, versions, secret and supplied arguments say now', async () => {
    const db = createDb();
    const row = course(db);
    const transport = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'busy', statusCode: 503 } })
      .mockResolvedValueOnce({ data: { id: 'provider-message-2' }, error: null });

    expect(await run(db, transport)).toMatchObject({ retried: 1, sent: 0 });
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: 'transport_error', next_attempt_at: db.now + 90 });
    const stored = digestRun(db).send_snapshot;

    row.payload = { 'course.name': 'Nombre cambiado' };
    db.tables.user_notification_category_prefs[0].pref_version = 9;
    vi.stubEnv('NOTIFICATION_UNSUBSCRIBE_SECRET', 'another-synthetic-unsubscribe-secret-0123456789');
    db.now += 90;
    expect(await run(db, transport)).toMatchObject({ sent: 1 });

    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    const retryBegin = db.calls.filter((c) => c === 'rpc:begin_notification_digest_attempt');
    expect(retryBegin).toHaveLength(2);
    expect(digestRun(db)).toMatchObject({ status: 'sent', send_snapshot: null, attempt_count: 2, provider_message_id: 'provider-message-2' });
    expect(stored).not.toBeNull();
    expect(row.status).toBe('sent');
  });

  it('a snapshot sealed under another key is never sent', async () => {
    const db = createDb();
    course(db);
    const transport = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'busy', statusCode: 500 } });
    await run(db, transport);
    vi.stubEnv('NOTIFICATION_SNAPSHOT_SECRET', 'another-synthetic-snapshot-secret-0123456789');
    db.now += 3600;

    expect(await run(db, transport)).toMatchObject({ retried: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: 'snapshot_unreadable' });
  });
});

describe('C3/C4/D4 — retries of a frozen run', () => {
  /** A run frozen by an attempt the provider answered ambiguously. */
  async function frozenRun(tables: Tables = {}) {
    const db = createDb(tables);
    const row = course(db);
    const transport = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'busy', statusCode: 503 } })
      .mockResolvedValue({ data: { id: 'provider-message-2' }, error: null });
    await run(db, transport);
    db.now += 3600;
    return { db, row, transport };
  }

  it.each([
    ['access revoked', (db: Db) => (db.tables.course_enrollments = []), 'source_access_revoked'],
    ['the category switched off', (db: Db) => db.tables.user_notification_category_prefs.push({ user_id: U, category: 'courses', email_mode: 'off', pref_version: 7 }), 'preference_off'],
    ['the address suppressed', (db: Db) => db.tables.suppressions.push({ address_digest: notificationAddressDigest(ADDRESS) }), 'address_suppressed'],
    ['a QA tenant now', (db: Db) => {
      db.tables.user_roles[0].school_id = QA_SCHOOL;
      db.tables.schools.push({ id: QA_SCHOOL, tenant_kind: 'qa', internal_zoom_testing_enabled: false });
    }, 'suppressed_qa'],
  ])('%s: the whole run ends cancelled_after_ambiguous, no second send', async (_name, change, code) => {
    const { db, row, transport } = await frozenRun();
    change(db);

    expect(await run(db, transport)).toMatchObject({ claimed: 1, cancelled: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'cancelled_after_ambiguous', last_error_code: code, send_snapshot: null, lease_token: null });
    expect(row.status).toBe('cancelled_after_ambiguous');
  });

  it.each([
    ['access', 'user_roles', 'access_lookup_failed'],
    ['preferences', 'user_notification_category_prefs', 'preference_unavailable'],
    ['the tenant', 'profiles', 'refused_user_lookup_failed'],
  ])('%s unreadable: no send, the snapshot is kept, the run waits', async (_name, failing, code) => {
    const { db, row, transport } = await frozenRun();
    db.failing.add(failing);

    expect(await run(db, transport)).toMatchObject({ retried: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: code });
    expect(digestRun(db).send_snapshot).not.toBeNull();
    expect(row.status).toBe('sending');
  });

  it('24 hours after the first attempt the run is unknown without another send; one second before it is retried', async () => {
    const early = await frozenRun();
    early.db.now = 1000 + DAY - 1;
    expect(await run(early.db, early.transport)).toMatchObject({ sent: 1 });

    const late = await frozenRun();
    late.db.now = 1000 + DAY;
    expect(await run(late.db, late.transport)).toMatchObject({ unknown: 1, sent: 0 });
    expect(late.transport).toHaveBeenCalledTimes(1);
    expect(digestRun(late.db)).toMatchObject({ status: 'unknown', last_error_code: 'ambiguous_timeout', send_snapshot: null });
    expect(late.row.status).toBe('unknown');
  });

  it('a retry that reaches 24 hours during the checks starts no attempt and is closed as unknown', async () => {
    const { db, transport } = await frozenRun();
    db.afterRpc = (name) => { if (name === 'renew_notification_digest_run') digestRun(db).first_attempt_at -= DAY; };

    expect(await run(db, transport)).toMatchObject({ unknown: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db).status).toBe('unknown');
  });
});

describe('C4/D4 — what the provider answered', () => {
  it('409 before 24 hours: failed on the first response, the key never changed', async () => {
    const db = createDb();
    const row = course(db);
    const transport = answering(409);

    expect(await run(db, transport)).toMatchObject({ failed: 1, retried: 0 });
    db.now += DAY;
    expect(await run(db, transport)).toMatchObject({ claimed: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'failed', last_error_code: 'provider_conflict', send_snapshot: null });
    expect(row).toMatchObject({ status: 'failed', last_error_code: 'provider_conflict' });
  });

  it('a definite rejection is failed, without the provider text', async () => {
    const db = createDb();
    course(db);

    expect(await run(db, answering(422))).toMatchObject({ failed: 1 });
    expect(digestRun(db)).toMatchObject({ status: 'failed', last_error_code: 'provider_rejected' });
  });

  it.each([
    ['429', answering(429)],
    ['503', answering(503)],
    ['a call that threw', vi.fn(async () => { throw new Error(`socket naming ${ADDRESS}`); })],
  ])('%s is ambiguous: kept frozen with a jittered backoff, never sent, and the call stops sending', async (_name, transport) => {
    const db = createDb();
    const other = uuid(2);
    db.tables.profiles.push({ id: other, email: 'otra@ejemplo.invalid', school_id: null });
    db.tables.user_roles.push({ user_id: other, role_type: 'docente', school_id: SCHOOL, generation_id: null, community_id: null, is_active: true });
    db.tables.course_enrollments.push({ user_id: other, course_id: COURSE_ID, access_origin: 'independent' });
    course(db);
    course(db, { user_id: other });

    expect(await run(db, transport, () => 1)).toMatchObject({ claimed: 2, retried: 1, deferred: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: 'transport_error', next_attempt_at: db.now + 120 });
    expect(digestRun(db, other)).toMatchObject({ status: 'pending', send_snapshot: null, last_error_code: 'provider_backoff' });
  });
});

describe('C4 — stale owners, failed settlement and exceptions', () => {
  it('an owner whose lease ran out can neither cancel, freeze nor send', async () => {
    const db = createDb();
    const row = course(db, { event_type: 'meeting_finalized' });
    course(db);
    db.afterRpc = (name) => { if (name === 'claim_notification_digest_runs') db.now += 301; };
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, membersCancelled: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(row.status).toBe('pending');
    expect(digestRun(db)).toMatchObject({ status: 'pending', send_snapshot: null });
  });

  it('a lease lost after the freeze: nothing is sent or recorded; the next owner sends the frozen bytes once under the same key', async () => {
    const db = createDb();
    course(db);
    db.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') db.now += 301; };
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    const stored = digestRun(db).send_snapshot;
    expect(digestRun(db)).toMatchObject({ status: 'sending', attempt_count: 1 });
    db.afterRpc = () => undefined;
    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toEqual({ ...openSnapshot(SNAPSHOT_KEY, stored), from: 'Genera <notificaciones@nuevaeducacion.org>' });
    expect(transport.mock.calls[0][1]).toEqual({ idempotencyKey: providerKey(U, LOCAL_DATE) });
  });

  it('a settlement the database refused or failed is never counted as sent', async () => {
    const db = createDb();
    course(db);
    db.failing.add('finish_notification_digest_run');
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, sent: 0, lost: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'sending' });
  });

  it.each(['notification_digest_run_members', 'begin_notification_digest_attempt', 'finish_notification_digest_run'])(
    'a call that throws (%s) is contained: the run is lost to its lease, the call goes on and names nothing',
    async (name) => {
      const db = createDb();
      course(db);
      db.throwing.add(name);

      const result = await run(db, accepted());
      expect(result).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
      expect(digestRun(db).lease_token).not.toBeNull();
    }
  );

  it('the tenant check is asked on every attempt', async () => {
    const db = createDb();
    course(db);
    const transport = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'busy', statusCode: 503 } })
      .mockResolvedValueOnce({ data: { id: 'provider-message-2' }, error: null });
    await run(db, transport);
    db.now += 3600;
    await run(db, transport);

    expect(authorizeUserEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deliverOutboundEmail).mock.calls.map(([params]) => params.idempotencyKey)).toEqual([providerKey(U, LOCAL_DATE), providerKey(U, LOCAL_DATE)]);
  });
});

describe('R3 — the live owner right before the provider, and the current mailbox on a retry', () => {
  /** A run frozen by an attempt the provider answered ambiguously, an hour later. */
  async function frozenRun() {
    const db = createDb();
    const row = course(db);
    const transport = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'busy', statusCode: 503 } })
      .mockResolvedValue({ data: { id: 'provider-message-2' }, error: null });
    await run(db, transport);
    db.now += 3600;
    return { db, row, transport, stored: digestRun(db).send_snapshot as string };
  }
  /** After the next begin returns: its answer arrives once the lease ran out, and another worker claims the run. */
  function delayedBeginWithCompetitor(db: Db) {
    let competitor: string | null = null;
    db.afterRpc = (name) => {
      if (name !== 'begin_notification_digest_attempt' || competitor) return;
      db.now += 301;
      void db.client.rpc('claim_notification_digest_runs', { p_limit: 10, p_lease_seconds: 300 });
      competitor = digestRun(db).lease_token;
    };
    return () => competitor;
  }

  it('first attempt: a begin answered after the lease ran out, with another owner holding the run, never reaches the provider', async () => {
    const db = createDb();
    course(db);
    const competitor = delayedBeginWithCompetitor(db);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(deliverOutboundEmail).not.toHaveBeenCalled();
    expect(competitor()).not.toBeNull();
    expect(digestRun(db)).toMatchObject({ status: 'sending', lease_token: competitor(), attempt_count: 1 });
  });

  it('frozen retry: a begin answered after the lease ran out, with another owner holding the run, makes no stale provider call', async () => {
    const { db, transport, stored } = await frozenRun();
    const competitor = delayedBeginWithCompetitor(db);

    expect(await run(db, transport)).toMatchObject({ claimed: 1, lost: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'sending', lease_token: competitor(), send_snapshot: stored });

    // The competitor's lease runs out unused: the next owner sends the same bytes under the same key.
    db.afterRpc = () => undefined;
    db.now += 301;
    expect(await run(db, transport)).toMatchObject({ sent: 1 });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
  });

  it.each([
    ['the state read fails', 'notification_digest_run_state', 'state_unavailable'],
    ['the renewal fails', 'renew_notification_digest_run', 'lease_unavailable'],
  ])('after begin, %s: no send, the snapshot is kept and the run waits (first attempt and retry)', async (_name, failing, code) => {
    const fresh = createDb();
    course(fresh);
    fresh.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') fresh.failing.add(failing); };
    const transport = accepted();
    expect(await run(fresh, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(digestRun(fresh)).toMatchObject({ status: 'sending', last_error_code: code });
    expect(digestRun(fresh).send_snapshot).not.toBeNull();

    const frozen = await frozenRun();
    frozen.db.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') frozen.db.failing.add(failing); };
    expect(await run(frozen.db, frozen.transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(frozen.transport).toHaveBeenCalledTimes(1);
    expect(digestRun(frozen.db)).toMatchObject({ status: 'sending', last_error_code: code, send_snapshot: frozen.stored });
  });

  it('24 hours reached between begin and the provider call: unknown, no send', async () => {
    const { db, transport } = await frozenRun();
    db.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') digestRun(db).first_attempt_at -= DAY; };

    expect(await run(db, transport)).toMatchObject({ unknown: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'unknown', last_error_code: 'ambiguous_timeout', send_snapshot: null });
  });

  it('the address suppressed between begin and the provider call: cancelled_after_ambiguous, no send (first attempt and retry)', async () => {
    const suppress = (db: Db) => {
      db.afterRpc = (name) => {
        if (name === 'begin_notification_digest_attempt') db.tables.suppressions.push({ address_digest: notificationAddressDigest(ADDRESS) });
      };
    };
    const fresh = createDb();
    const row = course(fresh);
    suppress(fresh);
    const transport = accepted();
    expect(await run(fresh, transport)).toMatchObject({ cancelled: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(digestRun(fresh)).toMatchObject({ status: 'cancelled_after_ambiguous', last_error_code: 'address_suppressed', send_snapshot: null });
    expect(row.status).toBe('cancelled_after_ambiguous');

    const frozen = await frozenRun();
    suppress(frozen.db);
    expect(await run(frozen.db, frozen.transport)).toMatchObject({ cancelled: 1, sent: 0 });
    expect(frozen.transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['removed (null)', null, 'missing_recipient'],
    ['emptied', '   ', 'missing_recipient'],
    ['changed', 'nueva.direccion@ejemplo.invalid', 'recipient_changed'],
  ])('mailbox %s after an ambiguous send: the whole run ends cancelled_after_ambiguous, no retry to the frozen address', async (_name, email, code) => {
    const { db, row, transport } = await frozenRun();
    db.tables.profiles[0].email = email;

    expect(await run(db, transport)).toMatchObject({ claimed: 1, cancelled: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'cancelled_after_ambiguous', last_error_code: code, send_snapshot: null, lease_token: null });
    expect(row.status).toBe('cancelled_after_ambiguous');
  });

  it('the same mailbox spelled differently (case, spaces): the frozen bytes, headers and key go out unchanged', async () => {
    const { db, transport, stored } = await frozenRun();
    db.tables.profiles[0].email = `  ${ADDRESS.toUpperCase()} `;

    expect(await run(db, transport)).toMatchObject({ sent: 1 });
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    const message = openSnapshot(SNAPSHOT_KEY, stored)!;
    expect(transport.mock.calls[1][0]).toMatchObject({ to: ADDRESS, headers: message.headers });
    expect(transport.mock.calls[1][1]).toEqual({ idempotencyKey: providerKey(U, LOCAL_DATE) });
  });

  it.each([
    ['unreadable', (db: Db) => db.failing.add('profiles')],
    ['malformed', (db: Db) => (db.tables.profiles[0].email = 42)],
    ['missing its email field', (db: Db) => delete db.tables.profiles[0].email],
  ])('the current mailbox %s on a retry: no send, the snapshot is kept, the run waits', async (_name, spoil) => {
    const { db, row, transport, stored } = await frozenRun();
    db.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') spoil(db); };

    expect(await run(db, transport)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: 'recipient_lookup_failed', send_snapshot: stored });
    expect(row.status).toBe('sending');
  });
});

describe('R4 — the provider Retry-After on the real keyed fetch path', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const reply = (status: number, headers: Record<string, string> = {}, body: Row = { message: `texto naming ${ADDRESS}` }) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }));
  /** The p_retry_seconds of every retry `finish_notification_digest_run` call. */
  const retrySeconds = (rpc: ReturnType<typeof vi.spyOn>) =>
    rpc.mock.calls.filter(([name, args]: any) => name === 'finish_notification_digest_run' && args.p_outcome === 'retry').map(([, args]: any) => args.p_retry_seconds);

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_synthetic_key');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('429 with Retry-After 1800: the run waits 1800 s, then the same bytes go out under the same key', async () => {
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    reply(429, { 'Retry-After': '1800' });

    expect(await run(db, undefined)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(retrySeconds(rpc)).toEqual([1800]);
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: 'transport_error', next_attempt_at: db.now + 1800 });

    db.now += 1799;
    expect(await run(db, undefined)).toMatchObject({ claimed: 0 });
    db.now += 1;
    reply(200, {}, { id: 'provider-message-9' });
    expect(await run(db, undefined)).toMatchObject({ claimed: 1, sent: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map(([, init]) => init);
    expect(second.body).toBe(first.body);
    expect(second.headers['Idempotency-Key']).toBe(providerKey(U, LOCAL_DATE));
    expect(first.headers['Idempotency-Key']).toBe(providerKey(U, LOCAL_DATE));
    expect(JSON.parse(first.body).headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(digestRun(db)).toMatchObject({ status: 'sent', provider_message_id: 'provider-message-9' });
  });

  it('503 with an HTTP-date ten minutes ahead: 600 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-08T12:00:00Z'));
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    reply(503, { 'Retry-After': 'Thu, 08 Oct 2026 12:10:00 GMT' });

    expect(await run(db, undefined)).toMatchObject({ retried: 1 });
    expect(retrySeconds(rpc)).toEqual([600]);
  });

  it.each([
    ['a wait shorter than the backoff', '10', 90],
    ['no Retry-After', null, 90],
    ['a malformed one', 'mañana', 90],
    ['a negative one', '-600', 90],
  ])('%s: the jittered backoff decides', async (_name, value, seconds) => {
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    reply(503, value === null ? {} : { 'Retry-After': value });

    expect(await run(db, undefined)).toMatchObject({ retried: 1 });
    expect(retrySeconds(rpc)).toEqual([seconds]);
  });

  it.each([
    ['30 Feb, which Date.parse rolls into March', 'Mon, 30 Feb 2026 12:00:00 GMT'],
    ['29 Feb of a common year', 'Sun, 29 Feb 2026 12:00:00 GMT'],
    ['hour 24, which Date.parse rolls into 1 Mar', 'Sun, 28 Feb 2026 24:00:00 GMT'],
  ])('an impossible date (%s) is no floor: the 90 s backoff, then the same bytes under the same key, sent once', async (_name, value) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-02-28T12:00:00Z'));
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    reply(503, { 'Retry-After': value });

    expect(await run(db, undefined)).toMatchObject({ claimed: 1, retried: 1, sent: 0 });
    expect(retrySeconds(rpc)).toEqual([90]);
    expect(digestRun(db)).toMatchObject({ status: 'sending', last_error_code: 'transport_error', next_attempt_at: db.now + 90 });
    const snapshot = digestRun(db).send_snapshot;
    expect(snapshot).not.toBeNull();

    db.now += 89;
    expect(await run(db, undefined)).toMatchObject({ claimed: 0, sent: 0 });
    expect(digestRun(db).send_snapshot).toEqual(snapshot);
    db.now += 1;
    reply(200, {}, { id: 'provider-message-10' });
    expect(await run(db, undefined)).toMatchObject({ claimed: 1, sent: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map(([, init]) => init);
    expect(second.body).toBe(first.body);
    expect([first.headers['Idempotency-Key'], second.headers['Idempotency-Key']]).toEqual([providerKey(U, LOCAL_DATE), providerKey(U, LOCAL_DATE)]);
    expect(retrySeconds(rpc)).toEqual([90]);
    expect(digestRun(db)).toMatchObject({ status: 'sent', provider_message_id: 'provider-message-10' });
  });

  it('a wait beyond a day is clamped to a day, which the 24-hour window then ends as unknown without a second send', async () => {
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    reply(429, { 'Retry-After': '200000' });

    expect(await run(db, undefined)).toMatchObject({ retried: 1 });
    expect(retrySeconds(rpc)).toEqual([DAY]);
    db.now += DAY;
    expect(await run(db, undefined)).toMatchObject({ claimed: 1, unknown: 1, sent: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(digestRun(db)).toMatchObject({ status: 'unknown', last_error_code: 'ambiguous_timeout', send_snapshot: null });
  });

  it('a 409 with Retry-After stays a definite conflict: failed, no wait, no new key', async () => {
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    reply(409, { 'Retry-After': '1800' });

    expect(await run(db, undefined)).toMatchObject({ failed: 1, retried: 0 });
    expect(retrySeconds(rpc)).toEqual([]);
    expect(digestRun(db)).toMatchObject({ status: 'failed', last_error_code: 'provider_conflict', provider_key: providerKey(U, LOCAL_DATE) });
  });

  it('an injected transport goes through the same boundary as the fetch path', async () => {
    const db = createDb();
    course(db);
    const rpc = vi.spyOn(db.client, 'rpc');
    const transport = vi.fn(async () => ({ data: null, error: { message: 'busy', statusCode: 429, retryAfter: '1200' } }));

    expect(await run(db, transport)).toMatchObject({ retried: 1 });
    expect(retrySeconds(rpc)).toEqual([1200]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('R4 — the controlled mirror records the guarded attempt with its frozen headers', () => {
  let dir: string;
  let outbox: string;
  const captured = (): Row[] => (existsSync(outbox) ? readFileSync(outbox, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'digest-outbox-'));
    outbox = join(dir, 'outbox.jsonl');
    vi.stubEnv('E2E_MAIL_OUTBOX', outbox);
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('first attempt: one line, the exact message sent, with the RFC 8058 headers and a body link per category', async () => {
    const db = createDb({ user_notification_category_prefs: [SYSTEM_DIGEST] });
    course(db);
    queue(db, 'system_update', null, { notification_id: null, payload: { title: 'Versión 2' } });
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ sent: 1 });
    const lines = captured();
    expect(lines).toHaveLength(1);
    const [sent] = transport.mock.calls[0];
    expect(lines[0]).toEqual({ to: sent.to, subject: sent.subject, html: sent.html, headers: sent.headers });
    expect(Object.keys(lines[0].headers).sort()).toEqual(['List-Unsubscribe', 'List-Unsubscribe-Post']);
    expect(lines[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const header = /^<https:\/\/genera\.test\/api\/notifications\/unsubscribe\?t=(.+)>$/.exec(lines[0].headers['List-Unsubscribe']);
    expect(verifyUnsubscribeToken(header?.[1])).toEqual({
      ok: true, kind: 'digest', userId: U, scopes: [{ category: 'courses', prefVersion: 2 }, { category: 'system', prefVersion: 5 }],
    });
    const bodyTokens = [...lines[0].html.matchAll(/notificaciones\/baja\?t=([^"]+)"/g)].map((m: RegExpMatchArray) => verifyUnsubscribeToken(m[1]));
    expect(bodyTokens).toEqual([
      { ok: true, kind: 'category', userId: U, scopes: [{ category: 'courses', prefVersion: 2 }] },
      { ok: true, kind: 'category', userId: U, scopes: [{ category: 'system', prefVersion: 5 }] },
    ]);
    expect(lines[0].html).toContain(`${BASE_URL}/configuracion/notificaciones`);
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain(ADDRESS);
  });

  it('a frozen retry mirrors the same stored bytes and headers again, and only the provider answer differs', async () => {
    const db = createDb();
    course(db);
    const transport = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'busy', statusCode: 503 } })
      .mockResolvedValueOnce({ data: { id: 'provider-message-2' }, error: null });

    await run(db, transport);
    const stored = openSnapshot(SNAPSHOT_KEY, digestRun(db).send_snapshot)!;
    db.tables.profiles[0].email = ` ${ADDRESS.toUpperCase()}`;
    db.now += 3600;
    expect(await run(db, transport)).toMatchObject({ sent: 1 });

    const lines = captured();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual(lines[0]);
    expect(lines[0]).toEqual({ to: ADDRESS, subject: stored.subject, html: stored.html, headers: stored.headers });
  });

  it('a definite refusal was still an attempt: mirrored once, and the run is failed (the mirror is no acceptance)', async () => {
    const db = createDb();
    course(db);

    expect(await run(db, answering(409))).toMatchObject({ failed: 1, sent: 0 });
    expect(captured()).toHaveLength(1);
  });

  it('a stale owner after begin is never mirrored and never sent', async () => {
    const db = createDb();
    course(db);
    db.afterRpc = (name) => { if (name === 'begin_notification_digest_attempt') db.now += 301; };
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ lost: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(captured()).toEqual([]);
  });

  it.each([
    ['a suppressed address', (db: Db) => db.tables.suppressions.push({ address_digest: notificationAddressDigest(ADDRESS) })],
    ['a QA tenant recipient', (db: Db) => {
      db.tables.user_roles[0].school_id = QA_SCHOOL;
      db.tables.schools.push({ id: QA_SCHOOL, tenant_kind: 'qa', internal_zoom_testing_enabled: false });
    }],
    ['every notice switched off', (db: Db) => db.tables.user_notification_category_prefs = [{ user_id: U, category: 'courses', email_mode: 'off', pref_version: 3 }]],
    ['access revoked', (db: Db) => (db.tables.course_enrollments = [])],
  ])('blocked before the freeze (%s): nothing rendered is mirrored', async (_name, arrange) => {
    const db = createDb();
    course(db);
    arrange(db);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ cancelled: 1, sent: 0 });
    expect(transport).not.toHaveBeenCalled();
    expect(captured()).toEqual([]);
  });

  it('blocked on a retry (mailbox changed): the earlier attempt stays the only line', async () => {
    const db = createDb();
    course(db);
    const transport = answering(503);
    await run(db, transport);
    db.tables.profiles[0].email = 'otra.sintetica@ejemplo.invalid';
    db.now += 3600;

    expect(await run(db, transport)).toMatchObject({ cancelled: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(captured()).toHaveLength(1);
    expect(captured()[0].to).toBe(ADDRESS);
  });

  it('on a Vercel deployment nothing is mirrored and the send goes ahead as before', async () => {
    vi.stubEnv('VERCEL', '1');
    const db = createDb();
    course(db);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ sent: 1 });
    expect(captured()).toEqual([]);
  });

  it('an unwritable mirror never stops the send', async () => {
    vi.stubEnv('E2E_MAIL_OUTBOX', join(dir, 'no', 'such', 'dir', 'outbox.jsonl'));
    const db = createDb();
    course(db);
    const transport = accepted();

    expect(await run(db, transport)).toMatchObject({ sent: 1 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain(ADDRESS);
  });
});
