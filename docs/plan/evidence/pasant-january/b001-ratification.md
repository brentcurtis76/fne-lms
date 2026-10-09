# PASANT-B001e — Brent's ratification of the January 2027 contract

Evidence for B001 (C002, C003), prepared 2026-10-09 by the PASANT-06 r0 executor under approved plan PASANT rev 1. It
records Brent's whole-contract answer and what it activates. It is the linked correction of BD-07 in
`b001-brent-decisions.md`, which stays as dated: on 2026-10-08 whole-contract approval was NOT GIVEN.

## 1. Record

Brent answered a Decide question in the flight-deck console. The authoritative record is
`/home/brent/Projects/pm-workflow/decisions/6d9b56320e62019a.json` (outside the repository); the PM relayed it
verbatim in `pm-workflow/runs/PASANT-05/BRENT-ANSWER-20261009-092335.md`.

| Key | Value |
|---|---|
| question | 6d9b56320e62019a |
| asked | 2026-10-09T07:43:31-03:00 |
| answered | 2026-10-09T09:23:35-03:00 |
| by | Brent |
| channel | console |
| choices | Approve this contract / Request corrections |
| picked | Approve this contract |
| candidate | docs/plan/pasantias-january-contract.md at fb2d1de82affedbeeeac36da96855b83d49fb5a5 |
| candidate sha256 | 2869bec779581a417fab4ae642339acf679222034312bed6c56e7f9e2f863cee |
| data sha256 | f379bc899803ce8ea891b4e38db8f24e9e34818557b2940b70aae925d9868ba9 |

The question, verbatim: "Do you approve the attached January contract with your corrections and designed brochure?
It interprets “Confirm it” as approval of the RPA claim. Corrected brochure upload and email verification remain
release requirements."

`candidate sha256` is the file Brent approved (`git show fb2d1de82:docs/plan/pasantias-january-contract.md |
sha256sum`). `data sha256` is the SHA-256 of that file's machine-readable block without its `status` key, serialised
with `JSON.stringify`; ratification changes the status, the opening paragraph and §8, never a fact, price, identity or
answer, so the active contract must still produce it.

## 2. What it settles

- **R-11 DECIDED**: the whole contract as approved — brochure `2027-01-V1` facts, Brent's answers BD-00 to BD-05 in
  `decided` and §7, the retained decisions and exclusions in §6 and the packaging in §7.
- **BD-04 stays interpreted.** "Confirm it" does not name RPA; the question stated that interpretation and Brent
  approved the contract with it. The `basis` of P-02 is not relabelled.
- The contract is the single normative source for active January 2027 facts once `docs/plan/PLAN.md`'s Decision
  Log says so (2026-10-09 row and its January 2027 amendment, C003).

## 3. What it does not settle

- **R-08** — corrected designed brochure, final hash, exact object key, upload before the BROCHURE_VERSION deployment
  and its verification: Brent-owned release.
- **R-17** — production mail state and A2-11/A2-12/A2-13 delivery evidence: Brent-owned release.
- No deployment, production or provider operation, migration or real mail is authorised to agents; no plan deviation
  is inferred.
- The product still renders the October 2026 cohort. January runtime content is B003; cumulative verification is
  B006. Parent B001 stays open until the C001–C003 gates pass independent review.
