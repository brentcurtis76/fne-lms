# Review request — PASANT-B001a (B001 discovery: A9 provenance + January source facts)

## Branch

`ws/pasant-as`, base `76349909621bc07a1c7ab8242cd3c3ececaed152` (refreshed origin/main, unchanged by the fetch).
Commit count: 0 by the executor — the PM owns commits; the six files below are uncommitted at delivery.

## Objective

Produce verified continuation and page-referenced business-source evidence, plus executable source-integrity
checks, for B001 contract ratification (PASANT-C001/C002 inputs). **Scope in:** refreshed A9 graph comparison,
PR #46 metadata, A9 row-ID register, page-referenced brochure fact matrix, decisions register, committed source
snapshots, focused test. **Scope out:** ratifying corrections, choosing packaging/publication/success-copy promises,
porting or merging A9, any product, PLAN, contract, DB or workflow change. B001 remains open; C001–C003 stay on the
parent.

## Files by risk

- Medium — `__tests__/lib/pasantias/january-source.test.ts`: reads only committed evidence; no PDF, Git or skips.
- Medium — `docs/plan/evidence/pasant-january/b001-source-snapshot.md` (17 page texts) and `b001-a9-snapshot.md`
  (graph, blob IDs, verbatim A9 extracts): the test trusts these, so their fidelity is what matters.
- Low — `b001-fact-matrix.md`, `b001-reconciliation.md`, this file.

## Test evidence

Two layers, deliberately separate:

- **Snapshot checks (repository, every run):** `npx vitest run __tests__/lib/pasantias/january-source.test.ts`
  validates per-page and per-extract SHA-256, pinned plan hash/pages/version, plan facts, every matrix anchor,
  page-15 arithmetic, the A9 row set, LEDGER results and the reconciliation graph against the snapshots. Default,
  `CI=1` and a fresh-checkout-like sandbox (no `.git`, no access to the PDF directory) run the same tests, zero skips.
- **Original-source checks (local, RUN-only):** `node RUN/evidence/validate-original-source.mjs <repo>` re-extracts
  the real PDF (hash-verified) and compares every page with the snapshot, and compares merge base, left/right count,
  blob IDs and every extract line with the real pinned Git objects. Fails closed; prints `RESULT: passed= failed=`.
- Counts, negative controls (absent/corrupted snapshots) and baselines: `RUN/executor-report-r1.md`.
  Cohort suite `__tests__/lib/pasantias-cohort.test.ts` 54/54 unchanged. `git diff --check` clean.
- Full product gates deferred to B001 final cumulative validation (not claimed).

## Scrutinize

1. **Snapshot fidelity** — the repository test cannot detect a snapshot that is self-consistent but wrong; only
   the RUN validator ties it to the PDF and Git. Re-run it if either snapshot changes.
2. **Anchor matching** — whitespace is stripped before comparing (pdf-parse splits glyphs); a short anchor could
   match by accident. A negative control (October text absent from page 3) guards the matcher.
3. **Count discrepancy** — 19 is exact; the "merge base included = 20" explanation is a hypothesis.
4. **Recommendation** — port with `cherry-pick -x` vs Brent merging PR #46; both preserve provenance, neither done.
5. **Decision register** — DEC-04/06/07 are labelled PLAN DEFAULT from plan rev 1 text; DEC-01/02/03/05/08 stay
   UNRESOLVED. Check that no default was read into the plan where it sets none.

## Known limitations

- Writer release, receiver ACK and current production mail state are UNKNOWN (no evidence found).
- The original-source validator depends on the machine-local PDF path and full Git history, so it runs in the
  PASANT-01 RUN, not in CI; CI verifies the committed snapshots only.
- A9's flow spec was not run against the current baseline (provider and SSR auth changed on main).
