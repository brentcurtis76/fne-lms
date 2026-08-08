# CODEX SOL — FINAL REVIEW, INSPIRA phase A6r

Final review of phase **A6r** (visual redesign of `/pasantias`) for INSPIRA, in
`fne-lms`. Branch **`phase/a6r-design`**, head **`0c4d87bb`** (pushed), base `main` @
`b8f5c05d`. Worktree at `~/dev/wt-a6r`; the `main` checkout is `~/dev/fne-lms`.

Read `docs/plan/PLAN.md` for A6r's acceptance criteria [A1]–[A7] and the frozen
decisions (D-01, D-02, D-10 bear on this phase), then review the branch.

**You have final say on BLOCKING items. The phase does not close until you pass it.**

## Standing check

1. Does the code actually meet every acceptance criterion? Verify — do not take the
   ledger's word for it, and do not take this prompt's word for it either.
2. Run the tests yourself. Do they test behaviour, or do they just execute code?
3. Any violation of the frozen architectural decisions?
4. Correctness, error handling, security, edge cases.
5. Anything that makes the NEXT phase (A6b, the lead form, which lands inside
   `#programa` on this page) harder than it needs to be.
6. Scope creep — anything changed that was out of scope?

Review against the plan's contract, not against your own preferences. Taste
disagreements are NITs. Only correctness, contract violations, security and
architectural violations are BLOCKING.

## Where this phase actually is

You have reviewed A6r twice: at `9d377eec` (three blocking — the hand-maintained
hardcoding guard, the `existsSync` image probe, the hero contrast) and at `bcfa1b71`
(two blocking — collection cardinalities bypassing the guard, and five
`visitSchools[*].tier` leaves declared inert while the page branches on them).

**The page itself has not changed since r3.** `git diff 9c3c9134 -- pages/pasantias.tsx`
is the last change to it; r4 and r5 touch only
`__tests__/pages/pasantias-hardcoded-cohort.test.ts` and the review record. Everything
found in the last three reviews has been about the guard, not the product.

r5 answered both of your findings — and found that its own first answer to the first one
was incomplete. That is the thing most worth your attention.

## The four places to look hardest

**1. The count mechanism is new and nobody but the PM has reviewed it.**
Your B1 was that `.length`-derived facts ("7 escuelas", "13 objetivos") bypassed both
guard layers. The round's first answer compared *totals* of the old and new count across
the rendered surface. That closes the objectives case and **does not close the schools
case**, because `COHORT_SCHOOLS.length` prints at two sites (`pages/pasantias.tsx:618`
hero strip, `:806` section title) — hardcode one and the other still puts the new count
on the page and takes the old one off, satisfying both halves.

The executor found this by separating a compound mutation the PM had run as a pair; the
PM had wrongly recorded B1 as closed on that pair. The fix is `printsStaleSize`
(test file `:928`): shrink the collection by one against a **quiet module** — every
string leaf marked so the page's own copy cannot supply bare numbers — and require the
old size to be **gone** from the printed surface. Shrink rather than grow, because the
objectives list numbers its own items.

Scrutinise: the quiet-module construction (`:805-831`), the lookaround in
`countOccurrences` (`:871`), the `printedSurface` decision to drop attribute values
(`:858`), and the short-circuit at `:955-957` that skips the per-site half for a
collection that already failed the counting half.

**2. A limit that is stated in prose and not asserted — the PM's own SHOULD-FIX.**
`printsStaleSize` returns `false` for any collection of fewer than two elements
(`:932`), silently falling back to the counting half. The docstring says no such
collection exists today; that is true and it is **not asserted anywhere**. Nothing fails
on the day a one-element collection is added, and a count printed at two sites would then
be hardcodable at one of them undetected. The PM classified this SHOULD-FIX because no
customer-visible fact can go stale today. Disagree if you think it earns a round.

**3. The declared exception lists.** Your B2 was that a wrong *reason* had been recorded
as fact. The round claims all 27 declared reasons across `EXPECTED_GAPS`,
`UNPRINTABLE_LEAVES`, `UNIFORM_LEAVES` and `UNCOUNTED_COLLECTIONS` were re-verified
against the code with file:line, not just the two that changed. The PM sampled these and
found them accurate; sampling is not the same as checking all 27. The failure mode this
phase keeps hitting is a declaration that is true of one sibling and false of another.

**4. Is the guard now worth its weight?** It is **1551 lines protecting a 1151-line
page** — 29 tests, 251 ms, so the cost is in reading it, not running it. The executor's
view, which the PM has backlogged rather than acted on: cut none of the behaviour, every
clause answers a demonstrated false pass, but move ~700 lines of mechanism to
`__tests__/support/cohort-contract.ts` leaving declarations and suite. **Your opinion is
wanted here as a judgement, not as a finding** — a restructure would not happen inside a
remediation round.

## What the PM verified, so you can spend your time elsewhere

Re-run anything you doubt; this is disclosure, not a request to skip it.

- Gates re-run on `0c4d87bb`: **6156 tests / 262 files**, type-check clean, lint clean,
  production build clean, `check-price-leak` clean (263 files), **16/16 e2e**
  (`pasantias-page`, `footer-heading-order`, `smoke`).
- Page byte-identical to `bcfa1b71` — `git diff bcfa1b71 -- pages/pasantias.tsx` empty.
- Seven mutations of `pages/pasantias.tsx`, each reverted: schools title-site alone,
  schools hero-site alone, both schools sites, freeDays at one of its two sites,
  immersionSchools, visitSchools, objectives. **All seven fail by name.** The freeDays
  one matters most — that collection was not what the fix was tuned against.
- Dropping the tier read entirely (`school.tier === 'inmersion'` →
  `school.immersionDays !== undefined`) fails the unprintable-declaration check on all
  seven tier leaves.

## Governance, changed today

Brent has retired the round caps as a stopping condition (PLAN Decision Log,
2026-08-06): *"the cap is irrelevant, we have to keep going till it's production
ready."* This **supersedes the A6r stopping rule** recorded in the ledger on 2026-08-05,
which said the phase ships if only guard-completeness gaps remain. Do not moderate your
findings to fit a round budget — classify honestly; every BLOCKING gets a round.

A6r is a **public marketing page for a paid program**, so "production ready" includes
what a buyer sees: correctness of cohort facts, legibility on the low-end school hardware
this repo targets, and the D-02 price boundary.

## Output

Use the CODEX REVIEW format. Findings classified BLOCKING / SHOULD-FIX / NIT, each with
the file:line and how you reproduced it. Write your review to
`docs/plan/reviews/REVIEW-A6R.md` — A6r has no committed review artifact yet; your two
previous ones exist only in chat, which is a gap in the record worth closing.
