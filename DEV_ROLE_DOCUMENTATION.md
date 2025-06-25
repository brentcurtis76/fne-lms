# Developer Role with Role-Switching Capability

## Overview

The FNE LMS now includes a special "dev" role that allows developers to impersonate other roles without logging in and out. This feature is designed to streamline development and testing by enabling quick role switching within the platform.

## Features

- **Role Impersonation**: Switch between any of the 6 platform roles (admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, docente)
- **Contextual Testing**: Set specific organizational contexts (school, generation, community) when impersonating roles
- **Visual Indicators**: Clear UI indicators when role impersonation is active
- **Session Management**: Impersonation sessions expire after 8 hours for security
- **Audit Trail**: All role switches are logged for accountability
- **Seamless Integration**: Works with existing role-based access control

## Setup Instructions

### 1. Apply Database Migration

First, apply the database migration to add the dev role type and supporting tables:

```bash
# The migration file is located at:
# /database/add-dev-role.sql

# Copy the contents and run in Supabase SQL Editor:
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the entire contents of /database/add-dev-role.sql
4. Paste and run the SQL
```

### 2. Assign Dev Role to a User

After the migration is applied, assign the dev role to your user account:

```bash
# Using the provided script
node scripts/assign-dev-role.js your-email@example.com
```

### 3. Log Out and Log Back In

The user must log out and log back in for the dev role to take effect.

## Usage

### Accessing the Role Switcher

1. Once logged in with a dev role, you'll see a purple button with a code icon in the bottom right corner
2. Click the button to open the role switcher modal

### Switching Roles

1. Select the role you want to impersonate from the dropdown
2. Depending on the role, you may need to select:
   - **School**: For roles that are school-specific
   - **Generation**: For generation leaders
   - **Community**: For community leaders or teachers
3. Click "Iniciar Suplantación" to activate the role

### Active Impersonation

When impersonating a role:
- The purple button changes to a red indicator showing "Modo Dev Activo"
- The indicator displays the current impersonated role
- All platform features behave as if you're logged in with that role
- Your actual permissions are temporarily replaced with the impersonated role's permissions

### Ending Impersonation

1. Click the X button on the red indicator
2. Confirm that you want to end the impersonation
3. You'll return to your actual dev role permissions

## Role-Specific Contexts

Different roles require different organizational contexts:

- **admin**: No additional context needed (global access)
- **consultor**: Optional school context
- **equipo_directivo**: Optional school context
- **lider_generacion**: Requires school and generation
- **lider_comunidad**: Requires school, optional generation/community
- **docente**: Requires school, optional generation/community

## Technical Details

### Database Schema

The implementation adds:
- `dev` value to the `user_role_type` enum
- `dev_role_sessions` table for tracking active impersonations
- `dev_audit_log` table for audit trail
- Helper functions for role management

### Security Features

- Only users with the dev role can access impersonation features
- Sessions expire automatically after 8 hours
- All actions are logged with IP and user agent
- RLS policies ensure data security
- Cannot impersonate another dev user

### Integration with Existing System

- The `getUserRoles()` function automatically returns impersonated role when active
- Permission checks (`hasPermission()`, `isGlobalAdmin()`, etc.) respect impersonation
- The UI updates automatically based on the effective role

## Best Practices

1. **Use for Testing Only**: Dev role impersonation is for development and testing, not production use
2. **Clear Sessions**: End impersonation sessions when done testing
3. **Test Edge Cases**: Use role switching to test permission boundaries and UI variations
4. **Document Bugs**: When finding role-specific bugs, note the exact role and context

## Troubleshooting

### Role Switcher Not Appearing

1. Verify the dev role is assigned: Check `user_roles` table
2. Ensure you've logged out and back in after role assignment
3. Check browser console for errors

### Impersonation Not Working

1. Verify the migration was applied successfully
2. Check that all database functions were created
3. Ensure RLS policies are in place
4. Check browser console for API errors

### Sessions Not Persisting

1. Sessions are stored in localStorage - check browser settings
2. Verify the session hasn't expired (8-hour limit)
3. Check for database sync issues

## Security Considerations

- Dev role should only be assigned to trusted developers
- All impersonation actions are logged for audit purposes
- Sessions have automatic expiration for security
- The feature is completely isolated from production user data

## Future Enhancements

Potential improvements for the dev role system:
- Quick role switching shortcuts
- Preset testing scenarios
- Bulk testing across multiple roles
- Integration with automated testing frameworks