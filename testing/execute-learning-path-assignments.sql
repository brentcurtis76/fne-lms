-- ============================================
-- SCRIPT: Ejecutar Asignaciones de Rutas de Aprendizaje
-- ============================================
-- Propósito: Asignar rutas de aprendizaje a los 5 usuarios docentes de prueba
-- Este script es la Sección 3 extraída de 02-assign-courses-to-docentes.sql
-- Ejecutar en: Supabase SQL Editor

-- Pre-requisitos verificados:
-- ✅ 6 rutas de aprendizaje disponibles
-- ✅ 5 usuarios docentes de prueba existen
-- ✅ Admin user disponible para assigned_by

-- ============================================
-- ASIGNACIÓN DE RUTAS DE APRENDIZAJE
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
    WHERE is_active = true
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
            RAISE NOTICE '  → Usuario % asignado a Ruta 1', i;
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
                RAISE NOTICE '  → Usuario % asignado a Ruta 2', i;
            END IF;
        END LOOP;
    END IF;

    -- Usuario 5: Ruta 3 (si existe)
    IF ARRAY_LENGTH(v_path_ids, 1) >= 3 AND ARRAY_LENGTH(v_user_ids, 1) >= 5 THEN
        INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
        VALUES (v_path_ids[3], v_user_ids[5], v_admin_id)
        ON CONFLICT (user_id, path_id) DO NOTHING;

        v_assignments_created := v_assignments_created + 1;
        RAISE NOTICE '  → Usuario 5 asignado a Ruta 3';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✓ Asignaciones de rutas de aprendizaje completadas';
    RAISE NOTICE '  Total asignaciones procesadas: %', v_assignments_created;
END $$;


-- ============================================
-- VERIFICACIÓN POST-ASIGNACIÓN
-- ============================================

-- Query V1: Verificar rutas asignadas por usuario
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
-- Usuario 5: 1 ruta (Ruta 3)
-- TOTAL: 6 asignaciones


-- Query V2: Verificar distribución de rutas (overlap)
SELECT
    lp.name as ruta,
    COUNT(DISTINCT lpa.user_id) as usuarios_asignados,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails
FROM learning_path_assignments lpa
JOIN learning_paths lp ON lp.id = lpa.path_id
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY lp.id, lp.name
ORDER BY usuarios_asignados DESC, lp.name;

-- Esperado:
-- Ruta 1: 3 usuarios (docente.test1, docente.test2, docente.test3)
-- Ruta 2: 2 usuarios (docente.test3, docente.test4)
-- Ruta 3: 1 usuario (docente.test5)


-- Query V3: Resumen ejecutivo post-asignación
SELECT
    'RESUMEN POST-ASIGNACIÓN' as titulo,
    COUNT(DISTINCT lpa.user_id) as usuarios_con_rutas,
    COUNT(DISTINCT lpa.path_id) as rutas_asignadas,
    COUNT(*) as total_asignaciones,
    CASE
        WHEN COUNT(*) = 6 THEN '✓ PERFECTO: 6 asignaciones como esperado'
        WHEN COUNT(*) > 0 AND COUNT(*) < 6 THEN '⚠ PARCIAL: ' || COUNT(*) || ' asignaciones (esperadas: 6)'
        WHEN COUNT(*) = 0 THEN '✗ ERROR: Sin asignaciones creadas'
        ELSE '⚠ ADVERTENCIA: ' || COUNT(*) || ' asignaciones (esperadas: 6)'
    END as estado
FROM learning_path_assignments lpa
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test';


-- ============================================
-- FIN DEL SCRIPT
-- ============================================

-- Si Query V3 muestra "✓ PERFECTO: 6 asignaciones como esperado":
--   → Proceder a ejecutar 03-verify-docente-setup.sql para validación completa
--
-- Si Query V3 muestra error o resultado parcial:
--   → Revisar mensajes RAISE NOTICE arriba
--   → Verificar que learning_paths table tiene >= 3 rutas activas
--   → Verificar que no hay conflictos en learning_path_assignments
