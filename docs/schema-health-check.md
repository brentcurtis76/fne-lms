# FNE LMS — Schema Health Check Plan & Tracker

- Owner: Brent Curtis
- Start Date: 2025-09-04
- Status: In Progress
- Source of Truth: Database‑first (Supabase migrations)
- Environments: Prod `sxlogxqzmarhqsblxmtj`; Staging (from prod backup) — pending

## Trackers (Keep Updated)
- Drift Report: `docs/schema-drift-report.md`
- RLS Test Checklist: `docs/rls-test-checklist.md`
- Roles & Process: `docs/PROJECT_ROLES_AND_PROCESS.md`
- Prompting Guide (Claude): `docs/claude-prompting-guide.md`

---

## Status Update — 2025-09-04
- Security: PROD locked down for 6 tables (user_roles + 5 others). Guests blocked; service role intact. See `docs/RLS-SECURITY-STATUS.md`.
- CI: Guest‑grants check added; type‑drift guard workflow added (secrets required to run).
- Types: Open PR with typed, read‑only routes (`-typed.ts`) using `types/database.generated.ts` (inactive endpoints for review).
- Threads: Decision made to use `message_threads` (see `docs/threads-drift-decision.md`).
- RLS Matrix: Read‑only role checks captured; summary under `docs/rls-results/`.

### Next Up (Queued)
- Merge typed routes gradually after review; monitor type‑drift CI.
- Apply threads change (tests first, then code) with a quick rollback note.
- Tighten RLS for temporarily contained tables (scope by school/network) via STAGING → verify → PROD.

## Tooling (MCP-Enabled)
- Posture: Use MCP tools read-only against prod; use staging for any writes.
- Inventory:
  - Supabase CLI (typegen, dumps) — scripts under `scripts/mcp/`
  - Postgres Exec (via Supabase/psql) — use `sql/` probes
  - BrowserTools (manual staging verification)
  - Playwright (automate RLS/login smoke tests)
  - Optional: Schema Diff (migra/psqldef) later
- Access: Store per-environment creds securely; prefer short-lived tokens for staging.
- Logging: Save MCP session logs to `logs/mcp/<YYYYMMDD>/` for auditability when running diagnostics.
- CI hooks: Run typegen and drift diff via MCP-capable tasks in CI; fail on unexpected drift.

## Non‑Negotiables
- Safety: read‑only first, no destructive changes, zero data loss.
- Isolation: validate all changes in staging cloned from prod.
- Rollout: expand/contract migrations; roll forward by default.
- Guardrails: backups + restore test, CI drift checks, schema freeze during stabilization.

## Decision Log
- 2025-09-04: Keep `schools.id` as INTEGER everywhere.
- 2025-09-04: Database‑first; generate TS types from live DB.
- 2025-09-04: No prod migration consolidation; optional dev baseline later.
- 2025-09-04: Canonical types will be `types/database.generated.ts`, sunset `types/supabase.ts` by 2025-09-25.

---

## Phase 0 — Today: Safety Net & Freeze
- [ ] Backup: Create fresh prod backup; record timestamp and size.
- [ ] Staging: Create new project from that backup; name `fne-lms-staging`.
- [ ] Keys: Store staging `anon` and `service_role` in secret manager.
- [ ] Freeze: Announce schema‑change freeze until Phase 2 completes.
- [ ] Access: Configure separate env vars for staging to prevent prod writes.
 - [ ] MCP Setup: Verify MCP Postgres/Supabase connections for both prod (read-only) and staging.

Acceptance: Staging reachable; RLS and extensions present; no prod traffic pointed to staging.

---

## Phase 1 — Read‑Only Discovery (Day 1–2)
- [ ] Schema snapshot: Dump schema‑only for `public` and `auth` (from staging).
- [ ] Types: Generate TS types from prod into `types/database.generated.ts`.
- [ ] Drift report: Compare generated types vs current app types; log mismatches.
- [ ] Inventory: Catalog migrations, functions, triggers, policies, indexes.
- [ ] CI plan: Choose where to store schema snapshot and add drift diff in CI.
- [ ] MCP Usage: Run all SQL via MCP Postgres with read-only creds; capture logs to `logs/mcp/`.
  - Scripts: `scripts/mcp/schema_snapshot.sh`, `scripts/mcp/typegen.sh`

Acceptance: Written drift report with prioritized issues (P0/P1/P2).

---

## Phase 2 — Non‑Disruptive Fixes (Week 2)
- [ ] Add `types/database.generated.ts` alongside existing types.
- [ ] Adopt generated types module‑by‑module (start with read paths).
- [ ] Update TS usages to reflect `schools.id` as number (INTEGER).
- [ ] RLS validation tests (staging): minimal allow/deny matrix for core tables.
- [ ] CI checks: regenerate types and fail on unexpected drift.
- [ ] MCP Usage: Use MCP tasks to regenerate types and to execute RLS probe queries in staging.
  - Scripts/SQL: `scripts/mcp/typegen.sh`, `sql/rls_probes.sql`

Acceptance: Types adopted in at least 2 core modules; RLS tests green in staging.

---

## Phase 3 — Critical Fixes via Expand/Contract
- [ ] ID type consistency: Confirm no UUID assumptions remain in code paths.
- [ ] `user_roles` hardening: Verify PK/FK, unique constraints, indexes; align RLS.
- [ ] Auth remediation plan: Define safe, tested path to fix `instance_id` issues.
- [ ] Zero‑downtime patterns ready for any required schema changes.
 - [ ] MCP Usage: Dry-run migrations and backfills against a disposable staging clone via MCP; export diffs for review.

Acceptance: Change plan validated in staging with monitoring plan.

---

## Phase 4 — RLS & Security Hardening
- [ ] Default‑deny posture verified on sensitive tables.
- [ ] Separate read/write policies; symmetric `USING`/`WITH CHECK`.
- [ ] Tenant isolation: ensure tenant key appears in RLS filters and unique indexes.
- [ ] Minimize `SECURITY DEFINER`; pin `search_path` where needed.
 - [ ] MCP Usage: Execute allow/deny matrix using MCP Postgres with role-scoped JWTs; archive results.

Acceptance: RLS matrix passes; no leaks across roles/tenants.

---

## Phase 5 — Performance & Index Sanity
- [ ] Index FK columns and RLS filter columns (concurrently).
- [ ] Check obvious missing/unused indexes; avoid locking changes in prod.
 - [ ] MCP Usage: Capture `EXPLAIN (ANALYZE, BUFFERS)` for hot queries in staging via MCP; verify index usage.

Acceptance: Key queries show expected index usage; no lock incidents.

---

## Critical Path P0s
### `user_roles` Type Safety
- Symptom: Table exists; no TS types; role checks are untyped.
- Fix: Adopt generated types; validate RLS policies that depend on structure.
- Status: Pending type generation.

### `schools.id` Consistency
- Decision: INTEGER is canonical.
- Fix: Update TS interfaces/usages; no DB change.
- Status: Pending type adoption.

---

## Guardrails & Hygiene
- Drift checks: Apply migrations to a clean DB in CI; diff against canonical snapshot; fail on diff.
- Typegen: Regenerate types in CI and compare to committed snapshot.
- Release checklist:
  - Pre‑deploy backfills, concurrent index builds.
  - Feature flags for read cutovers.
  - Roll‑forward plan and backout notes.

---

## Conventions
- IDs: INTEGER for `schools.id`; `{table}_id` for FKs; `id` as PK.
- Timestamps: `timestamptz`, default `now()`.
- Soft deletes: `deleted_at` + partial indexes.
- Multi‑tenant: include tenant key in unique indexes; scope RLS by tenant.

---

## Risk Register
- Data loss: mitigated by backups, staging validation, expand/contract.
- Auth lockouts: mitigated by staged fixes and RLS tests.
- Drift reintroduction: mitigated by CI drift checks and typegen.

---

## Links & Artifacts
- Prod project: https://sxlogxqzmarhqsblxmtj.supabase.co
- Staging project: <URL when created>
- Schema snapshot: `schema_snapshot_YYYYMMDD.sql`
- Generated types: `types/database.generated.ts`
- Roles & Process: `docs/PROJECT_ROLES_AND_PROCESS.md`
- Prompting Guide: `docs/claude-prompting-guide.md`
- Drift report: `docs/schema-drift-report.md`
- RLS test checklist: `docs/rls-test-checklist.md`

---

## Appendix: Resolved Issues

### Santa Marta Auth Issue — RESOLVED
**Resolved on 2025-01-04 by Brent Curtis**
**Verification: 0 mismatches**

#### Original Issue
- Symptom: ~59 users with `auth.users.instance_id` mismatches causing authentication loops
- Root Cause: Orphaned instance_id references after instance cleanup/migration
- Impact: Santa Marta school users unable to login

#### Resolution
- Fix Applied: Set instance_id to NULL for affected users
- Verification Query:
```sql
SELECT COUNT(*) as mismatch_count
FROM auth.users u
WHERE u.instance_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM auth.instances i 
    WHERE i.id = u.instance_id
);
```
- Result: 0 mismatches in both STAGING and PRODUCTION
- Verification Log: `logs/mcp/20250104/santa-marta/verification.log`

#### Original Triage Runbook (Preserved for Reference)
Goals: Identify mismatched `instance_id`, validate identities, check profile linkage, confirm RLS posture.

Read‑only queries to run in staging:

```sql
-- Distinct instance IDs and counts
select distinct instance_id, count(*)
from auth.users
group by 1
order by 2 desc;

-- Expected instance (Supabase usually has a single row)
select id from auth.instances limit 1;

-- Users with mismatched instance_id
select id, email, instance_id
from auth.users
where instance_id <> (select id from auth.instances limit 1);

-- Confirm identities exist for affected users
select i.user_id, i.provider
from auth.identities i
where i.user_id in (
  select id from auth.users
  where instance_id <> (select id from auth.instances limit 1)
);

-- Profiles linked to auth.users
select u.id as user_id, u.email
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;

-- Current policies on key tables
select schemaname, tablename, policyname, using, with_check
from pg_policies
where schemaname='public' and tablename in ('profiles','user_roles');
```
## Status Update — 2025-09-05
- Security (PROD): Tightened RLS on `activity_feed`.
  - Enabled + forced RLS; removed broad SELECT policy ("Users can view public activities").
  - Added `workspace_members_can_read_activity` (current PROD predicate: author OR admin/consultor/equipo_directivo via `user_roles`; workspace membership to be added when `community_members` exists in PROD).
  - Verification (PROD): anon blocked (401), service role full access (Content-Range `*/3`).
  - Logs: `logs/mcp/20250905/prod-rls-activity-feed/apply.log`, `logs/mcp/20250905/prod-rls-activity-feed/verify.log`, `logs/mcp/20250905/prod-rls-activity-feed/verification-summary.json`.
  - Follow‑ups: When `community_members` is deployed to PROD, extend the SELECT policy to include workspace membership predicate (already drafted in migration), then re‑verify allow/deny matrix.

- Security (STAGING → PROD candidate): Tightened RLS on `courses` (STAGING and PROD).
  - Policy: `enrolled_or_owner_can_read_courses` + `service_role_bypass_courses`; helper `public.is_admin_or_consultor(uuid)` to avoid leaking `user_roles`.
  - Verification (PROD): anon 401; service role Content-Range present.
  - Next: Review and prune any legacy broad courses policies in PROD (keep only the two above).

- Security (STAGING ready): Finance tables (`clientes`, `contratos`, `cuotas`) RLS hardening prepared.
  - Migration: `database/migrations/20250905_tighten_finance_rls.sql` (admin/consultor only; service-role bypass).
  - Verifier: `scripts/verify-finance-rls.js`.
  - Runbook (STAGING): `logs/mcp/20250905/finance-rls/execute-staging-commands.sh` (rollback included).

## PROD Finalization — 2025-09-05
- Courses (PROD):
  - Policies cleaned to only:
    - `enrolled_or_owner_can_read_courses` (SELECT)
    - `service_role_bypass_courses` (ALL)
  - Anon check: 401; Service role: Content-Range present.
- Threads (PROD):
  - Compatibility view applied: `public.community_threads` → `public.message_threads` (1:1 SELECT view)
  - Count check: community_threads = message_threads = 3.
- Finance (PROD):
  - Scoped read policies applied for `clientes`, `contratos`, `cuotas` using `is_admin_or_consultor(auth.uid())` + service-role bypass.
  - Anon checks: 401; Service role counts (Content-Range): clientes */14, contratos */17, cuotas */93.
- Activity Feed (PROD):
  - Tightened SELECT (`workspace_members_can_read_activity`); broad "Users can view public activities" removed. Anon 401; service role OK.
- Follow-ups:
  - Rotate JWT secret (regenerates anon/service keys) and update envs (scheduled later).
  - Enable type-drift CI (requires SUPABASE_PROJECT_ID secret); add typegen check.
  - Extend `activity_feed` predicate with workspace membership when `community_members` lands in PROD; re‑verify.

## 2025-09-05 — PROD Finalization
- **Courses**: Policy set cleaned; dropped legacy policies; kept only `enrolled_or_owner_can_read_courses` and `service_role_bypass_courses`
  - Logs: `logs/mcp/20250905/prod-finalization/courses-policies.txt`, `logs/mcp/20250905/prod-finalization/courses-final-policies.txt`
- **Threads**: Compatibility view `community_threads` → `message_threads` applied for backward compatibility
  - Logs: `logs/mcp/20250905/prod-finalization/threads-apply.log`, `logs/mcp/20250905/prod-finalization/threads-verify.log`
- **Security Checks**: Anonymous access blocked for `user_roles`, `courses`, `activity_feed`
  - Logs: `logs/mcp/20250905/prod-finalization/check-*-anon.log`
- **Next Steps**: 
  - Enable CI type-drift job (requires SUPABASE_PROJECT_ID secret)
  - Monitor for any legacy `community_threads` references in app code
  - Finance tables RLS ready for STAGING → PROD promotion
