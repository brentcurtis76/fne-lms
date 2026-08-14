-- Z7-R12: public.exec_sql(text) must not bypass ledger authority.
-- Synthetic fixtures only; the complete file rolls back.
BEGIN;

SELECT no_plan();

SELECT tests.create_supabase_user('r12_admin');
INSERT INTO public.profiles (id, email, name, approval_status)
VALUES
  (tests.get_supabase_uid('r12_admin'), 'r12-admin@test.local', 'R12 Admin', 'approved'),
  ('b12b12b0-0000-4000-8000-000000000001', 'r12-recorder@test.local',
   'R12 Synthetic Recorder', 'approved')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active)
VALUES (tests.get_supabase_uid('r12_admin'), 'admin', NULL, true);

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('b12b12b1-0000-4000-8000-000000000001', 'Cliente R12 SpA', 'Cliente R12',
   '76.312.100-1', 'Calle Sintética 12', 'Representante R12', '12.100.100-1',
   DATE '2026-01-01', 'Notaría Sintética')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id)
VALUES ('b12b12b2-0000-4000-8000-000000000001', 'CT-R12-001', DATE '2026-01-02',
        'b12b12b1-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.hour_types (id, key, display_name, modality)
VALUES ('b12b12b3-0000-4000-8000-000000000001', 'r12_general', 'R12 general', 'online')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES ('b12b12b4-0000-4000-8000-000000000001',
        'b12b12b2-0000-4000-8000-000000000001',
        'b12b12b3-0000-4000-8000-000000000001', 20,
        tests.get_supabase_uid('r12_admin'))
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.contract_hours_ledger
  (id, allocation_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
VALUES ('b12b12b5-0000-4000-8000-000000000001',
        'b12b12b4-0000-4000-8000-000000000001', 1, 'consumida', DATE '2026-08-13',
        'b12b12b0-0000-4000-8000-000000000001', false, true, 60);

-- Exact catalog boundary: neither implicit PUBLIC nor any API role can call it.
SELECT is_empty($$
  SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
   WHERE p.oid = 'public.exec_sql(text)'::regprocedure
     AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
$$, 'PUBLIC has no EXECUTE on exec_sql(text)');

SELECT is(has_function_privilege(r.role_name, 'public.exec_sql(text)', 'EXECUTE'), false,
  format('%s has no EXECUTE on exec_sql(text)', r.role_name))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name);

SELECT is(has_table_privilege(r.role_name, 'public.exec_sql_audit_log', p.privilege), false,
  format('%s cannot %s exec_sql_audit_log', r.role_name, p.privilege))
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('TRIGGER')) AS p(privilege);

SELECT is_empty($$
  SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
   WHERE c.oid = 'public.exec_sql_audit_log'::regclass
     AND acl.grantee = 0
     AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER')
$$, 'PUBLIC has no mutation privilege on exec_sql_audit_log');

-- Honest fail-on-old: restore only function execution, reproduce all three
-- exposed-role assignments, observe canonical billing changes and no audit.
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO anon, authenticated, service_role;

SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;
SELECT lives_ok($$SELECT public.exec_sql(
  'UPDATE public.contract_hours_ledger SET hours = 2 WHERE id = ''b12b12b5-0000-4000-8000-000000000001'' RETURNING id')$$,
  'fail-on-old: anon can invoke arbitrary ledger SQL');
RESET ROLE;
SELECT is((SELECT consumed_hours FROM public.get_bucket_summary(
    'b12b12b2-0000-4000-8000-000000000001') WHERE hour_type_key = 'r12_general'),
  2::numeric, 'fail-on-old: anon changes the canonical bucket consumer');

SELECT tests.authenticate_as('r12_admin');
SELECT lives_ok($$SELECT public.exec_sql(
  'UPDATE public.contract_hours_ledger SET hours = 3 WHERE id = ''b12b12b5-0000-4000-8000-000000000001'' RETURNING id')$$,
  'fail-on-old: authenticated admin can invoke arbitrary ledger SQL');
RESET ROLE;
SELECT is((SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'b12b12b5-0000-4000-8000-000000000001'), 3::numeric,
  'fail-on-old: authenticated admin changes fallback hours');

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.exec_sql(
  'UPDATE public.contract_hours_ledger SET hours = 4 WHERE id = ''b12b12b5-0000-4000-8000-000000000001'' RETURNING id')$$,
  'fail-on-old: service_role can invoke arbitrary ledger SQL');
RESET ROLE;
SELECT is((SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'b12b12b5-0000-4000-8000-000000000001'), 4::numeric,
  'fail-on-old: service_role changes fallback hours');
SELECT is((SELECT count(*)::int FROM public.session_hour_overrides
    WHERE ledger_id = 'b12b12b5-0000-4000-8000-000000000001'), 0,
  'fail-on-old: three arbitrary assignments create no override event');
SELECT is((SELECT count(*)::int FROM public.exec_sql_audit_log), 0,
  'fail-on-old: the arbitrary-SQL function does not populate its advertised audit table');

REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon, authenticated, service_role;
UPDATE public.contract_hours_ledger SET hours = 1
 WHERE id = 'b12b12b5-0000-4000-8000-000000000001';

-- The hardened state rejects real calls before the query body executes.
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.exec_sql(
  'UPDATE public.contract_hours_ledger SET hours = 9 WHERE id = ''b12b12b5-0000-4000-8000-000000000001''')$$,
  '42501', NULL, 'anon call is denied before arbitrary SQL executes');
RESET ROLE;

SELECT tests.authenticate_as('r12_admin');
SELECT throws_ok($$SELECT public.exec_sql(
  'UPDATE public.contract_hours_ledger SET hours = 9 WHERE id = ''b12b12b5-0000-4000-8000-000000000001''')$$,
  '42501', NULL, 'authenticated-admin call is denied before arbitrary SQL executes');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.exec_sql(
  'UPDATE public.contract_hours_ledger SET hours = 9 WHERE id = ''b12b12b5-0000-4000-8000-000000000001''')$$,
  '42501', NULL, 'service-role call is denied before arbitrary SQL executes');
RESET ROLE;

SELECT is((SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'b12b12b5-0000-4000-8000-000000000001'), 1::numeric,
  'all hardened calls leave fallback hours unchanged');
SELECT is((SELECT effective_minutes FROM public.contract_hours_ledger
    WHERE id = 'b12b12b5-0000-4000-8000-000000000001'), NULL,
  'all hardened calls leave audited effective minutes unchanged');
SELECT is((SELECT count(*)::int FROM public.session_hour_overrides
    WHERE ledger_id = 'b12b12b5-0000-4000-8000-000000000001'), 0,
  'all hardened calls leave the override audit unchanged');
SELECT is((SELECT count(*)::int FROM public.exec_sql_audit_log), 0,
  'all hardened calls leave the retired audit table unchanged');

SELECT * FROM finish();
ROLLBACK;
