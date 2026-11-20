-- =============================================================================
-- 153-expense-report-save.sql — GENERA fixes F21h (GES-3.26):
-- migration 20261119107000_expense_report_save.sql.
--
-- public.save_expense_report(p_report_id, p_report, p_items, p_removed) saves an
-- edited expense report in one statement, with the caller's own session
-- (SECURITY INVOKER), so the rules of 20261117166000 still decide who may
-- change which report:
--   * the report's editable fields, the listed items by id, the new items;
--   * deletes ONLY the item ids the form removed (p_removed), never an item
--     the form did not know (one added meanwhile, e.g. by the assistant);
--   * an item's conversion_date is kept when amount, currency and rate did
--     not change;
--   * the total is the sum of the stored items;
--   * all or nothing: one item the table refuses undoes the whole save;
--   * columns outside the form's list are never written;
--   * refused exactly where 137 refuses a direct edit (same people, states).
--
-- Every save is made as that person through pg_temp.attempt(person, sql,
-- report), the helper of 137: '<n> rows' or the refusal's SQLSTATE, then
-- ', unchanged' or ', changed' (the report's row, items and history, read as
-- postgres).
--
-- Invented people and data only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(48);

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT ok(to_regprocedure('public.save_expense_report(uuid, jsonb, jsonb, uuid[])') IS NOT NULL,
  'save_expense_report(uuid, jsonb, jsonb, uuid[]) exists');
SELECT ok(coalesce((SELECT NOT p.prosecdef AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
                      AND p.proconfig = ARRAY['search_path=public, pg_temp']
                      FROM pg_proc p WHERE p.oid = to_regprocedure('public.save_expense_report(uuid, jsonb, jsonb, uuid[])')), false),
  'save_expense_report: plpgsql, SECURITY INVOKER, search_path = public, pg_temp');
SELECT ok(coalesce((SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                       AND (SELECT count(*) FROM aclexplode(p.proacl) a WHERE a.grantee = 0) = 0
                      FROM pg_proc p WHERE p.oid = to_regprocedure('public.save_expense_report(uuid, jsonb, jsonb, uuid[])')), false),
  'save_expense_report: EXECUTE for authenticated; not PUBLIC, not anon');

-- ---------------------------------------------------------------------------
-- Fixtures (postgres, synthetic) — the people of 137
-- ---------------------------------------------------------------------------
SELECT tests.create_supabase_user('f21h153_admin1');
SELECT tests.create_supabase_user('f21h153_admin2');
SELECT tests.create_supabase_user('f21h153_cons1');
SELECT tests.create_supabase_user('f21h153_cons2');
SELECT tests.create_supabase_user('f21h153_docente');
SELECT tests.create_supabase_user('f21h153_directivo');
SELECT tests.create_supabase_user('f21h153_oldsw');
SELECT tests.create_supabase_user('f21h153_inactive');
SELECT tests.create_supabase_user('f21h153_mustpw');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.r(n text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('15300000-0000-4000-8000-0000000000' || n)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.i(n text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('15300000-0000-4000-8000-0000000001' || n)::uuid $$;

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@f21h153.test.local', k, 'approved', (k = 'f21h153_mustpw')
  FROM unnest(ARRAY['f21h153_admin1','f21h153_admin2','f21h153_cons1','f21h153_cons2','f21h153_docente',
                    'f21h153_directivo','f21h153_oldsw','f21h153_inactive','f21h153_mustpw']) k
ON CONFLICT (id) DO UPDATE SET must_change_password = EXCLUDED.must_change_password;

INSERT INTO public.schools (id, name) VALUES (915301, 'F21h school (pgTAP 153)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f21h153_admin1'),    'admin',            NULL,   NULL, true),
  (pg_temp.uid('f21h153_admin2'),    'admin',            NULL,   NULL, true),
  (pg_temp.uid('f21h153_cons1'),     'consultor',        915301, NULL, true),
  (pg_temp.uid('f21h153_cons2'),     'consultor',        915301, NULL, true),
  (pg_temp.uid('f21h153_docente'),   'docente',          915301, NULL, true),
  (pg_temp.uid('f21h153_directivo'), 'equipo_directivo', 915301, NULL, true),
  (pg_temp.uid('f21h153_oldsw'),     'docente',          915301, NULL, true),
  (pg_temp.uid('f21h153_inactive'),  'consultor',        915301, NULL, false),
  (pg_temp.uid('f21h153_mustpw'),    'consultor',        915301, NULL, true);
INSERT INTO public.expense_report_access (user_id, can_submit, granted_by, notes) VALUES
  (pg_temp.uid('f21h153_oldsw'), true, pg_temp.uid('f21h153_admin1'), 'F21h 153 sintetico')
ON CONFLICT (user_id) DO UPDATE SET can_submit = EXCLUDED.can_submit;

INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status, total_amount) VALUES
  (pg_temp.r('01'), 'F21h 153 cons1 draft',      '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons1'), 'draft', 2300),
  (pg_temp.r('02'), 'F21h 153 cons1 draft B',    '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons1'), 'draft', 1000),
  (pg_temp.r('03'), 'F21h 153 cons1 draft C',    '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons1'), 'draft', 0),
  (pg_temp.r('11'), 'F21h 153 cons2 draft',      '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons2'), 'draft', 2000),
  (pg_temp.r('12'), 'F21h 153 cons1 sent',       '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons1'), 'submitted', 3000),
  (pg_temp.r('13'), 'F21h 153 cons1 approved',   '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons1'), 'approved', 4000),
  (pg_temp.r('15'), 'F21h 153 admin1 approved',  '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_admin1'), 'approved', 5000),
  (pg_temp.r('17'), 'F21h 153 cons1 rejected',   '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_cons1'), 'rejected', 1700),
  (pg_temp.r('21'), 'F21h 153 docente draft',    '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_docente'), 'draft', 100),
  (pg_temp.r('22'), 'F21h 153 directivo draft',  '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_directivo'), 'draft', 100),
  (pg_temp.r('23'), 'F21h 153 old switch draft', '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_oldsw'), 'draft', 100),
  (pg_temp.r('24'), 'F21h 153 inactive draft',   '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_inactive'), 'draft', 100),
  (pg_temp.r('25'), 'F21h 153 mustpw draft',     '2027-03-01', '2027-03-09', pg_temp.uid('f21h153_mustpw'), 'draft', 100);
UPDATE public.expense_reports SET review_comments = 'F21h 153 falta boleta', reviewed_by = pg_temp.uid('f21h153_admin1')
 WHERE id = pg_temp.r('17');
INSERT INTO public.expense_items (id, report_id, description, amount, expense_date, currency, original_amount, conversion_rate, conversion_date) VALUES
  (pg_temp.i('1a'), pg_temp.r('01'), 'F21h 153 taxi',   1000, '2027-03-01', 'CLP', 1000, 1, '2027-01-10'),
  (pg_temp.i('1b'), pg_temp.r('01'), 'F21h 153 metro',   700, '2027-03-02', 'CLP',  700, 1, '2027-01-10'),
  (pg_temp.i('1c'), pg_temp.r('01'), 'F21h 153 cafe',    600, '2027-03-03', 'CLP',  600, 1, '2027-01-15'),
  (pg_temp.i('2a'), pg_temp.r('02'), 'F21h 153 bus',    1000, '2027-03-01', 'CLP', 1000, 1, '2027-01-10'),
  (pg_temp.i('11'), pg_temp.r('11'), 'F21h 153 almuerzo', 2000, '2027-03-01', 'CLP', 2000, 1, '2027-01-10'),
  (pg_temp.i('12'), pg_temp.r('12'), 'F21h 153 sent bus', 3000, '2027-03-01', 'CLP', 3000, 1, '2027-01-10'),
  (pg_temp.i('13'), pg_temp.r('13'), 'F21h 153 hotel',  4000, '2027-03-01', 'CLP', 4000, 1, '2027-01-10'),
  (pg_temp.i('15'), pg_temp.r('15'), 'F21h 153 peaje',  5000, '2027-03-01', 'CLP', 5000, 1, '2027-01-10'),
  (pg_temp.i('17'), pg_temp.r('17'), 'F21h 153 cena',   1700, '2027-03-01', 'CLP', 1700, 1, '2027-01-10'),
  (pg_temp.i('21'), pg_temp.r('21'), 'F21h 153 x',       100, '2027-03-01', 'CLP',  100, 1, '2027-01-10'),
  (pg_temp.i('22'), pg_temp.r('22'), 'F21h 153 x',       100, '2027-03-01', 'CLP',  100, 1, '2027-01-10'),
  (pg_temp.i('23'), pg_temp.r('23'), 'F21h 153 x',       100, '2027-03-01', 'CLP',  100, 1, '2027-01-10'),
  (pg_temp.i('24'), pg_temp.r('24'), 'F21h 153 x',       100, '2027-03-01', 'CLP',  100, 1, '2027-01-10'),
  (pg_temp.i('25'), pg_temp.r('25'), 'F21h 153 x',       100, '2027-03-01', 'CLP',  100, 1, '2027-01-10');

-- The whole state of one report, read as postgres (as in 137).
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

-- The statement the form sends: one call of the function.
CREATE OR REPLACE FUNCTION pg_temp.save(rid uuid, rep jsonb, items jsonb, removed uuid[]) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.save_expense_report(%L::uuid, %L::jsonb, %L::jsonb, %L::uuid[])', rid, rep, items, removed)
$$;
-- A plain save of a report as it is (name only), used for the refusals.
CREATE OR REPLACE FUNCTION pg_temp.touch(rid uuid, item uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.save(rid, '{"report_name": "F21h 153 cambiado"}'::jsonb,
                      jsonb_build_array(jsonb_build_object('id', item, 'description', 'F21h 153 cambiado', 'amount', 1)),
                      ARRAY[]::uuid[])
$$;

-- ---------------------------------------------------------------------------
-- 2. The author's draft: an item changed, one added, one removed; one added
--    meanwhile (not in the form) survives
-- ---------------------------------------------------------------------------
-- added after the form opened (e.g. by the assistant): the form does not know it
INSERT INTO public.expense_items (id, report_id, description, amount, expense_date)
VALUES (pg_temp.i('1e'), pg_temp.r('01'), 'F21h 153 agregado por el asistente', 400, '2027-03-04');

SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('01'),
    '{"report_name": "F21h 153 cons1 draft (editado)", "description": "nueva descripcion", "start_date": "2027-03-01", "end_date": "2027-03-10"}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.i('1a'), 'description', 'F21h 153 taxi', 'amount', 1500, 'original_amount', 1500,
                         'currency', 'CLP', 'conversion_rate', 1, 'conversion_date', '2027-03-09', 'expense_date', '2027-03-01'),
      jsonb_build_object('id', pg_temp.i('1c'), 'description', 'F21h 153 cafe', 'amount', 600, 'original_amount', 600,
                         'currency', 'CLP', 'conversion_rate', 1, 'conversion_date', '2027-03-09', 'expense_date', '2027-03-03',
                         'notes', 'con leche'),
      jsonb_build_object('description', 'F21h 153 hotel nuevo', 'amount', 30000, 'original_amount', 30000,
                         'currency', 'CLP', 'conversion_rate', 1, 'conversion_date', '2027-03-09', 'expense_date', '2027-03-05',
                         'vendor', 'Hotel Sintetico', 'expense_number', 'B-153')),
    ARRAY[pg_temp.i('1b')]), pg_temp.r('01')),
  '1 rows, changed', 'own draft: the author saves an edit through the function');
SELECT is((SELECT report_name || '|' || description || '|' || end_date FROM public.expense_reports WHERE id = pg_temp.r('01')),
  'F21h 153 cons1 draft (editado)|nueva descripcion|2027-03-10', 'the report''s own fields are written');
SELECT is((SELECT amount FROM public.expense_items WHERE id = pg_temp.i('1a')), 1500.00::numeric, 'the changed item has its new amount');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.expense_items WHERE id = pg_temp.i('1b')), 'the item the form removed is gone');
SELECT is((SELECT count(*)::int FROM public.expense_items WHERE report_id = pg_temp.r('01') AND description = 'F21h 153 hotel nuevo'
             AND vendor = 'Hotel Sintetico' AND expense_number = 'B-153'), 1, 'the new item is inserted once');
SELECT ok(EXISTS (SELECT 1 FROM public.expense_items WHERE id = pg_temp.i('1e') AND amount = 400),
  'an item added meanwhile (not sent, not removed) survives');
SELECT is((SELECT notes FROM public.expense_items WHERE id = pg_temp.i('1c')), 'con leche', 'an unchanged-amount item gets its edited notes');
SELECT ok(EXISTS (SELECT 1 FROM public.expense_items WHERE id = pg_temp.i('1a')) AND
          (SELECT array_agg(id ORDER BY id) FROM public.expense_items WHERE report_id = pg_temp.r('01') AND id IN (pg_temp.i('1a'), pg_temp.i('1c'), pg_temp.i('1e')))
            = ARRAY[pg_temp.i('1a'), pg_temp.i('1c'), pg_temp.i('1e')],
  'the listed items keep their ids (updated, not deleted and inserted again)');
SELECT is((SELECT count(*)::int FROM public.expense_items WHERE report_id = pg_temp.r('01')), 4, 'exactly four items: taxi, cafe, hotel, the assistant''s');
SELECT is((SELECT total_amount FROM public.expense_reports WHERE id = pg_temp.r('01')),
          (SELECT sum(amount) FROM public.expense_items WHERE report_id = pg_temp.r('01')),
  'the total equals the sum of the stored items');
SELECT is((SELECT total_amount FROM public.expense_reports WHERE id = pg_temp.r('01')), 32500.00::numeric, 'that sum is 1500 + 600 + 30000 + 400');

-- conversion_date: kept when amount, currency and rate did not change
SELECT is((SELECT conversion_date FROM public.expense_items WHERE id = pg_temp.i('1c')), '2027-01-15'::date,
  'conversion_date kept: the cafe''s amount, currency and rate did not change');
SELECT is((SELECT conversion_date FROM public.expense_items WHERE id = pg_temp.i('1a')), '2027-03-09'::date,
  'conversion_date set: the taxi''s amount changed');
SELECT is((SELECT conversion_date FROM public.expense_items WHERE description = 'F21h 153 hotel nuevo'), '2027-03-09'::date,
  'conversion_date set for a new item');

-- the function returns the report with its items
CREATE OR REPLACE FUNCTION pg_temp.returned(who text, q text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.act_as(who);
  BEGIN
    EXECUTE q INTO v;
  EXCEPTION WHEN others THEN
    v := jsonb_build_object('error', SQLSTATE);
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM tests.clear_authentication();
  RETURN v;
END $$;
SELECT set_config('f21h153.ret', pg_temp.returned('f21h153_cons1',
  pg_temp.save(pg_temp.r('01'), '{}'::jsonb, '[]'::jsonb, ARRAY[]::uuid[]))::text, true);
SELECT is((current_setting('f21h153.ret')::jsonb ->> 'id'), pg_temp.r('01')::text, 'it returns the report ...');
SELECT is(jsonb_array_length(current_setting('f21h153.ret')::jsonb -> 'expense_items'), 4, '... with its four stored items');
SELECT is((current_setting('f21h153.ret')::jsonb ->> 'total_amount')::numeric, 32500::numeric, '... and its total');

-- ---------------------------------------------------------------------------
-- 3. All or nothing: an item the table refuses undoes the whole save
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('02'),
    '{"report_name": "F21h 153 no debe quedar"}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id', pg_temp.i('2a'), 'description', 'F21h 153 bus caro', 'amount', 9999, 'expense_date', '2027-03-01'),
      jsonb_build_object('description', 'F21h 153 sin monto', 'amount', 0, 'expense_date', '2027-03-02')),
    ARRAY[]::uuid[]), pg_temp.r('02')),
  '23514, unchanged', 'an item with amount 0 (the table refuses it): nothing of the save is stored');
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('02'),
    '{"report_name": "F21h 153 no debe quedar"}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('description', 'F21h 153 moneda rara', 'amount', 50, 'currency', 'XYZ', 'expense_date', '2027-03-02')),
    ARRAY[pg_temp.i('2a')]), pg_temp.r('02')),
  '23514, unchanged', 'an item with a currency the table refuses: the removal and the report change are undone too');
SELECT is((SELECT report_name || '|' || total_amount FROM public.expense_reports WHERE id = pg_temp.r('02')),
  'F21h 153 cons1 draft B|1000.00', 'the report is as before');
SELECT is((SELECT string_agg(description || ':' || amount, ',') FROM public.expense_items WHERE report_id = pg_temp.r('02')),
  'F21h 153 bus:1000.00', 'its items are as before');

-- ---------------------------------------------------------------------------
-- 4. Only the form's columns are written
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('03'),
    jsonb_build_object('report_name', 'F21h 153 draft C (editado)', 'status', 'approved', 'submitted_by', pg_temp.uid('f21h153_cons2'),
                       'reviewed_by', pg_temp.uid('f21h153_admin1'), 'reviewed_at', '2027-03-01T00:00:00Z',
                       'review_comments', 'F21h 153 aprobado a mano', 'total_amount', 999999, 'id', pg_temp.r('11')),
    jsonb_build_array(
      jsonb_build_object('description', 'F21h 153 otro reporte', 'amount', 250, 'expense_date', '2027-03-02',
                         'report_id', pg_temp.r('11'), 'created_at', '2000-01-01T00:00:00Z')),
    ARRAY[pg_temp.i('11')]), pg_temp.r('03')),
  '1 rows, changed', 'a save that also sends columns outside the form''s list');
SELECT is((SELECT status::text || '|' || submitted_by::text || '|' || coalesce(reviewed_by::text, '-') || '|'
                  || coalesce(reviewed_at::text, '-') || '|' || coalesce(review_comments, '-')
             FROM public.expense_reports WHERE id = pg_temp.r('03')),
  'draft|' || pg_temp.uid('f21h153_cons1') || '|-|-|-', 'status, submitted_by and the review fields are not written');
SELECT is((SELECT report_name || '|' || total_amount FROM public.expense_reports WHERE id = pg_temp.r('03')),
  'F21h 153 draft C (editado)|250.00', 'the name is written; the total is the stored sum, not the one sent');
SELECT is((SELECT count(*)::int FROM public.expense_items WHERE report_id = pg_temp.r('03') AND description = 'F21h 153 otro reporte'
             AND created_at > '2001-01-01'), 1, 'the new item goes to the saved report (its report_id and created_at are ignored)');
SELECT is((SELECT count(*)::int FROM public.expense_items WHERE report_id = pg_temp.r('11')), 1,
  'another filer''s report: no item added, and its item listed in p_removed is not deleted');
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('03'), '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', pg_temp.i('11'), 'description', 'F21h 153 robado', 'amount', 1, 'expense_date', '2027-03-02')),
    ARRAY[]::uuid[]), pg_temp.r('11')),
  '42501, unchanged', 'an item of another report listed by id is refused, not changed');
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('03'), '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', pg_temp.i('11'), 'description', 'F21h 153 robado', 'amount', 1, 'expense_date', '2027-03-02')),
    ARRAY[]::uuid[]), pg_temp.r('03')),
  '42501, unchanged', '... and nothing of the saved report changes either');

-- ---------------------------------------------------------------------------
-- 5. Refused where 137 refuses a direct edit
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.touch(pg_temp.r('12'), pg_temp.i('12')), pg_temp.r('12')),
  '42501, unchanged', 'own sent: the author cannot save it');
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.touch(pg_temp.r('13'), pg_temp.i('13')), pg_temp.r('13')),
  '42501, unchanged', 'own approved: the author cannot save it');
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('13'), '{}'::jsonb, '[]'::jsonb, ARRAY[pg_temp.i('13')]), pg_temp.r('13')),
  '42501, unchanged', 'own approved: the author cannot remove its item');
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.touch(pg_temp.r('11'), pg_temp.i('11')), pg_temp.r('11')),
  '42501, unchanged', 'another filer''s draft: cannot save it');
SELECT is(pg_temp.attempt('f21h153_admin1', pg_temp.touch(pg_temp.r('15'), pg_temp.i('15')), pg_temp.r('15')),
  '42501, unchanged', 'own approved (admin author): cannot save it');
SELECT is(pg_temp.attempt('f21h153_docente', pg_temp.touch(pg_temp.r('21'), pg_temp.i('21')), pg_temp.r('21')),
  '42501, unchanged', 'docente: cannot save even their own old draft');
SELECT is(pg_temp.attempt('f21h153_directivo', pg_temp.touch(pg_temp.r('22'), pg_temp.i('22')), pg_temp.r('22')),
  '42501, unchanged', 'directivo: cannot save even their own old draft');
SELECT is(pg_temp.attempt('f21h153_oldsw', pg_temp.touch(pg_temp.r('23'), pg_temp.i('23')), pg_temp.r('23')),
  '42501, unchanged', 'old can_submit row without a filing role: cannot save their own old draft');
SELECT is(pg_temp.attempt('f21h153_inactive', pg_temp.touch(pg_temp.r('24'), pg_temp.i('24')), pg_temp.r('24')),
  '42501, unchanged', 'inactive consultor: cannot save their own draft');
SELECT is(pg_temp.attempt('f21h153_mustpw', pg_temp.touch(pg_temp.r('25'), pg_temp.i('25')), pg_temp.r('25')),
  '42501, unchanged', 'consultor who must change the password: cannot save their own draft');
SELECT is(pg_temp.attempt('anon', pg_temp.touch(pg_temp.r('01'), pg_temp.i('1a')), pg_temp.r('01')),
  '42501, unchanged', 'visitor: cannot execute it');

-- ---------------------------------------------------------------------------
-- 6. Allowed where 137 allows it
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('f21h153_cons1', pg_temp.save(pg_temp.r('17'), '{"report_name": "F21h 153 cons1 rejected (corregido)"}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', pg_temp.i('17'), 'description', 'F21h 153 cena', 'amount', 1750, 'expense_date', '2027-03-01')),
    ARRAY[]::uuid[]), pg_temp.r('17')),
  '1 rows, changed', 'own rejected: the author corrects it');
SELECT is((SELECT status::text || '|' || review_comments || '|' || total_amount FROM public.expense_reports WHERE id = pg_temp.r('17')),
  'rejected|F21h 153 falta boleta|1750.00', '... it stays rejected with its review comment, total 1750');
SELECT is((SELECT count(*)::int FROM public.expense_report_events WHERE report_id = pg_temp.r('17')), 0,
  '... and saving it writes no history line');
SELECT is(pg_temp.attempt('f21h153_admin2', pg_temp.save(pg_temp.r('15'), '{"report_name": "F21h 153 admin1 approved (corregido)"}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', pg_temp.i('15'), 'description', 'F21h 153 peaje', 'amount', 5100, 'expense_date', '2027-03-01')),
    ARRAY[]::uuid[]), pg_temp.r('15')),
  '1 rows, changed', 'another admin corrects an admin''s approved report');
SELECT is((SELECT status::text || '|' || total_amount FROM public.expense_reports WHERE id = pg_temp.r('15')),
  'approved|5100.00', '... it stays approved, total 5100');
SELECT is(pg_temp.attempt('f21h153_admin2', pg_temp.touch(pg_temp.r('11'), pg_temp.i('11')), pg_temp.r('11')),
  '1 rows, changed', 'an admin saves a consultor''s draft');

SELECT * FROM finish();
ROLLBACK;
