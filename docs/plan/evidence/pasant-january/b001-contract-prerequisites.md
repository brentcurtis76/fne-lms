# PASANT-B001b — January contract prerequisite register

Evidence for B001 (C001–C003), prepared 2026-10-08 by the PASANT-03 r0 executor. It routes every open item behind
`docs/plan/pasantias-january-contract.md` (CANDIDATE — NOT RATIFIED — NOT ACTIVE). Nothing here is a decision.
Parent B001 stays open until C001–C003 all pass.

Classes: **SUPPLIED FACT** — stated by the pinned brochure (SHA `84d83e15…`); **HISTORICAL RECORD** — preserved
from committed A9 evidence; **PLAN DEFAULT** — set by plan rev 1, applies unless B001 records a change;
**ROUTINE FREEZE** — implementation choice plan rev 1 assigns to B001; **RECOMMENDED** — a proposal the named
authority selects in the B001 continuation record; **UNRESOLVED** — needs evidence or a Brent decision not found;
**DECIDED** — only with dated Brent evidence (none exists for January yet).

## 1. Register

| ID | Topic | Class | Evidence | Blocks | Route |
|---|---|---|---|---|---|
| R-01 | Brochure year, program identities, dates, durations, schools and prices | SUPPLIED FACT | brochure 84d83e15 p1, p3–p7, p14–p16; plan rev 1 constraint "year, identities and dates are supplied facts" | — | none |
| R-02 | Mussons vs Musons (DEC-01, contract P-01) | UNRESOLVED | brochure 84d83e15 p4, p12 "Jordi Mussons"; October Appendix A-6 and `lib/pasantias/cohort-public.ts:265` "Jordi Musons" (October brochure owner-reviewed 2026-08-02); `public/images/consultants/jordi-mussons.png` exists (supporting only) | B003 rendering of the Sadako host name | Brent correction at B001 ratification, collected by PM |
| R-03 | RPA Mineduc certification claim (DEC-02, P-02) | UNRESOLVED | brochure 84d83e15 p2; no certification evidence found in the repository or PASANT records | B003 publication of that one claim | Brent supplies certification evidence or drops the claim |
| R-04 | Track-record claims 400+ / 40+ / 12 (P-03) | UNRESOLVED | brochure 84d83e15 p1–p2; Appendix A-9 confirmed them for October only (Brent 2026-07-31) | B003 publication of those claims | Brent confirms for January at ratification |
| R-05 | INSPIRA four-of-five visit presentation (DEC-03, P-04) | UNRESOLVED | brochure 84d83e15 p4, p5, p9: conditional selection; proposal in contract P-04 | B003 INSPIRA itinerary copy | Brent accepts or corrects the proposal |
| R-06 | Document packaging (DEC-04) | PLAN DEFAULT | plan rev 1 architecture: one price-free two-program ficha plus the supplied designed brochure | — | B001 records any change |
| R-07 | Designed versus generated publication (DEC-05) | UNRESOLVED | plan rev 1 sets no mode; contract §7 recommends designed upload | B003 brochure path selection | Brent selects at ratification |
| R-08 | D-05 designed-upload gate | UNRESOLVED | PLAN D-05 and Decision Log 2026-08-02; plan rev 1 dependency: final hash, exact object key, upload before the BROCHURE_VERSION deployment | only the release that changes BROCHURE_VERSION | Brent-owned production storage write |
| R-09 | Program IDs `enero-2027`, `inspira`, `mirada-profunda` (DEC-06) | ROUTINE FREEZE | plan rev 1 architecture: "Freeze the two program IDs in B001" | — | frozen with the contract |
| R-10 | Truthful registration and direct-access success copy (DEC-07) | PLAN DEFAULT | plan rev 1 architecture and C007: no promise that email was sent or will arrive | any later email promise needs R-17 evidence | B001 records any change |
| R-11 | Canonical status and contract ratification (DEC-08) | UNRESOLVED | no January ratification by Brent found (searched as in §2) | contract activation: C003 PLAN amendment, oracle switch, B003 content | Brent ratifies; PM records it |
| R-12 | A9 writer release | UNRESOLVED | UNKNOWN. Searched: `b001-a9-snapshot.md` and `b001-reconciliation.md` §4; `docs/plan/LEDGER.md` at HEAD and at `origin/phase/a9-verify` 9008bacd (writer release, receiver, ACK, handoff, takeover); PASANT brief, approval record, PASANT-01 PM-OWNER and handoffs, PASANT-02 handoff | A9 relevant-path port (R-15) | the A9 writer ("SESSION: INSPIRA · A9 · PM") or Brent records a release |
| R-13 | Receiver ACK | UNRESOLVED | UNKNOWN (same search). A named prospective receiver's ACK cannot substitute for the previous writer's release; inactivity is not release | A9 relevant-path port (R-15) | named receiver ACKs after R-12 |
| R-14 | Selected baseline | RECOMMENDED | refreshed origin/main 76349909 (PASANT-01, 2026-10-08) is HEAD's base; local origin/main later moved to ce78d459 (+2 commits, notifications only, no Pasantías path) by another session's fetch | product implementation start | PM records the selected SHA in the B001 continuation record |
| R-15 | A9 continuation: relevant-path provenance port | RECOMMENDED | port `tests/e2e/pasantias-flow.spec.ts`, the `__tests__/pages/pasantias-site-links.test.ts` guards, the `scripts/ci/e2e-mandatory.mjs` registration (union) and `docs/plan/evidence/a9/**` citing originals 82bc0e7b and 9008bacd; not the historical whole-19-commit cherry-pick | B003/B006 amendments of the flow spec | PM records it; executes only after R-12 and R-13 |
| R-16 | A9 counters and owner-row results | HISTORICAL RECORD | `b001-a9-snapshot.md` and reconciliation §4: executor rounds r1–r4; Sol rounds 1, 2, 3 FAIL, caps overridden twice; A2-9 **PASS**, A2-11 **FAIL**, A2-12 **FAIL**, A2-13 **BLOCKED** | — | preserved unchanged; release rows stay on Brent's track |
| R-17 | Production mail state | UNRESOLVED | UNKNOWN: A9 LEDGER 2026-08-08 DNS root cause; PROJECT_STATE 2026-08-25 records configured variables, not delivery | email promises; A2-11, A2-12, A2-13 release rows | Brent-owned release verification |
| R-18 | Correos excluded, backlog preserved | PLAN DEFAULT | plan rev 1 non-goals | — | none |
| R-19 | October legal and consent decisions retained | PLAN DEFAULT | plan rev 1 C003: retain approved legal and consent decisions unless amended | — | none |

## 2. Actual Brent instructions versus agent proposals

Actual, dated Brent instructions found for this project:
- 2026-10-08T19:54:57-03:00, flight deck: "Approved in the flight deck." — plan PASANT rev 1
  (`projects-v2/PASANT/draft/approval-f326716d048a-20261008-195457-e5b232b68515.md`).
- October-era Decision Log entries in `docs/plan/PLAN.md` (e.g. 2026-08-02 designed brochure via D-05) — historical,
  not January decisions.

Agent proposals, not instructions: the PASANT brief (written by the planning agent), the fact-matrix proposals,
reconciliation §6, every `proposed` value in the contract, the recommendations in R-14 and R-15, and contract §7.
No January correction, ratification, publication mode or A9 release by Brent was found.
