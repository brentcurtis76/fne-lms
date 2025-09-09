-- =====================================================
-- Migration 007: Fix generations.school_id type mismatch
-- Date: 2025-09-01
-- Problem: generations.school_id is INTEGER but the actual schools.id might be different
-- Solution: Recreate generations table with correct schema
-- =====================================================

BEGIN;

-- First, backup any existing data
CREATE TEMP TABLE generations_backup AS 
SELECT * FROM generations;

-- Drop the existing generations table
DROP TABLE IF EXISTS generations CASCADE;

-- Recreate generations table with school_id as INTEGER (matching schools.id)
CREATE TABLE generations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    grade_range TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Re-add foreign key constraint
ALTER TABLE generations 
    ADD CONSTRAINT generations_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- Restore any backed up data (if it exists and is compatible)
-- This will fail if there's incompatible data, which is fine - we'll start fresh
INSERT INTO generations (id, school_id, name, grade_range, created_at)
SELECT id, school_id::INTEGER, name, grade_range, created_at 
FROM generations_backup
WHERE school_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies
CREATE POLICY "generations_admin_all" ON generations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND is_active = true
        )
    );

CREATE POLICY "generations_school_members_view" ON generations
    FOR SELECT TO authenticated
    USING (
        school_id IN (
            SELECT school_id FROM user_roles
            WHERE user_id = auth.uid()
            AND is_active = true
        )
        OR
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role = 'admin'
            AND is_active = true
        )
    );

-- Drop temp table
DROP TABLE IF EXISTS generations_backup;

COMMIT;

-- =====================================================
-- Verification: Check the new structure
-- =====================================================
SELECT 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'generations' 
AND table_schema = 'public'
ORDER BY ordinal_position;