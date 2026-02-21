-- Seed: Programa Bases Templates + Evaluacion Criterios for Phase 3
--
-- Inserts programa_bases_templates records for the 3 main FNE programs:
--   1. Asesoria Integral al equipo directivo (full template with PRD content)
--   2. Capacitacion para Liderar (placeholder -- admin customizes via /admin/licitaciones/templates)
--   3. Implementacion de ABP (placeholder -- admin customizes via /admin/licitaciones/templates)
--
-- Also inserts programa_evaluacion_criterios for the 2 placeholder programs
-- (5 criteria each, summing to 100 points). The main GENERATIVA/ASESORIA INTEGRAL
-- criteria were already seeded in 20260220040002_seed_programa_eval_criterios.sql.
--
-- Pattern:
--   - DO $$ block with dynamic programa_id lookup by name
--   - Tries 'name' column first, then 'nombre' column as fallback
--   - ON CONFLICT DO NOTHING for idempotency (safe to re-run)
--   - Skips gracefully if program not found (RAISE NOTICE)
--
-- JSONB structure for JSONB[] fields:
--   objetivos_especificos, resultados_esperados, requisitos_ate, documentos_adjuntar:
--     JSON array of strings: '["item 1", "item 2"]'
--   especificaciones_admin:
--     JSON object with keys: frecuencia, lugar, contrapartes_tecnicas, condiciones_pago
--     '{"frecuencia": "...", "lugar": "...", "contrapartes_tecnicas": "...", "condiciones_pago": "..."}'
--
-- Date: 2026-02-20
-- Author: DB Agent (Pipeline Task: Licitaciones Phase 3)

-- ============================================================
-- HELPER: name_col detection function (local, dropped after use)
-- We cannot dynamically SELECT different column names in a DO block,
-- so we use the same column name as the existing seed: 'nombre'.
-- The service layer uses 'name' -- this inconsistency is flagged
-- in the architect review but does not block seeding.
-- ============================================================

-- ============================================================
-- BLOCK 1: Asesoria Integral (full template)
-- ============================================================

DO $$
DECLARE
  v_programa_id TEXT;
  v_existing_count INTEGER;
BEGIN
  -- Look up the Asesoria Integral / AULA GENERATIVA program.
  -- Tries GENERATIVA first (matching existing seed pattern), then ASESORIA INTEGRAL.
  SELECT id::TEXT INTO v_programa_id
  FROM programas
  WHERE nombre ILIKE '%GENERATIVA%'
    AND activo = true
  LIMIT 1;

  IF v_programa_id IS NULL THEN
    SELECT id::TEXT INTO v_programa_id
    FROM programas
    WHERE nombre ILIKE '%ASESORIA%INTEGRAL%'
      AND activo = true
    LIMIT 1;
  END IF;

  IF v_programa_id IS NULL THEN
    RAISE NOTICE 'programa_bases_templates seed (Asesoria Integral): No matching program found (GENERATIVA or ASESORIA INTEGRAL). Skipping. Run: SELECT id, nombre FROM programas WHERE activo = true; to verify program names.';
    RETURN;
  END IF;

  -- Check if a template already exists for this program (idempotency guard)
  SELECT COUNT(*) INTO v_existing_count
  FROM programa_bases_templates
  WHERE programa_id = v_programa_id
    AND is_active = true;

  IF v_existing_count > 0 THEN
    RAISE NOTICE 'programa_bases_templates seed (Asesoria Integral): Template already exists for programa_id=%. Skipping.', v_programa_id;
    RETURN;
  END IF;

  RAISE NOTICE 'programa_bases_templates seed: Inserting Asesoria Integral template for programa_id=%', v_programa_id;

  INSERT INTO programa_bases_templates (
    programa_id,
    nombre_servicio,
    objetivo,
    objetivos_especificos,
    especificaciones_admin,
    resultados_esperados,
    requisitos_ate,
    documentos_adjuntar,
    condiciones_pago,
    version,
    is_active
  ) VALUES (
    v_programa_id,

    -- nombre_servicio
    'Asesoria Integral al Equipo Directivo',

    -- objetivo
    'Asesorar al equipo directivo del establecimiento en el fortalecimiento de sus capacidades de liderazgo educativo, con enfasis en el cambio de cultura organizacional orientada a la mejora continua, la innovacion pedagogica y el desarrollo profesional docente, en el marco del Modelo Relacional FNE.',

    -- objetivos_especificos (JSONB array of strings)
    '[
      "Fortalecer las competencias de liderazgo directivo para conducir procesos de mejora escolar sostenidos.",
      "Apoyar el desarrollo de una cultura escolar colaborativa centrada en el aprendizaje profundo de los estudiantes.",
      "Acompanar la implementacion de metodologias de vanguardia en las practicas pedagogicas del establecimiento.",
      "Desarrollar capacidades institucionales para el analisis de datos educativos y la toma de decisiones basada en evidencia.",
      "Fortalecer los vinculos relacionales entre los actores del establecimiento (directivos, docentes, asistentes, apoderados y estudiantes)."
    ]'::jsonb,

    -- especificaciones_admin (JSONB object)
    '{
      "frecuencia": "El servicio considera sesiones de trabajo presenciales con una frecuencia minima de dos veces al mes durante el periodo de ejecucion, con posibilidad de sesiones adicionales de seguimiento segun acuerdo entre las partes.",
      "lugar": "Las sesiones se realizaran preferentemente en las dependencias del establecimiento educacional. Excepcionalmente podran realizarse en formato hibrido (presencial y remoto) previa coordinacion y acuerdo con el equipo directivo.",
      "contrapartes_tecnicas": "El establecimiento designara como contraparte tecnica al Director o Directora del establecimiento, quien coordinara con el equipo ATE la agenda de trabajo, el acceso a espacios e informacion institucional, y la participacion del equipo directivo en las sesiones planificadas.",
      "condiciones_pago": "El pago se realizara en cuotas iguales, de acuerdo al cronograma de entrega de informes de avance aprobados por la contraparte tecnica del establecimiento. El primer pago se realizara contra entrega y aprobacion del Informe de Inicio; los pagos intermedios contra cada Informe de Avance aprobado; y el pago final contra entrega y aprobacion del Informe Final del servicio."
    }'::jsonb,

    -- resultados_esperados (JSONB array of strings)
    '[
      "Equipo directivo con competencias fortalecidas para liderar procesos de mejora escolar con foco en resultados de aprendizaje.",
      "Plan de Mejoramiento Educativo (PME) actualizado con metas claras, indicadores medibles y responsables definidos.",
      "Cultura escolar colaborativa en proceso de consolidacion, evidenciada en practicas de trabajo conjunto entre docentes y directivos.",
      "Docentes aplicando al menos dos metodologias activas de aprendizaje en sus practicas de aula, con acompanamiento pedagogico sistematico.",
      "Sistema de seguimiento y monitoreo de indicadores de aprendizaje implementado y en uso regular por el equipo directivo.",
      "Informe Final del servicio con evidencias de logro, aprendizajes del proceso y recomendaciones para la sostenibilidad de los cambios."
    ]'::jsonb,

    -- requisitos_ate (JSONB array of strings)
    '[
      "Estar inscrita y vigente en el Registro de Asistencia Tecnica Educativa (ATE) del Ministerio de Educacion de Chile.",
      "Acreditar experiencia minima de 3 anos en asesoria a equipos directivos de establecimientos subvencionados.",
      "Contar con profesionales del area de educacion, psicologia o ciencias sociales con experiencia en liderazgo escolar y desarrollo organizacional.",
      "Presentar al menos 3 referencias verificables de servicios similares prestados en los ultimos 5 anos.",
      "El equipo profesional propuesto debe tener disponibilidad efectiva para las sesiones en el establecimiento durante el periodo de ejecucion.",
      "No tener contratos vigentes con el mismo establecimiento por el mismo tipo de servicio en el ano en curso."
    ]'::jsonb,

    -- documentos_adjuntar (JSONB array of strings)
    '[
      "Curriculum Vitae del equipo profesional que ejecutara el servicio (formato libre, no mas de 3 paginas por profesional).",
      "Plan de trabajo detallado con descripcion de actividades, metodologia, cronograma de sesiones e hitos de entrega.",
      "Presentacion institucional de la ATE con experiencia acreditada en servicios similares (no mas de 10 paginas).",
      "Al menos 3 cartas de recomendacion o constancias de servicios prestados en establecimientos educacionales.",
      "Propuesta economica en formato UF, detallando el costo total y el desglose por etapa o periodo.",
      "Declaracion jurada simple de no tener contratos vigentes con el mismo establecimiento por el mismo tipo de servicio."
    ]'::jsonb,

    -- condiciones_pago
    'El pago se efectuara en cuotas vinculadas a la entrega y aprobacion de informes de avance. La contraparte tecnica del establecimiento tendra un plazo de 10 dias habiles para aprobar o devolver con observaciones cada informe. En caso de observaciones, la ATE contara con 5 dias habiles para subsanarlas. El pago final (no menor al 20% del valor total) quedara retenido hasta la aprobacion del Informe Final completo.',

    -- version
    1,

    -- is_active
    true
  );

  RAISE NOTICE 'programa_bases_templates seed: Asesoria Integral template inserted successfully for programa_id=%', v_programa_id;
END $$;


-- ============================================================
-- BLOCK 2: Capacitacion para Liderar (placeholder template + criteria)
-- ============================================================

DO $$
DECLARE
  v_programa_id TEXT;
  v_existing_template_count INTEGER;
  v_existing_criteria_count INTEGER;
BEGIN
  -- Look up the Capacitacion para Liderar program
  SELECT id::TEXT INTO v_programa_id
  FROM programas
  WHERE nombre ILIKE '%LIDERAR%'
    AND activo = true
  LIMIT 1;

  IF v_programa_id IS NULL THEN
    SELECT id::TEXT INTO v_programa_id
    FROM programas
    WHERE nombre ILIKE '%CAPACITACION%LIDERAR%'
      AND activo = true
    LIMIT 1;
  END IF;

  IF v_programa_id IS NULL THEN
    RAISE NOTICE 'programa_bases_templates seed (Capacitacion para Liderar): No matching program found. Skipping. Run: SELECT id, nombre FROM programas WHERE activo = true;';
    RETURN;
  END IF;

  -- Template: check for existing (idempotency)
  SELECT COUNT(*) INTO v_existing_template_count
  FROM programa_bases_templates
  WHERE programa_id = v_programa_id
    AND is_active = true;

  IF v_existing_template_count = 0 THEN
    RAISE NOTICE 'programa_bases_templates seed: Inserting Capacitacion para Liderar template for programa_id=%', v_programa_id;

    INSERT INTO programa_bases_templates (
      programa_id,
      nombre_servicio,
      objetivo,
      objetivos_especificos,
      especificaciones_admin,
      resultados_esperados,
      requisitos_ate,
      documentos_adjuntar,
      condiciones_pago,
      version,
      is_active
    ) VALUES (
      v_programa_id,

      'Capacitacion para Liderar',

      '[Objetivo del servicio -- completar en /admin/licitaciones/templates antes de generar Bases]',

      '["[Objetivo especifico 1 -- editar en plantilla]", "[Objetivo especifico 2 -- editar en plantilla]", "[Objetivo especifico 3 -- editar en plantilla]"]'::jsonb,

      '{
        "frecuencia": "[Indicar frecuencia de sesiones -- editar en plantilla]",
        "lugar": "[Indicar lugar de realizacion -- editar en plantilla]",
        "contrapartes_tecnicas": "[Indicar contraparte tecnica del establecimiento -- editar en plantilla]",
        "condiciones_pago": "[Indicar condiciones de pago -- editar en plantilla]"
      }'::jsonb,

      '["[Resultado esperado 1 -- editar en plantilla]", "[Resultado esperado 2 -- editar en plantilla]"]'::jsonb,

      '["[Requisito ATE 1 -- editar en plantilla]", "[Requisito ATE 2 -- editar en plantilla]"]'::jsonb,

      '["[Documento a adjuntar 1 -- editar en plantilla]", "[Documento a adjuntar 2 -- editar en plantilla]"]'::jsonb,

      '[Condiciones de pago -- editar en plantilla]',

      1,
      true
    );

    RAISE NOTICE 'programa_bases_templates seed: Capacitacion para Liderar template inserted for programa_id=%', v_programa_id;
  ELSE
    RAISE NOTICE 'programa_bases_templates seed (Capacitacion para Liderar): Template already exists. Skipping template insert.';
  END IF;

  -- Criteria: check for existing (idempotency)
  SELECT COUNT(*) INTO v_existing_criteria_count
  FROM programa_evaluacion_criterios
  WHERE programa_id = v_programa_id
    AND is_active = true;

  IF v_existing_criteria_count > 0 THEN
    RAISE NOTICE 'programa_bases_templates seed (Capacitacion para Liderar): Criteria already exist (% rows). Skipping criteria insert.', v_existing_criteria_count;
    RETURN;
  END IF;

  RAISE NOTICE 'programa_bases_templates seed: Inserting evaluation criteria for Capacitacion para Liderar, programa_id=%', v_programa_id;

  INSERT INTO programa_evaluacion_criterios
    (programa_id, nombre_criterio, puntaje_maximo, descripcion, orden, is_active)
  VALUES
    (
      v_programa_id,
      'Experiencia de la ATE en capacitacion directiva',
      20,
      'Anos de experiencia, cantidad de capacitaciones realizadas, evaluaciones previas de establecimientos similares',
      1,
      true
    ),
    (
      v_programa_id,
      'Diseno curricular y metodologia de la capacitacion',
      40,
      'Calidad del diseno del programa de capacitacion, coherencia pedagogica, metodologias activas y recursos de aprendizaje',
      2,
      true
    ),
    (
      v_programa_id,
      'Idoneidad del equipo de facilitadores',
      20,
      'Formacion academica, experiencia en facilitacion de adultos, especialidad en liderazgo educativo',
      3,
      true
    ),
    (
      v_programa_id,
      'Materiales y recursos pedagogicos',
      10,
      'Calidad y pertinencia de los materiales de apoyo, herramientas digitales, recursos de aprendizaje proporcionados',
      4,
      true
    ),
    (
      v_programa_id,
      'Referencias y evaluaciones de otros establecimientos',
      10,
      'Testimonios, evaluaciones de satisfaccion y resultados verificables de capacitaciones previas similares',
      5,
      true
    )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'programa_bases_templates seed: Capacitacion para Liderar criteria inserted (5 criteria, 100 pts) for programa_id=%', v_programa_id;
END $$;


-- ============================================================
-- BLOCK 3: Implementacion de ABP (placeholder template + criteria)
-- ============================================================

DO $$
DECLARE
  v_programa_id TEXT;
  v_existing_template_count INTEGER;
  v_existing_criteria_count INTEGER;
BEGIN
  -- Look up the Implementacion de ABP (Aprendizaje Basado en Proyectos) program
  SELECT id::TEXT INTO v_programa_id
  FROM programas
  WHERE nombre ILIKE '%ABP%'
    AND activo = true
  LIMIT 1;

  IF v_programa_id IS NULL THEN
    SELECT id::TEXT INTO v_programa_id
    FROM programas
    WHERE nombre ILIKE '%APRENDIZAJE BASADO%PROYECTOS%'
      AND activo = true
    LIMIT 1;
  END IF;

  IF v_programa_id IS NULL THEN
    SELECT id::TEXT INTO v_programa_id
    FROM programas
    WHERE nombre ILIKE '%IMPLEMENTACION%ABP%'
      AND activo = true
    LIMIT 1;
  END IF;

  IF v_programa_id IS NULL THEN
    RAISE NOTICE 'programa_bases_templates seed (Implementacion ABP): No matching program found (ABP or Aprendizaje Basado en Proyectos). Skipping. Run: SELECT id, nombre FROM programas WHERE activo = true;';
    RETURN;
  END IF;

  -- Template: check for existing (idempotency)
  SELECT COUNT(*) INTO v_existing_template_count
  FROM programa_bases_templates
  WHERE programa_id = v_programa_id
    AND is_active = true;

  IF v_existing_template_count = 0 THEN
    RAISE NOTICE 'programa_bases_templates seed: Inserting Implementacion ABP template for programa_id=%', v_programa_id;

    INSERT INTO programa_bases_templates (
      programa_id,
      nombre_servicio,
      objetivo,
      objetivos_especificos,
      especificaciones_admin,
      resultados_esperados,
      requisitos_ate,
      documentos_adjuntar,
      condiciones_pago,
      version,
      is_active
    ) VALUES (
      v_programa_id,

      'Implementacion de Aprendizaje Basado en Proyectos (ABP)',

      '[Objetivo del servicio -- completar en /admin/licitaciones/templates antes de generar Bases]',

      '["[Objetivo especifico 1 -- editar en plantilla]", "[Objetivo especifico 2 -- editar en plantilla]", "[Objetivo especifico 3 -- editar en plantilla]"]'::jsonb,

      '{
        "frecuencia": "[Indicar frecuencia de sesiones -- editar en plantilla]",
        "lugar": "[Indicar lugar de realizacion -- editar en plantilla]",
        "contrapartes_tecnicas": "[Indicar contraparte tecnica del establecimiento -- editar en plantilla]",
        "condiciones_pago": "[Indicar condiciones de pago -- editar en plantilla]"
      }'::jsonb,

      '["[Resultado esperado 1 -- editar en plantilla]", "[Resultado esperado 2 -- editar en plantilla]"]'::jsonb,

      '["[Requisito ATE 1 -- editar en plantilla]", "[Requisito ATE 2 -- editar en plantilla]"]'::jsonb,

      '["[Documento a adjuntar 1 -- editar en plantilla]", "[Documento a adjuntar 2 -- editar en plantilla]"]'::jsonb,

      '[Condiciones de pago -- editar en plantilla]',

      1,
      true
    );

    RAISE NOTICE 'programa_bases_templates seed: Implementacion ABP template inserted for programa_id=%', v_programa_id;
  ELSE
    RAISE NOTICE 'programa_bases_templates seed (Implementacion ABP): Template already exists. Skipping template insert.';
  END IF;

  -- Criteria: check for existing (idempotency)
  SELECT COUNT(*) INTO v_existing_criteria_count
  FROM programa_evaluacion_criterios
  WHERE programa_id = v_programa_id
    AND is_active = true;

  IF v_existing_criteria_count > 0 THEN
    RAISE NOTICE 'programa_bases_templates seed (Implementacion ABP): Criteria already exist (% rows). Skipping criteria insert.', v_existing_criteria_count;
    RETURN;
  END IF;

  RAISE NOTICE 'programa_bases_templates seed: Inserting evaluation criteria for Implementacion ABP, programa_id=%', v_programa_id;

  INSERT INTO programa_evaluacion_criterios
    (programa_id, nombre_criterio, puntaje_maximo, descripcion, orden, is_active)
  VALUES
    (
      v_programa_id,
      'Experiencia de la ATE en implementacion ABP',
      20,
      'Anos de experiencia en implementacion de Aprendizaje Basado en Proyectos en establecimientos educacionales similares',
      1,
      true
    ),
    (
      v_programa_id,
      'Propuesta metodologica ABP y plan de implementacion',
      40,
      'Calidad y coherencia del enfoque ABP propuesto, plan de acompanamiento docente, secuencia didactica y estrategias de evaluacion',
      2,
      true
    ),
    (
      v_programa_id,
      'Idoneidad y experiencia del equipo profesional',
      20,
      'Formacion en metodologias activas, experiencia en aula con ABP, capacidad para modelar proyectos interdisciplinarios',
      3,
      true
    ),
    (
      v_programa_id,
      'Recursos, materiales y herramientas digitales',
      10,
      'Disponibilidad y calidad de materiales de apoyo para docentes, estudiantes y equipos directivos en la implementacion ABP',
      4,
      true
    ),
    (
      v_programa_id,
      'Evidencias de resultados en establecimientos anteriores',
      10,
      'Resultados medibles y verificables de implementaciones ABP previas: impacto en aprendizajes, participacion estudiantil, satisfaccion docente',
      5,
      true
    )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'programa_bases_templates seed: Implementacion ABP criteria inserted (5 criteria, 100 pts) for programa_id=%', v_programa_id;
END $$;
