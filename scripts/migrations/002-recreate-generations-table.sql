-- =====================================================
-- Migration 002: Recreate Generations Table with INTEGER Schema
-- Date: 2025-01-24
-- Purpose: Replace UUID-based generations table with INTEGER foreign key schema
-- =====================================================

BEGIN;

-- Drop the existing generations table and all dependencies
DROP TABLE IF EXISTS public.generations CASCADE;

-- Create new generations table with INTEGER school_id
CREATE TABLE public.generations (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES public.schools(id),
    name TEXT NOT NULL,
    grade_range TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_generations_school_id ON public.generations(school_id);

-- Verify the conversion
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'generations' 
    AND table_schema = 'public'
    AND column_name = 'school_id';

COMMIT;

-- =====================================================
-- Migration 002 Complete
-- Result: generations.school_id is now INTEGER
-- Dependencies: Requires schools table with INTEGER id column
-- =====================================================