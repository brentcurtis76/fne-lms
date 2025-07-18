-- Part 1: Add supervisor_de_red to enum
-- Run this FIRST, separately

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'supervisor_de_red' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_type')
    ) THEN
        ALTER TYPE user_role_type ADD VALUE 'supervisor_de_red';
        RAISE NOTICE 'Added supervisor_de_red to user_role_type enum';
    ELSE
        RAISE NOTICE 'supervisor_de_red already exists in user_role_type enum';
    END IF;
END $$;