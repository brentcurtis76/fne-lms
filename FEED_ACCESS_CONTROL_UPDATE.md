# Instagram Feed Access Control Update

## Summary
Fixed community-based access control for the Instagram-style feed and updated the UI to display custom community names in the dropdown selector.

## Changes Made

### 1. Community Name Display Fix
Updated `workspaceUtils.ts` to fetch and display custom community names:
- Modified `getAllCommunitiesForAdmin()`, `getCommunitiesForConsultant()`, and `getCommunitiesForMember()` to join with `community_workspaces` table
- Added `custom_name` and `display_name` fields to `CommunityInfo` interface
- `display_name` uses custom name when available, falls back to original name

Updated `workspace.tsx` to use the display names:
- Community selector button now shows `display_name`
- Dropdown list items show `display_name`

### 2. Post Visibility Access Control
Created proper RLS policies for community-based post visibility:

#### Created Function: `can_access_workspace(user_id, workspace_id)`
Determines if a user can access a workspace based on:
- **Admins**: Can access all workspaces
- **Community Members**: Can access their own community's workspace
- **Consultants**: Can access workspaces of communities in their assigned schools

#### Updated RLS Policies:
- **SELECT**: Users can only view posts from workspaces they have access to
- **INSERT**: Users can only create posts in workspaces they have access to
- **UPDATE/DELETE**: Users can only modify their own posts (unchanged)

## Access Control Matrix

| Role | Can See Posts From | Can Create Posts In |
|------|-------------------|-------------------|
| Admin | All communities | All communities |
| Consultor | Communities in assigned schools | Communities in assigned schools |
| Equipo Directivo | Their community only | Their community only |
| Líder Generación | Their community only | Their community only |
| Líder Comunidad | Their community only | Their community only |
| Docente | Their community only | Their community only |

## Testing Steps
1. Log in as different role types
2. Verify community dropdown shows custom names (e.g., "Equipo FNE" instead of "Comunidad de Arnoldo Cisternas")
3. Verify users can only see posts from their accessible communities
4. Test creating posts - should only work in accessible communities
5. Switch between communities (for users with multiple) and verify feed updates

## Database Changes
- Added `can_access_workspace()` function
- Updated RLS policies on `community_posts` table
- No schema changes required

## Files Modified
- `/utils/workspaceUtils.ts` - Added custom name fetching
- `/pages/community/workspace.tsx` - Updated UI to use display names
- `/database/fix-post-visibility-simple.sql` - RLS policy updates

## Notes
- The system maintains backward compatibility - if no custom name exists, the original name is used
- Access control is enforced at the database level through RLS policies
- The feed service already filters by workspace_id, so the UI behavior remains unchanged