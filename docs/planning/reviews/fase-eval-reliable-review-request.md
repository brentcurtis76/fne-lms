# Review request — PR 3: evaluation-form and instrument reliability

- **Branch:** `fix/eval-reliable`
- **Base:** `4616d04e` (PR 2 head — "docs(proc-integ): review request for PR 2 data integrity, tenancy and RLS")
- **Commits (4, this file included):**
  1. `794bd25f` fix(assessments): reliable autosave, null frequency clears, context summary
  2. `91815c6d` feat(assessment-builder): require a complete frequency_config to publish
  3. `1bacdaa6` feat(assessments): grade on list cards; Mis Evaluaciones for teaching roles
  4. (this file) docs(eval-reliable): review request
- **Diff scope:** 19 files, +1611 / −83 (7 test files, 12 production files). No migrations, no RLS, no schema change.

## Objective and scope (from the plan, PR 3 section)

Make the docente evaluation form and the frecuencia instrument reliable enough that what a teacher answers is what gets scored.

**In scope**
1. **Autosave repair** — the debounce dropped every indicator except the last one edited within 2 s; a failed save was reported as saved; Enviar proceeded even if the pre-save failed; no unload warning; a cleared frequency emitted `NaN`; the displayed default unit was never persisted.
2. **Frequency configuration at publish** — `frequency_config` was written as `{ unit }` only and never validated, so the scorer silently assumed `max = 100` for every published frecuencia indicator. Publishing now requires a complete config (hard 400). Plan rule honoured: *"Do not invent a scoring maximum"* — `scoringService` defaults are untouched.
3. **Form clarity** — the form header did not say which course / grade / year / generation / status was being evaluated; list cards lacked the grade; `Mis Evaluaciones` in the Sidebar was visible to `docente` only although six roles are teaching-eligible.

**Out of scope**
- Production audit / backfill of existing snapshots' `frequency_config` (production task, not done here — see Known limitations).
- Changing scorer defaults, the indicator create/update APIs' own validation, or migrating existing `frequency_unit_options` data.
- `npm run build`, Playwright e2e, pgTAP (another process held the local DB and port 3000 during this work) — to be appended by the orchestrator.

## Files by risk

**High — user-facing behaviour of the evaluation flow**
- `pages/docente/assessments/[instanceId]/index.tsx` — autosave rewritten around a dirty map (id → change counter) + serialized save chain; Enviar aborts on failed pre-save; `beforeunload`; unmount cleanup; context summary block (`data-testid="assessment-context-summary"`).
- `pages/api/admin/assessment-builder/templates/[templateId]/publish.ts` — new hard 400 (`code: invalid_frequency_config`) listing offending indicators. Blocks publishing templates whose frecuencia indicators are not fully configured (this is the intended effect, but it is a behaviour change for existing drafts).
- `pages/api/docente/assessments/[instanceId]/responses.ts` — `frequency_value` must be a finite number; **`null` is now accepted as a cleared value** (previously `null` failed the `typeof === 'number'` check).

**Medium — builder editor and shared contract**
- `lib/services/assessment-builder/frequencyConfig.ts` — `validateFrequencyConfig` (single rule set shared by publish and the builder) and `buildFrequencyConfig(existing, unit, fields?)`.
- `pages/admin/assessment-builder/[templateId]/index.tsx` — indicator modal: default-period select, min/max/step inputs, inline "Para publicar: …" hint, save refuses an incomplete config; `frequencyFormFromIndicator` / `frequencyConfigFromForm` helpers; `data-testid`s on all new controls and the save button.
- `components/assessment/inputs/FrecuenciaInput.tsx` — `value: number | null`, emits `null` on clear; emits the displayed default unit once a value exists; `resolveFrequencyUnits` (allowed_units → fallback list; `config.unit` first when it is a real period, legacy `"veces"` ignored).
- `components/layout/Sidebar.tsx` — `Mis Evaluaciones` `restrictedRoles = [...TEACHING_ELIGIBLE_ROLES]`; `NAVIGATION_ITEMS` exported (additive) so tests read the real config.

**Low — additive plumbing / display**
- `pages/api/docente/assessments/[instanceId]/index.ts` — `instance.generationType` added to the GET payload.
- `pages/docente/assessments/index.tsx` — "nivel · curso" on cards; generation badge title from `GENERATION_TYPE_LABELS`.
- `components/assessment/IndicatorInput.tsx`, `components/assessment/types.ts` — pass `allowed_units`, `frequencyValue: number | null`.
- `types/assessment-builder.ts` — `FrequencyConfig.allowed_units`, `GENERATION_TYPE_LABELS`, `SaveResponseRequest.frequency_value: number | null`.

**Tests (all import the real page / component / handler — no re-implementations)**
- `__tests__/pages/docente/assessment-form-autosave.test.tsx` (new, 15)
- `__tests__/pages/docente/assessments-list-cards.test.tsx` (new, 2)
- `__tests__/pages/admin/assessment-builder-frequency.test.tsx` (new, 3)
- `__tests__/api/docente/assessments/responses.test.ts` (+4 → 8)
- `__tests__/api/assessment-builder/publish.test.ts` (+5 → 15)
- `__tests__/lib/services/assessment-builder/frequencyConfig.test.ts` (+10 → 13)
- `__tests__/components/layout/Sidebar.restrictedRoles.test.ts` (+3 → 10; now also reads the exported `NAVIGATION_ITEMS`)

## Test evidence

| Gate | Result |
|---|---|
| `npm run type-check` | exit 0 |
| `npm run lint` (`--max-warnings=0`) | exit 0 |
| `npm run lint:testid` (advisory) | touched UI files: **89 problems (1 error, 88 warnings) at base → 83 (1 error, 82 warnings)**. The one error is the pre-existing `eslint-disable-next-line react-hooks/exhaustive-deps` comment in the docente form (the testid config has no `react-hooks` plugin). No new warnings; six removed. Whole-repo run: 2614 problems (44 errors, 2570 warnings), all pre-existing. |
| Focused suites (8 files) | **68 passed / 68** — responses 8, publish 15, frequencyConfig 13, form-autosave 15, builder-frequency 3, builder-publish 2, list-cards 2, Sidebar 10 |
| `npm test` (full Vitest) | **403 files passed; 9082 passed, 12 skipped (9094)** |
| `npm run build`, `npm run test:db`, `npm run e2e` | **not run here** (local DB / port 3000 in use by another process) — to be appended by the orchestrator |

What the form tests actually exercise (real page, fake timers, fetch stubbed): rapid A→B→C inside 2 s → **one** PUT with all three rows; failed PUT keeps all ids dirty, `Guardar` enabled, retry sends the same set; an edit made while a PUT is in flight is not cleared by that PUT's success and is flushed afterwards; `Enviar` with a failing pre-save shows the es-CL toast and **never** POSTs `/submit` (and the cancelled debounce does not fire later); clearing the frequency sends `frequency_value: null` (payload contains no `NaN`); default unit emitted and persisted from `allowed_units` / `config.unit`; opening a form with an untouched frecuencia indicator triggers **no** autosave; `beforeunload` is `defaultPrevented` only while dirty; a 200 with `errors: ["Indicador <id>: …"]` keeps only that id dirty.

## Where to look hardest (reviewer hotspots)

1. **Dirty-map settle logic** (`performSave` → `settle`, docente form). An id is deleted only if its change counter equals the one captured when the PUT was built. Check the interleavings I did not test: a save that throws *after* `settle` ran (`updateProgress` cannot throw, but verify), and `responsesToSave.length === 0` (dirty ids with no response object) which settles them as "saved". I believe the latter is unreachable because `handleResponseChange` always writes a response object first.
2. **Serialized save chain** (`flushDirty`): `saveChainRef.current.then(performSave, performSave)` runs the next save even if the previous promise rejected (it never rejects — `performSave` catches — but the rejection branch is there defensively). A queued `performSave` re-reads `dirtyRef`, so two queued flushes with nothing new produce an empty second PUT? No — the second call finds an empty dirty map and returns `true` without fetching. Worth a second pair of eyes.
3. **`null` now valid for `frequency_value` on the responses API.** Previously `null` was rejected (`typeof null !== 'number'`), which meant a docente could never clear a frequency. I changed the rule to "undefined/null = partial save, otherwise finite number". Confirm this matches the product intent; the DB column already nullable.
4. **Default-unit emission is gated on a value being present** (`FrecuenciaInput` effect). The spec said "emit once (effect)"; emitting on mount would mark every untouched frecuencia indicator dirty just by opening the form, which autosaves and moves a `pending` instance to `in_progress`. I gated it on `hasValue` to avoid that side effect (test: "does not autosave anything just by opening a form"). A legacy row with a value but `frequency_unit = null` is repaired on open (that instance is already in progress).
5. **Builder save now refuses an incomplete frecuencia config** with the same rules as publish. Spec only required the hard gate at publish; I also block the indicator save so the admin learns about the gap where they can fix it. Consequence: editing *anything* on a legacy frecuencia indicator (`{ unit: "veces" }`) forces the admin to fill min/max/step first. `frequency_unit_options` (column) is still written alongside `frequency_config.allowed_units` — two sources of the same list; the docente form prefers `allowed_units` and falls back to the column.
6. **Publish 400 message** lists `code || name`; the `details` array carries per-indicator reasons. The list-of-indicators is unbounded — fine for real templates, but a template with dozens of unconfigured indicators yields a long toast in the builder UI (existing publish error handling shows `data.error`).

## Known limitations / deferred

- **Build, pgTAP and Playwright not run in this worktree** (shared local DB / port 3000). Orchestrator to append `npm run build`, `npm run test:db`, `npm run e2e` results; there are no migrations, so `test:db` is expected unchanged. A literal e2e for the autosave path (typing into the real form) is still pending — the page tests use jsdom + fake timers.
- **Production snapshot audit for `frequency_config` is a production task, not done here.** Already-published snapshots keep whatever `frequency_config` they had (typically `{ unit: "veces" }`) and the scorer still applies its `max = 100` default to them; this PR only stops *new* publishes from repeating that. Re-publishing an instrument does not migrate existing instances (PR 2's containment).
- `frequency_unit_options` (column) and `frequency_config.allowed_units` coexist; consolidation deferred.
- The `Guardar` button is disabled while a save is in flight (pre-existing contract). An edit made during that window is flushed by its own debounce or by the next `Guardar`, not by the click that happened while disabled — the tests document this.
- `lint:testid` remains advisory; touched files improved 89 → 83, repo baseline unchanged.

## Orchestrator gate matrix on the PR 3 head `097a72b6` (2026-09-07, local CI-parity, loopback 127.0.0.1:54321/54322)

Guards OK; `git diff --check` clean; `type-check` clean; `lint` zero warnings; `lint:testid` advisory 2614 problems repo-wide (44 errors, 2570 warnings; fewer than the 2620 on the PR 2 head); `npm test` **403 files, 9082 passed / 12 skipped / 0 failed**; `supabase db reset` + `supabase test db` **Files=27, Tests=2317, PASS** (no new migration in PR 3); `npm run build` OK + price-leak guard OK; mandatory Playwright manifest **192 / 0 / 0 / 0**, `--check` OK.

Literal `CI=1 npm run e2e`: **238 passed / 60 failed / 0 flaky / 27 skipped, exit 1** (JSON SHA-256 `f7252737def55179c3246dbc233ef668b04575b529b9ad00e507a413e4eb6397`). Exact base = PR 2 head `4616d04e`: 237 / 60 / 1 / 27. Failing identifiers: shared **60**, candidate-only **0**, base-only **0**. **The literal gate remains RED; no exception is claimed or extended.**
