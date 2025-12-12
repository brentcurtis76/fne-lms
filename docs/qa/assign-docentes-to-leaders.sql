-- ========================================================================
-- SQL PARA ASIGNAR DOCENTES A GENERACIONES/COMUNIDADES DE LÍDERES QA
-- ========================================================================
--
-- Este script asigna docentes existentes (o crea nuevos) para que cada
-- líder de prueba tenga usuarios visibles en sus reportes.
--
-- ========================================================================

-- ========================================================================
-- PASO 0: VERIFICAR CONFIGURACIÓN ACTUAL
-- ========================================================================

-- Ver líderes de prueba y sus ámbitos:
-- SELECT p.email, ur.role_type, ur.generation_id, ur.community_id, g.name as gen_name, gc.name as com_name
-- FROM profiles p
-- JOIN user_roles ur ON p.id = ur.user_id
-- LEFT JOIN generations g ON ur.generation_id = g.id
-- LEFT JOIN growth_communities gc ON ur.community_id = gc.id
-- WHERE p.email LIKE 'lider.%@fne-lms.test';

-- ========================================================================
-- CONFIGURACIÓN
-- ========================================================================

DO $$
DECLARE
    -- Escuela y Generaciones (FNE)
    v_school_id INTEGER := 19;
    v_generation_tractor UUID := '47717894-e38d-4c2c-a68d-97fd7ab41a3f';
    v_generation_innova UUID := 'ecf27811-12d0-4de6-a4f1-8290fa286f0b';

    -- Comunidades de los líderes de comunidad
    v_community_lider_1 UUID;
    v_community_lider_2 UUID;

    -- IDs de docentes de prueba
    v_docente_1_id UUID;
    v_docente_2_id UUID;
    v_docente_3_id UUID;
    v_docente_4_id UUID;
    v_docente_5_id UUID;
    v_docente_6_id UUID;

BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ASIGNANDO DOCENTES A LÍDERES QA';
    RAISE NOTICE '========================================';

    -- Obtener IDs de las comunidades de los líderes
    SELECT gc.id INTO v_community_lider_1
    FROM growth_communities gc
    WHERE gc.name = 'Comunidad Líder Comunidad Test 1';

    SELECT gc.id INTO v_community_lider_2
    FROM growth_communities gc
    WHERE gc.name = 'Comunidad Líder Comunidad Test 2';

    RAISE NOTICE 'Comunidad Líder 1: %', v_community_lider_1;
    RAISE NOTICE 'Comunidad Líder 2: %', v_community_lider_2;

    -- ========================================================================
    -- OPCIÓN A: REASIGNAR DOCENTES EXISTENTES
    -- ========================================================================

    RAISE NOTICE '';
    RAISE NOTICE 'Reasignando docentes existentes...';

    -- Obtener IDs de docentes de prueba existentes
    SELECT id INTO v_docente_1_id FROM profiles WHERE email = 'docente.test1@fne-lms.test';
    SELECT id INTO v_docente_2_id FROM profiles WHERE email = 'docente.test2@fne-lms.test';
    SELECT id INTO v_docente_3_id FROM profiles WHERE email = 'docente.test3@fne-lms.test';
    SELECT id INTO v_docente_4_id FROM profiles WHERE email = 'docente.test4@fne-lms.test';
    SELECT id INTO v_docente_5_id FROM profiles WHERE email = 'docente.test5@fne-lms.test';

    -- Actualizar docente.test1 -> FNE, Tractor, Comunidad Líder 1
    IF v_docente_1_id IS NOT NULL THEN
        UPDATE profiles SET school_id = v_school_id WHERE id = v_docente_1_id;
        UPDATE user_roles SET
            school_id = v_school_id,
            generation_id = v_generation_tractor,
            community_id = v_community_lider_1
        WHERE user_id = v_docente_1_id AND role_type = 'docente';
        RAISE NOTICE '  ✓ docente.test1 -> FNE, Tractor, Comunidad Líder 1';
    END IF;

    -- Actualizar docente.test2 -> FNE, Tractor, Comunidad Líder 1
    IF v_docente_2_id IS NOT NULL THEN
        UPDATE profiles SET school_id = v_school_id WHERE id = v_docente_2_id;
        UPDATE user_roles SET
            school_id = v_school_id,
            generation_id = v_generation_tractor,
            community_id = v_community_lider_1
        WHERE user_id = v_docente_2_id AND role_type = 'docente';
        RAISE NOTICE '  ✓ docente.test2 -> FNE, Tractor, Comunidad Líder 1';
    END IF;

    -- Actualizar docente.test3 -> FNE, Tractor, Comunidad Líder 2
    IF v_docente_3_id IS NOT NULL THEN
        UPDATE profiles SET school_id = v_school_id WHERE id = v_docente_3_id;
        UPDATE user_roles SET
            school_id = v_school_id,
            generation_id = v_generation_tractor,
            community_id = v_community_lider_2
        WHERE user_id = v_docente_3_id AND role_type = 'docente';
        RAISE NOTICE '  ✓ docente.test3 -> FNE, Tractor, Comunidad Líder 2';
    END IF;

    -- Actualizar docente.test4 -> FNE, Innova, Comunidad Líder 2
    IF v_docente_4_id IS NOT NULL THEN
        UPDATE profiles SET school_id = v_school_id WHERE id = v_docente_4_id;
        UPDATE user_roles SET
            school_id = v_school_id,
            generation_id = v_generation_innova,
            community_id = v_community_lider_2
        WHERE user_id = v_docente_4_id AND role_type = 'docente';
        RAISE NOTICE '  ✓ docente.test4 -> FNE, Innova, Comunidad Líder 2';
    END IF;

    -- Actualizar docente.test5 -> FNE, Innova, sin comunidad
    IF v_docente_5_id IS NOT NULL THEN
        UPDATE profiles SET school_id = v_school_id WHERE id = v_docente_5_id;
        UPDATE user_roles SET
            school_id = v_school_id,
            generation_id = v_generation_innova,
            community_id = NULL
        WHERE user_id = v_docente_5_id AND role_type = 'docente';
        RAISE NOTICE '  ✓ docente.test5 -> FNE, Innova, sin comunidad';
    END IF;

    -- ========================================================================
    -- RESUMEN
    -- ========================================================================

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RESUMEN DE ASIGNACIONES';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '🔵 LÍDER GENERACIÓN TEST 1 (Tractor) verá:';
    RAISE NOTICE '   - docente.test1';
    RAISE NOTICE '   - docente.test2';
    RAISE NOTICE '   - docente.test3';
    RAISE NOTICE '';
    RAISE NOTICE '🔵 LÍDER GENERACIÓN TEST 2 (Innova) verá:';
    RAISE NOTICE '   - docente.test4';
    RAISE NOTICE '   - docente.test5';
    RAISE NOTICE '';
    RAISE NOTICE '🟢 LÍDER COMUNIDAD TEST 1 verá:';
    RAISE NOTICE '   - docente.test1';
    RAISE NOTICE '   - docente.test2';
    RAISE NOTICE '';
    RAISE NOTICE '🟢 LÍDER COMUNIDAD TEST 2 verá:';
    RAISE NOTICE '   - docente.test3';
    RAISE NOTICE '   - docente.test4';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Asignaciones completadas';
    RAISE NOTICE '========================================';

END $$;

-- ========================================================================
-- VERIFICACIÓN
-- ========================================================================

-- Ver docentes de prueba y sus asignaciones:
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
WHERE p.email LIKE 'docente.test%@fne-lms.test'
   OR p.email LIKE 'lider.%@fne-lms.test'
ORDER BY p.email;
