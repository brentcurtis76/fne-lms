-- ============================================
-- SCRIPT: Asignación de Cursos y Rutas a Usuarios Docente
-- Proyecto: FNE LMS - Testing Manual Rol Docente
-- Propósito: Asignar cursos, rutas de aprendizaje y tareas grupales a los 5 usuarios docentes creados
-- Fecha: 2025-01-19
-- Versión: 1.0.0
-- ============================================

-- PREREQUISITOS:
-- 1. Haber ejecutado 01-create-docente-test-users.sql exitosamente
-- 2. Los 5 usuarios docentes deben existir en profiles y user_roles
-- 3. Deben existir al menos 6-8 cursos publicados
-- 4. Deben existir al menos 2-3 rutas de aprendizaje
-- 5. Deben existir al menos 3 tareas grupales activas (blocks)

-- INSTRUCCIONES DE USO:
-- Este script asigna contenido automáticamente a los usuarios de prueba:
-- FASE 1: Ejecutar SECCIONES 0-1 (Pre-validaciones y selección de IDs)
-- FASE 2: Ejecutar SECCIÓN 2 (Asignación de cursos individuales)
-- FASE 3: Ejecutar SECCIÓN 3 (Asignación de rutas de aprendizaje)
-- FASE 4: Ejecutar SECCIÓN 4 (Verificación de asignaciones)

-- IMPORTANTE: Este script usa un usuario admin existente como "assigned_by"
-- Si no existe admin@fne-lms.test, se usará el primer admin disponible

-- ============================================
-- SECCIÓN 0: PRE-VALIDACIONES
-- ============================================

DO $$
DECLARE
    v_usuarios_docentes INTEGER;
    v_cursos_disponibles INTEGER;
    v_rutas_disponibles INTEGER;
    v_tareas_grupales INTEGER;
    v_admin_id UUID;
    v_mensaje TEXT := '';
BEGIN
    -- Verificar usuarios docentes de prueba
    SELECT COUNT(*) INTO v_usuarios_docentes
    FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test';

    IF v_usuarios_docentes < 5 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_usuarios_docentes || ' usuario(s) docente de prueba (se necesitan 5)\n';
        v_mensaje := v_mensaje || E'   → Ejecutar primero: 01-create-docente-test-users.sql\n';
    END IF;

    -- Verificar cursos disponibles
    SELECT COUNT(*) INTO v_cursos_disponibles
    FROM courses
    WHERE status IN ('published', 'active');

    IF v_cursos_disponibles < 6 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_cursos_disponibles || ' curso(s) publicado(s) (se recomiendan al menos 6)\n';
    END IF;

    -- Verificar rutas de aprendizaje
    SELECT COUNT(*) INTO v_rutas_disponibles
    FROM learning_paths;

    IF v_rutas_disponibles < 2 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_rutas_disponibles || ' ruta(s) de aprendizaje (se recomiendan al menos 2)\n';
    END IF;

    -- Verificar tareas grupales activas
    SELECT COUNT(*) INTO v_tareas_grupales
    FROM blocks
    WHERE type IN ('group-assignment', 'group_assignment')
      AND is_visible = true;

    IF v_tareas_grupales < 3 THEN
        v_mensaje := v_mensaje || E'✗ ADVERTENCIA: Solo hay ' || v_tareas_grupales || ' tarea(s) grupal(es) activa(s) (se recomiendan al menos 3)\n';
    END IF;

    -- Verificar que existe un usuario admin para usar como "assigned_by"
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE email = 'admin@fne-lms.test'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        -- Si no existe admin@fne-lms.test, buscar cualquier admin
        SELECT p.id INTO v_admin_id
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.role_type = 'admin'
          AND ur.is_active = true
        LIMIT 1;

        IF v_admin_id IS NULL THEN
            v_mensaje := v_mensaje || E'✗ CRÍTICO: No se encontró ningún usuario admin activo para usar como asignador\n';
        END IF;
    END IF;

    -- Si hay errores críticos, detener
    IF v_mensaje <> '' THEN
        RAISE EXCEPTION E'PRE-VALIDACIÓN FALLIDA:\n%', v_mensaje;
    ELSE
        RAISE NOTICE '✓ PRE-VALIDACIÓN EXITOSA: Todos los requisitos están cumplidos';
        RAISE NOTICE 'Admin ID para asignaciones: %', v_admin_id;
    END IF;
END $$;


-- ============================================
-- SECCIÓN 1: INFORMACIÓN DE USUARIOS Y CONTENIDO
-- ============================================

-- Query 1.1: Ver los 5 usuarios docentes de prueba
-- Propósito: Confirmar qué usuarios recibirán asignaciones
SELECT
    p.id as user_id,
    p.email,
    p.name,
    s.name as escuela,
    g.name as generacion,
    gc.name as comunidad,
    CASE
        WHEN p.generation_id IS NOT NULL AND p.community_id IS NOT NULL THEN 'Escenario 1/2: Con Gen + Con Com'
        WHEN p.generation_id IS NOT NULL AND p.community_id IS NULL THEN 'Escenario 4: Con Gen + Sin Com'
        WHEN p.generation_id IS NULL AND p.community_id IS NOT NULL THEN 'Escenario 3: Sin Gen + Con Com'
        WHEN p.generation_id IS NULL AND p.community_id IS NULL THEN 'Escenario 5: Sin Gen + Sin Com'
    END as escenario
FROM profiles p
LEFT JOIN schools s ON s.id = p.school_id
LEFT JOIN generations g ON g.id = p.generation_id
LEFT JOIN growth_communities gc ON gc.id = p.community_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;

-- ANOTAR AQUÍ LOS USER IDS:
-- Usuario 1 (docente.test1): _____________________________________
-- Usuario 2 (docente.test2): _____________________________________
-- Usuario 3 (docente.test3): _____________________________________
-- Usuario 4 (docente.test4): _____________________________________
-- Usuario 5 (docente.test5): _____________________________________


-- Query 1.2: Ver cursos disponibles para asignar
-- Propósito: Identificar cursos que se asignarán a cada usuario
SELECT
    c.id as curso_id,
    c.title as titulo,
    c.structure_type as tipo_estructura,
    c.status,
    COUNT(DISTINCT l.id) as total_lecciones,
    COUNT(DISTINCT m.id) as total_modulos
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id
LEFT JOIN modules m ON m.course_id = c.id
WHERE c.status IN ('published', 'active')
GROUP BY c.id, c.title, c.structure_type, c.status
ORDER BY c.created_at DESC
LIMIT 20;

-- ESTRATEGIA DE ASIGNACIÓN:
-- Usuario 1: Cursos 1, 2, 3 (variedad: simple + estructurado)
-- Usuario 2: Cursos 2, 3, 4 (con overlap para simular grupos)
-- Usuario 3: Cursos 1, 4, 5
-- Usuario 4: Cursos 3, 5, 6
-- Usuario 5: Cursos 1, 6, 7 (si hay suficientes)


-- Query 1.3: Ver rutas de aprendizaje disponibles
-- Propósito: Identificar rutas que se asignarán a usuarios
SELECT
    lp.id as ruta_id,
    lp.name as nombre_ruta,
    lp.description,
    COUNT(lpc.course_id) as total_cursos,
    STRING_AGG(c.title, ' → ' ORDER BY lpc.sequence_order) as secuencia_cursos
FROM learning_paths lp
LEFT JOIN learning_path_courses lpc ON lpc.learning_path_id = lp.id
LEFT JOIN courses c ON c.id = lpc.course_id
GROUP BY lp.id, lp.name, lp.description
ORDER BY lp.created_at DESC
LIMIT 10;

-- ESTRATEGIA DE ASIGNACIÓN:
-- Usuarios 1, 2, 3: Ruta 1
-- Usuarios 3, 4: Ruta 2
-- Usuario 5: Ruta 3 (si existe)


-- Query 1.4: Ver tareas grupales disponibles
-- Propósito: Confirmar tareas que estarán disponibles para usuarios con comunidad
SELECT
    b.id as block_id,
    b.payload->>'title' as titulo_tarea,
    c.title as curso,
    l.title as leccion,
    b.is_visible
FROM blocks b
JOIN lessons l ON l.id = b.lesson_id
LEFT JOIN modules m ON m.id = l.module_id
LEFT JOIN courses c ON c.id = COALESCE(l.course_id, m.course_id)
WHERE b.type IN ('group-assignment', 'group_assignment')
  AND b.is_visible = true
ORDER BY c.title, l.title
LIMIT 10;

-- NOTA: Las tareas grupales NO se "asignan" directamente.
-- Los usuarios con comunidad las verán automáticamente si están en cursos que contienen estos blocks.


-- ============================================
-- SECCIÓN 2: ASIGNACIÓN DE CURSOS INDIVIDUALES
-- ============================================

-- IMPORTANTE: Este bloque asigna cursos automáticamente usando distribución inteligente
-- Se asignan 2-3 cursos por usuario con variedad y overlap estratégico

DO $$
DECLARE
    v_admin_id UUID;
    v_user_ids UUID[];
    v_course_ids UUID[];
    v_user_id UUID;
    v_course_id UUID;
    v_assignments_created INTEGER := 0;
BEGIN
    -- Obtener admin ID
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE email = 'admin@fne-lms.test'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        SELECT p.id INTO v_admin_id
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.role_type = 'admin' AND ur.is_active = true
        LIMIT 1;
    END IF;

    -- Obtener IDs de usuarios docentes de prueba (ordenados por email)
    SELECT ARRAY_AGG(id ORDER BY email) INTO v_user_ids
    FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test';

    -- Obtener IDs de cursos disponibles (ordenados por created_at DESC)
    SELECT ARRAY_AGG(id ORDER BY created_at DESC) INTO v_course_ids
    FROM courses
    WHERE status IN ('published', 'active')
    LIMIT 8;

    RAISE NOTICE 'Asignando cursos a % usuarios usando admin %', ARRAY_LENGTH(v_user_ids, 1), v_admin_id;
    RAISE NOTICE 'Cursos disponibles: %', ARRAY_LENGTH(v_course_ids, 1);

    -- Validar que tenemos suficientes datos
    IF ARRAY_LENGTH(v_user_ids, 1) < 5 THEN
        RAISE EXCEPTION 'Se necesitan 5 usuarios docentes, solo se encontraron %', ARRAY_LENGTH(v_user_ids, 1);
    END IF;

    IF ARRAY_LENGTH(v_course_ids, 1) < 3 THEN
        RAISE EXCEPTION 'Se necesitan al menos 3 cursos, solo se encontraron %', ARRAY_LENGTH(v_course_ids, 1);
    END IF;

    -- Asignaciones con estrategia de distribución:
    -- Usuario 1: Cursos 1, 2, 3
    FOR i IN 1..LEAST(3, ARRAY_LENGTH(v_course_ids, 1)) LOOP
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[i], v_user_ids[1], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[1], v_course_ids[i], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END LOOP;

    -- Usuario 2: Cursos 2, 3, 4 (overlap con Usuario 1)
    FOR i IN 2..LEAST(4, ARRAY_LENGTH(v_course_ids, 1)) LOOP
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[i], v_user_ids[2], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[2], v_course_ids[i], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END LOOP;

    -- Usuario 3: Cursos 1, 4, 5
    IF ARRAY_LENGTH(v_course_ids, 1) >= 1 THEN
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[1], v_user_ids[3], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[3], v_course_ids[1], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END IF;

    FOR i IN 4..LEAST(5, ARRAY_LENGTH(v_course_ids, 1)) LOOP
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[i], v_user_ids[3], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[3], v_course_ids[i], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END LOOP;

    -- Usuario 4: Cursos 3, 5, 6
    IF ARRAY_LENGTH(v_course_ids, 1) >= 3 THEN
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[3], v_user_ids[4], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[4], v_course_ids[3], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END IF;

    FOR i IN 5..LEAST(6, ARRAY_LENGTH(v_course_ids, 1)) LOOP
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[i], v_user_ids[4], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[4], v_course_ids[i], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END LOOP;

    -- Usuario 5: Cursos 1, 6, 7 (si existen)
    IF ARRAY_LENGTH(v_course_ids, 1) >= 1 THEN
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[1], v_user_ids[5], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[5], v_course_ids[1], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END IF;

    FOR i IN 6..LEAST(8, ARRAY_LENGTH(v_course_ids, 1)) LOOP
        INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assignment_type, status)
        VALUES (v_course_ids[i], v_user_ids[5], v_admin_id, 'individual', 'active')
        ON CONFLICT DO NOTHING;

        INSERT INTO course_enrollments (user_id, course_id, enrolled_by, enrollment_type, status)
        VALUES (v_user_ids[5], v_course_ids[i], v_admin_id, 'assigned', 'active')
        ON CONFLICT (user_id, course_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END LOOP;

    RAISE NOTICE '✓ Asignaciones de cursos completadas: % asignaciones procesadas', v_assignments_created;
END $$;


-- ============================================
-- SECCIÓN 3: ASIGNACIÓN DE RUTAS DE APRENDIZAJE
-- ============================================

-- IMPORTANTE: Este bloque asigna rutas de aprendizaje con distribución estratégica
-- Algunos usuarios comparten rutas para simular experiencia de grupo

DO $$
DECLARE
    v_admin_id UUID;
    v_user_ids UUID[];
    v_path_ids UUID[];
    v_assignments_created INTEGER := 0;
BEGIN
    -- Obtener admin ID
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE email = 'admin@fne-lms.test'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        SELECT p.id INTO v_admin_id
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.role_type = 'admin' AND ur.is_active = true
        LIMIT 1;
    END IF;

    -- Obtener IDs de usuarios docentes de prueba (ordenados por email)
    SELECT ARRAY_AGG(id ORDER BY email) INTO v_user_ids
    FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test';

    -- Obtener IDs de rutas disponibles (ordenadas por created_at DESC)
    SELECT ARRAY_AGG(id ORDER BY created_at DESC) INTO v_path_ids
    FROM learning_paths
    LIMIT 5;

    RAISE NOTICE 'Asignando rutas de aprendizaje a % usuarios', ARRAY_LENGTH(v_user_ids, 1);
    RAISE NOTICE 'Rutas disponibles: %', COALESCE(ARRAY_LENGTH(v_path_ids, 1), 0);

    -- Validar que existen rutas
    IF v_path_ids IS NULL OR ARRAY_LENGTH(v_path_ids, 1) = 0 THEN
        RAISE WARNING 'No hay rutas de aprendizaje disponibles para asignar';
        RETURN;
    END IF;

    -- Asignaciones de rutas:
    -- Usuarios 1, 2, 3: Ruta 1 (comparten la misma ruta)
    FOR i IN 1..3 LOOP
        IF i <= ARRAY_LENGTH(v_user_ids, 1) AND ARRAY_LENGTH(v_path_ids, 1) >= 1 THEN
            INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
            VALUES (v_path_ids[1], v_user_ids[i], v_admin_id)
            ON CONFLICT (user_id, path_id) DO NOTHING;

            v_assignments_created := v_assignments_created + 1;
        END IF;
    END LOOP;

    -- Usuarios 3, 4: Ruta 2 (Usuario 3 tiene 2 rutas, Usuario 4 comparte Ruta 2 con Usuario 3)
    IF ARRAY_LENGTH(v_path_ids, 1) >= 2 THEN
        FOR i IN 3..4 LOOP
            IF i <= ARRAY_LENGTH(v_user_ids, 1) THEN
                INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
                VALUES (v_path_ids[2], v_user_ids[i], v_admin_id)
                ON CONFLICT (user_id, path_id) DO NOTHING;

                v_assignments_created := v_assignments_created + 1;
            END IF;
        END LOOP;
    END IF;

    -- Usuario 5: Ruta 3 (si existe)
    IF ARRAY_LENGTH(v_path_ids, 1) >= 3 AND ARRAY_LENGTH(v_user_ids, 1) >= 5 THEN
        INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
        VALUES (v_path_ids[3], v_user_ids[5], v_admin_id)
        ON CONFLICT (user_id, path_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
    END IF;

    RAISE NOTICE '✓ Asignaciones de rutas de aprendizaje completadas: % asignaciones procesadas', v_assignments_created;
END $$;


-- ============================================
-- SECCIÓN 4: VERIFICACIÓN DE ASIGNACIONES
-- ============================================

-- Query 4.1: Verificar cursos asignados por usuario
-- Propósito: Confirmar que cada usuario tiene 2-3 cursos asignados
SELECT
    p.email,
    p.name,
    COUNT(DISTINCT ca.course_id) as total_cursos_asignados,
    STRING_AGG(DISTINCT c.title, ', ' ORDER BY c.title) as titulos_cursos
FROM profiles p
LEFT JOIN course_assignments ca ON ca.teacher_id = p.id
LEFT JOIN courses c ON c.id = ca.course_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email, p.name
ORDER BY p.email;

-- Esperado:
-- Cada usuario: 2-3 cursos asignados
-- Total general: ~12-15 asignaciones


-- Query 4.2: Verificar enrollments creados
-- Propósito: Confirmar que las inscripciones se crearon correctamente
SELECT
    p.email,
    COUNT(DISTINCT ce.course_id) as total_enrollments,
    STRING_AGG(DISTINCT c.title, ', ' ORDER BY c.title) as cursos_inscritos
FROM profiles p
LEFT JOIN course_enrollments ce ON ce.user_id = p.id
LEFT JOIN courses c ON c.id = ce.course_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email
ORDER BY p.email;

-- Esperado:
-- Mismo número que Query 4.1 (cada assignment debe tener enrollment)


-- Query 4.3: Verificar rutas de aprendizaje asignadas por usuario
-- Propósito: Confirmar distribución de rutas
SELECT
    p.email,
    p.name,
    COUNT(DISTINCT lpa.path_id) as total_rutas_asignadas,
    STRING_AGG(DISTINCT lp.name, ', ' ORDER BY lp.name) as nombres_rutas
FROM profiles p
LEFT JOIN learning_path_assignments lpa ON lpa.user_id = p.id
LEFT JOIN learning_paths lp ON lp.id = lpa.path_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email, p.name
ORDER BY p.email;

-- Esperado:
-- Usuario 1: 1 ruta (Ruta 1)
-- Usuario 2: 1 ruta (Ruta 1)
-- Usuario 3: 2 rutas (Ruta 1 y Ruta 2)
-- Usuario 4: 1 ruta (Ruta 2)
-- Usuario 5: 1 ruta (Ruta 3, si existe)


-- Query 4.4: Verificar overlap de cursos (usuarios con cursos compartidos)
-- Propósito: Confirmar que hay overlap estratégico para simular grupos
SELECT
    c.title as curso,
    COUNT(DISTINCT ca.teacher_id) as usuarios_asignados,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails_usuarios
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
JOIN profiles p ON p.id = ca.teacher_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY c.id, c.title
HAVING COUNT(DISTINCT ca.teacher_id) > 1
ORDER BY usuarios_asignados DESC, c.title;

-- Esperado:
-- Al menos 2-3 cursos compartidos por múltiples usuarios
-- Esto simula experiencia de grupo/colaboración


-- Query 4.5: Verificar tareas grupales disponibles para usuarios con comunidad
-- Propósito: Confirmar que usuarios en comunidades verán tareas grupales
SELECT
    p.email,
    p.name,
    gc.name as comunidad,
    COUNT(DISTINCT b.id) as tareas_grupales_visibles,
    STRING_AGG(DISTINCT (b.payload->>'title'), ', ') as titulos_tareas
FROM profiles p
LEFT JOIN growth_communities gc ON gc.id = p.community_id
LEFT JOIN course_enrollments ce ON ce.user_id = p.id
LEFT JOIN courses c ON c.id = ce.course_id
LEFT JOIN lessons l ON (l.course_id = c.id OR l.course_id IN (
    SELECT course_id FROM modules WHERE course_id = c.id
))
LEFT JOIN blocks b ON b.lesson_id = l.id
    AND b.type IN ('group-assignment', 'group_assignment')
    AND b.is_visible = true
WHERE p.email LIKE 'docente.test%@fne-lms.test'
  AND p.community_id IS NOT NULL
GROUP BY p.id, p.email, p.name, gc.name
ORDER BY p.email;

-- Esperado:
-- Usuarios 1, 2, 3 (con comunidad): >= 1 tarea grupal visible
-- Usuarios 4, 5 (sin comunidad): No aparecen en este query


-- Query 4.6: Resumen general de asignaciones
-- Propósito: Vista ejecutiva de todas las asignaciones
SELECT
    (SELECT COUNT(*) FROM course_assignments ca
     JOIN profiles p ON p.id = ca.teacher_id
     WHERE p.email LIKE 'docente.test%@fne-lms.test') as total_course_assignments,

    (SELECT COUNT(*) FROM course_enrollments ce
     JOIN profiles p ON p.id = ce.user_id
     WHERE p.email LIKE 'docente.test%@fne-lms.test') as total_course_enrollments,

    (SELECT COUNT(*) FROM learning_path_assignments lpa
     JOIN profiles p ON p.id = lpa.user_id
     WHERE p.email LIKE 'docente.test%@fne-lms.test') as total_path_assignments,

    (SELECT COUNT(DISTINCT ca.course_id)
     FROM course_assignments ca
     JOIN profiles p ON p.id = ca.teacher_id
     WHERE p.email LIKE 'docente.test%@fne-lms.test') as cursos_unicos_usados,

    (SELECT COUNT(DISTINCT lpa.path_id)
     FROM learning_path_assignments lpa
     JOIN profiles p ON p.id = lpa.user_id
     WHERE p.email LIKE 'docente.test%@fne-lms.test') as rutas_unicas_usadas;

-- Esperado:
-- total_course_assignments: 12-15
-- total_course_enrollments: 12-15 (igual que assignments)
-- total_path_assignments: 6-8
-- cursos_unicos_usados: 6-8
-- rutas_unicas_usadas: 2-3


-- ============================================
-- CONCLUSIÓN
-- ============================================

-- Si todas las verificaciones son exitosas:
-- ✓ Los 5 usuarios docentes tienen cursos asignados
-- ✓ Hay variedad en los cursos (simple y estructurados)
-- ✓ Hay overlap estratégico (usuarios comparten algunos cursos)
-- ✓ Las rutas de aprendizaje están distribuidas
-- ✓ Usuarios con comunidad tienen acceso a tareas grupales

-- SIGUIENTE PASO:
-- Ejecutar 03-verify-docente-setup.sql para validación completa del setup

-- NOTAS IMPORTANTES:
-- 1. Este script es idempotente: usa ON CONFLICT DO NOTHING
-- 2. Las tareas grupales NO se asignan directamente, los usuarios las ven
--    automáticamente cuando están inscritos en cursos que las contienen
-- 3. El admin usado como "assigned_by" es admin@fne-lms.test o el primer admin activo

-- ============================================
-- FIN DEL SCRIPT DE ASIGNACIÓN DE CONTENIDO
-- ============================================
