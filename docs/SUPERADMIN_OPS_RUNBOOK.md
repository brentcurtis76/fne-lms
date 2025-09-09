# Superadmin Role & Permission Management - Operations Runbook

## Overview
This runbook provides procedures for managing the Superadmin Role & Permission Management system in production.

## System Architecture
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with UUID-based superadmin checks
- **Test Mode**: Database-enforced TTL with test_run_id tracking
- **Audit**: Complete audit trail with no PII in diffs
- **Feature Flags**: Granular control over feature rollout

## Feature Flag Management

### Available Flags
1. **FEATURE_SUPERADMIN_RBAC** - Enables superadmin RBAC system (default: false)
2. **RBAC_DEV_MOCK** - Enables dev mock mode for testing (default: false)

### Staging Procedure

#### 1. Pre-Production Testing
```bash
# Set up staging environment
cp .env.local .env.staging
echo "FEATURE_SUPERADMIN_RBAC=true" >> .env.staging
echo "NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true" >> .env.staging

# Run with staging config
env $(cat .env.staging | xargs) npm run dev

# Test functionality
- Verify sidebar shows "Roles y Permisos" for superadmin
- Verify /admin/role-management loads correctly
- Verify APIs return proper data
- Run E2E tests: npm run test:e2e -- superadmin-rbac-flags.spec.ts
```

#### 2. Dev Mock Testing
```bash
# Enable mock mode for UI testing without database
echo "RBAC_DEV_MOCK=true" >> .env.staging
echo "NEXT_PUBLIC_RBAC_DEV_MOCK=true" >> .env.staging

# Test without database access
- Should see mock data in UI
- Should see "Modo de Desarrollo" warning
- APIs should return mock data
```

#### 3. Production Rollout
```bash
# During maintenance window only
# 1. Apply database migrations first
psql $DATABASE_URL < database/migrations/001_bootstrap_superadmin.sql

# 2. Enable feature flag in production
heroku config:set FEATURE_SUPERADMIN_RBAC=true
heroku config:set NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true

# 3. Verify deployment
curl -H "Authorization: Bearer $TOKEN" https://app.example.com/api/admin/auth/is-superadmin

# 4. Monitor for errors
heroku logs --tail | grep -E "(superadmin|rbac|permission)"
```

#### 4. Emergency Rollback
```bash
# Disable feature immediately (no database changes needed)
heroku config:set FEATURE_SUPERADMIN_RBAC=false
heroku config:set NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false

# Feature will be completely hidden from users
# Database tables remain but are unused
```

### CI/CD Integration

#### Pre-Deploy Checks
```json
// package.json
{
  "scripts": {
    "check:service-role": "node scripts/check-service-role-imports.js",
    "test:rbac": "playwright test e2e/tests/superadmin-rbac-flags.spec.ts",
    "ci:pre-deploy": "npm run check:service-role && npm run test:rbac"
  }
}
```

#### GitHub Actions
```yaml
# .github/workflows/rbac-checks.yml
name: RBAC Security Checks
on: [push, pull_request]
jobs:
  check-service-role:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run check:service-role
      - run: npm run test:rbac
```

## Phase 0 - Read-Only System (COMPLETE)

### Status
✅ Implemented and tested behind feature flags
✅ Zero production impact when flags are disabled
✅ Ready for production deployment during maintenance window

## Phase 1 - Test Mode & Overlays (STAGED)

### Status
✅ Implemented and tested behind feature flags
✅ APIs return mock data when RBAC_DEV_MOCK=true
✅ Database migration ready but NOT applied to production
✅ Zero production impact - all behind flags

### New Files Created
- `/database/migrations/002_test_mode_overlays.sql` - Test mode and overlay tables (NOT APPLIED)
- `/pages/api/admin/roles/permissions/overlay.ts` - Permission overlay API
- `/pages/api/admin/test-runs/cleanup.ts` - Test run cleanup API
- `/e2e/tests/superadmin-rbac-phase1.spec.ts` - Phase 1 E2E tests

### Database Migration (DO NOT RUN UNTIL MAINTENANCE WINDOW)

The migration file `/database/migrations/002_test_mode_overlays.sql` creates:
1. **test_mode_state** - Tracks active test runs with TTL
2. **permissions** - Permission catalog
3. **role_types** - Role type definitions
4. **role_permissions** - Permission overlays (test mode only)
5. **RLS policies** - Enforce test mode at database level
6. **Helper functions** - get_effective_permissions, cleanup_expired_test_runs

### API Endpoints (Behind Feature Flags)

#### POST /api/admin/roles/permissions/overlay
- Creates permission overlays in test mode
- Session-bound client (RLS enforced)
- Returns 404 when FEATURE_SUPERADMIN_RBAC=false
- Returns mock data when RBAC_DEV_MOCK=true

Request body:
```json
{
  "role_type": "docente",
  "permission_key": "create_course",
  "granted": true,
  "reason": "Permitir a docentes crear cursos",
  "idempotency_key": "optional-unique-key",
  "dry_run": false
}
```

#### POST /api/admin/test-runs/cleanup
- Cleans up test overlays by test_run_id
- Session-bound client (RLS enforced)
- Returns 404 when FEATURE_SUPERADMIN_RBAC=false
- Returns mock data when RBAC_DEV_MOCK=true

Request body:
```json
{
  "test_run_id": "uuid-of-test-run",
  "confirm": true
}
```

### Testing Phase 1 in Dev Mock Mode

1. **Enable flags in .env.local**:
```bash
FEATURE_SUPERADMIN_RBAC=true
NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true
RBAC_DEV_MOCK=true
NEXT_PUBLIC_RBAC_DEV_MOCK=true
```

2. **Test overlay API**:
```bash
curl -X POST http://localhost:3000/api/admin/roles/permissions/overlay \
  -H "Content-Type: application/json" \
  -d '{
    "role_type": "docente",
    "permission_key": "create_course",
    "granted": true,
    "reason": "Test overlay"
  }'
```

3. **Test cleanup API**:
```bash
curl -X POST http://localhost:3000/api/admin/test-runs/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "test_run_id": "test-123",
    "confirm": true
  }'
```

4. **Run E2E tests**:
```bash
npm run test:rbac
# Or specifically Phase 1 tests:
npx playwright test e2e/tests/superadmin-rbac-phase1.spec.ts
```

### Maintenance Window Procedure (Phase 1)

**DO NOT EXECUTE UNTIL SCHEDULED MAINTENANCE WINDOW**

1. **Pre-flight checks**:
```bash
# Verify Phase 0 is working
psql $DATABASE_URL -c "SELECT * FROM superadmins WHERE is_active = true;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM permission_audit_log;"
```

2. **Apply Phase 1 migration**:
```bash
# Run migration (idempotent, safe to re-run)
psql $DATABASE_URL < database/migrations/002_test_mode_overlays.sql

# Verify tables created
psql $DATABASE_URL -c "\dt test_mode_state"
psql $DATABASE_URL -c "\dt permissions"
psql $DATABASE_URL -c "\dt role_types"
psql $DATABASE_URL -c "\dt role_permissions"
```

3. **Test in production (briefly)**:
```bash
# Enable feature flag
heroku config:set FEATURE_SUPERADMIN_RBAC=true
heroku config:set NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true

# Test overlay creation (will be in test mode)
# Test cleanup
# Monitor logs

# If issues, immediately disable:
heroku config:set FEATURE_SUPERADMIN_RBAC=false
heroku config:set NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false
```

4. **Verify audit trail**:
```sql
-- Check recent audit entries
SELECT * FROM permission_audit_log 
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- Check test mode states
SELECT * FROM test_mode_state;

-- Check any overlays created
SELECT * FROM role_permissions WHERE is_test = true;
```

### Rollback Procedure

If issues arise during Phase 1:

1. **Immediate flag disable** (no DB changes needed):
```bash
heroku config:set FEATURE_SUPERADMIN_RBAC=false
heroku config:set NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=false
```

2. **Clean up test data** (if needed):
```sql
-- Remove all test overlays
DELETE FROM role_permissions WHERE is_test = true;

-- Clear test mode states
UPDATE test_mode_state SET enabled = false, test_run_id = NULL;
```

3. **Tables remain** but are unused when feature is disabled

### Security Considerations

- All writes are **add-only** (no UPDATE on role_permissions)
- **RLS enforced** at database level
- **Test mode required** for any overlay creation
- **TTL enforced** via expires_at
- **Audit trail** for all actions
- **No PII** in audit diffs
- **Session-bound clients** for all writes (no service-role)

### Monitoring Queries

```sql
-- Active test runs
SELECT 
  tms.user_id,
  u.email,
  tms.test_run_id,
  tms.enabled_at,
  tms.expires_at,
  COUNT(rp.id) as overlay_count
FROM test_mode_state tms
JOIN auth.users u ON u.id = tms.user_id
LEFT JOIN role_permissions rp ON rp.test_run_id = tms.test_run_id
WHERE tms.enabled = true
GROUP BY tms.user_id, u.email, tms.test_run_id, tms.enabled_at, tms.expires_at;

-- Recent overlays
SELECT 
  rp.role_type,
  rp.permission_key,
  rp.granted,
  rp.reason,
  u.email as created_by,
  rp.created_at
FROM role_permissions rp
JOIN auth.users u ON u.id = rp.created_by
WHERE rp.created_at > now() - interval '24 hours'
ORDER BY rp.created_at DESC;

-- Cleanup candidates
SELECT 
  test_run_id,
  COUNT(*) as overlays_to_delete
FROM role_permissions
WHERE test_run_id IN (
  SELECT test_run_id FROM test_mode_state
  WHERE expires_at < now()
)
GROUP BY test_run_id;
```
- `/pages/api/admin/roles/permissions.ts` - Permissions GET API
- `/pages/admin/role-management.tsx` - Read-only UI page
- `/components/layout/SmartSidebar.tsx` - Updated with superadmin menu

### Bootstrap Procedure

**⚠️ IMPORTANT: Do not use email-based scripts**
- DO NOT run scripts like `make-brent-superadmin.sql` or `fix-brent-email-superadmin.sql`
- These are DEPRECATED and use fragile email-based identification
- ALWAYS use the official migration: `database/migrations/001_bootstrap_superadmin.sql`

1. **Initial Superadmin Setup** (One-time only)
```bash
# Connect to production database
psql $DATABASE_URL < database/migrations/001_bootstrap_superadmin.sql

# Verify bootstrap
psql $DATABASE_URL -c "SELECT * FROM superadmins WHERE is_active = true;"
psql $DATABASE_URL -c "SELECT * FROM permission_audit_log WHERE action = 'superadmin_bootstrap';"
```

2. **Verify Superadmin Access**
- Login as brent@perrotuertocm.cl
- Navigate to `/admin/role-management`
- Should see "Gestión de Roles y Permisos" page
- Check audit log shows access attempt

### Monitoring

**Check Superadmin Status**
```sql
-- List all superadmins
SELECT 
  s.user_id,
  u.email,
  s.granted_at,
  s.reason,
  s.is_active
FROM superadmins s
JOIN auth.users u ON s.user_id = u.id
WHERE s.is_active = true;

-- Check recent audit activity
SELECT 
  action,
  reason,
  created_at
FROM permission_audit_log
ORDER BY created_at DESC
LIMIT 20;
```

## Phase 1 - Test Mode System (PENDING)

### Emergency Procedures

**Disable Test Mode Immediately**
```sql
-- Force disable test mode for a superadmin
UPDATE test_mode_state 
SET 
  enabled = false,
  expires_at = NOW()
WHERE user_id = '[superadmin_user_id]';

-- Verify disabled
SELECT * FROM test_mode_state WHERE user_id = '[superadmin_user_id]';
```

**Review Recent Test Changes**
```sql
-- List all test mode changes
SELECT 
  rp.role_type,
  rp.permission_key,
  rp.granted,
  rp.test_run_id,
  rp.reason,
  rp.created_at,
  u.email as created_by_email
FROM role_permissions rp
JOIN auth.users u ON rp.created_by = u.id
WHERE rp.is_test = true
ORDER BY rp.created_at DESC;

-- Count changes by test_run_id
SELECT 
  test_run_id,
  COUNT(*) as change_count,
  MIN(created_at) as started_at,
  MAX(created_at) as last_change
FROM role_permissions
WHERE is_test = true
GROUP BY test_run_id
ORDER BY started_at DESC;
```

**Emergency Cleanup of Test Data**
```sql
-- First, verify what would be deleted
SELECT COUNT(*) 
FROM role_permissions 
WHERE test_run_id = '[specific_test_run_id]' 
AND is_test = true;

-- Then delete if correct
BEGIN;
DELETE FROM role_permissions 
WHERE test_run_id = '[specific_test_run_id]' 
AND is_test = true;

-- Verify deletion count
GET DIAGNOSTICS deleted_count = ROW_COUNT;
SELECT deleted_count;

-- Log the cleanup
INSERT INTO permission_audit_log (
  action, 
  performed_by, 
  reason, 
  test_run_id,
  is_test,
  diff
) VALUES (
  'emergency_cleanup',
  '[your_user_id]',
  'Emergency cleanup of test data',
  '[specific_test_run_id]',
  true,
  jsonb_build_object('deleted_count', deleted_count)
);

COMMIT;
```

### Rollback Procedure

1. **Identify Test Run to Rollback**
```sql
SELECT DISTINCT 
  test_run_id,
  COUNT(*) as changes,
  array_agg(DISTINCT role_type) as affected_roles
FROM role_permissions
WHERE is_test = true
GROUP BY test_run_id
ORDER BY MAX(created_at) DESC;
```

2. **Verify No Production Data Affected**
```sql
-- Ensure no non-test data exists with same identifiers
SELECT COUNT(*) 
FROM role_permissions 
WHERE is_test = false;

-- Should return original baseline count
```

3. **Execute Rollback**
```sql
-- Use the cleanup API or run manually
DELETE FROM role_permissions 
WHERE test_run_id = '[test_run_id_to_rollback]'
AND is_test = true
AND created_by = '[user_who_created]';
```

4. **Confirm Baseline Unchanged**
```sql
-- Verify baseline permissions intact
SELECT COUNT(*) 
FROM role_permissions 
WHERE is_test = false;

-- Verify effective permissions match baseline
SELECT * FROM effective_role_permissions;
```

### Rate Limiting Management

**Check Rate Limit Status**
```sql
SELECT 
  user_id,
  request_count,
  last_request_at,
  CASE 
    WHEN last_request_at > NOW() - INTERVAL '1 minute' 
    THEN 'Active Window'
    ELSE 'Expired Window'
  END as window_status
FROM test_mode_state
WHERE request_count > 0;
```

**Reset Rate Limit Counter**
```sql
UPDATE test_mode_state
SET 
  request_count = 0,
  last_request_at = NULL
WHERE user_id = '[user_id]';
```

### Troubleshooting

**Problem: Superadmin Cannot Access Role Management**
1. Check superadmin status:
```sql
SELECT auth_is_superadmin('[user_id]'::uuid);
```

2. Check RLS policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'superadmins';
```

3. Verify user in superadmins table:
```sql
SELECT * FROM superadmins WHERE user_id = '[user_id]';
```

**Problem: Test Mode Changes Not Applying**
1. Check test mode is enabled:
```sql
SELECT * FROM test_mode_state WHERE user_id = '[user_id]';
```

2. Verify TTL not expired:
```sql
SELECT 
  enabled,
  expires_at,
  NOW() < expires_at as still_valid
FROM test_mode_state 
WHERE user_id = '[user_id]';
```

3. Check for unique constraint violations:
```sql
SELECT * FROM role_permissions
WHERE role_type = '[role]'
AND permission_key = '[permission]'
AND active = true;
```

**Problem: Cannot Clean Up Test Data**
1. Verify ownership:
```sql
SELECT 
  test_run_id,
  created_by,
  created_by = '[your_user_id]' as is_owner
FROM role_permissions
WHERE test_run_id = '[test_run_id]';
```

2. Check test mode active:
```sql
SELECT * FROM test_mode_state 
WHERE user_id = '[your_user_id]'
AND test_run_id = '[test_run_id]';
```

### Security Audit Commands

**Verify RLS Enforcement**
```sql
-- Check FORCE RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE tablename IN (
  'superadmins',
  'permissions',
  'role_permissions',
  'permission_audit_log',
  'test_mode_state'
);
```

**Audit SECURITY DEFINER Functions**
```sql
-- Ensure all have SET search_path
SELECT 
  proname,
  prosecdef,
  proconfig
FROM pg_proc
WHERE prosecdef = true
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

**Check for Hardcoded Privileges**
```bash
# Search for hardcoded admin checks in code
grep -r "isAdmin.*true" pages/ components/ --include="*.tsx" --include="*.ts"
grep -r "role.*===.*'admin'" pages/ components/ --include="*.tsx" --include="*.ts"
```

### Monitoring Queries

**Daily Health Check**
```sql
-- Superadmin count
SELECT COUNT(*) as superadmin_count 
FROM superadmins 
WHERE is_active = true;

-- Recent activity
SELECT 
  DATE(created_at) as date,
  COUNT(*) as actions,
  COUNT(DISTINCT performed_by) as unique_users
FROM permission_audit_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Test mode usage
SELECT 
  COUNT(DISTINCT test_run_id) as test_runs,
  COUNT(*) as total_changes
FROM role_permissions
WHERE is_test = true
AND created_at > NOW() - INTERVAL '24 hours';
```

### Backup Procedures

**Export Current State**
```sql
-- Backup superadmins
\COPY (SELECT * FROM superadmins) TO '/tmp/superadmins_backup.csv' CSV HEADER;

-- Backup permissions
\COPY (SELECT * FROM permissions) TO '/tmp/permissions_backup.csv' CSV HEADER;

-- Backup audit log
\COPY (SELECT * FROM permission_audit_log) TO '/tmp/audit_backup.csv' CSV HEADER;
```

**Restore from Backup**
```sql
-- Only if absolutely necessary
\COPY superadmins FROM '/tmp/superadmins_backup.csv' CSV HEADER;
\COPY permissions FROM '/tmp/permissions_backup.csv' CSV HEADER;
```

## Contact Information

**System Owner**: Brent Curtis
**Email**: brent@perrotuertocm.cl
**Emergency Contact**: +56941623577

## Revision History

- **2025-01-11**: Initial Phase 0 deployment
- **Phase 1**: Pending - Test mode system
- **Phase 2**: Pending - Feature flag integration