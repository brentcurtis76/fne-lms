# Running RBAC Production Readiness Tests

## Prerequisites

1. Dev server must be running on port 3000
2. You need brent@perrotuertocm.cl password

## Run Tests

```bash
# Set the superadmin password (replace YOUR_PASSWORD)
export SUPERADMIN_PASSWORD="YOUR_PASSWORD"

# Run the full automated test suite
npm run test:rbac
```

## What Gets Tested

The automated test suite will verify:

### ✅ Suite 1: RBAC UI Functionality
- Permission toggle and save works
- Critical permission lockout protection
- Audit logging captures changes

### ✅ Suite 2: Sidebar Access Control
- Sidebar shows items when permission granted
- Sidebar hides items when permission denied
- All 8 roles have correct sidebar items

### ✅ Suite 3: Security & Isolation
- Non-superadmin cannot access RBAC UI
- Permission changes don't affect other roles
- Permission changes require page refresh

### ✅ Suite 4: Edge Cases
- User with minimal permissions sees basic sidebar
- System handles missing permission keys gracefully

### ✅ Suite 5: Rollback Capability
- Can export current permissions as backup
- Can restore permissions from backup

## Test Output

After running, you'll see:
- ✅ PASS for each successful test
- ❌ FAIL for any failures
- Test summary with pass/fail counts
- Backup file created in `test-results/`

## If Tests Fail

1. Check the error message
2. Review `test-results/` for screenshots
3. Backup file is available for rollback
4. Run specific test: `npm run test:rbac:debug`

## Manual Testing Alternative

If automated tests fail, follow the manual checklist in:
`RBAC_PRODUCTION_READINESS.md`
