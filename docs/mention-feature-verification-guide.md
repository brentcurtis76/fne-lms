# @Mention Feature Verification Guide

## Visual Checkpoints for Frontend Verification

### Part 1: Creating a Post with Mentions

#### Checkpoint 1: Autocomplete Suggestion Box
**When:** User types `@` followed by letters
**Expected:** 
- A dropdown appears below the cursor
- Shows matching users from the community
- Displays user avatars, names, and roles
- Updates in real-time as more letters are typed

```
┌─────────────────────────────────┐
│ @mar                            │
├─────────────────────────────────┤
│ 👤 María García                 │
│    Docente                      │
│                                 │
│ 👤 Mario López                  │
│    Líder de Comunidad           │
└─────────────────────────────────┘
```

#### Checkpoint 2: Mention Tag in Editor
**When:** User selects someone from the dropdown
**Expected:**
- Name appears as a styled mention tag
- Blue background color (#e0f2fe)
- Blue text color (#0369a1)
- Rounded corners
- Cannot be partially edited (acts as a single unit)

```
Hey @María García, check out this feature!
     ^^^^^^^^^^^^
     (styled as blue tag)
```

#### Checkpoint 3: Published Post Display
**When:** Post is submitted and displayed
**Expected:**
- Mention appears as blue, clickable text
- Hover shows underline
- Clicking navigates to user profile

### Part 2: Receiving Mention Notifications

#### Checkpoint 4: Notification Bell Indicator
**When:** User B logs in after being mentioned
**Expected:**
- Red dot or number badge on notification bell icon
- Located in the top navigation bar

```
🔔¹  (bell with indicator)
```

#### Checkpoint 5: Notification List
**When:** User clicks the notification bell
**Expected:**
- Dropdown shows new notification
- Title: "[User A name] te mencionó en una publicación"
- Shows timestamp
- Unread notifications have different background

```
┌─────────────────────────────────────┐
│ Notificaciones                      │
├─────────────────────────────────────┤
│ 🔵 Juan Pérez te mencionó en una   │
│    publicación                      │
│    hace 2 minutos                   │
├─────────────────────────────────────┤
│    María López comentó tu           │
│    publicación                      │
│    hace 1 hora                      │
└─────────────────────────────────────┘
```

#### Checkpoint 6: Navigation to Post
**When:** User clicks the mention notification
**Expected:**
- Navigates to the specific post
- Post is visible with the mention highlighted
- May scroll to the post if in a feed

## Backend Verification Queries

### 1. Verify post_mentions Record

```sql
-- Check if mention was recorded
SELECT 
    pm.*,
    p.first_name || ' ' || p.last_name as mentioned_user,
    cp.content->>'text' as post_text
FROM post_mentions pm
JOIN profiles p ON pm.mentioned_user_id = p.id
JOIN community_posts cp ON pm.post_id = cp.id
WHERE pm.post_id = '[POST_ID]';
```

### 2. Verify Notification Record

```sql
-- Check if notification was created
SELECT 
    un.*,
    p.first_name || ' ' || p.last_name as recipient
FROM user_notifications un
JOIN profiles p ON un.user_id = p.id
WHERE 
    un.user_id = '[USER_B_ID]'
    AND un.category = 'social'
    AND un.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY un.created_at DESC;
```

### 3. Verify Complete Flow

```sql
-- Complete verification query
WITH recent_posts AS (
    SELECT 
        cp.id,
        cp.content->>'text' as text,
        cp.created_at,
        author.first_name || ' ' || author.last_name as author_name
    FROM community_posts cp
    JOIN profiles author ON cp.author_id = author.id
    WHERE cp.created_at > NOW() - INTERVAL '10 minutes'
)
SELECT 
    rp.id as post_id,
    rp.text,
    rp.author_name,
    pm.mentioned_user_id,
    mentioned.first_name || ' ' || mentioned.last_name as mentioned_name,
    un.id as notification_id,
    un.title as notification_title,
    un.created_at as notification_created
FROM recent_posts rp
LEFT JOIN post_mentions pm ON rp.id = pm.post_id
LEFT JOIN profiles mentioned ON pm.mentioned_user_id = mentioned.id
LEFT JOIN user_notifications un ON 
    un.user_id = pm.mentioned_user_id 
    AND un.created_at >= rp.created_at
ORDER BY rp.created_at DESC;
```

## Expected Results Summary

✅ **Frontend Flow:**
- Autocomplete appears on @ typing
- Users can be selected from dropdown
- Mentions render as styled tags
- Published posts show clickable mentions
- Recipients see notification indicators
- Notifications link to the correct post

✅ **Backend Data:**
- `post_mentions` table has correct post_id and user_id
- `user_notifications` table has mention notification
- Notification links to the correct post URL
- All timestamps are consistent

## Troubleshooting

If any checkpoint fails:

1. **Autocomplete not appearing:**
   - Check browser console for API errors
   - Verify `/api/community/search-users` is accessible
   - Ensure users are in the same community

2. **Mentions not saving:**
   - Check if TipTap JSON is being parsed correctly
   - Verify `post_mentions` table exists and has proper permissions

3. **Notifications not appearing:**
   - Check if notification triggers are configured
   - Verify notification service is running
   - Check user notification preferences

4. **Navigation not working:**
   - Verify notification `related_url` is correct
   - Check if post still exists
   - Ensure user has permission to view the post