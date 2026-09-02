# Review request — CRED-03B closeout: replacement service key ACTIVE, bounded path verified (documentation only)

- **Branch:** `docs/cred-m1-close` (worktree `/Users/brentcurtis/dev/wt/cred-m1-close`, outside iCloud)
- **Base:** `804794df02b4165f58d89fe77649e1d71423d7dc` — the PR #70 merge commit,
  confirmed byte-equal to `origin/main` by a read-only fetch at task start on
  2026-09-02; the task's hard precondition was to stop if it had moved, and it
  had not. No `docs/cred-m1-close` branch, remote ref, or worktree existed.
- **Commits:** exactly **one** — `docs(cred): close out M1 service-key activation`.
  The diff against the base must be exactly the three files in §4, nothing else.
- **Nothing pushed, no PR opened, no provider contacted, no database queried,
  no credential inspected, no local carrier removed, no key changed.** The
  functional verification this record closes out was performed by Brent; every
  provider/production fact is attributed to its source below.

## 1. Objective

Record the transition from STAGED / NOT ACTIVE to **ACTIVE in Vercel
Production with the bounded application path verified**, exactly as evidenced,
and restate — without softening — what that evidence does not establish:
rotation is not complete, both legacy keys remain enabled, and their two
deactivation tracks stay separately blocked.

## 2. Evidence

### 2.1 Merge and CI

| Fact | Source | Value |
| ---- | ------ | ----- |
| PR #69 merged | `gh api pulls/69` (read-only) | merged by `brentcurtis76` at 2026-09-02T00:15:49Z; merge commit `8418f89f59a0b11329abe77e4a750a7968ea3ae2`, parents `bf5f4c70` + approved head `bb5e0c4a2be89ae1eb30c21d4c81b300e8ae6973` |
| PR CI on the approved head | run [33570032044](https://github.com/brentcurtis76/fne-lms/actions/runs/33570032044) | completed / success — all seven jobs |
| Post-merge CI on `8418f89f` | run [33574604144](https://github.com/brentcurtis76/fne-lms/actions/runs/33574604144) | **cancelled** — six jobs cancelled, Migration safety guard success. Cause: `ci.yml` `concurrency: group: ci-${{ github.ref }}, cancel-in-progress: true`, triggered by the PR #70 merge 43 seconds later. **No green run exists on `8418f89f` itself.** |
| Superseding merge | `git log`, `gh pr list` | PR [#70](https://github.com/brentcurtis76/fne-lms/pull/70) (`fix/proc-contain`, 13 files of application code) merged as `804794df02b4165f58d89fe77649e1d71423d7dc` at 00:16:32Z; first parent `8418f89f` |
| Post-merge CI on `804794df` | run [33574653263](https://github.com/brentcurtis76/fne-lms/actions/runs/33574653263) | completed / success — all seven jobs |
| Effective post-merge evidence | Brent's decision (2026-09-02) | `804794df` + Production deployment `6212873333` accepted as the effective post-merge evidence for CRED-03B |

### 2.2 Deployments

| Deployment | Environment | SHA | Status |
| ---------- | ----------- | --- | ------ |
| `6212855368` | Production | `8418f89f` | success, 2026-09-02T00:19:16Z — corresponds exactly to the merge commit; superseded ~1.5 min later |
| `6212873333` | Production | `804794df` | success, 2026-09-02T00:20:53Z — **current Production**; reconfirmed current by read-only metadata at 13:21:48Z and 13:28:57Z, and reconfirmed by Brent before his manual check |

Both were built after Brent's variable save, so the replacement key is active
in the Vercel application by configuration.

### 2.3 Functional verification — chronology preserved

| # | When | What | Result | Evidential weight |
| - | ---- | ---- | ------ | ----------------- |
| 1 | 2026-09-02T13:22:00Z | Explicit `fetch('/api/auth/my-roles', { credentials: 'include' })` from a Browser-pane session (no `Authorization` header) | **401** from the route's session precheck (`createPagesServerClient` → `getSession`) — stopped **before** the service-role path | Not functional proof; no evidence about the replacement key either way |
| 2 | 2026-09-02T13:29:26Z | Landing-page load at `/` after the Browser pane had closed | No `/api/auth/my-roles` request produced | No usable evidence |
| 3 | exact request timestamp **not captured** (not inferred) | **Brent-performed canonical verification:** signed in as the established synthetic QA administrator `admin.qa@fne.cl`; the application-generated `GET /api/auth/my-roles` from `contexts/AuthContext.tsx` with its canonical `Authorization: Bearer` session token | **HTTP 200** on `6212873333` / `804794df` | **The successful bounded evidence** |

Source for row 3: Brent-supplied Chrome Network screenshot. Response body,
headers, token, and cookies were not inspected. No retry or further diagnostic
request was authorized or made. The 401 in row 1 was not transformed into a
success and did not retroactively become one; it is superseded as evidence by
the separate canonical result in row 3.

**What the 200 path is, per `pages/api/auth/my-roles.ts` at `804794df`:** the
canonical Bearer authentication reached the service-role-backed
`auth.getUser(token)` validation; it then completed the service-role
`user_roles` query (with its school/generation/community joins); the route
returned 200. This is deliberately not reduced to "one service-role read".

### 2.4 Attribution

Session-verified (read-only git/gh/deployment metadata): every SHA, run id,
deployment id, timestamp and status in §2.1–§2.2, plus rows 1–2 of §2.3.
Brent-supplied: the acceptance decision in §2.1, the canonical 200 in row 3
of §2.3 and its account, and the earlier Vercel variable facts (UI type
Secret, value = `fne_lms_vercel_prod_20260831`) recorded at staging.

## 3. Scope

### In scope

- `PROJECT_STATE.md` — new authoritative CRED-03B closeout entry at the top of
  `## Meta`; the CRED-03B staging entry's heading gains a historical marker for
  its STAGED/NOT ACTIVE status (body untouched).
- `docs/runbooks/auth-security.md` — a dated 2026-09-02 closeout blockquote
  appended after the CRED-03B staging blockquote (every earlier blockquote
  preserved verbatim); row **0.17** reconciled to ACTIVE / BOUNDED PATH
  VERIFIED / ROTATION NOT COMPLETE / LEGACY KEYS ENABLED; the staged row 0.17
  preserved **verbatim** in a new labeled historical block beside the existing
  0.19 and original-0.17 blocks. Rows 0.6/0.7a remain open; row 0.18 unchanged.
- this file.

### Explicitly out of scope (verified untouched by the diff)

Application code, tests, workflows, package files, migrations, Supabase
configuration, the secret guard, every credential value, provider settings,
the two local carriers, GitHub secrets, both legacy keys. **Future proposals
only, none executed:** local carrier deletion, the production
webhook/pg_net/pg_cron catalog query, Edge Function disposition, the M2
anon→publishable migration, GitHub-secret cleanup, any provider change, any
key disabling.

## 4. Files changed

| File | Change | Risk |
| ---- | ------ | ---- |
| `PROJECT_STATE.md` | +1 closeout Meta entry; historical marker on the staging entry's heading | Governed state record — an overclaim on the 200's scope or on rotation status here misleads every future session |
| `docs/runbooks/auth-security.md` | +1 dated blockquote; row 0.17 reconciled; staged row 0.17 preserved verbatim | Row 0.17 wording gates the two deactivation tracks; they must read as separate and blocked |
| `docs/planning/reviews/fase-cred-m1-close-review-request.md` | new file | LOW |

## 5. What the 200 proves, and what it does not

**Proves:** the replacement Production Vercel service key works for this
bounded route (`/api/auth/my-roles`: Bearer → `auth.getUser(token)` →
`user_roles` query → 200) on deployment `6212873333` / SHA `804794df`, on the
combined PR #69 + PR #70 deployment.

**Does not:** isolate M1 from PR #70; prove recovery-e-mail behaviour, Edge
Functions, database hooks, operator scripts, external consumers, or
anon/publishable-key compatibility; complete rotation; authorize deactivating
any key.

## 6. The two key tracks — separate, never combined

**Track A — legacy `service_role`-key deactivation** requires resolution of:
both out-of-repository Edge Functions (`generate-scene-images` v5,
`process-reflexion-pdf` v6); the production webhook/pg_net/pg_cron catalog
(aggregate-only query, not yet authorized); operator scripts (incl.
`scripts/generate-qa-guide.py`) and the two §8.1 local carriers; outside
applications, automation, BI tools, mobile builds, and other machines. Its
disable action requires its own authorization and rollback plan.

**Track B — legacy anon-key deactivation** requires the separate M2 migration:
correct Production/Preview/Development isolation (today
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` span all three
scopes); migration of applicable clients to the publishable key; verification
of external/public consumers; then a separately authorized and verified disable
of the legacy anon key.

These tracks are never a single "disable both" action and their
authorizations are never combined.

## 7. Gate evidence

Run in the worktree on this branch's tree, dependencies from a fresh `npm ci`;
the production build used command-scoped synthetic localhost
`NEXT_PUBLIC_SUPABASE_*` values only (never a real env file). `test:db` and
E2E were **not** run: the change is Markdown-only — no database object,
migration, API route, or UI surface is touched — so those gates have no input.

| Gate | Command | Result |
| ---- | ------- | ------ |
| Secret guard | `npm run guard:secrets` | PASS — 2,464 tracked paths (this file staged; count reflects PR #70's added files), content scanned from the Git index only, 0 findings |
| Types | `npm run type-check` | PASS — exit 0 |
| Lint | `npm run lint -- --max-warnings=0` | PASS — exit 0, zero warnings |
| Unit/integration | `npm test` | PASS — 374 files, 8,566 passed, 11 skipped, 0 failures (253.0s; counts reflect the tests PR #70 added) |
| Build | `npm run build` | PASS — exit 0, 149/149 static pages (command-scoped synthetic localhost `NEXT_PUBLIC_SUPABASE_*` values) |
| Whitespace | `git diff --check` | clean |

Sequencing disclosure: type-check, lint, unit and build are captured on a tree
identical to the committed one except for the insertion of their numeric
results into this file; the content-dependent gates (`guard:secrets` with all
three files staged, `git diff --check`) are re-run last on the exact committed
tree. Markdown is not an input to tsc, ESLint, Vitest, or `next build`.

## 8. Where a reviewer should push hardest

1. **Transcription accuracy** — every SHA, run id, deployment id, timestamp,
   status, account, and key name appears in up to three places; all copies must
   agree exactly, including the cancelled run and the two deployments.
2. **Scope of the 200** — no sentence may be quotable as "rotation complete",
   "keys rotated", "external consumers verified", or as authorization to
   disable a key; the 200 must always be bounded to this route on the combined
   #69/#70 deployment.
3. **Chronology honesty** — the 401 must read as a superseded non-result that
   stopped before the service-role path, never as something that became a
   success; the landing attempt must read as no evidence; the exact timestamp
   of the canonical 200 must read as not captured, never inferred.
4. **Attribution and path precision** — Brent-supplied vs session-verified must
   hold in every sentence, and the 200 path must be stated as Bearer →
   service-role-backed `auth.getUser(token)` → service-role `user_roles` query
   → 200 (verify against `pages/api/auth/my-roles.ts` at `804794df`).
5. **Track separation and supersession** — Track A and Track B must never be
   merged into one action or one authorization; every earlier blockquote, entry
   body, and preserved row (0.19, original 0.17, staged 0.17) must be
   byte-identical to base; rows 0.6/0.7a open and 0.18 unchanged.

## 9. Known limitations

- The canonical 200's exact request timestamp was not captured; the record
  says so rather than inferring one.
- No green CI run exists on the merge commit `8418f89f` itself; the accepted
  evidence is the superseding green run on `804794df`, a Brent decision.
- The verified deployment combines PR #69 (documentation) with PR #70
  (application code); M1 is not isolated.
- The recovery flow remains functionally unproven under
  `RECOVERY_CRYPTO_SECRET` (rows 0.6/0.7a).
- External consumers, Edge Functions, the database catalog, operator scripts,
  and the local carriers remain unresolved; both legacy keys remain enabled and
  treated as disclosed.

## 10. The consequence a reviewer must weigh: merging this PR deploys

`main` auto-deploys to Vercel Production. Merging this documentation-only PR
triggers another automatic Production deployment — no behaviour change is
expected from three Markdown files, but it is a deployment nonetheless, built
with the already-active replacement key. **The merge decision, and its timing
relative to other pending merges, is Brent's alone.** Nothing in this branch
authorizes it, and nothing in it authorizes any key deactivation.
