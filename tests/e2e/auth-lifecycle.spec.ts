import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { E2E_USERS, ensureStorageState, loginViaUi, storageStatePath } from './helpers/auth';
import { buildRecoveryUrl } from '../../lib/auth/recovery-link';
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
 * ONE HONEST GAP. The SELF-SERVICE recovery mail (stage 9) is sent by Supabase
 * Auth over SMTP, not by this application, and CI starts the stack with
 * `-x mailpit` — so there is no mailbox to read it from. That stage therefore
 * drives the real UI request (and asserts the anti-enumeration answer), then
 * builds the link with `buildRecoveryUrl`, the SAME shared helper the product
 * uses, from a freshly minted `hashed_token`. It is the same format, produced by
 * the same code — but it is not literally the message Supabase sent, and it is
 * the one link in this spec that is not.
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
      expect(grantBody.email).toEqual({ sent: false, reason: 'not_configured' });
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
      // The REQUEST goes through the real form. The resulting message is sent by
      // Supabase Auth over SMTP and CI runs without a mailbox, so the link is
      // rebuilt with the product's own helper from a fresh hashed token — same
      // format, same code, but not literally the message that was sent. Called
      // out in the header because it is the one link here that is not.
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

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: signup.email,
        options: { redirectTo: `${APP_ORIGIN}/reset-password` },
      });
      expect(linkError, 'a recovery link can be minted').toBeNull();
      const hashedToken = (linkData?.properties as { hashed_token?: string } | undefined)
        ?.hashed_token;
      expect(hashedToken, 'the link carries a hashed token').toBeTruthy();

      await selfServicePage.goto(buildRecoveryUrl(APP_ORIGIN, hashedToken!));
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
      expect(resendBody.email).toEqual({ sent: false, reason: 'not_configured' });
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
