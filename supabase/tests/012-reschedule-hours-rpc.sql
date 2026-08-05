-- =============================================================================
-- 012-reschedule-hours-rpc.sql — Z2-3a: public.reschedule_session_hours
--
-- Plan §11: a pre-execution reschedule updates the hour reservation, the planned
-- snapshot and an append-only revision entry IN ONE TRANSACTION. This suite owns
-- the behaviour only the database can prove — atomicity ([A3]), the pre-execution
-- guard enforced by the RPC ITSELF rather than by a caller ([A4]), and the
-- `hours > 0` refusal ([A5]). None of the three is assertable in a mock.
--
-- NEW FILE rather than an append to 011: 011 owns the Zoom PUBLIC RLS persona
-- matrix, and this suite contains no RLS content at all — it is a billing-RPC
-- behaviour suite with a heavy contract/allocation/ledger fixture. Keeping it apart
-- leaves 011's plan count stable and keeps a failure here legible as "the hours RPC
-- broke" rather than "a Zoom RLS test broke". Numbered 012 to sit beside the other
-- Zoom-owned suites (010/011) per the existing convention.
--
-- The budget cases get their OWN allocations: the shared one accumulates
-- reservations from every seeded session above them, which would make the
-- is_over_budget boundary unreadable and the assertion accidental.
--
-- Fixtures are synthetic (@test.local via tests.create_supabase_user, invented
-- schools/contracts) and the whole file rolls back — no student PII anywhere.
-- =============================================================================

BEGIN;

SELECT plan(36);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('h_admin');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid('h_admin'), 'h_admin@test.local', 'h_admin', 'approved'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9931, 'Hours RPC Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('dddddddd-3333-0000-0000-000000000001', 9931, 'Hours RPC GC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('dddddddd-4444-0000-0000-000000000001', 'Cliente Prueba SpA', 'Cliente Prueba',
   '76.111.222-3', 'Calle Falsa 123, Santiago',
   'Representante Prueba', '11.111.111-1', DATE '2024-01-15', 'Notaría Prueba')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id) VALUES
  ('dddddddd-5555-0000-0000-000000000001', 'CT-HOURS-RPC-001', DATE '2026-01-05',
   'dddddddd-4444-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Three hour types → three independent buckets (allocations are UNIQUE per
-- contract+hour_type): a general one, a deliberately tight one, an ample one.
INSERT INTO public.hour_types (id, key, display_name, modality) VALUES
  ('dddddddd-6666-0000-0000-000000000001', 'acomp_rpc_general',
   'Acompañamiento general (prueba)', 'online'),
  ('dddddddd-6666-0000-0000-000000000002', 'acomp_rpc_tight',
   'Acompañamiento presupuesto justo (prueba)', 'online'),
  ('dddddddd-6666-0000-0000-000000000003', 'acomp_rpc_ample',
   'Acompañamiento presupuesto amplio (prueba)', 'online')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES
  ('dddddddd-7777-0000-0000-000000000001', 'dddddddd-5555-0000-0000-000000000001',
   'dddddddd-6666-0000-0000-000000000001', 500, tests.get_supabase_uid('h_admin')),
  ('dddddddd-7777-0000-0000-000000000002', 'dddddddd-5555-0000-0000-000000000001',
   'dddddddd-6666-0000-0000-000000000002', 2, tests.get_supabase_uid('h_admin')),
  ('dddddddd-7777-0000-0000-000000000003', 'dddddddd-5555-0000-0000-000000000001',
   'dddddddd-6666-0000-0000-000000000003', 100, tests.get_supabase_uid('h_admin'))
ON CONFLICT (id) DO NOTHING;

-- Helper: seed one session + its reservation at 09:00–10:30 = 90 min / 1.50 h.
CREATE FUNCTION pg_temp.seed_session(
  p_id uuid,
  p_ledger_id uuid,
  p_status text DEFAULT 'programada',
  p_ledger_status text DEFAULT 'reservada',
  p_hour_type_key text DEFAULT 'acomp_rpc_general',
  p_allocation_id uuid DEFAULT 'dddddddd-7777-0000-0000-000000000001'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.consultor_sessions
    (id, school_id, growth_community_id, title, session_date,
     start_time, end_time, modality, status, created_by,
     contrato_id, hour_type_key)
  VALUES
    (p_id, 9931, 'dddddddd-3333-0000-0000-000000000001',
     'Sesión de prueba horas', DATE '2026-09-10',
     TIME '09:00', TIME '10:30', 'online', p_status,
     tests.get_supabase_uid('h_admin'),
     'dddddddd-5555-0000-0000-000000000001', p_hour_type_key);

  INSERT INTO public.contract_hours_ledger
    (id, allocation_id, session_id, hours, status, session_date,
     recorded_by, planned_minutes_snapshot)
  VALUES
    (p_ledger_id, p_allocation_id, p_id,
     1.50, p_ledger_status, DATE '2026-09-10',
     tests.get_supabase_uid('h_admin'), 90);
END;
$$;

-- Helper: apply new times, i.e. exactly what a reschedule route does before calling.
CREATE FUNCTION pg_temp.retime(p_id uuid, p_end time, p_date date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.consultor_sessions
     SET end_time = p_end,
         session_date = COALESCE(p_date, session_date)
   WHERE id = p_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- [A1] shape and security posture
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'reschedule_session_hours', ARRAY['uuid', 'uuid'],
  'A1: reschedule_session_hours(uuid, uuid) exists');

SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reschedule_session_hours'),
  true, 'A1: the RPC is SECURITY DEFINER');

SELECT is(
  (SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reschedule_session_hours'),
  -- same stored form as the zoom_internal RPCs (claim_zoom_jobs et al.)
  ARRAY['search_path=""'], 'A1: the RPC pins an empty search_path');

SELECT ok(
  NOT has_function_privilege('anon', 'public.reschedule_session_hours(uuid, uuid)', 'EXECUTE'),
  'A1: anon cannot execute the RPC');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.reschedule_session_hours(uuid, uuid)', 'EXECUTE'),
  'A1: authenticated cannot execute the RPC');

SELECT ok(
  has_function_privilege('service_role', 'public.reschedule_session_hours(uuid, uuid)', 'EXECUTE'),
  'A1: service_role can execute the RPC');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.contract_hours_ledger'::regclass
             AND conname = 'contract_hours_ledger_hours_check'),
  'A1: the hours > 0 CHECK is present before any RPC call');

-- -----------------------------------------------------------------------------
-- [A2] 90 → 120 min updates hours + snapshot and writes exactly one revision row
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000001');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000001', TIME '11:00');

SELECT is(
  (SELECT (public.reschedule_session_hours(
             'eeeeeeee-0000-0000-0000-000000000001',
             tests.get_supabase_uid('h_admin')) ->> 'applied')::boolean),
  true, 'A2: a 90 → 120 min reschedule reports applied');

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000001'),
  2.00::numeric(6,2), 'A2: ledger hours recomputed 1.50 → 2.00');

SELECT is(
  (SELECT planned_minutes_snapshot FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000001'),
  120, 'A2: planned_minutes_snapshot updated 90 → 120');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000001'
      AND action = 'hours_revised'),
  1, 'A2: exactly one hours_revised revision row');

SELECT is(
  (SELECT (details ->> 'old_minutes') || '→' || (details ->> 'new_minutes') || ' / ' ||
          (details ->> 'old_hours')   || '→' || (details ->> 'new_hours')
     FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000001'
      AND action = 'hours_revised'),
  '90→120 / 1.50→2.00', 'A2: the revision row records old and new minutes and hours');

SELECT is(
  (SELECT user_id FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000001'
      AND action = 'hours_revised'),
  tests.get_supabase_uid('h_admin'), 'A2: the revision row records the actor');

-- Append-only: a second reschedule ADDS a row and leaves the first untouched.
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000001', TIME '10:00');
SELECT public.reschedule_session_hours(
  'eeeeeeee-0000-0000-0000-000000000001', tests.get_supabase_uid('h_admin'));

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000001'
      AND action = 'hours_revised'),
  2, 'A2: a second revision APPENDS — the history is never rewritten');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000001'
      AND action = 'hours_revised'
      AND (details ->> 'old_minutes')::int = 90
      AND (details ->> 'new_minutes')::int = 120),
  1, 'A2: the first revision row survives the second reschedule verbatim');

-- -----------------------------------------------------------------------------
-- [A3] ATOMICITY — force the revision INSERT to fail, prove the UPDATE rolled back
--
-- The UPDATE runs BEFORE the INSERT inside the RPC, so a failure at the INSERT is
-- precisely the case that would leave a stale ledger with no revision trail if the
-- three writes were not one transaction. `updated_by` carries an FK to profiles, so
-- a bogus actor would fail at the UPDATE instead and prove nothing about ordering —
-- hence a trigger that rejects the revision INSERT specifically.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-1111-0000-0000-000000000002');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000002', TIME '11:00');

CREATE FUNCTION pg_temp.block_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'forced revision failure' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER zz_block_revision
  BEFORE INSERT ON public.session_activity_log
  FOR EACH ROW WHEN (NEW.action = 'hours_revised')
  EXECUTE FUNCTION pg_temp.block_revision();

SELECT throws_ok(
  format('SELECT public.reschedule_session_hours(%L, %L)',
         'eeeeeeee-0000-0000-0000-000000000002', tests.get_supabase_uid('h_admin')),
  'P0001', 'forced revision failure',
  'A3: the RPC propagates a revision-insert failure instead of swallowing it');

DROP TRIGGER zz_block_revision ON public.session_activity_log;

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000002'),
  1.50::numeric(6,2), 'A3: hours UNCHANGED after the failed revision — rolled back');

SELECT is(
  (SELECT planned_minutes_snapshot FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000002'),
  90, 'A3: planned_minutes_snapshot UNCHANGED after the failed revision');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000002'),
  0, 'A3: no revision row survived the rollback');

-- -----------------------------------------------------------------------------
-- [A4] the RPC itself refuses anything at or past execution — asserted by calling
-- the RPC DIRECTLY, not through a route.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000003', 'eeeeeeee-1111-0000-0000-000000000003',
  'en_progreso');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000003', TIME '11:00');

SELECT throws_ok(
  format('SELECT public.reschedule_session_hours(%L, %L)',
         'eeeeeeee-0000-0000-0000-000000000003', tests.get_supabase_uid('h_admin')),
  'P0001', NULL, 'A4: en_progreso is refused by the RPC');

SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000004', 'eeeeeeee-1111-0000-0000-000000000004',
  'pendiente_informe');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000004', TIME '11:00');

SELECT throws_ok(
  format('SELECT public.reschedule_session_hours(%L, %L)',
         'eeeeeeee-0000-0000-0000-000000000004', tests.get_supabase_uid('h_admin')),
  'P0001', NULL, 'A4: pendiente_informe is refused by the RPC');

SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000005', 'eeeeeeee-1111-0000-0000-000000000005',
  'completada');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000005', TIME '11:00');

SELECT throws_ok(
  format('SELECT public.reschedule_session_hours(%L, %L)',
         'eeeeeeee-0000-0000-0000-000000000005', tests.get_supabase_uid('h_admin')),
  'P0001', NULL, 'A4: completada is refused by the RPC');

-- A finalized LEDGER row is frozen even while the session still reads programada.
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000006', 'eeeeeeee-1111-0000-0000-000000000006',
  'programada', 'consumida');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000006', TIME '11:00');

SELECT throws_ok(
  format('SELECT public.reschedule_session_hours(%L, %L)',
         'eeeeeeee-0000-0000-0000-000000000006', tests.get_supabase_uid('h_admin')),
  'P0001', NULL, 'A4: a finalized (consumida) ledger row is refused by the RPC');

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000006'),
  1.50::numeric(6,2), 'A4: the refused finalized row is untouched');

-- -----------------------------------------------------------------------------
-- [A5] a recomputation that would yield 0 h raises and changes nothing
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000007', 'eeeeeeee-1111-0000-0000-000000000007');
-- end_time = start_time → scheduled_duration_minutes = 0
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000007', TIME '09:00');

SELECT throws_ok(
  format('SELECT public.reschedule_session_hours(%L, %L)',
         'eeeeeeee-0000-0000-0000-000000000007', tests.get_supabase_uid('h_admin')),
  '23514', NULL, 'A5: a 0 h recomputation raises rather than writing');

SELECT is(
  (SELECT hours::text || '/' || planned_minutes_snapshot::text
     FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000007'),
  '1.50/90', 'A5: the ledger row is unchanged after the 0 h refusal');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid = 'public.contract_hours_ledger'::regclass
             AND conname = 'contract_hours_ledger_hours_check'
             AND pg_get_constraintdef(oid) = 'CHECK ((hours > (0)::numeric))'),
  'A5: the hours > 0 CHECK is still present and unrelaxed afterwards');

-- -----------------------------------------------------------------------------
-- [A7] a session_date-only move updates the ledger date and writes NO revision
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000008', 'eeeeeeee-1111-0000-0000-000000000008');
-- same 09:00–10:30, new date
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000008', TIME '10:30', DATE '2026-09-24');

SELECT public.reschedule_session_hours(
  'eeeeeeee-0000-0000-0000-000000000008', tests.get_supabase_uid('h_admin'));

SELECT is(
  (SELECT session_date FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000008'),
  DATE '2026-09-24', 'A7: a date-only move updates the ledger session_date');

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000008'),
  1.50::numeric(6,2), 'A7: a date-only move leaves hours alone');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'eeeeeeee-0000-0000-0000-000000000008'
      AND action = 'hours_revised'),
  0, 'A7: a date-only move writes no spurious duration revision');

-- -----------------------------------------------------------------------------
-- [A8] lengthening past the available hours SUCCEEDS and flags is_over_budget.
--
-- Tight bucket: allocated 2.00, this session reserves 1.50 → available 0.50.
-- Stretching to 09:00–12:00 = 3.00 h needs more than available (0.50) + this row's
-- own reservation (1.50) = 2.00 — the same comparison createReservation makes at
-- approve time, with this row's reservation added back because it is already inside
-- the bucket's reserved_hours.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000009', 'eeeeeeee-1111-0000-0000-000000000009',
  'programada', 'reservada', 'acomp_rpc_tight', 'dddddddd-7777-0000-0000-000000000002');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000009', TIME '12:00');

SELECT is(
  (SELECT (public.reschedule_session_hours(
             'eeeeeeee-0000-0000-0000-000000000009',
             tests.get_supabase_uid('h_admin')) ->> 'applied')::boolean),
  true, 'A8: a lengthening reschedule past the budget is NOT blocked');

SELECT is(
  (SELECT hours::text || '/' || is_over_budget::text
     FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000009'),
  '3.00/true', 'A8: it applies the new hours and sets is_over_budget');

-- Ample bucket (100 h): the same 90 → 180 min stretch must NOT flag over-budget,
-- or the flag would be meaningless.
SELECT pg_temp.seed_session(
  'eeeeeeee-0000-0000-0000-000000000010', 'eeeeeeee-1111-0000-0000-000000000010',
  'programada', 'reservada', 'acomp_rpc_ample', 'dddddddd-7777-0000-0000-000000000003');
SELECT pg_temp.retime('eeeeeeee-0000-0000-0000-000000000010', TIME '12:00');

SELECT public.reschedule_session_hours(
  'eeeeeeee-0000-0000-0000-000000000010', tests.get_supabase_uid('h_admin'));

SELECT is(
  (SELECT hours::text || '/' || is_over_budget::text
     FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000010'),
  '3.00/false', 'A8: the same stretch inside budget does NOT flag is_over_budget');

-- ANTI-DRIFT PIN. The RPC restates get_bucket_summary's available_hours inline —
-- that function pins no search_path of its own, so it cannot be called from a
-- hardened one. These two cases assert the restatement still agrees with the real
-- function.
--
-- The RPC's predicate is `(availability_including_this_row + its_old_hours) < new`.
-- Substituting availability = allocated − reserved − consumed and cancelling the
-- row's own contribution, that is exactly `allocated − everything_else < new`, i.e.
-- AFTER the write the bucket has gone negative. So get_bucket_summary's own
-- available_hours < 0, read post-reschedule, must equal the flag the RPC wrote.
-- Change the availability formula in one place only and this fails.
SELECT is(
  (SELECT b.available_hours < 0
     FROM public.get_bucket_summary('dddddddd-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'acomp_rpc_tight'),
  (SELECT is_over_budget FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000009'),
  'A8: the RPC''s inline availability agrees with get_bucket_summary (tight bucket)');

SELECT is(
  (SELECT b.available_hours < 0
     FROM public.get_bucket_summary('dddddddd-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'acomp_rpc_ample'),
  (SELECT is_over_budget FROM public.contract_hours_ledger
    WHERE id = 'eeeeeeee-1111-0000-0000-000000000010'),
  'A8: the RPC''s inline availability agrees with get_bucket_summary (ample bucket)');

-- -----------------------------------------------------------------------------
-- [A9] nothing here ever produces a cancellation-clause row
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.contract_hours_ledger
    WHERE allocation_id IN ('dddddddd-7777-0000-0000-000000000001',
                            'dddddddd-7777-0000-0000-000000000002',
                            'dddddddd-7777-0000-0000-000000000003')
      AND status IN ('devuelta', 'penalizada')),
  0, 'A9: no devuelta/penalizada row was produced by any path in this suite');

SELECT * FROM finish();
ROLLBACK;
