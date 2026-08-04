<<<<<<< HEAD
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
=======
# CODEX REVIEW — A5 final (two rounds)

VERDICT: FAIL

A5 implements the public lead route, D-03 transition matrix, split-consent
tuples, anti-enumeration response, escaped transactional emails, and the r2
`source_path` write path substantially as specified. It is not mergeable
because the optional-marketing guarantee is only sequential: an unchecked
resubmission can use a stale `marketing_opt_in = false` read to overwrite a
concurrent opt-in with the CHECK-valid false tuple. That is a silent opt-out
outside the unsubscribe flow, exactly what A5 [A5] and D-12 prohibit.

BLOCKING:

- [B1] A stale unchecked resubmission can clear a concurrent marketing opt-in —
  `pages/api/pasantias/lead.ts:84-105,171-176,236-244` —
  `marketingColumns()` omits the three marketing columns only when the earlier
  SELECT already saw `marketing_opt_in = true`. If request U reads `false`,
  request O then writes the full true tuple, and U finally updates, U sends
  `{marketing_opt_in:false, marketing_opt_in_at:null,
  marketing_notice_version:null}` and erases O's consent. The live
  `pasantias_leads_marketing_consent_check` at
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:90-95` accepts
  that tuple, so the database cannot prevent the lost update. The existing
  tests cover `true → unchecked` and `false → checked` sequentially but never
  assert that an unchecked UPDATE omits all three columns when its snapshot was
  false (`__tests__/api/pasantias-lead.test.ts:422-455`). This violates the
  explicit rule that resubmission may set true but must never silently clear a
  prior true; opt-out belongs only to unsubscribe. On duplicate/update paths,
  an unchecked submission must always leave all three marketing columns
  unwritten, independent of the selected snapshot. Keep the complete false
  tuple for INSERT and the complete true tuple for an active opt-in.

SHOULD-FIX:

- [S1] The r2 implementation is not the raw, verbatim allowlist its evidence
  claims — `lib/pasantias/leads.ts:174-191` and
  `__tests__/lib/pasantias-leads.test.ts:312-314` — the function calls
  `value.trim()` before its whitespace/control scan and returns that rewritten
  value. Thus `"  /pasantias  "` is accepted as `"/pasantias"`, and leading or
  trailing CR/LF is removed before the raw-input check. This does not create an
  off-site or stored-control-character exploit—the resulting stored value is
  still same-site and safe—but it contradicts the r2 record that the function
  “never rewrites” and that storage is byte-identical
  (`docs/planning/reviews/fase-a5-review-request.md:182-185,213-217`; PM ledger
  at `docs/plan/LEDGER.md:1004,1010`). Either scan/reject the exact raw string
  before any trim and add edge-whitespace/edge-CRLF cases, or amend the
  cross-phase contract and evidence to say surrounding whitespace is
  intentionally normalized. Given the dispatched raw-string requirement, the
  former is the consistent resolution.
>>>>>>> origin/main

NITS:

- None.

<<<<<<< HEAD
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
=======
FIX BLOCK:

```text
A5 remediation round:

1. In pages/api/pasantias/lead.ts, separate INSERT marketing defaults from
   UPDATE behavior. INSERT may write the complete false tuple. UPDATE with
   marketingOptIn !== true must omit marketing_opt_in,
   marketing_opt_in_at, and marketing_notice_version unconditionally; UPDATE
   with true must stamp the complete true tuple.
2. Add a regression test whose selected row says false and whose unchecked
   duplicate UPDATE is asserted to omit all three marketing columns. Explain
   that omission makes a later/concurrent true write monotonic. Retain the
   existing insert-false, insert-true, existing-true/unchecked, and checked
   resubmission cases.
3. Resolve S1 by rejecting raw sourcePath strings with leading/trailing
   whitespace or control characters before trimming (preferred), with cases
   for leading/trailing space, CR, LF, and CRLF; or explicitly correct every
   verbatim/raw claim if normalization is intentionally retained.
4. Update the review request and ledger evidence, reconcile the branch with
   current main while preserving both ledgers, and rerun the focused suite,
   type-check, zero-warning lint, full Vitest, build, and price-leak scan.
5. Push the remediation/reconciliation and require all six GitHub CI jobs on
   the resulting final SHA before merge.

DoD: the stale-false unchecked UPDATE test fails on b65dfa8 and passes after
the fix; every marketing payload remains one of the live CHECK's two legal
tuples or omits the tuple entirely on UPDATE; sourcePath evidence matches code;
all local gates and all six PR checks are green on the same final head.
```

NOTES ON THE PLAN ITSELF:

- **Consent tuple shapes are otherwise correct.** INSERT without marketing
  consent writes `false/null/null`; opted-in INSERT/UPDATE writes
  `true/server-time/PRIVACY_NOTICE_VERSION`; required processing evidence is
  always server-stamped; and an unchecked update after a SELECT that already
  saw true omits all three fields. No half-set tuple reaches Supabase. [B1] is
  a monotonicity/lost-update defect that the live CHECK deliberately cannot
  express, not a malformed tuple.

- **Anti-enumeration holds at the public response contract.** First insert,
  ordinary duplicate, 23505 race recovery, and honeypot all produce
  `200 {success:true}`; the test compares the first and duplicate responses
  directly. Database failures remain 5xx and field validation remains 400,
  neither of which reveals whether a valid address was already registered.

- **The D-03 graph is exact.** `canTransitionLead` contains precisely the five
  frozen edges, denies all four no-op pairs and unknown values, and the 4×4
  product test asserts every allowed and forbidden status pair. The public
  route writes `status:'new'` only for a row observed as `dismissed`; contacted,
  converted, and new rows retain their current status. A repository-wide writer
  search found this route as the only current `pasantias_leads` consumer.

- **Email hardening is correct.** Every visitor-controlled HTML interpolation
  reaches `escapeHtml`; message newlines are inserted only after escaping; the
  configured brochure URL is attribute-escaped; and both subjects pass their
  dynamic portions through `singleLine`, while validation also collapses
  request CR/LF. The auto-reply uses the FNE frame, imports only
  `cohort-public`, links `/api/pasantias/brochure`, and contains no repository-
  authored price. The post-build scanner independently passed over 266 client
  files.

- **The 24-hour sequential dedup works, and its declared race is accepted.** A
  recent `brochure_sent_at` suppresses only the auto-reply, an older timestamp
  permits it, and the stamp is written only after provider success. Two
  concurrent submissions can both read an old/null stamp and both send before
  either stamps; the executor and both PM rounds disclose that bounded
  read-then-write race. It can duplicate a courtesy email but cannot alter
  consent or lead state, so it is not elevated here. [B1] is different because
  it silently destroys the later opt-in value.

- **r2 otherwise closes `source_path`.** Absolute schemes, protocol-relative
  `//` and `/\\`, unrooted paths, embedded whitespace/C0/DEL, non-strings, and
  over-cap values are dropped without rejecting the lead. INSERT records a safe
  value or null; UPDATE writes only a newly accepted value and never nulls prior
  attribution. [S1] concerns the truthful raw/verbatim contract, not the
  same-site property of the stored result.

- **Scope and evidence.** I reviewed the full five-commit branch from base
  `fb61b69` through final head `b65dfa8`, including r1 code `a58ada7`, r2 code
  `b7355d1`, both PM verification entries, and the review request. The diff is
  confined to the three planned source files, two planned test files, and
  phase documentation; there is no migration, dependency, middleware, page,
  or unrelated product change. `git diff --check` and the review worktree are
  clean.

- **Independent local gates on `b65dfa8`.** Focused A5 Vitest passed **2 files /
  92 tests**; `npm run type-check` passed; `npm run lint` passed with zero
  warnings; the full `npm test` run passed **255 files / 4,084 tests**;
  `npm run build` succeeded and registered `/api/pasantias/lead`; and
  `node scripts/check-price-leak.mjs` passed over **266** client files. Per the
  dispatched scope, local pgTAP was not rerun because A5 changes no SQL, and
  browser e2e belongs to A6b.

- **Final-head PR evidence is not yet complete.** GitHub run `30863286342`
  executed all six required CI jobs successfully at r1 head `45c08fc`. No
  six-gate run exists for r2/final head `b65dfa8`; PR #40 currently reports only
  the two successful Vercel contexts and is `DIRTY`/conflicting with `main`.
  Reconciliation plus the remediation push must produce the mandatory six
  green checks on the final SHA before merge.

There is one numbered BLOCKING residue for Brent under SOP §1.5.
>>>>>>> origin/main
