-- =============================================================================
-- 098-notification-category-prefs.sql — NOTIF N1-02
--
-- Covers migration 20260928100000_user_notification_category_prefs.sql:
--   D1 table shape: profile FK with cascade, (user_id, category) key, the eight
--      catalog categories and four email modes, RLS on, narrow grants.
--   D2 authenticated owner SELECT/INSERT/UPDATE/DELETE on own rows, including
--      default ↔ non-default mode transitions and upsert.
--   D3 anon and authenticated cross-user (also with an app admin role and
--      claim) cannot read, insert, update, delete or transfer another user's
--      row; blocked INSERT throws, blocked UPDATE/DELETE return empty.
--   D4 service_role manages any row; PUBLIC/anon hold no table or column
--      grant; no function, view or trigger exposes the table.
--   D5 bad category/mode, NULLs, duplicate pair, missing profile and denied
--      transfers are rejected and leave every surviving row unchanged.
--
-- Self-contained synthetic fixtures (*@test.local). Everything is rolled back.
-- =============================================================================

BEGIN;

SELECT plan(69);

-- ---------------------------------------------------------------------------
-- D1 / D4 — catalog checks (postgres)
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'user_notification_category_prefs',
  'D1: existe public.user_notification_category_prefs');
SELECT tests.rls_enabled('public', 'user_notification_category_prefs');

SELECT is(
  ARRAY(SELECT attname::text FROM pg_attribute
         WHERE attrelid = 'public.user_notification_category_prefs'::regclass
           AND attnum > 0 AND NOT attisdropped ORDER BY attnum),
  ARRAY['user_id', 'category', 'email_mode', 'created_at', 'updated_at'],
  'D1: columnas de la tabla'
);
SELECT is(
  ARRAY(SELECT attname::text FROM pg_attribute
         WHERE attrelid = 'public.user_notification_category_prefs'::regclass
           AND attnum > 0 AND NOT attisdropped AND attnotnull ORDER BY attnum),
  ARRAY['user_id', 'category', 'email_mode', 'created_at', 'updated_at'],
  'D1: todas las columnas son NOT NULL'
);
SELECT col_is_pk('public', 'user_notification_category_prefs', ARRAY['user_id', 'category'],
  'D1: la clave primaria es (user_id, category)');
SELECT is(
  (SELECT array_agg(format('%s.%s:%s:%s', n.nspname, cf.relname, c.confdeltype, a.attname))
     FROM pg_constraint c
     JOIN pg_class cf ON cf.oid = c.confrelid
     JOIN pg_namespace n ON n.oid = cf.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.user_notification_category_prefs'::regclass
      AND c.contype = 'f'),
  ARRAY['public.profiles:c:user_id'],
  'D1: única FK user_id → public.profiles con ON DELETE CASCADE'
);
SELECT is(
  (SELECT array_agg(conname::text ORDER BY conname) FROM pg_constraint
    WHERE conrelid = 'public.user_notification_category_prefs'::regclass AND contype = 'c'),
  ARRAY['user_notification_category_prefs_category_check',
        'user_notification_category_prefs_email_mode_check'],
  'D1: existen los CHECK de categoría y de modo'
);
SELECT is(
  (SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d
     JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'public.user_notification_category_prefs'::regclass
      AND a.attname = 'email_mode'),
  '''default''::text',
  'D1: email_mode tiene default ''default'''
);

SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.user_notification_category_prefs'::regclass
      AND a.grantee IN (0, 'anon'::regrole)),
  0,
  'D4: la tabla no concede nada a PUBLIC ni a anon'
);
SELECT is(
  (SELECT array_agg(a.privilege_type::text ORDER BY a.privilege_type)
     FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.user_notification_category_prefs'::regclass
      AND a.grantee = 'authenticated'::regrole),
  ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'D1: authenticated solo tiene SELECT/INSERT/UPDATE/DELETE (sin TRUNCATE/REFERENCES/TRIGGER)'
);
SELECT is(
  ARRAY[has_table_privilege('service_role', 'public.user_notification_category_prefs', 'SELECT'),
        has_table_privilege('service_role', 'public.user_notification_category_prefs', 'INSERT'),
        has_table_privilege('service_role', 'public.user_notification_category_prefs', 'UPDATE'),
        has_table_privilege('service_role', 'public.user_notification_category_prefs', 'DELETE')],
  ARRAY[true, true, true, true],
  'D4: service_role tiene SELECT/INSERT/UPDATE/DELETE'
);
SELECT is(
  (SELECT count(*)::int FROM pg_attribute
    WHERE attrelid = 'public.user_notification_category_prefs'::regclass AND attacl IS NOT NULL),
  0,
  'D4: no hay ACL de columna'
);
SELECT is(
  ARRAY[has_any_column_privilege('anon', 'public.user_notification_category_prefs', 'SELECT'),
        has_any_column_privilege('anon', 'public.user_notification_category_prefs', 'INSERT'),
        has_any_column_privilege('anon', 'public.user_notification_category_prefs', 'UPDATE'),
        has_table_privilege('anon', 'public.user_notification_category_prefs', 'DELETE'),
        has_table_privilege('public', 'public.user_notification_category_prefs', 'SELECT'),
        has_table_privilege('public', 'public.user_notification_category_prefs', 'INSERT'),
        has_table_privilege('public', 'public.user_notification_category_prefs', 'UPDATE'),
        has_table_privilege('public', 'public.user_notification_category_prefs', 'DELETE')],
  ARRAY[false, false, false, false, false, false, false, false],
  'D4: anon y PUBLIC no tienen privilegios de tabla ni de columna'
);

SELECT is(
  (SELECT array_agg(format('%s:%s:%s:%s', polname, polcmd, polpermissive, polroles::regrole[]::text)
                    ORDER BY polname)
     FROM pg_policy WHERE polrelid = 'public.user_notification_category_prefs'::regclass),
  ARRAY['forced_password_change_guard:*:f:{authenticated}',
        'user_notification_category_prefs_delete_own:d:t:{authenticated}',
        'user_notification_category_prefs_insert_own:a:t:{authenticated}',
        'user_notification_category_prefs_select_own:r:t:{authenticated}',
        'user_notification_category_prefs_update_own:w:t:{authenticated}'],
  'D1: cuatro policies de dueño permisivas más el guard restrictivo, todas limitadas a authenticated'
);
SELECT ok(
  (SELECT pg_get_expr(polqual, polrelid) LIKE '%auth.uid()%user_id%'
      AND pg_get_expr(polwithcheck, polrelid) LIKE '%auth.uid()%user_id%'
     FROM pg_policy
    WHERE polrelid = 'public.user_notification_category_prefs'::regclass
      AND polname = 'user_notification_category_prefs_update_own'),
  'D1: la policy UPDATE exige dueño en la fila vieja (USING) y en la nueva (WITH CHECK)'
);

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND p.prosrc ILIKE '%user_notification_category_prefs%'),
  0,
  'D4: ninguna función (SECURITY DEFINER o no) referencia la tabla'
);
SELECT is(
  (SELECT count(DISTINCT r.ev_class)::int FROM pg_depend d
     JOIN pg_rewrite r ON r.oid = d.objid
    WHERE d.classid = 'pg_rewrite'::regclass
      AND d.refobjid = 'public.user_notification_category_prefs'::regclass
      AND r.ev_class <> 'public.user_notification_category_prefs'::regclass),
  0,
  'D4: ninguna vista expone la tabla'
);
SELECT is(
  (SELECT array_agg(format('%s:%s:%s', t.tgname, p.proname, p.prosecdef))
     FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.user_notification_category_prefs'::regclass
      AND NOT t.tgisinternal),
  ARRAY['update_user_notification_category_prefs_updated_at:update_updated_at_column:f'],
  'D4: único trigger updated_at, con función SECURITY INVOKER'
);

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (postgres)
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_own uuid;
  v_other uuid;
  v_admin uuid;
  v_gone uuid;
BEGIN
  v_own := tests.create_supabase_user('n05_own_098', 'n05-own-098@test.local');
  v_other := tests.create_supabase_user('n05_other_098', 'n05-other-098@test.local');
  v_admin := tests.create_supabase_user('n05_admin_098', 'n05-admin-098@test.local');
  v_gone := tests.create_supabase_user('n05_gone_098', 'n05-gone-098@test.local');
  PERFORM set_config('n05.own', v_own::text, false);
  PERFORM set_config('n05.other', v_other::text, false);
  PERFORM set_config('n05.admin', v_admin::text, false);
  PERFORM set_config('n05.gone', v_gone::text, false);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES
    (v_own, 'n05-own-098@test.local', 'N05 Own 098', 'approved', false),
    (v_other, 'n05-other-098@test.local', 'N05 Other 098', 'approved', false),
    (v_admin, 'n05-admin-098@test.local', 'N05 Admin 098', 'approved', false),
    (v_gone, 'n05-gone-098@test.local', 'N05 Gone 098', 'approved', false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_admin, 'admin', NULL, true);

  INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES
    (v_other, 'courses', 'off'),
    (v_other, 'community', 'digest'),
    (v_admin, 'system', 'immediate');
END
$fixture$;

-- ---------------------------------------------------------------------------
-- D2 — authenticated owner matrix
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('n05_own_098');
SELECT lives_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'courses')$$,
         current_setting('n05.own')),
  'D2: el dueño inserta su fila sin modo (queda en default)');
SELECT lives_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'sessions', 'digest')$$,
         current_setting('n05.own')),
  'D2: el dueño inserta su fila con modo no default');
SELECT lives_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'assignments', 'off')$$,
         current_setting('n05.own')),
  'D2: el dueño inserta una tercera fila');
SELECT is(
  (SELECT array_agg(category || ':' || email_mode ORDER BY category)
     FROM public.user_notification_category_prefs),
  ARRAY['assignments:off', 'courses:default', 'sessions:digest'],
  'D2: el dueño ve exactamente sus filas, y la fila sin modo quedó en default'
);

WITH u AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'immediate'
   WHERE user_id = current_setting('n05.own')::uuid AND category = 'courses' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D2: el dueño cambia default → immediate') FROM u;

WITH u AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'default'
   WHERE user_id = current_setting('n05.own')::uuid AND category = 'sessions' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D2: el dueño vuelve digest → default') FROM u;

SELECT lives_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'courses', 'digest')
           ON CONFLICT (user_id, category) DO UPDATE SET email_mode = EXCLUDED.email_mode$$,
         current_setting('n05.own')),
  'D2: el dueño hace upsert sobre su propio par');

WITH d AS (
  DELETE FROM public.user_notification_category_prefs
   WHERE user_id = current_setting('n05.own')::uuid AND category = 'assignments' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D2: el dueño borra su propia fila') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(category || ':' || email_mode ORDER BY category)
     FROM public.user_notification_category_prefs WHERE user_id = current_setting('n05.own')::uuid),
  ARRAY['courses:digest', 'sessions:default'],
  'D2: los cambios del dueño quedaron guardados'
);

-- ---------------------------------------------------------------------------
-- D3 — anon
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  $$SELECT count(*) FROM public.user_notification_category_prefs$$,
  '42501', NULL, 'D3: anon no puede leer');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'advisory')$$,
         current_setting('n05.other')),
  '42501', NULL, 'D3: anon no puede insertar');
SELECT throws_ok(
  $$UPDATE public.user_notification_category_prefs SET email_mode = 'off'$$,
  '42501', NULL, 'D3: anon no puede actualizar');
SELECT throws_ok(
  $$DELETE FROM public.user_notification_category_prefs$$,
  '42501', NULL, 'D3: anon no puede borrar');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- D3 — authenticated cross-user
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('n05_own_098');
SELECT is(
  (SELECT count(*)::int FROM public.user_notification_category_prefs
    WHERE user_id <> current_setting('n05.own')::uuid),
  0,
  'D3: authenticated no ve filas de otros usuarios'
);
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'advisory')$$,
         current_setting('n05.other')),
  '42501', 'new row violates row-level security policy for table "user_notification_category_prefs"',
  'D3: authenticated no puede insertar una fila para otro usuario');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'courses', 'immediate')
           ON CONFLICT (user_id, category) DO UPDATE SET email_mode = EXCLUDED.email_mode$$,
         current_setting('n05.other')),
  '42501', NULL,
  'D3: authenticated no puede hacer upsert sobre el par de otro usuario');

WITH u AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'immediate'
   WHERE user_id = current_setting('n05.other')::uuid RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: authenticated no puede actualizar filas de otro usuario') FROM u;

WITH u AS (
  UPDATE public.user_notification_category_prefs SET user_id = current_setting('n05.own')::uuid
   WHERE user_id = current_setting('n05.other')::uuid AND category = 'community' RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: authenticated no puede apropiarse de la fila de otro usuario') FROM u;

WITH d AS (
  DELETE FROM public.user_notification_category_prefs
   WHERE user_id = current_setting('n05.other')::uuid RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: authenticated no puede borrar filas de otro usuario') FROM d;

SELECT throws_ok(
  format($$UPDATE public.user_notification_category_prefs SET user_id = %L WHERE category = 'sessions'$$,
         current_setting('n05.gone')),
  '42501', 'new row violates row-level security policy for table "user_notification_category_prefs"',
  'D3/D5: authenticated no puede transferir su fila a otro usuario');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- D3 — authenticated with the app admin role (user_roles) and admin claim
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('n05_admin_098');
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('n05.admin'), 'role', 'authenticated',
                    'email', 'n05-admin-098@test.local',
                    'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
                    'user_metadata', json_build_object('role', 'admin'))::text,
  true);
SELECT is(
  (SELECT array_agg(category || ':' || email_mode) FROM public.user_notification_category_prefs),
  ARRAY['system:immediate'],
  'D3: un admin solo ve su propia fila'
);
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'advisory')$$,
         current_setting('n05.other')),
  '42501', 'new row violates row-level security policy for table "user_notification_category_prefs"',
  'D3: un admin no puede insertar para otro usuario');

WITH u AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'immediate'
   WHERE user_id = current_setting('n05.other')::uuid RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: un admin no puede actualizar filas de otro usuario') FROM u;

WITH d AS (
  DELETE FROM public.user_notification_category_prefs
   WHERE user_id IN (current_setting('n05.other')::uuid, current_setting('n05.own')::uuid) RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: un admin no puede borrar filas de otros usuarios') FROM d;

SELECT throws_ok(
  format($$UPDATE public.user_notification_category_prefs SET user_id = %L WHERE category = 'system'$$,
         current_setting('n05.other')),
  '42501', 'new row violates row-level security policy for table "user_notification_category_prefs"',
  'D3/D5: un admin no puede transferir su fila a otro usuario');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(user_id::text || ':' || category || ':' || email_mode ORDER BY user_id, category)
     FROM public.user_notification_category_prefs
    WHERE user_id IN (current_setting('n05.own')::uuid, current_setting('n05.other')::uuid,
                      current_setting('n05.admin')::uuid, current_setting('n05.gone')::uuid)),
  (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[
     current_setting('n05.own') || ':courses:digest',
     current_setting('n05.own') || ':sessions:default',
     current_setting('n05.other') || ':community:digest',
     current_setting('n05.other') || ':courses:off',
     current_setting('n05.admin') || ':system:immediate']) x),
  'D3/D5: tras todos los intentos denegados, ninguna fila cambió, se movió ni apareció'
);

-- ---------------------------------------------------------------------------
-- D4 — service_role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.user_notification_category_prefs
    WHERE user_id IN (current_setting('n05.own')::uuid, current_setting('n05.other')::uuid,
                      current_setting('n05.admin')::uuid)),
  5,
  'D4: service_role lee las filas de todos los usuarios'
);
SELECT lives_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'advisory', 'off')$$,
         current_setting('n05.other')),
  'D4: service_role inserta para cualquier usuario');

WITH u AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'immediate'
   WHERE user_id = current_setting('n05.other')::uuid AND category = 'courses' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D4: service_role actualiza la fila de cualquier usuario') FROM u;

WITH d AS (
  DELETE FROM public.user_notification_category_prefs
   WHERE user_id = current_setting('n05.other')::uuid AND category = 'advisory' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D4: service_role borra la fila de cualquier usuario') FROM d;

SELECT lives_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES
           (%1$L, 'courses', 'default'), (%1$L, 'assignments', 'immediate'),
           (%1$L, 'community', 'digest'), (%1$L, 'sessions', 'off'),
           (%1$L, 'advisory', 'default'), (%1$L, 'licitaciones', 'immediate'),
           (%1$L, 'qa_support', 'digest'), (%1$L, 'system', 'off')$$,
         current_setting('n05.gone')),
  'D1: se aceptan las ocho categorías del catálogo y los cuatro modos');
SELECT throws_ok(
  $$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES ('00000000-0000-4000-8000-000000000098', 'courses')$$,
  '23503', NULL, 'D5: un user_id sin perfil se rechaza (FK)');
SELECT throws_ok(
  $$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (NULL, 'courses')$$,
  '23502', NULL, 'D5: user_id NULL se rechaza');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(category || ':' || email_mode ORDER BY category)
     FROM public.user_notification_category_prefs WHERE user_id = current_setting('n05.other')::uuid),
  ARRAY['community:digest', 'courses:immediate'],
  'D4: los cambios de service_role quedaron guardados'
);
SELECT is(
  (SELECT count(DISTINCT category)::int FROM public.user_notification_category_prefs
    WHERE user_id = current_setting('n05.gone')::uuid),
  8,
  'D1: el usuario de prueba quedó con una fila por cada una de las ocho categorías'
);

-- ---------------------------------------------------------------------------
-- D5 — constraint counterexamples (as the owner, so RLS admits the row)
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('n05_own_098');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'bogus')$$,
         current_setting('n05.own')),
  '23514', NULL, 'D5: una categoría desconocida se rechaza');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'Courses')$$,
         current_setting('n05.own')),
  '23514', NULL, 'D5: la categoría distingue mayúsculas');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, 'system_update')$$,
         current_setting('n05.own')),
  '23514', NULL, 'D5: un tipo de evento no es una categoría válida');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category) VALUES (%L, NULL)$$,
         current_setting('n05.own')),
  '23502', NULL, 'D5: categoría NULL se rechaza');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'advisory', 'weekly')$$,
         current_setting('n05.own')),
  '23514', NULL, 'D5: un modo desconocido se rechaza');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'advisory', NULL)$$,
         current_setting('n05.own')),
  '23502', NULL, 'D5: modo NULL se rechaza');
SELECT throws_ok(
  format($$INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (%L, 'courses', 'off')$$,
         current_setting('n05.own')),
  '23505', NULL, 'D5: un par (user_id, category) duplicado se rechaza');
SELECT throws_ok(
  $$UPDATE public.user_notification_category_prefs SET email_mode = 'never' WHERE category = 'courses'$$,
  '23514', NULL, 'D5: actualizar a un modo desconocido se rechaza');
SELECT throws_ok(
  $$UPDATE public.user_notification_category_prefs SET category = 'bogus' WHERE category = 'courses'$$,
  '23514', NULL, 'D5: actualizar a una categoría desconocida se rechaza');
SELECT throws_ok(
  $$UPDATE public.user_notification_category_prefs SET category = 'sessions' WHERE category = 'courses'$$,
  '23505', NULL, 'D5: renombrar la categoría a un par ya existente se rechaza');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT array_agg(category || ':' || email_mode ORDER BY category)
     FROM public.user_notification_category_prefs WHERE user_id = current_setting('n05.own')::uuid),
  ARRAY['courses:digest', 'sessions:default'],
  'D5: los intentos inválidos no cambiaron las filas del dueño'
);

-- The repo-wide forced_password_change_guard also applies to this table.
UPDATE public.profiles SET must_change_password = true WHERE id = current_setting('n05.own')::uuid;
SELECT tests.authenticate_as('n05_own_098');
SELECT is(
  (SELECT count(*)::int FROM public.user_notification_category_prefs),
  0,
  'D1: con cambio de contraseña pendiente, el dueño no ve sus filas (forced_password_change_guard)'
);
WITH u AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'off' RETURNING 1
)
SELECT is(count(*)::int, 0, 'D1: con cambio de contraseña pendiente, el dueño no puede actualizar') FROM u;
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.profiles SET must_change_password = false WHERE id = current_setting('n05.own')::uuid;

-- Profile deletion cascades to the user's preference rows only.
DELETE FROM public.profiles WHERE id = current_setting('n05.gone')::uuid;
SELECT is(
  (SELECT count(*)::int FROM public.user_notification_category_prefs
    WHERE user_id = current_setting('n05.gone')::uuid),
  0,
  'D1: borrar el perfil elimina sus preferencias (ON DELETE CASCADE)'
);
SELECT is(
  (SELECT count(*)::int FROM public.user_notification_category_prefs
    WHERE user_id IN (current_setting('n05.own')::uuid, current_setting('n05.other')::uuid,
                      current_setting('n05.admin')::uuid)),
  5,
  'D1: el cascade no toca filas de otros usuarios'
);

SELECT tests.rls_enabled('public', 'user_notification_category_prefs');

SELECT * FROM finish();

ROLLBACK;
