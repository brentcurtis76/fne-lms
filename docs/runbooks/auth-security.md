# Runbook — authentication security remediation (S1–S14)

> Operational follow-up for branch `fix/auth-sec`. Everything here is an action a
> **human** must take against production, a provider dashboard or the Git remote.
> None of it was performed by the agent that wrote the code: no production
> database was mutated, no deployment was triggered, no credential was rotated,
> no Git history was rewritten, and no provider configuration was changed.
>
> Ordering matters. §1 is time-sensitive and independent of the merge. §2 must
> happen with the merge. §3–§6 can follow, but the invitation flow does not
> actually deliver mail until §3 is done.

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

This branch adds exactly one migration:

```
supabase/migrations/20260818120000_security_audit_events.sql
```

It is additive: one `CREATE TABLE IF NOT EXISTS`, three indexes, `ENABLE ROW
LEVEL SECURITY`, one conditional policy, `REVOKE`/`GRANT`, and four `COMMENT`s.
No `DROP`, no `TRUNCATE`, no destructive `ALTER`.

**`supabase db push` is unusable in this repository** (see PROJECT_STATE.md: the
history is squashed to a `00000000000000` baseline while production lists its
original rows, and the CLI's suggested `migration repair --status reverted` would
write into production that 34 applied migrations were reverted). Apply by hand,
wrapped in a transaction, with its `schema_migrations` row in the same
transaction:

```sql
BEGIN;
-- paste the contents of 20260818120000_security_audit_events.sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260818120000')
ON CONFLICT DO NOTHING;
COMMIT;
```

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

Also confirm the canonical origin is set, since invitation links are built from
it and the code now **fails loudly** in production rather than trusting the
request `Host` header:

| Name                    | Value                              |
| ----------------------- | ---------------------------------- |
| `NEXT_PUBLIC_BASE_URL`  | `https://www.nuevaeducacion.org`   |

(`NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_APP_URL` are accepted equivalents; only
one is needed. `getAppBaseUrl` falls back to Vercel's own
`VERCEL_PROJECT_PRODUCTION_URL` before giving up.)

A change to environment variables requires a **redeploy** to take effect.

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
- **Email Templates → Reset Password** — the template must produce a link that
  reaches `/reset-password` carrying `token_hash` (or a PKCE `code`). A template
  emitting a raw `{{ .Token }}` will now be **refused with a clear message**
  ("El enlace no contiene la información necesaria") rather than silently landing
  on a form, because the page cannot verify a raw token without the address.
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

After the merge deploys and §2 is applied:

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
      performed. **This is the single best proof that the audit trail is real
      this time** — the defect it replaces looked exactly like success.
