-- ============================================================================
-- FASE 5: LIMPIEZA DE DATOS DE PRUEBA - USUARIOS DOCENTES
-- ============================================================================
-- Archivo: 04-cleanup-docente-tests.sql
-- Propósito: Eliminar todos los datos de prueba creados para testing del rol Docente
-- Versión: 1.0.0
-- Fecha: 2025-01-19
-- Autor: Claude Code
--
-- IMPORTANTE:
-- - Este script ELIMINA datos de forma PERMANENTE
-- - Ejecutar SOLO después de completar todas las pruebas manuales
-- - Ejecutar SOLO en el ambiente donde se crearon los usuarios de prueba
-- - NO ejecutar en producción a menos que los datos de prueba estén ahí
-- - Las eliminaciones siguen el orden inverso de dependencias (más recientes primero)
--
-- PREREQUISITOS:
-- - Haber ejecutado Fases 1-4 exitosamente
-- - Haber completado todas las pruebas manuales del rol Docente
-- - Tener backup de la base de datos (por precaución)
--
-- ORDEN DE EJECUCIÓN:
-- 1. Ejecutar Sección 0 para verificar qué se va a eliminar (PRE-VALIDACIÓN)
-- 2. Revisar los conteos y confirmar que son los esperados
-- 3. Ejecutar Sección 1 para eliminar asignaciones y enrollments
-- 4. Ejecutar Sección 2 para eliminar roles y perfiles
-- 5. Ejecutar Sección 3 para eliminar usuarios de Auth (MANUAL en Auth Dashboard)
-- 6. Ejecutar Sección 4 para verificar limpieza completa (POST-VALIDACIÓN)
--
-- NOTA SOBRE USUARIOS AUTH:
-- Los usuarios en auth.users NO se pueden eliminar directamente desde SQL
-- debido a las políticas de seguridad de Supabase. Se deben eliminar
-- manualmente desde el Auth Dashboard o usando la API de administración.
-- ============================================================================

-- ============================================================================
-- SECCIÓN 0: PRE-VALIDACIÓN - VERIFICAR QUÉ SE VA A ELIMINAR
-- ============================================================================
-- Esta sección muestra exactamente qué datos serán eliminados.
-- REVISAR estos resultados antes de proceder con la limpieza.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query 0.1: RESUMEN EJECUTIVO DE DATOS A ELIMINAR
-- ----------------------------------------------------------------------------
-- Muestra el conteo total de registros que serán eliminados por tabla
-- Nota: Esto es un resumen, las queries siguientes muestran el detalle
-- ----------------------------------------------------------------------------

SELECT 'DATOS A ELIMINAR - RESUMEN EJECUTIVO' as seccion;

SELECT
    'Perfiles (profiles)' as tabla,
    COUNT(*) as registros_a_eliminar,
    STRING_AGG(email, ', ' ORDER BY email) as emails
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Roles (user_roles)' as tabla,
    COUNT(*) as registros_a_eliminar,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Asignaciones de Cursos (course_assignments)' as tabla,
    COUNT(*) as registros_a_eliminar,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails
FROM course_assignments ca
JOIN profiles p ON p.id = ca.teacher_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Inscripciones en Cursos (course_enrollments)' as tabla,
    COUNT(*) as registros_a_eliminar,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Asignaciones de Rutas (learning_path_assignments)' as tabla,
    COUNT(*) as registros_a_eliminar,
    STRING_AGG(DISTINCT p.email, ', ' ORDER BY p.email) as emails
FROM learning_path_assignments lpa
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'Usuarios Auth (auth.users)' as tabla,
    COUNT(*) as registros_a_eliminar,
    '⚠ ELIMINAR MANUALMENTE EN AUTH DASHBOARD ⚠' as emails
FROM auth.users
WHERE email LIKE 'docente.test%@fne-lms.test';

-- Anotar aquí los conteos esperados:
-- Perfiles: _____ (esperado: 5)
-- Roles: _____ (esperado: 5)
-- Asignaciones de Cursos: _____ (esperado: 12-15)
-- Inscripciones: _____ (esperado: 12-15)
-- Rutas: _____ (esperado: 6-8)
-- Usuarios Auth: _____ (esperado: 5)

-- ----------------------------------------------------------------------------
-- Query 0.2: DETALLE DE USUARIOS A ELIMINAR
-- ----------------------------------------------------------------------------
-- Muestra información detallada de cada usuario que será eliminado
-- ----------------------------------------------------------------------------

SELECT
    p.id,
    p.email,
    p.full_name,
    s.name as escuela,
    g.name as generacion,
    gc.name as comunidad,
    (SELECT COUNT(*) FROM course_assignments WHERE teacher_id = p.id) as total_cursos_asignados,
    (SELECT COUNT(*) FROM course_enrollments WHERE user_id = p.id) as total_enrollments,
    (SELECT COUNT(*) FROM learning_path_assignments WHERE user_id = p.id) as total_rutas,
    (SELECT COUNT(*) FROM user_roles WHERE user_id = p.id) as total_roles,
    p.created_at
FROM profiles p
LEFT JOIN schools s ON s.id = p.school_id
LEFT JOIN generations g ON g.id = p.generation_id
LEFT JOIN growth_communities gc ON gc.id = p.community_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;

-- Verificar que estos son los 5 usuarios de prueba esperados:
-- docente.test1@fne-lms.test
-- docente.test2@fne-lms.test
-- docente.test3@fne-lms.test
-- docente.test4@fne-lms.test
-- docente.test5@fne-lms.test

-- ----------------------------------------------------------------------------
-- Query 0.3: VERIFICAR IMPACTO EN COMUNIDADES
-- ----------------------------------------------------------------------------
-- Verifica si la eliminación de usuarios afectará el conteo de miembros en comunidades
-- ----------------------------------------------------------------------------

SELECT
    gc.id as community_id,
    gc.name as comunidad,
    gc.max_members as capacidad_maxima,
    (SELECT COUNT(*) FROM user_roles WHERE community_id = gc.id AND is_active = true) as miembros_actuales,
    (SELECT COUNT(*) FROM user_roles ur JOIN profiles p ON p.id = ur.user_id
     WHERE ur.community_id = gc.id AND p.email LIKE 'docente.test%@fne-lms.test' AND ur.is_active = true) as miembros_test_a_eliminar,
    (SELECT COUNT(*) FROM user_roles WHERE community_id = gc.id AND is_active = true) -
    (SELECT COUNT(*) FROM user_roles ur JOIN profiles p ON p.id = ur.user_id
     WHERE ur.community_id = gc.id AND p.email LIKE 'docente.test%@fne-lms.test' AND ur.is_active = true) as miembros_despues_limpieza
FROM growth_communities gc
WHERE gc.id IN (
    SELECT DISTINCT p.community_id
    FROM profiles p
    WHERE p.email LIKE 'docente.test%@fne-lms.test'
    AND p.community_id IS NOT NULL
)
ORDER BY gc.name;

-- Verificar que ninguna comunidad quedará completamente vacía
-- (a menos que sea una comunidad creada solo para testing)

-- ----------------------------------------------------------------------------
-- Query 0.4: ADVERTENCIAS Y VALIDACIONES FINALES
-- ----------------------------------------------------------------------------
-- Verifica condiciones que podrían indicar problemas antes de eliminar
-- ----------------------------------------------------------------------------

SELECT 'VALIDACIONES PRE-ELIMINACIÓN' as seccion;

SELECT
    CASE
        WHEN COUNT(*) = 5 THEN '✓ OK'
        WHEN COUNT(*) = 0 THEN '⚠ ADVERTENCIA: No hay usuarios para eliminar'
        ELSE '⚠ ADVERTENCIA: Número inesperado de usuarios (' || COUNT(*) || ')'
    END as validacion_usuarios,
    COUNT(*) as total_usuarios,
    'Esperado: 5 usuarios' as nota
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    CASE
        WHEN COUNT(*) > 0 THEN '✓ OK: Se eliminarán datos de asignaciones'
        ELSE '⚠ ADVERTENCIA: No hay asignaciones para eliminar'
    END as validacion,
    COUNT(*) as total,
    'Asignaciones de cursos y rutas' as nota
FROM (
    SELECT teacher_id FROM course_assignments ca
    JOIN profiles p ON p.id = ca.teacher_id
    WHERE p.email LIKE 'docente.test%@fne-lms.test'
    UNION
    SELECT user_id FROM learning_path_assignments lpa
    JOIN profiles p ON p.id = lpa.user_id
    WHERE p.email LIKE 'docente.test%@fne-lms.test'
) combined

UNION ALL

SELECT
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: No hay datos de progreso (fresh users)'
        ELSE '⚠ ADVERTENCIA: Usuarios tienen progreso registrado (' || COUNT(*) || ' registros)'
    END as validacion,
    COUNT(*) as total,
    'Verificar si se debe preservar progreso de testing' as nota
FROM lesson_progress lp
JOIN profiles p ON p.id = lp.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test';

-- ⚠ Si hay progreso registrado (lesson_progress), decidir si eliminarlo también
-- ⚠ El script actual NO elimina progreso automáticamente por seguridad

-- ============================================================================
-- SECCIÓN 1: ELIMINAR ASIGNACIONES Y ENROLLMENTS
-- ============================================================================
-- Elimina las relaciones con cursos y rutas de aprendizaje
-- ORDEN: Primero las dependencias más externas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query 1.1: ELIMINAR ASIGNACIONES DE RUTAS DE APRENDIZAJE
-- ----------------------------------------------------------------------------
-- Elimina las asignaciones de learning paths a los usuarios de prueba
-- ----------------------------------------------------------------------------

-- DESCOMENTAR PARA EJECUTAR:
/*
DELETE FROM learning_path_assignments
WHERE user_id IN (
    SELECT id FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test'
);
*/

-- Verificar eliminación:
SELECT
    'learning_path_assignments' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ ELIMINADO'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM learning_path_assignments lpa
WHERE lpa.user_id IN (
    SELECT id FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test'
);

-- ----------------------------------------------------------------------------
-- Query 1.2: ELIMINAR INSCRIPCIONES EN CURSOS (course_enrollments)
-- ----------------------------------------------------------------------------
-- Elimina los enrollments que permiten tracking de progreso
-- ----------------------------------------------------------------------------

-- DESCOMENTAR PARA EJECUTAR:
/*
DELETE FROM course_enrollments
WHERE user_id IN (
    SELECT id FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test'
);
*/

-- Verificar eliminación:
SELECT
    'course_enrollments' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ ELIMINADO'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM course_enrollments ce
WHERE ce.user_id IN (
    SELECT id FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test'
);

-- ----------------------------------------------------------------------------
-- Query 1.3: ELIMINAR ASIGNACIONES DE CURSOS (course_assignments)
-- ----------------------------------------------------------------------------
-- Elimina las asignaciones formales de cursos a los docentes
-- ----------------------------------------------------------------------------

-- DESCOMENTAR PARA EJECUTAR:
/*
DELETE FROM course_assignments
WHERE teacher_id IN (
    SELECT id FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test'
);
*/

-- Verificar eliminación:
SELECT
    'course_assignments' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ ELIMINADO'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM course_assignments ca
WHERE ca.teacher_id IN (
    SELECT id FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test'
);

-- ----------------------------------------------------------------------------
-- Query 1.4: (OPCIONAL) ELIMINAR PROGRESO DE LECCIONES
-- ----------------------------------------------------------------------------
-- SOLO ejecutar si se desea eliminar el progreso de testing
-- Comentado por defecto por seguridad
-- ----------------------------------------------------------------------------

-- DESCOMENTAR SOLO SI SE DESEA ELIMINAR PROGRESO:
/*
DELETE FROM lesson_progress
WHERE user_id IN (
    SELECT id FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test'
);
*/

-- Verificar:
SELECT
    'lesson_progress' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ ELIMINADO (o nunca existió)'
        ELSE '⚠ QUEDAN ' || COUNT(*) || ' registros (eliminar si es necesario)'
    END as estado
FROM lesson_progress lp
WHERE lp.user_id IN (
    SELECT id FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test'
);

-- ============================================================================
-- SECCIÓN 2: ELIMINAR ROLES Y PERFILES
-- ============================================================================
-- Elimina los roles y perfiles de los usuarios de prueba
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query 2.1: ELIMINAR ROLES (user_roles)
-- ----------------------------------------------------------------------------
-- Elimina los roles asignados en la tabla user_roles (fuente de verdad)
-- ----------------------------------------------------------------------------

-- DESCOMENTAR PARA EJECUTAR:
/*
DELETE FROM user_roles
WHERE user_id IN (
    SELECT id FROM profiles
    WHERE email LIKE 'docente.test%@fne-lms.test'
);
*/

-- Verificar eliminación:
SELECT
    'user_roles' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ ELIMINADO'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM user_roles ur
WHERE ur.user_id IN (
    SELECT id FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test'
);

-- ----------------------------------------------------------------------------
-- Query 2.2: ELIMINAR PERFILES (profiles)
-- ----------------------------------------------------------------------------
-- Elimina los perfiles de usuario de la tabla profiles
-- NOTA: Los IDs de auth.users quedan huérfanos pero serán eliminados manualmente
-- ----------------------------------------------------------------------------

-- DESCOMENTAR PARA EJECUTAR:
/*
DELETE FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test';
*/

-- Verificar eliminación:
SELECT
    'profiles' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ ELIMINADO'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test';

-- ============================================================================
-- SECCIÓN 3: ELIMINAR USUARIOS DE AUTH (MANUAL)
-- ============================================================================
-- Los usuarios en auth.users NO se pueden eliminar desde SQL
-- Deben eliminarse manualmente desde el Auth Dashboard de Supabase
-- ============================================================================

SELECT '⚠⚠⚠ ACCIÓN MANUAL REQUERIDA ⚠⚠⚠' as titulo;

-- ----------------------------------------------------------------------------
-- Query 3.1: LISTAR USUARIOS AUTH PENDIENTES DE ELIMINACIÓN
-- ----------------------------------------------------------------------------
-- Muestra los usuarios que deben eliminarse manualmente
-- ----------------------------------------------------------------------------

SELECT
    'USUARIOS A ELIMINAR MANUALMENTE EN AUTH DASHBOARD:' as instruccion,
    au.id as user_id,
    au.email,
    au.created_at,
    '1. Ir a Supabase Dashboard → Authentication → Users' as paso_1,
    '2. Buscar este email y hacer clic en los "..." (menú)' as paso_2,
    '3. Seleccionar "Delete user"' as paso_3,
    '4. Confirmar eliminación' as paso_4
FROM auth.users au
WHERE au.email LIKE 'docente.test%@fne-lms.test'
ORDER BY au.email;

-- COPIAR esta lista de emails para eliminar manualmente:
-- 1. docente.test1@fne-lms.test
-- 2. docente.test2@fne-lms.test
-- 3. docente.test3@fne-lms.test
-- 4. docente.test4@fne-lms.test
-- 5. docente.test5@fne-lms.test

-- ============================================================================
-- SECCIÓN 4: POST-VALIDACIÓN - VERIFICAR LIMPIEZA COMPLETA
-- ============================================================================
-- Ejecutar DESPUÉS de completar Secciones 1-3 (incluyendo eliminación manual Auth)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query 4.1: CHECKLIST DE LIMPIEZA COMPLETA
-- ----------------------------------------------------------------------------
-- Verifica que todas las tablas estén limpias de datos de prueba
-- ----------------------------------------------------------------------------

SELECT 'VERIFICACIÓN POST-LIMPIEZA' as seccion;

SELECT
    'profiles' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: Limpio'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM profiles
WHERE email LIKE 'docente.test%@fne-lms.test'

UNION ALL

SELECT
    'user_roles' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: Limpio'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM user_roles ur
WHERE ur.user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test'
)

UNION ALL

SELECT
    'course_assignments' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: Limpio'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM course_assignments ca
WHERE ca.teacher_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test'
)

UNION ALL

SELECT
    'course_enrollments' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: Limpio'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM course_enrollments ce
WHERE ce.user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test'
)

UNION ALL

SELECT
    'learning_path_assignments' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: Limpio'
        ELSE '✗ ERROR: Quedan ' || COUNT(*) || ' registros'
    END as estado
FROM learning_path_assignments lpa
WHERE lpa.user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test'
)

UNION ALL

SELECT
    'auth.users' as tabla,
    COUNT(*) as registros_restantes,
    CASE
        WHEN COUNT(*) = 0 THEN '✓ OK: Eliminados manualmente'
        ELSE '⚠ PENDIENTE: Eliminar ' || COUNT(*) || ' usuarios en Auth Dashboard'
    END as estado
FROM auth.users
WHERE email LIKE 'docente.test%@fne-lms.test';

-- ----------------------------------------------------------------------------
-- Query 4.2: MENSAJE FINAL
-- ----------------------------------------------------------------------------
-- Mensaje de confirmación de limpieza completa
-- ----------------------------------------------------------------------------

SELECT
    '=== LIMPIEZA COMPLETADA ===' as titulo,
    CASE
        WHEN (
            (SELECT COUNT(*) FROM profiles WHERE email LIKE 'docente.test%@fne-lms.test') = 0
            AND (SELECT COUNT(*) FROM user_roles ur WHERE ur.user_id IN
                (SELECT id FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test')) = 0
            AND (SELECT COUNT(*) FROM course_assignments WHERE teacher_id IN
                (SELECT id FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test')) = 0
            AND (SELECT COUNT(*) FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test') = 0
        )
        THEN '✓✓✓ TODOS LOS DATOS DE PRUEBA HAN SIDO ELIMINADOS ✓✓✓'
        WHEN (SELECT COUNT(*) FROM auth.users WHERE email LIKE 'docente.test%@fne-lms.test') > 0
        THEN '⚠ CASI COMPLETO: Faltan eliminar usuarios en Auth Dashboard'
        ELSE '✗ INCOMPLETO: Revisar errores arriba'
    END as estado,
    'Base de datos lista para producción o nuevo ciclo de testing' as nota;

-- ============================================================================
-- NOTAS ADICIONALES Y CONSIDERACIONES
-- ============================================================================
/*

ORDEN DE ELIMINACIÓN (Seguido en este script):
1. learning_path_assignments (depende de profiles)
2. course_enrollments (depende de profiles)
3. course_assignments (depende de profiles)
4. lesson_progress (OPCIONAL - depende de profiles)
5. user_roles (depende de profiles)
6. profiles (depende de auth.users)
7. auth.users (MANUAL - raíz de todo)

DATOS QUE NO SE ELIMINAN (se preservan):
- Cursos (courses) - son contenido del sistema
- Rutas de aprendizaje (learning_paths) - son contenido del sistema
- Lecciones y bloques (lessons, blocks) - son contenido del sistema
- Escuelas (schools) - datos organizacionales base
- Generaciones (generations) - datos organizacionales base
- Comunidades (growth_communities) - solo se liberan espacios, no se eliminan

RECUPERACIÓN EN CASO DE ERROR:
Si se eliminan datos por error:
1. Restaurar desde backup de base de datos
2. Re-ejecutar Fases 1-3 para recrear usuarios de prueba
3. NO hay forma de recuperar datos de auth.users eliminados sin backup

SEGURIDAD:
- Todas las queries DELETE están comentadas por defecto
- Requiere descomentar explícitamente cada bloque DELETE
- Incluye validaciones pre y post eliminación
- Filtra estrictamente por patrón 'docente.test%@fne-lms.test'

TIEMPO ESTIMADO DE EJECUCIÓN:
- Sección 0 (validación): 1-2 minutos
- Sección 1 (asignaciones): 2-3 minutos
- Sección 2 (roles/perfiles): 1-2 minutos
- Sección 3 (auth manual): 5-10 minutos
- Sección 4 (verificación): 1-2 minutos
- TOTAL: 10-20 minutos

PRÓXIMOS PASOS DESPUÉS DE LIMPIEZA:
1. Verificar que Query 4.2 muestre "ELIMINADOS" en todas las tablas
2. Confirmar en Auth Dashboard que no quedan usuarios test
3. Si se necesita repetir testing, volver a ejecutar Fases 1-3
4. Si se terminó testing, actualizar documentación del proyecto

*/

-- ============================================================================
-- FIN DEL SCRIPT DE LIMPIEZA
-- ============================================================================
-- Versión: 1.0.0
-- Última actualización: 2025-01-19
-- ============================================================================
