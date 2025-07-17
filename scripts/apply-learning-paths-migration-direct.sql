-- Direct SQL execution script for Learning Paths migration
-- Run this in Supabase SQL Editor

-- First, let's check if the functions already exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_full_learning_path') THEN
        RAISE NOTICE 'Function create_full_learning_path already exists';
    ELSE
        RAISE NOTICE 'Function create_full_learning_path does not exist - will create';
    END IF;
END $$;