# RBAC Production Readiness Testing Plan

**Date**: 2025-10-07
**Feature**: Role-Based Access Control (RBAC) System
**Status**: Pre-Production Testing Required

## 🎯 Testing Objectives

Before deploying RBAC to production, we must verify:
1. **Functionality**: Permission changes work as expected
2. **Security**: No unauthorized access or privilege escalation
3. **Reliability**: Changes persist correctly across sessions
4. **Auditability**: All changes are logged
5. **Rollback**: We can safely revert if issues arise

---

## 📋 Pre-Flight Checklist

### Database State Capture
```bash
# Create baseline snapshot
node scripts/rbac-capture-db-state.js before-production-test

# Files created:
# - test-results/rbac-state-before-production-test.json
```

### Verify Feature Flag
```bash
# Check .env.local
grep FEATURE_SUPERADMIN_RBAC .env.local
# Expected: FEATURE_SUPERADMIN_RBAC=true
```

### Verify Superadmin Access
- Only `brent@perrotuertocm.cl` should be in superadmins table
- RBAC menu should only appear for this user

---

## 🧪 Test Suite 1: RBAC UI Functionality

### Test 1.1: Permission Toggle & Save
**Goal**: Verify changes save to database

**Steps**:
1. Log in as brent@perrotuertocm.cl
2. Navigate to "Roles y Permisos"
3. Find `docente` role, toggle `create_news_all` to ON
4. **CRITICAL**: Click "Guardar Cambios" button
5. Wait for success message: "Cambios guardados exitosamente"

**Verification**:
```bash
# Check database
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from('role_permissions').select('granted').eq('role_type', 'docente').eq('permission_key', 'create_news_all').single();
  console.log('create_news_all for docente:', data.granted ? 'GRANTED ✅' : 'DENIED ❌');
})();
"
```

**Expected**: `GRANTED ✅`

**Rollback**:
```bash
# If test fails, revert manually
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await supabase.from('role_permissions').update({ granted: false }).eq('role_type', 'docente').eq('permission_key', 'create_news_all');
  console.log('Reverted');
})();
"
```

---

### Test 1.2: Critical Permission Lockout Protection
**Goal**: Verify modal prevents admin lockout

**Steps**:
1. In RBAC UI, find `admin` role
2. Try to disable `manage_permissions`
3. Modal should appear: "¡Advertencia! Cambio Peligroso"

**Expected**: Cannot disable without confirming modal

**Pass Criteria**: Modal appears and lists the critical permission

---

### Test 1.3: Audit Logging
**Goal**: Verify all changes are logged

**Steps**:
1. Make 3 permission changes
2. Click "Guardar Cambios"
3. Check audit log

**Verification**:
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from('permission_audit_log').select('*').order('created_at', { ascending: false }).limit(10);
  console.log('Recent audit entries:', data.length);
  data.forEach(e => console.log('  -', e.action, e.role_type, e.permission_key));
})();
"
```

**Expected**: 3 new `permission_updated` entries

---

## 🧪 Test Suite 2: Sidebar Access Control

### Test 2.1: Docente Sees Noticias (Permission Granted)
**Goal**: Verify sidebar respects RBAC permissions

**Prerequisites**:
```bash
# Grant view_news_all to docente
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await supabase.from('role_permissions').update({ granted: true }).eq('role_type', 'docente').eq('permission_key', 'view_news_all');
  console.log('✅ Granted view_news_all to docente');
})();
"
```

**Steps**:
1. Log in as `tom@nuevaeducacion.org` (docente)
2. Check sidebar

**Expected**: "Noticias" menu item is VISIBLE

---

### Test 2.2: Docente Cannot See Noticias (Permission Denied)
**Goal**: Verify sidebar hides items when permission removed

**Prerequisites**:
```bash
# Revoke view_news_all from docente
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  await supabase.from('role_permissions').update({ granted: false }).eq('role_type', 'docente').eq('permission_key', 'view_news_all');
  console.log('✅ Revoked view_news_all from docente');
})();
"
```

**Steps**:
1. Refresh browser as `tom@nuevaeducacion.org`
2. Check sidebar

**Expected**: "Noticias" menu item is HIDDEN

---

### Test 2.3: Test All 8 Roles
**Goal**: Verify each role sees correct sidebar items

**Test Users**:
- `test.admin@fne-test.com` / TestAdmin123!
- `test.consultor@fne-test.com` / TestConsultor123!
- `test.community.manager@fne-test.com` / TestCommunityManager123!
- `test.supervisor@fne-test.com` / TestSupervisor123!
- `test.directivo@fne-test.com` / TestDirectivo123!
- `test.docente@fne-test.com` / TestDocente123!
- `test.lider.comunidad@fne-test.com` / TestLiderComunidad123!
- `test.lider.generacion@fne-test.com` / TestLiderGeneracion123!

**Steps**: For each user:
1. Log in
2. Take screenshot of sidebar
3. Verify items match role's permissions in database

**Verification Script**:
```bash
node scripts/verify-sidebar-for-role.js <role_name>
```

---

## 🧪 Test Suite 3: Security & Isolation

### Test 3.1: Non-Superadmin Cannot Access RBAC
**Goal**: Verify only superadmins see RBAC menu

**Steps**:
1. Log in as `test.admin@fne-test.com` (admin but NOT superadmin)
2. Check sidebar

**Expected**: "Roles y Permisos" menu is HIDDEN

**Secondary Check**:
3. Try direct URL: http://localhost:3000/admin/role-management
4. Should redirect or show "Access Denied"

---

### Test 3.2: Permission Changes Don't Affect Other Roles
**Goal**: Verify role isolation

**Steps**:
1. Change docente permission: `view_courses_all` = false
2. Check consultor still has `view_courses_all` = true

**Verification**:
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: docente } = await supabase.from('role_permissions').select('granted').eq('role_type', 'docente').eq('permission_key', 'view_courses_all').single();
  const { data: consultor } = await supabase.from('role_permissions').select('granted').eq('role_type', 'consultor').eq('permission_key', 'view_courses_all').single();
  console.log('docente view_courses_all:', docente.granted);
  console.log('consultor view_courses_all:', consultor.granted);
  console.log(docente.granted !== consultor.granted ? '✅ Roles isolated' : '❌ Roles affected each other');
})();
"
```

---

### Test 3.3: Permission Changes Don't Affect Existing Sessions
**Goal**: Users must refresh to see permission changes

**Steps**:
1. Log in as tom@nuevaeducacion.org in Browser A (keep open)
2. In Browser B, log in as brent@perrotuertocm.cl
3. Revoke tom's `view_news_all` permission via RBAC UI
4. In Browser A (without refresh), check if "Noticias" still visible

**Expected**: Menu item STILL visible (until refresh)

**Then**:
5. Refresh Browser A
6. "Noticias" should now be HIDDEN

---

## 🧪 Test Suite 4: Edge Cases

### Test 4.1: User with No Permissions
**Goal**: Verify graceful handling of empty permissions

**Steps**:
1. Revoke ALL permissions from `test.docente@fne-test.com`
2. Log in as that user
3. Check sidebar

**Expected**: Only shows:
- Mi Panel (dashboard)
- Mi Perfil (profile)
- Mi Aprendizaje (learning paths assigned to them)

---

### Test 4.2: User with Multiple Roles
**Goal**: Verify permission union (most permissive wins)

**Note**: Current system uses single role per user. If multi-role support is added later, test:
- User with both `docente` and `consultor` roles
- Should see union of both role permissions

---

### Test 4.3: Permission Key Typo Handling
**Goal**: Verify system doesn't break with invalid permission keys

**Steps**:
1. Manually add invalid permission to sidebar (e.g., `view_xyz_invalid`)
2. Log in as user
3. System should NOT crash

**Expected**: Invalid permission is treated as "denied", item hidden

---

## 🧪 Test Suite 5: Production Rollback Plan

### Test 5.1: Backup Current State
```bash
# Export current permissions
node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from('role_permissions').select('*').order('role_type, permission_key');
  fs.writeFileSync('RBAC_BACKUP_' + Date.now() + '.json', JSON.stringify(data, null, 2));
  console.log('✅ Backup saved');
})();
"
```

---

### Test 5.2: Emergency Rollback Procedure
**If RBAC breaks production:**

```bash
# OPTION 1: Disable feature flag
# Edit .env.local or Vercel environment variables:
FEATURE_SUPERADMIN_RBAC=false

# OPTION 2: Restore permissions from backup
node scripts/restore-rbac-from-backup.js RBAC_BACKUP_<timestamp>.json

# OPTION 3: Revert Sidebar.tsx to use hard-coded roles
git revert <commit-hash-of-rbac-changes>
npm run build
# Redeploy
```

---

### Test 5.3: Verify Rollback Works
**Steps**:
1. Set `FEATURE_SUPERADMIN_RBAC=false`
2. Restart dev server
3. RBAC menu should disappear
4. Sidebar should revert to hard-coded `adminOnly` behavior

---

## 📊 Production Readiness Checklist

Before deploying to production, ALL of these must be ✅:

### Code Quality
- [ ] TypeScript compiles with no errors (`npm run type-check`)
- [ ] All sidebar items have proper `permission` properties
- [ ] No hard-coded `restrictedRoles` or `adminOnly` (except for backward compatibility)
- [ ] RBAC UI has loading states and error handling
- [ ] Audit logging is working

### Testing
- [ ] Test 1.1: Permission toggle & save works
- [ ] Test 1.2: Lockout protection works
- [ ] Test 1.3: Audit logging works
- [ ] Test 2.1: Sidebar shows items with granted permissions
- [ ] Test 2.2: Sidebar hides items with denied permissions
- [ ] Test 2.3: All 8 roles tested individually
- [ ] Test 3.1: Non-superadmin cannot access RBAC
- [ ] Test 3.2: Role isolation verified
- [ ] Test 3.3: Session persistence verified
- [ ] Test 4.1: Empty permissions handled gracefully
- [ ] Test 4.3: Invalid permissions don't crash system

### Security
- [ ] Only brent@perrotuertocm.cl is superadmin
- [ ] RBAC menu hidden from non-superadmins
- [ ] Direct URL access blocked for non-superadmins
- [ ] Audit logs capture user_id of person making changes
- [ ] No SQL injection vulnerabilities in permission updates

### Documentation
- [ ] README.md updated with RBAC documentation
- [ ] Permission mapping documented
- [ ] Rollback procedures documented
- [ ] Known limitations documented

### Deployment
- [ ] Backup of current permissions exported
- [ ] Rollback plan tested and verified
- [ ] Feature flag ready for quick disable
- [ ] Team notified of deployment
- [ ] Monitoring plan in place

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment
1. Run full test suite (all tests above)
2. Export permission backup
3. Notify team of upcoming deployment
4. Schedule deployment window

### Step 2: Deployment
1. Merge RBAC branch to main
2. Deploy to Vercel
3. Verify `FEATURE_SUPERADMIN_RBAC=true` in Vercel env vars
4. Monitor error logs for 15 minutes

### Step 3: Post-Deployment Verification
1. Log in as brent@perrotuertocm.cl
2. Verify RBAC menu appears
3. Make one test permission change
4. Verify audit log entry created
5. Log in as test.docente@fne-test.com
6. Verify sidebar reflects permissions correctly

### Step 4: Monitoring (First 24 Hours)
- Check error logs every 2 hours
- Monitor for permission-related user complaints
- Verify audit log is filling correctly
- Check database performance (permission queries)

---

## 🆘 Emergency Contacts

**If RBAC breaks production:**
- Brent Curtis: +56941623577
- Technical Lead: bcurtis@nuevaeducacion.org

**Rollback Authority**: Brent Curtis (can disable feature flag immediately)

---

## 📝 Test Execution Log

| Test ID | Description | Date | Result | Notes |
|---------|-------------|------|--------|-------|
| 1.1 | Permission toggle & save | | ⏳ | |
| 1.2 | Lockout protection | | ⏳ | |
| 1.3 | Audit logging | | ⏳ | |
| 2.1 | Sidebar shows granted | | ⏳ | |
| 2.2 | Sidebar hides denied | | ⏳ | |
| 2.3 | All 8 roles tested | | ⏳ | |
| 3.1 | Non-superadmin blocked | | ⏳ | |
| 3.2 | Role isolation | | ⏳ | |
| 3.3 | Session persistence | | ⏳ | |
| 4.1 | Empty permissions | | ⏳ | |
| 4.3 | Invalid permissions | | ⏳ | |
| 5.1 | Backup created | | ⏳ | |
| 5.3 | Rollback verified | | ⏳ | |

**Legend**: ⏳ Pending | ✅ Pass | ❌ Fail | ⚠️ Partial

---

## 🎯 Success Criteria

RBAC is production-ready when:
1. **All tests pass** (100% of checklist items ✅)
2. **Zero security vulnerabilities** identified
3. **Rollback procedure tested** and verified working
4. **Backup created** and restoration tested
5. **Team approved** the deployment plan

**Current Status**: ⏳ TESTING REQUIRED

---

**Last Updated**: 2025-10-07
**Next Review**: After completing all tests
**Production Deploy**: BLOCKED until all tests pass
