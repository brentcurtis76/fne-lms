# ZOOM schema-only release candidate — review request

Unit: ZOOM-RELEASE-PREFLIGHT v1 (same-initial recovery 1). Executor: Claude
RELEASE_DB_EXECUTOR. Reviewer: sole Codex PM. This candidate is local only: no
push, PR, merge, deploy or production database change has been performed.

## Identity

- Branch `codex/zoom-schema`, worktree
  `/Volumes/T7_Scratch/dev-worktrees/zoom-schema-20260910`.
- Base: fresh `main` `c36498d6d640199a3f6ee5494c17ca0a510c1be0` (remote main
  re-observed 2026-09-10 18:39Z; CI run 34474499047 success 7/7 jobs; latest
  Production deployment 6371237292 success at the same SHA).
- Commits: 2. `5876fe5e0a9fc4c26d591450c408132b53a0457c` (tree
  `8a704ef1e30b7af69912aa3253506196912f0685`) carries the eight source paths;
  the following commit adds only this document.

## Objective and scope

Plan §7 step 2: a reviewed schema-only unit that can merge before any
application consumer, because no deployed code calls the new database objects.

In scope — exactly the eight reviewed ZOOM-B2a paths, byte-identical to accepted
B2a `71ac054c99fd5a09d57cd5cbf362206169911af7` and to cumulative source
`85cfc2c6e2c305eb9d421959ff7caad2d51c5921`:

| Risk | Path | sha256 |
|---|---|---|
| High (schema) | `supabase/migrations/20260910120000_zoom_explicit_roster.sql` | `d5bc59112baad181927f20f36eb1dd537fcf83d12239e24f01f945cc088ca6ca` |
| Medium (tests) | `supabase/tests/081-zoom-explicit-roster.sql` | `ecead22cbddbadb83bd366021160958c8e9bd2f53e3a9cf1151dce52d951949f` |
| Medium (tests) | `supabase/tests/063-fne-zoom-operator-tenant.sql` | `d6988002be70dedff7443e039b67f7918a114b5fa637d6732624029ac2de914d` |
| Medium (CI proof) | `scripts/ci/zoom-roster-concurrency-proof.mjs` | `8dd3f0f18130352110001107d7b6a82611095d9034811969906edf027eaac9d7` |
| Medium (CI) | `.github/workflows/ci.yml` | `8800c1902533d396169322bcd193a4c0c6595e7d556775267c044e8c03cd32a5` |
| Low | `package.json` (one npm script) | `aa2b087845c2301b4ae1d9b9cddb2da27f1325c8699429c31a603f1f591bf659` |
| Low (docs) | `docs/ci-setup.md` | `453d88c00615b9deb851cef2f224c9a7695f2689f8a6f688fbee45588f0f5677` |
| Low (docs) | `docs/planning/reviews/fase-zoom-int-b2a-review-request.md` | `2574a3e7c76828847960f1314df1ef560494fe40bd5a7ddec1d7adba78be3169` |

Out of scope: every B2b/B3/B4 API, UI, type, service and test path; Unit A
(already applied to production 2026-09-03, reported); any migration comment
edit (the known stale two-line comment stays untouched so the bytes remain the
reviewed ones); production apply, configuration and data classification.

## Provenance evidence (fresh, executor-run)

- `main` changed none of the eight paths between B2a's parent
  `b17a68393dc7cd3a6ccfed9fffa3252c7e97fb46` and `c36498d6` (0 paths), so the
  paths were taken from `85cfc2c6` without discarding any main change.
- `git patch-id --stable`: B2a commit patch, `c36498d6..85cfc2c6` restricted to
  the eight paths, and the staged candidate all equal
  `59c3246fd7788fd23fd6f5d63f7bba5a6a0a7541`. Diff: 8 files, +2079/−5.
- Candidate `supabase/` tree `caac30403009c49a99d2a3065be530ed0acaf1c8` and
  `scripts/ci/` tree `d34e48798fba1e37975c4ae6548cdbd3d461cb9a` equal those of
  INT1 `04f27d91`/`3dc270a7` and of `85cfc2c6`; `package.json` blob
  `f05989e9…` and `ci.yml` blob `08a89962…` are identical as well. The
  candidate differs from `04f27d91` only by B4 application/test paths and B4's
  review document.

## Test evidence and its exact coverage

Fresh on candidate `5876fe5e` (Node 22.22.0, C locale, no install):
`check-rls-migrations.sh`, `check-destructive-migrations.mjs`,
`check-committed-secrets.mjs` (2659 tracked paths, 0 findings),
`check-action-runtimes.mjs`, `check-browser-boundaries.mjs` (run from the
byte-identical script in the retained source clone because the worktree has no
`node_modules`; 1160 files, OK) and `git diff --check c36498d6 HEAD`: all exit 0.

Source-exact prior evidence, applicable because the inputs are byte-identical:

- Codex PM INT1 on `3dc270a7`: `supabase test db` 43 files / 4265 assertions
  PASS (063, 079, 081 green); `npm run test:zoom-roster-concurrency` 13/13
  scenarios PASS. Same `supabase/` and `scripts/ci/` trees as this candidate.
- B2a cumulative review `APPROVED_WITH_NOTES` on `71ac054c` (same eight blobs).
- Reported INT1 executor application gates on `04f27d91` (a superset: this
  candidate plus B4): type-check, lint, 434 files / 9950 unit tests, synthetic
  production build — all exit 0. `__tests__/scripts/ci-action-runtime-guard.test.ts`
  reads the same `ci.yml` blob.

Not run on this candidate: type-check, lint, unit, build, `supabase test db`,
E2E (no dependency install on the constrained disk; the retained local stack is
CUA-contaminated and must not run E2E). The seven hosted CI checks on the
schema PR and after merge remain REQUIRED before any activation; they are not
waived by the evidence above.

UI: not applicable — the candidate ships inert schema, tests and CI only.

## Areas the reviewer should scrutinize hardest

1. `CREATE OR REPLACE FUNCTION public.sync_session_attendees_on_gc_change`
   replaces an existing production function. Its expected pre-B2a body comes
   from the squashed local baseline; production retains original history and
   was not inspected live. The apply proposal fails closed on any body mismatch.
2. `enforce_operator_roster_approval_gate` is SECURITY DEFINER and must see the
   whole roster: the hosted owner (`postgres`) must have BYPASSRLS and the RPCs
   must stay service_role-only. Verified locally; unverified on production.
3. The new Gate 3 CI step (`test:zoom-roster-concurrency`) becomes part of the
   required hosted checks on every later PR.
4. Ledger entry shape (open decision D2 in the apply proposal: `statements`
   recorded as NULL unless the PM decides to mirror the Unit A row).
5. Live production preflight was not executed (see limitations); the candidate
   must not be applied on the strength of local evidence alone.

## Known limitations and deferred items

- Read-only production access was unavailable without a hosted mutation: the
  Supabase CLI's IPv4 path would create a temporary login role. Unit A live
  definitions, B2a absence, ledger history, school 19 zero-incompatible data,
  QA 257/259 finance counts, the internal flag, host pool and job health are
  therefore unverified live. `ZOOM_SCHOOL_ALLOWLIST` is absent from every
  Vercel environment; flag values are unknown (names only).
- Inherited, unchanged: stale two-line migration comment (documentation
  hygiene, no byte change here); B3 N1 fail-old wording precision; baseline
  authenticated UPDATE 42P17 backlog; credential-exposure assessment and
  CI-MAINT-01 branch-protection debt.
