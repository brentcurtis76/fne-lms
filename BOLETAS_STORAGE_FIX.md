# 🔧 Boletas Storage Bucket RLS Fix

This document explains the fix for the "new row violates row-level security policy" errors when uploading expense report receipts to the 'boletas' Supabase Storage bucket.

## 📋 Problem Summary

Admin users were getting RLS policy violations when trying to upload receipt files in the expense reporting system (`/expense-reports`). The issue was caused by:

1. **Incorrect RLS Policy**: The original policy used `auth.role() = 'authenticated'` which doesn't work reliably
2. **Missing Admin Check**: No verification that the user has admin privileges
3. **Bucket Configuration**: Bucket settings were not properly configured for the use case

## ✅ Solution Implemented

### New RLS Policies Created

The fix implements four specific policies for admin-only access:

1. **Upload Policy**: Only admin users can upload receipts
2. **Read Policy**: Only admin users can view receipts  
3. **Update Policy**: Only admin users can modify receipts
4. **Delete Policy**: Only admin users can delete receipts

### Key Features

- ✅ **Admin-Only Access**: Only users with `role = 'admin'` in the profiles table can access the bucket
- ✅ **Private Bucket**: Bucket is configured as private (not publicly accessible)
- ✅ **File Restrictions**: 50MB size limit with allowed types: JPEG, PNG, GIF, WebP, PDF, TXT
- ✅ **Proper RLS**: Uses `auth.uid()` and checks against the profiles table

### Bucket Configuration

```sql
-- Bucket settings applied
public: false                    -- Private bucket
file_size_limit: 52428800       -- 50MB limit
allowed_mime_types: [
  'image/jpeg', 'image/jpg',
  'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain'
]
```

## 🚀 How to Apply the Fix

### Option 1: Complete Automatic Fix (Recommended)

Run the comprehensive fix script:

```bash
node scripts/fix-boletas-rls-complete.js
```

This script will:
- Remove old problematic policies
- Create new admin-only policies
- Configure the bucket properly
- Test the configuration

### Option 2: Manual SQL Execution

If you prefer to run SQL manually:

```bash
# Apply the SQL policies
node scripts/apply-boletas-policies.js
```

Or execute `/scripts/fix-boletas-storage-policies.sql` in Supabase SQL Editor.

### Option 3: Supabase Dashboard

1. Go to **Storage > Policies** in Supabase Dashboard
2. Delete the old `boletas_authenticated_all` policy
3. Create the four new policies from the SQL file

## 🧪 Testing the Fix

1. **Login as Admin**: Ensure you're logged in as a user with `role = 'admin'`
2. **Navigate to Expense Reports**: Go to `/expense-reports`
3. **Create New Report**: Click "Nuevo Reporte"
4. **Add Expense Item**: Fill in expense details
5. **Upload Receipt**: Click the upload button for "Boleta/Recibo"
6. **Verify Upload**: The file should upload without RLS errors

## 📁 Files Modified/Created

### Created Files
- `/scripts/fix-boletas-storage-policies.sql` - SQL policies
- `/scripts/apply-boletas-policies.js` - Application script
- `/scripts/fix-boletas-rls-complete.js` - Complete fix script
- `/BOLETAS_STORAGE_FIX.md` - This documentation

### Modified Files
- `/database/create-expense-reports.sql` - Removed problematic policy

## 🔍 Technical Details

### RLS Policy Structure

Each policy follows this pattern:

```sql
CREATE POLICY "policy_name"
ON storage.objects FOR [INSERT|SELECT|UPDATE|DELETE]
TO authenticated
USING (
    bucket_id = 'boletas' 
    AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
)
[WITH CHECK (...)]  -- For INSERT/UPDATE operations
```

### Why This Works

1. **`TO authenticated`**: Requires user to be logged in
2. **`bucket_id = 'boletas'`**: Restricts to boletas bucket only
3. **`EXISTS (SELECT 1 FROM profiles...)`**: Verifies admin role
4. **`auth.uid()`**: Gets current authenticated user's ID

## 🎯 Expected Behavior After Fix

### ✅ Admin Users Can:
- Upload receipt files (images, PDFs)
- View uploaded receipts
- Delete receipts from their reports
- Access all receipt files in the system

### ❌ Non-Admin Users Cannot:
- Upload to boletas bucket
- View files in boletas bucket
- Access any receipt files
- Bypass RLS policies

### 🔒 Security Benefits:
- Receipt files are protected and private
- Only authenticated admin users have access
- File size and type restrictions prevent abuse
- Proper audit trail through RLS

## 🆘 Troubleshooting

### If uploads still fail:

1. **Check Admin Role**: Verify user has `role = 'admin'` in profiles table
2. **Check Authentication**: Ensure user is properly logged in
3. **Check File Type**: Verify file is an allowed MIME type
4. **Check File Size**: Ensure file is under 50MB
5. **Check Console**: Look for specific error messages in browser console

### Common Error Messages:

- `"new row violates row-level security policy"` → RLS policy not applied correctly
- `"permission denied"` → User doesn't have admin role
- `"file too large"` → File exceeds 50MB limit
- `"invalid file type"` → File type not in allowed list

## 📞 Support

If you continue having issues after applying this fix:

- **Check the browser console** for detailed error messages
- **Verify the user's role** in the profiles table
- **Test with a different admin user** to isolate the issue
- **Check Supabase logs** in the dashboard for server-side errors

The expense reporting system is located at `/expense-reports` and requires admin access.