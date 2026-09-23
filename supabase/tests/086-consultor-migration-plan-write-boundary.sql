-- =============================================================================
-- 086-consultor-migration-plan-write-boundary.sql — PROC-CONSULTOR-C0 Groups A–J
--
-- Real-role checks for the RESTRICTIVE write boundary on
-- public.ab_migration_plan (migration 20260910190000, loaded before this file):
-- Group A
--   * an active, school-assigned pure consultor can read the row but cannot
--     INSERT / UPDATE / DELETE it;
--   * an active admin performs all three writes.
-- Group B
--   * a pure active equipo_directivo (single role, own school) performs all
--     three writes on its own school's plan;
--   * the same directivo cannot INSERT into another school's plan (42501) and
--     UPDATE / DELETE of another school's visible row affect 0 rows;
--   * moving its own row to another school fails the UPDATE policy WITH CHECK
--     (42501); moving another school's row into its own affects 0 rows
--     (old-row USING).
-- Group C
--   * an active user holding exactly two roles, consultor + equipo_directivo,
--     for its own school (consultant-assigned to it, no admin) performs all
--     three writes on that school's plan.
-- Group D
--   * an active user holding consultor + global admin (consultant-assigned to
--     its own school) performs all three writes on its own school's plan and
--     on an unassigned second school's plan.
-- Group E
--   * a pure active global admin (single admin role, no school role or
--     consultant assignment) performs all three writes at two schools and
--     moves one plan row's school_id to the second school and back.
-- Group F
--   * two active pure consultors (single active consultor role, NULL
--     school_id): one with no consultant assignment at all, one whose only
--     assignment (to the fixture school) is inactive with a past starts_at
--     and NULL ends_at. Both can read the plan row under the unchanged SELECT
--     policy but cannot INSERT / UPDATE / DELETE it.
-- Groups G–I
--   * inactive/expired consultor variants, docente, and anon exercise the
--     remaining real-role boundaries.
-- Group J
--   * one approved active literal admin is exercised before, during, and after
--     must_change_password=true; the forced-password guard hides SELECT and
--     refuses every write only while the flag is set.
--
-- Self-contained synthetic fixtures with explicit negative integer IDs
-- (Group A -860xxx, Group B -861xxx, Group C -862xxx, Group D -863xxx,
-- Group E -864xxx, Group F -865xxx, Groups G–J -866xxx through -869xxx), so
-- no sequence is advanced. Initial sequence state is captured and compared
-- with final state instead of assuming a pristine database.
-- Everything is rolled back.
-- =============================================================================

BEGIN;

SELECT plan(271);

DO $sequence_snapshot$
BEGIN
  PERFORM set_config(
    'c0.sequence.schools',
    (SELECT last_value::text || '/' || is_called::text FROM public.schools_id_seq),
    true
  );
  PERFORM set_config(
    'c0.sequence.ab_grades',
    (SELECT last_value::text || '/' || is_called::text FROM public.ab_grades_id_seq),
    true
  );
  PERFORM set_config(
    'c0.sequence.ab_migration_plan',
    (SELECT last_value::text || '/' || is_called::text FROM public.ab_migration_plan_id_seq),
    true
  );
END
$sequence_snapshot$;

-- ---------------------------------------------------------------------------
-- Preconditions (postgres)
-- ---------------------------------------------------------------------------
SELECT tests.rls_enabled('public', 'ab_migration_plan');

SELECT is(
  (SELECT count(*)::int
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ab_migration_plan'
      AND permissive = 'RESTRICTIVE'
      AND (policyname, cmd) IN (
        ('ab_migration_plan_write_boundary_insert', 'INSERT'),
        ('ab_migration_plan_write_boundary_update', 'UPDATE'),
        ('ab_migration_plan_write_boundary_delete', 'DELETE'))),
  3,
  'ab_migration_plan tiene las tres políticas RESTRICTIVE de escritura cargadas'
);

SELECT is(
  (SELECT count(*)::int FROM public.schools WHERE id = -860001)
  + (SELECT count(*)::int FROM public.ab_grades WHERE id IN (-860011, -860012))
  + (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id IN (-860101, -860102, -860103) OR school_id = -860001)
  + (SELECT count(*)::int FROM auth.users
      WHERE raw_user_meta_data ->> 'test_identifier' IN ('c0a_admin_086', 'c0a_consultor_086')
         OR email IN ('c0a-admin-086@test.local', 'c0a-consultor-086@test.local')),
  0,
  'IDs e identidades del fixture sintético están libres antes de insertar'
);

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (postgres). No auth.users trigger creates profiles, so
-- profiles are inserted explicitly before user_roles/consultant_assignments.
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_admin uuid;
  v_consultor uuid;
BEGIN
  v_admin := tests.create_supabase_user('c0a_admin_086', 'c0a-admin-086@test.local');
  v_consultor := tests.create_supabase_user('c0a_consultor_086', 'c0a-consultor-086@test.local');
  PERFORM set_config('c0a.admin_uid', v_admin::text, true);
  PERFORM set_config('c0a.consultor_uid', v_consultor::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES
    (v_admin, 'c0a-admin-086@test.local', 'C0A Admin 086', 'approved', false),
    (v_consultor, 'c0a-consultor-086@test.local', 'C0A Consultor 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES (-860001, 'C0A Synthetic School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-860011, 'C0A Synthetic Grade 086-1', 86011, false),
    (-860012, 'C0A Synthetic Grade 086-2', 86012, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES
    (v_admin, 'admin', NULL, true),
    (v_consultor, 'consultor', -860001, true);

  INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active)
  VALUES (v_consultor, -860001, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-860101, -860001, 1, -860011, 'GT');
END
$fixture$;

SELECT is(
  tests.get_supabase_uid('c0a_consultor_086'),
  current_setting('c0a.consultor_uid')::uuid,
  'El helper resuelve el consultor sintético al UID creado'
);

SELECT is(
  tests.get_supabase_uid('c0a_admin_086'),
  current_setting('c0a.admin_uid')::uuid,
  'El helper resuelve el admin sintético al UID creado'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles
    WHERE id IN (current_setting('c0a.admin_uid')::uuid, current_setting('c0a.consultor_uid')::uuid)
      AND approval_status = 'approved'
      AND must_change_password IS FALSE),
  2,
  'Ambos perfiles sintéticos existen, aprobados y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, ''))
     FROM public.user_roles
    WHERE user_id = current_setting('c0a.consultor_uid')::uuid
      AND is_active IS TRUE),
  ARRAY['consultor:-860001'],
  'El consultor sintético tiene exactamente un rol activo: consultor del colegio sintético'
);

SELECT is(
  (SELECT count(*)::int FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0a.consultor_uid')::uuid
      AND school_id = -860001
      AND is_active IS TRUE),
  1,
  'El consultor sintético tiene una asignación activa a su colegio sintético'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, ''))
     FROM public.user_roles
    WHERE user_id = current_setting('c0a.admin_uid')::uuid
      AND is_active IS TRUE),
  ARRAY['admin:'],
  'El admin sintético tiene exactamente un rol activo: admin'
);

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -860101),
  '(-860101,-860001,1,-860011,GT)',
  'Fila sembrada del plan de migración existe con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Assigned pure consultor (authenticated): read allowed, writes denied
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0a_consultor_086');

SELECT is(current_user::text, 'authenticated', 'Consultor: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0a.consultor_uid')::uuid,
  'Consultor: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Consultor: no es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-860001), 'Consultor: no es directivo del colegio sintético');

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -860101),
  '(-860101,-860001,1,-860011,GT)',
  'Consultor: puede leer la fila existente del plan de su colegio'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-860102, -860001, 2, -860011, 'GI') $$,
  '42501',
  NULL::text,
  'Consultor: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-860102, -860001, 2, -860011, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Consultor: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 5, generation_type = 'GI'
   WHERE id = -860101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Consultor: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -860101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Consultor: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -860101),
  '(-860101,-860001,1,-860011,GT)',
  'Tras los intentos del consultor la fila sembrada sigue intacta'
);

SELECT is(
  (SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -860102),
  0,
  'Tras los intentos del consultor no existe la fila de INSERT bloqueado'
);

-- ---------------------------------------------------------------------------
-- Active admin (authenticated): all three writes succeed
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0a_admin_086');

SELECT is(current_user::text, 'authenticated', 'Admin: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0a.admin_uid')::uuid,
  'Admin: auth.uid() coincide con el usuario del helper'
);

SELECT ok(public.auth_is_assessment_admin(), 'Admin: es admin de evaluación activo');

WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-860103, -860001, 2, -860012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-860103,-860001,2,-860012,GI)'],
  'Admin: INSERT afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -860103),
  '(-860103,-860001,2,-860012,GI)',
  'Admin: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 3, generation_type = 'GI'
   WHERE id = -860101
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-860101,-860001,3,-860011,GI)'],
  'Admin: UPDATE afecta 1 fila con los valores nuevos'
) FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -860103
  RETURNING id
)
SELECT is(array_agg(d.id), ARRAY[-860103], 'Admin: DELETE afecta exactamente la fila insertada') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -860001),
  ARRAY['(-860101,-860001,3,-860011,GI)'],
  'Como postgres: queda solo la fila actualizada por el admin; la borrada no existe'
);

-- =============================================================================
-- Group B — pure active equipo_directivo: own school writable, other school not
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Group B preconditions and fixtures (postgres). Own school -861001, other
-- school -861002; seeded rows use distinct (school_id, year_number, grade_id)
-- keys so every denied write below fails on RLS, not on uniqueness.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.schools WHERE id IN (-861001, -861002))
  + (SELECT count(*)::int FROM public.ab_grades WHERE id IN (-861011, -861012))
  + (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id IN (-861101, -861102, -861103, -861104) OR school_id IN (-861001, -861002))
  + (SELECT count(*)::int FROM auth.users
      WHERE raw_user_meta_data ->> 'test_identifier' = 'c0b_directivo_086'
         OR email = 'c0b-directivo-086@test.local'),
  0,
  'Grupo B: IDs e identidad del fixture sintético están libres antes de insertar'
);

DO $fixture_b$
DECLARE
  v_directivo uuid;
BEGIN
  v_directivo := tests.create_supabase_user('c0b_directivo_086', 'c0b-directivo-086@test.local');
  PERFORM set_config('c0b.directivo_uid', v_directivo::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES (v_directivo, 'c0b-directivo-086@test.local', 'C0B Directivo 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES
    (-861001, 'C0B Synthetic Own School 086'),
    (-861002, 'C0B Synthetic Other School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-861011, 'C0B Synthetic Grade 086-1', 86111, false),
    (-861012, 'C0B Synthetic Grade 086-2', 86112, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_directivo, 'equipo_directivo', -861001, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES
    (-861101, -861001, 1, -861011, 'GT'),
    (-861102, -861002, 1, -861011, 'GT');
END
$fixture_b$;

SELECT is(
  tests.get_supabase_uid('c0b_directivo_086'),
  current_setting('c0b.directivo_uid')::uuid,
  'Grupo B: el helper resuelve el directivo sintético al UID creado'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles
    WHERE id = current_setting('c0b.directivo_uid')::uuid
      AND approval_status = 'approved'
      AND must_change_password IS FALSE),
  1,
  'Grupo B: el perfil del directivo existe, aprobado y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, '') || ':' || coalesce(is_active::text, ''))
     FROM public.user_roles
    WHERE user_id = current_setting('c0b.directivo_uid')::uuid),
  ARRAY['equipo_directivo:-861001:true'],
  'Grupo B: el directivo tiene exactamente un rol, activo: equipo_directivo del colegio propio (sin admin ni consultor)'
);

SELECT is(
  (SELECT count(*)::int FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0b.directivo_uid')::uuid),
  0,
  'Grupo B: el directivo no tiene asignaciones de consultor'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id IN (-861001, -861002)),
  ARRAY['(-861102,-861002,1,-861011,GT)', '(-861101,-861001,1,-861011,GT)'],
  'Grupo B: filas sembradas del colegio propio y del ajeno existen con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Directivo (authenticated): identity
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0b_directivo_086');

SELECT is(current_user::text, 'authenticated', 'Directivo: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0b.directivo_uid')::uuid,
  'Directivo: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Directivo: no es admin de evaluación');

SELECT ok(public.auth_is_school_directivo(-861001), 'Directivo: es directivo activo del colegio propio');

SELECT ok(NOT public.auth_is_school_directivo(-861002), 'Directivo: no es directivo del colegio ajeno');

-- ---------------------------------------------------------------------------
-- B1: own school INSERT / UPDATE / DELETE succeed
-- ---------------------------------------------------------------------------
WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-861103, -861001, 2, -861012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-861103,-861001,2,-861012,GI)'],
  'Directivo B1: INSERT en su colegio afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -861103),
  '(-861103,-861001,2,-861012,GI)',
  'Directivo B1: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 3, generation_type = 'GI'
   WHERE id = -861101
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-861101,-861001,3,-861011,GI)'],
  'Directivo B1: UPDATE en su colegio afecta 1 fila con los valores nuevos'
) FROM u;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -861101),
  '(-861101,-861001,3,-861011,GI)',
  'Directivo B1: la fila actualizada queda almacenada con los valores nuevos'
);

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -861103
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(d.id, d.school_id, d.year_number, d.grade_id, d.generation_type)::text),
  ARRAY['(-861103,-861001,2,-861012,GI)'],
  'Directivo B1: DELETE en su colegio afecta exactamente la fila insertada'
) FROM d;

-- ---------------------------------------------------------------------------
-- B2: other school INSERT denied; UPDATE / DELETE of a visible row affect 0
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -861102),
  '(-861102,-861002,1,-861011,GT)',
  'Directivo B2: la fila del colegio ajeno es visible para el directivo'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-861104, -861002, 2, -861012, 'GI') $$,
  '42501',
  NULL::text,
  'Directivo B2: INSERT en colegio ajeno es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-861104, -861002, 2, -861012, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Directivo B2: el INSERT en colegio ajeno lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 4, generation_type = 'GI'
   WHERE id = -861102
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Directivo B2: UPDATE de la fila visible del colegio ajeno afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -861102
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Directivo B2: DELETE de la fila visible del colegio ajeno afecta 0 filas') FROM d;

-- ---------------------------------------------------------------------------
-- B3: moving own visible row to the other school fails the UPDATE WITH CHECK
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.ab_migration_plan SET school_id = -861002 WHERE id = -861101 $$,
  '42501',
  NULL::text,
  'Directivo B3: mover su fila a un colegio ajeno es bloqueado con 42501'
);

SELECT throws_like(
  $$ UPDATE public.ab_migration_plan SET school_id = -861002 WHERE id = -861101 $$,
  '%"ab_migration_plan_write_boundary_update"%',
  'Directivo B3: el traslado lo rechaza la política de límite de escritura de UPDATE'
);

-- ---------------------------------------------------------------------------
-- B4: moving the other school's visible row into own school affects 0 rows
-- ---------------------------------------------------------------------------
WITH u AS (
  UPDATE public.ab_migration_plan
     SET school_id = -861001
   WHERE id = -861102
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Directivo B4: mover la fila del colegio ajeno a su colegio afecta 0 filas') FROM u;

RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Group B post-checks (postgres)
-- ---------------------------------------------------------------------------
SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo B: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -861101),
  '(-861101,-861001,3,-861011,GI)',
  'Como postgres B1/B3: la fila propia conserva el UPDATE permitido y sigue en su colegio'
);

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -861102),
  '(-861102,-861002,1,-861011,GT)',
  'Como postgres B2/B4: la fila del colegio ajeno sigue intacta'
);

SELECT is(
  (SELECT count(*)::int FROM public.ab_migration_plan WHERE id IN (-861103, -861104)),
  0,
  'Como postgres B1/B2: no existen la fila borrada por el directivo ni la del INSERT bloqueado'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id IN (-861001, -861002)),
  ARRAY['(-861102,-861002,1,-861011,GT)', '(-861101,-861001,3,-861011,GI)'],
  'Como postgres: los colegios sintéticos del grupo B contienen solo las filas esperadas'
);

-- =============================================================================
-- Group C — active consultor + equipo_directivo of its own school keeps writes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Group C preconditions and fixtures (postgres). School -862001 is both the
-- directivo school and the consultor's assigned school.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.schools WHERE id = -862001)
  + (SELECT count(*)::int FROM public.ab_grades WHERE id IN (-862011, -862012))
  + (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id IN (-862101, -862102) OR school_id = -862001)
  + (SELECT count(*)::int FROM public.profiles WHERE email = 'c0c-mixto-086@test.local')
  + (SELECT count(*)::int FROM auth.users
      WHERE raw_user_meta_data ->> 'test_identifier' = 'c0c_mixto_086'
         OR email = 'c0c-mixto-086@test.local'),
  0,
  'Grupo C: IDs e identidad del fixture sintético están libres antes de insertar'
);

DO $fixture_c$
DECLARE
  v_mixto uuid;
BEGIN
  v_mixto := tests.create_supabase_user('c0c_mixto_086', 'c0c-mixto-086@test.local');
  PERFORM set_config('c0c.mixto_uid', v_mixto::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES (v_mixto, 'c0c-mixto-086@test.local', 'C0C Consultor Directivo 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES (-862001, 'C0C Synthetic Own School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-862011, 'C0C Synthetic Grade 086-1', 86211, false),
    (-862012, 'C0C Synthetic Grade 086-2', 86212, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES
    (v_mixto, 'consultor', -862001, true),
    (v_mixto, 'equipo_directivo', -862001, true);

  INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active)
  VALUES (v_mixto, -862001, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-862101, -862001, 1, -862011, 'GT');
END
$fixture_c$;

SELECT is(
  tests.get_supabase_uid('c0c_mixto_086'),
  current_setting('c0c.mixto_uid')::uuid,
  'Grupo C: el helper resuelve el usuario mixto sintético al UID creado'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles
    WHERE id = current_setting('c0c.mixto_uid')::uuid
      AND approval_status = 'approved'
      AND must_change_password IS FALSE),
  1,
  'Grupo C: el perfil del usuario mixto existe, aprobado y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, '') || ':' || coalesce(is_active::text, '')
                    ORDER BY role_type::text)
     FROM public.user_roles
    WHERE user_id = current_setting('c0c.mixto_uid')::uuid),
  ARRAY['consultor:-862001:true', 'equipo_directivo:-862001:true'],
  'Grupo C: el usuario tiene exactamente dos roles activos del colegio propio: consultor y equipo_directivo (sin admin)'
);

SELECT is(
  (SELECT array_agg(coalesce(school_id::text, '') || ':' || coalesce(is_active::text, '')
                    || ':' || coalesce((starts_at <= now())::text, '') || ':' || (ends_at IS NULL)::text)
     FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0c.mixto_uid')::uuid),
  ARRAY['-862001:true:true:true'],
  'Grupo C: el consultor tiene exactamente una asignación activa y vigente, al colegio propio'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -862001),
  ARRAY['(-862101,-862001,1,-862011,GT)'],
  'Grupo C: la fila sembrada del colegio propio existe con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Mixed consultor + directivo (authenticated): identity
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0c_mixto_086');

SELECT is(current_user::text, 'authenticated', 'Mixto: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0c.mixto_uid')::uuid,
  'Mixto: auth.uid() coincide con el usuario creado'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Mixto: no es admin de evaluación');

SELECT ok(public.auth_is_school_directivo(-862001), 'Mixto: es directivo activo del colegio propio');

-- ---------------------------------------------------------------------------
-- C1: own school INSERT / UPDATE / DELETE succeed despite the consultor role
-- ---------------------------------------------------------------------------
WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-862102, -862001, 2, -862012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-862102,-862001,2,-862012,GI)'],
  'Mixto C1: INSERT en su colegio afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -862102),
  '(-862102,-862001,2,-862012,GI)',
  'Mixto C1: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 4, generation_type = 'GI'
   WHERE id = -862101
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-862101,-862001,4,-862011,GI)'],
  'Mixto C1: UPDATE en su colegio afecta 1 fila con los valores nuevos'
) FROM u;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -862101),
  '(-862101,-862001,4,-862011,GI)',
  'Mixto C1: la fila actualizada queda almacenada con los valores nuevos'
);

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -862102
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(d.id, d.school_id, d.year_number, d.grade_id, d.generation_type)::text),
  ARRAY['(-862102,-862001,2,-862012,GI)'],
  'Mixto C1: DELETE en su colegio afecta exactamente la fila insertada'
) FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Group C post-checks (postgres)
-- ---------------------------------------------------------------------------
SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo C: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -862101),
  '(-862101,-862001,4,-862011,GI)',
  'Como postgres C1: la fila propia conserva el UPDATE del usuario mixto'
);

SELECT is(
  (SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -862102),
  0,
  'Como postgres C1: no existe la fila borrada por el usuario mixto'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -862001),
  ARRAY['(-862101,-862001,4,-862011,GI)'],
  'Como postgres: el colegio sintético del grupo C contiene solo la fila esperada'
);

-- =============================================================================
-- Group D — mixed consultor + admin: writes at own and unassigned school
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Group D preconditions and fixtures (postgres). School -863001 is the
-- consultor's assigned school; -863002 is a second school with no role or
-- consultant assignment for the user.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.schools WHERE id IN (-863001, -863002))
  + (SELECT count(*)::int FROM public.ab_grades WHERE id IN (-863011, -863012))
  + (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id IN (-863101, -863102, -863201, -863202)
         OR school_id IN (-863001, -863002))
  + (SELECT count(*)::int FROM public.user_roles WHERE school_id IN (-863001, -863002))
  + (SELECT count(*)::int FROM public.consultant_assignments WHERE school_id IN (-863001, -863002))
  + (SELECT count(*)::int FROM public.profiles WHERE email = 'c0d-admin-consultor-086@test.local')
  + (SELECT count(*)::int FROM auth.users
      WHERE raw_user_meta_data ->> 'test_identifier' = 'c0d_admin_consultor_086'
         OR email = 'c0d-admin-consultor-086@test.local'),
  0,
  'Grupo D: IDs e identidad del fixture sintético están libres antes de insertar'
);

DO $fixture_d$
DECLARE
  v_user uuid;
BEGIN
  v_user := tests.create_supabase_user('c0d_admin_consultor_086', 'c0d-admin-consultor-086@test.local');
  PERFORM set_config('c0d.user_uid', v_user::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES (v_user, 'c0d-admin-consultor-086@test.local', 'C0D Consultor Admin 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES
    (-863001, 'C0D Synthetic Own School 086'),
    (-863002, 'C0D Synthetic Second School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-863011, 'C0D Synthetic Grade 086-1', 86311, false),
    (-863012, 'C0D Synthetic Grade 086-2', 86312, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES
    (v_user, 'consultor', -863001, true),
    (v_user, 'admin', NULL, true);

  INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active)
  VALUES (v_user, -863001, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES
    (-863101, -863001, 1, -863011, 'GT'),
    (-863201, -863002, 1, -863011, 'GT');
END
$fixture_d$;

SELECT is(
  tests.get_supabase_uid('c0d_admin_consultor_086'),
  current_setting('c0d.user_uid')::uuid,
  'Grupo D: el helper resuelve el usuario consultor+admin sintético al UID creado'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles
    WHERE id = current_setting('c0d.user_uid')::uuid
      AND approval_status = 'approved'
      AND must_change_password IS FALSE),
  1,
  'Grupo D: el perfil del usuario existe, aprobado y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, '') || ':' || coalesce(is_active::text, '')
                    ORDER BY role_type::text)
     FROM public.user_roles
    WHERE user_id = current_setting('c0d.user_uid')::uuid),
  ARRAY['admin::true', 'consultor:-863001:true'],
  'Grupo D: el usuario tiene exactamente dos roles activos: admin global y consultor del colegio propio'
);

SELECT is(
  (SELECT array_agg(coalesce(school_id::text, '') || ':' || coalesce(is_active::text, '')
                    || ':' || coalesce((starts_at <= now())::text, '') || ':' || (ends_at IS NULL)::text)
     FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0d.user_uid')::uuid),
  ARRAY['-863001:true:true:true'],
  'Grupo D: el consultor tiene exactamente una asignación activa y vigente, al colegio propio (ninguna al segundo)'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id IN (-863001, -863002)),
  ARRAY['(-863201,-863002,1,-863011,GT)', '(-863101,-863001,1,-863011,GT)'],
  'Grupo D: las filas sembradas de ambos colegios existen con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Mixed consultor + admin (authenticated): identity
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0d_admin_consultor_086');

SELECT is(current_user::text, 'authenticated', 'Admin-consultor: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0d.user_uid')::uuid,
  'Admin-consultor: auth.uid() coincide con el usuario creado'
);

SELECT ok(public.auth_is_assessment_admin(), 'Admin-consultor: es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-863001), 'Admin-consultor: no es directivo del colegio propio');

SELECT ok(NOT public.auth_is_school_directivo(-863002), 'Admin-consultor: no es directivo del segundo colegio');

-- ---------------------------------------------------------------------------
-- D-own: assigned school INSERT / UPDATE / DELETE succeed by admin authority
-- ---------------------------------------------------------------------------
WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-863102, -863001, 2, -863012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-863102,-863001,2,-863012,GI)'],
  'Admin-consultor propio: INSERT en su colegio asignado afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -863102),
  '(-863102,-863001,2,-863012,GI)',
  'Admin-consultor propio: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 3, generation_type = 'GI'
   WHERE id = -863101
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-863101,-863001,3,-863011,GI)'],
  'Admin-consultor propio: UPDATE en su colegio asignado afecta 1 fila con los valores nuevos'
) FROM u;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -863101),
  '(-863101,-863001,3,-863011,GI)',
  'Admin-consultor propio: la fila actualizada queda almacenada con los valores nuevos'
);

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -863102
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(d.id, d.school_id, d.year_number, d.grade_id, d.generation_type)::text),
  ARRAY['(-863102,-863001,2,-863012,GI)'],
  'Admin-consultor propio: DELETE en su colegio asignado afecta exactamente la fila insertada'
) FROM d;

-- ---------------------------------------------------------------------------
-- D-second: unassigned school INSERT / UPDATE / DELETE succeed by admin authority
-- ---------------------------------------------------------------------------
WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-863202, -863002, 2, -863012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-863202,-863002,2,-863012,GI)'],
  'Admin-consultor segundo colegio: INSERT en colegio no asignado afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -863202),
  '(-863202,-863002,2,-863012,GI)',
  'Admin-consultor segundo colegio: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 5, generation_type = 'GI'
   WHERE id = -863201
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-863201,-863002,5,-863011,GI)'],
  'Admin-consultor segundo colegio: UPDATE en colegio no asignado afecta 1 fila con los valores nuevos'
) FROM u;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -863201),
  '(-863201,-863002,5,-863011,GI)',
  'Admin-consultor segundo colegio: la fila actualizada queda almacenada con los valores nuevos'
);

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -863202
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(d.id, d.school_id, d.year_number, d.grade_id, d.generation_type)::text),
  ARRAY['(-863202,-863002,2,-863012,GI)'],
  'Admin-consultor segundo colegio: DELETE en colegio no asignado afecta exactamente la fila insertada'
) FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Group D post-checks (postgres)
-- ---------------------------------------------------------------------------
SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo D: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT count(*)::int FROM public.ab_migration_plan WHERE id IN (-863102, -863202)),
  0,
  'Como postgres D: no existen las filas borradas por el usuario consultor+admin'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id IN (-863001, -863002)),
  ARRAY['(-863201,-863002,5,-863011,GI)', '(-863101,-863001,3,-863011,GI)'],
  'Como postgres D: ambos colegios sintéticos contienen solo las filas actualizadas esperadas'
);

-- =============================================================================
-- Group E — pure global admin: writes at two schools and school_id transfers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Group E preconditions and fixtures (postgres). The user holds only an active
-- global admin role: no school role and no consultant assignment anywhere.
-- Row -864301 is moved -864001 -> -864002 -> -864001; its tuple
-- (year 4, grade -864012) is unused at both schools, so neither move collides.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.schools WHERE id IN (-864001, -864002))
  + (SELECT count(*)::int FROM public.ab_grades WHERE id IN (-864011, -864012))
  + (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id IN (-864101, -864102, -864201, -864202, -864301)
         OR school_id IN (-864001, -864002))
  + (SELECT count(*)::int FROM public.user_roles WHERE school_id IN (-864001, -864002))
  + (SELECT count(*)::int FROM public.consultant_assignments WHERE school_id IN (-864001, -864002))
  + (SELECT count(*)::int FROM public.profiles WHERE email = 'c0e-pure-admin-086@test.local')
  + (SELECT count(*)::int FROM auth.users
      WHERE raw_user_meta_data ->> 'test_identifier' = 'c0e_pure_admin_086'
         OR email = 'c0e-pure-admin-086@test.local'),
  0,
  'Grupo E: IDs e identidad del fixture sintético están libres antes de insertar'
);

DO $fixture_e$
DECLARE
  v_user uuid;
BEGIN
  v_user := tests.create_supabase_user('c0e_pure_admin_086', 'c0e-pure-admin-086@test.local');
  PERFORM set_config('c0e.user_uid', v_user::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES (v_user, 'c0e-pure-admin-086@test.local', 'C0E Pure Admin 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES
    (-864001, 'C0E Synthetic School One 086'),
    (-864002, 'C0E Synthetic School Two 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-864011, 'C0E Synthetic Grade 086-1', 86411, false),
    (-864012, 'C0E Synthetic Grade 086-2', 86412, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_user, 'admin', NULL, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES
    (-864101, -864001, 1, -864011, 'GT'),
    (-864201, -864002, 1, -864011, 'GT'),
    (-864301, -864001, 4, -864012, 'GT');
END
$fixture_e$;

SELECT is(
  tests.get_supabase_uid('c0e_pure_admin_086'),
  current_setting('c0e.user_uid')::uuid,
  'Grupo E: el helper resuelve el usuario admin puro sintético al UID creado'
);

SELECT is(
  (SELECT array_agg((id = current_setting('c0e.user_uid')::uuid)::text || '|' || email || '|' || name
                    || '|' || approval_status || '|' || must_change_password::text)
     FROM public.profiles
    WHERE id = current_setting('c0e.user_uid')::uuid
       OR email = 'c0e-pure-admin-086@test.local'),
  ARRAY['true|c0e-pure-admin-086@test.local|C0E Pure Admin 086|approved|false'],
  'Grupo E: existe exactamente un perfil del usuario, aprobado y sin cambio de contraseña forzado'
);

SELECT is(
  ARRAY(SELECT id::text || '|' || name FROM public.schools
         WHERE id IN (-864001, -864002) ORDER BY id)
  || ARRAY(SELECT id::text || '|' || name || '|' || sort_order::text || '|' || is_always_gt::text
             FROM public.ab_grades WHERE id IN (-864011, -864012) ORDER BY id),
  ARRAY['-864002|C0E Synthetic School Two 086', '-864001|C0E Synthetic School One 086',
        '-864012|C0E Synthetic Grade 086-2|86412|false', '-864011|C0E Synthetic Grade 086-1|86411|false'],
  'Grupo E: los colegios y grados sintéticos existen con los valores esperados'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, '') || ':' || coalesce(is_active::text, '')
                    ORDER BY role_type::text)
     FROM public.user_roles
    WHERE user_id = current_setting('c0e.user_uid')::uuid),
  ARRAY['admin::true'],
  'Grupo E: el usuario tiene exactamente un rol, admin global activo'
);

SELECT is(
  (SELECT count(*)::int FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0e.user_uid')::uuid
       OR school_id IN (-864001, -864002))
  + (SELECT count(*)::int FROM public.user_roles WHERE school_id IN (-864001, -864002)),
  0,
  'Grupo E: el usuario no tiene asignaciones de consultor y ningún colegio sintético tiene roles ni asignaciones'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id IN (-864001, -864002)),
  ARRAY['(-864301,-864001,4,-864012,GT)', '(-864201,-864002,1,-864011,GT)', '(-864101,-864001,1,-864011,GT)'],
  'Grupo E: las filas sembradas de ambos colegios existen con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Pure admin (authenticated): identity
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0e_pure_admin_086');

SELECT is(current_user::text, 'authenticated', 'Admin puro: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0e.user_uid')::uuid,
  'Admin puro: auth.uid() coincide con el usuario creado'
);

SELECT ok(public.auth_is_assessment_admin(), 'Admin puro: es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-864001), 'Admin puro: no es directivo del primer colegio');

SELECT ok(NOT public.auth_is_school_directivo(-864002), 'Admin puro: no es directivo del segundo colegio');

-- ---------------------------------------------------------------------------
-- E-school1: INSERT / UPDATE / DELETE succeed by admin authority
-- ---------------------------------------------------------------------------
WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-864102, -864001, 2, -864012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-864102,-864001,2,-864012,GI)'],
  'Admin puro primer colegio: INSERT afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -864102),
  '(-864102,-864001,2,-864012,GI)',
  'Admin puro primer colegio: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 3, generation_type = 'GI'
   WHERE id = -864101
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-864101,-864001,3,-864011,GI)'],
  'Admin puro primer colegio: UPDATE afecta 1 fila con los valores nuevos'
) FROM u;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -864101),
  '(-864101,-864001,3,-864011,GI)',
  'Admin puro primer colegio: la fila actualizada queda almacenada con los valores nuevos'
);

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -864102
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(d.id, d.school_id, d.year_number, d.grade_id, d.generation_type)::text),
  ARRAY['(-864102,-864001,2,-864012,GI)'],
  'Admin puro primer colegio: DELETE afecta exactamente la fila insertada'
) FROM d;

-- ---------------------------------------------------------------------------
-- E-school2: INSERT / UPDATE / DELETE succeed by admin authority
-- ---------------------------------------------------------------------------
WITH i AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-864202, -864002, 2, -864012, 'GI')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(i.id, i.school_id, i.year_number, i.grade_id, i.generation_type)::text),
  ARRAY['(-864202,-864002,2,-864012,GI)'],
  'Admin puro segundo colegio: INSERT afecta 1 fila con los valores enviados'
) FROM i;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -864202),
  '(-864202,-864002,2,-864012,GI)',
  'Admin puro segundo colegio: la fila insertada queda almacenada con los valores enviados'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 5, generation_type = 'GI'
   WHERE id = -864201
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-864201,-864002,5,-864011,GI)'],
  'Admin puro segundo colegio: UPDATE afecta 1 fila con los valores nuevos'
) FROM u;

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -864201),
  '(-864201,-864002,5,-864011,GI)',
  'Admin puro segundo colegio: la fila actualizada queda almacenada con los valores nuevos'
);

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -864202
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(d.id, d.school_id, d.year_number, d.grade_id, d.generation_type)::text),
  ARRAY['(-864202,-864002,2,-864012,GI)'],
  'Admin puro segundo colegio: DELETE afecta exactamente la fila insertada'
) FROM d;

-- ---------------------------------------------------------------------------
-- E-transfer: school_id moves -864001 -> -864002 -> -864001
-- ---------------------------------------------------------------------------
WITH u AS (
  UPDATE public.ab_migration_plan
     SET school_id = -864002
   WHERE id = -864301 AND school_id = -864001
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-864301,-864002,4,-864012,GT)'],
  'Admin puro traspaso: UPDATE mueve 1 fila del primer al segundo colegio'
) FROM u;

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text)
     FROM public.ab_migration_plan WHERE id = -864301),
  ARRAY['(-864301,-864002,4,-864012,GT)'],
  'Admin puro traspaso: la fila queda almacenada en el segundo colegio'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET school_id = -864001
   WHERE id = -864301 AND school_id = -864002
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  array_agg(row(u.id, u.school_id, u.year_number, u.grade_id, u.generation_type)::text),
  ARRAY['(-864301,-864001,4,-864012,GT)'],
  'Admin puro traspaso: UPDATE devuelve 1 fila del segundo al primer colegio'
) FROM u;

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text)
     FROM public.ab_migration_plan WHERE id = -864301),
  ARRAY['(-864301,-864001,4,-864012,GT)'],
  'Admin puro traspaso: la fila queda almacenada de nuevo en el primer colegio'
);

RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Group E post-checks (postgres)
-- ---------------------------------------------------------------------------
SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo E: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT count(*)::int FROM public.ab_migration_plan WHERE id IN (-864102, -864202)),
  0,
  'Como postgres E: no existen las filas borradas por el admin puro'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id IN (-864001, -864002)),
  ARRAY['(-864301,-864001,4,-864012,GT)', '(-864201,-864002,5,-864011,GI)', '(-864101,-864001,3,-864011,GI)'],
  'Como postgres E: ambos colegios sintéticos contienen solo las filas actualizadas y traspasadas esperadas'
);

-- ---------------------------------------------------------------------------
-- Group F: active pure consultor (single consultor role, NULL school_id) with
-- (1) no consultant assignment at all, and (2) exactly one assignment to the
-- fixture school that is inactive (past starts_at, NULL ends_at). Both read the
-- plan row under the unchanged SELECT policy; INSERT / UPDATE / DELETE are
-- denied. Synthetic IDs -865xxx.
-- ---------------------------------------------------------------------------
SELECT is(
  ARRAY[
    (SELECT count(*)::int FROM public.schools WHERE id BETWEEN -865999 AND -865000),
    (SELECT count(*)::int FROM public.ab_grades WHERE id BETWEEN -865999 AND -865000),
    (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id BETWEEN -865999 AND -865000 OR school_id BETWEEN -865999 AND -865000)
  ],
  ARRAY[0, 0, 0],
  'Grupo F: los IDs sintéticos -865xxx de colegios, grados y plan están libres'
);

SELECT ok(
  tests.get_supabase_uid('c0f_unassigned_086') IS NULL
    AND tests.get_supabase_uid('c0f_inactive_086') IS NULL
    AND (SELECT count(*) FROM auth.users
          WHERE email IN ('c0f-unassigned-086@test.local', 'c0f-inactive-086@test.local')) = 0
    AND (SELECT count(*) FROM public.profiles
          WHERE email IN ('c0f-unassigned-086@test.local', 'c0f-inactive-086@test.local')) = 0,
  'Grupo F: las identidades sintéticas no existen antes del fixture'
);

DO $fixture_f$
DECLARE
  v_unassigned uuid;
  v_inactive uuid;
BEGIN
  v_unassigned := tests.create_supabase_user('c0f_unassigned_086', 'c0f-unassigned-086@test.local');
  v_inactive := tests.create_supabase_user('c0f_inactive_086', 'c0f-inactive-086@test.local');
  PERFORM set_config('c0f.unassigned_uid', v_unassigned::text, true);
  PERFORM set_config('c0f.inactive_uid', v_inactive::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES
    (v_unassigned, 'c0f-unassigned-086@test.local', 'C0F Unassigned Consultor 086', 'approved', false),
    (v_inactive, 'c0f-inactive-086@test.local', 'C0F Inactive Assignment Consultor 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES (-865001, 'C0F Synthetic School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-865011, 'C0F Synthetic Grade 086-1', 86511, false),
    (-865012, 'C0F Synthetic Grade 086-2', 86512, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES
    (v_unassigned, 'consultor', NULL, true),
    (v_inactive, 'consultor', NULL, true);

  INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, starts_at, ends_at)
  VALUES (v_inactive, -865001, false, '2020-01-01 00:00:00+00'::timestamptz, NULL);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-865101, -865001, 1, -865011, 'GT');
END
$fixture_f$;

SELECT is(
  tests.get_supabase_uid('c0f_unassigned_086'),
  current_setting('c0f.unassigned_uid')::uuid,
  'Grupo F: el helper resuelve el consultor sin asignación al UID creado'
);

SELECT is(
  tests.get_supabase_uid('c0f_inactive_086'),
  current_setting('c0f.inactive_uid')::uuid,
  'Grupo F: el helper resuelve el consultor con asignación inactiva al UID creado'
);

SELECT is(
  (SELECT array_agg(
            CASE id
              WHEN current_setting('c0f.unassigned_uid')::uuid THEN 'unassigned'
              WHEN current_setting('c0f.inactive_uid')::uuid THEN 'inactive'
            END || ':' || email || ':' || approval_status || ':' || must_change_password::text
            ORDER BY email)
     FROM public.profiles
    WHERE id IN (current_setting('c0f.unassigned_uid')::uuid, current_setting('c0f.inactive_uid')::uuid)),
  ARRAY[
    'inactive:c0f-inactive-086@test.local:approved:false',
    'unassigned:c0f-unassigned-086@test.local:approved:false'
  ],
  'Grupo F: ambos perfiles sintéticos existen, aprobados y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, 'NULL') || ':' || coalesce(is_active::text, 'NULL')
            ORDER BY role_type::text, school_id, is_active)
     FROM public.user_roles
    WHERE user_id = current_setting('c0f.unassigned_uid')::uuid),
  ARRAY['consultor:NULL:true'],
  'Grupo F: el consultor sin asignación tiene como único rol (de cualquier estado) consultor activo sin colegio'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, 'NULL') || ':' || coalesce(is_active::text, 'NULL')
            ORDER BY role_type::text, school_id, is_active)
     FROM public.user_roles
    WHERE user_id = current_setting('c0f.inactive_uid')::uuid),
  ARRAY['consultor:NULL:true'],
  'Grupo F: el consultor con asignación inactiva tiene como único rol (de cualquier estado) consultor activo sin colegio'
);

SELECT is(
  (SELECT count(*)::int FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0f.unassigned_uid')::uuid),
  0,
  'Grupo F: el consultor sin asignación no tiene ninguna asignación de consultor'
);

SELECT is(
  (SELECT array_agg(row(school_id, is_active,
                        starts_at = '2020-01-01 00:00:00+00'::timestamptz,
                        starts_at < now(),
                        ends_at)::text)
     FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0f.inactive_uid')::uuid),
  ARRAY['(-865001,f,t,t,)'],
  'Grupo F: el consultor con asignación inactiva tiene exactamente una asignación inactiva, iniciada en el pasado y sin término'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name ORDER BY id)
     FROM public.schools WHERE id BETWEEN -865999 AND -865000),
  ARRAY['-865001:C0F Synthetic School 086'],
  'Grupo F: el colegio sintético existe con los valores esperados'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name || ':' || sort_order::text || ':' || is_always_gt::text ORDER BY id)
     FROM public.ab_grades WHERE id BETWEEN -865999 AND -865000),
  ARRAY['-865012:C0F Synthetic Grade 086-2:86512:false', '-865011:C0F Synthetic Grade 086-1:86511:false'],
  'Grupo F: los grados sintéticos existen con los valores esperados'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -865001 OR id BETWEEN -865999 AND -865000),
  ARRAY['(-865101,-865001,1,-865011,GT)'],
  'Grupo F: el colegio sintético contiene solo la fila sembrada del plan con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Group F1: active pure consultor with no assignment (authenticated)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0f_unassigned_086');

SELECT is(current_user::text, 'authenticated', 'Grupo F sin asignación: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0f.unassigned_uid')::uuid,
  'Grupo F sin asignación: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Grupo F sin asignación: no es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-865001), 'Grupo F sin asignación: no es directivo del colegio sintético');

SELECT ok(public.password_change_gate_ok(), 'Grupo F sin asignación: la compuerta de cambio de contraseña permite el acceso');

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -865001),
  ARRAY['(-865101,-865001,1,-865011,GT)'],
  'Grupo F sin asignación: lee el conjunto completo de filas del plan del colegio sintético'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-865201, -865001, 2, -865011, 'GI') $$,
  '42501',
  NULL::text,
  'Grupo F sin asignación: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-865201, -865001, 2, -865011, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Grupo F sin asignación: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 4, generation_type = 'GI'
   WHERE id = -865101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo F sin asignación: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -865101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo F sin asignación: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo F sin asignación: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -865001 OR id BETWEEN -865999 AND -865000),
  ARRAY['(-865101,-865001,1,-865011,GT)'],
  'Como postgres F sin asignación: el colegio sintético conserva solo la fila original sin cambios y sin la fila bloqueada'
);

-- ---------------------------------------------------------------------------
-- Group F2: active pure consultor whose only assignment is inactive
-- (authenticated)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0f_inactive_086');

SELECT is(current_user::text, 'authenticated', 'Grupo F asignación inactiva: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0f.inactive_uid')::uuid,
  'Grupo F asignación inactiva: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Grupo F asignación inactiva: no es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-865001), 'Grupo F asignación inactiva: no es directivo del colegio sintético');

SELECT ok(public.password_change_gate_ok(), 'Grupo F asignación inactiva: la compuerta de cambio de contraseña permite el acceso');

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -865001),
  ARRAY['(-865101,-865001,1,-865011,GT)'],
  'Grupo F asignación inactiva: lee el conjunto completo de filas del plan del colegio sintético'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-865202, -865001, 3, -865012, 'GI') $$,
  '42501',
  NULL::text,
  'Grupo F asignación inactiva: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-865202, -865001, 3, -865012, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Grupo F asignación inactiva: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 5, grade_id = -865012, generation_type = 'GI'
   WHERE id = -865101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo F asignación inactiva: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -865101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo F asignación inactiva: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo F asignación inactiva: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -865001 OR id BETWEEN -865999 AND -865000),
  ARRAY['(-865101,-865001,1,-865011,GT)'],
  'Como postgres F asignación inactiva: el colegio sintético conserva solo la fila original sin cambios y sin la fila bloqueada'
);

-- ---------------------------------------------------------------------------
-- Group G: pure consultor (single consultor role, NULL school_id) with
-- (1) an INACTIVE consultor role but exactly one otherwise live assignment to
-- the fixture school (active, past starts_at, NULL ends_at), and (2) an active
-- consultor role whose only assignment to the fixture school is active but
-- EXPIRED (starts_at 2020-01-01, ends_at 2021-01-01). Both read the plan row
-- under the unchanged SELECT policy; INSERT / UPDATE / DELETE are denied.
-- Synthetic IDs -866xxx.
-- ---------------------------------------------------------------------------
SELECT is(
  ARRAY[
    (SELECT count(*)::int FROM public.schools WHERE id BETWEEN -866999 AND -866000),
    (SELECT count(*)::int FROM public.ab_grades WHERE id BETWEEN -866999 AND -866000),
    (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id BETWEEN -866999 AND -866000 OR school_id BETWEEN -866999 AND -866000)
  ],
  ARRAY[0, 0, 0],
  'Grupo G: los IDs sintéticos -866xxx de colegios, grados y plan están libres'
);

SELECT ok(
  tests.get_supabase_uid('c0g_inactive_role_086') IS NULL
    AND tests.get_supabase_uid('c0g_expired_086') IS NULL
    AND (SELECT count(*) FROM auth.users
          WHERE email IN ('c0g-inactive-role-086@test.local', 'c0g-expired-086@test.local')) = 0
    AND (SELECT count(*) FROM public.profiles
          WHERE email IN ('c0g-inactive-role-086@test.local', 'c0g-expired-086@test.local')) = 0,
  'Grupo G: las identidades sintéticas no existen antes del fixture'
);

DO $fixture_g$
DECLARE
  v_inactive_role uuid;
  v_expired uuid;
BEGIN
  v_inactive_role := tests.create_supabase_user('c0g_inactive_role_086', 'c0g-inactive-role-086@test.local');
  v_expired := tests.create_supabase_user('c0g_expired_086', 'c0g-expired-086@test.local');
  PERFORM set_config('c0g.inactive_role_uid', v_inactive_role::text, true);
  PERFORM set_config('c0g.expired_uid', v_expired::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES
    (v_inactive_role, 'c0g-inactive-role-086@test.local', 'C0G Inactive Role Consultor 086', 'approved', false),
    (v_expired, 'c0g-expired-086@test.local', 'C0G Expired Assignment Consultor 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES (-866001, 'C0G Synthetic School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-866011, 'C0G Synthetic Grade 086-1', 86611, false),
    (-866012, 'C0G Synthetic Grade 086-2', 86612, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES
    (v_inactive_role, 'consultor', NULL, false),
    (v_expired, 'consultor', NULL, true);

  INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, starts_at, ends_at)
  VALUES
    (v_inactive_role, -866001, true, '2020-01-01 00:00:00+00'::timestamptz, NULL),
    (v_expired, -866001, true, '2020-01-01 00:00:00+00'::timestamptz, '2021-01-01 00:00:00+00'::timestamptz);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-866101, -866001, 1, -866011, 'GT');
END
$fixture_g$;

SELECT is(
  tests.get_supabase_uid('c0g_inactive_role_086'),
  current_setting('c0g.inactive_role_uid')::uuid,
  'Grupo G: el helper resuelve el consultor con rol inactivo al UID creado'
);

SELECT is(
  tests.get_supabase_uid('c0g_expired_086'),
  current_setting('c0g.expired_uid')::uuid,
  'Grupo G: el helper resuelve el consultor con asignación vencida al UID creado'
);

SELECT is(
  (SELECT array_agg(
            CASE id
              WHEN current_setting('c0g.inactive_role_uid')::uuid THEN 'inactive_role'
              WHEN current_setting('c0g.expired_uid')::uuid THEN 'expired'
            END || ':' || email || ':' || approval_status || ':' || must_change_password::text
            ORDER BY email)
     FROM public.profiles
    WHERE id IN (current_setting('c0g.inactive_role_uid')::uuid, current_setting('c0g.expired_uid')::uuid)),
  ARRAY[
    'expired:c0g-expired-086@test.local:approved:false',
    'inactive_role:c0g-inactive-role-086@test.local:approved:false'
  ],
  'Grupo G: ambos perfiles sintéticos existen, aprobados y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, 'NULL') || ':' || coalesce(is_active::text, 'NULL')
            ORDER BY role_type::text, school_id, is_active)
     FROM public.user_roles
    WHERE user_id = current_setting('c0g.inactive_role_uid')::uuid),
  ARRAY['consultor:NULL:false'],
  'Grupo G: el consultor con rol inactivo tiene como único rol (de cualquier estado) consultor inactivo sin colegio'
);

SELECT is(
  (SELECT array_agg(role_type::text || ':' || coalesce(school_id::text, 'NULL') || ':' || coalesce(is_active::text, 'NULL')
            ORDER BY role_type::text, school_id, is_active)
     FROM public.user_roles
    WHERE user_id = current_setting('c0g.expired_uid')::uuid),
  ARRAY['consultor:NULL:true'],
  'Grupo G: el consultor con asignación vencida tiene como único rol (de cualquier estado) consultor activo sin colegio'
);

SELECT is(
  (SELECT array_agg(row(school_id, is_active,
                        starts_at = '2020-01-01 00:00:00+00'::timestamptz,
                        starts_at < now(),
                        ends_at IS NULL,
                        starts_at <= now() AND (ends_at IS NULL OR ends_at > now()))::text)
     FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0g.inactive_role_uid')::uuid),
  ARRAY['(-866001,t,t,t,t,t)'],
  'Grupo G: el consultor con rol inactivo tiene exactamente una asignación activa, iniciada en el pasado, sin término y vigente'
);

SELECT is(
  (SELECT array_agg(row(school_id, is_active,
                        starts_at = '2020-01-01 00:00:00+00'::timestamptz,
                        ends_at = '2021-01-01 00:00:00+00'::timestamptz,
                        ends_at > starts_at,
                        ends_at < now(),
                        starts_at <= now() AND (ends_at IS NULL OR ends_at > now()))::text)
     FROM public.consultant_assignments
    WHERE consultant_id = current_setting('c0g.expired_uid')::uuid),
  ARRAY['(-866001,t,t,t,t,t,f)'],
  'Grupo G: el consultor con asignación vencida tiene exactamente una asignación activa con término posterior al inicio y ya pasado, no vigente'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name ORDER BY id)
     FROM public.schools WHERE id BETWEEN -866999 AND -866000),
  ARRAY['-866001:C0G Synthetic School 086'],
  'Grupo G: el colegio sintético existe con los valores esperados'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name || ':' || sort_order::text || ':' || is_always_gt::text ORDER BY id)
     FROM public.ab_grades WHERE id BETWEEN -866999 AND -866000),
  ARRAY['-866012:C0G Synthetic Grade 086-2:86612:false', '-866011:C0G Synthetic Grade 086-1:86611:false'],
  'Grupo G: los grados sintéticos existen con los valores esperados'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -866001 OR id BETWEEN -866999 AND -866000),
  ARRAY['(-866101,-866001,1,-866011,GT)'],
  'Grupo G: el colegio sintético contiene solo la fila sembrada del plan con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Group G1: pure consultor with inactive consultor role and a live assignment
-- (authenticated)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0g_inactive_role_086');

SELECT is(current_user::text, 'authenticated', 'Grupo G rol inactivo: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0g.inactive_role_uid')::uuid,
  'Grupo G rol inactivo: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Grupo G rol inactivo: no es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-866001), 'Grupo G rol inactivo: no es directivo del colegio sintético');

SELECT ok(public.password_change_gate_ok(), 'Grupo G rol inactivo: la compuerta de cambio de contraseña permite el acceso');

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -866001),
  ARRAY['(-866101,-866001,1,-866011,GT)'],
  'Grupo G rol inactivo: lee el conjunto completo de filas del plan del colegio sintético'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-866201, -866001, 2, -866011, 'GI') $$,
  '42501',
  NULL::text,
  'Grupo G rol inactivo: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-866201, -866001, 2, -866011, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Grupo G rol inactivo: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 4, generation_type = 'GI'
   WHERE id = -866101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo G rol inactivo: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -866101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo G rol inactivo: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo G rol inactivo: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -866001 OR id BETWEEN -866999 AND -866000),
  ARRAY['(-866101,-866001,1,-866011,GT)'],
  'Como postgres G rol inactivo: el colegio sintético conserva solo la fila original sin cambios y sin la fila bloqueada'
);

-- ---------------------------------------------------------------------------
-- Group G2: pure consultor with active consultor role whose only assignment
-- is expired (authenticated)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0g_expired_086');

SELECT is(current_user::text, 'authenticated', 'Grupo G asignación vencida: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0g.expired_uid')::uuid,
  'Grupo G asignación vencida: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Grupo G asignación vencida: no es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-866001), 'Grupo G asignación vencida: no es directivo del colegio sintético');

SELECT ok(public.password_change_gate_ok(), 'Grupo G asignación vencida: la compuerta de cambio de contraseña permite el acceso');

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan WHERE school_id = -866001),
  ARRAY['(-866101,-866001,1,-866011,GT)'],
  'Grupo G asignación vencida: lee el conjunto completo de filas del plan del colegio sintético'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-866202, -866001, 3, -866012, 'GI') $$,
  '42501',
  NULL::text,
  'Grupo G asignación vencida: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-866202, -866001, 3, -866012, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Grupo G asignación vencida: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 5, grade_id = -866012, generation_type = 'GI'
   WHERE id = -866101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo G asignación vencida: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -866101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo G asignación vencida: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo G asignación vencida: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -866001 OR id BETWEEN -866999 AND -866000),
  ARRAY['(-866101,-866001,1,-866011,GT)'],
  'Como postgres G asignación vencida: el colegio sintético conserva solo la fila original sin cambios y sin la fila bloqueada'
);

-- ---------------------------------------------------------------------------
-- Group H: pure active docente (single active docente role whose sole
-- school_id is the fixture school; no consultor / admin / equipo_directivo
-- role and no consultant assignment). The restrictive write-boundary policies
-- only admit an active admin or an active equipo_directivo of the plan's
-- school, so the teacher role grants no write: the docente reads the plan row
-- under the unchanged SELECT policy while INSERT / UPDATE / DELETE are denied.
-- Database-only coverage; it does not enable any application read path.
-- Synthetic IDs -867xxx.
-- ---------------------------------------------------------------------------
SELECT is(
  ARRAY[
    (SELECT count(*)::int FROM public.schools WHERE id BETWEEN -867999 AND -867000),
    (SELECT count(*)::int FROM public.ab_grades WHERE id BETWEEN -867999 AND -867000),
    (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id BETWEEN -867999 AND -867000 OR school_id BETWEEN -867999 AND -867000)
  ],
  ARRAY[0, 0, 0],
  'Grupo H: los IDs sintéticos -867xxx de colegios, grados y plan están libres'
);

SELECT ok(
  tests.get_supabase_uid('c0h_docente_086') IS NULL
    AND (SELECT count(*) FROM auth.users WHERE email = 'c0h-docente-086@test.local') = 0
    AND (SELECT count(*) FROM public.profiles WHERE email = 'c0h-docente-086@test.local') = 0,
  'Grupo H: la identidad sintética del docente no existe antes del fixture'
);

DO $fixture_h$
DECLARE
  v_docente uuid;
BEGIN
  v_docente := tests.create_supabase_user('c0h_docente_086', 'c0h-docente-086@test.local');
  PERFORM set_config('c0h.docente_uid', v_docente::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES (v_docente, 'c0h-docente-086@test.local', 'C0H Pure Docente 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES (-867001, 'C0H Synthetic School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-867011, 'C0H Synthetic Grade 086-1', 86711, false),
    (-867012, 'C0H Synthetic Grade 086-2', 86712, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_docente, 'docente', -867001, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-867101, -867001, 1, -867011, 'GT');
END
$fixture_h$;

SELECT is(
  tests.get_supabase_uid('c0h_docente_086'),
  current_setting('c0h.docente_uid')::uuid,
  'Grupo H: el helper resuelve el docente al UID creado'
);

SELECT is(
  (SELECT array_agg(
            CASE WHEN id = current_setting('c0h.docente_uid')::uuid THEN 'docente' ELSE id::text END
              || ':' || email || ':' || name || ':' || approval_status || ':' || must_change_password::text
            ORDER BY email)
     FROM public.profiles
    WHERE id = current_setting('c0h.docente_uid')::uuid OR email = 'c0h-docente-086@test.local'),
  ARRAY['docente:c0h-docente-086@test.local:C0H Pure Docente 086:approved:false'],
  'Grupo H: existe exactamente un perfil sintético del docente, aprobado y sin cambio de contraseña forzado'
);

SELECT is(
  (SELECT array_agg(
            CASE WHEN user_id = current_setting('c0h.docente_uid')::uuid THEN 'docente_user' ELSE user_id::text END
              || ':' || role_type::text || ':' || coalesce(school_id::text, 'NULL') || ':' || coalesce(is_active::text, 'NULL')
            ORDER BY role_type::text, school_id, is_active)
     FROM public.user_roles
    WHERE user_id = current_setting('c0h.docente_uid')::uuid OR school_id BETWEEN -867999 AND -867000),
  ARRAY['docente_user:docente:-867001:true'],
  'Grupo H: el docente tiene como único rol (de cualquier estado) docente activo en el colegio sintético, que no tiene otros roles'
);

SELECT is(
  ARRAY[
    (SELECT count(*)::int FROM public.consultant_assignments
      WHERE consultant_id = current_setting('c0h.docente_uid')::uuid),
    (SELECT count(*)::int FROM public.consultant_assignments
      WHERE school_id BETWEEN -867999 AND -867000)
  ],
  ARRAY[0, 0],
  'Grupo H: el docente no tiene asignaciones de consultor y el colegio sintético tampoco'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name ORDER BY id)
     FROM public.schools WHERE id BETWEEN -867999 AND -867000),
  ARRAY['-867001:C0H Synthetic School 086'],
  'Grupo H: el colegio sintético existe con los valores esperados'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name || ':' || sort_order::text || ':' || is_always_gt::text ORDER BY id)
     FROM public.ab_grades WHERE id BETWEEN -867999 AND -867000),
  ARRAY['-867012:C0H Synthetic Grade 086-2:86712:false', '-867011:C0H Synthetic Grade 086-1:86711:false'],
  'Grupo H: los grados sintéticos existen con los valores esperados'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -867001 OR id BETWEEN -867999 AND -867000),
  ARRAY['(-867101,-867001,1,-867011,GT)'],
  'Grupo H: el colegio sintético contiene solo la fila sembrada del plan con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Group H: pure active docente (authenticated)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('c0h_docente_086');

SELECT is(current_user::text, 'authenticated', 'Grupo H docente: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0h.docente_uid')::uuid,
  'Grupo H docente: auth.uid() coincide con el usuario del helper'
);

SELECT ok(NOT public.auth_is_assessment_admin(), 'Grupo H docente: no es admin de evaluación');

SELECT ok(NOT public.auth_is_school_directivo(-867001), 'Grupo H docente: no es directivo del colegio sintético');

SELECT ok(public.password_change_gate_ok(), 'Grupo H docente: la compuerta de cambio de contraseña permite el acceso');

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -867001 OR id BETWEEN -867999 AND -867000),
  ARRAY['(-867101,-867001,1,-867011,GT)'],
  'Grupo H docente: lee el conjunto completo de filas del plan del colegio sintético'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-867201, -867001, 2, -867011, 'GI') $$,
  '42501',
  NULL::text,
  'Grupo H docente: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-867201, -867001, 2, -867011, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Grupo H docente: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 2, grade_id = -867012, generation_type = 'GI'
   WHERE id = -867101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo H docente: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -867101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo H docente: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo H docente: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -867001 OR id BETWEEN -867999 AND -867000),
  ARRAY['(-867101,-867001,1,-867011,GT)'],
  'Como postgres H docente: el colegio sintético conserva solo la fila original sin cambios y sin la fila bloqueada'
);

-- ---------------------------------------------------------------------------
-- Group I: real anon database role with no JWT subject (neither
-- request.jwt.claim.sub nor request.jwt.claims carries a sub), so auth.uid()
-- is NULL; no user, profile, role or assignment exists for it. anon holds the
-- table and helper grants, so the restrictive write-boundary policies
-- (TO public) are what deny INSERT / UPDATE / DELETE.
-- forced_password_change_guard is TO authenticated and does not apply to anon.
-- The unchanged permissive SELECT policy (TO public, USING true) lets anon read
-- the plan row: this records existing database behavior only and does not
-- decide any application anonymous-access policy or enable an API path.
-- Synthetic IDs -868xxx.
-- ---------------------------------------------------------------------------
SELECT is(
  ARRAY[
    (SELECT count(*)::int FROM public.schools WHERE id BETWEEN -868999 AND -868000),
    (SELECT count(*)::int FROM public.ab_grades WHERE id BETWEEN -868999 AND -868000),
    (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id BETWEEN -868999 AND -868000 OR school_id BETWEEN -868999 AND -868000)
  ],
  ARRAY[0, 0, 0],
  'Grupo I: los IDs sintéticos -868xxx de colegios, grados y plan están libres'
);

DO $fixture_i$
BEGIN
  INSERT INTO public.schools (id, name)
  VALUES (-868001, 'C0I Synthetic School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-868011, 'C0I Synthetic Grade 086-1', 86811, false),
    (-868012, 'C0I Synthetic Grade 086-2', 86812, false);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-868101, -868001, 1, -868011, 'GT');
END
$fixture_i$;

SELECT is(
  (SELECT array_agg(id::text || ':' || name ORDER BY id)
     FROM public.schools WHERE id BETWEEN -868999 AND -868000),
  ARRAY['-868001:C0I Synthetic School 086'],
  'Grupo I: el colegio sintético existe con los valores esperados'
);

SELECT is(
  (SELECT array_agg(id::text || ':' || name || ':' || sort_order::text || ':' || is_always_gt::text ORDER BY id)
     FROM public.ab_grades WHERE id BETWEEN -868999 AND -868000),
  ARRAY['-868012:C0I Synthetic Grade 086-2:86812:false', '-868011:C0I Synthetic Grade 086-1:86811:false'],
  'Grupo I: los grados sintéticos existen con los valores esperados'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -868001 OR id BETWEEN -868999 AND -868000),
  ARRAY['(-868101,-868001,1,-868011,GT)'],
  'Grupo I: el colegio sintético contiene solo la fila sembrada del plan con los valores esperados'
);

-- ---------------------------------------------------------------------------
-- Group I: anon (no JWT subject)
-- ---------------------------------------------------------------------------
RESET ROLE;
SELECT tests.clear_authentication();
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;

SELECT is(current_user::text, 'anon', 'Grupo I anon: rol efectivo es anon');

SELECT ok(
  (SELECT NOT r.rolsuper AND NOT r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user),
  'Grupo I anon: el rol no es superusuario ni omite RLS'
);

SELECT ok(
  nullif(current_setting('request.jwt.claim.sub', true), '') IS NULL
    AND (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub') IS NULL,
  'Grupo I anon: request.jwt.claim.sub y request.jwt.claims no llevan sujeto'
);

SELECT ok(auth.uid() IS NULL, 'Grupo I anon: auth.uid() es NULL');

SELECT is(public.auth_is_assessment_admin(), false, 'Grupo I anon: auth_is_assessment_admin() devuelve false');

SELECT is(
  public.auth_is_school_directivo(-868001),
  false,
  'Grupo I anon: auth_is_school_directivo() del colegio sintético devuelve false'
);

SELECT is(
  ARRAY[
    has_schema_privilege('anon', 'public', 'USAGE'),
    has_schema_privilege('anon', 'auth', 'USAGE'),
    has_table_privilege('anon', 'public.ab_migration_plan', 'SELECT'),
    has_table_privilege('anon', 'public.ab_migration_plan', 'INSERT'),
    has_table_privilege('anon', 'public.ab_migration_plan', 'UPDATE'),
    has_table_privilege('anon', 'public.ab_migration_plan', 'DELETE'),
    has_function_privilege('anon', 'auth.uid()', 'EXECUTE'),
    has_function_privilege('anon', 'public.auth_is_assessment_admin()', 'EXECUTE'),
    has_function_privilege('anon', 'public.auth_is_school_directivo(integer)', 'EXECUTE')
  ],
  ARRAY[true, true, true, true, true, true, true, true, true],
  'Grupo I anon: tiene USAGE en public/auth, SELECT/INSERT/UPDATE/DELETE en el plan y EXECUTE en los helpers'
);

SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.ab_migration_plan'::regclass)
    AND row_security_active('public.ab_migration_plan'),
  'Grupo I anon: RLS está habilitado y activo para anon en ab_migration_plan'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -868001 OR id BETWEEN -868999 AND -868000),
  ARRAY['(-868101,-868001,1,-868011,GT)'],
  'Grupo I anon: lee el conjunto completo de filas del plan del colegio sintético'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-868201, -868001, 2, -868011, 'GI') $$,
  '42501',
  NULL::text,
  'Grupo I anon: INSERT en ab_migration_plan es bloqueado con 42501'
);

SELECT throws_like(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-868201, -868001, 2, -868011, 'GI') $$,
  '%"ab_migration_plan_write_boundary_insert"%',
  'Grupo I anon: el INSERT bloqueado lo rechaza la política de límite de escritura'
);

WITH u AS (
  UPDATE public.ab_migration_plan
     SET year_number = 2, grade_id = -868012, generation_type = 'GI'
   WHERE id = -868101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo I anon: UPDATE de la fila visible afecta 0 filas') FROM u;

WITH d AS (
  DELETE FROM public.ab_migration_plan
   WHERE id = -868101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo I anon: DELETE de la fila visible afecta 0 filas') FROM d;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT ok(
  current_user::text = 'postgres'
    AND (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = 'postgres'),
  'Grupo I anon: verificación posterior corre como postgres, que omite RLS'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -868001 OR id BETWEEN -868999 AND -868000),
  ARRAY['(-868101,-868001,1,-868011,GT)'],
  'Como postgres I anon: el colegio sintético conserva solo la fila original sin cambios y sin la fila bloqueada'
);

-- ---------------------------------------------------------------------------
-- Group J: the same approved, active, literal admin before/during/after a
-- forced-password flag. Synthetic IDs -869xxx.
-- ---------------------------------------------------------------------------
SELECT is(
  ARRAY[
    (SELECT count(*)::int FROM public.schools WHERE id BETWEEN -869999 AND -869000),
    (SELECT count(*)::int FROM public.ab_grades WHERE id BETWEEN -869999 AND -869000),
    (SELECT count(*)::int FROM public.ab_migration_plan
      WHERE id BETWEEN -869999 AND -869000 OR school_id BETWEEN -869999 AND -869000),
    (SELECT count(*)::int FROM auth.users
      WHERE raw_user_meta_data ->> 'test_identifier' = 'c0j_admin_086'
         OR email = 'c0j-admin-086@test.local')
  ],
  ARRAY[0, 0, 0, 0],
  'Grupo J: los IDs -869xxx y la identidad sintética están libres'
);

DO $fixture_j$
DECLARE
  v_admin uuid;
BEGIN
  v_admin := tests.create_supabase_user('c0j_admin_086', 'c0j-admin-086@test.local');
  PERFORM set_config('c0j.admin_uid', v_admin::text, true);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES (v_admin, 'c0j-admin-086@test.local', 'C0J Admin 086', 'approved', false);

  INSERT INTO public.schools (id, name)
  VALUES (-869001, 'C0J Synthetic School 086');

  INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt)
  VALUES
    (-869011, 'C0J Synthetic Grade 086-1', 86911, false),
    (-869012, 'C0J Synthetic Grade 086-2', 86912, false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_admin, 'admin', NULL, true);

  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-869101, -869001, 1, -869011, 'GT');
END
$fixture_j$;

SELECT is(
  tests.get_supabase_uid('c0j_admin_086'),
  current_setting('c0j.admin_uid')::uuid,
  'Grupo J: el helper resuelve el admin sintético al UID creado'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles
    WHERE id = current_setting('c0j.admin_uid')::uuid
      AND approval_status = 'approved'
      AND must_change_password IS FALSE),
  1,
  'Grupo J: el perfil del admin está aprobado y sin cambio forzado'
);

SELECT is(
  (SELECT count(*)::int FROM public.user_roles
    WHERE user_id = current_setting('c0j.admin_uid')::uuid
      AND role_type = 'admin'
      AND school_id IS NULL
      AND is_active),
  1,
  'Grupo J: el actor tiene un rol admin global activo y literal'
);

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -869001 OR id BETWEEN -869999 AND -869000),
  ARRAY['(-869101,-869001,1,-869011,GT)'],
  'Grupo J: el fixture contiene exactamente la fila inicial esperada'
);

SELECT is(
  (SELECT ARRAY[permissive, cmd, roles::text, qual, with_check]
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ab_migration_plan'
      AND policyname = 'forced_password_change_guard'),
  ARRAY[
    'RESTRICTIVE',
    'ALL',
    '{authenticated}',
    '( SELECT password_change_gate_ok() AS password_change_gate_ok)',
    '( SELECT password_change_gate_ok() AS password_change_gate_ok)'
  ],
  'Grupo J: el guard es RESTRICTIVE FOR ALL TO authenticated con el predicado canónico en USING y WITH CHECK'
);

-- Unflagged control: the authenticated admin can read and perform all writes.
SELECT tests.authenticate_as('c0j_admin_086');

SELECT is(current_user::text, 'authenticated', 'Grupo J control: rol efectivo es authenticated');

SELECT is(
  auth.uid(),
  current_setting('c0j.admin_uid')::uuid,
  'Grupo J control: auth.uid() coincide con el mismo admin sintético'
);

SELECT ok(
  (SELECT NOT r.rolsuper AND NOT r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user),
  'Grupo J control: authenticated no es superusuario ni tiene BYPASSRLS'
);

SELECT ok(public.password_change_gate_ok(), 'Grupo J control: la compuerta permite al admin sin flag');

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -869101),
  '(-869101,-869001,1,-869011,GT)',
  'Grupo J control: SELECT observa la fila exacta'
);

WITH inserted AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-869102, -869001, 2, -869012, 'GT')
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text FROM inserted),
  '(-869102,-869001,2,-869012,GT)',
  'Grupo J control: INSERT devuelve exactamente los valores escritos'
);

WITH updated AS (
  UPDATE public.ab_migration_plan
     SET year_number = 3, grade_id = -869012, generation_type = 'GT'
   WHERE id = -869101
  RETURNING id, school_id, year_number, grade_id, generation_type
)
SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text FROM updated),
  '(-869101,-869001,3,-869012,GT)',
  'Grupo J control: UPDATE devuelve exactamente los valores nuevos'
);

WITH deleted AS (
  DELETE FROM public.ab_migration_plan WHERE id = -869102 RETURNING id
)
SELECT is(count(*)::int, 1, 'Grupo J control: DELETE elimina exactamente la fila insertada') FROM deleted;

RESET ROLE;
SELECT tests.clear_authentication();

DO $capture_j$
BEGIN
  PERFORM set_config(
    'c0j.rowset_before_flag',
    (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)::text
       FROM public.ab_migration_plan
      WHERE school_id = -869001 OR id BETWEEN -869999 AND -869000),
    true
  );
END
$capture_j$;

UPDATE public.profiles
   SET must_change_password = true
 WHERE id = current_setting('c0j.admin_uid')::uuid;

-- Flagged phase: the same JWT identity is denied by the restrictive guard.
SELECT tests.authenticate_as('c0j_admin_086');

SELECT ok(
  current_user::text = 'authenticated'
    AND auth.uid() = current_setting('c0j.admin_uid')::uuid,
  'Grupo J flag: conserva el rol authenticated y el mismo auth.uid()'
);

SELECT is(public.password_change_gate_ok(), false, 'Grupo J flag: la compuerta rechaza al mismo admin');

SELECT is(
  (SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -869101),
  0,
  'Grupo J flag: SELECT no expone la fila del plan'
);

SELECT throws_ok(
  $$ INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
     VALUES (-869103, -869001, 3, -869011, 'GT') $$,
  '42501',
  NULL::text,
  'Grupo J flag: INSERT es rechazado con 42501'
);

WITH updated AS (
  UPDATE public.ab_migration_plan
     SET year_number = 2, grade_id = -869011, generation_type = 'GT'
   WHERE id = -869101
  RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo J flag: UPDATE afecta 0 filas') FROM updated;

WITH deleted AS (
  DELETE FROM public.ab_migration_plan WHERE id = -869101 RETURNING id
)
SELECT is(count(*)::int, 0, 'Grupo J flag: DELETE afecta 0 filas') FROM deleted;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)::text
     FROM public.ab_migration_plan
    WHERE school_id = -869001 OR id BETWEEN -869999 AND -869000),
  current_setting('c0j.rowset_before_flag'),
  'Grupo J flag: el conjunto de filas queda byte-for-byte intacto tras los rechazos'
);

UPDATE public.profiles
   SET must_change_password = false
 WHERE id = current_setting('c0j.admin_uid')::uuid;

-- Unflag the same actor: ordinary reads and writes resume.
SELECT tests.authenticate_as('c0j_admin_086');

SELECT ok(public.password_change_gate_ok(), 'Grupo J reanudación: la compuerta permite al mismo admin sin flag');

SELECT is(
  (SELECT row(id, school_id, year_number, grade_id, generation_type)::text
     FROM public.ab_migration_plan WHERE id = -869101),
  '(-869101,-869001,3,-869012,GT)',
  'Grupo J reanudación: SELECT vuelve a observar la fila intacta'
);

WITH inserted AS (
  INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type)
  VALUES (-869104, -869001, 1, -869011, 'GT')
  RETURNING id
)
SELECT is(count(*)::int, 1, 'Grupo J reanudación: INSERT vuelve a afectar 1 fila') FROM inserted;

WITH updated AS (
  UPDATE public.ab_migration_plan
     SET year_number = 2, grade_id = -869011, generation_type = 'GT'
   WHERE id = -869101
  RETURNING id
)
SELECT is(count(*)::int, 1, 'Grupo J reanudación: UPDATE vuelve a afectar 1 fila') FROM updated;

WITH deleted AS (
  DELETE FROM public.ab_migration_plan WHERE id = -869104 RETURNING id
)
SELECT is(count(*)::int, 1, 'Grupo J reanudación: DELETE vuelve a afectar 1 fila') FROM deleted;

RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(row(id, school_id, year_number, grade_id, generation_type)::text ORDER BY id)
     FROM public.ab_migration_plan
    WHERE school_id = -869001 OR id BETWEEN -869999 AND -869000),
  ARRAY['(-869101,-869001,2,-869011,GT)'],
  'Grupo J reanudación: solo quedan los valores exactos escritos después de quitar el flag'
);

SELECT is(
  ARRAY[
    (SELECT last_value::text || '/' || is_called::text FROM public.schools_id_seq),
    (SELECT last_value::text || '/' || is_called::text FROM public.ab_grades_id_seq),
    (SELECT last_value::text || '/' || is_called::text FROM public.ab_migration_plan_id_seq)
  ],
  ARRAY[
    current_setting('c0.sequence.schools'),
    current_setting('c0.sequence.ab_grades'),
    current_setting('c0.sequence.ab_migration_plan')
  ],
  'Secuencias de schools/ab_grades/ab_migration_plan conservan exactamente su estado inicial'
);

SELECT * FROM finish();

ROLLBACK;
