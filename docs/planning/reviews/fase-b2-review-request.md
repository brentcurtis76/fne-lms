# Fase B2 — review request

**Phase:** B2 — Resend / svix / cron compatibility spike (INSPIRA Comms)
**Branch:** `phase/b2-spike`
**Base:** `origin/main` @ `2613b46` ("docs(pm): headline date-span decision + a1-6 micro-round staged")
**Commits:** 1
**Round:** r1
**Deliverable:** `docs/plan/reviews/fase-b2-findings.md` — read it first; the code exists to
back it.

---

## Objective (from PLAN.md §Phase B2)

Lock the real contracts the Track-B sending stack will build on, so B3+ code against verified
shapes instead of memory: batch shapes including error-as-value, headers and the idempotency
stance; svix verification vectors; the Vercel cron cadence this account's plan actually allows.
A cron capability that is unavailable or too coarse is an explicit FINDINGS outcome that sends
D-07's invoker back to the PM before B10a starts.

**In scope:** contract tests against the installed libraries; adding the `svix` dependency;
documenting cron capability with evidence; the findings file.
**Out of scope (and untouched):** all feature code. No route, lib, migration, page or component
was created or edited. No SDK upgrade. No deployment.

## Files

| File | Δ | Risk |
|---|---|---|
| `docs/plan/reviews/fase-b2-findings.md` | +378 | **The deliverable.** Wrong here = wrong in five downstream phases |
| `__tests__/lib/resend-contract.test.ts` | +282 | Medium — locks contracts B10a will build on |
| `__tests__/lib/svix-contract.test.ts` | +272 | Medium — locks the D-08 security boundary |
| `package.json` | +1 | Low — one dependency added (`svix: ^1.99.1`) |
| `package-lock.json` | +32 | Low — mechanical |

No production file is touched. Total production-code risk of this phase is the new dependency.

## Test evidence

| Gate | Command | Result |
|---|---|---|
| type-check | `npm run type-check` | exit 0 |
| lint | `npm run lint` (`--max-warnings=0`) | exit 0 |
| unit | `npm test` | **237 files / 3535 tests passed** (+2 files / +35 tests) |
| build | `npm run build` | exit 0 |
| price-leak guard (A1, CI-wired) | `node scripts/check-price-leak.mjs` | OK — 266 files scanned |
| e2e (CI gate 4's mandatory spec) | `npx playwright test tests/e2e/smoke.spec.ts` | 2 passed |
| new suites alone | `npx vitest run __tests__/lib/resend-contract.test.ts __tests__/lib/svix-contract.test.ts` | 35 passed (13 + 22) |

**pgTAP (`npm run test:db`) was not run** — this phase contains no SQL, no migration and no
policy change, and the only local Supabase container currently up is `supabase_db_*` with every
other service stopped, which is a parallel worktree's state (A3 is running concurrently).
Starting or resetting the stack to prove something B2 does not touch was not worth disturbing
it. Flagging rather than assuming.

**Drift-detection evidence** — findings §6. Three mutations applied to the installed bundles
(un-nest the batch response; throw instead of returning errors; widen the svix tolerance to
10 min) turned exactly five tests red, 5 failed / 30 passed; restored from pre-mutation backups
and re-run to 35 passed. Note the recorded trap: mutating `resend/dist/index.js` gives a false
green because vitest resolves the ESM `index.mjs`.

---

## Where to scrutinise hardest

**1. §3.2 — the Vercel plan claim, and whether COMPLETE is the honest status.**
This is the judgment call of the round and the one most likely to be wrong. I could not verify
the plan tier myself: `vercel whoami` returns "No existing credentials found", there is no
`VERCEL_TOKEN`, the Vercel MCP needs an OAuth flow this session cannot run, and deploying is
forbidden. I concluded Pro — and therefore that no FINDINGS gate fires — from
`docs/planning/zoom-integration-plan.md:134`, where the Zoom workstream records "Vercel Pro
confirmation RESOLVED 2026-07-29 (Pro confirmed)" against a line item that had been a blocking
owner decision. That is a second-hand, five-day-old, in-repo record, not a live query. A
reviewer could reasonably argue the phase's own FINDINGS branch ("unavailable/coarse cron ⇒
FINDINGS") should fire on *unverified* rather than only on *unavailable*. I took the
verification path as far as it goes and made the residual explicit as R1 with the one command
that closes it; if you disagree, the fix is a status change, not a code change.

**2. §1.4 — the idempotency conclusion and my recommendation to stay on 3.5.0.**
The Resend **API** supports `Idempotency-Key`; SDK 3.5.0 cannot express it at all (its only
request option is a `query` key that POSTs ignore). I recommended option (a) — keep 3.5.0 and
rely on D-07's ledger dedup — over upgrading. That defers a three-major upgrade of the library
every email in the product flows through, and it accepts a duplicate-send window D-07 already
documents. Reviewer's call whether the recommendation is right; it is a PM decision either way
and I did not act on it. I also did not pin the exact SDK version that introduced
`idempotencyKey` — I could confirm current SDKs have it, not which release added it, and said
so rather than guessing.

**3. The two "footgun" tests, which assert that something is broken.**
`resend-contract.test.ts` pins that passing `{ headers: … }` through request options *drops the
Authorization header*, and `svix-contract.test.ts` pins that an empty secret throws a plain
`Error` and a signed non-JSON body throws `SyntaxError` — neither being a
`WebhookVerificationError`. These are unusual assertions: they lock hazards rather than
capabilities. My reasoning is that B10a is likely to attempt exactly the header trick when it
wants idempotency, and that B7 collapsing "anything threw → 401" would make a missing webhook
secret tell Resend "rejected, don't retry" on every event. If you think a test asserting a
footgun is noise that will age badly, say so.

**4. §2.5 — the `email.` prefix, which I classified as prose shorthand rather than a plan gap.**
D-08's effect table names events `sent`, `bounced`, `delivered`; the wire format is
`email.sent`, `email.bounced`, `email.delivered`. I read this as the plan writing shorthand, not
as a design error, because D-08 already routes unknown types to a ledger-only 200 — so the worst
case of a literal reading is that every event becomes "unknown" and nothing is mis-stamped.
Reviewer should confirm that reading; if the prefix instead needs to be normative in the plan
text, that is a PM edit before B7.

**5. Whether the contract set is complete for its five consumer phases.**
The findings file is only useful if B3/B4/B7/B8/B10 can build from it without re-deriving
anything. I locked what §4's card lists and stopped. Two known holes, both stated as R3/R4:
batch index alignment and whether the API *honours* per-email headers end-to-end are server-side
behaviours no transport-level test can reach — they need the B11b live send. If something else a
downstream phase will need is missing, this is the round to catch it, because after B2 those
phases will treat this document as settled.

---

## Known limitations / deferred

- **No live API call anywhere in this phase.** Every Resend assertion is transport-level. The
  real API is first exercised at the A9 / B11b gates (`.env.local` has no `RESEND_API_KEY` — a
  pre-existing constraint recorded in PLAN.md).
- **R4 is the compliance-relevant one:** the wire format for per-recipient `List-Unsubscribe` is
  locked, but that Resend *delivers* those headers on a batch send is verified only from its
  docs. B11b must read the headers off a received message.
- **pgTAP not run** (reason above).
- **Vercel plan not independently re-verified** (R1, and point 1 above).
- **Exact SDK version that introduced `idempotencyKey` not pinned** — only that current SDKs
  have it and 3.5.0 does not.
- `vercel.json` was **not** touched. D-07's cron entry belongs to B10a; this phase only
  establishes that a per-minute expression is permissible.

---

# Round r2 — Sol remediation (REVIEW-B2.md findings 1 and 2)

**Base:** merged `origin/main` (`93ca0e9`) into `phase/b2-spike` as step 1 — PR #36 was
CONFLICTING and had no CI results. `docs/plan/PLAN.md` taken from main verbatim (zero diff);
`docs/plan/LEDGER.md` unioned, asserted by script: branch parent 73 `###` headings, main parent
77, union 80, final file 80, nothing missing and nothing invented.

**Finding 3 is not addressed here** — it was a PM-owned plan defect, already fixed on `main`
(D-07 + B10a [A1] now mandate a shared sender pacing provider calls ≥150 ms apart; Decision Log
2026-08-02). r2's job with it was to make the findings card cite the amended rule, which §1.5,
§3.4 and C16 now do.

## What changed

**[F2] svix suite (`__tests__/lib/svix-contract.test.ts`, 22 → 29 tests).**
- Raw-byte contract re-derived. r1's "re-serialised body" case extracted a subtree
  (`JSON.parse(PAYLOAD).data`), so it proved only that a *different value* is rejected — exactly
  why a canonicalising verifier stayed green. There is now a table of four **value-identical,
  byte-different** spellings (pretty-printed, space-separated, key-order swapped, trailing
  newline), each asserted `toEqual` the signed value *and* `not.toBe` its bytes before the
  rejection assertion, plus a reverse-direction case (sign pretty, verify compact) that kills a
  both-sides canonicaliser. The old subtree case is retained under an honest name.
- Exact boundary locked: ±300 accepted **and** ±301 rejected on both sides. `>` is the library's
  comparison, so ±300 s is inclusive.
- **Mutation evidence** committed at `docs/plan/evidence/b2/svix-mutation.md` — 7 mutants, 7
  killed, verbatim run output plus the driver. Includes both mutants Sol found surviving (SM2
  boundary `>`→`>=`, SM3 canonicalisation) and their variants.

**[F1] Idempotency section (`fase-b2-findings.md` §1.4, now §1.4.1–§1.4.4).**
- §1.4.1 computes duplicate exposure per failure mode against the amended D-07 bound (12
  provider calls / 1 200 recipients per tick): M1 crash-before-ledger-write ≤100 per crash; M2
  `application_error` ambiguity ≤1 200 per tick and repeatable per retry round; M3 duplicate
  cron delivery **0** — `SKIP LOCKED` makes concurrent ticks disjoint, so r1 was wrong to list
  it as a duplication path.
- §1.4.2 pins the minimum SDK version **from the published tarballs**, not from assertion.
- §1.4.3 costs the 3.5.0 → 4.5.x delta for this repo specifically.
- §1.4.4 restates four options (status quo, 4.5.x, 6.18.1, raw fetch, non-retriable `unknown`)
  with those numbers. No recommendation is offered — r1's rested on a wrong version figure.
- R5's severity corrected from "low, bounded" to "medium, unbounded across retries".

**Also:** §3.2 R1 closed on the owner's first-hand Pro confirmation (residue removed, no
`vercel login` step left outstanding); §1.5 corrected from "≤3 calls, no pacing needed" to the
real 12 calls against a team-wide ceiling; C16/C17 added to the contract card.

## Where a reviewer should push hardest

**1. §1.4.2's version claim, because it contradicts the review that ordered it.**
REVIEW-B2.md names `resend@4.3.0` as the minimum. I read the shipped `dist/` of every stable
3.x/4.x release and reached **4.5.0**: 4.3.0 introduces `IdempotentRequest` but
`CreateBatchRequestOptions extends PostOptions {}` is empty there, so `batch.send(p, {
idempotencyKey })` does not type-check — and 4.3.0's `post()` sets the header on the
*client-level* `this.headers`, so the key would persist onto every subsequent POST from the same
client (fatal for a drain issuing 12 calls per tick from one client). 4.4.1 fixes the leak,
4.5.0 adds the type. Verify this independently; if 4.3.0 is workable with a cast, my option
pricing is one minor too conservative.

**2. Whether §1.4.1's M2 figure is right.** ≤1 200 rests on the claim that transport ambiguity
is independent per provider call. If there is a coupling I have not seen (a shared client state,
a Resend-side behaviour), the number is wrong and B10a's decision rests on it.

**3. The claim that "0 duplicates" for the keyed options is conditional.** §1.4.4 says it holds
only within Resend's 24 h key window *and* only if the retried request has the same composition
— which implies a persisted per-batch key stamped on send rows before the provider call. If that
reasoning is wrong, options (b)/(c) are cheaper than I priced them.

**4. The B3 sequencing note.** §1.4.4 says (b), (c) and (d) all need a column B3 does not
currently define, so B3 is the cheap moment even though D-10's additive-migration rule means the
decision *can* wait for B10a. That is a claim about a phase I did not touch — check it against
B3's [A1].

**5. Whether the new spellings really are value-identical.** Each case asserts
`expect(JSON.parse(spelling)).toEqual(JSON.parse(PAYLOAD))` first. If any spelling is
semantically different, that case has silently degraded into another tampering test and the
raw-byte contract is unlocked again — which is precisely the r1 failure repeating.

## Known limitations / deferred

- **[S1] not addressed** (SHOULD-FIX in REVIEW-B2.md): §6.1's second resend mutation is still
  labelled "an SDK that switches to thrown errors" when it in fact demonstrates altered error
  *mapping*. It is a should-fix; the PM's r2 prompt scoped this round to findings 1 and 2, so it
  stays in the ledger backlog rather than being fixed here.
- **No SDK upgrade performed** — the prompt forbids it this round; §1.4.4 recommends nothing and
  B10a decides.
- **No live API call**, `pgTAP` not run (zero SQL), `vercel.json` untouched — all as in r1.
- **The 3.5.0 → 6.18.1 path is deliberately not costed.** §1.4.3 costs only the one-major move;
  a 6.x move would need its own read of a rewritten type surface.
