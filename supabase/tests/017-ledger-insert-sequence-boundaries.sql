-- Z7-R10: ledger INSERT is column-scoped and Z7 identity sequences are owner-only.
-- Synthetic fixtures only; the complete file rolls back.
BEGIN;

SELECT plan(61);

SELECT tests.create_supabase_user('r10_admin');
INSERT INTO public.profiles (id, email, name, approval_status)
VALUES
  (tests.get_supabase_uid('r10_admin'), 'r10-admin@test.local', 'R10 Admin', 'approved'),
  ('a10a10a0-0000-4000-8000-000000000001', 'r10-recorder@test.local',
   'R10 Synthetic Recorder', 'approved')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
VALUES (tests.get_supabase_uid('r10_admin'), 'admin', NULL, true);

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('a10a10a1-0000-4000-8000-000000000001', 'Cliente R10 SpA', 'Cliente R10',
   '76.310.100-1', 'Calle Sintética 10', 'Representante R10', '10.100.100-1',
   DATE '2026-01-01', 'Notaría Sintética')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id)
VALUES ('a10a10a2-0000-4000-8000-000000000001', 'CT-R10-001', DATE '2026-01-02',
        'a10a10a1-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.hour_types (id, key, display_name, modality)
VALUES ('a10a10a3-0000-4000-8000-000000000001', 'r10_general', 'R10 general', 'online')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES ('a10a10a4-0000-4000-8000-000000000001',
        'a10a10a2-0000-4000-8000-000000000001',
        'a10a10a3-0000-4000-8000-000000000001', 20,
        tests.get_supabase_uid('r10_admin'))
ON CONFLICT (id) DO NOTHING;

-- Table INSERT is absent and only the mechanically audited production union is granted.
SELECT is(has_table_privilege(r.role_name, 'public.contract_hours_ledger', 'INSERT'), false,
  format('%s has no table-level ledger INSERT', r.role_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name);

SELECT is(has_column_privilege(r.role_name, 'public.contract_hours_ledger', c.column_name, 'INSERT'),
  true, format('%s may insert legitimate column %s', r.role_name, c.column_name))
FROM (VALUES ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES
  ('allocation_id'), ('session_id'), ('hours'), ('status'), ('session_date'),
  ('recorded_by'), ('is_over_budget'), ('is_manual'),
  ('planned_minutes_snapshot'), ('notes')
) AS c(column_name);

SELECT is(has_column_privilege(r.role_name, 'public.contract_hours_ledger',
    'effective_minutes', 'INSERT'), false,
  format('%s cannot inject effective_minutes', r.role_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name);

SELECT is_empty($$
  SELECT privilege_type
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
     AND grantee = 'PUBLIC' AND privilege_type = 'INSERT'
$$, 'PUBLIC has no ledger column INSERT grant');

SELECT is((SELECT column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
    AND column_name = 'effective_minutes'), NULL,
  'effective_minutes has no default injection path');
SELECT is((SELECT is_identity FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
    AND column_name = 'effective_minutes'), 'NO',
  'effective_minutes is not identity-backed');
SELECT is((SELECT is_generated FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
    AND column_name = 'effective_minutes'), 'NEVER',
  'effective_minutes is not generated');
SELECT is((SELECT count(*)::int FROM pg_trigger
  WHERE tgrelid = 'public.contract_hours_ledger'::regclass
    AND NOT tgisinternal AND (tgtype & 2) = 2), 0,
  'no BEFORE trigger can populate effective_minutes');

SELECT tests.authenticate_as('r10_admin');
SELECT throws_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, hours, status, session_date, recorded_by, is_manual, effective_minutes)
  VALUES ('a10a10a4-0000-4000-8000-000000000001', 1, 'reservada', DATE '2026-08-13',
          'a10a10a0-0000-4000-8000-000000000001', true, 7)$$,
  '42501', NULL, 'authenticated admin cannot inject effective_minutes on INSERT');
SELECT lives_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
  VALUES ('a10a10a4-0000-4000-8000-000000000001', NULL, 1, 'reservada',
          DATE '2026-08-14', 'a10a10a0-0000-4000-8000-000000000001', false, false, 60)
  RETURNING id$$, 'authenticated reservation shape retains defaults and RETURNING');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, hours, status, session_date, recorded_by, is_manual, effective_minutes)
  VALUES ('a10a10a4-0000-4000-8000-000000000001', 2, 'reservada', DATE '2026-08-15',
          'a10a10a0-0000-4000-8000-000000000001', true, 7)$$,
  '42501', NULL, 'service_role cannot inject effective_minutes on INSERT');
SELECT lives_ok($$INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, notes)
  VALUES ('a10a10a4-0000-4000-8000-000000000001', NULL, 2, 'reservada',
          DATE '2026-08-16', 'a10a10a0-0000-4000-8000-000000000001', false, true,
          'synthetic manual writer') RETURNING id, recorded_at$$,
  'service manual-entry shape retains UUID/time defaults and RETURNING');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public.contract_hours_ledger
  WHERE effective_minutes = 7), 0, 'failed injections leave zero ledger rows');
SELECT is((SELECT count(*)::int FROM public.session_hour_overrides), 0,
  'failed injections create no override audit event');
SELECT is((SELECT count(*)::int FROM public.contract_hours_ledger
  WHERE session_date IN (DATE '2026-08-14', DATE '2026-08-16')
    AND effective_minutes IS NULL), 2,
  'both legitimate production INSERT shapes remain functional with NULL effective minutes');

-- Complete Z7 identity sequence census: both are owner-only.
SELECT set_eq($$
  SELECT n.nspname || '.' || c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'S'
     AND c.oid IN (
       'public.session_hour_overrides_seq_seq'::regclass,
       'zoom_internal.zoom_attendance_report_batches_seq_seq'::regclass
     )
$$, ARRAY[
  'public.session_hour_overrides_seq_seq',
  'zoom_internal.zoom_attendance_report_batches_seq_seq'
], 'the audited Z7 identity-sequence census contains exactly two sequences');

SELECT is(has_sequence_privilege(r.role_name, s.sequence_name, p.privilege_name), false,
  format('%s has no %s on %s', r.role_name, p.privilege_name, s.sequence_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES
  ('public.session_hour_overrides_seq_seq'),
  ('zoom_internal.zoom_attendance_report_batches_seq_seq')
) AS s(sequence_name)
CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(privilege_name);

SELECT is_empty($$
  SELECT c.relname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) acl
   WHERE c.oid IN (
     'public.session_hour_overrides_seq_seq'::regclass,
     'zoom_internal.zoom_attendance_report_batches_seq_seq'::regclass
   ) AND acl.grantee = 0
$$, 'PUBLIC has no privilege on either Z7 identity sequence');

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT nextval('public.session_hour_overrides_seq_seq')$$,
  '42501', NULL, 'service_role cannot nextval override ordering');
SELECT throws_ok($$SELECT last_value FROM public.session_hour_overrides_seq_seq$$,
  '42501', NULL, 'service_role cannot read override ordering');
SELECT throws_ok($$SELECT setval('public.session_hour_overrides_seq_seq', 1, false)$$,
  '42501', NULL, 'service_role cannot reset override ordering');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
