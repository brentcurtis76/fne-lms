-- ========================================================================
-- SQL PARA CREAR USUARIOS DE PRUEBA QA
-- Roles: Líder de Generación, Líder de Comunidad
-- ========================================================================
--
-- INSTRUCCIONES:
-- 1. Ejecutar este script en el SQL Editor de Supabase
-- 2. ANTES de ejecutar, verificar los IDs de escuela y generación (líneas 25-28)
-- 3. Los usuarios se crean con contraseña: Prueba2025!
--
-- ========================================================================

-- ========================================================================
-- PASO 0: VERIFICAR DATOS EXISTENTES (ejecutar primero para obtener IDs)
-- ========================================================================

-- Descomentar y ejecutar estas queries para obtener los IDs necesarios:

-- Ver escuelas disponibles:
-- SELECT id, name, has_generations FROM schools ORDER BY name;

-- Ver generaciones disponibles:
-- SELECT g.id, g.name, g.school_id, s.name as school_name
-- FROM generations g
-- JOIN schools s ON g.school_id = s.id
-- ORDER BY s.name, g.name;

-- Ver comunidades existentes:
-- SELECT id, name, school_id, generation_id FROM growth_communities ORDER BY name;

-- ========================================================================
-- PASO 1: CONFIGURAR VARIABLES (EDITAR ESTOS VALORES)
-- ========================================================================

-- IMPORTANTE: Reemplazar estos valores con los IDs reales de tu base de datos
-- Puedes obtenerlos ejecutando las queries del PASO 0

DO $$
DECLARE
    -- === CONFIGURACIÓN - EDITAR ESTOS VALORES ===
    v_school_id INTEGER := 19;  -- ID de la escuela (Fundación Nueva Educación)
    v_generation_1_id UUID := '47717894-e38d-4c2c-a68d-97fd7ab41a3f';  -- Generación Tractor
    v_generation_2_id UUID := 'ecf27811-12d0-4de6-a4f1-8290fa286f0b';  -- Generación Innova
    v_existing_community_id UUID := NULL;  -- Comunidad existente para lider.gen.test1 (opcional)

    -- === NO MODIFICAR DEBAJO DE ESTA LÍNEA ===
    v_password TEXT := 'Prueba2025!';

    -- IDs de usuarios (se generarán)
    v_user_1_id UUID;
    v_user_2_id UUID;
    v_user_3_id UUID;
    v_user_4_id UUID;

    -- IDs de comunidades creadas
    v_community_1_id UUID;
    v_community_2_id UUID;

BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CREANDO USUARIOS DE PRUEBA QA';
    RAISE NOTICE '========================================';

    -- ========================================================================
    -- PASO 2: CREAR USUARIOS EN AUTH.USERS
    -- ========================================================================

    -- Usuario 1: lider.gen.test1@fne-lms.test (Líder de Generación CON comunidad)
    RAISE NOTICE 'Creando usuario: lider.gen.test1@fne-lms.test';

    -- Verificar si ya existe
    SELECT id INTO v_user_1_id FROM auth.users WHERE email = 'lider.gen.test1@fne-lms.test';

    IF v_user_1_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            'lider.gen.test1@fne-lms.test',
            crypt(v_password, gen_salt('bf')),
            NOW(),
            '{"role": "lider_generacion"}'::jsonb,
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        ) RETURNING id INTO v_user_1_id;

        -- Crear identidad
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            v_user_1_id,
            jsonb_build_object('sub', v_user_1_id::text, 'email', 'lider.gen.test1@fne-lms.test'),
            'email',
            v_user_1_id::text,
            NOW(),
            NOW(),
            NOW()
        );

        RAISE NOTICE '  ✓ Usuario auth creado: %', v_user_1_id;
    ELSE
        RAISE NOTICE '  ⚠ Usuario ya existe: %', v_user_1_id;
    END IF;

    -- Usuario 2: lider.gen.test2@fne-lms.test (Líder de Generación SIN comunidad)
    RAISE NOTICE 'Creando usuario: lider.gen.test2@fne-lms.test';

    SELECT id INTO v_user_2_id FROM auth.users WHERE email = 'lider.gen.test2@fne-lms.test';

    IF v_user_2_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'lider.gen.test2@fne-lms.test', crypt(v_password, gen_salt('bf')), NOW(),
            '{"role": "lider_generacion"}'::jsonb, NOW(), NOW(), '', '', '', ''
        ) RETURNING id INTO v_user_2_id;

        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (gen_random_uuid(), v_user_2_id, jsonb_build_object('sub', v_user_2_id::text, 'email', 'lider.gen.test2@fne-lms.test'), 'email', v_user_2_id::text, NOW(), NOW(), NOW());

        RAISE NOTICE '  ✓ Usuario auth creado: %', v_user_2_id;
    ELSE
        RAISE NOTICE '  ⚠ Usuario ya existe: %', v_user_2_id;
    END IF;

    -- Usuario 3: lider.com.test1@fne-lms.test (Líder de Comunidad)
    RAISE NOTICE 'Creando usuario: lider.com.test1@fne-lms.test';

    SELECT id INTO v_user_3_id FROM auth.users WHERE email = 'lider.com.test1@fne-lms.test';

    IF v_user_3_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'lider.com.test1@fne-lms.test', crypt(v_password, gen_salt('bf')), NOW(),
            '{"role": "lider_comunidad"}'::jsonb, NOW(), NOW(), '', '', '', ''
        ) RETURNING id INTO v_user_3_id;

        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (gen_random_uuid(), v_user_3_id, jsonb_build_object('sub', v_user_3_id::text, 'email', 'lider.com.test1@fne-lms.test'), 'email', v_user_3_id::text, NOW(), NOW(), NOW());

        RAISE NOTICE '  ✓ Usuario auth creado: %', v_user_3_id;
    ELSE
        RAISE NOTICE '  ⚠ Usuario ya existe: %', v_user_3_id;
    END IF;

    -- Usuario 4: lider.com.test2@fne-lms.test (Líder de Comunidad)
    RAISE NOTICE 'Creando usuario: lider.com.test2@fne-lms.test';

    SELECT id INTO v_user_4_id FROM auth.users WHERE email = 'lider.com.test2@fne-lms.test';

    IF v_user_4_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'lider.com.test2@fne-lms.test', crypt(v_password, gen_salt('bf')), NOW(),
            '{"role": "lider_comunidad"}'::jsonb, NOW(), NOW(), '', '', '', ''
        ) RETURNING id INTO v_user_4_id;

        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (gen_random_uuid(), v_user_4_id, jsonb_build_object('sub', v_user_4_id::text, 'email', 'lider.com.test2@fne-lms.test'), 'email', v_user_4_id::text, NOW(), NOW(), NOW());

        RAISE NOTICE '  ✓ Usuario auth creado: %', v_user_4_id;
    ELSE
        RAISE NOTICE '  ⚠ Usuario ya existe: %', v_user_4_id;
    END IF;

    -- ========================================================================
    -- PASO 3: ACTUALIZAR PERFILES
    -- ========================================================================

    RAISE NOTICE '';
    RAISE NOTICE 'Actualizando perfiles...';

    -- Esperar a que el trigger cree los perfiles
    PERFORM pg_sleep(0.5);

    -- Actualizar perfil Usuario 1
    UPDATE profiles SET
        first_name = 'Líder',
        last_name = 'Generación Test 1',
        name = 'Líder Generación Test 1',
        email = 'lider.gen.test1@fne-lms.test',
        school_id = v_school_id,
        approval_status = 'approved',
        must_change_password = false
    WHERE id = v_user_1_id;

    -- Actualizar perfil Usuario 2
    UPDATE profiles SET
        first_name = 'Líder',
        last_name = 'Generación Test 2',
        name = 'Líder Generación Test 2',
        email = 'lider.gen.test2@fne-lms.test',
        school_id = v_school_id,
        approval_status = 'approved',
        must_change_password = false
    WHERE id = v_user_2_id;

    -- Actualizar perfil Usuario 3
    UPDATE profiles SET
        first_name = 'Líder',
        last_name = 'Comunidad Test 1',
        name = 'Líder Comunidad Test 1',
        email = 'lider.com.test1@fne-lms.test',
        school_id = v_school_id,
        approval_status = 'approved',
        must_change_password = false
    WHERE id = v_user_3_id;

    -- Actualizar perfil Usuario 4
    UPDATE profiles SET
        first_name = 'Líder',
        last_name = 'Comunidad Test 2',
        name = 'Líder Comunidad Test 2',
        email = 'lider.com.test2@fne-lms.test',
        school_id = v_school_id,
        approval_status = 'approved',
        must_change_password = false
    WHERE id = v_user_4_id;

    RAISE NOTICE '  ✓ Perfiles actualizados';

    -- ========================================================================
    -- PASO 4: CREAR COMUNIDADES PARA LÍDERES DE COMUNIDAD
    -- ========================================================================

    RAISE NOTICE '';
    RAISE NOTICE 'Creando comunidades...';

    -- Comunidad para Usuario 3 (Líder Comunidad Test 1)
    SELECT id INTO v_community_1_id FROM growth_communities WHERE name = 'Comunidad Líder Comunidad Test 1';

    IF v_community_1_id IS NULL THEN
        INSERT INTO growth_communities (name, school_id, generation_id)
        VALUES ('Comunidad Líder Comunidad Test 1', v_school_id, v_generation_1_id)
        RETURNING id INTO v_community_1_id;
        RAISE NOTICE '  ✓ Comunidad creada: Comunidad Líder Comunidad Test 1';
    ELSE
        RAISE NOTICE '  ⚠ Comunidad ya existe: Comunidad Líder Comunidad Test 1';
    END IF;

    -- Comunidad para Usuario 4 (Líder Comunidad Test 2)
    SELECT id INTO v_community_2_id FROM growth_communities WHERE name = 'Comunidad Líder Comunidad Test 2';

    IF v_community_2_id IS NULL THEN
        INSERT INTO growth_communities (name, school_id, generation_id)
        VALUES ('Comunidad Líder Comunidad Test 2', v_school_id, v_generation_1_id)
        RETURNING id INTO v_community_2_id;
        RAISE NOTICE '  ✓ Comunidad creada: Comunidad Líder Comunidad Test 2';
    ELSE
        RAISE NOTICE '  ⚠ Comunidad ya existe: Comunidad Líder Comunidad Test 2';
    END IF;

    -- Buscar comunidad existente para Usuario 1 si no se especificó
    IF v_existing_community_id IS NULL THEN
        SELECT id INTO v_existing_community_id
        FROM growth_communities
        WHERE school_id = v_school_id
        AND id != v_community_1_id
        AND id != v_community_2_id
        LIMIT 1;
    END IF;

    -- ========================================================================
    -- PASO 5: ELIMINAR ROLES ANTERIORES Y ASIGNAR NUEVOS
    -- ========================================================================

    RAISE NOTICE '';
    RAISE NOTICE 'Asignando roles...';

    -- Eliminar roles anteriores de estos usuarios de prueba
    DELETE FROM user_roles WHERE user_id IN (v_user_1_id, v_user_2_id, v_user_3_id, v_user_4_id);

    -- Rol Usuario 1: lider_generacion CON comunidad (Generación 1)
    INSERT INTO user_roles (user_id, role_type, school_id, generation_id, community_id, is_active)
    VALUES (v_user_1_id, 'lider_generacion', v_school_id, v_generation_1_id, v_existing_community_id, true);
    RAISE NOTICE '  ✓ Rol asignado: lider.gen.test1 -> lider_generacion (Gen 1, CON comunidad)';

    -- Rol Usuario 2: lider_generacion SIN comunidad (Generación 2)
    INSERT INTO user_roles (user_id, role_type, school_id, generation_id, community_id, is_active)
    VALUES (v_user_2_id, 'lider_generacion', v_school_id, v_generation_2_id, NULL, true);
    RAISE NOTICE '  ✓ Rol asignado: lider.gen.test2 -> lider_generacion (Gen 2, SIN comunidad)';

    -- Rol Usuario 3: lider_comunidad (Comunidad auto-creada 1)
    INSERT INTO user_roles (user_id, role_type, school_id, generation_id, community_id, is_active)
    VALUES (v_user_3_id, 'lider_comunidad', v_school_id, v_generation_1_id, v_community_1_id, true);
    RAISE NOTICE '  ✓ Rol asignado: lider.com.test1 -> lider_comunidad';

    -- Rol Usuario 4: lider_comunidad (Comunidad auto-creada 2)
    INSERT INTO user_roles (user_id, role_type, school_id, generation_id, community_id, is_active)
    VALUES (v_user_4_id, 'lider_comunidad', v_school_id, v_generation_1_id, v_community_2_id, true);
    RAISE NOTICE '  ✓ Rol asignado: lider.com.test2 -> lider_comunidad';

    -- ========================================================================
    -- RESUMEN
    -- ========================================================================

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RESUMEN - USUARIOS CREADOS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '🔵 LÍDER DE GENERACIÓN:';
    RAISE NOTICE '   Email: lider.gen.test1@fne-lms.test';
    RAISE NOTICE '   Contraseña: Prueba2025!';
    RAISE NOTICE '   Generación: Tractor';
    RAISE NOTICE '   Comunidad: SÍ (para Espacio Colaborativo)';
    RAISE NOTICE '';
    RAISE NOTICE '   Email: lider.gen.test2@fne-lms.test';
    RAISE NOTICE '   Contraseña: Prueba2025!';
    RAISE NOTICE '   Generación: Innova';
    RAISE NOTICE '   Comunidad: NO';
    RAISE NOTICE '';
    RAISE NOTICE '🟢 LÍDER DE COMUNIDAD:';
    RAISE NOTICE '   Email: lider.com.test1@fne-lms.test';
    RAISE NOTICE '   Contraseña: Prueba2025!';
    RAISE NOTICE '   Comunidad: Comunidad Líder Comunidad Test 1';
    RAISE NOTICE '';
    RAISE NOTICE '   Email: lider.com.test2@fne-lms.test';
    RAISE NOTICE '   Contraseña: Prueba2025!';
    RAISE NOTICE '   Comunidad: Comunidad Líder Comunidad Test 2';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Script completado exitosamente';
    RAISE NOTICE '========================================';

END $$;

-- ========================================================================
-- VERIFICACIÓN (ejecutar después para confirmar)
-- ========================================================================

-- Ver usuarios creados:
SELECT
    p.email,
    p.name,
    ur.role_type,
    s.name as school,
    g.name as generation,
    gc.name as community
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
LEFT JOIN schools s ON ur.school_id = s.id
LEFT JOIN generations g ON ur.generation_id = g.id
LEFT JOIN growth_communities gc ON ur.community_id = gc.id
WHERE p.email LIKE '%test%@fne-lms.test'
ORDER BY p.email;
