# Growth Communities Customization Feature

## Overview
This feature allows Growth Communities to customize their workspace with a custom name and group image, similar to WhatsApp group functionality.

## Features
- **Custom Name**: Communities can set their own display name
- **Group Image**: Upload a custom image for the community (max 5MB)
- **Permission-based**: Only community leaders and admins can edit settings
- **Real-time Updates**: Changes reflect immediately across the workspace

## Implementation Details

### Database Changes
- Added fields to `community_workspaces` table:
  - `custom_name` (TEXT) - User-defined community name
  - `image_url` (TEXT) - Public URL for the community image
  - `image_storage_path` (TEXT) - Storage reference for cleanup

### Components
1. **WorkspaceSettingsModal** (`/components/community/WorkspaceSettingsModal.tsx`)
   - Modal interface for editing settings
   - Image upload with preview
   - Validation and error handling

2. **Updated Workspace Page** (`/pages/community/workspace.tsx`)
   - Settings button for authorized users
   - Display custom name and image throughout
   - Permission checking on load

### Services
- **communityWorkspaceService** (`/lib/services/communityWorkspace.js`)
  - `updateWorkspaceSettings()` - Update name/image
  - `uploadCommunityImage()` - Handle image uploads
  - `canEditWorkspace()` - Check user permissions

## Setup Instructions

### 1. Apply Database Migration
```bash
# Run the migration script
node scripts/apply-community-customization.js

# Or manually apply in Supabase SQL editor:
# Copy contents of database/add-community-customization.sql
```

### 2. Create Storage Bucket
In Supabase Dashboard:
1. Go to Storage
2. Create new bucket: `community-images`
3. Make it public
4. Add storage policies:
   - Allow authenticated users to upload
   - Allow public read access

### 3. Storage Policies (SQL)
```sql
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload community images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'community-images');

-- Allow public read
CREATE POLICY "Public can view community images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'community-images');

-- Allow authenticated users to update their uploads
CREATE POLICY "Users can update their community images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'community-images');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Users can delete their community images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'community-images');
```

## Usage

### For Community Leaders
1. Navigate to Collaborative Space
2. Look for the settings icon (gear) next to the community name
3. Click to open settings modal
4. Enter a custom name and/or upload an image
5. Click "Guardar cambios" to save

### For Administrators
- Admins can edit any community's settings
- Access through the same interface as community leaders

## Technical Notes

### Image Requirements
- **Formats**: JPEG, JPG, PNG, WebP
- **Max Size**: 5MB
- **Recommended**: Square images for best display

### Permissions
- **Can Edit**: 
  - Community leaders (`lider_comunidad`) for their community
  - Global administrators (`admin`)
- **Can View**: All community members

### Performance
- Images are cached by browser
- Custom names stored locally after fetch
- Minimal database queries

## Troubleshooting

### Image Upload Fails
1. Check storage bucket exists
2. Verify storage policies are applied
3. Check file size and format
4. Ensure user has edit permissions

### Settings Not Saving
1. Check RLS policies on community_workspaces
2. Verify user role (must be leader or admin)
3. Check browser console for errors

### Custom Name Not Showing
1. Refresh the page
2. Check if update was successful (toast notification)
3. Verify database has the custom_name value

## Future Enhancements
- [ ] Image cropping tool
- [ ] Default community avatars/icons
- [ ] Community theme colors
- [ ] Member-visible description field
- [ ] Activity log for changes