# Review request — SM-SIM-D0: seeded Santa Marta simulation governance

**Branch:** `docs/sm-sim-d0`

**Base:** exactly `8218e597e148d8044fe7d330c118243aa3772485` (`origin/main` at execution time)

**Commit count over base:** exactly 1 expected. The final commit cannot contain its own SHA; verify it with `git rev-parse HEAD`, `git rev-list --count 8218e597..HEAD`, and `git rev-parse HEAD^`.
**Kind:** documentation and mutable-governance reconciliation only.

**Correction round:** this commit amends the rejected D0 candidate `c264dca4193157496cc37c55d6181312447acc3c` in place (same base, still exactly one commit) with the five reviewer-required SM-SIM-D0 corrections: the approval/push wording (§10), the exact mandatory label in every governed location (§5), an independent check-23 non-closing assertion (§3), check-23 enforcement of that label (§3), and the mutation proofs in §6.

## 1. Objective

Record Brent's decision that a real Santa Marta pilot is not currently possible and that the plan must instead include a persistent, adult-only, seeded synthetic simulation. Reconcile the live ledger and protocol without claiming that any environment was provisioned, any implementation began, any hosted database was initialized or seeded, or any production-readiness claim was closed.

The complete governing plan is `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md`. This phase advances the mutable Santa Marta protocol from revision 9 to revision 10 and creates two separate future work items:

- `W-SIM-01`: future implementation of the staging target guard, simulation banner/noindex, provider isolation, deterministic seed/reset/verifier tooling, and tests (`MERGE`, class 0, batch `SIM1`, planned branch `feat/sm-sim`).
- `W-SIM-02`: later staging-only initialization and synthetic-data execution (`DATA`, class 3, no batch).

Both remain `BLOCKED` and `UNAUTHORIZED`, with no execution owner. Merging this documentation phase authorizes neither item. Merging `W-SIM-01` must not authorize `W-SIM-02`.

## 2. Scope

### In scope

- Reconcile PR #65's completed learning-path governance merge and state exactly what it did and did not unblock.
- Add the seeded-simulation lane to the mutable work and mapping ledgers.
- Define the adult-only synthetic manifest, target-isolation contract, provider constraints, deterministic reset, acceptance boundary, costs, and staged itinerary.
- Preserve claim history by classifying the four new mappings as non-closing evidence, not remediation.
- Reconcile all mutable-ledger totals and add validator check `[23 simulación]`.

### Out of scope

- No application, API, UI, test-suite, workflow, package, configuration, or migration implementation.
- No Supabase or Vercel control-plane access, provider provisioning or mutation, environment-variable change, database query or write, schema initialization, seed execution, reset, deployment, or production access. External reads were limited to Git and GitHub PR/run/deployment metadata.
- No implementation or authorization of `W-SIM-01`, `W-SIM-02`, or `W-B2c-01`.
- No real-school data, student/minor data, credentials, identifiers, or copied production rows.
- No change to the frozen claim snapshot or archived legacy ledger.

## 3. Files changed, grouped by risk

### Higher risk — executable governance and ledger shape

- `scripts/check-ledger.mjs` — excludes `W-SIM-01`/`W-SIM-02` from remediation coverage, recognizes the canonical `SIM1` batch, reconciles the new totals, and adds check `[23 simulación]` for exact item/mapping shapes, non-closing semantics, plan invariants, PR #65 closure, B2c's remaining gates, revision-10 anchors, and the exact mandatory visible label. The non-closing assertion is independent of the exclusion set it tests: it freezes the expected simulation IDs as literals, derives the simulation mappings from the raw mapping-ledger rows, and asserts that neither ID appears in `remediationOf()` for either mapped claim, without filtering the result through `NON_CLOSING_EVIDENCE_WORK`. The exact label stated in §5 is required verbatim in the full plan, the active release protocol, `PROJECT_STATE.md`, and this review request.
- `docs/reviews/santa-marta-work-items.csv` — updates only `W-B2c-01`'s prerequisite note and adds `W-SIM-01`/`W-SIM-02` as blocked and unauthorized.
- `docs/reviews/santa-marta-work-claim-map.csv` — adds exactly four mappings: each simulation item maps to `SWEEP-MI-APRENDIZAJE-09` and `SWEEP-ONBOARDING-DATA-01` as non-closing evidence.

### Medium risk — current planning authority

- `docs/reviews/santa-marta-release-protocol-2026-08-25.md` — revision 10, updated totals, batch `SIM1`, PR #65 closure, and the governed seeded-simulation sequence.
- `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md` — current totals plus §15 reconciliation and validation evidence.
- `PROJECT_STATE.md` — new `SM-SIM-D0` Meta entry and correction of the stale `LP-GOV-01` “NOT MERGED” heading using verified PR #65 evidence.

### Lower risk — plan and historical cross-reference

- `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md` — new full remediation plan for the seeded-simulation lane.
- `docs/reviews/santa-marta-combined-plan-2026-08-25.md` — revision-10 pointer and rows `0.4-bis`/`0.4-ter`; it remains historical audit context rather than the current scheduling authority.
- `docs/planning/reviews/fase-sm-sim-plan-review-request.md` — this review request.

## 4. Reconciled state and exact totals

PR #65 was independently reviewed and merged by Brent on 2026-08-31: approved head `d8f9ea38e37b0075e84cd016cf30086e04cf658b`, merge commit `49814091a2df69cc8e4c02beba8014bb5aa0694c`, PR CI run `33397850894` successful, post-merge CI run `33400056341` successful, and automatic Production deployment `6182645350` successful. This closes only prerequisite 1 of `W-B2c-01`. Privacy approval of the actor-by-operation matrix and Brent's later explicit implementation authorization remain open; therefore B2c remains `BLOCKED` and unauthorized.

The revision-10 candidate contains:

- 160 frozen claims and 36 unique P0 claims.
- 109 mutable work items.
- 156 claim/work links, including 63 P0 links.
- 29 batches containing 35 work items.
- Modes: 91 `MERGE`, 11 `DATA`, 6 `PRODUCTION_CHECK`, 1 `DOCUMENTATION`.
- Statuses: 29 `SCHEDULED`, 57 `BACKLOG`, 19 `BLOCKED`, 3 `DONE`, 1 `SUPERSEDED`.
- P0-link distribution: 41 inside batches, 15 in `DATA` items, and 7 in production checks.

The four new simulation links do not increase remediation coverage or close either linked claim. `W-B2d-01` remains truthfully `SUPERSEDED` without execution, `W-PC-06` must not be rerun, and B2a/B2b must not be reopened or reapplied.

## 5. Plan boundary and current-repository reconciliation

The plan uses a dedicated non-production Supabase project, a protected Vercel staging environment, a controlled mail sink, a visible `PILOTO SIMULADO — DATOS SINTÉTICOS — NO PRODUCCIÓN` label, adult-only `docente` learners, and deterministic `sm-sim-v1` UUIDv5 data. It expressly forbids production credentials, production data, real school identities, minor personas, generic remote wipes, autonomous staging cron in the first phase, and any use of simulation evidence as real-pilot or production proof.

The original seeder assessment at `49814091…` found 40 name-identified seeder files. Current main has 39 because CRED-01 removed `scripts/seed-hour-tracking-qa-scenarios.mjs`; the remaining `scripts/seed-hour-tracking-qa-data.mjs` still defaults to the known production URL. The active migration chain remains 40 files and the archive remains 38. No existing remote-capable seeder satisfies the exact-target, deterministic, idempotent, manifest-scoped-reset contract, so the plan does not approve reuse of one.

## 6. Validator and mutation evidence

Control at the final documentation tree: `node scripts/check-ledger.mjs` exits 1 on exactly the 67 pre-existing `[16 propiedad]` findings and no other category. Checks 01–15 and 17–23 pass. Those 67 owner/triage gaps remain real governance blockers and are not hidden or reclassified.

Ten targeted mutations were applied only in disposable scratchpad copies of the tracked tree (a fresh copy per mutation, never the real worktree); each copy's validator output was inspected for the `[23 simulación]` category:

1. Clear `NON_CLOSING_EVIDENCE_WORK` entirely → check 23 reports 6 failures: both IDs missing from the exclusion, and both IDs counted as remediation for both mapped claims.
2. Remove only `W-SIM-02` from `NON_CLOSING_EVIDENCE_WORK` → check 23 reports 3 failures for that ID.
3. Replace the exact label in the full plan → check 23 rejects the plan (2 failures: plan anchor and label).
4. Replace the exact label in the active release protocol → check 23 rejects the protocol.
5. Replace the exact label in `PROJECT_STATE.md` → check 23 rejects the state file.
6. Replace the exact label in this review request → check 23 rejects the review request.
7. Remove one `W-SIM-02` mapping row → check 23 rejects the mapping shape (plus the expected `[14 reconciliación]` total mismatches).
8. Change `W-SIM-01` from `BLOCKED` to `SCHEDULED` → check 23 rejects the status (plus the expected `[14 reconciliación]` total mismatches).
9. Remove the sentence that merging `W-SIM-01` does not authorize `W-SIM-02` → check 23 rejects the plan.
10. Reintroduce `NOT MERGED` in the LP-GOV state entry → check 23 rejects the stale state.

Result: **10/10 targeted mutations red on `[23 simulación]`; pristine control remains exactly 67 `[16 propiedad]` findings and no other category.** The rejected candidate's exclusion-set mutation could not fail because its assertion filtered the result through the same set under test; mutations 1–2 now prove the independent assertion.

## 7. Gate evidence

- `node --check scripts/check-ledger.mjs`: exit 0.
- `node scripts/check-ledger.mjs`: expected exit 1; exactly 67 pre-existing `[16 propiedad]` findings, zero other categories.
- `npm run guard:secrets`: exit 0 — 2,466 tracked paths scanned from the Git index (run after staging the final tree), zero findings.
- `npm run type-check`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0, zero warnings.
- `npm test`: exit 0 — 374 files, 8,566 passed, 11 skipped.
- `npm run build`: exit 0 — compiled successfully, 149/149 pages; command-scoped synthetic localhost `NEXT_PUBLIC_*` values only, never a production env file.
- `git diff --check`: clean.
- Frozen SHA-256 pins: claims `d598f29b39d8d5ac9c1289a7c030221c93a3c8897c91f19e395f99486c68cce7`; archived legacy ledger `009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9`.

`npm run test:db` and `npm run e2e` were deliberately not run: this phase changes only documentation, CSV governance ledgers, and the local ledger validator; it changes no migration, policy, grant, database function, API, component, or UI behavior. Hosted PR CI remains the required final gate if Brent later authorizes push and PR creation.

Environment note: this correction round ran every gate inside the worktree against a fresh `npm ci` dependency tree installed there (gitignored; no source file modified by that step). The rejected candidate's gates had used the local tree under `/Users/brentcurtis/dev/lp-global-gates/node_modules` after the iCloud-resident tree stalled.

## 8. Hardest areas for independent review

1. **Non-closing mapping semantics.** Confirm the four mappings exist for traceability but `remediationOf()` excludes both simulation work IDs, so no frozen claim gains remediation coverage or closure credit; confirm the check-23 assertion is independent of `NON_CLOSING_EVIDENCE_WORK` (frozen literal IDs, raw mapping rows, no filtering through the set under test).
2. **Exact ledger arithmetic.** Recompute 109 items, 156 links, 63 P0 links, 29 batches/35 batched items, mode/status distributions, and the 41/15/7 P0 split from the CSVs rather than trusting prose.
3. **PR #65 and B2c boundary.** Confirm the stale state is corrected with exact merge evidence while only prerequisite 1 is marked complete; B2c must remain `BLOCKED` and unauthorized behind Privacy approval and Brent's separate authorization.
4. **Plan safety and current inventory.** Check that the complete plan reflects current-main seeder/migration facts and that target validation, provider isolation, adult-only fixtures, deterministic reset, and “not a real pilot” language are fail-closed and internally consistent.
5. **Frozen history and authorization.** Confirm both frozen hashes, historical W-PC-06/B2d/B2a/B2b semantics, and the absence of any sentence that provisions, implements, deploys, seeds, queries, or authorizes `W-SIM-01`, `W-SIM-02`, or B2c.

## 9. Known limitations and deferred work

- The validator still reports exactly 67 pre-existing ownership/triage findings; this phase does not assign owners without Brent's decisions.
- No staging project, environment, domain, or email sink has been designated or provisioned.
- Costs and hosted-provider capabilities must be revalidated at the future provisioning decision because they can change.
- W-B2c remains blocked; the simulation must not be broadly or publicly shared while that security boundary remains open.
- `W-SIM-01` implementation and `W-SIM-02` hosted data execution are separate future authorizations and review phases.
- A merge of this documentation branch into `main` would trigger Vercel's automatic Production deployment even though the diff is documentation/governance only. Push, PR, and merge remain Brent's separate decisions.

## 10. Reviewer verdict requested

Review the actual `8218e597..HEAD` diff read-only. Return findings ordered P0–P3 with exact file and line references. If there are no findings, return:

`APPROVE — no findings`

Approval only establishes the reviewed SHA. Pushing that SHA and opening a PR require a later, separate explicit authorization from Brent. Merge remains another separate decision and requires hosted checks green.
