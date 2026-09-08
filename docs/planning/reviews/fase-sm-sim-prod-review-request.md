# SM-SIM-PROD-D1 review request

## Status and identity

- Phase: `SM-SIM-PROD-D1` — documentation-only production-QA topology amendment.
- Status: local uncommitted remediation candidate. Independent review round 1 returned `REQUEST CHANGES` with one major finding: pin the exact Production project ref in the plan, W-SIM-01 contract and validator. That ref hardening was applied; round 2 returned `APPROVE WITH NOTES` with one minor finding that the plan's status still said no independent review had occurred. The status wording is now corrected locally for final confirmation.
- Branch: `docs/sm-sim-prod`.
- Base: `982f456deeecdeefd14a08339a4b40676454128c`, the live `origin/main` observed after `git fetch origin main` on 2026-09-03.
- Commit count over base: 0; this authorization expressly excludes commit, push, PR, merge and deployment.
- Worktree: `/Users/brentcurtis/dev/wt/sm-sim-prod`.
- Canonical dirty checkout: `/Users/brentcurtis/Documents/fne-lms-working`, preserved without switching branches, cleaning, resetting, stashing, staging, overwriting or deleting anything.

## Objective

Record Brent's 2026-09-03 decision not to create staging and to use existing synthetic QA data in Production. Supersede only the staging topology of revision 10 while preserving its historical audit trail. Re-scope the existing blocked/unauthorized W-SIM units so that code containment always precedes any separately authorized Production data action.

Current designated tenants:

- Supabase Production project ref: `sxlogxqzmarhqsblxmtj` — immutable destination allowlist anchor.
- `QA Test School` (`schools.id=257`) — primary synthetic tenant.
- `QA School B — Liceo de Prueba` (`schools.id=259`) — sparse cross-school control.

Current exact label:

`QA INTERNO — DATOS SINTÉTICOS EN PRODUCCIÓN — NO ES PILOTO REAL`

## Authorization and scope

Brent authorized creation of this isolated worktree, local documentation/ledger amendments and documentation/ledger validation only.

In scope:

- reconcile current topology, label, safety prerequisites and sequence in the full simulation plan;
- add release-protocol revision 11 and a new normalization-record section without deleting revision-10 history;
- update only the mutable W-SIM-01/02 rows while retaining their IDs, status, authority, class, batch/branch shape and non-closing mappings;
- update the combined plan's current governing pointer and add a superseding row;
- update the validator so the production-QA contract is mechanically pinned;
- record the amendment and bounded read-only Production evidence in `PROJECT_STATE.md`;
- create this independent-review entry point.

Out of scope:

- application or test code, migrations, schema, policies, grants, functions or CI;
- any provider configuration or mutation;
- any database write, Auth/storage operation, classification, seed or reset;
- any email or Zoom provider invocation;
- commit, push, PR, merge, deployment or stakeholder rehearsal;
- W-SIM-01 implementation, W-SIM-02 execution, W-B2c or credential remediation.

## Files changed by risk

Governance/state:

- `PROJECT_STATE.md`
- `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md`
- `docs/reviews/santa-marta-release-protocol-2026-08-25.md`
- `docs/reviews/santa-marta-combined-plan-2026-08-25.md`
- `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md`

Mutable ledger/tooling:

- `docs/reviews/santa-marta-work-items.csv`
- `scripts/check-ledger.mjs`

Review artifact:

- `docs/planning/reviews/fase-sm-sim-prod-review-request.md`

Intentionally unchanged:

- `docs/reviews/santa-marta-work-claim-map.csv` — the four links remain exactly the same and NO CERRANTE.
- `docs/reviews/santa-marta-claims.csv` — frozen forever.
- `docs/reviews/archive/santa-marta-promise-ledger-legacy-161.csv` — historical immutable record.
- all application code, tests, migrations and provider configuration.

## Read-only Production evidence

Before this documentation authorization, Brent explicitly requested a search for existing synthetic data and clarified it did not need to be Santa Marta. Four corrected queries succeeded through the already-linked Production database. Each selected only aggregate/schema data within `BEGIN TRANSACTION READ ONLY`, set an eight-second statement timeout, and explicitly rolled back.

Observed school-257 coverage: 13 approved/Auth-confirmed profiles, 12 QA-enabled profiles, 16 active role assignments across seven role types, 1 community, 54 consulting sessions, 35 course-structure rows, 1 transversal-context row, 1 client and contract, 3 hour allocations, 6 ledger entries, 3 active course enrollments, 3 assessment instances, 8 assessment responses, 49 facilitators and 2 notifications. School 259 has one client and one cross-school role but no directly scoped profile or measured journey content. Both are still `tenant_kind='client'`; direct gaps include network membership, generations, program enrollments, licitations, learning-path assignment/progress, assessment submissions, transformation assessments and Zoom attendance.

No person name, user ID, individual email, password, token, credential, free text, document or minor data was selected or returned. One malformed SQL invocation failed parsing before executing a statement; one unsupported CLI flag was rejected locally. No state changed.

## Contract after this amendment

- `W-SIM-01`: `MERGE`, class 0, `SIM1`, `feat/sm-sim`, `BLOCKED`/`UNAUTHORIZED`; tenant-aware Production containment and local deterministic gap tooling only; no migration or hosted write.
- `W-SIM-02`: `DATA`, class 3, no batch/branch, `BLOCKED`/`UNAUTHORIZED`; later exact classification and gap seed on only 257/259, after W-SIM-01 review/merge/deploy/exact-SHA verification and a new nominal Brent authorization.
- Merging W-SIM-01 does not authorize W-SIM-02.
- Existing QA rows are never manifest-owned or resettable by inference.
- Global learning-path templates are never created by the simulation.
- Email for QA tenants is suppressed/captured before provider invocation and cannot claim delivery.
- Zoom for QA tenants is fake/refused before provider invocation; global Production mock mode is prohibited.
- Both work items remain evidence NO CERRANTE and not remediation.

## Validation evidence

- `node scripts/check-ledger.mjs`: expected exit 1 with exactly 67 failures, all and only the pre-existing `[16 propiedad]` ownership findings. Check `[23 simulación]` reports the new Production-QA governance contract OK; every other check class is clean.
- Independent UTF-8 RFC-4180 parser: `santa-marta-work-items.csv` = 109 data rows × 16 columns; `santa-marta-work-claim-map.csv` = 156 data rows × 2 columns.
- Frozen SHA-256: claims `d598f29b39d8d5ac9c1289a7c030221c93a3c8897c91f19e395f99486c68cce7`; archived legacy `009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9`.
- `git diff --check`: exit 0.
- Focused current-section search: every staging occurrence before the plan's historical marker is either the owner's explicit refusal, the retired label explanation, the prohibition on global Production mock mode, the declaration that staging is no longer a prerequisite, or the historical-marker heading. Both mutable W-SIM rows say that staging is not created; neither retains a staging prerequisite.
- Changed-path review: seven tracked documentation/tooling files plus this untracked review request; no application code, migration, provider file or claim/mapping CSV changed.
- Validator mutation test 1, disposable complete copy: changing the current plan's exact control school from 259 to 260 changed the baseline from 67 `[16]` failures to 68 total by adding exactly one `[23 simulación]` failure for the missing 259 anchor.
- Validator mutation test 2, independent disposable complete copy: removing `suppressed_qa` from W-SIM-01 likewise added exactly one `[23 simulación]` failure and changed no other class.
- Validator exact-ref mutation tests after review round 1, disposable complete copy: replacing `sxlogxqzmarhqsblxmtj` with another ref separately in (a) the current plan, (b) the W-SIM-01 ledger contract, (c) release-protocol revision 11 and (d) the current PROJECT_STATE entry changed the 67-failure baseline to 68 each time by adding exactly one `[23 simulación]` failure and no other class.

The first attempted independent CSV/hash command used the system Ruby and failed before producing evidence because that process selected US-ASCII and the host's configured locale was unavailable. The successful Node UTF-8/crypto rerun above is the evidence relied upon. The first exact-ref mutation attempt also inherited the unavailable `C.UTF-8` locale; Perl stopped before modifying each disposable target, so those runs remained at the 67-failure baseline and are not relied upon. The successful exact-ref rerun forced the portable `C` locale and produced the four 68/one-`[23]` results above. All disposable mutation copies were moved to the user's Trash after the checks.

No application quality gate is claimed by this documentation-only, uncommitted unit. The validator's 67 baseline findings are not green and are not repaired, hidden or reclassified here.

## Independent-review scrutiny areas

1. **Truthful Production boundary:** verify the amendment never describes Production as non-production and never implies that synthetic data makes Production risk-free.
2. **Ordering of containment and classification:** verify no text allows schools 257/259 to become `qa`, or any gap row to be written, before W-SIM-01 is deployed and verified and W-SIM-02 is separately authorized.
3. **Provider containment completeness:** challenge whether email, Zoom and cron paths can bypass tenant resolution; the documents must require fail-closed behavior before provider invocation.
4. **Reset ownership:** verify pre-existing QA rows are never deletable by name/domain/school membership and that reverting `qa` to `client` is not presented as an automatic rollback.
5. **Learning-path global semantics:** ensure no synthetic global path is proposed and W-B2c remains a real boundary.

## Known limitations and deferred work

- Aggregate evidence does not establish row-level synthetic provenance, actual sign-in for every persona, RLS behavior, provider suppression, reporting exclusion, determinism or reset safety.
- A fresh W-SIM-01 code audit is required before any implementation prompt or size decision.
- The exact W-SIM-02 manifest, dry-run counts, ownership identifiers, operator, observation window and reset proof do not exist and are not authorized.
- Both QA schools remain classified `client`; changing that is an explicit future Production write.
- Revision 10 remains in the files as marked historical provenance; reviewers must ensure no current pointer still treats it as executable.

## Decision boundary

Independent review may approve or request changes to this documentation candidate. It cannot authorize a commit, push, PR, merge, deployment, W-SIM-01 implementation, Production classification, seed/reset, email, Zoom or any provider/database mutation.
