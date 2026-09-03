# W-SIM-01 independent-review remediation round 1

> Local code remediation only. No push, PR, merge, deployment, Production access, school classification, provider operation, or W-SIM-02 action was performed or authorized.

## 1. State lock

| Item | Value |
|---|---|
| Worktree | `/Users/brentcurtis/dev/wt/sm-sim` |
| Branch | `feat/sm-sim` |
| Original parent | `d103198980b1671a2a207f4d2efcc1fd8db7a980` |
| Independently reviewed head | `bdff3107fb47bf45ee255e6236d787111086a538` |
| First verdict | `REQUEST CHANGES` |
| Remediation shape | One new commit on top of the reviewed head; the executor report supplies the exact final SHA because a commit cannot contain its own hash |
| Upstream | None; no push performed |

## 2. Authorized finding map

| Finding | Resolution | Evidence |
|---|---|---|
| 1 — invalid licitation row (`P0`) | Added both duration fields, non-negative min/max amounts, and 50/50 technical/economic weights. The row now satisfies the six `estado != 'cerrada'` non-null constraints, amount ordering/non-negative constraints, and the weight-sum constraint while remaining visibly synthetic and zero-value. | Manifest unit assertions plus the real local-PostgreSQL seed cycle. |
| 2 — `date`/`jsonb` equality failures (`P0`) | Date values returned by `pg` are normalized to `YYYY-MM-DD` when the manifest expectation is date-only. Manifest-declared JSON columns are sent as explicitly cast `jsonb` parameters with JSON serialization. Exact equality remains fail-closed. | Unit coverage and real `Date`, JSON array, and JSON object assertions after database round trip. |
| 3 — no real database integration (`P1`) | Added a localhost-only integration test against the local Supabase PostgreSQL service. It owns the outer transaction, exercises seed, idempotent reseed, verify, and exact reset against all four real tables, and always rolls back. | `npm run test:simulation-db`; two clean runs, followed by a separate zero-residue query. |
| 4 — overstated verification (`P1`) | Updated `PROJECT_STATE.md` and the review request to distinguish the original advisory-lock-only evidence from the remediated real-database round trip, record the new digest, and disclose the trigger side effect and evidence limits. | This report, the updated review request, and the superseding state entries. |
| 5 — nullable email scope cases (`P1`) | Meeting finalization with a null community school now authorizes the actual recipient users, preserving legitimate client delivery while QA still wins. Expense notification treats a missing submitter as an explicit `recipient_missing` outcome before authorization/provider construction. | Route regression tests and outbound-policy multi-recipient tests. |
| 6 — query-string URL guard bypass (`P2`) | The MJS legacy guard now compares the parsed hostname exactly, matching the CJS and TypeScript variants for plain, path/query/fragment, explicit-port, and uppercase-host Production URLs. | Parameterized tests invoke all three guard implementations. |
| 8 — unowned trigger write undocumented (`P2`) | The manifest digest now includes `documentedSideEffects`, declaring that standard generation insert/delete triggers recompute `schools.has_generations` for the two target schools without changing tenant controls. | Manifest assertions and the rolled-back database test prove true-after-seed and false-after-reset behavior. |
| 11 — transformation assessment aggregate omitted (`P3`) | The route now derives the authoritative client-school scope, returns client plus legacy null-scoped assessment rows, excludes QA/operator schools, and limits its school dropdown to client schools. It is the thirteenth inventoried reporting surface. | Dedicated handler regression test and updated reporting source-contract inventory. |

## 3. Real-database proof

The integration test is deliberately locked to `127.0.0.1:54322/postgres` and refuses a non-local URL. It opens a caller-owned `SERIALIZABLE` transaction, temporarily supplies local QA target-school rows, runs the actual manifest/store/engine path, and asserts:

1. First seed inserts exactly seven rows across four existing tables.
2. Second seed inserts zero rows.
3. Verification reproduces the manifest digest `bd0a666fa14e3058dd1b95b8062fce583b75f1396c08c063c4242f04cf7b16c6` and all table counts.
4. PostgreSQL returns the date fields as `Date` values, JSON array fields as arrays, and context metadata as an object.
5. The generation trigger recomputes `schools.has_generations` after seed and after reset.
6. Reset deletes exactly seven rows and leaves no manifest-owned row.
7. The outer transaction rolls back even if an assertion fails. A separate post-test query found zero manifest rows for schools 257/259.

No Production or hosted connection was used.

## 4. Final local validation

Node 22 type-check and zero-warning lint pass. The full Vitest suite passes **387 files / 8,796 passed / 12 skipped / 0 failed**; the production build completes with 149/149 static pages; local pgTAP passes **25 files / 2,143 tests**. The exact CI-equivalent browser sequence passes **192/192** across the thirteen mandatory specs and its no-skip checker passes. Migration, browser-boundary, and action-runtime guards pass; the staged-secret guard scans 2,508 indexed paths with zero findings; `git diff --cached --check` passes; the simulation plan reproduces the digest above; the dedicated real-database suite passes **2/2**; and the ledger validator exits 1 with exactly the expected 67 `[16 propiedad]` findings and no other category.

One preliminary `CI=1 npm run e2e` command selected all 325 repository tests instead of the CI manifest and was stopped after an unseeded, unrelated proposal-flow login failure (38 passed, 21 skipped, 1 failed, 1 interrupted, 264 not run). It is not counted as a passing gate. The authoritative run above followed the workflow's explicit synthetic seed and exact mandatory-spec list.

## 5. Explicitly deferred findings

The authorization did not include and this commit does not remediate:

- Finding 7: database-URL inspection in legacy seeders and a localhost assertion in the queue-concurrency proof.
- Finding 9: adding the licitation partial unique index columns/state predicate to the governed natural key.
- Finding 10: isolating a malformed Zoom-reconcile candidate so unrelated cron jobs continue.
- Broader administrative aggregates beyond `pages/api/admin/transformation-assessments.ts`.

These are disclosed for the rereviewer and do not silently expand W-SIM-01.

## 6. Rereview hotspots

1. Confirm the licitation row satisfies every baseline CHECK and remains synthetic/non-operational.
2. Follow `date` and JSONB values through the real `pg` write/read path; ensure exact comparison remains fail-closed.
3. Inspect the integration test's localhost lock and unconditional outer rollback, including the independent zero-residue evidence.
4. Verify null-community email authorization suppresses if any recipient belongs to QA while still allowing client-only recipients, and that missing expense submitters never reach the provider.
5. Verify transformation assessments include only client-scoped and legacy-null rows, and reconcile the declared `schools.has_generations` trigger effect with the no-unowned-direct-write claim.

## 7. Requested verdict

Review the full range from `d103198980b1671a2a207f4d2efcc1fd8db7a980` through the executor-reported final head, with special attention to the remediation commit over `bdff3107fb47bf45ee255e6236d787111086a538`. Return `PASS` only if the blocker-level seed/verify/reset defects are genuinely closed and all updated evidence claims are accurate.
