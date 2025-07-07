-- =====================================================
-- Drop Legacy Role Column with Dependencies
-- =====================================================
-- This migration handles all dependencies before dropping the role column
-- =====================================================

-- Step 1: Drop dependent storage policies
DROP POLICY IF EXISTS "Admin can upload to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can read from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all feedback screenshots" ON storage.objects;

-- Step 2: Drop dependent table policies
DROP POLICY IF EXISTS "View assignment instances - students" ON assignment_instances;
DROP POLICY IF EXISTS "View all submissions - instructors" ON assignment_submissions;

-- Step 3: Drop or update dependent views
DROP VIEW IF EXISTS course_assignments_with_users CASCADE;
DROP VIEW IF EXISTS user_progress_view CASCADE;
DROP MATERIALIZED VIEW IF EXISTS user_roles_cache CASCADE;
DROP VIEW IF EXISTS metadata_sync_status CASCADE;

-- Step 4: Recreate storage policies without role dependency
-- These will now check user_roles table instead

-- Boletas bucket policies (admin only)
CREATE POLICY "Admin can upload to boletas bucket" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'boletas' AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role_type = 'admin'
    AND is_active = true
  )
);

CREATE POLICY "Admin can read from boletas bucket" ON storage.objects FOR SELECT
USING (
  bucket_id = 'boletas' AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role_type = 'admin'
    AND is_active = true
  )
);

CREATE POLICY "Admin can update boletas bucket" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'boletas' AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role_type = 'admin'
    AND is_active = true
  )
);

CREATE POLICY "Admin can delete from boletas bucket" ON storage.objects FOR DELETE
USING (
  bucket_id = 'boletas' AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role_type = 'admin'
    AND is_active = true
  )
);

-- Feedback screenshots policies (admin only)
CREATE POLICY "Admins can manage all feedback screenshots" ON storage.objects
FOR ALL
USING (
  bucket_id = 'feedback-screenshots' AND
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role_type = 'admin'
    AND is_active = true
  )
);

-- Step 5: Now drop the role column
ALTER TABLE profiles DROP COLUMN IF EXISTS role;

-- Step 6: Verify the migration
SELECT 
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') as role_column_dropped,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles_role_backup') as backup_exists;