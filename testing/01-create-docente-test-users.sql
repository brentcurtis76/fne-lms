-- ============================================
-- SCRIPT: Creación de Usuarios Docente de Prueba
-- Proyecto: FNE LMS - Testing Manual Rol Docente
-- Propósito: Crear 5 usuarios docentes con configuraciones organizacionales diversas
-- Fecha: 2025-01-19
-- Versión: 1.0.0
-- ============================================

-- PREREQUISITOS:
-- 1. Haber ejecutado 00-pre-check-existing-data.sql
-- 2. Todas las validaciones en Query F.1 deben mostrar "✓ OK"
-- 3. Tener acceso a Supabase Dashboard (Authentication > Users)

-- INSTRUCCIONES DE USO:
-- Este script tiene dos fases:
-- FASE 1: Ejecutar SECCIONES 0-1 en Supabase SQL Editor (validación + selección de IDs)
-- FASE 2: Crear usuarios manualmente en Supabase Auth Dashboard
-- FASE 3: Ejecutar SECCIONES 2-3 en Supabase SQL Editor (insertar profiles + roles)
-- FASE 4: Ejecutar SECCIÓN 4 para verificar (queries de verificación)

-- ============================================
-- SECCIÓN 0: PRE-VALIDACIONES
-- ============================================

DO $$
DECLARE
    v_escuelas_con_gen INTEGER;
    v_escuelas_sin_gen INTEGER;
    v_generaciones INTEGER;
    v_comunidades INTEGER;
    v_cursos INTEGER;
    v_mensaje TEXT := '';
BEGIN
    -- Verificar escuelas con generaciones
    SELECT COUNT(*) INTO v_escuelas_con_gen
    FROM schools WHERE has_generations = true;

    IF v_escuelas_con_gen < 2 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_escuelas_con_gen || ' escuela(s) con generaciones (se necesitan al menos 2)\n';
    END IF;

    -- Verificar escuelas sin generaciones
    SELECT COUNT(*) INTO v_escuelas_sin_gen
    FROM schools WHERE has_generations = false OR has_generations IS NULL;

    IF v_escuelas_sin_gen < 2 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_escuelas_sin_gen || ' escuela(s) sin generaciones (se necesitan al menos 2)\n';
    END IF;

    -- Verificar generaciones
    SELECT COUNT(*) INTO v_generaciones FROM generations;

    IF v_generaciones < 3 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_generaciones || ' generación(es) (se necesitan al menos 3)\n';
    END IF;

    -- Verificar comunidades
    SELECT COUNT(*) INTO v_comunidades FROM growth_communities;

    IF v_comunidades < 3 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_comunidades || ' comunidad(es) (se necesitan al menos 3)\n';
    END IF;

    -- Verificar cursos
    SELECT COUNT(*) INTO v_cursos
    FROM courses WHERE status IN ('published', 'active');

    IF v_cursos < 5 THEN
        v_mensaje := v_mensaje || E'✗ INSUFICIENTE: Solo hay ' || v_cursos || ' curso(s) publicado(s) (se necesitan al menos 5)\n';
    END IF;

    -- Si hay errores, detener con mensaje
    IF v_mensaje <> '' THEN
        RAISE EXCEPTION E'PRE-VALIDACIÓN FALLIDA:\n%\nPor favor ejecute 00-pre-check-existing-data.sql para verificar datos existentes.', v_mensaje;
    ELSE
        RAISE NOTICE '✓ PRE-VALIDACIÓN EXITOSA: Todos los requisitos están cumplidos';
    END IF;
END $$;


-- ============================================
-- SECCIÓN 1: SELECCIÓN DINÁMICA DE IDS
-- ============================================

-- Esta sección identifica automáticamente escuelas, generaciones y comunidades
-- que serán asignadas a cada usuario de prueba.

-- IMPORTANTE: Revisar los resultados de estas queries y anotar los IDs
-- que se usarán para cada usuario.

-- Query 1.1: Seleccionar escuelas para usuarios 1 y 2 (con generaciones)
-- Propósito: Encontrar 2 escuelas diferentes con generaciones y comunidades
SELECT
    ROW_NUMBER() OVER (ORDER BY s.id) as numero_usuario,
    s.id as escuela_id,
    s.name as escuela_nombre,
    (SELECT g.id FROM generations g WHERE g.school_id = s.id LIMIT 1) as generacion_id,
    (SELECT g.name FROM generations g WHERE g.school_id = s.id LIMIT 1) as generacion_nombre,
    (SELECT gc.id FROM growth_communities gc
     WHERE gc.school_id = s.id
       AND gc.generation_id = (SELECT g.id FROM generations g WHERE g.school_id = s.id LIMIT 1)
       AND gc.max_teachers > (SELECT COUNT(*) FROM user_roles ur
                              WHERE ur.community_id = gc.id
                                AND ur.is_active = true
                                AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion'))
     LIMIT 1) as comunidad_id,
    (SELECT gc.name FROM growth_communities gc
     WHERE gc.school_id = s.id
       AND gc.generation_id = (SELECT g.id FROM generations g WHERE g.school_id = s.id LIMIT 1)
       AND gc.max_teachers > (SELECT COUNT(*) FROM user_roles ur
                              WHERE ur.community_id = gc.id
                                AND ur.is_active = true
                                AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion'))
     LIMIT 1) as comunidad_nombre
FROM schools s
WHERE s.has_generations = true
  AND EXISTS (SELECT 1 FROM generations g WHERE g.school_id = s.id)
  AND EXISTS (SELECT 1 FROM growth_communities gc
              WHERE gc.school_id = s.id
                AND gc.generation_id IS NOT NULL
                AND gc.max_teachers > (SELECT COUNT(*) FROM user_roles ur
                                       WHERE ur.community_id = gc.id
                                         AND ur.is_active = true
                                         AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')))
LIMIT 2;

-- ANOTAR AQUÍ:
-- Usuario 1: Escuela ID = _____, Generación ID = _____, Comunidad ID = _____
-- Usuario 2: Escuela ID = _____, Generación ID = _____, Comunidad ID = _____


-- Query 1.2: Seleccionar escuela para usuario 3 (sin generaciones, con comunidad)
-- Propósito: Encontrar escuela sin generaciones pero con comunidad standalone
SELECT
    3 as numero_usuario,
    s.id as escuela_id,
    s.name as escuela_nombre,
    NULL as generacion_id,
    NULL as generacion_nombre,
    (SELECT gc.id FROM growth_communities gc
     WHERE gc.school_id = s.id
       AND gc.generation_id IS NULL
       AND gc.max_teachers > (SELECT COUNT(*) FROM user_roles ur
                              WHERE ur.community_id = gc.id
                                AND ur.is_active = true
                                AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion'))
     LIMIT 1) as comunidad_id,
    (SELECT gc.name FROM growth_communities gc
     WHERE gc.school_id = s.id
       AND gc.generation_id IS NULL
       AND gc.max_teachers > (SELECT COUNT(*) FROM user_roles ur
                              WHERE ur.community_id = gc.id
                                AND ur.is_active = true
                                AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion'))
     LIMIT 1) as comunidad_nombre
FROM schools s
WHERE (s.has_generations = false OR s.has_generations IS NULL)
  AND EXISTS (SELECT 1 FROM growth_communities gc
              WHERE gc.school_id = s.id
                AND gc.generation_id IS NULL
                AND gc.max_teachers > (SELECT COUNT(*) FROM user_roles ur
                                       WHERE ur.community_id = gc.id
                                         AND ur.is_active = true
                                         AND ur.role_type IN ('docente', 'lider_comunidad', 'lider_generacion')))
LIMIT 1;

-- ANOTAR AQUÍ:
-- Usuario 3: Escuela ID = _____, Generación ID = NULL, Comunidad ID = _____


-- Query 1.3: Seleccionar escuela para usuario 4 (con generaciones, sin comunidad)
-- Propósito: Encontrar escuela con generaciones pero usuario sin asignar a comunidad
SELECT
    4 as numero_usuario,
    s.id as escuela_id,
    s.name as escuela_nombre,
    (SELECT g.id FROM generations g WHERE g.school_id = s.id LIMIT 1) as generacion_id,
    (SELECT g.name FROM generations g WHERE g.school_id = s.id LIMIT 1) as generacion_nombre,
    NULL as comunidad_id,
    NULL as comunidad_nombre
FROM schools s
WHERE s.has_generations = true
  AND EXISTS (SELECT 1 FROM generations g WHERE g.school_id = s.id)
  AND s.id NOT IN (
      -- Excluir escuelas ya usadas en usuarios 1 y 2
      SELECT s2.id FROM schools s2
      WHERE s2.has_generations = true
      ORDER BY s2.id LIMIT 2
  )
LIMIT 1;

-- ANOTAR AQUÍ:
-- Usuario 4: Escuela ID = _____, Generación ID = _____, Comunidad ID = NULL


-- Query 1.4: Seleccionar escuela para usuario 5 (sin generaciones, sin comunidad)
-- Propósito: Encontrar escuela sin generaciones y usuario sin asignar a comunidad
SELECT
    5 as numero_usuario,
    s.id as escuela_id,
    s.name as escuela_nombre,
    NULL as generacion_id,
    NULL as generacion_nombre,
    NULL as comunidad_id,
    NULL as comunidad_nombre
FROM schools s
WHERE (s.has_generations = false OR s.has_generations IS NULL)
  AND s.id NOT IN (
      -- Excluir escuela ya usada en usuario 3
      SELECT s2.id FROM schools s2
      WHERE (s2.has_generations = false OR s2.has_generations IS NULL)
      ORDER BY s2.id LIMIT 1
  )
LIMIT 1;

-- ANOTAR AQUÍ:
-- Usuario 5: Escuela ID = _____, Generación ID = NULL, Comunidad ID = NULL


-- ============================================
-- TABLA RESUMEN PARA ANOTAR IDS REALES
-- ============================================

/*
┌─────────┬────────────┬──────────────┬─────────────┬──────────────┐
│ Usuario │ Escuela ID │ Generación ID│ Comunidad ID│ Auth User ID │
├─────────┼────────────┼──────────────┼─────────────┼──────────────┤
│    1    │   _______  │   _______    │   _______   │   _______    │
│    2    │   _______  │   _______    │   _______   │   _______    │
│    3    │   _______  │     NULL     │   _______   │   _______    │
│    4    │   _______  │   _______    │     NULL    │   _______    │
│    5    │   _______  │     NULL     │     NULL    │   _______    │
└─────────┴────────────┴──────────────┴─────────────┴──────────────┘
*/


-- ============================================
-- SECCIÓN 2: INSTRUCCIONES PARA CREAR USUARIOS EN SUPABASE AUTH
-- ============================================

/*
INSTRUCCIONES PASO A PASO:

1. Ir a Supabase Dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj
2. Navegar a: Authentication > Users
3. Click en botón "Add user" (o "Invite user")
4. Crear cada usuario con estos datos:

┌─────────┬───────────────────────────────┬──────────────┐
│ Usuario │ Email                         │ Contraseña   │
├─────────┼───────────────────────────────┼──────────────┤
│    1    │ docente.test1@fne-lms.test    │ Prueba2025!  │
│    2    │ docente.test2@fne-lms.test    │ Prueba2025!  │
│    3    │ docente.test3@fne-lms.test    │ Prueba2025!  │
│    4    │ docente.test4@fne-lms.test    │ Prueba2025!  │
│    5    │ docente.test5@fne-lms.test    │ Prueba2025!  │
└─────────┴───────────────────────────────┴──────────────┘

5. Después de crear cada usuario:
   - Copiar el UUID del usuario (columna "ID")
   - Anotarlo en la tabla de arriba (columna "Auth User ID")

6. Opcional: En la UI, seleccionar "Email confirmed" si quieres que puedan
   hacer login inmediatamente sin verificar el correo.

IMPORTANTE: Anotar los 5 UUIDs generados por Supabase Auth.
Estos IDs se usarán en la SECCIÓN 3 para crear los perfiles.

-- ANOTAR LOS AUTH USER IDS AQUÍ:
-- Usuario 1 Auth ID: _____________________________________
-- Usuario 2 Auth ID: _____________________________________
-- Usuario 3 Auth ID: _____________________________________
-- Usuario 4 Auth ID: _____________________________________
-- Usuario 5 Auth ID: _____________________________________
*/


-- ============================================
-- SECCIÓN 3: INSERCIÓN DE PROFILES Y USER_ROLES
-- ============================================

-- IMPORTANTE: Reemplazar los valores siguientes con los IDs reales anotados arriba:
-- - USER_1_AUTH_ID, USER_2_AUTH_ID, etc. → IDs de Supabase Auth
-- - SCHOOL_1_ID, SCHOOL_2_ID, etc. → IDs de escuelas (Sección 1)
-- - GEN_1_ID, GEN_2_ID, etc. → IDs de generaciones (Sección 1)
-- - COM_1_ID, COM_2_ID, etc. → IDs de comunidades (Sección 1)

-- Antes de ejecutar, descomenta el código y reemplaza los placeholders.

/*

-- Usuario 1: Escuela con generaciones + Comunidad
INSERT INTO profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    school_id,
    generation_id,
    community_id
) VALUES (
    'USER_1_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente.test1@fne-lms.test',
    'Docente Prueba 1',
    'Docente Prueba',
    'Uno',
    'SCHOOL_1_ID'::uuid,      -- Reemplazar con Escuela ID real (Query 1.1)
    'GEN_1_ID'::uuid,         -- Reemplazar con Generación ID real (Query 1.1)
    'COM_1_ID'::uuid          -- Reemplazar con Comunidad ID real (Query 1.1)
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    school_id = EXCLUDED.school_id,
    generation_id = EXCLUDED.generation_id,
    community_id = EXCLUDED.community_id;

INSERT INTO user_roles (
    user_id,
    role_type,
    school_id,
    generation_id,
    community_id,
    is_active,
    assigned_at,
    assigned_by
) VALUES (
    'USER_1_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente',
    'SCHOOL_1_ID'::uuid,     -- Reemplazar con Escuela ID real
    'GEN_1_ID'::uuid,        -- Reemplazar con Generación ID real
    'COM_1_ID'::uuid,        -- Reemplazar con Comunidad ID real
    true,
    NOW(),
    (SELECT id FROM profiles WHERE email = 'admin@fne-lms.test' LIMIT 1)  -- Asignado por admin
)
ON CONFLICT (user_id, role_type, school_id) DO UPDATE SET
    generation_id = EXCLUDED.generation_id,
    community_id = EXCLUDED.community_id,
    is_active = true,
    assigned_at = NOW();


-- Usuario 2: Escuela con generaciones + Comunidad (diferente a Usuario 1)
INSERT INTO profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    school_id,
    generation_id,
    community_id
) VALUES (
    'USER_2_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente.test2@fne-lms.test',
    'Docente Prueba 2',
    'Docente Prueba',
    'Dos',
    'SCHOOL_2_ID'::uuid,      -- Reemplazar con Escuela ID real (Query 1.1)
    'GEN_2_ID'::uuid,         -- Reemplazar con Generación ID real (Query 1.1)
    'COM_2_ID'::uuid          -- Reemplazar con Comunidad ID real (Query 1.1)
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    school_id = EXCLUDED.school_id,
    generation_id = EXCLUDED.generation_id,
    community_id = EXCLUDED.community_id;

INSERT INTO user_roles (
    user_id,
    role_type,
    school_id,
    generation_id,
    community_id,
    is_active,
    assigned_at,
    assigned_by
) VALUES (
    'USER_2_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente',
    'SCHOOL_2_ID'::uuid,     -- Reemplazar con Escuela ID real
    'GEN_2_ID'::uuid,        -- Reemplazar con Generación ID real
    'COM_2_ID'::uuid,        -- Reemplazar con Comunidad ID real
    true,
    NOW(),
    (SELECT id FROM profiles WHERE email = 'admin@fne-lms.test' LIMIT 1)
)
ON CONFLICT (user_id, role_type, school_id) DO UPDATE SET
    generation_id = EXCLUDED.generation_id,
    community_id = EXCLUDED.community_id,
    is_active = true,
    assigned_at = NOW();


-- Usuario 3: Escuela sin generaciones + Comunidad standalone
INSERT INTO profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    school_id,
    generation_id,
    community_id
) VALUES (
    'USER_3_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente.test3@fne-lms.test',
    'Docente Prueba 3',
    'Docente Prueba',
    'Tres',
    'SCHOOL_3_ID'::uuid,      -- Reemplazar con Escuela ID real (Query 1.2)
    NULL,                     -- Sin generación
    'COM_3_ID'::uuid          -- Reemplazar con Comunidad ID real (Query 1.2)
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    school_id = EXCLUDED.school_id,
    generation_id = NULL,
    community_id = EXCLUDED.community_id;

INSERT INTO user_roles (
    user_id,
    role_type,
    school_id,
    generation_id,
    community_id,
    is_active,
    assigned_at,
    assigned_by
) VALUES (
    'USER_3_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente',
    'SCHOOL_3_ID'::uuid,     -- Reemplazar con Escuela ID real
    NULL,                    -- Sin generación
    'COM_3_ID'::uuid,        -- Reemplazar con Comunidad ID real
    true,
    NOW(),
    (SELECT id FROM profiles WHERE email = 'admin@fne-lms.test' LIMIT 1)
)
ON CONFLICT (user_id, role_type, school_id) DO UPDATE SET
    generation_id = NULL,
    community_id = EXCLUDED.community_id,
    is_active = true,
    assigned_at = NOW();


-- Usuario 4: Escuela con generaciones + Sin comunidad
INSERT INTO profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    school_id,
    generation_id,
    community_id
) VALUES (
    'USER_4_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente.test4@fne-lms.test',
    'Docente Prueba 4',
    'Docente Prueba',
    'Cuatro',
    'SCHOOL_4_ID'::uuid,      -- Reemplazar con Escuela ID real (Query 1.3)
    'GEN_4_ID'::uuid,         -- Reemplazar con Generación ID real (Query 1.3)
    NULL                      -- Sin comunidad
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    school_id = EXCLUDED.school_id,
    generation_id = EXCLUDED.generation_id,
    community_id = NULL;

INSERT INTO user_roles (
    user_id,
    role_type,
    school_id,
    generation_id,
    community_id,
    is_active,
    assigned_at,
    assigned_by
) VALUES (
    'USER_4_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente',
    'SCHOOL_4_ID'::uuid,     -- Reemplazar con Escuela ID real
    'GEN_4_ID'::uuid,        -- Reemplazar con Generación ID real
    NULL,                    -- Sin comunidad
    true,
    NOW(),
    (SELECT id FROM profiles WHERE email = 'admin@fne-lms.test' LIMIT 1)
)
ON CONFLICT (user_id, role_type, school_id) DO UPDATE SET
    generation_id = EXCLUDED.generation_id,
    community_id = NULL,
    is_active = true,
    assigned_at = NOW();


-- Usuario 5: Escuela sin generaciones + Sin comunidad
INSERT INTO profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    school_id,
    generation_id,
    community_id
) VALUES (
    'USER_5_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente.test5@fne-lms.test',
    'Docente Prueba 5',
    'Docente Prueba',
    'Cinco',
    'SCHOOL_5_ID'::uuid,      -- Reemplazar con Escuela ID real (Query 1.4)
    NULL,                     -- Sin generación
    NULL                      -- Sin comunidad
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    school_id = EXCLUDED.school_id,
    generation_id = NULL,
    community_id = NULL;

INSERT INTO user_roles (
    user_id,
    role_type,
    school_id,
    generation_id,
    community_id,
    is_active,
    assigned_at,
    assigned_by
) VALUES (
    'USER_5_AUTH_ID'::uuid,  -- Reemplazar con Auth User ID real
    'docente',
    'SCHOOL_5_ID'::uuid,     -- Reemplazar con Escuela ID real
    NULL,                    -- Sin generación
    NULL,                    -- Sin comunidad
    true,
    NOW(),
    (SELECT id FROM profiles WHERE email = 'admin@fne-lms.test' LIMIT 1)
)
ON CONFLICT (user_id, role_type, school_id) DO UPDATE SET
    generation_id = NULL,
    community_id = NULL,
    is_active = true,
    assigned_at = NOW();

*/


-- ============================================
-- SECCIÓN 4: VERIFICACIÓN DE USUARIOS CREADOS
-- ============================================

-- Query 4.1: Verificar que los 5 usuarios existen en profiles
SELECT
    p.id as user_id,
    p.email,
    p.name,
    p.first_name,
    p.last_name,
    s.name as escuela,
    g.name as generacion,
    gc.name as comunidad,
    p.created_at
FROM profiles p
LEFT JOIN schools s ON s.id = p.school_id
LEFT JOIN generations g ON g.id = p.generation_id
LEFT JOIN growth_communities gc ON gc.id = p.community_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;

-- Esperado: 5 filas con los usuarios creados


-- Query 4.2: Verificar roles asignados en user_roles
SELECT
    ur.user_id,
    p.email,
    ur.role_type,
    s.name as escuela,
    g.name as generacion,
    gc.name as comunidad,
    ur.is_active,
    ur.assigned_at
FROM user_roles ur
JOIN profiles p ON p.id = ur.user_id
LEFT JOIN schools s ON s.id = ur.school_id
LEFT JOIN generations g ON g.id = ur.generation_id
LEFT JOIN growth_communities gc ON gc.id = ur.community_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;

-- Esperado: 5 filas con role_type = 'docente'


-- Query 4.3: Verificar configuraciones organizacionales específicas
SELECT
    p.email,
    CASE
        WHEN p.generation_id IS NOT NULL AND p.community_id IS NOT NULL THEN '✓ Con Generación + Con Comunidad'
        WHEN p.generation_id IS NOT NULL AND p.community_id IS NULL THEN '✓ Con Generación + Sin Comunidad'
        WHEN p.generation_id IS NULL AND p.community_id IS NOT NULL THEN '✓ Sin Generación + Con Comunidad'
        WHEN p.generation_id IS NULL AND p.community_id IS NULL THEN '✓ Sin Generación + Sin Comunidad'
    END as configuracion,
    s.has_generations as escuela_usa_generaciones
FROM profiles p
JOIN schools s ON s.id = p.school_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
ORDER BY p.email;

-- Esperado:
-- Usuario 1: ✓ Con Generación + Con Comunidad
-- Usuario 2: ✓ Con Generación + Con Comunidad
-- Usuario 3: ✓ Sin Generación + Con Comunidad
-- Usuario 4: ✓ Con Generación + Sin Comunidad
-- Usuario 5: ✓ Sin Generación + Sin Comunidad


-- Query 4.4: Resumen de usuarios creados
SELECT
    COUNT(*) as total_usuarios_creados,
    COUNT(*) FILTER (WHERE p.generation_id IS NOT NULL) as con_generacion,
    COUNT(*) FILTER (WHERE p.generation_id IS NULL) as sin_generacion,
    COUNT(*) FILTER (WHERE p.community_id IS NOT NULL) as con_comunidad,
    COUNT(*) FILTER (WHERE p.community_id IS NULL) as sin_comunidad
FROM profiles p
WHERE p.email LIKE 'docente.test%@fne-lms.test';

-- Esperado:
-- total_usuarios_creados = 5
-- con_generacion = 3
-- sin_generacion = 2
-- con_comunidad = 3
-- sin_comunidad = 2


-- ============================================
-- CONCLUSIÓN
-- ============================================

-- Si todas las verificaciones son exitosas, puedes proceder a:
-- SIGUIENTE PASO: Ejecutar 02-assign-courses-to-docentes.sql

-- Si algún usuario no aparece o tiene datos incorrectos:
-- 1. Verificar que el usuario fue creado en Supabase Auth
-- 2. Verificar que los IDs usados en SECCIÓN 3 son correctos
-- 3. Re-ejecutar las inserciones con los IDs corregidos

-- ============================================
-- FIN DEL SCRIPT DE CREACIÓN DE USUARIOS
-- ============================================
