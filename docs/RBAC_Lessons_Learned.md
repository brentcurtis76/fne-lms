# RBAC – Lessons Learned (Phase 0/1)

## What worked
- Feature flags keep prod safe; OFF by default; require redeploy to take effect.
- Session-bound Supabase client for writes; service-role for reads only.
- Add-only overlays with `test_run_id` and cleanup flow verified in prod.
- Spanish-only UI and messages preserved.

## Pitfalls we hit
- Recursive RLS on `superadmins` caused 42P17 “infinite recursion”.
  - Fix: don’t reference `auth_is_superadmin()` or re-query `superadmins` inside `superadmins` policies. Use `user_id = auth.uid()` for SELECT.
- Missing columns on `permission_audit_log` caused 42703 errors.
  - Fix: ensure optional columns exist if triggers/API write them: `old_value jsonb`, `new_value jsonb` (and, if used, `role_type text`, `permission_key text`).
- Test-mode `test_run_id` mismatch.
  - Fix: after upsert, re-fetch `test_mode_state` to read the DB’s `test_run_id` value.
- Partial unique index requires only one active overlay per (role, permission).
  - Fix: DELETE existing active overlay (not UPDATE) before INSERT. RLS blocks UPDATE by design.
- Overlay API error handling.
  - Prefer returning clear error messages with codes to speed triage.

## Design guardrails to keep
- Add-only writes; no UPDATE on `role_permissions`. Cleanup by exact `test_run_id`.
- Owner-only cleanup (or explicitly allow superadmin via RLS).
- Single audit trail via DB trigger; avoid duplicate app-level audit writes.
- Flags:
  - `FEATURE_SUPERADMIN_RBAC` server-only in prod.
  - `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC` should be false/absent in prod to hide menu.

## Quick fix SQL snippets (reference)

- Remove recursive policies on `superadmins`:
```sql
BEGIN;
DROP POLICY IF EXISTS "Only superadmins can insert superadmins" ON public.superadmins;
DROP POLICY IF EXISTS "Only superadmins can update superadmins" ON public.superadmins;
DROP POLICY IF EXISTS "Superadmins can view all superadmins" ON public.superadmins;
CREATE POLICY superadmins_read_own
ON public.superadmins FOR SELECT
USING (user_id = auth.uid() AND is_active = true);
COMMIT;
```

- Add missing audit columns (idempotent):
```sql
BEGIN;
ALTER TABLE public.permission_audit_log
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS role_type text,
  ADD COLUMN IF NOT EXISTS permission_key text;
COMMIT;
```

## Verification one-liners (browser console)
- Apply overlay (sets `window.testRunId`):
```js
fetch('/api/admin/roles/permissions/overlay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role_type:'docente',permission_key:'create_course',granted:true,reason:'test'})}).then(r=>r.json()).then(d=>{window.testRunId=d.test_run_id;console.log('test_run_id',window.testRunId);});
```
- Cleanup:
```js
fetch('/api/admin/test-runs/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({test_run_id:window.testRunId,confirm:true})}).then(r=>r.json()).then(console.log);
```
```

docs/RBAC_Maintenance_SOP.md
```markdown
# RBAC – Maintenance Window SOP (Phase 1)

Goal: Safely enable/verify test-mode overlays in production; keep UI read-only; zero baseline data changes.

Time: ~15–20 minutes

Roles:
- DRI: runs steps
- Backup: standby

Pre-checks (5 min)
- Feature flags in Vercel = false:
  - `FEATURE_SUPERADMIN_RBAC=false`
  - `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false`
- CI guardrails green; service-role keys only in server envs.
- Superadmin account verified (you can sign in).
- Migrations present in repo:
  - `database/migrations/001_bootstrap_superadmin.sql`
  - `database/migrations/002_test_mode_overlays.sql`

Window steps (10–12 min)
1) Apply SQL in Supabase (SQL Editor), in order:
   - Run `001_bootstrap_superadmin.sql`
   - Run `002_test_mode_overlays.sql`

2) Turn feature ON (server only) and redeploy:
   - Vercel → Project → Settings → Env Vars:
     - `FEATURE_SUPERADMIN_RBAC=true`
     - Leave `NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false`
   - Redeploy production (“Rebuild with latest Environment Variables”).

3) Verify in prod as superadmin:
   - Visit `/admin/role-management` (should load, read-only).
   - Apply overlay (browser console):
```js
fetch('/api/admin/roles/permissions/overlay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role_type:'docente',permission_key:'create_course',granted:true,reason:'test'})}).then(r=>r.json()).then(d=>{window.testRunId=d.test_run_id;console.log('test_run_id',window.testRunId);});
```
   - Refresh the page; you should see a ✓ for “Docente → Crear cursos”.
   - Cleanup (browser console):
```js
fetch('/api/admin/test-runs/cleanup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({test_run_id:window.testRunId,confirm:true})}).then(r=>r.json()).then(console.log);
```
   - Refresh; matrix returns to baseline.

4) Turn feature OFF and redeploy:
   - `FEATURE_SUPERADMIN_RBAC=false`
   - Redeploy production.
   - Confirm:
     - `/admin/role-management` → 404
     - `/api/admin/roles/permissions` → 404
     - Sidebar hides “Roles y Permisos”

Logging/Evidence (2–3 min)
- Record:
  - `test_run_id`
  - Timestamps (apply, cleanup)
  - Screenshots before/after
  - Audit entries present in `permission_audit_log`

Rollback (instant)
- If anything is wrong:
  - Set `FEATURE_SUPERADMIN_RBAC=false` and redeploy.
  - If a test overlay exists, run cleanup by `test_run_id`.

Known pitfalls to avoid
- Do not reference `auth_is_superadmin()` inside `superadmins` RLS; use `user_id = auth.uid()` for SELECT.
- Ensure `permission_audit_log` has `old_value`, `new_value` (and `role_type`, `permission_key` if triggers write them).
- Always use session-bound client for writes (RLS enforced); no service-role writes.
- Redeploy after changing flags in Vercel.

Appendix – Quick SQL Fixes (if needed)
- Drop recursive `superadmins` policies and keep a self-select policy (see Lessons Learned doc).
- Add missing audit columns (see Lessons Learned doc).
```

- These two files summarize what you learned and give a one-page runbook for future windows.