# Review request — PASANT-B005 area and flight-deck verification (PASANT-10 r1)

- Branch `fix/pasant02-ci`, base/HEAD `3ce1339b7142eb620b25e9919e2635a45bf628c7`.
- Commits on branch since base: 0. The two docs are uncommitted; the PM commits the reviewed state through the
  harness.
- Ledger item PASANT-B005 (criterion PASANT-C010) under approved plan PASANT revision 1.
- Evidence method: Brent's decision `334cb536b656ca9a` (2026-10-13T15:15:10-03:00) accepts a read-only text listing
  of the project records instead of clicking through the deck's tab.
- Delivery status: READY_FOR_REVIEW. D1–D4 pass; there is no UI pass.

## Objective and scope (copied from the orders)

Goal: verify C010. There is one existing PASANT area under GENERA, it keeps its identity, and it links to the
accepted plan, the build layout and the selected continuation repository. r1 completes this with Brent's
text-listing method instead of the deck-tab navigation that blocked r0.

Scope in:
- D1: area identity and grant revision 1, checked from fresh scoped records.
- D2: proposal, approval and source hashes; layout revision 1 and scope revision 1; six builds and B005→C010;
  the original versus the selected continuation repository; common git dir and branches.
- D3: a saved, genuine text listing, validated against the authoritative records.
- D4: the two docs, hygiene and the gates.

Scope out:
- Workflow source or record edits, and registration repair.
- Renaming to the optional `GENERA · Pasantías` suggestion.
- App code, tests or config.
- Parent C008 or other criteria; a global record audit.
- DB, server or container work; deployment, bridge, PR or merge.
- Re-running or relabelling the historical deck journey.

## Files by risk

- Low — `docs/plan/evidence/pasant-january/b005-flight-deck-verification.md`: the acceptance method, the listing
  provenance, the D1–D3 matrices, the repository mapping and the historical UI record.
- Low — this file.
- Not committed (RUN):
  - `scratch/r1/{capture-listing.py,validate_text.py,focused-text.sh}`;
  - `evidence/text-r1/{listing.txt,snapshot.json,verify.json,baseline.md,retained-r0.sha256,focused-raw.log}`, plus
    the gate logs.
  - r0 artifacts are retained unchanged.

## Evidence

- Focused: `bash RUN/scratch/r1/focused-text.sh` gave `RESULT: passed=56 failed=0`, exit 0.
  - 35 live assertions (D0–D3 plus a clean-exit check).
  - 14 negative controls: wrong group, proposal, source and continuation; missing or tampered listing; missing record.
  - 7 D4 hygiene and doc checks.
- Gates. Baseline is r0's final run on this exact lock: type-check, lint, `npm test` (521 files, 13238 passed,
  12 skipped) and build, all exit 0. r1 reran diff-check, type-check, lint and build once on the final docs; the
  unit run is reused because product code is unchanged. Counts are in `RUN/executor-report-r1.md`.
- pgTAP and app e2e were not rerun: there is no DB or app change. The PASANT-09 evidence is retained.

## Scrutinize hardest

1. **Method substitution.** The D3 evidence is a text listing, which Brent explicitly accepted. Check that the
   docs never present it as deck navigation, and that the r0 and PM journey receipts are still failures.
2. **Self-consistency.** The listing and the validator read the same records that the same tooling wrote. They
   prove the records agree with each other and with the PM's independent listing. They do not prove what the deck
   renders.
3. **Selected continuation.** "Selected" is derived from the unit root and `stack.root`. The snapshot `root` is
   still the original migration-staging checkout. Confirm this is the intended "selected continuation repository".
4. **Display name.** `GENERA · Pasantías` is treated as the `<group> · <name>` label, not a rename of `Pasantías`.

## Known limitations

- Native deck links to the plan, layout and repository targets remain unverified (P10-F2, a workflow UI
  observation). This is outside this unit's scope.
- The listing is a point-in-time capture (15:19:26). Mutable records such as the manifest seq may move later.
  Only immutable record hashes are pinned.
