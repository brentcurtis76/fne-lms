-- =============================================================================
-- 063-fne-zoom-operator-tenant.sql — FNE Zoom internal testing, Unit A (pgTAP)
--
-- Migration 20260902162557_fne_zoom_operator_tenant.sql classifies the tenant that
-- a public.schools row represents (tenant_kind: client | operator | qa, plus the
-- insertion-only internal_zoom_testing_enabled switch) and installs the two
-- database guards that keep an OPERATOR tenant out of every financial surface:
--
--   trg_enforce_operator_session_tenant_guard
--     BEFORE INSERT OR UPDATE OF school_id, contrato_id, hour_type_key,
--                                program_enrollment_id
--     ON public.consultor_sessions
--       - resolves NEW.school_id -> public.schools (fail closed if unresolvable);
--       - operator + INSERT while internal_zoom_testing_enabled = false -> 23514;
--       - operator + any non-NULL contrato_id / hour_type_key /
--         program_enrollment_id, on INSERT or on those UPDATEs -> 23514;
--       - client and qa tenants pass through untouched.
--
--   trg_enforce_operator_ledger_guard
--     BEFORE INSERT OR UPDATE OF session_id, allocation_id
--     ON public.contract_hours_ledger
--       - NULL session_id is outside the invariant (manual rows);
--       - resolves NEW.session_id -> consultor_sessions -> schools (fail closed);
--       - operator -> 23514, whichever of the two independent foreign keys the
--         write names (exposed roles cannot update either column today; the
--         owner and other privileged writers can, and are bound here).
--
-- This suite proves, in order: (A) the catalog shape of the columns and the
-- validated CHECK; (B) both functions — plpgsql, trigger-returning, SECURITY
-- INVOKER, empty search_path, no overload, schema-default ACL only, not directly
-- callable, commented, and free of the audited hours column; (C) both triggers
-- — exact deparsed definition, timing/event bits, UPDATE-OF column sets,
-- enabled, commented — plus a trigger census of all three tables (schools gets
-- NO trigger in this unit); (D) that no RLS, policy, or table privilege moved;
-- (E) session behavior for client, qa, and operator tenants, the insertion-only
-- flag, each financial field independently, the UPDATE path, the fail-closed
-- resolution, and the same rules under an RLS-bound authenticated admin and
-- under service_role; (F) ledger behavior including the allocation_id UPDATE
-- event proved on its own and the repairs that must stay open; (G) that the
-- refused writes left nothing behind.
--
-- FAIL-ON-OLD DESIGN. The identical file is also the controlled regression
-- test against the pre-migration schema. Every statement that names one of the
-- two new columns runs through dynamic SQL — pgTAP's lives_ok/throws_ok execute
-- their statement inside an exception-guarded subtransaction, and pg_temp.q()
-- does the same for value reads — and every catalog probe joins pg_catalog
-- instead of casting to regprocedure. On the old schema the file therefore
-- reports controlled "not ok" lines (undefined_column 42703, writes that were
-- NOT refused, missing catalog objects) instead of aborting at parse time.
-- Nothing is weakened to obtain that property.
--
-- Synthetic fixtures only (Ley 21.719): invented uuids, reserved test domain,
-- integer school ids 9601-9604 plus the non-existent 9699. One transaction,
-- finish(), ROLLBACK — safe to repeat, never production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(174);

-- -----------------------------------------------------------------------------
-- Helper: run one scalar query dynamically. A statement that names a column the
-- old schema lacks returns 'ERROR 42703' instead of aborting the transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.q(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
BEGIN
  EXECUTE p_sql INTO v_out;
  RETURN v_out;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERROR ' || SQLSTATE;
END;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures. None of these statements names a new column, so every one of them
-- succeeds on the old schema too. Classification happens later, under lives_ok.
--
--   9601  client school (never classified: proves the defaults)
--   9602  operator school (classified under E5, enabled/disabled during E/F)
--   9603  qa school
--   9604  client school that F reclassifies to operator with history in place
--   9699  does not exist (fail-closed probe)
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('zint_admin');

INSERT INTO public.profiles (id, email, name, approval_status)
VALUES
  (tests.get_supabase_uid('zint_admin'), 'zint-admin@test.local', 'ZINT Admin', 'approved'),
  ('a63a0001-0000-4000-8000-000000000001', 'zint-recorder@test.local',
   'ZINT Synthetic Recorder', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
VALUES (tests.get_supabase_uid('zint_admin'), 'admin', NULL, true);

INSERT INTO public.schools (id, name)
VALUES
  (9601, 'ZINT client school (pgTAP 063)'),
  (9602, 'ZINT operator school (pgTAP 063)'),
  (9603, 'ZINT qa school (pgTAP 063)'),
  (9604, 'ZINT reclassified school (pgTAP 063)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_communities (id, school_id, name)
VALUES
  ('a63a0007-0000-4000-8000-000000000001', 9601, 'ZINT GC client'),
  ('a63a0007-0000-4000-8000-000000000002', 9602, 'ZINT GC operator'),
  ('a63a0007-0000-4000-8000-000000000003', 9603, 'ZINT GC qa'),
  ('a63a0007-0000-4000-8000-000000000004', 9604, 'ZINT GC reclassified')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('a63a0002-0000-4000-8000-000000000001', 'Cliente ZINT SpA', 'Cliente ZINT',
   '76.063.100-1', 'Calle Sintética 63', 'Representante ZINT', '63.100.100-1',
   DATE '2026-01-01', 'Notaría Sintética')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id)
VALUES ('a63a0003-0000-4000-8000-000000000001', 'CT-ZINT-063-001', DATE '2026-01-02',
        'a63a0002-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hour_types (id, key, display_name, modality)
VALUES
  ('a63a0004-0000-4000-8000-000000000001', 'zint_online', 'ZINT online', 'online'),
  ('a63a0004-0000-4000-8000-000000000002', 'zint_presencial', 'ZINT presencial', 'presencial')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES
  ('a63a0005-0000-4000-8000-000000000001', 'a63a0003-0000-4000-8000-000000000001',
   'a63a0004-0000-4000-8000-000000000001', 20, tests.get_supabase_uid('zint_admin')),
  ('a63a0005-0000-4000-8000-000000000002', 'a63a0003-0000-4000-8000-000000000001',
   'a63a0004-0000-4000-8000-000000000002', 10, tests.get_supabase_uid('zint_admin'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.program_enrollments
  (id, school_id, program_type, program_year, academic_year, start_date, end_date,
   contracted_hours)
VALUES ('a63a0006-0000-4000-8000-000000000001', 9601, 'zint_synthetic', 2026, '2026',
        DATE '2026-03-01', DATE '2026-12-15', 30)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- A. Columns and the validated CHECK
-- =============================================================================
SELECT has_column('public', 'schools', 'tenant_kind',
  'A1 schools.tenant_kind exists');
SELECT col_type_is('public', 'schools', 'tenant_kind', 'text',
  'A2 tenant_kind is text');
SELECT col_not_null('public', 'schools', 'tenant_kind',
  'A3 tenant_kind is NOT NULL');
SELECT is((SELECT column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'schools'
    AND column_name = 'tenant_kind'), '''client''::text',
  'A4 tenant_kind defaults to client');

SELECT has_column('public', 'schools', 'internal_zoom_testing_enabled',
  'A5 schools.internal_zoom_testing_enabled exists');
SELECT col_type_is('public', 'schools', 'internal_zoom_testing_enabled', 'boolean',
  'A6 internal_zoom_testing_enabled is boolean');
SELECT col_not_null('public', 'schools', 'internal_zoom_testing_enabled',
  'A7 internal_zoom_testing_enabled is NOT NULL');
SELECT is((SELECT column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'schools'
    AND column_name = 'internal_zoom_testing_enabled'), 'false',
  'A8 internal_zoom_testing_enabled defaults to false');

SELECT col_has_check('public', 'schools', 'tenant_kind',
  'A9 tenant_kind carries a CHECK constraint');
SELECT is((SELECT convalidated FROM pg_catalog.pg_constraint
  WHERE conname = 'schools_tenant_kind_check'
    AND conrelid = 'public.schools'::regclass AND contype = 'c'), true,
  'A10 schools_tenant_kind_check exists and is VALIDATED (not NOT VALID)');
SELECT is((SELECT pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
  WHERE conname = 'schools_tenant_kind_check'
    AND conrelid = 'public.schools'::regclass),
  'CHECK ((tenant_kind = ANY (ARRAY[''client''::text, ''operator''::text, ''qa''::text])))',
  'A11 the CHECK admits exactly client, operator, qa');

-- =============================================================================
-- B. The two guard functions
-- =============================================================================
-- Supabase's ALTER DEFAULT PRIVILEGES materialise an explicit ACL on every new
-- public function, so "no GRANT/REVOKE was issued" cannot be read as a NULL
-- proacl. Instead, a throwaway trigger function created here (and rolled back
-- with everything else) shows what the schema default gives ANY new function;
-- each guard must carry exactly that and nothing more or less.
CREATE FUNCTION public.zint_default_acl_probe() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
SELECT has_function('public', 'enforce_operator_session_tenant_guard', '{}'::name[],
  'B1 enforce_operator_session_tenant_guard() exists');
SELECT function_lang_is('public', 'enforce_operator_session_tenant_guard', '{}'::name[],
  'plpgsql', 'B2 session guard is plpgsql');
SELECT function_returns('public', 'enforce_operator_session_tenant_guard', '{}'::name[],
  'trigger', 'B3 session guard returns trigger');
SELECT isnt_definer('public', 'enforce_operator_session_tenant_guard', '{}'::name[],
  'B4 session guard is SECURITY INVOKER');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_session_tenant_guard'
    AND 'search_path=""' = ANY (p.proconfig)),
  'B5 session guard pins an empty search_path');
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_session_tenant_guard'), 1,
  'B6 session guard has exactly one definition (no overload)');
SELECT set_eq($$
  SELECT acl.grantee::regrole::text, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
   WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_session_tenant_guard'
$$, $$
  SELECT acl.grantee::regrole::text, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
   WHERE n.nspname = 'public' AND p.proname = 'zint_default_acl_probe'
$$,
  'B7 session guard carries exactly the schema-default function ACL (no GRANT/REVOKE was issued)');
SELECT throws_ok($$SELECT public.enforce_operator_session_tenant_guard()$$,
  '0A000', NULL, 'B8 session guard cannot be invoked directly (trigger-only)');
SELECT ok(coalesce(length((SELECT obj_description(p.oid, 'pg_proc') FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_session_tenant_guard')), 0) > 0,
  'B9 session guard is documented with COMMENT ON FUNCTION');

SELECT has_function('public', 'enforce_operator_ledger_guard', '{}'::name[],
  'B10 enforce_operator_ledger_guard() exists');
SELECT function_lang_is('public', 'enforce_operator_ledger_guard', '{}'::name[],
  'plpgsql', 'B11 ledger guard is plpgsql');
SELECT function_returns('public', 'enforce_operator_ledger_guard', '{}'::name[],
  'trigger', 'B12 ledger guard returns trigger');
SELECT isnt_definer('public', 'enforce_operator_ledger_guard', '{}'::name[],
  'B13 ledger guard is SECURITY INVOKER');
SELECT ok(EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_ledger_guard'
    AND 'search_path=""' = ANY (p.proconfig)),
  'B14 ledger guard pins an empty search_path');
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_ledger_guard'), 1,
  'B15 ledger guard has exactly one definition (no overload)');
SELECT set_eq($$
  SELECT acl.grantee::regrole::text, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
   WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_ledger_guard'
$$, $$
  SELECT acl.grantee::regrole::text, acl.privilege_type, acl.is_grantable
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
   WHERE n.nspname = 'public' AND p.proname = 'zint_default_acl_probe'
$$,
  'B16 ledger guard carries exactly the schema-default function ACL (no GRANT/REVOKE was issued)');
SELECT throws_ok($$SELECT public.enforce_operator_ledger_guard()$$,
  '0A000', NULL, 'B17 ledger guard cannot be invoked directly (trigger-only)');
SELECT ok(coalesce(length((SELECT obj_description(p.oid, 'pg_proc') FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_operator_ledger_guard')), 0) > 0,
  'B18 ledger guard is documented with COMMENT ON FUNCTION');

-- Neither guard may touch the audited hours column: suite 017 pins that no BEFORE
-- trigger function on the ledger references it, and this keeps both bodies honest.
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('enforce_operator_session_tenant_guard', 'enforce_operator_ledger_guard')
    AND p.prosrc ~* 'effective_minutes'), 0,
  'B19 neither guard body references the audited hours column');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('enforce_operator_session_tenant_guard', 'enforce_operator_ledger_guard')
    AND p.prosecdef),
  'B20 no guard is SECURITY DEFINER');

-- =============================================================================
-- C. The two triggers, exactly, and the trigger census of the three tables
-- =============================================================================
SELECT has_trigger('public', 'consultor_sessions', 'trg_enforce_operator_session_tenant_guard',
  'C1 consultor_sessions carries trg_enforce_operator_session_tenant_guard');
SELECT trigger_is('public', 'consultor_sessions', 'trg_enforce_operator_session_tenant_guard',
  'public', 'enforce_operator_session_tenant_guard',
  'C2 the session trigger fires enforce_operator_session_tenant_guard()');
SELECT is((SELECT pg_get_triggerdef(t.oid) FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.consultor_sessions'::regclass
    AND t.tgname = 'trg_enforce_operator_session_tenant_guard'),
  'CREATE TRIGGER trg_enforce_operator_session_tenant_guard BEFORE INSERT OR UPDATE OF school_id, contrato_id, hour_type_key, program_enrollment_id ON public.consultor_sessions FOR EACH ROW EXECUTE FUNCTION enforce_operator_session_tenant_guard()',
  'C3 session trigger definition is exact (BEFORE INSERT OR UPDATE OF the four columns, FOR EACH ROW; function unqualified because public is on the search path, C2 pins its schema)');
SELECT is((SELECT t.tgtype::int FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.consultor_sessions'::regclass
    AND t.tgname = 'trg_enforce_operator_session_tenant_guard'), 23,
  'C4 session trigger bits = ROW(1) + BEFORE(2) + INSERT(4) + UPDATE(16), no DELETE/TRUNCATE/INSTEAD');
SELECT is((SELECT array_agg(a.attname::text ORDER BY a.attname)
  FROM pg_catalog.pg_trigger t
  CROSS JOIN LATERAL unnest(t.tgattr) AS u(attnum)
  JOIN pg_catalog.pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = u.attnum
  WHERE t.tgrelid = 'public.consultor_sessions'::regclass
    AND t.tgname = 'trg_enforce_operator_session_tenant_guard'),
  ARRAY['contrato_id', 'hour_type_key', 'program_enrollment_id', 'school_id'],
  'C5 session trigger UPDATE OF column set is exactly {school_id, contrato_id, hour_type_key, program_enrollment_id}');
SELECT is((SELECT t.tgenabled FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.consultor_sessions'::regclass
    AND t.tgname = 'trg_enforce_operator_session_tenant_guard'), 'O',
  'C6 session trigger is enabled');
SELECT ok(coalesce(length((SELECT obj_description(t.oid, 'pg_trigger') FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.consultor_sessions'::regclass
    AND t.tgname = 'trg_enforce_operator_session_tenant_guard')), 0) > 0,
  'C7 session trigger is documented with COMMENT ON TRIGGER');

SELECT has_trigger('public', 'contract_hours_ledger', 'trg_enforce_operator_ledger_guard',
  'C8 contract_hours_ledger carries trg_enforce_operator_ledger_guard');
SELECT trigger_is('public', 'contract_hours_ledger', 'trg_enforce_operator_ledger_guard',
  'public', 'enforce_operator_ledger_guard',
  'C9 the ledger trigger fires enforce_operator_ledger_guard()');
SELECT is((SELECT pg_get_triggerdef(t.oid) FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.contract_hours_ledger'::regclass
    AND t.tgname = 'trg_enforce_operator_ledger_guard'),
  'CREATE TRIGGER trg_enforce_operator_ledger_guard BEFORE INSERT OR UPDATE OF session_id, allocation_id ON public.contract_hours_ledger FOR EACH ROW EXECUTE FUNCTION enforce_operator_ledger_guard()',
  'C10 ledger trigger definition is exact (BEFORE INSERT OR UPDATE OF session_id, allocation_id, FOR EACH ROW; function unqualified because public is on the search path, C9 pins its schema)');
SELECT is((SELECT t.tgtype::int FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.contract_hours_ledger'::regclass
    AND t.tgname = 'trg_enforce_operator_ledger_guard'), 23,
  'C11 ledger trigger bits = ROW(1) + BEFORE(2) + INSERT(4) + UPDATE(16)');
SELECT is((SELECT array_agg(a.attname::text ORDER BY a.attname)
  FROM pg_catalog.pg_trigger t
  CROSS JOIN LATERAL unnest(t.tgattr) AS u(attnum)
  JOIN pg_catalog.pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = u.attnum
  WHERE t.tgrelid = 'public.contract_hours_ledger'::regclass
    AND t.tgname = 'trg_enforce_operator_ledger_guard'),
  ARRAY['allocation_id', 'session_id'],
  'C12 ledger trigger UPDATE OF column set is exactly {session_id, allocation_id} — both independent foreign keys');
SELECT is((SELECT t.tgenabled FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.contract_hours_ledger'::regclass
    AND t.tgname = 'trg_enforce_operator_ledger_guard'), 'O',
  'C13 ledger trigger is enabled');
SELECT ok(coalesce(length((SELECT obj_description(t.oid, 'pg_trigger') FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.contract_hours_ledger'::regclass
    AND t.tgname = 'trg_enforce_operator_ledger_guard')), 0) > 0,
  'C14 ledger trigger is documented with COMMENT ON TRIGGER');

SELECT set_eq($$
  SELECT tgname::text FROM pg_catalog.pg_trigger
   WHERE tgrelid = 'public.consultor_sessions'::regclass AND NOT tgisinternal
$$, ARRAY['trg_consultor_sessions_updated_at', 'trg_enforce_operator_session_tenant_guard'],
  'C15 consultor_sessions carries exactly the pre-existing updated_at trigger plus the operator guard');
SELECT set_eq($$
  SELECT tgname::text FROM pg_catalog.pg_trigger
   WHERE tgrelid = 'public.contract_hours_ledger'::regclass AND NOT tgisinternal
$$, ARRAY['trg_enforce_operator_ledger_guard'],
  'C16 contract_hours_ledger carries exactly the operator guard and no other user trigger');
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_trigger
  WHERE tgrelid = 'public.schools'::regclass AND NOT tgisinternal), 0,
  'C17 schools carries NO trigger — classification preflight is a separate authorization');

-- =============================================================================
-- D. No RLS, policy, or privilege broadening
-- =============================================================================
SELECT tests.rls_enabled('public', 'schools');
SELECT tests.rls_enabled('public', 'consultor_sessions');
SELECT tests.rls_enabled('public', 'contract_hours_ledger');

SELECT is((SELECT relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid = 'public.schools'::regclass), false,
  'D4 schools keeps its non-FORCE row-security posture');
SELECT is((SELECT relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid = 'public.consultor_sessions'::regclass), false,
  'D5 consultor_sessions keeps its non-FORCE row-security posture');
SELECT is((SELECT relforcerowsecurity FROM pg_catalog.pg_class
  WHERE oid = 'public.contract_hours_ledger'::regclass), false,
  'D6 contract_hours_ledger keeps its non-FORCE row-security posture');

SELECT set_eq($$
  SELECT policyname::text FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'schools'
$$, ARRAY[
  'admin_full_access_schools', 'forced_password_change_guard', 'schools_admin_all',
  'schools_delete_policy', 'schools_insert_admin', 'schools_read_authenticated',
  'schools_update_policy'
], 'D7 schools policy set is unchanged from the base schema');
SELECT set_eq($$
  SELECT policyname::text FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'consultor_sessions'
$$, ARRAY[
  'forced_password_change_guard', 'sessions_admin_all', 'sessions_consultor_select',
  'sessions_consultor_update', 'sessions_gc_member_select'
], 'D8 consultor_sessions policy set is unchanged from the base schema');
SELECT set_eq($$
  SELECT policyname::text FROM pg_catalog.pg_policies
   WHERE schemaname = 'public' AND tablename = 'contract_hours_ledger'
$$, ARRAY[
  'chl_admin_insert', 'chl_admin_select', 'chl_admin_update', 'chl_consultor_select',
  'chl_equipo_directivo_select', 'forced_password_change_guard'
], 'D9 contract_hours_ledger policy set is unchanged from the base schema');
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') ILIKE '%tenant_kind%'
      OR coalesce(with_check, '') ILIKE '%tenant_kind%'
      OR coalesce(qual, '') ILIKE '%internal_zoom_testing_enabled%'
      OR coalesce(with_check, '') ILIKE '%internal_zoom_testing_enabled%')), 0,
  'D10 no policy anywhere in public references the new columns');

-- Table-privilege matrix for the exposed roles, pinned to the base schema: the
-- baseline GRANT ALL on schools and consultor_sessions, and the ledger whose
-- table-level INSERT/UPDATE were withdrawn by Z7 in favour of column grants.
SELECT is(has_table_privilege(r.role_name, t.table_name, p.privilege_name), true,
  format('D %s table privilege %s on %s is unchanged from base (held)',
         r.role_name, p.privilege_name, t.table_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('public.schools'), ('public.consultor_sessions')) AS t(table_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege_name);
SELECT is(has_table_privilege(r.role_name, 'public.contract_hours_ledger', p.privilege_name), true,
  format('D %s table privilege %s on public.contract_hours_ledger is unchanged from base (held)',
         r.role_name, p.privilege_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
  AS p(privilege_name);
SELECT is(has_table_privilege(r.role_name, 'public.contract_hours_ledger', p.privilege_name), false,
  format('D %s table privilege %s on public.contract_hours_ledger is unchanged from base (absent)',
         r.role_name, p.privilege_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('INSERT'), ('UPDATE')) AS p(privilege_name);

-- =============================================================================
-- E. Session behavior
-- =============================================================================
SELECT is(pg_temp.q($$SELECT tenant_kind FROM public.schools WHERE id = 9601$$), 'client',
  'E1 a school inserted without classification is a client tenant');
SELECT is(pg_temp.q($$SELECT internal_zoom_testing_enabled::text FROM public.schools WHERE id = 9601$$),
  'false', 'E2 a school inserted without classification has internal testing disabled');
SELECT throws_ok($$UPDATE public.schools SET tenant_kind = 'partner' WHERE id = 9601$$,
  '23514', NULL, 'E3 an unknown tenant_kind is rejected by the validated CHECK');
SELECT throws_ok($$UPDATE public.schools SET tenant_kind = NULL WHERE id = 9601$$,
  '23502', NULL, 'E4 tenant_kind cannot be nulled');
SELECT lives_ok($$UPDATE public.schools SET tenant_kind = 'operator' WHERE id = 9602$$,
  'E5 fixture: 9602 classified as operator (internal testing still disabled)');
SELECT lives_ok($$UPDATE public.schools SET tenant_kind = 'qa' WHERE id = 9603$$,
  'E6 fixture: 9603 classified as qa');
SELECT is(pg_temp.q($$SELECT count(*)::text FROM public.schools
  WHERE id IN (9602, 9603) AND internal_zoom_testing_enabled = false$$), '2',
  'E7 classification alone does not enable internal testing');

-- Ordinary client and qa financial behavior is untouched.
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, contrato_id, hour_type_key, program_enrollment_id)
  VALUES ('a63a0008-0000-4000-8000-000000000001', 9601,
          'a63a0007-0000-4000-8000-000000000001', 'ZINT client financial session',
          DATE '2026-09-10', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001',
          'a63a0003-0000-4000-8000-000000000001', 'zint_online',
          'a63a0006-0000-4000-8000-000000000001')$$,
  'E8 client tenant: a fully tracked session (contract + hour type + program) is accepted');
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, contrato_id, hour_type_key, program_enrollment_id)
  VALUES ('a63a0008-0000-4000-8000-000000000002', 9603,
          'a63a0007-0000-4000-8000-000000000003', 'ZINT qa financial session',
          DATE '2026-09-10', '11:00', '12:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001',
          'a63a0003-0000-4000-8000-000000000001', 'zint_online',
          'a63a0006-0000-4000-8000-000000000001')$$,
  'E9 qa tenant: financial classification remains accepted (QA fixtures keep working)');

-- The operator tenant: insertion-only switch, then each financial field alone.
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
  VALUES ('a63a0008-0000-4000-8000-000000000011', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator session (disabled)',
          DATE '2026-09-11', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001')$$,
  '23514',
  'operator tenant guard: internal Zoom testing is disabled for this operator school; new operator sessions are refused',
  'E10 operator tenant: INSERT is refused while internal testing is disabled, even with NULL financial fields');
SELECT lives_ok($$UPDATE public.schools SET internal_zoom_testing_enabled = true WHERE id = 9602$$,
  'E11 fixture: enable internal Zoom testing for 9602');
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
  VALUES ('a63a0008-0000-4000-8000-000000000003', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator session',
          DATE '2026-09-11', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001')$$,
  'E12 operator tenant: INSERT with NULL financial fields succeeds once enabled');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, contrato_id)
  VALUES ('a63a0008-0000-4000-8000-000000000012', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator + contrato',
          DATE '2026-09-11', '11:00', '12:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001',
          'a63a0003-0000-4000-8000-000000000001')$$,
  '23514',
  'operator tenant guard: consultor_sessions.contrato_id must be NULL for an operator tenant',
  'E13 operator INSERT: contrato_id alone is refused');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, hour_type_key)
  VALUES ('a63a0008-0000-4000-8000-000000000013', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator + hour type',
          DATE '2026-09-11', '11:00', '12:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001', 'zint_online')$$,
  '23514',
  'operator tenant guard: consultor_sessions.hour_type_key must be NULL for an operator tenant',
  'E14 operator INSERT: hour_type_key alone is refused');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, program_enrollment_id)
  VALUES ('a63a0008-0000-4000-8000-000000000014', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator + program',
          DATE '2026-09-11', '11:00', '12:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001',
          'a63a0006-0000-4000-8000-000000000001')$$,
  '23514',
  'operator tenant guard: consultor_sessions.program_enrollment_id must be NULL for an operator tenant',
  'E15 operator INSERT: program_enrollment_id alone is refused');

-- The relevant UPDATE columns on the existing operator session.
SELECT throws_ok($$UPDATE public.consultor_sessions
  SET contrato_id = 'a63a0003-0000-4000-8000-000000000001'
  WHERE id = 'a63a0008-0000-4000-8000-000000000003'$$,
  '23514',
  'operator tenant guard: consultor_sessions.contrato_id must be NULL for an operator tenant',
  'E16 operator UPDATE: setting contrato_id is refused');
SELECT throws_ok($$UPDATE public.consultor_sessions
  SET hour_type_key = 'zint_online'
  WHERE id = 'a63a0008-0000-4000-8000-000000000003'$$,
  '23514',
  'operator tenant guard: consultor_sessions.hour_type_key must be NULL for an operator tenant',
  'E17 operator UPDATE: setting hour_type_key is refused');
SELECT throws_ok($$UPDATE public.consultor_sessions
  SET program_enrollment_id = 'a63a0006-0000-4000-8000-000000000001'
  WHERE id = 'a63a0008-0000-4000-8000-000000000003'$$,
  '23514',
  'operator tenant guard: consultor_sessions.program_enrollment_id must be NULL for an operator tenant',
  'E18 operator UPDATE: setting program_enrollment_id is refused');

-- Moving sessions across the tenant boundary.
SELECT throws_ok($$UPDATE public.consultor_sessions
  SET school_id = 9602
  WHERE id = 'a63a0008-0000-4000-8000-000000000001'$$,
  '23514',
  'operator tenant guard: consultor_sessions.contrato_id must be NULL for an operator tenant',
  'E19 a financially classified client session cannot be moved to an operator school');
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
  VALUES ('a63a0008-0000-4000-8000-000000000005', 9601,
          'a63a0007-0000-4000-8000-000000000001', 'ZINT client non-financial session',
          DATE '2026-09-12', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001')$$,
  'E20 fixture: a client session with no financial classification');
SELECT lives_ok($$UPDATE public.consultor_sessions
  SET school_id = 9602, growth_community_id = 'a63a0007-0000-4000-8000-000000000002'
  WHERE id = 'a63a0008-0000-4000-8000-000000000005'$$,
  'E21 a NULL-financial session may move to the enabled operator school (the UPDATE path enforces the financial rule only)');

-- SECURITY INVOKER under row level security: an authenticated admin is neither
-- owner nor BYPASSRLS, so the guard must resolve the school through the
-- schools_read_authenticated policy — and still bind.
SELECT tests.authenticate_as('zint_admin');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, contrato_id)
  VALUES ('a63a0008-0000-4000-8000-000000000015', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator + contrato (admin)',
          DATE '2026-09-13', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001',
          'a63a0003-0000-4000-8000-000000000001')$$,
  '23514',
  'operator tenant guard: consultor_sessions.contrato_id must be NULL for an operator tenant',
  'E22 authenticated admin: the guard resolves the school under RLS and refuses the financial field');
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
  VALUES ('a63a0008-0000-4000-8000-000000000006', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator session (admin)',
          DATE '2026-09-13', '11:00', '12:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001')$$,
  'E23 authenticated admin: a NULL-financial operator session is accepted while enabled');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, hour_type_key)
  VALUES ('a63a0008-0000-4000-8000-000000000016', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator + hour type (service)',
          DATE '2026-09-13', '14:00', '15:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001', 'zint_online')$$,
  '23514',
  'operator tenant guard: consultor_sessions.hour_type_key must be NULL for an operator tenant',
  'E24 service_role (RLS bypass) is bound by the guard too');
RESET ROLE;

-- Fail closed: a school the invoker cannot resolve is never classified as harmless.
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
  VALUES ('a63a0008-0000-4000-8000-000000000017', 9699,
          'a63a0007-0000-4000-8000-000000000001', 'ZINT unresolvable school',
          DATE '2026-09-13', '16:00', '17:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001')$$,
  '23514',
  'operator tenant guard: consultor_sessions.school_id could not be resolved to a tenant classification',
  'E25 a school_id that cannot be resolved fails closed (the guard precedes the foreign key)');

-- The switch is insertion-only: turning it off stops NEW operator sessions and
-- nothing else.
SELECT lives_ok($$UPDATE public.schools SET internal_zoom_testing_enabled = false WHERE id = 9602$$,
  'E26 fixture: disable internal Zoom testing for 9602 again');
SELECT lives_ok($$UPDATE public.consultor_sessions
  SET status = 'programada', approved_by = 'a63a0001-0000-4000-8000-000000000001',
      approved_at = now()
  WHERE id = 'a63a0008-0000-4000-8000-000000000003'$$,
  'E27 disabled switch: a non-financial lifecycle update (approval) to the existing operator session still succeeds');
SELECT lives_ok($$UPDATE public.consultor_sessions
  SET contrato_id = NULL, hour_type_key = NULL, program_enrollment_id = NULL
  WHERE id = 'a63a0008-0000-4000-8000-000000000003'$$,
  'E28 disabled switch: an UPDATE that fires the guard but keeps the financial fields NULL still succeeds');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
  VALUES ('a63a0008-0000-4000-8000-000000000018', 9602,
          'a63a0007-0000-4000-8000-000000000002', 'ZINT operator session (disabled again)',
          DATE '2026-09-14', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001')$$,
  '23514',
  'operator tenant guard: internal Zoom testing is disabled for this operator school; new operator sessions are refused',
  'E29 disabled switch: a NEW operator session is refused');
SELECT throws_ok($$UPDATE public.consultor_sessions
  SET contrato_id = 'a63a0003-0000-4000-8000-000000000001'
  WHERE id = 'a63a0008-0000-4000-8000-000000000003'$$,
  '23514',
  'operator tenant guard: consultor_sessions.contrato_id must be NULL for an operator tenant',
  'E30 disabled switch does not relax the financial rule on UPDATE');
SELECT is((SELECT count(*)::int FROM public.consultor_sessions WHERE school_id = 9602), 3,
  'E31 exactly the three accepted operator sessions exist (E12, E21, E23); every refused INSERT left nothing');
SELECT is((SELECT count(*)::int FROM public.consultor_sessions
  WHERE school_id = 9602
    AND (contrato_id IS NOT NULL OR hour_type_key IS NOT NULL
         OR program_enrollment_id IS NOT NULL)), 0,
  'E32 no operator session carries any financial classification');

-- =============================================================================
-- F. Ledger behavior
-- =============================================================================
-- An authenticated admin is the RLS-bound production writer shape (chl_admin_insert);
-- the guard must see the session and the school through the policies and still bind.
SELECT tests.authenticate_as('zint_admin');
SELECT lives_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-000000000001',
          1, 'reservada', DATE '2026-09-10', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  'F1 client-linked ledger INSERT succeeds for an authenticated admin (guard resolves session and school under RLS)');
SELECT throws_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-000000000003',
          1, 'reservada', DATE '2026-09-11', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  '23514',
  'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant',
  'F2 operator-linked ledger INSERT is refused for an authenticated admin');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-000000000002',
          1, 'reservada', DATE '2026-09-10', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  'F3 qa-linked ledger INSERT succeeds for service_role (QA financial fixtures keep working)');
SELECT throws_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-000000000003',
          1, 'reservada', DATE '2026-09-11', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  '23514',
  'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant',
  'F4 operator-linked ledger INSERT is refused for service_role (RLS bypass does not bypass the guard)');
RESET ROLE;

SELECT throws_ok($$INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0009-0000-4000-8000-000000000003',
          'a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-000000000003',
          1, 'reservada', DATE '2026-09-11', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  '23514',
  'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant',
  'F5 operator-linked ledger INSERT is refused for the table owner too');
SELECT throws_ok($$INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0009-0000-4000-8000-0000000000ee',
          'a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-0000000000ee',
          1, 'reservada', DATE '2026-09-11', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  '23514',
  'operator ledger guard: contract_hours_ledger.session_id could not be resolved to a tenant classification',
  'F6 a session_id that cannot be resolved fails closed (the guard precedes the foreign key)');
SELECT lives_ok($$INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, notes)
  VALUES ('a63a0009-0000-4000-8000-000000000007',
          'a63a0005-0000-4000-8000-000000000001', NULL,
          2, 'reservada', DATE '2026-09-15', 'a63a0001-0000-4000-8000-000000000001',
          false, true, 'synthetic manual writer')$$,
  'F7 a manual ledger row with no session is outside the invariant and still accepted');

-- Re-pointing an existing client row at an operator session.
SELECT throws_ok($$UPDATE public.contract_hours_ledger
  SET session_id = 'a63a0008-0000-4000-8000-000000000003'
  WHERE session_id = 'a63a0008-0000-4000-8000-000000000001'$$,
  '23514',
  'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant',
  'F8 changing an existing ledger row''s session_id to an operator session is refused');

-- The allocation_id event, on its own: a client session with its ledger row,
-- then its school reclassified to operator with that history in place (there is
-- deliberately no trigger on schools), then an allocation change that names
-- neither session_id nor any session at all.
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, contrato_id, hour_type_key, program_enrollment_id)
  VALUES ('a63a0008-0000-4000-8000-000000000004', 9604,
          'a63a0007-0000-4000-8000-000000000004', 'ZINT reclassified-school session',
          DATE '2026-09-16', '09:00', '10:00', 'online', 'borrador',
          'a63a0001-0000-4000-8000-000000000001',
          'a63a0003-0000-4000-8000-000000000001', 'zint_online',
          'a63a0006-0000-4000-8000-000000000001')$$,
  'F9 fixture: a tracked client session on 9604 (still a client tenant)');
SELECT lives_ok($$INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a63a0009-0000-4000-8000-000000000004',
          'a63a0005-0000-4000-8000-000000000001', 'a63a0008-0000-4000-8000-000000000004',
          1, 'reservada', DATE '2026-09-16', 'a63a0001-0000-4000-8000-000000000001',
          false, false, 60)$$,
  'F10 fixture: its client-linked ledger row');
SELECT lives_ok($$UPDATE public.schools SET tenant_kind = 'operator' WHERE id = 9604$$,
  'F11 fixture: 9604 reclassified to operator with its session and ledger history in place');
SELECT throws_ok($$UPDATE public.contract_hours_ledger
  SET allocation_id = 'a63a0005-0000-4000-8000-000000000002'
  WHERE id = 'a63a0009-0000-4000-8000-000000000004'$$,
  '23514',
  'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant',
  'F12 allocation_id UPDATE event: re-pointing the allocation of an operator-linked row is refused although session_id is untouched');
SELECT throws_ok($$UPDATE public.contract_hours_ledger
  SET session_id = 'a63a0008-0000-4000-8000-000000000006'
  WHERE id = 'a63a0009-0000-4000-8000-000000000004'$$,
  '23514',
  'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant',
  'F13 session_id UPDATE event: moving the row to another operator session is refused');

-- Repairs away from the operator state must stay open.
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET session_id = NULL
  WHERE id = 'a63a0009-0000-4000-8000-000000000004'$$,
  'F14 repair: detaching the row from the operator session is allowed');
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET allocation_id = 'a63a0005-0000-4000-8000-000000000002'
  WHERE id = 'a63a0009-0000-4000-8000-000000000004'$$,
  'F15 repair: with no session the allocation may be corrected');
SELECT lives_ok($$UPDATE public.schools SET tenant_kind = 'client' WHERE id = 9604$$,
  'F16 repair: reclassifying 9604 back to client is not blocked');
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET session_id = 'a63a0008-0000-4000-8000-000000000004'
  WHERE id = 'a63a0009-0000-4000-8000-000000000004'$$,
  'F17 repair: re-attaching the row to the now-client session is allowed');

-- =============================================================================
-- G. Nothing forbidden was left behind
-- =============================================================================
SELECT is((SELECT count(*)::int FROM public.contract_hours_ledger
  WHERE session_id IN ('a63a0008-0000-4000-8000-000000000003',
                       'a63a0008-0000-4000-8000-000000000005',
                       'a63a0008-0000-4000-8000-000000000006')), 0,
  'G1 no ledger row references any operator session');
SELECT is(pg_temp.q($$SELECT count(*)::text
  FROM public.contract_hours_ledger l
  JOIN public.consultor_sessions s ON s.id = l.session_id
  JOIN public.schools sc ON sc.id = s.school_id
  WHERE sc.tenant_kind = 'operator'$$), '0',
  'G2 no ledger row resolves to an operator tenant');
SELECT is((SELECT count(*)::int FROM public.contract_hours_ledger
  WHERE allocation_id IN ('a63a0005-0000-4000-8000-000000000001',
                          'a63a0005-0000-4000-8000-000000000002')), 4,
  'G3 exactly the four accepted ledger rows exist (client, qa, manual, reclassified-and-repaired)');
SELECT is(pg_temp.q($$SELECT tenant_kind FROM public.schools WHERE id = 9602$$), 'operator',
  'G4 the operator classification is retained (disabling testing never relabels the tenant)');

SELECT * FROM finish();

ROLLBACK;
