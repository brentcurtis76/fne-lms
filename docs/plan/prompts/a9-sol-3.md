SESSION: INSPIRA · A9 · Codex review (round 3, under Brent's explicit cap override)

Review of phase **A9 — Track A release verification** for INSPIRA Comms (repo `fne-lms`) after
remediation round **r3**.

**This review exists because Brent explicitly overrode the SOP §1.5 two-round cap** (Decision Log,
`PLAN.md`, 2026-08-08). Your round-2 note said the verdict required a re-plan proposal rather than a
third remediation round; the PM put three options to Brent — override the cap for one
documentation-only round, override your BLOCKING and accept, or re-plan — and he chose the first.
The reasoning is in the Decision Log and rests on your own words: *"The plan is not the
disagreement."*

You retain final say on BLOCKING items.

---

## WHAT TO REVIEW

- **Branch:** `phase/a9-verify`, head **`1430de8b`**, pushed. Worktree `~/dev/wt-a9`.
- **r3 is one commit: `1430de8b`.** Review it with `git show 1430de8b`, or
  `git diff c03a86d3..1430de8b`. (`c03a86d3` below it is the PM's own commit: the two Decision Log
  rows, the B11b amendment, and the r3 prompt.)
- Still exactly **one code-bearing commit in the entire phase — `82bc0e7b`.** Everything else is
  documentation. Verify:

```bash
git diff --stat c03a86d3..1430de8b -- pages components lib tests __tests__ scripts   # empty
git diff --stat b0cc9728..1430de8b -- . ':!docs'                                    # empty
```

The second is the stronger statement: **the code has been byte-identical since the code-bearing
run.** Gate 4's proof still describes the head you are reviewing.

Three documentation files changed: `docs/plan/evidence/a9/release-checklist.md`,
`docs/plan/evidence/a9/ci-run-31276283612.md`,
`docs/planning/reviews/fase-a9-review-request.md`, plus the ledger.

---

## YOUR B1 — WHAT WAS DONE, AND WHY IT IS STRUCTURAL RATHER THAN NUMERIC

Your finding: the evidence falsely claimed the spec had executed "exactly once" when gate 4 had in
fact succeeded five times, and the CI evidence listed later successful runs immediately after
claiming a single execution.

**Accepted in full.** The PM verified it per-job before conceding it, and it was right.

The fix is deliberately **not** "change one to five", because A9 had by then failed twice on the same
mechanism — **an evidence artifact asserting a volatile count that the phase's own later commits
invalidate** (round 1: `Commits: 1`, actually 4; round 2: the run count). Every push to this PR
re-runs gate 4, so any bare count is false by the time it is read. The cure found at round 1 and
never generalised was to **name the invariant instead of counting** — the review-request's commit
line was fixed that way and is still correct today.

So r3 rewrote the three passages onto invariants:

- The spec has **never run locally**, and why (local Playwright loads `.env.local` → the live shared
  GENERA Supabase project; the spec POSTs leads).
- **Every execution it has ever had was CI gate 4**, on a freshly created, seeded, ephemeral stack.
- **It has passed in every run it was part of** — zero retries, zero flakes, anti-skip guard clean.
- The **code-bearing run** is named (`31276283612` @ `b0cc9728`, code `82bc0e7b`); every later run is
  a docs-only commit against byte-identical code.
- **"How many runs there have been is a function of how many times this branch was pushed, not a
  property of the phase"** — so any tally is provisional by construction and later pushes add to it.
- The run list is explicitly framed: **"Read the list as 'at least these', never as 'these and no
  more'."**
- The determinism/robustness distinction, which had been wrong in the *other* direction: repeated
  clean runs on fresh stacks are real evidence of **determinism**, and **not** evidence of robustness
  to change, because all of them executed the same code against the same seeded fixtures.

This is now a binding plan rule (Decision Log 2026-08-08) **bound to B11b**, the only other phase
whose entire product is an evidence document.

**Your N4 is fixed too:** the sentence now reads that one registered spec file
(`tests/e2e/pasantias-flow.spec.ts`), carrying four tests, is what supports all five evidence rows —
verified by the executor against `scripts/ci/e2e-mandatory.mjs` and the spec's four `test()`
declarations, not asserted.

---

## THE COMPLETE RUN LIST, SO YOU DO NOT HAVE TO DISCOVER IT

**Handing you a stale snapshot is exactly what caused this**, so here is every run on the branch,
verified per-job by the PM at head `1430de8b`. Check it rather than trusting it:

| Run | Head | Gate 4 | Created |
|---|---|---|---|
| `31276283612` | `b0cc9728` | **success — code-bearing** | 20:11:11Z |
| `31276763085` | `5550de57` | **cancelled** (superseded) | 20:22:51Z |
| `31276783803` | `9b1ed1dd` | success | 20:23:18Z |
| `31279074281` | `fb8066e8` | success | 21:20:26Z |
| `31284678453` | `bcc9e142` | success | 23:45:07Z |
| `31285321076` | `f7845196` | success | 00:02:35Z |
| `31286973787` | `fa0fe6be` | success | 00:48:52Z |
| `31287882864` | `5f35bc37` | **cancelled** (superseded) | 01:14:59Z |
| `31288041350` | `c03a86d3` | **cancelled** (superseded) | 01:19:40Z |
| `31288274471` | `1430de8b` | success — the r3 head | 01:26:37Z |

**As of `1430de8b`: seven gate-4 successes, three cancellations.** The evidence files state
**six successes and two cancellations as of `5f35bc37`**, which is the head immediately before r3
began — and both figures are exactly right *at that stamp*: `31286973787` had completed and
`31288041350` had not yet been created. Reading this review will not falsify them, because they are
scoped and the list is declared a lower bound.

---

## THE THING YOU SHOULD KNOW ABOUT THE PROMPT CHAIN, BECAUSE IT REFLECTS ON THE PM, NOT THE ROUND

**r3 returned `STATUS: FINDINGS`, and the finding was against the PM's own prompt.** The r3 prompt
supplied the tally as **five** as of `5f35bc37`, with a table stopping at `f7845196`. That was wrong:
there were **six** — the PM had copied your round-2 list (accurate as of `f7845196`) and then pushed
twice more, stamping a stale number with a newer SHA. **That is worse than a bare count: a stamp that
asserts a currency it does not have.** The same defect, a third generation on, authored by the PM
while writing the prompt whose purpose was to cure it.

The r3 executor caught it, verified it per-job (`gh run view --json jobs`, plus the anti-skip guard
output and `git diff --stat b0cc9728..fa0fe6be -- . ':!docs'` empty), wrote the **corrected** figure,
and recorded the discrepancy in the ledger rather than silently adopting the prompt's number. It did
**not** stop the round, on the grounds that the remedy was structural and did not depend on the
count, and that halting would have left two false documents on the branch while a number was
re-litigated. **The PM judged that call correct.** Your view may differ, and the deviation is
declared openly in the report and the ledger.

There is a real signal in this worth weighing when you judge whether the fix is genuinely structural:
**the PM's stale number did not propagate a falsehood into the files**, because the files no longer
depend on any count being current. The structure absorbed an error of exactly the kind that had
already caused two FAILs. That is the test, and it is the strongest evidence available that this is a
cure rather than another patch.

---

## THINGS THE PM RULED ON THAT YOU MAY OVERTURN

1. **`ci-run-31276283612.md` still contains one count in prose: "Two runs were CANCELLED…"** At the
   `5f35bc37` stamp that is exactly right, and it sits inside a section headed "As of `5f35bc37`"
   whose opening line says to read the list as "at least these, never these and no more". There are
   now three cancellations. **The PM judged this correct within its stated scope and did not call
   another round for it.** If you think a stamped section may still not carry a closed-sounding count
   in prose, that is a legitimate objection — but note that the override buys no further remediation
   round, so say plainly whether it is BLOCKING or a NIT.
2. **N3 and S1 remain in the backlog**, both deferrals you endorsed as reasonable in round 2. N3 (the
   90 s PDF budget inside a 120 s test) was additionally protected this round: r3 was forbidden from
   touching `pasantias-flow.spec.ts` at all, because the spec is CI-proven seven times over and
   editing it would restart that argument for a cosmetic gain.
3. **The four OWNER-RUN — PENDING rows are untouched by instruction** and Brent has not yet run them.

---

## CHECK

1. **Is B1 discharged, and is the new text accurate in both directions?** Understating cost this
   phase a round; overstating would be worse. The standard the PM set for r3: a reader who knows
   nothing should finish with an accurate picture of what was proven, by what, and what remains open.
2. **Does anything in the three files still assert, or imply, a count that the next push falsifies?**
   This is the third attempt at that question and the one that matters most.
3. **Did anything outside documentation move?** Prove it.
4. Do your round-1 and round-2 conclusions still hold on this head — the row-state fix, the guard's
   exact per-file counts, the four e2e tests, no frozen-decision violation, no product-code breach?
5. Anything here that makes Track B (B4a onward) harder — including whether the new binding rule in
   `PLAN.md`'s Decision Log and the B11b amendment are the right rule, or over-fitted to A9's
   accident.

Do not run `tests/e2e/pasantias-flow.spec.ts` locally: local Playwright loads `.env.local`, which
points at the live shared GENERA Supabase project, and the spec POSTs leads.

---

## STILL TRUE: A PASS DOES NOT CLOSE THIS PHASE

`[A3]` requires the checklist fully green, and **four rows remain OWNER-RUN — PENDING** because they
need a real mailbox or a real handset: A2-9 (WhatsApp unfurl on a named device), A2-11 (auto-reply to
a test mailbox), A2-12 (internal notification), A2-13 (the brochure link inside the received email).
Brent runs those; steps are in §C of the checklist. Your round-1 note already accepted these as
legitimately outside the BLOCKING set, and r3 left them untouched by instruction.

A8's two deferred SHOULD-FIX items (a D-03 terminality breach, a UI-caveat correctness fix) remain
untouched per `[A-new-4]` and still need their own round before Track A ships.

---

Review against the plan's contract, not your own preferences. Taste disagreements are NITs. Only
correctness, contract violations, security, and architectural violations are BLOCKING.

Output using the CODEX REVIEW format:

```markdown
## CODEX REVIEW — A9 round 3
VERDICT: PASS | FAIL
BLOCKING:
- [B1] <finding> — <file:line> — <why it blocks>
SHOULD-FIX:
- [S1] ...
NITS:
- [N1] ...
NOTES ON THE PLAN ITSELF: <if the plan, not the code, is the problem>
```
