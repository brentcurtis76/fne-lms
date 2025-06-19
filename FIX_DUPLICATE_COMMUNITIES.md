# Fix for Duplicate Communities Issue

## Problem Description

When a "Líder de Comunidad" (Community Leader) role is deleted and then re-assigned to the same user, the system creates a new community instead of reusing the existing one. This results in duplicate communities with the same name, causing confusion and data inconsistency.

### Root Cause

1. The `createCommunityForLeader` function in `roleUtils.ts` always creates a new community without checking if one already exists
2. There's no unique constraint on community names within the same school/generation scope
3. When a role is deleted, the associated community remains in the database but becomes orphaned

## Solution Overview

The fix implements three key improvements:

1. **Database-level duplicate prevention**: Add a unique constraint and a new function that checks for existing communities before creating new ones
2. **Application-level fix**: Update the `createCommunityForLeader` function to use the new database function
3. **Cleanup mechanism**: Provide tools to clean up existing duplicates and orphaned communities

## Implementation Details

### 1. Database Changes (`database/fix-duplicate-communities.sql`)

- **Unique Constraint**: Prevents duplicate community names within the same school/generation scope
  ```sql
  ALTER TABLE growth_communities 
  ADD CONSTRAINT unique_community_name_per_scope 
  UNIQUE (name, school_id, COALESCE(generation_id, '00000000-0000-0000-0000-000000000000'));
  ```

- **Get or Create Function**: Database function that safely retrieves existing communities or creates new ones
  ```sql
  CREATE OR REPLACE FUNCTION get_or_create_community_for_leader(
    p_leader_id UUID,
    p_school_id UUID,
    p_generation_id UUID DEFAULT NULL
  ) RETURNS UUID
  ```

- **Cleanup Function**: Removes orphaned communities with no active roles
  ```sql
  CREATE OR REPLACE FUNCTION cleanup_orphaned_communities()
  ```

### 2. Application Changes (`utils/roleUtils.ts`)

Updated the `createCommunityForLeader` function to:
- Use the new database function `get_or_create_community_for_leader`
- Handle the case where a community already exists
- Provide better error handling for constraint violations

### 3. Migration Script (`scripts/apply-duplicate-communities-fix.js`)

A Node.js script that:
- Applies the SQL fixes to the database
- Cleans up existing duplicates
- Provides statistics on communities and orphaned records

## How to Apply the Fix

### Option 1: Using the Migration Script

```bash
cd ~/Documents/fne-lms-working
node scripts/apply-duplicate-communities-fix.js
```

### Option 2: Manual SQL Execution

1. Go to Supabase Dashboard > SQL Editor
2. Copy the contents of `database/fix-duplicate-communities.sql`
3. Execute the SQL

### Option 3: Using Supabase CLI

```bash
supabase db push database/fix-duplicate-communities.sql
```

## Testing the Fix

1. **Create a Community Leader Role**:
   - Go to user management
   - Assign "Líder de Comunidad" role to a user
   - Note the community created

2. **Delete and Re-add the Role**:
   - Remove the role from the user
   - Re-assign the same role
   - Verify that the same community is reused (no duplicate created)

3. **Check for Duplicates**:
   ```sql
   SELECT name, COUNT(*) as count 
   FROM growth_communities 
   WHERE name LIKE 'Comunidad de %'
   GROUP BY name 
   HAVING COUNT(*) > 1;
   ```

## Cleanup Operations

### Remove Orphaned Communities

To clean up communities with no active roles:

```sql
SELECT * FROM cleanup_orphaned_communities();
```

### Check Community Statistics

```sql
-- Check all communities and their role associations
SELECT 
  gc.id,
  gc.name,
  gc.school_id,
  COUNT(ur.id) as active_roles
FROM growth_communities gc
LEFT JOIN user_roles ur ON ur.community_id = gc.id AND ur.is_active = true
GROUP BY gc.id, gc.name, gc.school_id
ORDER BY active_roles DESC, gc.name;
```

## Prevention Going Forward

1. **Always use the role assignment functions** in `roleUtils.ts` rather than direct database inserts
2. **Monitor for duplicates** periodically using the check queries
3. **Consider implementing a scheduled cleanup** for orphaned communities

## Rollback Plan

If needed, you can rollback the changes:

```sql
-- Remove the unique constraint
ALTER TABLE growth_communities 
DROP CONSTRAINT IF EXISTS unique_community_name_per_scope;

-- Drop the new functions
DROP FUNCTION IF EXISTS get_or_create_community_for_leader;
DROP FUNCTION IF EXISTS cleanup_orphaned_communities;
```

## Related Files

- `/database/fix-duplicate-communities.sql` - Main SQL fix
- `/utils/roleUtils.ts` - Updated application logic
- `/scripts/apply-duplicate-communities-fix.js` - Migration script
- `/components/RoleAssignmentModal.tsx` - UI component that triggers role assignment