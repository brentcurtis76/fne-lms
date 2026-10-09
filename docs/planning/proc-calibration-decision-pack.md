# Calibration, expectations and result statements — decision pack for Brent (Procesos de Cambio, B015)

**Status (9 Oct 2026): every policy question below is OPEN.** This pack explains, in plain language, the decisions
that calibration needs from you (requirement REQ-PROC-Q01). It answers none of them. A recommendation here is a
suggestion, never an answer or an approval. **PROC-CALIBRATION stays held**: accepting this pack accepts a document,
not a scoring change, a pilot, historical data or the Procesos de Cambio parent.

The facts come from the accepted current-contract inventory, `docs/planning/proc-calibration-current-contract.md`
(B014, read at `main` commit `42997ec6`). IDs **U1–U18** (inconsistencies), **M1–M25** (synthetic cases) and
**K1–K13** (offline calculations) refer to that document. All examples are made up; no real school, person or count
is used. Product wording is quoted in Spanish exactly as the app shows it; proposed wording is marked
*proposed example* and is not approved copy.

## 1. The problem in one paragraph

The results pages make claims such as "Cumple", "Expectativa Año 4", "X/Y … sobre la expectativa", "Adelante /
En camino / Atrasado / Crítico" and the directivo "Cumplen Expectativa N/M". Some of these say more than their
formulas support. The overall "Cumple" comes from a fixed year ladder (year 1→1, 2→1, 3→2, 4→3, 5→3) that is the
same for GT and GI and never reads the expectations entered in the builder (§2 of the inventory). The per-indicator
count "sobre la expectativa" is always Y/Y (U1). Frequency answers are scored without their period (U4). Server and
demo results disagree on the same answers (U5, U17). Nobody has decided what these claims are allowed to mean, who
supplies the expectation values behind them, or what happens to old results if the rules change.

## 2. What this pack does and does not do

| Does | Does not |
|---|---|
| Lists each open decision with choices, a recommendation and consequences | Answer any decision, or treat a recommendation as approved |
| Reuses the decisions you already made (§3) | Re-ask the whole-number, 8-ULP or F1 input rules |
| Maps every inconsistency U1–U18 to a decision (§5) | Change scoring, copy, expectations, APIs, schema or old results |
| Describes the smallest follow-up *if* you answer (§6) | Start that follow-up; it needs a later approved plan |

## 3. Decisions already recorded (reused, not asked again)

| Decision | Receipt | Where it stops |
|---|---|---|
| Frequency expectations are whole counts | PROC-19, commit `c061486b8`, ledger PROC-NUMERIC-EXPECTATION-RULE | Input rule only; no scorer reads expectation values |
| Depth (profundidad) expectations are integers 0–4 | Same commit as PROC-19; no separate receipt (inventory §6) | Reused as implemented; the missing receipt is a PM finding, not a question for you |
| 8-ULP tolerance for frequency inputs | `frequencyConfig.ts::FREQUENCY_TOLERANCE_ULPS`, PROC-NUMERIC-VALIDATION done 2 Oct | Validation of saved numbers only; **not** a calibration tolerance (CAL-Q6 is separate) |
| F1, option A: expected counts fit the indicator's min/max/step | Your answer of 1 Oct 2026; commit `906bfd8f`, PR #140 | Does not compare periods (units) and is not a scoring rule |
| B014/B015 build evidence via the synthetic loopback build | Your decision `c28fe23c2f0d9d66` (8 Oct) | Documentation gate only; says nothing about calibration |
| PROC-CALIBRATION may be planned | Answer `A-Q-PROC-plan-item-frontier-r4-r1-approve-1` (29 Sep) | Planning only; no product change |

No receipt exists for any of CAL-Q1–CAL-Q12 (checked: plan PROC revision 7, `docs/ledger/procesos-de-cambio.md`
row PROC-CALIBRATION `held`, PROC question answers). Each stays **OPEN** until you answer it.
Existing product behaviour that this pack does not reopen: the coverage gate (an unanswered or "No" coverage
question scores only the gate; M9, M11) and the 0–100 thresholds 87.5/62.5/37.5/12.5 (M14).

## 4. Your decisions, one at a time

Three topics: **A. what result claims may mean**, **B. expectations**, **C. result statements over time, gaps in
data and sources**. Each decision unlocks only the part of a later follow-up that needs it.

### Topic A — What result claims may mean

#### CAL-Q1 — May the results say "Cumple" / "En desarrollo" and "Expectativa Año N"? — OPEN
**Issue.** "Cumple" compares the achieved level with a fixed year ladder that nobody approved as a standard, is
identical for GT and GI and ignores the builder's expectations (U2). The GT/GI badge next to it suggests otherwise.
**Example (M1, K8).** Same answers, total 50% (level 2, "En Desarrollo"): year 3 shows "Cumple"; year 4 shows
"En desarrollo". A GI course and a GT course with the same answers get the same verdict.
**Choices.**
1. **Descriptive only for now.** Show what was achieved (score, level, year) and no "Cumple", "sobre la
   expectativa" or "Cumplen Expectativa" until you approve a normative basis (CAL-Q5). *Proposed example:*
   "Nivel alcanzado: En Desarrollo (2 de 4) · Año de transformación 4".
2. **Keep the year ladder as the official standard.** "Cumple" stays, now formally meaning "at or above the
   fixed ladder for this year"; the GT/GI badge is removed from that card because the ladder ignores it.
3. **Keep today's wording unchanged.**
**Recommendation: 1.** The only basis for "Cumple" today is a hard-coded ladder (inventory §2); U1, U2, U11 and U16
show the normative claims are unsupported or inconsistent.
**Consequences.** 1: no school sees a pass/fail verdict until CAL-Q5 is answered; docente, demo and directivo copy
change. 2: verdicts stay as today but become an explicit FNE standard you own. 3: U1/U2/U11/U16 stay visible.

#### CAL-Q2 — Which year decides the expected level in the directivo view? — OPEN
**Issue.** Docente results use the year stored on the registro. The directivo dashboard uses the school's
*current* year, so an old registro is judged against a newer year (U16).
**Example (synthetic).** A course reached level 2 in a year-3 registro ("Cumple" for the docente). The school
moves to year 4: the directivo view now counts that course as not meeting, with no new answer.
**Choices.** 1. **The registro's own year.** 2. **The school's current year** (today).
**Recommendation: 1.** The registro stores its year at creation and the server scorer uses it (inventory §3.4, §3.6).
**Consequences.** 1: docente and directivo agree; a school with registros from two years shows mixed expected levels.
2: one expected level per school; old registros keep being re-judged.

#### CAL-Q3 — How should the directivo course level be compared and labelled? — OPEN
**Issue.** A course's level is the average of whole levels (e.g. 2.5). The label rounds it ("Avanzado"), but the
"meets" test uses the unrounded 2.5, so the label can equal the expected label while the course does not meet (U11).
**Example (M21, K10).** Levels [2, 3] → average 2.5 → label "Avanzado"; expected "Avanzado" (3); counted as not
meeting.
**Choices.** 1. **Show and compare the average itself** (*proposed example:* "2,5 — entre En Desarrollo y
Avanzado"). 2. **Compare the rounded level**, so the label and the verdict always agree.
**Recommendation: 1.** It shows the number actually compared and invents no rounding rule.
**Consequences.** 1: labels change for averages between levels; counts stay as today. 2: some courses (2.5 vs 3)
start counting as meeting; "Cumplen" N/M rises without any new answer.

#### CAL-Q4 — Which scale turns a score into a level? — OPEN
**Issue.** Templates may set their own thresholds. The summary card uses them; the module card ignores them; for
depth indicators the server uses the chosen depth while the demo applies the thresholds (U10, U17).
**Example (M24, K13).** Depth answer 2, expected 2, thresholds 90/70/60/20, tolerance 0: server "Adelante" (level
2); demo "Crítico" (level 1). (M15, K7) Score 65 with 90/70/50/20: summary level 2, module card level 3.
**Choices.**
1. **Depth answers count as their own level; every other level uses the template's published thresholds.**
2. **The template's thresholds everywhere**, depth answers included.
3. **Fixed 25-point bands everywhere**; custom thresholds are ignored.
**Recommendation: 1.** A chosen depth of 2 is level 2 by definition (MATURITY_LEVELS 0–4); K13 shows option 2 calls
an exact match "Crítico".
**Consequences.** 1: module labels may change on templates with custom thresholds; depth gaps stop depending on
thresholds. 2: the K13 contradiction becomes the rule. 3: custom thresholds stop having any visible effect.

### Topic B — Expectations

#### CAL-Q5 — Who supplies and approves the year/GT/GI expectation values? — OPEN
**Issue.** Any builder user can enter expectations per indicator, profile (GT/GI) and year, and can still change
them after publication (inventory §3.2). No approval is recorded. The overall year ladder is not configurable.
**Choices.**
1. **FNE supplies and approves** each template's values (you or a person you name), recorded before publication.
2. **Each school proposes, FNE approves.**
3. **Builder users decide** without a separate approval (today).
**Recommendation: 1, and no value is invented in the meantime.** Expectations are FNE methodology; schools vary in
year and profile; option 3 is what produced unapproved values that may be edited after publication.
**Consequences.** 1: a named FNE owner must supply values before normative claims return (CAL-Q1); templates without
approved values show descriptive results only. 2: schools must name a contact; values can differ per school.
3: claims rest on values nobody approved.

#### CAL-Q6 — How does tolerance work for each kind of indicator? — OPEN
**Issue.** One tolerance (0, 1 or 2 levels, default 1) is applied to every category, but yes/no indicators only have
levels 0 and 1, and frequency is compared with a 0/1 stand-in (U3, U5).
**Example (M17, K4).** Coverage answered "No", expected yes, tolerance 1 → "En camino" (on track).
(M5) Depth 2 against expected 3: "En camino" at tolerance 1, "Crítico" at tolerance 0.
**Choices.**
1. **Tolerance only for depth.** Yes/no indicators are met or not met; frequency follows CAL-Q7.
2. **One tolerance in levels for all categories** (today).
3. **No gap labels for any category** (depth, yes/no and frequency alike) until FNE supplies per-category rules;
   show answers descriptively.
**Recommendation: 1.** Depth is the only category with a 0–4 scale where "one level short" has a meaning; M17 shows a
"No" read as on track under option 2. The 8-ULP rule is input validation and is not reused here (§3).
**Consequences.** 1: yes/no "No" answers stop reading "En camino". 2: M17 stays. 3: no "Adelante / En camino /
Atrasado / Crítico" label or gap count appears for any indicator, depth included; the gap section is not shown until
per-category rules exist; answers, scores and levels are still shown.

#### CAL-Q7 — How do frequency periods work? — OPEN
**Issue.** A frequency answer has a count and a period (día … año), but the score ignores the period, and the gap
compares the expected count with a 0/1 stand-in (U3, U4). The period list is not checked against the indicator's
allowed periods (U15).
**Example (M3, K2).** 5 per week and 5 per month both score 50%. (M4, K3) Answer 5, expected 4 per week: the server
calls it "Atrasado" (gap −3) although 5 ≥ 4.
**Choices.**
1. **One period per indicator.** Answer and expectation use the indicator's configured period; no conversion.
2. **Free period, converted** to a common period with a conversion table FNE approves.
3. **Period recorded, never compared.** Frequency results stay descriptive ("5 por semana").
**Recommendation: 1.** F1 already ties expected counts to the indicator's min/max/step, which presume one period,
and the score normalizes against that range; option 1 needs no invented conversion factors (option 2 does).
**Consequences.** 1: other periods are no longer offered; old answers in another period show as not comparable.
2: FNE must supply and own conversion factors (weeks per month, school year). 3: no frequency gap claims.

#### CAL-Q8 — What does an empty expectation mean? — OPEN
**Issue.** Today an empty value for a year switches the indicator off for that year (not scored, not shown). A 0 means
"active and always ahead". When the gap section finds no expectation it says "En camino". For yes/no indicators the
editor cannot express 0 (U13); templates with no rows at all follow four different legacy rules (U12).
**Example (M6).** Expected 0 → active, always "Adelante". Empty → indicator disappears for that year.
**Choices.**
1. **Empty = not applicable that year** (today); no separate "not configured" state.
2. **Two explicit states:** "not applicable this year" vs "not configured". Not-configured indicators are still
   answered and scored but make no expectation claim (*proposed example:* "Sin expectativa configurada").
3. **Block publication** until every active indicator has a value for every year and profile.
**Recommendation: 2.** It keeps "switched off" and "forgotten" apart and gives an explicit unavailable state instead of
"En camino" for a missing value.
**Consequences.** 1: a forgotten value silently removes an indicator from the score. 2: needs a way to mark "not
applicable" (whether the existing row-present/value-empty shape is enough is unverified; a schema change would need
its own approval). 3: incomplete templates cannot be published.

### Topic C — Result statements over time, gaps in data and sources

#### CAL-Q9 — How do courses without a usable result count in the directivo totals? — OPEN
**Issue.** A course whose completed registros have no stored result is dropped from "Cumplen Expectativa" N/M; a
course with **no** completed registro stays in N/M as not meeting with average 0 (U18). Both are "no result".
**Example (M23, K12).** Courses: [level 3]; [no level, 1 unavailable]; [level 2, 1 unavailable]; [none completed].
Today: "Cumplen" 1/3; the empty course counts as a failure, the unavailable-only one is skipped.
**Choices.**
1. **Count as not meeting** (zero) in both cases.
2. **Leave both out** of averages and N/M and show one "no disponible" count.
3. **Leave both out and show two counts:** "sin registro completado" and "resultado no disponible".
**Recommendation: 3.** Explicit unavailable states; neither case is evidence that a course failed.
**Consequences.** 1: N/M falls for schools that are still starting. 2/3: N/M covers only courses with a result; the
dashboard gains one or two notices.

#### CAL-Q10 — What is the source of truth for a published version: its snapshot or the live builder? — OPEN
**Issue.** Publication freezes a snapshot, but which indicators count reads the *live* expectations, while the gap
section reads the snapshot; weights fall back to live values when the snapshot has none (U8, U9).
**Example (M19).** After publication an expectation is emptied: the next first calculation drops the indicator, while
its gap still uses the snapshot value. (M13, U9) A weight edit after publication changes later first calculations.
**Choices.**
1. **Snapshot is the truth** for everything a published version scores and claims; changes need a new version.
2. **Live builder is the truth**; edits after publication apply to later calculations.
3. **Keep the mixed behaviour** (today).
**Recommendation: 1.** Registros already store their version; option 1 makes the same answers give the same result
whenever they are scored.
**Consequences.** 1: fixing a published expectation means publishing a new version. 2: results depend on when they
were first calculated. 3: U8/U9 stay.

#### CAL-Q11 — Must the demo give the same results as the real results page? — OPEN
**Issue.** The demo is a separate implementation: different gap scale, rounding, no per-year weights, a different
legacy rule (U5, U6, U7, U12, U17).
**Example.** (M17) Coverage "Sí": server gap 0, demo +3. (M16, K1) 23 of 0–160: 14.37 vs 14.38. (M13) Year weights
ignored by the demo. (M24) Depth "Adelante" vs "Crítico".
**Choices.**
1. **Same results** on the same answers, proven by shared test cases.
2. **Illustrative demo**, labelled as a simulation that may differ (*proposed example:* "Simulación: los resultados
   pueden diferir de los resultados oficiales").
3. **Demo shows answers and scores only**, no levels or gap claims.
**Recommendation: 1.** People use the demo to learn what results mean; K1–K13 show it currently teaches different
verdicts.
**Consequences.** 1: demo follows every answer above. 2: divergence stays but is disclosed. 3: smaller demo.

#### CAL-Q12 — Do new rules apply only to new versions, or also to old results? — OPEN
**Issue.** Stored results were calculated under today's rules. Some pages recalculate when no stored result exists
(docente GET; directivo GETs only for admins), so a rule change could silently reach old registros.
**Example (synthetic).** A year-3 registro stored total 50% "Cumple" under version 1.3. A later rule (say CAL-Q1
option 1) is introduced.
**Choices.**
1. **New versions only.** Old results keep their stored values and today's rules; new rules apply to versions
   published after approval.
2. **Recalculate all old results** under the new rules.
3. **New versions by default; recalculation of named schools or versions** only with your separate approval each time.
**Recommendation: 1.** It changes nothing already shown to schools and needs no historical recalculation (outside this
plan). Option 3 can be chosen later.
**Consequences.** 1: old and new versions may word results differently; the follow-up must stop old registros being
recalculated under new rules. 2: old verdicts may change; needs a recalculation plan and database review. 3: as 1, plus
a per-case approval route.

## 5. Every inconsistency mapped to a decision

| ID | In one line | Decision | Note |
|---|---|---|---|
| U1 | "X/Y sobre la expectativa" always Y/Y | CAL-Q1 | Removed under option 1; option 2 needs a real per-indicator comparison |
| U2 | GT/GI badge beside a ladder that ignores GT/GI | CAL-Q1, CAL-Q5 | |
| U3 | Frequency gap compares a count with 0/1 | CAL-Q7, CAL-Q6 | |
| U4 | Frequency score ignores the period | CAL-Q7 | |
| U5 | Server 0/1 vs demo 0–4 gap scales | CAL-Q11, CAL-Q6 | |
| U6 | Frequency rounding differs (14.37/14.38) | CAL-Q11 | |
| U7 | Demo ignores year weights; "Peso" shows entity weight | CAL-Q11, CAL-Q10 | |
| U8 | Active set live, gap from snapshot | CAL-Q10 | **snapshot/live** |
| U9 | Live weights used when snapshot has none | CAL-Q10 | **snapshot/live** |
| U10 | Module label ignores custom thresholds | CAL-Q4 | |
| U11 | Rounded label vs unrounded verdict | CAL-Q3 | |
| U12 | Four legacy rules when no expectation rows exist | CAL-Q8, CAL-Q11 | Under CAL-Q12 option 1, legacy versions keep today's rule |
| U13 | Yes/no expectation 0 not expressible in the editor | CAL-Q8 | |
| U14 | Unused single-indicator route with an unmatched upsert target (inferred) | none | Not policy; hygiene for the follow-up, not executed |
| U15 | Periods not checked against allowed periods | CAL-Q7 | |
| U16 | Directivo uses the school's current year | CAL-Q2 | |
| U17 | Custom-threshold depth counterexample (K13) | CAL-Q4, CAL-Q11 | **custom-depth**, offline calculation |
| U18 | Empty course counted, unavailable-only course dropped (K12) | CAL-Q9 | **empty vs unavailable** |

## 6. Conditional follow-up (unapproved; held)

Nothing here is dispatched. It applies only after you answer and a later plan is approved. Paths assume the
recommended answers; another answer changes the list.
**Smallest first slice — result statements only** (CAL-Q1, CAL-Q2, CAL-Q3, CAL-Q9, CAL-Q12): wording, display and
directivo aggregation for new versions only; no scoring formula change. "Descriptive" (CAL-Q1 option 1) means a
new-version result shows score, maturity level, answers and year, and **no normative element anywhere**: no
"Cumple"/"En desarrollo" verdict, "Expectativa Año N", "X/Y … sobre la expectativa", gap section, gap badge
("Adelante / En camino / Atrasado / Crítico") or gap count (↑ → ↓ ⚠) in the module header **or the expanded module
table**, and no "Cumplen Expectativa" count. Old versions keep exactly today's display.

*Rule-set marker — unverified design assumption.* `publishTemplate.ts` would write a rule-set key into
`snapshot_data` for versions published after approval; a snapshot without the key (every existing one) means
today's rules. `snapshot_data` is a `jsonb NOT NULL` column (baseline migration, line 6327), so a new key *appears*
to need no migration. Not verified: triggers, guards (e.g. `assessment_template_via_rule_guard`) or readers that
check the snapshot's shape. If any database change turns out to be needed, it returns as a later DB-reviewed plan;
this pack does not approve one.

Paths (each read at `42997ec6`; all hypothetical and unapproved):

| Path | Change (if the answers are as recommended) |
|---|---|
| `types/assessment-builder.ts` | optional rule-set key on `TemplateSnapshotData` (line 658); shared policy type |
| `lib/services/assessment-builder/publishTemplate.ts` | write the key on new publications only (Q12); never rewrite earlier snapshots |
| `components/assessment/results/types.ts` | `ResultsData.instance` carries the policy; normative fields (`meetsExpectations`, expected level, `gapAnalysis`, `gapStats`, indicator `gap`, `isAboveExpectation`) may be absent |
| `pages/api/docente/assessments/[instanceId]/results.ts` | read the key from the snapshot it already joins (lines 62–65); return the policy; omit normative fields for new versions; the recalculation branch (line 89) keeps today's formula |
| `pages/api/docente/assessments/[instanceId]/submit.ts` | omit `meetsExpectations` (line 259) for new versions (not rendered today; checked `pages/docente/assessments/[instanceId]/index.tsx:383`) |
| `components/assessment/results/SummaryCards.tsx` | required policy prop; descriptive card instead of "Expectativa Año" / "Cumple" / "sobre la expectativa" (lines 60, 81, 99) |
| `components/assessment/results/GapAnalysisSection.tsx` | not rendered for new versions |
| `components/assessment/results/ModuleResultCard.tsx` | required policy prop; for new versions no header gap counts (lines 67–91) and no "Estado" column or badges in the expanded table (lines 110–152); score, level and answers stay |
| `components/assessment/results/DetailedResults.tsx` | required policy prop passed to both `ModuleResultCard` calls (lines 59, 79: objective-grouped and flat) |
| `pages/docente/assessments/[instanceId]/results.tsx` | pass the policy to `SummaryCards`, `GapAnalysisSection`, `DetailedResults` (lines 153, 171, 180) |
| `pages/api/demo/assessments/[templateId].ts` | return the key from the snapshot it reads (lines 58–70) in `template` (demo producer) |
| `pages/demo/assessments/[templateId]/results.tsx` | `StoredTemplateData` (line 64) gains the key; a stored template without it means today's rules; pass the policy at lines 345, 363, 372. `index.tsx:221` stores the API `template` as-is (no change expected) |
| `pages/api/directivo/assessments/course-results.ts`, `school-results.ts` | read the key from the joined snapshot (lines 116–118 / 97–100); registro year (Q2), unrounded average (Q3), two unavailable counts (Q9); "meets" only for old-version registros |
| `pages/directivo/assessments/dashboard.tsx` | local types (lines 55, 80, 105) carry the policy; "Nivel esperado", "Cumplen", "Cumplen Expectativa" and per-course verdicts (lines 282, 311, 434, 598) hidden whenever a new-version registro is in the view |

Checked, no normative claim, no change: `StrengthsWeaknesses.tsx`, `ResultsCharts.tsx`. A required prop makes
type-check fail on any caller that does not pass the policy. Mixed directivo views: no "Cumplen" count may combine
old- and new-version registros; the outline assumes the count is hidden (descriptive totals shown) when any
new-version registro is included. That is a design assumption for the later plan, not an answer to a CAL question.

Tests (hypothetical names; extend existing where named):
- `__tests__/components/assessment/results/claims-policy.test.tsx` (new): old policy renders today's "Cumple",
  gap counts and "Estado" badges unchanged; new policy, with a module **expanded** in both the objective-grouped and
  flat layouts, renders none of "Cumple", "Expectativa Año", "sobre la expectativa", "Adelante", "En camino",
  "Atrasado", "Crítico", ↑ → ↓ ⚠ counts or the "Estado" column.
- `__tests__/api/docente/assessments/results-claims-policy.test.ts` (new): snapshot without key → today's response,
  gap analysis included; key present → policy returned, normative fields absent; recalculating an old registro with no
  stored result gives today's claims; an existing stored result is not updated (supabaseAdmin mock asserts no write).
- `__tests__/api/directivo/results-claims-policy.test.ts` (new): M21, M23, U16, U18; old-only school unchanged;
  new-only school has no "meets" values; mixed school and a course with registros in both versions produce no count
  that includes a new-version registro.
- `__tests__/pages/demo/results-claims-policy.test.tsx` (new) and `__tests__/pages/demo/results-adapter.test.ts`:
  stored demo template with key → no normative element; without key (stale session) → today's display.
- Extend `__tests__/api/assessment-builder/publish.test.ts` (key on new publication; earlier snapshots untouched),
  `__tests__/api/docente/assessments/submit.test.ts` (no `meetsExpectations` for new versions),
  `__tests__/pages/directivo-dashboard-unavailable.test.tsx` (Q9 counts) and `tests/e2e/assessment-results.spec.ts`
  (one old and one new version; expand a module on the new one, the old one unchanged).
**Second slice — scoring and expectations** (CAL-Q4–Q8, Q10, Q11), only after CAL-Q5 values exist:
`lib/services/assessment-builder/scoringService.ts` (snapshot active set, depth level, tolerance, frequency gap),
`lib/services/assessment-builder/clientScoringService.ts` and `pages/api/demo/assessments/[templateId].ts` (parity),
`types/assessment-builder.ts`, `components/assessment/results/ModuleResultCard.tsx` (custom thresholds, Q4; already
touched by the first slice), `pages/admin/assessment-builder/[templateId]/expectations.tsx`,
`pages/api/admin/assessment-builder/templates/[templateId]/expectations/index.ts`,
`components/assessment/inputs/FrecuenciaInput.tsx` (period lock, Q7). Tests: existing `scoringService.test.ts`,
`clientScoringService.test.ts`, `coberturaGatePolicy.test.ts`, `fetchInstanceGapAnalysis.test.ts`,
`__tests__/api/assessment-builder/expectations*.test.ts`, `__tests__/pages/admin/assessment-builder-expectations-editor.test.tsx`;
new `__tests__/lib/services/assessment-builder/scoringParity.test.ts` running M1–M25 through server and demo.
**Compatibility and snapshot policy:** published snapshots are never rewritten; a stored result is never recalculated
under a newer rule set; the recalculating GETs must use the rule set of the registro's own snapshot.
**Historical policy:** none recalculated (CAL-Q12 option 1). **Excluded:** dispatch, product release, schema or
migration (any need returns as a separate DB-reviewed decision), real data, pilot, historical recalculation and
acceptance of the Procesos de Cambio parent.

## 7. Status and evidence

- **PROC-CALIBRATION: held.** This pack is documentation; its acceptance certifies only the pack (and B014 the
  inventory). No ledger or `PROJECT_STATE.md` change is part of B015.
- Source: `main` `42997ec6508396723a15aa1d2492d34e636c1bfe`, still `origin/main` and an ancestor after a fresh fetch
  on 9 Oct 2026 19:28 -03:00.
- B014 acceptance: PM review `APPROVED_WITH_NOTES` (run PROC-PR104-RECOVERY-4, `pm-review-r1.md`, `pm-closure-r1.md`,
  `closure-r1-9506fe6a6fed.json`); docs commit `4d672ea4024d0708d67cb01db0c9fe70608f9315`, ledger commit
  `9fd83d5a38024615e81e0dcb6091af11df6f89d3`. Inventory SHA-256 `e90c554e…f8c0` and B014 review request
  `6118d8ce…7a34`, both re-verified unchanged.
- Open findings for the PM (not questions for you): the 0–4 depth rule has no separate receipt; U14 is inferred.
