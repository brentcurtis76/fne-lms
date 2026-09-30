import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import { Webhook } from 'svix';
import { notificationAddressDigest, runNotificationEmailWorker } from '../../lib/email/notification-worker';

/**
 * N3-06 — a bounced notification email, on a local stack.
 *
 * Three synthetic users (*@qa.local.test, docente, no school) get outbox rows
 * written with the service role. The real worker runs in this process against
 * that database with a capturing transport, so nothing reaches a provider and
 * the app server's own outbox flag stays off; what it "sends" is the synthetic
 * mail capture. A bounce is a Svix-signed POST to the app's real
 * `/api/webhooks/resend`, signed with the `RESEND_WEBHOOK_SECRET` the app
 * server runs with. One recipient is signed in through the real login page
 * throughout: the app stays usable across reloads at both viewports.
 *
 * A forged or altered bounce changes nothing. A signed one suppresses the
 * address of the row that carries its provider id, never the address the event
 * names, and later mail to it is cancelled while the other address keeps
 * getting its own. Every fixture is deleted by exact id in afterAll, and the
 * manifest is written next to the screenshots.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DB_URL = process.env.SUPABASE_DB_URL ?? '';
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? '';
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `N17-${randomBytes(12).toString('base64url')}!a1`;
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const users = {
  bounced: { id: '', email: `notif17-${RUN}-rebota@qa.local.test` },
  other: { id: '', email: `notif17-${RUN}-entrega@qa.local.test` },
  /** Its bounce arrives before the worker commits the provider id. */
  late: { id: '', email: `notif17-${RUN}-tardia@qa.local.test` },
};
type User = (typeof users)[keyof typeof users];
/** Outbox fixture ids by tag. */
const rows: Record<string, string> = {};
/** Every provider id a webhook was posted for: both outboxes keep evidence under it. */
const postedIds = new Set<string>();
const captured: Array<{ run: number; to: string; subject: string; providerMessageId: string; idempotencyKey?: string }> = [];
const evidence: Record<string, unknown> = { run: RUN, supabaseUrl: SUPABASE_URL };
let service: SupabaseClient;
let workerRuns = 0;
let events = 0;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function evidenceDir(): string {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(evidenceDir(), `${name}.png`), fullPage: false });
}

/** The digest a suppression of this address is stored under, as the worker computes it. */
function digest(address: string): string {
  const value = notificationAddressDigest(address);
  if (!value) throw new Error('no digest: NOTIFICATION_SUPPRESSION_SECRET is required');
  return value;
}

/** One due immediate email for a user: a system update, which this spec switches on for each of them. */
async function queue(tag: string, user: User) {
  const row = must('outbox', await service.from('notification_email_outbox').insert({
    idempotency_key: `notif17-${RUN}-${tag}`, event_type: 'system_update', occurrence_id: `n17:${RUN}:${tag}`, user_id: user.id,
    category: 'system', email_mode: 'immediate', email_reason: 'category_mode', related_url: '/dashboard',
    payload: { title: 'Actualización sintética', version: '17.0' },
  }).select('id').single()) as { id: string };
  rows[tag] = row.id;
}

/** One run of the real worker. `providerIds` fixes the id the provider answers for an address. */
async function runWorker(providerIds: Record<string, string> = {}) {
  const run = ++workerRuns;
  const sent: string[] = [];
  const result = await runNotificationEmailWorker(service, {
    transport: async (message, options) => {
      const entry = {
        run, to: message.to, subject: message.subject,
        providerMessageId: providerIds[message.to] ?? `notif17-${RUN}-msg-${captured.length + 1}`,
        idempotencyKey: options?.idempotencyKey,
      };
      captured.push(entry);
      appendFileSync(join(evidenceDir(), 'mail-capture.jsonl'), `${JSON.stringify(entry)}\n`);
      sent.push(message.to);
      return { data: { id: entry.providerMessageId }, error: null };
    },
  });
  return { result, sent: sent.sort() };
}

async function outboxRow(tag: string): Promise<{ status: string; last_error_code: string | null; provider_message_id: string | null }> {
  return must('outbox row', await service.from('notification_email_outbox')
    .select('status, last_error_code, provider_message_id').eq('id', rows[tag]).single());
}

async function suppressed(): Promise<string[]> {
  const found = must('suppressions', await service.from('notification_email_suppressions').select('address_digest').order('address_digest')) as Array<{ address_digest: string }>;
  return found.map((row) => row.address_digest);
}

/** Everything a webhook could change, as one comparable value. */
async function state(): Promise<string> {
  return JSON.stringify({
    suppressions: must('suppressions', await service.from('notification_email_suppressions').select('*').order('address_digest')),
    events: must('events', await service.from('notification_email_bounce_events').select('*').order('provider_message_id')),
    addresses: must('addresses', await service.from('notification_email_outbox_address').select('*').in('outbox_id', Object.values(rows)).order('outbox_id')),
    outbox: must('outbox', await service.from('notification_email_outbox').select('id, status, last_error_code, provider_message_id').in('id', Object.values(rows)).order('id')),
  });
}

/** A bounce as the provider sends it. It names a recipient, which the app must never act on. */
const bounceOf = (providerMessageId: string, to: string) => ({
  type: 'email.bounced',
  created_at: new Date().toISOString(),
  data: { email_id: providerMessageId, to: [to], subject: 'Asunto sintético', bounce: { type: 'Permanent', message: 'mailbox unknown' } },
});

/** A webhook POST to the app, signed with `secret`; `alter` changes the body after it was signed. */
async function postEvent(request: APIRequestContext, event: { data: { email_id: string } }, secret = WEBHOOK_SECRET, alter?: (body: string) => string) {
  const payload = JSON.stringify(event);
  const id = `msg_notif17_${RUN}_${++events}`;
  const timestamp = new Date();
  postedIds.add(event.data.email_id);
  return request.post('/api/webhooks/resend', {
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': new Webhook(secret).sign(id, timestamp, payload),
    },
    data: Buffer.from(alter ? alter(payload) : payload, 'utf8'),
  });
}

async function signedIn(browser: Browser, viewport: typeof DESKTOP, user: User) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(user.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page, problems };
}

/** The signed-in recipient still has a working app: the loaded dashboard, no sideways scroll, the notification bell. */
async function expectUsable(page: Page, mobile: boolean, screenshot: string) {
  await expect(page).toHaveURL(/\/dashboard(\?|$)/);
  await expect(page.getByText('¡Hola, Persona!')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, screenshot);
  if (mobile) await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  await expect(page.getByRole('button', { name: /^Notificaciones/ })).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('notification bounce suppression (N3-06)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) throw new Error('Supabase URL, service key and SUPABASE_DB_URL are required');
    if (!WEBHOOK_SECRET) throw new Error('RESEND_WEBHOOK_SECRET is required, the same value the app server runs with');
    if (process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY must be unset: no real provider');
    for (const url of [SUPABASE_URL, DB_URL]) {
      if (!LOCAL_HOSTS.includes(new URL(url).hostname.replace(/^\[|\]$/g, ''))) throw new Error('notification-bounce refuses a non-local database');
    }
    // The worker runs in this process only, under its own synthetic keys.
    process.env.NOTIFICATION_OUTBOX_DELIVERY = 'on';
    for (const name of ['NOTIFICATION_SNAPSHOT_SECRET', 'NOTIFICATION_SUPPRESSION_SECRET', 'NOTIFICATION_UNSUBSCRIBE_SECRET']) {
      process.env[name] = randomBytes(24).toString('hex');
    }
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved' },
        { onConflict: 'id' }
      ));
      must('role', await service.from('user_roles').insert({ user_id: user.id, role_type: 'docente', is_active: true }));
      // System updates are off by default: each user asks for them by email.
      must('prefs', await service.from('user_notification_category_prefs').insert({ user_id: user.id, category: 'system', email_mode: 'immediate' }));
    }
    evidence.users = Object.fromEntries(Object.entries(users).map(([name, user]) => [name, user.id]));
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const userIds = Object.values(users).map((user) => user.id).filter(Boolean);
    const outboxIds = Object.values(rows);
    const providerIds = [...postedIds];
    if (service && userIds.length) {
      const digests = Object.values(users).map((user) => digest(user.email));
      // The address rows go with their outbox rows (FK cascade).
      cleanup.notification_email_outbox = count(await service.from('notification_email_outbox').delete({ count: 'exact' }).in('id', outboxIds));
      cleanup.notification_email_suppressions = count(await service.from('notification_email_suppressions').delete({ count: 'exact' }).in('address_digest', digests));
      cleanup.notification_email_bounce_events = count(await service.from('notification_email_bounce_events').delete({ count: 'exact' }).in('provider_message_id', providerIds));
      // The webhook offers every event to the recovery outbox too, which keeps its own evidence; closed to the API.
      const pg = new PgClient({ connectionString: DB_URL });
      try {
        await pg.connect();
        const evidenceTable = 'auth_security.password_recovery_delivery_events';
        cleanup[evidenceTable] = (await pg.query(`DELETE FROM ${evidenceTable} WHERE provider_message_id = ANY($1)`, [providerIds])).rowCount ?? -1;
        remaining[evidenceTable] = Number((await pg.query(`SELECT count(*) FROM ${evidenceTable} WHERE provider_message_id = ANY($1)`, [providerIds])).rows[0].count);
      } catch (error) {
        cleanup['auth_security.password_recovery_delivery_events'] = error instanceof Error ? error.message : String(error);
      } finally {
        await pg.end().catch(() => undefined);
      }
      cleanup.user_notification_category_prefs = count(await service.from('user_notification_category_prefs').delete({ count: 'exact' }).in('user_id', userIds));
      cleanup.user_roles = count(await service.from('user_roles').delete({ count: 'exact' }).in('user_id', userIds));
      cleanup.profiles = count(await service.from('profiles').delete({ count: 'exact' }).in('id', userIds));
      cleanup.auth_users = 0;
      for (const id of userIds) {
        const deleted = await service.auth.admin.deleteUser(id);
        if (deleted.error) cleanup.auth_users = deleted.error.message;
        else if (typeof cleanup.auth_users === 'number') cleanup.auth_users += 1;
      }
      const left: Array<[string, string, string[]]> = [
        ['notification_email_outbox', 'id', outboxIds],
        ['notification_email_outbox_address', 'outbox_id', outboxIds],
        ['notification_email_suppressions', 'address_digest', digests],
        ['notification_email_bounce_events', 'provider_message_id', providerIds],
        ['user_notification_category_prefs', 'user_id', userIds],
        ['user_roles', 'user_id', userIds],
        ['profiles', 'id', userIds],
      ];
      for (const [table, column, ids] of left) {
        remaining[table] = count(await service.from(table).select('*', { count: 'exact', head: true }).in(column, ids));
      }
      evidence.addressDigests = digests;
    }
    evidence.outboxRows = rows;
    evidence.providerMessageIds = providerIds;
    evidence.captured = captured;
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    writeFileSync(join(evidenceDir(), 'notification-bounce-fixtures.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  });

  test('desktop: a forged bounce changes nothing; a signed one stops mail to that address and to no other', async ({ browser, request }) => {
    const both = [users.bounced.email, users.other.email].sort();
    const { context, page, problems } = await signedIn(browser, DESKTOP, users.bounced);
    await expectUsable(page, false, 'desktop-1-signed-in');

    // First emails: both addresses get theirs.
    await queue('bounced-1', users.bounced);
    await queue('other-1', users.other);
    const first = await runWorker();
    expect(first.result).toMatchObject({ enabled: true, status: 'ok', claimed: 2, sent: 2 });
    expect(first.sent).toEqual(both);
    const providerId = (await outboxRow('bounced-1')).provider_message_id as string;
    expect(providerId).toBe(captured.find((entry) => entry.to === users.bounced.email)?.providerMessageId);

    // A bounce signed with another secret, and a signed event altered on the way: refused, nothing changes.
    const untouched = await state();
    const forged = await postEvent(request, bounceOf(providerId, users.bounced.email), `whsec_${randomBytes(24).toString('base64')}`);
    expect(forged.status()).toBe(401);
    const altered = await postEvent(
      request, { type: 'email.delivered', data: { email_id: providerId } }, WEBHOOK_SECRET, (body) => body.replace('email.delivered', 'email.bounced')
    );
    expect(altered.status()).toBe(401);
    expect(JSON.stringify([await forged.json(), await altered.json()])).not.toContain('qa.local.test');
    expect(await state()).toBe(untouched);
    expect(await suppressed()).toEqual([]);
    await page.reload();
    await expectUsable(page, false, 'desktop-2-after-forged-bounce');
    // The address still gets its mail.
    await queue('bounced-2', users.bounced);
    await queue('other-2', users.other);
    expect((await runWorker()).sent).toEqual(both);

    // The provider's signed bounce of the first email. The event names the other recipient: that is never read.
    const signed = await postEvent(request, bounceOf(providerId, users.other.email));
    expect(signed.status()).toBe(200);
    expect(await signed.json()).toEqual({ ok: true });
    expect(await suppressed()).toEqual([digest(users.bounced.email)]);

    // A duplicate and a later delivered event change nothing; an id no row carries suppresses nothing.
    const afterBounce = await state();
    expect((await postEvent(request, bounceOf(providerId, users.bounced.email))).status()).toBe(200);
    expect((await postEvent(request, { type: 'email.delivered', data: { email_id: providerId } })).status()).toBe(200);
    expect(await state()).toBe(afterBounce);
    expect((await postEvent(request, bounceOf(`notif17-${RUN}-unknown`, users.other.email))).status()).toBe(200);
    expect(await suppressed()).toEqual([digest(users.bounced.email)]);

    // The next attempt: the bounced address gets nothing, the other one gets its email.
    await queue('bounced-3', users.bounced);
    await queue('other-3', users.other);
    const third = await runWorker();
    expect(third.result).toMatchObject({ claimed: 2, sent: 1, cancelled: 1 });
    expect(third.sent).toEqual([users.other.email]);
    expect(await outboxRow('bounced-3')).toMatchObject({ status: 'cancelled', last_error_code: 'address_suppressed', provider_message_id: null });
    expect((await outboxRow('other-3')).status).toBe('sent');

    // Nothing stored names an address.
    expect(await state()).not.toMatch(/qa\.local\.test|@/);
    await page.reload();
    await expectUsable(page, false, 'desktop-3-after-bounce');
    expect(problems).toEqual([]);
    await context.close();
  });

  test('mobile: the suppression holds; a bounce that outran the provider id is applied when the id commits', async ({ browser, request }) => {
    const { context, page, problems } = await signedIn(browser, MOBILE, users.bounced);
    await expectUsable(page, true, 'mobile-1-signed-in');

    await queue('bounced-4', users.bounced);
    await queue('other-4', users.other);
    expect((await runWorker()).sent).toEqual([users.other.email]);
    expect(await outboxRow('bounced-4')).toMatchObject({ status: 'cancelled', last_error_code: 'address_suppressed' });

    // The bounce of a message whose provider id the worker has not committed yet: kept, nothing suppressed.
    const lateId = `notif17-${RUN}-late`;
    expect((await postEvent(request, bounceOf(lateId, users.other.email))).status()).toBe(200);
    expect(await suppressed()).toEqual([digest(users.bounced.email)]);

    // That message goes out and its id commits: the waiting bounce suppresses its address in the same step.
    await queue('late-1', users.late);
    const delivery = await runWorker({ [users.late.email]: lateId });
    expect(delivery.sent).toEqual([users.late.email]);
    expect((await outboxRow('late-1'))).toMatchObject({ status: 'sent', provider_message_id: lateId });
    expect(await suppressed()).toEqual([digest(users.bounced.email), digest(users.late.email)].sort());

    await queue('late-2', users.late);
    await queue('other-5', users.other);
    const next = await runWorker();
    expect(next.result).toMatchObject({ claimed: 2, sent: 1, cancelled: 1 });
    expect(next.sent).toEqual([users.other.email]);

    // The whole capture: the bounced address got the two emails before its bounce and none after; the other got all five.
    expect(captured.filter((entry) => entry.to === users.bounced.email).map((entry) => entry.run)).toEqual([1, 2]);
    expect(captured.filter((entry) => entry.to === users.late.email)).toHaveLength(1);
    expect(captured.filter((entry) => entry.to === users.other.email)).toHaveLength(5);

    await page.reload();
    await expectUsable(page, true, 'mobile-2-after-reload');
    expect(problems).toEqual([]);
    await context.close();
  });
});
