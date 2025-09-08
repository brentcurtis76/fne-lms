# RBAC Phase 0 — Acceptance & Rollback Checklist

Purpose: Verify hardened superadmin capability and DB-backed, read-only permissions matrix. No baseline writes.

Scope
- Harden auth_is_superadmin functions and event policies.
- API returns matrix from DB catalogs + get_effective_permissions.
- UI renders read-only matrix gated by feature flag and superadmin capability.

Prechecks
- Feature flags:
  - Server: `FEATURE_SUPERADMIN_RBAC=true` (STAGING only)
  - Client: `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC` can remain false
- Superadmin account can sign in on STAGING.

Verification (STAGING)
- Capability
  - `GET /api/admin/auth/is-superadmin` with superadmin Bearer token → `{ is_superadmin: true }`

- Permissions API
  - `GET /api/admin/roles/permissions` returns:
    - `is_mock: false`
    - `roles: string[]`
    - `permission_catalog: { key: string; category?: string }[]`
    - `permissions: { [role: string]: { [permission: string]: boolean } }`
    - `test_mode: boolean` and optional `test_run_id`

- UI
  - Visit `/admin/role-management` as superadmin → table renders using API payload; read-only.
  - With `FEATURE_SUPERADMIN_RBAC=false`: endpoint returns 404; page not accessible.

Security Checks
- No service-role writes (search codepaths; writes use session-bound client only).
- RLS on `superadmins` is non-recursive for SELECT.
- Event policies use `auth_is_superadmin()` (not `user_roles.role_type='superadmin'`).

Artifacts to Save (logs/mcp/YYYYMMDD/)
- `sql-phase0.txt`: pasted SQL outputs from applying wrapper/policy fix in STAGING (if run via console).
- `api-phase0.json`: sample responses from both endpoints.
- `ui-phase0.md`: brief notes/screenshot refs confirming UI render.

Rollback
- Flags: set `FEATURE_SUPERADMIN_RBAC=false`; redeploy to hide surfaces.
- Code: revert the API/UI file changes (or checkout previous commit).
- SQL: wrapper function is additive/safe. Event policy can be reverted with `ALTER POLICY` back to previous condition (only if needed).

Acceptance Criteria
- Superadmin capability check works reliably (function variants OK).
- API matrix is DB-backed (no hardcoded ROLE_HIERARCHY when not in mock mode).
- UI shows read-only matrix and respects feature flags.
- No recursion in `superadmins` RLS; events policy uses capability function.

