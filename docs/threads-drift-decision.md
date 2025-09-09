# Threads Drift Decision Document

**Date**: 2025-01-04
**Author**: System
**Decision**: **Option A - Update tests/code to use message_threads** (RECOMMENDED)

## Background

The codebase references both `community_threads` and `message_threads`:
- Database has `message_threads` table (confirmed in database.generated.ts)
- Some tests/code reference `community_threads` (likely outdated)

## Analysis

### Current State
- **Database Reality**: `message_threads` exists with proper structure
- **Code References**: Mixed usage in ~10 files
- **Test Files**: Some tests still use `community_threads`

### Option A: Update to message_threads ✅ RECOMMENDED

**Rationale**:
1. `message_threads` is the actual table in production
2. Less database changes = less risk
3. Simple find/replace operation
4. Maintains existing data integrity

**Implementation**:
```typescript
// Before (in test files)
const thread = await supabase
  .from('community_threads')
  .insert({...})

// After  
const thread = await supabase
  .from('message_threads')
  .insert({...})
```

**Files to Update**:
- `tests/workspace/groupAssignmentComments.test.tsx`
- `tests/workspace/discussionCountsIntegration.test.ts`
- `utils/messagingUtils-simple.ts` (if still used)
- `scripts/test-thread-creation.js`

### Option B: Create compatibility view

**SQL**:
```sql
CREATE OR REPLACE VIEW community_threads AS
SELECT 
  id,
  workspace_id,
  title,
  created_by,
  created_at,
  updated_at,
  is_pinned,
  is_locked,
  category_id,
  last_activity_at
FROM message_threads;

-- Grant same permissions
GRANT SELECT ON community_threads TO authenticated;
```

**Rationale**:
- Provides backward compatibility
- No code changes needed
- Adds maintenance overhead
- Not recommended unless critical legacy code depends on it

## Exact Test/Code Updates

### Files to Update:
1. `tests/workspace/groupAssignmentComments.test.tsx`
2. `tests/workspace/discussionCountsIntegration.test.ts`
3. `utils/messagingUtils-simple.ts`
4. `scripts/test-thread-creation.js`
5. `scripts/test-thread-creation-with-categories.js`

### Search Selectors:
```bash
# Find all references
grep -r "community_threads" --include="*.ts" --include="*.tsx" --include="*.js"

# Update references
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) \
  -exec sed -i '' 's/community_threads/message_threads/g' {} +
```

## Verification Checklist

- [ ] Run search command to find all `community_threads` references
- [ ] Update each file to use `message_threads`
- [ ] Verify types import from `Database['public']['Tables']['message_threads']`
- [ ] Run affected test suites: `npm test tests/workspace/`
- [ ] Confirm no runtime errors in development
- [ ] Check that message/thread features still work in UI

2. **Run Tests**:
```bash
# Run affected test suites
npm test tests/workspace/
npm test -- --testNamePattern="thread"
```

3. **Verify Queries**:
```sql
-- Check that message_threads has expected data
SELECT COUNT(*) FROM message_threads;
SELECT * FROM message_threads LIMIT 5;
```

## Recommendation

**GO WITH OPTION A**: Update all code to use `message_threads`

### Immediate Actions:
1. Update test files to use correct table name
2. Remove any references to `community_threads` 
3. Update type imports to use `message_threads` types
4. Run full test suite to verify

### Implementation Checklist:
- [ ] Update test files (4 files identified)
- [ ] Update utils if needed
- [ ] Update scripts (2 files identified)
- [ ] Run test suite
- [ ] Update documentation if any references exist

## Rollback Plan

If issues arise:
1. Git revert the changes
2. Apply Option B (view) as temporary fix
3. Investigate and fix properly

## Notes

- No data migration needed (table already correct)
- No database changes required
- Estimated effort: 30 minutes
- Risk level: LOW (simple rename operation)