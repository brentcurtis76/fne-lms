-- Z7-R11: alternate assignments cannot bypass the audited billable-hours boundary.
-- Synthetic fixtures only; the complete file rolls back.
BEGIN;

SELECT no_plan();

SELECT tests.create_supabase_user('r11_admin');
INSERT INTO public.profiles (id, email, name, approval_status)
VALUES
  (tests.get_supabase_uid('r11_admin'), 'r11-admin@test.local', 'R11 Admin', 'approved'),
  ('b11b11b0-0000-4000-8000-000000000001', 'r11-recorder@test.local',
   'R11 Synthetic Recorder', 'approved')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
VALUES (tests.get_supabase_uid('r11_admin'), 'admin', NULL, true);

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('b11b11b1-0000-4000-8000-000000000001', 'Cliente R11 SpA', 'Cliente R11',
   '76.311.100-1', 'Calle Sintética 11', 'Representante R11', '11.100.100-1',
   DATE '2026-01-01', 'Notaría Sintética')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id)
VALUES ('b11b11b2-0000-4000-8000-000000000001', 'CT-R11-001', DATE '2026-01-02',
        'b11b11b1-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.hour_types (id, key, display_name, modality)
VALUES ('b11b11b3-0000-4000-8000-000000000001', 'r11_general', 'R11 general', 'online')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES ('b11b11b4-0000-4000-8000-000000000001',
        'b11b11b2-0000-4000-8000-000000000001',
        'b11b11b3-0000-4000-8000-000000000001', 20,
        tests.get_supabase_uid('r11_admin'))
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contract_hours_ledger
  (id, allocation_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
VALUES ('b11b11b5-0000-4000-8000-000000000001',
        'b11b11b4-0000-4000-8000-000000000001', 1, 'consumida', DATE '2026-08-13',
        'b11b11b0-0000-4000-8000-000000000001', false, true, 60);

-- Catalog truth: no exposed table UPDATE and exactly the source-derived union
-- for the only two roles with legitimate lifecycle writers.
SELECT is(has_table_privilege(r.role_name, 'public.contract_hours_ledger', 'UPDATE'), false,
  format('%s has no table-level ledger UPDATE', r.role_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name);

SELECT is_empty($$
  SELECT acl.privilege_type
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
   WHERE c.oid = 'public.contract_hours_ledger'::regclass
     AND acl.grantee = 0 AND acl.privilege_type = 'UPDATE'
$$, 'PUBLIC has no table-level ledger UPDATE');

SELECT set_eq($$
  SELECT column_name
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
     AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
$$, ARRAY[
  'status', 'cancellation_clause', 'cancellation_reason', 'admin_override',
  'admin_override_reason', 'updated_at', 'updated_by'
], 'authenticated has exactly the production lifecycle UPDATE union');

SELECT set_eq($$
  SELECT column_name
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
     AND grantee = 'service_role' AND privilege_type = 'UPDATE'
$$, ARRAY[
  'status', 'cancellation_clause', 'cancellation_reason', 'admin_override',
  'admin_override_reason', 'updated_at', 'updated_by'
], 'service_role has exactly the production lifecycle UPDATE union');

SELECT is_empty($$
  SELECT grantee, column_name
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'contract_hours_ledger'
     AND grantee IN ('PUBLIC', 'anon') AND privilege_type = 'UPDATE'
$$, 'PUBLIC and anon have no ledger column UPDATE grants');

-- Honest fail-on-old proof: recreate only the rejected Round 6 hours grant,
-- demonstrate the canonical fallback changes with no audit, then remove it.
GRANT UPDATE (hours) ON public.contract_hours_ledger TO service_role;
SET LOCAL ROLE service_role;
SELECT lives_ok($$UPDATE public.contract_hours_ledger SET hours = 2
  WHERE id = 'b11b11b5-0000-4000-8000-000000000001'$$,
  'fail-on-old: the rejected hours grant permits an unaudited alternate assignment');
RESET ROLE;
SELECT is((SELECT consumed_hours FROM public.get_bucket_summary(
    'b11b11b2-0000-4000-8000-000000000001') WHERE hour_type_key = 'r11_general'),
  2::numeric, 'fail-on-old: the alternate assignment changes a canonical billing consumer');
SELECT is((SELECT count(*)::int FROM public.session_hour_overrides
    WHERE ledger_id = 'b11b11b5-0000-4000-8000-000000000001'), 0,
  'fail-on-old: the alternate assignment creates no override event');
REVOKE UPDATE (hours) ON public.contract_hours_ledger FROM service_role;
UPDATE public.contract_hours_ledger SET hours = 1
 WHERE id = 'b11b11b5-0000-4000-8000-000000000001';

-- Every excluded column is denied for both an authenticated admin and the
-- RLS-bypassing service role. Self-assignment isolates privilege from CHECK/FK behavior.
SELECT tests.authenticate_as('r11_admin');
SELECT throws_ok(format('UPDATE public.contract_hours_ledger SET %1$I = %1$I WHERE id = %2$L',
    c.column_name, 'b11b11b5-0000-4000-8000-000000000001'),
  '42501', NULL, format('authenticated admin cannot change excluded column %s', c.column_name))
FROM (VALUES
  ('id'), ('allocation_id'), ('session_id'), ('hours'), ('session_date'),
  ('is_over_budget'), ('is_manual'), ('recorded_at'), ('recorded_by'), ('notes'),
  ('planned_minutes_snapshot'), ('effective_minutes')
) AS c(column_name);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(format('UPDATE public.contract_hours_ledger SET %1$I = %1$I WHERE id = %2$L',
    c.column_name, 'b11b11b5-0000-4000-8000-000000000001'),
  '42501', NULL, format('service_role cannot change excluded column %s', c.column_name))
FROM (VALUES
  ('id'), ('allocation_id'), ('session_id'), ('hours'), ('session_date'),
  ('is_over_budget'), ('is_manual'), ('recorded_at'), ('recorded_by'), ('notes'),
  ('planned_minutes_snapshot'), ('effective_minutes')
) AS c(column_name);

-- The four real production writer shapes remain authorized.
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET status = 'consumida', updated_at = now(), updated_by = recorded_by
  WHERE id = 'b11b11b5-0000-4000-8000-000000000001'$$,
  'completion writer shape remains functional');
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET status = 'penalizada', cancellation_clause = 'late_cancel',
      cancellation_reason = 'Synthetic cancellation', admin_override = false,
      admin_override_reason = NULL, updated_at = now(), updated_by = recorded_by
  WHERE id = 'b11b11b5-0000-4000-8000-000000000001'$$,
  'cancellation writer shape remains functional');
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET status = 'reservada', cancellation_clause = NULL, cancellation_reason = NULL,
      admin_override = false, admin_override_reason = NULL,
      updated_at = now(), updated_by = recorded_by
  WHERE id = 'b11b11b5-0000-4000-8000-000000000001'$$,
  'cancellation compensation writer shape remains functional');
SELECT lives_ok($$UPDATE public.contract_hours_ledger
  SET status = 'devuelta', admin_override = true,
      admin_override_reason = 'Synthetic manual status override',
      updated_at = now(), updated_by = recorded_by
  WHERE id = 'b11b11b5-0000-4000-8000-000000000001'$$,
  'manual cancellation-status writer shape remains functional');
RESET ROLE;

SELECT is((SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'b11b11b5-0000-4000-8000-000000000001'), 1::numeric,
  'all denied attempts leave fallback billable hours unchanged');
SELECT is((SELECT effective_minutes FROM public.contract_hours_ledger
    WHERE id = 'b11b11b5-0000-4000-8000-000000000001'), NULL,
  'all denied attempts leave audited effective minutes unchanged');
SELECT is((SELECT count(*)::int FROM public.session_hour_overrides
    WHERE ledger_id = 'b11b11b5-0000-4000-8000-000000000001'), 0,
  'direct denials and lifecycle writes create no forged override event');

SELECT * FROM finish();
ROLLBACK;
