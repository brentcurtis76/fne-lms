-- =============================================================================
-- 014-bucket-summary-fanout.sql — Z2 r22 (Sol item 3): public.get_bucket_summary
--
-- The repaired function must count each allocation ONCE regardless of how many
-- ledger rows hang off it (20260809120000_fix_bucket_summary_fanout.sql), and the
-- reschedule RPC must now read its availability from that same function
-- (20260809120100_reschedule_rpc_uses_bucket_summary.sql).
--
-- NEW FILE rather than an append to 012: 012 owns reschedule_session_hours'
-- behaviour, this suite owns an hour-tracking function that predates Zoom entirely
-- and is read by the admin/equipo_directivo dashboards. Keeping it apart leaves
-- 012's plan count stable and keeps a failure here legible as "the bucket summary
-- broke".
--
-- Every bucket below gets its OWN hour type and its own allocation: the fan-out is
-- only readable when nothing else is reserving against the same bucket.
--
-- Fixtures are synthetic (@test.local via tests.create_supabase_user, invented
-- schools/contracts) and the whole file rolls back — no student PII anywhere.
-- =============================================================================

BEGIN;

SELECT plan(37);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('bs_admin');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid('bs_admin'), 'bs_admin@test.local', 'bs_admin', 'approved'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9932, 'Bucket Summary Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('ffffffff-3333-0000-0000-000000000001', 9932, 'Bucket Summary GC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES
  ('ffffffff-4444-0000-0000-000000000001', 'Cliente Buckets SpA', 'Cliente Buckets',
   '76.999.888-7', 'Calle Falsa 456, Santiago',
   'Representante Buckets', '22.222.222-2', DATE '2024-02-20', 'Notaría Prueba')
ON CONFLICT (id) DO NOTHING;

-- The main contract, plus the annex contract whose allocations extend it.
INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id) VALUES
  ('ffffffff-5555-0000-0000-000000000001', 'CT-BUCKETS-001', DATE '2026-01-05',
   'ffffffff-4444-0000-0000-000000000001'),
  ('ffffffff-5555-0000-0000-000000000002', 'CT-BUCKETS-ANEXO-001', DATE '2026-03-05',
   'ffffffff-4444-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- One hour type per case (allocations are UNIQUE per contract + hour type).
INSERT INTO public.hour_types (id, key, display_name, modality, sort_order) VALUES
  ('ffffffff-6666-0000-0000-000000000001', 'bs_fanout',
   'Bucket fan-out (prueba)', 'online', 1),
  ('ffffffff-6666-0000-0000-000000000002', 'bs_equal',
   'Bucket asignaciones iguales (prueba)', 'online', 2),
  ('ffffffff-6666-0000-0000-000000000003', 'bs_annex',
   'Bucket anexo (prueba)', 'online', 3),
  ('ffffffff-6666-0000-0000-000000000004', 'bs_zero',
   'Bucket saldo cero (prueba)', 'online', 4),
  ('ffffffff-6666-0000-0000-000000000005', 'bs_over',
   'Bucket sobregirado (prueba)', 'online', 5),
  ('ffffffff-6666-0000-0000-000000000006', 'bs_rpc',
   'Bucket RPC (prueba)', 'online', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, is_fixed_allocation,
   adds_to_allocation_id, created_by)
VALUES
  -- [J1] one allocation, three ledger rows. is_fixed_allocation TRUE so the
  -- BOOL_OR pass-through is exercised too.
  ('ffffffff-7777-0000-0000-000000000001', 'ffffffff-5555-0000-0000-000000000001',
   'ffffffff-6666-0000-0000-000000000001', 100, true, NULL,
   tests.get_supabase_uid('bs_admin')),
  -- [J2] two allocations of EQUAL size on one hour type: the direct one…
  ('ffffffff-7777-0000-0000-000000000002', 'ffffffff-5555-0000-0000-000000000001',
   'ffffffff-6666-0000-0000-000000000002', 100, false, NULL,
   tests.get_supabase_uid('bs_admin')),
  -- [J3] annex case: direct 40…
  ('ffffffff-7777-0000-0000-000000000004', 'ffffffff-5555-0000-0000-000000000001',
   'ffffffff-6666-0000-0000-000000000003', 40, false, NULL,
   tests.get_supabase_uid('bs_admin')),
  -- [J4] exactly-zero and past-zero buckets
  ('ffffffff-7777-0000-0000-000000000006', 'ffffffff-5555-0000-0000-000000000001',
   'ffffffff-6666-0000-0000-000000000004', 10, false, NULL,
   tests.get_supabase_uid('bs_admin')),
  ('ffffffff-7777-0000-0000-000000000007', 'ffffffff-5555-0000-0000-000000000001',
   'ffffffff-6666-0000-0000-000000000005', 10, false, NULL,
   tests.get_supabase_uid('bs_admin')),
  -- [J7] the bucket the reschedule RPC reads
  ('ffffffff-7777-0000-0000-000000000008', 'ffffffff-5555-0000-0000-000000000001',
   'ffffffff-6666-0000-0000-000000000006', 10, false, NULL,
   tests.get_supabase_uid('bs_admin'))
ON CONFLICT (id) DO NOTHING;

-- Annex allocations live on the ANNEX contract and point at the parent bucket.
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, is_fixed_allocation,
   adds_to_allocation_id, created_by)
VALUES
  -- [J2] …and the annex one, deliberately the SAME 100 h. A DISTINCT-based
  -- "fix" would collapse these two into one and report 100 instead of 200.
  ('ffffffff-7777-0000-0000-000000000003', 'ffffffff-5555-0000-0000-000000000002',
   'ffffffff-6666-0000-0000-000000000002', 100, false,
   'ffffffff-7777-0000-0000-000000000002', tests.get_supabase_uid('bs_admin')),
  -- [J3] …and an annex of 50 carrying TWO ledger rows of its own.
  ('ffffffff-7777-0000-0000-000000000005', 'ffffffff-5555-0000-0000-000000000002',
   'ffffffff-6666-0000-0000-000000000003', 50, false,
   'ffffffff-7777-0000-0000-000000000004', tests.get_supabase_uid('bs_admin'))
ON CONFLICT (id) DO NOTHING;

-- Ledger rows. session_id is nullable (manual entries), which keeps the fixture
-- to the rows that matter: it is the ROW COUNT per allocation that drives the bug.
INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date, recorded_by)
VALUES
  -- [J1] three rows on the 100 h allocation → 10 reserved, 5 + 2 = 7 consumed
  ('ffffffff-8888-0000-0000-000000000001', 'ffffffff-7777-0000-0000-000000000001',
   NULL, 10.00, 'reservada',  DATE '2026-09-10', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000002', 'ffffffff-7777-0000-0000-000000000001',
   NULL,  5.00, 'consumida',  DATE '2026-09-11', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000003', 'ffffffff-7777-0000-0000-000000000001',
   NULL,  2.00, 'penalizada', DATE '2026-09-12', tests.get_supabase_uid('bs_admin')),
  -- …plus one 'devuelta' row, which the function must keep ignoring entirely.
  ('ffffffff-8888-0000-0000-000000000004', 'ffffffff-7777-0000-0000-000000000001',
   NULL,  9.00, 'devuelta',   DATE '2026-09-13', tests.get_supabase_uid('bs_admin')),

  -- [J2] two rows on the direct allocation, one on the annex
  ('ffffffff-8888-0000-0000-000000000005', 'ffffffff-7777-0000-0000-000000000002',
   NULL,  3.00, 'consumida',  DATE '2026-09-10', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000006', 'ffffffff-7777-0000-0000-000000000002',
   NULL,  4.00, 'consumida',  DATE '2026-09-11', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000007', 'ffffffff-7777-0000-0000-000000000003',
   NULL,  5.00, 'reservada',  DATE '2026-09-12', tests.get_supabase_uid('bs_admin')),

  -- [J3] both rows sit on the ANNEX allocation, so annex_hours is what fans out
  ('ffffffff-8888-0000-0000-000000000008', 'ffffffff-7777-0000-0000-000000000005',
   NULL,  1.00, 'reservada',  DATE '2026-09-10', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000009', 'ffffffff-7777-0000-0000-000000000005',
   NULL,  2.00, 'consumida',  DATE '2026-09-11', tests.get_supabase_uid('bs_admin')),

  -- [J4] 4 + 6 = 10 consumed against 10 allocated → available exactly 0
  ('ffffffff-8888-0000-0000-000000000010', 'ffffffff-7777-0000-0000-000000000006',
   NULL,  4.00, 'consumida',  DATE '2026-09-10', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000011', 'ffffffff-7777-0000-0000-000000000006',
   NULL,  6.00, 'consumida',  DATE '2026-09-11', tests.get_supabase_uid('bs_admin')),
  -- …and 6 + 6 = 12 against 10 → available −2
  ('ffffffff-8888-0000-0000-000000000012', 'ffffffff-7777-0000-0000-000000000007',
   NULL,  6.00, 'consumida',  DATE '2026-09-10', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000013', 'ffffffff-7777-0000-0000-000000000007',
   NULL,  6.00, 'consumida',  DATE '2026-09-11', tests.get_supabase_uid('bs_admin')),

  -- [J7] two consumed rows of 4 on the RPC bucket; the session's own reservation
  -- is added below and makes the third row on this allocation.
  ('ffffffff-8888-0000-0000-000000000014', 'ffffffff-7777-0000-0000-000000000008',
   NULL,  4.00, 'consumida',  DATE '2026-09-10', tests.get_supabase_uid('bs_admin')),
  ('ffffffff-8888-0000-0000-000000000015', 'ffffffff-7777-0000-0000-000000000008',
   NULL,  4.00, 'consumida',  DATE '2026-09-11', tests.get_supabase_uid('bs_admin'));

-- -----------------------------------------------------------------------------
-- [J6] signature, return shape, volatility and grants are unchanged
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'get_bucket_summary', ARRAY['uuid'],
  'J6: get_bucket_summary(uuid) still exists at its original signature');

SELECT is(
  (SELECT pg_get_function_arguments(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_bucket_summary'),
  'p_contrato_id uuid', 'J6: the argument name and type are unchanged');

SELECT is(
  (SELECT pg_get_function_result(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_bucket_summary'),
  'TABLE(hour_type_key text, display_name text, allocated_hours numeric, '
  || 'reserved_hours numeric, consumed_hours numeric, available_hours numeric, '
  || 'is_fixed_allocation boolean, annex_hours numeric)',
  'J6: the return shape — names, order and types — is byte-for-byte unchanged');

SELECT is(
  (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_bucket_summary'),
  's'::"char", 'J6: the function is still STABLE');

SELECT ok(
  NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_bucket_summary'),
  'J6: the function is still invoker-rights, NOT security definer');

SELECT ok(
  has_function_privilege('anon', 'public.get_bucket_summary(uuid)', 'EXECUTE'),
  'J6: anon still has EXECUTE');

SELECT ok(
  has_function_privilege('authenticated', 'public.get_bucket_summary(uuid)', 'EXECUTE'),
  'J6: authenticated still has EXECUTE');

SELECT ok(
  has_function_privilege('service_role', 'public.get_bucket_summary(uuid)', 'EXECUTE'),
  'J6: service_role still has EXECUTE');

-- -----------------------------------------------------------------------------
-- [J1] THE FAN-OUT CASE — one 100 h allocation with three counted ledger rows.
-- Before the fix this reported allocated 300 and available 283.
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT b.allocated_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  100::numeric,
  'J1: one 100 h allocation with three ledger rows reports 100 allocated, not 300');

SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  83::numeric,
  'J1: available = 100 − 10 reserved − 7 consumed = 83 (was 283)');

SELECT is(
  (SELECT b.allocated_hours - b.reserved_hours - b.consumed_hours
     FROM public.get_bucket_summary('ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  'J1: available_hours is exactly allocated − reserved − consumed');

SELECT is(
  (SELECT count(*)::int FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  1, 'J1: the bucket is still ONE row per hour type');

SELECT is(
  (SELECT b.is_fixed_allocation FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  true, 'J1: is_fixed_allocation still passes through');

SELECT is(
  (SELECT b.annex_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  0::numeric, 'J1: a bucket with no annex reports 0 annex hours');

-- -----------------------------------------------------------------------------
-- [J2] TWO ALLOCATIONS OF EQUAL SIZE on one hour type — the assertion that fails
-- for any DISTINCT-based non-fix (100 + 100 must be 200, never 100).
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT b.allocated_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_equal'),
  200::numeric,
  'J2: two allocations of 100 h each sum to 200 — equal sizes are not duplicates');

SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_equal'),
  188::numeric, 'J2: available = 200 − 5 reserved − 7 consumed = 188');

SELECT is(
  (SELECT b.annex_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_equal'),
  100::numeric, 'J2: the equal-sized annex still reports its own 100 h');

-- -----------------------------------------------------------------------------
-- [J3] ANNEX allocations still add, and annex_hours is counted ONCE even though
-- both ledger rows hang off the annex allocation (was 100 before the fix).
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT b.allocated_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_annex'),
  90::numeric, 'J3: direct 40 + annex 50 = 90 allocated (was 140)');

SELECT is(
  (SELECT b.annex_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_annex'),
  50::numeric, 'J3: annex_hours counts the annex allocation once (was 100)');

SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_annex'),
  87::numeric, 'J3: available = 90 − 1 reserved − 2 consumed = 87');

-- -----------------------------------------------------------------------------
-- [J4] BOUNDARY — consumption to exactly zero, and just past it.
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_zero'),
  0::numeric, 'J4: 10 allocated − 10 consumed over two rows = exactly 0 available');

SELECT is(
  (SELECT b.allocated_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_zero'),
  10::numeric, 'J4: the exactly-zero bucket still reports its true 10 allocated');

SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_over'),
  -2::numeric, 'J4: 10 allocated − 12 consumed = −2 available, reported negative');

SELECT is(
  (SELECT b.available_hours < 0 FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_over'),
  true, 'J4: the over-budget bucket reads as over budget');

-- -----------------------------------------------------------------------------
-- [J5] reserved_hours and consumed_hours are UNCHANGED — they were already right,
-- so each is asserted both against its literal value and against a hand-computed
-- sum straight from the ledger.
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT b.reserved_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  10::numeric, 'J5: reserved_hours unchanged (10)');

SELECT is(
  (SELECT b.consumed_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  7::numeric, 'J5: consumed_hours unchanged — consumida 5 + penalizada 2 = 7');

SELECT is(
  (SELECT b.reserved_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_annex'),
  (SELECT COALESCE(SUM(l.hours), 0) FROM public.contract_hours_ledger l
    WHERE l.allocation_id IN ('ffffffff-7777-0000-0000-000000000004',
                              'ffffffff-7777-0000-0000-000000000005')
      AND l.status = 'reservada'),
  'J5: reserved_hours equals the ledger''s own sum for the annex bucket');

SELECT is(
  (SELECT b.consumed_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_annex'),
  (SELECT COALESCE(SUM(l.hours), 0) FROM public.contract_hours_ledger l
    WHERE l.allocation_id IN ('ffffffff-7777-0000-0000-000000000004',
                              'ffffffff-7777-0000-0000-000000000005')
      AND l.status IN ('consumida', 'penalizada')),
  'J5: consumed_hours equals the ledger''s own sum for the annex bucket');

SELECT is(
  (SELECT b.consumed_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_zero'),
  10::numeric, 'J5: consumed_hours sums both rows of the exactly-zero bucket (4 + 6)');

SELECT is(
  (SELECT b.reserved_hours + b.consumed_hours
     FROM public.get_bucket_summary('ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_fanout'),
  17::numeric,
  'J5: the 9 h devuelta row on the fan-out bucket is still ignored (10 + 7)');

-- -----------------------------------------------------------------------------
-- [J7] THE RESCHEDULE RPC now READS this function (one formula).
--
-- Bucket bs_rpc: 10 h allocated, 8 h already consumed over two rows, plus this
-- session's own 1.50 h reservation = the third row on the allocation.
--   repaired: available 0.50 → (0.50 + 1.50) = 2.00 < 3.00 → over budget TRUE
--   fanned out: allocated 30 → available 20.50 → (20.50 + 1.50) ≥ 3.00 → FALSE
-- so this assertion is exactly the case where the two formulas disagreed.
-- -----------------------------------------------------------------------------
INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date,
   start_time, end_time, modality, status, created_by, contrato_id, hour_type_key)
VALUES
  ('ffffffff-9999-0000-0000-000000000001', 9932,
   'ffffffff-3333-0000-0000-000000000001', 'Sesión de prueba buckets',
   DATE '2026-09-10', TIME '09:00', TIME '10:30', 'online', 'programada',
   tests.get_supabase_uid('bs_admin'), 'ffffffff-5555-0000-0000-000000000001',
   'bs_rpc');

INSERT INTO public.contract_hours_ledger
  (id, allocation_id, session_id, hours, status, session_date,
   recorded_by, planned_minutes_snapshot)
VALUES
  ('ffffffff-8888-0000-0000-000000000016', 'ffffffff-7777-0000-0000-000000000008',
   'ffffffff-9999-0000-0000-000000000001', 1.50, 'reservada', DATE '2026-09-10',
   tests.get_supabase_uid('bs_admin'), 90);

SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_rpc'),
  0.50::numeric, 'J7: the RPC bucket has 0.50 h available before the reschedule');

-- The route's own step: apply the new times, then call the RPC. 09:00–12:00 = 3 h.
UPDATE public.consultor_sessions
   SET end_time = TIME '12:00'
 WHERE id = 'ffffffff-9999-0000-0000-000000000001';

SELECT is(
  (SELECT (public.reschedule_session_hours(
             'ffffffff-9999-0000-0000-000000000001',
             tests.get_supabase_uid('bs_admin')) ->> 'is_over_budget')::boolean),
  true,
  'J7: the RPC flags over budget — the fanned-out formula would have said false');

SELECT is(
  (SELECT hours::text || '/' || is_over_budget::text
     FROM public.contract_hours_ledger
    WHERE id = 'ffffffff-8888-0000-0000-000000000016'),
  '3.00/true', 'J7: the ledger row carries the new hours and the flag');

-- And the pin 012 has always made, now structural rather than by restatement:
-- after the write the bucket is 10 − 8 − 3 = −1, i.e. available_hours < 0.
SELECT is(
  (SELECT b.available_hours FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_rpc'),
  -1.00::numeric, 'J7: after the write the bucket reports −1.00 available');

SELECT is(
  (SELECT b.available_hours < 0 FROM public.get_bucket_summary(
            'ffffffff-5555-0000-0000-000000000001') b
    WHERE b.hour_type_key = 'bs_rpc'),
  (SELECT is_over_budget FROM public.contract_hours_ledger
    WHERE id = 'ffffffff-8888-0000-0000-000000000016'),
  'J7: the RPC''s availability and get_bucket_summary agree in the fan-out case');

-- The RPC no longer carries its own copy of the formula.
SELECT ok(
  (SELECT prosrc LIKE '%get_bucket_summary%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reschedule_session_hours'),
  'J7: reschedule_session_hours calls get_bucket_summary by name');

SELECT ok(
  (SELECT prosrc NOT LIKE '%effective_allocations%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reschedule_session_hours'),
  'J7: no second copy of the availability formula survives in the RPC');

SELECT * FROM finish();
ROLLBACK;
