-- Badge System Migration for Course Completion
-- Purpose: Create tables and functions for badge/achievement system
-- Based on: Genera Brand Guidelines
--
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Author: Claude Code
-- Date: 2026-02-05

-- =============================================
-- SECTION 1: CREATE BADGE TYPES TABLE
-- =============================================

-- Badges table stores badge definitions
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    badge_type TEXT NOT NULL DEFAULT 'course_completion' CHECK (badge_type IN ('course_completion', 'module_completion', 'milestone', 'special')),
    icon_name TEXT DEFAULT 'award', -- Lucide icon name or custom identifier
    color_primary TEXT DEFAULT '#fbbf24', -- Brand Amarillo
    color_secondary TEXT DEFAULT '#0a0a0a', -- Brand Negro
    criteria JSONB DEFAULT '{}', -- Flexible criteria for earning badge
    points_value INT DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default course completion badge (using Genera brand colors)
INSERT INTO badges (name, description, badge_type, icon_name, color_primary, color_secondary, criteria, points_value)
VALUES (
    'Curso Completado',
    'Has completado exitosamente un curso en la plataforma Genera',
    'course_completion',
    'genera-g', -- Custom icon reference for the Genera G
    '#fbbf24', -- Brand Amarillo
    '#0a0a0a', -- Brand Negro
    '{"type": "course_completion"}',
    100
) ON CONFLICT DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_badges_type ON badges(badge_type);
CREATE INDEX IF NOT EXISTS idx_badges_active ON badges(is_active);

-- =============================================
-- SECTION 2: CREATE USER BADGES TABLE
-- =============================================

-- User badges table tracks which badges users have earned
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL, -- For course completion badges
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    displayed_in_community BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}', -- Additional context (course name, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, badge_id, course_id) -- Prevent duplicate badges for same course
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_earned ON user_badges(earned_at DESC);

-- =============================================
-- SECTION 3: ROW LEVEL SECURITY
-- =============================================

-- Enable RLS
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Badges table policies (read-only for authenticated users)
DROP POLICY IF EXISTS "Anyone can view active badges" ON badges;
CREATE POLICY "Anyone can view active badges"
ON badges FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Service role has full badges access" ON badges;
CREATE POLICY "Service role has full badges access"
ON badges FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- User badges policies
DROP POLICY IF EXISTS "Users can view their own badges" ON user_badges;
CREATE POLICY "Users can view their own badges"
ON user_badges FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view community member badges" ON user_badges;
CREATE POLICY "Users can view community member badges"
ON user_badges FOR SELECT
TO authenticated
USING (
    displayed_in_community = true
    AND EXISTS (
        SELECT 1 FROM user_roles ur1
        JOIN user_roles ur2 ON ur1.community_id = ur2.community_id
        WHERE ur1.user_id = auth.uid()
        AND ur2.user_id = user_badges.user_id
        AND ur1.is_active = true
        AND ur2.is_active = true
    )
);

DROP POLICY IF EXISTS "Service role has full user_badges access" ON user_badges;
CREATE POLICY "Service role has full user_badges access"
ON user_badges FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================
-- SECTION 4: FUNCTION TO AWARD BADGE
-- =============================================

-- Function to award a badge to a user (called from API)
CREATE OR REPLACE FUNCTION award_course_completion_badge(
    p_user_id UUID,
    p_course_id UUID,
    p_course_name TEXT
)
RETURNS UUID AS $$
DECLARE
    v_badge_id UUID;
    v_user_badge_id UUID;
BEGIN
    -- Get the course completion badge ID
    SELECT id INTO v_badge_id
    FROM badges
    WHERE badge_type = 'course_completion'
    AND is_active = true
    LIMIT 1;

    IF v_badge_id IS NULL THEN
        RAISE EXCEPTION 'No active course completion badge found';
    END IF;

    -- Insert the user badge (or do nothing if exists)
    INSERT INTO user_badges (user_id, badge_id, course_id, metadata)
    VALUES (
        p_user_id,
        v_badge_id,
        p_course_id,
        jsonb_build_object(
            'course_name', p_course_name,
            'completed_at', NOW()
        )
    )
    ON CONFLICT (user_id, badge_id, course_id) DO NOTHING
    RETURNING id INTO v_user_badge_id;

    RETURN v_user_badge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 5: FUNCTION TO GET USER BADGES
-- =============================================

-- Function to get all badges for a user
CREATE OR REPLACE FUNCTION get_user_badges(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    badge_name TEXT,
    badge_description TEXT,
    badge_type TEXT,
    icon_name TEXT,
    color_primary TEXT,
    color_secondary TEXT,
    course_id UUID,
    course_name TEXT,
    earned_at TIMESTAMPTZ,
    points_value INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ub.id,
        b.name AS badge_name,
        b.description AS badge_description,
        b.badge_type,
        b.icon_name,
        b.color_primary,
        b.color_secondary,
        ub.course_id,
        COALESCE(ub.metadata->>'course_name', c.title) AS course_name,
        ub.earned_at,
        b.points_value
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    LEFT JOIN courses c ON c.id = ub.course_id
    WHERE ub.user_id = p_user_id
    ORDER BY ub.earned_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 6: VERIFICATION QUERIES
-- =============================================

-- Verify badges table created
SELECT
    'BADGES TABLE' as check_type,
    COUNT(*) as badge_count
FROM badges;

-- Verify user_badges table created
SELECT
    'USER_BADGES TABLE' as check_type,
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'user_badges') as table_exists;

-- Show badge definitions
SELECT
    id,
    name,
    badge_type,
    color_primary,
    color_secondary,
    points_value,
    is_active
FROM badges;

-- =============================================
-- SECTION 7: HELPER VIEW FOR DASHBOARD
-- =============================================

-- Create a view for easy badge retrieval with all details
CREATE OR REPLACE VIEW user_badges_with_details AS
SELECT
    ub.id,
    ub.user_id,
    ub.badge_id,
    ub.course_id,
    ub.earned_at,
    ub.displayed_in_community,
    ub.metadata,
    b.name AS badge_name,
    b.description AS badge_description,
    b.badge_type,
    b.icon_name,
    b.color_primary,
    b.color_secondary,
    b.points_value,
    c.title AS course_title,
    c.thumbnail_url AS course_thumbnail
FROM user_badges ub
JOIN badges b ON b.id = ub.badge_id
LEFT JOIN courses c ON c.id = ub.course_id
WHERE b.is_active = true;

-- Grant access to the view
GRANT SELECT ON user_badges_with_details TO authenticated;
