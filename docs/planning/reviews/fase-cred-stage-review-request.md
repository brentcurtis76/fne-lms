# Review request — CRED-02B: stage recovery-crypto activation (documentation only)

- **Branch:** `docs/cred-stage` (worktree `/Users/brentcurtis/dev/wt/cred-stage`)
- **Base:** `76a986441e93477df27e8b2b5d4888cd4949c6e7` — the CRED-01 PR #66 merge
  commit, confirmed byte-equal to `origin/main` by a read-only fetch at task
  start on 2026-09-01. The task's hard precondition was to stop if `origin/main`
  differed from this SHA; it did not.
- **Commits:** exactly **one** — `docs(cred): stage recovery crypto activation`.
  One commit is a task requirement, not a convenience: the diff against the base
  must be exactly the three files listed in §3, nothing else.
- **Nothing pushed, no PR opened, no provider contacted.** This branch exists
  only locally. Every provider/production fact recorded by this change was
  supplied and verified externally by Brent/Codex; the session that wrote it
  contacted no provider, no database, and read no credential value.

## 1. Objective

Record, in the repository's governed state documents, the externally verified
state transition around the credential incident — and nothing else:

1. **CRED-01 is merged and deployed.** PR
   [#66](https://github.com/brentcurtis76/fne-lms/pull/66) (`fix/cred-guard`),
   approved head `7334da1b0f17e2344e83f90b4670301b0ba954d7`, merge commit
   `76a986441e93477df27e8b2b5d4888cd4949c6e7`; post-merge `main` CI run
   [33522718133](https://github.com/brentcurtis76/fne-lms/actions/runs/33522718133)
   passed all seven jobs; automatic Vercel Production deployment `6204033475`
   succeeded. The previous `PROJECT_STATE.md` claim that CRED-01 was unmerged is
   stale and is superseded.
2. **The credential is still exposed.** Merging CRED-01 fixed the repository
   only. The legacy `service_role`/anon keys are not rotated and not disabled; a
   replacement Supabase secret key named `fne_lms_vercel_prod_20260831` exists
   and is securely held by Brent but is **not installed in Vercel**.
3. **CRED-02 is STAGED, NOT ACTIVE.** `RECOVERY_CRYPTO_SECRET` now exists in
   Vercel as a Sensitive (Secret) variable, Production only, but has reached no
   deployment: the current Production deployment is still `6204033475` at
   `76a98644`, which predates the variable, so production still derives recovery
   crypto from the legacy `SUPABASE_SERVICE_ROLE_KEY` fallback. No cutover has
   occurred. `SUPABASE_SERVICE_ROLE_KEY` in Vercel is additionally scoped to
   Production only for future deployments; its value was not opened or changed.
4. **Production read-only preflight (2026-09-01, by Brent/Codex):** migration
   `20260819120300` recorded: true; recovery tables/function present: true;
   envelope rows: 0; queued/processing rows: 0; active unexpired grants: 0;
   latest recovery activity: 2026-08-28.

### In scope

- `PROJECT_STATE.md` — new authoritative 2026-09-01 CRED-01/CRED-02 entry at the
  top of `## Meta`; the 2026-08-31 CRED-01 entry gains a historical-supersession
  marker in its heading (repo convention: supersede without deleting the audit
  trail — cf. the W-B2b-01 and W-PC-06 entries).
- `docs/runbooks/auth-security.md` — a dated **2026-09-01 state update**
  blockquote in the header area (same placement as the 2026-08-25 one), and
  rows **0.16, 0.17, 0.19** of the §0 state-of-play table reconciled with the
  facts above. Row 0.18 untouched. §8.7's older production reference point is
  superseded by the dated update but **not rewritten**.
- `docs/planning/reviews/fase-cred-stage-review-request.md` — this file.

### Explicitly out of scope (verified untouched by the diff)

Application code, tests, CI workflows, package files, migrations, Supabase
configuration, the secret guard (`scripts/ci/check-committed-secrets.mjs` and
its allowlist), every credential value, and all provider settings. The task also
performed no rotation, no revocation, no key installation, no deployment, and no
database access of any kind.

## 2. The consequence a reviewer must weigh: merging this PR deploys

**This documentation PR is not inert.** `main` auto-deploys to Vercel
Production. Because `RECOVERY_CRYPTO_SECRET` is already staged in Vercel
(Production only), the automatic deployment triggered by merging **this** PR —
or any other `main` merge that lands first — will be the first deployment that
carries the variable, and `lib/auth/recovery-crypto.ts` will begin selecting the
independent root instead of the legacy `SUPABASE_SERVICE_ROLE_KEY` fallback.
That is the intended activation checkpoint, and it activates **only** the
independent recovery-crypto root: it does not install the replacement Supabase
secret key, does not rotate or disable any legacy key, and does not revoke
anything — service-key replacement remains a later, separately authorized step.

**Mandatory immediately-before-merge condition:** re-run the read-only
zero-count preflight (recovery envelope rows, queued/processing rows, active
unexpired grants — all must still be 0) in the moments before merging, because
envelopes sealed under the legacy root become undecryptable once the new root
is active (runbook §8.5). The 2026-09-01 counts recorded here age from the
moment they were taken; they authorize nothing at merge time by themselves.

**The merge decision is Brent's alone.** Nothing in this branch, this file, or
the recorded facts authorizes anyone else to merge, push, or deploy.

## 3. Files changed (all documentation; no code path executes any of this)

| File | Change | Risk |
| ---- | ------ | ---- |
| `PROJECT_STATE.md` | +1 authoritative Meta entry; historical marker added to the 2026-08-31 CRED-01 heading (body untouched) | LOW as text — but it is the governed state record: a transcription error here misleads every future session |
| `docs/runbooks/auth-security.md` | +1 dated state-update blockquote; rows 0.16/0.17/0.19 replaced with reconciled current state | Same as above; row 0.19's wording gates a real operational cutover |
| `docs/planning/reviews/fase-cred-stage-review-request.md` | new file | LOW |

## 4. Gate evidence

Run on the exact tree of this branch's single commit, in the worktree, with
dependencies from a fresh `npm ci`. Per the standing worktree rule the
production build used command-scoped synthetic localhost
`NEXT_PUBLIC_SUPABASE_*` values (never the production env file); no gate reads
any real credential.

| Gate | Command | Result |
| ---- | ------- | ------ |
| Secret guard | `npm run guard:secrets` | PASS — 2,456 tracked paths, content scanned from the Git index only, 0 findings |
| Types | `npm run type-check` | PASS — exit 0 |
| Lint | `npm run lint -- --max-warnings=0` | PASS — exit 0, zero warnings |
| Unit/integration | `npm test` | PASS — 371 files, 8,515 passed, 11 skipped, 0 failures |
| Build | `npm run build` | PASS — exit 0 (Next 14.2.35; compiled successfully, 149 static pages) |
| Whitespace | `git diff --check` | clean |

Sequencing disclosure (honesty over tidiness): the type-check, lint, unit and
build gates were captured on a tree identical to the committed one except that
their numeric results had not yet been inserted into **this** file; after
inserting them, the content-dependent gates (`guard:secrets`, `git diff
--check`) were re-run last on the exact committed tree. Markdown is not an
input to tsc, ESLint (`.js/.jsx/.ts/.tsx` only), Vitest, or `next build`.

`test:db` and `e2e` were not run: no database object, migration, or UI surface
is touched — the diff is three Markdown files.

## 5. Where a reviewer should push hardest

1. **Transcription accuracy of the external facts.** Every SHA, PR number, CI
   run id, deployment id, variable name, key name, count, and date in the three
   files was hand-copied from Brent's task statement. A single transposed digit
   becomes the governed record. Diff each figure in §1/§2 of this file against
   `PROJECT_STATE.md` and the runbook update — they must agree with each other
   and with the task statement.
2. **Does any sentence overclaim?** The rows and entries must be readable only
   as: correction merged; secret staged, not active; rotation/revocation/key
   installation NOT done. If any phrasing could be quoted to justify touching a
   Supabase key or skipping the pre-merge recheck, that is a finding.
3. **Supersession semantics.** The 2026-08-31 PROJECT_STATE entry and runbook
   §8.7 are superseded but deliberately not rewritten. Verify the historical
   marker changed only the old entry's heading parenthetical and that §8.7 is
   byte-identical.
4. **Row 0.19's operational load-bearing wording.** It now instructs a
   pre-merge zero-count recheck. Check it cannot be read as "preflight already
   satisfied, merge freely" — the recorded counts are dated and explicitly
   non-authorizing.
5. **The activation framing in §2.** I state that the *next* normal `main`
   deployment activates the root, and that this PR's merge is expected to be
   that deployment unless another merge lands first. Confirm the docs nowhere
   promise *which* merge deploys first, only what happens when one does.

## 6. Known limitations

- **Nothing here is independently verified by the writing session.** All
  provider/production facts (Vercel variable state and scoping, deployment ids,
  CI outcome, preflight counts, existence and custody of
  `fne_lms_vercel_prod_20260831`) are recorded as supplied and verified by
  Brent/Codex. The session ran only local git/read/gate operations plus one
  read-only `git fetch` of `origin/main`.
- **The preflight counts are a snapshot.** They were true at the 2026-09-01
  preflight; they are not a standing guarantee, hence the mandatory recheck.
- **Runbook §8.7 and the 2026-08-31 PROJECT_STATE entry now carry stale-but-
  preserved reference points by design**; readers must follow the supersession
  pointers. This is the repo's established trade-off for audit-trail
  preservation.
- **Activation timing is not controlled by this branch.** Any `main` merge that
  lands before this one activates the staged secret first; the documentation is
  written to stay correct in that case, but the review-request framing assumes
  this PR is the likely trigger.
