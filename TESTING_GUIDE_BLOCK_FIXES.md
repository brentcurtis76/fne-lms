# Testing Guide - Block Deletion and Visibility Fixes

## Automated Test Results ✅
All automated tests passed successfully:
- Visibility field: ✅ Working
- Block deletion: ✅ Working  
- Visibility toggle: ✅ Working

## Manual Testing Steps

### Prerequisites
1. Database migration has been applied (add_visibility_to_blocks.sql)
2. Latest code is deployed
3. You have admin access to the course builder

### Test 1: Block Deletion
1. Navigate to Course Builder → Select any course → Select a module → Select a lesson
2. Add a few test blocks (text, image, etc.)
3. Save the lesson
4. Try to delete a block using the trash icon
5. **Expected**: Block should be deleted immediately and not reappear
6. Save the lesson
7. Refresh the page
8. **Expected**: Deleted block should remain deleted

### Test 2: Block Visibility Toggle
1. In the same lesson, click the collapse/expand icon on any block
2. **Expected**: Block should collapse to show only title
3. Save the lesson
4. Refresh the page
5. **Expected**: Collapsed blocks should remain collapsed
6. Expand a collapsed block
7. Save and refresh
8. **Expected**: Expanded blocks should remain expanded

### Test 3: Mixed Operations
1. Create a lesson with 5 blocks
2. Collapse blocks 2 and 4
3. Delete block 3
4. Save the lesson
5. Refresh the page
6. **Expected**:
   - Block 3 should be gone
   - Blocks 2 and 4 should still be collapsed
   - Other blocks should be visible

### Test 4: New Blocks
1. Add a new block to an existing lesson
2. **Expected**: New blocks should be visible by default
3. Collapse the new block
4. Save and refresh
5. **Expected**: New block should remain collapsed

## Known Working Features
- ✅ Block deletion uses correct Supabase syntax (.eq instead of .match)
- ✅ Visibility state persists to database (is_visible field)
- ✅ Position updates work correctly after deletion
- ✅ UI state syncs with database state

## Troubleshooting
If blocks are not deleting or visibility is not persisting:
1. Check browser console for errors
2. Verify the database migration was applied:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'blocks' AND column_name = 'is_visible';
   ```
3. Check network tab to ensure API calls are successful
4. Clear browser cache and try again

## User-Reported Issue Resolution
Original issue: "En el módulo 2, borro está parte de la lección continuamente y no se borra. Me pasa con todo lo que borro. No se borra y si lo pongo como invisible, tampoco se queda invisibilizado."

**Status**: FIXED ✅
- Deletion now works correctly
- Visibility state now persists properly