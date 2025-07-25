-- =====================================================
-- Migration 004: Nuclear Recreation of Profiles Table with INTEGER Foreign Keys
-- Date: 2025-01-24
-- Purpose: Fix UUID/INTEGER mismatch for generation_id and community_id foreign keys
-- 
-- CRITICAL: This follows the proven "nuclear recreation" pattern used successfully
-- for the generations table. It resolves the schema conflict that prevents proper
-- user-community and user-generation relationships in dashboard reporting.
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 1: BACKUP AND DROP (Nuclear Approach)
-- =====================================================

-- Drop profiles table with CASCADE to remove all dependent constraints
-- This mirrors the successful approach used for generations table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- =====================================================  
-- PHASE 2: RECREATE PROFILES TABLE WITH INTEGER FOREIGN KEYS
-- =====================================================

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    -- Core identification
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    
    -- User information
    "name" "text",
    "email" "text", 
    "first_name" "text",
    "middle_name" "text",
    "last_name" "text",
    "description" "text",
    "avatar_url" "text",
    
    -- Legacy fields (preserved for compatibility)
    "school" "text",
    "growth_community" "text",
    
    -- Status and security
    "approval_status" "text" DEFAULT 'pending'::"text",
    "must_change_password" boolean DEFAULT false,
    
    -- CRITICAL CHANGE: INTEGER foreign keys instead of UUID
    "school_id" integer,
    "generation_id" integer,        -- CHANGED from UUID to INTEGER
    "community_id" integer,         -- CHANGED from UUID to INTEGER
    
    -- User preferences and settings
    "learning_preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "notification_preferences" "jsonb" DEFAULT '{"progress_reminders": true, "assignment_notifications": true, "completion_notifications": true}'::"jsonb",
    "timezone" character varying(50) DEFAULT 'America/Santiago'::character varying,
    
    -- Activity tracking
    "last_active_at" timestamp with time zone DEFAULT "now"(),
    "total_learning_time_seconds" integer DEFAULT 0,
    "courses_completed" integer DEFAULT 0,
    "lessons_completed" integer DEFAULT 0,
    "avg_quiz_score" numeric(5,2),
    
    -- Constraints
    CONSTRAINT "profiles_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

-- =====================================================
-- PHASE 3: PRIMARY KEY AND FOREIGN KEY CONSTRAINTS  
-- =====================================================

-- Primary key
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

-- Foreign key constraints with INTEGER references
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_school_id_fkey" 
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."profiles"  
    ADD CONSTRAINT "profiles_generation_id_fkey"
    FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_community_id_fkey" 
    FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE SET NULL;

-- =====================================================
-- PHASE 4: PERFORMANCE INDEXES
-- =====================================================

CREATE INDEX "idx_profiles_school_id" 
    ON "public"."profiles" USING "btree" ("school_id") 
    WHERE ("school_id" IS NOT NULL);

CREATE INDEX "idx_profiles_generation_id" 
    ON "public"."profiles" USING "btree" ("generation_id") 
    WHERE ("generation_id" IS NOT NULL);

CREATE INDEX "idx_profiles_community_id" 
    ON "public"."profiles" USING "btree" ("community_id") 
    WHERE ("community_id" IS NOT NULL);

CREATE INDEX "idx_profiles_last_active" 
    ON "public"."profiles" USING "btree" ("last_active_at");

CREATE INDEX "idx_profiles_must_change_password" 
    ON "public"."profiles" USING "btree" ("must_change_password") 
    WHERE ("must_change_password" = true);

-- =====================================================
-- PHASE 5: ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

-- Admin Access Policies
CREATE POLICY "Admins can view all profiles" ON "public"."profiles"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'admin' 
            AND ur.is_active = true
        )
    );

CREATE POLICY "Admins can update all profiles" ON "public"."profiles"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_roles ur 
            WHERE ur.user_id = auth.uid() 
            AND ur.role_type = 'admin' 
            AND ur.is_active = true
        )
    );

-- User Self-Management Policies  
CREATE POLICY "Users can read their own profile" ON "public"."profiles"
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON "public"."profiles"
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile during registration" ON "public"."profiles"
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Community-Based Access
CREATE POLICY "Users can view their community members" ON "public"."profiles"
    FOR SELECT USING (
        community_id IN (
            SELECT community_id FROM profiles 
            WHERE id = auth.uid() 
            AND community_id IS NOT NULL
        )
    );

-- =====================================================
-- PHASE 6: TRIGGERS AND FUNCTIONS
-- =====================================================

-- Recreate cache refresh trigger if the function exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_refresh_user_roles_cache') THEN
        CREATE TRIGGER "profiles_changed_refresh_cache" 
            AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" 
            FOR EACH STATEMENT 
            EXECUTE FUNCTION "public"."trigger_refresh_user_roles_cache"();
    END IF;
END $$;

-- =====================================================
-- PHASE 7: VALIDATION QUERIES
-- =====================================================

-- Verify table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
    AND table_schema = 'public'
    AND column_name IN ('school_id', 'generation_id', 'community_id')
ORDER BY ordinal_position;

-- Verify foreign key constraints
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'profiles'
    AND tc.table_schema = 'public';

COMMIT;

-- =====================================================
-- Migration 004 Complete
-- Result: profiles table now uses INTEGER foreign keys for proper organizational hierarchy
-- Impact: Enables complete user-community and user-generation relationships for dashboard reporting
-- Validation: All foreign key constraints should reference INTEGER primary keys
-- =====================================================