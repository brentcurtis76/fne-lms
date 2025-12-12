-- ============================================
-- SCRIPT: Verificación Completa del Setup de Usuarios Docente
-- Proyecto: FNE LMS - Testing Manual Rol Docente
-- Propósito: Validar que todo el setup está correcto antes de testing manual
-- Fecha: 2025-01-19
-- Versión: 1.0.0
-- ============================================

-- PREREQUISITOS:
-- 1. Haber ejecutado 00-pre-check-existing-data.sql exitosamente
-- 2. Haber ejecutado 01-create-docente-test-users.sql exitosamente
-- 3. Haber ejecutado 02-assign-courses-to-docentes.sql exitosamente

-- INSTRUCCIONES DE USO:
-- Este script SOLO lee/verifica datos, NO modifica nada
-- Ejecutar todas las secciones en orden en Supabase SQL Editor
-- Revisar cada resultado y confirmar que todo muestra "✓ OK"
-- Si algo muestra "✗ ERROR" o "⚠ ADVERTENCIA", corregir antes de testing manual

-- ============================================
-- SECCIÓN 0: RESUMEN EJECUTIVO
-- ============================================

-- Query 0.1: Resumen general del setup
-- Propósito: Vista rápida del estado de todos los componentes
SELECT
    '=== RESUMEN GENERAL DEL SETUP ===' as seccion,
    NULL as detalle,
    NULL as estado;

SELECT
    'Usuarios Docente Creados' as componente,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END as estado,
    'Esperado: 5 usuarios' as nota
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Roles Docente Asignados',
    COUNT(*),
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END,
    'Esperado: 5 roles activos'
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
  AND ur.role_type = 'docente'
  AND ur.is_active = true

UNION ALL

SELECT
    'Cursos Asignados (Assignments)',
    COUNT(*),
    CASE
        WHEN COUNT(*) BETWEEN 12 AND 15 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END,
    'Esperado: 12-15 asignaciones'
FROM course_assignments ca
JOIN profiles p ON p.id = ca.teacher_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Cursos Inscritos (Enrollments)',
    COUNT(*),
    CASE
        WHEN COUNT(*) BETWEEN 12 AND 15 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END,
    'Esperado: 12-15 inscripciones'
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Rutas de Aprendizaje Asignadas',
    COUNT(*),
    CASE
        WHEN COUNT(*) BETWEEN 6 AND 8 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END,
    'Esperado: 6-8 asignaciones'
FROM learning_path_assignments lpa
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Usuarios con Comunidad',
    COUNT(*),
    CASE
        WHEN COUNT(*) = 3 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END,
    'Esperado: 3 usuarios (Users 1,2,3)'
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'
  AND community_id IS NOT NULL

UNION ALL

SELECT
    'Usuarios con Generación',
    COUNT(*),
    CASE
        WHEN COUNT(*) = 3 THEN '✓ OK'
        WHEN COUNT(*) > 0 THEN '⚠ ADVERTENCIA'
        ELSE '✗ ERROR'
    END,
    'Esperado: 3 usuarios (Users 1,2,4)'
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'
  AND generation_id IS NOT NULL;


-- ============================================
-- SECCIÓN 1: VERIFICACIÓN DE PERFILES
-- ============================================

-- Query 1.1: Verificar datos personales completos
-- Propósito: Asegurar que todos los perfiles tienen datos básicos
SELECT
    '=== VERIFICACIÓN DE PERFILES ===' as seccion,
    NULL as email,
    NULL as campo,
    NULL as valor,
    NULL as estado;

SELECT
    'Datos Personales' as seccion,
    p.email,
    'Nombre Completo' as campo,
    p.name as valor,
    CASE
        WHEN p.name IS NOT NULL AND p.name <> '' THEN '✓ OK'
        ELSE '✗ ERROR: Falta nombre'
    END as estado
FROM profiles p
WHERE p.email LIKE 'docente.test%@fne-lms.test'

ORDER BY email, campo;


-- Query 1.2: Verificar configuración organizacional
-- Propósito: Confirmar que cada usuario tiene la configuración correcta
SELECT
    p.email,
    p.name as full_name,
    s.name as escuela,
    g.name as generacion,
    gc.name as comunidad,
    CASE
        WHEN p.email = 'docente.test1@fne-lms.test' THEN
            CASE
                WHEN p.generation_id IS NOT NULL AND p.community_id IS NOT NULL THEN '✓ OK: Con Gen + Con Com'
                ELSE '✗ ERROR: Debe tener Gen + Com'
            END
        WHEN p.email = 'docente.test2@fne-lms.test' THEN
            CASE
                WHEN p.generation_id IS NOT NULL AND p.community_id IS NOT NULL THEN '✓ OK: Con Gen + Con Com'
                ELSE '✗ ERROR: Debe tener Gen + Com'
            END
        WHEN p.email = 'docente.test3@fne-lms.test' THEN
            CASE
                WHEN p.generation_id IS NULL AND p.community_id IS NOT NULL THEN '✓ OK: Sin Gen + Con Com'
                ELSE '✗ ERROR: Debe tener Com sin Gen'
            END
        WHEN p.email = 'docente.test4@fne-lms.test' THEN
            CASE
                WHEN p.generation_id IS NOT NULL AND p.community_id IS NULL THEN '✓ OK: Con Gen + Sin Com'
                ELSE '✗ ERROR: Debe tener Gen sin Com'
            END
        WHEN p.email = 'docente.test5@fne-lms.test' THEN
            CASE
                WHEN p.generation_id IS NULL AND p.community_id IS NULL THEN '✓ OK: Sin Gen + Sin Com'
                ELSE '✗ ERROR: No debe tener Gen ni Com'
            END
        ELSE '⚠ ADVERTENCIA: Usuario inesperado'
    END as validacion_escenario
FROM profiles p
LEFT JOIN schools s ON s.id = p.school_id
LEFT JOIN generations g ON g.id = p.generation_id
LEFT JOIN growth_communities gc ON gc.id = p.community_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;


-- Query 1.3: Detectar perfiles incompletos
-- Propósito: Identificar usuarios con datos faltantes críticos
SELECT
    p.email,
    CASE WHEN p.school_id IS NULL THEN '✗ Falta school_id' ELSE '✓ OK' END as school_check,
    CASE WHEN p.name IS NULL OR p.name = '' THEN '✗ Falta nombre' ELSE '✓ OK' END as name_check,
    CASE
        WHEN p.email IN ('docente.test1@fne-lms.test', 'docente.test2@fne-lms.test', 'docente.test4@fne-lms.test')
             AND p.generation_id IS NULL
        THEN '✗ Falta generation_id (requerido para este usuario)'
        ELSE '✓ OK'
    END as generation_check,
    CASE
        WHEN p.email IN ('docente.test1@fne-lms.test', 'docente.test2@fne-lms.test', 'docente.test3@fne-lms.test')
             AND p.community_id IS NULL
        THEN '✗ Falta community_id (requerido para este usuario)'
        ELSE '✓ OK'
    END as community_check
FROM profiles p
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;


-- ============================================
-- SECCIÓN 2: VERIFICACIÓN DE ROLES
-- ============================================

-- Query 2.1: Verificar roles docente activos
-- Propósito: Confirmar que todos tienen el rol 'docente' activo
SELECT
    '=== VERIFICACIÓN DE ROLES ===' as seccion,
    NULL as email,
    NULL as rol,
    NULL as estado_rol,
    NULL as validacion;

SELECT
    'Roles Activos' as seccion,
    p.email,
    ur.role_type as rol,
    ur.is_active as estado_rol,
    CASE
        WHEN ur.role_type = 'docente' AND ur.is_active = true THEN '✓ OK'
        WHEN ur.role_type = 'docente' AND ur.is_active = false THEN '✗ ERROR: Rol inactivo'
        WHEN ur.role_type IS NULL THEN '✗ ERROR: Sin rol docente'
        ELSE '⚠ ADVERTENCIA: Rol incorrecto'
    END as validacion
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role_type = 'docente'
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;


-- Query 2.2: Verificar coherencia de roles con perfiles
-- Propósito: Asegurar que school_id, generation_id, community_id coinciden
SELECT
    p.email,
    'School ID' as campo,
    CASE
        WHEN p.school_id = ur.school_id THEN '✓ OK: Coincide'
        WHEN p.school_id IS NOT NULL AND ur.school_id IS NULL THEN '✗ ERROR: Falta en user_roles'
        WHEN p.school_id IS NULL AND ur.school_id IS NOT NULL THEN '✗ ERROR: Falta en profile'
        WHEN p.school_id <> ur.school_id THEN '✗ ERROR: No coincide'
        ELSE '⚠ Ambos NULL'
    END as validacion
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role_type = 'docente'
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    p.email,
    'Generation ID',
    CASE
        WHEN p.generation_id = ur.generation_id THEN '✓ OK: Coincide'
        WHEN p.generation_id IS NOT NULL AND ur.generation_id IS NULL THEN '✗ ERROR: Falta en user_roles'
        WHEN p.generation_id IS NULL AND ur.generation_id IS NOT NULL THEN '✗ ERROR: Falta en profile'
        WHEN p.generation_id <> ur.generation_id THEN '✗ ERROR: No coincide'
        ELSE '✓ OK: Ambos NULL (esperado para usuarios 3,5)'
    END
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role_type = 'docente'
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    p.email,
    'Community ID',
    CASE
        WHEN p.community_id = ur.community_id THEN '✓ OK: Coincide'
        WHEN p.community_id IS NOT NULL AND ur.community_id IS NULL THEN '✗ ERROR: Falta en user_roles'
        WHEN p.community_id IS NULL AND ur.community_id IS NOT NULL THEN '✗ ERROR: Falta en profile'
        WHEN p.community_id <> ur.community_id THEN '✗ ERROR: No coincide'
        ELSE '✓ OK: Ambos NULL (esperado para usuarios 4,5)'
    END
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role_type = 'docente'
WHERE p.email LIKE 'docente.test%@fne-lms.test'

ORDER BY email, campo;


-- Query 2.3: Detectar roles duplicados o conflictivos
-- Propósito: Identificar si hay múltiples roles docente para el mismo usuario
SELECT
    p.email,
    COUNT(*) as total_roles_docente,
    CASE
        WHEN COUNT(*) = 1 THEN '✓ OK: Un solo rol docente'
        WHEN COUNT(*) > 1 THEN '✗ ERROR: Múltiples roles docente'
        ELSE '✗ ERROR: Sin rol docente'
    END as validacion
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role_type = 'docente'
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email
ORDER BY p.email;


-- ============================================
-- SECCIÓN 3: VERIFICACIÓN DE CURSOS
-- ============================================

-- Query 3.1: Verificar asignaciones de cursos por usuario
-- Propósito: Confirmar que cada usuario tiene 2-3 cursos asignados
SELECT
    '=== VERIFICACIÓN DE CURSOS ===' as seccion,
    NULL as email,
    NULL as total_cursos,
    NULL as validacion;

SELECT
    'Asignaciones por Usuario' as seccion,
    p.email,
    COUNT(DISTINCT ca.course_id) as total_cursos,
    CASE
        WHEN COUNT(DISTINCT ca.course_id) BETWEEN 2 AND 3 THEN '✓ OK'
        WHEN COUNT(DISTINCT ca.course_id) > 3 THEN '⚠ ADVERTENCIA: Más de 3 cursos'
        WHEN COUNT(DISTINCT ca.course_id) = 1 THEN '⚠ ADVERTENCIA: Solo 1 curso'
        ELSE '✗ ERROR: Sin cursos asignados'
    END as validacion
FROM profiles p
LEFT JOIN course_assignments ca ON ca.teacher_id = p.id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email
ORDER BY p.email;


-- Query 3.2: Verificar sincronización assignments ↔ enrollments
-- Propósito: Detectar mismatches entre asignaciones e inscripciones
SELECT
    p.email,
    COUNT(DISTINCT ca.course_id) as cursos_asignados,
    COUNT(DISTINCT ce.course_id) as cursos_inscritos,
    CASE
        WHEN COUNT(DISTINCT ca.course_id) = COUNT(DISTINCT ce.course_id) THEN '✓ OK: Sincronizados'
        WHEN COUNT(DISTINCT ca.course_id) > COUNT(DISTINCT ce.course_id) THEN '✗ ERROR: Faltan enrollments'
        WHEN COUNT(DISTINCT ca.course_id) < COUNT(DISTINCT ce.course_id) THEN '✗ ERROR: Enrollments extra'
        ELSE '⚠ Sin datos'
    END as validacion
FROM profiles p
LEFT JOIN course_assignments ca ON ca.teacher_id = p.id
LEFT JOIN course_enrollments ce ON ce.user_id = p.id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email
ORDER BY p.email;


-- Query 3.3: Detectar cursos sin enrollment correspondiente
-- Propósito: Identificar asignaciones huérfanas
SELECT
    p.email,
    c.title as curso_asignado,
    CASE
        WHEN ce.id IS NOT NULL THEN '✓ OK: Tiene enrollment'
        ELSE '✗ ERROR: Falta enrollment'
    END as validacion
FROM profiles p
JOIN course_assignments ca ON ca.teacher_id = p.id
JOIN courses c ON c.id = ca.course_id
LEFT JOIN course_enrollments ce ON ce.user_id = p.id AND ce.course_id = ca.course_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email, c.title;


-- Query 3.4: Verificar cursos compartidos (overlap)
-- Propósito: Confirmar que hay overlap estratégico entre usuarios
SELECT
    c.title as curso,
    COUNT(DISTINCT ca.teacher_id) as usuarios_asignados,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails,
    CASE
        WHEN COUNT(DISTINCT ca.teacher_id) >= 2 THEN '✓ OK: Curso compartido'
        ELSE '⚠ INFO: Curso no compartido'
    END as nota
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
JOIN profiles p ON p.id = ca.teacher_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY c.id, c.title
ORDER BY usuarios_asignados DESC, c.title;


-- ============================================
-- SECCIÓN 4: VERIFICACIÓN DE RUTAS DE APRENDIZAJE
-- ============================================

-- Query 4.1: Verificar asignaciones de rutas por usuario
-- Propósito: Confirmar que cada usuario tiene 1-2 rutas
SELECT
    '=== VERIFICACIÓN DE RUTAS DE APRENDIZAJE ===' as seccion,
    NULL as email,
    NULL as total_rutas,
    NULL as validacion;

SELECT
    'Rutas por Usuario' as seccion,
    p.email,
    COUNT(DISTINCT lpa.path_id) as total_rutas,
    CASE
        WHEN COUNT(DISTINCT lpa.path_id) BETWEEN 1 AND 2 THEN '✓ OK'
        WHEN COUNT(DISTINCT lpa.path_id) > 2 THEN '⚠ ADVERTENCIA: Más de 2 rutas'
        ELSE '✗ ERROR: Sin rutas asignadas'
    END as validacion
FROM profiles p
LEFT JOIN learning_path_assignments lpa ON lpa.user_id = p.id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email
ORDER BY p.email;


-- Query 4.2: Verificar rutas compartidas (overlap)
-- Propósito: Confirmar estrategia de overlap en rutas
SELECT
    lp.name as ruta,
    COUNT(DISTINCT lpa.user_id) as usuarios_asignados,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails,
    CASE
        WHEN COUNT(DISTINCT lpa.user_id) >= 2 THEN '✓ OK: Ruta compartida'
        ELSE '⚠ INFO: Ruta individual'
    END as nota
FROM learning_path_assignments lpa
JOIN learning_paths lp ON lp.id = lpa.path_id
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY lp.id, lp.name
ORDER BY usuarios_asignados DESC, lp.name;


-- Query 4.3: Verificar contenido de rutas asignadas
-- Propósito: Confirmar que las rutas tienen cursos asociados
SELECT
    p.email,
    lp.name as ruta,
    COUNT(DISTINCT lpc.course_id) as total_cursos_en_ruta,
    CASE
        WHEN COUNT(DISTINCT lpc.course_id) > 0 THEN '✓ OK: Ruta con cursos'
        ELSE '✗ ERROR: Ruta vacía'
    END as validacion
FROM profiles p
JOIN learning_path_assignments lpa ON lpa.user_id = p.id
JOIN learning_paths lp ON lp.id = lpa.path_id
LEFT JOIN learning_path_courses lpc ON lpc.learning_path_id = lp.id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email, lp.id, lp.name
ORDER BY p.email, lp.name;


-- ============================================
-- SECCIÓN 5: VERIFICACIÓN DE TAREAS GRUPALES
-- ============================================

-- Query 5.1: Verificar tareas grupales visibles para usuarios con comunidad
-- Propósito: Confirmar que usuarios en comunidades ven tareas grupales
SELECT
    '=== VERIFICACIÓN DE TAREAS GRUPALES ===' as seccion,
    NULL as email,
    NULL as comunidad,
    NULL as total_tareas,
    NULL as validacion;

SELECT
    'Tareas Visibles' as seccion,
    p.email,
    gc.name as comunidad,
    COUNT(DISTINCT b.id) as total_tareas,
    CASE
        WHEN p.community_id IS NOT NULL AND COUNT(DISTINCT b.id) > 0 THEN '✓ OK: Ve tareas grupales'
        WHEN p.community_id IS NOT NULL AND COUNT(DISTINCT b.id) = 0 THEN '⚠ ADVERTENCIA: En comunidad pero sin tareas'
        WHEN p.community_id IS NULL THEN '✓ OK: Sin comunidad (no aplica)'
        ELSE '⚠ INFO'
    END as validacion
FROM profiles p
LEFT JOIN growth_communities gc ON gc.id = p.community_id
LEFT JOIN course_enrollments ce ON ce.user_id = p.id
LEFT JOIN courses c ON c.id = ce.course_id
LEFT JOIN lessons l ON (l.course_id = c.id OR l.module_id IN (
    SELECT id FROM modules WHERE course_id = c.id
))
LEFT JOIN blocks b ON b.lesson_id = l.id
    AND b.type IN ('group-assignment', 'group_assignment')
    AND b.is_visible = true
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email, gc.name, p.community_id
ORDER BY p.email;


-- Query 5.2: Verificar acceso a tareas según configuración
-- Propósito: Confirmar que solo usuarios en comunidades ven tareas
SELECT
    p.email,
    CASE
        WHEN p.community_id IS NOT NULL THEN 'Con Comunidad'
        ELSE 'Sin Comunidad'
    END as tipo_usuario,
    COUNT(DISTINCT b.id) as tareas_visibles,
    CASE
        WHEN p.community_id IS NOT NULL AND COUNT(DISTINCT b.id) > 0
        THEN '✓ OK: Usuario en comunidad ve tareas'
        WHEN p.community_id IS NULL AND COUNT(DISTINCT b.id) = 0
        THEN '✓ OK: Usuario sin comunidad no tiene tareas (esperado)'
        WHEN p.community_id IS NULL AND COUNT(DISTINCT b.id) > 0
        THEN '⚠ ADVERTENCIA: Usuario sin comunidad ve tareas (inesperado)'
        WHEN p.community_id IS NOT NULL AND COUNT(DISTINCT b.id) = 0
        THEN '⚠ ADVERTENCIA: Usuario en comunidad sin tareas'
        ELSE '⚠ INFO'
    END as validacion
FROM profiles p
LEFT JOIN course_enrollments ce ON ce.user_id = p.id
LEFT JOIN courses c ON c.id = ce.course_id
LEFT JOIN lessons l ON (l.course_id = c.id OR l.module_id IN (
    SELECT id FROM modules WHERE course_id = c.id
))
LEFT JOIN blocks b ON b.lesson_id = l.id
    AND b.type IN ('group-assignment', 'group_assignment')
    AND b.is_visible = true
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email, p.community_id
ORDER BY p.email;


-- ============================================
-- SECCIÓN 6: CHECKLIST FINAL
-- ============================================

-- Query 6.1: Checklist completo de validación
-- Propósito: Vista consolidada de todos los checks
SELECT
    '=== CHECKLIST FINAL DE VALIDACIÓN ===' as categoria,
    NULL as item,
    NULL as resultado,
    NULL as nota;

-- Check 1: Usuarios creados
SELECT
    'A. USUARIOS' as categoria,
    'Total de usuarios docente',
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK (5/5)'
        ELSE '✗ ERROR (' || COUNT(*) || '/5)'
    END,
    'Deben existir exactamente 5 usuarios'
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'

UNION ALL

-- Check 2: Perfiles completos
SELECT
    'A. USUARIOS',
    'Perfiles con datos completos',
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK (5/5)'
        ELSE '✗ ERROR (' || COUNT(*) || '/5)'
    END,
    'Todos deben tener nombre y escuela'
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'
  AND name IS NOT NULL
  AND name <> ''
  AND school_id IS NOT NULL

UNION ALL

-- Check 3: Configuración organizacional correcta
SELECT
    'A. USUARIOS',
    'Configuración organizacional',
    CASE
        WHEN (
            SELECT COUNT(*) FROM profiles
            WHERE email = 'docente.test1@fne-lms.test'
              AND generation_id IS NOT NULL
              AND community_id IS NOT NULL
        ) = 1
        AND (
            SELECT COUNT(*) FROM profiles
            WHERE email = 'docente.test2@fne-lms.test'
              AND generation_id IS NOT NULL
              AND community_id IS NOT NULL
        ) = 1
        AND (
            SELECT COUNT(*) FROM profiles
            WHERE email = 'docente.test3@fne-lms.test'
              AND generation_id IS NULL
              AND community_id IS NOT NULL
        ) = 1
        AND (
            SELECT COUNT(*) FROM profiles
            WHERE email = 'docente.test4@fne-lms.test'
              AND generation_id IS NOT NULL
              AND community_id IS NULL
        ) = 1
        AND (
            SELECT COUNT(*) FROM profiles
            WHERE email = 'docente.test5@fne-lms.test'
              AND generation_id IS NULL
              AND community_id IS NULL
        ) = 1
        THEN '✓ OK'
        ELSE '✗ ERROR'
    END,
    '5 escenarios diferentes deben estar correctos'

UNION ALL

-- Check 4: Roles activos
SELECT
    'B. ROLES',
    'Roles docente activos',
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK (5/5)'
        ELSE '✗ ERROR (' || COUNT(*) || '/5)'
    END,
    'Todos deben tener rol docente activo'
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
  AND ur.role_type = 'docente'
  AND ur.is_active = true

UNION ALL

-- Check 5: Coherencia profile ↔ user_roles
SELECT
    'B. ROLES',
    'Coherencia profile ↔ roles',
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK (0 discrepancias)'
        ELSE '✗ ERROR (' || COUNT(*) || ' discrepancias)'
    END,
    'school_id, generation_id, community_id deben coincidir'
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id AND ur.role_type = 'docente'
WHERE p.email LIKE 'docente.test%@fne-lms.test'
  AND (
      p.school_id <> ur.school_id
      OR (p.school_id IS NULL AND ur.school_id IS NOT NULL)
      OR (p.school_id IS NOT NULL AND ur.school_id IS NULL)
      OR (p.generation_id IS NOT NULL AND p.generation_id <> ur.generation_id)
      OR (p.community_id IS NOT NULL AND p.community_id <> ur.community_id)
  )

UNION ALL

-- Check 6: Cursos asignados
SELECT
    'C. CURSOS',
    'Asignaciones de cursos',
    CASE
        WHEN COUNT(*) BETWEEN 12 AND 15 THEN '✓ OK (' || COUNT(*) || ' asignaciones)'
        ELSE '⚠ ADVERTENCIA (' || COUNT(*) || ' asignaciones)'
    END,
    'Esperado: 12-15 asignaciones totales'
FROM course_assignments ca
JOIN profiles p ON p.id = ca.teacher_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

-- Check 7: Enrollments sincronizados
SELECT
    'C. CURSOS',
    'Sincronización assignments ↔ enrollments',
    CASE
        WHEN (
            SELECT COUNT(*) FROM course_assignments ca
            JOIN profiles p ON p.id = ca.teacher_id
            WHERE p.email LIKE 'docente.test%@fne-lms.test'
        ) = (
            SELECT COUNT(*) FROM course_enrollments ce
            JOIN profiles p ON p.id = ce.user_id
            WHERE p.email LIKE 'docente.test%@fne-lms.test'
        )
        THEN '✓ OK (sincronizados)'
        ELSE '✗ ERROR (no coinciden)'
    END,
    'Cada assignment debe tener enrollment'

UNION ALL

-- Check 8: Overlap de cursos
SELECT
    'C. CURSOS',
    'Cursos compartidos (overlap)',
    CASE
        WHEN COUNT(*) >= 2 THEN '✓ OK (' || COUNT(*) || ' cursos compartidos)'
        ELSE '⚠ ADVERTENCIA (solo ' || COUNT(*) || ' compartido(s))'
    END,
    'Al menos 2-3 cursos deben estar compartidos'
FROM (
    SELECT ca.course_id
    FROM course_assignments ca
    JOIN profiles p ON p.id = ca.teacher_id
    WHERE p.email LIKE 'docente.test%@fne-lms.test'
    GROUP BY ca.course_id
    HAVING COUNT(DISTINCT ca.teacher_id) >= 2
) shared_courses

UNION ALL

-- Check 9: Rutas asignadas
SELECT
    'D. RUTAS',
    'Asignaciones de rutas',
    CASE
        WHEN COUNT(*) BETWEEN 6 AND 8 THEN '✓ OK (' || COUNT(*) || ' asignaciones)'
        ELSE '⚠ ADVERTENCIA (' || COUNT(*) || ' asignaciones)'
    END,
    'Esperado: 6-8 asignaciones totales'
FROM learning_path_assignments lpa
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

-- Check 10: Rutas con contenido
SELECT
    'D. RUTAS',
    'Rutas con cursos asociados',
    CASE
        WHEN COUNT(*) = (
            SELECT COUNT(DISTINCT lpa.path_id)
            FROM learning_path_assignments lpa
            JOIN profiles p ON p.id = lpa.user_id
            WHERE p.email LIKE 'docente.test%@fne-lms.test'
        )
        THEN '✓ OK (todas tienen cursos)'
        ELSE '✗ ERROR (algunas vacías)'
    END,
    'Todas las rutas deben tener cursos'
FROM (
    SELECT DISTINCT lpa.path_id
    FROM learning_path_assignments lpa
    JOIN profiles p ON p.id = lpa.user_id
    JOIN learning_path_courses lpc ON lpc.learning_path_id = lpa.path_id
    WHERE p.email LIKE 'docente.test%@fne-lms.test'
) paths_with_courses

UNION ALL

-- Check 11: Usuarios con comunidad
SELECT
    'E. TAREAS GRUPALES',
    'Usuarios en comunidades',
    CASE
        WHEN COUNT(*) = 3 THEN '✓ OK (3 usuarios)'
        ELSE '⚠ ADVERTENCIA (' || COUNT(*) || ' usuarios)'
    END,
    'Usuarios 1,2,3 deben tener comunidad'
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'
  AND community_id IS NOT NULL

UNION ALL

-- Check 12: Tareas grupales visibles
SELECT
    'E. TAREAS GRUPALES',
    'Acceso a tareas grupales',
    CASE
        WHEN COUNT(*) >= 3 THEN '✓ OK (' || COUNT(*) || ' usuarios ven tareas)'
        ELSE '⚠ ADVERTENCIA (solo ' || COUNT(*) || ' ve(n) tareas)'
    END,
    'Usuarios con comunidad deben ver tareas'
FROM (
    SELECT DISTINCT p.id
    FROM profiles p
    JOIN course_enrollments ce ON ce.user_id = p.id
    JOIN courses c ON c.id = ce.course_id
    JOIN lessons l ON (l.course_id = c.id OR l.module_id IN (
        SELECT id FROM modules WHERE course_id = c.id
    ))
    JOIN blocks b ON b.lesson_id = l.id
    WHERE p.email LIKE 'docente.test%@fne-lms.test'
      AND p.community_id IS NOT NULL
      AND b.type IN ('group-assignment', 'group_assignment')
      AND b.is_visible = true
) users_with_tasks;


-- Query 6.2: Resumen final del estado
-- Propósito: Mensaje final sobre si el setup está listo
SELECT
    '=== CONCLUSIÓN ===' as titulo,
    CASE
        WHEN (
            -- Todos los checks críticos pasan
            (SELECT COUNT(*) FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test') = 5
            AND (SELECT COUNT(*) FROM user_roles ur JOIN profiles p ON p.id = ur.user_id
                 WHERE p.email LIKE 'docente.test%@fne-lms.test' AND ur.role_type = 'docente' AND ur.is_active = true) = 5
            AND (SELECT COUNT(*) FROM course_assignments ca JOIN profiles p ON p.id = ca.teacher_id
                 WHERE p.email LIKE 'docente.test%@fne-lms.test') BETWEEN 12 AND 15
            AND (SELECT COUNT(*) FROM learning_path_assignments lpa JOIN profiles p ON p.id = lpa.user_id
                 WHERE p.email LIKE 'docente.test%@fne-lms.test') BETWEEN 6 AND 8
        )
        THEN '✓✓✓ SETUP COMPLETO Y LISTO PARA TESTING MANUAL ✓✓✓'
        ELSE '✗✗✗ SETUP INCOMPLETO - REVISAR ERRORES ARRIBA ✗✗✗'
    END as estado,
    CASE
        WHEN (
            (SELECT COUNT(*) FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test') = 5
            AND (SELECT COUNT(*) FROM user_roles ur JOIN profiles p ON p.id = ur.user_id
                 WHERE p.email LIKE 'docente.test%@fne-lms.test' AND ur.role_type = 'docente' AND ur.is_active = true) = 5
            AND (SELECT COUNT(*) FROM course_assignments ca JOIN profiles p ON p.id = ca.teacher_id
                 WHERE p.email LIKE 'docente.test%@fne-lms.test') BETWEEN 12 AND 15
            AND (SELECT COUNT(*) FROM learning_path_assignments lpa JOIN profiles p ON p.id = lpa.user_id
                 WHERE p.email LIKE 'docente.test%@fne-lms.test') BETWEEN 6 AND 8
        )
        THEN 'Puede proceder a ejecutar el testing manual con los 5 usuarios docente de prueba.'
        ELSE 'Corregir los errores identificados en las secciones anteriores antes de continuar.'
    END as siguiente_paso;


-- ============================================
-- FIN DEL SCRIPT DE VERIFICACIÓN
-- ============================================

-- Si todo muestra "✓ OK", el setup está listo.
-- SIGUIENTE PASO: Comenzar testing manual siguiendo MANUAL_PRUEBAS_DOCENTE.txt
