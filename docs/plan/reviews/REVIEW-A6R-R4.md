# CODEX REVIEW — A6r fourth review R4

VERDICT: PASS

r9 closes R3 B1 exactly as required. The restatement rule now covers printable
strings at every length, the punctuation defect in the quiet module is repaired
at the word level, and real one-site hardcodes of both `COHORT_LODGING_AREA` and
the shorter multi-site cohort label make the guard fail. A6r [A1]–[A7] are
satisfied at implementation head `63ebf9d6`. One mandatory phase-close document
is still frozen at r8 and should be brought current, but it does not weaken the
implementation or make the page unsafe to merge.

BLOCKING:

- None.

SHOULD-FIX:

- [S1] The required phase review request was not updated for r9 and now records
  obsolete evidence and an obsolete coverage limit —
  `docs/planning/reviews/fase-a6r-review-request.md:5-15,116-144,217-243,351-360`.
  At the reviewed implementation head the branch has 15 commits from
  `b8f5c05d`, not 13; the guard is 2,550 lines / 42 tests, not 2,397 / 41; and
  the full suite is 6,169 tests, not 6,168. More importantly, scrutiny item 0a
  still says `isRestatable` excludes short strings and presents that hole as the
  rule's current limit, even though r9 deleted the function and closed exactly
  that hole. This file is the mandatory phase-close handoff, so update its round
  history, file/gate counts, r9 negative controls, declarations/cost discussion,
  and known limitations; recount after this R4 review commit is added. This is
  the same documentation class as R2 S1 and is not a product-behavior blocker.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- R3 `[B1]` is **CLOSED**. `isRestatable` and its inherited floor are gone;
  `restatementsOn` at
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:1307-1321` evaluates every
  distinct rendered form at every length. `MIN_SCANNED_LENGTH = 12` remains only
  on the source and fragment substring scans, where its stated false-positive
  tradeoff still applies. There is no `lodgingArea` path exemption and no moved
  floor.
- The `markTokens` repair is correct. At
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:446-448` it marks every
  Unicode letter/digit run, turning `Barcelona.` into `Barcelonazzq.` rather
  than `Barcelona.zzq`; the whole-word matcher can no longer see the original
  city before punctuation. Both `mutateValue` and `quietValue` use the helper.
  This is the right repair to the proof surface, not an expected-restatement
  declaration for an artifact the module was supposed to remove.
- The six new declarations are legitimate and narrow. `lodgingArea` declares
  nine ordinary-copy sites: metadata, FAQ, section eyebrow, long-weekend card,
  and five visit-school labels. Each `visitSchools[0..4].tier` separately
  declares the two ordinary `visita` headings. The orphan assertion checks the
  exact path/form/count tuples, so a sixth school is not silently inherited by
  a generated declaration. I checked the reasons against
  `pages/pasantias.tsx:152,518,755,832,846,921,945`.
- Independent page mutations exercise behavior rather than imports or snapshots.
  Replacing only the FAQ's `{COHORT_LODGING_AREA}` at
  `pages/pasantias.tsx:508` with `Barcelona` failed three guard tests and
  reported `lodgingArea: "Barcelona" at 10`. Replacing only the FAQ's
  `{COHORT_LABEL}` at `pages/pasantias.tsx:543` with `Octubre 2026`, while the
  eyebrow at `:892` stayed wired, failed the source, fragment, and restatement
  layers. Replacing only the FAQ's `{freeDayRange}` at `:517` with
  `10 al 12 de octubre` still failed and named both endpoint leaves. The page
  was restored after every mutation and is byte-clean.
- The maintenance price of the nine-site `lodgingArea` count does not change the
  answer. Copy or cohort-list edits that alter an ordinary `Barcelona` site will
  deliberately red the suite until the declaration is updated. The failure is
  loud and mechanical; tolerating a moving count would also tolerate the literal
  R3 demonstrated. This is acceptable brittleness for [A1], not a new finding.
- A6r [A2]–[A7] remain satisfied. The page has no protected price token, keeps
  the A6a section/test hooks, has one `h1` and valid whole-document heading
  order, passes axe serious/critical checks and the real-background contrast
  assertions, uses repository assets rather than remote resources, renders at
  the 390/1280 acceptance widths, and retains the interim mailto `#programa`
  panel. The refreshed full-page evidence remains visually sound; r8/r9 did not
  change the page.
- A6b is not made harder. `id="programa"`, `pasantias-programa`, the section
  boundary, two-column layout, and the documented right-column `LeadForm` swap
  survive at `pages/pasantias.tsx:1093-1152`. No form behavior entered A6r.
- The 2,550-line guard remains disproportionate, but this is **not** the round
  where the extraction flips into a remediation finding. Its mechanisms all
  answer demonstrated false-passes, and moving roughly 700 lines while closing
  correctness findings would have obscured review. Extract the generic machinery
  to `__tests__/support/cohort-contract.ts` as an isolated follow-up before the
  next substantial contract edit; it need not block this phase.
- Independent gates at `63ebf9d6`: cohort guard **42/42**; full Vitest **262
  files / 6,169 tests**; type-check clean; lint clean with zero warnings;
  production build successful; price-leak scan clean over **263** client files;
  targeted Playwright **16/16**, including axe and both contrast viewports.
- Reviewed exact branch `phase/a6r-design` at implementation head `63ebf9d6`,
  merge-base `b8f5c05d`, across 15 pre-review commits and 80 changed files. No
  frozen-decision, security, privacy, database, middleware, deployment, A6b
  coupling, or unrelated scope issue was found.
