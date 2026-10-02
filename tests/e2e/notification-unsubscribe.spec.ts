import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUnsubscribeToken, preferenceVersionForLink, unsubscribeHeaders } from '../../lib/email/notification-unsubscribe';

/**
 * N3-05 — the unsubscribe link of a notification email, as an anonymous visitor.
 *
 * Two synthetic users (*@qa.local.test, no school) and their outbox rows are
 * written with the service role on a local stack; the tokens are signed with
 * the same `NOTIFICATION_UNSUBSCRIBE_SECRET` the app server runs with, for the
 * version of the user's preference row, which the signer writes in `default`
 * when there is none. The browser has no session. Opening, reloading or previewing a link changes
 * nothing; the button (or a mailbox provider's one-click POST) switches that
 * user's category off and cancels only its pending optional mail. Nothing is
 * sent: the outbox worker stays off. Every fixture is deleted by id in afterAll.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const DAY = 86400_000;
const users = {
  a: { id: '', email: `notif16-${RUN}-a@qa.local.test` },
  b: { id: '', email: `notif16-${RUN}-b@qa.local.test` },
};
/** Outbox fixture ids by tag. */
const rows: Record<string, string> = {};
const consoleLines: Record<string, string[]> = {};
const evidence: Record<string, unknown> = { run: RUN, supabaseUrl: SUPABASE_URL, console: consoleLines };
let service: SupabaseClient;

function must<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function shot(page: Page, name: string) {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

/** A category token for a user, and the path of the link the email header would carry. */
function link(userId: string, category: string, prefVersion: number, now = Date.now()) {
  const token = createUnsubscribeToken('category', userId, [{ category: category as 'courses', prefVersion }], now);
  if (!token) throw new Error('no token: NOTIFICATION_UNSUBSCRIBE_SECRET is required');
  const header = new URL(unsubscribeHeaders(token)['List-Unsubscribe'].slice(1, -1));
  return { token, headerPath: `${header.pathname}${header.search}`, pagePath: `/notificaciones/baja?t=${token}` };
}

/** The version a link is signed with, as the worker gets it: a user with no row gets a `default` one first. */
async function signedVersion(userId: string, category: string): Promise<number> {
  const version = await preferenceVersionForLink(service, userId, category as 'courses');
  if (version === null) throw new Error('no version: NOTIFICATION_UNSUBSCRIBE_SECRET and a writable preference table are required');
  return version;
}

async function pref(userId: string, category: string): Promise<{ email_mode: string; pref_version: number } | null> {
  return must('pref', await service.from('user_notification_category_prefs').select('email_mode, pref_version')
    .eq('user_id', userId).eq('category', category).maybeSingle()) as { email_mode: string; pref_version: number } | null;
}

/** Every preference and outbox fixture of both users, as one comparable value. */
async function state(): Promise<string> {
  const ids = [users.a.id, users.b.id];
  const prefs = must('prefs', await service.from('user_notification_category_prefs')
    .select('user_id, category, email_mode, pref_version').in('user_id', ids).order('user_id').order('category'));
  const outbox = must('outbox', await service.from('notification_email_outbox')
    .select('id, status, last_error_code, completed_at, email_mode').in('user_id', ids).order('id'));
  return JSON.stringify({ prefs, outbox });
}

async function outboxStatus(): Promise<Record<string, string>> {
  const found = must('outbox', await service.from('notification_email_outbox').select('id, status, last_error_code')
    .in('id', Object.values(rows))) as Array<{ id: string; status: string; last_error_code: string | null }>;
  return Object.fromEntries(Object.entries(rows).map(([tag, id]) => {
    const row = found.find((r) => r.id === id);
    return [tag, row ? `${row.status}${row.last_error_code ? `/${row.last_error_code}` : ''}` : 'missing'];
  }));
}

/** An anonymous page that records every request it makes, every script error and every console error. */
async function anonymous(browser: import('@playwright/test').Browser, viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const requests: Array<{ url: string; referer: string }> = [];
  const problems: string[] = (consoleLines[test.info().title] = []);
  page.on('request', (request) => requests.push({ url: request.url(), referer: request.headers().referer ?? '' }));
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  return { context, page, requests, problems };
}

/** No script error, and no console error but the browser's own line for each refusal the test provokes. */
function expectQuietConsole(problems: string[], refusals: number[], token?: string) {
  const expected = refusals.map((status) => `the server responded with a status of ${status}`);
  expect(problems.filter((line) => !expected.some((text) => line.includes(text)))).toEqual([]);
  if (token) expect(problems.join('\n')).not.toContain(token);
}

/** The token left the browser only towards this app, and never as a referrer. */
function expectTokenKeptHome(requests: Array<{ url: string; referer: string }>, token: string, origin: string) {
  for (const request of requests) {
    if (request.url.includes(token)) expect(new URL(request.url).origin).toBe(origin);
    expect(request.referer).not.toContain(token);
  }
}

async function expectNoSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('notification unsubscribe link (N3-05)', () => {
  test.beforeAll(async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase URL and service key are required');
    if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(SUPABASE_URL).hostname)) {
      throw new Error('notification-unsubscribe refuses a non-local Supabase URL');
    }
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    for (const user of Object.values(users)) {
      const created = await service.auth.admin.createUser({
        email: user.email, password: `N16-${randomBytes(12).toString('base64url')}!a1`, email_confirm: true,
      });
      if (created.error) throw new Error(`createUser: ${created.error.message}`);
      user.id = created.data.user.id;
      must('profile', await service.from('profiles').upsert(
        { id: user.id, email: user.email, name: 'Persona Sintetica', first_name: 'Persona', last_name: 'Sintetica', must_change_password: false, approval_status: 'approved' },
        { onConflict: 'id' }
      ));
    }
    must('prefs', await service.from('user_notification_category_prefs').insert({ user_id: users.a.id, category: 'courses', email_mode: 'immediate' }));

    const outbox = (tag: string, user: string, category: string | null, extra: Record<string, unknown> = {}) => ({
      idempotency_key: `notif16-${RUN}-${tag}`, event_type: 'course_assigned', occurrence_id: `n16:${RUN}:${tag}`, user_id: user,
      category, email_mode: 'immediate', email_reason: category ? 'catalog_default' : 'unmapped_event', payload: {},
      next_attempt_at: new Date(Date.now() + 30 * DAY).toISOString(),
      // Every key on every row: a bulk insert sends NULL, not the default, for a key only some rows have.
      status: 'pending', lease_owner: null, lease_expires_at: null, completed_at: null, ...extra,
    });
    const inserted = must('outbox', await service.from('notification_email_outbox').insert([
      outbox('a-courses-immediate', users.a.id, 'courses'),
      outbox('a-courses-digest', users.a.id, 'courses', { email_mode: 'digest' }),
      outbox('a-courses-mandatory', users.a.id, 'courses', { email_reason: 'mandatory' }),
      outbox('a-courses-sending', users.a.id, 'courses', { status: 'sending', lease_owner: `notif16-${RUN}`, lease_expires_at: new Date(Date.now() + DAY).toISOString() }),
      outbox('a-courses-sent', users.a.id, 'courses', { status: 'sent', completed_at: new Date().toISOString() }),
      outbox('a-community', users.a.id, 'community'),
      outbox('a-sessions', users.a.id, 'sessions'),
      outbox('a-unmapped', users.a.id, null),
      outbox('b-courses', users.b.id, 'courses'),
      outbox('b-sessions', users.b.id, 'sessions'),
    ]).select('id, idempotency_key')) as Array<{ id: string; idempotency_key: string }>;
    for (const row of inserted) rows[row.idempotency_key.replace(`notif16-${RUN}-`, '')] = row.id;
    evidence.users = { a: users.a.id, b: users.b.id };
    evidence.outboxRows = rows;
  });

  test.afterAll(async () => {
    const cleanup: Record<string, number | string> = {};
    const remaining: Record<string, number | string> = {};
    const count = (r: { error: { message: string } | null; count: number | null }) => (r.error ? r.error.message : r.count ?? -1);
    const ids = Object.values(users).map((user) => user.id).filter(Boolean);
    if (service && ids.length) {
      cleanup.notification_email_outbox = count(await service.from('notification_email_outbox').delete({ count: 'exact' }).in('id', Object.values(rows)));
      cleanup.user_notification_category_prefs = count(await service.from('user_notification_category_prefs').delete({ count: 'exact' }).in('user_id', ids));
      cleanup.profiles = count(await service.from('profiles').delete({ count: 'exact' }).in('id', ids));
      cleanup.auth_users = 0;
      for (const id of ids) {
        const deleted = await service.auth.admin.deleteUser(id);
        if (deleted.error) cleanup.auth_users = deleted.error.message;
        else if (typeof cleanup.auth_users === 'number') cleanup.auth_users += 1;
      }
      for (const [table, column] of [['notification_email_outbox', 'user_id'], ['user_notification_category_prefs', 'user_id'], ['profiles', 'id']]) {
        remaining[table] = count(await service.from(table).select('*', { count: 'exact', head: true }).in(column, ids));
      }
    }
    evidence.cleanup = cleanup;
    evidence.remaining = remaining;
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'notification-unsubscribe-fixtures.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    }
  });

  test('desktop: opening, reloading and previewing change nothing; the keyboard confirms; a replay is harmless', async ({ browser, request, baseURL }) => {
    const before = await pref(users.a.id, 'courses');
    const { token, headerPath, pagePath } = link(users.a.id, 'courses', before!.pref_version);
    const untouched = await state();
    const { context, page, requests, problems } = await anonymous(browser, DESKTOP);

    // The header URL, opened as a link: a redirect to the confirmation page, which only asks.
    const response = await page.goto(headerPath);
    await expect(page).toHaveURL(new RegExp(`/notificaciones/baja\\?t=${token.replace(/\./g, '\\.')}$`));
    expect(response?.headers()['cache-control']).toContain('no-store');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(page.getByRole('heading', { level: 1, name: '¿Quieres dejar de recibir estos correos?' })).toBeVisible();
    await expect(page.getByTestId('unsubscribe-categories')).toHaveText('Cursos y aprendizaje');
    await expect(page.getByText('Todavía no hemos cambiado nada.')).toBeVisible();
    await page.reload();
    await page.reload();
    await expect(page.getByTestId('unsubscribe-confirm')).toBeVisible();
    // A link preview: plain GETs of both URLs, no script; and the page's own read of what the link is for.
    expect((await request.get(headerPath, { maxRedirects: 0 })).status()).toBe(303);
    expect((await request.get(pagePath)).status()).toBe(200);
    expect((await request.get(`${headerPath}&info=1`)).status()).toBe(200);
    expect(await state()).toBe(untouched);
    await shot(page, 'desktop-1-confirm');

    // Keyboard only: the button is reachable and Enter confirms.
    const confirm = page.getByTestId('unsubscribe-confirm');
    for (let presses = 0; presses < 10 && !(await confirm.evaluate((node) => node === document.activeElement)); presses++) {
      await page.keyboard.press('Tab');
    }
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    const done = page.getByTestId('unsubscribe-done');
    await expect(done).toHaveAttribute('role', 'status');
    await expect(done.getByRole('heading', { level: 1, name: 'Listo: ya no recibirás estos correos' })).toBeFocused();
    await shot(page, 'desktop-2-done');

    const after = await pref(users.a.id, 'courses');
    expect(after?.email_mode).toBe('off');
    expect(after!.pref_version).toBeGreaterThan(before!.pref_version);
    expect(await outboxStatus()).toEqual({
      'a-courses-immediate': 'cancelled/unsubscribed', 'a-courses-digest': 'cancelled/unsubscribed',
      'a-courses-mandatory': 'pending', 'a-courses-sending': 'sending', 'a-courses-sent': 'sent',
      'a-community': 'pending', 'a-sessions': 'pending', 'a-unmapped': 'pending',
      'b-courses': 'pending', 'b-sessions': 'pending',
    });
    expect(await pref(users.b.id, 'courses')).toBeNull();

    // The same link again: still only a question on GET, and confirming it a second time changes nothing.
    const settled = await state();
    await page.goto(pagePath);
    await expect(page.getByTestId('unsubscribe-confirm')).toBeVisible();
    expect(await state()).toBe(settled);
    await page.getByTestId('unsubscribe-confirm').click();
    await expect(page.getByTestId('unsubscribe-done').getByRole('heading', { level: 1 })).toHaveText('Listo: ya no recibirás estos correos');
    expect(await state()).toBe(settled);

    expectTokenKeptHome(requests, token, new URL(baseURL!).origin);
    expectQuietConsole(problems, [], token);
    await context.close();
  });

  test('mobile: a user with no preference row unsubscribes with a tap; a later choice, or deleting the row, makes the old link stale', async ({ browser, baseURL }) => {
    expect(await pref(users.a.id, 'community')).toBeNull();
    const first = link(users.a.id, 'community', await signedVersion(users.a.id, 'community'));
    expect((await pref(users.a.id, 'community'))?.email_mode).toBe('default');
    const { context, page, requests, problems } = await anonymous(browser, MOBILE);

    await page.goto(first.pagePath);
    await expect(page.getByTestId('unsubscribe-categories')).toHaveText('Comunidad y menciones');
    const confirm = page.getByTestId('unsubscribe-confirm');
    await expect(confirm).toBeInViewport();
    await expectNoSidewaysScroll(page);
    await shot(page, 'mobile-1-confirm');
    await confirm.click();
    await expect(page.getByTestId('unsubscribe-done').getByRole('heading', { level: 1 })).toHaveText('Listo: ya no recibirás estos correos');
    await expectNoSidewaysScroll(page);
    await shot(page, 'mobile-2-done');
    expect((await pref(users.a.id, 'community'))?.email_mode).toBe('off');
    expect((await outboxStatus())['a-community']).toBe('cancelled/unsubscribed');

    // The owner turns courses back on: the link of the earlier email must not undo that.
    const stale = link(users.a.id, 'courses', (await pref(users.a.id, 'courses'))!.pref_version);
    must('later choice', await service.from('user_notification_category_prefs').update({ email_mode: 'immediate' })
      .eq('user_id', users.a.id).eq('category', 'courses'));
    const chosen = await state();
    await page.goto(stale.pagePath);
    await page.getByTestId('unsubscribe-confirm').click();
    const alert = page.getByTestId('unsubscribe-error');
    await expect(alert.getByRole('heading', { level: 1 })).toHaveText('Este enlace ya no está vigente');
    await expect(alert).toContainText('no hicimos ningún cambio');
    await expect(page.getByTestId('unsubscribe-done')).toHaveCount(0);
    await shot(page, 'mobile-3-stale');
    expect(await state()).toBe(chosen);
    expect((await pref(users.a.id, 'courses'))?.email_mode).toBe('immediate');

    // The owner deletes the community row: the link that switched it off stays stale and no row comes back.
    must('delete', await service.from('user_notification_category_prefs').delete().eq('user_id', users.a.id).eq('category', 'community'));
    const deleted = await state();
    await page.goto(first.pagePath);
    await page.getByTestId('unsubscribe-confirm').click();
    await expect(alert.getByRole('heading', { level: 1 })).toHaveText('Este enlace ya no está vigente');
    await expect(page.getByTestId('unsubscribe-done')).toHaveCount(0);
    await shot(page, 'mobile-4-stale-deleted');
    expect(await state()).toBe(deleted);
    expect(await pref(users.a.id, 'community')).toBeNull();

    expectTokenKeptHome(requests, first.token, new URL(baseURL!).origin);
    expectTokenKeptHome(requests, stale.token, new URL(baseURL!).origin);
    expectQuietConsole(problems, [409], first.token);
    await context.close();
  });

  for (const [name, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]] as const) {
    test(`${name}: an invalid, expired or missing token shows an error and no button`, async ({ browser, request }) => {
      const version = await signedVersion(users.b.id, 'courses');
      const valid = link(users.b.id, 'courses', version);
      const tampered = `${valid.token.slice(0, -2)}${valid.token.endsWith('AA') ? 'BB' : 'AA'}`;
      const expired = link(users.b.id, 'courses', version, Date.now() - 61 * DAY).token;
      const untouched = await state();
      const { context, page, problems } = await anonymous(browser, viewport);

      for (const [label, query, title] of [
        ['tampered', `?t=${tampered}`, 'Este enlace no es válido'],
        ['expired', `?t=${expired}`, 'Este enlace venció'],
        ['missing', '', 'Este enlace no es válido'],
      ]) {
        await page.goto(`/notificaciones/baja${query}`);
        const alert = page.getByTestId('unsubscribe-error');
        await expect(alert).toHaveAttribute('role', 'alert');
        await expect(alert.getByRole('heading', { level: 1 })).toHaveText(title);
        await expect(alert).toContainText('No hicimos ningún cambio');
        await expect(page.getByTestId('unsubscribe-confirm')).toHaveCount(0);
        await expect(page.getByTestId('unsubscribe-retry')).toHaveCount(0);
        await expectNoSidewaysScroll(page);
        await shot(page, `${name}-error-${label}`);
      }

      // The same tokens straight at the endpoint, with a correct one-click body.
      const form = { 'List-Unsubscribe': 'One-Click' };
      expect((await request.post(`/api/notifications/unsubscribe?t=${tampered}`, { form })).status()).toBe(400);
      expect((await request.post(`/api/notifications/unsubscribe?t=${expired}`, { form })).status()).toBe(410);
      expect((await request.post('/api/notifications/unsubscribe', { form })).status()).toBe(400);
      // A valid token with a wrong body or method.
      expect((await request.post(`/api/notifications/unsubscribe?t=${valid.token}`, { form: { 'List-Unsubscribe': 'No' } })).status()).toBe(400);
      expect((await request.post(`/api/notifications/unsubscribe?t=${valid.token}`, { data: form })).status()).toBe(400);
      expect((await request.put(`/api/notifications/unsubscribe?t=${valid.token}`, { form })).status()).toBe(405);
      expect(await state()).toBe(untouched);
      expectQuietConsole(problems, [400, 410], expired);
      await context.close();
    });
  }

  test('a mailbox provider\'s one-click POST (multipart, no browser) unsubscribes that user only', async ({ request }) => {
    const { headerPath } = link(users.b.id, 'courses', await signedVersion(users.b.id, 'courses'));
    const aBefore = JSON.stringify([await pref(users.a.id, 'courses'), await pref(users.a.id, 'community')]);

    const response = await request.post(headerPath, { multipart: { 'List-Unsubscribe': 'One-Click' } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true, categories: [{ category: 'courses', outcome: 'unsubscribed' }] });
    expect(response.headers()['cache-control']).toBe('no-store');
    expect((await pref(users.b.id, 'courses'))?.email_mode).toBe('off');
    const status = await outboxStatus();
    expect(status['b-courses']).toBe('cancelled/unsubscribed');
    expect(status['b-sessions']).toBe('pending');
    expect(status['a-sessions']).toBe('pending');
    expect(JSON.stringify([await pref(users.a.id, 'courses'), await pref(users.a.id, 'community')])).toBe(aBefore);

    // The provider repeats the request: still a success, nothing more changes.
    const settled = await state();
    const replay = await request.post(headerPath, { multipart: { 'List-Unsubscribe': 'One-Click' } });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, categories: [{ category: 'courses', outcome: 'already_off' }] });
    expect(await state()).toBe(settled);
  });

  test('mobile: a failed request says nothing changed, and the retry button finishes it', async ({ browser }) => {
    const { token, pagePath } = link(users.b.id, 'sessions', await signedVersion(users.b.id, 'sessions'));
    const untouched = await state();
    const { context, page, problems } = await anonymous(browser, MOBILE);
    // Only the POST fails; the page's read of the link goes through.
    await page.route('**/api/notifications/unsubscribe**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Error interno del servidor"}' })
        : route.continue()
    );

    await page.goto(pagePath);
    await page.getByTestId('unsubscribe-confirm').click();
    const alert = page.getByTestId('unsubscribe-error');
    await expect(alert.getByRole('heading', { level: 1 })).toHaveText('No pudimos procesar tu solicitud');
    await expect(alert).toContainText('No hicimos ningún cambio');
    await expect(page.getByTestId('unsubscribe-done')).toHaveCount(0);
    await shot(page, 'mobile-5-error');
    expect(await state()).toBe(untouched);

    await page.unroute('**/api/notifications/unsubscribe**');
    await page.getByTestId('unsubscribe-retry').click();
    await expect(page.getByTestId('unsubscribe-done').getByRole('heading', { level: 1 })).toHaveText('Listo: ya no recibirás estos correos');
    expect((await pref(users.b.id, 'sessions'))?.email_mode).toBe('off');
    expect((await outboxStatus())['b-sessions']).toBe('cancelled/unsubscribed');
    expectQuietConsole(problems, [500], token);
    await context.close();
  });
});
