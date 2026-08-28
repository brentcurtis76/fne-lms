# W-PC-06 — Learning-path data classification (read-only) — 2026-08-28

**Work item:** `W-PC-06` (delivery mode `PRODUCTION_CHECK`, class 0 — read without migration) · **Claim:** `SWEEP-MI-APRENDIZAJE-09` (P0) · **Governing record:** release protocol revision 8 §9 and normalization report §13 · **Status after this record:** `DONE` / `AUTHORIZED`.

This document is the aggregate evidence record required by the W-PC-06 gate. It contains **no row identifiers, no names, no e-mail addresses, no free text from any row, and no minor PII** — aggregate counts and schema-level facts only. It **does not propose ownership values** for any row, does not choose between global/shared and school-owned semantics, does not define a repair algorithm, and contains no SQL.

---

## 1. Authorization chronology

1. **2026-08-27** — `W-PC-06` is created by the approved B2b/B2c governance correction (normalization report §12) as `BLOCKED` / `UNAUTHORIZED`, `authorization_owner` Brent, `dueno` empty by the PRODUCTION_CHECK mode exception, with the explicit rule that documenting the check authorizes nothing.
2. **2026-08-28** — Brent, the `authorization_owner`, **explicitly authorized the read-only execution** of the classification check and **personally executed queries 1–4 in the production Supabase SQL Editor**.
3. **2026-08-28, later the same day** — **query 5 was executed by Codex through the already-linked CLI, only after a further, separate, explicit read-only authorization from Brent.** No new production link, credential, or tool was created for it.
4. No other production access of any kind occurred for this check: no writes, no migrations, no grant/policy/RLS/function changes, no Management API calls, no deployment activity.

`execution_owner` is therefore recorded as **"Brent + Codex"**, distinct from `authorization_owner` **Brent** — the two fields answer different questions and are never conflated.

## 2. The five query purposes

No SQL is reproduced here; each query was read-only and returned aggregates and schema facts only.

1. **Path scope** — how many `learning_paths` rows exist; how many have `school_id` NULL and `generation_id` NULL; whether an effective school can be resolved for any of them.
2. **Creator derivability** — how many paths carry `created_by`; whether each creator's school can be safely derived from their active roles, distinguishing scoped from unscoped active roles.
3. **Parent/child integrity** — how many `learning_path_courses` rows exist; how many are orphaned from their path or course; what scope they inherit from their parent path.
4. **Assignment resolution** — how many learning-path assignments exist; how many are direct-user versus group; for how many a school candidate set of size zero, exactly one, or more than one can be resolved.
5. **Per-path dispersion** — for each path with assignments, whether its assigned users fall inside a single candidate school or span several; how many paths have no assignments at all.

## 3. Aggregate results

| Measure | Result |
|---|---|
| `learning_paths` rows | **7** |
| … with `school_id` NULL **and** `generation_id` NULL | **7 of 7** |
| … with a resolvable effective school | **0** |
| … with `created_by` present / absent | **6 / 1** |
| Creators whose scoped active roles yield exactly one school candidate | **6 of 6** — but **each also holds an unscoped active role**, so this is **not authoritative ownership** |
| `learning_path_courses` rows | **22** |
| … orphaned from path or course | **0** |
| … inheriting unresolved parent scope | **22 of 22** |
| Assignments | **883** — **883 direct-user, 0 group** |
| … resolving **zero** school candidates | **86** |
| … resolving **exactly one** school candidate | **793** |
| … resolving **multiple** school candidates | **4** |
| Paths with assignments | **6** — **every one spans multiple candidate schools** |
| Paths with no assignments | **1** |

## 4. Read-only and PII confirmation

- Every query was **read-only**; nothing in production was created, updated, deleted, granted, revoked, or altered.
- Only **aggregate counts and schema-level metadata** were returned. **No row contents, identifiers, names, e-mail addresses, free text, or minor PII** were returned, displayed, copied, or recorded — not in the evidence, not in the ledgers, not in this document.
- The evidence above is the complete data payload of the check; there is no fuller row-level artifact anywhere.

## 5. Repository and application findings (no production access)

Verified against the committed repository only, and structurally consistent with the aggregates:

- `learning_paths` declares `school_id` (integer) and `generation_id` (uuid) as **nullable** columns in the committed baseline (`supabase/migrations/00000000000000_baseline.sql`, table definition at the `CREATE TABLE "public"."learning_paths"` block), and `created_by` is likewise nullable.
- The creation RPC **`create_full_learning_path(p_name, p_description, p_course_ids, p_created_by)`** accepts **no school and no generation parameter** at all.
- Its only application caller, `lib/services/learningPathsService.ts`, **never writes `school_id` or `generation_id`** — the application has no code path that stamps tenant scope onto a learning path. The 100 % NULL scope observed in production is therefore structural, not incidental.
- Assignment writes flow through `batch_assign_learning_path(p_path_id, p_user_ids, p_group_ids, p_assigned_by)`, which supports both direct-user and group assignment; production data shows only the direct-user form was ever used (883 / 0).
- The absent RLS on `learning_paths` / `learning_path_courses` and the six SECURITY DEFINER functions are already governed by `W-B2c-01` (lote B2c) and are **out of scope** here; nothing in this check changes them.

## 6. Classification

**B — DATA TRANSFORMATION REQUIRED.**

Definition used, as fixed when the check was created (protocol §3, §9): **A** — no existing rows require transformation; the B2c boundary could later be classified class 2 on its own. **B** — existing rows require a governed transformation before the boundary can be activated safely; a separate class-3 work item must precede B2c.

The evidence compels **B**: all 7 paths carry NULL scope with no resolvable effective school; creator roles do not yield authoritative ownership (every creator also holds an unscoped active role); 86 assignments resolve no school candidate and 4 resolve several; and every assigned path spans multiple candidate schools. A school-isolation boundary (B2c) enforced over these rows as-is would have no safe, derivable tenant to isolate by — so a **class-3 data repair of existing rows must come first**. The "no transformation → class 2 directly" branch recorded in the original dependency chain is **refuted by the evidence**, not skipped.

**Consequences recorded in the ledgers (not authorized here):** the repair is `W-B2d-01` (lote B2d, rama `data/lp-scope`, class 3, `BLOCKED` / `UNAUTHORIZED`), which must be **separately authorized, implemented, independently reviewed, merged, and safely executed before B2c is scheduled**; `W-B2c-01` remains `BLOCKED` with `clase_migracion` `BLOCKED` and must not absorb class-3 work. This document deliberately **does not** select schools, propose ownership values, choose global/shared versus school-owned semantics (that decision is Brent's and remains open), define any algorithm, or contain any SQL.

## 7. What this record does not authorize

Closing W-PC-06 authorizes nothing else: `W-PC-01`…`W-PC-05` remain `BLOCKED` / `UNAUTHORIZED`; `W-B2d-01` and `W-B2c-01` remain unauthorized and unimplemented; no further production query, of any kind, is authorized by this record.

— Recorded 2026-08-28. Authorization: Brent. Execution: Brent (queries 1–4, production SQL Editor) + Codex (query 5, already-linked CLI, under Brent's later explicit read-only authorization).
