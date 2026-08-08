-- =============================================================================
-- 013-session-reschedule-atomic.sql — r21 (Sol item 2):
-- public.apply_session_reschedule — the ONE transaction both reschedule routes run.
--
-- Sol's finding: `reschedule_session_hours` reconciles a session that has ALREADY
-- been updated, so each route did the schedule write and the ledger write as two
-- separate PostgREST calls. A failure between them left the session MOVED and the
-- ledger billing the OLD duration. This suite owns the properties only the database
-- can prove, and [B4] is the one the round exists for: an injected failure must leave
-- BOTH `consultor_sessions` and `contract_hours_ledger` byte-identical to their
-- pre-call state. A happy-path assertion proves nothing about a transaction.
--
-- NEW FILE rather than an append to 012: 012 owns `reschedule_session_hours`, which
-- is unchanged and still tested on its own. Keeping the wrapper apart leaves 012's
-- fixture and plan count legible and makes a failure here read as "atomicity broke"
-- rather than "the hours arithmetic broke".
--
-- [B2] also pins Sol item 1: the `session_activity_log` action allowlist is back to
-- its 16 baseline values on a fresh replay, and the revision row rides on the
-- pre-existing 'edited' action with a typed `details.event_type` discriminator.
--
-- Fixtures are synthetic (@test.local via tests.create_supabase_user, invented
-- schools/contracts) and the whole file rolls back — no student PII anywhere.
-- =============================================================================

BEGIN;

SELECT plan(32);

-- -----------------------------------------------------------------------------
-- Fixtures — an ample bucket only; the budget boundary is 012's subject, not this
-- suite's. Every assertion here is about WHAT COMMITS, not about how much.
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('ra_admin');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid('ra_admin'), 'ra_admin@test.local', 'ra_admin', 'approved'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9941, 'Reschedule Atomic Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('cccccccc-3333-0000-0000-000000000001', 9941, 'Reschedule Atomic GC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('cccccccc-4444-0000-0000-000000000001', 'Cliente Atómico SpA', 'Cliente Atómico',
   '76.333.444-5', 'Calle Falsa 456, Santiago',
   'Representante Prueba', '11.111.111-1', DATE '2024-01-15', 'Notaría Prueba')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id) VALUES
  ('cccccccc-5555-0000-0000-000000000001', 'CT-RESCHED-ATOMIC-001', DATE '2026-01-05',
   'cccccccc-4444-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hour_types (id, key, display_name, modality) VALUES
  ('cccccccc-6666-0000-0000-000000000001', 'acomp_atomic',
   'Acompañamiento atómico (prueba)', 'online')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES
  ('cccccccc-7777-0000-0000-000000000001', 'cccccccc-5555-0000-0000-000000000001',
   'cccccccc-6666-0000-0000-000000000001', 500, tests.get_supabase_uid('ra_admin'))
ON CONFLICT (id) DO NOTHING;

-- Seed one session + its reservation at 09:00–10:30 = 90 min / 1.50 h.
CREATE FUNCTION pg_temp.seed_session(
  p_id uuid,
  p_ledger_id uuid,
  p_status text DEFAULT 'programada'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.consultor_sessions
    (id, school_id, growth_community_id, title, session_date,
     start_time, end_time, modality, status, created_by,
     contrato_id, hour_type_key)
  VALUES
    (p_id, 9941, 'cccccccc-3333-0000-0000-000000000001',
     'Sesión de prueba atómica', DATE '2026-09-10',
     TIME '09:00', TIME '10:30', 'online', p_status,
     tests.get_supabase_uid('ra_admin'),
     'cccccccc-5555-0000-0000-000000000001', 'acomp_atomic');

  INSERT INTO public.contract_hours_ledger
    (id, allocation_id, session_id, hours, status, session_date,
     recorded_by, planned_minutes_snapshot)
  VALUES
    (p_ledger_id, 'cccccccc-7777-0000-0000-000000000001', p_id,
     1.50, 'reservada', DATE '2026-09-10',
     tests.get_supabase_uid('ra_admin'), 90);
END;
$$;

-- One readable fingerprint per table, so "unchanged" is asserted on the whole of
-- what a reschedule can move rather than on one lucky column.
CREATE FUNCTION pg_temp.session_state(p_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT session_date::text || ' ' || start_time::text || '-' || end_time::text
         || ' / ' || scheduled_duration_minutes::text
    FROM public.consultor_sessions WHERE id = p_id;
$$;

CREATE FUNCTION pg_temp.ledger_state(p_id uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT hours::text || ' / ' || planned_minutes_snapshot::text
         || ' / ' || session_date::text || ' / ' || is_over_budget::text
    FROM public.contract_hours_ledger WHERE id = p_id;
$$;

-- -----------------------------------------------------------------------------
-- [B1] shape and security posture — the same assertions 002-zoom-internal-isolation
-- makes by SIGNATURE, so an added overload could not quietly widen the grant.
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'apply_session_reschedule',
  ARRAY['uuid', 'uuid', 'jsonb', 'timestamptz'],
  'B1: apply_session_reschedule(uuid, uuid, jsonb, timestamptz) exists');

SELECT is(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_session_reschedule'),
  true, 'B1: the RPC is SECURITY DEFINER');

SELECT is(
  (SELECT proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_session_reschedule'),
  ARRAY['search_path=""'], 'B1: the RPC pins an empty search_path');

SELECT ok(
  NOT has_function_privilege('anon',
    'public.apply_session_reschedule(uuid, uuid, jsonb, timestamptz)', 'EXECUTE'),
  'B1: anon cannot execute the RPC');

SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.apply_session_reschedule(uuid, uuid, jsonb, timestamptz)', 'EXECUTE'),
  'B1: authenticated cannot execute the RPC');

SELECT ok(
  has_function_privilege('service_role',
    'public.apply_session_reschedule(uuid, uuid, jsonb, timestamptz)', 'EXECUTE'),
  'B1: service_role can execute the RPC');

-- -----------------------------------------------------------------------------
-- [B2] Sol item 1 — the action allowlist never moved.
--
-- Read from the catalog rather than from the migration text: this is the state a
-- FRESH REPLAY produces, which is the only state production would ever get.
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int
     FROM pg_constraint c,
          LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''[a-z_]+''::text', 'g') AS m
    WHERE c.conrelid = 'public.session_activity_log'::regclass
      AND c.conname = 'session_activity_log_action_check'),
  16, 'B2: the action allowlist is back to its 16 baseline values');

SELECT ok(
  (SELECT pg_get_constraintdef(oid) NOT LIKE '%hours_revised%'
     FROM pg_constraint
    WHERE conrelid = 'public.session_activity_log'::regclass
      AND conname = 'session_activity_log_action_check'),
  'B2: no ''hours_revised'' action was ever added to the allowlist');

-- -----------------------------------------------------------------------------
-- [B3] the happy path — one call moves the session AND the ledger
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000001', 'ffffffff-1111-0000-0000-000000000001');

SELECT is(
  (SELECT (public.apply_session_reschedule(
             'ffffffff-0000-0000-0000-000000000001',
             tests.get_supabase_uid('ra_admin'),
             '{"end_time": "11:00:00"}'::jsonb) ->> 'conflict')::boolean),
  false, 'B3: the RPC reports no conflict and returns the updated row');

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000001'),
  '2026-09-10 09:00:00-11:00:00 / 120',
  'B3: the source session carries the new end time and duration');

SELECT is(
  (SELECT hours FROM public.contract_hours_ledger
    WHERE id = 'ffffffff-1111-0000-0000-000000000001'),
  2.00::numeric(6,2), 'B3: the ledger followed in the SAME call — 1.50 → 2.00');

SELECT is(
  (SELECT planned_minutes_snapshot FROM public.contract_hours_ledger
    WHERE id = 'ffffffff-1111-0000-0000-000000000001'),
  120, 'B3: the planned snapshot followed too');

SELECT is(
  (SELECT action || '/' || (details ->> 'event_type')
     FROM public.session_activity_log
    WHERE session_id = 'ffffffff-0000-0000-0000-000000000001'),
  'edited/hours_revised',
  'B3: exactly one revision row, on the pre-existing action + typed event_type');

-- -----------------------------------------------------------------------------
-- [B4] ATOMICITY — THE CRITERION THIS ROUND EXISTS FOR.
--
-- The failure is injected AFTER the source update and inside the ledger work: a
-- trigger rejects the revision INSERT, which the inner function writes last. Under
-- the two-call design this is precisely the case that left the session moved and the
-- ledger stale — the route's UPDATE had already committed on its own connection.
-- Both tables must now read exactly as they did before the call.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000002', 'ffffffff-1111-0000-0000-000000000002');

CREATE FUNCTION pg_temp.block_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'forced revision failure' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER zz_block_revision
  BEFORE INSERT ON public.session_activity_log
  FOR EACH ROW WHEN (NEW.details ->> 'event_type' = 'hours_revised')
  EXECUTE FUNCTION pg_temp.block_revision();

SELECT throws_ok(
  format('SELECT public.apply_session_reschedule(%L, %L, %L::jsonb)',
         'ffffffff-0000-0000-0000-000000000002',
         tests.get_supabase_uid('ra_admin'),
         '{"end_time": "11:00:00"}'),
  'P0001', 'forced revision failure',
  'B4: a ledger failure propagates out of the RPC instead of being swallowed');

DROP TRIGGER zz_block_revision ON public.session_activity_log;

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000002'),
  '2026-09-10 09:00:00-10:30:00 / 90',
  'B4: THE SESSION DID NOT MOVE — the source update rolled back with the ledger');

SELECT is(
  pg_temp.ledger_state('ffffffff-1111-0000-0000-000000000002'),
  '1.50 / 90 / 2026-09-10 / false',
  'B4: the ledger row is byte-identical to its pre-call state');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'ffffffff-0000-0000-0000-000000000002'),
  0, 'B4: no revision row survived the rollback');

-- -----------------------------------------------------------------------------
-- [B5] optimistic concurrency, now INSIDE the transaction: a stale if_updated_at is
-- rejected having written to neither table.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000003', 'ffffffff-1111-0000-0000-000000000003');

SELECT is(
  (SELECT (public.apply_session_reschedule(
             'ffffffff-0000-0000-0000-000000000003',
             tests.get_supabase_uid('ra_admin'),
             '{"end_time": "11:00:00"}'::jsonb,
             TIMESTAMPTZ '2020-01-01 00:00:00+00') ->> 'conflict')::boolean),
  true, 'B5: a stale if_updated_at is reported as a conflict');

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000003'),
  '2026-09-10 09:00:00-10:30:00 / 90',
  'B5: the session is untouched after the rejected guard');

SELECT is(
  pg_temp.ledger_state('ffffffff-1111-0000-0000-000000000003'),
  '1.50 / 90 / 2026-09-10 / false',
  'B5: the ledger is untouched after the rejected guard');

-- The same guard, matching, still applies the change — the check is a guard, not a
-- blanket refusal of every request that carries one.
SELECT is(
  (SELECT (public.apply_session_reschedule(
             'ffffffff-0000-0000-0000-000000000003',
             tests.get_supabase_uid('ra_admin'),
             '{"end_time": "11:00:00"}'::jsonb,
             (SELECT updated_at FROM public.consultor_sessions
               WHERE id = 'ffffffff-0000-0000-0000-000000000003')
           ) ->> 'conflict')::boolean),
  false, 'B5: a matching if_updated_at lets the reschedule through');

-- -----------------------------------------------------------------------------
-- [B6] the column allowlist fails CLOSED — this function applies a caller-supplied
-- column map, so an unexpected key must stop it rather than reach the table.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000004', 'ffffffff-1111-0000-0000-000000000004');

SELECT throws_ok(
  format('SELECT public.apply_session_reschedule(%L, %L, %L::jsonb)',
         'ffffffff-0000-0000-0000-000000000004',
         tests.get_supabase_uid('ra_admin'),
         '{"end_time": "11:00:00", "contrato_id": null}'),
  'P0001', NULL,
  'B6: a column outside the allowlist is refused');

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000004'),
  '2026-09-10 09:00:00-10:30:00 / 90',
  'B6: the refused request wrote nothing');

-- -----------------------------------------------------------------------------
-- [B7] a POST-execution time edit still updates the session and leaves the ledger
-- alone — the behaviour both routes have always had. The ledger gate is on the
-- POST-update status, so `completada` simply never reaches the hours work.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000005', 'ffffffff-1111-0000-0000-000000000005',
  'completada');

SELECT public.apply_session_reschedule(
  'ffffffff-0000-0000-0000-000000000005',
  tests.get_supabase_uid('ra_admin'),
  '{"end_time": "11:00:00"}'::jsonb);

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000005'),
  '2026-09-10 09:00:00-11:00:00 / 120',
  'B7: a completada session still accepts the time edit');

SELECT is(
  pg_temp.ledger_state('ffffffff-1111-0000-0000-000000000005'),
  '1.50 / 90 / 2026-09-10 / false',
  'B7: its frozen ledger row is left exactly alone');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'ffffffff-0000-0000-0000-000000000005'),
  0, 'B7: and no revision row is written for it');

-- -----------------------------------------------------------------------------
-- [B8] a date-only move carries the ledger date and writes no duration revision
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000006', 'ffffffff-1111-0000-0000-000000000006');

SELECT public.apply_session_reschedule(
  'ffffffff-0000-0000-0000-000000000006',
  tests.get_supabase_uid('ra_admin'),
  '{"session_date": "2026-09-24"}'::jsonb);

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000006'),
  '2026-09-24 09:00:00-10:30:00 / 90',
  'B8: the session date moved and the duration did not');

SELECT is(
  pg_temp.ledger_state('ffffffff-1111-0000-0000-000000000006'),
  '1.50 / 90 / 2026-09-24 / false',
  'B8: the ledger date followed and the hours did not');

SELECT is(
  (SELECT count(*)::int FROM public.session_activity_log
    WHERE session_id = 'ffffffff-0000-0000-0000-000000000006'),
  0, 'B8: a date-only move writes no spurious duration revision');

-- -----------------------------------------------------------------------------
-- [B9] the inner function's own refusals still abort the whole thing — a
-- recomputation that would yield 0 h takes the session update down with it.
-- -----------------------------------------------------------------------------
SELECT pg_temp.seed_session(
  'ffffffff-0000-0000-0000-000000000007', 'ffffffff-1111-0000-0000-000000000007');

SELECT throws_ok(
  format('SELECT public.apply_session_reschedule(%L, %L, %L::jsonb)',
         'ffffffff-0000-0000-0000-000000000007',
         tests.get_supabase_uid('ra_admin'),
         '{"end_time": "09:00:00"}'),
  '23514', NULL,
  'B9: a 0 h recomputation raises with the inner function''s own SQLSTATE');

SELECT is(
  pg_temp.session_state('ffffffff-0000-0000-0000-000000000007'),
  '2026-09-10 09:00:00-10:30:00 / 90',
  'B9: the session kept its old times — the refusal rolled the update back');

SELECT is(
  pg_temp.ledger_state('ffffffff-1111-0000-0000-000000000007'),
  '1.50 / 90 / 2026-09-10 / false',
  'B9: and the ledger is unchanged');

SELECT * FROM finish();
ROLLBACK;
