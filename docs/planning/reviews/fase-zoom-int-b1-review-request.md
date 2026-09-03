# Review request — FNE-ZOOM-INTERNAL-TEST Unit B1 (server-only operator-tenant foundation)

> Executor: Claude Code (bounded executor, UNIT-B1 attempt 1). Reviewer: Codex (read-only, `docs/planning/review-protocol.md`). Approval authority: Brent. Nothing in this unit was pushed, merged, deployed, applied, configured, or classified.

## 1. Identity

| Item | Value |
|---|---|
| Branch | `feat/zoom-int-b1` |
| Worktree | `/Users/brentcurtis/dev/wt/zoom-int-b1` (created by this session from the required base; the shared checkout `/Users/brentcurtis/dev/fne-lms` was not modified) |
| Base | Original base `838f1a0c0c158816ae578455a03b13cd8d33f0a6` = live `origin/main` at the attempt-1 re-lock (2026-09-03T18:17:44Z). Integrated base `982f456deeecdeefd14a08339a4b40676454128c` = live `origin/main` at the attempt-2 re-lock (2026-09-03T18:46:04Z), merged in by §12. |
| Commits | 3 original B1 commits (`0e080ded` implementation + tests; `dc9724d0` this review request; `57d92e9c` documentation-only correction recording that remote `main` had moved), then the integration merge `c00bcbf4` (§12), then the attempt-2 documentation commit (the branch tip). Cumulative range `838f1a0c..HEAD`; B1 content range against the integrated base `982f456d..HEAD` (§11). |
| Authoritative plan | `/Users/brentcurtis/Documents/ChatGPT/Zoom Integration/FNE_ZOOM_INTERNAL_TEST_PLAN.md` — Version 2, 362 lines, 23,610 bytes, blob `bb48408616f74386a9042244acfbd5a96d02b837` (verified before mutation) |
| Upstream | none (never pushed) |

### Files (9 in the implementation commit, 1 in the documentation commit)

| Risk | Path | Change |
|---|---|---|
| HIGH | `pages/api/sessions/index.ts` | POST: one authoritative school lookup before any mutation; fail-closed refusal helper; operator-tenant validator `checkOperatorSessionRequest` (new code only — no existing validation line was removed or reordered) |
| HIGH | `lib/zoom/provisioning-intent.ts` | new `ZoomRolloutRefusal` type and `checkZoomRolloutPolicy(schoolId, env)`; `checkProvisionGate` refactored to rollout policy → canonical eligibility; comments updated; `checkCleanupGate` untouched |
| MEDIUM | `pages/api/sessions/capabilities.ts` (new) | `GET /api/sessions/capabilities?school_id=` — method → auth → live admin → validation → exact school read → rollout policy → structural response |
| MEDIUM | `lib/types/tenant-kind.ts` (new) | `TenantKind`, fail-closed `parseTenantKind`/`isTenantKind`, `isOperatorTenant`/`isClientTenant`/`isNonClientTenant`, `SchoolTenantControls`, `parseSchoolTenantControls(row, expectedId)`, `readSchoolTenantControls(serviceClient, schoolId)` |
| LOW | `__tests__/lib/zoom/provisioning-intent.test.ts` | one existing order test rewritten for the new refusal order (see §6 hotspot 1); 3 delegation tests, a 7-test `checkZoomRolloutPolicy` block and a 3-test flag-free-cleanup block added |
| LOW | `__tests__/api/sessions/session-zoom-capabilities.test.ts` (new) | 24 tests |
| LOW | `__tests__/api/sessions/session-operator-creation.test.ts` (new) | 35 tests |
| LOW | `__tests__/api/sessions/session-create-facilitators.test.ts` | fixture only: `schools` branch returning a client row; `buildChainableQuery` data parameter widened to `unknown` |
| LOW | `__tests__/api/sessions/session-managed-intent-create.test.ts` | fixture only: `schools` branch returning a client row; `thenable` data parameter widened to `unknown` |
| DOC | `docs/planning/reviews/fase-zoom-int-b1-review-request.md` | this file |

No other path changed. `types/supabase.ts`, migrations, UI, attendee/approval/notification/analytics/stats/bulk-tag/financial/cancellation/reschedule paths, the PR #72 files, `PROJECT_STATE.md`, package files and CI files were not touched.

## 2. Objective, scope, non-goals

**Objective (plan §4.1, §4.4, §6 Unit B — the server-only slice):** typed tenant-kind helpers; a shared Zoom rollout-policy predicate that the provision gate, the capability response and the session POST all use; an admin-only server capability response for a requested school; fail-closed operator-specific validation in `POST /api/sessions`; cleanup left flag-free; client and QA behaviour preserved exactly.

**In:** the four production files and five test files above.

**Out (deferred, by unit):**
- **B2** — explicit participant roster (`attendees.ts` POST/DELETE), approval-requires-roster, notification recipients, join authorization. No roster or approval check exists in B1.
- **B3** — school-aware creation UI consuming `GET /api/sessions/capabilities`, user-facing prose for the reason codes, operator/QA labels on admin surfaces. B1 is dormant until B3 ships: no browser calls the new endpoint and no UI can produce an operator session.
- **B4** — analytics/stats/bulk-tag tenant filtering, explicit no-tracking behaviour in shared financial/cancellation services, the unfiltered deletion-dependency count.
- **Never in Unit B:** classification of any school (including 19), the QA correction (257/259), `ZOOM_SCHOOL_ALLOWLIST`/flag configuration, migrations, `types/supabase.ts` regeneration, any production/hosted database access, any Vercel/Zoom/provider change, rehearsal.

## 3. Criterion → change mapping

| Contract criterion | Where | How |
|---|---|---|
| A. `TenantKind = 'client' \| 'operator' \| 'qa'`, fail-closed narrowing, operator/non-client identification without names/ids/emails/env | `lib/types/tenant-kind.ts` | `TENANT_KINDS` const tuple; `isTenantKind`/`parseTenantKind` return false/`null` for anything else; `isOperatorTenant`, `isClientTenant`, `isNonClientTenant` take a `TenantKind` only. No id, name, e-mail, env or title is consulted anywhere. |
| A. authoritative school fields `id`, `tenant_kind`, `internal_zoom_testing_enabled` | same | `SchoolTenantControls`; `SCHOOL_TENANT_CONTROLS_SELECT` is the exact projection; `parseSchoolTenantControls(row, expectedId)` refuses a null row (`not_found`), a non-object/array/wrong-id/non-boolean row (`invalid_row`), and an unknown kind (`invalid_tenant_kind`). |
| A. no school-19 special case | whole diff | `grep -n 19 lib/types/tenant-kind.ts pages/api/sessions/capabilities.ts pages/api/sessions/index.ts` → no classification logic; 19 appears only as a synthetic fixture id in tests alongside 20, 1, 257, 300. |
| B. `checkZoomRolloutPolicy(schoolId, env)` — exact `=== 'true'` flag, existing allowlist parsing, `feature_disabled` / `school_not_allowlisted` + schoolId, no eligibility, no session state | `lib/zoom/provisioning-intent.ts` | Reads `env[ZOOM_MEETINGS_FLAG]` and `parseSchoolAllowlist(env[ZOOM_SCHOOL_ALLOWLIST_VAR])` only; signature takes a number, so it cannot inspect a session. |
| B. `checkProvisionGate` = rollout policy → canonical `checkSessionEligibility`, structural refusal, no duplicated eligibility | same | Two calls, no restated condition. `ProvisionGateRefusal = ZoomRolloutRefusal \| { session_ineligible }` — the externally meaningful vocabulary is unchanged; the union was refined, not renamed. Comments describe the new order. |
| B. `checkCleanupGate` stays `is_zoom_managed === true` only, not routed through rollout policy | same | Function body unchanged; its comment now also says not to route it through `checkZoomRolloutPolicy`. `enqueueSessionMeetingDelete` unchanged. |
| C. endpoint sequence: method → auth → live admin → exactly one positive-integer `school_id` → three-column exact-id read via service client → fail closed → `checkZoomRolloutPolicy`, never `checkProvisionGate` | `pages/api/sessions/capabilities.ts` | In that order. `checkIsAdmin` (existing, service-role `user_roles` read) is the admin authority. `parseSchoolIdQuery` accepts only a single `^\d+$` string that is a safe positive integer. `readSchoolTenantControls` does the read. `checkProvisionGate` is not imported. |
| C. response: `managed_zoom_allowed`, `operator_test_creation_allowed`, structural reason codes; semantics | same | `managed_zoom_allowed = rollout === null`. `operator_test_creation_allowed` = admin (already established) ∧ `tenant_kind === 'operator'` ∧ `internal_zoom_testing_enabled === true` ∧ rollout pass. `reasons` accumulates `feature_disabled` / `school_not_allowlisted` / `tenant_not_operator` / `operator_testing_disabled`. Nothing else is returned — no config, allowlist, tenant kind, names or user data. Tenant kind and enablement are never read from the request. |
| D. one authoritative lookup in POST; fail-closed tenant value | `pages/api/sessions/index.ts` | `readSchoolTenantControls(serviceClient, school_id)` runs first inside the `try`, before the facilitator validator, the growth-community check and every insert. Non-`found` → `refuseSchoolLookup` (404 `school_not_found`, 500 `school_lookup_failed`, 500 `school_tenant_invalid`). |
| D. operator pre-mutation requirements | same, `checkOperatorSessionRequest` | Returns `null` immediately for client/QA. For operator, in order: `internal_zoom_testing_enabled === true` (403 `operator_testing_disabled`) → `checkZoomRolloutPolicy(school.id, process.env)` (403 with the rollout code) → modality `online`/`hibrida` (400 `operator_modality_not_remote`) → `isZoomManaged === true` (400 `operator_not_zoom_managed`) → stored `finalMeetingProvider === 'zoom'` (400 `operator_provider_not_zoom`) → raw `contrato_id`/`hour_type_key`/`program_enrollment_id` all `== null` (400 `operator_financial_fields_present`, naming every offending field). Then the unchanged `validateFacilitatorIntegrity` runs. Admin authorization is the route's existing `checkIsAdmin` gate. |
| D. client/QA retain existing behaviour | same | The only new code on their path is the school lookup (fail-closed on a nonexistent school, which previously failed later at the growth-community check). No operator check, financial-null rule or rollout check runs for them; classification comes only from `tenant_kind`. |
| D. recurrence inherits validated safe fields | same | Unchanged `baseSessionData` spread into every row; the operator checks run on the same body values that build it. |
| Responses carry stable codes | `sendMeetingError` (existing helper) | `{ error, code }` for every new refusal; existing refusals keep their `{ error }` shape. |

## 4. Validation (all on the exact reviewed HEAD, after the final change, local synthetic resources only)

| Command | Result |
|---|---|
| `npx vitest run __tests__/lib/zoom/provisioning-intent.test.ts __tests__/api/sessions/session-zoom-capabilities.test.ts __tests__/api/sessions/session-operator-creation.test.ts __tests__/api/sessions/session-create-facilitators.test.ts __tests__/api/sessions/session-managed-intent-create.test.ts` | 5 files, **121 passed / 0 failed** (46 + 24 + 35 + 7 + 9) |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (zero warnings) |
| `npm test` | exit 0 — **378 files passed / 8,717 tests passed / 11 skipped / 0 failed** (run twice on HEAD `0e080ded`; identical result) |
| `npm run build` | exit 0 — `✓ Compiled successfully`, 149/149 static pages, `ƒ /api/sessions/capabilities` present in the route manifest. Run with dummy `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` because the worktree has no `.env.local` (no real value was used or needed). Run twice on HEAD `0e080ded`; identical result |
| `npm run guard:browser` | OK — 1145 files scanned; no boundary finding |
| `npm run guard:secrets` | OK — run once on the implementation commit (2,475 tracked paths, 0 findings) and again with this file staged (see §11) |
| `git diff --check` | clean |

**Fail-on-old evidence** (base production files checked out over the worktree with the two new production files removed, the three new/extended suites run, then `git checkout HEAD -- .` restored the tree to zero differences):

| Suite on base code | Result | Reading |
|---|---|---|
| `session-operator-creation.test.ts` | 15 of 35 failed | every operator refusal, every fail-closed lookup case and every exact-school-query assertion fails on old code; the client/QA preservation cases that do not assert the query pass on old code — as they should, since that behaviour is unchanged |
| `session-zoom-capabilities.test.ts` | file fails to load | the route did not exist |
| `provisioning-intent.test.ts` | 11 of 46 failed | all 11 are the new/rewritten B1 tests; the `checkCleanupGate` and unmanaged-cleanup cases pass on old code because cleanup was already flag-free (preservation, not regression) |

Before the fixture adaptation, the two existing creation suites failed 11 of 16 on the new code with `500` (the new lookup refusing an empty fixture) — which is the fail-closed behaviour the lookup exists for.

**Not run, and why:** `npm run test:db` (pgTAP) — no migration, policy or SQL changed; `npm run e2e` (Playwright) — no UI changed and no browser calls the new endpoint until B3; `guard:migrations`/`guard:actions` — no migration or workflow changed. Historical CI on the base is not claimed as evidence for this diff.

## 5. Generated-type decision

`types/supabase.ts` was not edited. It predates Unit A (it has no `tenant_kind`), so a regeneration would carry unrelated churn and needs a live schema. The three columns are typed by the application-owned `SchoolTenantControls` and the row is validated at runtime by `parseSchoolTenantControls` rather than trusted through a cast. `npm run type-check` passes without any change to the generated file, so the contract's stop condition ("a generated Supabase-type rewrite is required") did not fire.

## 6. Highest-risk review areas

1. **Refusal-order change in `checkProvisionGate`.** A session that is both ineligible and outside the allowlist now reports `school_not_allowlisted` where it reported `session_ineligible` before; the master flag still short-circuits everything. The rewritten test says so explicitly. The refusal is only logged by the six enqueue callers, but confirm no caller branches on `session_ineligible` for a session that could also be outside the wave.
2. **Lookup placement in `POST /api/sessions`.** The school read now runs before the facilitator validator and the growth-community check. For a real client school nothing observable changes; for a nonexistent `school_id` the response is now `404 school_not_found` instead of the earlier facilitator/growth-community `400`. Confirm this is acceptable as the "exact behaviour" preservation bar.
3. **Financial-field check reads the raw body.** `checkOperatorSessionRequest` refuses on `!= null` of the raw `contrato_id`/`hour_type_key`/`program_enrollment_id`, so an operator request with an empty-string `program_enrollment_id` is refused even though the stored value would have been `null`. Fail-closed by design; a single unpaired `hour_type_key`/`contrato_id` is still refused earlier by the existing pair validator (asserted pre-mutation, but not with the operator code).
4. **Reader lives under `lib/types/`.** `readSchoolTenantControls` performs a query from a `types` module because it is the one file in the boundary both routes may share. It is the only shared fetch, selects the three columns by an exact id via `maybeSingle`, and never throws.
5. **Mock fidelity.** The creation suite uses the real facilitator validator against an in-memory `user_roles` table whose `.or()` handler recognises only the validator's exact `school_id.eq.<n>,school_id.is.null` expression and throws on anything else. If the validator's query shape changes, this suite fails loudly rather than passing vacuously — verify the engine matches the current validator.

## 7. Invariant confirmations

- **Cleanup stayed flag-free.** `checkCleanupGate` body unchanged; `enqueueSessionMeetingDelete` unchanged; new tests enqueue `meeting_delete` with `FEATURE_ZOOM_MEETINGS=false` and the school outside the allowlist, and `checkCleanupGate` passes with no `env` at all.
- **Draft capability never calls the full gate.** `capabilities.ts` does not import `checkProvisionGate`; the suite spies on both `checkProvisionGate` and `checkSessionEligibility` across three requests and asserts zero calls.
- **Client and QA preserved.** Five representative creation cases (client link session with a contract/hour-type pair; client presencial with a program enrollment; client managed-Zoom intent with the master flag off and no allowlist entry; QA managed Zoom with all three financial fields; QA presencial unmanaged with the flag off) return 201 with the fields stored as before. The two pre-existing creation suites pass unchanged apart from the fixture row.
- **Browser never writes tenant controls.** No route in this diff accepts `tenant_kind` or `internal_zoom_testing_enabled` from a request; both come from the school row.
- **No school classified, no dummy contract, no school-19 logic, no secrets or real PII** in code, tests, fixtures, logs, commits or this file. All ids and names in fixtures are synthetic.
- **Database triggers remain the final boundary.** The API validation is in addition to the Unit A guards, not a replacement, and does not rely on them.

## 8. External actions

**NONE.** No push, PR, merge, deployment, Vercel change, Supabase Production or hosted access, `--linked` command, MCP database call, migration, seeding, classification, configuration change, Bridge task, or cleanup of any other checkout. The shared checkout and every other worktree were left as found.

## 9. Known limitations

- `operator_test_creation_allowed` is advisory for the UI; the POST repeats every check. Neither route checks the roster (B2) or the approval path (B2).
- Reason-code prose (es-CL) for the capability response is B3's; the creation refusals already carry es-CL messages plus codes.
- No Production behaviour was observed. Everything above is local synthetic evidence.

## 10. Reviewer entry points

- `lib/types/tenant-kind.ts` — read top to bottom (≈120 lines).
- `lib/zoom/provisioning-intent.ts` — `ZoomRolloutRefusal`, `checkZoomRolloutPolicy`, `checkProvisionGate`, and confirm `checkCleanupGate` is byte-identical to base.
- `pages/api/sessions/capabilities.ts` — handler order and `parseSchoolIdQuery`.
- `pages/api/sessions/index.ts` — the block after `createServiceRoleClient()` in `handlePost`, then `refuseSchoolLookup` and `checkOperatorSessionRequest` at the bottom.

## 11. Commit range

| Commit | Parents | Content |
|---|---|---|
| `0e080ded52dd8a1554daa77df1d9d277a37e94ba` | `838f1a0c` | implementation + tests: 9 files, 1,426 insertions / 17 deletions against the original base |
| `dc9724d0f1d7b0ed4d4c2f22b346510bd7e17f54` | `0e080ded` | this review request (first version) |
| `57d92e9cbe84e19fda28274c5ac57fa7fc122baa` | `dc9724d0` | documentation-only: recorded that a final read-only `ls-remote` had returned `982f456d` for `main`, uninspected at the time. **Attempt-1 reviewed HEAD.** |
| `c00bcbf48a87cde0cce07dd337c56b9675644997` | `57d92e9c` + `982f456d` | integration merge of `origin/main` (PR #78) into `feat/zoom-int-b1` — §12 |
| branch tip | `c00bcbf4` | this attempt-2 documentation correction |

`git diff 982f456d..HEAD` names exactly the ten B1 paths of §1; `git diff 838f1a0c..HEAD` names those ten plus the three PR #78 paths. No commit was amended, rebased, squashed or rewritten.

## 12. Attempt 2 — base reconciliation (2026-09-03)

**Attempt-1 review result, as communicated to this session:** a bounded base-reconciliation and evidence-correction round was requested. No change to B1 production code or tests was requested, and none was made.

**Pre-mutation re-lock (18:46:04Z):** worktree clean at exactly `57d92e9c`; `git ls-remote origin refs/heads/main` = `982f456deeecdeefd14a08339a4b40676454128c`; `838f1a0c` is an ancestor of `982f456d`. `main` moved by three commits (`1748eb7c` fix(community): reset messaging state across communities; `365674a5` merge with main; `982f456d` merge of PR #78) touching exactly three paths — `__tests__/pages/community/workspace.mention-scope.test.tsx`, `docs/planning/reviews/fase-mtg-members-review-request.md`, `pages/community/workspace.tsx` — with zero overlap against the ten B1 paths.

**Integration:** `git fetch origin main` (the one authorized fetch), then `git merge --no-ff 982f456d` → merge commit `c00bcbf48a87cde0cce07dd337c56b9675644997`, parents `57d92e9c` and `982f456d`. No conflict. Verified after the merge: the three PR #78 blobs at `HEAD` equal their blobs at `982f456d` (byte-identical); `git diff 57d92e9c HEAD -- <ten B1 paths>` is empty (no B1 production or test blob changed); `git diff --name-only 982f456d HEAD` is exactly the ten B1 paths.

**Validation on the merge commit `c00bcbf4` (after the last code-affecting change; the documentation commit that follows changes only this file):**

| Command | Result |
|---|---|
| focused Vitest (the five B1 suites) | exit 0 — 5 files, **121 passed / 0 failed** (46 + 24 + 35 + 7 + 9) |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (zero warnings) |
| `npm test` | exit 0 — **378 files passed / 8,717 tests passed / 11 skipped / 0 failed** |
| `npm run build` (dummy public Supabase vars, as in §4) | exit 0 — `✓ Compiled successfully`, `ƒ /api/sessions/capabilities` present in the route manifest |
| `npm run guard:browser` | exit 0 — 1145 files scanned, no boundary finding |
| `npm run guard:secrets` | exit 0 — 2,480 tracked paths, 0 findings |
| `git diff --check` | exit 0, clean (run with this file already edited in the working tree) |

After the attempt-2 documentation commits: worktree clean, `git diff --check` clean, `guard:secrets` re-run on the committed index (exit 0 — 2,480 tracked paths, 0 findings), `git diff --name-only 982f456d HEAD` still exactly the ten B1 paths, the three PR #78 blobs still byte-identical to `982f456d`, and `git diff 57d92e9c HEAD -- <the nine non-doc B1 paths>` empty. The first attempt-2 documentation commit (`2b1a0b3d`) was committed with this table's placeholders unfilled because the fill script aborted before writing; this follow-up commit fills them and changes nothing else.

Not run, unchanged reasons from §4: `test:db`, `e2e`, `guard:migrations`, `guard:actions`.

**External actions:** NONE. No push, PR, merge to `main`, deployment, Production or hosted database access, configuration change, or Bridge task.
