# JWT Role Sync Removal Instructions

## Overview
This document outlines the JWT role synchronization code that needs to be removed once the full migration to the user_roles table is complete.

## When to Execute These Changes
Only remove JWT sync code after:
1. ✅ All users have been migrated to the user_roles table
2. ✅ The legacy `role` column has been dropped from the profiles table
3. ✅ All frontend code reads roles from user_roles table only
4. ✅ All authentication flows use the new role system

## Code to Remove

### 1. `/pages/api/admin/user-roles.ts`
Remove the JWT metadata update sections:
- Lines ~130-141: Remove the `updateUserById` call that syncs role to JWT
- Lines ~285-295: Remove the JWT metadata update after role assignment
- Lines ~385-395: Remove the JWT metadata update after role removal

### 2. `/pages/api/admin/update-role.ts` 
This entire file can be removed as it only handles the legacy role field.

### 3. `/pages/api/admin/create-user.ts`
Remove line that sets `user_metadata: { role: role }` during user creation.

### 4. `/pages/api/admin/bulk-create-users.ts`
Remove the `user_metadata: { role: userData.role }` from user creation.

### 5. Database Functions
Remove or update these database functions that reference JWT metadata:
- Any triggers that sync role changes to auth.users
- Functions that read from user_metadata for role detection

## Verification Steps
After removing JWT sync:
1. Test user login - roles should load from user_roles table
2. Test role assignment - should work without JWT updates
3. Test role removal - should work without JWT updates
4. Verify no errors in auth flows

## Rollback Plan
If issues arise:
1. Restore the JWT sync code
2. Ensure auth.users.raw_user_meta_data contains role for all users
3. Debug why the user_roles table isn't being read correctly