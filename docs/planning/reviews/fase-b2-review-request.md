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
