-- =============================================================================
-- Correos release 1, phase 2 — lists, members, settings, picture store:
-- access, privileges, rules and seed (pgTAP). Same style as 040.
--
-- Covers the database half of:
--   A1  a visitor and signed-in non-admins (docente AND consultor) read zero
--       rows of email_lists, email_list_members, email_settings, rows present
--   A2  they insert, update, delete and truncate nothing; a signed-in admin
--       reads but writes nothing directly; anon and authenticated cannot
--       execute any of the new functions (the fingerprint helper included)
--   A5  the bucket email-campaign-images: public, 5 MB, png/jpeg/gif/webp;
--       nobody but the service role inserts, updates or deletes an object in
--       it, even with an open permissive rule present (as Production may hold)
--   S1  the two day-one lists, right public flag; the seed again adds none
--   S2  a list name differing only by case or surrounding spaces is refused
--   M2  no default on any basis column (catalog), no function parameter
--       default
--   and: lists, members and settings are never deleted, not even by the
--   service role; a contact with memberships cannot be deleted (RESTRICT).
--
-- Invented people only. Runs inside a transaction and rolls back — local only.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(191);

\set admin_uid     '''00000000-0000-0000-0000-0000000041aa'''
\set docente_uid   '''00000000-0000-0000-0000-0000000041dd'''
\set consultor_uid '''00000000-0000-0000-0000-0000000041cc'''
-- Literal uuids are used inside dollar-quoted bodies (psql does not
-- interpolate there): list 41000000-…-a1, contact 41000000-…-c1.

CREATE OR REPLACE FUNCTION pg_temp.p2_tables() RETURNS text[] AS $$
  SELECT ARRAY['email_lists', 'email_list_members', 'email_settings'];
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.p2_functions() RETURNS text[] AS $$
  SELECT ARRAY[
    'public.email_hidden_chars()',
    'public.email_address_fingerprint(text)',
    'public.email_add_contacts(jsonb, uuid[], text, text, text, timestamp with time zone, text, uuid)',
    'public.email_erase_contact(uuid, uuid)'
  ];
$$ LANGUAGE sql IMMUTABLE;

-- =============================================================================
-- Structure
-- =============================================================================
SELECT tests.rls_enabled('public', tbl) FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT is(
  (SELECT coalesce(string_agg(p.policyname || '|' || p.cmd || '|' || array_to_string(p.roles::text[], ','),
                              '; ' ORDER BY p.policyname), '(none)')
     FROM pg_policies p
    WHERE p.permissive = 'PERMISSIVE' AND p.schemaname = 'public' AND p.tablename = tbl),
  tbl || '_admin_select|SELECT|authenticated',
  tbl || ': exactly one permissive policy — admin SELECT-only, TO authenticated'
) FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT is(
  (SELECT p.qual FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = tbl AND p.policyname = tbl || '_admin_select'),
  (SELECT p.qual FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'email_contacts' AND p.policyname = 'email_contacts_admin_select'),
  tbl || ': the admin rule reads exactly like the five live email tables'' rule'
) FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT is(
  (SELECT count(*)::int FROM pg_policies p
    WHERE p.permissive = 'PERMISSIVE' AND p.schemaname = 'public'
      AND p.tablename = ANY (pg_temp.p2_tables()) AND p.with_check IS NOT NULL),
  0,
  'new tables: no policy carries a WITH CHECK — no signed-in write path exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy po
           WHERE po.polrelid = ('public.' || tbl)::regclass
             AND po.polname = 'forced_password_change_guard' AND NOT po.polpermissive),
  tbl || ': carries the restrictive forced_password_change_guard'
) FROM unnest(pg_temp.p2_tables()) AS tbl;

CREATE OR REPLACE FUNCTION pg_temp.acl_entries(tbl text, grantee_oid oid) RETURNS text AS $$
  SELECT coalesce(string_agg(e, ', ' ORDER BY e), '(none)')
    FROM (
      SELECT DISTINCT a.privilege_type || CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END AS e
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.oid = ('public.' || tbl)::regclass AND a.grantee = grantee_oid
    ) s;
$$ LANGUAGE sql STABLE;

SELECT is(pg_temp.acl_entries(tbl, 'anon'::regrole::oid), '(none)',
  tbl || ' / anon: no privilege at all') FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT is(pg_temp.acl_entries(tbl, 'authenticated'::regrole::oid), 'SELECT',
  tbl || ' / authenticated: exactly SELECT, not grantable') FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT is(pg_temp.acl_entries(tbl, 0::oid), '(none)',
  tbl || ' / PUBLIC: no entry') FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT ok(
  has_table_privilege('service_role', 'public.' || tbl, 'SELECT')
    AND has_table_privilege('service_role', 'public.' || tbl, 'INSERT')
    AND has_table_privilege('service_role', 'public.' || tbl, 'UPDATE')
    AND NOT has_table_privilege('service_role', 'public.' || tbl, 'DELETE')
    AND NOT has_table_privilege('service_role', 'public.' || tbl, 'TRUNCATE'),
  tbl || ' / service_role: SELECT, INSERT, UPDATE; no DELETE, no TRUNCATE — never deleted'
) FROM unnest(pg_temp.p2_tables()) AS tbl;

-- Functions: service role only.
SELECT ok(
  (SELECT p.prosecdef AND p.proconfig = ARRAY['search_path=public, pg_temp'] FROM pg_proc p WHERE p.oid = f::regprocedure),
  f || ': SECURITY DEFINER, search_path = public, pg_temp'
) FROM unnest(pg_temp.p2_functions()) AS f;

SELECT ok(
  NOT has_function_privilege('anon', f, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', f, 'EXECUTE')
    AND has_function_privilege('service_role', f, 'EXECUTE'),
  f || ': EXECUTE for service_role only (not anon, not authenticated)'
) FROM unnest(pg_temp.p2_functions()) AS f;

SELECT is(
  (SELECT count(*)::int FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid = f::regprocedure AND a.grantee = 0),
  0,
  f || ': no PUBLIC EXECUTE entry'
) FROM unnest(pg_temp.p2_functions()) AS f;

-- [M2] No parameter of any new function has a default.
SELECT is((SELECT p.pronargdefaults::int FROM pg_proc p WHERE p.oid = f::regprocedure), 0,
  f || ': no parameter has a default') FROM unnest(pg_temp.p2_functions()) AS f;

-- [M2] No basis column has a default, on either table.
SELECT col_hasnt_default('public', t, c, t || '.' || c || ' has no default (no default asserts a basis)')
  FROM unnest(ARRAY['email_contacts', 'email_list_members']) AS t
  CROSS JOIN unnest(ARRAY['legal_basis', 'basis_note', 'basis_recorded_at', 'consent_notice_version']) AS c;

SELECT col_hasnt_default('public', 'email_list_members', c,
  'email_list_members.' || c || ' has no default (the database asserts no membership)')
  FROM unnest(ARRAY['state', 'joined_via', 'subscribed_at', 'added_by']) AS c;

SELECT col_not_null('public', 'email_list_members', c, 'email_list_members.' || c || ' is NOT NULL')
  FROM unnest(ARRAY['list_id', 'contact_id', 'state', 'joined_via', 'legal_basis', 'basis_recorded_at']) AS c;

SELECT col_default_is('public', 'email_lists', 'is_public', 'false',
  'email_lists.is_public defaults to false (the safe value)');

-- Keys the release declares.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_lists_name_key' AND contype = 'u'
            AND conrelid = 'public.email_lists'::regclass
            AND pg_get_constraintdef(oid) = 'UNIQUE (name_norm)')
  AND EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
               WHERE a.attrelid = 'public.email_lists'::regclass AND a.attname = 'name_norm' AND a.attgenerated = 's'
                 AND pg_get_expr(d.adbin, d.adrelid) = 'lower(btrim(name))'),
  'email_lists_name_key: UNIQUE on name_norm, a stored column the database keeps as lower(btrim(name))'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_list_members_list_contact_key' AND contype = 'u'
            AND conrelid = 'public.email_list_members'::regclass),
  'email_list_members: UNIQUE (list_id, contact_id)'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_list_members_confirmation_token_key' AND contype = 'u'
            AND conrelid = 'public.email_list_members'::regclass),
  'email_list_members: UNIQUE (confirmation_token)'
);
SELECT is(
  (SELECT string_agg(confdeltype::text, ',' ORDER BY conname) FROM pg_constraint
    WHERE conrelid = 'public.email_list_members'::regclass AND contype = 'f'),
  'r,r',
  'email_list_members: both foreign keys are ON DELETE RESTRICT'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'email_list_members'
            AND indexname = 'email_list_members_list_state_idx')
  AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'email_list_members'
            AND indexname = 'email_list_members_contact_idx'),
  'email_list_members: indexes for "members of a list by state" and "memberships of a contact"'
);

-- [M1] Every new rule in the = ANY (ARRAY[...]) form, none as IN (...).
SELECT is(
  (SELECT count(*)::int FROM pg_constraint
    WHERE conrelid IN ('public.email_lists'::regclass, 'public.email_list_members'::regclass, 'public.email_settings'::regclass)
      AND contype = 'c' AND pg_get_constraintdef(oid) ~* '\mIN\s*\('),
  0,
  'new tables: no CHECK written as IN (...)'
);
SELECT has_column('public', 'email_suppression', 'erased_at', 'email_suppression.erased_at exists (the erased mark)');
SELECT col_is_null('public', 'email_suppression', 'erased_at', 'email_suppression.erased_at is nullable');

-- =============================================================================
-- [S1] Seed and settings (as the migrations left them)
-- =============================================================================
SELECT is(
  (SELECT string_agg(name || '=' || is_public::text, '; ' ORDER BY name) FROM public.email_lists
    WHERE lower(btrim(name)) IN ('boletín general', 'directivos')),
  'Boletín general=true; Directivos=false',
  'S1: "Boletín general" (public) and "Directivos" (not public) exist, once each'
);

-- The seed statement of 20261124200300, run again.
INSERT INTO public.email_lists (name, description, is_public)
VALUES ('Boletín general', NULL, true), ('Directivos', NULL, false)
ON CONFLICT (name_norm) DO NOTHING;

SELECT is(
  (SELECT count(*)::int FROM public.email_lists WHERE lower(btrim(name)) IN ('boletín general', 'directivos')),
  2,
  'S1: running the seed statement again adds no list'
);

SELECT is((SELECT count(*)::int FROM public.email_settings), 1, 'settings: exactly one row');
SELECT is((SELECT daily_limit FROM public.email_settings), 500, 'settings: daily_limit seeded with 500');

-- =============================================================================
-- Fixtures (as postgres)
-- =============================================================================
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  (:admin_uid::uuid,     'admin41@correos-prueba.invalid',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:docente_uid::uuid,   'docente41@correos-prueba.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:consultor_uid::uuid, 'consultor41@correos-prueba.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status) VALUES
  (:admin_uid::uuid,     'admin41@correos-prueba.invalid',     'Admin Prueba 41',     'approved'),
  (:docente_uid::uuid,   'docente41@correos-prueba.invalid',   'Docente Prueba 41',   'approved'),
  (:consultor_uid::uuid, 'consultor41@correos-prueba.invalid', 'Consultor Prueba 41', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name) VALUES (9411, 'Colegio Prueba 41') ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_type, school_id, is_active) VALUES
  (:admin_uid::uuid,     'admin',     NULL, true),
  (:docente_uid::uuid,   'docente',   9411, true),
  (:consultor_uid::uuid, 'consultor', 9411, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.email_lists (id, name, is_public)
VALUES ('41000000-0000-4000-8000-0000000000a1', 'Lista Prueba 41', false);

INSERT INTO public.email_contacts (id, email, email_normalized, source, legal_basis, basis_note, basis_recorded_at, subscribed_at)
VALUES ('41000000-0000-4000-8000-0000000000c1', 'luz41@example.test', 'luz41@example.test',
        'manual', 'manual_verified', 'nota de prueba', now(), now());

INSERT INTO public.email_list_members (list_id, contact_id, state, joined_via, legal_basis, basis_note, basis_recorded_at, subscribed_at)
VALUES ('41000000-0000-4000-8000-0000000000a1', '41000000-0000-4000-8000-0000000000c1',
        'subscribed', 'manual', 'manual_verified', 'nota de prueba', now(), now());

-- One object in the store, and an open permissive rule of the kind Production
-- may carry (rolled back), so the store's limits are tested where they matter.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('email-campaign-images', 'p2db41/foto.png', NULL);
INSERT INTO storage.buckets (id, name, public) VALUES ('p2db41-other', 'p2db41-other', true)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "p2db41 open everything (test only)" ON storage.objects
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

-- =============================================================================
-- Helpers
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.as_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.stmt(kind text, tbl text) RETURNS text AS $$
  SELECT CASE kind
    WHEN 'select'   THEN format('SELECT 1 FROM public.%I', tbl)
    WHEN 'insert'   THEN format('INSERT INTO public.%I DEFAULT VALUES', tbl)
    WHEN 'update'   THEN format('UPDATE public.%I SET created_at = now() WHERE false', tbl)
    WHEN 'delete'   THEN format('DELETE FROM public.%I WHERE false', tbl)
    WHEN 'truncate' THEN format('TRUNCATE public.%I', tbl)
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.fn_call(f text) RETURNS text AS $$
  SELECT CASE
    WHEN f LIKE 'public.email_hidden_chars%' THEN
      $q$SELECT public.email_hidden_chars()$q$
    WHEN f LIKE 'public.email_address_fingerprint%' THEN
      $q$SELECT public.email_address_fingerprint('x@example.test')$q$
    WHEN f LIKE 'public.email_add_contacts%' THEN
      $q$SELECT public.email_add_contacts('[{"email":"intruso@example.test"}]'::jsonb,
           ARRAY['41000000-0000-4000-8000-0000000000a1'::uuid], 'manual', 'manual_verified',
           'nota', now(), NULL, '00000000-0000-0000-0000-0000000041aa'::uuid)$q$
    ELSE
      $q$SELECT public.email_erase_contact('41000000-0000-4000-8000-0000000000c1'::uuid,
           '00000000-0000-0000-0000-0000000041aa'::uuid)$q$
  END;
$$ LANGUAGE sql IMMUTABLE;

GRANT EXECUTE ON FUNCTION pg_temp.as_user(uuid), pg_temp.as_anon(), pg_temp.as_service(),
  pg_temp.stmt(text, text), pg_temp.fn_call(text) TO anon, authenticated, service_role;

-- =============================================================================
-- [A1/A2] Signed-in admin: reads, writes nothing directly
-- =============================================================================
SELECT pg_temp.as_user(:admin_uid::uuid);

SELECT isnt_empty(pg_temp.stmt('select', tbl), 'admin / ' || tbl || ': reads the rows')
  FROM unnest(pg_temp.p2_tables()) AS tbl;

SELECT throws_ok(pg_temp.stmt(k, tbl), '42501', 'permission denied for table ' || tbl,
  'admin / ' || tbl || ': ' || upper(k) || ' denied — every write goes through the server')
  FROM unnest(pg_temp.p2_tables()) AS tbl
  CROSS JOIN unnest(ARRAY['insert', 'update', 'delete', 'truncate']) AS k;

SELECT throws_ok(pg_temp.fn_call(f), '42501', NULL, 'admin (signed in) cannot execute ' || f)
  FROM unnest(pg_temp.p2_functions()) AS f;

RESET ROLE;

-- =============================================================================
-- [A1/A2] Signed-in non-admins: docente and consultor
-- =============================================================================
SELECT pg_temp.as_user(:docente_uid::uuid);
SELECT is_empty(pg_temp.stmt('select', tbl), 'docente / ' || tbl || ': reads 0 rows (rows present)')
  FROM unnest(pg_temp.p2_tables()) AS tbl;
SELECT throws_ok(pg_temp.stmt(k, tbl), '42501', 'permission denied for table ' || tbl,
  'docente / ' || tbl || ': ' || upper(k) || ' denied')
  FROM unnest(pg_temp.p2_tables()) AS tbl
  CROSS JOIN unnest(ARRAY['insert', 'update', 'delete', 'truncate']) AS k;
SELECT throws_ok(pg_temp.fn_call(f), '42501', NULL, 'docente cannot execute ' || f)
  FROM unnest(pg_temp.p2_functions()) AS f;
RESET ROLE;

SELECT pg_temp.as_user(:consultor_uid::uuid);
SELECT is_empty(pg_temp.stmt('select', tbl), 'consultor / ' || tbl || ': reads 0 rows (rows present)')
  FROM unnest(pg_temp.p2_tables()) AS tbl;
SELECT throws_ok(pg_temp.stmt(k, tbl), '42501', 'permission denied for table ' || tbl,
  'consultor / ' || tbl || ': ' || upper(k) || ' denied')
  FROM unnest(pg_temp.p2_tables()) AS tbl
  CROSS JOIN unnest(ARRAY['insert', 'update', 'delete', 'truncate']) AS k;
SELECT throws_ok(pg_temp.fn_call(f), '42501', NULL, 'consultor cannot execute ' || f)
  FROM unnest(pg_temp.p2_functions()) AS f;
RESET ROLE;

-- =============================================================================
-- [A1/A2] Visitor
-- =============================================================================
SELECT pg_temp.as_anon();
SELECT throws_ok(pg_temp.stmt(k, tbl), '42501', 'permission denied for table ' || tbl,
  'anon / ' || tbl || ': ' || upper(k) || ' denied')
  FROM unnest(pg_temp.p2_tables()) AS tbl
  CROSS JOIN unnest(ARRAY['select', 'insert', 'update', 'delete', 'truncate']) AS k;
SELECT throws_ok(pg_temp.fn_call(f), '42501', NULL, 'anon cannot execute ' || f)
  FROM unnest(pg_temp.p2_functions()) AS f;
RESET ROLE;

-- Nothing the refused calls could have done happened.
SELECT is((SELECT count(*)::int FROM public.email_contacts WHERE email_normalized = 'intruso@example.test'), 0,
  'A2: the refused add calls saved nothing');
SELECT is((SELECT anonymized_at IS NULL FROM public.email_contacts WHERE id = '41000000-0000-4000-8000-0000000000c1'), true,
  'A2: the refused erase calls erased nothing');

-- =============================================================================
-- [A5] The picture store
-- =============================================================================
SELECT is(
  (SELECT format('%s|%s|%s', public::text, file_size_limit, array_to_string(allowed_mime_types, ','))
     FROM storage.buckets WHERE id = 'email-campaign-images'),
  'true|5242880|image/png,image/jpeg,image/gif,image/webp',
  'A5: bucket email-campaign-images is public, 5 MB, png/jpeg/gif/webp only (no svg)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'PERMISSIVE'
      AND policyname <> 'p2db41 open everything (test only)'
      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%email-campaign-images%'),
  0,
  'A5: no permissive storage rule names the store (only the server writes)'
);
SELECT is(
  (SELECT string_agg(cmd || ':' || array_to_string(roles::text[], ','), '; ' ORDER BY cmd) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'RESTRICTIVE'
      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%email-campaign-images%'),
  'DELETE:public; INSERT:public; UPDATE:public',
  'A5: three restrictive limits (insert, update, delete) TO public'
);

-- The storage schema refuses every direct DELETE statement unless this flag is
-- set (storage.protect_delete); set it, as 104/105/126 do, so the DELETE below
-- reaches the row rules that are under test.
SELECT set_config('storage.allow_delete_query', 'true', true);

-- Visitor
SELECT pg_temp.as_anon();
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('email-campaign-images', 'p2db41/anon.png')$$,
  '42501', NULL, 'A5: a visitor cannot upload to the store');
WITH u AS (UPDATE storage.objects SET name = 'p2db41/cambiada.png'
            WHERE bucket_id = 'email-campaign-images' AND name = 'p2db41/foto.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'A5: a visitor cannot replace or rename an object (the row exists)') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'email-campaign-images' AND name = 'p2db41/foto.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'A5: a visitor cannot delete an object (the row exists)') FROM d;
RESET ROLE;

-- Signed-in non-admin, and a signed-in admin (only the server writes)
SELECT pg_temp.as_user(:docente_uid::uuid);
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('email-campaign-images', 'p2db41/docente.png')$$,
  '42501', NULL, 'A5: a signed-in non-admin cannot upload to the store');
WITH u AS (UPDATE storage.objects SET name = 'p2db41/cambiada.png'
            WHERE bucket_id = 'email-campaign-images' AND name = 'p2db41/foto.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'A5: a signed-in non-admin cannot replace or rename an object') FROM u;
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'email-campaign-images' AND name = 'p2db41/foto.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'A5: a signed-in non-admin cannot delete an object') FROM d;
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('p2db41-other', 'p2db41/otra.png')$$,
  'A5: the limits do not bite outside the store (another bucket under the open rule)');
SELECT throws_ok($$UPDATE storage.objects SET bucket_id = 'email-campaign-images' WHERE bucket_id = 'p2db41-other' AND name = 'p2db41/otra.png'$$,
  '42501', NULL, 'A5: nobody signed in can move an object into the store');
RESET ROLE;

SELECT pg_temp.as_user(:admin_uid::uuid);
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('email-campaign-images', 'p2db41/admin.png')$$,
  '42501', NULL, 'A5: a signed-in admin cannot upload with their own session either');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id = 'email-campaign-images' AND name = 'p2db41/foto.png' RETURNING 1)
SELECT is(count(*)::int, 0, 'A5: a signed-in admin cannot delete an object with their own session') FROM d;
RESET ROLE;

SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'email-campaign-images' AND name = 'p2db41/foto.png'), 1,
  'A5: the object is still there, unchanged');

SELECT pg_temp.as_service();
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name) VALUES ('email-campaign-images', 'p2db41/servidor.png')$$,
  'A5: the server (service role) uploads');
RESET ROLE;

-- =============================================================================
-- Service role: rules on the new tables
-- =============================================================================
SELECT pg_temp.as_service();

-- [S2]
SELECT throws_ok($$INSERT INTO public.email_lists (name, is_public) VALUES ('  boletín GENERAL ', false)$$,
  '23505', NULL, 'S2: a list named like "Boletín general" but for case and spaces is refused');
SELECT throws_ok($$INSERT INTO public.email_lists (name, is_public) VALUES ('DIRECTIVOS', true)$$,
  '23505', NULL, 'S2: "DIRECTIVOS" is refused while "Directivos" exists');
SELECT throws_ok($$UPDATE public.email_lists SET name = 'directivos ' WHERE id = '41000000-0000-4000-8000-0000000000a1'$$,
  '23505', NULL, 'S2: renaming a list to an existing name (other case, spaces) is refused');
SELECT throws_ok($$UPDATE public.email_lists SET name_norm = 'otra' WHERE id = '41000000-0000-4000-8000-0000000000a1'$$,
  '428C9', NULL, 'S2: the compared form of the name (name_norm) cannot be written directly');
SELECT throws_ok($$INSERT INTO public.email_lists (name, is_public) VALUES ('   ', false)$$,
  '23514', NULL, 'S2: a blank list name is refused');
SELECT lives_ok($$UPDATE public.email_lists SET name = 'Lista Prueba 41 renombrada', description = 'Descripción de prueba',
                    is_public = true WHERE id = '41000000-0000-4000-8000-0000000000a1'$$,
  'S2: the server renames, describes and sets a list public');
SELECT lives_ok($$UPDATE public.email_lists SET archived_at = now() WHERE id = '41000000-0000-4000-8000-0000000000a1'$$,
  'S2: the server archives a list');

-- Never deleted, not even by the server.
SELECT throws_ok(pg_temp.stmt(k, tbl), '42501', 'permission denied for table ' || tbl,
  'service_role / ' || tbl || ': ' || upper(k) || ' denied — never deleted')
  FROM unnest(pg_temp.p2_tables()) AS tbl
  CROSS JOIN unnest(ARRAY['delete', 'truncate']) AS k;
SELECT throws_ok($$DELETE FROM public.email_contacts WHERE id = '41000000-0000-4000-8000-0000000000c1'$$,
  '23503', NULL, 'a contact with a membership cannot be deleted (ON DELETE RESTRICT keeps who was on the list)');

-- Members
SELECT throws_ok($$INSERT INTO public.email_list_members (list_id, contact_id, state, joined_via, legal_basis, basis_recorded_at, subscribed_at)
                   VALUES ('41000000-0000-4000-8000-0000000000a1', '41000000-0000-4000-8000-0000000000c1', 'subscribed', 'manual',
                           'manual_verified', now(), now())$$,
  '23505', NULL, 'members: UNIQUE (list_id, contact_id)');
SELECT throws_ok($$UPDATE public.email_list_members SET state = 'gone' WHERE contact_id = '41000000-0000-4000-8000-0000000000c1'$$,
  '23514', NULL, 'members: state outside pending/subscribed/unsubscribed is refused');
SELECT throws_ok($$UPDATE public.email_list_members SET joined_via = 'tractor_signups' WHERE contact_id = '41000000-0000-4000-8000-0000000000c1'$$,
  '23514', NULL, 'members: joined_via outside the five ways is refused');
SELECT throws_ok($$UPDATE public.email_list_members SET legal_basis = 'consent_form', consent_notice_version = NULL
                    WHERE contact_id = '41000000-0000-4000-8000-0000000000c1'$$,
  '23514', NULL, 'members: consent_form without a notice version is refused');
SELECT throws_ok($$UPDATE public.email_list_members SET state = 'unsubscribed' WHERE contact_id = '41000000-0000-4000-8000-0000000000c1'$$,
  '23514', NULL, 'members: unsubscribed without its date is refused');
SELECT throws_ok($$UPDATE public.email_list_members SET unsubscribed_by = 'robot' WHERE contact_id = '41000000-0000-4000-8000-0000000000c1'$$,
  '23514', NULL, 'members: unsubscribed_by outside person/admin is refused');
SELECT throws_ok($$INSERT INTO public.email_list_members (list_id, contact_id, state, joined_via, basis_recorded_at, subscribed_at)
                   VALUES ('41000000-0000-4000-8000-0000000000a1', '41000000-0000-4000-8000-0000000000c1', 'subscribed', 'manual', now(), now())$$,
  '23502', NULL, 'members: a membership without a legal basis is refused (no default fills it)');

-- Settings
SELECT throws_ok($$INSERT INTO public.email_settings (id, daily_limit) VALUES (false, 10)$$,
  '23514', NULL, 'settings: a second row is refused');
SELECT throws_ok($$UPDATE public.email_settings SET daily_limit = 0$$,
  '23514', NULL, 'settings: daily_limit must be greater than zero');
SELECT lives_ok($$UPDATE public.email_settings SET daily_limit = 300$$, 'settings: the server changes the daily limit');

RESET ROLE;

-- [A3] Nobody signed in deletes or changes a contact.
SELECT pg_temp.as_user(:admin_uid::uuid);
SELECT throws_ok($$DELETE FROM public.email_contacts WHERE id = '41000000-0000-4000-8000-0000000000c1'$$,
  '42501', NULL, 'A3: a signed-in admin cannot delete a contact');
SELECT throws_ok($$UPDATE public.email_contacts SET first_name = 'X' WHERE id = '41000000-0000-4000-8000-0000000000c1'$$,
  '42501', NULL, 'A3: a signed-in admin cannot change a contact');
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
