-- Seed: Technical Evaluation Criteria for Asesoria Integral / GENERATIVA Programs
--
-- This seed inserts 5 evaluation criteria for the main FNE program (Aula Generativa
-- or equivalent) used in licitacion technical evaluation. Points must sum to 100.
--
-- The DO block dynamically finds the programa_id by name to avoid hardcoding a UUID.
-- If no matching program is found, the seed skips gracefully with a RAISE NOTICE.
-- The seed can be re-run safely -- ON CONFLICT DO NOTHING ensures idempotency.
--
-- Criteria breakdown (100 points total):
--   1. Experiencia de la ATE                                       20 pts
--   2. Metodologia, enfoque y plan de ejecucion                    40 pts
--   3. Experiencia de los profesionales de la ATE                  20 pts
--   4. Recursos educativos, tecnologicos, equipamiento, insumos    10 pts
--   5. Evaluacion de otros sostenedores y/o directores             10 pts
--   Total:                                                        100 pts
--
-- Date: 2026-02-20
-- Author: DB Agent (Pipeline Task: Licitaciones Phase 1)

DO $$
DECLARE
  v_programa_id TEXT;
BEGIN
  -- Find the Asesoria Integral / AULA GENERATIVA program by name.
  -- The programas table stores id as UUID-in-TEXT. Cast to TEXT for consistency.
  -- DEVELOPER NOTE: If this selects the wrong program, run:
  --   SELECT id, nombre FROM programas WHERE activo = true;
  -- and hardcode the correct UUID in v_programa_id below.
  SELECT id::TEXT INTO v_programa_id
  FROM programas
  WHERE nombre ILIKE '%GENERATIVA%'
    AND activo = true
  LIMIT 1;

  IF v_programa_id IS NULL THEN
    -- Try alternate name patterns
    SELECT id::TEXT INTO v_programa_id
    FROM programas
    WHERE nombre ILIKE '%ASESORIA%INTEGRAL%'
      AND activo = true
    LIMIT 1;
  END IF;

  IF v_programa_id IS NULL THEN
    -- Try any active program as fallback (log which one was found)
    SELECT id::TEXT INTO v_programa_id
    FROM programas
    WHERE activo = true
    ORDER BY created_at
    LIMIT 1;

    IF v_programa_id IS NOT NULL THEN
      RAISE NOTICE 'programa_eval_criterios seed: No GENERATIVA or ASESORIA INTEGRAL program found. Using first active program id=%. Review and update manually if incorrect.', v_programa_id;
    END IF;
  END IF;

  IF v_programa_id IS NULL THEN
    RAISE NOTICE 'programa_eval_criterios seed: No active programs found in programas table. Skipping criteria seed. Run this migration again after programs are seeded.';
    RETURN;
  END IF;

  RAISE NOTICE 'programa_eval_criterios seed: Inserting criteria for programa_id=%', v_programa_id;

  INSERT INTO programa_evaluacion_criterios
    (programa_id, nombre_criterio, puntaje_maximo, descripcion, orden, is_active)
  VALUES
    (
      v_programa_id,
      'Experiencia de la ATE',
      20,
      'Anos de experiencia, cantidad de servicios realizados, evaluaciones previas en establecimientos similares',
      1,
      true
    ),
    (
      v_programa_id,
      'Metodologia, enfoque y plan de ejecucion',
      40,
      'Calidad de la propuesta tecnica, metodologia de trabajo, coherencia del plan detallado de ejecucion',
      2,
      true
    ),
    (
      v_programa_id,
      'Experiencia de los profesionales de la ATE',
      20,
      'Cualificaciones, experiencia relevante, formacion academica del equipo de profesionales propuesto',
      3,
      true
    ),
    (
      v_programa_id,
      'Recursos educativos, tecnologicos, equipamiento e insumos',
      10,
      'Materiales, tecnologia, recursos y equipamiento que aporta la ATE para la ejecucion del servicio',
      4,
      true
    ),
    (
      v_programa_id,
      'Evaluacion de otros sostenedores y/o directores',
      10,
      'Referencias y testimonios de otros establecimientos o sostenedores que hayan contratado a la ATE',
      5,
      true
    )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'programa_eval_criterios seed: Completed. 5 criteria inserted (or already existed) for programa_id=%', v_programa_id;
END $$;
