# CODEX REVIEW — A1 repricing round r1

VERDICT: FAIL

The commercial module is correctly repriced to €2.500, the A3 price pins are
green, and the three regenerated brochure pages visibly carry the new price,
terms, and `2026-10-v3`. The round is not mergeable because the public arrays do
not match canonical Appendix A-7 exactly and the post-build retired-amount guard
provably allows a public €1.560 leak. Both gaps are hidden by the current green
tests.

BLOCKING:

- [B1] The public includes/excludes copy is not an exact transcription of
  canonical Appendix A-7 — `lib/pasantias/cohort-public.ts:242,252`. Appendix
  A-7 at `docs/plan/PLAN.md:411,413` says `Bibliografía básica recomendada, una
  bitácora y un sistema de registro de los aprendizajes, presentado al menos un
  mes antes del viaje`; the module retains the pre-amendment insertion `para
  preparar el viaje` and drops the comma before `presentado`. A-7 says `pasajes
  aéreos y transporte terrestre de llegada y salida`; the module instead says
  `Pasajes aéreos ni transporte terrestre de llegada/salida`. This matters
  because the owner declared the reviewed brochure canonical and the round's
  explicit instruction was to replace the arrays from A-7, not preserve earlier
  approved paraphrases. `brochure-09.png` faithfully renders the two wrong module
  strings, while `__tests__/lib/pasantias-cohort.test.ts:281-332` pins only the
  counts and selected amendment deltas, so all 41 cohort tests remain green.
  Required closure: transcribe both A-7 strings exactly; make the cohort suite
  compare the complete ordered includes and excludes arrays with Appendix A-7;
  regenerate and inspect `brochure-09.png`; and keep the absence pins for the
  retired meals, closing-dinner carve-out, and included transport.

- [B2] The production leak scanner does not catch the retired €1.560 total —
  `scripts/check-price-leak.mjs:69-80`. The comment explicitly excludes €1.560
  and the amount list contains only the live 2.500 shapes and retired 1.000
  shapes. Direct calls through the scanner's exported production `scanText`
  returned `priced-amount` for `€1.000` but no finding for `€1.560`, `€1560`, or
  `currency:"EUR",amount:1560`. A stronger isolated build mutation rendered
  `Total retirado: €1.560 por persona` in `pages/index.tsx`; the literal was
  present in the generated client chunk and the unmodified guard nevertheless
  reported `OK`. Section 7 of
  `docs/plan/evidence/a1/leak-guard.md:239-368` demonstrates only €1.000, and
  §7.4 removes only its two patterns; it therefore does not prove the requested
  two-retired-amount contract. Required closure: restore €1.560 to the
  post-build amount patterns in its grouped/bare bundler shapes; add isolated
  scanner tests for both €1.000 and €1.560; extend §7 with a real €1.560 build
  failure; rerun §7.4 so a mutant without the retired patterns is shown to miss
  both stale amounts; restore the patterns; and finish on a clean build plus a
  green 266-file scan.

SHOULD-FIX:

- [S1] Bound the live `2[.,\s]?500` alternative as a whole amount inside the
  existing 120-character currency window — `scripts/check-price-leak.mjs:76-81,126-132`.
  Independent probes confirm that the current production scanner fires on both
  unrelated `€12.500` and malformed `€2.5000`, not only `€2.500`. The clean scan
  over 266 current files proves there is no present collision, so this is not a
  blocker today; it is a predictable future false positive that can turn the CI
  guard into noise. Since B2 already requires editing this amount expression,
  add digit/grouping/decimal boundaries and negative controls for at least
  `€12.500` and `€2.5000`, while retaining all six positive 2.500 shapes.

NITS:

- [N1] The review request's branch audit is stale —
  `docs/planning/reviews/fase-a1-repricing-review-request.md:3-11` says three
  commits, while `git rev-list --count f4fa33a..54ffbb6` returns seven. The
  additional history is explainable (the review-request/ledger commit, the
  tree-neutral reconciliation merge, the preserved pre-rebase findings commit,
  and the final PM verification), and the reconciliation commit leaves the
  findings entry once in the tree, but the final review request should report
  the actual head history.

NOTES ON THE PLAN ITSELF:

- **Commercial terms otherwise match Appendix A-8.**
  `lib/pasantias/cohort-commercial.ts:47-96` has the sole fixed programme item at
  `2500`, retains the €70–€120 per-person/per-night base-double lodging band,
  50%/30-day payment terms, five-person minimum, and cohort-scoped validity, with
  no combined total. Production code contains no live €1.000 value; remaining
  occurrences in the reviewed surfaces are retirement comments and negative
  tests.
- **The `BROCHURE_VERSION` bump is accepted and necessary.** D-05 at
  `docs/plan/PLAN.md:37` keys the cached `propuestas` object on this constant,
  and the constant's own contract requires a bump whenever brochure values or
  copy change. Keeping v2 would allow A4 to serve cached €1.000 bytes after the
  repricing. The PM's acceptance is technically sound; this is not scope creep.
- **The `format.ts` comment update is accepted.** Repricing an es-CL formatting
  example from the retired €1.000 to the live €2.500 changes no behavior and
  avoids a misleading example in the brochure formatter.
- **Test pins are partly correct but incomplete in the blocking ways above.**
  The targeted cohort/leak/PDF run passed **3 files / 97 tests**. The commercial
  test pins `[2500]` and rejects runtime 1000; the PDF suite requires `2.500`,
  rejects bare and currency-context 1.000, retains the band/no-total assertions,
  and its independent retired-PDF regexes do catch both 1.000 and 1.560. That
  PDF-only protection does not repair B2's client-bundle scanner.
- **Section 7's €1.000 mutation was independently reproduced.** In an isolated
  detached worktree, a built `Programa: €1.000 por persona` produced one
  `priced-amount` failure. Removing the two 1.000 patterns without rebuilding
  made the same leaking bundle report `OK`, exactly as §7.4 claims. The temporary
  worktree was removed after the test and the reviewed branch was never mutated.
- **Rendered evidence inspected.** `brochure-08.png` visibly shows €2.500, the
  €70–€120 base-double lodging terms, coordination line, payment split, minimum,
  and validity; `brochure-09.png` shows the new week-1 lunch and week-2
  meals/dinners/transport allocation (along with B1's two noncanonical strings);
  `brochure-10.png` visibly shows `Versión 2026-10-v3`. No clipping or layout
  regression is visible on those pages.
- **PM ledger position verified.** The final branch commit `54ffbb6` adds the PM
  verification as the last ledger entry. Its acceptance of the version bump is
  sound, but its statement that §7.4 proves the retired-amount guard is
  load-bearing is complete only for €1.000, not €1.560.
- **Independent head gates.** At `54ffbb6`: `npm run type-check` passed;
  `npm run lint` passed with zero warnings; `npm test` passed **238/238 files and
  3587/3587 tests**; `npm run build` compiled and generated **156/156 static
  pages**; and `node scripts/check-price-leak.mjs` reported **266 client files,
  no commercial data found**. `git diff --check f4fa33a..54ffbb6` is clean. No
  database or browser surface changed, so pgTAP and Playwright were not rerun.
- Review scope was the actual seven-commit graph from base `f4fa33a` through
  final head `54ffbb6`, not the request's abbreviated table. No implementation,
  plan, evidence, or generated artifact was edited by the reviewer; this review
  file is the sole branch change.

There is numbered residue for Brent under SOP §1.5: B1, B2, S1, and N1.
