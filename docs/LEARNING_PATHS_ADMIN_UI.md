# Learning Paths Admin UI Documentation

## Overview

The Learning Paths Admin UI provides a comprehensive interface for creating, managing, and assigning learning paths in the FNE LMS system. This feature is accessible to users with admin, equipo_directivo, or consultor roles.

## Access Points

### Navigation
- **Sidebar**: "Rutas de Aprendizaje" under the main navigation
- **URL**: `/admin/learning-paths`
- **Permissions**: admin, equipo_directivo, consultor roles

## Features

### 1. Learning Paths Listing Page (`/admin/learning-paths`)

The main listing page displays all existing learning paths in a table format.

**Features:**
- View all learning paths with key information:
  - Name and description
  - Number of courses included
  - Creator name
  - Action buttons (Edit, Assign, Delete)
- "Create New Path" button for adding new learning paths
- Empty state with clear call-to-action when no paths exist

**Actions:**
- **Edit** (pencil icon): Navigate to the edit page
- **Assign** (users icon): Navigate to the assignment page
- **Delete** (trash icon): Opens confirmation modal before deletion

### 2. Create Learning Path (`/admin/learning-paths/new`)

A two-panel interface for creating new learning paths.

**Left Panel - Available Courses:**
- Searchable list of all courses in the system
- Real-time filtering as you type
- Click to add courses to the path
- Visual indicators for already-selected courses

**Right Panel - Path Builder:**
- Name and description fields (required)
- Selected courses list with:
  - Drag-and-drop reordering
  - Sequence numbers
  - Remove button (X) for each course
- Save and Cancel buttons

**Features:**
- Drag-and-drop course reordering using react-beautiful-dnd
- Automatic sequence numbering
- Validation for required fields
- Success toast and redirect on save

### 3. Edit Learning Path (`/admin/learning-paths/[id]/edit`)

Similar to the create page but pre-populated with existing data.

**Features:**
- Same two-panel layout as create page
- Pre-loaded path name, description, and courses
- Permission checking (only creator or admin can edit)
- Maintains course selections and order

### 4. Assign Learning Path (`/admin/learning-paths/[id]/assign`)

Interface for assigning paths to users and/or groups.

**Features:**
- Tab navigation between Users and Groups
- Searchable lists for both users and groups
- Checkbox selection for multiple assignments
- Selection summary showing count of selected items
- "Clear selection" button
- Batch assignment with atomic operation

**User Tab:**
- List of all users with name and email
- Search by name or email
- Multiple selection with checkboxes

**Group Tab:**
- List of all groups with member counts
- Search by group name or description
- Multiple selection with checkboxes

## User Experience Flow

### Creating a Learning Path
1. Click "Create New Path" from the listing page
2. Enter path name and description
3. Search and click courses to add them
4. Drag courses to reorder as needed
5. Click "Save Path" to create

### Editing a Learning Path
1. Click the edit icon from the listing page
2. Modify name, description, or course selection
3. Reorder courses as needed
4. Click "Save Changes"

### Assigning a Learning Path
1. Click the assign icon from the listing page
2. Choose between Users or Groups tab
3. Search and select recipients
4. Review selection summary
5. Click "Confirm Assignment"

### Deleting a Learning Path
1. Click the delete icon from the listing page
2. Confirm in the modal dialog
3. Path and all assignments are removed

## Technical Implementation

### Components
- `/pages/admin/learning-paths.tsx` - Main listing page
- `/pages/admin/learning-paths/new.tsx` - Create page
- `/pages/admin/learning-paths/[id]/edit.tsx` - Edit page
- `/pages/admin/learning-paths/[id]/assign.tsx` - Assignment page

### API Integration
All components use the Learning Paths API endpoints:
- `GET /api/learning-paths` - List all paths
- `POST /api/learning-paths` - Create new path
- `GET /api/learning-paths/[id]` - Get single path with courses
- `PUT /api/learning-paths/[id]` - Update path
- `DELETE /api/learning-paths/[id]` - Delete path
- `POST /api/learning-paths/batch-assign` - Assign to users/groups

### Libraries Used
- `react-beautiful-dnd` - Drag and drop functionality
- `@heroicons/react` - Icons
- `react-hot-toast` - Toast notifications
- `@supabase/auth-helpers-react` - Authentication

## Security

### Permission Checks
- Create/Edit/Delete: Requires admin, equipo_directivo, or consultor role
- Edit: Additional check for ownership (creator or admin only)
- Assign: Requires admin, equipo_directivo, or consultor role

### Data Validation
- Required fields enforced on client and server
- Atomic operations prevent partial updates
- RLS policies enforce access control at database level

## Best Practices

### Performance
- Searchable lists use client-side filtering for responsiveness
- Batch operations reduce API calls
- Optimistic UI updates for better perceived performance

### User Feedback
- Clear loading states during operations
- Success/error toast messages
- Confirmation modals for destructive actions
- Empty states with clear calls-to-action

### Accessibility
- Keyboard navigation support
- Focus management in modals
- Semantic HTML structure
- ARIA labels where appropriate

## Future Enhancements

Potential improvements for future iterations:
1. Bulk operations (delete/assign multiple paths)
2. Path templates for common sequences
3. Progress tracking integration
4. Path recommendations based on user role
5. Import/export functionality
6. Path versioning and history