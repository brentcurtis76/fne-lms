-- Seed Badge for docente.qa@fne.cl
-- Purpose: Award course completion badge to user who has already completed a course
--
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Author: Claude Code
-- Date: 2026-02-05

-- =============================================
-- AWARD BADGE TO DOCENTE.QA@FNE.CL
-- =============================================

DO $$
DECLARE
    v_user_id UUID;
    v_course_id UUID;
    v_course_name TEXT;
    v_badge_id UUID;
    v_user_badge_id UUID;
BEGIN
    -- Get the docente.qa user ID
    SELECT id INTO v_user_id
    FROM profiles
    WHERE email = 'docente.qa@fne.cl';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User docente.qa@fne.cl not found';
    END IF;

    RAISE NOTICE '✓ Found user: %', v_user_id;

    -- Get the completed course from course_completions
    SELECT cc.course_id, c.title
    INTO v_course_id, v_course_name
    FROM course_completions cc
    JOIN courses c ON c.id = cc.course_id
    WHERE cc.user_id = v_user_id
    AND cc.completion_type = 'course'
    LIMIT 1;

    -- If no course_completions, try course_enrollments with 100% progress
    IF v_course_id IS NULL THEN
        SELECT ce.course_id, c.title
        INTO v_course_id, v_course_name
        FROM course_enrollments ce
        JOIN courses c ON c.id = ce.course_id
        WHERE ce.user_id = v_user_id
        AND ce.is_completed = true
        LIMIT 1;
    END IF;

    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'No completed course found for docente.qa@fne.cl';
    END IF;

    RAISE NOTICE '✓ Found completed course: % (%)', v_course_name, v_course_id;

    -- Get the course completion badge
    SELECT id INTO v_badge_id
    FROM badges
    WHERE badge_type = 'course_completion'
    AND is_active = true
    LIMIT 1;

    IF v_badge_id IS NULL THEN
        RAISE EXCEPTION 'No active course completion badge found. Run badges-system.sql first.';
    END IF;

    RAISE NOTICE '✓ Found badge: %', v_badge_id;

    -- Award the badge
    INSERT INTO user_badges (user_id, badge_id, course_id, metadata, earned_at)
    VALUES (
        v_user_id,
        v_badge_id,
        v_course_id,
        jsonb_build_object(
            'course_name', v_course_name,
            'completed_at', NOW(),
            'seeded', true
        ),
        NOW()
    )
    ON CONFLICT (user_id, badge_id, course_id) DO UPDATE
    SET metadata = EXCLUDED.metadata
    RETURNING id INTO v_user_badge_id;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'BADGE AWARDED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'User: docente.qa@fne.cl';
    RAISE NOTICE 'Course: %', v_course_name;
    RAISE NOTICE 'Badge ID: %', v_user_badge_id;
    RAISE NOTICE '';
    RAISE NOTICE 'The badge should now appear on the dashboard';
    RAISE NOTICE 'in the "Mis Logros" section.';
    RAISE NOTICE '========================================';

END $$;

-- =============================================
-- VERIFICATION
-- =============================================

-- Show the awarded badge
SELECT
    'AWARDED BADGE' as check_type,
    p.email,
    b.name as badge_name,
    ub.metadata->>'course_name' as course_name,
    ub.earned_at
FROM user_badges ub
JOIN profiles p ON p.id = ub.user_id
JOIN badges b ON b.id = ub.badge_id
WHERE p.email = 'docente.qa@fne.cl';

-- Verify via the view (what the dashboard will use)
SELECT
    'VIA VIEW' as check_type,
    ubwd.*
FROM user_badges_with_details ubwd
JOIN profiles p ON p.id = ubwd.user_id
WHERE p.email = 'docente.qa@fne.cl';
