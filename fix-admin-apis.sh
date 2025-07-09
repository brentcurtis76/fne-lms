#!/bin/bash

# Fix all admin API endpoints that check profiles.role
# This script updates them to use user_roles.role_type instead

echo "Fixing admin API endpoints to use user_roles instead of profiles.role..."

# List of files to fix
files=(
    "pages/api/admin/user-roles.ts"
    "pages/api/admin/retrieve-import-passwords.ts"
    "pages/api/admin/notification-types.ts"
    "pages/api/admin/check-permissions.ts"
    "pages/api/admin/update-role.ts"
    "pages/api/admin/system-updates.ts"
    "pages/api/admin/schools.ts"
    "pages/api/admin/reset-password.ts"
    "pages/api/admin/notification-analytics.ts"
    "pages/api/admin/delete-user.ts"
    "pages/api/admin/course-assignments.ts"
    "pages/api/admin/consultant-assignments.ts"
    "pages/api/admin/consultant-assignment-users.ts"
    "pages/api/admin/bulk-create-users.ts"
    "pages/api/admin/approve-user.ts"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "Processing: $file"
        
        # Replace profiles table check with user_roles check
        sed -i.bak -e "s/from('profiles')/from('user_roles')/g" \
                   -e "s/.select('role')/.select('role_type')/g" \
                   -e "s/profile?.role !== 'admin'/!userRoles/g" \
                   -e "s/profile?.role === 'admin'/userRoles/g" \
                   -e "s/profileData?.role !== 'admin'/!userRoles/g" \
                   -e "s/profileData?.role === 'admin'/userRoles/g" \
                   -e "s/.eq('id', user.id)/.eq('user_id', user.id).eq('role_type', 'admin').eq('is_active', true)/g" \
                   "$file"
        
        # Also fix variable names
        sed -i.bak -e "s/const { data: profile,/const { data: userRoles,/g" \
                   -e "s/const { data: profileData,/const { data: userRoles,/g" \
                   -e "s/error: profileError/error: roleError/g" \
                   "$file"
    fi
done

echo "Cleaning up backup files..."
rm -f pages/api/admin/*.bak

echo "Done! All admin API endpoints have been updated."