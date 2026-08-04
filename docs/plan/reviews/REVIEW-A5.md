# CODEX REVIEW — A5 final (rounds 1–2)

VERDICT: FAIL

Reviewed `phase/a5-lead-api` at `b65dfa8` against merge base `fb61b69`,
`docs/plan/prompts/a5-1.md`, the Phase A5 criteria, D-03, D-12, the r2
`sourcePath` prompt/decision, the review request, and both PM-verification
ledger entries. Round 1 traced every write and mail path against the schema;
round 2 challenged the concurrency, raw-input, deployment, and integration
boundaries independently. The sequential happy paths are well covered, but
three release-blocking contracts are not met.

BLOCKING:

- **[B1] The 24-hour auto-reply guarantee is not concurrency-safe.** A5 [A7]
  says an auto-reply is "not re-sent more than once per 24h per lead"
  (`docs/plan/prompts/a5-1.md:44-51`). The route decides from the previously
  read `existing.brochure_sent_at`, sends the external message, and only then
  performs an unconditional timestamp update
  (`pages/api/pasantias/lead.ts:255-270`). Two requests can both read null (or
  the same expired timestamp), both send, and then both stamp; a successful
  send followed by a failed stamp also makes the next request send again.
  This is not bounded to one duplicate: N concurrent requests can produce N
  messages. The sequential 1-hour/25-hour tests
  (`__tests__/api/pasantias-lead.test.ts:552-573`) cannot exercise that race.
  The executor and PM ledger entries acknowledge the read-then-write design,
  but a PM verification cannot waive a frozen acceptance criterion, and no
  owner amendment does so. Close this with a durable atomic claim/outbox or
  provider-idempotency design and a simultaneous-request proof; alternatively,
  obtain an explicit owner amendment that changes A5 to a best-effort bound.

- **[B2] r2 validates a trimmed value, not the raw `sourcePath`, and rewrites
  accepted input instead of storing it verbatim.** `sanitizeSourcePath()` calls
  `value.trim()` before its length, control-character, and path checks, then
  returns the trimmed value (`lib/pasantias/leads.ts:174-191`). Consequently
  leading/trailing spaces and even leading/trailing CR/LF are silently removed
  and accepted. That contradicts the r2 ledger's binding statements that the
  check runs on the RAW string and returns the browser value verbatim or null
  (`docs/plan/LEDGER.md:998-1014`), as well as the review request's same claim
  (`docs/planning/reviews/fase-a5-review-request.md:182-217`). The test suite
  currently blesses the rewrite
  (`__tests__/lib/pasantias-leads.test.ts:312-314`); its CR/LF cases cover only
  embedded controls. Validate the untouched string (including the 200-character
  cap and all whitespace/control checks), return that exact string or null, and
  add route/helper tests for leading and trailing CR, LF, tabs, and spaces.

- **[B3] The reviewed head is not integrated with its A4 prerequisite and is
  not a mergeable, CI-green PR.** Phase A5 declares A4 as a dependency
  (`docs/plan/PLAN.md:63`), and the email hard-codes A4's
  `/api/pasantias/brochure` endpoint (`lib/pasantias/emails.ts:28-29,88-90`),
  but neither this branch nor current `main` contains
  `pages/api/pasantias/brochure.ts`; it exists only on the unmerged A4 branch.
  The A5 build therefore registers the lead endpoint while the mailed brochure
  target is absent. Independently, GitHub reports PR #40 as `CONFLICTING` at
  head `b65dfa8`; its check rollup contains only the two Vercel contexts, not
  the repository's required type-check, lint, Vitest, pgTAP, RLS guard, and
  Playwright checks. Land/reconcile A4 first, resolve the current `main`
  conflicts without losing either docs lineage, then obtain a complete green
  CI rollup on the reconciled A5 head.

SHOULD-FIX:

- **[S1] An auto-reply preparation exception suppresses the independent
  internal notification.** `buildBrochureUrl()` can throw when a production
  origin is unavailable or invalid (`lib/utils/app-url.ts:81-102`), and it is
  evaluated inside the same `try` that later calls `sendLeadNotification`
  (`pages/api/pasantias/lead.ts:254-276`). The catch therefore skips the
  notification entirely. Ordinary Resend failures do continue because
  `sendSoft` absorbs them, but this preparation path does not. Isolate the two
  best-effort operations and test that an auto-reply setup exception still
  attempts the internal notification.

- **[S2] The committed full-suite evidence is not reproducible from the
  reviewed head.** The r1 review request records **255 files / 4,067 tests** and
  266 leak-scanned files
  (`docs/planning/reviews/fase-a5-review-request.md:62-69`); the r2 ledger records
  **255 / 4,084** (`docs/plan/LEDGER.md:998-1006`). A clean run at `b65dfa8`
  produced **221 files / 3,874 tests** and 265 scanner files, while the targeted
  A5 count does reproduce at 92/92. Replace the stale/shared-worktree counts
  with evidence generated from the final reconciled commit so the review
  record identifies what was actually tested.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **D-12's live CHECK is respected by every route write shape.** The schema
  admits only false/null/null or true/non-null/non-null
  (`supabase/migrations/20260731140500_add_pasantias_leads.sql:90-95`). The
  insert and update helper emits exactly those complete triples, or omits all
  three to preserve an earlier true (`pages/api/pasantias/lead.ts:84-105`). The
  route tests pin both insert shapes and both resubmission directions, and the
  independent pgTAP cases accept full opt-in evidence while rejecting both
  invalid half-shape directions
  (`supabase/tests/030-pasantias-leads-rls.sql:390-457`).
- **The other explicitly requested security/behavior checks pass.** New and
  repeat submissions compare as the exact same `200 {success:true}` response
  (`__tests__/api/pasantias-lead.test.ts:356-367`), with the honeypot using the
  same body. The transition test independently enumerates the full 4×4 D-03
  product (`__tests__/lib/pasantias-leads.test.ts:26-90`). Every user-controlled
  HTML interpolation is escaped, and both generated subjects are checked for
  CR/LF (`__tests__/api/pasantias-lead.test.ts:605-643`). Aside from [B2], r2's
  allowlist rejects schemes, `//host`, `/\\host`, embedded controls, unrooted
  paths, and over-cap values, and its update shape preserves stored attribution
  when a new valid path is absent.
- **Reviewer-run evidence at `b65dfa8`:** targeted A5 suites **92/92**; TypeScript
  clean; lint clean with zero warnings; full Vitest **221 files / 3,874 tests**;
  production build passed (**156/156** static pages); price-leak scan passed
  over **265 files**; pgTAP **7 files / 171 assertions**; migration RLS guard
  passed; `git diff --check` passed. Local Playwright was not run because A5's
  frozen prompt assigns form e2e to A6b, but the PR-level Playwright check is
  still mandatory under the repository CI contract and is part of [B3].
- Two rounds are exhausted with numbered residue `[B1]`–`[B3]` and
  `[S1]`–`[S2]`; Phase A5 is not DONE and PR #40 must not merge in this state.
