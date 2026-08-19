import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { E2E_USERS, ensureStorageState, loginViaUi, storageStatePath } from './helpers/auth';

/**
 * The authentication lifecycle, end to end, against the seeded local stack.
 *
 *   registration → admin approval → invitation generated → recovery link
 *   accepted → password set → login
 *
 * WHY THIS EXISTS. Every stage of this chain was broken, and each break was
 * invisible from the stage on either side of it:
 *
 *   - approval created an account but the invitation e-mail silently failed
 *     (RESEND_API_KEY is unset in Production), leaving the person stranded with
 *     a random password nobody knows and no operator action that could fix it;
 *   - the recovery page accepted ANY existing session as proof, so it could not
 *     distinguish "arrived with a valid link" from "happened to be logged in";
 *   - and the forced-change flag the whole flow depends on was written to a
 *     column that does not exist, or read by nothing.
 *
 * Unit tests cover each stage in isolation. Only a run through the real server,
 * the real database and the real login form proves the stages CONNECT.
 *
 * NO REAL MAIL IS SENT and nothing outside the ephemeral local stack is touched:
 *
 *   - `RESEND_API_KEY` is not set in the e2e environment, so the mailer takes
 *     its `not_configured` branch and never constructs a provider client. The
 *     spec asserts that outcome explicitly rather than tolerating it.
 *   - The invitation link is minted by this spec through the service-role admin
 *     API — the same `generateLink` call the server makes — which stands in for
 *     "the person received the e-mail" without a mail server in the loop.
 *   - The seeder refuses any non-local Supabase URL, and this spec reads the
 *     same `.env.local` the seeder used.
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

/** The password the recovered account ends up with. Satisfies the shared policy. */
const NEW_PASSWORD = 'CicloSintetico2026';

async function findUserByEmail(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) ?? null;
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

// Full-chain navigation plus a login round trip. CI serves a production build,
// but a local run compiles pages on demand — well past the 30s default.
test.setTimeout(180_000);

test.describe('authentication lifecycle', () => {
  test.use({ storageState: storageStatePath('admin') });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await ensureStorageState(browser, 'admin');
  });

  test('registration → approval → invitation → recovery → password → login', async ({
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
      // Through the real admin panel, as the seeded admin persona.
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
      // S7: a failed send is no longer terminal — the panel offers a retry.
      expect(grantBody.canResend).toBe(true);
      // The recovery link never appears in the response.
      const grantText = JSON.stringify(grantBody);
      expect(grantText).not.toContain('token_hash');
      expect(grantText).not.toContain('action_link');

      const createdUser = await findUserByEmail(signup.email);
      expect(createdUser, 'the auth account was created').toBeTruthy();

      const { data: profile } = await admin
        .from('profiles')
        .select('must_change_password, approval_status')
        .eq('id', createdUser!.id)
        .maybeSingle();
      expect(profile?.approval_status).toBe('approved');
      // S4/S14: the account is flagged, and that flag is now enforced.
      expect(profile?.must_change_password).toBe(true);

      // --- 3. THE FORCED-CHANGE GATE HOLDS ----------------------------------
      // The account exists with a random password nobody knows, so it cannot be
      // signed into — which is precisely why the invitation must be resendable.
      // The gate itself is proven per role in the unit suite; here we prove the
      // account genuinely has no usable credential yet.
      const anonLogin = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const badLogin = await anonLogin.request.post(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          headers: { apikey: requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') },
          data: { email: signup.email, password: NEW_PASSWORD },
          failOnStatusCode: false,
        }
      );
      expect(badLogin.status(), 'the new password does not work yet').toBeGreaterThanOrEqual(400);
      await anonLogin.close();

      // --- 4. RESEND (S7) ---------------------------------------------------
      // The operator action that exists because the send failed above.
      const resendResponse = await page.request.post(
        '/api/admin/tractor-signups/resend-invite',
        { data: { signupId } }
      );
      expect(resendResponse.status(), 'resend is accepted').toBe(200);
      const resendBody = await resendResponse.json();
      // Still no mail configured, reported honestly, and the account has not set
      // a password so it is the password-setup kind.
      expect(resendBody.kind).toBe('password_setup');
      expect(resendBody.email).toEqual({ sent: false, reason: 'not_configured' });
      expect(JSON.stringify(resendBody)).not.toContain('token_hash');

      // A second resend inside the cooldown is refused — the ledger is the audit
      // table, so this also proves the audit row actually landed.
      const secondResend = await page.request.post(
        '/api/admin/tractor-signups/resend-invite',
        { data: { signupId }, failOnStatusCode: false }
      );
      expect(secondResend.status(), 'the per-target cooldown holds').toBe(429);
      expect((await secondResend.json()).code).toBe('RESEND_TOO_SOON');

      // --- 5. THE INVITATION LINK -------------------------------------------
      // Stands in for "the person opened the e-mail". Minted through the same
      // admin API the server uses; no mail server is involved.
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: signup.email,
        options: { redirectTo: 'http://localhost:3000/reset-password' },
      });
      expect(linkError, 'a recovery link can be minted').toBeNull();
      const tokenHash = (linkData?.properties as { hashed_token?: string } | undefined)
        ?.hashed_token;
      expect(tokenHash, 'the link carries a hashed token').toBeTruthy();

      // --- 6. RECOVERY: the link is accepted, a bare visit is not ------------
      const recoveryContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const recoveryPage = await recoveryContext.newPage();

      // S12: without recovery material there is no usable form, even though this
      // is the same browser that is about to be handed a valid link.
      await recoveryPage.goto('/reset-password');
      await expect(recoveryPage.getByTestId('reset-invalid-link')).toBeVisible({
        timeout: 30_000,
      });
      await expect(recoveryPage.getByTestId('reset-password-form')).toHaveCount(0);

      // With the link, the form appears.
      await recoveryPage.goto(`/reset-password?token_hash=${tokenHash}&type=recovery`);
      await expect(recoveryPage.getByTestId('reset-password-form')).toBeVisible({
        timeout: 30_000,
      });

      // The token is stripped from the address bar once consumed.
      await expect(recoveryPage).toHaveURL(/\/reset-password$/);

      // S5: the form enforces the shared policy, not six characters.
      await recoveryPage.getByTestId('reset-new-password').fill('abc123');
      await recoveryPage.getByTestId('reset-confirm-password').fill('abc123');
      await recoveryPage.getByTestId('reset-submit').click();
      await expect(recoveryPage.getByTestId('reset-message')).toContainText('La contraseña');

      // --- 7. PASSWORD SET --------------------------------------------------
      await recoveryPage.getByTestId('reset-new-password').fill(NEW_PASSWORD);
      await recoveryPage.getByTestId('reset-confirm-password').fill(NEW_PASSWORD);
      await recoveryPage.getByTestId('reset-submit').click();
      await expect(recoveryPage.getByTestId('reset-message')).toContainText(
        'Contraseña actualizada exitosamente'
      );
      await recoveryContext.close();

      // The forced-change flag is cleared, so the account can now use the app.
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from('profiles')
              .select('must_change_password')
              .eq('id', createdUser!.id)
              .maybeSingle();
            return data?.must_change_password;
          },
          { timeout: 20_000 }
        )
        .toBe(false);

      // --- 8. LOGIN ---------------------------------------------------------
      // Through the real login form, with the password just set. This is the
      // stage the whole chain exists to reach.
      const loginContext = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const loginPage = await loginContext.newPage();
      await loginViaUi(loginPage, {
        ...E2E_USERS.docente,
        email: signup.email,
        password: NEW_PASSWORD,
        firstName: signup.firstName,
        lastName: signup.lastName,
      });
      await expect(loginPage).toHaveURL(/\/dashboard(\?|$)/);
      await loginContext.close();

      // --- 9. THE AUDIT TRAIL ACTUALLY PERSISTED ----------------------------
      // The defect this replaces was a table that did not exist, so every write
      // was discarded while the API reported success. Read the rows back.
      const { data: auditRows, error: auditError } = await admin
        .from('security_audit_events')
        .select('action, outcome, target_user_id')
        .eq('target_user_id', createdUser!.id)
        .order('occurred_at', { ascending: true });

      expect(auditError, 'the audit table exists and is readable').toBeNull();
      const actions = (auditRows ?? []).map((r) => r.action);
      expect(actions).toContain('access_granted_new_user');
      expect(actions).toContain('invitation_resent');
    } finally {
      await cleanUp(signup.email);
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
