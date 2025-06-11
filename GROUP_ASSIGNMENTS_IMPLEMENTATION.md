# FNE LMS - Group Assignments Implementation

## Overview
Phase 2 of the assignment system adds group assignment functionality to the existing Collaborative Space, allowing communities to work together on assignments.

## Database Schema

### New Tables Created

1. **group_assignment_members**
   - Tracks which users belong to which groups
   - Supports group roles (leader/member)
   - Enforces unique constraints per assignment and group

2. **group_assignment_submissions**
   - Stores group submissions with collaborative content
   - Tracks submission status, scores, and feedback
   - Links to the group that submitted

3. **group_assignment_discussions**
   - Creates discussion threads for each group
   - Links to the messaging system for real-time communication

### Modified Tables

1. **lesson_assignments**
   - Added `assignment_for` field ('individual' or 'group')
   - Added `assigned_to_community_id` for community-specific assignments
   - Added group size constraints and self-grouping settings

## Features Implemented

### 1. Group Assignment View in Collaborative Space
- New "Tareas Grupales" section in workspace
- Shows all group assignments for the community
- Displays assignment details with lesson context
- Status indicators for group membership

### 2. Group Management
- Create new groups (with size constraints)
- Join existing groups (if allowed)
- View all groups for an assignment
- Leave groups before submission

### 3. Group Discussion Threads
- Automatic thread creation for each group
- Real-time messaging within groups
- Member mentions and notifications
- Private discussions per group

### 4. Collaborative Submission
- Group members can submit work together
- Support for text content and file links
- All members receive the same grade
- Submission history tracking

### 5. Teacher Features
- Create group assignments with community targeting
- Set group size limits (min/max)
- Control self-grouping permissions
- Grade entire groups at once

## File Structure

### New Files Created
```
/database/add-group-assignments.sql
/lib/services/groupAssignments.js
/components/assignments/GroupSubmissionModal.tsx
/components/assignments/CreateGroupModal.tsx
/pages/community/workspace/assignments/[id]/groups.tsx
/pages/community/workspace/assignments/[id]/discussion.tsx
/scripts/apply-group-assignments.js
```

### Modified Files
```
/pages/community/workspace.tsx
/components/workspace/WorkspaceSidebar.tsx
/types/assignments.ts
/lib/services/assignments.js
```

## Usage Instructions

### For Teachers/Admins

1. **Creating Group Assignments**
   - Go to "Mis Tareas" → "Nueva Tarea"
   - Select assignment type as "group"
   - Choose target community
   - Set group size limits
   - Configure self-grouping options

2. **Managing Groups**
   - View all groups from the assignment submissions page
   - Monitor group formation progress
   - Access group discussions if needed

### For Students

1. **Viewing Group Assignments**
   - Navigate to Collaborative Space
   - Click "Tareas Grupales" section
   - See all group assignments for your community

2. **Forming Groups**
   - Click "Ver Grupos" to see existing groups
   - Join an available group or create a new one
   - Invite community members to your group

3. **Collaborating**
   - Click "Ver Discusión" to access group chat
   - Coordinate work with group members
   - Share files and ideas

4. **Submitting Work**
   - Click "Entregar Trabajo" when ready
   - Add submission content and file links
   - Confirm all members have reviewed
   - Submit on behalf of the group

## Technical Implementation

### API Endpoints
All group assignment operations use Supabase client-side SDK with RLS policies for security.

### Real-time Features
- Group discussions use Supabase real-time subscriptions
- Activity updates propagate to all group members
- Notifications for group invitations and submissions

### Security
- RLS policies ensure users can only access their group's data
- Teachers can view all groups in their courses
- Private discussions are restricted to group members

## Database Migration

To apply the group assignments schema:

```bash
npm run apply:group-assignments
# or
node scripts/apply-group-assignments.js
```

## Testing Checklist

- [ ] Create a group assignment as teacher
- [ ] View group assignments in collaborative space
- [ ] Create a new group as student
- [ ] Join an existing group
- [ ] Access group discussion thread
- [ ] Send messages in group discussion
- [ ] Submit group work
- [ ] View submission as teacher
- [ ] Grade group submission
- [ ] Verify all members receive grade

## Future Enhancements

1. **Peer Evaluation**
   - Allow group members to rate each other's contributions
   - Teacher visibility into individual participation

2. **Group Roles**
   - More granular roles (researcher, writer, presenter)
   - Role-based permissions within groups

3. **Progress Tracking**
   - Visual indicators of group progress
   - Milestone tracking for long projects

4. **File Collaboration**
   - Direct file upload to group workspace
   - Version control for group documents

5. **Smart Group Formation**
   - Algorithm-based group suggestions
   - Skill-based matching options