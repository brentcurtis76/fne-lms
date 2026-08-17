-- =============================================================================
-- 015-session-hour-overrides.sql — Z7-4: the §11 override machinery.
--
-- Owns the behaviour only the database can prove:
--   [Z7-A3] the append-only trigger rejects UPDATE and DELETE — by trigger, not
--           convention;
--   [Z7-A4] the RPC has no service-side caller: EXECUTE is not granted to
--           service_role at all, a NULL auth.uid() aborts, and a non-admin
--           authenticated caller is rejected;
--   [Z7-A5] the chain 60→45→30, reverse-second → 45, reverse-first → NULL/planned,
--           in exactly that sequence;
--   plus the §11 required list: zero waiver, idempotent replay with tamper
--   detection, consumida-only, cancellation separation, cross-tenant abort, and
--   "override 60→45 updates aggregates once" via get_bucket_summary.
--
-- NEW FILE beside 012 (the reschedule RPC suite), same reasoning: a billing-RPC
-- behaviour suite with a heavy contract fixture, kept apart from the Zoom RLS
-- persona matrices. Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(94);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('o_admin');
SELECT tests.create_supabase_user('o_consultor');
SELECT tests.create_supabase_user('o_docente');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('o_admin'), ('o_consultor'), ('o_docente')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9941, 'Overrides Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('eeeeeeee-3333-0000-0000-000000000001', 9941, 'Overrides GC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('o_admin'),     'admin',     NULL, true),
  (tests.get_supabase_uid('o_consultor'), 'consultor', 9941, true),
  (tests.get_supabase_uid('o_docente'),   'docente',   9941, true);

-- The cliente IS school-linked here, so the cross-tenant chain check has teeth.
INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario, school_id)
VALUES
  ('eeeeeeee-4444-0000-0000-000000000001', 'Cliente Overrides SpA', 'Cliente Overrides',
   '76.222.333-4', 'Calle Falsa 456, Santiago',
   'Representante Overrides', '22.222.222-2', DATE '2024-02-15', 'Notaría Prueba', 9941)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id) VALUES
  ('eeeeeeee-5555-0000-0000-000000000001', 'CT-OVR-001', DATE '2026-01-05',
   'eeeeeeee-4444-0000-0000-000000000001'),
  ('eeeeeeee-5555-0000-0000-000000000002', 'CT-OVR-002', DATE '2026-01-05',
   'eeeeeeee-4444-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hour_types (id, key, display_name, modality) VALUES
  ('eeeeeeee-6666-0000-0000-000000000001', 'ovr_general',
   'Acompañamiento overrides (prueba)', 'online'),
  ('eeeeeeee-6666-0000-0000-000000000002', 'ovr_ajeno',
   'Acompañamiento contrato ajeno (prueba)', 'online'),
  ('eeeeeeee-6666-0000-0000-000000000003', 'ovr_poison',
   'Acompañamiento idempotencia (prueba)', 'online')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES
  ('eeeeeeee-7777-0000-0000-000000000001', 'eeeeeeee-5555-0000-0000-000000000001',
   'eeeeeeee-6666-0000-0000-000000000001', 100, tests.get_supabase_uid('o_admin')),
  ('eeeeeeee-7777-0000-0000-000000000002', 'eeeeeeee-5555-0000-0000-000000000002',
   'eeeeeeee-6666-0000-0000-000000000002', 100, tests.get_supabase_uid('o_admin')),
  ('eeeeeeee-7777-0000-0000-000000000003', 'eeeeeeee-5555-0000-0000-000000000001',
   'eeeeeeee-6666-0000-0000-000000000003', 100, tests.get_supabase_uid('o_admin'))
ON CONFLICT (id) DO NOTHING;

-- Session + ledger seeds. S1 = the finalized session the chain runs on
-- (planned 60 min / 1.00 h). S2 = reservada. S3 = devuelta (cancellation flow).
-- S4 = cross-tenant: the session names contrato 1 but its ledger row hangs off
-- contrato 2's allocation.
CREATE FUNCTION pg_temp.seed_override_session(
  p_id uuid,
  p_ledger_id uuid,
  p_session_status text,
  p_ledger_status text,
  p_allocation_id uuid DEFAULT 'eeeeeeee-7777-0000-0000-000000000001'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.consultor_sessions
    (id, school_id, growth_community_id, title, session_date,
     start_time, end_time, modality, status, created_by,
     contrato_id, hour_type_key)
  VALUES
    (p_id, 9941, 'eeeeeeee-3333-0000-0000-000000000001',
     'Sesión de prueba overrides', DATE '2026-07-10',
     TIME '09:00', TIME '10:00', 'online', p_session_status,
     tests.get_supabase_uid('o_admin'),
     'eeeeeeee-5555-0000-0000-000000000001', 'ovr_general');

  INSERT INTO public.contract_hours_ledger
    (id, allocation_id, session_id, hours, status, session_date,
     recorded_by, planned_minutes_snapshot)
  VALUES
    (p_ledger_id, p_allocation_id, p_id,
     1.00, p_ledger_status, DATE '2026-07-10',
     tests.get_supabase_uid('o_admin'), 60);
END;
$$;

SELECT pg_temp.seed_override_session(
  'eeeeeeee-0001-0000-0000-000000000001', 'eeeeeeee-0002-0000-0000-000000000001',
  'completada', 'consumida');
SELECT pg_temp.seed_override_session(
  'eeeeeeee-0001-0000-0000-000000000002', 'eeeeeeee-0002-0000-0000-000000000002',
  'programada', 'reservada');
SELECT pg_temp.seed_override_session(
  'eeeeeeee-0001-0000-0000-000000000003', 'eeeeeeee-0002-0000-0000-000000000003',
  'cancelada', 'devuelta');
SELECT pg_temp.seed_override_session(
  'eeeeeeee-0001-0000-0000-000000000004', 'eeeeeeee-0002-0000-0000-000000000004',
  'completada', 'consumida', 'eeeeeeee-7777-0000-0000-000000000002');
SELECT pg_temp.seed_override_session(
  'eeeeeeee-0001-0000-0000-000000000005', 'eeeeeeee-0002-0000-0000-000000000005',
  'completada', 'consumida', 'eeeeeeee-7777-0000-0000-000000000003');

-- The payment consumer for S1. A €10 rate makes the assertions transparent:
-- 1.00 h → €10.00, override 45 min → 0.75 h → €7.50, reversal → €10.00.
INSERT INTO public.session_facilitators
  (session_id, user_id, facilitator_role, is_lead)
VALUES
  ('eeeeeeee-0001-0000-0000-000000000001', tests.get_supabase_uid('o_consultor'),
   'consultor_externo', true);

INSERT INTO public.consultant_rates
  (consultant_id, hour_type_id, rate_eur, effective_from, effective_to, created_by)
VALUES
  (tests.get_supabase_uid('o_consultor'), 'eeeeeeee-6666-0000-0000-000000000001',
   10.00, DATE '2026-01-01', NULL, tests.get_supabase_uid('o_admin'));

-- -----------------------------------------------------------------------------
-- A. Shape and security posture
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'apply_session_hour_override',
  ARRAY['uuid', 'integer', 'text', 'text', 'text', 'text', 'uuid'],
  'A: apply_session_hour_override(7 args) exists');

SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_session_hour_override'),
  true, 'A: the RPC is SECURITY DEFINER');

SELECT is(
  (SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_session_hour_override'),
  ARRAY['search_path=""'], 'A: the RPC pins an empty search_path');

SELECT ok(
  NOT has_function_privilege('anon',
    'public.apply_session_hour_override(uuid, integer, text, text, text, text, uuid)', 'EXECUTE'),
  'A: anon cannot execute the RPC');

SELECT ok(
  has_function_privilege('authenticated',
    'public.apply_session_hour_override(uuid, integer, text, text, text, text, uuid)', 'EXECUTE'),
  'A: authenticated can execute — authorization happens INSIDE via auth.uid()');

SELECT ok(
  NOT has_function_privilege('service_role',
    'public.apply_session_hour_override(uuid, integer, text, text, text, text, uuid)', 'EXECUTE'),
  '[Z7-A4] service_role holds NO EXECUTE — the jobs path is closed at the grant, before the null-uid abort even runs');

SELECT tests.rls_enabled('public', 'session_hour_overrides');

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_hour_overrides' AND cmd <> 'SELECT'),
  0, 'A: no non-SELECT policy exists — no authenticated session writes override rows');

SELECT has_column('public', 'contract_hours_ledger', 'effective_minutes',
  'A: contract_hours_ledger.effective_minutes exists — the additive §11 column');
SELECT col_is_null('public', 'contract_hours_ledger', 'effective_minutes',
  'A: effective_minutes is nullable — NULL means the planned value governs');
SELECT has_column('public', 'session_hour_overrides', 'request_payload',
  '[Z7-R2.3] the database stores its canonical replay payload');

SELECT is(
  (SELECT count(*)::int FROM pg_trigger
    WHERE tgrelid = 'public.session_hour_overrides'::regclass
      AND tgname = 'session_hour_overrides_no_update_delete'),
  1, '[Z7-A3] the append-only trigger is installed');

SELECT ok(
  has_table_privilege('authenticated', 'public.session_hour_overrides', 'SELECT'),
  'R7: authenticated retains SELECT; the admin-only RLS policy remains authoritative');
SELECT ok(
  has_table_privilege('service_role', 'public.session_hour_overrides', 'SELECT'),
  'R7: service_role retains required SELECT access');

SELECT ok(
  NOT has_table_privilege(role_name, 'public.session_hour_overrides', privilege_name),
  format('R7: %s has no direct %s privilege on the override audit', role_name, privilege_name)
)
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS roles(role_name)
CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER'])
  AS privileges(privilege_name);

SELECT is_empty(
  $$
    SELECT privilege_type
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(
        COALESCE(c.relacl, acldefault('r', c.relowner))
      ) acl
     WHERE c.oid = 'public.session_hour_overrides'::regclass
       AND acl.grantee = 0
       AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER')
  $$,
  'R7: PUBLIC has no mutation or trigger privilege on the override audit');

-- -----------------------------------------------------------------------------
-- C. Actor binding ([Z7-A4])
-- -----------------------------------------------------------------------------

-- C1: no JWT context at all (superuser session): auth.uid() is NULL and the
-- function aborts BEFORE reading anything. This is the structural closure of the
-- service-role/jobs path — even a caller that somehow held EXECUTE gets nothing
-- without an authenticated user.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 45, 'Ajuste de prueba',
       'consultant_shortfall', 'req-null-uid', 'hash-null-uid') $$,
  'P0403', NULL,
  '[Z7-A4] a NULL auth.uid() aborts — no session, no override');

-- C2: an authenticated NON-admin is rejected inside the function.
SELECT tests.authenticate_as('o_docente');
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 45, 'Ajuste de prueba',
       'consultant_shortfall', 'req-docente', 'hash-docente') $$,
  'P0403', NULL,
  '[Z7-A4] an authenticated docente is rejected');
RESET ROLE;

SELECT tests.authenticate_as('o_consultor');
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 45, 'Ajuste de prueba',
       'consultant_shortfall', 'req-consultor', 'hash-consultor') $$,
  'P0403', NULL,
  '§11: a consultor cannot override — 403 at the database');
RESET ROLE;

-- R7 blocker: every exposed role is denied a valid direct event. The service-role
-- payload is deliberately canonical: if this insert ever lands, it reserves the
-- request ID and makes the later owner RPC falsely replay without moving the ledger.
SELECT set_config('test.r7_admin_uid', tests.get_supabase_uid('o_admin')::text, true);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ INSERT INTO public.session_hour_overrides
       (school_id, session_id, ledger_id, previous_minutes, new_minutes,
        planned_minutes_snapshot, reason, reason_category, request_id, payload_hash,
        request_payload, created_by)
     VALUES (9941, 'eeeeeeee-0001-0000-0000-000000000005',
       'eeeeeeee-0002-0000-0000-000000000005', NULL, 45, 60, 'anon poison', 'other',
       'req-anon-poison', 'hash-anon-poison',
       jsonb_build_object('session_id', 'eeeeeeee-0001-0000-0000-000000000005'::uuid,
         'new_minutes', 45, 'reason', 'anon poison', 'reason_category', 'other',
         'reverses_override_id', NULL), current_setting('test.r7_admin_uid')::uuid) $$,
  '42501', NULL, 'R7: anon cannot forge an audit event');
RESET ROLE;

SELECT tests.authenticate_as('o_admin');
SELECT throws_ok(
  $$ INSERT INTO public.session_hour_overrides
       (school_id, session_id, ledger_id, previous_minutes, new_minutes,
        planned_minutes_snapshot, reason, reason_category, request_id, payload_hash,
        request_payload, created_by)
     VALUES (9941, 'eeeeeeee-0001-0000-0000-000000000005',
       'eeeeeeee-0002-0000-0000-000000000005', NULL, 45, 60, 'admin direct', 'other',
       'req-admin-direct', 'hash-admin-direct',
       jsonb_build_object('session_id', 'eeeeeeee-0001-0000-0000-000000000005'::uuid,
         'new_minutes', 45, 'reason', 'admin direct', 'reason_category', 'other',
         'reverses_override_id', NULL), current_setting('test.r7_admin_uid')::uuid) $$,
  '42501', NULL, 'R7: authenticated admin cannot forge an audit event directly');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ INSERT INTO public.session_hour_overrides
       (school_id, session_id, ledger_id, previous_minutes, new_minutes,
        planned_minutes_snapshot, reason, reason_category, request_id, payload_hash,
        request_payload, created_by)
     VALUES (9941, 'eeeeeeee-0001-0000-0000-000000000005',
       'eeeeeeee-0002-0000-0000-000000000005', NULL, 45, 60,
       'Poison canónico', 'other', 'req-service-poison', 'hash-service-poison',
       jsonb_build_object('session_id', 'eeeeeeee-0001-0000-0000-000000000005'::uuid,
         'new_minutes', 45, 'reason', 'Poison canónico', 'reason_category', 'other',
         'reverses_override_id', NULL), current_setting('test.r7_admin_uid')::uuid) $$,
  '42501', NULL, 'R7: service_role cannot reserve an idempotency key with forged audit data');
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.session_hour_overrides
    WHERE request_id = 'req-service-poison'),
  0, 'R7: the failed service poisoning attempt left the request ID unreserved');

SELECT tests.authenticate_as('o_admin');
SELECT is(
  (SELECT (public.apply_session_hour_override(
    'eeeeeeee-0001-0000-0000-000000000005', 45, 'Poison canónico', 'other',
    'req-service-poison', 'hash-service-poison'))->>'applied'),
  'true', 'R7: the later authenticated-admin RPC applies instead of replaying poison');
RESET ROLE;

SELECT is(
  (SELECT effective_minutes FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000005'),
  45, 'R7: the legitimate RPC moved the ledger to 45 minutes');
SELECT is(
  (SELECT count(*)::int FROM public.session_hour_overrides
    WHERE request_id = 'req-service-poison'
      AND created_by = tests.get_supabase_uid('o_admin')
      AND new_minutes = 45),
  1, 'R7: exactly one actor-bound audit event owns the formerly poisoned request ID');

-- -----------------------------------------------------------------------------
-- D. Apply (§11) — as the admin
-- -----------------------------------------------------------------------------
SELECT set_config(
  'test.override_consultant_uid',
  tests.get_supabase_uid('o_consultor')::text,
  true
);
SELECT tests.authenticate_as('o_admin');

-- D1/D2/D3: planned 60 → override to 45 minutes. D1 runs with role=authenticated
-- AND the admin claims — the grant and the internal check exercised together.
SELECT ok(
  (SELECT total_hours = 1.00::numeric AND total_eur = 10.00::numeric
     FROM public.get_consultant_earnings(
       current_setting('test.override_consultant_uid')::uuid,
       DATE '2026-07-01', DATE '2026-07-31')
    WHERE hour_type_key = 'ovr_general'),
  '[Z7-R1] consultant earnings starts from the planned 60 minutes');

SELECT is(
  (SELECT (public.apply_session_hour_override(
     'eeeeeeee-0001-0000-0000-000000000001', 45, 'Presencia parcial del consultor',
     'consultant_shortfall', 'req-apply-45', 'hash-apply-45'))->>'applied'),
  'true', 'D1: an admin override applies');

-- The admin claims are transaction-scoped and survive RESET ROLE, so from here the
-- calls keep auth.uid() = o_admin while the asserts regain the tests schema.
RESET ROLE;

SELECT ok(
  (SELECT effective_minutes = 45 AND admin_override = true
          AND admin_override_reason = 'Presencia parcial del consultor'
     FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  'D2: the ledger row carries effective_minutes 45 and the override flags');

SELECT ok(
  (SELECT previous_minutes IS NULL AND new_minutes = 45
          AND planned_minutes_snapshot = 60
          AND created_by = tests.get_supabase_uid('o_admin')
          AND reverses_override_id IS NULL
     FROM public.session_hour_overrides
    WHERE request_id = 'req-apply-45'),
  'D3: the audit row records previous NULL, new 45, the snapshot, and the ADMIN as actor');

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  1.00::numeric(6,2),
  'D4: `hours` is untouched — it stays the historical reserved value (§11)');

-- D5: "override 60→45 updates aggregates once" — the bucket summary reads the
-- §11 coalesce, so consumed drops from 1.00 to round(45/60, 2) = 0.75.
SELECT is(
  (SELECT consumed_hours FROM public.get_bucket_summary('eeeeeeee-5555-0000-0000-000000000001')
    WHERE hour_type_key = 'ovr_general'),
  0.75::numeric,
  'D5: get_bucket_summary consumed reflects the override-adjusted value');

SELECT ok(
  (SELECT total_hours = 0.75::numeric AND total_eur = 7.50::numeric
     FROM public.get_consultant_earnings(
       tests.get_supabase_uid('o_consultor'), DATE '2026-07-01', DATE '2026-07-31')
    WHERE hour_type_key = 'ovr_general'),
  '[Z7-R1] the same 45-minute value drives consultant earnings and payment');

-- D6: idempotent replay — same request_id, same payload_hash.
SELECT is(
  (SELECT (public.apply_session_hour_override(
     'eeeeeeee-0001-0000-0000-000000000001', 45, 'Presencia parcial del consultor',
     'consultant_shortfall', 'req-apply-45', 'hash-apply-45'))->>'replay'),
  'true', 'D6: replaying the same request is a no-op that answers with the original');

SELECT is(
  (SELECT count(*)::int FROM public.session_hour_overrides
    WHERE request_id = 'req-apply-45'),
  1, 'D6: the replay wrote no second row');

SELECT is(
  (SELECT total_hours FROM public.get_consultant_earnings(
     tests.get_supabase_uid('o_consultor'), DATE '2026-07-01', DATE '2026-07-31')
    WHERE hour_type_key = 'ovr_general'),
  0.75::numeric,
  '[Z7-R1] an idempotent replay does not pay the 45-minute override twice');

SELECT is(
  (SELECT (public.apply_session_hour_override(
     'eeeeeeee-0001-0000-0000-000000000001', 45, '  Presencia parcial del consultor  ',
     'consultant_shortfall', 'req-apply-45', 'FORGED-DIFFERENT-HASH'))->>'replay'),
  'true',
  '[Z7-R2.3] identical normalized payload replays even when the caller hash differs');

-- D7: tamper — every canonical payload field is compared inside PostgreSQL. Each
-- probe reuses the ORIGINAL caller hash, so none can rely on hash honesty.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 30, 'Presencia parcial del consultor',
       'consultant_shortfall', 'req-apply-45', 'hash-apply-45') $$,
  'P0409', NULL,
  '[Z7-R2.3] forged hash cannot hide changed minutes');

SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000002', 45, 'Presencia parcial del consultor',
       'consultant_shortfall', 'req-apply-45', 'hash-apply-45') $$,
  'P0409', NULL,
  '[Z7-R2.3] forged hash cannot hide changed session');

SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 45, 'Otro motivo válido',
       'consultant_shortfall', 'req-apply-45', 'hash-apply-45') $$,
  'P0409', NULL,
  '[Z7-R2.3] forged hash cannot hide changed reason');

SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 45, 'Presencia parcial del consultor',
       'other', 'req-apply-45', 'hash-apply-45') $$,
  'P0409', NULL,
  '[Z7-R2.3] forged hash cannot hide changed reason category');

SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 45, 'Presencia parcial del consultor',
       'consultant_shortfall', 'req-apply-45', 'hash-apply-45',
       'eeeeeeee-9999-0000-0000-000000000001') $$,
  'P0409', NULL,
  '[Z7-R2.3] forged hash cannot hide changed reversal target');

-- D8/D9: validation.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 30, '   ',
       'consultant_shortfall', 'req-blank-reason', 'hash-blank-reason') $$,
  'P0400', NULL,
  'D8: an override without a reason is refused (§11 mandatory reason)');

SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 30, 'Motivo válido',
       'categoria_inventada', 'req-bad-cat', 'hash-bad-cat') $$,
  'P0400', NULL,
  'D9: an unknown reason_category is refused');

-- D10/D11: consumida-only; cancellation is a separate flow.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000002', 30, 'Motivo válido',
       'other', 'req-reservada', 'hash-reservada') $$,
  'P0409', NULL,
  'D10: a reservada entry cannot be overridden — overrides are post-finalize only');

SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000003', 30, 'Motivo válido',
       'other', 'req-devuelta', 'hash-devuelta') $$,
  'P0409', NULL,
  'D11: a devuelta entry cannot be overridden — cancellation clauses are a separate flow');

-- G: cross-tenant — the session names contrato 1, the ledger row hangs off
-- contrato 2's allocation. Nothing is written.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000004', 30, 'Motivo válido',
       'other', 'req-crosstenant', 'hash-crosstenant') $$,
  'P0409', NULL,
  'G: a session/contract/allocation mismatch aborts before writing');

-- -----------------------------------------------------------------------------
-- B. Append-only, by trigger ([Z7-A3]) — probed on the real audit row.
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.session_hour_overrides SET reason = 'reescrito'
      WHERE request_id = 'req-apply-45' $$,
  'P0001', NULL,
  '[Z7-A3] UPDATE on an override row is refused by the trigger');

SELECT throws_ok(
  $$ DELETE FROM public.session_hour_overrides WHERE request_id = 'req-apply-45' $$,
  'P0001', NULL,
  '[Z7-A3] DELETE on an override row is refused by the trigger');

-- -----------------------------------------------------------------------------
-- E. The chain ([Z7-A5]): 60-planned, 45, 30 — reverse-second → 45,
-- reverse-first → NULL/planned. Exactly that sequence.
-- -----------------------------------------------------------------------------

-- E1: the second override, 45 → 30.
SELECT ok(
  (SELECT (result->>'applied')::boolean AND (result->>'previous_minutes')::int = 45
     FROM (SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', 30, 'Ajuste adicional',
       'school_request', 'req-apply-30', 'hash-apply-30') AS result) r),
  'E1: the second override applies and records previous_minutes 45');

SELECT is(
  (SELECT effective_minutes FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  30, 'E1: effective_minutes is now 30');

SELECT ok(
  (SELECT previous_minutes IS NULL AND new_minutes = 45
     FROM public.session_hour_overrides
    WHERE request_id = 'req-apply-45'),
  'E2: the first audit row is preserved intact — appended, never rewritten');

-- E3: reversing the FIRST while the second is active is refused.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', NULL, 'Revertir el primero',
       'other', 'req-rev-first-early', 'hash-rev-first-early',
       (SELECT id FROM public.session_hour_overrides WHERE request_id = 'req-apply-45')) $$,
  'P0409', NULL,
  'E3: only the LATEST unreversed override may be reversed');

-- E4: reverse the second → the effective value returns to 45 (the second's own
-- previous_minutes), NEVER to NULL.
SELECT is(
  (SELECT (public.apply_session_hour_override(
     'eeeeeeee-0001-0000-0000-000000000001', NULL, 'Revertir el segundo ajuste',
     'other', 'req-rev-30', 'hash-rev-30',
     (SELECT id FROM public.session_hour_overrides WHERE request_id = 'req-apply-30')
   ))->>'new_minutes')::int,
  45, '[Z7-A5] reversing the SECOND restores 45 — the reversed event''s own previous value');

SELECT is(
  (SELECT effective_minutes FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  45, '[Z7-A5] the ledger reads 45 after reverse-second');

-- E5: the second is now reversed; reversing it AGAIN is refused.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', NULL, 'Revertir dos veces',
       'other', 'req-rev-30-again', 'hash-rev-30-again',
       (SELECT id FROM public.session_hour_overrides WHERE request_id = 'req-apply-30')) $$,
  'P0409', NULL,
  'E5: an already-reversed override cannot be reversed again (UNIQUE + check)');

-- E6: now the FIRST is the latest unreversed — reversing it clears the chain.
SELECT ok(
  (SELECT (result->>'applied')::boolean AND (result->>'new_minutes') IS NULL
     FROM (SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', NULL, 'Revertir el primer ajuste',
       'other', 'req-rev-45', 'hash-rev-45',
       (SELECT id FROM public.session_hour_overrides WHERE request_id = 'req-apply-45')
     ) AS result) r),
  '[Z7-A5] reversing the FIRST clears the override entirely');

SELECT ok(
  (SELECT effective_minutes IS NULL AND admin_override = false
          AND admin_override_reason IS NULL
     FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  '[Z7-A5] effective_minutes is NULL — the PLANNED value governs again');

SELECT is(
  (SELECT consumed_hours FROM public.get_bucket_summary('eeeeeeee-5555-0000-0000-000000000001')
    WHERE hour_type_key = 'ovr_general'),
  1.00::numeric,
  'E6: the aggregate is restored with the reversal (§11 "reversal restores aggregate")');

SELECT ok(
  (SELECT total_hours = 1.00::numeric AND total_eur = 10.00::numeric
     FROM public.get_consultant_earnings(
       tests.get_supabase_uid('o_consultor'), DATE '2026-07-01', DATE '2026-07-31')
    WHERE hour_type_key = 'ovr_general'),
  '[Z7-R1] reversal restores the planned consultant payment');

-- E7: a REVERSAL row can never itself be reversed.
SELECT throws_ok(
  $$ SELECT public.apply_session_hour_override(
       'eeeeeeee-0001-0000-0000-000000000001', NULL, 'Revertir una reversión',
       'other', 'req-rev-rev', 'hash-rev-rev',
       (SELECT id FROM public.session_hour_overrides WHERE request_id = 'req-rev-30')) $$,
  'P0409', NULL,
  'E7: a reversal cannot be reversed — apply a new override instead');

-- -----------------------------------------------------------------------------
-- F. Zero waiver (§11, Brent decision): 0 is a permitted value.
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT (public.apply_session_hour_override(
     'eeeeeeee-0001-0000-0000-000000000001', 0, 'Sesión eximida por falla técnica',
     'technical_failure', 'req-waive', 'hash-waive'))->>'new_minutes')::int,
  0, 'F1: a zero-minute waiver applies');

SELECT is(
  (SELECT consumed_hours FROM public.get_bucket_summary('eeeeeeee-5555-0000-0000-000000000001')
    WHERE hour_type_key = 'ovr_general'),
  0::numeric,
  'F2: the waived session consumes nothing — the hours return to availability');

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  1.00::numeric(6,2),
  'F3: `hours` still holds the historical value — the waiver never rewrites it');

RESET ROLE;

-- -----------------------------------------------------------------------------
-- G2. The audited RPC is the sole authority for effective_minutes. Even roles
-- that can legitimately update other lifecycle columns cannot touch it directly.
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.contract_hours_ledger', 'effective_minutes', 'UPDATE'),
  'G2: authenticated has no direct effective_minutes UPDATE privilege');
SELECT ok(
  NOT has_column_privilege('service_role', 'public.contract_hours_ledger', 'effective_minutes', 'UPDATE'),
  'G2: service_role has no direct effective_minutes UPDATE privilege');

SELECT tests.authenticate_as('o_admin');
SELECT throws_ok(
  $$ UPDATE public.contract_hours_ledger SET effective_minutes = 17
      WHERE id = 'eeeeeeee-0002-0000-0000-000000000001' $$,
  '42501', NULL,
  'G2: authenticated admin cannot bypass the audited override RPC');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ UPDATE public.contract_hours_ledger SET effective_minutes = 18
      WHERE id = 'eeeeeeee-0002-0000-0000-000000000001' $$,
  '42501', NULL,
  'G2: service role cannot bypass the audited override RPC');
SELECT lives_ok(
  $$ UPDATE public.contract_hours_ledger SET status = status
      WHERE id = 'eeeeeeee-0002-0000-0000-000000000001' $$,
  'G2: service-role lifecycle writes to allowed columns remain available');
RESET ROLE;

SELECT is(
  (SELECT effective_minutes FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-0002-0000-0000-000000000001'),
  0, 'G2: both forbidden direct attempts left the audited value unchanged');

-- -----------------------------------------------------------------------------
-- H. The ledger CHECKs stay intact.
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.contract_hours_ledger SET effective_minutes = -1
      WHERE id = 'eeeeeeee-0002-0000-0000-000000000001' $$,
  '23514', NULL,
  'H: effective_minutes < 0 is refused by its CHECK');

SELECT throws_ok(
  $$ UPDATE public.contract_hours_ledger SET hours = 0
      WHERE id = 'eeeeeeee-0002-0000-0000-000000000001' $$,
  '23514', NULL,
  'H: the original hours > 0 CHECK is untouched — zero-waiver lives on effective_minutes');

-- -----------------------------------------------------------------------------
-- I. RLS persona matrix on session_hour_overrides (§7: admin all; nobody else).
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('o_admin');
SELECT ok(
  (SELECT count(*) >= 5 FROM public.session_hour_overrides
    WHERE session_id = 'eeeeeeee-0001-0000-0000-000000000001'),
  'I: admin reads the full audit trail');
RESET ROLE;

SELECT tests.authenticate_as('o_consultor');
SELECT is_empty(
  $$ SELECT 1 FROM public.session_hour_overrides $$,
  'I: consultor reads nothing — overrides are admin-only (§7)');
SELECT throws_ok(
  $$ INSERT INTO public.session_hour_overrides
       (school_id, session_id, ledger_id, new_minutes, reason, reason_category,
        request_id, payload_hash, created_by)
     VALUES (9941, 'eeeeeeee-0001-0000-0000-000000000001',
             'eeeeeeee-0002-0000-0000-000000000001', 10, 'intruso', 'other',
             'req-intruso', 'hash-intruso', tests.get_supabase_uid('o_consultor')) $$,
  '42501', NULL,
  'I: an authenticated INSERT is refused — writes only through the RPC');
RESET ROLE;

SELECT tests.authenticate_as('o_docente');
SELECT is_empty(
  $$ SELECT 1 FROM public.session_hour_overrides $$,
  'I: docente reads nothing');
RESET ROLE;

-- R7 table-level denial covers every mutation class, not only INSERT. These are
-- real statements under the RLS-bypassing role. On the old grants, UPDATE/DELETE
-- reached the append-only trigger, TRUNCATE erased rows, and CREATE TRIGGER lived.
CREATE FUNCTION public.r7_noop_override_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
GRANT EXECUTE ON FUNCTION public.r7_noop_override_trigger() TO service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ UPDATE public.session_hour_overrides SET reason = reason $$,
  '42501', NULL, 'R7: service_role direct UPDATE is denied at privilege boundary');
SELECT throws_ok(
  $$ DELETE FROM public.session_hour_overrides $$,
  '42501', NULL, 'R7: service_role direct DELETE is denied at privilege boundary');
SELECT throws_ok(
  $$ TRUNCATE TABLE public.session_hour_overrides $$,
  '42501', NULL, 'R7: service_role direct TRUNCATE is denied');
SELECT throws_ok(
  $$ CREATE TRIGGER r7_forged_override_trigger
       BEFORE INSERT ON public.session_hour_overrides
       FOR EACH ROW EXECUTE FUNCTION public.r7_noop_override_trigger() $$,
  '42501', NULL, 'R7: service_role cannot attach a forged audit trigger');
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
