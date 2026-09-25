import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { Client as PgClient } from 'pg';

/**
 * SM-18 — privileged API identity comes from the auth server, not the cookie.
 *
 * Standalone so it can run on its own: it creates only its own synthetic
 * accounts, writes their exact row ids to a fixture manifest before removing
 * them by id, and touches no policy, bucket or seeded row.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * CI writes `.env.local`; a local run without it reads the isolated-stack
 * `.env.development.local` the dev server also uses. A real `process.env` entry wins.
 */
const ENV_FILE = existsSync(join(ROOT, '.env.local')) ? '.env.local' : '.env.development.local';
const fileEnv: Record<string, string> = parseEnv(readFileSync(join(ROOT, ENV_FILE), 'utf8'));

function requiredEnv(key: string): string {
  const value = process.env[key] || fileEnv[key];
  if (!value) throw new Error(`[auth-cookie-identity] ${key} is not set (read from ${ENV_FILE}).`);
  return value;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const APP_ORIGIN = process.env.E2E_APP_ORIGIN || 'http://localhost:3000';
const DB_URL = process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Refuse to run against anything but a local stack. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
if (!LOCAL_HOSTS.has(new URL(SUPABASE_URL).hostname)) {
  throw new Error(`[auth-cookie-identity] refusing non-local Supabase host "${new URL(SUPABASE_URL).hostname}".`);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signInDirectly(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

/** GoTrue's own login/logout log rows owned by these accounts; read-only, for the manifest. */
async function providerAuditIds(accountIds: string[]): Promise<string[]> {
  const client = new PgClient({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select id from auth.audit_log_entries
        where payload->>'actor_id' = any($1::text[]) or payload->'traits'->>'user_id' = any($1::text[])
        order by created_at`,
      [accountIds]
    );
    return rows.map((r) => r.id);
  } finally {
    await client.end();
  }
}

/**
 * S1 of the SM-16 security review, over the wire. The auth-helpers cookie
 * parser accepts a legacy JSON session object and returns its `user` as stored,
 * so a caller can pair a valid token of their own with any `user.id`. These
 * cases send a real browser's fetch, with its real cookie jar, to the real
 * routes, and read the outcome back from the database.
 *
 * The fetches run from a blank document Playwright serves at the app origin:
 * same-origin, so the cookie travels, and no application page is rendered under
 * a forged identity (page authorization is the middleware's, W-B10c-01b).
 */
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const HARNESS_PATH = '/__api-identity-harness';
const SM18_TEMPORARY = 'Sm18Temporal2026';

interface SyntheticAccount {
  id: string;
  email: string;
  password: string;
}

/** Every write below re-checks this: loopback Supabase, and the declared port when one is set. */
function assertWriteTarget() {
  const target = new URL(SUPABASE_URL);
  expect(LOCAL_HOSTS.has(target.hostname), `write target ${target.host}`).toBe(true);
  if (process.env.E2E_SUPABASE_HOSTPORT) expect(target.host).toBe(process.env.E2E_SUPABASE_HOSTPORT);
}

const sm18AccountIds: string[] = [];

async function createSyntheticAccount(label: string, stamp: string, roleType: string | null) {
  const email = `e2e-sm18-${label}-${stamp}@example.com`;
  const password = `Sm18${label[0].toUpperCase()}${label.slice(1)}Sintetico2026`;
  assertWriteTarget();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`[SM-18] createUser ${label}: ${error?.message}`);
  sm18AccountIds.push(data.user.id);

  assertWriteTarget();
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: data.user.id,
      email,
      first_name: 'Sintetico',
      last_name: label,
      name: `Sintetico ${label}`,
      approval_status: 'approved',
      must_change_password: false,
    },
    { onConflict: 'id' }
  );
  if (profileError) throw new Error(`[SM-18] profile ${label}: ${profileError.message}`);

  if (roleType) {
    assertWriteTarget();
    const { error: roleError } = await admin
      .from('user_roles')
      .insert({ user_id: data.user.id, role_type: roleType, is_active: true });
    if (roleError) throw new Error(`[SM-18] role ${label}: ${roleError.message}`);
  }
  return { id: data.user.id, email, password } satisfies SyntheticAccount;
}

/** A legacy JSON-object session cookie: a real token beside a `user.id` of the caller's choosing. */
function legacySessionCookie(session: Record<string, any>, claimedUserId: string) {
  return {
    name: AUTH_COOKIE,
    value: encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: 'bearer',
        user: { id: claimedUserId, aud: 'authenticated', role: 'authenticated' },
      })
    ),
    url: APP_ORIGIN,
  };
}

async function openHarness(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.route(`**${HARNESS_PATH}`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>SM-18</title><body><pre id="out"></pre></body>',
    })
  );
  await page.goto(HARNESS_PATH);
  return page;
}

/** POST from inside the browser; the harness shows each exchange for the screenshot. */
async function browserPost(page: Page, path: string, body: unknown, bearer?: string) {
  return page.evaluate(
    async ({ path, body, bearer }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (bearer) headers.authorization = `Bearer ${bearer}`;
      const response = await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'same-origin',
      });
      const text = await response.text();
      document.getElementById('out')!.textContent += `POST ${path}${bearer ? ' (Bearer)' : ''} -> ${response.status} ${text}\n`;
      return { status: response.status, text };
    },
    { path, body, bearer }
  );
}

function evidencePath(name: string) {
  return join(process.env.UI_EVIDENCE_DIR || test.info().outputDir, name);
}

async function providerUser(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json()) as Record<string, any>;
  return { status: response.status, code: body.error_code ?? body.code ?? null, message: body.msg ?? body.message ?? null };
}

test.describe('privileged API identity (SM-18)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1366, height: 768 }, storageState: { cookies: [], origins: [] } });

  const stamp = `${Date.now()}`;
  let adminAccount: SyntheticAccount;
  let lowAccount: SyntheticAccount;
  let targetAccount: SyntheticAccount;

  /** What a privileged action would change; compared before and after a denial. */
  async function privilegedState() {
    const ids = [lowAccount.id, targetAccount.id];
    const { data: target } = await admin.auth.admin.getUserById(targetAccount.id);
    const { data: profile } = await admin
      .from('profiles')
      .select('must_change_password')
      .eq('id', targetAccount.id)
      .single();
    const { data: roles } = await admin
      .from('user_roles')
      .select('user_id, role_type, is_active')
      .in('user_id', ids)
      .order('role_type');
    const { count: audit } = await admin
      .from('security_audit_events')
      .select('id', { count: 'exact', head: true })
      .or(`target_user_id.in.(${ids.join(',')}),actor_user_id.in.(${ids.join(',')})`);
    return {
      targetUpdatedAt: target.user?.updated_at,
      targetMustChange: profile?.must_change_password,
      roles,
      audit,
    };
  }

  test.beforeAll(async () => {
    adminAccount = await createSyntheticAccount('admin', stamp, 'admin');
    lowAccount = await createSyntheticAccount('gestor', stamp, 'community_manager');
    targetAccount = await createSyntheticAccount('destino', stamp, null);
    console.log(
      `[SM-18] fixtures ${JSON.stringify({
        supabase: new URL(SUPABASE_URL).host,
        accounts: [adminAccount, lowAccount, targetAccount].map(({ id, email }) => ({ id, email })),
      })}`
    );
  });

  test.afterAll(async () => {
    const ids = [...sm18AccountIds];
    if (ids.length === 0) return;
    const list = `(${ids.join(',')})`;
    const { data: audit } = await admin
      .from('security_audit_events')
      .select('id')
      .or(`target_user_id.in.${list},actor_user_id.in.${list}`);
    const { data: roles } = await admin.from('user_roles').select('id').in('user_id', ids);
    // Every row id this run added, written down before anything is removed. The
    // provider's own audit rows are listed but not removed here.
    const manifest = {
      supabase: new URL(SUPABASE_URL).host,
      accounts: ids,
      userRoles: (roles ?? []).map((r) => r.id),
      auditEvents: (audit ?? []).map((r) => r.id),
      providerAuditEntries: await providerAuditIds(ids),
    };
    writeFileSync(evidencePath('sm18-fixtures.json'), JSON.stringify(manifest, null, 2));
    console.log(`[SM-18] cleanup ${JSON.stringify(manifest)}`);

    if (audit?.length) {
      assertWriteTarget();
      await admin.from('security_audit_events').delete().in('id', audit.map((r) => r.id));
    }
    if (roles?.length) {
      assertWriteTarget();
      await admin.from('user_roles').delete().in('id', roles.map((r) => r.id));
    }
    assertWriteTarget();
    await admin.from('profiles').delete().in('id', ids);
    for (const id of ids) {
      assertWriteTarget();
      await admin.auth.admin.deleteUser(id);
    }

    const remaining = {
      accounts: (await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)))).filter((r) => r.data.user)
        .length,
      profiles: (await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids)).count,
      userRoles: (await admin.from('user_roles').select('id', { count: 'exact', head: true }).in('user_id', ids)).count,
      auditEvents: (
        await admin
          .from('security_audit_events')
          .select('id', { count: 'exact', head: true })
          .or(`target_user_id.in.${list},actor_user_id.in.${list}`)
      ).count,
    };
    console.log(`[SM-18] after cleanup ${JSON.stringify(remaining)}`);
    expect(remaining).toEqual({ accounts: 0, profiles: 0, userRoles: 0, auditEvents: 0 });
  });

  test('D1/D6: a low-role token with a cookie naming an admin cannot reset a password or assign a role', async ({
    browser,
  }) => {
    const signIn = await signInDirectly(lowAccount.email, lowAccount.password);
    expect(signIn.status).toBe(200);
    const before = await privilegedState();

    const context = await browser.newContext();
    await context.addCookies([legacySessionCookie(signIn.body, adminAccount.id)]);
    const page = await openHarness(context);

    const reset = await browserPost(page, '/api/admin/reset-password', {
      userId: targetAccount.id,
      temporaryPassword: SM18_TEMPORARY,
    });
    const assign = await browserPost(page, '/api/admin/assign-role', {
      targetUserId: lowAccount.id,
      roleType: 'admin',
    });

    // Not 401: the cookie WAS accepted as a session, as the user its token belongs to.
    expect(reset.status).toBe(403);
    expect(assign.status).toBe(403);
    for (const response of [reset, assign]) {
      const body = JSON.parse(response.text);
      expect(Object.keys(body)).toEqual(['error']);
      expect(body.error).toMatch(/Solo administradores o equipo directivo/);
      for (const other of [adminAccount.id, adminAccount.email, targetAccount.id, targetAccount.email]) {
        expect(response.text).not.toContain(other);
      }
    }

    // The same user with an honest cookie is refused the same way.
    await context.clearCookies();
    await context.addCookies([legacySessionCookie(signIn.body, lowAccount.id)]);
    const ordinary = await browserPost(page, '/api/admin/assign-role', {
      targetUserId: lowAccount.id,
      roleType: 'admin',
    });
    expect(ordinary.status).toBe(403);

    await page.screenshot({ path: evidencePath('sm18-d1-forged-cookie-denied.png') });
    expect(await privilegedState()).toEqual(before);
    await context.close();
  });

  test('D2/D6: a real admin signed in through the login form can reset a password and assign a role', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByPlaceholder('tu@email.com').fill(adminAccount.email);
    await page.locator('input[type="password"]').fill(adminAccount.password);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
    await page.screenshot({ path: evidencePath('sm18-d6-admin-signed-in.png') });
    const cookieNames = (await context.cookies()).map((c) => c.name);
    expect(cookieNames.some((n) => n === AUTH_COOKIE || n.startsWith(`${AUTH_COOKIE}.`))).toBe(true);

    const harness = await openHarness(context);
    const reset = await browserPost(harness, '/api/admin/reset-password', {
      userId: targetAccount.id,
      temporaryPassword: SM18_TEMPORARY,
    });
    const assign = await browserPost(harness, '/api/admin/assign-role', {
      targetUserId: targetAccount.id,
      roleType: 'community_manager',
    });
    expect(reset.status).toBe(200);
    expect(assign.status).toBe(200);

    const { data: profile } = await admin
      .from('profiles')
      .select('must_change_password')
      .eq('id', targetAccount.id)
      .single();
    expect(profile?.must_change_password).toBe(true);
    const { data: roles } = await admin
      .from('user_roles')
      .select('role_type, is_active')
      .eq('user_id', targetAccount.id);
    expect(roles).toEqual([{ role_type: 'community_manager', is_active: true }]);

    // A legacy object cookie carrying the admin's OWN token and id is honoured, so
    // the D1 refusal is about the identity, not about the cookie format.
    const direct = await signInDirectly(adminAccount.email, adminAccount.password);
    await context.clearCookies();
    await context.addCookies([legacySessionCookie(direct.body, adminAccount.id)]);
    const control = await browserPost(harness, '/api/admin/reset-password', { userId: targetAccount.id });
    expect(control.status).toBe(400);

    await harness.screenshot({ path: evidencePath('sm18-d6-admin-allowed.png') });
    await context.close();
  });

  test('D5: a session revoked at the provider and replayed before JWT expiry', async ({ browser }) => {
    const signIn = await signInDirectly(lowAccount.email, lowAccount.password);
    expect(signIn.status).toBe(200);
    const token = signIn.body.access_token as string;
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

    const context = await browser.newContext();
    await context.addCookies([legacySessionCookie(signIn.body, lowAccount.id)]);
    const page = await openHarness(context);
    const escalate = { targetUserId: lowAccount.id, roleType: 'admin' };

    const providerBefore = await providerUser(token);
    const cookieBefore = await browserPost(page, '/api/admin/assign-role', escalate);

    const logout = await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });

    const providerAfter = await providerUser(token);
    const cookieAfter = await browserPost(page, '/api/admin/assign-role', escalate);
    const bearerAfter = await browserPost(page, '/api/admin/assign-role', escalate, token);
    const secondsToExpiry = exp - Math.floor(Date.now() / 1000);

    console.log(
      `[SM-18] D5 ${JSON.stringify({
        secondsToExpiry,
        providerBefore,
        cookieBefore: cookieBefore.status,
        logout: logout.status,
        providerAfter,
        cookieAfter: cookieAfter.status,
        bearerAfter: bearerAfter.status,
      })}`
    );
    await page.screenshot({ path: evidencePath('sm18-d5-revoked-replay.png') });
    await context.close();

    expect(secondsToExpiry).toBeGreaterThan(0);
    expect(providerBefore.status).toBe(200);
    expect(cookieBefore.status).toBe(403);
    expect(logout.status).toBe(204);
    // The claim under test: the provider refuses the revoked session, and so does the API.
    expect(providerAfter.status).not.toBe(200);
    expect(cookieAfter.status).toBe(401);
    expect(bearerAfter.status).toBe(401);
  });
});
