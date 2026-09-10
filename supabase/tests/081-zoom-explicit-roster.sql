-- =============================================================================
-- 081-zoom-explicit-roster.sql — FNE Zoom internal testing, Unit B2a (pgTAP)
--
-- Migration 20260910120000_zoom_explicit_roster.sql adds:
--   * public.session_roster_add_attendees(uuid, uuid[], uuid)     service_role
--   * public.session_roster_remove_attendees(uuid, uuid[], uuid)  service_role
--   * trg_enforce_operator_roster_approval_gate on consultor_sessions
--     (BEFORE INSERT OR UPDATE OF status, school_id, growth_community_id): an
--     operator session enters 'programada', or moves school/community while
--     scheduled, only with an eligible expected attendee;
--   * the operator exclusion in sync_session_attendees_on_gc_change (INSERT).
--
-- Sections: (A) catalog shape, ACLs, trigger census, unchanged RLS/policies/
-- table grants; (B) the role x operation grant matrix and preserved RLS reads;
-- (C) add; (D) remove, notification cancellation and injected-failure
-- atomicity; (E) the approval gate for single/bulk/insert/authenticated/
-- service_role writers, finance fields untouched, last-eligible removal,
-- revocation of the last participant, no re-scheduling of a revoked roster;
-- (F) the membership trigger for client/qa/operator; (G) school/community
-- changes of a scheduled session (single, bulk, NULL, same-value, metadata,
-- leaving the operator tenant, revocation afterwards).
--
-- NOT PROVEN HERE (by design): concurrency. One pgTAP transaction cannot hold a
-- lock against itself; scripts/ci/zoom-roster-concurrency-proof.mjs proves the
-- serialization point with real connections. Actual suppression of future
-- notifications depends on the B2b consumers reading the live roster and is
-- tested there; D only proves the atomic cancellation of scheduled rows.
--
-- FAIL-ON-OLD. Every call of a new function goes through pg_temp.svc (dynamic
-- SQL in an exception block) or pgTAP's lives_ok/throws_ok, and catalog probes
-- use to_regprocedure/pg_catalog joins, so on the pre-migration schema the file
-- reports controlled "not ok" lines instead of aborting.
--
-- Synthetic fixtures only (Ley 21.719): invented uuids (prefix b2a1), reserved
-- test domain, school ids 9811-9813. One transaction, ROLLBACK.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(141);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.u(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b2a10001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b2a10008-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.gc(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('b2a10007-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Run one statement as service_role; any error becomes {"error": SQLSTATE}.
CREATE OR REPLACE FUNCTION pg_temp.svc(p_sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
  EXECUTE p_sql INTO v;
  EXECUTE 'RESET ROLE';
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLSTATE);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.add(p_session uuid, p_users uuid[], p_actor uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.svc(format(
    'SELECT public.session_roster_add_attendees(%L::uuid, %L::uuid[], %L::uuid)',
    p_session, p_users, p_actor)) $$;

CREATE OR REPLACE FUNCTION pg_temp.rem(p_session uuid, p_users uuid[], p_actor uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.svc(format(
    'SELECT public.session_roster_remove_attendees(%L::uuid, %L::uuid[], %L::uuid)',
    p_session, p_users, p_actor)) $$;

-- ok|reason|added|reactivated|already_present
CREATE OR REPLACE FUNCTION pg_temp.addsum(v jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(v->>'ok', 'null') || '|' || coalesce(v->>'reason', v->>'error', 'null') || '|'
      || coalesce(v->>'added_count', '-') || '|' || coalesce(v->>'reactivated_count', '-') || '|'
      || coalesce(v->>'already_present_count', '-') $$;

-- ok|reason|removed|missing|cancelled
CREATE OR REPLACE FUNCTION pg_temp.remsum(v jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(v->>'ok', 'null') || '|' || coalesce(v->>'reason', v->>'error', 'null') || '|'
      || coalesce(v->>'removed_count', '-') || '|' || coalesce(v->>'missing_count', '-') || '|'
      || coalesce(v->>'cancelled_notification_count', '-') $$;

-- reason|user_ids (refusals)
CREATE OR REPLACE FUNCTION pg_temp.refusal(v jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(v->>'reason', v->>'error', 'null') || '|' || coalesce((v->'user_ids')::text, '-') $$;

CREATE OR REPLACE FUNCTION pg_temp.roster(p_session uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(sa.user_id::text, 2) || ':' || sa.expected, ',' ORDER BY sa.user_id), '')
    FROM public.session_attendees sa WHERE sa.session_id = p_session $$;

CREATE OR REPLACE FUNCTION pg_temp.notifs(p_session uuid, p_user uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(n.status, ',' ORDER BY n.status), '')
    FROM public.session_notifications n WHERE n.session_id = p_session AND n.user_id = p_user $$;

CREATE OR REPLACE FUNCTION pg_temp.edits(p_session uuid, p_change text) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer FROM public.session_activity_log l
   WHERE l.session_id = p_session AND l.action = 'edited' AND l.details->>'change' = p_change $$;

CREATE TEMP TABLE r (k text PRIMARY KEY, v jsonb);

-- Failure injection for the atomicity check (D): raises on activity-log
-- inserts only while the transaction-local setting b2a.inject = 'on'.
CREATE FUNCTION public.b2a_test_inject_audit_failure() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'b2a injected audit failure';
END;
$$;
CREATE TRIGGER b2a_test_inject_audit_failure
  BEFORE INSERT ON public.session_activity_log
  FOR EACH ROW
  WHEN (current_setting('b2a.inject', true) = 'on')
  EXECUTE FUNCTION public.b2a_test_inject_audit_failure();

-- -----------------------------------------------------------------------------
-- Fixtures (no statement names a new object, so they succeed on the old schema)
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('b2a_admin');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid('b2a_admin'), 'b2a-admin@test.local', 'B2A Admin', 'approved'
UNION ALL
SELECT pg_temp.u(n), 'b2a-member-' || n || '@test.local', 'B2A Synthetic Member', 'approved'
  FROM generate_series(1, 13) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name, tenant_kind, internal_zoom_testing_enabled)
VALUES (9811, 'B2A client school (pgTAP 081)', 'client', false),
       (9812, 'B2A operator school (pgTAP 081)', 'operator', true),
       (9813, 'B2A qa school (pgTAP 081)', 'qa', false);

INSERT INTO public.growth_communities (id, school_id, name)
VALUES (pg_temp.gc(1), 9811, 'B2A GC client'),
       (pg_temp.gc(2), 9812, 'B2A GC operator'),
       (pg_temp.gc(3), 9813, 'B2A GC qa'),
       (pg_temp.gc(4), 9812, 'B2A GC operator other'),
       (pg_temp.gc(5), 9812, 'B2A GC operator inactive member'),
       (pg_temp.gc(6), 9811, 'B2A GC client context'),
       (pg_temp.gc(7), 9813, 'B2A GC qa context');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (tests.get_supabase_uid('b2a_admin'), 'admin', NULL, NULL, true),
       (pg_temp.u(1), 'docente', 9812, pg_temp.gc(2), true),
       (pg_temp.u(2), 'docente', 9812, pg_temp.gc(2), true),
       (pg_temp.u(3), 'docente', 9812, pg_temp.gc(2), true),
       (pg_temp.u(4), 'docente', 9812, pg_temp.gc(2), false),
       (pg_temp.u(5), 'docente', 9812, pg_temp.gc(2), NULL),
       (pg_temp.u(6), 'docente', 9812, pg_temp.gc(4), true),
       (pg_temp.u(7), 'docente', 9811, pg_temp.gc(1), true),
       (pg_temp.u(8), 'docente', 9813, pg_temp.gc(3), true),
       (pg_temp.u(9), 'docente', 9812, pg_temp.gc(2), true),
       (pg_temp.u(13), 'docente', 9812, pg_temp.gc(2), true),
       (pg_temp.u(2), 'docente', 9812, pg_temp.gc(5), false);

INSERT INTO public.clientes
  (id, nombre_legal, nombre_fantasia, rut, direccion,
   nombre_representante, rut_representante, fecha_escritura, nombre_notario)
VALUES ('b2a10002-0000-4000-8000-000000000001', 'Cliente B2A SpA', 'Cliente B2A',
        '76.081.100-1', 'Calle Sintética 81', 'Representante B2A', '81.100.100-1',
        DATE '2026-01-01', 'Notaría Sintética');
INSERT INTO public.contratos (id, numero_contrato, fecha_contrato, cliente_id)
VALUES ('b2a10003-0000-4000-8000-000000000001', 'CT-B2A-081-001', DATE '2026-01-02',
        'b2a10002-0000-4000-8000-000000000001');
INSERT INTO public.hour_types (id, key, display_name, modality)
VALUES ('b2a10004-0000-4000-8000-000000000001', 'b2a_online', 'B2A online', 'online');
INSERT INTO public.contract_hour_allocations
  (id, contrato_id, hour_type_id, allocated_hours, created_by)
VALUES ('b2a10005-0000-4000-8000-000000000001', 'b2a10003-0000-4000-8000-000000000001',
        'b2a10004-0000-4000-8000-000000000001', 20, tests.get_supabase_uid('b2a_admin'));

-- Sessions: (n, school, gc, status). All future-dated unless noted.
INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
SELECT pg_temp.s(x.n), x.school, pg_temp.gc(x.gc), 'B2A session ' || x.n,
       CURRENT_DATE + 30, '10:00', '11:00', 'online', x.status,
       tests.get_supabase_uid('b2a_admin')
  FROM (VALUES
    (1, 9812, 2, 'borrador'),               -- op add/remove
    (2, 9812, 2, 'pendiente_aprobacion'),   -- op add while pending
    (3, 9812, 2, 'borrador'),               -- op status refusals
    (4, 9812, 2, 'borrador'),               -- op inactive session
    (5, 9811, 1, 'borrador'),               -- client add
    (6, 9812, 2, 'borrador'),               -- op empty approval
    (7, 9812, 2, 'borrador'),               -- op false-only roster
    (8, 9812, 2, 'borrador'),               -- op roster of an inactive member
    (9, 9812, 2, 'borrador'),               -- op valid roster
    (10, 9811, 1, 'borrador'),              -- client empty approval
    (11, 9813, 3, 'borrador'),              -- qa empty approval
    (12, 9812, 2, 'borrador'),              -- op other transitions
    (14, 9812, 2, 'borrador'),              -- bulk op valid
    (15, 9812, 2, 'borrador'),              -- bulk op empty
    (16, 9812, 2, 'borrador'),              -- authenticated op empty
    (17, 9812, 2, 'borrador'),              -- authenticated op valid
    (18, 9812, 2, 'borrador'),              -- service_role op empty
    (20, 9812, 2, 'borrador'),              -- injected failure
    (21, 9812, 2, 'borrador'),              -- facilitator who is also attendee
    (23, 9812, 2, 'borrador'),              -- add while creation switch is off
    (25, 9811, 6, 'programada'),            -- G scheduled client, empty
    (26, 9813, 7, 'programada'),            -- G scheduled qa, empty
    (27, 9812, 2, 'borrador'),              -- G scheduled op (below), wrong/inactive/NULL community
    (28, 9812, 2, 'borrador'),              -- G scheduled op (below), valid new community
    (29, 9811, 6, 'programada'),            -- G scheduled client, eligible operator attendee
    (30, 9811, 6, 'programada')             -- G scheduled client, empty (bulk)
  ) AS x(n, school, gc, status);

-- Client bulk session carrying finance classification, plus its ledger row.
INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by, contrato_id, hour_type_key)
VALUES (pg_temp.s(13), 9811, pg_temp.gc(1), 'B2A session 13', CURRENT_DATE + 30,
        '10:00', '11:00', 'online', 'borrador', tests.get_supabase_uid('b2a_admin'),
        'b2a10003-0000-4000-8000-000000000001', 'b2a_online');
INSERT INTO public.contract_hours_ledger
  (allocation_id, session_id, hours, status, session_date, recorded_by,
   is_over_budget, is_manual, planned_minutes_snapshot)
VALUES ('b2a10005-0000-4000-8000-000000000001', pg_temp.s(13), 1, 'reservada',
        CURRENT_DATE + 30, tests.get_supabase_uid('b2a_admin'), false, false, 60);

-- Past scheduled client session (membership trigger date filter).
INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time,
   modality, status, created_by)
VALUES (pg_temp.s(19), 9811, pg_temp.gc(1), 'B2A session 19', CURRENT_DATE - 1,
        '10:00', '11:00', 'online', 'programada', tests.get_supabase_uid('b2a_admin'));

UPDATE public.consultor_sessions SET is_active = false WHERE id = pg_temp.s(4);

INSERT INTO public.session_attendees (session_id, user_id, expected)
VALUES (pg_temp.s(7), pg_temp.u(1), false),
       (pg_temp.s(8), pg_temp.u(4), true),
       (pg_temp.s(9), pg_temp.u(1), true),
       (pg_temp.s(9), pg_temp.u(2), true),
       (pg_temp.s(14), pg_temp.u(1), true),
       (pg_temp.s(17), pg_temp.u(3), true),
       (pg_temp.s(20), pg_temp.u(13), true),
       (pg_temp.s(21), pg_temp.u(9), true),
       (pg_temp.s(27), pg_temp.u(2), true),
       (pg_temp.s(28), pg_temp.u(2), true),
       (pg_temp.s(28), pg_temp.u(6), true),
       (pg_temp.s(29), pg_temp.u(9), true);

-- Eligible rosters (u2 in gc2), so these approvals pass on every schema.
UPDATE public.consultor_sessions SET status = 'programada' WHERE id IN (pg_temp.s(27), pg_temp.s(28));

INSERT INTO public.session_facilitators (session_id, user_id, facilitator_role, is_lead)
VALUES (pg_temp.s(21), pg_temp.u(9), 'equipo_interno', true);

INSERT INTO public.session_notifications
  (session_id, user_id, notification_type, channel, scheduled_for, status)
VALUES (pg_temp.s(1), pg_temp.u(1), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled'),
       (pg_temp.s(1), pg_temp.u(1), 'session_created', 'email', now(), 'sent'),
       (pg_temp.s(1), pg_temp.u(1), 'session_reminder_1w', 'email', now(), 'failed'),
       (pg_temp.s(1), pg_temp.u(2), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled'),
       (pg_temp.s(2), pg_temp.u(1), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled'),
       (pg_temp.s(9), pg_temp.u(1), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled'),
       (pg_temp.s(9), pg_temp.u(2), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled'),
       (pg_temp.s(20), pg_temp.u(13), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled'),
       (pg_temp.s(21), pg_temp.u(9), 'session_reminder_24h', 'email', now() + interval '29 days', 'scheduled');

-- =============================================================================
-- A. Catalog
-- =============================================================================
SELECT ok(to_regprocedure('public.session_roster_add_attendees(uuid,uuid[],uuid)') IS NOT NULL,
  'A1 session_roster_add_attendees(uuid, uuid[], uuid) exists');
SELECT ok(to_regprocedure('public.session_roster_remove_attendees(uuid,uuid[],uuid)') IS NOT NULL,
  'A2 session_roster_remove_attendees(uuid, uuid[], uuid) exists');
SELECT ok(to_regprocedure('public.enforce_operator_roster_approval_gate()') IS NOT NULL,
  'A3 enforce_operator_roster_approval_gate() exists');

SELECT is((SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
             || '|' || p.provolatile::text || '|' || l.lanname
             FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
            WHERE p.oid = to_regprocedure('public.session_roster_add_attendees(uuid,uuid[],uuid)')),
  'false|search_path=""|v|plpgsql',
  'A4 add RPC: SECURITY INVOKER, empty search_path, volatile plpgsql');
SELECT is((SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
             || '|' || p.provolatile::text || '|' || l.lanname
             FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
            WHERE p.oid = to_regprocedure('public.session_roster_remove_attendees(uuid,uuid[],uuid)')),
  'false|search_path=""|v|plpgsql',
  'A5 remove RPC: SECURITY INVOKER, empty search_path, volatile plpgsql');
SELECT is((SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
             || '|' || p.provolatile::text
             FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure('public.enforce_operator_roster_approval_gate()')),
  'true|search_path=""|v',
  'A6 gate: SECURITY DEFINER, empty search_path, volatile (fresh statement snapshots)');
SELECT is((SELECT p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
             FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure('public.sync_session_attendees_on_gc_change()')),
  'true|search_path=""',
  'A7 membership trigger function stays SECURITY DEFINER, now with an empty search_path');
SELECT is((SELECT p.proacl::text FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure('public.sync_session_attendees_on_gc_change()')),
  '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
  'A8 membership trigger function ACL is unchanged from the baseline');
SELECT is((SELECT p.proacl::text FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure('public.session_roster_add_attendees(uuid,uuid[],uuid)')),
  '{postgres=X/postgres,service_role=X/postgres}',
  'A9 add RPC ACL: owner + service_role only (no PUBLIC, anon, authenticated)');
SELECT is((SELECT p.proacl::text FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure('public.session_roster_remove_attendees(uuid,uuid[],uuid)')),
  '{postgres=X/postgres,service_role=X/postgres}',
  'A10 remove RPC ACL: owner + service_role only (no PUBLIC, anon, authenticated)');
SELECT is((SELECT p.proacl::text FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure('public.enforce_operator_roster_approval_gate()')),
  '{postgres=X/postgres,service_role=X/postgres}',
  'A11 gate ACL: no PUBLIC, anon, authenticated');
SELECT is((SELECT pg_catalog.pg_get_triggerdef(t.oid) FROM pg_catalog.pg_trigger t
            WHERE t.tgrelid = 'public.consultor_sessions'::regclass
              AND t.tgname = 'trg_enforce_operator_roster_approval_gate'),
  'CREATE TRIGGER trg_enforce_operator_roster_approval_gate BEFORE INSERT OR UPDATE OF status, school_id, growth_community_id ON public.consultor_sessions FOR EACH ROW EXECUTE FUNCTION enforce_operator_roster_approval_gate()',
  'A12 gate trigger: BEFORE INSERT OR UPDATE OF status, school_id, growth_community_id, row level');
SELECT is((SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) FROM pg_catalog.pg_trigger t
            WHERE t.tgrelid = 'public.consultor_sessions'::regclass AND NOT t.tgisinternal),
  'trg_consultor_sessions_updated_at,trg_enforce_operator_roster_approval_gate,trg_enforce_operator_session_tenant_guard',
  'A13 consultor_sessions trigger census (plus the gate only)');
SELECT is((SELECT pg_catalog.pg_get_triggerdef(t.oid) FROM pg_catalog.pg_trigger t
            WHERE t.tgrelid = 'public.user_roles'::regclass
              AND t.tgname = 'trg_sync_session_attendees_on_gc_change'),
  'CREATE TRIGGER trg_sync_session_attendees_on_gc_change AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION sync_session_attendees_on_gc_change()',
  'A14 membership trigger definition unchanged');
SELECT tests.rls_enabled('public', 'session_attendees');
SELECT tests.rls_enabled('public', 'session_notifications');
SELECT tests.rls_enabled('public', 'consultor_sessions');
SELECT tests.rls_enabled('public', 'user_roles');
SELECT is((SELECT string_agg(c.relname || '=' || (SELECT count(*) FROM pg_catalog.pg_policy p
                                                   WHERE p.polrelid = c.oid), ',' ORDER BY c.relname)
             FROM pg_catalog.pg_class c
            WHERE c.oid IN ('public.consultor_sessions'::regclass, 'public.session_activity_log'::regclass,
                            'public.session_attendees'::regclass, 'public.session_notifications'::regclass,
                            'public.user_roles'::regclass)),
  'consultor_sessions=5,session_activity_log=3,session_attendees=9,session_notifications=3,user_roles=5',
  'A19 policy census unchanged on the five touched tables');
SELECT is((SELECT string_agg(g.grantee || ':' || g.privs, ';' ORDER BY g.grantee)
             FROM (SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
                     FROM information_schema.role_table_grants
                    WHERE table_schema = 'public' AND table_name = 'session_attendees'
                      AND grantee IN ('anon', 'authenticated', 'service_role')
                    GROUP BY grantee) g),
  'anon:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE;authenticated:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE;service_role:DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
  'A20 session_attendees table privileges unchanged');

-- =============================================================================
-- B. Grant matrix and preserved RLS reads
-- =============================================================================
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.session_roster_add_attendees('b2a10008-0000-4000-8000-000000000001', ARRAY['b2a10001-0000-4000-8000-000000000003']::uuid[], 'b2a10001-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'B1 anon cannot execute the add RPC');
SELECT throws_ok($$SELECT public.session_roster_remove_attendees('b2a10008-0000-4000-8000-000000000009', ARRAY['b2a10001-0000-4000-8000-000000000001']::uuid[], 'b2a10001-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'B2 anon cannot execute the remove RPC');
SELECT is((SELECT count(*)::integer FROM public.session_attendees
            WHERE session_id = 'b2a10008-0000-4000-8000-000000000009'), 0,
  'B3 anon still reads no roster rows (RLS unchanged)');
RESET ROLE;

SELECT tests.authenticate_as('b2a_admin');
SELECT throws_ok($$SELECT public.session_roster_add_attendees('b2a10008-0000-4000-8000-000000000001', ARRAY['b2a10001-0000-4000-8000-000000000003']::uuid[], 'b2a10001-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'B4 an authenticated application admin cannot execute the add RPC (actor bypass closed)');
SELECT throws_ok($$SELECT public.session_roster_remove_attendees('b2a10008-0000-4000-8000-000000000009', ARRAY['b2a10001-0000-4000-8000-000000000001']::uuid[], 'b2a10001-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'B5 an authenticated application admin cannot execute the remove RPC');
SELECT is((SELECT count(*)::integer FROM public.session_attendees
            WHERE session_id = 'b2a10008-0000-4000-8000-000000000009'), 2,
  'B6 an authenticated admin still reads the roster through the existing policies');
RESET ROLE;

-- =============================================================================
-- C. Add
-- =============================================================================
INSERT INTO r VALUES ('c1', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(1), pg_temp.u(2), pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.addsum((SELECT v FROM r WHERE k = 'c1')), 'true|ok|2|0|0',
  'C1 valid add of two active members (one duplicated in the request) succeeds');
SELECT is((SELECT v->'added_user_ids' FROM r WHERE k = 'c1'),
  jsonb_build_array(pg_temp.u(1), pg_temp.u(2)),
  'C2 add reports the deduplicated added ids');
SELECT is(pg_temp.roster(pg_temp.s(1)), '01:true,02:true', 'C3 two expected rows exist');
SELECT is(pg_temp.edits(pg_temp.s(1), 'roster_attendees_added'), 1,
  'C4 one edited activity row with structural details');

INSERT INTO r VALUES ('c5', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(2), pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.addsum((SELECT v FROM r WHERE k = 'c5')), 'true|ok|0|0|2', 'C5 repeated add is an idempotent no-op');
SELECT is((SELECT count(*)::integer FROM public.session_activity_log WHERE session_id = pg_temp.s(1)), 1,
  'C6 the no-op add wrote no activity row');

INSERT INTO r VALUES ('c7', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(3), pg_temp.u(4)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c7')), 'invalid_attendees|["' || pg_temp.u(4) || '"]',
  'C7 a batch with one inactive member is refused, naming only the invalid id');
SELECT is(pg_temp.roster(pg_temp.s(1)) || '|' || (SELECT count(*) FROM public.session_activity_log WHERE session_id = pg_temp.s(1)),
  '01:true,02:true|1', 'C8 the refused batch wrote no row and no audit (valid member not added)');
INSERT INTO r VALUES ('c9', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(5)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c9')), 'invalid_attendees|["' || pg_temp.u(5) || '"]',
  'C9 is_active NULL is not an active member');
INSERT INTO r VALUES ('c10', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(6)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c10')), 'invalid_attendees|["' || pg_temp.u(6) || '"]',
  'C10 an active member of another community of the same school is refused');
INSERT INTO r VALUES ('c11', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(99)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c11')), 'invalid_attendees|["' || pg_temp.u(99) || '"]',
  'C11 a nonexistent user is refused');
INSERT INTO r VALUES ('c12', pg_temp.add(pg_temp.s(99), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c12')), 'session_not_found|-', 'C12 nonexistent session');
INSERT INTO r VALUES ('c13', pg_temp.add(NULL, ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c13')), 'invalid_request|-', 'C13 NULL session id');
INSERT INTO r VALUES ('c14', pg_temp.add(pg_temp.s(1), '{}'::uuid[], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c14')), 'invalid_request|-', 'C14 empty user list');
INSERT INTO r VALUES ('c15', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(1), NULL], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c15')), 'invalid_request|-', 'C15 a NULL element');
INSERT INTO r VALUES ('c16', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(3)], pg_temp.u(99)));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c16')), 'invalid_actor|-', 'C16 an actor without a profile');
INSERT INTO r VALUES ('c17', pg_temp.add(pg_temp.s(1), ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 201)), tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c17')), 'too_many_attendees|-', 'C17 more than 200 distinct users');

UPDATE public.consultor_sessions SET status = 'en_progreso' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('c18', pg_temp.add(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT (v->>'reason') || '|' || (v->>'session_status') FROM r WHERE k = 'c18'),
  'session_status_not_editable|en_progreso', 'C18 add refused while en_progreso');
UPDATE public.consultor_sessions SET status = 'pendiente_informe' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('c19', pg_temp.add(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT (v->>'reason') || '|' || (v->>'session_status') FROM r WHERE k = 'c19'),
  'session_status_not_editable|pendiente_informe', 'C19 add refused while pendiente_informe');
UPDATE public.consultor_sessions SET status = 'completada' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('c20', pg_temp.add(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT (v->>'reason') || '|' || (v->>'session_status') FROM r WHERE k = 'c20'),
  'session_status_not_editable|completada', 'C20 add refused when completada');
UPDATE public.consultor_sessions SET status = 'cancelada' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('c21', pg_temp.add(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT (v->>'reason') || '|' || (v->>'session_status') FROM r WHERE k = 'c21'),
  'session_status_not_editable|cancelada', 'C21 add refused when cancelada');
SELECT is(pg_temp.roster(pg_temp.s(3)) || '|' || (SELECT count(*) FROM public.session_activity_log WHERE session_id = pg_temp.s(3)),
  '|0', 'C22 status refusals wrote nothing');

INSERT INTO r VALUES ('c23', pg_temp.add(pg_temp.s(2), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.addsum((SELECT v FROM r WHERE k = 'c23')), 'true|ok|1|0|0', 'C23 add allowed while pendiente_aprobacion');
INSERT INTO r VALUES ('c24', pg_temp.add(pg_temp.s(4), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c24')), 'session_inactive|-', 'C24 add refused on an inactive session');
INSERT INTO r VALUES ('c25', pg_temp.add(pg_temp.s(5), ARRAY[pg_temp.u(7)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.addsum((SELECT v FROM r WHERE k = 'c25')), 'true|ok|1|0|0', 'C25 add works for a client session too');

UPDATE public.session_attendees SET expected = false WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('c26', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.addsum((SELECT v FROM r WHERE k = 'c26')), 'true|ok|0|1|0',
  'C26 re-adding an evidence-free de-selected row reactivates it');
SELECT is(pg_temp.roster(pg_temp.s(1)), '01:true,02:true', 'C27 the reactivated row is expected again');
SELECT is(pg_temp.edits(pg_temp.s(1), 'roster_attendees_added'), 2, 'C28 the reactivation is audited');

UPDATE public.session_attendees SET expected = false, attended = false WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('c29', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(1), pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c29')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'C29 a de-selected row with attended = false is never reactivated (batch refused)');
SELECT is((SELECT expected::text || '|' || attended::text FROM public.session_attendees
            WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2)), 'false|false',
  'C30 the recorded row is untouched');
UPDATE public.session_attendees SET attended = true WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('c31', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c31')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'C31 attended = true is evidence too');
UPDATE public.session_attendees SET attended = NULL, notes = 'synthetic note' WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('c32', pg_temp.add(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'c32')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'C32 notes alone are evidence');
SELECT is(pg_temp.edits(pg_temp.s(1), 'roster_attendees_added'), 2, 'C33 evidence refusals wrote no audit');

UPDATE public.schools SET internal_zoom_testing_enabled = false WHERE id = 9812;
INSERT INTO r VALUES ('c34', pg_temp.add(pg_temp.s(23), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.addsum((SELECT v FROM r WHERE k = 'c34')), 'true|ok|1|0|0',
  'C34 the insertion-only creation switch does not stop roster maintenance');
UPDATE public.schools SET internal_zoom_testing_enabled = true WHERE id = 9812;

UPDATE public.session_attendees SET expected = true, notes = NULL WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);

-- =============================================================================
-- D. Remove
-- =============================================================================
INSERT INTO r VALUES ('d1', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(1), pg_temp.u(12)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.remsum((SELECT v FROM r WHERE k = 'd1')), 'true|ok|1|1|1',
  'D1 removal of one attendee plus one non-attendee: 1 removed, 1 missing, 1 notification cancelled');
SELECT is((SELECT (v->'removed_user_ids')::text || '|' || (v->'missing_user_ids')::text FROM r WHERE k = 'd1'),
  '["' || pg_temp.u(1) || '"]|["' || pg_temp.u(12) || '"]', 'D2 removed and missing ids reported');
SELECT is(pg_temp.roster(pg_temp.s(1)), '02:true', 'D3 the removed row is hard-deleted');
SELECT is(pg_temp.notifs(pg_temp.s(1), pg_temp.u(1)), 'cancelled,failed,sent',
  'D4 scheduled notification cancelled; sent and failed history retained');
SELECT is(pg_temp.notifs(pg_temp.s(2), pg_temp.u(1)) || '|' || pg_temp.notifs(pg_temp.s(1), pg_temp.u(2)), 'scheduled|scheduled',
  'D5 other sessions and other attendees keep their scheduled notifications');
SELECT is((SELECT count(*)::text || '|' || max(details->>'cancelled_notification_count') FROM public.session_activity_log
            WHERE session_id = pg_temp.s(1) AND action = 'edited' AND details->>'change' = 'roster_attendees_removed'),
  '1|1', 'D6 removal audited once with the structural cancellation count');
INSERT INTO r VALUES ('d7', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.remsum((SELECT v FROM r WHERE k = 'd7')), 'true|ok|0|1|0', 'D7 removing a missing attendee is idempotent');
SELECT is(pg_temp.edits(pg_temp.s(1), 'roster_attendees_removed'), 1, 'D8 the no-op removal wrote no audit');

UPDATE public.session_attendees SET attended = false WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('d9', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'd9')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'D9 attended = false is never erased');
SELECT is((SELECT expected::text || '|' || attended::text FROM public.session_attendees
            WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2)) || '|' || pg_temp.notifs(pg_temp.s(1), pg_temp.u(2)),
  'true|false|scheduled', 'D10 refused removal kept the row and the scheduled notification');
UPDATE public.session_attendees SET attended = true WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('d11', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'd11')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'D11 attended = true is never erased');
UPDATE public.session_attendees SET attended = NULL, marked_by = tests.get_supabase_uid('b2a_admin'), marked_at = now()
 WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('d12', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'd12')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'D12 a marker without a value is evidence');
UPDATE public.session_attendees SET marked_by = NULL, marked_at = NULL, arrival_status = 'late'
 WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('d13', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'd13')), 'attendance_evidence_present|["' || pg_temp.u(2) || '"]',
  'D13 an arrival status is evidence');
UPDATE public.session_attendees SET arrival_status = NULL WHERE session_id = pg_temp.s(1) AND user_id = pg_temp.u(2);
INSERT INTO r VALUES ('d14', pg_temp.rem(pg_temp.s(1), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.remsum((SELECT v FROM r WHERE k = 'd14')), 'true|ok|1|0|1', 'D14 the last attendee of a draft can be removed');
SELECT is(pg_temp.roster(pg_temp.s(1)), '', 'D15 a draft roster can become empty');

UPDATE public.consultor_sessions SET status = 'en_progreso' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('d16', pg_temp.rem(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT v->>'reason' FROM r WHERE k = 'd16'), 'session_status_not_editable', 'D16 removal refused while en_progreso');
UPDATE public.consultor_sessions SET status = 'pendiente_informe' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('d17', pg_temp.rem(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT v->>'reason' FROM r WHERE k = 'd17'), 'session_status_not_editable', 'D17 removal refused while pendiente_informe');
UPDATE public.consultor_sessions SET status = 'completada' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('d18', pg_temp.rem(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT v->>'reason' FROM r WHERE k = 'd18'), 'session_status_not_editable', 'D18 removal refused when completada');
UPDATE public.consultor_sessions SET status = 'cancelada' WHERE id = pg_temp.s(3);
INSERT INTO r VALUES ('d19', pg_temp.rem(pg_temp.s(3), ARRAY[pg_temp.u(3)], tests.get_supabase_uid('b2a_admin')));
SELECT is((SELECT v->>'reason' FROM r WHERE k = 'd19'), 'session_status_not_editable', 'D19 removal refused when cancelada');

SELECT set_config('b2a.inject', 'on', true);
INSERT INTO r VALUES ('d20', pg_temp.rem(pg_temp.s(20), ARRAY[pg_temp.u(13)], tests.get_supabase_uid('b2a_admin')));
SELECT set_config('b2a.inject', 'off', true);
SELECT is((SELECT v->>'error' FROM r WHERE k = 'd20'), 'P0001', 'D20 an injected failure after delete + cancel aborts the call');
SELECT is(pg_temp.roster(pg_temp.s(20)) || '|' || pg_temp.notifs(pg_temp.s(20), pg_temp.u(13)), '13:true|scheduled',
  'D21 nothing partial: row and scheduled notification both survive the failed call');
SELECT is((SELECT count(*)::integer FROM public.session_activity_log WHERE session_id = pg_temp.s(20)), 0,
  'D22 and no audit row');

INSERT INTO r VALUES ('d23', pg_temp.rem(pg_temp.s(21), ARRAY[pg_temp.u(9)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.remsum((SELECT v FROM r WHERE k = 'd23')), 'true|ok|1|0|0',
  'D23 removing an attendee who is also a facilitator cancels none of their notifications');
SELECT is(pg_temp.notifs(pg_temp.s(21), pg_temp.u(9)), 'scheduled', 'D24 the facilitator keeps the scheduled notification');
INSERT INTO r VALUES ('d25', pg_temp.rem(pg_temp.s(4), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'd25')), 'session_inactive|-', 'D25 removal refused on an inactive session');
INSERT INTO r VALUES ('d26', pg_temp.rem(pg_temp.s(99), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'd26')), 'session_not_found|-', 'D26 removal on a nonexistent session');

-- =============================================================================
-- E. Approval gate
-- =============================================================================
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000006'$$,
  '23514', 'operator roster gate: an operator session needs at least one expected attendee who is an active member of its growth community before it can be scheduled',
  'E1 single approval of an empty operator session is refused');
SELECT is((SELECT status FROM public.consultor_sessions WHERE id = pg_temp.s(6)), 'borrador', 'E2 its status is unchanged');
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000007'$$,
  '23514', NULL, 'E3 a roster of only expected = false rows cannot be approved');
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000008'$$,
  '23514', NULL, 'E4 an expected attendee whose membership is inactive is not eligible');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000009'$$,
  'E5 an operator session with an eligible roster is approved');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000010'$$,
  'E6 a client session with an empty roster is approved exactly as before');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000011'$$,
  'E7 a qa session with an empty roster is approved exactly as before');
SELECT is((SELECT string_agg(status, ',' ORDER BY id) FROM public.consultor_sessions WHERE id IN (pg_temp.s(9), pg_temp.s(10), pg_temp.s(11))),
  'programada,programada,programada', 'E8 the three approvals committed their status');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time, modality, status, created_by)
  VALUES ('b2a10008-0000-4000-8000-000000000022', 9812, 'b2a10007-0000-4000-8000-000000000002', 'B2A session 22',
          CURRENT_DATE + 30, '10:00', '11:00', 'online', 'programada',
          (SELECT id FROM public.profiles WHERE email = 'b2a-admin@test.local'))$$,
  '23514', 'operator roster gate: an operator session needs at least one expected attendee who is an active member of its growth community before it can be scheduled',
  'E9 an operator session cannot be inserted already programada');
SELECT is((SELECT count(*)::integer FROM public.consultor_sessions WHERE id = pg_temp.s(22)), 0, 'E10 nothing was inserted');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'pendiente_aprobacion' WHERE id = 'b2a10008-0000-4000-8000-000000000012'$$,
  'E11 other transitions of an empty operator session are not gated (pendiente_aprobacion)');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'cancelada' WHERE id = 'b2a10008-0000-4000-8000-000000000012'$$,
  'E12 other transitions of an empty operator session are not gated (cancelada)');

SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada'
  WHERE id IN ('b2a10008-0000-4000-8000-000000000013', 'b2a10008-0000-4000-8000-000000000014', 'b2a10008-0000-4000-8000-000000000015')$$,
  '23514', NULL, 'E13 a bulk status UPDATE with one empty operator session is refused');
SELECT is((SELECT string_agg(status, ',' ORDER BY id) FROM public.consultor_sessions WHERE id IN (pg_temp.s(13), pg_temp.s(14), pg_temp.s(15))),
  'borrador,borrador,borrador', 'E14 every status change of the refused bulk UPDATE rolled back (client and valid operator too)');
SELECT is((SELECT cs.contrato_id::text || '|' || cs.hour_type_key || '|' || l.status || '|' || l.hours::text
             FROM public.consultor_sessions cs JOIN public.contract_hours_ledger l ON l.session_id = cs.id
            WHERE cs.id = pg_temp.s(13)),
  'b2a10003-0000-4000-8000-000000000001|b2a_online|reservada|1.00', 'E15 client finance fields and ledger row untouched');

-- An authenticated UPDATE of consultor_sessions is not a supported path today:
-- the existing policies raise 42P17 (infinite recursion) for any column, with
-- or without this migration. The authenticated writer is therefore exercised
-- through INSERT, which the existing policies allow for an admin (see 063).
SELECT tests.authenticate_as('b2a_admin');
SELECT throws_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time, modality, status, created_by)
  VALUES ('b2a10008-0000-4000-8000-000000000016', 9812, 'b2a10007-0000-4000-8000-000000000002', 'B2A session 16b',
          CURRENT_DATE + 31, '10:00', '11:00', 'online', 'programada', auth.uid())$$,
  '23514', 'operator roster gate: an operator session needs at least one expected attendee who is an active member of its growth community before it can be scheduled',
  'E16 the gate binds an RLS-bound authenticated admin too (EXECUTE revoked, trigger still fires)');
SELECT lives_ok($$INSERT INTO public.consultor_sessions
  (id, school_id, growth_community_id, title, session_date, start_time, end_time, modality, status, created_by)
  VALUES ('b2a10008-0000-4000-8000-000000000024', 9811, 'b2a10007-0000-4000-8000-000000000001', 'B2A session 24',
          CURRENT_DATE + 31, '10:00', '11:00', 'online', 'programada', auth.uid())$$,
  'E17 an authenticated admin still inserts a client session already programada (gate inert for client)');
RESET ROLE;
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000017'$$,
  'E18 an operator session with an eligible roster is scheduled (fixture for F)');
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000018'$$,
  '23514', NULL, 'E19 service_role cannot schedule an empty operator session directly');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.contract_hours_ledger l JOIN public.consultor_sessions cs ON cs.id = l.session_id
            WHERE cs.school_id = 9812), 0, 'E20 no ledger row exists for any operator session');

INSERT INTO r VALUES ('e21', pg_temp.rem(pg_temp.s(9), ARRAY[pg_temp.u(1), pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'e21')),
  'last_eligible_attendee|["' || pg_temp.u(1) || '", "' || pg_temp.u(2) || '"]',
  'E21 removing every eligible attendee of a scheduled operator session is refused');
SELECT is(pg_temp.roster(pg_temp.s(9)) || '|' || pg_temp.notifs(pg_temp.s(9), pg_temp.u(1)) || '|' || pg_temp.notifs(pg_temp.s(9), pg_temp.u(2)),
  '01:true,02:true|scheduled|scheduled', 'E22 the refusal is atomic: rows and notifications kept');
INSERT INTO r VALUES ('e23', pg_temp.rem(pg_temp.s(9), ARRAY[pg_temp.u(2)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.remsum((SELECT v FROM r WHERE k = 'e23')), 'true|ok|1|0|1', 'E23 a non-last removal from a scheduled operator session succeeds');
INSERT INTO r VALUES ('e24', pg_temp.rem(pg_temp.s(9), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.refusal((SELECT v FROM r WHERE k = 'e24')), 'last_eligible_attendee|["' || pg_temp.u(1) || '"]',
  'E24 the now-last eligible attendee cannot be removed');
SELECT lives_ok($$UPDATE public.user_roles SET is_active = false
  WHERE user_id = 'b2a10001-0000-4000-8000-000000000001' AND community_id = 'b2a10007-0000-4000-8000-000000000002'$$,
  'E25 membership revocation of the last participant of a scheduled operator session is allowed');
SELECT is((SELECT expected::text FROM public.session_attendees WHERE session_id = pg_temp.s(9) AND user_id = pg_temp.u(1))
          || '|' || pg_temp.notifs(pg_temp.s(9), pg_temp.u(1))
          || '|' || (SELECT status FROM public.consultor_sessions WHERE id = pg_temp.s(9)),
  'false|cancelled|programada', 'E26 revocation expired the attendee and cancelled the notification; session stays scheduled');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000009'$$,
  'E27 re-writing programada on a scheduled session is not a transition and is not gated');
INSERT INTO r VALUES ('e28', pg_temp.rem(pg_temp.s(9), ARRAY[pg_temp.u(1)], tests.get_supabase_uid('b2a_admin')));
SELECT is(pg_temp.remsum((SELECT v FROM r WHERE k = 'e28')), 'true|ok|1|0|0',
  'E28 a revoked roster (no eligible attendee left) can still be cleaned up');
UPDATE public.consultor_sessions SET status = 'en_progreso' WHERE id = pg_temp.s(9);
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada' WHERE id = 'b2a10008-0000-4000-8000-000000000009'$$,
  '23514', NULL, 'E29 a session without an eligible roster cannot enter programada again');

-- =============================================================================
-- F. Membership trigger
-- =============================================================================
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (pg_temp.u(10), 'docente', 9811, pg_temp.gc(1), true);
SELECT is(pg_temp.roster(pg_temp.s(10)), '10:true', 'F1 a new client community member is auto-added to a future scheduled client session');
SELECT is(pg_temp.roster(pg_temp.s(19)), '', 'F2 but not to a past one (baseline date filter preserved)');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (pg_temp.u(11), 'docente', 9813, pg_temp.gc(3), true);
SELECT is(pg_temp.roster(pg_temp.s(11)), '11:true', 'F3 a new qa community member is auto-added as before');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (pg_temp.u(12), 'docente', 9812, pg_temp.gc(2), true);
SELECT is(pg_temp.roster(pg_temp.s(17)), '03:true', 'F4 a new operator community member is NOT selected; the selected attendee remains');
UPDATE public.schools SET internal_zoom_testing_enabled = false WHERE id = 9812;
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (pg_temp.u(12), 'lider_comunidad', 9812, pg_temp.gc(2), true);
SELECT is(pg_temp.roster(pg_temp.s(17)), '03:true', 'F5 the exclusion does not depend on the creation switch');
DELETE FROM public.user_roles WHERE user_id = pg_temp.u(10) AND community_id = pg_temp.gc(1);
SELECT is(pg_temp.roster(pg_temp.s(10)), '10:false', 'F6 client revocation semantics are unchanged (expected = false)');
SELECT lives_ok($$UPDATE public.user_roles SET is_active = false
  WHERE user_id = 'b2a10001-0000-4000-8000-000000000003' AND community_id = 'b2a10007-0000-4000-8000-000000000002'$$,
  'F7 revoking the only participant of a scheduled operator session succeeds');
SELECT is(pg_temp.roster(pg_temp.s(17)) || '|' || (SELECT status FROM public.consultor_sessions WHERE id = pg_temp.s(17)),
  '03:false|programada', 'F8 the last operator participant is expired and nothing rolls it back');

-- =============================================================================
-- G. School/community changes of a scheduled session
-- =============================================================================
-- PUT /api/sessions/[id] writes school_id, growth_community_id and status, so a
-- scheduled session can enter an operator context without a status transition.
-- The gate judges the NEW context; same-context rewrites stay ungated.
SELECT throws_ok($$UPDATE public.consultor_sessions SET school_id = 9812, growth_community_id = pg_temp.gc(2)
  WHERE id = pg_temp.s(25)$$,
  '23514', 'operator roster gate: an operator session needs at least one expected attendee who is an active member of its growth community before it can be scheduled',
  'G1 a scheduled client session with an empty roster cannot move into an operator context');
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada', school_id = 9812, growth_community_id = pg_temp.gc(2)
  WHERE id = pg_temp.s(26)$$,
  '23514', NULL, 'G2 nor can a scheduled qa session, with its status repeated');
SELECT is((SELECT string_agg(school_id || ':' || right(growth_community_id::text, 2), ',' ORDER BY id)
             FROM public.consultor_sessions WHERE id IN (pg_temp.s(25), pg_temp.s(26))),
  '9811:06,9813:07', 'G3 both refused moves left school and community unchanged');
SELECT throws_ok($$UPDATE public.consultor_sessions SET status = 'programada', growth_community_id = pg_temp.gc(4)
  WHERE id = pg_temp.s(27)$$,
  '23514', NULL, 'G4 a scheduled operator session cannot move to a community where its attendee is not a member');
SELECT throws_ok($$UPDATE public.consultor_sessions SET growth_community_id = pg_temp.gc(5)
  WHERE id = pg_temp.s(27)$$,
  '23514', NULL, 'G5 nor to a community where the attendee membership is inactive');
SELECT throws_ok($$UPDATE public.consultor_sessions SET growth_community_id = NULL
  WHERE id = pg_temp.s(27)$$,
  '23514', NULL, 'G6 nor to a NULL community (the gate refuses before the NOT NULL check)');
SELECT is((SELECT status || '|' || right(growth_community_id::text, 2) || '|' || pg_temp.roster(id)
             FROM public.consultor_sessions WHERE id = pg_temp.s(27)),
  'programada|02|02:true', 'G7 the scheduled operator session kept its community and roster');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada', growth_community_id = pg_temp.gc(4)
  WHERE id = pg_temp.s(28)$$,
  'G8 a scheduled operator session moves to a community where a selected attendee is an active member');
SELECT throws_ok($$UPDATE public.consultor_sessions SET school_id = 9812, growth_community_id = pg_temp.gc(2)
  WHERE id IN (pg_temp.s(29), pg_temp.s(30))$$,
  '23514', NULL, 'G9 a bulk move into an operator context with one empty roster is refused');
SELECT is((SELECT string_agg(school_id || ':' || right(growth_community_id::text, 2), ',' ORDER BY id)
             FROM public.consultor_sessions WHERE id IN (pg_temp.s(29), pg_temp.s(30))),
  '9811:06,9811:06', 'G10 every row of the refused bulk move rolled back, the valid one too');
SELECT lives_ok($$UPDATE public.consultor_sessions SET school_id = 9812, growth_community_id = pg_temp.gc(2)
  WHERE id = pg_temp.s(29)$$,
  'G11 a scheduled client session with an eligible operator attendee moves into the operator context');
SELECT lives_ok($$UPDATE public.consultor_sessions SET status = 'programada', school_id = 9812, growth_community_id = pg_temp.gc(2)
  WHERE id = pg_temp.s(17)$$,
  'G12 rewriting the same status, school and community after the last revocation is not gated');
SELECT lives_ok($$UPDATE public.consultor_sessions SET title = 'B2A session 17 renamed', growth_community_id = pg_temp.gc(2)
  WHERE id = pg_temp.s(17)$$,
  'G13 a metadata edit carrying an unchanged community is not gated');
SELECT is((SELECT status || '|' || title || '|' || pg_temp.roster(id) FROM public.consultor_sessions WHERE id = pg_temp.s(17)),
  'programada|B2A session 17 renamed|03:false', 'G14 the revoked scheduled roster stays as revocation left it');
SELECT lives_ok($$UPDATE public.consultor_sessions SET growth_community_id = pg_temp.gc(4)
  WHERE id = pg_temp.s(6)$$,
  'G15 a community change of an unscheduled empty operator session is not gated');
SELECT lives_ok($$UPDATE public.consultor_sessions SET school_id = 9811, growth_community_id = pg_temp.gc(6)
  WHERE id = pg_temp.s(17)$$,
  'G16 a scheduled session without an eligible roster may leave the operator tenant (the NEW context decides)');
SELECT lives_ok($$UPDATE public.user_roles SET is_active = false
  WHERE user_id = pg_temp.u(6) AND community_id = pg_temp.gc(4)$$,
  'G17 revoking the only eligible attendee after a community move is still allowed');
SELECT is((SELECT status || '|' || pg_temp.roster(id) FROM public.consultor_sessions WHERE id = pg_temp.s(28)),
  'programada|02:true,06:false', 'G18 the revocation expired the attendee and the session stays scheduled');

SELECT * FROM finish();
ROLLBACK;
