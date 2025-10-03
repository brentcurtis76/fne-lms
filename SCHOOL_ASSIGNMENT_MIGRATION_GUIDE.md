# School Assignment Migration Guide

## Summary

This guide documents the school assignment migration process for the FNE LMS. We discovered that 106 users have their school correctly stored in `profiles.school_id` but not in `user_roles.school_id`.

## Current Status ✅

**The system is working correctly with the hybrid approach:**
- Reports API uses `user_roles.school_id` when available
- Falls back to `profiles.school_id` when `user_roles` is NULL
- **No user loses their school assignment**

## Background

### The Problem
Two systems coexist for storing organizational data:
1. **Old schools** (Liceo Llolleo, Santa Marta Valdivia, Institución Sweet): Use `profiles.school_id`
2. **New schools** (FNE, Los Pellines, Madrigal, etc.): Use `user_roles.school_id`

### Why Not Just Sync Everything?
Initial analysis showed that **107 users would LOSE data** if we blindly synced `profiles ← user_roles`:
- 51 Liceo Llolleo users: profiles ✅ correct, user_roles ❌ NULL
- 36 Santa Marta Valdivia users: profiles ✅ correct, user_roles ❌ NULL
- 19 Institución Sweet users: profiles ✅ correct, user_roles ❌ NULL
- 2 FNE users: profiles ❌ wrong (Liceo), user_roles ✅ correct (FNE)

## Migration Tools (OPTIONAL)

If you want to consolidate data and have `user_roles` be the single source of truth, we've created safe migration tools:

### 1. Preview Changes
```bash
node scripts/apply-school-assignment-migration.js
```

Shows exactly which 106 users will be assigned and to which schools.

### 2. Apply Migration

**Option A: Supabase SQL Editor (RECOMMENDED)**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `database/migrations/sync-school-assignments-to-user-roles.sql`
3. Run the script
4. Review the notices and verification output
5. Type `COMMIT;` to apply or `ROLLBACK;` to cancel

**Option B: Command Line**
```bash
node scripts/apply-school-assignment-migration.js --apply
```

### 3. What Gets Updated

**ONLY these 3 schools** (verified as safe):
- **Liceo Nacional de Llolleo** (ID: 17): 47 users
- **Santa Marta de Valdivia** (ID: 3): 38 users
- **Institución Sweet** (ID: 11): 21 users

**Excluded from migration** (to prevent data corruption):
- Any user where `profiles.school_id` might be incorrect
- Schools where user_roles is already the authoritative source

### 4. Safety Features

✅ **Transaction-wrapped**: Can rollback if anything goes wrong
✅ **NULL-only updates**: Never overwrites existing user_roles data
✅ **Verified schools only**: Only touches the 3 confirmed-safe schools
✅ **Dry-run mode**: Preview changes before applying
✅ **Detailed logging**: See exactly what changes

## When to Apply Migration

**You should apply this migration if:**
- You want `user_roles` to be the single source of truth
- You plan to deprecate `profiles.school_id` in the future
- You want cleaner code without fallback logic

**You can skip this migration if:**
- The current hybrid approach is working fine
- You're comfortable with both tables having data
- You don't want to risk any data changes

## Current Fix (Already Applied)

The reports API now uses this logic:
```javascript
const effectiveSchoolId = user_roles.school_id ?? profiles.school_id;
```

This means:
- ✅ FNE users show "Fundación Nueva Educación" (from user_roles)
- ✅ Liceo Llolleo users show "Liceo Nacional de Llolleo" (from profiles)
- ✅ All users show correct school regardless of which table has the data

## Files Reference

### Migration Files
- `database/migrations/sync-school-assignments-to-user-roles.sql` - SQL migration script
- `scripts/apply-school-assignment-migration.js` - JavaScript migration runner

### Analysis Files
- `scripts/analyze-sync-safety.js` - Comprehensive safety analysis
- `scripts/identify-users-needing-assignment.js` - Lists users needing assignment

### Reports API
- `pages/api/reports/detailed.ts` - Uses hybrid approach (lines 316-321)

## Recommendation

**Current approach is safe and working.** The migration is optional - only apply if you want to consolidate data into `user_roles` for future simplification.

If you choose to migrate:
1. ⚠️ **Backup database first**
2. Run dry-run to preview
3. Apply during low-traffic time
4. Verify results match expected 106 users
5. Monitor reports to ensure everything works

---

**Questions?** Review the analysis scripts to understand exactly what will change before applying any migration.
