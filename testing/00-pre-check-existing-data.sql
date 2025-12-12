-- ============================================
-- SCRIPT: Pre-Validación de Datos Existentes
-- Proyecto: FNE LMS - Testing Manual Rol Docente
-- Propósito: Verificar datos existentes antes de crear usuarios de prueba
-- Fecha: 2025-01-19
-- ============================================

-- INSTRUCCIONES:
-- 1. Ejecutar este script COMPLETO en Supabase SQL Editor
-- 2. Revisar los resultados de cada sección
-- 3. Anotar los IDs reales que usaremos para crear usuarios de prueba
-- 4. Si alguna sección no retorna datos, será necesario crear datos base primero

-- ============================================
-- SECCIÓN A: VERIFICAR ESCUELAS DISPONIBLES
-- ============================================

-- Query A.1: Escuelas CON generaciones
-- Propósito: Identificar escuelas que usan el modelo de generaciones (Tractor/Innova)
-- Esperado: Al menos 2 escuelas con has_generations = true
SELECT
    s.id as escuela_id,
    s.name as nombre_escuela,
    s.has_generations as usa_generaciones,
    COUNT(g.id) as total_generaciones
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
WHERE s.has_generations = true
GROUP BY s.id, s.name, s.has_generations
ORDER BY s.name
LIMIT 10;

-- ANOTAR AQUÍ:
-- Escuela 1 (con generaciones): ID = _____, Nombre = _____________________
-- Escuela 2 (con generaciones): ID = _____, Nombre = _____________________


-- Query A.2: Escuelas SIN generaciones
-- Propósito: Identificar escuelas que NO usan el modelo de generaciones
-- Esperado: Al menos 2 escuelas con has_generations = false
SELECT
    s.id as escuela_id,
    s.name as nombre_escuela,
    s.has_generations as usa_generaciones,
    COUNT(gc.id) as total_comunidades_directas
FROM schools s
LEFT JOIN growth_communities gc ON gc.school_id = s.id AND gc.generation_id IS NULL
WHERE s.has_generations = false OR s.has_generations IS NULL
GROUP BY s.id, s.name, s.has_generations
ORDER BY s.name
LIMIT 10;

-- ANOTAR AQUÍ:
-- Escuela 3 (sin generaciones): ID = _____, Nombre = _____________________


-- Query A.3: Resumen de todas las escuelas
-- Propósito: Vista general de la distribución de escuelas
SELECT
    COUNT(*) as total_escuelas,
    COUNT(*) FILTER (WHERE has_generations = true) as con_generaciones,
    COUNT(*) FILTER (WHERE has_generations = false OR has_generations IS NULL) as sin_generaciones
FROM schools;


-- ============================================
-- SECCIÓN B: VERIFICAR GENERACIONES
-- ============================================

-- Query B.1: Listado de todas las generaciones
-- Propósito: Ver todas las generaciones disponibles con sus escuelas
-- Esperado: Al menos 3-4 generaciones (idealmente con nombres como Tractor, Innova, etc.)
SELECT
    g.id as generacion_id,
    g.name as nombre_generacion,
    g.grade_range as rango_grados,
    g.school_id as escuela_id,
    s.name as nombre_escuela,
    COUNT(gc.id) as total_comunidades
FROM generations g
JOIN schools s ON s.id = g.school_id
LEFT JOIN growth_communities gc ON gc.generation_id = g.id
GROUP BY g.id, g.name, g.grade_range, g.school_id, s.name
ORDER BY s.name, g.name
LIMIT 20;

-- ANOTAR AQUÍ:
-- Generación 1 (ej: Tractor): ID = _____, Nombre = _____, Escuela = _____
-- Generación 2 (ej: Innova):  ID = _____, Nombre = _____, Escuela = _____


-- Query B.2: Generaciones por escuela (agrupado)
-- Propósito: Ver cuántas generaciones tiene cada escuela
SELECT
    s.id as escuela_id,
    s.name as nombre_escuela,
    COUNT(g.id) as total_generaciones,
    STRING_AGG(g.name, ', ' ORDER BY g.name) as nombres_generaciones
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
WHERE s.has_generations = true
GROUP BY s.id, s.name
ORDER BY s.name;


-- Query B.3: Buscar generaciones con nombres específicos (Tractor/Innova)
-- Propósito: Encontrar generaciones con nomenclatura común en Chile
SELECT
    g.id as generacion_id,
    g.name as nombre_generacion,
    s.id as escuela_id,
    s.name as nombre_escuela
FROM generations g
JOIN schools s ON s.id = g.school_id
WHERE
    g.name ILIKE '%tractor%'
    OR g.name ILIKE '%innova%'
    OR g.name ILIKE '%generación%'
ORDER BY s.name, g.name;


-- ============================================
-- SECCIÓN C: VERIFICAR COMUNIDADES DE CRECIMIENTO
-- ============================================

-- Query C.1: Comunidades vinculadas a generaciones
-- Propósito: Ver comunidades que pertenecen a generaciones específicas
-- Esperado: Al menos 3 comunidades con generation_id poblado
SELECT
    gc.id as comunidad_id,
    gc.name as nombre_comunidad,
    gc.generation_id,
    g.name as nombre_generacion,
    gc.school_id,
    s.name as nombre_escuela,
    gc.max_teachers as max_docentes,
    -- Contar miembros actuales usando user_roles (fuente de verdad)
    (SELECT COUNT(*)
     FROM user_roles ur
     WHERE ur.community_id = gc.id
       AND ur.is_active = true
       AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')) as miembros_actuales
FROM growth_communities gc
JOIN schools s ON s.id = gc.school_id
LEFT JOIN generations g ON g.id = gc.generation_id
WHERE gc.generation_id IS NOT NULL
ORDER BY s.name, g.name, gc.name
LIMIT 20;

-- ANOTAR AQUÍ:
-- Comunidad 1: ID = _____, Nombre = _____, Generación = _____, Escuela = _____
-- Comunidad 2: ID = _____, Nombre = _____, Generación = _____, Escuela = _____


-- Query C.2: Comunidades SIN generación (standalone)
-- Propósito: Ver comunidades de escuelas que no usan el modelo de generaciones
-- Esperado: Al menos 1-2 comunidades con generation_id = NULL
SELECT
    gc.id as comunidad_id,
    gc.name as nombre_comunidad,
    gc.generation_id,
    gc.school_id,
    s.name as nombre_escuela,
    s.has_generations as escuela_usa_generaciones,
    -- Contar miembros actuales usando user_roles (fuente de verdad)
    (SELECT COUNT(*)
     FROM user_roles ur
     WHERE ur.community_id = gc.id
       AND ur.is_active = true
       AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')) as miembros_actuales
FROM growth_communities gc
JOIN schools s ON s.id = gc.school_id
WHERE gc.generation_id IS NULL
ORDER BY s.name, gc.name
LIMIT 10;

-- ANOTAR AQUÍ:
-- Comunidad 3 (sin generación): ID = _____, Nombre = _____, Escuela = _____


-- Query C.3: Estadísticas de comunidades
-- Propósito: Resumen general de comunidades en el sistema
SELECT
    COUNT(*) as total_comunidades,
    COUNT(*) FILTER (WHERE generation_id IS NOT NULL) as con_generacion,
    COUNT(*) FILTER (WHERE generation_id IS NULL) as sin_generacion,
    AVG(max_teachers) as promedio_max_docentes
FROM growth_communities;


-- Query C.4: Comunidades con espacio disponible
-- Propósito: Encontrar comunidades que puedan recibir nuevos miembros
SELECT
    gc.id as comunidad_id,
    gc.name as nombre_comunidad,
    s.name as nombre_escuela,
    g.name as nombre_generacion,
    gc.max_teachers as capacidad_maxima,
    -- Contar miembros actuales usando user_roles (fuente de verdad)
    (SELECT COUNT(*)
     FROM user_roles ur
     WHERE ur.community_id = gc.id
       AND ur.is_active = true
       AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')) as miembros_actuales,
    gc.max_teachers - (SELECT COUNT(*)
                       FROM user_roles ur
                       WHERE ur.community_id = gc.id
                         AND ur.is_active = true
                         AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')) as espacios_disponibles
FROM growth_communities gc
JOIN schools s ON s.id = gc.school_id
LEFT JOIN generations g ON g.id = gc.generation_id
WHERE gc.max_teachers > (SELECT COUNT(*)
                         FROM user_roles ur
                         WHERE ur.community_id = gc.id
                           AND ur.is_active = true
                           AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion'))
ORDER BY espacios_disponibles DESC
LIMIT 10;


-- ============================================
-- SECCIÓN D: JERARQUÍA ORGANIZACIONAL COMPLETA
-- ============================================

-- Query D.1: Vista completa de Escuela → Generación → Comunidad
-- Propósito: Visualizar la estructura organizacional completa
-- Este query muestra todas las relaciones incluyendo comunidades standalone
-- IMPORTANTE: Usa UNION para traer comunidades vinculadas Y comunidades sin generación
SELECT
    s.id as escuela_id,
    s.name as escuela,
    s.has_generations,
    g.id as generacion_id,
    g.name as generacion,
    g.grade_range as rango_grados,
    gc.id as comunidad_id,
    gc.name as comunidad,
    gc.max_teachers as capacidad,
    -- Contar miembros actuales usando user_roles (fuente de verdad)
    (SELECT COUNT(*)
     FROM user_roles ur
     WHERE ur.community_id = gc.id
       AND ur.is_active = true
       AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')) as miembros
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
LEFT JOIN growth_communities gc ON gc.school_id = s.id AND gc.generation_id = g.id
WHERE gc.id IS NOT NULL  -- Solo mostrar filas con comunidades vinculadas a generaciones

UNION ALL

-- Comunidades standalone (sin generación) de todas las escuelas
SELECT
    s.id as escuela_id,
    s.name as escuela,
    s.has_generations,
    NULL as generacion_id,
    NULL as generacion,
    NULL as rango_grados,
    gc.id as comunidad_id,
    gc.name as comunidad,
    gc.max_teachers as capacidad,
    -- Contar miembros actuales usando user_roles (fuente de verdad)
    (SELECT COUNT(*)
     FROM user_roles ur
     WHERE ur.community_id = gc.id
       AND ur.is_active = true
       AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')) as miembros
FROM schools s
JOIN growth_communities gc ON gc.school_id = s.id
WHERE gc.generation_id IS NULL

ORDER BY escuela, generacion NULLS LAST, comunidad
LIMIT 50;

-- ANOTAR LA ESTRUCTURA ORGANIZACIONAL QUE USAREMOS:
-- Usuario 1: Escuela = _____, Generación = _____, Comunidad = _____
-- Usuario 2: Escuela = _____, Generación = _____, Comunidad = _____
-- Usuario 3: Escuela = _____, Generación = NULL, Comunidad = _____
-- Usuario 4: Escuela = _____, Generación = _____, Comunidad = NULL
-- Usuario 5: Escuela = _____, Generación = NULL, Comunidad = NULL


-- Query D.2: Jerarquía agrupada por escuela
-- Propósito: Vista resumida por escuela para facilitar selección
SELECT
    s.id as escuela_id,
    s.name as escuela,
    s.has_generations,
    COUNT(DISTINCT g.id) as total_generaciones,
    COUNT(DISTINCT gc.id) as total_comunidades,
    STRING_AGG(DISTINCT g.name, ', ' ORDER BY g.name) as generaciones,
    STRING_AGG(DISTINCT gc.name, ', ' ORDER BY gc.name) as comunidades
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
LEFT JOIN growth_communities gc ON gc.school_id = s.id
GROUP BY s.id, s.name, s.has_generations
ORDER BY s.name
LIMIT 20;


-- ============================================
-- SECCIÓN E: VERIFICAR CURSOS Y RUTAS DISPONIBLES
-- ============================================

-- Query E.1: Cursos publicados y activos
-- Propósito: Encontrar cursos que podemos asignar a los usuarios de prueba
-- Esperado: Al menos 5-10 cursos con status 'published' o 'active'
SELECT
    c.id as curso_id,
    c.title as titulo_curso,
    c.description as descripcion,
    c.structure_type as tipo_estructura,
    c.status as estado,
    c.is_self_paced as auto_ritmo,
    COUNT(DISTINCT CASE WHEN c.structure_type = 'simple' THEN l.id END) as total_lecciones_directas,
    COUNT(DISTINCT m.id) as total_modulos,
    COUNT(DISTINCT CASE WHEN c.structure_type = 'structured' THEN l.id END) as total_lecciones_en_modulos,
    c.created_at as fecha_creacion
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id
LEFT JOIN modules m ON m.course_id = c.id
WHERE c.status IN ('published', 'active', 'draft')  -- Incluir draft para testing
GROUP BY c.id, c.title, c.description, c.structure_type, c.status, c.is_self_paced, c.created_at
ORDER BY c.created_at DESC
LIMIT 20;

-- ANOTAR AQUÍ (seleccionar 6-8 cursos para asignar):
-- Curso 1: ID = _____, Título = _____________________
-- Curso 2: ID = _____, Título = _____________________
-- Curso 3: ID = _____, Título = _____________________
-- Curso 4: ID = _____, Título = _____________________
-- Curso 5: ID = _____, Título = _____________________
-- Curso 6: ID = _____, Título = _____________________


-- Query E.2: Rutas de aprendizaje con sus cursos
-- Propósito: Encontrar rutas de aprendizaje que podemos asignar
-- Esperado: Al menos 2-3 rutas con múltiples cursos
SELECT
    lp.id as ruta_id,
    lp.name as nombre_ruta,
    lp.description as descripcion,
    COUNT(lpc.course_id) as total_cursos,
    STRING_AGG(c.title, ' → ' ORDER BY lpc.sequence_order) as secuencia_cursos,
    lp.created_at as fecha_creacion
FROM learning_paths lp
LEFT JOIN learning_path_courses lpc ON lpc.learning_path_id = lp.id
LEFT JOIN courses c ON c.id = lpc.course_id
GROUP BY lp.id, lp.name, lp.description, lp.created_at
ORDER BY lp.created_at DESC
LIMIT 10;

-- ANOTAR AQUÍ (seleccionar 3-4 rutas para asignar):
-- Ruta 1: ID = _____, Nombre = _____________________, Cursos = _____
-- Ruta 2: ID = _____, Nombre = _____________________, Cursos = _____
-- Ruta 3: ID = _____, Nombre = _____________________, Cursos = _____


-- Query E.3: Detalle de cursos en rutas específicas
-- Propósito: Ver la secuencia completa de una ruta de aprendizaje
-- EJECUTAR DESPUÉS de identificar IDs de rutas en E.2
-- Reemplazar 'RUTA_ID_AQUI' con un ID real de la query E.2
/*
SELECT
    lp.id as ruta_id,
    lp.name as nombre_ruta,
    lpc.sequence_order as orden,
    c.id as curso_id,
    c.title as titulo_curso,
    lpc.is_required as es_requerido,
    lpc.unlock_criteria as criterio_desbloqueo
FROM learning_paths lp
JOIN learning_path_courses lpc ON lpc.learning_path_id = lp.id
JOIN courses c ON c.id = lpc.course_id
WHERE lp.id = 'RUTA_ID_AQUI'  -- Reemplazar con ID real
ORDER BY lpc.sequence_order;
*/


-- Query E.4: Tareas grupales disponibles (sistema de producción)
-- Propósito: Encontrar tareas grupales en bloques de lecciones
-- Esperado: Al menos 3-5 tareas grupales activas
-- IMPORTANTE: El sistema usa blocks con type='group-assignment', NO lesson_assignments
SELECT
    b.id as tarea_id,
    b.payload->>'title' as titulo_tarea,
    b.payload->>'description' as descripcion,
    'group-assignment' as tipo_tarea,
    b.is_visible as visible,
    b.position as posicion_en_leccion,
    b.estimated_duration_minutes as duracion_estimada,
    c.id as curso_id,
    c.title as curso_asociado,
    l.id as leccion_id,
    l.title as leccion_asociada
FROM blocks b
JOIN lessons l ON l.id = b.lesson_id
LEFT JOIN modules m ON m.id = l.module_id
LEFT JOIN courses c ON c.id = COALESCE(l.course_id, m.course_id)
WHERE b.type IN ('group-assignment', 'group_assignment')
  AND b.is_visible = true
ORDER BY c.title, l.title, b.position
LIMIT 20;

-- ANOTAR AQUÍ (seleccionar tareas grupales para verificar):
-- Tarea Grupal 1: Block ID = _____, Título = _____________________, Curso = _____
-- Tarea Grupal 2: Block ID = _____, Título = _____________________, Curso = _____
-- Tarea Grupal 3: Block ID = _____, Título = _____________________, Curso = _____

-- NOTA TÉCNICA: Las tareas grupales se almacenan como bloques en lecciones.
-- Ver: lib/services/groupAssignmentsV2.js y pages/mi-aprendizaje/tareas.tsx


-- Query E.5: Verificar contenido de cursos (lecciones y bloques)
-- Propósito: Asegurar que los cursos tienen contenido real
SELECT
    c.id as curso_id,
    c.title as titulo_curso,
    c.structure_type,
    COUNT(DISTINCT l.id) as total_lecciones,
    COUNT(DISTINCT b.id) as total_bloques,
    COUNT(DISTINCT b.id) FILTER (WHERE b.type = 'quiz') as bloques_quiz,
    COUNT(DISTINCT b.id) FILTER (WHERE b.type = 'text') as bloques_texto,
    COUNT(DISTINCT b.id) FILTER (WHERE b.type = 'video') as bloques_video
FROM courses c
LEFT JOIN lessons l ON l.course_id = c.id
LEFT JOIN blocks b ON b.lesson_id = l.id
WHERE c.status IN ('published', 'active', 'draft')
GROUP BY c.id, c.title, c.structure_type
HAVING COUNT(DISTINCT l.id) > 0  -- Solo cursos con lecciones
ORDER BY total_bloques DESC
LIMIT 20;


-- ============================================
-- SECCIÓN F: VALIDACIONES FINALES
-- ============================================

-- Query F.1: Checklist de pre-requisitos
-- Propósito: Verificar que tenemos suficientes datos para crear usuarios de prueba
SELECT
    'Escuelas con generaciones' as tipo_dato,
    COUNT(*) as cantidad,
    CASE WHEN COUNT(*) >= 2 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END as status
FROM schools
WHERE has_generations = true

UNION ALL

SELECT
    'Escuelas sin generaciones',
    COUNT(*),
    CASE WHEN COUNT(*) >= 2 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END
FROM schools
WHERE has_generations = false OR has_generations IS NULL

UNION ALL

SELECT
    'Generaciones disponibles',
    COUNT(*),
    CASE WHEN COUNT(*) >= 3 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END
FROM generations

UNION ALL

SELECT
    'Comunidades disponibles',
    COUNT(*),
    CASE WHEN COUNT(*) >= 3 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END
FROM growth_communities

UNION ALL

SELECT
    'Cursos publicados',
    COUNT(*),
    CASE WHEN COUNT(*) >= 5 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END
FROM courses
WHERE status IN ('published', 'active')

UNION ALL

SELECT
    'Rutas de aprendizaje',
    COUNT(*),
    CASE WHEN COUNT(*) >= 2 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END
FROM learning_paths

UNION ALL

SELECT
    'Tareas grupales activas',
    COUNT(*),
    CASE WHEN COUNT(*) >= 3 THEN '✓ OK' ELSE '✗ INSUFICIENTE' END
FROM blocks
WHERE type IN ('group-assignment', 'group_assignment')
  AND is_visible = true;


-- Query F.2: Resumen ejecutivo
-- Propósito: Vista rápida del estado general del sistema
SELECT
    (SELECT COUNT(*) FROM schools) as total_escuelas,
    (SELECT COUNT(*) FROM generations) as total_generaciones,
    (SELECT COUNT(*) FROM growth_communities) as total_comunidades,
    (SELECT COUNT(*) FROM courses WHERE status IN ('published', 'active')) as cursos_activos,
    (SELECT COUNT(*) FROM learning_paths) as rutas_aprendizaje,
    (SELECT COUNT(*) FROM blocks
     WHERE type IN ('group-assignment', 'group_assignment')
       AND is_visible = true) as tareas_grupales_activas,
    (SELECT COUNT(*) FROM profiles WHERE email LIKE '%@fne-lms.test') as usuarios_prueba_existentes;


-- ============================================
-- CONCLUSIÓN
-- ============================================

-- Si todas las validaciones en F.1 muestran "✓ OK", puedes proceder a:
-- 1. Anotar los IDs seleccionados arriba
-- 2. Ejecutar el script 01-create-docente-test-users.sql

-- Si alguna validación muestra "✗ INSUFICIENTE":
-- 1. Crear los datos faltantes (escuelas, generaciones, comunidades, cursos)
-- 2. Re-ejecutar este script
-- 3. Luego proceder con la creación de usuarios

-- ============================================
-- FIN DEL SCRIPT DE PRE-VALIDACIÓN
-- ============================================
