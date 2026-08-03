# EXECUTOR PROMPT — a1-repricing round r2 (INSPIRA Comms) — Sol remediation

Closes REVIEW-A1-REPRICING.md's two BLOCKING findings (file on the branch; PM
triage in the branch ledger) and takes its SHOULD-FIX in the same pass, since
all three touch the same two files. Everything else from r1 stands — including
the BROCHURE_VERSION v3 bump, which Sol accepted.

BRANCH: `phase/a1-repricing` (EXISTING — continue it)
FIRST ACTIONS: `git fetch origin`; worktree per the usual rule (detach fallback
+ push `HEAD:phase/a1-repricing` if held); copy `.env.local` in; read Appendix
A-7 from **origin/main HEAD** — it is canonical.

## Finding 1 — includes/excludes must match A-7 verbatim

Sol found two strings in `lib/pasantias/cohort-public.ts` that differ from the
canonical Appendix A-7 lists. You flagged this yourself in r1 as the stricter
reading you did not take; Sol ruled it the correct one.

Transcribe BOTH arrays verbatim from A-7's "El programa (€2.500) incluye — seis
cosas" and "NO incluye" sentences — item order, wording and punctuation as the
Appendix has them (drop only the Appendix's own bold markers and the trailing
parenthetical note). Then add a test that each array element appears verbatim
in the A-7 text, so future drift fails rather than passes. Do not paraphrase to
"improve" the copy; if a string in A-7 reads awkwardly, ship it and note it.

## Finding 2 — the guard misses €1.560 (BLOCKING)

`scripts/check-price-leak.mjs` currently guards the retired €1.000 but not the
retired €1.560 / €560. That gap came from an earlier PM prompt that removed
them when the values were deleted from the module — before the retired-amount
concept existed. **Every retired amount is guarded, permanently:**

- Restore `1.560` and `560` to the retired patterns alongside `1.000`, using the
  same currency-context machinery (they are prices, not bare numerals).
- Note in the comment WHY retired amounts stay forever: the module no longer
  holds them, so the only way they can reach a bundle is hand-written copy —
  which is exactly the leak worth catching.
- Extend the §7.4-style mutation proof to cover BOTH retired amounts: for each,
  delete its pattern, show a build publishing that amount passes, restore,
  show it fails. Append to `docs/plan/evidence/a1/leak-guard.md`.

## SHOULD-FIX (take it now) — bound the 2.500 pattern

`2[.,\s]?500` also matches `€12.500` and `€2.5000`. Bound it on both sides the
way the band patterns already are (no preceding digit, no trailing digit/decimal)
and add negative controls for `€12.500`, `€2.5000`, `€22.500` plus a positive
control that real `€2.500` still fires.

ACCEPTANCE: both arrays verbatim-equal to A-7 with a drift test; guard catches
€1.000, €1.560 AND €560 with per-amount mutation evidence; 2.500 pattern bounded
with negative controls; full gates + leak script green.
RULES: SOP + repo CLAUDE.md; surgical; max 3 red iterations then BLOCKED; if
A-7 itself looks wrong → FINDINGS, do not "fix" the Appendix.
Round-r2 section in `docs/planning/reviews/fase-a1-repricing-review-request.md`.
WHEN DONE: LEDGER entry, push, EXECUTOR REPORT per SOP §2.3.
