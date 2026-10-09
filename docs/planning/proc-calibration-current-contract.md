# PROC calibration — current contract inventory and synthetic matrix (B014)

Documentation only. It records what the code at one pinned `main` commit does with calibration inputs and which
result claims it shows. It changes no scoring, approves no policy and does not close **PROC-CALIBRATION**, which
stays held. Every "observed" statement is source inspection or an offline calculation, never production evidence.
No real data, population or impact count is used or inferred. Synthetic values only.

## 1. Source pin and provenance

| Item | Value |
|---|---|
| Fetch | `git fetch origin main`, exit 0, 2026-10-09T18:38:28-03:00 (`FETCH_HEAD` = `origin/main` = `git ls-remote origin refs/heads/main`) |
| **Source SHA** | `42997ec6508396723a15aa1d2492d34e636c1bfe` (main, 2026-10-09T15:10:42-03:00, "Merge pull request #160 … rel/genera-10090929") |
| PROC-F1 `906bfd8ffff1498d32484a5dcdf19051929a79f5` | ancestor of source (`git merge-base --is-ancestor`, exit 0) |
| Result copy `f144e224aeaa0523184aebc07d98ff5084afed1e` | ancestor of source (exit 0) |
| Previous pin (B014 r0) `f5d0c8f8d04bc5e2cb51857d057bc247e0e900de` | ancestor of source (exit 0); 35 commits earlier; kept as historical evidence only |
| Plan root `fix/b5-found` HEAD | `5053faae426d368cd74dca1518f13e913ec92a14` (not the source; never checked out, merged or reset) |
| Merge-base | `7d3dffd005be820f7a3519a08141fc9a71d2dd43`; HEAD is 23 commits ahead, 255 behind the source |
| Named code divergence (HEAD → source) | 27 r0 paths: 16 files, +893/−280; all 33 r1 paths: 22 files, +2225/−304. F1 (`frequencyConfig.ts`, `publishTemplate.ts`, expectations API and editor, indicator PUT), result copy ("Evaluación" → "Registro"), vía assignment rules (§1.1), focused tests. The plan root lacks all of it. |
| Read path | `git show <sha>:<path>` and a clean detached scratch worktree at the source SHA outside the plan root; blob IDs at both pins are in the B014 run evidence (`evidence-r1/inventoried-blobs-r1.txt`) |

Later `main` commits that change any inventoried path or focused test require a repin and rerun before acceptance.

### 1.1 Source refresh f5d0c8f8 → 42997ec6 (r1)
21 of the 27 r0 paths, including the three focused suites, `scoringService.ts`, `clientScoringService.ts`, the
expectations API/editor and every result component, have **identical blobs**; their claims are reused unchanged.
| Path (changed) | Change | Effect on this contract |
|---|---|---|
| `types/assessment-builder.ts` | `grade_id`/`grade` may be `null` (school-level vías) | none on scoring types; grade-less templates read as always-GT (§3.3) |
| `publishTemplate.ts` | DB vía-rule guard refusal → 409 `template_conflict` (`templateGradeRule.ts::templateWriteConflict`) | publication gates and snapshot content unchanged |
| `…/templates/[templateId]/duplicate.ts` | `grade_id` may be null; `checkTemplateGrade`, `nextTemplateVersion` | copy of expectations and year weights unchanged (r0 note corrected, §3.2) |
| `autoAssignmentService.ts` | course path filtered by vía rule (`viaRules.ts::loadViaRules`, fail closed); `createSchoolLevelInstances` removed | school-level instances now come from the database (§3.4) |
| `pages/api/directivo/assessments/course-results.ts`, `school-results.ts` | school scope `resultsSchoolScope.ts::resolveResultsSchoolId`; **only admins recalculate**; `unavailableResults` count | §3.6, §3.9, §7, M23 |
| `pages/directivo/assessments/dashboard.tsx` | unavailable notice; unavailable-only courses leave "Cumplen" N/M | §3.9, M23, U18 |

## 2. Three distinctions this document keeps

1. **Configured indicator expectation** — a per-indicator, per-generation (GT/GI), per-year value in
   `assessment_year_expectations.year_N_expected` (+ `year_N_expected_unit`, `tolerance`). It decides whether an
   indicator is active in year N and feeds the per-indicator gap analysis.
   **Overall expected level** — `getExpectedLevelByYear` (`types/assessment-builder.ts`): year 1→1, 2→1, 3→2, 4→3,
   5→3, identical for GT and GI, never read from configuration. It alone decides "Cumple / En desarrollo".
2. **Input validation** (what may be saved) is not **scoring normalization** (how a saved value becomes 0–100).
   The F1 / 8-ULP rules validate inputs; no scorer reads expectation values to normalize a score.
3. **Observed behavior** (this document) is not **intended policy** (undecided; see §6 and B015).

## 3. Producer → consumer inventory

### 3.1 Storage and types
- `assessment_year_expectations` (baseline migration): `year_1..5_expected integer ≥ 0`, `year_N_expected_unit text`
  (no check), `tolerance integer 0–2` default 1, `generation_type` default GT, unique
  `(template_id, indicator_id, generation_type)`. Types: `AssessmentYearExpectation`, `FrequencyUnit`
  (`dia|semana|mes|trimestre|semestre|año`), `ScoringConfig` (thresholds 87.5/62.5/37.5/12.5), `MATURITY_LEVELS` 0–4
  (Por Comenzar, Incipiente, En Desarrollo, Avanzado, Consolidado).
- Per-year weights: `assessment_entity_year_weights (template_id, entity_type, entity_id, year, weight)`;
  `EntityYearWeight`, `YearWeightGroup`, `TemplateSnapshotData.yearWeights`.

### 3.2 Expectations editor → API (producers)
| Category | Editor control (`pages/admin/assessment-builder/[templateId]/expectations.tsx::renderYearCell`) | API rule (`…/expectations/index.ts::handlePut::validateYearValue`) |
|---|---|---|
| frecuencia | text input, whole count `/^\d+$/` (`isWholeCount`) + period select from `frequency_unit_options` (fallback all six); unit saved only when a count is set (`visibleFrequencyUnit`) | integer ≥ 0 and F1 `frequencyExpectationViolation` against the indicator's current `frequency_config` (min/max/step, 8 ULP); unit: invalid value silently stored as null (`validateUnitValue`), not checked against `allowed_units` |
| profundidad | select `-`,0–4 | integer 0–4 |
| cobertura / traspaso / detalle | checkbox: checked = 1, unchecked = **null** | any number ≥ 0 |
| tolerance | select 0/1/2 | number 0–2 (non-integer passes API; column is integer — DB outcome unverified) |
- GI rows refused for `is_always_gt` grades. Any invalid value rejects the whole batch (400) before writes.
- Archived templates refused; **published templates stay editable**. On a published template F1 re-checks after the
  write and undoes the batch on a concurrent rule change (409 `concurrent_rule_change`).
- `…/expectations/[indicatorId].ts` (PUT/DELETE): refuses frecuencia; values 0–4; upsert `onConflict:
  'template_id,indicator_id'` without `generation_type` (no matching unique constraint in the baseline schema —
  inferred failure, not executed); DELETE removes GT and GI rows. No UI caller found (`git grep "/expectations"`).
- Weights (`validateWeightGroup`): each group ≥ 0 and sums to 100 ± 0.5 when it has more than one item; all
  siblings required, including year-inactive indicators.
- Indicator PUT (`…/indicators/[indicatorId].ts`, F1): rule change that strands expectations → draft: saved with
  `expectationWarnings`; published: 409, nothing written.
- `duplicate.ts` copies expectations (GT and GI, all five years, units, tolerance) and per-year weights
  (`assessment_entity_year_weights`, ids remapped); a failed copy row is logged and skipped, not fatal (not executed).
  Correction: the r0 text said no per-year-weight copy exists; it exists at both pins.

### 3.3 Publication and snapshot (`lib/services/assessment-builder/publishTemplate.ts::publishTemplate`)
- Hard gates: every frecuencia `frequency_config` passes `validateFrequencyConfig`; every frecuencia expectation passes
  F1 (`expectations_out_of_range`). Missing GT (or GI when dual) expectations are **warnings only**.
- Snapshot per indicator: `expectations_gt`, `expectations_gi` (null unless dual), legacy `expectations` (= GT),
  `weight`, `display_order`, category-scoped columns. `yearWeights` captured only if rows exist.
  `template.scoring_config` captured. Version minor +1.
- Grade-less templates (school-level vías) read `grade?.is_always_gt ?? true` here and in the expectations API, so
  they are GT-only: no GI expectations and `expectations_gi` null.
- A template update refused by the database vía-rule guard returns 409 `template_conflict` (snapshot rolled back).

### 3.4 Instance creation
- Course path (`autoAssignmentService.ts::triggerAutoAssignment`): only templates whose vía rule
  (`ab_via_assignment_rules`, `viaRules.ts::loadViaRules`) is `course_docente`; a missing rule or failed read blocks.
  `transformation_year` = `school_transversal_context.implementation_year_2026` at assignment. `generation_type`:
  GT for always-GT grades; else `ab_migration_plan` for (school, year, grade); missing entry → GT with a visible warning.
- School path (vías ruled `school_responsible`): `schoolViaAssignmentService.ts::writeSchoolViaResponsible` →
  RPC `assign_/replace_school_via_responsible` → `school_via_attach` (migration `20261008120000`): one instance per
  (school, template), `generation_type` **'GT'**, `transformation_year` = newest `school_transversal_context` row's
  `implementation_year_2026` (refused if missing or outside 1–5). `createSchoolLevelInstances` no longer exists.

### 3.5 Active indicator set (who reads what)
All four consumers read the **live** `assessment_year_expectations` rows for (template, instance generation), not
the snapshot: indicator active ⇔ row exists and `year_N_expected` is not null. When no row exists for that pair:
| Consumer | No-rows (legacy) behaviour |
|---|---|
| Form `pages/api/docente/assessments/[instanceId]/index.ts` + `ModuleCard` | every indicator active |
| Submit `…/submit.ts` (completeness) | all except traspaso/detalle |
| Server scorer `fetchInstanceDataForScoring` / `filterActiveIndicators` | all except traspaso/detalle |
| Demo `pages/api/demo/assessments/[templateId].ts` (`isActiveThisYear`) | every indicator active (traspaso/detalle scored) |
Then the cobertura gate (`coberturaGatePolicy.ts::resolveCoberturaGate`): first active indicator by `display_order`;
if cobertura and not `true`, only it applies; downstream indicators are omitted, not scored 0.

### 3.6 Server scoring (`lib/services/assessment-builder/scoringService.ts`)
- Normalization: cobertura true 100 / else 0; frecuencia `round2((clamp(v,min,max)−min)/(max−min)·100)` with
  defaults min 0 / max 100, `max ≤ min` → 0, **response unit and expectation ignored**; profundidad `clamp(0..4)/4·100`;
  traspaso/detalle binary. Missing response on an applicable indicator → 0.
- Aggregation: `calculateWeightedAverage` (2-decimal) over applicable indicators → module, active modules → objective,
  active objectives → total; modules/objectives with no active indicator are skipped (R10). Weights: snapshot
  `yearWeights[year]` → else live `assessment_entity_year_weights` → else entity `weight`.
- `overallLevel = scoreToLevel(total, snapshot scoring_config)`; `expectedLevel = getExpectedLevelByYear(year)`;
  persisted `meets_expectations = overallLevel ≥ expectedLevel`.
- `IndicatorScore.isAboveExpectation`: `calculateAndSaveScores` never passes `yearExpectations`, so it is always
  `true` in production (`git grep yearExpectations`: no caller outside the function).
- Persistence: `calculateAndSaveScores` upserts `assessment_instance_results` with `supabaseAdmin`. Callers: submit
  (always); the docente results GET when no result row exists; the two directivo GETs only when no row exists **and
  the viewer is an admin** (since 42997ec6; others count the registro as unavailable).

### 3.7 Server gap analysis (`fetchInstanceGapAnalysis`, read time)
- Indicators = persisted `module_scores` (historical gate re-resolved), expectations from the **snapshot**
  (`expectations_gi` for GI when present, else `expectations_gt`, else legacy `expectations`).
- `scoreToActualLevel`: profundidad `round(score/25)`; every other category `score ≥ 50 → 1 else 0`.
- `classifyGap(actual, expected, tolerance)`: ≥0 ahead; ≥−tol on_track; profundidad ≤−3 critical; tol 0 and <0
  critical; else behind. No expectation → on_track and counted `notConfigured`.
- `calculateAssessmentGapAnalysis` passes no frequency response, so the unit-aware branch
  (`getFrequencyExpectationForYear`, `compareFrequency`, `normalizeFrequencyToAnnual`, `classifyFrequencyGap`) has no
  production caller: a frecuencia count expectation is compared with a 0/1 pseudo-level.

### 3.8 Demo scoring (`clientScoringService.ts::calculateDemoScores`, browser only)
Latest snapshot of the template + live expectations for the chosen year/generation; snapshot entity weights only
(**no `yearWeights`**); same normalization except frecuencia rounding is `round(ratio·10000)/100`; per-indicator gap
uses `scoreToLevel(score, scoring_config)` (0–4 for every category, template thresholds) against the raw configured
value; `isAboveExpectation =
actualLevel ≥ expected`; year clamped to 1–5 (server rejects out-of-range years).

### 3.9 Visible result claims
| Surface | Claim (es-CL as shown) | Producer |
|---|---|---|
| Docente/demo `SummaryCards` | "Puntuación Total" `Math.round(totalScore)%` + level label | persisted total / demo total |
| ″ | "Expectativa Año N" + GT/GI badge, "Cumple" / "En desarrollo", "Nivel esperado: …" | `getExpectedLevelByYear` (year only) |
| ″ | "X/Y … sobre la expectativa" | `isAboveExpectation` count (server: always X = Y) |
| `GapAnalysisSection` | "Adelante / En camino / Atrasado / Crítico", "(nivel A de E esperado)" | §3.7 server / §3.8 demo |
| `ModuleResultCard` | module `%` + label `MATURITY_LEVELS[round(score/25)]`; indicator "Estado" | ignores custom thresholds |
| `DetailedResults` | "Peso: W%" for objectives | docente: snapshot entity weight, not year weight |
| Directivo dashboard | "Año de transformación", "(Nivel esperado: …)", school `%`/label, "Cumplen Expectativa" N/M courses | `course-results.ts`, `school-results.ts` |
Directivo: year = live `implementation_year_2026`, not the instance year; course `avgLevel` = mean of integer levels,
label `round(avgLevel)`, `meetsExpectations = avgLevel ≥ expected` (2-decimal mean, not rounded to a level); GT/GI
ignored. `school-results.ts` computes gap aggregates that the dashboard does not render.
Since 42997ec6 (directivo only): a completed registro without a stored result is not recalculated for non-admins;
it is counted in `unavailableResults` and left out of every average, gap aggregate and level. The dashboard shows
"N registros completados aún no tienen resultado disponible y no se incluyen en los promedios", marks a course whose
completed registros all lack a result "Resultado no disponible" and drops it from "Cumplen Expectativa" N/M; a course
with no completed registro stays in N/M with avg 0 (U18). School scope (`resolveResultsSchoolId`) is access policy,
not calibration.

## 4. Unsupported or inconsistent claims (observed; no fix proposed or approved)
| ID | Observation | Path :: symbol | Evidence |
|---|---|---|---|
| U1 | "X/Y sobre la expectativa" is always Y/Y on docente results | `scoringService.ts::calculateAndSaveScores` (no `yearExpectations`) | source; M7 |
| U2 | GT/GI badge beside "Nivel esperado" although the overall expectation ignores generation and configuration | `types/assessment-builder.ts::getExpectedLevelByYear`, `SummaryCards.tsx` | source; M10 |
| U3 | Frecuencia gap compares a count with a 0/1 pseudo-level; units and conversion are dead in production | `scoringService.ts::calculateAssessmentGapAnalysis`, `scoreToActualLevel` | K3, K11 |
| U4 | Frecuencia score ignores the chosen period: 5/semana and 5/mes score the same | `scoreFrecuenciaIndicator` (server and demo) | K2 |
| U5 | Server and demo gap scales differ (0/1 vs 0–4 actual level), so classifications and average gaps differ on shared cases | `scoreToActualLevel` vs `clientScoringService.ts::scoreModule` | K3, K4 |
| U6 | Frecuencia normalization rounding differs (10 of 80,600 integer cases, e.g. 23 of 0..160: server 14.37, demo 14.38) | the two `scoreFrecuenciaIndicator` | K1 |
| U7 | Demo ignores per-year weights; docente objective "Peso" shows entity weight while the total used year weights | `calculateDemoScores`; `pages/api/docente/assessments/[instanceId]/results.ts` | source |
| U8 | Active set and gap read different sources: live expectations (editable after publish) vs snapshot | `fetchInstanceDataForScoring` vs `fetchInstanceGapAnalysis` | source; M12 |
| U9 | Snapshot without `yearWeights` falls back to live year weights, so post-publish weight edits change a later first calculation | `fetchInstanceDataForScoring` priority 2 | source; M13 |
| U10 | Module level uses `round(score/25)`; summary uses `scoreToLevel(scoring_config)` — differ with custom thresholds | `ModuleResultCard.tsx`, docente `results.ts` `level` | K7 |
| U11 | Directivo label can read "Avanzado" (= expected label) while "Cumple" is false (avg 2.5, expected 3) | `course-results.ts`, `school-results.ts` | K10 |
| U12 | Legacy (no-rows) active set differs: form shows traspaso/detalle, submit/server exclude them, demo scores them | §3.5 | source |
| U13 | Cobertura/traspaso/detalle zero expectation is not expressible in the editor (unchecked = null = inactive); API accepts 0 and any number ≥ 0 | `renderYearCell`, `validateYearValue` | source |
| U14 | Single-indicator expectations route's upsert target has no matching unique constraint; route unused by UI | `…/expectations/[indicatorId].ts::handlePut` | inferred, not executed |
| U15 | Editor period list comes from `frequency_unit_options`; API stores invalid units as null; neither checks `frequency_config.allowed_units` | `frequencyUnitsFor`, `validateUnitValue` | source |
| U16 | Directivo expected level uses the school's current year, not each instance's stored year/expected level | `course-results.ts`, `school-results.ts` | source |
| U17 | With custom thresholds the server/demo depth scales also diverge: depth 2, expected 2, 90/70/60/20, tol 0 → server actual 2 ahead, demo actual 1 critical (PM counterexample; routed to B015) | `scoreToActualLevel` vs `clientScoringService.ts::scoreModule` | K13 |
| U18 | A course with no completed registro stays in "Cumplen Expectativa" N/M as not meeting (avg 0), while an unavailable-only course is dropped | `course-results.ts`, `dashboard.tsx::scoredCourses` | K12 |

## 5. Synthetic case matrix
Evidence types: **T** = existing focused test (name quoted, run at the source SHA, §7); **K** = offline calculation
transcribed from source (`offline-calculations-r1.mjs`, 39 results: r0 K1–K11 reproduced identically plus K12–K13 —
calculations, not application journeys);
**S** = source inspection only. Defaults unless stated: thresholds 87.5/62.5/37.5/12.5, tolerance 1, weights 1,
frecuencia config `{min 0, max 10, step 1, unit semana, allowed_units [semana, mes]}`. Synthetic ids only.

| ID | Case | Input | Server (recorded) | Demo (recorded) | Visible claim | Evidence |
|---|---|---|---|---|---|---|
| M1 | Year/profile → overall expectation | years 1–5 × GT/GI, total 50 (level 2) | expected 1,1,2,3,3 for both GT and GI; meets T,T,T,F,F | same | "Cumple"/"En desarrollo" | K8; T "expected level by year: year 1→1, year 3→2, year 5→3" |
| M2 | Profile row selection | GT and GI rows for one indicator | active set per instance generation (live rows) | per chosen generation | badge GT/GI | T "filters expectations by generationType"; S |
| M3 | Units and conversion | 5/semana vs 5/mes, expected 4/semana | both score 50; unit unused | same | "5" (no unit) in Respuesta | K2, K11; S |
| M4 | Below/equal/above (frecuencia) | v=5, expected 4 / 2 / 0 / 1 | gap −3 behind / −1 on_track / +1 ahead / 0 ahead | −2 behind / 0 ahead / +2 ahead / +1 ahead | Estado badge | K3 |
| M5 | Below/equal/above (profundidad) | depth 0–4, expected 3, tol 1 (tol 0) | critical, behind, on_track, ahead, ahead (tol 0: critical ×3, ahead ×2) | same levels | Estado badge | K5; T "classifies as critical when >2 levels below expected (profundidad)" |
| M6 | Zero vs absent expectation | expected 0 vs null | 0 → active, always ahead; null → inactive (not scored, not shown) | same | — | K3 (v=0,e=0); T "T5: Indicator with no expectation entry — not included in score" |
| M7 | isAboveExpectation | any active indicator | always true | `actual ≥ expected` | "X/Y sobre la expectativa" | S (U1); T "classifies behind indicators" |
| M8 | Missing responses | no responses | every applicable 0, total 0 | same | 0% | T "D2: no responses at all → every applicable indicator 0, total 0"; T "empty responses → all zeros" |
| M9 | Coverage false / unanswered | gate No or unanswered | only gate scored (0); downstream omitted; practice 0 at full weight | same | — | T "T6: Cobertura active + answered No — module scores 0 (gate effect)"; T "D2: server and client scoring agree on applicable indicators, module scores and total" |
| M10 | Inactive indicators/modules | 2 of 4 active; module with 0 active | only active weights; module excluded from denominator | same | — | T "T3: Module with 4 indicators, only 2 active for Year 1 — uses only those 2 weights"; T "T4: Module with 0 active indicators — excluded from objective average" |
| M11 | Inactive first cobertura | first-by-order cobertura inactive | does not gate | does not gate | — | T "an INACTIVE first cobertura does not gate an active downstream indicator"; T "a nominally-first indicator excluded by the caller (year-inactive) lets a later cobertura become the gate" |
| M12 | Weights and denominators | 30/20/50, third inactive; all-zero weights | renormalized 60/40 (K9a = 60); zero total → 0 | demo uses entity weights only | "Peso" | T "T8: Dynamic redistribution: weights [30, 20, 50], only first two active → [60%, 40%]"; K9a, K9b |
| M13 | Per-year weights | Y1 indicator 40%, Y2 none | Y1 override; Y2 entity default | overrides ignored | — | T "T-PY1: Scoring Year 1 uses Year 1 indicatorYearWeights (Cobertura 40%)"; T "T-PY2: Year 2 with no per-year weights falls back to default entity weights" |
| M14 | Thresholds and rounding | totals 12.49…87.5 | levels 0,1,1,2,2,3,3,4 | same | "12%"… "88%" | T "12.4 -> level 0" … "87.5 -> level 4"; K6 |
| M15 | Custom thresholds | config 90/70/50/20, score 65 | summary level 2; module card level 3 | demo summary 2 | label mismatch | T "respects custom thresholds from ScoringConfig"; K7 |
| M16 | Frecuencia rounding parity | 23 in 0..160 | 14.37 | 14.38 | "14%" both | K1 (10/80,600 integer cases differ; 0/2,000 decimal) |
| M17 | Cobertura gap scale | Sí / No, expected 1 | Sí: actual 1 gap 0; No: −1 on_track | Sí: actual 4 gap +3; No: −1 on_track | avg gap differs | K4 |
| M18 | Existing vs new snapshot | legacy flat modules; no `expectations_gt`; no `yearWeights` | flat path; legacy `expectations` as GT; live year weights | demo: latest snapshot only | — | T "falls back to flat modules when no objectives"; S (U9) |
| M19 | Post-publish expectation edit | expectation set to null after publish | active set changes on next first calculation; gap still uses snapshot | demo follows live | — | S (U8) |
| M20 | Legacy no-rows active set | no rows for generation | traspaso/detalle excluded | included | — | T "T-legacy: No activeExpectations — falls back to excluding traspaso/detalle"; T "missing display order and missing active-year metadata keep the documented legacy behaviour"; S (U12) |
| M21 | Directivo aggregation | course levels [2,3], [3,3], [1,2]; school years 4,4,3 | avg 2.5 label 3 meets F; 3 meets T; 1.5 label 2 meets F | n/a | "Cumplen Expectativa" | K10 |
| M22 | Input validation (not scoring) | frecuencia expectation 8 with max 5; 2.5; profundidad 5 | refused (F1 / whole number / 0–4) | n/a | editor error | S; F1 tests are outside the three focused suites |
| M23 | Directivo unavailable results (since 42997ec6) | school year 4; course levels [3], []+1 unavailable, [2]+1 unavailable, none completed | non-admin: no recalculation; "Cumplen" 1/3 (was over 4 courses) | n/a | amber notice, "Resultado no disponible" | K12; S |
| M24 | Custom-threshold depth | depth 2, expected 2, 90/70/60/20, tol 0 | actual 2, gap 0, ahead | actual 1, gap −1, critical | Estado badge | K13 |
| M25 | School-level instance profile/year | vía ruled `school_responsible`, grade-less template | GT; year = newest context row; GT-only expectations | n/a | badge GT | S (§3.3, §3.4) |

## 6. Recorded decisions reused, and where they stop
- **Whole-number frecuencia expectation** and **integer 0–4 profundidad expectation**: PROC-19
  (`c061486b8`, ledger row PROC-NUMERIC-EXPECTATION-RULE). Input rules only; scoring never reads expectation values.
  (The ledger receipt names the frecuencia rule; this inventory found the 0–4 profundidad rule in the same commit.)
- **8-ULP oracle**: `frequencyConfig.ts::FREQUENCY_TOLERANCE_ULPS` (PROC-NUMERIC-VALIDATION, done 2026-10-02). It
  governs publish, snapshot parse, response and F1 comparisons; not extended here to normalization.
- **F1 (Brent, 2026-10-01, option A)**: expected counts must fit the indicator's min/max/step (commit `906bfd8f`).
  It does not compare expectation units with response units and is not a scoring rule.
- PM custom-depth counterexample (U17/M24/K13) is routed to B015 as evidence; it is an offline calculation.
- Open policy questions (owner: B015): what "Cumple" should mean per profile; whether expectations should drive
  scores or gaps per category and unit; snapshot vs live source of truth; demo parity. None is answered here.

## 7. Safety boundary and evidence
- Recalculating endpoints (all can call `calculateAndSaveScores` and persist):
  `pages/api/docente/assessments/[instanceId]/results.ts`, `pages/api/directivo/assessments/course-results.ts`,
  `pages/api/directivo/assessments/school-results.ts` (the two directivo GETs only for admins since 42997ec6). None
  was called; no API GET, database, Supabase CLI, service or hosted resource was used. `submit.ts` also persists scores (POST); not called.
- The focused `scoringService` suite keeps its `vi.mock('@/lib/supabaseAdmin', …)`; no unmocked scorer was imported.
- Focused run at the source SHA `42997ec6` (clean detached scratch): `npm test -- __tests__/lib/services/assessment-builder/scoringService.test.ts
  __tests__/lib/services/assessment-builder/clientScoringService.test.ts __tests__/lib/services/assessment-builder/coberturaGatePolicy.test.ts`
  → 3 files, 193 passed (92 + 85 + 16), exit 0. Gate results are in the review request.
- Limits: source inspection only; DB-level outcomes (integer casts, the unmatched upsert target) are inferred and
  marked; no browser journey; no claim about deployed behavior or real data.
