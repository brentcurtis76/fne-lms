-- =============================================================================
-- 142-rules-survive-rebuild.sql — GENERA fixes: migration
-- 20261118103500_expense_rules_restated.sql.
--
-- Nine rules of Rendición de Gastos (migration 20261117166000_expenses_by_role.sql)
-- compared a character varying column with a list, `status IN ('draft', ...)`.
-- PostgreSQL stored that as an array of character varying values cast as a whole
-- to text[], and spells it differently after a dump and a rebuild of the
-- database: the same rule, another text. The release tool compares rules by text,
-- so it refused to go on. The new migration states the nine again with explicit
-- text values, which read the same before and after a rebuild.
--
--   (a) each of the nine rules no longer carries `character varying` and does
--       carry its states as text values;
--   (b) a guard for the future: no rule of public, auth_security, zoom_internal
--       or storage holds an array of character varying values cast as a whole
--       to text[] (the spelling that changes in a rebuild);
--   (c) the meaning is unchanged: as an invented filer and an invented admin,
--       one allowed and one refused write per command that a restated rule
--       governs, with the outcomes file 137 already pins.
--
-- Invented people and data only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(34);

-- ---------------------------------------------------------------------------
-- (a) The nine rules, spelled with text values
-- ---------------------------------------------------------------------------
SELECT ok(coalesce(p.txt NOT LIKE '%character varying%'
                   AND p.txt LIKE '%''draft''::text%'
                   AND (NOT w.needs_submitted OR p.txt LIKE '%''submitted''::text%'), false),
          w.tbl || '.' || w.pol || ': no character varying; states written as text values')
  FROM (VALUES
          ('expense_reports', 'expense_reports_update_states', true,  1),
          ('expense_reports', 'expense_reports_delete_states', true,  2),
          ('expense_reports', 'expense_reports_insert_states', true,  3),
          ('expense_items',   'expense_items_insert',          false, 4),
          ('expense_items',   'expense_items_update',          false, 5),
          ('expense_items',   'expense_items_delete',          false, 6),
          ('expense_items',   'expense_items_insert_states',   true,  7),
          ('expense_items',   'expense_items_update_states',   true,  8),
          ('expense_items',   'expense_items_delete_states',   true,  9)
       ) AS w(tbl, pol, needs_submitted, ord)
  LEFT JOIN LATERAL (
    SELECT coalesce(pp.qual, '') || ' ' || coalesce(pp.with_check, '') AS txt
      FROM pg_policies pp
     WHERE pp.schemaname = 'public' AND pp.tablename = w.tbl AND pp.policyname = w.pol
  ) p ON true
 ORDER BY w.ord;

-- ---------------------------------------------------------------------------
-- (b) Guard: no rule casts a whole array of character varying values to text[]
-- ---------------------------------------------------------------------------
SELECT is((SELECT coalesce(array_agg(schemaname || '.' || tablename || '.' || policyname
                                      ORDER BY schemaname, tablename, policyname), '{}'::text[])
             FROM pg_policies
            WHERE schemaname IN ('public', 'auth_security', 'zoom_internal', 'storage')
              AND (coalesce(qual, '') ~ '::character varying\]\)::text\[\]'
                   OR coalesce(with_check, '') ~ '::character varying\]\)::text\[\]')),
  '{}'::text[],
  'no rule holds an array of character varying values cast as a whole to text[] (it reads differently after a rebuild)');

-- ---------------------------------------------------------------------------
-- (c) Fixtures (postgres, synthetic): one filer, one admin, as in file 137
-- ---------------------------------------------------------------------------
SELECT tests.create_supabase_user('rr142_admin');
SELECT tests.create_supabase_user('rr142_cons');
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.r(n text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('14200000-0000-4000-8000-0000000000' || n)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.i(n text) RETURNS uuid LANGUAGE sql AS $$ SELECT ('14200000-0000-4000-8000-0000000001' || n)::uuid $$;

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@rr142.test.local', k, 'approved', false
  FROM unnest(ARRAY['rr142_admin', 'rr142_cons']) k
ON CONFLICT (id) DO UPDATE SET must_change_password = EXCLUDED.must_change_password;

INSERT INTO public.schools (id, name) VALUES (914201, 'Rules restated school (pgTAP 142)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('rr142_admin'), 'admin',     NULL,   NULL, true),
  (pg_temp.uid('rr142_cons'),  'consultor', 914201, NULL, true);

-- c* = the filer's reports, a* = the admin's: D draft, E second draft, S sent, A approved
INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status) VALUES
  (pg_temp.r('c1'), 'RR 142 cons draft',      '2027-04-01', '2027-04-02', pg_temp.uid('rr142_cons'),  'draft'),
  (pg_temp.r('c2'), 'RR 142 cons draft B',    '2027-04-01', '2027-04-02', pg_temp.uid('rr142_cons'),  'draft'),
  (pg_temp.r('c3'), 'RR 142 cons sent',       '2027-04-01', '2027-04-02', pg_temp.uid('rr142_cons'),  'submitted'),
  (pg_temp.r('c4'), 'RR 142 cons approved',   '2027-04-01', '2027-04-02', pg_temp.uid('rr142_cons'),  'approved'),
  (pg_temp.r('a1'), 'RR 142 admin draft',     '2027-04-01', '2027-04-02', pg_temp.uid('rr142_admin'), 'draft'),
  (pg_temp.r('a2'), 'RR 142 admin draft B',   '2027-04-01', '2027-04-02', pg_temp.uid('rr142_admin'), 'draft'),
  (pg_temp.r('a3'), 'RR 142 admin sent',      '2027-04-01', '2027-04-02', pg_temp.uid('rr142_admin'), 'submitted'),
  (pg_temp.r('a4'), 'RR 142 admin approved',  '2027-04-01', '2027-04-02', pg_temp.uid('rr142_admin'), 'approved');
INSERT INTO public.expense_items (id, report_id, description, amount, expense_date) VALUES
  (pg_temp.i('c1'), pg_temp.r('c1'), 'RR 142 taxi',  1000, '2027-04-01'),
  (pg_temp.i('c3'), pg_temp.r('c3'), 'RR 142 bus',   2000, '2027-04-01'),
  (pg_temp.i('c4'), pg_temp.r('c4'), 'RR 142 hotel', 3000, '2027-04-01'),
  (pg_temp.i('a1'), pg_temp.r('a1'), 'RR 142 metro', 1100, '2027-04-01'),
  (pg_temp.i('a3'), pg_temp.r('a3'), 'RR 142 peaje', 2100, '2027-04-01'),
  (pg_temp.i('a4'), pg_temp.r('a4'), 'RR 142 cena',  3100, '2027-04-01');

-- The helpers of file 137: a report's whole state read as postgres, and
-- attempt(person, sql, report) = '<n> rows' or the refusal's SQLSTATE, then
-- whether that state changed.
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

CREATE OR REPLACE FUNCTION pg_temp.attempt(who text, q text, rid uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_before jsonb; v_after jsonb; v_n int; v_res text;
BEGIN
  v_before := pg_temp.state(rid);
  PERFORM tests.authenticate_as(who);
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

CREATE OR REPLACE FUNCTION pg_temp.new_report(id uuid, status text) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$INSERT INTO public.expense_reports (id, report_name, start_date, end_date, submitted_by, status)
                   VALUES (%L, 'RR 142 nuevo', '2027-04-05', '2027-04-06', auth.uid(), %L)$q$, id, status)
$$;
CREATE OR REPLACE FUNCTION pg_temp.new_item(id uuid, rid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format($q$INSERT INTO public.expense_items (id, report_id, description, amount, expense_date)
                   VALUES (%L, %L, 'RR 142 gasto nuevo', 1234, '2027-04-05')$q$, id, rid)
$$;

-- ---------------------------------------------------------------------------
-- (c) The rules still decide: the filer
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('rr142_cons', pg_temp.new_report(pg_temp.r('c5'), 'draft'), pg_temp.r('c5')),
  '1 rows, changed', 'filer: creates a report as draft');
SELECT is(pg_temp.attempt('rr142_cons', pg_temp.new_report(pg_temp.r('c6'), 'approved'), pg_temp.r('c6')),
  '42501, unchanged', 'filer: cannot create a report already approved');
SELECT is(pg_temp.attempt('rr142_cons', format($q$UPDATE public.expense_reports SET report_name = 'RR 142 renamed' WHERE id = %L$q$, pg_temp.r('c1')), pg_temp.r('c1')),
  '1 rows, changed', 'filer: changes their own draft');
SELECT is(pg_temp.attempt('rr142_cons', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('c4')), pg_temp.r('c4')),
  '0 rows, unchanged', 'filer: cannot change their own approved report');
SELECT is(pg_temp.attempt('rr142_cons', pg_temp.new_item(pg_temp.i('c7'), pg_temp.r('c1')), pg_temp.r('c1')),
  '1 rows, changed', 'filer: adds an item to their own draft');
SELECT is(pg_temp.attempt('rr142_cons', pg_temp.new_item(pg_temp.i('c8'), pg_temp.r('c4')), pg_temp.r('c4')),
  '42501, unchanged', 'filer: cannot add an item to their own approved report');
SELECT is(pg_temp.attempt('rr142_cons', format($q$UPDATE public.expense_items SET amount = 1050 WHERE id = %L$q$, pg_temp.i('c1')), pg_temp.r('c1')),
  '1 rows, changed', 'filer: changes an item of their own draft');
SELECT is(pg_temp.attempt('rr142_cons', format($q$UPDATE public.expense_items SET amount = 1 WHERE id = %L$q$, pg_temp.i('c4')), pg_temp.r('c4')),
  '0 rows, unchanged', 'filer: cannot change an item of their own approved report');
SELECT is(pg_temp.attempt('rr142_cons', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('c7')), pg_temp.r('c1')),
  '1 rows, changed', 'filer: deletes an item of their own draft');
SELECT is(pg_temp.attempt('rr142_cons', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('c3')), pg_temp.r('c3')),
  '0 rows, unchanged', 'filer: cannot delete an item of their own sent report');
SELECT is(pg_temp.attempt('rr142_cons', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('c2')), pg_temp.r('c2')),
  '1 rows, changed', 'filer: deletes their own draft');
SELECT is(pg_temp.attempt('rr142_cons', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('c3')), pg_temp.r('c3')),
  '0 rows, unchanged', 'filer: cannot delete their own sent report');

-- ---------------------------------------------------------------------------
-- (c) The rules still decide: the admin, as author of their own reports
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.attempt('rr142_admin', pg_temp.new_report(pg_temp.r('a5'), 'draft'), pg_temp.r('a5')),
  '1 rows, changed', 'admin: creates a report as draft');
SELECT is(pg_temp.attempt('rr142_admin', pg_temp.new_report(pg_temp.r('a6'), 'approved'), pg_temp.r('a6')),
  '42501, unchanged', 'admin: cannot create a report already approved');
SELECT is(pg_temp.attempt('rr142_admin', format($q$UPDATE public.expense_reports SET report_name = 'RR 142 renamed' WHERE id = %L$q$, pg_temp.r('a1')), pg_temp.r('a1')),
  '1 rows, changed', 'admin: changes their own draft');
SELECT is(pg_temp.attempt('rr142_admin', format($q$UPDATE public.expense_reports SET report_name = 'x' WHERE id = %L$q$, pg_temp.r('a4')), pg_temp.r('a4')),
  '0 rows, unchanged', 'admin: cannot change their own approved report');
SELECT is(pg_temp.attempt('rr142_admin', pg_temp.new_item(pg_temp.i('a7'), pg_temp.r('a1')), pg_temp.r('a1')),
  '1 rows, changed', 'admin: adds an item to their own draft');
SELECT is(pg_temp.attempt('rr142_admin', pg_temp.new_item(pg_temp.i('a8'), pg_temp.r('a4')), pg_temp.r('a4')),
  '42501, unchanged', 'admin: cannot add an item to their own approved report');
SELECT is(pg_temp.attempt('rr142_admin', format($q$UPDATE public.expense_items SET amount = 1150 WHERE id = %L$q$, pg_temp.i('a1')), pg_temp.r('a1')),
  '1 rows, changed', 'admin: changes an item of their own draft');
SELECT is(pg_temp.attempt('rr142_admin', format($q$UPDATE public.expense_items SET amount = 1 WHERE id = %L$q$, pg_temp.i('a4')), pg_temp.r('a4')),
  '0 rows, unchanged', 'admin: cannot change an item of their own approved report');
SELECT is(pg_temp.attempt('rr142_admin', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('a7')), pg_temp.r('a1')),
  '1 rows, changed', 'admin: deletes an item of their own draft');
SELECT is(pg_temp.attempt('rr142_admin', format($q$DELETE FROM public.expense_items WHERE id = %L$q$, pg_temp.i('a3')), pg_temp.r('a3')),
  '0 rows, unchanged', 'admin: cannot delete an item of their own sent report');
SELECT is(pg_temp.attempt('rr142_admin', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('a2')), pg_temp.r('a2')),
  '1 rows, changed', 'admin: deletes their own draft');
SELECT is(pg_temp.attempt('rr142_admin', format($q$DELETE FROM public.expense_reports WHERE id = %L$q$, pg_temp.r('a3')), pg_temp.r('a3')),
  '0 rows, unchanged', 'admin: cannot delete their own sent report');

SELECT * FROM finish();
ROLLBACK;
