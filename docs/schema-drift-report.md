# Schema Drift Report

- Report Date: 2025-09-04
- Compared Environments: prod (initial baseline)
- Schema Snapshot: `schema_snapshot_20250904.sql` (pending staging creation)
- Typegen Source: `types/database.generated.ts` (8,041 lines)
- Generated Via: Supabase typegen at 2025-09-04 10:28
- Owner: Brent Curtis

## Severity Legend
- P0: Production impact or data integrity risk
- P1: Likely to cause bugs or security gaps
- P2: Low risk or cosmetic inconsistency

## Findings

### 1) Missing/Outdated Types in App
- [x] `user_roles` — CONFIRMED missing in types/supabase.ts, present in database.generated.ts. Severity: P1. Status: Confirmed.
- [x] `generations` — CONFIRMED missing in types/supabase.ts, present in database.generated.ts. Severity: P0. Status: Confirmed.
- [ ] `networks` — Not found in generated types (may not exist). Severity: P1. Status: Investigating.
- [x] `redes_de_colegios` — CONFIRMED present in database.generated.ts, missing in app. Severity: P1. Status: Confirmed.
- [x] `group_members` — NOT FOUND in database. Group tables use `group_assignment_members` instead. Severity: P2. Status: Resolved.
- [x] `communities` — NOT FOUND in database. May be conceptual or removed. Severity: P2. Status: Resolved.

### 2) ID Types / Column Type Mismatches
- [x] `schools.id` — CONFIRMED INTEGER in both database.generated.ts and supabase.ts. Code consistency needs verification. Severity: P0. Status: Confirmed.
- [x] `generations.school_id` — Type is INTEGER in database.generated.ts (migration 007 applied). Severity: P0. Status: Confirmed.
- [ ] Mixed FK types referencing `user_roles` — verify all FKs match PK type. Severity: P1. Status: Open.

### 3) Nullability / Defaults
- [ ] List columns where code assumes NOT NULL but DB allows NULL (or vice versa). Severity: P1. Status: Open.
- [ ] Check default values aligned with code expectations (timestamps, enums). Severity: P2. Status: Open.

### 4) Constraints / Indexes
- [ ] Missing PK/FK/unique/check constraints vs code assumptions. Severity: P1. Status: Open.
- [ ] Indexes on FK columns and common filters (esp. RLS filters). Severity: P1. Status: Open.

### 5) Views / Functions / Triggers
- [ ] Drift in view definitions vs usage. Severity: P2. Status: Open.
- [ ] `SECURITY DEFINER` functions: verify `search_path`, least privilege. Severity: P1. Status: Open.
- [ ] Triggers required for dual-write/expand-contract present and correct. Severity: P1. Status: Open.

### 6) RLS Policies
- [ ] Default deny posture on sensitive tables. Severity: P0. Status: Open.
- [ ] Symmetric `USING` / `WITH CHECK`. Severity: P1. Status: Open.
- [ ] Tenant isolation enforced (and included in unique indexes). Severity: P0. Status: Open.

## Decisions
- Source of Truth: Database-first (Supabase migrations) — confirmed.
- `schools.id`: INTEGER canonical — confirmed.
- Type Generation: Use Supabase typegen; adopt incrementally — confirmed.

## Status Tracker
- Item: <short title> — Severity: P0/P1/P2 — Owner: <name> — Status: Open → Validated → Fixed (staging) → Verified (prod) — Notes: <link to PR/migration>

## Next Actions
- Top 3 P0s to address next:
  1. Create staging environment from production backup to enable safe testing
  2. Fix `generations` table missing from types (blocking generation features)
  3. ~~Investigate Santa Marta auth issues~~ — RESOLVED

## Resolved Issues
- Santa Marta login: verified fixed on 2025-01-04; zero mismatches (verification: logs/mcp/20250104/santa-marta/verification.log)
