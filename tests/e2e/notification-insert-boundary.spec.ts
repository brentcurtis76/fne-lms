import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * N0-03 — notification insert boundary, through the real bell.
 *
 * Browser roles keep reading and marking their own notifications, but can no
 * longer create one: a direct REST insert (own or another user's) and the
 * create_notification_safe RPC are refused and leave no row. Rows are created
 * the way the server does it, with the service role.
 *
 * Self-contained synthetic fixtures (*@qa.local.test, one synthetic school)
 * created in beforeAll and deleted by id in afterAll. Refuses any non-local
 * Supabase URL, and checks the browser talks to the same database as the spec.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 390, height: 844 };
const EVIDENCE_DIR = process.env.UI_EVIDENCE_DIR;
const RUN = randomBytes(4).toString('hex');
const MARKER = `N03-${RUN}`;
const PASSWORD = `N03-${randomBytes(12).toString('base64url')}!a1`;

type Persona = 'owner' | 'other' | 'empty';
const users: Record<Persona, { id: string; email: string }> = {
  owner: { id: '', email: `notif03-${RUN}-owner@qa.local.test` },
  other: { id: '', email: `notif03-${RUN}-other@qa.local.test` },
  empty: { id: '', email: `notif03-${RUN}-empty@qa.local.test` },
};
const SCHOOL_ID = 9_300_000 + (parseInt(RUN.slice(0, 4), 16) % 100_000);
const notificationIds: string[] = [];
const evidence: Record<string, unknown> = { run: RUN, supabaseUrl: SUPABASE_URL, schoolId: SCHOOL_ID };
let service: SupabaseClient;

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`notification-insert-boundary refuses non-local Supabase URL host ${host}`);
  }
}

async function shot(page: Page, name: string) {
  const dir = EVIDENCE_DIR ?? test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

async function createPersona(key: Persona, first: string) {
  const { data, error } = await service.auth.admin.createUser({
    email: users[key].email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${key}: ${error.message}`);
  users[key].id = data.user.id;
  const profile = await service.from('profiles').upsert(
    {
      id: data.user.id,
      email: users[key].email,
      name: `${first} Sintetico`,
      first_name: first,
      last_name: 'Sintetico',
      must_change_password: false,
      approval_status: 'approved',
      school_id: SCHOOL_ID,
    },
    { onConflict: 'id' }
  );
  if (profile.error) throw new Error(`profile ${key}: ${profile.error.message}`);
  const role = await service
    .from('user_roles')
    .insert({ user_id: data.user.id, role_type: 'docente', school_id: SCHOOL_ID, is_active: true });
  if (role.error) throw new Error(`role ${key}: ${role.error.message}`);
}

async function serviceInsert(userId: string, title: string) {
  const { data, error } = await service
    .from('user_notifications')
    .insert({ user_id: userId, title, description: 'Notificación sintética N0-03', related_url: '/dashboard' })
    .select('id')
    .single();
  if (error) throw new Error(`service insert: ${error.message}`);
  notificationIds.push(data.id);
  return data.id as string;
}

async function rowsFor(userId: string) {
  const { data, error } = await service
    .from('user_notifications')
    .select('id, title, is_read')
    .eq('user_id', userId)
    .order('title');
  if (error) throw new Error(`service read: ${error.message}`);
  return data;
}

/** Signs in through the real login form; records where the browser sends its database traffic. */
async function signedIn(browser: Browser, key: Persona, viewport: typeof DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const restHosts = new Set<string>();
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/user_notifications')) restHosts.add(new URL(r.url()).origin);
  });
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(users[key].email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
  return { context, page, restHosts };
}

function bell(page: Page) {
  return page.getByRole('button', { name: /^Notificaciones/ });
}

async function openBell(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  }
  await expect(bell(page)).toBeVisible({ timeout: 30_000 });
  await bell(page).click();
  await expect(page.getByRole('heading', { name: 'Notificaciones', level: 3 })).toBeVisible();
}

/** The browser-role attempts: sent from the page with the signed-in user's own JWT and the anon key. */
async function browserWriteAttempts(page: Page, userId: string, otherId: string) {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword({ email: users.owner.email, password: PASSWORD });
  if (signIn.error || !signIn.data.session) throw new Error(`token: ${signIn.error?.message}`);
  const token = signIn.data.session.access_token;
  return page.evaluate(
    async ({ url, key, token, userId, otherId, marker }) => {
      const headers = {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
      const send = async (path: string, body: unknown) => {
        const r = await fetch(`${url}/rest/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
        const text = await r.text();
        let code = '';
        try {
          code = (JSON.parse(text) as { code?: string }).code ?? '';
        } catch {
          code = '';
        }
        return { status: r.status, code };
      };
      return {
        insertOwn: await send('user_notifications', { user_id: userId, title: `${marker} insert own` }),
        insertOther: await send('user_notifications', { user_id: otherId, title: `${marker} insert other` }),
        rpc: await send('rpc/create_notification_safe', {
          p_user_id: userId,
          p_title: `${marker} rpc own`,
          p_description: 'x',
        }),
      };
    },
    { url: SUPABASE_URL, key: ANON_KEY, token, userId, otherId, marker: MARKER }
  );
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.describe('notification insert boundary (N0-03)', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('Supabase URL/anon/service keys are required');
    assertLocal(SUPABASE_URL);
    service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const school = await service
      .from('schools')
      .insert({ id: SCHOOL_ID, name: `Colegio Sintetico ${MARKER}`, tenant_kind: 'qa' });
    if (school.error) throw new Error(`school: ${school.error.message}`);
    await createPersona('owner', 'Propietaria');
    await createPersona('other', 'Otra');
    await createPersona('empty', 'Vacia');

    await serviceInsert(users.owner.id, `${MARKER} A primera`);
    await serviceInsert(users.owner.id, `${MARKER} B segunda`);
    await serviceInsert(users.other.id, `${MARKER} Z ajena`);
    // The server's RPC path keeps working for the service role.
    const rpc = await service.rpc('create_notification_safe', {
      p_user_id: users.owner.id,
      p_title: `${MARKER} C servicio`,
      p_description: 'Notificación sintética N0-03',
      p_related_url: '/dashboard',
      p_idempotency_key: `${MARKER}-service-rpc`,
    });
    expect(rpc.error).toBeNull();
    expect(rpc.data).toMatch(/^[0-9a-f-]{36}$/);
    notificationIds.push(rpc.data as string);
    evidence.fixtures = { users: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])), notificationIds: [...notificationIds] };
  });

  test.afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id).filter(Boolean);
    const cleanup: Record<string, number | string> = {};
    if (service) {
      const n = await service.from('user_notifications').delete({ count: 'exact' }).in('user_id', ids);
      cleanup.user_notifications = n.error ? n.error.message : n.count ?? -1;
      const r = await service.from('user_roles').delete({ count: 'exact' }).in('user_id', ids);
      cleanup.user_roles = r.error ? r.error.message : r.count ?? -1;
      const p = await service.from('profiles').delete({ count: 'exact' }).in('id', ids);
      cleanup.profiles = p.error ? p.error.message : p.count ?? -1;
      let authDeleted = 0;
      for (const id of ids) {
        const d = await service.auth.admin.deleteUser(id);
        if (!d.error) authDeleted += 1;
      }
      cleanup.auth_users = authDeleted;
      const s = await service.from('schools').delete({ count: 'exact' }).eq('id', SCHOOL_ID);
      cleanup.schools = s.error ? s.error.message : s.count ?? -1;
    }
    evidence.cleanup = cleanup;
    if (EVIDENCE_DIR) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(join(EVIDENCE_DIR, 'ui-evidence.json'), JSON.stringify(evidence, null, 2));
    }
  });

  test('D6 desktop: owner reads own notifications, marks one read, browser inserts are refused', async ({ browser }) => {
    const { context, page, restHosts } = await signedIn(browser, 'owner', DESKTOP);
    await expect(bell(page)).toHaveAccessibleName('Notificaciones (3 sin leer)', { timeout: 30_000 });
    await openBell(page, false);
    await expect(page.getByText(`${MARKER} A primera`)).toBeVisible();
    await expect(page.getByText(`${MARKER} B segunda`)).toBeVisible();
    await expect(page.getByText(`${MARKER} C servicio`)).toBeVisible();
    await expect(page.getByText(`${MARKER} Z ajena`)).toHaveCount(0);
    await shot(page, 'd6-desktop-bell-own');

    await page.getByText(`${MARKER} A primera`).click();
    await expect.poll(async () => (await rowsFor(users.owner.id)).find((n) => n.title.endsWith('A primera'))?.is_read).toBe(true);
    await page.reload();
    await expect(bell(page)).toHaveAccessibleName('Notificaciones (2 sin leer)', { timeout: 30_000 });

    const attempts = await browserWriteAttempts(page, users.owner.id, users.other.id);
    evidence.desktopAttempts = attempts;
    for (const attempt of Object.values(attempts)) {
      expect([401, 403]).toContain(attempt.status);
      expect(attempt.code).toBe('42501');
    }
    const { count } = await service
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .like('title', `${MARKER} insert%`);
    const { count: rpcCount } = await service
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .like('title', `${MARKER} rpc%`);
    expect(count).toBe(0);
    expect(rpcCount).toBe(0);
    expect((await rowsFor(users.owner.id)).length).toBe(3);
    expect((await rowsFor(users.other.id)).length).toBe(1);

    await page.reload();
    await openBell(page, false);
    await expect(page.getByText(`${MARKER} insert own`)).toHaveCount(0);
    await expect(page.getByText(`${MARKER} rpc own`)).toHaveCount(0);
    await shot(page, 'd6-desktop-after-refused-inserts');

    expect([...restHosts]).toEqual([new URL(SUPABASE_URL).origin]);
    evidence.desktopRestHosts = [...restHosts];
    await context.close();
  });

  test('D6 mobile: owner marks all read from the bell', async ({ browser }) => {
    const { context, page, restHosts } = await signedIn(browser, 'owner', MOBILE);
    await openBell(page, true);
    await expect(page.getByText(/^2 notificaci\S+ sin leer$/)).toBeVisible({ timeout: 30_000 });
    await shot(page, 'd6-mobile-bell-own');
    await page.getByRole('button', { name: 'Marcar todas' }).click();
    await expect(page.getByText('Todas las notificaciones leídas')).toBeVisible();
    await expect.poll(async () => (await rowsFor(users.owner.id)).every((n) => n.is_read)).toBe(true);
    expect((await rowsFor(users.other.id)).every((n) => !n.is_read)).toBe(true);
    await shot(page, 'd6-mobile-all-read');
    expect([...restHosts]).toEqual([new URL(SUPABASE_URL).origin]);
    await context.close();
  });

  test('D6 mobile: empty and error states stay usable', async ({ browser }) => {
    const { context, page } = await signedIn(browser, 'empty', MOBILE);
    await openBell(page, true);
    await expect(page.getByText('Sin notificaciones')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'd6-mobile-empty');

    const notificationsRest = (url: URL) => url.pathname.endsWith('/rest/v1/user_notifications');
    await page.route(notificationsRest, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"synthetic failure"}' })
    );
    await page.reload();
    await openBell(page, true);
    await expect(page.getByText('Error al cargar')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'd6-mobile-error');
    await page.unroute(notificationsRest);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByText('Sin notificaciones')).toBeVisible({ timeout: 30_000 });
    await context.close();
  });
});
