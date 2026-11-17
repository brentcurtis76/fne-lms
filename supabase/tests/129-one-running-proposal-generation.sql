-- =============================================================================
-- 129-one-running-proposal-generation.sql — GENERA fixes F14, send-back 1 (S4).
-- Proves the partial unique index propuesta_generadas_one_running_per_licitacion
-- (migration 20261116179700_one_running_proposal_generation.sql):
--   * a second «generando» row for the same tender fails with a unique violation;
--   * a «generando» row for another tender is fine;
--   * «error» and «completada» rows do not block a new running one.
-- Synthetic fixtures (schools 9129x, uuids 12900000-…); everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(8);

SELECT has_index('public', 'propuesta_generadas', 'propuesta_generadas_one_running_per_licitacion',
  'the one-running-generation index exists');
SELECT ok(
  (SELECT indisunique FROM pg_index WHERE indexrelid = 'public.propuesta_generadas_one_running_per_licitacion'::regclass),
  'it is unique');
SELECT is(
  (SELECT pg_get_expr(indpred, indrelid) FROM pg_index WHERE indexrelid = 'public.propuesta_generadas_one_running_per_licitacion'::regclass),
  '(estado = ''generando''::text)',
  'it applies only to running rows');

-- Fixtures (as the test superuser)
INSERT INTO public.schools(id, name) VALUES (91291, 'LIC129 School'), (91292, 'LIC129 Other School');
INSERT INTO public.licitaciones(id, numero_licitacion, school_id, programa_id, nombre_licitacion, year, estado, email_licitacion,
  monto_minimo, monto_maximo, tipo_moneda, duracion_minima, duracion_maxima, peso_evaluacion_tecnica, peso_evaluacion_economica) VALUES
('12900000-0000-4000-8000-000000000001', 'LIC129-1', 91291, 'lic129-programa', 'Synthetic tender one', 2026, 'propuestas_pendientes',
  'tender1@lic129.qa.local.test', 100, 200, 'UF', '3 meses', '6 meses', 70, 30),
('12900000-0000-4000-8000-000000000002', 'LIC129-2', 91292, 'lic129-programa', 'Synthetic tender two', 2026, 'propuestas_pendientes',
  'tender2@lic129.qa.local.test', 50, 80, 'UF', '1 mes', '2 meses', 60, 40);

-- A finished and a failed generation on tender one: neither blocks.
INSERT INTO public.propuesta_generadas(id, licitacion_id, configuracion, estado, version) VALUES
('12900000-0000-4000-8000-000000000011', '12900000-0000-4000-8000-000000000001', '{}'::jsonb, 'completada', 1),
('12900000-0000-4000-8000-000000000012', '12900000-0000-4000-8000-000000000001', '{}'::jsonb, 'error', 2);

SELECT lives_ok(
  $q$INSERT INTO public.propuesta_generadas(id, licitacion_id, configuracion, estado, version)
     VALUES ('12900000-0000-4000-8000-000000000013', '12900000-0000-4000-8000-000000000001', '{}'::jsonb, 'generando', 3)$q$,
  'finished and failed rows do not block a running one');

SELECT throws_ok(
  $q$INSERT INTO public.propuesta_generadas(id, licitacion_id, configuracion, estado, version)
     VALUES ('12900000-0000-4000-8000-000000000014', '12900000-0000-4000-8000-000000000001', '{}'::jsonb, 'generando', 4)$q$,
  '23505', NULL,
  'a second running row for the same tender fails with a unique violation');

SELECT lives_ok(
  $q$INSERT INTO public.propuesta_generadas(id, licitacion_id, configuracion, estado, version)
     VALUES ('12900000-0000-4000-8000-000000000021', '12900000-0000-4000-8000-000000000002', '{}'::jsonb, 'generando', 1)$q$,
  'a running row for another tender is fine');

-- Once the running one is marked failed, a new running one can start.
UPDATE public.propuesta_generadas SET estado = 'error', error_message = 'Generación interrumpida'
 WHERE id = '12900000-0000-4000-8000-000000000013';
SELECT lives_ok(
  $q$INSERT INTO public.propuesta_generadas(id, licitacion_id, configuracion, estado, version)
     VALUES ('12900000-0000-4000-8000-000000000015', '12900000-0000-4000-8000-000000000001', '{}'::jsonb, 'generando', 5)$q$,
  'after the running row is marked failed, a new running row is accepted');

SELECT is(
  (SELECT count(*)::int FROM public.propuesta_generadas
    WHERE licitacion_id = '12900000-0000-4000-8000-000000000001' AND estado = 'generando'),
  1, 'tender one has exactly one running generation');

SELECT * FROM finish();
ROLLBACK;
