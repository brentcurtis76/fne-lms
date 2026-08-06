# CODEX REVIEW — A6r re-review R2

VERDICT: FAIL

r6 closes the fragment-restatement finding and the one-element collection
weakness, and it correctly derives the explicit `dos`/`Dos` week counts in the
metadata, section heading and `#programa` copy. A6r is still not mergeable:
the fourth buyer-visible cardinality site remains a literal synonym for two,
while the new “at every site” proof only searches for number words and therefore
passes the page as it stands.

BLOCKING:

- [B1] The long-weekend FAQ still hardcodes the two-week shape as `Entre ambas
  semanas` — `pages/pasantias.tsx:488`. r6's own `weeks` exception identifies
  that FAQ as one of four places that state the cardinality, then says the
  separate test proves every one —
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:1319-1323`. It does not:
  `countWordOccurrences` recognizes only the indexed number words
  `dos`/`tres` at `:1055-1061`, and the “at every site” assertion merely requires
  `dos` to disappear and `tres` to appear at `:1728-1747`. `ambas` survives a
  three-week mock unchanged and is invisible to both comparisons. The exact-two
  assertion at `:1711-1725` is useful and correctly prevents a module-only third
  week from passing, but it proves the current two-card implementation limit; it
  does not make this buyer-facing cardinality come from the module, and a later
  intentional three-card redesign can update that invariant while leaving the
  FAQ stale. This is the remaining instance of the same A6r [A1] class, not a
  copy-taste objection. Required closure: make the FAQ count-neutral (for
  example, anchor the sentence on the long weekend rather than on “both weeks”)
  or derive its cardinality grammar, and add a negative control in which the
  real `Entre ambas semanas` phrase is restored and a three-week surface fails.
  Then rewrite the `weeks` exception/review evidence so it describes what the
  two complementary mechanisms actually prove.

SHOULD-FIX:

- [S1] The required review request misstates the branch ledger at
  `docs/planning/reviews/fase-a6r-review-request.md:5-7`: the branch has 10
  commits from `b8f5c05d`, not 11, and three standalone ledger commits, not
  four. This is already disclosed by the PM and does not affect product
  behavior, but the phase-close document should be corrected in the same
  remediation round.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- B2 is closed. The two live restatements are gone, and the fragment rule reads
  a quiet-module render rather than relying on the whole-leaf occurrence that
  caused the false-pass. Its real-source control is behavior-level, the
  two-token/12-character floor is reasoned rather than tuned, and the eleven
  surviving overlaps were checked against their stated page sources. I found no
  undeclared current cohort fragment.
- The former S1 is closed. `counts no collection the per-site proof cannot read`
  explicitly rejects any counted collection with fewer than two members, so the
  documented `printsStaleSize` limitation cannot become active silently.
- A6r [A2]-[A7] remain satisfied at `073f0051`. I inspected the refreshed full
  and changed-section evidence at 390 and 1280 px; the FAQ rewrite and deleted
  school note introduce no clipping, overflow or broken layout. The metadata
  helper supplies the same description to standard, OG and Twitter tags; the
  existing A6a hooks, heading order, price boundary, accessibility checks,
  local assets and interim `#programa` mailto panel remain intact.
- A6b is not made harder: `id="programa"`, the section boundary and
  `pasantias-programa` hook survive, and the code documents the intended
  right-column `LeadForm` replacement seam. No form behavior was pulled into
  A6r.
- Independent evidence: targeted A6r Vitest 49/49, including the 36-test cohort
  guard; full Vitest 262 files / 6,163 tests; type-check clean; lint clean with
  zero warnings; production build successful; price-leak scan clean over 263
  client files; targeted Playwright 16/16. The fact that the 36-test guard is
  green while `pages/pasantias.tsx:488` contains `ambas` is the reproduced
  false-pass described in [B1].
- Reviewed exact branch `phase/a6r-design` at head `073f0051`, merge-base
  `b8f5c05d`, across 10 commits and 78 changed files. No frozen-decision,
  security, privacy, database, middleware, deployment or unrelated scope issue
  was found. The disclosed repeated-month wording and the previously accepted
  empty-photo/font/contrast/manifest debts are not reopened here.
