-- Seed Certificate Test Data for docente.qa@fne.cl
-- Purpose: Create all necessary data for testing course completion and certificate generation
--
-- Prerequisites:
-- - docente.qa@fne.cl user must exist in profiles table
-- - At least one published course must exist
--
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Author: Claude Code
-- Date: 2026-02-05

-- =============================================
-- SECTION 0: CREATE MISSING TABLES (if needed)
-- =============================================
-- The course_completions table may not exist yet - create it if missing

CREATE TABLE IF NOT EXISTS course_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    completion_type TEXT NOT NULL CHECK (completion_type IN ('course', 'module')),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completion_notification_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, course_id, completion_type, module_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_course_completions_user_course
ON course_completions(user_id, course_id);

-- Enable RLS
ALTER TABLE course_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for course_completions
DROP POLICY IF EXISTS "Users can view their own completions" ON course_completions;
CREATE POLICY "Users can view their own completions"
ON course_completions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own completions" ON course_completions;
CREATE POLICY "Users can insert their own completions"
ON course_completions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow service role full access (for API endpoints)
DROP POLICY IF EXISTS "Service role has full access" ON course_completions;
CREATE POLICY "Service role has full access"
ON course_completions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================
-- SECTION 1: DISCOVER EXISTING DATA STRUCTURE
-- =============================================
-- This section identifies the user, course, and structure needed

DO $$
DECLARE
    docente_user_id UUID;
    target_course_id UUID;
    target_course_title TEXT;
    lesson_record RECORD;
    block_record RECORD;
    v_total_lessons INT := 0;
    v_total_blocks INT := 0;
    v_lessons_processed INT := 0;
    v_blocks_completed INT := 0;
    v_current_timestamp TIMESTAMPTZ := NOW();
BEGIN
    -- =========================================
    -- Step 1: Find docente.qa user
    -- =========================================
    SELECT id INTO docente_user_id
    FROM profiles
    WHERE email = 'docente.qa@fne.cl';

    IF docente_user_id IS NULL THEN
        RAISE EXCEPTION 'User docente.qa@fne.cl not found. Please create this user first.';
    END IF;

    RAISE NOTICE '✓ Found user docente.qa@fne.cl: %', docente_user_id;

    -- =========================================
    -- Step 2: Find enrolled course (prefer existing enrollment)
    -- =========================================
    SELECT ce.course_id, c.title INTO target_course_id, target_course_title
    FROM course_enrollments ce
    JOIN courses c ON c.id = ce.course_id
    WHERE ce.user_id = docente_user_id
    AND c.status = 'published'
    LIMIT 1;

    -- If no existing enrollment, find any published course with lessons
    IF target_course_id IS NULL THEN
        SELECT c.id, c.title INTO target_course_id, target_course_title
        FROM courses c
        WHERE c.status = 'published'
        AND EXISTS (
            -- Check for simple structure (lessons with course_id)
            SELECT 1 FROM lessons l WHERE l.course_id = c.id
            UNION
            -- Check for structured (modules with lessons)
            SELECT 1 FROM modules m
            JOIN lessons l ON l.module_id = m.id
            WHERE m.course_id = c.id
        )
        LIMIT 1;

        IF target_course_id IS NULL THEN
            RAISE EXCEPTION 'No published course with lessons found. Please create a course first.';
        END IF;

        -- Create enrollment
        INSERT INTO course_enrollments (user_id, course_id, status, enrolled_at, progress_percentage, lessons_completed, is_completed)
        VALUES (docente_user_id, target_course_id, 'active', v_current_timestamp, 0, 0, false)
        ON CONFLICT (user_id, course_id) DO NOTHING;

        RAISE NOTICE '✓ Created enrollment for course: %', target_course_title;
    ELSE
        RAISE NOTICE '✓ Using existing enrollment in course: %', target_course_title;
    END IF;

    -- =========================================
    -- Step 3: Get all lessons for the course
    -- =========================================
    -- Count total lessons (handling both simple and structured courses)
    SELECT COUNT(*) INTO v_total_lessons
    FROM (
        -- Simple structure: lessons directly under course
        SELECT l.id
        FROM lessons l
        WHERE l.course_id = target_course_id
        UNION
        -- Structured: lessons under modules under course
        SELECT l.id
        FROM modules m
        JOIN lessons l ON l.module_id = m.id
        WHERE m.course_id = target_course_id
    ) AS all_lessons;

    RAISE NOTICE '✓ Found % total lessons in course', v_total_lessons;

    IF v_total_lessons = 0 THEN
        RAISE EXCEPTION 'Course has no lessons. Cannot create completion data.';
    END IF;

    -- =========================================
    -- Step 4: Create lesson_progress records for ALL blocks in ALL lessons
    -- =========================================
    -- This is the key: progress is tracked at block level

    -- Process lessons with direct course_id
    FOR lesson_record IN
        SELECT l.id AS lesson_id
        FROM lessons l
        WHERE l.course_id = target_course_id
        UNION
        SELECT l.id AS lesson_id
        FROM modules m
        JOIN lessons l ON l.module_id = m.id
        WHERE m.course_id = target_course_id
    LOOP
        v_lessons_processed := v_lessons_processed + 1;

        -- Get all blocks for this lesson
        FOR block_record IN
            SELECT b.id AS block_id
            FROM blocks b
            WHERE b.lesson_id = lesson_record.lesson_id
        LOOP
            v_total_blocks := v_total_blocks + 1;

            -- Insert or update lesson_progress for this block
            INSERT INTO lesson_progress (
                user_id,
                lesson_id,
                block_id,
                completed_at,
                time_spent
            )
            VALUES (
                docente_user_id,
                lesson_record.lesson_id,
                block_record.block_id,
                v_current_timestamp - (random() * INTERVAL '7 days'), -- Stagger completion times
                (random() * 300 + 60)::INT -- 1-6 minutes per block in seconds
            )
            ON CONFLICT (user_id, lesson_id, block_id)
            DO UPDATE SET
                completed_at = EXCLUDED.completed_at,
                time_spent = EXCLUDED.time_spent;

            v_blocks_completed := v_blocks_completed + 1;
        END LOOP;

        -- If lesson has no blocks, create a single progress record
        IF NOT EXISTS (SELECT 1 FROM blocks WHERE lesson_id = lesson_record.lesson_id) THEN
            INSERT INTO lesson_progress (
                user_id,
                lesson_id,
                block_id,
                completed_at,
                time_spent
            )
            VALUES (
                docente_user_id,
                lesson_record.lesson_id,
                NULL, -- No block
                v_current_timestamp - (random() * INTERVAL '7 days'),
                (random() * 300 + 60)::INT
            )
            ON CONFLICT DO NOTHING;
            v_blocks_completed := v_blocks_completed + 1;
        END IF;
    END LOOP;

    RAISE NOTICE '✓ Processed % lessons with % blocks', v_lessons_processed, v_blocks_completed;

    -- =========================================
    -- Step 5: Update course_enrollments to 100% complete
    -- =========================================
    UPDATE course_enrollments
    SET
        progress_percentage = 100,
        lessons_completed = v_total_lessons,
        is_completed = true,
        completed_at = v_current_timestamp,
        updated_at = v_current_timestamp
    WHERE user_id = docente_user_id
    AND course_id = target_course_id;

    RAISE NOTICE '✓ Updated enrollment to 100%% complete';

    -- =========================================
    -- Step 6: Create course_completions record (for certificate trigger)
    -- =========================================
    INSERT INTO course_completions (
        user_id,
        course_id,
        module_id,
        completion_type,
        completed_at,
        completion_notification_sent
    )
    VALUES (
        docente_user_id,
        target_course_id,
        NULL,
        'course',
        v_current_timestamp,
        false -- Will trigger notification/certificate
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✓ Created course_completions record';

    -- =========================================
    -- Step 7: Summary
    -- =========================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CERTIFICATE TEST DATA SEEDING COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'User: docente.qa@fne.cl (%)', docente_user_id;
    RAISE NOTICE 'Course: % (%)', target_course_title, target_course_id;
    RAISE NOTICE 'Lessons completed: %', v_lessons_processed;
    RAISE NOTICE 'Blocks completed: %', v_blocks_completed;
    RAISE NOTICE 'Progress: 100%%';
    RAISE NOTICE '';
    RAISE NOTICE 'The user can now:';
    RAISE NOTICE '  1. View completed course in "Mis Cursos"';
    RAISE NOTICE '  2. Access certificate generation (if implemented)';
    RAISE NOTICE '  3. Receive course completion notification';
    RAISE NOTICE '========================================';

END $$;


-- =============================================
-- SECTION 2: VERIFICATION QUERIES
-- =============================================

-- Verify enrollment status
SELECT
    'ENROLLMENT STATUS' as check_type,
    p.email,
    c.title as course_title,
    ce.progress_percentage,
    ce.lessons_completed,
    ce.is_completed,
    ce.completed_at
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
JOIN courses c ON c.id = ce.course_id
WHERE p.email = 'docente.qa@fne.cl';

-- Verify lesson progress count (should match total blocks in course)
SELECT
    'LESSON PROGRESS COUNT' as check_type,
    p.email,
    COUNT(DISTINCT lp.lesson_id) as unique_lessons_completed,
    COUNT(*) as total_block_records
FROM lesson_progress lp
JOIN profiles p ON p.id = lp.user_id
WHERE p.email = 'docente.qa@fne.cl'
AND lp.completed_at IS NOT NULL
GROUP BY p.email;

-- Verify course_completions record
SELECT
    'COURSE COMPLETIONS' as check_type,
    p.email,
    c.title as course_title,
    cc.completion_type,
    cc.completed_at,
    cc.completion_notification_sent
FROM course_completions cc
JOIN profiles p ON p.id = cc.user_id
JOIN courses c ON c.id = cc.course_id
WHERE p.email = 'docente.qa@fne.cl';


-- =============================================
-- SECTION 3: ADDITIONAL TEST DATA FOR OTHER SCENARIOS
-- =============================================

-- Create a test assignment if one doesn't exist (for task submission testing)
DO $$
DECLARE
    docente_user_id UUID;
    target_course_id UUID;
    first_lesson_id UUID;
    assignment_exists BOOLEAN;
BEGIN
    -- Get user and course
    SELECT id INTO docente_user_id FROM profiles WHERE email = 'docente.qa@fne.cl';

    SELECT ce.course_id INTO target_course_id
    FROM course_enrollments ce
    WHERE ce.user_id = docente_user_id
    LIMIT 1;

    IF target_course_id IS NULL THEN
        RAISE NOTICE 'No enrollment found - skipping assignment creation';
        RETURN;
    END IF;

    -- Get first lesson
    SELECT l.id INTO first_lesson_id
    FROM lessons l
    WHERE l.course_id = target_course_id
    UNION
    SELECT l.id
    FROM modules m
    JOIN lessons l ON l.module_id = m.id
    WHERE m.course_id = target_course_id
    LIMIT 1;

    IF first_lesson_id IS NULL THEN
        RAISE NOTICE 'No lesson found - skipping assignment creation';
        RETURN;
    END IF;

    -- Check if assignment already exists
    SELECT EXISTS (
        SELECT 1 FROM lesson_assignments la
        WHERE la.lesson_id = first_lesson_id
    ) INTO assignment_exists;

    IF NOT assignment_exists THEN
        INSERT INTO lesson_assignments (
            lesson_id,
            course_id,
            title,
            description,
            due_date,
            is_published,
            created_by
        )
        VALUES (
            first_lesson_id,
            target_course_id,
            'Tarea de Prueba - Reflexión sobre el Aprendizaje',
            'Esta tarea requiere que reflexiones sobre lo aprendido en esta lección. Por favor, escribe una reflexión de al menos 200 palabras sobre cómo aplicarás estos conceptos en tu práctica docente.',
            NOW() + INTERVAL '14 days',
            true,
            docente_user_id
        );
        RAISE NOTICE '✓ Created test assignment for lesson: %', first_lesson_id;
    ELSE
        RAISE NOTICE '✓ Assignment already exists for course';
    END IF;
END $$;

-- Verify assignment
SELECT
    'AVAILABLE ASSIGNMENTS' as check_type,
    la.title,
    la.description,
    la.due_date,
    la.is_published
FROM lesson_assignments la
JOIN course_enrollments ce ON ce.course_id = la.course_id
JOIN profiles p ON p.id = ce.user_id
WHERE p.email = 'docente.qa@fne.cl'
AND la.is_published = true
LIMIT 5;


-- =============================================
-- SECTION 4: DATA GAPS ANALYSIS
-- =============================================

-- Check what test scenarios are ready
SELECT
    'TEST READINESS' as analysis_type,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM course_enrollments ce
            JOIN profiles p ON p.id = ce.user_id
            WHERE p.email = 'docente.qa@fne.cl'
            AND ce.progress_percentage = 100
        ) THEN '✓ READY'
        ELSE '✗ NOT READY'
    END as "Course Completion (100%)",

    CASE
        WHEN EXISTS (
            SELECT 1 FROM course_completions cc
            JOIN profiles p ON p.id = cc.user_id
            WHERE p.email = 'docente.qa@fne.cl'
        ) THEN '✓ READY'
        ELSE '✗ NOT READY'
    END as "Certificate Prerequisites",

    CASE
        WHEN EXISTS (
            SELECT 1 FROM lesson_assignments la
            JOIN course_enrollments ce ON ce.course_id = la.course_id
            JOIN profiles p ON p.id = ce.user_id
            WHERE p.email = 'docente.qa@fne.cl'
            AND la.is_published = true
        ) THEN '✓ READY'
        ELSE '✗ NOT READY'
    END as "Task Submission",

    CASE
        WHEN EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN profiles p ON p.id = ur.user_id
            WHERE p.email = 'docente.qa@fne.cl'
            AND ur.community_id IS NOT NULL
            AND ur.is_active = true
        ) THEN '✓ READY'
        ELSE '✗ NOT READY'
    END as "Community Membership";
