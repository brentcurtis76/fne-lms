# Numeric frequency persistence: source diagnosis

**PROC-17 · 2026-09-26 · source-only evidence.** This diagnoses finding F5 in `fase-proc-numeric-audit-review-request.md`. It does not inspect a database, prove that affected rows exist, accept the numeric feature, or authorize a repair.

## Call path and contract

1. Publication reads frequency indicators and calls `validateFrequencyConfig` (`lib/services/assessment-builder/publishTemplate.ts:159-189`). The shared rule requires finite `min < max`, positive finite `step`, and `step <= max - min`, with an eight-ULP tolerance for the latter (`frequencyConfig.ts:63-92,115-151,160-195`). It does **not** constrain values to two decimal places or the response column's eight integral digits.
2. A response is checked against the persisted snapshot's config, not the editable indicator. Modern configs must be complete; absent and exact legacy `{ unit: "veces" }` configs are unconstrained (`frequencyConfig.ts:245-321`). A present value must be a finite JS number within inclusive `[min,max]` and on `min + n × step`, with an eight-ULP comparison; the fallback anchor is zero only for an unconstrained snapshot (`frequencyConfig.ts:340-385`). The component parses typed input with `parseFloat`, while its native number input exposes the config's `min`, `max`, and `step` (`components/assessment/inputs/FrecuenciaInput.tsx:70-89`). Native stepping does not define the server's persistence precision.
3. The docente PUT route puts an accepted number unchanged into `assessment_responses.frequency_value`, then upserts and selects saved rows (`pages/api/docente/assessments/[instanceId]/responses.ts:132-150,189-225`). A database error becomes HTTP 500. The draft client serializes its JS number to JSON and treats a failed save as an error (`lib/services/assessment-builder/responseDraft.ts:175-202`). The instance GET route selects response rows and passes `frequency_value` through as `frequencyValue` (`pages/api/docente/assessments/[instanceId]/index.ts:110-128`); it performs no round-trip revalidation there.
4. The repository baseline declares `assessment_responses.frequency_value numeric(10,2)` (`supabase/migrations/00000000000000_baseline.sql:6193-6208`). A repository migration search found no later declaration or alteration of this column. PostgreSQL rounds values to a declared scale and errors when the integral precision is exceeded **after rounding** ([PostgreSQL numeric documentation](https://www.postgresql.org/docs/current/datatype-numeric.html)). Thus the declared column has at most two fractional and eight integral decimal digits: `-99999999.99` through `99999999.99`.

## Bounded counterexamples

| Config and submitted value | Source verdict | Persistence consequence if the PUT reaches this declared column |
| --- | --- | --- |
| `min=0.1, max=0.3, step=0.2`, value `0.30000000000000004`, valid period | Accepted: ULP tolerance admits the JS alias of the upper grid point. | The column stores `0.30`; the original JS number cannot round-trip exactly. The returned JSON representation also depends on the database client, which this source review did not exercise. |
| `min=0.001, max=0.021, step=0.01`, value `0.001`, valid period | Accepted: the value is the anchor and `step` fits the range. | The column stores `0.00`. That number is off the published grid anchored at `0.001`; submitting it again against the same modern snapshot would fail the server's step check. `0.011` and `0.021` likewise become `0.01` and `0.02`. |
| `min=-0.001, max=0.019, step=0.01`, value `-0.001`, valid period | Accepted: no rule forbids a negative anchor. | The column stores zero at scale two, losing both sign and grid membership. This is the same scale defect with a negative anchor, not a separate assumption that frequencies should be nonnegative. |
| `min=0, max=100000000, step=1`, value `100000000`, valid period | Accepted by configuration and response range/grid rules. | `numeric(10,2)` cannot hold nine integral digits. PostgreSQL raises an error; this route returns HTTP 500 rather than a frequency-specific validation refusal. |
| Exact legacy `{ unit: "veces" }` snapshot, finite value with a valid period | No range or step rule is applied by the snapshot parser. | Scale and capacity remain solely at the column boundary. The current publish rule does not retroactively constrain such snapshots. |

These examples use a valid period from `allowed_units` for modern configs. PostgreSQL rounding is a schema-level deduction, not an observed write in this unit. The client component may also prevent or alter a manual input in a particular browser; no browser journey was run. The stored-row population, deployed schema, Supabase numeric decoding, and any downstream behavior after a rounded response remain **unknown**.

## Findings and destinations

| Finding | Source-based disposition | Next bounded decision |
| --- | --- | --- |
| P1: accepted grid points need not survive two-decimal storage; a rounded value can cease to satisfy its own snapshot config. | The publish and PUT validators do not enforce persistence closure, including for nonzero and negative anchors. | Choose a product representation and compatibility rule, then authorize a separate implementation and database safety review. Cover publication, save, readback, old snapshots, and values already stored. No migration or data rewrite is authorized here. |
| P2: publishable maxima can exceed column capacity. | Range checks compare `min`, `max`, and `step` to each other, not to `numeric(10,2)` capacity. | Include capacity and post-rounding overflow in the same future contract decision; test exact positive and negative boundaries. |
| Unknown operational exposure. | No database or real rows were read. Existing F2 stored-snapshot compatibility is also unresolved. | Request a separately authorized read-only population audit before deciding on any backfill or schema change. |

`PROC-NUMERIC-VALIDATION` remains held. The completed offline fixture model and local readiness check do not supply browser acceptance; PROC-07 reported remaining local prerequisites. This document closes only F5's source diagnosis.
