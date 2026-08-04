# CODEX REVIEW — A1 repricing round r2

VERDICT: PASS

Both round-1 BLOCKING findings and its SHOULD-FIX are closed at reviewed branch
head `82aaee1`. The public arrays now transcribe the complete ordered Appendix
A-7 lists, the production scanner catches €1.000, €1.560 and €560, and the live
2.500 expression is bounded against the larger/malformed controls while still
catching `€2.500,00`. I independently reproduced all three build-level
red→mutant-green→restored-red proofs, including the €1.560 leak from my own
round-1 finding. One new, non-blocking weakness exists in the R2 drift-test
harness: its claimed duplicate-line check does not count occurrences.

BLOCKING:

- None.

SHOULD-FIX:

- [S2 — new in R2] The A-7 parser does not actually enforce its “exactly one line” contract
  — `__tests__/lib/pasantias-cohort.test.ts:66-72`. Both supplied regular
  expressions are non-global, so `APPENDIX_A7.match(leadIn)` returns the first
  match plus capture groups; `matches.length` is not the number of matching
  lines and is always `1` here because the expressions have no captures. I
  inserted a second, contradictory `**NO incluye:**` list inside Appendix A-7
  and the complete cohort suite still passed **43/43**. This does not weaken the
  current plan-vs-module equality—the Appendix currently has one canonical line
  for each list, and the R1 bad-copy mutant dies—but it makes the new helper's
  loud-failure guarantee false in precisely the duplicate-normative-copy class
  this plan has already encountered. Count all matching lines (for example via
  a global clone plus `matchAll`) and add a control proving a duplicate matching
  lead-in fails before parsing either one.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **Round-1 `[B1]` CLOSED — current copy is canonical.** Appendix A-7 at
  `docs/plan/PLAN.md:411,413` and the arrays at
  `lib/pasantias/cohort-public.ts:246-267` have the same six includes and six
  excludes, in the same order, with wording and punctuation preserved. The
  only transformation is the documented sentence-position capital on each
  extracted list item. The two formerly wrong strings now read
  `Bibliografía básica recomendada, una bitácora y un sistema de registro de los
  aprendizajes, presentado al menos un mes antes del viaje` and `Pasajes aéreos
  y transporte terrestre de llegada y salida`.
- **The drift-test design is accepted, subject to new `[S2]`.** Reading the
  normative Appendix at test time is materially stronger than maintaining a
  second hand-written expected array: `readAppendixA7()` scopes parsing to the
  A-7 section, `parseA7Items()` mechanically removes Markdown/list punctuation,
  and lines 345-363 compare both complete ordered arrays and require every
  normalized item to occur in the Appendix. Reintroducing both R1 paraphrases
  into `cohort-public.ts` independently produced **2 failed / 41 passed**. The
  test therefore kills the regression it was added for; `[S2]` concerns only a
  second matching normative line being silently ignored.
- **Round-1 `[B2]` CLOSED — all retired amounts are load-bearing.** Against a
  fresh build publishing only `Total retirado: €1.560 por persona`, the restored
  scanner failed once as `priced-amount`; deleting only
  `'1[.,\\s]?560'` made the unchanged bundle report `OK`; restoring it failed
  once again. The same sequence succeeded for `€560` by removing/restoring only
  `retired-short-amount`, and for `€1.000` by removing/restoring only
  `'1[.,\\s]?000'` plus `'1e3'`. Thus evidence §8.1-§8.3 is independently
  reproduced, including the exact mutant that exposed the R1 false negative.
- **The committed scanner regressions are appropriately production-facing.**
  `__tests__/scripts/check-price-leak.test.ts:101-140` sends four €1.560 shapes
  and three €560 shapes through the exported production `scanText`, pins their
  distinct check ids, and proves `560` inside `1.560` does not double-report.
  Direct independent probes found `priced-amount` for €1.000 and €1.560 and
  `retired-short-amount` for €560.
- **Round-1 `[S1]` CLOSED — whole-amount boundaries work.**
  `scripts/check-price-leak.mjs:129-180` applies the shared lookarounds to the
  live/retired programme amounts, band amounts and retired short amount. Direct
  probes caught `€2.500` and `€2.500,00`, while `€12.500`, `€2.5000`,
  `€22.500`, `€12.500,00`, `€21.000`, `€1.200,70` and `€120.000` were all
  silent. The committed controls at
  `__tests__/scripts/check-price-leak.test.ts:142-168` cover the requested live
  cases, and the pre-existing band controls remain green.
- **The executor's `(?:,\\d{2})?` tail is accepted.** It consumes the valid
  decimal suffix before the final boundary checks, preserving `€2.500,00` as a
  finding; it does not reopen either named false positive because a preceding
  digit still blocks `€12.500` and a trailing digit still blocks `€2.5000`.
  Applying it through the shared helper also retains the band controls above.
- **Rendered closure evidence is sound.** I inspected
  `docs/plan/evidence/a3/brochure-09.png`: both corrected strings render in full,
  the two columns contain six bullets each, and there is no clipping or unwanted
  second-page flow.
- **PM position verified.** Commit `82aaee1` is the branch head and adds the PM
  verification as the last ledger entry at `docs/plan/LEDGER.md:987-995`. The
  actual graph is eleven commits after base `f4fa33a`; the R2 implementation
  commits under review are `698b5b1` and `60c2377`, followed only by that PM
  verification commit.
- **Independent head gates.** At `82aaee1`, `npm run type-check` passed;
  `npm run lint` passed with zero warnings; `npm test` passed **238/238 files and
  3605/3605 tests**; `npm run build` compiled and generated **156/156 static
  pages**; and `node scripts/check-price-leak.mjs` reported a clean scan of the
  fresh local build (**262 client files** in this environment). The targeted
  R2 suites passed **84/84** before mutation. `git diff --check
  afdc3cf..82aaee1` is clean. No DB or browser behavior changed, so pgTAP and
  Playwright were not rerun.
- Re-review scope was limited to commits `698b5b1` and `60c2377`, verification
  of round-1 `[B1]`, `[B2]` and `[S1]`, and new defects introduced by those
  commits. No implementation, plan, evidence or generated artifact was edited
  by the reviewer; this review file is the sole branch change.

There is one numbered residue for Brent under SOP §1.5: S2.
