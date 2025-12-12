-- ============================================
-- DIAGNÓSTICO: ¿Por qué no se asignaron rutas de aprendizaje?
-- ============================================
-- Ejecutar en: Supabase SQL Editor
-- Este script investiga por qué Phase 3 resultó en 0 learning path assignments

-- Query 1: ¿Existen rutas de aprendizaje en el sistema?
SELECT
    'Q1: Rutas de Aprendizaje Disponibles' as diagnostico,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) = 0 THEN '✗ CAUSA RAÍZ: No hay rutas disponibles para asignar'
        WHEN COUNT(*) < 3 THEN '⚠ Pocas rutas (' || COUNT(*) || '), puede causar asignaciones incompletas'
        ELSE '✓ Suficientes rutas disponibles (' || COUNT(*) || ')'
    END as diagnostico_resultado
FROM learning_paths
WHERE is_active = true;

-- Query 2: Detalle de rutas existentes (si existen)
SELECT
    'Q2: Detalle de Rutas' as seccion,
    lp.id,
    lp.name as nombre,
    lp.description as descripcion,
    lp.is_active as activa,
    lp.created_at,
    COUNT(lpc.course_id) as cursos_en_ruta
FROM learning_paths lp
LEFT JOIN learning_path_courses lpc ON lpc.learning_path_id = lp.id
GROUP BY lp.id, lp.name, lp.description, lp.is_active, lp.created_at
ORDER BY lp.created_at DESC;

-- Query 3: ¿Existen los usuarios de prueba?
SELECT
    'Q3: Usuarios de Prueba Disponibles' as diagnostico,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK: 5 usuarios existen'
        ELSE '✗ ERROR: Solo ' || COUNT(*) || '/5 usuarios existen'
    END as diagnostico_resultado
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test';

-- Query 4: Estado actual de asignaciones de rutas
SELECT
    'Q4: Asignaciones de Rutas Actuales' as diagnostico,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) = 0 THEN '✗ CONFIRMADO: 0 asignaciones (problema a diagnosticar)'
        ELSE '⚠ Algunas asignaciones existen (' || COUNT(*) || ')'
    END as diagnostico_resultado
FROM learning_path_assignments lpa
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test';

-- Query 5: ¿Existe el usuario admin para assigned_by?
SELECT
    'Q5: Usuario Admin Disponible' as diagnostico,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) > 0 THEN '✓ OK: Admin existe'
        ELSE '✗ ERROR: No hay admin para assigned_by'
    END as diagnostico_resultado
FROM profiles
WHERE email = 'admin@fne-lms.test'
UNION ALL
SELECT
    'Q5b: Cualquier Admin' as diagnostico,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) > 0 THEN '✓ OK: ' || COUNT(*) || ' admin(s) disponibles'
        ELSE '✗ ERROR: No hay admins en el sistema'
    END as diagnostico_resultado
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role_type = 'admin' AND ur.is_active = true;

-- Query 6: ¿Hay restricciones en learning_path_assignments?
SELECT
    'Q6: Restricciones en Tabla' as diagnostico,
    constraint_name as nombre_restriccion,
    constraint_type as tipo
FROM information_schema.table_constraints
WHERE table_name = 'learning_path_assignments'
  AND table_schema = 'public';

-- Query 7: SIMULACIÓN - ¿Qué pasaría si intentamos asignar ahora?
-- Esta query NO inserta, solo verifica si PODRÍAMOS insertar
DO $$
DECLARE
    v_admin_id UUID;
    v_user_ids UUID[];
    v_path_ids UUID[];
    v_total_users INT;
    v_total_paths INT;
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

    -- Obtener usuarios
    SELECT ARRAY_AGG(id ORDER BY email) INTO v_user_ids
    FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test';

    -- Obtener rutas
    SELECT ARRAY_AGG(id ORDER BY created_at DESC) INTO v_path_ids
    FROM learning_paths
    WHERE is_active = true
    LIMIT 5;

    v_total_users := COALESCE(ARRAY_LENGTH(v_user_ids, 1), 0);
    v_total_paths := COALESCE(ARRAY_LENGTH(v_path_ids, 1), 0);

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Q7: SIMULACIÓN DE ASIGNACIÓN';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Admin ID encontrado: %', COALESCE(v_admin_id::TEXT, 'NULL ✗');
    RAISE NOTICE 'Total usuarios docente: %', v_total_users;
    RAISE NOTICE 'Total rutas disponibles: %', v_total_paths;
    RAISE NOTICE '';
    
    IF v_admin_id IS NULL THEN
        RAISE NOTICE '✗ PROBLEMA: No se encontró admin para assigned_by';
    END IF;

    IF v_total_users = 0 THEN
        RAISE NOTICE '✗ PROBLEMA: No hay usuarios docente de prueba';
    ELSIF v_total_users < 5 THEN
        RAISE NOTICE '⚠ ADVERTENCIA: Solo % usuarios de prueba (esperados: 5)', v_total_users;
    ELSE
        RAISE NOTICE '✓ OK: 5 usuarios docente encontrados';
    END IF;

    IF v_total_paths = 0 THEN
        RAISE NOTICE '✗ PROBLEMA CRÍTICO: No hay rutas de aprendizaje disponibles';
        RAISE NOTICE '   → Esta es probablemente la CAUSA RAÍZ del problema';
        RAISE NOTICE '   → El script tiene validación que RETORNA sin asignar si no hay rutas';
    ELSIF v_total_paths < 3 THEN
        RAISE NOTICE '⚠ ADVERTENCIA: Solo % rutas disponibles (recomendado: >= 3)', v_total_paths;
    ELSE
        RAISE NOTICE '✓ OK: % rutas disponibles', v_total_paths;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    IF v_admin_id IS NOT NULL AND v_total_users >= 5 AND v_total_paths >= 3 THEN
        RAISE NOTICE '✓ CONCLUSIÓN: Datos suficientes. Se puede ejecutar Sección 3';
    ELSE
        RAISE NOTICE '✗ CONCLUSIÓN: Datos insuficientes. Revisar problemas arriba';
    END IF;
    RAISE NOTICE '========================================';
END $$;

-- Query 8: Resumen ejecutivo
SELECT
    'RESUMEN DIAGNÓSTICO' as titulo,
    (SELECT COUNT(*) FROM learning_paths WHERE is_active = true) as rutas_disponibles,
    (SELECT COUNT(*) FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test') as usuarios_prueba,
    (SELECT COUNT(*) FROM learning_path_assignments lpa 
     JOIN profiles p ON p.id = lpa.user_id 
     WHERE p.email LIKE 'docente.test%@fne-lms.test') as asignaciones_actuales,
    CASE
        WHEN (SELECT COUNT(*) FROM learning_paths WHERE is_active = true) = 0 THEN 
            '✗ CAUSA RAÍZ: No hay rutas de aprendizaje en el sistema'
        WHEN (SELECT COUNT(*) FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test') < 5 THEN
            '✗ PROBLEMA: Faltan usuarios de prueba'
        ELSE
            '✓ Datos disponibles - investigar por qué no se ejecutó Sección 3'
    END as conclusion;
