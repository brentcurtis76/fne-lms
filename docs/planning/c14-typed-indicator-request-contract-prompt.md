# Follow-up task prompt — C14: type the indicator request contract

> Paste the block below into a fresh conversation in this repo to execute the task.
> It is the deferred cleanup from the indicator-PUT remediation (branch `fix/ind-put-case`).

---

Work in the GENERA repo (`/Users/brentcurtis/Documents/fne-lms-working`, Next.js Pages Router + TS strict + Supabase). This is a **cleanup-only, no-behavior-change** task: type the assessment-builder indicator request contract so a mistyped field is a compile error instead of a silently-dropped field. Direct file edits on this repo are blocked by a Bridge Mode hook — either post it through the bridge (`jb post ... --project genera`) or include the phrase "edit directly" when you start. Do **not** merge, push, or deploy (`main` auto-deploys — that's the owner's path).

## Background

A prior fix made the indicator PUT accept camelCase (it previously read snake_case while the client sent camelCase, silently dropping edits). A code review flagged that the type layer meant to prevent that class of bug is disconnected from both ends:

- `types/assessment-builder.ts` — `CreateIndicatorRequest` (~line 840) and `UpdateIndicatorRequest` (~line 858) are declared in **snake_case** (`level_0_descriptor`, `evaluation_guidance`, `frequency_config`, …), which contradicts the actual wire (the client sends camelCase). They are **imported nowhere** (verified by grep) — dead, misleading types.
- The client builder page `pages/admin/assessment-builder/[templateId]/index.tsx` builds the request as `const body: any = {...}` (~line 702), so TypeScript can't catch a wrong/missing field.
- The POST handler `pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/index.ts` reads **camelCase** from `req.body`. The PUT handler `.../indicators/[indicatorId].ts` reads **camelCase with a snake_case fallback** (a `pick(camel, snake)` helper) — the fallback must stay (regression tests exercise it and it's cheap backward-compat).

The response side is already consolidated: `mapIndicatorRow` → `MappedIndicator` (both in/near `types/assessment-builder.ts` and `lib/services/assessment-builder/indicatorMapper.ts`). This task does the request side.

## What to do

1. **Rewrite the two request interfaces in `types/assessment-builder.ts` to camelCase** to match the real wire: `code?`, `name`, `description?`, `evaluationGuidance?`, `category`, `frequencyConfig?`, `frequencyUnitOptions?`, `level0Descriptor?`…`level4Descriptor?`, `detalleOptions?`, `weight?`, and (Update only) `visibilityCondition?`. `CreateIndicatorRequest` also needs `moduleId` (or omit if the route takes it from the URL query — check the POST handler; it reads `moduleId` from `req.query`, so `moduleId` likely should NOT be in the body type). Keep `IndicatorCategory`, `FrequencyConfig`, `FrequencyUnit`, `VisibilityCondition` field types.
2. **Type the client body** in `handleSaveIndicator` — replace `const body: any` with a typed object (`Partial<CreateIndicatorRequest>`/`UpdateIndicatorRequest` as appropriate, or a shared request type). The builder assembles fields conditionally by category, so you may need a `Partial<...>` accumulator. Fix any resulting tsc errors by correcting the field construction, **not** by re-widening to `any`.
3. **(Optional but preferred) shared parse helper** `parseIndicatorBody(body)` used by both POST and PUT that returns a normalized camelCase object, keeping PUT's snake_case fallback inside it. Only do this if it stays a clean net simplification; if it balloons, skip it and just fix the types — note the decision.
4. Do **not** change any runtime behavior, validation, error messages, or the snake_case fallback. This is types + the client body only.

## Constraints & gates

- No migration, no DB changes, no production data.
- Run all gates before reporting done: `npm run type-check && npm run lint && npm test && npm run build`. `type-check` is the real gate for this task. `npm run e2e` is not required (no runtime change; note it lacks seeded auth locally anyway).
- Add/adjust any unit tests only if a type change forces a test-fixture update; the existing assessment-builder suites (`__tests__/api/assessment-builder/*`) must stay green.
- Commit on `fix/ind-put-case` (or a fresh branch off it if preferred) with a clear message; do not merge/push/deploy.

## Definition of done

- `CreateIndicatorRequest`/`UpdateIndicatorRequest` are camelCase and match what the client sends and the handlers read.
- The client builder body is typed (no `any`); a mistyped indicator field now fails `tsc`.
- PUT's snake_case fallback preserved; POST unchanged in behavior.
- All four gates green; report changed files + test counts.

Known risk (why this was deferred): strictly typing the conditional client body can cascade tsc errors — resolve them by fixing field construction, never by re-adding `any`.
