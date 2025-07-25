-- =====================================================
-- Migration 003: Create Communities Table
-- Date: 2025-01-24
-- Purpose: Create communities table with INTEGER foreign keys for organizational hierarchy
-- =====================================================

BEGIN;

-- Create communities table with proper schema
CREATE TABLE IF NOT EXISTS public.communities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  school_id INTEGER REFERENCES public.schools(id),
  generation_id INTEGER REFERENCES public.generations(id),
  created_by UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_communities_school_id ON public.communities(school_id);
CREATE INDEX IF NOT EXISTS idx_communities_generation_id ON public.communities(generation_id);
CREATE INDEX IF NOT EXISTS idx_communities_active ON public.communities(is_active);

-- Verify table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'communities' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

COMMIT;

-- =====================================================
-- Migration 003 Complete
-- Result: Communities table created with INTEGER foreign keys
-- Dependencies: Requires schools and generations tables (migrations 001-002)
-- =====================================================