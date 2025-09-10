Session Handoff (RBAC Phase 0-2)

Use this short checklist when picking up work. Update anything that changed and paste this file/link in chat to restore context.

Overview
- Scope: Superadmin capability + permissions matrix (baseline + test overlays), feature-flagged
- Current Phase: 2 complete (DB + RPC + API/UI); deployed to PROD behind flags

Repo & Branches
- Active branch: rbac-phase2-baseline
- PR: https://github.com/brentcurtis76/fne-lms/pull/1

Environments
- Staging app URL: https://fne-lms-working.vercel.app
- Production app URL: https://fne-lms.vercel.app

Feature Flags
- STAGING: FEATURE_SUPERADMIN_RBAC=true, NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true, RBAC_DEV_MOCK=false
- PROD (default state): FEATURE_SUPERADMIN_RBAC=false, NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false, RBAC_DEV_MOCK=false
- To fully enable in PROD (UI + API): set both true and redeploy Production

Superadmin Accounts
- STAGING superadmin (active): email carlcurtispp1976@gmail.com, user_id c30a8484-8709-412a-8840-90e5fe94e7c8
- PROD superadmin (active): email brent@perrotuertocm.cl, user_id 4ae17b21-8977-425c-b05a-ca7cdb8b9df5

Database Status
- Applied in STAGING and PROD: 001b, 001c, 003, 004, 004b, 005
- Verified in PROD: baseline present; 004b RPC returns baseline; overlays/test_mode counts = 0

API/UI (behind flags)
- Matrix API: GET /api/admin/roles/permissions (returns is_mock=false with real data)
- Overlay API: POST /api/admin/roles/permissions/overlay (test-mode only; accepts Bearer token)
- Cleanup API: POST /api/admin/test-runs/cleanup (accepts Bearer token)
- Superadmin check: GET /api/admin/auth/is-superadmin
- Matrix page: /admin/role-management (requires client flag ON and redeploy)

Evidence & Runbooks
- Latest logs: logs/mcp/20250109/
- Prod enable/disable runbook: docs/rbac-phase2-enable-runbook.md
- Quick verify script (read-only): scripts/verify-rbac-prod.sh

What’s Done
- Phase 0–2 DB changes live (STAGING + PROD)
- RPC ambiguity fixed (004b) in STAGING + PROD
- API hardened: overlay + cleanup accept Bearer token, RLS-bound writes/cleanup
- Matrix API derives roles/permissions from baseline when catalogs absent (no mock fallback needed)
- UI selectors added for Playwright (data-testid)
- PR updated and merged for deploy; PROD endpoints verified in read-only window; flags restored to OFF by default

What’s Left (pick one next)
1) Enable in PROD for use (UI + API)
   - In Vercel Production: set FEATURE_SUPERADMIN_RBAC=true and NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true; redeploy
   - Login as superadmin -> /admin/role-management -> optional test overlay + cleanup
2) Read-only health checks (ad hoc)
   - Keep UI flag OFF; turn server flag ON briefly and run: BASE="https://fne-lms.vercel.app" TOKEN="<prod_token>" bash scripts/verify-rbac-prod.sh
3) Optional performance polish
   - Seed role_types/permissions catalogs from baseline to reduce matrix build time
4) Optional CI (nightly on Staging)
   - Add workflow to hit the two GET endpoints and alert on regressions

Quick SQL (reference)
- SELECT count(*) FROM role_permission_baseline;
- SELECT * FROM get_effective_permissions('admin', NULL) ORDER BY 1;
- SELECT count(*) FROM role_permissions WHERE is_test=true AND active=true;
- SELECT count(*) FROM test_mode_state WHERE enabled=true;

Notes
- 404 on /admin/role-management usually means client flag wasn’t in the current build; redeploy the environment so the NEXT_PUBLIC flag is baked.
- Some STAGING 400s in console are due to missing FK relationships and are unrelated to RBAC; safe to ignore short-term.
- For PROD read-only windows, keep them short and restore the server flag to OFF when done.
