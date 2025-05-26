# 🔧 Storage Upload Fix Guide

The image upload error "new row violates row-level security policy" means we need to configure RLS policies in Supabase.

## Quick Fix: Configure RLS Policies in Supabase Dashboard

### Step 1: Go to Supabase Dashboard
1. Visit https://app.supabase.com
2. Select your project: `sxlogxqzmarhqsblxmtj.supabase.co`
3. Go to **Storage** > **Policies**

### Step 2: Create Storage Policies
In the Storage Policies section, create these 4 policies for the `objects` table:

#### Policy 1: Allow Public Uploads
- **Policy Name**: `Allow public uploads to resources bucket`
- **Command**: `INSERT`
- **Target Roles**: `public`
- **Check Expression**: `bucket_id = 'resources'`

#### Policy 2: Allow Public Reads
- **Policy Name**: `Allow public reads from resources bucket`
- **Command**: `SELECT`
- **Target Roles**: `public`
- **Using Expression**: `bucket_id = 'resources'`

#### Policy 3: Allow Public Updates
- **Policy Name**: `Allow public updates to resources bucket`
- **Command**: `UPDATE`
- **Target Roles**: `public`
- **Using Expression**: `bucket_id = 'resources'`
- **Check Expression**: `bucket_id = 'resources'`

#### Policy 4: Allow Public Deletes
- **Policy Name**: `Allow public deletes from resources bucket`
- **Command**: `DELETE`
- **Target Roles**: `public`
- **Using Expression**: `bucket_id = 'resources'`

### Step 3: Alternative SQL Method
If you prefer SQL, run these commands in the SQL Editor:

```sql
-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policies for public access to resources bucket
CREATE POLICY "Allow public uploads to resources bucket" ON storage.objects
FOR INSERT TO public WITH CHECK (bucket_id = 'resources');

CREATE POLICY "Allow public reads from resources bucket" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'resources');

CREATE POLICY "Allow public updates to resources bucket" ON storage.objects
FOR UPDATE TO public USING (bucket_id = 'resources') WITH CHECK (bucket_id = 'resources');

CREATE POLICY "Allow public deletes from resources bucket" ON storage.objects
FOR DELETE TO public USING (bucket_id = 'resources');
```

### Step 4: Verify Bucket Configuration
1. Go to **Storage** > **Buckets**
2. Check that the `resources` bucket exists
3. Ensure it's marked as **Public**
4. File size limit should be set appropriately (50MB recommended)

## After Applying the Fix

1. Refresh your lesson editor page
2. Try uploading an image again
3. The upload should now work without the RLS error

## Current Bucket Status ✅
- ✅ Resources bucket exists
- ✅ Bucket is public  
- ✅ Upload test successful with service role key
- ❌ RLS policies not configured for anon users

## Need Help?
If you're still experiencing issues after applying these policies, the problem might be:
1. Policies not applied correctly
2. Browser caching (try hard refresh)
3. Network/firewall issues
4. File size too large
5. Unsupported file type

**Contact**: Brent Curtis (bcurtis@nuevaeducacion.org, +56941623577)