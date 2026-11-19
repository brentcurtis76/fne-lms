-- =============================================================================
-- 150-reallocate-hours.sql — GENERA fixes F21d (GES-3.14).
-- Proves public.reallocate_contract_hours (migration 20261119103000_reallocate_hours_atomic.sql),
-- the one database step behind PATCH /api/contracts/[id]/hours/reallocate:
--   * service role only (anon, signed-in people and PUBLIC cannot execute it), INVOKER, pinned
--     search_path, no DELETE, and it locks the two allocation rows FOR NO KEY UPDATE in id order;
--   * a move of 10 from A to B: A minus 10, B plus 10, exactly one history line;
--   * a move of more than A has available (get_bucket_summary: allocated minus reserved minus
--     consumed) is refused, both rows unchanged, no history line;
--   * same category, the platform's reserved hours (online_learning), a category the contract does
--     not have and an unknown category are refused with their own message;
--   * a move whose history line cannot be written (an actor the log's foreign key refuses) leaves
--     both rows unchanged;
--   * two moves in a row, each for more than half of what is available: the second is refused and
--     the sum of the two categories never changes;
--   * decimals: hours are taken at the columns' two decimals, so the sum never drifts.
-- Two moves at the SAME moment cannot be staged inside one pgTAP transaction: the lock's text is
-- pinned here; the overlap itself is proven by the lead with two real sessions.
-- Synthetic fixtures (uuids 15000000-…); everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(55);

-- -----------------------------------------------------------------------------
-- (1) Structure and privileges
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'reallocate_contract_hours',
  ARRAY['uuid', 'text', 'text', 'numeric', 'text', 'uuid']::name[],
  'reallocate_contract_hours(uuid, text, text, numeric, text, uuid) exists');
SELECT function_returns('public', 'reallocate_contract_hours',
  ARRAY['uuid', 'text', 'text', 'numeric', 'text', 'uuid']::name[], 'jsonb',
  'it returns jsonb');
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
        WHERE oid = 'public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid)'::regprocedure),
  'it is SECURITY INVOKER');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
           WHERE p.oid = 'public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid)'::regprocedure
             AND cfg = 'search_path=public, pg_temp'),
  'it pins search_path = public, pg_temp');
SELECT function_privs_are('public', 'reallocate_contract_hours',
  ARRAY['uuid', 'text', 'text', 'numeric', 'text', 'uuid']::name[],
  'service_role', ARRAY['EXECUTE']::name[], 'service_role can execute it');
SELECT function_privs_are('public', 'reallocate_contract_hours',
  ARRAY['uuid', 'text', 'text', 'numeric', 'text', 'uuid']::name[],
  'authenticated', ARRAY[]::name[], 'authenticated cannot execute it');
SELECT function_privs_are('public', 'reallocate_contract_hours',
  ARRAY['uuid', 'text', 'text', 'numeric', 'text', 'uuid']::name[],
  'anon', ARRAY[]::name[], 'anon cannot execute it');
SELECT ok(
  NOT has_function_privilege('public', 'public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid)', 'EXECUTE'),
  'PUBLIC cannot execute it');
SELECT ok(
  (SELECT prosrc FROM pg_proc
    WHERE oid = 'public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid)'::regprocedure)
    !~* '\mdelete\M',
  'its body holds no DELETE');
-- The lock: two concurrent sessions cannot run inside one pgTAP transaction; the text is pinned.
SELECT ok(
  lower(pg_get_functiondef('public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid)'::regprocedure))
    ~ 'order by a\.id\s+for no key update',
  'it locks the two allocation rows FOR NO KEY UPDATE in id order');

-- -----------------------------------------------------------------------------
-- Fixtures (postgres): contract C with A = 40 h (10 h reserved in the ledger, so 30 available),
-- B = 10 h and an online_learning allocation of 5 h; category Z exists but C has no allocation.
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('f21d150_admin');
INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
VALUES (tests.get_supabase_uid('f21d150_admin'), 'f21d150_admin@test.local', 'f21d150_admin', 'approved', false)
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT tests.get_supabase_uid('f21d150_admin') $$;
GRANT EXECUTE ON FUNCTION pg_temp.actor() TO service_role;

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('15000000-0000-4000-8000-0000000000c1', 'Cliente Horas 150 SpA', 'Cliente Horas 150',
   '76.150.150-0', 'Calle Inventada 150, Santiago',
   'Representante Inventado', '15.150.150-0', DATE '2024-01-15', 'Notaría Inventada');

INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id) VALUES
  ('15000000-0000-4000-8000-0000000000c2', 'CT-F21D-150', DATE '2026-01-05',
   '15000000-0000-4000-8000-0000000000c1');

INSERT INTO public.hour_types (id, key, display_name, modality) VALUES
  ('15000000-0000-4000-8000-0000000000a0', 'f21d150_a', 'Categoría A (prueba)', 'presencial'),
  ('15000000-0000-4000-8000-0000000000b0', 'f21d150_b', 'Categoría B (prueba)', 'presencial'),
  ('15000000-0000-4000-8000-0000000000d0', 'f21d150_z', 'Categoría sin asignación (prueba)', 'presencial');
INSERT INTO public.hour_types (id, key, display_name, modality) VALUES
  ('15000000-0000-4000-8000-0000000000e0', 'online_learning', 'Cursos Online (LMS)', 'online')
ON CONFLICT (key) DO NOTHING;

-- B's row has the SMALLER id, so the id-ordered lock takes B before A on an A → B move.
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES
  ('15000000-0000-4000-8000-0000000000a2', '15000000-0000-4000-8000-0000000000c2',
   '15000000-0000-4000-8000-0000000000a0', 40, pg_temp.actor()),
  ('15000000-0000-4000-8000-0000000000a1', '15000000-0000-4000-8000-0000000000c2',
   '15000000-0000-4000-8000-0000000000b0', 10, pg_temp.actor());
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
SELECT '15000000-0000-4000-8000-0000000000a3', '15000000-0000-4000-8000-0000000000c2',
       ht.id, 5, pg_temp.actor()
  FROM public.hour_types ht WHERE ht.key = 'online_learning';

-- A manual reservation (no session) of 10 h on A.
INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date, recorded_by, is_manual)
VALUES
  ('15000000-0000-4000-8000-0000000000f1', '15000000-0000-4000-8000-0000000000a2', NULL,
   10, 'reservada', DATE '2026-09-10', pg_temp.actor(), true);

CREATE FUNCTION pg_temp.alloc(p_key text) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT a.allocated_hours FROM public.contract_hour_allocations a
    JOIN public.hour_types ht ON ht.id = a.hour_type_id
   WHERE a.contrato_id = '15000000-0000-4000-8000-0000000000c2' AND ht.key = p_key
$$;
CREATE FUNCTION pg_temp.ab_sum() RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT pg_temp.alloc('f21d150_a') + pg_temp.alloc('f21d150_b')
$$;
CREATE FUNCTION pg_temp.log_count() RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM public.contract_hour_reallocation_log
   WHERE contrato_id = '15000000-0000-4000-8000-0000000000c2'
$$;
GRANT EXECUTE ON FUNCTION pg_temp.alloc(text), pg_temp.ab_sum(), pg_temp.log_count() TO service_role;
-- The route reads the available hours from the error's DETAIL.
CREATE FUNCTION pg_temp.detail_of_refusal() RETURNS text LANGUAGE plpgsql AS $$
DECLARE d text;
BEGIN
  PERFORM public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
    'f21d150_a', 'f21d150_b', 25, 'Ajuste por necesidades del programa', pg_temp.actor());
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL;
  RETURN d;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.detail_of_refusal() TO service_role;

SELECT is(
  (SELECT available_hours FROM public.get_bucket_summary('15000000-0000-4000-8000-0000000000c2')
    WHERE hour_type_key = 'f21d150_a'),
  30::numeric, 'fixture: A has 30 h available (40 allocated, 10 reserved)');

-- Signed-in people cannot call it at all.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 1, 'Motivo de prueba suficiente', '15000000-0000-4000-8000-000000000000')$$,
  '42501', NULL, 'authenticated: permission denied');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 1, 'Motivo de prueba suficiente', '15000000-0000-4000-8000-000000000000')$$,
  '42501', NULL, 'anon: permission denied');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- (2) A move of 10 from A to B
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
     'f21d150_a', 'f21d150_b', 10, 'Ajuste por necesidades del programa', pg_temp.actor())
     - 'log_id'),
  '{"from_allocated_hours": 30.00, "to_allocated_hours": 20.00}'::jsonb,
  'move 10 A → B answers the two new allocations');
SELECT is(pg_temp.alloc('f21d150_a'), 30.00::numeric, 'move 10: A 40 → 30');
SELECT is(pg_temp.alloc('f21d150_b'), 20.00::numeric, 'move 10: B 10 → 20');
SELECT is(pg_temp.log_count(), 1, 'move 10: exactly one history line');
SELECT is(
  (SELECT row(l.from_hour_type_id, l.to_hour_type_id, l.hours, l.reason, l.created_by)::text
     FROM public.contract_hour_reallocation_log l
    WHERE l.contrato_id = '15000000-0000-4000-8000-0000000000c2'),
  row('15000000-0000-4000-8000-0000000000a0'::uuid, '15000000-0000-4000-8000-0000000000b0'::uuid,
      10.00::numeric(6,2), 'Ajuste por necesidades del programa'::text, pg_temp.actor())::text,
  'move 10: the history line names from, to, hours, reason and actor');
SELECT ok(
  (SELECT bool_and(updated_at IS NOT NULL) FROM public.contract_hour_allocations
    WHERE id IN ('15000000-0000-4000-8000-0000000000a1', '15000000-0000-4000-8000-0000000000a2')),
  'move 10: both rows carry updated_at');
SELECT is(pg_temp.ab_sum(), 50.00::numeric, 'move 10: A + B still 50');

-- -----------------------------------------------------------------------------
-- (3) More than A has available (now 30 - 10 reserved = 20): refused, nothing changes
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 25, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'insufficient_hours', 'more than available: refused');
SELECT is(pg_temp.alloc('f21d150_a'), 30.00::numeric, 'more than available: A unchanged');
SELECT is(pg_temp.alloc('f21d150_b'), 20.00::numeric, 'more than available: B unchanged');
SELECT is(pg_temp.log_count(), 1, 'more than available: no history line');
SELECT is(pg_temp.detail_of_refusal(), '20.00', 'more than available: DETAIL carries the 20.00 available');

-- -----------------------------------------------------------------------------
-- (4) The route's other refusals, each with its own message; nothing changes
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_a', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'same_category', 'same category: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'online_learning', 'f21d150_b', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'reserved_category', 'from the platform''s reserved hours: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'online_learning', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'reserved_category', 'to the platform''s reserved hours: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_z', 'f21d150_b', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'from_allocation_missing', 'from a category the contract lacks: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_z', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'to_allocation_missing', 'to a category the contract lacks: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_nope', 'f21d150_b', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'from_category_not_found', 'from an unknown category: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_nope', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'to_category_not_found', 'to an unknown category: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 0, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'invalid_hours', 'zero hours: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', -3, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'invalid_hours', 'negative hours: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', NULL, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'invalid_hours', 'no hours: refused');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c9',
      'f21d150_a', 'f21d150_b', 1, 'Ajuste por necesidades del programa', pg_temp.actor())$$,
  'P0001', 'from_allocation_missing', 'an unknown contract: refused as having no source allocation');
SELECT is(
  row(pg_temp.alloc('f21d150_a'), pg_temp.alloc('f21d150_b'), pg_temp.alloc('online_learning'), pg_temp.log_count())::text,
  row(30.00::numeric, 20.00::numeric, 5.00::numeric, 1)::text,
  'after every refusal: A, B and the reserved hours unchanged, still one history line');

-- -----------------------------------------------------------------------------
-- (5) The history line cannot be written: both rows unchanged
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 5, 'Ajuste por necesidades del programa', '15000000-0000-4000-8000-00000000dead')$$,
  '23503', NULL, 'an actor the history''s foreign key refuses: the move fails');
SELECT is(pg_temp.alloc('f21d150_a'), 30.00::numeric, 'failed history line: A unchanged');
SELECT is(pg_temp.alloc('f21d150_b'), 20.00::numeric, 'failed history line: B unchanged');
SELECT is(pg_temp.log_count(), 1, 'failed history line: no new line');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 5, 'Ajuste por necesidades del programa', NULL)$$,
  '23502', NULL, 'no actor: the move fails');
SELECT is(pg_temp.ab_sum(), 50.00::numeric, 'no actor: A + B still 50');

-- -----------------------------------------------------------------------------
-- (6) Two moves in a row, each for more than half of the 20 available
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 12, 'Primer movimiento de prueba', pg_temp.actor())$$,
  'first move of 12 of 20 available: accepted');
SELECT is(pg_temp.ab_sum(), 50.00::numeric, 'after the first move: A + B still 50');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_a', 'f21d150_b', 12, 'Segundo movimiento de prueba', pg_temp.actor())$$,
  'P0001', 'insufficient_hours', 'second move of 12 with 8 available: refused');
SELECT is(
  row(pg_temp.alloc('f21d150_a'), pg_temp.alloc('f21d150_b'), pg_temp.ab_sum(), pg_temp.log_count())::text,
  row(18.00::numeric, 32.00::numeric, 50.00::numeric, 2)::text,
  'after both: A 18, B 32, sum 50, two history lines');

-- -----------------------------------------------------------------------------
-- (7) Decimals: the columns hold two decimals; the move is taken at two decimals
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_b', 'f21d150_a', 2.5, 'Movimiento con decimales', pg_temp.actor())$$,
  'move 2.5 B → A: accepted');
SELECT is(
  row(pg_temp.alloc('f21d150_a'), pg_temp.alloc('f21d150_b'))::text,
  row(20.50::numeric, 29.50::numeric)::text, 'move 2.5: A 20.50, B 29.50');
SELECT is(
  (SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
     'f21d150_b', 'f21d150_a', 0.005, 'Movimiento con tres decimales', pg_temp.actor())
     - 'log_id'),
  '{"from_allocated_hours": 29.49, "to_allocated_hours": 20.51}'::jsonb,
  'move 0.005 is taken as 0.01 on both rows');
SELECT is(
  (SELECT hours FROM public.contract_hour_reallocation_log
    WHERE contrato_id = '15000000-0000-4000-8000-0000000000c2' AND reason = 'Movimiento con tres decimales'),
  0.01::numeric, 'move 0.005: the history line says 0.01');
SELECT is(pg_temp.ab_sum(), 50.00::numeric, 'after the decimal moves: A + B still 50');
SELECT throws_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_b', 'f21d150_a', 0.004, 'Movimiento que redondea a cero', pg_temp.actor())$$,
  'P0001', 'invalid_hours', 'a move that rounds to 0.00: refused');
SELECT lives_ok(
  $$SELECT public.reallocate_contract_hours('15000000-0000-4000-8000-0000000000c2',
      'f21d150_b', 'f21d150_a', 29.49, 'Mover todo lo disponible', pg_temp.actor())$$,
  'moving exactly what is available (29.49 of B): accepted');
SELECT is(
  row(pg_temp.alloc('f21d150_a'), pg_temp.alloc('f21d150_b'), pg_temp.ab_sum(), pg_temp.log_count())::text,
  row(50.00::numeric, 0.00::numeric, 50.00::numeric, 5)::text,
  'at the end: A 50, B 0, sum 50, five history lines');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
