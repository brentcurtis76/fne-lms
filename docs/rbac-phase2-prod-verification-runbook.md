# RBAC Phase 2 — Production Verification Runbook (Read‑Only)

Purpose
- Verify baseline permissions and the effective-permissions RPC in PRODUCTION without manual UI.
- Ensure no test overlays are active and feature‑flagged surfaces remain disabled.

Preconditions
- Phase 2 migrations applied in PRODUCTION:
  - `003_role_permission_baseline.sql`
  - `004_extend_effective_permissions.sql`
  - `005_seed_role_permission_baseline.sql`
- You have a superadmin account and a way to obtain a Bearer token (only needed for optional API checks).

Flags (verify in Vercel)
- `FEATURE_SUPERADMIN_RBAC=false`
- `RBAC_DEV_MOCK=false`

SQL Checks (Supabase SQL Editor — read‑only)
1) Baseline present and sized
- `SELECT count(*) AS baseline_count FROM role_permission_baseline;`  (expect ≈ 72 from seed)
- `SELECT role_type, permission_key, granted FROM role_permission_baseline ORDER BY role_type, permission_key LIMIT 20;`

2) RPC returns baseline (no overlays)
- `SELECT * FROM get_effective_permissions('admin', NULL) ORDER BY permission_key;`
- `SELECT * FROM get_effective_permissions('docente', NULL) ORDER BY permission_key;`
- Expect rows with `source = 'baseline'` and values consistent with baseline.

3) Overlays/test‑mode are OFF in prod
- `SELECT count(*) AS active_test_overlays FROM role_permissions WHERE is_test = true AND active = true;`  (expect 0)
- `SELECT count(*) AS enabled_test_modes FROM test_mode_state WHERE enabled = true;`  (expect 0)

4) Events policy sanity
- `SELECT polname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='events';`
- Confirm policy "Authorized roles can manage events" uses `auth_is_superadmin()` OR `user_roles.role_type IN ('admin','community_manager')` in both `qual` and `with_check`.

5) Superadmin helper(s) exist
- `SELECT proname, oidvectortypes(proargtypes) FROM pg_proc WHERE proname='auth_is_superadmin';`
- Expect a no‑arg wrapper and/or a param version; wrapper should be SECURITY DEFINER.

Optional API Checks (short window; revert immediately)
- Temporarily set `FEATURE_SUPERADMIN_RBAC=true` (server‑side only) and redeploy. Run for ≤3 minutes.
- Superadmin check:
  - `curl -s -H "Authorization: Bearer $TOKEN" https://<PROD_HOST>/api/admin/auth/is-superadmin`
  - Expect `{ "is_superadmin": true }` for your account.
- Permissions matrix (read‑only):
  - `curl -s -H "Authorization: Bearer $TOKEN" https://<PROD_HOST>/api/admin/roles/permissions`
  - Expect `is_mock:false`, `test_mode:false`, and a matrix reflecting baseline.
- Immediately set `FEATURE_SUPERADMIN_RBAC=false` and redeploy again.

Evidence (save outputs)
- `logs/mcp/YYYYMMDD/sql-phase2-prod.txt` — paste SQL results (counts, samples, policy rows)
- `logs/mcp/YYYYMMDD/api-phase2-prod.json` — API responses, if API window used

Safety / Containment
- Do NOT create overlays in PRODUCTION (Phase 1 writes are only for approved windows).
- If anything looks off:
  - Set `FEATURE_SUPERADMIN_RBAC=false` and redeploy to re‑hide surfaces.
  - Baseline table and RPC are read‑only; no destructive rollback required.

Notes
- Baseline is the source of truth for default permissions; overlays (if ever enabled) override baseline temporarily.
- All permission‑change write paths remain behind feature flags and RLS, and are disabled in PRODUCTION by default.
