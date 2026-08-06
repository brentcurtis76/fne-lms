# CODEX REVIEW — A6r third review R3

VERDICT: FAIL

r7 closes both R2 findings: the FAQ is count-neutral, its stale `ambas`
wording has a real negative control, and the review request now reports the
actual 13-commit / three-standalone-ledger-commit history. r8 also catches the
reported multi-site failure for long and formatted values. A6r is still not
mergeable, because the new general rule deliberately exempts short strings and
therefore leaves a required current cohort fact with the same demonstrated
multi-site false-pass.

BLOCKING:

- [B1] The restatement rule excludes every non-date string shorter than 12
  characters — `__tests__/pages/pasantias-hardcoded-cohort.test.ts:1191-1199` —
  even though A6r [A1] requires every cohort fact, including the lodging area,
  to come from the public module. `COHORT_LODGING_AREA` is `Barcelona`, and the
  live page prints it at `pages/pasantias.tsx:1087` in addition to other wired
  surfaces. I independently replaced only that occurrence with the literal
  `Barcelona`, left the other occurrences wired, and ran the entire cohort
  guard: all 41 tests passed. The source scan and fragment rule share the same
  floor, while `provesRendered` only requires the old value to become rarer at
  `__tests__/pages/pasantias-hardcoded-cohort.test.ts:696-709`; consequently no
  layer rejects this real A1 violation. The original source-scan tradeoff does
  not transfer to the strong restatement rule: it was accepted while the render
  contract was believed to provide complementary coverage, and r8 now correctly
  documents that this coverage is insufficient for multi-site facts. Required
  closure: apply the quiet-module restatement check to short printable strings
  as well (or add an equivalently strong, general mechanism), classify legitimate
  ordinary-copy overlaps with exact path/form/site-count declarations and
  reasons, and add a negative control that hardcodes exactly one real
  `COHORT_LODGING_AREA` site while the remaining sites stay wired and requires
  the guard to fail. Do not solve this by adding `lodgingArea` to a path-level
  exemption or by silently moving the length floor.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- r7 genuinely closes R2 B1. The FAQ now derives the free-day count and range
  without saying `ambas`, `CARDINALITY_WORDS_ES` recognizes both gendered forms,
  and the negative control restores the actual stale phrase and identifies it.
  r7 also closes R2 S1: the review request matches the branch's 13 commits from
  `b8f5c05d` and three standalone ledger commits.
- r8's strong rule works for the class it scans. Independently pinning only the
  FAQ's real `freeDayRange` text made the restatement test fail and named both
  endpoint date leaves; pinning the hero headline also failed. The committed
  formatted-date negative control is non-vacuous and exercises one site at a
  time. `EXPECTED_RESTATEMENTS` records the one current numeric coincidence by
  exact path, form and site count and has an orphan-declaration check.
- A6r [A2]-[A7] remain satisfied at implementation head `1b405ddb`. I inspected
  the refreshed 390 and 1280 px full-page evidence and the changed modes/FAQ
  captures; there is no clipping, overflow or broken layout. Metadata, heading
  order, accessibility, local assets, price boundaries and existing A6a hooks
  remain intact.
- A6b is not made harder: `id="programa"`, the section boundary and
  `pasantias-programa` hook survive, and the intended right-column `LeadForm`
  replacement seam is documented. No form behavior was pulled into A6r.
- Independent evidence: targeted A6r Vitest 54/54, including the 41-test cohort
  guard; full Vitest 262 files / 6,168 tests; type-check clean; lint clean with
  zero warnings; production build successful; price-leak scan clean over 263
  client files; targeted Playwright 16/16. The decisive negative control is that
  the same 41-test guard stayed green with the live lodging-area site hardcoded.
- Reviewed exact branch `phase/a6r-design` at implementation head `1b405ddb`,
  merge-base `b8f5c05d`, across 13 commits and 79 changed files. No
  frozen-decision, security, privacy, database, middleware, deployment or
  unrelated-scope issue was found. The disclosed guard-file size and previously
  accepted visual/content debts remain deferred and are not reopened here.
