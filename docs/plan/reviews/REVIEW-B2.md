# CODEX REVIEW — B2 round 1

VERDICT: FAIL

B2 correctly identifies the installed Resend 3.5.0 request/response shapes and the
Svix error taxonomy, and the submitted mutation set reproduces its stated 5-failure
result. The phase is not ready to become the locked downstream contract, however.
The idempotency options materially understate both the accepted duplicate window and
the cheapest SDK-upgrade path, while the Svix suite remains green under mutations that
canonicalize JSON before verification and reject the exact 300-second boundary. Those
are precisely the contracts B7 and B10a are meant to inherit.

BLOCKING:

- [B1] `docs/plan/reviews/fase-b2-findings.md:119-133,314-319,347-354` does not give
  B10a a decision-grade idempotency choice. Option (a) prices the status quo as
  “none” with “≤1 batch duplicable per crash”, but §1.3 itself establishes a second,
  wider failure mode: a sent request whose 200 response cannot be parsed is returned
  as `application_error`, recorded `failed`, and may later be retried. Under B10a's
  actual bound (`docs/plan/PLAN.md:291-297`), one tick can make up to
  `2 campaigns × 3 claims × ceil(200/100) = 12` provider calls; ambiguous outcomes
  are independent per call, so a later retry can duplicate every affected batch, not
  just one. Duplicate cron delivery alone does not create the claimed extra duplicate
  path either: the stated `SKIP LOCKED`/`sending` design gives the concurrent tick a
  disjoint claim. Option (b) is also mis-costed as necessarily a three-major jump to
  6.x. Independent inspection of the published packages found that `resend@4.2.0`
  lacks `idempotencyKey`, while `resend@4.3.0` already adds it to `PostOptions`, exposes
  it through `CreateBatchRequestOptions`, and emits `Idempotency-Key` from `post()`—a
  one-major minimum upgrade. The API currently supports the key for batch requests
  ([Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)).
  Required closure: rewrite the table with the real duplicate bound; split the
  minimum 4.3+ one-major upgrade from a current-6.x upgrade and cost/re-lock each
  honestly; retain raw `fetch` as the contained alternative; and include the genuine
  no-idempotency safety choice (an `unknown`/non-auto-retriable outcome with operator
  reconciliation), or explain explicitly why the plan rejects it. The PM may still
  make the final D-07 choice at the B10a dispatch gate, but B2 must hand that gate a
  complete and accurate option set.

- [B2] `__tests__/lib/svix-contract.test.ts:197-205` does not prove the raw-byte
  contract claimed by `docs/plan/reviews/fase-b2-findings.md:205-213` and C11. The
  alleged re-serialization is
  `JSON.stringify(JSON.parse(PAYLOAD).data)`: it discards the top-level `type`, so the
  candidate is semantically different payload tampering, not equivalent JSON with
  different bytes. I mutated `standardwebhooks.verify()` to canonicalize the complete
  JSON value with `JSON.stringify(JSON.parse(payload))` before HMAC verification; all
  **22/22** Svix tests still passed. A verifier that stopped signing raw bytes would
  therefore leave the advertised guard green. The same suite tests ±299 accepted and
  ±301 rejected but calls ±300 “LOCKED”; changing both library comparisons from `>`
  to `>=` also left **22/22** green, so the exact boundary is not locked either.
  Required closure: sign one full JSON spelling and verify that a semantically
  identical full-object spelling with changed whitespace/key order fails; add exact
  `-300` and `+300` acceptance cases; and record fail-on-mutant evidence for JSON
  canonicalization and the `>`→`>=` boundary mutation. B7 can then safely inherit
  `bodyParser: false`, raw-buffer verification, and the inclusive ±300-second result.

- [B3] `docs/plan/reviews/fase-b2-findings.md:135-140` tells B10a that a tick makes at
  most three batch calls and therefore has roughly three orders of magnitude of
  rate-limit headroom. The phase plan actually permits twelve calls as shown in [B1],
  while Resend's team-wide default is 10 requests/second with no separate burst
  allowance ([Resend account limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)).
  Other FNE send paths share that same team pool. The locked findings must not say
  that pacing is unnecessary when a maximally productive tick can exceed the limit
  by itself. Required closure: correct the maximum, carry the team-wide/no-burst
  semantics into the contract card, and make B10a either pace against the documented
  limit/response headers or reduce its per-second issue rate, with a 429 test.

SHOULD-FIX:

- [S1] `docs/plan/reviews/fase-b2-findings.md:361-374` mislabels the second submitted
  mutation as an SDK switch to thrown errors. I reran the exact three-mutation set and
  reproduced **5 failed / 30 passed**, but replacing the inner
  `return { data: null, error: JSON.parse(rawError) }` with `throw new Error(rawError)`
  is caught by Resend's surrounding catch blocks; the public promise still resolves
  an `application_error`. Its three failures prove altered error mapping, not a public
  rejection. Retain that mutation under its truthful label and add a separate mutant
  that rethrows from the outer `fetchRequest` catch so the “resolved value versus
  rejected promise” contract is actually demonstrated.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- The cron capability conclusion is sound. The branch's original R1 was an honest
  limitation, not a B2 blocker: `docs/planning/zoom-integration-plan.md:134` records
  the owner's Pro confirmation, and `origin/main` now strengthens it with Brent's
  first-hand account screenshot in `abeb416`. Official Vercel documentation confirms
  Pro permits once-per-minute scheduling and that Hobby sub-daily expressions fail
  deployment. Reconciliation should mark R1 closed rather than ask this executor to
  deploy or authenticate as the owner.
- The remaining cron semantics are accurately carried forward: production GET,
  `CRON_SECRET` as Bearer authorization, possible overlap/duplicate/missed delivery,
  and no retry. D-07's claim/reconciliation model addresses scheduling concurrency;
  provider-send idempotency remains the separate [B1] problem.
- The exact submitted mutation set was independently rerun against the resolved
  bundles (`resend/dist/index.mjs` and `standardwebhooks/dist/index.js`): **5 failed /
  30 passed**, followed by **35/35** after byte-for-byte restoration. The extra
  canonicalization and exact-boundary mutants each produced the false-green results
  described in [B2]. Installed bundles were restored; the worktree remained clean
  before this review file was added.
- Independent local gates on branch head `64432f0` passed: type-check; zero-warning
  lint; Vitest **237 files / 3,535 tests**; production build. No SQL or migration is in
  scope, so pgTAP was not rerun.
- Scope is otherwise faithful: the implementation commit `27d7701` adds only the two
  contract suites, Svix and its lockfile entries, the findings/review-request docs,
  and the executor ledger entry. No feature route, page, component, migration,
  middleware, or deployment entered the phase.
- PR #36 currently reports `CONFLICTING` against `origin/main` and exposes only the two
  successful Vercel contexts, not the six required CI gates. The remediation must
  reconcile current `main` (including the first-hand Pro evidence) and obtain all
  required checks before re-review/merge.
