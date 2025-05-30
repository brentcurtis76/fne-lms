# 🚨 URGENT FIX: Expense Receipt Upload RLS Policy Error

## Problem
Users getting "new row violates row-level security policy" when uploading receipts in expense reports.

## Quick Fix - Apply in Supabase Dashboard

### Step 1: Go to Supabase Dashboard
1. Open https://supabase.com/dashboard
2. Navigate to your project: `sxlogxqzmarhqsblxmtj`
3. Go to **Storage** → **Policies**

### Step 2: Delete Old Policies (if any exist)
Look for and delete any existing policies for the `boletas` bucket.

### Step 3: Create New Admin-Only Policies

#### Policy 1: Admin Upload (INSERT)
```sql
CREATE POLICY "Admin can upload to boletas bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
```

#### Policy 2: Admin Read (SELECT)
```sql
CREATE POLICY "Admin can read from boletas bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
```

#### Policy 3: Admin Update (UPDATE)
```sql
CREATE POLICY "Admin can update boletas bucket"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
```

#### Policy 4: Admin Delete (DELETE)
```sql
CREATE POLICY "Admin can delete from boletas bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
```

### Step 4: Verify Bucket Configuration
1. Go to **Storage** → **Buckets**
2. Find the `boletas` bucket
3. Ensure it's configured as:
   - **Public**: No (private bucket)
   - **File size limit**: 50MB
   - **Allowed MIME types**: `image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain`

## Alternative: Use SQL Editor

If the Storage Policies UI doesn't work, use the **SQL Editor**:

1. Go to **SQL Editor** in Supabase Dashboard
2. Copy and paste this complete script:

```sql
-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any existing boletas policies to avoid conflicts
DROP POLICY IF EXISTS "Admin can upload to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can read from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "boletas_authenticated_all" ON storage.objects;

-- Create admin-only policies for boletas bucket
CREATE POLICY "Admin can upload to boletas bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admin can read from boletas bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admin can update boletas bucket"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admin can delete from boletas bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'boletas' 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Ensure boletas bucket exists with proper configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('boletas', 'boletas', false, 52428800, ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain'];
```

3. Click **Run** to execute the script

## Testing the Fix

After applying the policies:

1. **Login as admin** (must have `role = 'admin'` in profiles table)
2. **Go to** `/expense-reports` 
3. **Create new expense report**
4. **Try uploading a receipt** (image or PDF)
5. **Upload should work** without RLS errors

## ✅ Expected Result

- ✅ Admin users can upload receipts
- ✅ Non-admin users cannot access boletas bucket
- ✅ Files are private (not publicly accessible)
- ✅ 50MB limit enforced
- ✅ Only allowed file types accepted

## 🚨 If Still Not Working

1. **Check user role**: Ensure your user has `role = 'admin'` in the `profiles` table
2. **Clear browser cache**: Sometimes old auth tokens cause issues
3. **Check browser console**: Look for specific error messages
4. **Verify authentication**: Make sure you're logged in as an admin user

The expense receipt upload should work immediately after applying these policies.