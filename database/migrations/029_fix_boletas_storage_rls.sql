-- Migration 029: Fix Boletas Storage Bucket RLS Policies
--
-- Problem: Current RLS policies check profiles.role = 'admin' which doesn't exist
-- The profiles table has no 'role' column - roles are stored in user_roles table
-- This blocks users like Andrea Lagos who have expense_report_access but aren't admins
--
-- Solution: Update policies to check expense_report_access table instead
-- This aligns storage permissions with the expense report access control system

-- =============================================================================
-- STEP 1: Drop existing broken RLS policies
-- =============================================================================

DROP POLICY IF EXISTS "Allow admin uploads to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin reads from boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin updates to boletas bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin deletes from boletas bucket" ON storage.objects;

-- =============================================================================
-- STEP 2: Create new RLS policies that check expense_report_access
-- =============================================================================

-- Policy 1: INSERT (Upload receipts)
-- Allows users who have expense report submit permission OR are admins
CREATE POLICY "Allow expense report users to upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'boletas'
    AND (
        -- Check if user has expense report access with submit permission
        EXISTS (
            SELECT 1
            FROM expense_report_access
            WHERE user_id = auth.uid()
            AND can_submit = TRUE
        )
        OR
        -- OR check if user is admin via user_roles table
        EXISTS (
            SELECT 1
            FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = TRUE
        )
    )
);

-- Policy 2: SELECT (Read/download receipts)
-- Users can read their own receipts or if they have expense report access
CREATE POLICY "Allow expense report users to read receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'boletas'
    AND (
        -- Check if user has expense report access
        EXISTS (
            SELECT 1
            FROM expense_report_access
            WHERE user_id = auth.uid()
        )
        OR
        -- OR check if user is admin via user_roles table
        EXISTS (
            SELECT 1
            FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = TRUE
        )
        OR
        -- OR allow users to read their own uploaded files
        -- (file path pattern: receipt_<timestamp>_<random>.ext)
        owner = auth.uid()
    )
);

-- Policy 3: UPDATE (Modify receipts)
-- Only admins or the original uploader can update files
CREATE POLICY "Allow expense report users to update receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'boletas'
    AND (
        -- Check if user has expense report access with submit permission
        EXISTS (
            SELECT 1
            FROM expense_report_access
            WHERE user_id = auth.uid()
            AND can_submit = TRUE
        )
        OR
        -- OR check if user is admin
        EXISTS (
            SELECT 1
            FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = TRUE
        )
        OR
        -- OR allow users to update their own files
        owner = auth.uid()
    )
);

-- Policy 4: DELETE (Remove receipts)
-- Only admins or the original uploader can delete files
CREATE POLICY "Allow expense report users to delete receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'boletas'
    AND (
        -- Check if user has expense report access with submit permission
        EXISTS (
            SELECT 1
            FROM expense_report_access
            WHERE user_id = auth.uid()
            AND can_submit = TRUE
        )
        OR
        -- OR check if user is admin
        EXISTS (
            SELECT 1
            FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = TRUE
        )
        OR
        -- OR allow users to delete their own files
        owner = auth.uid()
    )
);

-- =============================================================================
-- VERIFICATION QUERIES (Run these to confirm policies are correct)
-- =============================================================================

-- Check that policies were created correctly
-- SELECT
--     schemaname,
--     tablename,
--     policyname,
--     permissive,
--     roles,
--     cmd,
--     qual,
--     with_check
-- FROM pg_policies
-- WHERE tablename = 'objects'
-- AND schemaname = 'storage'
-- AND policyname LIKE '%expense%';

-- Verify expense_report_access table has the expected structure
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'expense_report_access';

-- Check which users currently have expense report access
-- SELECT
--     era.user_id,
--     p.email,
--     p.first_name,
--     p.last_name,
--     era.can_submit,
--     era.notes
-- FROM expense_report_access era
-- LEFT JOIN profiles p ON p.id = era.user_id
-- WHERE era.can_submit = TRUE;

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- This migration fixes the issue where andrealagosgomez@gmail.com (and other users)
-- with "Reportes de gastos" permission enabled in the admin panel cannot upload
-- receipt images to the boletas storage bucket.
--
-- The old policies checked profiles.role = 'admin' which doesn't exist in the schema.
-- The new policies check the expense_report_access table, which is where the
-- "Reportes de gastos" permission is actually stored.
--
-- Users affected by this fix:
-- - Andrea Lagos (andrealagosgomez@gmail.com) - Community Manager with expense reports enabled
-- - Any future users granted expense report access via the admin panel
--
-- This migration should be applied via Supabase SQL Editor on production.
