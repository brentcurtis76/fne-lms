# Review Request — Indicator PUT remediation (code-review findings)

**Branch:** `fix/ind-put-case` · **Base:** `main` (`481f15a`) · builds on the shipped camelCase-mapping fix (`6dfbe2c`). This commit is the remediation of the `/code-review` findings on that fix.

## Objective & scope

Fix the correctness/hardening/cleanup issues an xhigh `/code-review` found in the indicator PUT camelCase fix. **Scope in:** the 4 correctness bugs, category-switch data model, detalle/normalization parity, and root-cause cleanup. **Scope out:** the typed-request-contract refactor (`Create/UpdateIndicatorRequest` → camelCase + shared parser) — deferred to its own task to keep the correctness fixes unblocked; the concurrent-PUT race (documented, needs a DB-level invariant via the DB-agent flow).

**Category-switch model = preserve + hide** (product decision): a category change never destroys off-category columns; the snapshot builders hide them by category instead, so data survives and reappears on switch-back.

## Changes by risk

**Higher risk (behavior / data path):**
- `pages/api/.../indicators/[indicatorId].ts` — PUT rewrite: 400 (not 500) on non-object body; effective-state profundidad check gated to only fire when the request touches category/descriptors (unblocks legacy descriptor-less rows for unrelated edits); **removed** the category-transition column-nulling (preserve+hide); detalle validation falls back to stored options + snake_case `pick`; text normalization + empty-name rejection; descriptor logic de-duplicated via `LEVEL_DESCRIPTOR_KEYS`; current-state row now comes from the (widened) existence select — one fewer query per PUT.
- `lib/services/assessment-builder/autoAssignmentService.ts` and `pages/api/.../publish.ts` — both snapshot builders now project category-specific columns through `categoryScopedColumns` so preserved off-category data never reaches `snapshot_data` (the LLM report).
- `pages/admin/assessment-builder/[templateId]/index.tsx` — frecuencia save merges the chosen unit onto the existing `frequency_config` (`buildFrequencyConfig`) instead of rebuilding `{ unit }` (fixes the wipe).

**Lower risk:**
- New helpers: `lib/validation/profundidadValidator.ts`, `lib/validation/indicatorNormalize.ts`, `lib/services/assessment-builder/frequencyConfig.ts`, `lib/services/assessment-builder/indicatorCategoryColumns.ts`.
- `pages/api/.../indicators/index.ts` (POST) — profundidad validation via the shared validator (whitespace descriptors now rejected, matching PUT).
- `types/assessment-builder.ts` — `MappedIndicator` moved here; `indicatorMapper.ts` imports it; the builder page derives `IndicatorData = MappedIndicator` (drops the dead `isActive`).

## Test evidence

`type-check` ✓ · `lint` (0 warnings) ✓ · **Vitest 197 files / 2491 tests ✓** · `build` ✓. New/updated: `profundidadValidator.test.ts` (4), `frequencyConfig.test.ts` (3), `indicatorCategoryColumns.test.ts` (4, the preserve+hide leak-freeness proof), `indicator-put-mapping.test.ts` (+6: primitive-body 400, rename-only on stuck row, empty-name, trim, detalle re-affirm, preserve-on-switch), `cobertura-gate` + `detalle` mocks rewired for the new flow, `indicators.test.ts` POST-whitespace rejection. Each new correctness case fails on the pre-remediation HEAD and passes now.

## Scrutinize hardest

1. **F5 preserve+hide leak-freeness** — is `categoryScopedColumns` wired into *every* snapshot/report path? I verified scoring + evaluator UI dispatch by category and the two snapshot builders now project; the `docente`/`demo` payloads emit descriptors but the UI hides them. Look for any other live-row descriptor reader feeding the LLM.
2. **F2 gate** — "only validate profundidad when category/descriptors are touched." Confirm no path lets a profundidad row reach an all-empty descriptor state (clear-last still 400s; POST tightened).
3. **PUT current-state now trusts the dispatcher-passed row** — confirm the widened existence select covers every column the validation reads.
4. **`IndicatorData = MappedIndicator`** — `isActive` dropped as dead; type-check is the safety net, but eyeball the builder for any runtime reliance.

## Known limitations / deferred

- Typed request contract (camelCase `Create/UpdateIndicatorRequest` + shared parser) — separate follow-up.
- Concurrent-PUT race on descriptor clearing — accepted low risk; future DB-level invariant.
- `weight || 1.0` → `?? 1.0` in POST — left as pre-existing/out-of-scope (not touched by this change).
- Manual browser root-proof on a QA template not performed (no admin session; avoids mutating live QA data); the frequency-config preservation and preserve+hide behaviors are covered by the unit/integration tests above and the read-only DB confirmation that the one rich-config row is intact.
- The 2 descriptor-less profundidad rows (`APR1.3.4`, `CRE2.6.3`, both draft) are unblocked for editing but need their descriptors filled by content owners via the UI — no production data was written.
