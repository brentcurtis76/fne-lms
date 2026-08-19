import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { E2E_USERS, ensureStorageState, loginViaUi, storageStatePath } from './helpers/auth';
import { Client as PgClient } from 'pg';
import { E2E_MAIL_OUTBOX } from '../../playwright.config';

/**
 * The authentication lifecycle, end to end, against the seeded local stack.
 *
 *   public registration -> admin approval -> the invitation link THAT WAS
 *   ACTUALLY E-MAILED -> first password -> login -> administrative reset ->
 *   forced password change -> ordinary access -> self-service recovery ->
 *   login again
 *
 * WHY THIS EXISTS. Every stage of this chain was broken, and each break was
 * invisible from the stage on either side of it. Unit tests cover each stage in
 * isolation; only a run through the real server, the real database and the real
 * login form proves the stages CONNECT.
 *
 * WHAT CHANGED IN THIS ROUND, and it is the important part:
 *
 *   THE SPEC OPENS THE LINK THE PRODUCT SENDS. The previous version called
 *   `admin.auth.admin.generateLink()` itself and hand-built `?token_hash=…`.
 *   That is a different string in a different format from the one the invitation
 *   e-mail carried (which was the provider's `action_link`), so the one test
 *   meant to prove the invitation chain connects was proving it for a URL nobody
 *   receives. The message is now captured through a controlled transport
 *   (`lib/email/outbox.ts`) and the href is pulled out of its HTML.
 *
 *   THE DATABASE GATE IS EXERCISED THROUGH POSTGREST. A flagged account's token
 *   is used against `/rest/v1/*` DIRECTLY, going nowhere near Next middleware —
 *   which is the bypass the previous round left open and described as an
 *   accepted limitation.
 *
 * NO REAL MAIL IS SENT and nothing outside the ephemeral local stack is touched:
 *
 *   - `RESEND_API_KEY` is not set in the e2e environment, so the mailer takes
 *     its `not_configured` branch and never constructs a provider client. The
 *     spec asserts that outcome explicitly rather than tolerating it.
 *   - The outbox is written by the app server itself and read from disk here.
 *     `lib/email/outbox.ts` refuses to capture on any Vercel deployment.
 *   - The seeder refuses any non-local Supabase URL, and this spec reads the
 *     same `.env.local` the seeder used.
 *
 * THE GAP THE PREVIOUS ROUND DECLARED IS CLOSED. Self-service recovery used to be
 * sent by Supabase Auth over SMTP, so with no mailbox in CI the spec rebuilt an
 * equivalent link with the product's own helper — same format, same code, not
 * the same message. Recovery requests now go through `/api/auth/recovery-request`,
 * which mints the link with `lib/auth/recovery-link.ts` and delivers it through
 * the same server-side mailer as the invitation. BOTH links this spec opens are
 * now read out of the message that was actually sent.
 *
 * AND THE BOUNDARY IS EXERCISED ON ALL THREE SERVICES. The forced-password
 * control is a restrictive RLS policy now, not a PostgREST pre-request hook, so
 * the claim "every browser-accessible Supabase service" has to be shown rather
 * than asserted. Stage 8 drives a flagged token and an unflagged one against
 * PostgREST, against the real storage-api, and against a real Realtime
 * `postgres_changes` channel — each with a positive control, because a refusal
 * that would have happened anyway proves nothing.
 *
 * Mandatory (scripts/ci/e2e-mandatory.mjs): it fails the gate if it is skipped.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * The e2e job writes `.env.local` and sources it only for the seed step, so the
 * Playwright process does not inherit the service key. Read the file directly;
 * a real `process.env` entry still wins.
 */
const fileEnv: Record<string, string> = parseEnv(readFileSync(join(ROOT, '.env.local'), 'utf8'));

function requiredEnv(key: string): string {
  const value = process.env[key] || fileEnv[key];
  if (!value) {
    throw new Error(
      `[auth-lifecycle] ${key} is not set. The e2e environment must declare it — see ` +
        'the .env.local block in .github/workflows/ci.yml.'
    );
  }
  return value;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const APP_ORIGIN = 'http://localhost:3000';

/** Refuse to run against anything but the ephemeral local stack. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
if (!LOCAL_HOSTS.has(new URL(SUPABASE_URL).hostname)) {
  throw new Error(
    `[auth-lifecycle] refusing to run against non-local Supabase host ` +
      `"${new URL(SUPABASE_URL).hostname}". This spec creates and deletes accounts.`
  );
}

const admin: SupabaseClient = createClient(SUPABASE_URL, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * A fresh synthetic identity per run. `example.com` is RFC 2606 reserved and the
 * name is invented, per Ley 21.719 — no real person is represented here, and the
 * address cannot receive mail even if a provider were configured.
 */
function syntheticSignup() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    firstName: 'Sintetica',
    lastName: `Ciclo${stamp.slice(-6)}`,
    email: `e2e-ciclo-${stamp}@example.com`,
    birthDate: '1990-04-12',
    profession: 'Docente de prueba sintetica',
    role: 'docente',
  };
}

/** The three passwords this account wears, in order. All satisfy the shared policy. */
const FIRST_PASSWORD = 'CicloSintetico2026';
const ADMIN_TEMPORARY = 'TemporalAdmin2026';
const FORCED_PASSWORD = 'ForzadaNueva2026';
const RECOVERED_PASSWORD = 'RecuperadaFinal2026';

// ---------------------------------------------------------------------------
// The outbox — how this spec sees what was actually sent
// ---------------------------------------------------------------------------

interface OutboxMessage {
  to: string;
  subject: string;
  html: string;
}

function readOutbox(): OutboxMessage[] {
  if (!existsSync(E2E_MAIL_OUTBOX)) return [];
  return readFileSync(E2E_MAIL_OUTBOX, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxMessage);
}

function clearOutbox() {
  writeFileSync(E2E_MAIL_OUTBOX, '', 'utf8');
}

/**
 * The last message sent to this address, waited for rather than assumed.
 *
 * If nothing ever arrives the failure says WHY, because the most likely cause is
 * a server started without `E2E_MAIL_OUTBOX` (a stale `npm run dev` that
 * Playwright reused locally), and that is otherwise a baffling timeout.
 */
async function waitForMessage(to: string): Promise<OutboxMessage> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const match = readOutbox().filter((m) => m.to.toLowerCase() === to.toLowerCase()).pop();
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `[auth-lifecycle] no outbound message for ${to} appeared in ${E2E_MAIL_OUTBOX}. ` +
      'The app server must run with E2E_MAIL_OUTBOX set (playwright.config.ts does this ' +
      'for the server it starts — a reused dev server started without it will not capture).'
  );
}

/** Every href in a message body, in document order. */
function linksIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  );
}

// ---------------------------------------------------------------------------
// Direct PostgREST — the surface Next middleware is not on the path of
// ---------------------------------------------------------------------------

async function signInDirectly(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function restGet(path: string, accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, text: await response.text() };
}

async function restPatch(path: string, accessToken: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

// ---------------------------------------------------------------------------
// Storage and Realtime — the two services the pre-request hook never saw
// ---------------------------------------------------------------------------

/**
 * The synthetic bucket the Storage half of the proof runs against.
 *
 * WHY IT IS BUILT HERE RATHER THAN SHIPPED. `storage.objects` carries no
 * permissive policy in this project, so without one BOTH a flagged and an
 * unflagged account are refused and the comparison proves nothing. A permissive
 * policy that exists only to make a test meaningful does not belong in a
 * migration, so it is created and torn down by this spec, over a direct
 * connection, on an ephemeral stack. PostgREST cannot issue DDL, which is why
 * `pg` is used at all.
 */
const PROBE_BUCKET = 'e2e-forced-password-probe';

function dbUrl(): string {
  return (
    process.env.SUPABASE_DB_URL ||
    fileEnv.SUPABASE_DB_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  );
}

async function withDb<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new PgClient({ connectionString: dbUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createStorageProbeFixture() {
  // The bucket goes through the Storage API, like anything else would.
  await admin.storage.createBucket(PROBE_BUCKET, { public: false }).catch(() => undefined);

  // The POLICY has to be SQL: PostgREST cannot issue DDL, and the Storage API has
  // no notion of one. Permissive, and scoped to this bucket alone — whatever the
  // guard does to a flagged account, it does it on top of a policy that WOULD
  // have said yes.
  await withDb(async (db) => {
    await db.query(`DROP POLICY IF EXISTS e2e_probe_objects_all ON storage.objects`);
    await db.query(
      `CREATE POLICY e2e_probe_objects_all ON storage.objects
         FOR ALL TO authenticated
         USING (bucket_id = '${PROBE_BUCKET}')
         WITH CHECK (bucket_id = '${PROBE_BUCKET}')`
    );
  });
}

async function removeStorageProbeFixture() {
  // Objects and the bucket go out through the Storage API: `storage.objects`
  // carries a statement-level trigger (`storage.protect_delete`) that refuses
  // every direct SQL delete, postgres included.
  await admin.storage.emptyBucket(PROBE_BUCKET).catch(() => undefined);
  await admin.storage.deleteBucket(PROBE_BUCKET).catch(() => undefined);

  // Test scaffolding on an ephemeral stack, not a migration.
  await withDb(async (db) => {
    await db.query(`DROP POLICY IF EXISTS e2e_probe_objects_all ON storage.objects`);
  });
}

/** Upload one small object through the REAL storage-api with a user token. */
async function storageUpload(accessToken: string, name: string) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${PROBE_BUCKET}/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'text/plain',
        'x-upsert': 'true',
      },
      body: 'sintetico',
    }
  );
  return { status: response.status, text: await response.text() };
}

/** List the bucket through the REAL storage-api with a user token. */
async function storageList(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${PROBE_BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
  });
  const text = await response.text();
  let rows: unknown[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    /* a non-array body is a refusal, and `rows` stays empty */
  }
  return { status: response.status, rows, text };
}

/**
 * Subscribe to `postgres_changes` on `public.notifications` with a user token and
 * report whether a row inserted by the service role is DELIVERED.
 *
 * Realtime decides delivery by asking whether the subscriber could SELECT the
 * row, as `authenticated`, with their own claims — which is exactly the
 * restrictive policy under test.
 */
async function realtimeDelivers(accessToken: string, targetUserId: string): Promise<boolean> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  client.realtime.setAuth(accessToken);

  let delivered = false;
  const channel = client.channel(`e2e-fpc-${targetUserId}-${Math.random()}`);

  const subscribed = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 20_000);
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          delivered = true;
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(true);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(false);
        }
      });
  });

  if (!subscribed) {
    await client.removeChannel(channel);
    throw new Error('[auth-lifecycle] the Realtime channel never subscribed');
  }

  await admin.from('notification_types').upsert(
    { id: 'e2e_fpc_probe', name: 'E2E forced-password probe', category: 'system' },
    { onConflict: 'id' }
  );
  await admin.from('notifications').insert({
    user_id: targetUserId,
    title: 'E2E probe',
    message: 'sintetico',
    type: 'e2e_fpc_probe',
  });

  // Give the change stream a bounded window. A false here means "not delivered",
  // which is the assertion for the flagged half; the unflagged half asserts true,
  // so a broken stream cannot make both halves pass.
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  await client.removeChannel(channel);
  return delivered;
}

async function findUserByEmail(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) ?? null;
}

async function auditActions(userId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('security_audit_events')
    .select('action, outcome, occurred_at')
    .eq('target_user_id', userId)
    .order('occurred_at', { ascending: true });
  if (error) throw new Error(`audit read failed: ${error.message}`);
  return (data ?? []).map((r) => r.action as string);
}

/** Tear the synthetic account and its signup row down, whatever state they reached. */
async function cleanUp(email: string) {
  const user = await findUserByEmail(email);
  if (user) {
    await admin.from('user_roles').delete().eq('user_id', user.id);
    await admin.from('profiles').delete().eq('id', user.id);
    await admin.auth.admin.deleteUser(user.id);
  }
  await admin.from('tractor_signups').delete().eq('email_normalized', email.toLowerCase());
}

// The full chain plus four login round trips. CI serves a production build, but a
// local run compiles pages on demand — well past the 30s default.
test.setTimeout(300_000);

test.describe('authentication lifecycle', () => {
  test.use({ storageState: storageStatePath('admin') });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await ensureStorageState(browser, 'admin');
  });

  test('registration → approval → invitation → first password → login → admin reset → forced change → access → recovery → login', async ({
    page,
    browser,
  }) => {
    const signup = syntheticSignup();
    const schoolId = Number(
      (
        JSON.parse(
          readFileSync(join(ROOT, 'scripts', 'ci', 'e2e-fixtures.json'), 'utf8')
        ) as { school: { id: number } }
      ).school.id
    );

    await cleanUp(signup.email);
    clearOutbox();

    // Torn down in `finally`, whatever the stage above it did.
    let storageFixtureCreated = false;

    try {
      // --- 1. REGISTRATION -------------------------------------------------
      // Through the real public endpoint, anonymously. `handleSignupSubmission`
      // enforces consent, field validation and the honeypot.
      const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const signupResponse = await anon.request.post('/api/registro-signup', {
        data: {
          firstName: signup.firstName,
          lastName: signup.lastName,
          schoolId,
          email: signup.email,
          birthDate: signup.birthDate,
          profession: signup.profession,
          role: signup.role,
          consentAccepted: true,
        },
      });
      expect(signupResponse.status(), 'registration accepted').toBe(200);
      await anon.close();

      const { data: signupRows } = await admin
        .from('tractor_signups')
        .select('id, status')
        .eq('email_normalized', signup.email.toLowerCase());
      expect(signupRows, 'the signup row exists and is pending').toHaveLength(1);
      expect(signupRows![0].status).toBe('pending');
      const signupId = signupRows![0].id as string;

      // --- 2. ADMIN APPROVAL ------------------------------------------------
      await page.goto('/admin/tractor-signups');
      const grantResponse = await page.request.post('/api/admin/tractor-signups/grant', {
        data: { signupId, action: 'grant' },
      });
      expect(grantResponse.status(), 'grant succeeded').toBe(200);
      const grantBody = await grantResponse.json();

      expect(grantBody.status).toBe('granted');
      expect(grantBody.existingUser, 'a brand-new account, not an existing profile').toBe(false);

      // NO REAL MAIL. RESEND_API_KEY is absent from the e2e environment, so the
      // mailer reports `not_configured` and never builds a provider client.
      // Asserted rather than tolerated: if it ever DID send from CI, this fails.
      // `status` is the precise word now: `not_configured` is not a rejection and
      // is certainly not a delivery. See lib/email/invitations.ts.
      expect(grantBody.email).toEqual({
        sent: false,
        status: 'not_configured',
        reason: 'not_configured',
      });
      expect(grantBody.canResend).toBe(true);
      // The recovery link never appears in the response.
      const grantText = JSON.stringify(grantBody);
      expect(grantText).not.toContain('token_hash');
      expect(grantText).not.toContain('action_link');

      const createdUser = await findUserByEmail(signup.email);
      expect(createdUser, 'the auth account was created').toBeTruthy();
      const userId = createdUser!.id;

      const { data: profile } = await admin
        .from('profiles')
        .select('must_change_password, approval_status')
        .eq('id', userId)
        .maybeSingle();
      expect(profile?.approval_status).toBe('approved');
      expect(profile?.must_change_password).toBe(true);

      // --- 3. THE INVITATION MESSAGE ITSELF ---------------------------------
      // Captured from the app server, not minted here. THIS is the difference
      // from the previous round: the URL below is the one the recipient would
      // have clicked.
      const invitation = await waitForMessage(signup.email);
      expect(invitation.subject).toBe('Activa tu acceso a Genera');

      const links = linksIn(invitation.html);
      const invitationUrl = links.find((href) => href.includes('/reset-password'));
      expect(invitationUrl, 'the invitation carries a recovery link').toBeTruthy();

      // The application's own format, not the provider's verify URL. If this
      // ever reverts, the recovery page is back to guessing what will arrive.
      const parsed = new URL(invitationUrl!);
      expect(parsed.origin).toBe(APP_ORIGIN);
      expect(parsed.pathname).toBe('/reset-password');
      expect(parsed.searchParams.get('type')).toBe('recovery');
      expect(parsed.searchParams.get('token_hash')).toBeTruthy();
      expect(invitationUrl).not.toContain('/auth/v1/verify');

      // The button and the visible fallback are the same URL, so a mail client
      // that renders neither anchors nor styles still shows a usable address.
      expect(invitation.html).toContain(invitationUrl!.replace(/&/g, '&amp;'));

      // --- 4. THE ACCOUNT HAS NO USABLE CREDENTIAL YET ----------------------
      const beforeSetup = await signInDirectly(signup.email, FIRST_PASSWORD);
      expect(beforeSetup.status, 'the new password does not work yet').toBeGreaterThanOrEqual(400);

      // --- 5. FIRST PASSWORD, THROUGH THE LINK THAT WAS SENT ----------------
      const recoveryContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const recoveryPage = await recoveryContext.newPage();

      // A bare visit is not recovery proof, even in the browser that is about to
      // be handed a valid link.
      await recoveryPage.goto('/reset-password');
      await expect(recoveryPage.getByTestId('reset-invalid-link')).toBeVisible({ timeout: 30_000 });
      await expect(recoveryPage.getByTestId('reset-password-form')).toHaveCount(0);

      // Neither is a forged fragment — the hole the previous round left open.
      await recoveryPage.goto('/reset-password#access_token=forjado&type=recovery');
      await expect(recoveryPage.getByTestId('reset-invalid-link')).toBeVisible({ timeout: 30_000 });

      // Nor is a COMPLETE implicit fragment. An access token is an ordinary
      // session credential; the previous round accepted one as recovery proof and
      // that is the finding this version answers.
      await recoveryPage.goto(
        '/reset-password#access_token=forjado&refresh_token=tambien-forjado&type=recovery'
      );
      await expect(recoveryPage.getByTestId('reset-invalid-link')).toBeVisible({ timeout: 30_000 });

      // Nor a PKCE code — nothing the SERVER could verify.
      await recoveryPage.goto('/reset-password?code=forjado');
      await expect(recoveryPage.getByTestId('reset-invalid-link')).toBeVisible({ timeout: 30_000 });

      // The real link.
      await recoveryPage.goto(invitationUrl!);
      await expect(recoveryPage.getByTestId('reset-password-form')).toBeVisible({ timeout: 30_000 });
      await expect(recoveryPage).toHaveURL(/\/reset-password$/);

      // The shared policy, enforced by the SERVER now — the form checks it too.
      await recoveryPage.getByTestId('reset-new-password').fill('abc123');
      await recoveryPage.getByTestId('reset-confirm-password').fill('abc123');
      await recoveryPage.getByTestId('reset-submit').click();
      await expect(recoveryPage.getByTestId('reset-message')).toContainText('La contraseña');

      await recoveryPage.getByTestId('reset-new-password').fill(FIRST_PASSWORD);
      await recoveryPage.getByTestId('reset-confirm-password').fill(FIRST_PASSWORD);
      await recoveryPage.getByTestId('reset-submit').click();
      await expect(recoveryPage.getByTestId('reset-message')).toContainText(
        'Contraseña actualizada exitosamente'
      );
      await recoveryContext.close();

      await expect
        .poll(async () => {
          const { data } = await admin
            .from('profiles')
            .select('must_change_password')
            .eq('id', userId)
            .maybeSingle();
          return data?.must_change_password;
        }, { timeout: 20_000 })
        .toBe(false);

      // --- 6. LOGIN ---------------------------------------------------------
      const loginContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const loginPage = await loginContext.newPage();
      await loginViaUi(loginPage, {
        ...E2E_USERS.docente,
        email: signup.email,
        password: FIRST_PASSWORD,
        firstName: signup.firstName,
        lastName: signup.lastName,
      });
      await expect(loginPage).toHaveURL(/\/dashboard(\?|$)/);
      await loginContext.close();

      // --- 7. ADMINISTRATIVE RESET ------------------------------------------
      const resetResponse = await page.request.post('/api/admin/reset-password', {
        data: { userId, temporaryPassword: ADMIN_TEMPORARY },
      });
      expect(resetResponse.status(), 'the administrative reset succeeded').toBe(200);
      const resetBody = await resetResponse.json();
      expect(resetBody.mustChangePassword ?? resetBody.data?.mustChangePassword).toBe(true);
      expect(JSON.stringify(resetBody)).not.toContain(ADMIN_TEMPORARY);

      const { data: afterReset } = await admin
        .from('profiles')
        .select('must_change_password')
        .eq('id', userId)
        .maybeSingle();
      expect(afterReset?.must_change_password, 'the reset really flags the account').toBe(true);

      // --- 8. THE DATABASE GATE, THROUGH POSTGREST --------------------------
      // No Next middleware anywhere on this path. This is the bypass the
      // previous round left open and called an accepted limitation.
      const flagged = await signInDirectly(signup.email, ADMIN_TEMPORARY);
      expect(flagged.status, 'the temporary password signs in').toBe(200);
      const flaggedToken = flagged.body.access_token as string;
      expect(flaggedToken).toBeTruthy();

      const flaggedRead = await restGet(`profiles?select=id&id=eq.${userId}`, flaggedToken);
      expect(
        flaggedRead.status,
        'a flagged account is refused by PostgREST itself, not merely redirected'
      ).toBe(403);
      expect(flaggedRead.text).toContain('PASSWORD_CHANGE_REQUIRED');

      // The other half: it cannot clear its own flag either.
      const flagWrite = await restPatch(`profiles?id=eq.${userId}`, flaggedToken, {
        must_change_password: false,
      });
      expect(flagWrite.status, 'a flagged account cannot clear its own flag').toBeGreaterThanOrEqual(400);

      const { data: stillFlagged } = await admin
        .from('profiles')
        .select('must_change_password')
        .eq('id', userId)
        .maybeSingle();
      expect(stillFlagged?.must_change_password, 'the flag survived the attempt').toBe(true);

      // The ONE route left open, so the middleware can still ask.
      const probe = await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_password_change_state`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${flaggedToken}`,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(probe.status, 'the state probe stays reachable — the way out is not behind the door').toBe(200);
      expect(await probe.json()).toBe(true);

      // --- 8b. THE SAME BOUNDARY, THROUGH STORAGE ---------------------------
      // storage-api talks to Postgres directly. `pgrst.db_pre_request` is never
      // called on this path, which is why the previous round's control did not
      // cover it and why the review's second major finding was raised.
      await createStorageProbeFixture();
      storageFixtureCreated = true;

      // A positive control FIRST, with a token that is not flagged: the seeded
      // admin. If this fails the refusals below mean nothing.
      const controlSignIn = await signInDirectly(
        E2E_USERS.admin.email,
        E2E_USERS.admin.password
      );
      expect(controlSignIn.status, 'the unflagged control account signs in').toBe(200);
      const controlToken = controlSignIn.body.access_token as string;

      const controlUpload = await storageUpload(controlToken, 'control.txt');
      expect(
        controlUpload.status,
        `an UNFLAGGED account can upload — the permissive policy really does allow it (${controlUpload.text})`
      ).toBeLessThan(300);

      const controlList = await storageList(controlToken);
      expect(controlList.status, 'an unflagged account can list').toBe(200);
      expect(controlList.rows.length, 'and sees the object it just wrote').toBeGreaterThan(0);

      // Now the flagged account, against the same bucket and the same policy.
      const flaggedUpload = await storageUpload(flaggedToken, 'flagged.txt');
      expect(
        flaggedUpload.status,
        'STORAGE: a flagged account cannot upload'
      ).toBeGreaterThanOrEqual(400);

      const flaggedList = await storageList(flaggedToken);
      expect(
        flaggedList.rows.length,
        'STORAGE: a flagged account lists nothing, whatever the policy would allow'
      ).toBe(0);

      // Counted at the storage layer itself, not through the API that just
      // refused: `storage` is not an exposed PostgREST schema, and the point is
      // what is ON DISK.
      const objectsAfter = await withDb(async (db) => {
        const { rows } = await db.query(
          'SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = $1',
          [PROBE_BUCKET]
        );
        return rows[0].n as number;
      });
      expect(
        objectsAfter,
        'the flagged upload really did not land — only the control object exists'
      ).toBe(1);

      // --- 8c. THE SAME BOUNDARY, THROUGH REALTIME --------------------------
      // Realtime delivers a row only to a subscriber that could SELECT it, and
      // that check runs as `authenticated` with the subscriber's own claims — so
      // the restrictive policy is the delivery control. Proved both ways.
      const deliveredToFlagged = await realtimeDelivers(flaggedToken, userId);
      expect(
        deliveredToFlagged,
        'REALTIME: a flagged account receives no row on a table it would otherwise see'
      ).toBe(false);

      const { data: adminProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('email', E2E_USERS.admin.email)
        .maybeSingle();
      const deliveredToControl = await realtimeDelivers(
        controlToken,
        (adminProfile?.id as string) ?? userId
      );
      expect(
        deliveredToControl,
        'REALTIME: the positive control DOES receive its row — the stream works'
      ).toBe(true);

      // --- 9. FORCED PASSWORD CHANGE ----------------------------------------
      const forcedContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const forcedPage = await forcedContext.newPage();

      await forcedPage.goto('/login');
      await forcedPage.getByPlaceholder('tu@email.com').fill(signup.email);
      await forcedPage.locator('input[type="password"]').fill(ADMIN_TEMPORARY);
      await forcedPage.getByRole('button', { name: /iniciar sesión/i }).click();
      await expect(forcedPage).toHaveURL(/\/change-password/, { timeout: 30_000 });

      // Direct navigation does not skip it.
      await forcedPage.goto('/dashboard');
      await expect(forcedPage).toHaveURL(/\/change-password/, { timeout: 30_000 });

      await forcedPage.getByLabel('Nueva Contraseña', { exact: true }).fill(FORCED_PASSWORD);
      await forcedPage.getByLabel('Confirmar Nueva Contraseña').fill(FORCED_PASSWORD);
      await forcedPage.getByRole('button', { name: /cambiar contraseña/i }).click();

      // The server writes the password through `auth.admin.updateUserById`, and
      // GoTrue revokes the account's refresh tokens when its password changes —
      // so the browser's session is dead the moment the change lands, and the
      // page says so and sends the user to sign in. (This spec is what found
      // that: the page used to promise /dashboard and the user arrived at
      // /login with no explanation.)
      await expect(forcedPage).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });

      await expect
        .poll(async () => {
          const { data } = await admin
            .from('profiles')
            .select('must_change_password')
            .eq('id', userId)
            .maybeSingle();
          return data?.must_change_password;
        }, { timeout: 20_000 })
        .toBe(false);

      // --- 10. ORDINARY ACCESS ----------------------------------------------
      // Sign in with the password just chosen and reach an authenticated page.
      // The gate is released, so this is not a bounce back to /change-password.
      await forcedPage.getByPlaceholder('tu@email.com').fill(signup.email);
      await forcedPage.locator('input[type="password"]').fill(FORCED_PASSWORD);
      await forcedPage.getByRole('button', { name: /iniciar sesión/i }).click();
      await expect(forcedPage).toHaveURL(/\/(dashboard|profile)(\?|$)/, { timeout: 30_000 });

      // And PostgREST answers again for the same account.
      const cleared = await signInDirectly(signup.email, FORCED_PASSWORD);
      expect(cleared.status, 'the forced password works').toBe(200);
      const clearedRead = await restGet(
        `profiles?select=id&id=eq.${userId}`,
        cleared.body.access_token as string
      );
      expect(clearedRead.status, 'an unflagged account keeps its access').toBe(200);

      await forcedContext.close();

      // --- 11. SELF-SERVICE RECOVERY ----------------------------------------
      // THE MESSAGE THAT WAS ACTUALLY SENT. The previous round could not do this:
      // recovery mail came from Supabase Auth over SMTP with no mailbox in CI, so
      // the spec rebuilt an equivalent link and said so. `/api/auth/recovery-request`
      // now mints the link with the product's own helper and delivers it through
      // the same server-side mailer as the invitation, which the outbox captures.
      const messagesBefore = readOutbox().filter(
        (m) => m.to.toLowerCase() === signup.email.toLowerCase()
      ).length;

      const selfServiceContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const selfServicePage = await selfServiceContext.newPage();

      await selfServicePage.goto('/login');
      await selfServicePage.getByTestId('login-forgot-password').click();
      await selfServicePage.getByTestId('login-email').fill(signup.email);
      await selfServicePage.getByTestId('login-reset-submit').click();
      // The anti-enumeration answer: identical whether or not the account exists.
      await expect(selfServicePage.getByTestId('login-message')).toContainText(
        'Si existe una cuenta con ese correo'
      );

      // The public request commits only the durable queue entry. Drive the
      // authenticated worker explicitly so this test proves that handoff too;
      // production's identical invocation is scheduled once per minute.
      const recoveryTick = await selfServicePage.request.get('/api/cron/recovery-outbox', {
        headers: {
          Authorization: 'Bearer e2e-synthetic-cron-secret-not-a-real-credential',
        },
      });
      expect(recoveryTick.status(), 'the durable recovery worker ran').toBe(200);

      // Wait for the NEW message rather than re-reading the invitation.
      await expect
        .poll(
          () =>
            readOutbox().filter((m) => m.to.toLowerCase() === signup.email.toLowerCase()).length,
          { timeout: 30_000 }
        )
        .toBeGreaterThan(messagesBefore);

      const recoveryMessage = readOutbox()
        .filter((m) => m.to.toLowerCase() === signup.email.toLowerCase())
        .pop()!;
      expect(recoveryMessage.subject, 'the self-service message is the recovery one').toBe(
        'Restablece tu contraseña de Genera'
      );

      const recoveryLinks = linksIn(recoveryMessage.html).filter((href) =>
        href.startsWith(APP_ORIGIN)
      );
      expect(recoveryLinks.length, 'the recovery message carries a link').toBeGreaterThan(0);
      const selfServiceUrl = recoveryLinks[0];
      expect(selfServiceUrl, 'it lands on this application, not on /auth/v1/verify').toContain(
        '/reset-password'
      );
      expect(selfServiceUrl).toContain('token_hash=');
      expect(selfServiceUrl).toContain('type=recovery');
      expect(selfServiceUrl, 'no provider redirect wrapper').not.toContain('/auth/v1/verify');
      // It is a DIFFERENT credential from the invitation, which was already spent.
      expect(selfServiceUrl).not.toBe(invitationUrl);

      await selfServicePage.goto(selfServiceUrl);
      await expect(selfServicePage.getByTestId('reset-password-form')).toBeVisible({
        timeout: 30_000,
      });
      await selfServicePage.getByTestId('reset-new-password').fill(RECOVERED_PASSWORD);
      await selfServicePage.getByTestId('reset-confirm-password').fill(RECOVERED_PASSWORD);
      await selfServicePage.getByTestId('reset-submit').click();
      await expect(selfServicePage.getByTestId('reset-message')).toContainText(
        'Contraseña actualizada exitosamente'
      );
      await selfServiceContext.close();

      // --- 12. LOGIN AGAIN --------------------------------------------------
      const finalContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const finalPage = await finalContext.newPage();
      await loginViaUi(finalPage, {
        ...E2E_USERS.docente,
        email: signup.email,
        password: RECOVERED_PASSWORD,
        firstName: signup.firstName,
        lastName: signup.lastName,
      });
      await expect(finalPage).toHaveURL(/\/dashboard(\?|$)/);
      await finalContext.close();

      // --- 13. THE AUDIT TRAIL ACTUALLY PERSISTED ---------------------------
      // The defect this replaces was a table that did not exist, so every write
      // was discarded while the API reported success. Read the rows back.
      const actions = await auditActions(userId);

      expect(actions, 'the approval was recorded').toContain('access_granted_new_user');
      expect(actions, 'the first password was recorded (the action that did not exist)').toContain(
        'password_change_recovery'
      );
      expect(actions, 'the administrative reset was recorded').toContain('password_reset_admin');
      expect(
        actions,
        'the self-service recovery REQUEST was recorded, with the delivery status as observed'
      ).toContain('password_recovery_requested');
      expect(actions, 'the forced change was recorded — it used to emit nothing').toContain(
        'password_change_forced'
      );
      // Two recoveries: the first password and the self-service one.
      expect(actions.filter((a) => a === 'password_change_recovery').length).toBeGreaterThanOrEqual(2);

      // Nothing sensitive landed in the trail.
      const { data: rows } = await admin
        .from('security_audit_events')
        .select('metadata')
        .eq('target_user_id', userId);
      const serialised = JSON.stringify(rows ?? []);
      for (const secret of [FIRST_PASSWORD, ADMIN_TEMPORARY, FORCED_PASSWORD, RECOVERED_PASSWORD, signup.email]) {
        expect(serialised, 'the audit trail carries no credential or address').not.toContain(secret);
      }
    } finally {
      if (storageFixtureCreated) {
        await removeStorageProbeFixture();
      }
      await cleanUp(signup.email);
      clearOutbox();
    }
  });

  test('a resent invitation carries a fresh link, and the cooldown holds', async ({ page, browser }) => {
    // S7 with F5's atomic claim on top. Split out of the lifecycle test because
    // it is about the OPERATOR action that exists for when delivery fails, and
    // it needs its own account so the cooldown ledger is clean.
    const signup = syntheticSignup();
    const schoolId = Number(
      (
        JSON.parse(
          readFileSync(join(ROOT, 'scripts', 'ci', 'e2e-fixtures.json'), 'utf8')
        ) as { school: { id: number } }
      ).school.id
    );

    await cleanUp(signup.email);
    clearOutbox();

    try {
      const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const signupResponse = await anon.request.post('/api/registro-signup', {
        data: {
          firstName: signup.firstName,
          lastName: signup.lastName,
          schoolId,
          email: signup.email,
          birthDate: signup.birthDate,
          profession: signup.profession,
          role: signup.role,
          consentAccepted: true,
        },
      });
      expect(signupResponse.status()).toBe(200);
      await anon.close();

      const { data: rows } = await admin
        .from('tractor_signups')
        .select('id')
        .eq('email_normalized', signup.email.toLowerCase());
      const signupId = rows![0].id as string;

      await page.goto('/admin/tractor-signups');
      expect((await page.request.post('/api/admin/tractor-signups/grant', {
        data: { signupId, action: 'grant' },
      })).status()).toBe(200);

      const firstMessage = await waitForMessage(signup.email);
      const firstLink = linksIn(firstMessage.html).find((h) => h.includes('/reset-password'))!;

      const resendResponse = await page.request.post('/api/admin/tractor-signups/resend-invite', {
        data: { signupId },
      });
      expect(resendResponse.status(), 'resend is accepted').toBe(200);
      const resendBody = await resendResponse.json();
      expect(resendBody.kind).toBe('password_setup');
      expect(resendBody.email).toEqual({
        sent: false,
        status: 'not_configured',
        reason: 'not_configured',
      });
      expect(JSON.stringify(resendBody)).not.toContain('token_hash');

      // A FRESH credential, not the one already sent.
      await expect
        .poll(() => readOutbox().filter((m) => m.to.toLowerCase() === signup.email.toLowerCase()).length, {
          timeout: 30_000,
        })
        .toBeGreaterThanOrEqual(2);
      const secondMessage = readOutbox()
        .filter((m) => m.to.toLowerCase() === signup.email.toLowerCase())
        .pop()!;
      const secondLink = linksIn(secondMessage.html).find((h) => h.includes('/reset-password'))!;
      expect(secondLink).not.toBe(firstLink);

      // F5: the second resend inside the cooldown is refused, and the claim that
      // refuses it is the atomic one — the ledger row it reads was written in the
      // same transaction as the check that authorised the first.
      const secondResend = await page.request.post('/api/admin/tractor-signups/resend-invite', {
        data: { signupId },
        failOnStatusCode: false,
      });
      expect(secondResend.status(), 'the per-target cooldown holds').toBe(429);
      const refusal = await secondResend.json();
      expect(refusal.code).toBe('RESEND_TOO_SOON');
      expect(refusal.retryAfterSeconds).toBeGreaterThan(0);

      // And nothing more was sent.
      const finalCount = readOutbox().filter(
        (m) => m.to.toLowerCase() === signup.email.toLowerCase()
      ).length;
      expect(finalCount, 'a refused resend sends nothing').toBe(2);

      // The link that was sent SECOND still works. (The first is dead — one-time
      // credentials are, which is why resending the original is not an option.)
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const resendPage = await context.newPage();
      await resendPage.goto(secondLink);
      await expect(resendPage.getByTestId('reset-password-form')).toBeVisible({ timeout: 30_000 });
      await context.close();
    } finally {
      await cleanUp(signup.email);
      clearOutbox();
    }
  });

  test('the removed diagnostic routes are gone', async ({ page }) => {
    // S1. Asserted from a browser against the real production build, because
    // the unit guard only proves the FILES are absent — this proves the SERVER
    // does not answer. Run as the admin persona: these pages had no auth of any
    // kind, so a 404 for the most privileged session is the strongest form.
    for (const route of [
      '/test-auth-simple',
      '/test-auth',
      '/debug-auth',
      '/debug-auth-enhanced',
      '/test-login-flow',
      '/login-helper',
      '/auth-status',
    ]) {
      const response = await page.request.get(route, { failOnStatusCode: false });
      expect(response.status(), `${route} must not resolve`).toBe(404);
    }
  });

  test('a flagged account cannot reach protected pages or APIs', async ({ browser }) => {
    // S4, through the real middleware. The unit suite covers all nine roles and
    // every gated prefix; this proves the gate is actually wired into the
    // running server, which no unit test can.
    const email = `e2e-forzado-${Date.now()}@example.com`;
    const password = 'ForzadoSintetico2026';

    try {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(error).toBeNull();

      await admin.from('profiles').upsert(
        {
          id: created!.user.id,
          email,
          first_name: 'Forzado',
          last_name: 'Sintetico',
          name: 'Forzado Sintetico',
          approval_status: 'approved',
          must_change_password: true,
        },
        { onConflict: 'id' }
      );

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();

      // Sign in. The login page routes a flagged user to /change-password.
      await page.goto('/login');
      await page.getByPlaceholder('tu@email.com').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button', { name: /iniciar sesión/i }).click();
      await expect(page).toHaveURL(/\/change-password/, { timeout: 30_000 });

      // Direct navigation does not skip it. This is the bypass the flag was
      // advisory about: before S4, typing the URL simply worked.
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/change-password/, { timeout: 30_000 });

      // Nor does a direct API call.
      const apiResponse = await page.request.get('/api/auth/my-roles', {
        failOnStatusCode: false,
      });
      expect(apiResponse.status()).toBe(403);
      expect((await apiResponse.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');

      await context.close();
    } finally {
      const user = await findUserByEmail(email);
      if (user) {
        await admin.from('user_roles').delete().eq('user_id', user.id);
        await admin.from('profiles').delete().eq('id', user.id);
        await admin.auth.admin.deleteUser(user.id);
      }
    }
  });
});
