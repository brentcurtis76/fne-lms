Session Handoff (RBAC Phase 0-2)

Use this short checklist when picking up work. Update anything that changed and paste this file/link in chat to restore context.

Overview
- Scope: Superadmin capability + permissions matrix (baseline + test overlays), feature-flagged
- Current Phase: 2 complete (DB + RPC + API/UI code behind flags)

Repo & Branches
- Active branch: rbac-phase2-baseline
- PR: https://github.com/brentcurtis76/fne-lms/pull/1

Environments
- Staging app URL: https://fne-lms-working.vercel.app
- Production app URL: https://fne-lms.vercel.app

Feature Flags
- STAGING: FEATURE_SUPERADMIN_RBAC=true, NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true, RBAC_DEV_MOCK=false
- PROD: FEATURE_SUPERADMIN_RBAC=false, NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false, RBAC_DEV_MOCK=false

Superadmin Accounts
- STAGING superadmin (active): email carlcurtispp1976@gmail.com, user_id c30a8484-8709-412a-8840-90e5fe94e7c8
- PROD superadmin: pending (grant in a short window if/when needed)

Database Status
- Applied in STAGING and PROD: 001b, 001c, 003, 004, 004b, 005
- Verified in PROD: baseline present; 004b RPC returns baseline; overlays/test_mode counts = 0

API/UI (behind flags)
- Matrix API: GET /api/admin/roles/permissions
- Overlay API: POST /api/admin/roles/permissions/overlay (test-mode only)
- Superadmin check: GET /api/admin/auth/is-superadmin
- Matrix page: /admin/role-management (client flag must be true and redeployed)

Evidence & Runbooks
- Logs example: logs/mcp/20250108/
- Prod verification runbook: docs/rbac-phase2-prod-verification-runbook.md

What’s Done
- Phase 0–2 DB changes live (STAGING + PROD)
- RPC ambiguity fixed (004b) in STAGING + PROD
- Superadmin granted in STAGING to the user above
- PR with API/UI + docs is open

What’s Left (pick one next)
1) Local sanity test (recommended before merge)
   - .env.local using STAGING values:
     - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
     - SUPABASE_SERVICE_ROLE_KEY
     - FEATURE_SUPERADMIN_RBAC=true
     - NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true
     - RBAC_DEV_MOCK=false
   - npm run dev -> login (staging user) -> visit /admin/role-management -> verify baseline table -> test overlay + cleanup
2) Staging deployment from branch
   - Vercel project: fne-lms-working -> deploy branch rbac-phase2-baseline
   - Ensure flags are set; redeploy Production environment so NEXT_PUBLIC flags are baked
3) CI (nightly, optional)
   - Add workflow .github/workflows/rbac-verify.yml to run SQL + API checks on STAGING using secrets
4) Short PROD window (read-only)
   - Verify RPC again; optionally enable server flag for 2–3 min to GET matrix; keep flags OFF afterward

Quick SQL (reference)
- SELECT count(*) FROM role_permission_baseline;
- SELECT * FROM get_effective_permissions('admin', NULL) ORDER BY 1;
- SELECT count(*) FROM role_permissions WHERE is_test=true AND active=true;
- SELECT count(*) FROM test_mode_state WHERE enabled=true;

Notes
- 404 on /admin/role-management usually means client flag wasn’t in the current build; redeploy the staging project’s Production environment.
- Some STAGING 400s in console are due to missing FK relationships and are unrelated to RBAC; safe to ignore short-term.
