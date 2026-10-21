# PASANT-B001 — parent reconciliation (C001–C003), fresh-main rebuild r1

Cumulative evidence for parent B001 on today's main, prepared 2026-10-13 by the PASANT-02 r1 executor under approved
plan PASANT revision 1. This is a rebuild of the accepted r0 record (local commit `dd1feaa2b`, PM verdict
APPROVED_WITH_NOTES 2026-10-12), which pm-ship set aside because `PROJECT_STATE.md` had changed on main. The r0 record,
its review and the child records stay as historical evidence and are not edited. This file does not close B001: the PM
reviews and accepts the exact state. Nothing was merged, cherry-picked, published or deployed. RUN evidence is in
`pm-workflow/runs/PASANT-02/evidence/r1/`; r0 evidence stays in `evidence/`.

## 1. State and refs (fetched 2026-10-13T23:46-03:00, `git fetch origin main phase/a9-verify`, `git ls-remote` agrees)

| Role | Ref |
|---|---|
| Rebuild checkout | `fix/p02-r1` at `2922e1b7401aaa7c50f8a1110db41883dc2f05ca` = origin/main (merge of PR #168, 2026-10-13T16:44:06Z); `HEAD...origin/main` = 0 / 0 |
| r0 candidate (historical) | `fix/pasant02-ci` at `c840e4714`; accepted as local commit `dd1feaa2ba4c18dbe7fde283760b91a8369dddb7` (3 docs), never on main |
| r0 view of main | `1cbe55cc8`, an ancestor of HEAD; 19 commits since (PRs #164–#168: PROC-B014/B015, SM-23, NOTIF-24, NOTIF-25, SM-D67, SM-24) |
| PR #162 | MERGED 2026-10-12T22:34:29Z as `5c233c5b9`: PASANT-06 `14440c2d0`, PASANT-05 r1 `379507ae0`, PASANT-07 `bef53deab` |
| PR #161 | CLOSED, not merged (head `3234eb8d1`) |
| origin/phase/a9-verify | `9008bacddcf40a79aa4c051b11ab3a5baf33939b`, unchanged; PR #46 still OPEN |
| A9 code commit | `82bc0e7b79a750d07f62da7cc5b322eca4d0194e` (not an ancestor of main; its relevant paths were ported, §2) |

- None of the 19 commits since `1cbe55cc8` touches a PASANT path, `docs/plan/` or the mandatory registry. Every protected
  path is byte-identical on HEAD, on `1cbe55cc8` and in `dd1feaa2b` (§5). The only drift that set r0 aside is
  `PROJECT_STATE.md` (NOTIF-24/NOTIF-25 and others added entries at the top).
- A9: `origin/main...origin/phase/a9-verify` = 654 / 19 (merge base `7c7059ffbf51b072cd38b00f5445e3ae972640c8`,
  unchanged). The main side grew from 635 with the new main commits. The A9-only side is still exactly 19. The historical
  "reported 20 vs observed 19" note in `b001-reconciliation.md` §1 stays as written.
- No reset is needed. Main already holds the accepted January children, and B002+ start from main.

## 2. C001 — continuation graph and A9

| Requirement | Evidence | State |
|---|---|---|
| Exact SHAs, PR state, graph | §1; RUN `d1-refs.txt` | recorded |
| Protected-work inventory | §5; the flow spec, link guards and registry are identical at HEAD, `1cbe55cc8` and `dd1feaa2b` | preserved |
| Writer release | R-12 DECIDED: Brent 2026-10-08T21:40:06-03:00 "handoff is confirmed" (`b001-brent-decisions.md` BD-06) | recorded |
| Receiver ACK | R-13 PM record by `pasant-02-pm0-2e20`, which follows R-12 | recorded |
| One continuation decision | R-15: relevant-path provenance port, not a merge of PR #46 and not a supersession | executed |
| Port with provenance | PASANT-05 r1 (`docs/plan/evidence/a9/pasant-b001d-port.md`), on main as `379507ae0`; review provenance PASANT-07 (`pasant-b001f-review-provenance.md`) | on main |
| No orphaned A9 | `node scripts/ci/e2e-mandatory.mjs --list` on HEAD → 24 entries, `tests/e2e/pasantias-flow.spec.ts` is entry 24, once | registered |
| Counters and owner rows | R-16: executor r1–r4; Sol 1–3 FAIL; A2-9 PASS, A2-11 FAIL, A2-12 FAIL, A2-13 BLOCKED | unchanged |

R-14 recorded `76349909` as the selected baseline and `ws/pasant-as` as where implementation starts. That was overtaken
when the accepted children were rebuilt on main (PASANT-05 r1, PASANT-07) and released by PR #162. The selected baseline
for January product work is current main (here `2922e1b74`), with the same A9 obligations. The register is not edited,
because its rows are pinned by tests. PR #46 is still open. Closing it as superseded is Brent's call, and this file is
the provenance link.

## 3. C002 — canonical brochure and recorded decisions

- Source: `/home/brent/Projects/pm-workflow/Brochure Pasantías Enero 2027.pdf`, `sha256sum` →
  `84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5`, 17 pages (`pdfinfo`), re-measured 2026-10-13
  (hash only). The contract pins the same hash, 17 pages and version `2027-01-V1`. The page-fact matrix is in
  `b001-fact-matrix.md` and `b001-source-snapshot.md`, both pinned byte-for-byte by `january-contract.test.ts`.
- Decisions: BD-00 to BD-06 are in `b001-brent-decisions.md`. BD-07 (NOT GIVEN on 2026-10-08) stays as dated history.
  The whole contract was approved in `b001-ratification.md`: question `6d9b56320e62019a`, "Approve this contract",
  2026-10-09T09:23:35-03:00. That approval is reused. Brent was not asked again.
- Approval provenance, re-checked: `git show fb2d1de82:docs/plan/pasantias-january-contract.md | sha256sum` →
  `2869bec779581a417fab4ae642339acf679222034312bed6c56e7f9e2f863cee`, which equals the recorded candidate hash. The
  decision record outside the repo has status `answered`, picked "Approve this contract", answered at
  2026-10-09T09:23:35-03:00. The test recomputes the data hash `f379bc89…` from the active contract.
- R-08 (designed-file upload) and R-17 (production mail) stay separate Brent-owned release gates. The success copy
  promises no email until A2-11/A2-12 delivery evidence exists (R-10, PLAN amendment "Packaging").

## 4. C003 — normative-source precedence and oracles

- The PLAN.md Decision Log row 2026-10-09 links to "January 2027 amendment". The amendment declares the contract the
  sole January source and supersedes A-1 to A-9 and the single-track assumption for January only, keeping the October
  history. It also retains the legal and consent decisions, excludes Correos while preserving its backlog, and keeps A9
  historical. `git diff 42997ec65 HEAD -- docs/plan/PLAN.md` only adds lines (+26, −0).
- `lib/pasantias/cohort-public.ts`: +7 comment lines against pre-PASANT main `42997ec65`. Transpiled with comments
  removed, it is identical to `42997ec65`. A negative control with one extra export differs (RUN
  `d3-runtime-and-plan-diff.txt`). The runtime still serves October 2026.
- `__tests__/lib/pasantias-cohort.test.ts` parses the ratified contract for per-program expectations. October Appendix
  A-7 stays the October oracle. `__tests__/pages/pasantias-hardcoded-cohort.test.ts` reads January render facts from the
  contract and lists them as open B003 gates. No test claims a January render exists, and there are no skips.
- Remaining January work, by build (corrects r0, which grouped C004–C008 under B003; review note P02-A1):
  C008 lead persistence for two program interests is **B002**. C004–C007 (January runtime, copy, form, documents and
  currency) are **B003**. C009 is B004, C010 is B005, and cumulative browser and PR CI acceptance C011 is **B006**. The
  R-08/R-17 release obligations stay with Brent. The approved plan's layout is authoritative.

## 5. Protected inventory on this state (sha256 prefix · blob; identical at `1cbe55cc8` and `dd1feaa2b`)

| Path | sha256 | blob |
|---|---|---|
| docs/plan/pasantias-january-contract.md | `cc1f9fa9d8fee973` | `3748a36c41` |
| docs/plan/PLAN.md | `322e61d310af6a34` | `ea3a491146` |
| lib/pasantias/cohort-public.ts | `2520f30a59257ee7` | `0573252f61` |
| __tests__/lib/pasantias/january-contract.test.ts | `0721bf9dba77880f` | `7e12e38b8a` |
| __tests__/lib/pasantias/january-source.test.ts | `a2602d19ed3d0daf` | `6411ef2bdd` |
| __tests__/lib/pasantias-cohort.test.ts | `303d36db1f0dd100` | `0cb24c95bc` |
| __tests__/pages/pasantias-hardcoded-cohort.test.ts | `861b5203613572ca` | `84cd073157` |
| __tests__/pages/pasantias-site-links.test.ts | `81d8ea25dc4f07c7` | `bb60ceba7a` |
| tests/e2e/pasantias-flow.spec.ts | `b8b236e4e2f506c7` | `32b5c89b2f` |
| scripts/ci/e2e-mandatory.mjs | `f5c7b3077d5573f7` | `56e98a6b79` |

The trees `docs/plan/evidence/pasant-january`, `docs/plan/evidence/a9` and `lib/pasantias` are also identical at HEAD
and `1cbe55cc8` (RUN `d1-protected-inventory.txt`). r1 adds `january-source.test.ts` to the table; r0 had nine rows.

## 6. Runtime evidence on this state (PASANT-02 r1, fresh)

- Real browser: `tests/e2e/pasantias-flow.spec.ts`, unmocked, on a production build (`next start -p 3872`) against
  the owned stack `pasant02r1`. The stack was declared with `pm-resources declare-docker … --exclusive` before creation,
  runs on network `supabase_network_pasant02r1` 10.210.4.0/24 with API 56931 and DB 56932, has every repo migration on
  this base (through `20261009120000`) plus `seed-e2e.mjs`, and has no `RESEND_API_KEY`. Result: 4 expected, 0 skipped,
  0 unexpected, 0 flaky. Rows: the seeded lead is unchanged, and the two new `octubre-2026` rows have consent with notice
  `2026-07-v1`. Opt-in is f/f and t/t, `brochure_sent_at` is NULL and the emails are synthetic. `.e2e-outbox/` is empty.
- pgTAP on the same stack: 74 files, 7626 tests, PASS. That is one file more than r0's 73/7544, because main added
  `106-notification-enqueue-source.sql`.
- Counterexamples: 13 scratch mutations each fail the contract-reading oracles, and the clean copy passes 255/255. They
  cover a one-peso fee, a one-peso total, a date, the approval status and hash, the precedence row, the October text, the
  R-17/R-08 gates and Correos, plus two new in r1: Mirada Profunda losing a school day, and the decided host spelling
  being reverted. On the mandatory guard (24 entries), the valid report exits 0 and 7 negatives exit 1 (flow absent,
  skipped, `skip`, `fixme`, no tests, mixed, older entry absent).
- Gates on the untouched base: focused 5 files/341 passed; type-check, lint and build 0; `npm test` 525 files, 13519
  passed, 12 skipped, 0 failed.

## 7. Rebuild provenance

- The three paths of `dd1feaa2b` were rewritten on this base, not cherry-picked. `PROJECT_STATE.md` keeps every entry
  main added since r0. It gets one new PASANT-B001 entry at the top, and r0's entry is not ported.
- What changed from r0: refs and graph (§1), the 654/19 A9 count, the protected inventory (+1 row), the C004–C008
  attribution (§4), and all runtime counts, which were re-measured on this base (§6). The decisions, the continuation
  choice and the C001–C003 conclusions are unchanged.
- r0 history: report `runs/PASANT-02/executor-report-r0.md`; review `runs/PASANT-02/pm-review-r0.md`
  (APPROVED_WITH_NOTES, P02-A1/P02-A2); `git show dd1feaa2b:docs/plan/evidence/pasant-january/b001-parent-reconciliation.md`.
