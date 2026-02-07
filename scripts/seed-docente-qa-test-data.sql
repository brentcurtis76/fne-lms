-- Seed script for docente.qa@fne.cl test data
-- Run with: npx supabase db execute -f scripts/seed-docente-qa-test-data.sql

-- Get the docente.qa user ID
DO $$
DECLARE
    docente_user_id UUID;
    test_course_id UUID;
    test_lesson_id UUID;
    test_assignment_id UUID;
    test_school_id INT;
    test_community_id UUID;
BEGIN
    -- 1. Get the docente.qa user ID
    SELECT id INTO docente_user_id
    FROM profiles
    WHERE email = 'docente.qa@fne.cl';

    IF docente_user_id IS NULL THEN
        RAISE EXCEPTION 'User docente.qa@fne.cl not found in profiles table';
    END IF;

    RAISE NOTICE 'Found docente.qa user: %', docente_user_id;

    -- 2. Get or verify the user's school (QA Test School should exist)
    SELECT school_id INTO test_school_id
    FROM user_roles
    WHERE user_id = docente_user_id
    AND is_active = true
    AND school_id IS NOT NULL
    LIMIT 1;

    IF test_school_id IS NULL THEN
        RAISE NOTICE 'No school assigned to docente.qa - will skip school-related seeding';
    ELSE
        RAISE NOTICE 'Found school ID: %', test_school_id;
    END IF;

    -- 3. Find an existing published course with lessons to enroll in
    SELECT c.id INTO test_course_id
    FROM courses c
    WHERE c.status = 'published'
    AND EXISTS (
        SELECT 1 FROM modules m
        JOIN lessons l ON l.module_id = m.id
        WHERE m.course_id = c.id
    )
    LIMIT 1;

    IF test_course_id IS NULL THEN
        RAISE NOTICE 'No published course with lessons found - creating test course';

        -- Create a simple test course
        INSERT INTO courses (title, description, status, created_at, updated_at)
        VALUES (
            'Curso de Prueba QA',
            'Curso creado para pruebas QA con docente.qa@fne.cl',
            'published',
            NOW(),
            NOW()
        )
        RETURNING id INTO test_course_id;

        RAISE NOTICE 'Created test course: %', test_course_id;
    ELSE
        RAISE NOTICE 'Using existing course: %', test_course_id;
    END IF;

    -- 4. Enroll docente.qa in the course (if not already enrolled)
    INSERT INTO course_enrollments (user_id, course_id, status, enrolled_at, progress)
    VALUES (docente_user_id, test_course_id, 'active', NOW(), 0)
    ON CONFLICT (user_id, course_id)
    DO UPDATE SET status = 'active', progress = 0;

    RAISE NOTICE 'Enrolled user in course';

    -- 5. Find a lesson with an assignment in this course
    SELECT l.id, la.id INTO test_lesson_id, test_assignment_id
    FROM modules m
    JOIN lessons l ON l.module_id = m.id
    LEFT JOIN lesson_assignments la ON la.lesson_id = l.id
    WHERE m.course_id = test_course_id
    AND la.id IS NOT NULL
    LIMIT 1;

    IF test_assignment_id IS NULL THEN
        -- Try to find any lesson in the course
        SELECT l.id INTO test_lesson_id
        FROM modules m
        JOIN lessons l ON l.module_id = m.id
        WHERE m.course_id = test_course_id
        LIMIT 1;

        IF test_lesson_id IS NOT NULL THEN
            -- Create an assignment for this lesson
            INSERT INTO lesson_assignments (
                lesson_id,
                title,
                description,
                due_date,
                type,
                created_at,
                updated_at
            )
            VALUES (
                test_lesson_id,
                'Tarea de Prueba QA',
                'Esta es una tarea de prueba creada para el usuario docente.qa@fne.cl. Sube tu archivo o escribe tu respuesta.',
                NOW() + INTERVAL '7 days',
                'upload',
                NOW(),
                NOW()
            )
            RETURNING id INTO test_assignment_id;

            RAISE NOTICE 'Created test assignment: %', test_assignment_id;
        ELSE
            RAISE NOTICE 'No lessons found in course - cannot create assignment';
        END IF;
    ELSE
        RAISE NOTICE 'Using existing assignment: %', test_assignment_id;
    END IF;

    -- 6. Try to add community membership if school exists
    IF test_school_id IS NOT NULL THEN
        -- Check if there's a growth_community for this school
        SELECT id INTO test_community_id
        FROM growth_communities
        WHERE school_id = test_school_id
        LIMIT 1;

        IF test_community_id IS NOT NULL THEN
            -- Update user_roles to add community_id if not set
            UPDATE user_roles
            SET community_id = test_community_id
            WHERE user_id = docente_user_id
            AND is_active = true
            AND community_id IS NULL;

            IF FOUND THEN
                RAISE NOTICE 'Added community membership: %', test_community_id;
            ELSE
                RAISE NOTICE 'User already has community membership or no update needed';
            END IF;
        ELSE
            RAISE NOTICE 'No growth community found for school %', test_school_id;
        END IF;
    END IF;

    -- Summary
    RAISE NOTICE '=== SEED COMPLETE ===';
    RAISE NOTICE 'User ID: %', docente_user_id;
    RAISE NOTICE 'Course ID: %', test_course_id;
    RAISE NOTICE 'Assignment ID: %', test_assignment_id;
    RAISE NOTICE 'School ID: %', test_school_id;
    RAISE NOTICE 'Community ID: %', test_community_id;

END $$;

-- Verify the data was created
SELECT
    'ENROLLMENTS' as type,
    ce.user_id,
    ce.course_id,
    c.title as course_title,
    ce.status,
    ce.progress
FROM course_enrollments ce
JOIN courses c ON c.id = ce.course_id
JOIN profiles p ON p.id = ce.user_id
WHERE p.email = 'docente.qa@fne.cl';
