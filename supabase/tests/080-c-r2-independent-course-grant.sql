-- C-R2-01: real-role independent batch grants, orderings, retries, atomic
-- failure and access. Synthetic disposable fixtures; everything rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();
CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.set_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.rows_affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
-- origin / source of a (user, course) enrolment, read as postgres
CREATE OR REPLACE FUNCTION pg_temp.origin(k text, c uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT access_origin || ':' || coalesce(source_path_id::text, '-') FROM public.course_enrollments WHERE user_id = pg_temp.uid(k) AND course_id = c $$;
CREATE OR REPLACE FUNCTION pg_temp.enrol_count(k text) RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid(k) $$;

SELECT tests.create_supabase_user('c2_admin');
SELECT tests.create_supabase_user('c2_direct');    -- direct assignee of P1 (and later P2)
SELECT tests.create_supabase_user('c2_member');    -- community member (group assignment of P1)
SELECT tests.create_supabase_user('c2_both');      -- direct + member
SELECT tests.create_supabase_user('c2_indep');     -- independent K1 enrolment + direct P1
SELECT tests.create_supabase_user('c2_unknown');   -- historical unknown-origin K1 enrolment + direct P1
SELECT tests.create_supabase_user('c2_late');      -- joins the community after the group assignment
SELECT tests.create_supabase_user('c2_outsider');  -- nothing
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['c2_admin','c2_direct','c2_member','c2_both','c2_indep','c2_unknown','c2_late','c2_outsider']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (9781, 'C2 school (pgTAP 078)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES ('78000000-0000-4000-8000-00000000c001', 9781, 'C2 community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES ('78000000-0000-4000-8000-00000000bb01', '78000000-0000-4000-8000-00000000c001', 'C2 workspace');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('c2_admin'),    'admin',   NULL, NULL, true),
  (pg_temp.uid('c2_direct'),   'docente', 9781, NULL, true),
  (pg_temp.uid('c2_member'),   'docente', 9781, '78000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('c2_both'),     'docente', 9781, '78000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('c2_indep'),    'docente', 9781, NULL, true),
  (pg_temp.uid('c2_unknown'),  'docente', 9781, NULL, true),
  (pg_temp.uid('c2_outsider'), 'docente', 9781, NULL, true);
INSERT INTO public.instructors (id, full_name) VALUES ('78000000-0000-4000-8000-00000000f001', 'C2 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('78000000-0000-4000-8000-000000000c01', 'C2 course K1', 'in P1', '78000000-0000-4000-8000-00000000f001'),
  ('78000000-0000-4000-8000-000000000c02', 'C2 course K2', 'in P1 and P2', '78000000-0000-4000-8000-00000000f001'),
  ('78000000-0000-4000-8000-000000000c03', 'C2 course K3', 'added to P1 later', '78000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('78000000-0000-4000-8000-00000000e001', '78000000-0000-4000-8000-000000000c01', 'C2 module K1', 1),
  ('78000000-0000-4000-8000-00000000e003', '78000000-0000-4000-8000-000000000c03', 'C2 module K3', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('78000000-0000-4000-8000-00000000ee01', '78000000-0000-4000-8000-00000000e001', '78000000-0000-4000-8000-000000000c01', 'C2 lesson K1', 1),
  ('78000000-0000-4000-8000-00000000ee03', '78000000-0000-4000-8000-00000000e003', '78000000-0000-4000-8000-000000000c03', 'C2 lesson K3', 1);
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('78000000-0000-4000-8000-00000000000a', 'C2 path P1', 'K1 + K2', pg_temp.uid('c2_admin')),
  ('78000000-0000-4000-8000-00000000000b', 'C2 path P2', 'K2 only', pg_temp.uid('c2_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('78000000-0000-4000-8000-00000000000a', '78000000-0000-4000-8000-000000000c01', 1),
  ('78000000-0000-4000-8000-00000000000a', '78000000-0000-4000-8000-000000000c02', 2),
  ('78000000-0000-4000-8000-00000000000b', '78000000-0000-4000-8000-000000000c02', 1);
-- pre-existing enrolments: one explicitly independent, one historical unknown
INSERT INTO public.course_enrollments (user_id, course_id, enrollment_type, status, access_origin, progress_percentage) VALUES
  (pg_temp.uid('c2_indep'),   '78000000-0000-4000-8000-000000000c01', 'assigned', 'active', 'independent', 10),
  (pg_temp.uid('c2_unknown'), '78000000-0000-4000-8000-000000000c01', 'assigned', 'active', 'unknown', 20);


SELECT tests.create_supabase_user('c2_consultor');
INSERT INTO public.profiles(id,email,name) VALUES(pg_temp.uid('c2_consultor'),'c2_consultor@test.local','C2 consultor');
INSERT INTO public.user_roles(user_id,role_type,is_active) VALUES(pg_temp.uid('c2_consultor'),'consultor',true);
CREATE FUNCTION pg_temp.access_result() RETURNS text LANGUAGE sql AS $$
 SELECT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01')::text || '/' ||
 (SELECT count(*) FROM public.auth_accessible_course_ids() c WHERE c='78000000-0000-4000-8000-000000000c01') || '/' ||
 (SELECT count(*) FROM public.courses WHERE id='78000000-0000-4000-8000-000000000c01') || '/' ||
 (SELECT count(*) FROM public.lessons WHERE course_id='78000000-0000-4000-8000-000000000c01')
$$;
CREATE FUNCTION pg_temp.grant_result(who text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.batch_assign_courses('78000000-0000-4000-8000-000000000c01',ARRAY[pg_temp.uid(who)])::jsonb
$$;
CREATE FUNCTION pg_temp.counts(r jsonb) RETURNS text LANGUAGE sql AS $$
 SELECT (r->>'assignments_created') || '/' || (r->>'assignments_skipped') || '/' ||
 (r->>'enrollments_created') || '/' || (r->>'enrollments_promoted') || '/' || (r->>'enrollments_unchanged')
$$;
-- Independent first, then path; path first for direct and group learners.
SELECT tests.authenticate_as('c2_consultor');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_late')), '1/0/1/0/0', 'consultor independent-first creates actual enrollment');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT lives_ok($$SELECT public.batch_assign_learning_path('78000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('c2_direct'),pg_temp.uid('c2_late')], ARRAY['78000000-0000-4000-8000-00000000bb01'::uuid],auth.uid())$$,'assign path after independent grant and before other grants');
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.course_enrollments SET progress_percentage=37,lessons_completed=1,total_time_spent_seconds=123,is_completed=true,completed_at='2026-01-01',completion_certificate_url='synthetic-certificate'
 WHERE course_id='78000000-0000-4000-8000-000000000c01' AND user_id=pg_temp.uid('c2_direct');
CREATE TEMP TABLE enrollment_before AS SELECT to_jsonb(ce) AS row FROM public.course_enrollments ce WHERE course_id='78000000-0000-4000-8000-000000000c01' AND user_id=pg_temp.uid('c2_direct');
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_direct')), '1/0/0/1/0', 'exact reproduction: admin batch promotes path-dependent entitlement, not new enrollment');
DELETE FROM public.learning_path_assignments WHERE path_id='78000000-0000-4000-8000-00000000000a' AND user_id IN(pg_temp.uid('c2_direct'),pg_temp.uid('c2_late'));
RESET ROLE;
SELECT is((SELECT to_jsonb(ce) FROM public.course_enrollments ce WHERE course_id='78000000-0000-4000-8000-000000000c01' AND user_id=pg_temp.uid('c2_direct')),(SELECT row FROM enrollment_before),'exact reproduction preserves entire enrollment identity, provenance, progress and history');
SELECT tests.authenticate_as('c2_direct');
SELECT is(pg_temp.access_result(),'true/1/1/1','exact reproduction: helper, my-courses IDs, course and content survive path removal');
RESET ROLE;
SELECT tests.authenticate_as('c2_late');
SELECT is(pg_temp.access_result(),'true/1/1/1','independent-first has identical access after path removal');
RESET ROLE;
SELECT tests.authenticate_as('c2_consultor');
SELECT throws_ok($$UPDATE public.course_enrollments SET access_origin='independent' WHERE user_id=auth.uid()$$,'42501',NULL,'consultor direct provenance writes remain forbidden');
SELECT throws_ok($$INSERT INTO public.course_assignments(course_id,teacher_id,assigned_by) VALUES('78000000-0000-4000-8000-000000000c03',auth.uid(),auth.uid())$$,'42501',NULL,'consultor explicit grant must use the checked RPC, not direct table writes');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_member')), '1/0/0/1/0', 'consultor promotes group-path-dependent entitlement');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_direct')), '0/1/0/0/1', 'consultor retry of another actors assignment preserves independent access');
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.user_roles SET is_active=false WHERE user_id=pg_temp.uid('c2_member');
SELECT tests.authenticate_as('c2_member');
SELECT is(pg_temp.access_result(),'true/1/1/1','consultor grant survives group membership deactivation');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.counts(public.batch_assign_courses('78000000-0000-4000-8000-000000000c01',ARRAY[pg_temp.uid('c2_direct'),pg_temp.uid('c2_direct')])::jsonb),'0/1/0/0/1','duplicate recipients counted once, retry has no false creations/promotions');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_unknown')),'1/0/0/0/1','unknown enrollment already had independent-effective access; explicit source established without guessing origin');
SELECT is(pg_temp.origin('c2_unknown','78000000-0000-4000-8000-000000000c01'),'unknown:-','unknown provenance remains unresolved');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_indep')),'1/0/0/0/1','independent origin preserved and counted unchanged');
RESET ROLE;
SELECT tests.clear_authentication();
-- Existing assignment without an enrollment: the old early skip lost access.
INSERT INTO public.course_assignments(course_id,teacher_id,assigned_by) VALUES('78000000-0000-4000-8000-000000000c01',pg_temp.uid('c2_outsider'),pg_temp.uid('c2_admin'));
SELECT tests.authenticate_as('c2_consultor');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_outsider')),'0/1/1/0/0','existing assignment repairs missing enrollment on retry');
RESET ROLE;
SELECT tests.authenticate_as('c2_outsider');
SELECT is(pg_temp.access_result(),'true/1/1/1','repaired existing assignment has real access');
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.course_assignments SET status='cancelled' WHERE teacher_id=pg_temp.uid('c2_direct');
SELECT tests.authenticate_as('c2_direct');
SELECT is((public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'))::text,'false','cancelled source alone does not grant path-origin access');
RESET ROLE;
SELECT tests.authenticate_as('c2_consultor');
SELECT is(pg_temp.counts(pg_temp.grant_result('c2_direct')),'0/1/0/1/0','explicit retry reactivates cancelled source and counts effective promotion');
RESET ROLE;
UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('role','admin','roles',jsonb_build_array('admin')) WHERE id=pg_temp.uid('c2_direct');
SELECT tests.authenticate_as('c2_direct');
SELECT is(pg_temp.access_result(),'true/1/1/1','reactivated explicit grant restores real access');
SELECT throws_ok($$SELECT pg_temp.grant_result('c2_direct')$$,NULL,'User does not have permission to assign courses','learner cannot forge a grant through RPC');
SELECT throws_ok($$INSERT INTO public.course_assignments(course_id,teacher_id,assigned_by) VALUES('78000000-0000-4000-8000-000000000c03',auth.uid(),auth.uid())$$,'42501',NULL,'learner cannot forge independent source directly');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_assignments SET course_id='78000000-0000-4000-8000-000000000c03' WHERE teacher_id=auth.uid()$$),0,'learner cannot reassociate independent source');
SELECT throws_ok($$UPDATE public.course_enrollments SET access_origin='independent' WHERE user_id=auth.uid()$$,'42501',NULL,'learner provenance guard unchanged');
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id='78000000-0000-4000-8000-000000000c03' WHERE user_id=auth.uid()$$,'42501',NULL,'learner identity guard unchanged');
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.profiles SET must_change_password=true WHERE id=pg_temp.uid('c2_consultor');
SELECT tests.authenticate_as('c2_consultor');
SELECT throws_ok($$SELECT pg_temp.grant_result('c2_direct')$$,'42501','Password change required','flagged consultor grant blocked');
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.profiles SET must_change_password=true WHERE id=pg_temp.uid('c2_admin');
SELECT tests.authenticate_as('c2_admin');
SELECT throws_ok($$SELECT pg_temp.grant_result('c2_direct')$$,'42501','Password change required','flagged admin grant blocked');
RESET ROLE;
SELECT tests.clear_authentication();
UPDATE public.profiles SET must_change_password=false WHERE id IN(pg_temp.uid('c2_admin'),pg_temp.uid('c2_consultor'));
UPDATE public.profiles SET must_change_password=true WHERE id=pg_temp.uid('c2_direct');
SELECT tests.authenticate_as('c2_direct');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()),0,'flagged learner gets no my-courses IDs despite independent source');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id='78000000-0000-4000-8000-000000000c01'),0,'flagged learner gets no course despite independent source');
RESET ROLE;
SELECT tests.clear_authentication();
-- Force a failure AFTER a successful first recipient to prove statement rollback.
CREATE FUNCTION pg_temp.reject_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.course_id='78000000-0000-4000-8000-000000000c03' THEN RAISE EXCEPTION 'synthetic enrollment failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER c_r2_fail BEFORE INSERT ON public.course_enrollments FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_enrollment();
SELECT tests.authenticate_as('c2_admin');
SELECT throws_ok($$SELECT public.batch_assign_courses('78000000-0000-4000-8000-000000000c03',ARRAY[pg_temp.uid('c2_direct')])$$,NULL,'synthetic enrollment failure','enrollment failure refuses success and rolls back assignment');
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE course_id='78000000-0000-4000-8000-000000000c03'),0,'failed enrollment leaves no assignment behind');
SELECT throws_ok($$SELECT public.batch_assign_courses('78000000-0000-4000-8000-000000000c02',ARRAY[pg_temp.uid('c2_direct'),NULL])$$,NULL,'Recipient does not exist','invalid trailing recipient rolls back prior successful recipient');
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE course_id='78000000-0000-4000-8000-000000000c02'),0,'partial batch failure rolls back every assignment');
RESET ROLE;
SELECT tests.clear_authentication();
-- Existing explicit source (old writer shape), already path-origin enrollment:
-- access must not depend on re-running the batch RPC after the migration.
INSERT INTO public.course_assignments(course_id,teacher_id,assigned_by) VALUES('78000000-0000-4000-8000-000000000c01',pg_temp.uid('c2_both'),pg_temp.uid('c2_admin'));
DELETE FROM public.learning_path_assignments WHERE group_id='78000000-0000-4000-8000-00000000bb01';
SELECT tests.authenticate_as('c2_both');
SELECT is(pg_temp.access_result(),'true/1/1/1','existing explicit assignment keeps path-origin enrollment accessible immediately without retry');
SELECT * FROM finish();
ROLLBACK;
