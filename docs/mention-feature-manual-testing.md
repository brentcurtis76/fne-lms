# Manual Testing Checklist for @Mention Feature

## Pre-Test Setup
- [ ] Identify two test users in the same community
- [ ] Note their names and IDs for verification
- [ ] Clear browser cache and cookies
- [ ] Open browser developer console

## Test Execution

### Phase 1: Post Creation (as User A)

1. **Login and Navigation**
   - [ ] Log in as User A
   - [ ] Navigate to Community Workspace
   - [ ] Click "Create Post" button

2. **Mention Autocomplete**
   - [ ] Type "@" in the editor
   - [ ] **VERIFY:** Dropdown appears immediately
   - [ ] Type first 2-3 letters of User B's name
   - [ ] **VERIFY:** User B appears in suggestions
   - [ ] **VERIFY:** Avatar and role are displayed correctly

3. **Mention Selection**
   - [ ] Click on User B from dropdown
   - [ ] **VERIFY:** Name is inserted as blue tag
   - [ ] **VERIFY:** Tag cannot be partially edited
   - [ ] Complete the post message

4. **Post Submission**
   - [ ] Click "Publicar" button
   - [ ] **VERIFY:** Post appears in feed
   - [ ] **VERIFY:** Mention is displayed as blue link
   - [ ] **VERIFY:** Hovering shows underline effect

### Phase 2: Notification Receipt (as User B)

5. **Switch Users**
   - [ ] Log out from User A
   - [ ] Log in as User B

6. **Notification Check**
   - [ ] **VERIFY:** Notification bell has indicator (red dot/number)
   - [ ] Click notification bell
   - [ ] **VERIFY:** Mention notification is at top of list
   - [ ] **VERIFY:** Notification text says "[User A] te mencionó en una publicación"

7. **Navigation Test**
   - [ ] Click the mention notification
   - [ ] **VERIFY:** Navigates to the specific post
   - [ ] **VERIFY:** Can see the post with mention
   - [ ] **VERIFY:** Own name is highlighted in blue

### Phase 3: Backend Verification

8. **Database Checks** (Run verification script or queries)
   - [ ] Run: `node scripts/verify-mention-feature.js`
   - [ ] **VERIFY:** post_mentions record exists
   - [ ] **VERIFY:** notification record exists
   - [ ] **VERIFY:** All IDs match correctly

## Edge Cases to Test

### Autocomplete Edge Cases
- [ ] Type "@" and immediately backspace - dropdown should disappear
- [ ] Type non-existent name - should show "No users found"
- [ ] Type "@" at end of long text - dropdown position correct
- [ ] Multiple mentions in one post - all work correctly

### Permission Edge Cases
- [ ] User not in same community - should not appear in suggestions
- [ ] Inactive users - should not appear in suggestions
- [ ] Self-mention - verify if allowed or filtered

### UI Edge Cases
- [ ] Create post with only a mention (no other text)
- [ ] Mention at start, middle, and end of text
- [ ] Very long user names - display correctly
- [ ] Mobile view - autocomplete works on touch devices

## Performance Checks
- [ ] Autocomplete responds within 200ms
- [ ] No console errors during the flow
- [ ] Network tab shows successful API calls
- [ ] No duplicate API requests

## Screenshot Checklist
Capture screenshots of:
1. [ ] Autocomplete dropdown open
2. [ ] Selected mention in editor
3. [ ] Published post with mention
4. [ ] Notification bell with indicator
5. [ ] Notification dropdown
6. [ ] Final navigation to mentioned post

## Issues Log
Document any issues found:

| Step | Expected | Actual | Severity |
|------|----------|--------|----------|
|      |          |        |          |

## Sign-off
- [ ] All checkpoints passed
- [ ] No critical issues found
- [ ] Feature ready for production

**Tested by:** ________________  
**Date:** ________________  
**Environment:** ________________