# Review request — PASANT-B001b (January contract candidate + prerequisite register)

## Branch

`ws/pasant-as` at HEAD `0c8e5206afd51f4b8dbf81b2306f63e398edd819`, base `76349909621bc07a1c7ab8242cd3c3ececaed152`
(refreshed origin/main recorded by PASANT-01) plus 2 PASANT-01 commits. Commit count by this executor: 0 — the PM
owns commits; the four files below are uncommitted at delivery. Local `origin/main` has since moved to `ce78d459`
(+2 commits, notifications only, fetched by another session); see register R-14.

## Objective and scope

Prepare one evidence-backed January contract candidate with executable independent fact/price checks and a precise
prerequisite register (ledger PASANT-B001b, derived from B001; C001–C003 stay on the parent). **Scope in:** the
candidate contract (status CANDIDATE — NOT RATIFIED — NOT ACTIVE), the prerequisite register, the focused oracle
test, this request. **Scope out:** ratification, PLAN.md amendment, public-module comment, cohort-oracle replacement,
A9 port or takeover, any product, DB, UI or workflow change. **B001 remains open**; this child cannot unlock B002.

## Round 1 remediation (review r0 F1, F2)

- F1: the fact oracle checked anchors, not values. `checkFacts` now compares the candidate against `REQUIRED_FACTS`
  (all 41 public facts: page, value, verbatim source evidence) and `REQUIRED_PENDING` (P-01..P-04 identity), pinned
  in the test from the source pages. It rejects a changed value or page, and a missing, duplicated or unlisted fact
  or pending field, even with the anchor intact. A table test requires every ISO day (January 2027) and count in a
  pinned value to appear in its source evidence.
- F2: `checkPrices` pins the team range to 1–10 (page 15 "Si viajan 1, 2 o 10"), rejects any other candidate range,
  and always checks all 20 page-15 rows (10 sizes × 2 tiers, both program columns) whatever range the candidate states.
- Red-then-green: the same 48 mutations detected 4/48 with the r0 verifier and 48/48 with r1 (RUN evidence
  `r1-red-green.cjs`); the PM's `pm-counterexample.cjs` now reports an error for each of its three mutations.

## Files by risk

- Medium — `__tests__/lib/pasantias/january-contract.test.ts`: the oracle. Pinned source expectations for every fact,
  recomputed totals, pinned team range; no `lib/` imports; mutation and corruption cases prove it fails.
- Medium — `docs/plan/pasantias-january-contract.md`: 41 anchored public facts, 4 pending fields, commercial block,
  retained decisions, packaging/publication recommendation. r1 changed only the §1 provenance wording.
- Low — `docs/plan/evidence/pasant-january/b001-contract-prerequisites.md`: 19-row register, Brent-versus-agent split
  (unchanged in r1).
- Low — this file.

## Test evidence

- `npx vitest run __tests__/lib/pasantias/january-contract.test.ts __tests__/lib/pasantias/january-source.test.ts`
  → 2 files, 132 passed (102 + 30), 0 skipped, default and `CI=1` (r0: 81).
- `npx vitest run __tests__/lib/pasantias-cohort.test.ts` → 54 passed (unchanged October regression).
- `npx eslint --max-warnings=0` on both January tests → clean; isolated `tsc --noEmit --strict` → clean;
  `git diff --check` → clean.
- Full type-check, lint, `npm test` and build are deferred to the final cumulative B001 state by the order — not run here.

## Scrutinize

1. Pending versus public split: I published the brochure's facts but held the Sadako host name, the RPA claim and the
   400+/40+/12 claims as pending. Holding the track-record claims (P-03) is my own call — October confirmation exists.
2. `REQUIRED_FACTS` repeats the candidate's values on purpose. The source tie is the verbatim evidence on the pinned
   page plus the ISO-day and count check; English paraphrase values (e.g. "April online session") are pinned, not
   derived. Check that each pinned value says what its evidence says.
3. The price oracle infers rounding to the nearest $100.000; the brochure only says "aprox.". If the rounding rule is
   wrong, the arithmetic check could reject a correct future correction.
4. R-14/R-15 recommend 76349909 and a relevant-path port; the remote has moved since. Check that the recommendation
   is still the right default and that the port stays blocked on R-12/R-13.
5. Anchor and evidence matching ignores whitespace (NFKC, all whitespace removed), the same as
   `january-source.test.ts`; it cannot tell word boundaries apart. The D1 "not active" test must be updated
   deliberately by C003, not deleted.

## Known limitations

- Writer release, receiver ACK and production mail state are UNKNOWN; no Brent January correction or ratification was
  found. Nothing is DECIDED.
- Snapshot checks are not original-PDF checks; the PASANT-01 RUN validator remains the PDF ↔ snapshot link.
- No fetch was performed; the origin/main observation comes from the shared local remote-tracking ref.
