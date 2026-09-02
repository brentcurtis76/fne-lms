# Runbook — authentication security remediation (S1–S14, F1–F6, R1–R5)

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

> **Production-state update — 2026-08-25.** Migration
> `20260819120300_recovery_security_ceremonies` (the fifth migration) is already
> applied and comprehensively verified in production; **do not run it again**.
> The required Vercel variables were added on 2026-08-20, but the current
> Production deployment is still commit
> `717c2c095021eb9ff71f1873d87b2e926c6f4d9b`, created 2026-08-17, so it contains
> neither this code nor those later environment settings. No live recovery test
> has been run. Rows below preserve the branch author's original review snapshot;
> this update supersedes rows 0.3–0.5 where they conflict.

> **State update — 2026-09-01 (API-key incident, §8).** All provider and
> production facts in this update were supplied and verified externally by
> Brent/Codex; the session that recorded it contacted no provider and no
> database. **Row 0.16 is merged:** PR
> [#66](https://github.com/brentcurtis76/fne-lms/pull/66) (`fix/cred-guard`,
> approved head `7334da1b0f17e2344e83f90b4670301b0ba954d7`) was merged by Brent
> as merge commit `76a986441e93477df27e8b2b5d4888cd4949c6e7`; post-merge `main`
> CI run
> [33522718133](https://github.com/brentcurtis76/fne-lms/actions/runs/33522718133)
> passed all seven jobs and the automatic Vercel Production deployment
> `6204033475` completed successfully. This supersedes the production reference
> point in §8.7 (CI run `33400056341` / deployment `6182645350` at
> `49814091`), which is not rewritten — it stays as the audit trail for the
> head it describes. **Merging CRED-01 fixed the repository only: the exposed
> credential is not rotated and not disabled.** `RECOVERY_CRYPTO_SECRET` now
> exists in Vercel as a Sensitive (Secret) variable, **Production only —
> STAGED, NOT ACTIVE**: it has reached no deployment, because the current
> Production deployment is still `6204033475` at `76a98644`, which predates the
> variable, so production still derives recovery crypto from the legacy
> `SUPABASE_SERVICE_ROLE_KEY` fallback and **no cutover has occurred**. The
> next normal `main` deployment activates **only** this independent
> recovery-crypto root; it does not install, rotate, disable, or revoke any
> Supabase key — service-key replacement remains a later, separately authorized
> step. `SUPABASE_SERVICE_ROLE_KEY` in Vercel is now scoped to **Production
> only for future deployments** (its value was not opened or changed), and a
> replacement Supabase secret key named `fne_lms_vercel_prod_20260831` exists
> and is securely held by Brent — **not installed in Vercel**. Rows 0.17
> (API-key rotation) and 0.18 (database password) remain open exactly as
> stated. Production read-only preflight (2026-09-01, by Brent/Codex):
> migration `20260819120300` recorded; recovery tables and function present;
> **0 envelope rows; 0 queued/processing rows; 0 active unexpired grants**;
> latest recovery activity 2026-08-28. Because envelopes sealed under the old
> root cannot be opened under the new one (§8.5), **the zero counts must be
> rechecked immediately before any merge that deploys**.

> **State update — 2026-09-01, post-merge (CRED-02 cutover ACTIVE; supersedes
> the staged-state update immediately above and row 0.19 where they conflict —
> that update is preserved as historical evidence).** Brent merged PR
> [#67](https://github.com/brentcurtis76/fne-lms/pull/67) (`docs/cred-stage`,
> approved head `b530d8771adcc38af77028207a3eb31657ab346d`) as merge commit
> `593b7df62234b18eb3dba5c1f508541590a5d381`; PR CI run
> [33531107841](https://github.com/brentcurtis76/fne-lms/actions/runs/33531107841)
> and post-merge `main` CI run
> [33531965740](https://github.com/brentcurtis76/fne-lms/actions/runs/33531965740)
> each passed all seven jobs, and the automatic Vercel Production deployment
> `6205672170` for `593b7df6` completed successfully — the first Production
> deployment carrying `RECOVERY_CRYPTO_SECRET`, so production now derives
> recovery crypto from the independent root instead of the legacy
> `SUPABASE_SERVICE_ROLE_KEY` fallback. **This is deployment/configuration
> evidence, not proof of a real recovery-e-mail and redemption flow: no
> functional recovery test has been run** (rows 0.6/0.7a discipline stands).
> Vercel variable scopes were verified by a names/scopes-only listing, no value
> displayed or pulled: `RECOVERY_CRYPTO_SECRET` Production-only,
> `SUPABASE_SERVICE_ROLE_KEY` Production-only. Post-merge aggregate check — the
> single Brent-authorized read-only query (one statement, one row, aggregates
> only, via the already-linked read-only Supabase Management API wrapper; no
> mutation, no second query): **envelope_rows_total 0; nonterminal
> (queued/processing) rows 0; active unexpired grants 0**; latest_queued_at
> 2026-08-28 12:57:33 UTC; latest_completed_at 2026-08-28 12:57:49 UTC;
> latest_scrubbed_at 2026-08-28 12:57:45 UTC — all recorded outbox timestamp
> activity predates the merge (2026-09-01 16:28 UTC). **Honest gap: the
> immediately-before-merge zero-count recheck mandated by the staged-state
> update above is not evidenced in this record and was not retroactively
> satisfied. The snapshot proves only that the counts were zero when queried
> and that the three max outbox timestamps remained on 2026-08-28 — an
> after-the-fact risk bound that does not reconstruct every transient grant
> state during the cutover window and is not the mandated pre-merge check.** Unchanged: `fne_lms_vercel_prod_20260831`
> remains held by Brent and **NOT installed in Vercel**; **no Supabase key was
> rotated, revoked, disabled, or replaced** (rows 0.17 and 0.18 stand exactly
> as written); the service-role-key migration remains a separate, BLOCKED,
> UNAUTHORIZED work item requiring its own explicit Brent authorization and
> independent review.

> **State update — 2026-09-01, later (CRED-03B / M1: replacement service key
> STAGED in Vercel, NOT ACTIVE; supersedes the "held by Brent, NOT installed in
> Vercel" key-custody statements in the two updates above and their production
> reference points where they conflict — both updates are preserved verbatim as
> historical evidence).** Brent personally updated the **existing** Vercel
> variable `SUPABASE_SERVICE_ROLE_KEY` to the replacement secret key
> `fne_lms_vercel_prod_20260831`: Environment **Production only**, UI type
> **Secret**, saved successfully, clipboard cleared, **no deployment
> triggered**. Session-verified by names/scopes-only reads: the variable is
> Production-only; `RECOVERY_CRYPTO_SECRET` remains Production-only; the
> current Production deployment is still `6208254024` at `bf5f4c70`
> (2026-09-01T19:01:55Z, success; post-merge CI run
> [33546783387](https://github.com/brentcurtis76/fne-lms/actions/runs/33546783387)
> all seven jobs green) and the deployment listing shows nothing newer, so
> **running Production still uses the prior value** — an environment change
> does not alter an already-built deployment. **The Secret UI type and the
> value replacement are Brent-supplied facts the names/scopes CLI cannot
> prove** (it shows creation age — 463d — not update time); no value was
> retrieved, displayed, fingerprinted, or tested. **The next successful
> automatic Production deployment from a controlled `main` merge activates the
> replacement; the merge decision is Brent's alone.** M1 changes nothing else:
> recovery crypto stays independently rooted and ACTIVE; **this staging
> operation and the recording session did not inspect, reveal, test, change,
> disable, revoke, delete, or newly invoke any legacy key** — the legacy keys
> remain enabled, the running Production deployment still uses the prior
> value, and unknown external consumers may continue using them; the
> anon→publishable migration (M2) is separate and untouched, and is blocked
> before it starts by the environment-isolation defect that
> `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` span
> Production, Preview and Development (§8.3 rule 2). **Post-deployment
> verification (narrow; NOT run; requires separate explicit Brent
> authorization after a successful exact-SHA deployment):** confirm the
> automatic deployment succeeded on the exact merged SHA, then one
> authenticated `GET /api/auth/my-roles` with an already-existing synthetic
> adult account — a 200 is the bounded proof (the route reads
> `SUPABASE_SERVICE_ROLE_KEY` at module scope and its service-role
> `user_roles` query serves the caller's roles), and that single request is
> itself an application-mediated production read, not a no-database check;
> record status only, never the returned body; no cron invocation, e-mail, or
> mutation, and no direct SQL, Supabase Management API call, or separately
> executed database query — the endpoint's own normal application-level read
> is the only database access involved; **on failure, stop** — disable nothing,
> test no key, and hand Brent the rollback boundary (before the activating
> merge: restore the prior variable value, nothing running changes; after it:
> restore the value and redeploy via the controlled path — legacy keys remain
> enabled throughout, so external consumers are unaffected, though restoring
> re-instates a disclosed credential and roll-forward is preferred). **Even
> after a 200, legacy-key deactivation stays separately blocked** by: the two
> ACTIVE out-of-repo Edge Functions on this project (`generate-scene-images`
> v5, `process-reflexion-pdf` v6 — excluded from M1 because a Vercel variable
> change does not change their environment); the unknown DB-side
> webhooks/pg_net catalog (no tracked migration contains `pg_net`, a Database
> Webhook, or `net.http_*`, and none calls either function — inspect before
> deactivation, not before this Vercel-only step); operator scripts, including
> the uninvoked `scripts/generate-qa-guide.py` (manual `apikey` +
> `Authorization: Bearer`; it must never receive the replacement key without
> separate review); and unknown external consumers, which continue on the
> still-enabled legacy keys. GitHub secrets `STAGING_DB_URL` and
> `SUPABASE_PROJECT_ID` exist, are referenced by no current workflow, and get
> no cleanup here. Row 0.17 below is reconciled to this state; its prior
> wording is preserved verbatim beneath the table.

> **State update — 2026-09-02 (CRED-03B closeout: replacement service key
> ACTIVE in Vercel Production, bounded path verified; supersedes the STAGED /
> NOT ACTIVE status of the update immediately above where they conflict — that
> update and every earlier one are preserved verbatim as historical evidence).**
> Brent merged PR [#69](https://github.com/brentcurtis76/fne-lms/pull/69)
> (approved head `bb5e0c4a2be89ae1eb30c21d4c81b300e8ae6973`) at
> 2026-09-02T00:15:49Z as `8418f89f59a0b11329abe77e4a750a7968ea3ae2`; PR CI run
> [33570032044](https://github.com/brentcurtis76/fne-lms/actions/runs/33570032044)
> all seven jobs green. The post-merge run
> [33574604144](https://github.com/brentcurtis76/fne-lms/actions/runs/33574604144)
> on `8418f89f` was **cancelled** by `ci.yml`'s `cancel-in-progress`
> concurrency when PR [#70](https://github.com/brentcurtis76/fne-lms/pull/70)
> (`fix/proc-contain`, application code) merged 43 seconds later as
> `804794df02b4165f58d89fe77649e1d71423d7dc`; no green run exists on
> `8418f89f` itself. Brent accepted `804794df` — run
> [33574653263](https://github.com/brentcurtis76/fne-lms/actions/runs/33574653263)
> all seven jobs green — and Production deployment `6212873333` (success,
> 00:20:53Z) as the effective post-merge evidence; deployment `6212855368` for
> `8418f89f` had also succeeded (00:19:16Z) before being superseded. Both were
> built after the variable save, so the replacement key is active in the
> Vercel application by configuration. **Verification chronology, preserved:**
> (1) 13:22:00Z — an explicit cookie-only `fetch('/api/auth/my-roles',
> { credentials: 'include' })` from a Browser-pane session returned **401** at
> the route's session precheck and stopped before the service-role path: not
> functional proof, and no evidence about the key either way. (2) 13:29:26Z —
> a landing-page load after the pane had closed produced no `/api/auth/my-roles`
> request: no usable evidence. (3) **Brent-performed canonical verification —
> the successful bounded evidence:** as the established synthetic QA
> administrator `admin.qa@fne.cl`, the application-generated
> `GET /api/auth/my-roles` from `contexts/AuthContext.tsx`, carrying its
> canonical `Authorization: Bearer` session token, returned **HTTP 200** on
> `6212873333` / `804794df` (previously reconfirmed current). Per
> `pages/api/auth/my-roles.ts` the canonical Bearer authentication reached the
> service-role-backed `auth.getUser(token)` validation, then completed the
> service-role `user_roles` query, and the route returned 200. Evidence:
> Brent-supplied Chrome Network screenshot; **the exact request timestamp was
> not captured and is not inferred**; body, headers, token, and cookies were
> not inspected; no retry or further diagnostic request was made. The 401 was
> not transformed into a success; it is superseded as evidence by this separate
> canonical result. **Scope of the 200:** it proves that the replacement
> Production Vercel service key works for this bounded route on deployment
> `6212873333` / SHA `804794df`, on the combined PR #69 + PR #70 deployment;
> it does not isolate M1 from PR #70; it does not prove recovery-e-mail
> behaviour, Edge Functions, database hooks, operator scripts, external
> consumers, or anon/publishable-key compatibility; it does not complete
> rotation and does not authorize deactivating any key. **Two separate future
> tracks, never combined into one action or one authorization:** (A) legacy
> `service_role`-key deactivation requires resolution of both out-of-repository
> Edge Functions, the production webhook/pg_net/pg_cron catalog, operator
> scripts and the two §8.1 local carriers, and outside applications,
> automation, BI tools, mobile builds, and other machines — and its disable
> action requires its own authorization and rollback plan; (B) legacy anon-key
> deactivation requires the separate M2 migration — correct
> Production/Preview/Development isolation, migration of applicable clients to
> the publishable key, verification of external/public consumers, then a
> separately authorized and verified disable of the legacy anon key. Local
> carrier deletion, catalog queries, Edge Function work, M2, GitHub-secret
> cleanup, provider changes, and key disabling remain future proposals only;
> none was executed by this closeout. Row 0.17 below is reconciled to this
> state and its staged wording is preserved verbatim beneath the table; rows
> 0.6/0.7a remain open (the recovery flow is still functionally unproven under
> `RECOVERY_CRYPTO_SECRET`) and row 0.18 is unchanged. **Merging the closeout
> documentation PR triggers another automatic Production deployment; that
> decision is Brent's alone.**

---

## 0. State of play — what is done, and what is emphatically not

The single most useful thing this document can do is stop "the code is merged"
from being read as "the problem is fixed". These are different columns.

| # | Item | State | Where |
| - | ---- | ----- | ----- |
| 0.1 | Application and database **code** for S1–S14 and F1–F6 | **CODE COMPLETE**, unreviewed, unmerged | this branch |
| 0.2 | Local gates (type-check, lint, unit, build, pgTAP, Playwright) | **GREEN** on this branch | review request §5 |
| 0.3 | **Migrations applied to production** | **PENDING — NOT APPLIED.** **Five** of them now. Until they are, every audit write fails, the forced-change boundary does not exist in production *at either layer*, and neither recovery cooldowns/outbox nor retry grants exist there | §2 |
| 0.4 | `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `RESEND_WEBHOOK_SECRET` in Vercel **Production** | **UNVERIFIED.** Vercel was neither queried nor modified in this round; treat all three as unknown until a human verifies them | §3.1 |
| 0.5 | Canonical public origin in Vercel Production | **UNVERIFIED.** Now load-bearing: the code fails loudly instead of trusting `Host` | §3.1 |
| 0.6 | **Controlled send** with a synthetic account | **NOT RUN.** No e-mail has been sent by anyone, from any environment, at any point in this work | §3.3–§3.6 |
| 0.7 | Supabase **SMTP, e-mail templates, redirect allowlist** | **NOT VERIFIED.** The dashboard was never opened. Less load-bearing than it was: no user-facing flow depends on a Supabase-hosted template any more (§4.3) | §4.3 |
| 0.7a | **E-mail delivery, as opposed to provider acceptance** | **CODE READY; LIVE EVIDENCE PENDING.** A signature-verified Resend webhook can now record `delivered`/`bounced`, but the endpoint secret/subscription and a controlled real send have not been configured or verified | §3.3, §3.6 |
| 0.7b | GitHub `main` branch protection requires the exact CI contexts | **PENDING EXTERNAL.** Workflow names and setup docs are reconciled locally; live repository settings were not queried or changed | `docs/ci-setup.md` |
| 0.8 | **Leaked-password protection** | **STILL OFF.** Advisor-confirmed at the time of the original work; not re-checked since | §4.1 |
| 0.9 | **OTP / recovery expiry** | **STILL OVER ONE HOUR.** Same provenance as 0.8 | §4.2 |
| 0.10 | **Rotation of the exposed administrator credential**, and invalidation of its sessions | **NOT DONE — STILL URGENT.** Deleting the page stopped future serving; it did nothing about past exposure | §1.1–§1.2 |
| 0.11 | **CDN / edge cache purge** of the removed routes | **NOT DONE — decision is external** | §1.4 |
| 0.12 | **Git history rewrite** to expunge the credential | **NOT DONE — needs separate explicit approval.** Recommendation is to rotate instead | §1.5 |
| 0.13 | Postgres security patches | **OUTSTANDING** | §4.4 |
| 0.14 | RLS advisor findings (incl. `public.modules`) | **REPORTED, NOT FIXED** — out of scope by decision | §5 |
| 0.15 | **Retention/scrubbing sweep** (`run_auth_security_retention` + daily cron) | **CODE COMPLETE; RUNS NOWHERE YET.** Requires the fifth migration, the deploy, and `CRON_SECRET` in Vercel Production | §7 |
| 0.16 | **Committed API keys removed from the working tree** + CI guard against recurrence | **MERGED** (recorded 2026-09-01): PR #66 at approved head `7334da1b`, merge commit `76a98644`; post-merge CI run `33522718133` all seven jobs green; automatic Production deployment `6204033475` successful. Removal is still not rotation, and history was not rewritten — the credential stays treated as disclosed | §8.1 |
| 0.17 | **Rotation of the exposed `service_role` and legacy anon keys** | **REPLACEMENT ACTIVE IN VERCEL PRODUCTION — BOUNDED PATH VERIFIED (2026-09-02, CRED-03B closeout); ROTATION NOT COMPLETE; LEGACY KEYS ENABLED.** The replacement secret key `fne_lms_vercel_prod_20260831` (Vercel `SUPABASE_SERVICE_ROLE_KEY`, Production only) is active by configuration in Production deployment `6212873333` at `804794df` (PR #69 merged as `8418f89f`; effective post-merge evidence accepted on `804794df` / PR #70). Brent's canonical application-generated `GET /api/auth/my-roles` as `admin.qa@fne.cl` returned **200** (Chrome Network screenshot; exact request timestamp not captured): canonical Bearer authentication → service-role-backed `auth.getUser(token)` validation → service-role `user_roles` query → 200. An earlier cookie-only explicit fetch (401, 13:22:00Z) stopped before the service-role path and is superseded, not converted. The 200 proves only this bounded route on the combined #69/#70 deployment — not recovery e-mail, Edge Functions, database hooks, operator scripts, external consumers, or anon/publishable compatibility — and completes no rotation. Two separate tracks: **`service_role` deactivation** blocked on both out-of-repo Edge Functions, the production webhook/pg_net/pg_cron catalog, operator scripts and the two §8.1 local carriers, and outside consumers, with its own authorization and rollback plan; **anon deactivation** blocked on the separate M2 migration (scope isolation, publishable-key migration, external/public consumer verification, separate authorization and verification). Both legacy keys remain enabled and treated as disclosed | §8.1, §8.3 |
| 0.18 | **Rotation of the historical database password** (`.env.prod` exposure) | **BLOCKED BY DESIGN** until a written external-direct-database-consumer inventory exists. Rotating first would cause an outage | §8.4 |
| 0.19 | **`RECOVERY_CRYPTO_SECRET` cutover** (decouples recovery crypto from the API key) | **ACTIVE — CONFIGURATION CUTOVER (2026-09-01); NOT functionally proven.** PR #67 merged as `593b7df6` and the automatic Production deployment `6205672170` succeeded — the first deployment carrying the secret, so recovery crypto now derives from the independent root (the legacy-fallback code path is retained but no longer selected). Deployment/configuration evidence only: no real recovery e-mail/redemption has been exercised. Post-merge single-query aggregates: 0 envelopes / 0 queued-or-processing / 0 active unexpired grants; latest queued/completed/scrubbed 2026-08-28 (all pre-merge). The immediately-before-merge zero recheck is not evidenced and was not retroactively satisfied; the post-merge check only bounds the risk | §8.5 |

**Historical — superseded row 0.19, preserved verbatim as audit trail.** This is
the row exactly as it stood at `593b7df6` (the STAGED, NOT ACTIVE state before
the 2026-09-01 post-merge update). It is **not** the current state — the ACTIVE
row above is:

```
| 0.19 | **`RECOVERY_CRYPTO_SECRET` cutover** (decouples recovery crypto from the API key) | **STAGED, NOT ACTIVE** (2026-09-01). The secret now exists in Vercel — Sensitive, Production only — but has reached no deployment; the current Production deployment `6204033475` at `76a98644` still uses the legacy fallback, so no cutover has occurred. The next normal `main` deployment activates the independent root and nothing else. Preflight 2026-09-01: queue drained (0 envelopes / 0 queued-or-processing / 0 active unexpired grants; latest activity 2026-08-28) — recheck the zero counts immediately before the merge that deploys | §8.5 |
```

**Historical — superseded row 0.17, preserved verbatim as audit trail.** This is
the row exactly as it stood at `bf5f4c70` (before the 2026-09-01 CRED-03B
staging update). It is **not** the current state — the STAGED row above is:

```
| 0.17 | **Rotation of the exposed `service_role` and legacy anon keys** | **NOT DONE — the substantive remedy.** A replacement secret key `fne_lms_vercel_prod_20260831` exists and is securely held by Brent but is **not installed in Vercel**; `SUPABASE_SERVICE_ROLE_KEY` in Vercel is now scoped to Production only for future deployments (value not opened or changed). Two local carriers still hold the `service_role` value (`fp=0ead88ebeff2`). Treat as disclosed until the dashboard shows the legacy keys disabled | §8.1, §8.3 |
```

**Historical — superseded row 0.17 (staged state), preserved verbatim as audit
trail.** This is the row exactly as it stood at `804794df` (the REPLACEMENT
STAGED, NOT ACTIVE state before the 2026-09-02 closeout). It is **not** the
current state — the ACTIVE row above is:

```
| 0.17 | **Rotation of the exposed `service_role` and legacy anon keys** | **REPLACEMENT STAGED IN VERCEL, NOT ACTIVE (2026-09-01, CRED-03B); ROTATION STILL NOT DONE.** Brent personally updated the existing Vercel variable `SUPABASE_SERVICE_ROLE_KEY` to the replacement secret key `fne_lms_vercel_prod_20260831` — Production only (session-verified by names/scopes listing), UI type Secret (Brent-supplied; not provable by that listing, which shows creation age, 463d). No deployment followed: the running Production deployment `6208254024` at `bf5f4c70` predates the save and still uses the prior value; the next controlled `main` merge activates the replacement. **This staging did not inspect, reveal, test, change, disable, revoke, delete, or newly invoke any legacy key** — both remain enabled and treated as disclosed, the running deployment still uses the prior value, unknown external consumers may still use them, and the two untracked local carriers recorded in §8.1 still hold the legacy value. After activation and the narrow my-roles verification, deactivation remains separately blocked by the two out-of-repo Edge Functions, the unknown DB webhooks/pg_net catalog, operator scripts (incl. `scripts/generate-qa-guide.py`), and unknown external consumers | §8.1, §8.3 |
```

Rows 0.10–0.12 are independent of the merge and should not wait for it. Row 0.3
is the one that must happen *with* it. Rows 0.16–0.19 are the API-key incident
(§8) and are governed separately from the administrator-password incident in
§1 — closing one closes neither the other nor row 0.18.

**On row 0.7a, in plain words.** A repository test cannot prove that mail leaves
the building. `lib/email/invitations.ts` names its immediate outcomes for what is
actually observed — `not_configured`, `link_generation_failed`, `transport_error`,
`provider_rejected`, `provider_accepted` — and the administrator-facing sentence
says *"El proveedor de correo aceptó el mensaje. La llegada a la bandeja del
destinatario no se confirma desde aquí."* Only `/api/webhooks/resend`, after
Svix verification over the raw request bytes, may advance a recovery outbox row
to `delivered` or `bounced`. Activating that evidence still requires the external
Resend/Vercel configuration and controlled send in §3.6.

### 0.1 Local evidence captured for the review packet

The exact implementation head of the **fifth pass** is
`3009af540d35bcc9961319487b3bb6dc6bd290a4` on `fix/auth-sec2`, based on
`4399949942bfcf49dfa8de40cbf7edbf40f0490e`. On 2026-08-19, after a clean local
Supabase reset, the final evidence was:

- type-check and zero-warning lint: exit 0;
- Vitest: 343 files, 7,913 passed, 11 pre-existing `[Z3b, PARKED]` skips,
  zero failures;
- production build: exit 0, Next 14.2.35, 149 static pages, all four
  `/api/auth/recovery/*` routes and `/api/cron/auth-retention` present;
- migration guards: exit 0 across 23 migrations;
- browser boundary: exit 0 across 1,133 source files, 682 browser modules and
  513 entrypoints;
- pgTAP: 16 files, 886 tests, zero failures — run **twice without a reset**,
  and a third time with an unrelated synthetic recovery job left queued;
- recovery concurrency proof: exactly one durable job, one outbox lease and one
  grant lease across independent database connections; a known and an unknown
  candidate both `queued`; a held candidate lock delaying only its own
  candidate; the worker's canonical resolution resolving a mixed-case profile
  and terminally discarding the unknown; also run twice without a reset and
  once with an unrelated queued job, which finished untouched;
- queue concurrency proof: 40 jobs exactly once across two workers;
- mandatory Chromium: 121 passed, zero failed/skipped across all 12 required
  specs (production build and server), including the reload that proves the
  exchanged recovery context survives a refresh; the independent no-skip guard
  also passed; and
- `git diff --check`: exit 0.

The browser run explicitly cleared `RESEND_API_KEY` and
`RESEND_WEBHOOK_SECRET`. It exercised the application-owned captured outbox and
therefore proves neither Resend acceptance nor inbox delivery. Those are the
separate external steps in §3.6.

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

This branch adds **five** migrations. Apply them **in this order** — the third
writes into the table the first creates, the fourth installs the data-layer half
of the forced-change boundary, and the fifth builds on the audit outcome set.

| Version | What it does | Why the order matters |
| ------- | ------------ | --------------------- |
| `20260818120000_security_audit_events.sql` | The audit table: one `CREATE TABLE IF NOT EXISTS`, three indexes, `ENABLE ROW LEVEL SECURITY`, one conditional policy, `REVOKE`/`GRANT`, four `COMMENT`s | Nothing else works without it |
| `20260819120000_forced_password_change_boundary.sql` | The forced-change boundary (F1): a `BEFORE UPDATE` trigger protecting `profiles.must_change_password`, three functions, and `ALTER ROLE authenticator SET pgrst.db_pre_request` + `NOTIFY pgrst` | Independent of the other two |
| `20260819120100_invitation_resend_claim.sql` | `claim_invitation_resend()` (F5) | **References `public.security_audit_events`** — apply after the first |
| `20260819120200_forced_password_change_data_layer.sql` | **The data-layer boundary (R2).** One predicate, one installer function, and a RESTRICTIVE `forced_password_change_guard` policy on **every row-secured table in `public`** plus the browser-reachable tables in `storage` | Must follow `20260819120000` — it reads the same flag, and the two are the two layers of one control |
| `20260819120300_recovery_security_ceremonies.sql` | Private `auth_security` schema, atomic candidate/IP throttles keyed on one-way **candidate fingerprints** (the public transaction never learns whether an account exists), encrypted durable outbox with worker-side account resolution, bounded hashed-grant ledger with `interrupted`/`invalidated` terminal states, a durable **delivery-evidence ledger** that survives webhook/acceptance ordering races, the bounded retention sweep `run_auth_security_retention`, and fourteen service-role-only functions | Uses `security_audit_events` outcomes from the first migration |

All five are additive: **no `DROP`, no `TRUNCATE`, no destructive `ALTER`, and no
statement that turns row-level security off.**

That sentence used to carry a parenthetical excusing a `DROP TRIGGER IF EXISTS`
in the second migration. An independent reviewer was right to reject it: CLAUDE.md
does not have an exception for a `DROP` that is "immediately replaced". The
statement is gone, replaced by a `pg_trigger` existence check, and
`scripts/ci/check-destructive-migrations.mjs` now fails CI on any `DROP`,
`TRUNCATE`, row-security disable or destructive `ALTER` in any migration —
comment-aware, and literal-aware enough to catch `EXECUTE 'DROP …'`. Its negative
controls are in `__tests__/security/destructive-migration-guard.test.ts`.

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

BEGIN;
-- paste the contents of 20260819120200_forced_password_change_data_layer.sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260819120200')
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
-- paste the contents of 20260819120300_recovery_security_ceremonies.sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260819120300')
ON CONFLICT DO NOTHING;
COMMIT;
```

### What the FOURTH migration changes, and why it is the important one

The second migration put the boundary on `pgrst.db_pre_request`, which covers
PostgREST and nothing else. This application also talks to **Storage** and
**Realtime** straight from the browser (`lib/supabaseEnhanced.ts`,
`components/meetings/persistMeeting.ts`, `utils/storage.js`,
`contexts/AvatarContext.tsx`, `utils/activityUtils.ts`,
`utils/messagingUtils-simple.ts`, `lib/realtimeNotifications.js`,
`pages/noticias.tsx`), and neither of those services calls the pre-request hook.
A flagged account could keep uploading files and receiving live rows.

The fourth migration moves the control **under the tables**:

- `public.password_change_gate_ok()` — one predicate, no arguments, reads
  `auth.uid()`. TRUE means "may use protected data".
- a RESTRICTIVE `forced_password_change_guard` policy `FOR ALL TO authenticated`
  on every row-secured table in `public` (232 at the time of writing) and on
  `storage.objects`, `storage.buckets` and the two multipart tables. Restrictive
  policies are ANDed with whatever is already there, so this can only NARROW
  access — it cannot grant anything, and non-flagged traffic is unaffected.
- `public.apply_forced_password_change_guard(schema, table)` — the one line a
  future migration calls for a new table.

**Expect these consequences.** A flagged account will see empty results rather
than 403 from Storage and Realtime, and 403 from PostgREST (where the
pre-request gate still fires first). Ordinary traffic pays one extra evaluation
per query, wrapped in a scalar sub-select so the planner runs it once as an
InitPlan rather than once per row. `service_role` holds `BYPASSRLS`, so every
server endpoint — including the ones that CLEAR the flag — is unaffected.

**What the fourth migration does NOT cover, stated plainly.** A `SECURITY
DEFINER` RPC bypasses row security by definition, so no policy can gate one;
those are covered by the pre-request gate alone, which is why the second
migration stays. The same is true of the 22 legacy tables in `public` that carry
no row security at all (pinned by `supabase/tests/001-rls-enabled.sql`) — a
restrictive policy on a table with row security off would enforce nothing, and
`apply_forced_password_change_guard` raises rather than pretending otherwise.

`ALTER ROLE` and `NOTIFY` are both transactional in PostgreSQL, so the second
migration is safe inside `BEGIN`/`COMMIT` — the NOTIFY is delivered at commit.

### Verify, read-only

```sql
-- the table exists with RLS on
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.security_audit_events'::regclass;

-- two policies after migration four: one permissive admin SELECT policy and
-- one restrictive forced-password guard
SELECT policyname, permissive, cmd, roles, with_check FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'security_audit_events';

-- anon holds nothing; authenticated holds SELECT only
SELECT a.grantee::regrole::text, string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)
  FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE c.oid = 'public.security_audit_events'::regclass
 GROUP BY 1;
```

Expected: `relrowsecurity = t`; permissive
`security_audit_events_admin_select | PERMISSIVE | SELECT | {authenticated}` and
restrictive `forced_password_change_guard | RESTRICTIVE | ALL |
{authenticated}`, both with `with_check` NULL; no ACL row for `anon`, and exactly
`SELECT` for `authenticated`.

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
                     'set_password_change_required', 'claim_invitation_resend',
                     'enqueue_password_recovery', 'claim_password_recovery_outbox',
                     'resolve_password_recovery_outbox',
                     'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
                     'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
                     'finish_recovery_attempt_grant', 'interrupt_recovery_attempt_grant',
                     'invalidate_recovery_attempt_grant', 'peek_recovery_attempt_grant',
                     'mark_recovery_attempt_grant_succeeded',
                     'record_password_recovery_delivery', 'run_auth_security_retention');
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
| every `*_password_recovery*` / `*_recovery_attempt_grant*` helper above | **f** | **f** | **t** |
| `run_auth_security_retention` | **f** | **f** | **t** |

Verify the private schema itself is not a bypass:

```sql
SELECT r.rolname,
       has_schema_privilege(r.rolname, 'auth_security', 'USAGE') AS schema_usage,
       has_table_privilege(r.rolname,
         'auth_security.password_recovery_outbox', 'SELECT') AS direct_outbox_select
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname);
```

Expected: both columns are `false` for all three roles. `service_role` reaches
state only through the fixed `SECURITY DEFINER` functions above.

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

| Name | Value | Notes |
| ---- | ----- | ----- |
| `RESEND_API_KEY` | `re_…` from resend.com → API Keys | Secret. Sending permission is enough. |
| `EMAIL_FROM_ADDRESS` | `Genera <notificaciones@nuevaeducacion.org>` | The domain must be verified in Resend. |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from the recovery webhook endpoint | Secret. Required before `/api/webhooks/resend` exists (otherwise it returns 404). |

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
   - That response confirms only that the request was accepted for processing.
     Mail is dispatched by `/api/cron/recovery-outbox` (scheduled once per
     minute), not on the public request. Known, unknown, malformed, throttled,
     and provider-failure paths deliberately share the same response and floor.
10. The mail must arrive despite the whitespace and casing (this is S9). It is
    sent by **this application** now, not by Supabase — subject *"Restablece tu
    contraseña de Genera"*. If a Supabase-branded reset mail arrives instead,
    something is still calling `resetPasswordForEmail`; stop and escalate.
11. Confirm the link is `…/reset-password?token_hash=…&type=recovery` — not
    `…/auth/v1/verify?…`. Open it → the form appears → set a new password → sign
    in. Opening the page consumes the provider proof into a purpose/user-bound
    15-minute grant held in an **HttpOnly, SameSite=Strict cookie scoped to
    `/api/auth/recovery`** — no page script ever sees it, and the response body
    never carries it. A transient provider 422/5xx/resolved-network failure
    leaves it retryable, up to five leased attempts. A success, expiry, attempt
    exhaustion, or replay must close it. A provider call whose outcome could not
    be confirmed closes the grant as **interrupted** and tells the user to test
    the password they just typed — the honest answer when the mutation may or
    may not have landed.
11a. **Refresh the page after the form appears** (and, separately, close and
    reopen the tab at `/reset-password` with no parameters). The form must come
    back without a new e-mail link: the server-managed cookie is what carries
    the ceremony, and `/api/auth/recovery/context` re-opens it read-only without
    spending an attempt. Abandoning the form ("Volver al inicio de sesión")
    must invalidate the context — a following bare `/reset-password` visit shows
    "Enlace no válido".
12. **Open the same link a second time.** It must now show the invalid-link
    screen: the credential is one-time and the server burned it. If the form
    appears again, the recovery ceremony is not consuming the material and this
    is a finding.
13. Now, **while signed in**, navigate directly to `/reset-password` with no
    parameters. You must see **"Enlace no válido"**, not a password form. Then
    try `/reset-password#access_token=cualquiera&refresh_token=cualquiera&type=recovery`.
    That must ALSO be refused — an access token is not recovery proof. If either
    shows a form, stop and escalate.

### 3.6 Provider evidence — the step that separates "accepted" from "delivered"

14. In **Resend → Webhooks**, register
    `https://www.nuevaeducacion.org/api/webhooks/resend` for exactly
    `email.delivered` and `email.bounced`. Copy its signing secret into
    `RESEND_WEBHOOK_SECRET`, redeploy through the normal `main` path, and send a
    signed test event. Invalid signatures must return 401; a missing secret must
    make the route return 404.
15. In the **Resend dashboard → Emails**, find the three messages this exercise
    produced (invitation, access notice, recovery). Record for each one:
    - the provider message id (the recovery outbox keeps it for webhook
      correlation; it is not copied into request logs or an HTTP response);
    - the provider's own status — **delivered**, **bounced**, **complained** or
      still queued.

    For the recovery message, query `security_audit_events`: `provider_accepted`
    must precede a webhook-evidenced `delivered` or `bounced`, and every public
    recovery-request row must have `actor_user_id IS NULL`. A provider API 2xx
    alone must never create `delivered`.

16. If any message bounced, do not retry blindly: check the sending domain's SPF
    / DKIM / DMARC records (§3.2) before sending again.

### 3.7 Clean up

17. Delete the synthetic account: **Admin → Registros públicos** → the row →
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
- **Email Templates → Reset Password** — **no user-facing flow depends on this
  template any more.** Both halves of recovery are now built and sent by this
  application:

  | Flow | Who sends it | What the link looks like |
  | ---- | ------------ | ------------------------ |
  | Invitation / access grant | this application, via `lib/email/invitations.ts` | `/reset-password?token_hash=…&type=recovery` |
  | Resend invitation | this application, same module | same, a FRESH credential each time |
  | Self-service "¿Olvidaste tu contraseña?" | this application, via `POST /api/auth/recovery-request` | same |

  Self-service used to go through `supabase.auth.resetPasswordForEmail()` from
  the browser, which sent Supabase's template with Supabase's link — landing as
  an implicit `#access_token=` fragment or a PKCE `?code=` depending on this
  dashboard setting. **Neither of those shapes is accepted any more**, and that
  is deliberate: an implicit fragment carries an ORDINARY ACCESS TOKEN, which no
  server-side check can distinguish from a login, and a PKCE code can only be
  exchanged with a verifier held in the browser. Recovery proof must be
  server-verifiable, purpose-bound and one-time, and `token_hash` +
  `verifyOtp({ type: 'recovery' })` is the only shape that is.

  `/reset-password` refuses everything else with a plain es-CL message
  ("Este enlace usa un formato que ya no aceptamos por seguridad…").

  **If you nonetheless want the Supabase template aligned** — belt and braces,
  for any provider-initiated recovery that might be triggered from the dashboard
  — set the body to link at
  `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`.
  A template emitting `{{ .ConfirmationURL }}` or a raw `{{ .Token }}` will
  produce a link this application refuses.
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
see §0. Work through it in order; the direct API, Storage, Realtime, catalog and
provider-evidence checks distinguish "the code shipped" from "the control is
enforced":

- [ ] The seven diagnostic routes return `404` (§1.6).
- [ ] `security_audit_events` exists with RLS and the expected ACL (§2).
- [ ] Grant a synthetic signup; the response reports provider acceptance (or a
      precise configuration/rejection outcome), never confirmed delivery (§3.3).
- [ ] The invitation e-mail shows the button **and** the visible URL fallback.
- [ ] The recovery link opens a working form; a bare `/reset-password` visit while
      signed in shows "Enlace no válido" (§3.5 step 12).
- [ ] Resend accepts the message and the 10-minute cooldown holds (§3.4); inbox
      delivery remains a separate webhook/inbox check.
- [ ] The Resend webhook is registered with `email.delivered` and
      `email.bounced`, its signing secret is set, and a signed test event writes
      the precise outcome while a tampered event writes nothing (§3.6).
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
- [ ] **R1 — an ordinary access token is NOT recovery proof.** Sign in normally
      as the synthetic account, take that access token, and post it the way the
      previous version of the endpoint would have accepted it:

      ```
      curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$APP/api/auth/recovery/complete" \
        -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
        -d '{"newPassword":"OtraClaveSintetica2026"}'
      ```

      Expected **401**. Then confirm the account's password did **not** change by
      signing in with the old one. If this returns 200, the recovery ceremony is
      accepting sessions as proof and this is the S12 defect, live. (The handler
      reads no `Authorization` header at all — the only identity it accepts is
      the HttpOnly recovery cookie minted by `/api/auth/recovery/exchange`.
      Placing the access token IN that cookie must also fail: it does not verify
      as a grant.)
- [ ] **R2 — the boundary covers Storage.** With the account flagged again, use
      its token against the Storage API for a bucket it would otherwise be able
      to use: `POST $SUPABASE_URL/storage/v1/object/list/<bucket>` must return no
      rows, and an upload must fail. Clear the flag and repeat: both must work.
      (Storage does not go through PostgREST, so the pre-request hook has never
      been on this path — the restrictive policy from `20260819120200` is what
      does this.)
- [ ] **R2 — the boundary covers Realtime.** Subscribe to `postgres_changes` on a
      published table with the flagged token, insert a row for that account with
      the service role, and confirm nothing is delivered. Repeat unflagged and
      confirm it is.
- [ ] **R2 — the catalog invariant holds in production.** Run:

      ```sql
      SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM pg_policy po
                          WHERE po.polrelid = c.oid
                            AND po.polname = 'forced_password_change_guard');
      ```

      Expected: **zero rows**. Any table named here is row-secured and outside the
      boundary, which is the exact shape of the finding that produced this
      migration.
- [ ] **The e-mail column that no test can fill.** §3.6: open the Resend
      dashboard and record, per message, the provider id and whether it was
      **delivered** or **bounced**; confirm the recovery audit agrees with the
      verified webhook. Do not report "e-mail works" until this box is ticked
      with real evidence and a real inbox — and use only a
      synthetic recipient, never a student, family or minor address.
- [ ] **The retention sweep runs and reports.** After at least one day in
      production, invoke `/api/cron/auth-retention` with the cron secret (or
      wait for the 03:30 UTC schedule) and confirm the JSON response reports
      per-table deletion/scrub counts. Then verify no terminal outbox row older
      than the §7 windows still carries an envelope:

      ```sql
      SELECT count(*) FROM auth_security.password_recovery_outbox
       WHERE state <> 'queued' AND state <> 'processing'
         AND (request_envelope IS NOT NULL OR message_envelope IS NOT NULL)
         AND completed_at < now() - interval '1 day';
      ```

      Expected: **0** (the worker scrubs on terminal transition; the sweep is
      the belt behind it).

---

## 7. Retention and scrubbing — bounded, indexed, observable

This section is the normative statement of how long recovery and audit state
lives. `pages/api/cron/auth-retention.ts` cites it, and the periods below are
what `run_auth_security_retention` implements. Changing a period is a code
change to that function (and, for the audit period, to the constant in the cron
handler) — not an ad-hoc production `DELETE`.

**The compliance retention period for `security_audit_events` is two years
(730 days).** Rationale: the audit trail exists to reconstruct account-security
incidents, and Chilean data-protection practice under Ley 21.719 expects
security logs to be kept no longer than needed for that purpose. Two years
covers a full school-year cycle plus the following one's audit; nothing in the
table contains an address, link, token, or password, so the residual risk of
retention is identity-event metadata only. An operator who needs a different
period changes `AUDIT_RETENTION_DAYS` in `pages/api/cron/auth-retention.ts`
(the SQL guardrail accepts 90–3700 days) and records the decision here.

| State | Scrubbed | Deleted |
| ----- | -------- | ------- |
| Encrypted request/message envelopes | **On terminal transition** (`discarded`, `provider_accepted`, `provider_rejected`, `dead` — the moment retries can no longer need them), with a sweep-side belt for any terminal row that still carries one | with their row |
| Terminal outbox rows | — | 30 days after completion |
| Recovery grants | — | 7 days after closing (`succeeded`/`expired`/`exhausted`/`interrupted`/`invalidated`); a grant still `active` in the ledger is removed 1 day past its hard expiry |
| IP budget buckets | — | 1 day after their window opened |
| Pending webhook delivery evidence | — | 7 days after being applied; **30 days if never matched** (bounded retention for unmatched provider events) |
| `security_audit_events` | — | **730 days** (see above) |

Operational shape:

- **Out of the request path.** Nothing on the public request, exchange, or
  completion path deletes anything. The sweep is `run_auth_security_retention`,
  invoked only by `/api/cron/auth-retention` (Vercel cron, `30 3 * * *`,
  authorized by `CRON_SECRET` exactly like the other cron routes).
- **Bounded.** Every statement deletes at most `p_limit` rows (5,000 per table
  per run; SQL refuses values outside 1–50,000), so a backlog degrades into
  multiple visible runs rather than one long lock-holding transaction.
- **Indexed.** Each retention predicate has a partial index
  (`password_recovery_outbox_completed_idx`,
  `recovery_attempt_grants_expiry_idx`,
  `password_recovery_delivery_events_seen_idx`,
  `password_recovery_ip_buckets_window_idx`) — the sweep does not seq-scan the
  hot tables.
- **Observable.** The function returns per-table counts and the cron route
  serves them in its JSON response, so "the sweep deleted nothing for a week"
  is a visible statement, not an absence.

Until the fifth migration is applied AND the branch is deployed AND
`CRON_SECRET` exists in Vercel Production, none of this runs anywhere — the
same "code complete ≠ deployed" rule as §0.

---

## 8. Supabase API key exposure (CRED-01) — separately governed

> **Scope of the repository correction (branch `fix/cred-guard`).** Repository
> hygiene and a guard, nothing else. No key was rotated, no provider was
> contacted, no environment variable was changed, no deployment was triggered,
> and no credential value was read, printed, copied or tested by the work that
> produced this section. Everything in §8.3 below is *pending human action*.

This is a **different incident** from §1. Section 1 concerns an administrator
**password** compiled into a public page. This section concerns **Supabase API
keys** — an anon key and a `service_role` key — and a **historical database
password**. They are tracked separately, they have different blast radii, and
closing one closes none of the others. The four live credential workstreams are:

| Workstream | Nature | Governed in |
| --- | --- | --- |
| Administrator password | Password in a public bundle | §1.1–§1.2 |
| Database password | Historical `.env.prod` exposure | §8.4 |
| API keys (anon + `service_role`) | This section | §8.1–§8.3 |
| Seeded simulation plan | Separate plan document | `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md` — **untracked** in the canonical checkout as of 2026-08-31; not committed to `main`, so it is absent from any worktree |

### 8.1 What was exposed, and where it still lives

**Committed to the repository (now removed).** Ten orphaned helper scripts
carried credentials as string literals. Two of them —
`scripts/fix-qa-workspace.js` and `scripts/seed-hour-tracking-qa-scenarios.mjs` —
carried a **`service_role`** key, which bypasses RLS entirely. Seven
`src/tests/*.ts` scripts and `lib/supabase-debug.ts` carried the production
project URL and a legacy anon key; `lib/supabase-debug.ts` additionally logged
request headers. None had any inbound reference. All ten are deleted on
`fix/cred-guard`, and `scripts/ci/check-committed-secrets.mjs` now fails CI if a
`service_role` key is ever committed again.

Removal from the working tree does **not** remove the value from Git history, and
history was deliberately not rewritten. The key must be treated as disclosed for
as long as it remains valid; the remedy is rotation (§8.3), not history surgery.

**Still present locally, outside Git.** Two carriers hold a `service_role` key on
this machine. Neither is tracked; both are ignored:

| Carrier | Line | Fingerprint |
| --- | --- | --- |
| `.env.local` | 11 | `0ead88ebeff2` |
| `.claude/settings.local.json` | 11 | `0ead88ebeff2` |

The fingerprint is a truncated SHA-256 of the value, not the value. It appears
twice in `.claude/settings.local.json:11`, once as an `apikey:` header and once
as an `Authorization: Bearer` header, inside a pre-approved `curl` permission
entry — so any agent session reading that file obtains a `service_role`
credential, and a blanket `Bash(curl:*)` allow sits alongside it.

**Historical.** A `.env.prod` file previously carried a **database password**.
Its value is not reproduced here and is not required for any step below.

### 8.2 What the local evidence does and does not prove

Both carriers show the **same fingerprint**, so they hold the same value. That is
**strong configuration evidence** — it establishes what this machine is
configured to send, and it means rotating one carrier without the other would
leave a stale credential behind.

It is **not** provider confirmation. Matching local files cannot establish that
Supabase currently accepts this key, that it has not already been rotated, or
that it was ever used by anyone else. Only the Supabase Dashboard can show which
keys are live. Nothing in this runbook authorizes sending the key anywhere to
find out: **an authentication attempt with a suspect credential is not a
diagnostic, it is a use of that credential**, it appears in provider logs as a
successful or failed sign-in, and it can convert a suspected exposure into a
confirmed one. Do not test the key. Read the dashboard instead.

### 8.3 Environment discipline — where keys are allowed to exist

These rules apply from now on, and supersede the "all environments" phrasing in
§1.3 for any future key rotation:

1. **Production credentials belong in Vercel Production only.** Not in Preview,
   not in Development, not in a local file that outlives the task that needed it.
2. **Preview, Development, and any future staging use isolated, non-production
   Supabase projects with their own credentials.** A preview deployment must not
   be able to reach production data at all — that is a project boundary, not a
   key-scoping question.
3. **Default local development must not retain production credentials.** Point
   `.env.local` at a local stack (`supabase status`). If a task genuinely needs
   production access, it is a named, time-bounded exception that ends by removing
   the value again — not the resting state of the machine.
4. **`RECOVERY_CRYPTO_SECRET` is generated, never copied.** It is a new
   high-entropy value, independent of every API key past and present, and it is
   server-only: never a `NEXT_PUBLIC_*` name, never surfaced in
   `next.config.js`. See §8.5.

### 8.4 Database password — blocked on a consumer inventory

The historical database password is **not** to be rotated as part of this work.
A database password is not like an API key: anything holding a direct Postgres
connection string breaks the moment it changes, and this project has accumulated
external consumers over time (analytics, migration tooling, one-off scripts,
scheduled jobs, anything run from an operator's machine).

**Required before rotation:** a written inventory of every external direct-database
consumer, each with an owner and an update path. Rotating first and discovering
consumers afterwards converts a contained exposure into an outage. This item stays
open until that inventory exists.

### 8.5 Recovery encryption is no longer coupled to the API key

Recovery envelopes and retry grants were encrypted under a key derived from
`SUPABASE_SERVICE_ROLE_KEY`, which meant rotating that API key silently
invalidated every queued recovery envelope and outstanding grant. That coupling
made a routine rotation a user-facing event — precisely the pressure that keeps a
suspect key in service.

`lib/auth/recovery-crypto.ts` now selects key material in this order:

1. an explicit secret argument (tests only);
2. `RECOVERY_CRYPTO_SECRET`;
3. `SUPABASE_SERVICE_ROLE_KEY` (legacy fallback, retained).

The fallback is deliberate: where `RECOVERY_CRYPTO_SECRET` is unset, derivation is
byte-identical to before, so **merging this change alters no production behaviour
on its own**. A secret shorter than 32 characters is treated as unconfigured, and
a *non-blank but too-short* `RECOVERY_CRYPTO_SECRET` fails closed rather than
silently falling back — a badly configured dedicated secret should surface.

**Cutover is operational, not automatic, and it is not free.** Envelopes sealed
under the old root cannot be opened under the new one. A cutover therefore needs
**both**:

- a newly generated high-entropy `RECOVERY_CRYPTO_SECRET` (never a copy of any
  API key), set in Vercel Production only; and
- a **drained recovery queue** — anything still queued at the moment of the switch
  becomes undecryptable.

`__tests__/lib/auth/recovery-crypto-secret.test.ts` proves each selection branch,
the missing-secret failure, and — by running the same seal/rotate/open sequence
with and without the dedicated secret — that rotating only the API key no longer
invalidates envelopes.

### 8.6 Verification, and what is explicitly not authorized

- **Verification is dashboard state.** Legacy anon and `service_role` keys are
  confirmed disabled by reading the Supabase Dashboard.
- **No old-key production request is authorized**, at any stage, by anyone, for
  any purpose — including "just to check whether it still works". See §8.2.
- Application-level verification uses **synthetic adult accounts** only, never
  student or other minor data (Ley 21.719).
- Production is reached **only** through the controlled `main` merge path. `main`
  auto-deploys; no manual Vercel deployment is authorized here.

### 8.7 Current production reference point

As of 2026-08-31, GitHub reports for `main` at
`49814091a2df69cc8e4c02beba8014bb5aa0694c`:

- CI run **33400056341** — successful;
- Vercel Production deployment **6182645350** — successful.

This **supersedes** the production-deployment statement in the `CI-MAINT-01`
entry of `PROJECT_STATE.md`, which cites CI runs `33274215527` / `33274578596`
and Production deployment `6160000598` for merge commit
`2b7be4cfe8819e07f53b3b9ff734b8a2dacd5894`. That entry is **not** rewritten: it
was accurate for the merge it describes, and it remains the audit trail for that
merge. It is simply no longer the current head.

Recorded from GitHub-reported state. This runbook section asserts nothing about
whether any credential is currently accepted by Supabase — see §8.2.
