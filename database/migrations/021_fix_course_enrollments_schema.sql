-- Migration: Fix course_enrollments schema
-- Created: 2025-11-22
-- Purpose: Add missing columns to course_enrollments table that are required by the API and other migrations

DO $$
BEGIN
    -- Add progress_percentage if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'progress_percentage') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100);
        RAISE NOTICE 'Added progress_percentage column';
    END IF;

    -- Add lessons_completed if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'lessons_completed') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN lessons_completed INTEGER DEFAULT 0;
        RAISE NOTICE 'Added lessons_completed column';
    END IF;

    -- Add total_lessons if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'total_lessons') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN total_lessons INTEGER DEFAULT 0;
        RAISE NOTICE 'Added total_lessons column';
    END IF;

    -- Add is_completed if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'is_completed') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN is_completed BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_completed column';
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'updated_at') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
        RAISE NOTICE 'Added updated_at column';
    END IF;

    -- Add enrollment_type if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'enrollment_type') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN enrollment_type VARCHAR(50) DEFAULT 'self_enrolled';
        RAISE NOTICE 'Added enrollment_type column';
    END IF;

    -- Add enrolled_by if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'enrolled_by') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN enrolled_by UUID REFERENCES auth.users(id);
        RAISE NOTICE 'Added enrolled_by column';
    END IF;

    -- Add status if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'status') THEN
        ALTER TABLE public.course_enrollments ADD COLUMN status VARCHAR(50) DEFAULT 'active';
        RAISE NOTICE 'Added status column';
    END IF;

END $$;

-- Update the trigger function to be safe if columns were just added
CREATE OR REPLACE FUNCTION update_course_enrollment_progress()
RETURNS TRIGGER AS $$
DECLARE
    v_course_id UUID;
    v_total_lessons INT;
    v_completed_lessons INT;
    v_progress_pct NUMERIC;
BEGIN
    -- Get course_id for this lesson
    SELECT course_id INTO v_course_id
    FROM lessons
    WHERE id = NEW.lesson_id;

    -- If course not found, skip update
    IF v_course_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count total lessons in course
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons
    WHERE course_id = v_course_id;

    -- Count completed lessons for this user
    SELECT COUNT(DISTINCT l.id) INTO v_completed_lessons
    FROM lessons l
    WHERE l.course_id = v_course_id
      -- Check that all mandatory blocks for this lesson are completed
      AND NOT EXISTS (
          SELECT 1
          FROM blocks b
          WHERE b.lesson_id = l.id
            AND b.is_mandatory = true
            AND NOT EXISTS (
                SELECT 1
                FROM lesson_progress lp
                WHERE lp.lesson_id = l.id
                  AND lp.block_id = b.id
                  AND lp.user_id = NEW.user_id
                  AND lp.completed_at IS NOT NULL
            )
      );

    -- Calculate progress percentage
    IF v_total_lessons > 0 THEN
        v_progress_pct := ROUND((v_completed_lessons::NUMERIC / v_total_lessons * 100), 2);
    ELSE
        v_progress_pct := 0;
    END IF;

    -- Update enrollment
    UPDATE course_enrollments
    SET
        lessons_completed = v_completed_lessons,
        progress_percentage = v_progress_pct,
        is_completed = (v_progress_pct >= 100),
        completed_at = CASE
            WHEN v_progress_pct >= 100 AND completed_at IS NULL
            THEN NOW()
            ELSE completed_at
        END,
        updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
