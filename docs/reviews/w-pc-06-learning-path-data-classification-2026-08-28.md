# W-PC-06 — Learning-path data classification (read-only) — 2026-08-28

**Work item:** `W-PC-06` (delivery mode `PRODUCTION_CHECK`, class 0 — read without migration) · **Claim:** `SWEEP-MI-APRENDIZAJE-09` (P0) · **Governing record:** release protocol revision 8 §9 and normalization report §13 · **Status after this record:** `DONE` / `AUTHORIZED`.

This document is the aggregate evidence record required by the W-PC-06 gate. It contains **no row identifiers, no names, no e-mail addresses, no free text from any row, and no minor PII** — aggregate counts and schema-level facts only. It **does not propose ownership values** for any row, does not choose between global/shared and school-owned semantics, does not define a repair algorithm, and contains no SQL.

---

## 1. Authorization chronology

1. **2026-08-27** — `W-PC-06` is created by the approved B2b/B2c governance correction (normalization report §12) as `BLOCKED` / `UNAUTHORIZED`, `authorization_owner` Brent, `dueno` empty by the PRODUCTION_CHECK mode exception, with the explicit rule that documenting the check authorizes nothing.
2. **2026-08-28** — Brent, the `authorization_owner`, **explicitly authorized the read-only execution** of the classification check and **personally executed queries 1–4 in the production Supabase SQL Editor**.
3. **2026-08-28, later the same day, before query 5** — **Codex made one read-only Supabase Management API *metadata* call, `supabase projects list --output json`, to confirm the already-existing project link and project status.** It queried **no database rows**, returned **no row contents or PII**, created **no link or credential**, changed **no configuration**, and mutated **no state**. It is a management-plane metadata read — **not one of the five database queries, and not a sixth one**.
4. **2026-08-28, immediately after** — **query 5 was executed by Codex through the already-linked CLI (`supabase db query --linked`), only after a further, separate, explicit read-only authorization from Brent.** That CLI command also operates through the Supabase Management API: query 5 was the **sole explicitly authorized Management API database-query call**, and it submitted **one bounded read-only SELECT**. No new production link, credential, or tool was created for it.
5. The complete production access for this check was therefore: **five production database queries** — Brent ran queries 1–4 in the SQL Editor; Codex ran query 5 as above — plus **the one management-plane metadata read** before query 5. **Neither Management API call created or changed any link, credential, project configuration, data, schema, grant, policy, RLS setting, function, migration ledger, deployment, or other state**, and **no row contents, identifiers, names, e-mail addresses, free text, or minor PII were returned** by any of it. *(Chronology completed on independent review — P3 note, 2026-08-28: the metadata read before query 5 is now recorded and an overbroad "no other access" sentence is replaced by this exact accounting; nothing else changed.)*

`execution_owner` is therefore recorded as **"Brent + Codex"**, distinct from `authorization_owner` **Brent** — the two fields answer different questions and are never conflated.

## 2. The five queries — purpose and executor

No SQL is reproduced here; each query was read-only and returned aggregates and schema facts only. *(This inventory was corrected on independent review, 2026-08-28: the first draft of this record misdescribed the sequence — it omitted the catalog query, promoted the creator analysis, and split query 5 in two. The sequence below is the actual production sequence. There was no sixth query.)*

1. **Catalog, schema and security metadata** (Brent, production SQL Editor) — confirm the exact target surface and its security posture: the 2 target tables and 6 target functions, the tables' column inventory and their five foreign keys, table ownership, RLS state, policy count, table privileges per role, function ownership/EXECUTE surface, and each function's configured `search_path`.
2. **Path scope aggregates** (Brent, production SQL Editor) — how many `learning_paths` rows exist; how many have `school_id` NULL and `generation_id` NULL; whether an effective school can be resolved for any of them; how many carry `created_by` and how many do not.
3. **Course integrity and inherited scope** (Brent, production SQL Editor) — how many `learning_path_courses` rows exist; how many are orphaned from their path or course; what scope they inherit from their parent path.
4. **Creator active-role candidates** (Brent, production SQL Editor) — for the creators found by query 2, whether each creator's school can be safely derived from their active roles, distinguishing scoped from unscoped active roles, and whether that yields authoritative ownership for every path.
5. **Combined assignment resolution and per-path dispersion — one query** (Codex, already-linked CLI via the Supabase Management API) — how many assignments exist and how many are direct-user versus group; for how many a school candidate set of size zero, exactly one, or more than one can be resolved; for each path with assignments, whether its assigned users fall inside a single candidate school or span several; and how many paths have no assignments at all.

## 3. Aggregate results, by query

**Query 1 — catalog, schema and security metadata:**

- Exactly **2 target tables** (`learning_paths`, `learning_path_courses`) and **6 target functions** confirmed; the two tables' **column inventory** and their **five foreign keys** enumerated.
- Both tables are **owned by `postgres`**, with **RLS disabled and not forced** and **zero policies**.
- **`anon` and `authenticated` hold SELECT/INSERT/UPDATE/DELETE** on the tables; **`service_role` retains those operations**; **`PUBLIC` has no table SELECT**.
- All **six functions are `postgres`-owned SECURITY DEFINER** and **executable by `PUBLIC`, `anon`, `authenticated` and `service_role`**.
- Configured `search_path`: `auth_is_learning_path_member` and `batch_assign_learning_path` = `public`; `start_learning_path_session` and `end_learning_path_session` = `public, pg_temp`; `create_full_learning_path` and `update_full_learning_path` have **no configured `search_path`**.

**Query 2 — path scope aggregates:**

- **7** `learning_paths` rows; **all 7** with `school_id` NULL **and** `generation_id` NULL; **zero** with a resolvable effective school; `created_by` **present in 6 and absent in 1**.

**Query 3 — course integrity and inherited scope:**

- **22** `learning_path_courses` rows; **zero** orphaned from path or course; **all 22** inherit unresolved parent scope.

**Query 4 — creator active-role candidates:**

- **6 creators with active roles**; **each has exactly one scoped school candidate but also an unscoped active role**; **1 path has no creator**. **Ownership therefore is not authoritative for every path.**

**Query 5 — combined assignment resolution and per-path dispersion (one query):**

- **883 assignments**, **all direct-user and zero group**; **86** yield **zero** school candidates, **793** exactly **one**, **4 multiple**; **6 paths have assignments and all six span multiple candidate schools**; **1 path is unassigned**.

## 4. Read-only and PII confirmation

- Every database query was **read-only**, and the single management-plane metadata call read **only project-level metadata**; nothing in production was created, updated, deleted, granted, revoked, or altered.
- Only **aggregate counts and schema-level metadata** were returned. **No row contents, identifiers, names, e-mail addresses, free text, or minor PII** were returned, displayed, copied, or recorded — not in the evidence, not in the ledgers, not in this document.
- The evidence above is the complete data payload of the check; there is no fuller row-level artifact anywhere.

## 5. Repository and application findings (no production access)

Verified against the committed repository only, and structurally consistent with the aggregates:

- `learning_paths` declares `school_id` (integer) and `generation_id` (uuid) as **nullable** columns in the committed baseline (`supabase/migrations/00000000000000_baseline.sql`, table definition at the `CREATE TABLE "public"."learning_paths"` block), and `created_by` is likewise nullable.
- The creation RPC **`create_full_learning_path(p_name, p_description, p_course_ids, p_created_by)`** accepts **no school and no generation parameter** at all.
- Its only application caller, `lib/services/learningPathsService.ts`, **never writes `school_id` or `generation_id`** — the application has no code path that stamps tenant scope onto a learning path. The 100 % NULL scope observed in production is therefore structural, not incidental.
- Assignment writes flow through `batch_assign_learning_path(p_path_id, p_user_ids, p_group_ids, p_assigned_by)`, which supports both direct-user and group assignment; production data shows only the direct-user form was ever used (883 / 0).
- The absent RLS on `learning_paths` / `learning_path_courses` and the six SECURITY DEFINER functions are already governed by `W-B2c-01` (lote B2c) and are **out of scope** here; nothing in this check changes them. The query-1 production catalog result (RLS disabled, zero policies, `anon`/`authenticated` table DML, the six functions executable by exposed roles) **confirms in production** what the committed baseline already showed.

## 6. Classification

**B — DATA TRANSFORMATION REQUIRED.**

Definition used, as fixed when the check was created (protocol §3, §9): **A** — no existing rows require transformation; the B2c boundary could later be classified class 2 on its own. **B** — existing rows require a governed transformation before the boundary can be activated safely; a separate class-3 work item must precede B2c.

The evidence compels **B**: all 7 paths carry NULL scope with no resolvable effective school; creator roles do not yield authoritative ownership (every creator also holds an unscoped active role); 86 assignments resolve no school candidate and 4 resolve several; and every assigned path spans multiple candidate schools. A school-isolation boundary (B2c) enforced over these rows as-is would have no safe, derivable tenant to isolate by — so a **class-3 data repair of existing rows must come first**. The "no transformation → class 2 directly" branch recorded in the original dependency chain is **refuted by the evidence**, not skipped.

**Consequences recorded in the ledgers (not authorized here):** the repair is `W-B2d-01` (lote B2d, rama `data/lp-scope`, class 3, `BLOCKED` / `UNAUTHORIZED`), which must be **separately authorized, implemented, independently reviewed, merged, and safely executed before B2c is scheduled**; `W-B2c-01` remains `BLOCKED` with `clase_migracion` `BLOCKED` and must not absorb class-3 work. This document deliberately **does not** select schools, propose ownership values, choose global/shared versus school-owned semantics (that decision is Brent's and remains open), define any algorithm, or contain any SQL.

## 7. What this record does not authorize

Closing W-PC-06 authorizes nothing else: `W-PC-01`…`W-PC-05` remain `BLOCKED` / `UNAUTHORIZED`; `W-B2d-01` and `W-B2c-01` remain unauthorized and unimplemented; no further production query, of any kind, is authorized by this record.

— Recorded 2026-08-28. Authorization: Brent. Execution: Brent (queries 1–4, production SQL Editor) + Codex (query 5, already-linked CLI — one bounded read-only SELECT via the sole explicitly authorized Management API database-query call — under Brent's later explicit read-only authorization). Query inventory and Management API wording corrected on independent review the same day, and the P3 note added the pre-query-5 management-plane metadata read (`supabase projects list --output json`) to the chronology; the underlying facts, aggregates and classification are unchanged.

---

## 8. Superseding owner-semantics decision (2026-08-29)

**Everything above (§§1–7) is preserved unchanged as the historical record**: the authorization chronology, the five production queries and the one management-plane metadata read, the aggregate results, and the classification **B — DATA TRANSFORMATION REQUIRED** as reached on 2026-08-28. The queries were correctly executed and correctly reported; classification B was genuinely reached on its date and this section does not pretend otherwise.

What is superseded is the **interpretation of the aggregates, by explicit product-owner decision (Brent, 2026-08-29)**:

- `learning_paths` rows are **global FNE templates**. **No school owns a learning path**, and **learning paths are not generation-specific**.
- `school_id` and `generation_id` being NULL on the existing rows is **intentional global scope — not missing or corrupt ownership data**.
- A path may be assigned through the assignment matrix to users or groups in any school; assignment affects availability and use, and does **not** make the path school- or generation-owned.
- Management of learning paths (create, edit, delete, assign, unassign) belongs to **only the literal RBAC role `admin`**; an assigned user consumes the path and updates only their own permitted progress.

**Why the earlier inference was incorrect:** §6 classified B on the premise that every path needed a derivable owning school — that NULL scope, non-authoritative creator roles, and multi-school assignment dispersion were evidence of *broken* rows blocking a school-isolation boundary. Under the owner's semantics that premise is false: the same aggregates describe **healthy global templates** whose assignments are *supposed* to span schools. There is no tenant to derive because there is no per-school tenancy on templates.

**Effective conclusion — classification A: no existing learning-path ownership data transformation is required.** Consequences (recorded, not authorized, here): `W-B2d-01` is **`SUPERSEDED`** — retired unexecuted (no backfill was ever designed, authorized, executed, or represented as completed) and **no longer a prerequisite of B2c**; `W-B2c-01` is reclassified **class 2** (security/RLS correction over global templates and assignment-based consumption) and stays **`BLOCKED`**, unauthorized for implementation, behind three prerequisites: the independent approval and merge of this governance correction, Privacy approval of the actor-by-operation access matrix, and Brent's separate explicit implementation authorization. Full record, access model, corrected surface inventory, and future acceptance criteria: `docs/reviews/w-b2c-01-learning-path-governance-correction-2026-08-29.md`.

— Superseding section recorded 2026-08-29 under Brent's owner decisions of that date. It changes no aggregates, no chronology, and no historical classification text above; it authorizes no implementation and no production access.
