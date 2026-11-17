-- =============================================================================
-- 137-expenses-by-role.sql — GENERA fixes F7d (GES-1.3, E1):
-- migration 20261117166000_expenses_by_role.sql.
--
-- Rendición de Gastos by role:
--   who files      active admin, consultor, community_manager (and past the
--                  forced-password gate); nobody else sees or opens anything,
--                  an old expense_report_access.can_submit row grants nothing
--   who reads      a non-admin only their own reports; admins all
--   author         own draft or rejected: change, add / change / delete items,
--                  send (again), delete the report; own sent or approved:
--                  nothing; never sets approved (nor creates it approved)
--   admin          approves / rejects anyone's report, their own included; an
--                  admin's OWN approved report is closed to them, another admin
--                  can still correct it
--   history        public.expense_report_events, written only by the trigger
--
-- Every change is made as that person through pg_temp.attempt(person, sql,
-- report): it runs the statement as that person and compares the report's
-- whole state (report row, its items, its history lines) before and after,
-- read as postgres. Its answer is '<n> rows' or the SQLSTATE of the refusal,
-- then ', unchanged' or ', changed'.
--
-- Invented people and data only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(135);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT ok(coalesce((SELECT p.prosecdef AND p.provolatile = 's'
                           AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql')
                           AND p.prorettype = 'boolean'::regtype
                           AND p.proconfig = ARRAY['search_path=public, pg_temp']
                      FROM pg_proc p WHERE p.oid = to_regprocedure('public.auth_can_file_expenses()')), false),
  'auth_can_file_expenses(): boolean, sql, STABLE, SECURITY DEFINER, search_path = public, pg_temp');
SELECT ok(to_regprocedure('public.auth_can_file_expenses()') IS NOT NULL
          AND NOT has_function_privilege('anon', to_regprocedure('public.auth_can_file_expenses()'), 'EXECUTE')
          AND has_function_privilege('authenticated', to_regprocedure('public.auth_can_file_expenses()'), 'EXECUTE')
          AND has_function_privilege('service_role', to_regprocedure('public.auth_can_file_expenses()'), 'EXECUTE')
          AND (SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a
                WHERE p.oid = to_regprocedure('public.auth_can_file_expenses()') AND a.grantee = 0) = 0,
  'auth_can_file_expenses(): EXECUTE for authenticated and service_role, not PUBLIC, not anon');
SELECT is((SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('expense_reports', 'expense_items') AND permissive = 'RESTRICTIVE'
              AND policyname <> 'forced_password_change_guard'),
  ARRAY['expense_items_delete_states', 'expense_items_filers_only', 'expense_items_insert_states', 'expense_items_update_states',
        'expense_reports_delete_states', 'expense_reports_filers_only', 'expense_reports_insert_states', 'expense_reports_update_states'],
  'the eight new restrictive rules on expense_reports and expense_items');
SELECT is((SELECT count(*)::int FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('expense_reports', 'expense_items')
              AND (coalesce(qual, '') LIKE '%expense_report_access%' OR coalesce(with_check, '') LIKE '%expense_report_access%')),
  0, 'no rule on expense_reports or expense_items reads expense_report_access any more');
SELECT ok(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.expense_report_events')), false),
  'public.expense_report_events exists with row security enabled');
SELECT ok(to_regclass('public.expense_report_events') IS NOT NULL
          AND has_table_privilege('authenticated', 'public.expense_report_events', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.expense_report_events', 'INSERT, UPDATE, DELETE, TRUNCATE')
          AND NOT has_table_privilege('anon', 'public.expense_report_events', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  'expense_report_events: authenticated may only SELECT; anon holds nothing');
SELECT is((SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'expense_report_events'),
  ARRAY['expense_report_events_read', 'expense_report_events_service_read', 'forced_password_change_guard'],
  'expense_report_events rules: read (authenticated), service read, forced-password guard');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.expense_reports'::regclass
                   AND t.tgname = 'expense_reports_history' AND NOT t.tgisinternal
                   AND t.tgfoid = to_regprocedure('public.expense_report_record_event()')),
  'trigger expense_reports_history on expense_reports');
SELECT ok(coalesce((SELECT prosecdef AND proconfig = ARRAY['search_path=public, pg_temp']
                      FROM pg_proc WHERE oid = to_regprocedure('public.expense_report_record_event()')), false),
  'expense_report_record_event(): SECURITY DEFINER, search_path pinned');

-- ---------------------------------------------------------------------------
-- Fixtures (postgres, synthetic)
-- ---------------------------------------------------------------------------
SELECT tests.create_supabase_user('f7d137_admin1');
SELECT tests.create_supabase_user('f7d137_admin2');
SELECT tests.create_supabase_user('f7d137_cons1');
SELECT tests.create_supabase_user('f7d137_cons2');
SELECT tests.create_supabase_user('f7d137_cm');
SELECT tests.create_supabase_user('f7d137_docente');
SELECT tests.create_supabase_user('f7d137_directivo');
SELECT tests.create_supabase_user('f7d137_oldsw');
SELECT tests.create_supabase_user('f7d137_inactive');
SELECT tests.create_supabase_user('f7d137_mustpw');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.r(n text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('13700000-0000-4000-8000-0000000000' || n)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.i(n text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('13700000-0000-4000-8000-0000000001' || n)::uuid $$;

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@f7d137.test.local', k, 'approved', (k = 'f7d137_mustpw')
  FROM unnest(ARRAY['f7d137_admin1','f7d137_admin2','f7d137_cons1','f7d137_cons2','f7d137_cm','f7d137_docente',
                    'f7d137_directivo','f7d137_oldsw','f7d137_inactive','f7d137_mustpw']) k
ON CONFLICT (id) DO UPDATE SET must_change_password = EXCLUDED.must_change_password;

INSERT INTO public.schools (id, name) VALUES (913701, 'F7d school (pgTAP 137)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('13700000-0000-4000-8000-0000000002c1', 913701, 'F7d community (pgTAP 137)');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f7d137_admin1'),    'admin',             NULL,   NULL, true),
  (pg_temp.uid('f7d137_admin2'),    'admin',             NULL,   NULL, true),
  (pg_temp.uid('f7d137_cons1'),     'consultor',         913701, NULL, true),
  (pg_temp.uid('f7d137_cons2'),     'consultor',         913701, NULL, true),
  (pg_temp.uid('f7d137_cm'),        'community_manager', 913701, '13700000-0000-4000-8000-0000000002c1', true),
  (pg_temp.uid('f7d137_docente'),   'docente',           913701, NULL, true),
  (pg_temp.uid('f7d137_directivo'), 'equipo_directivo',  913701, NULL, true),
  (pg_temp.uid('f7d137_oldsw'),     'docente',           913701, NULL, true),
  (pg_temp.uid('f7d137_inactive'),  'consultor',         913701, NULL, false),
  (pg_temp.uid('f7d137_mustpw'),    'consultor',         913701, NULL, true);
-- the retired one-by-one switch: a person switched on, without a filing role
INSERT INTO public.expense_report_access (user_id, can_submit, granted_by, notes) VALUES
  (pg_temp.uid('f7d137_oldsw'), true, pg_temp.uid('f7d137_admin1'), 'F7d 137 sintetico')
ON CONFLICT (user_id) DO UPDATE SET can_submit = EXCLUDED.can_submit;

INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status) VALUES
  (pg_temp.r('10'), 'F7d 137 old switch draft', '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_oldsw'), 'draft'),
  (pg_temp.r('11'), 'F7d 137 cons2 draft',      '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_cons2'), 'draft'),
  (pg_temp.r('12'), 'F7d 137 cons1 sent',       '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_cons1'), 'submitted'),
  (pg_temp.r('13'), 'F7d 137 cons1 approved',   '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_cons1'), 'approved'),
  (pg_temp.r('14'), 'F7d 137 admin1 sent',      '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_admin1'), 'submitted'),
  (pg_temp.r('15'), 'F7d 137 admin1 approved',  '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_admin1'), 'approved'),
  (pg_temp.r('16'), 'F7d 137 cons1 draft',      '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_cons1'), 'draft'),
  (pg_temp.r('17'), 'F7d 137 cons1 rejected',   '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_cons1'), 'rejected'),
  (pg_temp.r('18'), 'F7d 137 cons1 draft B',    '2027-03-01', '2027-03-02', pg_temp.uid('f7d137_cons1'), 'draft');
INSERT INTO public.expense_items (id, report_id, description, amount, expense_date) VALUES
  (pg_temp.i('10'), pg_temp.r('10'), 'F7d 137 taxi', 1000, '2027-03-01'),
  (pg_temp.i('11'), pg_temp.r('11'), 'F7d 137 almuerzo', 2000, '2027-03-01'),
  (pg_temp.i('12'), pg_temp.r('12'), 'F7d 137 bus', 3000, '2027-03-01'),
  (pg_temp.i('13'), pg_temp.r('13'), 'F7d 137 hotel', 4000, '2027-03-01'),
  (pg_temp.i('15'), pg_temp.r('15'), 'F7d 137 peaje', 5000, '2027-03-01'),
  (pg_temp.i('6a'), pg_temp.r('16'), 'F7d 137 cafe', 600, '2027-03-01'),
  (pg_temp.i('6b'), pg_temp.r('16'), 'F7d 137 metro', 700, '2027-03-02'),
  (pg_temp.i('17'), pg_temp.r('17'), 'F7d 137 cena', 1700, '2027-03-01');

-- The whole state of one report, read as postgres: its row, its items, its history.
CREATE OR REPLACE FUNCTION pg_temp.state(rid uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_ev jsonb;
BEGIN
  IF to_regclass('public.expense_report_events') IS NOT NULL THEN
    EXECUTE 'SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.expense_report_events e WHERE e.report_id = $1'
      INTO v_ev USING rid;
  END IF;
  RETURN jsonb_build_object(
    'report', (SELECT to_jsonb(r) FROM public.expense_reports r WHERE r.id = rid),
    'items',  (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.expense_items i WHERE i.report_id = rid),
    'events', v_ev);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(who text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF who = 'anon' THEN
    PERFORM set_config('request.jwt.claims', NULL, true);
    PERFORM set_config('role', 'anon', true);
  ELSE
    PERFORM tests.authenticate_as(who);
  END IF;
END $$;

-- Runs q as who; '<n> rows' or the refusal's SQLSTATE, then whether the report's
-- whole state changed.
CREATE OR REPLACE FUNCTION pg_temp.attempt(who text, q text, rid uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_before jsonb; v_after jsonb; v_n int; v_res text;
BEGIN
  v_before := pg_temp.state(rid);
  PERFORM pg_temp.act_as(who);
  BEGIN
    EXECUTE q;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_res := v_n || ' rows';
  EXCEPTION WHEN others THEN
    v_res := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM tests.clear_authentication();
  v_after := pg_temp.state(rid);
  RETURN v_res || CASE WHEN v_after IS NOT DISTINCT FROM v_before THEN ', unchanged' ELSE ', changed' END;
END $$;

-- One integer read as who; NULL when the read is refused.
CREATE OR REPLACE FUNCTION pg_temp.count_as(who text, q text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE v int;
BEGIN
  PERFORM pg_temp.act_as(who);
  BEGIN
    EXECUTE q INTO v;
  EXCEPTION WHEN others THEN
    v := NULL;
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM tests.clear_authentication();
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.new_report(id uuid, status text) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status)
                   VALUES (%L, 'F7d 137 nuevo', '2027-03-05', '2027-03-06', auth.uid(), %L)$q$, id, status)
$$;
CREATE OR REPLACE FUNCTION pg_temp.new_item(id uuid, rid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$INSERT INTO public.expense_items (id, report_id, description, amount, expense_date)
                   VALUES (%L, %L, 'F7d 137 gasto nuevo', 1234, '2027-03-05')$q$, id, rid)
$$;
CREATE OR REPLACE FUNCTION pg_temp.ev_count(rid uuid) RETURNS int LANGUAGE plpgsql AS $$
DECLARE v int;
BEGIN
  IF to_regclass('public.expense_report_events') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT count(*)::int FROM public.expense_report_events WHERE report_id = $1' INTO v USING rid;
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ev_has(rid uuid, ev text, actor uuid, cmt text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  IF to_regclass('public.expense_report_events') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.expense_report_events
                           WHERE report_id = $1 AND event = $2 AND actor_id IS NOT DISTINCT FROM $3
                             AND comment IS NOT DISTINCT FROM $4)' INTO v USING rid, ev, actor, cmt;
  RETURN v;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Who files: admin, consultor, a second consultor, community manager
--    create, add an item, send
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_admin1', pg_temp.new_report(pg_temp.r('01'), 'draft'), pg_temp.r('01')), '1 rows, changed', 'admin creates a report');
SELECT is(pg_temp.attempt('f7d137_admin1', pg_temp.new_item(pg_temp.i('01'), pg_temp.r('01')), pg_temp.r('01')), '1 rows, changed', 'admin adds an item');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'submitted', submitted_at = now() WHERE id = %L$q$, pg_temp.r('01')), pg_temp.r('01')),
  '1 rows, changed', 'admin sends it');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_report(pg_temp.r('02'), 'draft'), pg_temp.r('02')), '1 rows, changed', 'consultor creates a report');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('02'), pg_temp.r('02')), pg_temp.r('02')), '1 rows, changed', 'consultor adds an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'submitted', submitted_at = now() WHERE id = %L$q$, pg_temp.r('02')), pg_temp.r('02')),
  '1 rows, changed', 'consultor sends it');
SELECT is(pg_temp.attempt('f7d137_cons2', pg_temp.new_report(pg_temp.r('03'), 'draft'), pg_temp.r('03')), '1 rows, changed', 'second consultor creates a report');
SELECT is(pg_temp.attempt('f7d137_cons2', pg_temp.new_item(pg_temp.i('03'), pg_temp.r('03')), pg_temp.r('03')), '1 rows, changed', 'second consultor adds an item');
SELECT is(pg_temp.attempt('f7d137_cons2', format($q$UPDATE public.expense_reports SET status = 'submitted', submitted_at = now() WHERE id = %L$q$, pg_temp.r('03')), pg_temp.r('03')),
  '1 rows, changed', 'second consultor sends it');
SELECT is(pg_temp.attempt('f7d137_cm', pg_temp.new_report(pg_temp.r('04'), 'draft'), pg_temp.r('04')), '1 rows, changed', 'community manager creates a report');
SELECT is(pg_temp.attempt('f7d137_cm', pg_temp.new_item(pg_temp.i('04'), pg_temp.r('04')), pg_temp.r('04')), '1 rows, changed', 'community manager adds an item');
SELECT is(pg_temp.attempt('f7d137_cm', format($q$UPDATE public.expense_reports SET status = 'submitted', submitted_at = now() WHERE id = %L$q$, pg_temp.r('04')), pg_temp.r('04')),
  '1 rows, changed', 'community manager sends it');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_report(pg_temp.r('05'), 'submitted'), pg_temp.r('05')), '1 rows, changed',
  'consultor creates a report already sent');

-- ---------------------------------------------------------------------------
-- 3. Who does not: docente, directivo, old switch without a filing role,
--    inactive consultor, consultor held by the forced-password gate, anon
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_docente',   pg_temp.new_report(pg_temp.r('06'), 'draft'), pg_temp.r('06')), '42501, unchanged', 'docente with no access row cannot create a report');
SELECT is(pg_temp.attempt('f7d137_directivo', pg_temp.new_report(pg_temp.r('07'), 'draft'), pg_temp.r('07')), '42501, unchanged', 'directivo cannot create a report');
SELECT is(pg_temp.attempt('f7d137_oldsw',     pg_temp.new_report(pg_temp.r('08'), 'draft'), pg_temp.r('08')), '42501, unchanged', 'old can_submit row without a filing role: cannot create a report');
SELECT is(pg_temp.attempt('f7d137_inactive',  pg_temp.new_report(pg_temp.r('09'), 'draft'), pg_temp.r('09')), '42501, unchanged', 'inactive consultor cannot create a report');
SELECT is(pg_temp.attempt('f7d137_mustpw',    pg_temp.new_report(pg_temp.r('0a'), 'draft'), pg_temp.r('0a')), '42501, unchanged', 'consultor who must change the password cannot create a report');
SELECT is(pg_temp.attempt('anon',             pg_temp.new_report(pg_temp.r('0b'), 'draft'), pg_temp.r('0b')), '42501, unchanged', 'visitor cannot create a report');
SELECT is(pg_temp.attempt('f7d137_oldsw', pg_temp.new_item(pg_temp.i('0c'), pg_temp.r('10')), pg_temp.r('10')), '42501, unchanged',
  'old switch: cannot add an item to their own old draft');
SELECT is(pg_temp.attempt('f7d137_oldsw', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('10')), pg_temp.r('10')), '0 rows, unchanged',
  'old switch: cannot change their own old draft');
SELECT is(pg_temp.attempt('f7d137_oldsw', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('10')), pg_temp.r('10')), '0 rows, unchanged',
  'old switch: cannot delete their own old draft');
SELECT is(pg_temp.count_as('f7d137_oldsw', 'SELECT count(*)::int FROM public.expense_reports'), 0, 'old switch: no longer reads their own reports');
SELECT is(pg_temp.count_as('f7d137_oldsw', 'SELECT count(*)::int FROM public.expense_items'), 0, 'old switch: no longer reads their own items');
SELECT is(pg_temp.count_as('f7d137_docente', 'SELECT count(*)::int FROM public.expense_reports'), 0, 'docente reads no report');
SELECT is(pg_temp.count_as('f7d137_directivo', 'SELECT count(*)::int FROM public.expense_items'), 0, 'directivo reads no item');
SELECT is(pg_temp.count_as('f7d137_inactive', 'SELECT count(*)::int FROM public.expense_reports'), 0, 'inactive consultor reads no report');
SELECT is(coalesce(pg_temp.count_as('anon', 'SELECT count(*)::int FROM public.expense_reports'), 0), 0, 'visitor reads no report (0 rows or refused)');
SELECT is(coalesce(pg_temp.count_as('anon', 'SELECT count(*)::int FROM public.expense_items'), 0), 0, 'visitor reads no item (0 rows or refused)');

-- ---------------------------------------------------------------------------
-- 4. Who reads what: a non-admin only their own, admins all
-- ---------------------------------------------------------------------------
SELECT set_config('f7d137.all', (SELECT count(*) FROM public.expense_reports WHERE report_name LIKE 'F7d 137%')::text, true);
SELECT set_config('f7d137.cons1', (SELECT count(*) FROM public.expense_reports WHERE submitted_by = pg_temp.uid('f7d137_cons1'))::text, true);
SELECT set_config('f7d137.cons1_uid', pg_temp.uid('f7d137_cons1')::text, true);
SELECT set_config('f7d137.cm_uid', pg_temp.uid('f7d137_cm')::text, true);
SELECT set_config('f7d137.cons2_uid', pg_temp.uid('f7d137_cons2')::text, true);
SELECT is(pg_temp.count_as('f7d137_cons1', $$SELECT count(*)::int FROM public.expense_reports WHERE submitted_by <> current_setting('f7d137.cons1_uid')::uuid$$), 0,
  'consultor reads no one else''s report');
SELECT is(pg_temp.count_as('f7d137_cons1', 'SELECT count(*)::int FROM public.expense_reports'), current_setting('f7d137.cons1')::int,
  'consultor reads every report of their own');
SELECT is(pg_temp.count_as('f7d137_cons1', format('SELECT count(*)::int FROM public.expense_items WHERE report_id = %L', pg_temp.r('11'))), 0,
  'consultor reads no item of another filer''s report');
SELECT is(pg_temp.count_as('f7d137_cm', $$SELECT count(*)::int FROM public.expense_reports WHERE submitted_by <> current_setting('f7d137.cm_uid')::uuid$$), 0,
  'community manager reads no one else''s report');
SELECT is(pg_temp.count_as('f7d137_admin2', $$SELECT count(*)::int FROM public.expense_reports WHERE report_name LIKE 'F7d 137%'$$), current_setting('f7d137.all')::int,
  'admin reads every report');
SELECT is(pg_temp.count_as('f7d137_admin2', format('SELECT count(*)::int FROM public.expense_items WHERE report_id IN (%L, %L, %L)', pg_temp.r('10'), pg_temp.r('11'), pg_temp.r('13'))), 3,
  'admin reads the items of others'' reports');

-- ---------------------------------------------------------------------------
-- 5. The author on their own DRAFT: allowed
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET report_name = 'F7d 137 cons1 draft renamed' WHERE id = %L$q$, pg_temp.r('16')), pg_temp.r('16')),
  '1 rows, changed', 'own draft: author changes the report');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET amount = 650 WHERE id = %L$q$, pg_temp.i('6a')), pg_temp.r('16')),
  '1 rows, changed', 'own draft: author changes an item');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('6c'), pg_temp.r('16')), pg_temp.r('16')), '1 rows, changed', 'own draft: author adds an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('6b')), pg_temp.r('16')),
  '1 rows, changed', 'own draft: author deletes an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET submitted_by = %L WHERE id = %L$q$, pg_temp.uid('f7d137_cons2'), pg_temp.r('16')), pg_temp.r('16')),
  '42501, unchanged', 'own draft: author cannot hand it to another person');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('16')), pg_temp.r('16')),
  '1 rows, changed', 'own draft: author deletes the report');

-- ---------------------------------------------------------------------------
-- 6. The author on their own SENT report: everything refused
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('12')), pg_temp.r('12')),
  '0 rows, unchanged', 'own sent: author cannot change the report');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'draft' WHERE id = %L$q$, pg_temp.r('12')), pg_temp.r('12')),
  '0 rows, unchanged', 'own sent: author cannot take it back to draft');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'approved' WHERE id = %L$q$, pg_temp.r('12')), pg_temp.r('12')),
  '0 rows, unchanged', 'own sent: author cannot approve it');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET amount = 1 WHERE id = %L$q$, pg_temp.i('12')), pg_temp.r('12')),
  '0 rows, unchanged', 'own sent: author cannot change an item');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('2f'), pg_temp.r('12')), pg_temp.r('12')), '42501, unchanged', 'own sent: author cannot add an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('12')), pg_temp.r('12')),
  '0 rows, unchanged', 'own sent: author cannot delete an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('12')), pg_temp.r('12')),
  '0 rows, unchanged', 'own sent: author cannot delete the report');

-- ---------------------------------------------------------------------------
-- 7. The author on their own APPROVED report: everything refused
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('13')), pg_temp.r('13')),
  '0 rows, unchanged', 'own approved: author cannot change the report');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'draft' WHERE id = %L$q$, pg_temp.r('13')), pg_temp.r('13')),
  '0 rows, unchanged', 'own approved: author cannot take it back to draft');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET amount = 1 WHERE id = %L$q$, pg_temp.i('13')), pg_temp.r('13')),
  '0 rows, unchanged', 'own approved: author cannot change an item');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('3f'), pg_temp.r('13')), pg_temp.r('13')), '42501, unchanged', 'own approved: author cannot add an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('13')), pg_temp.r('13')),
  '0 rows, unchanged', 'own approved: author cannot delete an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('13')), pg_temp.r('13')),
  '0 rows, unchanged', 'own approved: author cannot delete the report');

-- ---------------------------------------------------------------------------
-- 8. The author never approves their own report
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'approved' WHERE id = %L$q$, pg_temp.r('18')), pg_temp.r('18')),
  '42501, unchanged', 'own draft: author cannot set it approved');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'approved' WHERE id = %L$q$, pg_temp.r('17')), pg_temp.r('17')),
  '42501, unchanged', 'own rejected: author cannot set it approved');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_report(pg_temp.r('0d'), 'approved'), pg_temp.r('0d')), '42501, unchanged',
  'author cannot create a report already approved');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_report(pg_temp.r('0e'), 'rejected'), pg_temp.r('0e')), '42501, unchanged',
  'author cannot create a report already rejected');

-- ---------------------------------------------------------------------------
-- 9. The author on their own REJECTED report: correct and resend, or delete
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET amount = 1750 WHERE id = %L$q$, pg_temp.i('17')), pg_temp.r('17')),
  '1 rows, changed', 'own rejected: author changes an item');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('7f'), pg_temp.r('17')), pg_temp.r('17')), '1 rows, changed', 'own rejected: author adds an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('7f')), pg_temp.r('17')),
  '1 rows, changed', 'own rejected: author deletes an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('17')), pg_temp.r('17')),
  '1 rows, changed', 'own rejected: author deletes the report');

-- ---------------------------------------------------------------------------
-- 10. Another filer's report: nothing
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.count_as('f7d137_cons1', format('SELECT count(*)::int FROM public.expense_reports WHERE id = %L', pg_temp.r('11'))), 0,
  'other filer''s draft: not visible');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('11')), pg_temp.r('11')),
  '0 rows, unchanged', 'other filer''s draft: cannot change it');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'submitted' WHERE id = %L$q$, pg_temp.r('11')), pg_temp.r('11')),
  '0 rows, unchanged', 'other filer''s draft: cannot send it');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('11')), pg_temp.r('11')),
  '0 rows, unchanged', 'other filer''s draft: cannot delete it');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('1f'), pg_temp.r('11')), pg_temp.r('11')), '42501, unchanged',
  'other filer''s draft: cannot add an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET amount = 1 WHERE id = %L$q$, pg_temp.i('11')), pg_temp.r('11')),
  '0 rows, unchanged', 'other filer''s draft: cannot change an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('11')), pg_temp.r('11')),
  '0 rows, unchanged', 'other filer''s draft: cannot delete an item');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET report_id = %L WHERE id = %L$q$, pg_temp.r('11'), pg_temp.i('02')), pg_temp.r('11')),
  '0 rows, unchanged', 'cannot move an item of an own SENT report anywhere');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('8a'), pg_temp.r('18')), pg_temp.r('18')), '1 rows, changed',
  'fixture: an item on the author''s own draft B');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET report_id = %L WHERE id = %L$q$, pg_temp.r('11'), pg_temp.i('8a')), pg_temp.r('11')),
  '42501, unchanged', 'cannot move an item of an own draft into another filer''s report');

-- ---------------------------------------------------------------------------
-- 11. Admins decide: anyone's sent report, their own included
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = %L$q$, pg_temp.r('12')), pg_temp.r('12')),
  '1 rows, changed', 'admin approves a consultor''s sent report');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_comments = 'F7d 137 falta detalle' WHERE id = %L$q$, pg_temp.r('04')), pg_temp.r('04')),
  '1 rows, changed', 'admin rejects a community manager''s sent report');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = %L$q$, pg_temp.r('14')), pg_temp.r('14')),
  '1 rows, changed', 'admin approves their own sent report');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_reports SET status = 'rejected', review_comments = 'F7d 137 revisar' WHERE id = %L$q$, pg_temp.r('01')), pg_temp.r('01')),
  '1 rows, changed', 'another admin rejects an admin''s sent report');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'rejected', review_comments = 'F7d 137 otra vez' WHERE id = %L$q$, pg_temp.r('01')), pg_temp.r('01')),
  '1 rows, changed', 'an admin may act on their own rejected report like any author');

-- ---------------------------------------------------------------------------
-- 12. An admin's OWN approved report is closed to them; another admin corrects it
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('15')), pg_temp.r('15')),
  '0 rows, unchanged', 'own approved (admin author): cannot change the report');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'draft' WHERE id = %L$q$, pg_temp.r('15')), pg_temp.r('15')),
  '0 rows, unchanged', 'own approved (admin author): cannot reopen it');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_items SET amount = 1 WHERE id = %L$q$, pg_temp.i('15')), pg_temp.r('15')),
  '0 rows, unchanged', 'own approved (admin author): cannot change an item');
SELECT is(pg_temp.attempt('f7d137_admin1', pg_temp.new_item(pg_temp.i('5f'), pg_temp.r('15')), pg_temp.r('15')), '42501, unchanged',
  'own approved (admin author): cannot add an item');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('15')), pg_temp.r('15')),
  '0 rows, unchanged', 'own approved (admin author): cannot delete an item');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('15')), pg_temp.r('15')),
  '0 rows, unchanged', 'own approved (admin author): cannot delete the report');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('14')), pg_temp.r('14')),
  '0 rows, unchanged', 'the admin''s own report they just approved is closed to them too');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_reports SET report_name = 'F7d 137 admin1 approved (corregido)' WHERE id = %L$q$, pg_temp.r('15')), pg_temp.r('15')),
  '1 rows, changed', 'another admin corrects that approved report');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_items SET amount = 5100 WHERE id = %L$q$, pg_temp.i('15')), pg_temp.r('15')),
  '1 rows, changed', 'another admin corrects one of its items');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_items SET amount = 4100 WHERE id = %L$q$, pg_temp.i('13')), pg_temp.r('13')),
  '1 rows, changed', 'an admin corrects an item of a consultor''s approved report');

-- ---------------------------------------------------------------------------
-- 13. The history: sent -> rejected -> sent again -> approved
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_report(pg_temp.r('19'), 'draft'), pg_temp.r('19')), '1 rows, changed', 'history: consultor creates a draft');
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_item(pg_temp.i('19'), pg_temp.r('19')), pg_temp.r('19')), '1 rows, changed', 'history: adds an item');
SELECT is(pg_temp.ev_count(pg_temp.r('19')), 0, 'history: a draft has no line');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET report_name = 'F7d 137 historia' WHERE id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: a change that keeps the status ...');
SELECT is(pg_temp.ev_count(pg_temp.r('19')), 0, '... writes no line');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'submitted', submitted_at = now() WHERE id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: consultor sends it');
SELECT ok(pg_temp.ev_count(pg_temp.r('19')) = 1 AND pg_temp.ev_has(pg_temp.r('19'), 'submitted', pg_temp.uid('f7d137_cons1'), NULL),
  'history line 1: submitted, by the consultor');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_reports SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_comments = 'F7d 137 falta la boleta del taxi' WHERE id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: admin rejects it with a reason');
SELECT ok(pg_temp.ev_count(pg_temp.r('19')) = 2 AND pg_temp.ev_has(pg_temp.r('19'), 'rejected', pg_temp.uid('f7d137_admin2'), 'F7d 137 falta la boleta del taxi'),
  'history line 2: rejected, by the admin, with the reason');
SELECT is(pg_temp.count_as('f7d137_cons1', format($q$SELECT count(*)::int FROM public.expense_reports WHERE id = %L AND review_comments = 'F7d 137 falta la boleta del taxi'$q$, pg_temp.r('19'))), 1,
  'history: the author sees the reason');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_items SET amount = 2500, receipt_url = 'boletas/f7d137_taxi.pdf' WHERE id = %L$q$, pg_temp.i('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: author corrects the item and its receipt');
SELECT is(pg_temp.ev_count(pg_temp.r('19')), 2, 'history: correcting items writes no line');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_reports SET status = 'submitted', submitted_at = now() WHERE id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: author sends it again');
SELECT ok(pg_temp.ev_count(pg_temp.r('19')) = 3 AND pg_temp.ev_has(pg_temp.r('19'), 'resubmitted', pg_temp.uid('f7d137_cons1'), NULL),
  'history line 3: resubmitted, by the consultor');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_reports SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: admin approves it');
SELECT ok(pg_temp.ev_count(pg_temp.r('19')) = 4 AND pg_temp.ev_has(pg_temp.r('19'), 'approved', pg_temp.uid('f7d137_admin2'), NULL),
  'history line 4: approved, by the admin');
SELECT is(pg_temp.attempt('f7d137_admin1', format($q$UPDATE public.expense_reports SET status = 'draft' WHERE id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '1 rows, changed', 'history: an admin reopens the approved report');
SELECT ok(pg_temp.ev_count(pg_temp.r('19')) = 5 AND pg_temp.ev_has(pg_temp.r('19'), 'reopened', pg_temp.uid('f7d137_admin1'), NULL),
  'history line 5: reopened, by that admin');
SELECT ok(pg_temp.ev_count(pg_temp.r('04')) = 2 AND pg_temp.ev_has(pg_temp.r('04'), 'submitted', pg_temp.uid('f7d137_cm'), NULL)
          AND pg_temp.ev_has(pg_temp.r('04'), 'rejected', pg_temp.uid('f7d137_admin1'), 'F7d 137 falta detalle'),
  'history of the community manager''s report: submitted, rejected (one line each)');
SELECT ok(pg_temp.ev_count(pg_temp.r('05')) = 1 AND pg_temp.ev_has(pg_temp.r('05'), 'submitted', pg_temp.uid('f7d137_cons1'), NULL),
  'history: a report created already sent has its submitted line');
SELECT ok(pg_temp.ev_count(pg_temp.r('01')) = 2 AND pg_temp.ev_has(pg_temp.r('01'), 'rejected', pg_temp.uid('f7d137_admin2'), 'F7d 137 revisar')
          AND NOT pg_temp.ev_has(pg_temp.r('01'), 'reopened', pg_temp.uid('f7d137_admin2'), NULL),
  'history: a rejection of a sent report is one rejected line, not also reopened; rejected -> rejected writes nothing');
SELECT is(pg_temp.count_as('f7d137_cons1', format('SELECT count(*)::int FROM public.expense_report_events WHERE report_id = %L', pg_temp.r('19'))), 5,
  'history: the author reads the history of their report');
SELECT is(pg_temp.count_as('f7d137_cons2', format('SELECT count(*)::int FROM public.expense_report_events WHERE report_id = %L', pg_temp.r('19'))), 0,
  'history: another filer reads none of it');
SELECT is(pg_temp.count_as('f7d137_oldsw', 'SELECT count(*)::int FROM public.expense_report_events'), 0,
  'history: the old switch person reads nothing');
SELECT is(pg_temp.count_as('f7d137_admin1', format('SELECT count(*)::int FROM public.expense_report_events WHERE report_id = %L', pg_temp.r('19'))), 5,
  'history: an admin reads it');

-- ---------------------------------------------------------------------------
-- 14. Nobody writes the history directly
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$INSERT INTO public.expense_report_events (report_id, event, actor_id) VALUES (%L, 'approved', auth.uid())$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'author cannot insert a history line');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$UPDATE public.expense_report_events SET comment = 'x' WHERE report_id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'author cannot change a history line');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_report_events WHERE report_id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'author cannot delete a history line');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$INSERT INTO public.expense_report_events (report_id, event, actor_id) VALUES (%L, 'approved', auth.uid())$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'admin cannot insert a history line');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_report_events SET comment = 'x' WHERE report_id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'admin cannot change a history line');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$DELETE FROM public.expense_report_events WHERE report_id = %L$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'admin cannot delete a history line');
SELECT is(pg_temp.attempt('anon', format($q$INSERT INTO public.expense_report_events (report_id, event) VALUES (%L, 'approved')$q$, pg_temp.r('19')), pg_temp.r('19')),
  '42501, unchanged', 'visitor cannot insert a history line');
SELECT is(coalesce(pg_temp.count_as('anon', 'SELECT count(*)::int FROM public.expense_report_events'), 0), 0,
  'visitor reads no history (0 rows or refused)');

-- ---------------------------------------------------------------------------
-- 15. A deleted draft leaves its history; the server's assistant still saves
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f7d137_cons1', pg_temp.new_report(pg_temp.r('1a'), 'submitted'), pg_temp.r('1a')), '1 rows, changed', 'a report sent at creation ...');
SELECT is(pg_temp.attempt('f7d137_admin2', format($q$UPDATE public.expense_reports SET status = 'rejected', review_comments = 'F7d 137 no corresponde' WHERE id = %L$q$, pg_temp.r('1a')), pg_temp.r('1a')),
  '1 rows, changed', '... rejected ...');
SELECT is(pg_temp.attempt('f7d137_cons1', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('1a')), pg_temp.r('1a')),
  '1 rows, changed', '... and deleted by its author');
SELECT is(pg_temp.ev_count(pg_temp.r('1a')), 2, 'its two history lines stay (no foreign key)');

SET LOCAL ROLE service_role;
SELECT lives_ok(format($q$SELECT public.bot_save_expense_item(
    p_user_id => %L, p_report_id => NULL, p_report_name => 'F7d 137 bot', p_start => '2027-03-01', p_end => '2027-03-01',
    p_category_id => NULL, p_description => 'F7d 137 gasto bot', p_amount => 990, p_currency => 'CLP',
    p_original_amount => NULL, p_conversion_rate => NULL, p_conversion_date => NULL, p_expense_date => '2027-03-01',
    p_vendor => NULL, p_expense_number => NULL, p_receipt_url => NULL, p_receipt_filename => NULL, p_notes => NULL)$q$,
    current_setting('f7d137.cons2_uid')),
  'the assistant (service key) still saves an expense for a consultor');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.expense_reports r JOIN public.expense_items i ON i.report_id = r.id
            WHERE r.report_name = 'F7d 137 bot' AND r.submitted_by = pg_temp.uid('f7d137_cons2') AND r.status = 'draft'), 1,
  'its draft and item are there');

SELECT * FROM finish();
ROLLBACK;
