-- ============================================================
-- QA Seed Script for Assessment Builder
-- ============================================================
-- This script creates test data with TEST_QA_ prefix for E2E testing.
-- Run AFTER qa-cleanup.sql to ensure clean state.
--
-- IMPORTANT: Test users must be created via API (see qa-seed-users.js)
-- This script assumes test users already exist in auth.users.
--
-- Test Users Expected (create via qa-seed-users.js first):
-- - test_qa_admin@test.com (admin role)
-- - test_qa_directivo@test.com (directivo role)
-- - test_qa_docente@test.com (docente role)
--
-- Usage: Execute in Supabase SQL Editor or via psql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Create test school (or use existing one from qa-seed-users.js)
-- ============================================================
INSERT INTO schools (name, has_generations)
VALUES (
  'TEST_QA_School',
  false
)
ON CONFLICT DO NOTHING;

-- Get the school ID for subsequent inserts
DO $$
DECLARE
  v_school_id INTEGER;
  v_admin_id UUID;
  v_directivo_id UUID;
  v_docente_id UUID;
  v_template_id UUID;
  v_module_id UUID;
  v_indicator_cobertura_id UUID;
  v_indicator_frecuencia_id UUID;
  v_indicator_profundidad_id UUID;
  v_context_id UUID;
  v_course_structure_id UUID;
  v_snapshot_id UUID;
BEGIN
  -- Get school ID
  SELECT id INTO v_school_id FROM schools WHERE name = 'TEST_QA_School';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create/find TEST_QA_School';
  END IF;

  RAISE NOTICE 'Using school ID: %', v_school_id;

  -- Get test user IDs (they should already exist from qa-seed-users.js)
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'test_qa_admin@test.com';
  SELECT id INTO v_directivo_id FROM auth.users WHERE email = 'test_qa_directivo@test.com';
  SELECT id INTO v_docente_id FROM auth.users WHERE email = 'test_qa_docente@test.com';

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'Admin user not found - run qa-seed-users.js first';
  END IF;

  IF v_directivo_id IS NULL THEN
    RAISE NOTICE 'Directivo user not found - run qa-seed-users.js first';
  END IF;

  IF v_docente_id IS NULL THEN
    RAISE NOTICE 'Docente user not found - run qa-seed-users.js first';
  END IF;

  -- ============================================================
  -- 2. Create test template (as draft initially)
  -- ============================================================
  INSERT INTO assessment_templates (
    id,
    area,
    version,
    name,
    description,
    status,
    scoring_config,
    created_by,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    'personalizacion',
    '1.0.0',
    'TEST_QA_Template_Personalizacion',
    'Template de prueba para E2E tests del Assessment Builder',
    'draft',
    '{"level_thresholds":{"consolidated":87.5,"advanced":62.5,"developing":37.5,"emerging":12.5},"default_weights":{"module":1.0,"indicator":1.0}}'::jsonb,
    v_admin_id,
    NOW()
  )
  ON CONFLICT (area, version) DO NOTHING
  RETURNING id INTO v_template_id;

  -- If template already existed, get its ID
  IF v_template_id IS NULL THEN
    SELECT id INTO v_template_id FROM assessment_templates WHERE name = 'TEST_QA_Template_Personalizacion';
  END IF;

  RAISE NOTICE 'Using template ID: %', v_template_id;

  -- ============================================================
  -- 3. Create test module
  -- ============================================================
  INSERT INTO assessment_modules (
    id,
    template_id,
    name,
    description,
    instructions,
    display_order,
    weight,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_template_id,
    'TEST_QA_Modulo_Principal',
    'Modulo de prueba con indicadores de los tres tipos',
    'Complete todos los indicadores para evaluar el nivel de personalización',
    1,
    1.0,
    NOW()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_module_id;

  -- If module already existed, get its ID
  IF v_module_id IS NULL THEN
    SELECT id INTO v_module_id FROM assessment_modules
    WHERE template_id = v_template_id AND name = 'TEST_QA_Modulo_Principal';
  END IF;

  RAISE NOTICE 'Using module ID: %', v_module_id;

  -- ============================================================
  -- 4. Create test indicators (one of each type)
  -- ============================================================

  -- Cobertura indicator (Yes/No)
  INSERT INTO assessment_indicators (
    id,
    module_id,
    code,
    name,
    description,
    category,
    display_order,
    weight,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_module_id,
    'TEST_QA_COB_001',
    'TEST_QA_Indicador_Cobertura',
    'Indicador de prueba tipo cobertura (Sí/No): ¿Existe una política de personalización?',
    'cobertura',
    1,
    1.0,
    NOW()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_indicator_cobertura_id;

  IF v_indicator_cobertura_id IS NULL THEN
    SELECT id INTO v_indicator_cobertura_id FROM assessment_indicators
    WHERE code = 'TEST_QA_COB_001';
  END IF;

  -- Frecuencia indicator (Numeric)
  INSERT INTO assessment_indicators (
    id,
    module_id,
    code,
    name,
    description,
    category,
    frequency_config,
    display_order,
    weight,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_module_id,
    'TEST_QA_FRE_001',
    'TEST_QA_Indicador_Frecuencia',
    'Indicador de prueba tipo frecuencia: ¿Cuántas veces por semestre se realizan evaluaciones personalizadas?',
    'frecuencia',
    '{"unit": "veces por semestre", "min": 0, "max": 20}'::jsonb,
    2,
    1.0,
    NOW()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_indicator_frecuencia_id;

  IF v_indicator_frecuencia_id IS NULL THEN
    SELECT id INTO v_indicator_frecuencia_id FROM assessment_indicators
    WHERE code = 'TEST_QA_FRE_001';
  END IF;

  -- Profundidad indicator (Levels 0-4)
  INSERT INTO assessment_indicators (
    id,
    module_id,
    code,
    name,
    description,
    category,
    level_0_descriptor,
    level_1_descriptor,
    level_2_descriptor,
    level_3_descriptor,
    level_4_descriptor,
    display_order,
    weight,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_module_id,
    'TEST_QA_PRO_001',
    'TEST_QA_Indicador_Profundidad',
    'Indicador de prueba tipo profundidad: Nivel de madurez en personalización',
    'profundidad',
    'No existe ninguna práctica de personalización',
    'Práctica inicial: Se reconoce la necesidad pero no hay implementación',
    'En desarrollo: Existen iniciativas aisladas sin sistematización',
    'Práctica avanzada: Hay procesos sistematizados con seguimiento',
    'Práctica consolidada: La personalización está integrada en toda la cultura escolar',
    3,
    1.0,
    NOW()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_indicator_profundidad_id;

  IF v_indicator_profundidad_id IS NULL THEN
    SELECT id INTO v_indicator_profundidad_id FROM assessment_indicators
    WHERE code = 'TEST_QA_PRO_001';
  END IF;

  RAISE NOTICE 'Created indicators: COB=%, FRE=%, PRO=%',
    v_indicator_cobertura_id, v_indicator_frecuencia_id, v_indicator_profundidad_id;

  -- ============================================================
  -- 5. Create year expectations for indicators
  -- ============================================================
  INSERT INTO assessment_year_expectations (
    template_id,
    indicator_id,
    year_1_expected,
    year_2_expected,
    year_3_expected,
    year_4_expected,
    year_5_expected,
    tolerance
  )
  VALUES
    (v_template_id, v_indicator_cobertura_id, 1, 2, 3, 3, 4, 1),
    (v_template_id, v_indicator_frecuencia_id, 1, 2, 2, 3, 4, 1),
    (v_template_id, v_indicator_profundidad_id, 1, 2, 2, 3, 4, 1)
  ON CONFLICT (template_id, indicator_id) DO NOTHING;

  -- ============================================================
  -- 6. Publish template and create snapshot
  -- ============================================================
  UPDATE assessment_templates
  SET status = 'published', published_at = NOW(), published_by = v_admin_id
  WHERE id = v_template_id;

  -- Create snapshot with full data
  INSERT INTO assessment_template_snapshots (
    id,
    template_id,
    version,
    snapshot_data,
    created_at,
    created_by
  )
  VALUES (
    gen_random_uuid(),
    v_template_id,
    '1.0.0',
    (
      SELECT jsonb_build_object(
        'template', jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'area', t.area,
          'version', t.version,
          'description', t.description,
          'scoring_config', t.scoring_config
        ),
        'modules', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'name', m.name,
              'description', m.description,
              'instructions', m.instructions,
              'display_order', m.display_order,
              'weight', m.weight,
              'indicators', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', i.id,
                    'code', i.code,
                    'name', i.name,
                    'description', i.description,
                    'category', i.category,
                    'frequency_config', i.frequency_config,
                    'level_0_descriptor', i.level_0_descriptor,
                    'level_1_descriptor', i.level_1_descriptor,
                    'level_2_descriptor', i.level_2_descriptor,
                    'level_3_descriptor', i.level_3_descriptor,
                    'level_4_descriptor', i.level_4_descriptor,
                    'display_order', i.display_order,
                    'weight', i.weight
                  ) ORDER BY i.display_order
                )
                FROM assessment_indicators i
                WHERE i.module_id = m.id
              ), '[]'::jsonb)
            ) ORDER BY m.display_order
          )
          FROM assessment_modules m
          WHERE m.template_id = t.id
        ), '[]'::jsonb),
        'expectations', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'indicator_id', e.indicator_id,
              'year_1_expected', e.year_1_expected,
              'year_2_expected', e.year_2_expected,
              'year_3_expected', e.year_3_expected,
              'year_4_expected', e.year_4_expected,
              'year_5_expected', e.year_5_expected,
              'tolerance', e.tolerance
            )
          )
          FROM assessment_year_expectations e
          WHERE e.template_id = t.id
        ), '[]'::jsonb)
      )
      FROM assessment_templates t
      WHERE t.id = v_template_id
    ),
    NOW(),
    v_admin_id
  )
  ON CONFLICT (template_id, version) DO NOTHING
  RETURNING id INTO v_snapshot_id;

  IF v_snapshot_id IS NULL THEN
    SELECT id INTO v_snapshot_id FROM assessment_template_snapshots
    WHERE template_id = v_template_id AND version = '1.0.0';
  END IF;

  RAISE NOTICE 'Created snapshot ID: %', v_snapshot_id;

  -- ============================================================
  -- 7. Create transversal context for test school
  -- ============================================================
  IF v_directivo_id IS NOT NULL THEN
    INSERT INTO school_transversal_context (
      id,
      school_id,
      total_students,
      grade_levels,
      courses_per_level,
      implementation_year_2026,
      period_system,
      completed_by,
      completed_at,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      v_school_id,
      500,
      ARRAY['7_basico', '8_basico', '1_medio', '2_medio'],
      '{"7_basico": 2, "8_basico": 2, "1_medio": 2, "2_medio": 2}'::jsonb,
      3,  -- Year 3 of transformation
      'semestral',
      v_directivo_id,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_context_id;

    IF v_context_id IS NULL THEN
      SELECT id INTO v_context_id FROM school_transversal_context
      WHERE school_id = v_school_id;
    END IF;

    RAISE NOTICE 'Created context ID: %', v_context_id;

    -- ============================================================
    -- 8. Create course structure for test school
    -- ============================================================
    IF v_context_id IS NOT NULL THEN
      INSERT INTO school_course_structure (
        id,
        school_id,
        context_id,
        grade_level,
        course_name,
        created_at
      )
      VALUES (
        gen_random_uuid(),
        v_school_id,
        v_context_id,
        '7_basico',
        '7A',
        NOW()
      )
      ON CONFLICT (context_id, grade_level, course_name) DO NOTHING
      RETURNING id INTO v_course_structure_id;

      IF v_course_structure_id IS NULL THEN
        SELECT id INTO v_course_structure_id FROM school_course_structure
        WHERE context_id = v_context_id AND grade_level = '7_basico' AND course_name = '7A';
      END IF;

      RAISE NOTICE 'Created course structure ID: %', v_course_structure_id;

      -- ============================================================
      -- 9. Assign docente to course (if docente exists)
      -- ============================================================
      IF v_docente_id IS NOT NULL AND v_course_structure_id IS NOT NULL THEN
        INSERT INTO school_course_docente_assignments (
          course_structure_id,
          docente_id,
          assigned_by,
          assigned_at,
          is_active
        )
        VALUES (
          v_course_structure_id,
          v_docente_id,
          v_directivo_id,
          NOW(),
          true
        )
        ON CONFLICT (course_structure_id, docente_id) DO NOTHING;

        RAISE NOTICE 'Assigned docente % to course %', v_docente_id, v_course_structure_id;

        -- ============================================================
        -- 10. Create assessment instance for docente
        -- ============================================================
        IF v_snapshot_id IS NOT NULL THEN
          DECLARE
            v_instance_id UUID;
          BEGIN
            INSERT INTO assessment_instances (
              id,
              template_snapshot_id,
              school_id,
              course_structure_id,
              transformation_year,
              status,
              assigned_at,
              assigned_by,
              created_at
            )
            VALUES (
              gen_random_uuid(),
              v_snapshot_id,
              v_school_id,
              v_course_structure_id,
              3,  -- Year 3 (matches context)
              'pending',
              NOW(),
              v_directivo_id,
              NOW()
            )
            RETURNING id INTO v_instance_id;

            RAISE NOTICE 'Created instance ID: %', v_instance_id;

            -- Create assignee record
            INSERT INTO assessment_instance_assignees (
              instance_id,
              user_id,
              can_edit,
              can_submit,
              assigned_at,
              assigned_by
            )
            VALUES (
              v_instance_id,
              v_docente_id,
              true,
              true,
              NOW(),
              v_directivo_id
            );

            RAISE NOTICE 'Created assignee for docente %', v_docente_id;
          END;
        END IF;
      END IF;
    END IF;
  ELSE
    RAISE NOTICE 'Skipping context/course/instance creation - directivo user not found';
  END IF;

  RAISE NOTICE '✅ QA seed script completed successfully!';
END;
$$;

COMMIT;

-- ============================================================
-- Verification: Show seeded data
-- ============================================================
SELECT 'Schools' as entity, COUNT(*) as count FROM schools WHERE name LIKE 'TEST_QA_%'
UNION ALL
SELECT 'Templates', COUNT(*) FROM assessment_templates WHERE name LIKE 'TEST_QA_%'
UNION ALL
SELECT 'Modules', COUNT(*) FROM assessment_modules am
  JOIN assessment_templates at ON am.template_id = at.id WHERE at.name LIKE 'TEST_QA_%'
UNION ALL
SELECT 'Indicators', COUNT(*) FROM assessment_indicators ai
  JOIN assessment_modules am ON ai.module_id = am.id
  JOIN assessment_templates at ON am.template_id = at.id WHERE at.name LIKE 'TEST_QA_%'
UNION ALL
SELECT 'Snapshots', COUNT(*) FROM assessment_template_snapshots ats
  JOIN assessment_templates at ON ats.template_id = at.id WHERE at.name LIKE 'TEST_QA_%'
UNION ALL
SELECT 'Contexts', COUNT(*) FROM school_transversal_context stc
  JOIN schools s ON stc.school_id = s.id WHERE s.name LIKE 'TEST_QA_%'
UNION ALL
SELECT 'Instances', COUNT(*) FROM assessment_instances ai
  JOIN schools s ON ai.school_id = s.id WHERE s.name LIKE 'TEST_QA_%';
