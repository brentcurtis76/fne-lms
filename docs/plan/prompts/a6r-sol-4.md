# CODEX SOL — FOURTH REVIEW, INSPIRA phase A6r

Branch **`phase/a6r-design`**, head **`63ebf9d6`** (pushed, `origin` matches), base `main`
@ `b8f5c05d`. Worktree `~/dev/wt-a6r`; `main` checkout `~/dev/fne-lms`.

Your R3 review is on the branch at `docs/plan/reviews/REVIEW-A6R-R3.md`.

**You have final say on BLOCKING items.** Round caps are retired (PLAN Decision Log,
2026-08-06) — classify honestly.

## What r9 did with your B1

The floor is **gone from the restatement rule**, not moved: `isRestatable`'s length
exemption is removed, so short printable strings go through the quiet-module check like
everything else. Neither closure you forbade was used — no path-level exemption for
`lodgingArea`, no silent floor change. The source scan and the fragment rule keep their
own twelve-character floors, now argued in the file rather than inherited.

Six declarations carry the legitimate overlaps, each with `path` / `form` / `sites` and a
reason checked line by line.

**Removing the floor exposed a real bug in the quiet module, present since r5.**
`quietValue` marked whitespace-delimited tokens, so `'Barcelona.'` became `Barcelona.zzq`
— and the word-boundary matcher, which stops at any non-letter, still saw a bare
`Barcelona` **at a correctly wired site**. It surfaced as a false positive against correct
code. The fix marks the word rather than the token (`/[\p{L}\p{N}]+/gu`). The executor
repaired the mechanism instead of declaring the mismarked form as an expected restatement,
on the grounds that the latter would be "a declaration that is true of the code and false
as a proof". **Check that repair independently** — it changes what every quiet-module rule
sees, r5's counts and r6's fragments included.

## What the PM verified

- `COHORT_LODGING_AREA` hardcoded at the alojamiento FAQ (`:508`) with the programme card
  wired → **three tests fail**, reporting `lodgingArea: "Barcelona" at 10` against the
  declared 9. Hardcoded at the programme card (`:1087`) with the FAQ wired → same.
- **An attack the round never ran:** `COHORT_LABEL` ("Octubre 2026") hardcoded at `:543`
  while still wired at the `:892` eyebrow → three tests fail. Short two-site values are
  covered as a class, not just the one you reported.
- **No regression through the marking change:** r8's `freeDayRange` single-site attack
  still fails; r6's fragment attack still fails.
- The nine-site `lodgingArea` reason was checked at `:152`, `:518`, `:755`, `:832`, `:945`
  — all accurate. The five `visitSchools[*].tier` declarations are written index by index
  rather than derived from the module, with the reason stating why.
- Gates: 6169 tests / 262 files, type-check, lint, build, price-leak (263 files), 16/16
  e2e. Guard file alone: 42 tests. Page byte-identical to r7.

## Two things to weigh, both disclosed

**1. The price of your B1, now visible.** The `lodgingArea` declaration stands at **nine
sites — four prose, five per-visit-school labels.** Any copy edit that adds or removes the
word "Barcelona", and any change to the visit-school list, moves that count and reds the
suite until the declaration is updated. The failure message names leaf, form and both
counts, so the repair is mechanical. The PM's position: your finding was correct on the
contract, [A1] is what it is, and this is its price — recorded rather than argued. **If
you now think the price changes the answer, say so; that is a judgement, not a finding.**

**2. Size.** The guard is **2550 lines against a 1235-line page**. You have twice ruled the
behaviour stays and the extraction to `__tests__/support/cohort-contract.ts` happens after
the correctness rounds. If this is the round where that flips, say so explicitly — the PM
will not act on it inside a remediation round without you.

## The check

1. Is your B1 actually closed, and is the `markTokens` repair correct?
2. A6r [A1]–[A7] at this head. The page has not changed since r7; r8 and r9 are test-only.
3. Run the tests yourself. Do they test behaviour?
4. Frozen decisions, correctness, edge cases.
5. Anything that makes A6b harder.
6. Scope creep.

Taste disagreements are NITs. Output in CODEX REVIEW format and **commit your review** to
`docs/plan/reviews/REVIEW-A6R-R4.md`.
