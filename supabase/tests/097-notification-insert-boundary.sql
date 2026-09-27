-- =============================================================================
-- 097-notification-insert-boundary.sql — NOTIF N0-03
--
-- Covers migration 20260927080000_notification_insert_boundary.sql:
--   D1 PUBLIC, anon and authenticated (own, other-user and admin claims) cannot
--      execute create_notification_safe; service_role can, and its row lands.
--   D2 anon and authenticated hold no INSERT table/column grant, no permissive
--      policy admits a browser INSERT (even with the grant re-added), every
--      attempt fails and leaves zero rows; service_role inserts directly.
--   D3 authenticated own SELECT/UPDATE keep working, cross-user SELECT/UPDATE
--      see nothing, DELETE behaves as before (own yes, cross-user no).
--   D4 create_user_notification stays service_role only, RLS stays enabled,
--      no broad INSERT policy and no anon grant remain.
--
-- Self-contained synthetic fixtures (UUIDs 97000000-…, *@test.local).
-- Everything is rolled back.
-- =============================================================================

BEGIN;

SELECT plan(50);

-- ---------------------------------------------------------------------------
-- Catalog (postgres)
-- ---------------------------------------------------------------------------
SELECT tests.rls_enabled('public', 'user_notifications');

CREATE TEMP TABLE n03_sig (fn, sig) AS VALUES
  ('safe', 'public.create_notification_safe(uuid, character varying, text, character varying, character varying, character varying, character varying, character varying)'),
  ('user', 'public.create_user_notification(uuid, character varying, character varying, text, character varying)');
GRANT SELECT ON n03_sig TO anon, authenticated, service_role;

SELECT is(
  (SELECT array_agg(r ORDER BY r) FROM n03_sig s,
     unnest(ARRAY['public', 'anon', 'authenticated']) r
    WHERE s.fn = 'safe' AND has_function_privilege(r, s.sig, 'EXECUTE')),
  NULL,
  'D1: PUBLIC, anon y authenticated no tienen EXECUTE sobre create_notification_safe'
);
SELECT is(
  (SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.create_notification_safe(uuid, character varying, text, character varying, character varying, character varying, character varying, character varying)'::regprocedure
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0,
  'D1: la ACL de create_notification_safe no tiene entradas PUBLIC/anon/authenticated'
);
SELECT ok(
  (SELECT has_function_privilege('service_role', sig, 'EXECUTE') FROM n03_sig WHERE fn = 'safe'),
  'D1: service_role conserva EXECUTE sobre create_notification_safe'
);
SELECT is(
  (SELECT array_agg(r ORDER BY r) FROM n03_sig s,
     unnest(ARRAY['public', 'anon', 'authenticated']) r
    WHERE s.fn = 'user' AND has_function_privilege(r, s.sig, 'EXECUTE')),
  NULL,
  'D4: create_user_notification sigue revocada para PUBLIC, anon y authenticated'
);
SELECT ok(
  (SELECT has_function_privilege('service_role', sig, 'EXECUTE') FROM n03_sig WHERE fn = 'user'),
  'D4: service_role conserva EXECUTE sobre create_user_notification'
);

SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.user_notifications'::regclass
      AND a.grantee IN (0, 'anon'::regrole)),
  0,
  'D4: user_notifications no concede nada a anon ni a PUBLIC'
);
SELECT is(
  ARRAY[has_table_privilege('anon', 'public.user_notifications', 'INSERT'),
        has_any_column_privilege('anon', 'public.user_notifications', 'INSERT'),
        has_table_privilege('authenticated', 'public.user_notifications', 'INSERT'),
        has_any_column_privilege('authenticated', 'public.user_notifications', 'INSERT')],
  ARRAY[false, false, false, false],
  'D2: anon y authenticated no tienen INSERT de tabla ni de columna'
);
SELECT is(
  (SELECT count(*)::int FROM pg_attribute
    WHERE attrelid = 'public.user_notifications'::regclass AND attacl IS NOT NULL),
  0,
  'D2: no hay ACL de columna en user_notifications'
);
SELECT is(
  ARRAY[has_table_privilege('authenticated', 'public.user_notifications', 'SELECT'),
        has_table_privilege('authenticated', 'public.user_notifications', 'UPDATE'),
        has_table_privilege('authenticated', 'public.user_notifications', 'DELETE'),
        has_table_privilege('service_role', 'public.user_notifications', 'INSERT')],
  ARRAY[true, true, true, true],
  'D3: authenticated conserva SELECT/UPDATE/DELETE y service_role conserva INSERT'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policy
    WHERE polrelid = 'public.user_notifications'::regclass
      AND polpermissive AND polcmd IN ('a', '*')
      AND (0 = ANY (polroles) OR 'anon'::regrole = ANY (polroles))),
  0,
  'D4: ninguna policy permisiva de INSERT aplica a PUBLIC o anon'
);
SELECT is(
  (SELECT polroles::regrole[]::text[] FROM pg_policy
    WHERE polrelid = 'public.user_notifications'::regclass
      AND polname = 'System can insert notifications'),
  ARRAY['service_role'],
  'D2: la policy "System can insert notifications" queda limitada a service_role'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policy
    WHERE polrelid = 'public.user_notifications'::regclass
      AND NOT polpermissive AND polcmd = 'a'
      AND 'anon'::regrole = ANY (polroles)
      AND 'authenticated'::regrole = ANY (polroles)
      AND pg_get_expr(polwithcheck, polrelid) = 'false'),
  1,
  'D2: una policy RESTRICTIVE de INSERT niega a anon y authenticated'
);

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (postgres)
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_own uuid;
  v_other uuid;
  v_admin uuid;
BEGIN
  v_own := tests.create_supabase_user('n03_own_097', 'n03-own-097@test.local');
  v_other := tests.create_supabase_user('n03_other_097', 'n03-other-097@test.local');
  v_admin := tests.create_supabase_user('n03_admin_097', 'n03-admin-097@test.local');
  PERFORM set_config('n03.own', v_own::text, false);
  PERFORM set_config('n03.other', v_other::text, false);
  PERFORM set_config('n03.admin', v_admin::text, false);

  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
  VALUES
    (v_own, 'n03-own-097@test.local', 'N03 Own 097', 'approved', false),
    (v_other, 'n03-other-097@test.local', 'N03 Other 097', 'approved', false),
    (v_admin, 'n03-admin-097@test.local', 'N03 Admin 097', 'approved', false);

  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_admin, 'admin', NULL, true);

  INSERT INTO public.user_notifications (id, user_id, title, is_read) VALUES
    ('97000000-0000-4000-8000-000000000001', v_own, 'N03 own unread', false),
    ('97000000-0000-4000-8000-000000000002', v_own, 'N03 own deletable', false),
    ('97000000-0000-4000-8000-000000000003', v_other, 'N03 other unread', false);
END
$fixture$;

-- ---------------------------------------------------------------------------
-- D1 — create_notification_safe per role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  format($$SELECT public.create_notification_safe(%L::uuid, 'N03 rpc anon', 'x')$$, current_setting('n03.other')),
  '42501', NULL, 'D1: anon no puede ejecutar create_notification_safe');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_own_097');
SELECT throws_ok(
  format($$SELECT public.create_notification_safe(%L::uuid, 'N03 rpc own', 'x')$$, current_setting('n03.own')),
  '42501', NULL, 'D1: authenticated no puede crear una notificación propia por RPC');
SELECT throws_ok(
  format($$SELECT public.create_notification_safe(%L::uuid, 'N03 rpc other', 'x')$$, current_setting('n03.other')),
  '42501', NULL, 'D1: authenticated no puede crear una notificación para otro usuario por RPC');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_admin_097');
SELECT throws_ok(
  format($$SELECT public.create_notification_safe(%L::uuid, 'N03 rpc admin', 'x')$$, current_setting('n03.other')),
  '42501', NULL, 'D1: un admin autenticado tampoco puede ejecutar create_notification_safe');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT isnt(
  public.create_notification_safe(current_setting('n03.other')::uuid, 'N03 rpc service', 'x',
    'general', NULL, 'normal', NULL, 'n03-097-service-rpc'),
  NULL,
  'D1: service_role crea la notificación por RPC y recibe su id');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT count(*)::int FROM public.user_notifications WHERE title LIKE 'N03 rpc %'),
  1,
  'D1: solo existe la fila creada por service_role'
);
SELECT is(
  (SELECT user_id::text FROM public.user_notifications WHERE idempotency_key = 'n03-097-service-rpc'),
  current_setting('n03.other'),
  'D1: la fila de service_role pertenece al destinatario pedido'
);

-- ---------------------------------------------------------------------------
-- D2 — direct INSERT per role
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 ins anon')$$, current_setting('n03.other')),
  '42501', NULL, 'D2: anon no puede insertar notificaciones');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_own_097');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 ins own')$$, current_setting('n03.own')),
  '42501', NULL, 'D2: authenticated no puede insertar una notificación propia');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 ins other')$$, current_setting('n03.other')),
  '42501', NULL, 'D2: authenticated no puede insertar para otro usuario');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 ins upsert') ON CONFLICT DO NOTHING$$, current_setting('n03.own')),
  '42501', NULL, 'D2: authenticated tampoco puede insertar con ON CONFLICT');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_admin_097');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 ins admin')$$, current_setting('n03.other')),
  '42501', NULL, 'D2: un admin autenticado no puede insertar para otro usuario');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 ins admin self')$$, current_setting('n03.admin')),
  '42501', NULL, 'D2: un admin autenticado no puede insertar una notificación propia');
RESET ROLE;
SELECT tests.clear_authentication();

-- Defense in depth: even if an INSERT grant came back, RLS must still refuse.
GRANT INSERT ON public.user_notifications TO anon, authenticated;

SELECT tests.authenticate_as('n03_own_097');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 rls own')$$, current_setting('n03.own')),
  '42501', 'new row violates row-level security policy "user_notifications_insert_service_role_only" for table "user_notifications"',
  'D2: con el grant re-agregado, la policy restrictiva rechaza la inserción propia de authenticated');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_admin_097');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 rls admin')$$, current_setting('n03.other')),
  '42501', 'new row violates row-level security policy "user_notifications_insert_service_role_only" for table "user_notifications"',
  'D2: con el grant re-agregado, la policy restrictiva rechaza la inserción de un admin para otro usuario');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 rls anon')$$, current_setting('n03.other')),
  '42501', 'new row violates row-level security policy for table "user_notifications"',
  'D2: con el grant re-agregado, RLS rechaza la inserción de anon');
RESET ROLE;
SELECT tests.clear_authentication();

REVOKE INSERT ON public.user_notifications FROM anon, authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.user_notifications
    WHERE title LIKE 'N03 ins %' OR title LIKE 'N03 rls %'),
  0,
  'D2: ningún intento de navegador dejó filas'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N03 direct service')$$, current_setting('n03.other')),
  'D2: service_role inserta directamente');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT count(*)::int FROM public.user_notifications
    WHERE title = 'N03 direct service' AND user_id = current_setting('n03.other')::uuid),
  1,
  'D2: la inserción directa de service_role quedó guardada'
);

-- ---------------------------------------------------------------------------
-- D3 — own and cross-user SELECT / UPDATE / DELETE
-- ---------------------------------------------------------------------------
SELECT tests.authenticate_as('n03_own_097');
SELECT is(
  (SELECT array_agg(id::text ORDER BY id) FROM public.user_notifications),
  ARRAY['97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000002'],
  'D3: authenticated ve exactamente sus propias notificaciones'
);
SELECT is(
  (SELECT count(*)::int FROM public.user_notifications WHERE user_id = current_setting('n03.other')::uuid),
  0,
  'D3: authenticated no ve notificaciones de otro usuario'
);

WITH u AS (
  UPDATE public.user_notifications SET is_read = true, read_at = now()
   WHERE id = '97000000-0000-4000-8000-000000000001' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D3: authenticated marca como leída su propia notificación') FROM u;

WITH u AS (
  UPDATE public.user_notifications SET is_read = true
   WHERE id = '97000000-0000-4000-8000-000000000003' RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: authenticated no puede actualizar la notificación de otro usuario') FROM u;

SELECT throws_ok(
  format($$UPDATE public.user_notifications SET user_id = %L WHERE id = '97000000-0000-4000-8000-000000000002'$$, current_setting('n03.other')),
  '42501', NULL,
  'D3: authenticated no puede reasignar su notificación a otro usuario');

WITH d AS (
  DELETE FROM public.user_notifications WHERE id = '97000000-0000-4000-8000-000000000003' RETURNING 1
)
SELECT is(count(*)::int, 0, 'D3: authenticated no puede borrar la notificación de otro usuario') FROM d;

WITH d AS (
  DELETE FROM public.user_notifications WHERE id = '97000000-0000-4000-8000-000000000002' RETURNING 1
)
SELECT is(count(*)::int, 1, 'D3: authenticated sigue pudiendo borrar su propia notificación') FROM d;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT is_read FROM public.user_notifications WHERE id = '97000000-0000-4000-8000-000000000001'),
  true,
  'D3: la marca de leída propia quedó guardada'
);
SELECT is(
  (SELECT is_read::text || ':' || user_id::text FROM public.user_notifications
    WHERE id = '97000000-0000-4000-8000-000000000003'),
  'false:' || current_setting('n03.other'),
  'D3: la notificación del otro usuario quedó intacta'
);
SELECT is(
  (SELECT user_id::text FROM public.user_notifications WHERE id = '97000000-0000-4000-8000-000000000002'),
  NULL,
  'D3: el borrado propio se aplicó'
);

SELECT tests.authenticate_as('n03_other_097');
SELECT is(
  (SELECT count(*)::int FROM public.user_notifications WHERE user_id = current_setting('n03.own')::uuid),
  0,
  'D3: el otro usuario tampoco ve las notificaciones ajenas'
);
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_admin_097');
SELECT is(
  (SELECT count(*)::int FROM public.user_notifications WHERE id = '97000000-0000-4000-8000-000000000003'),
  1,
  'D3: la lectura de admin (user_notifications_admin_all) no cambió'
);
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  $$SELECT count(*) FROM public.user_notifications$$,
  '42501', NULL, 'D4: anon ya no tiene acceso de lectura a user_notifications');
RESET ROLE;
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- D4 — create_user_notification regression
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok(
  format($$SELECT public.create_user_notification(%L::uuid, NULL, 'N03 cun anon', 'x', NULL)$$, current_setting('n03.other')),
  '42501', NULL, 'D4: anon no puede ejecutar create_user_notification');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT tests.authenticate_as('n03_own_097');
SELECT throws_ok(
  format($$SELECT public.create_user_notification(%L::uuid, NULL, 'N03 cun own', 'x', NULL)$$, current_setting('n03.own')),
  '42501', NULL, 'D4: authenticated no puede ejecutar create_user_notification');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok(
  format($$SELECT public.create_user_notification(%L::uuid, NULL, 'N03 cun service', 'x', NULL)$$, current_setting('n03.other')),
  'D4: service_role sigue pudiendo ejecutar create_user_notification');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(
  (SELECT count(*)::int FROM public.user_notifications WHERE title LIKE 'N03 cun %'),
  1,
  'D4: solo service_role creó una notificación con create_user_notification'
);

SELECT tests.rls_enabled('public', 'user_notifications');

SELECT * FROM finish();

ROLLBACK;
