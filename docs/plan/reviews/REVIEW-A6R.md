# CODEX REVIEW — A6r final review

VERDICT: FAIL

The redesigned page satisfies the visual, accessibility, price-boundary, asset,
responsive-evidence and interim-CTA criteria, and every independently rerun gate is
green. A6r is still not mergeable because its A6r [A1] guard blesses cohort facts that
the page currently restates as literals. One false-pass is an incorrect declared
collection exception; the other is a distinct partial-string/multi-site blind spot.

BLOCKING:

- [B1] The guard declares `weeks` uncounted while the page hardcodes the current
  two-week cardinality at multiple buyer-visible sites —
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:1088`,
  `pages/pasantias.tsx:96`, `pages/pasantias.tsx:695`, and
  `pages/pasantias.tsx:1049`. The exception's own reason says a third week would
  render nothing and calls `"Dos semanas, dos modos"` copy. It is nevertheless a
  cohort fact: the page promises two weeks in its metadata, section heading, and
  programme description. A6r [A1] says every fact comes from
  `cohort-public.ts`; classifying a literal fact as copy does not satisfy that
  contract. I reproduced the false-pass by running
  `npx vitest run __tests__/pages/pasantias-hardcoded-cohort.test.ts` (29/29
  green) and then tracing the suite's collection mutation: `weeks` is grown at
  `:773-788`, the page remains unchanged because it destructures only the first
  two weeks at `pages/pasantias.tsx:388`, and the green honesty check at
  `:1326-1329` accepts the resulting `unpublished` proof because of this
  exception. Required closure: derive every user-visible week cardinality from
  the public module (including metadata and `#programa` copy), remove the
  `weeks` exception, and add a negative control proving that pinning any one of
  those sites to the old count fails while the other sites remain wired. If the
  two-card design intentionally supports exactly two weeks, make that structural
  invariant explicit in the public module/contract rather than encoding it as
  prose that can drift.

- [B2] The source/render guard permits a page to repeat part of a module string
  as a literal at one site while rendering the full, wired value at another —
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:251-260` and
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:576-588`. The current page
  already exercises the hole: `pages/pasantias.tsx:430-431` restates
  `"Fiesta Nacional de España"` from
  `COHORT_FREE_DAYS[2].label`, and `pages/pasantias.tsx:864-865` restates
  `"El orden de las visitas puede variar"` from
  `COHORT_WEEKS[1].summary`. The source scan looks only for the complete leaf;
  the render proof likewise requires only the complete old leaf to lose an
  occurrence. Because the full label/summary also renders at wired sites, both
  mutations pass while these partial copies stay stale—the same multi-site
  failure shape that r5 fixed for counts. I reproduced this by locating the two
  literals with `rg`, confirming their complete source leaves in
  `lib/pasantias/cohort-public.ts:60-61` and
  `lib/pasantias/cohort-public.ts:76-82`, and rerunning the 29-test guard, which
  remains green. Required closure: remove these restatements or derive them from
  structured public-module fields, then extend the negative controls so a
  partial literal at one rendered site fails even when another site still emits
  the fully wired leaf. Do not solve this with another hand-maintained phrase
  list.

SHOULD-FIX:

- [S1] The per-site count proof silently weakens for a future one-element
  collection — `__tests__/pages/pasantias-hardcoded-cohort.test.ts:922-935`.
  `printsStaleSize` returns `false` below length two, so such a collection falls
  back to the aggregate counting half that is known not to catch a literal at
  only one of several sites. No current `COHORT_PUBLIC` collection has that
  shape, so this does not permit a customer-visible fact to be stale today and
  does not independently block A6r. Add an explicit assertion over the
  collections to fail on the unsupported shape until the per-site mechanism can
  handle it; the limitation should not become silently active when the module
  evolves.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- Reviewed branch `phase/a6r-design` at exact head `0c4d87bb`, merge-base
  `b8f5c05d`, across all nine commits and all 78 changed files. The page is
  byte-identical after `9c3c9134`; the final two code rounds change only the
  A6r [A1] guard.
- A6r [A2]-[A7] are satisfied at this head. The page imports only the public
  cohort module, exposes no protected price token, keeps the required test hooks,
  has one `h1` and valid whole-document heading order, has no serious/critical axe
  violation, uses repository assets, retains the `#programa` mailto panel, and
  has complete 390/1280 evidence. I inspected the full-page and section PNGs at
  both acceptance widths; no clipping, overflow, illegible text or broken-image
  treatment was visible.
- All 27 declared reasons were checked against the page. The leaf exceptions,
  discriminator reasons, uniform immersion-duration reason, and nine other
  uncounted collection shapes are accurate. The `weeks` declaration is the one
  that is factually accurate about what the code does but invalid as an A6r [A1]
  exception: it describes the hardcoding instead of preventing it.
- Independent gate evidence: `npm run type-check` clean; `npm run lint` clean
  with zero warnings; targeted A6r Vitest 42/42 (including the guard 29/29); full
  Vitest 262 files / 6,156 tests; production build successful;
  `check-price-leak` green over 263 client files; targeted Playwright
  (`pasantias-page`, `footer-heading-order`, `smoke`) 16/16.
- The 1,551-line guard is worth retaining: its mechanisms each answer a
  demonstrated false-pass, and runtime is negligible. After the blocking
  semantics are closed, move the generic walker/mutation/classification machinery
  to `__tests__/support/cohort-contract.ts` and leave declarations plus suite in
  the page-specific file. That is a maintainability judgment, not a remediation
  finding; mixing the move into the correctness round would make the next review
  harder.
- No frozen-decision violation, security issue, database change, middleware
  change, deployment action, or unrelated scope creep was found.
