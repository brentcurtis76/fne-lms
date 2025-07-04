# Feedback Permissions System

## Overview
The feedback button is now restricted to only admins and users who have been explicitly granted permission by an admin.

## How It Works

### For Admins
1. Admins always have access to the feedback button
2. Navigate to **Configuración → Usuarios y Permisos** to manage permissions
3. Search for users by name or email
4. Filter by role if needed
5. Click "Otorgar permiso" to grant feedback access to a user
6. Click "Revocar permiso" to remove access

### For Regular Users
- The feedback button will only appear if an admin has granted permission
- Users without permission will not see the feedback button
- Permission can be revoked at any time by an admin

## Technical Implementation

### Database
- New table: `feedback_permissions`
- Function: `has_feedback_permission(user_id)` - checks if user can submit feedback
- RLS policies ensure only admins can manage permissions

### Components
- `FeedbackButtonWithPermissions` - Checks permission before rendering
- `FeedbackPermissionsManager` - Admin UI for managing permissions
- Located in Configuration → Users and Permissions tab

### Permission Check Flow
1. User loads page → MainLayout renders
2. FeedbackButtonWithPermissions checks `has_feedback_permission`
3. If user has permission (admin or granted), button appears
4. If no permission, button is hidden

## Security
- Only admins can grant/revoke permissions
- Users can only see their own permission status
- All permission changes are tracked with timestamps
- Permissions can be revoked without deleting the record