# Review request — PASANT-B001e: ratified January normative-source transition

## Branch

- Branch `ws/pasant-as`; base `76349909621bc07a1c7ab8242cd3c3ececaed152` (selected baseline, R-14); state before this
  unit `d0bcc86d735e1bee42af73aea3932726799eb262`, 8 commits ahead of base. This unit's changes are uncommitted for the
  PM harness commit (order PASANT-06 r0; the executor makes no commits).
- Unit PASANT-06 r0, ledger item PASANT-B001e, derived from PASANT-B001 (C002/C003) under plan PASANT rev 1.

## Objective and scope

Objective (order): record Brent's ratification and make the contract the normative January fact source through the
planned Decision Log amendment and an independent January oracle, preserving October history and runtime behaviour
pending B003. This child does not close parent B001 or assert completed rendered January product.

- In: ratification record and contract/register status; PLAN.md Decision Log row plus linked January 2027 amendment;
  contract oracle moved from candidate checks to ratification/authority checks; January oracle in the cohort test;
  January rendered-content oracle in the page test; comment-only precedence note in the public cohort module.
- Out: January runtime/module/schema/form/API/PDF changes; parent acceptance; C004–C011; migrations; provider/auth;
  designed-file upload; real mail; Appendix A or October Decision Log edits; refactoring; new dependencies.

## Files by risk

- Medium — `docs/plan/PLAN.md`: one Decision Log row (2026-10-09) and a new `## January 2027 amendment` section before
  Appendix A. Additions only; removing both restores the pre-unit bytes (SHA `a7604638…`, pinned in the oracle).
- Medium — `docs/plan/pasantias-january-contract.md`: status `RATIFIED — ACTIVE`, opening paragraph and §8 rewritten.
  The data block is the approved one except `status` (data SHA `f379bc89…` equals the candidate's at `fb2d1de82`).
- Medium — `__tests__/lib/pasantias/january-contract.test.ts`: `checkRatification`, `checkPlan`, R-11/R-17 register
  rules, candidate assertions replaced, retained-file pins extended; all 41 fact pins and price checks unchanged.
- Medium — `__tests__/lib/pasantias-cohort.test.ts`: January oracle parsed from the contract; October describes kept
  verbatim as transitional coverage (only the A-7 comment changed); B003 gate table.
- Medium — `__tests__/pages/pasantias-hardcoded-cohort.test.ts`: January rendered-content oracle with open render gates.
- Low — `lib/pasantias/cohort-public.ts`: 7 comment lines; comment-stripped transpile identical to HEAD.
- Low — `docs/plan/evidence/pasant-january/b001-ratification.md` (new), `b001-contract-prerequisites.md` (R-11, §2).
- Low — this file. `b001-brent-decisions.md`, the fact matrix, snapshot and prior review requests are unchanged and pinned.

## Criterion matrix

| Criterion | Done here (source activation) | Still open (product verification) |
|---|---|---|
| C002 ratification | R-11 DECIDED from the 2026-10-09 answer; BD-07 kept as history | R-08 designed file/hash/key/upload, R-17 mail: Brent-owned releases |
| C003 Decision Log | sole January source, January-only supersession, retained decisions, Correos, A9 | independent PM review of the declaration |
| C003 cohort oracle | expectations parsed from the contract; every contract fact mapped to one B003 gate | runtime carries October until B003 (C004/C005) |
| C003 rendered oracle | per-program forms from the contract; 8 unrendered forms declared as gates | page shows both programs and January dates: B003; cumulative: B006 (C011) |
| C001 | unchanged by this unit | parent B001 stays open until C001–C003 gates pass review |

## Test evidence

- Focused: `npx vitest run` on january-contract, january-source, pasantias-cohort, pasantias-hardcoded-cohort,
  pasantias-site-links → 5 files, 327 passed (contract 177, source 30, cohort 64, hardcoded 48, links 8); baseline
  269 (135/30/54/42/8). Full gates (type-check, lint, `npm test`, synthetic loopback build) are run on this state and
  recorded in the RUN executor report r0.
- Scratch mutations (RUN `evidence/d3-mutations.tsv`): removed Decision Log row, rewritten Appendix A-1, contract back
  to candidate, altered fact, other choice, missing answer time, R-17 decided, BD-07 rewritten, runtime cohort flipped,
  altered program name — each fails the oracles; every file restored byte-identical.

## Scrutinize

1. "Comment-only" and "October unchanged" rest on two pins: a comment-stripped transpile of the public module and the
   PLAN hash with the amendment removed. Check that neither pin can pass a semantic change (for example an Appendix
   edit hidden inside the amendment section).
2. The contract's opening paragraph and §8 changed after Brent approved its bytes. The data-block hash proves no fact,
   price, identity or answer moved; check that the new prose claims nothing the question did not attach.
3. The rendered oracle proves containment, not attribution: the October page already prints every shared school, so
   only names, audiences, takeaways and end dates are open gates. Check that this limit is stated, not hidden.
4. The cohort oracle's transition tripwire is `COHORT_ID` still October plus no January date in `COHORT_PUBLIC`. Check
   that B003 cannot move to January without failing it, and that no October assertion was weakened or skipped.
5. Ratification pins come from the PM's relay of `decisions/6d9b56320e62019a.json`; the oracle cannot read that file.

## Known limitations

- No January runtime: the page and modules render October 2026 until B003; C004–C007 and B006 (C011) are open.
- R-08 (corrected designed brochure, final hash, object key, upload before the BROCHURE_VERSION deployment) and R-17
  (production mail, A2-11/A2-12/A2-13) remain Brent-owned release gates. A9 history (A2-9 PASS, A2-11 FAIL, A2-12
  FAIL, A2-13 BLOCKED) and all prior review requests are preserved.
- An unratified contract fails the cohort and page oracles at collection (loud whole-file failure), not per test.
