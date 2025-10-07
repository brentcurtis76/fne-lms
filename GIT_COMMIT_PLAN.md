# Git Commit Plan - RBAC System

## ✅ MUST COMMIT (Production Code)

### Core RBAC Files
- `components/layout/Sidebar.tsx` - **CRITICAL** - Sidebar now uses RBAC permissions
- `pages/admin/role-management.tsx` - RBAC UI with lockout protection fix
- `pages/api/admin/roles/permissions/update.ts` - Permission update API
- `pages/api/admin/roles/permissions.ts` - Permission fetch API
- `contexts/PermissionContext.tsx` - NEW - Permission context for React
- `components/permissions/` - NEW - Permission-related components (if any)
- `package.json` - Added RBAC test scripts

### Modified Supporting Files
- `components/layout/MainLayout.tsx` - May have RBAC-related changes
- `pages/_app.tsx` - May include PermissionContext provider

### Documentation
- `RBAC_READY_FOR_PRODUCTION.md` - Production readiness report
- `RBAC_PRODUCTION_READINESS.md` - Testing checklist
- `RUN_RBAC_TESTS.md` - Test running guide
- `RBAC_15MIN_TEST_CHECKLIST.md` - Quick test checklist

### Test Scripts (Production-Ready)
- `scripts/rbac-verify-production-ready.js` - Automated verification
- `scripts/rbac-pre-test-setup.js` - Pre-test setup
- `scripts/rbac-capture-db-state.js` - State capture utility
- `e2e/tests/rbac-production-ready.spec.ts` - E2E tests

### Supporting Scripts (Keep for maintenance)
- `scripts/create-rbac-test-users.js` - Test user creation
- `scripts/rbac-smoke-test.js` - Quick smoke test

---

## ⚠️ REVIEW BEFORE COMMIT (May have unrelated changes)

These files were modified but may contain changes from other work:
- `pages/admin/quotes/index.tsx`
- `pages/dashboard.tsx`
- `pages/user/[userId].tsx`
- `utils/workspaceUtils.ts`
- `database/migrations/016_auto_enroll_learning_path_courses.sql`

**Action**: Review these files to see if changes are RBAC-related or unrelated work.

---

## ❌ DO NOT COMMIT (Temporary/Debug Files)

### Debug Scripts (should be .gitignored)
- All `diagnose-*.js` files
- All `check-*.js` files in root
- All `fix-*.js` files in root
- All `investigate-*.js` files in root
- All `verify-*.js` files in root
- All `test-*.js` files in root
- `challenge-diagnosis.js`
- `scripts/test-*.js` (except test setup scripts)
- `scripts/check-*.js`
- `scripts/diagnose-*.js`
- `scripts/find-*.js`
- `scripts/simulate-*.js`
- `scripts/verify-*.js` (some exceptions)
- `scripts/FINAL-*.js`
- `scripts/deep-*.js`

### SQL Debug Files
- `FIX_DUPLICATES.sql`
- `URGENT_FIX.sql`
- `database/migrations/APPLY_*.sql` (apply scripts, not migrations)

### Temporary Migrations (need review)
- Most `database/migrations/00X_*.sql` files appear to be fixes/patches
- Only commit actual schema changes, not debug/fix scripts

### Old Test Files
- `e2e/tests/rbac-system.spec.ts` (superseded by rbac-production-ready.spec.ts)

---

## 📝 Recommended Commit Structure

### Commit 1: RBAC Core System
```bash
git add components/layout/Sidebar.tsx
git add pages/admin/role-management.tsx
git add pages/api/admin/roles/permissions.ts
git add pages/api/admin/roles/permissions/
git add contexts/PermissionContext.tsx
git add components/permissions/
git add package.json

git commit -m "feat: Implement RBAC system with dynamic sidebar permissions

- Remove hard-coded restrictedRoles from Sidebar
- Add permission-based access control for all 15 sidebar items
- Implement RBAC management UI with lockout protection
- Add PermissionContext for React components
- Add permission update API endpoints

🤖 Generated with Claude Code"
```

### Commit 2: RBAC Documentation
```bash
git add RBAC_READY_FOR_PRODUCTION.md
git add RBAC_PRODUCTION_READINESS.md
git add RUN_RBAC_TESTS.md
git add RBAC_15MIN_TEST_CHECKLIST.md

git commit -m "docs: Add RBAC production readiness documentation

- Add production deployment guide
- Add comprehensive testing checklist
- Add automated test running instructions
- Add 15-minute quick test guide

🤖 Generated with Claude Code"
```

### Commit 3: RBAC Test Suite
```bash
git add scripts/rbac-verify-production-ready.js
git add scripts/rbac-pre-test-setup.js
git add scripts/rbac-capture-db-state.js
git add scripts/create-rbac-test-users.js
git add scripts/rbac-smoke-test.js
git add e2e/tests/rbac-production-ready.spec.ts

git commit -m "test: Add RBAC automated test suite

- Add database verification script (100% pass rate)
- Add pre-test setup script
- Add state capture utility
- Add comprehensive E2E test suite
- Add test user creation script

🤖 Generated with Claude Code"
```

### Commit 4: Supporting Changes (if needed)
```bash
# Only if these have RBAC-related changes:
git add components/layout/MainLayout.tsx
git add pages/_app.tsx

git commit -m "feat: Add RBAC support to layout components

- Add PermissionContext provider to _app
- Update MainLayout for RBAC integration

🤖 Generated with Claude Code"
```

---

## 🗑️ .gitignore Additions

Add these patterns to `.gitignore`:
```
# RBAC test results
test-results/rbac-*.json

# Debug/diagnostic scripts (root level)
/*-diagnosis.js
/check-*.js
/fix-*.js
/investigate-*.js
/verify-*.js
/diagnose-*.js

# Temporary SQL files
URGENT_*.sql
FIX_*.sql
APPLY_*.sql
```

---

## ✅ Pre-Commit Checklist

Before committing:
- [ ] Run type check: `npm run type-check`
- [ ] Run RBAC verification: `node scripts/rbac-verify-production-ready.js`
- [ ] Ensure dev server starts: `npm run dev`
- [ ] Review each file's changes: `git diff <file>`
- [ ] Remove any passwords/secrets from committed files
- [ ] Ensure commit messages are descriptive

---

**Status**: Ready to commit core RBAC files
**Recommendation**: Commit in 3-4 separate commits as outlined above
