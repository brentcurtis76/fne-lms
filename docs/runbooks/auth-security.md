# Runbook — authentication security remediation (S1–S14, F1–F6)

> Operational follow-up for branch `fix/auth-sec2`. Everything here is an action
> a **human** must take against production, a provider dashboard or the Git
> remote. None of it was performed by the agent that wrote the code: no
> production database was mutated, no deployment was triggered, no credential was
> rotated, no Git history was rewritten, no e-mail was sent, and no provider
> configuration was changed or even queried.
>
> Ordering matters. §1 is time-sensitive and independent of the merge. §2 must
> happen with the merge. §3–§6 can follow, but the invitation flow does not
> actually deliver mail until §3 is done.

---

## 0. State of play — what is done, and what is emphatically not

The single most useful thing this document can do is stop "the code is merged"
from being read as "the problem is fixed". These are different columns.

| # | Item | State | Where |
| - | ---- | ----- | ----- |
| 0.1 | Application and database **code** for S1–S14 and F1–F6 | **CODE COMPLETE**, unreviewed, unmerged | this branch |
| 0.2 | Local gates (type-check, lint, unit, build, pgTAP, Playwright) | **GREEN** on this branch | review request §7 |
| 0.3 | **Migrations applied to production** | **PENDING — NOT APPLIED.** Three of them. Until they are, every audit write fails, the forced-change gate does not exist in production, and the resend cooldown is not atomic there | §2 |
| 0.4 | `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` in Vercel **Production** | **UNVERIFIED, BELIEVED ABSENT.** Reported absent at the time of the original work; Vercel was neither queried nor modified in this round, so treat the state as unknown until someone looks | §3.1 |
| 0.5 | Canonical public origin in Vercel Production | **UNVERIFIED.** Now load-bearing: the code fails loudly instead of trusting `Host` | §3.1 |
| 0.6 | **Controlled send** with a synthetic account | **NOT RUN.** No e-mail has been sent by anyone, from any environment, at any point in this work | §3.3–§3.6 |
| 0.7 | Supabase **SMTP, e-mail templates, redirect allowlist** | **NOT VERIFIED.** The dashboard was never opened | §4.3 |
| 0.8 | **Leaked-password protection** | **STILL OFF.** Advisor-confirmed at the time of the original work; not re-checked since | §4.1 |
| 0.9 | **OTP / recovery expiry** | **STILL OVER ONE HOUR.** Same provenance as 0.8 | §4.2 |
| 0.10 | **Rotation of the exposed administrator credential**, and invalidation of its sessions | **NOT DONE — STILL URGENT.** Deleting the page stopped future serving; it did nothing about past exposure | §1.1–§1.2 |
| 0.11 | **CDN / edge cache purge** of the removed routes | **NOT DONE — decision is external** | §1.4 |
| 0.12 | **Git history rewrite** to expunge the credential | **NOT DONE — needs separate explicit approval.** Recommendation is to rotate instead | §1.5 |
| 0.13 | Postgres security patches | **OUTSTANDING** | §4.4 |
| 0.14 | RLS advisor findings (incl. `public.modules`) | **REPORTED, NOT FIXED** — out of scope by decision | §5 |

Rows 0.10–0.12 are independent of the merge and should not wait for it. Row 0.3
is the one that must happen *with* it.

---

## 1. Credential rotation and history cleanup — BEFORE anything else

**Why.** `pages/test-auth-simple.tsx` was publicly routable and contained a real
administrator's e-mail address and that account's password as string literals.
It was compiled into the client bundle, so the credential was served to every
visitor who loaded the page, and to any crawler or CDN that cached it. Six sibling
pages exposed the Supabase project URL, the anon key's length and its first and
last 20 characters, offered forms that signed in as an arbitrary account, and —
in `auth-status` — let an **unauthenticated** visitor approve a named account and
grant it the `admin` role.

Deleting the files (done, S1) stops future serving. It does not undo past
exposure.

### 1.1 Rotate the exposed password — treat it as public

1. Sign in as the affected administrator (or have another `admin` reset it via
   **Usuarios → Restablecer contraseña**, which now forces a change at next
   sign-in).
2. Set a new password that satisfies the shared policy (8+, upper, lower, digit).
3. Do **not** reuse it anywhere else. Assume the old value is known.

### 1.2 Invalidate that account's existing sessions

Supabase Dashboard → **Authentication → Users** → the account → **Sign out user**
(revokes refresh tokens). Alternatively, from a trusted machine with the service
role key:

```
POST {SUPABASE_URL}/auth/v1/admin/users/{user_id}/logout
Authorization: Bearer {SERVICE_ROLE_KEY}
```

Confirm afterwards that the account has to sign in again on a second device.

### 1.3 Decide about the anon key

The pages printed the project URL, the key length and 40 characters of the key —
not the whole key. The anon key is a public value by design (it ships in every
browser bundle), so this is **not** an emergency. Rotate it only if you are
already rotating for another reason; a rotation requires updating
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel for all environments and redeploying.

### 1.4 CDN / edge cache purge — **needs a separate decision**

The removed pages may still be cached at Vercel's edge or in an intermediary.

- Vercel Dashboard → the project → **Settings → Data Cache / purge**, or
  redeploy, which issues fresh cache keys for the removed routes.
- Verify from outside your network:
  `curl -sSI https://www.nuevaeducacion.org/test-auth-simple` should be `404`.

### 1.5 Git history — **NOT performed, needs separate explicit approval**

The credential is gone from the working tree but remains in the history of every
commit that carried `pages/test-auth-simple.tsx`. Removing it means rewriting
history (`git filter-repo` or BFG) and force-pushing, which invalidates every
existing clone, worktree and open PR — this repository currently has **six active
worktrees** (`/Users/brentcurtis/dev/wt/*`).

Do **not** do this casually. If you decide to:

1. Rotate the credential first (§1.1) — after rotation the history contains a
   dead value and the urgency drops sharply.
2. Coordinate every worktree and open PR.
3. Take a full backup of the remote.
4. Rewrite, force-push, and have every collaborator re-clone.

**Recommendation:** rotate (§1.1), purge the CDN (§1.4), and treat the history
rewrite as optional. A rotated credential in history is an artefact, not a risk.

### 1.6 Verify the routes are gone

After the deploy of this branch:

```
for r in test-auth-simple test-auth debug-auth debug-auth-enhanced \
         test-login-flow login-helper auth-status; do
  printf '%-24s %s\n' "$r" "$(curl -sS -o /dev/null -w '%{http_code}' \
    "https://www.nuevaeducacion.org/$r")"
done
```

All seven must print `404`. The mandatory e2e spec asserts the same thing against
the CI build, so a regression fails the gate before it can reach production.

---

## 2. Apply the migration to production — WITH the merge

**Binding project rule** (PROJECT_STATE.md, the Z1b closure defect): a phase with
migrations is not closed until they are applied to production and verified
read-only. Local and CI green proves the code is correct and says **nothing**
about the deployed schema.

This branch adds **three** migrations. Apply them **in this order** — the third
writes into the table the first creates.

| Version | What it does | Why the order matters |
| ------- | ------------ | --------------------- |
| `20260818120000_security_audit_events.sql` | The audit table: one `CREATE TABLE IF NOT EXISTS`, three indexes, `ENABLE ROW LEVEL SECURITY`, one conditional policy, `REVOKE`/`GRANT`, four `COMMENT`s | Nothing else works without it |
| `20260819120000_forced_password_change_boundary.sql` | The forced-change boundary (F1): a `BEFORE UPDATE` trigger protecting `profiles.must_change_password`, three functions, and `ALTER ROLE authenticator SET pgrst.db_pre_request` + `NOTIFY pgrst` | Independent of the other two |
| `20260819120100_invitation_resend_claim.sql` | `claim_invitation_resend()` (F5) | **References `public.security_audit_events`** — apply after the first |

All three are additive: no `DROP` of anything that holds data, no `TRUNCATE`, no
destructive `ALTER`, and no statement that disables row-level security. (The
second contains one `DROP TRIGGER IF EXISTS` immediately before the `CREATE
TRIGGER` that replaces it, which is how the migration stays re-runnable; it drops
no data and no object that outlives the statement.)

### What the second migration changes at the request layer — read this before applying

`ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.gate_password_change'`
makes PostgREST call that function **before every REST request**, for every
role. The function returns immediately for `anon` and `service_role`, and for any
`authenticated` account whose `must_change_password` is false — which is all of
them, in normal operation. It refuses only flagged accounts, and even then leaves
`/rest/v1/rpc/current_password_change_state` reachable.

Two consequences worth knowing in advance:

- **A flagged account will start getting 403 from the Data API**, not just a
  redirect from the app. That is the point of the change. If a support ticket
  arrives saying "the API stopped working for one user", check the flag first.
- **`NOTIFY pgrst, 'reload config'` is what makes it take effect** without
  restarting PostgREST. It is at the end of the migration. If the setting is
  present but the behaviour is not, send the NOTIFY again.

**`supabase db push` is unusable in this repository** (see PROJECT_STATE.md: the
history is squashed to a `00000000000000` baseline while production lists its
original rows, and the CLI's suggested `migration repair --status reverted` would
write into production that 34 applied migrations were reverted). Apply by hand,
wrapped in a transaction, with its `schema_migrations` row in the same
transaction:

```sql
-- One transaction PER migration, in the order of the table above.
BEGIN;
-- paste the contents of 20260818120000_security_audit_events.sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260818120000')
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
-- paste the contents of 20260819120000_forced_password_change_boundary.sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260819120000')
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
-- paste the contents of 20260819120100_invitation_resend_claim.sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260819120100')
ON CONFLICT DO NOTHING;
COMMIT;
```

`ALTER ROLE` and `NOTIFY` are both transactional in PostgreSQL, so the second
migration is safe inside `BEGIN`/`COMMIT` — the NOTIFY is delivered at commit.

### Verify, read-only

```sql
-- the table exists with RLS on
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.security_audit_events'::regclass;

-- exactly one policy: admin, SELECT, TO authenticated
SELECT policyname, cmd, roles, with_check FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'security_audit_events';

-- anon holds nothing; authenticated holds SELECT only
SELECT a.grantee::regrole::text, string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)
  FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE c.oid = 'public.security_audit_events'::regclass
 GROUP BY 1;
```

Expected: `relrowsecurity = t`; one policy `security_audit_events_admin_select |
SELECT | {authenticated}` with `with_check` NULL; no ACL row for `anon`, and
exactly `SELECT` for `authenticated`.

```sql
-- F1: the pre-request gate is actually INSTALLED. A gate that exists but is not
-- wired up is dead code, and it looks exactly like a working one from the source.
SELECT r.rolname, s.setconfig
  FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
 WHERE r.rolname = 'authenticator';

-- F1: the protected column
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;

-- F1/F5: who may execute the new functions
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('gate_password_change', 'current_password_change_state',
                     'set_password_change_required', 'claim_invitation_resend');
```

Expected: `setconfig` contains
`pgrst.db_pre_request=public.gate_password_change`; `protect_must_change_password`
present and `tgenabled = 'O'`; and this privilege matrix —

| function | anon | authenticated | service_role |
| -------- | ---- | ------------- | ------------ |
| `gate_password_change` | t | t | t |
| `current_password_change_state` | **f** | **t** | t |
| `set_password_change_required` | **f** | **f** | **t** |
| `claim_invitation_resend` | **f** | **f** | **t** |

(`gate_password_change` is executable by everyone on purpose — PostgREST invokes
it as the request's own role, so every role must be able to call it. It takes no
argument and discloses nothing; it either returns or refuses.)

### If an account gets stuck flagged

The forced change itself does not run through PostgREST, so a flagged account can
always complete it. If one is nevertheless stranded — a half-finished admin reset,
a support case — an operator with the service role or a `postgres` session can
clear the flag directly:

```sql
SELECT public.set_password_change_required('<user-uuid>'::uuid, false);
```

It returns `true` only if it actually updated a row. `false` means no such
profile, not "already cleared".

**Until this migration is applied, every audit write in production fails** — the
same silent failure the remediation replaced, except that it is now reported
(`audited: false` in the response, `[security-audit] write failed` in the log)
instead of swallowed.

---

## 3. Resend — Production environment variables and a controlled send

**Current state (as reported at the time of this work): the Vercel Production
environment lists neither `RESEND_API_KEY` nor `EMAIL_FROM_ADDRESS`.** The agent
did not query or modify Vercel. Consequently every invitation has been taking
the `not_configured` branch: no mail is sent, and before this branch there was no
way to retry.

### 3.1 Set the variables

Vercel Dashboard → the project → **Settings → Environment Variables**, scope
**Production** (add Preview too if you want previews to send):

| Name                 | Value                                            | Notes |
| -------------------- | ------------------------------------------------ | ----- |
| `RESEND_API_KEY`     | `re_…` from resend.com → API Keys                | Secret. Sending permission is enough. |
| `EMAIL_FROM_ADDRESS` | `Genera <notificaciones@nuevaeducacion.org>`     | The domain must be verified in Resend. |

### 3.1a The canonical public origin — all the names that work

This is now **load-bearing**, not cosmetic. `getAppBaseUrl`
(`lib/utils/app-url.ts`) **throws in production** when it cannot resolve an
origin, rather than falling back to the caller-controlled `Host` header — and
since F2 the invitation link is built by this application rather than by
Supabase, so a missing origin means no invitation at all instead of an
invitation pointing somewhere else.

`lib/utils/app-url.ts` accepts **any one** of these, checked in this order.
Setting more than one is harmless; setting none is a hard 500 on the grant path.

| Name | Accepted? | Notes |
| ---- | --------- | ----- |
| `NEXT_PUBLIC_BASE_URL` | **yes — first choice** | The name used everywhere else in this repository |
| `NEXT_PUBLIC_SITE_URL` | **yes** | Equivalent. Checked second |
| `NEXT_PUBLIC_APP_URL` | **yes** | Equivalent. Checked third. Intentionally supported — an earlier local helper in `grant.ts` ignored it, which is a bug this branch fixed, so do **not** document this name as invalid |
| `VERCEL_PROJECT_PRODUCTION_URL` | **yes, as a fallback** | Supplied by Vercel without a scheme; used only in production when none of the three above is set |

Whichever you set must parse as an `http(s)` URL — a bare `nuevaeducacion.org`
with no scheme is rejected, not silently concatenated.

| Name | Suggested Production value |
| ---- | -------------------------- |
| `NEXT_PUBLIC_BASE_URL` | `https://www.nuevaeducacion.org` |

Verify what production actually resolves, rather than what it is supposed to:
grant a synthetic signup (§3.3) and read the visible fallback URL printed under
the button in the resulting e-mail. It is the same string the button points at,
so it is the origin the server really used.

`NEXT_PUBLIC_*` values are **inlined at build time**, so a change to any of them
requires a **redeploy** — not just a restart — to take effect.

### 3.2 Verify the sending domain in Resend

Resend Dashboard → **Domains** → `nuevaeducacion.org`:

- SPF, DKIM and (ideally) DMARC records present and verified.
- The `from` address in `EMAIL_FROM_ADDRESS` is on a verified domain.
- Check **Logs** after the controlled send in §3.3.

### 3.3 Controlled invitation send — synthetic account only

Use an address you control that is not a real user. Do **not** use a student,
family or staff address.

1. Open `/registro` in a private window and submit with:
   - a synthetic name (`Prueba Sintetica`),
   - an address you own, e.g. `prueba+genera@…` on your own domain,
   - any school, and consent ticked.
2. Sign in as an admin, go to **Admin → Registros públicos**, find the row, and
   click **Otorgar acceso**.
3. Expected: the toast says access was granted. If mail is configured you get
   no delivery warning; if it is not, the toast names the exact reason.
4. Check the inbox. The e-mail must show:
   - the **Establecer contraseña** button, and
   - the complete URL as visible text underneath it (this is the fallback that
     did not exist before — several school-managed Outlook configurations strip
     the anchor).
5. Click the link. `/reset-password` must show the password form. Set a password
   that satisfies the policy.
6. Sign in with it. You should land on `/dashboard`.

### 3.4 Verify the resend path

7. Back in **Admin → Registros públicos**, open the same row and click
   **Reenviar invitación**.
   - The account has now set a password, so the mail is the **access notice**
     with the login URL — **not** a recovery link. That is correct behaviour.
8. Click it again immediately. Expected: "Ya se envió una invitación hace poco.
   Espera 10 minutos antes de reenviar."

### 3.5 Verify recovery independently

9. Sign out. On `/login` click **¿Olvidaste tu contraseña?**, enter the same
   address with **deliberate leading whitespace and mixed case**, and submit.
   - The button must disable while sending.
   - The message must be the generic "Si existe una cuenta con ese correo…".
10. The mail must arrive despite the whitespace and casing (this is S9).
11. Open the link → the form appears → set a new password → sign in.
12. Now, **while signed in**, navigate directly to `/reset-password` with no
    parameters. You must see **"Enlace no válido"**, not a password form. This is
    the S12 fix; if you see a form, stop and escalate.

### 3.6 Clean up

13. Delete the synthetic account: **Admin → Registros públicos** → the row →
    **Eliminar**, ticking the option to remove the platform account.

---

## 4. Supabase Auth settings — dashboard only

These are provider settings the application does not own. The shared password
policy (`lib/auth/password-policy.ts`) is enforced by the application; GoTrue
applies its own rules on top, and its refusals are surfaced to the user rather
than swallowed.

### 4.1 Leaked-password protection — **currently OFF**

Confirmed by the Supabase security advisor (`auth_leaked_password_protection`).

Dashboard → **Authentication → Policies / Password Security** → enable
**"Prevent use of leaked passwords"** (HaveIBeenPwned).

After enabling, re-run §3.3 step 5 with a knowingly-breached password such as
`Password123`. Expected: the recovery form shows "La contraseña no cumple con los
requisitos de seguridad del sistema" — the page maps GoTrue's 422 to that message
specifically so this setting is visible to the user instead of failing opaquely.

### 4.2 OTP / recovery expiry — **currently over one hour**

Confirmed by the advisor (`auth_otp_long_expiry`).

Dashboard → **Authentication → Providers → Email** → set **Email OTP Expiration**
to the approved duration (Supabase recommends **under one hour**; 3600 seconds or
less. 1800 s is a reasonable choice for a recovery link).

Shorter expiry makes a resend more likely to be needed — which is exactly why S7
shipped in the same branch.

### 4.3 Custom SMTP, templates and the redirect allowlist

Dashboard → **Authentication**:

- **SMTP Settings** — if custom SMTP is configured, confirm the credentials are
  live and the sender matches the verified domain. Supabase's built-in sender is
  rate-limited and not suitable for production invitations.
- **Email Templates → Reset Password** — this template governs the
  **self-service** "¿Olvidaste tu contraseña?" flow only. Since F2 the
  **invitation** e-mail is built by this application and does not use a Supabase
  template at all: `lib/auth/recovery-link.ts` constructs
  `/reset-password?token_hash=…&type=recovery` from
  `generateLink().properties.hashed_token`, so the invitation's shape no longer
  depends on any dashboard setting.

  For the self-service template, the link must reach `/reset-password` carrying
  `token_hash` (or a PKCE `code`). A template emitting a raw `{{ .Token }}` is
  **refused with a clear message** ("El enlace no contiene la información
  necesaria") rather than silently landing on a form, because the page cannot
  verify a raw token without the address. A link that arrives as a legacy
  `#access_token=…` fragment still works, but only if it carries
  `access_token`, `refresh_token` **and** `type=recovery` — an incomplete
  fragment is refused rather than falling through to whatever session the
  browser happens to hold.
- **URL Configuration** — `Site URL` and `Redirect URLs` must include
  `https://www.nuevaeducacion.org/reset-password`. A `redirectTo` outside the
  allowlist is dropped by GoTrue and the user lands on the site root instead of
  the recovery page.
- **Logs → Auth** — after §3.3, confirm the recovery request appears.

### 4.4 Postgres security patches — **outstanding**

The advisor reports `vulnerable_postgres_version`:
`supabase-postgres-15.8.1.085` has outstanding security patches.

Dashboard → **Settings → Infrastructure → Upgrade**. This causes downtime. Plan
it, take a backup first, and re-run `npm run test:db` against a restored copy if
you want schema confidence before cutting over.

---

## 5. RLS advisor findings

The advisor reports **22 tables in `public` without RLS**. Compared against the
allowlist in `supabase/tests/001-rls-enabled.sql`, the two sets are **identical**:

```
answers, assignments, course_prerequisites, deleted_blocks, deleted_courses,
deleted_lessons, deleted_modules, group_assignment_discussions,
growth_community_transformation_access, instructors, learning_path_courses,
learning_paths, menu_permissions, metadata_sync_log, modules,
profiles_role_backup, propuesta_rate_limits, qa_tester_time_logs, questions,
quizzes, student_answers, submissions
```

That is the legacy allowlist approved on 2026-07-08 and recorded in
PROJECT_STATE.md → Open decisions. **No new table has slipped in**, and the table
this branch adds (`security_audit_events`) is not among them — it ships with RLS
enabled, a grant-list privilege posture and 41 pgTAP assertions.

Three findings deserve attention beyond the standing allowlist:

1. **`public.modules` — `policy_exists_rls_disabled` (ERROR).** The table has
   three policies (`modules_admin_all`, `modules_student_view`,
   `modules_teacher_manage`) but RLS is **off**, so all three are inert. This is
   worse than a table with no policies: it reads as protected in the dashboard
   and in code review, and is not. Enabling RLS here is a behaviour change that
   needs its own testing — it is **not** in scope for this branch.
2. **`security_definer_view` (ERROR) on 9 views** —
   `community_progress_report`, `feedback_stats`, `group_assignments_with_status`,
   `pending_quiz_reviews`, `school_progress_report`, `quiz_statistics`,
   `posts_with_engagement`, `community_threads`, `user_badges_with_details`.
   Each runs with its owner's privileges, so RLS on the underlying tables does not
   apply to a caller reading through the view.
3. **178 `SECURITY DEFINER` functions executable by `anon` and/or
   `authenticated`** via `/rest/v1/rpc/*`, plus 123 functions with a mutable
   `search_path`. Individually low severity, collectively a large surface.

All three predate this work and none is in its scope. Recommend a dedicated
hardening phase; the advisor output is the worklist.

---

## 6. Post-deploy verification checklist

After the merge deploys and §2 is applied. Nothing in this list has been done —
see §0. Work through it in order; the last four items are the ones that
distinguish "the code shipped" from "the control is enforced":

- [ ] The seven diagnostic routes return `404` (§1.6).
- [ ] `security_audit_events` exists with RLS and the expected ACL (§2).
- [ ] Grant a synthetic signup; the response reports mail sent (§3.3).
- [ ] The invitation e-mail shows the button **and** the visible URL fallback.
- [ ] The recovery link opens a working form; a bare `/reset-password` visit while
      signed in shows "Enlace no válido" (§3.5 step 12).
- [ ] Resend works and the 10-minute cooldown holds (§3.4).
- [ ] An administrative reset forces a change: reset a synthetic account, sign in
      as it, and confirm you are held at `/change-password` and that
      `/dashboard` bounces you back there.
- [ ] `SELECT action, outcome, occurred_at FROM public.security_audit_events
      ORDER BY occurred_at DESC LIMIT 20;` shows the operations you just
      performed, including a `password_change_recovery` row for the first
      password and a `password_change_forced` row for the forced change.
      **This is the single best proof that the audit trail is real this time** —
      the defect it replaces looked exactly like success.
- [ ] **F1 through the Data API, not through the app.** With the synthetic
      account still flagged, take its access token and call the Data API
      directly — no browser, no middleware:

      ```
      TOKEN=$(curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $ANON_KEY" -H 'content-type: application/json' \
        -d '{"email":"…","password":"…"}' | jq -r .access_token)

      curl -sS -o /dev/null -w '%{http_code}\n' \
        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
        "$SUPABASE_URL/rest/v1/profiles?select=id"
      ```

      Expected **403**, with `PASSWORD_CHANGE_REQUIRED` in the body. Then repeat
      after completing the forced change: expected **200**. If the flagged call
      returns 200, the pre-request hook is not installed — go back to §2.
- [ ] The same flagged token cannot clear its own flag:
      `PATCH /rest/v1/profiles?id=eq.<uuid>` with
      `{"must_change_password": false}` must fail, and the row must still read
      `true` afterwards.
- [ ] The resend cooldown is atomic: fire two resends for the same recipient at
      once (`curl … & curl … & wait`). Exactly one must return 200 and the other
      429, and the recipient must receive exactly one message.
