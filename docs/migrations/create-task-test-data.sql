-- Create Task Test Data for docente.qa@fne.cl
-- Purpose: Create a group-assignment block so tasks appear in "Mis Tareas" → "Pendientes"
--
-- Run with: Paste in Supabase SQL Editor (Dashboard > SQL Editor)
-- Author: Claude Code
-- Date: 2026-02-05
--
-- CRITICAL: The "Mis Tareas" page uses the `blocks` table with type='group-assignment',
-- NOT the `lesson_assignments` table. This script creates the correct data structure.

-- =============================================
-- CREATE GROUP ASSIGNMENT BLOCK FOR TESTING
-- =============================================

DO $$
DECLARE
    v_user_id UUID;
    v_course_id UUID;
    v_course_title TEXT;
    v_lesson_id UUID;
    v_lesson_title TEXT;
    v_block_id UUID;
    v_existing_block_count INT;
    v_next_position INT;
BEGIN
    -- 1. Get the docente.qa user ID
    SELECT id INTO v_user_id
    FROM profiles
    WHERE email = 'docente.qa@fne.cl';

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User docente.qa@fne.cl not found in profiles table';
    END IF;

    RAISE NOTICE '✓ Found user: %', v_user_id;

    -- 2. Get an enrolled course for docente.qa
    SELECT ce.course_id, c.title
    INTO v_course_id, v_course_title
    FROM course_enrollments ce
    JOIN courses c ON c.id = ce.course_id
    WHERE ce.user_id = v_user_id
    AND ce.status = 'active'
    LIMIT 1;

    IF v_course_id IS NULL THEN
        -- Fallback: try course_assignments table
        SELECT ca.course_id, c.title
        INTO v_course_id, v_course_title
        FROM course_assignments ca
        JOIN courses c ON c.id = ca.course_id
        WHERE ca.teacher_id = v_user_id
        LIMIT 1;
    END IF;

    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'No enrolled/assigned course found for docente.qa@fne.cl. Please enroll the user in a course first.';
    END IF;

    RAISE NOTICE '✓ Found course: % (%)', v_course_title, v_course_id;

    -- 3. Find a lesson in this course
    SELECT l.id, l.title
    INTO v_lesson_id, v_lesson_title
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = v_course_id
    ORDER BY m.order_number, l.order_number
    LIMIT 1;

    IF v_lesson_id IS NULL THEN
        -- Try direct course_id on lessons table (some courses use this)
        SELECT l.id, l.title
        INTO v_lesson_id, v_lesson_title
        FROM lessons l
        WHERE l.course_id = v_course_id
        ORDER BY l.order_number
        LIMIT 1;
    END IF;

    IF v_lesson_id IS NULL THEN
        RAISE EXCEPTION 'No lesson found in course %. Please create a lesson first.', v_course_title;
    END IF;

    RAISE NOTICE '✓ Found lesson: % (%)', v_lesson_title, v_lesson_id;

    -- 4. Check if there's already a group-assignment block in this lesson
    SELECT COUNT(*), COALESCE(MAX(position), 0) + 1
    INTO v_existing_block_count, v_next_position
    FROM blocks
    WHERE lesson_id = v_lesson_id
    AND (type = 'group-assignment' OR type = 'group_assignment');

    IF v_existing_block_count > 0 THEN
        RAISE NOTICE '⚠ Found % existing group-assignment block(s) in this lesson. Adding another for testing.', v_existing_block_count;
    END IF;

    -- Get the actual next position considering all block types
    SELECT COALESCE(MAX(position), 0) + 1
    INTO v_next_position
    FROM blocks
    WHERE lesson_id = v_lesson_id;

    -- 5. Create the group-assignment block
    -- Note: blocks table may use 'payload' or 'content' column depending on migration version
    INSERT INTO blocks (
        lesson_id,
        type,
        position,
        payload,
        is_visible
    )
    VALUES (
        v_lesson_id,
        'group-assignment',
        v_next_position,
        jsonb_build_object(
            'title', 'Tarea de Prueba QA - Reflexión Colaborativa',
            'description', 'Esta es una tarea de prueba creada para validar el flujo de entrega de tareas en el LMS. Por favor, completa esta tarea para verificar que el sistema funciona correctamente.',
            'instructions', E'## Instrucciones\n\n1. **Lee detenidamente** el material de la lección\n2. **Reflexiona** sobre los conceptos principales\n3. **Escribe** una respuesta de al menos 200 palabras\n4. **Sube** cualquier archivo adicional si es necesario\n\n### Criterios de evaluación:\n- Comprensión del tema (40%)\n- Análisis crítico (30%)\n- Claridad de expresión (20%)\n- Originalidad (10%)',
            'resources', jsonb_build_array(
                jsonb_build_object(
                    'id', gen_random_uuid()::text,
                    'type', 'link',
                    'title', 'Guía de Reflexión',
                    'url', 'https://example.com/guia-reflexion',
                    'description', 'Recurso de apoyo para completar la tarea'
                )
            )
        ),
        true
    )
    RETURNING id INTO v_block_id;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TASK TEST DATA CREATED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'User: docente.qa@fne.cl';
    RAISE NOTICE 'Course: %', v_course_title;
    RAISE NOTICE 'Lesson: %', v_lesson_title;
    RAISE NOTICE 'Block ID: %', v_block_id;
    RAISE NOTICE '';
    RAISE NOTICE 'The task should now appear in:';
    RAISE NOTICE '  → Mi Aprendizaje → Mis Tareas → Pendientes';
    RAISE NOTICE '========================================';

END $$;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- 1. Show all group-assignment blocks for docente.qa's enrolled courses
SELECT
    'GROUP ASSIGNMENT BLOCKS' as check_type,
    b.id as block_id,
    b.type,
    b.position,
    b.payload->>'title' as task_title,
    l.title as lesson_title,
    c.title as course_title
FROM blocks b
JOIN lessons l ON l.id = b.lesson_id
LEFT JOIN modules m ON m.id = l.module_id
JOIN courses c ON c.id = COALESCE(m.course_id, l.course_id)
JOIN course_enrollments ce ON ce.course_id = c.id
JOIN profiles p ON p.id = ce.user_id
WHERE p.email = 'docente.qa@fne.cl'
AND ce.status = 'active'
AND (b.type = 'group-assignment' OR b.type = 'group_assignment')
ORDER BY b.id DESC;

-- 2. Verify the user enrollment exists
SELECT
    'ENROLLMENT STATUS' as check_type,
    p.email,
    c.title as course_title,
    ce.status,
    ce.enrolled_at
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
JOIN courses c ON c.id = ce.course_id
WHERE p.email = 'docente.qa@fne.cl';

-- 3. Check if there are any submissions for the tasks
SELECT
    'SUBMISSION STATUS' as check_type,
    p.email,
    gas.assignment_id,
    b.payload->>'title' as task_title,
    gas.status,
    gas.submitted_at
FROM group_assignment_submissions gas
JOIN profiles p ON p.id = gas.user_id
JOIN blocks b ON b.id::text = gas.assignment_id
WHERE p.email = 'docente.qa@fne.cl';
