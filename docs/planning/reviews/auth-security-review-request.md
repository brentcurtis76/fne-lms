# Review request — authentication security remediation (S1–S14)

> **This is not a numbered phase.** `PROJECT_STATE.md` records *Fase en curso:
> NINGUNA*, and this work appears nowhere in
> `docs/planning/GENERA-itinerario-construccion.md`. Like `Z1a` (`fix/sess-leak`)
> and `Z0B` (`feat/zoom-spike`) it is out-of-itinerary remediation, so there is
> deliberately **no `fase-<N>-review-request.md`** — inventing a phase number
> would put a fiction into the ledger. The reviewer protocol
> (`docs/planning/review-protocol.md`) otherwise applies unchanged; substitute
> "the fourteen findings below" wherever it says "the phase's scope in the
> itinerary".

---

## 1. Branch and base

| | |
| --- | --- |
| Branch | `fix/auth-sec` |
| Base SHA | `3fa000a04b60ae1426372e7b9b27bdf95b5d1448` (`docs(plan): add lean workflow pilot`) |
| Head SHA | `git rev-parse fix/auth-sec` — a document cannot name the commit that contains it, so the tip is not quoted here (the same convention `PROJECT_STATE.md` uses) |
| Commits | 11 at the time of writing: 9 code/test, 1 documentation, 1 whitespace fix — plus whatever commit carries the edit you are reading |
| Diff | 71 files, +10624 / −3050 |

The branch was cut from `process/lean-pilot` — the branch that was checked out —
not from `main`. `process/lean-pilot` is documentation-only ahead of `main`, so
the code diff is equivalent, but **the reviewer should confirm the intended merge
target** before anything is merged.

Five pre-existing working-tree modifications were carried across the branch cut
and are untouched by these commits: `PROJECT_STATE.md`, `docs/plan/LEDGER.md`,
`docs/plan/zoom/LEDGER.md`, `package.json`, `package-lock.json`, plus three
untracked files under `docs/plan/evidence/b3/`. They are committed in the final
documentation commit exactly as they were found, with one section appended to
`PROJECT_STATE.md` below the existing edit.

### Commits

```
c143e08a  fix(auth): remove the public auth diagnostic pages (S1)
6795d7ca  fix(auth): one password policy, one CSPRNG generator (S5, S6)
8ddfe358  fix(audit): give the platform a real audit trail (S3)
8f6f44ba  fix(auth): repair the administrative reset and manual user creation (S2, S14)
b2b9f9f9  fix(auth): enforce must_change_password server-side, centrally (S4)
7d3d7ebb  fix(auth): repair bulk import credentials end to end (S13, S11, S10)
2bf41823  fix(auth): recovery proof must come from the link, not the session (S12, S9)
cef9026c  fix(auth): invitations can be resent, existing accounts get told (S7, S8, URLs)
2c77f528  test(e2e): the authentication lifecycle, end to end, as a mandatory gate
6740889a  docs(auth): operations runbook, review request, and state update (S1–S14)
6aa493aa  style(tests): drop a trailing blank line flagged by git diff --check
```

Each of the nine code/test commits is independently green on type-check, lint
and unit tests.

---

## 2. Objective, and scope in / out

**Objective.** Bring the authentication lifecycle — registration → approval →
invitation → first password → login → voluntary change → administrative reset →
forced change → recovery — to a state that is server-enforced, internally
consistent, and covered by tests that would fail if any link in the chain broke
again.

**In scope.** S1–S14 as dispatched, plus the two cross-cutting corrections the
brief attached to them (the canonical-URL helper, and the invitation e-mail's
visible fallback URL). Every item is either resolved in code or explicitly listed
as external operational work in §6.

**Out of scope, deliberately.** Named here so the reviewer can tell a gap from a
decision:

- **Enabling RLS on the 22 legacy allowlisted tables.** Confirmed identical to the
  set approved on 2026-07-08 (§7.4). Changing them is a behaviour change with its
  own test surface.
- **`public.modules`, which has three RLS policies and RLS switched off** — worse
  than no policies, because it reads as protected and is not. Reported, not fixed.
- **The 9 `SECURITY DEFINER` views and 178 `SECURITY DEFINER` functions callable
  by `anon`/`authenticated`.** Reported, not fixed.
- **The remaining diagnostic pages** (`/test`, `/test-rbac`, `/test-logout`,
  `/test-sentry`, `/test-user-role`, `/test-sidebar-role`, `/test-toast`,
  `/debug-feedback-permissions`, `pages/api/debug/*`, `pages/api/test/*`). The
  brief named seven routes; those seven are gone. The rest carry no credentials
  and no privileged action, but they are still routable. Reported, not removed.
- **Any production mutation, deployment, credential rotation or history rewrite.**
  See §6.

---

## 3. Finding-by-finding resolution

| # | What was actually wrong | Where it is fixed |
| --- | --- | --- |
| **S1** | Seven pages routable in production with no auth. One held a real administrator's e-mail **and password** as literals in the client bundle; others printed the Supabase URL and 40 characters of the anon key; `auth-status` let an **unauthenticated** visitor approve an account and grant it `admin`. | Deleted. `__tests__/security/removed-diagnostic-routes.test.ts` walks both page roots and every routable extension; the e2e asserts 404 from the running server. |
| **S2** | The reset wrote `profiles.password_change_required` — **a column that does not exist**. Every administrative reset issued a working temporary password and forced nothing. No server-side policy. Success returned on partial failure. | `pages/api/admin/reset-password.ts` rewritten: flag first, password second, neither failure returns success, minimal response payload. |
| **S3** | Eight call sites wrote to `public.audit_logs`, **a table that has never existed**. Every insert returned 42P01 and every handler logged it and continued. The platform reported a complete audit trail and kept none. | New table + migration + 41 pgTAP assertions; `lib/security/audit.ts` is the only writer; all eight call sites migrated. |
| **S4** | `must_change_password` was read by `/login` on the sign-in it handled and by `/change-password`, and by nothing else. Direct navigation, direct API calls and pre-existing sessions all bypassed it. | Middleware gate before every authorization branch; APIs gated by default; 149 tests across all nine roles. |
| **S5** | Five different policies, two of them six-characters-no-classes. Two entry points had no server-side rule at all. | `lib/auth/password-policy.ts`; every entry point calls it. |
| **S6** | Every generator drew from `Math.random()`, including the source of every temporary credential. One built passwords from the user's own name and the year. | `lib/auth/password-generator.ts`: Web Crypto, no fallback, rejection sampling. Name-based generation removed. |
| **S7** | A failed invitation e-mail was terminal: the signup was already `granted`, so it could not be re-granted, the account had a random password nobody knew, and no operator action could mint another link. | `POST /api/admin/tractor-signups/resend-invite` + a panel action. |
| **S8** | Granting access to an existing profile notified nobody. | Access-granted e-mail with the canonical login URL; delivery reported; same retry. |
| **S9** | The recovery address went to Supabase as typed; no in-flight state; the provider's error was printed to the user. | Trim + lower-case, a ref-guarded in-flight lock, one identical answer on every path. |
| **S10** | Credentials were stashed in a module-level `Map` for a second request to fetch by batch id — lost on a different serverless instance, and fetchable by any admin who learned the id. | Returned once in the creating response. Store and retrieval endpoint deleted. |
| **S11** | A single hardcoded password, committed in the repository, substituted for any row whose password was missing or short — which S13 made the **default** outcome. Plus a shared-global-password checkbox, on by default. | Fallback removed; `globalPassword` rejected at the API boundary; UI replaced with guidance. |
| **S12** | `/reset-password` accepted **any** session as recovery proof. A signed-in visitor got a working form with no credential; a failed token fell back to the existing session; opening someone else's expired link changed **your** password. | Recovery proof must come from the URL; the existing session is signed out before consumption; the verified identity is re-checked at submit. |
| **S13** | The parser filled a missing password with `Math.random().toString(36).slice(-8)` — base-36, so it could **never** contain an uppercase letter and **always** failed the policy. | Parser no longer mints credentials; a batch pre-flight resolves and validates every password before anything is created. |
| **S14** | The handler wrote `must_change_password: false` while both UIs promised a forced change. | Writes `true`; validates the password; audits the creation. |

---

## 4. Files by risk

### Tier 1 — highest risk, read these first

| File | Why |
| --- | --- |
| `middleware.ts` | AGENTS.md calls this the most bug-prone area of the codebase. The matcher goes from 5 prefixes to the API catch-all plus the authenticated page tree, and a new DB read runs per gated authenticated request. |
| `lib/auth/forced-password-change.ts` | The decision table the middleware executes. A wrong predicate is a lockout or a hole. |
| `pages/reset-password.tsx` | Rewritten. Identity correctness for password recovery. |
| `pages/api/admin/reset-password.ts` | Rewritten. Ordering of the two writes is the security property. |
| `supabase/migrations/20260818120000_security_audit_events.sql` | The only migration. Additive, RLS, grant-list, privacy CHECK. |

### Tier 2 — security-relevant, substantially changed

`pages/api/admin/bulk-create-users.ts` · `pages/api/admin/tractor-signups/grant.ts` ·
`pages/api/admin/tractor-signups/resend-invite.ts` (new) ·
`lib/security/audit.ts` (new) · `lib/auth/password-policy.ts` (new) ·
`lib/auth/password-generator.ts` (new) · `lib/email/invitations.ts` (new) ·
`pages/api/admin/create-user.ts` · `pages/api/auth/force-password-change.ts` ·
`pages/api/auth/change-password.ts` · `utils/bulkUserParser.ts` ·
`utils/passwordGenerator.ts` (reduced to a delegating front)

### Tier 3 — audit-path migrations, mechanical

`pages/api/admin/assign-role.ts` · `pages/api/admin/update-user.ts` ·
`pages/api/admin/update-qa-tester-status.ts` · `utils/meetingDeletion.ts`

### Tier 4 — UI and copy

`pages/login.tsx` · `pages/change-password.tsx` · `pages/admin/tractor-signups.tsx` ·
`pages/admin/school-users.tsx` · `pages/admin/user-management.tsx` ·
`components/PasswordResetModal.tsx` · `components/admin/BulkUserImportModal.tsx`

### Deleted

`pages/{test-auth-simple,test-auth,debug-auth,debug-auth-enhanced,test-login-flow,login-helper,auth-status}.tsx`
· `lib/temporaryPasswordStore.ts` · `pages/api/admin/retrieve-import-passwords.ts`

---

## 5. Migrations and RLS implications

One migration, `20260818120000_security_audit_events.sql`. Additive only: one
`CREATE TABLE IF NOT EXISTS`, three indexes, `ENABLE ROW LEVEL SECURITY`, one
conditional `CREATE POLICY`, `REVOKE`/`GRANT`, four `COMMENT`s. No `DROP`, no
`TRUNCATE`, no destructive `ALTER`, and no statement that turns row-level
security off. The RLS migration guard passes, and a unit test re-asserts the same
properties by parsing the file.

**Access posture**, two layers, following the `pasantias_leads` precedent:

| role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
| --- | --- | --- | --- | --- | --- |
| `anon` | no | no | no | no | no |
| `authenticated` (admin) | YES (policy) | no | no | no | no |
| `authenticated` (other) | policy returns 0 rows | no | no | no | no |
| `service_role` | YES | YES | YES | YES | YES |

Exactly one policy, admin SELECT-only, no `WITH CHECK` anywhere — so no
authenticated role has any write path, and after the `REVOKE`s cannot even reach
the policy machinery for a write, nor `TRUNCATE` around it.

**Privacy.** No student data, no minor data — pseudonymous `auth.users`
identifiers, the operation, its outcome and structured metadata. The Fase 2
consent-record + EIPD gate does not apply. Forbidden content is refused in two
layers: a recursive strip in the writer, and a `CHECK` constraint that rejects the
row outright — **including for `service_role`, the only role that can write**.
Seven pgTAP assertions exercise that constraint directly.

**No foreign keys to `auth.users`, deliberately.** `CASCADE` would let deleting a
user erase the evidence of what was done to or by that user; `RESTRICT` would let
the audit trail block `teardownPlatformUser`. Both are wrong, so the identifiers
are plain uuids that may outlive the accounts.

**`school_id` is nullable**, which departs from the "every table carries
`school_id`" invariant. A system event, or an event about a global-role account,
has no school. Please confirm this reading.

---

## 6. Operational work — none of it performed

`docs/runbooks/auth-security.md` is the executable version. Summary:

| Action | State |
| --- | --- |
| Rotate the exposed administrator password | **NOT DONE** — needs a human |
| Invalidate that account's sessions | **NOT DONE** |
| Purge CDN/edge caches of the removed routes | **NOT DONE** |
| Rewrite Git history to expunge the credential | **NOT DONE — needs separate explicit approval.** Six active worktrees would be invalidated. Recommendation: rotate instead. |
| Apply `20260818120000` to production | **NOT DONE.** Until it is, every audit write fails — now *reported* rather than swallowed. |
| Set `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` in Vercel Production | **NOT DONE.** Reported absent; Vercel was neither queried nor modified. |
| Confirm `NEXT_PUBLIC_BASE_URL` in Production | **NOT DONE.** Now load-bearing: the code fails loudly instead of trusting `Host`. |
| Controlled invitation + recovery send | **NOT DONE** — runbook §3.3–§3.6, synthetic account only |
| Verify Supabase SMTP, templates, redirect allowlist | **NOT DONE** |
| Enable leaked-password protection | **NOT DONE** — advisor confirms it is off |
| Reduce OTP/recovery expiry below one hour | **NOT DONE** — advisor confirms over an hour |
| Apply Postgres security patches (15.8.1.085) | **NOT DONE** — advisor confirms outstanding |
| RLS advisor remediation | **REPORTED, NOT FIXED** — §7.4 |

Production was read read-only twice, through the Supabase MCP: `list_tables` (to
verify `audit_logs` genuinely does not exist) and `get_advisors` (to obtain the
findings above). No write of any kind.

---

## 7. Test evidence

### 7.1 Gates

| Gate | Result |
| --- | --- |
| `npm run type-check` | pass, clean |
| `npm run lint` | pass, zero warnings |
| `npm test` | **317 files, 7517 passed, 11 skipped** (the 11 are the documented `[Z3b, PARKED]` skips) |
| `npm run build` | pass; middleware bundle emitted (74.6 kB) |
| `npm run test:db` | **525 assertions, 1 failure — pre-existing and NOT from this branch.** See §7.3 |
| Playwright (mandatory set) | **120/120 pass** against a production build on the seeded local stack |
| `e2e-mandatory.mjs --check` | `OK — 12 mandatory spec(s) ran with no skips` |
| `git diff --check` | clean |

### 7.2 New and changed suites

| Suite | Tests |
| --- | --- |
| `__tests__/middleware.forced-password-change.test.ts` | 149 |
| `__tests__/lib/security/audit.test.ts` | 62 |
| `__tests__/api/admin/create-user.test.ts` | 47 (was 35) |
| `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx` | 33 |
| `__tests__/api/admin/reset-password.test.ts` | 32 (rewritten) |
| `__tests__/lib/auth/password-generator.test.ts` | 30 |
| `__tests__/lib/auth/password-policy.test.ts` | 28 |
| `__tests__/api/admin/resend-invite.test.ts` | 28 |
| `__tests__/lib/email/invitations.test.ts` | 24 |
| `__tests__/middleware.test.ts` | 24 (was 19) |
| `__tests__/api/admin/bulk-create-users.test.ts` | 23 |
| `__tests__/api/admin/tractor-signups-grant.test.ts` | 22 (was 14) |
| `components/__tests__/PasswordResetModal.test.tsx` | 19 (was 12) |
| `__tests__/components/LoginPage.passwordRecovery.test.tsx` | 12 |
| `__tests__/security/removed-diagnostic-routes.test.ts` | 9 |
| `__tests__/security/no-phantom-audit-table.test.ts` | 9 |
| `__tests__/lib/security/audit-actions.test.ts` | 5 |
| `supabase/tests/050-security-audit-events-rls.sql` | 41 pgTAP |
| `tests/e2e/auth-lifecycle.spec.ts` | 3 (mandatory) |

`assign-role` (61) and `update-user` (41) were updated in place, not grown — they
had been asserting on inserts into the phantom table.

### 7.3 The one failing pgTAP test — pre-existing, and my first diagnosis was wrong

`supabase/tests/002-zoom-internal-isolation.sql` test 8 fails:

```
# Failed test 8: "zoom_internal holds exactly the 7 Z1b tables + zoom_zak_issuances"
#         have: 10
#         want: 8
```

I first read this as local database drift. **That was incomplete.** The two extra
tables are `zoom_internal.zoom_attendance_observations` and
`zoom_internal.zoom_attendance_report_batches`, and the production security
advisor reports **both of them in production too**. They are created by migrations
that live only in the unmerged Z7 branch (`/Users/brentcurtis/dev/wt/zoom-hours`,
`feat/zoom-hours`), whose migrations have been applied to the shared local
database and to production ahead of merge.

So the accurate statement is:

- **Not caused by this branch.** Nothing here touches `zoom_internal`; this
  repository's migrations create exactly 8 tables there (verified by grep).
- **Would pass in CI**, which builds the database from `supabase/migrations`
  alone on a clean stack.
- **Is a real schema-drift signal**: production is ahead of `main`. That is the
  mirror image of the Z1b closure defect PROJECT_STATE records — there, `main`
  was ahead of production. Worth a decision, and not mine to make.

I did not run `supabase db reset` to prove the clean-stack claim, because that
would destroy the local database six other worktrees are sharing.

### 7.4 Advisor findings, verified against the allowlist

The advisor's 22 `rls_disabled_in_public` tables are **set-identical** to the
allowlist in `supabase/tests/001-rls-enabled.sql`. No new table has slipped in,
and `security_audit_events` is not among them.

Full advisor counts: 123 `function_search_path_mutable`, 90
`authenticated_security_definer_function_executable`, 88
`anon_security_definer_function_executable`, 22 `rls_disabled_in_public`, 18
`rls_enabled_no_policy`, 9 `security_definer_view`, 2 `extension_in_public`, 1
`policy_exists_rls_disabled` (`public.modules`), 1 `auth_otp_long_expiry`, 1
`auth_leaked_password_protection`, 1 `vulnerable_postgres_version`.

### 7.5 A defect the e2e found that the unit tests could not

`next.config.js` sets `reactStrictMode: true`, so React invokes an effect, runs
its cleanup, and invokes it again — **in development only**. The first shape of
the recovery page's effect paired a `startedRef` guard with a `cancelled` flag
set by the cleanup: the first invocation was cancelled and the second returned
early, leaving the page on "Validando enlace de recuperación..." forever. The
component tests rendered once and passed; the CI e2e serves a production build,
where Strict Mode does not double-invoke. Only running the spec against the dev
server surfaced it. Fixed, and pinned by two Strict-Mode tests.

---

## 8. The five things to scrutinise hardest

1. **`middleware.ts` — the broadened matcher.** This is the single highest-risk
   change in the branch, in the file AGENTS.md names as the most bug-prone in the
   codebase. Check specifically: (a) that no page that used to render for an
   anonymous visitor now redirects — I scoped the unauthenticated branch to
   `requiresSessionPresence`, the original five prefixes, precisely to bound
   this, and the tests assert it, but the tests only cover paths I thought of;
   (b) that gating **all** of `/api/*` by default does not break a machine caller
   that somehow carries a user session; (c) the added per-request `profiles` read
   on every gated authenticated request — one indexed lookup, but it is now on
   the hot path for every API call.

2. **`GATED_PAGE_PREFIXES` — an enumeration I derived by reading `pages/`.** A
   missing prefix is a page a flagged user can still reach; a wrong one is a
   public page that now bounces logged-in users. The matcher-coverage test proves
   the list and the matcher agree — it does **not** prove the list is right. This
   is the judgement call most likely to be wrong, and it is worth checking
   against `pages/` independently.

3. **The recovery page's sign-out-before-consume.** Opening a stale recovery link
   while signed in now ends your session before the token is even tried. I believe
   that is correct — it is what makes "someone else's expired link changes your
   password" structurally impossible — but it is a real behaviour change with a
   real annoyance cost, and it deserves an explicit second opinion rather than my
   say-so.

4. **Fail-closed vs fail-open, and whether I drew the line in the right place.**
   The middleware fails **closed** when it cannot read the flag: a database blip
   locks everyone out of every page and API. The audit writer fails **open**
   everywhere except invitation resend. Both are argued in the module headers;
   both are defensible; neither is obviously right. In particular, check whether
   the `?estado=no-verificado` loop-breaker on `/change-password` genuinely
   terminates in every path — I convinced myself it does, and a loop here would
   be a full outage.

5. **What the bulk import now returns.** Plaintext credentials for up to 500
   accounts arrive in one HTTP response and live in browser memory until the modal
   closes. That is a real improvement over a server-side `Map` fetchable by any
   admin who learned a batch id — but it is still plaintext in a browser, and the
   only copy. Confirm the trade is the one you want; the alternative (invite every
   bulk user by e-mail instead of issuing passwords) is a larger product change I
   did not make unilaterally.

---

## 9. Known limitations and deferred items

- **Bulk import will time out at scale.** Pre-existing and unchanged: the handler
  sleeps one second between users, so the documented 500-user maximum needs ~500
  seconds and exceeds a serverless function timeout. Not touched here because
  fixing it means restructuring the import into a job, which is its own change.
- **`must_change_password` is enforced in middleware, not in the database.** A
  code path that bypasses the middleware (a future App Router route, a direct
  PostgREST call from a browser with a valid session) is not gated. Gating at the
  RLS layer would be stronger and is a much larger change.
- **`invitation_resent` writes two audit rows per resend** (a reservation and an
  outcome). That is the price of a fail-closed rate-limit ledger on an append-only
  table. It is deliberate and documented, but it does make the trail chattier.
- **The resend cooldown is per target, not per admin.** Two administrators cannot
  each send within the same 10 minutes. That is the safer direction, but it will
  occasionally surprise someone.
- **The audit table has no retention policy.** `service_role` retains
  UPDATE/DELETE solely so one can be added; nothing uses them today.
- **Diagnostic surface remains** beyond the seven removed routes — see §2.
- **`getAppBaseUrl` now throws in production when no origin is configured.** That
  is intended (an invitation with a `Host`-derived link is worse than no
  invitation), but it converts a silent misconfiguration into a hard 500 on the
  grant path. `NEXT_PUBLIC_BASE_URL` must be set before this deploys — runbook §3.1.
- **No test proves mail actually leaves the building.** Every delivery test uses
  an injected transport or the `not_configured` branch. Mocks passing is not
  evidence that production e-mail works; only runbook §3.3 is.
