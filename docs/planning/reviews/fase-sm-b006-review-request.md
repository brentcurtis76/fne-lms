# SM-B006 review request — W-B10a-01 evidence and gap disposition (unit SM-33, round 1)

## Branch and state

- Branch `fix/pc03`, base SHA `955856753b3781c329e7b7f0af48f018099042bf`. Round 0 started from a clean tree (status and diff SHA `e3b0c442…b855`). Round 1 started with only these two untracked docs (status SHA `2a9fe960…9495`, diff SHA `e3b0c442…b855`).
- Round 1 corrects review finding SM33-R0-B1 (see the matrix §3 note on role labels, C1, C2 and B10A-G1). The six-table dispositions, historical labels and source links are otherwise unchanged.
- Commit count: 0. The executor does not commit. The delta is two uncommitted Markdown files, and a commit is the PM's decision.

## Objective and scope (copied from order r1; unchanged from r0)

- **Objective:** Produce a current-SHA, source-linked clause matrix for SM-C008 / W-B10a-01's six named legacy tables. Classify each gate pass, gap, or unknown with a disposition, without claiming W-B10a-01 closure.
- **In scope:** `docs/reviews/w-b10a-01-evidence-matrix.md`, `docs/planning/reviews/fase-sm-b006-review-request.md`.
- **Out of scope (non-goals):** migration or policy repair; W-B10a-01 or SM-B007 closure; Privacy acceptance; Production-state assertion; SM-K021 synthetic-write decision. A gap gets a named blocker and a proposed exact repair boundary, never an unapproved repair.

## Files by risk

- **Medium (evidence the acceptance decision relies on):** `docs/reviews/w-b10a-01-evidence-matrix.md`. It contains the pass/gap/unknown dispositions, blockers B10A-G1…G4 and their repair boundaries.
- **Low:** this review request.
- Nothing executable, and no migration, test, policy, ledger or configuration file, changed.

## Test evidence

Full gates below are **inherited from round 0** (`RUN/evidence/baseline.md`, `RUN/evidence/final-*.log`). Order r1 reuses them because no executable state changed: HEAD and `git diff` are identical, and only these two Markdown files differ. Round 1 reran the focused check and `git diff --check` on its final state.

| Gate | Result |
|---|---|
| `pm-resources run SM-33 -- npm run type-check` | exit 0 (baseline and final) |
| `pm-resources run SM-33 -- npm run lint` | exit 0, zero warnings (baseline and final) |
| `pm-resources run SM-33 -- npm test` | exit 0: 364 files, 9,531 passed, 1 skipped (baseline and final) |
| `pm-resources run SM-33 -- npm run build` | with no `.env`, exits 1 on the missing Supabase URL/key at baseline. With synthetic loopback `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` and a synthetic anon key (the SM-30/SM-31 convention) it exits 0 |
| `python …/runs/SM-33/check-evidence.py` | `RESULT: passed=33 failed=0`, exit 0 (rerun in r1) |
| `git diff --check` | exit 0 (rerun in r1) |

test:db and E2E were not run: the change is documentation only. The SM-12/13/14 pgTAP and E2E counts cited in the matrix are **historical**.

## Where to look hardest

1. **Role labels versus role-neutral predicates (SM33-R0-B1 fix).** The matrix no longer treats the five unfixtured labels as outsiders. It separates role-dependent predicates (`auth_is_admin`, `is_admin_or_consultor`, `auth_is_equipo_directivo_only`) from role-neutral ones: `auth_is_course_teacher` (`baseline.sql:686-699`), enrolment, learning-path assignment, community `user_roles` rows, the parent-group visibility at `baseline.sql:19086`, `user_is_in_group`, and instructors `USING (true)`. Check that each predicate is placed in the right kind, and that no other role-neutral path on the six tables is missing.
2. **C1 is classified gap, not pass.** The judgment: "role × table × operation" is read literally, and the unasserted cells listed in the matrix count against it even where the policy source implies the result. That now includes the relationship paths held under the five labels. A reviewer may argue the default-deny reading suffices. Check the cell list against `supabase/tests/071-b10a-referenced-tables-rls.sql` line by line.
3. **C4 compensation conflict.** The ledger clause allows "restauración de los GRANT previos". The operator checklist (`rls-release-operator-checklist-2026-09-08.md:63`) forbids widening grants. I did not resolve this: I proposed two options for Brent. Check that neither option weakens a gate.
4. **C2 legitimate-read trace depth.** Consumers were found by grepping `.from('<table>')` and checking which client each uses. C2 now states its limit: the relationship paths are exercised only through docente fixtures, and the course-teacher read is never asserted. The browser-side modules consumers were not exercised in a UI run by this unit. Re-check `pages/admin/course-builder/**` for a non-admin course teacher.
5. **C7 wording.** SM-13 ended REPLAN_REQUIRED even though its B10a numbers (201/201, 1/1) passed. The matrix states both facts. Check that this is not read as SM-13 acceptance.

## Known limitations and deferred items

- No database was used. Every behavioral claim traces to pgTAP source lines or historical reports.
- Privacy (C5) and Production state (C6) are unknown by construction. Settling them needs a Brent decision or a separately authorized read.
- The QA time-tracking column mismatch is recorded as an observation outside the gate. It was not investigated further.
- SM-14's closure is attributed to W-BL-A14-4. That is left for SM-B007 reconciliation.
- The 201-assertion total was verified by hand-counting row-generating queries in round 0. An independent count, or the historical focused run, is the stronger proof.
