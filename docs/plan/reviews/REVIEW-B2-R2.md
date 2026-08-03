# CODEX REVIEW — B2 round 2

VERDICT: PASS

All three BLOCKING findings in `REVIEW-B2.md` are closed at reviewed branch
head `b7e34d2`. The Svix suite now kills the two mutants that survived round 1,
the idempotency card uses the amended D-07 bounds and a complete option set,
and the PM-owned pacing/schema/test carry-forwards are binding on `main` at
`b69b4a9`. The executor's two corrections of the round-1 review are accepted:
the minimum usable Resend SDK is 4.5.0, not 4.3.0, and concurrent duplicate
cron delivery contributes zero independent duplicate-send exposure because
fresh claims are disjoint. No round-2-introduced finding remains.

BLOCKING:

- None.

SHOULD-FIX:

- None introduced by round 2. Round 1 `[S1]` (the mislabelled Resend error-
  mapping mutant in findings §6.1) remains explicitly recorded in the PM
  backlog and was outside this scoped closure.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **`[B2]` raw-byte and exact-boundary closure confirmed.**
  `__tests__/lib/svix-contract.test.ts:164-195` now accepts exactly `-300` and
  `+300` seconds and rejects both `±301` cases. Lines 197-227 sign one complete
  JSON spelling, assert that four alternative spellings parse to the identical
  value while differing in bytes, reject them, and include the reverse
  pretty→compact direction. This is the missing protection against both
  verify-side and both-sides canonicalization.
- **My two surviving round-1 mutants now die independently.** Replacing both
  timestamp comparisons with `>=` produced **2 failed / 27 passed** (the exact
  `±300` acceptances). Canonicalizing the complete payload with
  `JSON.stringify(JSON.parse(payload))` before verification produced
  **4 failed / 25 passed** (three equivalent spellings plus the reverse case).
  Each independent run restored
  `node_modules/standardwebhooks/dist/index.js` and verified the restored
  SHA-256 before continuing.
- **The committed seven-mutant driver is reproducible.** I ran the driver
  embedded in `docs/plan/evidence/b2/svix-mutation.md` against this worktree
  (only its hard-coded obsolete worktree root was substituted). Baseline was
  **29/29**, SM1–SM7 each exited red with respectively **2, 2, 4, 4, 1, 18,
  and 6** failed tests, and the byte-restored final run was **29/29**. An
  independent unmutated run of both B2 suites passed **42/42** (13 Resend + 29
  Svix).
- **`[B1]` exposure arithmetic is now decision-grade.** Findings
  `§1.4.1` (`fase-b2-findings.md:120-139`) correctly expands D-07's
  `2 campaigns × 3 claims × ceil(200/100)` into **12 provider calls / 1,200
  recipients per tick**. M1 is bounded at **≤100 recipients per crash** because
  the ledger write is per provider batch. M2 is **≤1,200 recipients per tick**
  and repeatable across retry rounds because ambiguity is independent per
  call. M3 is **0 as an independent mode**: `FOR UPDATE SKIP LOCKED` plus the
  fresh `sending` state makes concurrent ticks claim disjoint rows; a later
  stale reclaim belongs to M1 rather than to duplicate scheduling itself.
- **The option set is complete and honestly bounded.** Findings
  `§1.4.4` (`fase-b2-findings.md:186-208`) separately costs installed 3.5.0,
  the one-major 4.5.x move, the three-major 6.18.1 move, contained raw `fetch`,
  and the non-auto-retriable `unknown` reconciliation design. Its zero-exposure
  claims for keyed options are expressly conditional on Resend's 24-hour
  window and replaying the identical stamped batch, rather than stated as an
  unconditional guarantee.
- **The executor's 4.5.0 correction is accepted.** I independently downloaded
  and inspected the shipped `dist/` of every stable boundary release from
  3.5.0 through 4.5.0. Versions through 4.2.0 have no `idempotencyKey`.
  In 4.3.0, 4.4.0, and 4.4.1,
  `CreateBatchRequestOptions extends PostOptions` and therefore does not expose
  the key to `batch.send`; 4.5.0 is the first version where it also extends
  `IdempotentRequest`. The runtime defect is real too: 4.3.0 calls
  `this.headers.set("Idempotency-Key", ...)`. A two-call transport stub sent
  `batch-one` on both the keyed first call and the unkeyed second call. 4.4.1
  fixes that leak with `new Headers(this.headers)`, but its batch type remains
  unusable; 4.5.0 has both fixes. Thus **4.5.0 is the minimum safe, typed batch
  version**, and the findings card's C7 is correct.
- **`[B3]` PM plan defect and round-2 carry-forwards are closed on `main`.** At
  `main@b69b4a9`, D-07 (`docs/plan/PLAN.md:39`) mandates ≥150 ms pacing;
  B10a [A3] (`PLAN.md:297`) mandates both the fake-clock spacing assertion and
  a 429/backoff test; B3 [A1] (`PLAN.md:217`) creates the exact nullable
  `email_campaign_sends.provider_batch_key`. The findings card correctly
  carries the behavioral contract as C16/C17
  (`fase-b2-findings.md:448-449`) and §1.4.4's requirement to persist one key
  on the rows before issuing a provider batch. The plan is the binding source
  for the final column identifier; no second migration is deferred to B10a.
- **PM verification is consistent with the artifacts.** The final B2 ledger
  entry on `main` (`docs/plan/LEDGER.md:808-816`) records the same 42/42 run,
  accepts the two corrections above, absorbs `provider_batch_key` plus the
  B10a 429/pacing tests, and carries only the pre-existing Resend-mutant S1.
- **CI is green at the reviewed head.** PR #36 reports success for the RLS
  migration guard, type-check, zero-warning lint, Vitest, pgTAP, Playwright,
  and both Vercel contexts at `b7e34d2`. The PR currently reports
  `CONFLICTING` only because `main` subsequently gained the required PM-only
  PLAN/LEDGER commit `b69b4a9`. Before merge, the normal docs-union
  reconciliation must preserve that main-side amendment and this review file;
  this is close bookkeeping, not a round-2 implementation finding.

There is no numbered residue for Brent under SOP §1.5.
