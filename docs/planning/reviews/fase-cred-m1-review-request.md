# Review request — CRED-03B (M1): replacement service key staged in Vercel (documentation only)

- **Branch:** `docs/cred-m1` (worktree `/Users/brentcurtis/dev/wt/cred-m1`, outside iCloud)
- **Base:** `bf5f4c70a9d56b8b3da4e5fe96a9eae574fc2ef9` — the PR #68 merge commit,
  confirmed byte-equal to `origin/main` by a read-only fetch at task start on
  2026-09-01. The task's hard precondition was to stop if `origin/main`
  differed; it did not.
- **Commits:** exactly **one** — `docs(cred): stage M1 service-key activation`.
  The diff against the base must be exactly the three files in §4, nothing else.
- **Nothing pushed, no PR opened, no provider modified by this session.** The
  provider change this branch documents — the Vercel variable update — was
  performed personally by Brent before the task started and is recorded as a
  Brent-supplied fact. The session ran only read-only verification (git fetch,
  a names/scopes-only `vercel env ls`, and read-only GitHub deployment/CI
  queries) and then wrote documentation. No credential value was read,
  displayed, pulled, fingerprinted, or tested; `.env.local`, `.env.prod`, and
  `.claude/settings.local.json` were not opened; no API-key listing/reveal
  endpoint was called; no database was queried.

## 1. Objective

Record, in the governed state documents, exactly this transition and nothing
more:

1. **CRED-03B is STAGED, NOT ACTIVE.** Brent personally updated the existing
   Vercel variable `SUPABASE_SERVICE_ROLE_KEY`: UI type **Secret**, Environment
   **Production only**, value = the replacement secret key named
   `fne_lms_vercel_prod_20260831`, saved successfully, clipboard cleared, no
   deployment or redeployment triggered.
2. **Current Production still uses the prior value**, because an
   environment-variable change does not alter an already-built deployment: the
   newest Production deployment remains `6208254024` at `bf5f4c70` (success),
   and the deployment listing shows nothing newer than it.
3. **The next successful automatic Production deployment from a controlled
   `main` merge will cause the Vercel application to start using the
   replacement key.** The merge decision is Brent's alone.
4. Recovery crypto remains independently rooted and **ACTIVE**; M1 does not
   change `RECOVERY_CRYPTO_SECRET` (re-confirmed Production-only).
5. **This staging operation and the recording session did not inspect,
   reveal, test, change, disable, revoke, delete, or newly invoke any legacy
   key.** The legacy keys remain enabled: the running Production deployment
   still uses the prior value, and unknown external consumers may continue
   using them. The anon→publishable migration (M2) is separate and untouched; the
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   environment-isolation defect (all three scopes) must be resolved before M2.
6. The M1 exclusions and the blockers to eventual legacy-key deactivation are
   restated without drift (Edge Functions ×2, unknown DB webhooks/pg_net
   catalog, `scripts/generate-qa-guide.py`, unknown external consumers, unused
   GitHub secrets).

## 2. Verification performed before any edit (all read-only)

| Step | Method | Result |
| ---- | ------ | ------ |
| `origin/main` = `bf5f4c70…` | `git fetch` + `rev-parse` | confirmed exact |
| Source checkout untouched | worktree created at `/Users/brentcurtis/dev/wt/cred-m1`; no edit in the canonical checkout; its untracked files preserved | confirmed |
| Vercel variable scopes | `vercel env ls` (names/scopes/age only; the value column renders only the literal placeholder "Encrypted") | `SUPABASE_SERVICE_ROLE_KEY` → **Production** only, age column 463d; `RECOVERY_CRYPTO_SECRET` → **Production** only, 6h; `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Production, Preview, Development, 463d; `CRON_SECRET` → all three scopes, 291d |
| Current Production deployment | `gh api …/deployments` (4 newest) + statuses | newest = `6208254024`, Production, sha `bf5f4c70`, created 2026-09-01T19:01:55Z, latest status **success**; the three next-newest (`6207178646` Preview `38561e31`; `6205672170` Production `593b7df6`; `6205523903` Preview `b530d877`) all predate it — **no deployment followed Brent's environment-variable save** |
| Post-merge CI | `gh run view 33546783387` | completed / success on `bf5f4c70` (all seven jobs green, verified earlier the same day in CRED-03A) |

**What the CLI cannot prove, stated deliberately.** The names/scopes-only
listing confirms the Production-only scope. It does **not** and cannot confirm
the Secret/Config UI type or the value replacement itself: the CLI's age column
reflects creation time (463d), not update time, and no value-bearing read is
authorized. Those two facts — UI type Secret, value replaced with
`fne_lms_vercel_prod_20260831` — plus the clipboard clearance are recorded
strictly as **Brent-supplied facts**, and every sentence in the three edited
documents keeps that attribution.

### Code citation backing the verification design

`pages/api/auth/my-roles.ts` reads `SUPABASE_SERVICE_ROLE_KEY` at module scope
(line 7) and serves the caller's active roles through a service-role client
(its own docstring: "Uses service role key to bypass RLS restrictions"). Both
of its auth paths — Bearer token and session cookie — end in service-role
reads, so one authenticated 200 from it after the activating deployment is a
bounded application-level proof that the deployed application can use the
variable's current value. This was verified by reading the file at the base
SHA; the endpoint was **not** called. That request, when it is eventually
made, is itself an **application-mediated production read** — the route's
service-role `user_roles` query — not a no-database check; it has NOT been
run and requires separate explicit Brent authorization after a successful
exact-SHA deployment.

## 3. Scope

### In scope

- `PROJECT_STATE.md` — new authoritative CRED-03B entry at the top of
  `## Meta`; the CRED-02 closure entry's heading gains a historical-supersession
  marker for its key-custody statements and production reference point (body
  untouched; supersede-without-deleting convention).
- `docs/runbooks/auth-security.md` — a dated 2026-09-01 CRED-03B state-update
  blockquote appended after the post-merge one (both earlier blockquotes
  preserved verbatim); row **0.17** reconciled to REPLACEMENT STAGED / ROTATION
  STILL NOT DONE; the prior row 0.17 text preserved **verbatim** in a labeled
  "Historical — superseded" fenced block beside the existing row 0.19 block.
- `docs/planning/reviews/fase-cred-m1-review-request.md` — this file.

### Explicitly out of scope (verified untouched by the diff)

Application code, tests, workflows, package files, migrations, Supabase
configuration, the secret guard, every credential value, and all provider
settings. The session performed no push, PR, merge, deployment, redeployment,
Vercel or Supabase change, key installation/rotation/disabling (Brent's own
prior save is documented, not performed, here), anon-key change, database
query, cron invocation, recovery e-mail, or production application test.

## 4. Files changed

| File | Change | Risk |
| ---- | ------ | ---- |
| `PROJECT_STATE.md` | +1 CRED-03B Meta entry; heading marker on the CRED-02 closure entry | Governed state record — a transcription error or an overclaim here misleads every future session |
| `docs/runbooks/auth-security.md` | +1 dated blockquote; row 0.17 reconciled; prior row 0.17 preserved verbatim | Row 0.17 wording gates the eventual rotation; the staged/active boundary must be unmistakable |
| `docs/planning/reviews/fase-cred-m1-review-request.md` | new file | LOW |

## 5. Post-deployment verification protocol and rollback boundary (defined here; NOT run; requires separate explicit Brent authorization after a successful exact-SHA deployment)

1. Confirm the automatic Production deployment succeeded on the **exact merged
   SHA** (GitHub deployment + status, read-only).
2. Using an **already-existing synthetic adult test account only**, perform
   **one** authenticated `GET /api/auth/my-roles`. A **200** is the bounded
   application-level proof (see §2's code citation). That single request is
   itself an application-mediated production read through the route's
   service-role `user_roles` query.
3. Record **only** status success/failure. Never record or expose the returned
   user id, roles, school, generation, community, email, cookies, or token.
4. Do not invoke crons, send e-mail, or mutate data, and run no direct SQL,
   Supabase Management API call, or separately executed database query as part
   of this verification — the endpoint request's own normal application-level
   read is the only database access involved. (Scheduled crons run on their own cadence regardless;
   their logs are Brent-observable but are not part of this bounded protocol.)
5. **If the call fails: stop.** Disable nothing; test no key directly. The
   rollback boundary for Brent: **before** the activating merge, restoring the
   prior variable value changes nothing that is running; **after** it, restore
   the value and redeploy through the controlled `main` path. Legacy keys
   remain enabled throughout M1, so external consumers are unaffected at every
   stage — but restoring re-instates a disclosed credential, so roll-forward is
   preferred.
6. **Even after a 200, legacy-key deactivation remains separately blocked**
   until the two out-of-repo Edge Functions, the DB webhooks/pg_net catalog,
   operator scripts, and external consumers are each resolved.

## 6. Gate evidence

Run in the worktree on this branch's tree, dependencies from a fresh `npm ci`;
the production build used command-scoped synthetic localhost
`NEXT_PUBLIC_SUPABASE_*` values (never a real env file). `test:db` and E2E were
not run: the diff is three Markdown files and no DB/API/UI code changes.

| Gate | Command | Result |
| ---- | ------- | ------ |
| Secret guard | `npm run guard:secrets` | PASS — 2,458 tracked paths (this file staged), content scanned from the Git index only, 0 findings |
| Types | `npm run type-check` | PASS — exit 0 |
| Lint | `npm run lint -- --max-warnings=0` | PASS — exit 0, zero warnings |
| Unit/integration | `npm test` | PASS — 371 files, 8,515 passed, 11 skipped, 0 failures (214.7s) |
| Build | `npm run build` | PASS — exit 0 (Next 14.2.35 production build; command-scoped synthetic localhost `NEXT_PUBLIC_SUPABASE_*` values) |
| Whitespace | `git diff --check` | clean |

Sequencing disclosure: type-check, lint, unit and build are captured on a tree
identical to the committed one except for the insertion of their numeric
results into this file; the content-dependent gates (`guard:secrets` with all
three files staged, `git diff --check`) are re-run last on the exact committed
tree. Markdown is not an input to tsc, ESLint, Vitest, or `next build`.

## 7. Where a reviewer should push hardest

1. **Transcription accuracy.** Every SHA, deployment id, run id, variable name,
   key name, scope, and age appears in up to three places (PROJECT_STATE, the
   runbook blockquote/row, this file); all copies must agree exactly.
2. **The staged/active boundary.** No sentence may be quotable as "the
   replacement key is live", "rotation is done", or "verification passed".
   Activation is future-tense and merge-gated everywhere; verification is
   protocol-only.
3. **Brent-supplied vs session-verified separation.** The Secret UI type, the
   value replacement, and the clipboard clearance must always read as
   Brent-supplied; the only session-verified Vercel facts are names, scopes,
   and ages — and the documents must nowhere claim the CLI proved the update
   (it cannot; the age column still reads 463d).
4. **Boundedness of the verification protocol.** The my-roles citation must
   match the code at base (`pages/api/auth/my-roles.ts` line 7 module-scope env
   read; service-role client on both auth paths); the protocol must record
   status only, forbid PII/token capture, and terminate on failure without
   touching any key.
5. **Supersession semantics.** The two earlier runbook blockquotes and the
   CRED-02/CRED-01 PROJECT_STATE entry bodies must be byte-identical to base;
   the old row 0.17 must appear verbatim in the historical block; markers may
   touch only the one heading parenthetical.

## 8. Known limitations

- **Nothing here proves the replacement key works.** The staged value has
  reached no deployment and no request; the bounded proof exists only as a
  protocol.
- **The CLI cannot see the update.** If Brent's save had silently failed, the
  names/scopes listing would look identical. The record is explicit that the
  value replacement is a Brent-supplied fact.
- **A failing activation surfaces as 500s, not as a diagnosable key
  identity.** The protocol's stop rule exists because the session may not test
  keys directly under any failure.
- **The my-roles proof is deliberately narrow.** It exercises one
  service-role read path; it does not exercise storage, GoTrue admin,
  `zoom_internal`, or the recovery pipeline. Broader functional checks
  (including any recovery e-mail) remain separately authorized work.
- **External consumers remain unknown** and continue on the still-enabled
  legacy keys; the GitHub secrets `STAGING_DB_URL` / `SUPABASE_PROJECT_ID`
  remain parked, unreferenced, and untouched.

## 9. The consequence a reviewer must weigh: merging this PR deploys

`main` auto-deploys to Vercel Production, and the staged variable is already
saved. Therefore the automatic deployment triggered by merging **this**
documentation PR — or any other `main` merge that lands first — will be the
first deployment built with the replacement `SUPABASE_SERVICE_ROLE_KEY`, i.e.
**merging is the activation step for M1**. That is the intended checkpoint,
and it activates only the Vercel application's use of the replacement key: it
disables no legacy key, changes no anon key, and touches no Edge Function,
database, or external consumer. **The merge decision — and its timing relative
to other pending merges — is Brent's alone.** Nothing in this branch
authorizes it.

## 10. Independent review — round 1 (two findings, both corrected)

Reviewed head: `db4093e669895a179b2d60ed32e26dae0b50adb0`. Per instruction the
corrections are an **additive** commit on top of that head — nothing was
amended or rewritten, so the reviewed head remains in the branch history
exactly as reviewed. No SHA, deployment/run id, variable/key name, scope, age,
STAGED/NOT ACTIVE status, Brent-supplied attribution, activation boundary,
rollback boundary, blocker, historical blockquote/body, or preserved row 0.17
was changed; only the two findings below.

### R1-1 (precision) — the my-roles request is not "no database query"

The protocol said the verification would "query no database". That is
imprecise: `GET /api/auth/my-roles` performs an application-mediated
production read through its service-role `user_roles` query. **Correction:**
every such statement in `PROJECT_STATE.md`, the runbook blockquote, and this
file (§2 code citation, §5 heading and items 2/4) now states the exact
boundary — no direct SQL, no Supabase Management API call, no separately
executed database query; the single endpoint request itself performs the
normal application-level read — and states that the request has NOT been run
and requires separate explicit Brent authorization after a successful
exact-SHA deployment. Status-only evidence, the synthetic-adult-account
restriction, no capture of the returned body, and stop-on-failure are
preserved unchanged.

### R1-2 (overclaim) — "no legacy key was … otherwise used" was absolute

The records claimed no legacy key had been "used", which the session cannot
know: the running Production deployment still uses the prior value, and
unknown external consumers may continue using the enabled legacy keys.
**Correction:** every absolute claim — the `PROJECT_STATE.md` heading fragment
and body, the runbook blockquote and current row 0.17, and §1 item 5 here —
is now task-scoped: this staging operation and the recording session did not
inspect, reveal, test, change, disable, revoke, delete, or newly invoke any
legacy key; the legacy keys remain enabled, the running deployment still uses
the prior value, and unknown external consumers may continue using them. The
commit message of `db4093e6` still carries the superseded absolute wording;
it is history and is not rewritten — this section is the correction of
record.

### Round-1 gate evidence

| Gate | Command | Result |
| ---- | ------- | ------ |
| Secret guard | `npm run guard:secrets` | PASS — 2,458 tracked paths, index-only scan, 0 findings |
| Types | `npm run type-check` | PASS — exit 0 |
| Lint | `npm run lint -- --max-warnings=0` | PASS — exit 0, zero warnings |
| Unit/integration | `npm test` | PASS — 371 files, 8,515 passed, 11 skipped, 0 failures (300.0s) |
| Build | `npm run build` | PASS — exit 0, 149/149 static pages (command-scoped synthetic localhost `NEXT_PUBLIC_SUPABASE_*` values) |
| Whitespace | `git diff --check` | clean |

Same sequencing disclosure as §6: the content-dependent gates are re-run last
on the exact committed tree.
