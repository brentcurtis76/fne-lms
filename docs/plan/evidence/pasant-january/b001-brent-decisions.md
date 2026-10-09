# PASANT-B001c — Brent's recorded January answers

Evidence for B001 (C001–C003), prepared 2026-10-08 by the PASANT-04 r0 executor under approved plan PASANT rev 1. It
records what Brent actually said, what each answer settles in `docs/plan/pasantias-january-contract.md`, and which
links are interpretation. **Whole-contract approval: NOT GIVEN.** Nothing here ratifies or activates the contract.

## 1. Source

- Brent answered in the flight deck's "Ask Claude" chat on 2026-10-08, 21:36–21:41 -03:00. That chat could not record
  them; Claude Code recorded them at Brent's request in `pm-workflow/runs/PASANT-02/BRENT-ANSWERS-20261008.md`
  (outside the repository), from transcript `d8f27c6c-c449-40cf-ae94-b64b88e1c5cb.jsonl`.
- The PASANT-02 PM (`pasant-02-pm0-2e20`) independently matched each message in that transcript (times are UTC). The
  quotes below are the transcript text; the answer record normalises the double spaces in message 3.
- The answers follow the chat's numbered questions, taken from this unit's open questions. Mapping a fragment to a
  question is **explicit** when the fragment names its own topic and **interpreted** when only the question order
  links it (the recording interpreter's mapping, kept as such).

## 2. Brent's messages (verbatim)

| Message | At (UTC) | At (Chile) | Text |
|---|---|---|---|
| M1 | 2026-10-09T00:36:27.557Z | 2026-10-08T21:36:27-03:00 | "The brochure is the source of truth" |
| M2 | 2026-10-09T00:39:14.785Z | 2026-10-08T21:39:14-03:00 | "1. the name is Jordi Musons / Same numbers for January / 4 visits / Confirm it" |
| M3 | 2026-10-09T00:40:06.782Z | 2026-10-08T21:40:06-03:00 | "2. it should publish my  design  3. handoff is confirmed" |

## 3. Decision matrix

| ID | Topic | Message | Words | Basis | Settles |
|---|---|---|---|---|---|
| BD-00 | Canonical source (DEC-08, source part) | M1 | The brochure is the source of truth | explicit | brochure `2027-01-V1` (SHA `84d83e15…`) stays the source for every fact not corrected below; its text and hash are unchanged |
| BD-01 | Sadako host name (DEC-01, contract P-01) | M2 | the name is Jordi Musons | explicit | "Jordi Musons"; the brochure's "Jordi Mussons" (p4, p12) is a typo kept as original provenance |
| BD-02 | Track-record claims (contract P-03) | M2 | Same numbers for January | explicit | 400+ pasantes / 40+ colegios / 12 escuelas, the October numbers (PLAN Appendix A-9, Brent 2026-07-31) and the brochure p2 numbers |
| BD-03 | INSPIRA visits (DEC-03, contract P-04) | M2 | 4 visits | explicit | present four visits; which four stays conditional, chosen with the group from five candidates (brochure p4, kept under BD-00) |
| BD-04 | RPA Mineduc certification claim (DEC-02, contract P-02) | M2 | Confirm it | interpreted | keep the brochure p2 claim; "Confirm it" does not name RPA — the recording interpreter maps the fourth answer to the RPA question |
| BD-05 | Publication mode (DEC-05) | M3 | it should publish my  design | explicit | designed upload, not a generated brochure; the designed file still says "Mussons", so the corrected file, its hash and object key go to the Brent-owned D-05 release |
| BD-06 | A9 handoff (register R-12) | M3 | handoff is confirmed | explicit | the A9 writer release by Brent, the owner; the relevant-path port may proceed as later scoped work |
| BD-07 | Whole-contract approval (DEC-08 ratification, register R-11) | — | NOT GIVEN | — | never asked as a question (Brent, 8 Oct: "that only came up in the claude conversation, it wasn't a question"); to be put to Brent as a Decide question with the contract attached |

## 4. PM records under plan authority (not Brent decisions)

Recorded by order PASANT-04 r0 (SHA `be973700e3fedc1f2730efbf7f16892f4439efc94d36922a2e39365feb395664`,
2026-10-08T21:59:29-03:00), issued by the PASANT-02 PM_REVIEWER `pasant-02-pm0-2e20` as routine B001 choices:

- **Receiver ACK**: `pasant-02-pm0-2e20` ACKs the Brent-confirmed A9 handoff (BD-06). Selection is routine B001 work
  within the plan, not takeover by inactivity.
- **Selected baseline**: `76349909621bc07a1c7ab8242cd3c3ececaed152` (refreshed origin/main fetched by PASANT-01); the
  continuation branch `ws/pasant-as` builds on it with the accepted child commits.
- **A9 continuation**: scoped relevant-path provenance port citing originals
  `82bc0e7b79a750d07f62da7cc5b322eca4d0194e` and `9008bacddcf40a79aa4c051b11ab3a5baf33939b`
  (`origin/phase/a9-verify`), not the whole-19-commit adoption. No code is ported in B001c.
- **History kept**: the PASANT-03 finding that no release or ACK existed in the committed A9 records stays true of
  those records (`b001-a9-snapshot.md`, `b001-reconciliation.md` §4, both unchanged); this file is the linked
  correction. A9 counters and owner rows stay A2-9 **PASS**, A2-11 **FAIL**, A2-12 **FAIL**, A2-13 **BLOCKED**.
