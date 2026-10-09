# PASANT-B001b — January contract prerequisite register

Evidence for B001 (C001–C003), prepared 2026-10-08 by the PASANT-03 r0 executor and updated the same day by the
PASANT-04 r0 executor (B001c) with Brent's recorded answers (`b001-brent-decisions.md`), then on 2026-10-09 by the
PASANT-06 r0 executor (B001e) with Brent's ratification (`b001-ratification.md`). It routes every item behind
`docs/plan/pasantias-january-contract.md` (RATIFIED — ACTIVE since 2026-10-09). The register itself decides
nothing. Parent B001 stays open until C001–C003 all pass.

Classes: **SUPPLIED FACT** — stated by the pinned brochure (SHA `84d83e15…`); **HISTORICAL RECORD** — preserved
from committed A9 evidence; **PLAN DEFAULT** — set by plan rev 1, applies unless B001 records a change;
**ROUTINE FREEZE** — implementation choice plan rev 1 assigns to B001; **RECOMMENDED** — a proposal the named
authority selects in the B001 continuation record; **PM RECORD** — a routine choice or ACK the named PM recorded under
plan rev 1; **UNRESOLVED** — needs evidence or a Brent decision not found; **DECIDED** — only with dated Brent
evidence (`b001-brent-decisions.md`).

## 1. Register

| ID | Topic | Class | Evidence | Blocks | Route |
|---|---|---|---|---|---|
| R-01 | Brochure year, program identities, dates, durations, schools and prices | SUPPLIED FACT | brochure 84d83e15 p1, p3–p7, p14–p16; plan rev 1 constraint "year, identities and dates are supplied facts" | — | none |
| R-02 | Mussons vs Musons (DEC-01, contract P-01) | DECIDED | Brent 2026-10-08T21:39:14-03:00 "the name is Jordi Musons" (`b001-brent-decisions.md` BD-01, explicit); brochure 84d83e15 p4, p12 "Jordi Mussons" kept as original provenance; matches October Appendix A-6 | — | contract `decided` P-01; the designed file's typo goes to R-08 |
| R-03 | RPA Mineduc certification claim (DEC-02, P-02) | DECIDED | Brent 2026-10-08T21:39:14-03:00 "Confirm it" (`b001-brent-decisions.md` BD-04, **interpreted**: the words do not name RPA; the recording interpreter maps them to this question); brochure 84d83e15 p2 | — | contract `decided` P-02; the sign-off question (R-11) states the interpretation |
| R-04 | Track-record claims 400+ / 40+ / 12 (P-03) | DECIDED | Brent 2026-10-08T21:39:14-03:00 "Same numbers for January" (`b001-brent-decisions.md` BD-02, explicit); brochure 84d83e15 p1–p2; October Appendix A-9 (Brent 2026-07-31) | — | contract `decided` P-03 |
| R-05 | INSPIRA four-of-five visit presentation (DEC-03, P-04) | DECIDED | Brent 2026-10-08T21:39:14-03:00 "4 visits" (`b001-brent-decisions.md` BD-03, explicit); selection stays conditional per brochure 84d83e15 p4, p5, p9 (BD-00) | — | contract `decided` P-04 |
| R-06 | Document packaging (DEC-04) | PLAN DEFAULT | plan rev 1 architecture: one price-free two-program ficha plus the supplied designed brochure | — | B001 records any change |
| R-07 | Designed versus generated publication (DEC-05) | DECIDED | Brent 2026-10-08T21:40:06-03:00 "it should publish my  design" (`b001-brent-decisions.md` BD-05, explicit) | — | designed upload through the R-08 release gate |
| R-08 | D-05 designed-upload gate | UNRESOLVED | PLAN D-05 and Decision Log 2026-08-02; plan rev 1 dependency: final hash, exact object key, upload before the BROCHURE_VERSION deployment; the designed file still spells "Mussons" (BD-05 note) | only the release that changes BROCHURE_VERSION | Brent-owned release: corrected designed file, final hash, object key, upload and verification; not a local development blocker |
| R-09 | Program IDs `enero-2027`, `inspira`, `mirada-profunda` (DEC-06) | ROUTINE FREEZE | plan rev 1 architecture: "Freeze the two program IDs in B001" | — | frozen with the contract |
| R-10 | Truthful registration and direct-access success copy (DEC-07) | PLAN DEFAULT | plan rev 1 architecture and C007: no promise that email was sent or will arrive | any later email promise needs R-17 evidence | B001 records any change |
| R-11 | Canonical status and contract ratification (DEC-08) | DECIDED | Brent 2026-10-09T09:23:35-03:00 "Approve this contract" (`b001-ratification.md`, question 6d9b56320e62019a, candidate SHA 2869bec7 at fb2d1de82). History kept: Brent 2026-10-08T21:36:27-03:00 "The brochure is the source of truth" (BD-00) settled the source only, and whole-contract approval was NOT GIVEN on 2026-10-08 (`b001-brent-decisions.md` BD-07) | — | contract active: C003 PLAN amendment and oracle transition (B001e); January runtime content is B003 |
| R-12 | A9 writer release | DECIDED | Brent 2026-10-08T21:40:06-03:00 "handoff is confirmed" (`b001-brent-decisions.md` BD-06, explicit). Superseded PASANT-03 finding, kept: UNKNOWN in `b001-a9-snapshot.md`, `b001-reconciliation.md` §4, `docs/plan/LEDGER.md` at HEAD and at `origin/phase/a9-verify` 9008bacd | — | release recorded; R-13 ACK follows |
| R-13 | Receiver ACK | PM RECORD | `pasant-02-pm0-2e20` ACKs the Brent-confirmed handoff, order PASANT-04 r0 be973700 under plan rev 1 (`b001-brent-decisions.md` §4); it follows R-12 and does not substitute for it | — | none; routine B001 selection, not takeover by inactivity |
| R-14 | Selected baseline | PM RECORD | `76349909621bc07a1c7ab8242cd3c3ececaed152` selected by `pasant-02-pm0-2e20`, order PASANT-04 r0 be973700 under plan rev 1 (`b001-brent-decisions.md` §4); refreshed origin/main fetched by PASANT-01, base of `ws/pasant-as` | — | product implementation starts from `ws/pasant-as` |
| R-15 | A9 continuation: relevant-path provenance port | PM RECORD | selected by `pasant-02-pm0-2e20`, order PASANT-04 r0 be973700 under plan rev 1 (`b001-brent-decisions.md` §4): port `tests/e2e/pasantias-flow.spec.ts`, the `__tests__/pages/pasantias-site-links.test.ts` guards, the `scripts/ci/e2e-mandatory.mjs` registration (union) and `docs/plan/evidence/a9/**` citing originals 82bc0e7b79a750d07f62da7cc5b322eca4d0194e and 9008bacddcf40a79aa4c051b11ab3a5baf33939b; not the historical whole-19-commit cherry-pick | B003/B006 amendments of the flow spec | later scoped B001 work, not B001c; R-12 and R-13 are now recorded |
| R-16 | A9 counters and owner-row results | HISTORICAL RECORD | `b001-a9-snapshot.md` and reconciliation §4: executor rounds r1–r4; Sol rounds 1, 2, 3 FAIL, caps overridden twice; A2-9 **PASS**, A2-11 **FAIL**, A2-12 **FAIL**, A2-13 **BLOCKED** | — | preserved unchanged; release rows stay on Brent's track |
| R-17 | Production mail state | UNRESOLVED | UNKNOWN: A9 LEDGER 2026-08-08 DNS root cause; PROJECT_STATE 2026-08-25 records configured variables, not delivery | email promises; A2-11, A2-12, A2-13 release rows | Brent-owned release verification |
| R-18 | Correos excluded, backlog preserved | PLAN DEFAULT | plan rev 1 non-goals | — | none |
| R-19 | October legal and consent decisions retained | PLAN DEFAULT | plan rev 1 C003: retain approved legal and consent decisions unless amended | — | none |

## 2. Actual Brent instructions versus agent proposals

Actual, dated Brent instructions found for this project:
- 2026-10-08T19:54:57-03:00, flight deck: "Approved in the flight deck." — plan PASANT rev 1
  (`projects-v2/PASANT/draft/approval-f326716d048a-20261008-195457-e5b232b68515.md`).
- 2026-10-08T21:36:27–21:40:06-03:00, flight deck "Ask Claude" chat: the three messages in `b001-brent-decisions.md`
  (BD-00 to BD-06). BD-04 is interpreted; the rest name their topic. Whole-contract approval was NOT GIVEN (BD-07).
- 2026-10-09T09:23:35-03:00, flight-deck console, Decide question 6d9b56320e62019a: "Approve this contract" — the
  whole January contract at SHA 2869bec7, with the BD-04 interpretation stated in the question (`b001-ratification.md`).
- October-era Decision Log entries in `docs/plan/PLAN.md` (e.g. 2026-08-02 designed brochure via D-05) — historical,
  not January decisions.

Agent proposals, not instructions: the PASANT brief (written by the planning agent), the fact-matrix proposals,
reconciliation §6, the sign-off wording in contract §8 and the B001b `proposed` values those answers replaced. PM
records (R-13 to R-15) are routine choices under plan rev 1, not Brent decisions. No January ratification by Brent
was found on 2026-10-08; Brent gave it on 2026-10-09 (above).
