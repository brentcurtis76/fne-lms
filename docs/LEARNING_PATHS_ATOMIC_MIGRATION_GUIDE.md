# Learning Paths Atomic Transaction Migration Guide

## Overview

This guide explains how to upgrade the Learning Paths feature to use true database-level atomic transactions, eliminating any risk of data corruption during multi-table operations.

## Why This Migration?

The original implementation used application-level transaction handling:
```javascript
// Original approach - small risk window
try {
  const path = await createPath();
  const courses = await createCourses();
  if (error) {
    await deletePath(); // What if this fails?
  }
}
```

The new implementation uses PostgreSQL stored procedures:
```javascript
// New approach - zero risk
const result = await supabase.rpc('create_full_learning_path', {...});
// Either everything succeeds or nothing happens - guaranteed!
```

## Migration Steps

### 1. Apply the RPC Functions to Database

Execute the SQL script in Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql
2. Copy the contents of `/database/learning-paths-rpc-functions.sql`
3. Paste and execute in the SQL Editor
4. Verify success message: "✅ All Learning Paths RPC functions created successfully"

### 2. Deploy Updated API Code

The API service layer has been updated to use the new RPC functions:

- `/lib/services/learningPathsService.ts` - Updated to use RPC calls
- `/pages/api/learning-paths/[id].ts` - Updated to pass userId for permissions
- `/pages/api/learning-paths/batch-assign.ts` - New endpoint for atomic batch assignments

### 3. Verify the Migration

Test the atomic operations:

```bash
# Test creating a learning path
curl -X POST /api/learning-paths \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Test Path",
    "description": "Testing atomic creation",
    "courseIds": ["valid-id-1", "invalid-id-999"]
  }'
# Should fail completely - no partial data created
```

## New Features Enabled

### 1. True Atomic Create/Update
- Zero risk of orphaned learning paths
- Automatic rollback on any failure
- Network interruptions can't cause partial commits

### 2. Batch Assignments
```javascript
// Assign to 50 users and 10 groups atomically
POST /api/learning-paths/batch-assign
{
  "pathId": "path-id",
  "userIds": [...50 user IDs...],
  "groupIds": [...10 group IDs...]
}
```

### 3. Built-in Permission Checks
- Database functions verify permissions
- Consistent authorization across all operations
- No bypass possible at application layer

## Performance Benefits

1. **Fewer Round Trips**: Single RPC call vs multiple queries
2. **Database Optimization**: PostgreSQL optimizes stored procedures
3. **Reduced Network Overhead**: One request instead of 2-3

## Error Handling

The new system provides clearer error messages:

```javascript
// Old: Generic "Failed to create courses"
// New: "Course with ID 550e8400-e29b-41d4-a716-446655440999 does not exist"
```

## Rollback Instructions

If needed, the original service methods are preserved in git history:
```bash
git show HEAD~5:lib/services/learningPathsService.ts
```

However, rollback is not recommended as the new implementation is strictly superior.

## Security Improvements

1. **SQL Injection Protection**: Parameters are properly escaped by PostgreSQL
2. **Permission Checks**: Enforced at database level
3. **Data Validation**: Built into the stored procedures

## Next Steps

1. Apply the migration to production
2. Monitor for any errors (should be none)
3. Consider applying same pattern to other multi-table operations in FNE LMS

## Support

For any issues with this migration:
- Check PostgreSQL logs in Supabase Dashboard
- Verify RPC functions exist: `SELECT proname FROM pg_proc WHERE proname LIKE '%learning_path%'`
- Contact technical support with error messages