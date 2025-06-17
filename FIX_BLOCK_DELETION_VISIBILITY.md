# Block Deletion and Visibility Fix

## Problem Summary
Users reported that blocks in the lesson builder:
1. Cannot be deleted - they reappear after deletion
2. Cannot be hidden - visibility toggle doesn't persist

## Root Causes Found
1. ✅ **Deletion issue** - Already fixed: The code was using `.match()` instead of `.eq()` for Supabase queries
2. ❌ **Visibility issue** - Fixed now: Visibility state was only stored in UI memory, not persisted to database

## Fixes Applied

### 1. Database Schema Update
Created migration file: `/database/add_visibility_to_blocks.sql`
- Adds `is_visible` boolean column to blocks table
- Defaults to `true` for existing blocks
- Includes performance index

### 2. Code Updates
- Updated `BaseBlock` interface in `/types/blocks.ts` to include `is_visible` field
- Modified lesson editor to:
  - Initialize collapsed state from database `is_visible` field
  - Update `is_visible` when toggling visibility
  - Save visibility state to database on save

### 3. How to Apply the Fix

**Step 1: Apply Database Migration**
1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Run the contents of `/database/add_visibility_to_blocks.sql`

**Step 2: Verify Migration**
```sql
-- Check if column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'blocks' 
AND column_name = 'is_visible';
```

**Step 3: Test the Fix**
1. Open any lesson in the course builder
2. Try deleting a block - it should stay deleted
3. Try collapsing/expanding blocks - state should persist after save
4. Refresh the page - collapsed blocks should remain collapsed

## Technical Details

### Before (Visibility Bug)
```typescript
// Only UI state, not persisted
const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(...)
```

### After (Fixed)
```typescript
// Persisted to database
const blockDataToSave = {
  ...cleanBlock,
  is_visible: !collapsedBlocks.has(block.id), // Save visibility state
};
```

## Notes
- The deletion bug was already fixed by using `.eq()` instead of `.match()`
- Make sure to run the database migration before testing
- All existing blocks will be visible by default after migration