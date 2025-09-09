# MCP Tooling Inventory & Usage

- Owner: <name>
- Last Updated: <YYYY-MM-DD>

## Posture
- Prod: read-only only via MCP tools.
- Staging: full testing (reads/writes); create from prod backup.
- Logging: Save session outputs under `logs/mcp/<YYYYMMDD>/` when running diagnostics.

## Config (env-driven)
- `SUPABASE_PROJECT_ID` (prod): sxlogxqzmarhqsblxmtj
- `SUPABASE_DB_URL_PROD_RO`: read-only Postgres URL for prod (dashboard-generated)
- `SUPABASE_DB_URL_STAGING`: Postgres URL for staging
- `SUPABASE_ANON_KEY_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`
- `POSTGREST_URL_STAGING` (optional): if using REST probes

Store these in your secret manager and export locally only when needed.

## Tools (current)
- Supabase (CLI): typegen, dumps, auth/logs.
- BrowserTools: manual staging verification.
- Playwright: automate RLS and login smoke tests.

## Tools (recommended additions)
- Postgres Exec: direct SQL and EXPLAIN (via Supabase SQL or local psql).
- Schema Diff: db-to-snapshot diffs (e.g., migra/psqldef) — optional; start with file diffs.
- JWT Builder: short-lived role/tenant JWTs for RLS tests.

## Standard Tasks (scripts)
- Typegen: `scripts/mcp/typegen.sh` → outputs `types/database.generated.ts`
- Schema snapshot: `scripts/mcp/schema_snapshot.sh` → outputs `schema_snapshot_YYYYMMDD.sql`
- Drift check: `scripts/mcp/drift_check.sh` → diffs snapshot vs committed canonical
- RLS probes: `sql/rls_probes.sql` → read-only checks to run in staging

## Safety Checklist per Session
- Confirm environment (prod vs staging) before running any command.
- Use read-only creds for prod.
- Archive outputs to `logs/mcp/<date>/` for audit trail.

