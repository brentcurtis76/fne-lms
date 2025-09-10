RBAC Phase 2 — Enable/Disable Runbook (Server + UI)

Purpose
- Safely enable or disable the RBAC Phase 2 feature in Production (and Staging), and verify behavior quickly.

Feature Flags
- `FEATURE_SUPERADMIN_RBAC` (server-only): gates API routes
- `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC` (client): gates UI at `/admin/role-management`

Endpoints (server flag must be ON)
- `GET /api/admin/auth/is-superadmin` (Bearer token)
- `GET /api/admin/roles/permissions` (Bearer token; returns `is_mock:false` when real DB is used)

Prereqs
- A superadmin user in the target environment (e.g., `brent@perrotuertocm.cl`).
- A valid session token (obtain via browser console on the environment domain):
  - `(await window.supabase.auth.getSession()).data.session?.access_token`
  - Do not print tokens in logs or PRs.

Read‑Only Check (Recommended)
1) Turn ON server flag only; keep UI flag OFF
   - Set `FEATURE_SUPERADMIN_RBAC=true` (leave `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false`)
   - Redeploy the environment
2) Run verification (from repo root)
   - `BASE=https://<prod-host> TOKEN=<PROD_TOKEN> bash scripts/verify-rbac-prod.sh`
   - Logs saved to `logs/mcp/YYYYMMDD/prod-finalization/test-results.log`
3) Turn server flag OFF and redeploy
4) Confirm 404 on both endpoints (script prints status codes)

Full Enable (UI + API)
1) Turn ON both flags and redeploy
   - `FEATURE_SUPERADMIN_RBAC=true`
   - `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true`
2) Log in as superadmin and visit `/admin/role-management`
3) Optional: Perform one overlay toggle (creates temporary test overlay) and click “Limpiar cambios de prueba” to clean up

Quick Interpretations
- `is-superadmin` = 200 + `is_superadmin:true` → token is valid and user is superadmin
- `roles/permissions` = 200 + `is_mock:false` → real DB data (matrix available)
- 404 on either endpoint → server flag is OFF (expected when disabled)

Safety Notes
- Overlay writes are test‑mode rows with TTL and manual cleanup; baseline is read‑only.
- Keep windows short for production read‑only checks; restore server flag to OFF when finished.

Related Files
- `scripts/verify-rbac-prod.sh` — reusable verify script
- `pages/api/admin/roles/permissions.ts` — matrix endpoint
- `pages/api/admin/roles/permissions/overlay.ts` — overlay endpoint (test‑mode)
- `pages/api/admin/test-runs/cleanup.ts` — cleanup endpoint

