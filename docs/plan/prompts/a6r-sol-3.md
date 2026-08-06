# CODEX SOL — THIRD REVIEW, INSPIRA phase A6r

Branch **`phase/a6r-design`**, head **`1b405ddb`** (pushed, `origin` matches), base `main`
@ `b8f5c05d`, 13 commits. Worktree `~/dev/wt-a6r`; `main` checkout `~/dev/fne-lms`.

Your R2 review is on the branch at `docs/plan/reviews/REVIEW-A6R-R2.md`.

**You have final say on BLOCKING items.** Round caps were retired by the owner
(PLAN Decision Log, 2026-08-06) — classify honestly, every BLOCKING gets a round.

## What happened since R2

**r7 closed your B1 and S1.** The `ambas` site is gone — the FAQ is count-neutral now —
and a declared `CARDINALITY_WORDS_ES` set makes a cardinality asserted in a non-number
word fail on a grown surface. The review-request counts are recomputed and correct (13
commits at this head, three standalone ledger commits).

**r8 closed a BLOCKING finding you have not seen, raised by the PM after r7 landed.**
`provesRendered` required a leaf's old value to become *rarer*, not to *disappear*
(`countUnmutated(output, form) < countUnmutated(baseline, form)`), so a fact printed at
two sites and hardcoded at one classified as `rendered`. Proved on `freeDayRange`, which
prints at the FAQ answer and the finde card: **hardcoding either site alone left the suite
38/38 green.** Both sites hardcoded failed, but only because no wired consumer was left.

That was the **third appearance of one shape** — counts at two sites (your r5 B1),
a fragment while the full leaf rendered elsewhere (your r6 B2), and a formatted leaf value
at two sites. r8's brief was to generalise it rather than fix the third instance.

## The three things worth your attention

**1. The new restatement rule, and whether it is the last of that shape.** It asks the
question inverted: on the quiet module — every string leaf marked — the module holds none
of its own values, so any survivor on the printed surface is a literal the page typed.
That is `quietModule()`, the machinery r5 and r6 already built, finally applied to leaves.
`__tests__/pages/pasantias-hardcoded-cohort.test.ts`, `describe('the restatement rule')`.
**Ask what shape is left.** Three rounds have each found one more.

**2. Its declared limit, which the PM probed and confirms is exactly as stated.**
`isRestatable` exempts strings below `MIN_SCANNED_LENGTH` (12), naming "Barcelona" and
"visita" as the exposed values. `COHORT_LODGING_AREA` is "Barcelona", printed at three
sites; **hardcoding one leaves the suite green.** This is the same trade this project
accepted at r1 for the source scan — below that floor a string is as likely to be ordinary
Spanish as a planted fact — and closing it means either a hand-maintained list of ordinary
Spanish or false positives on every copy edit that says "Barcelona". Dates are exempt from
the floor at any length and numbers are always checked, so the case that actually bit us is
covered regardless. **Disagree if you think that trade is wrong**; it is disclosed, not
hidden.

**3. Size.** The guard is **2397 lines against a 1235-line page**, nearly two to one. You
already ruled that the behaviour stays and the mechanism move to
`__tests__/support/cohort-contract.ts` happens after the correctness rounds rather than
inside one. If four consecutive correctness rounds have changed your view on when that
extraction should happen, say so — the PM will not act on it inside a remediation round
without you.

## What the PM verified, by attacking real source

- `freeDayRange` hardcoded at the **FAQ site alone** → fails by name. At the **finde card
  alone** → fails by name. The failure names leaf, rendered form and site count
  (`freeDays[0].date: "10 de octubre" at 1`).
- **An attack the round never used:** `COHORT_HEADLINE` hardcoded at the hero (`:702`)
  while still wired at the CTA eyebrow (`:1126`) → **four tests fail**.
- **No regression on the case that motivated the weaker rule:** `{school.levels}` hardcoded
  to `'Infantil, primaria y ESO'` — the value a sibling school also holds, which is why `<`
  was used instead of `=== 0` — still fails four tests.
- The single `EXPECTED_RESTATEMENTS` entry is a real coincidence (the bare `9` in
  `WHATSAPP_DISPLAY`), declared **by site count** so a `9` typed into either real
  `visitDayCount` site fails it. All four line citations in its reason check out.
- Gates: 6168 tests / 262 files, type-check, lint, build, price-leak (263 files), 16/16
  e2e. Guard file alone: 41 tests.

## Known and disclosed

- The short-string floor above (`COHORT_LODGING_AREA`).
- `docs/plan/reviews/REVIEW-A6R.md` is **untracked** in the worktree — it is committed on
  `main`, which this branch does not contain. A leftover working copy, not a stranded
  artifact.
- Unchanged debts, all out of A6r's scope: the `cohort-contract.ts` extraction, two empty
  photo slots, `styles/globals.css:1` pulling Inter from a CDN app-wide, the 1440×600 hero
  contrast case, no `prebuild` for the image manifest, `id="dos-semanas"` (A7a rewires it).
- The two itinerary week cards keep the long date form ("5 de octubre al 9 de octubre")
  while the long-weekend card uses the short one — **owner decision, 2026-08-06**, not an
  oversight.

## The check

1. Are the r7 and r8 closures real — verified, not taken from this prompt?
2. A6r [A1]–[A7] at this head. The page has not changed since r7; r8 is test-only.
3. Run the tests yourself. Do they test behaviour?
4. Frozen decisions, correctness, security, edge cases.
5. Anything that makes A6b (the lead form, landing in `#programa`) harder.
6. Scope creep.

Taste disagreements are NITs. Output in CODEX REVIEW format and **commit your review** to
`docs/plan/reviews/REVIEW-A6R-R3.md`.
