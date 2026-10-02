-- =============================================================================
-- 104-meeting-content-access.sql — SM-H8 (W-MEET-01): migration
-- 20261003100000_meeting_content_access.sql.
--
-- Owner rule (2 Oct 2026): a meeting's agreements, commitments, tasks and
-- documents are read by its editors (creator, facilitator, secretary, verified
-- co-editor, community leader, admin, consultor), its participants (any
-- meeting_attendees row) and people an editor adds (meeting_read_grants);
-- nobody else. The assignee of a commitment/task reads that row. Deleting or
-- archiving a meeting: creator, community leader, admin.
--
--   1. catalog: policy sets, privileges, bucket private
--   2. read matrix: 13 actors x agreements/commitments/tasks/attachments/
--      storage objects
--   3. writes: child INSERT/DELETE, self-added participants, commitment UPDATE
--   4. meetings: DELETE matrix, archive and creator/workspace guard, UPDATE by
--      an unverified co_editor
--   5. read grants: who may add/see/remove them and what they unlock
--   6. storage: upload path rules, no UPDATE, DELETE by editors only
--   7. RPCs: get_my_meeting_rights, actor binding, get_overdue_items
--
--   3b. demotion of a verified co_editor; attachment rows
--   The four Production-only storage policies are modelled in the fixtures.
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(250);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.reset_auth() RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.as_user(p text) RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.authenticate_as('smh8_' || p);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
-- Counts run as the CURRENT role, so RLS decides each outcome.
CREATE OR REPLACE FUNCTION pg_temp.visible(t text, m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  IF t = 'storage' THEN
    SELECT count(*) INTO n FROM storage.objects
     WHERE bucket_id = 'meeting-documents' AND split_part(name, '/', 2) = m::text;
  ELSE
    EXECUTE format('SELECT count(*) FROM public.%I WHERE meeting_id = $1', t) INTO n USING m;
  END IF;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.del(t text, m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE format('DELETE FROM public.%I WHERE meeting_id = $1', t) USING m;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.del_meeting(m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.community_meetings WHERE id = m;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.upd_commitments(m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  UPDATE public.meeting_commitments SET updated_at = now() WHERE meeting_id = m;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.upd_meeting_title(m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  UPDATE public.community_meetings SET title = title || '.' WHERE id = m;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.upd_storage(m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  UPDATE storage.objects SET metadata = '{}'::jsonb
   WHERE bucket_id = 'meeting-documents' AND split_part(name, '/', 2) = m::text;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.del_storage(m uuid) RETURNS int AS $$
DECLARE n int;
BEGIN
  -- The Storage API sets this before deleting rows; RLS still decides.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
   WHERE bucket_id = 'meeting-documents' AND split_part(name, '/', 2) = m::text;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.exec_count(q text) RETURNS int AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;
CREATE TEMP TABLE content_tables (t text) ON COMMIT DROP;
INSERT INTO content_tables VALUES ('meeting_agreements'), ('meeting_commitments'), ('meeting_tasks'), ('meeting_attachments'), ('storage');
GRANT SELECT ON content_tables TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Community A (workspace A): meeting M1 created by
-- `creator`, facilitated by `facilitator`, participants `participant` and
-- `gated`, legacy co_editor row for `legacy`, overdue commitment (assigned to
-- participant) and task (assigned to `assignee`, a member of community B),
-- one attachment row + stored object. Community B: meeting M2 by `leader_b`.
-- Spare meetings M3-M6 in A exist to be deleted.
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('smh8_' || p, 'smh8-' || p || '@example.test')
FROM unnest(ARRAY['creator','facilitator','leader','admin','consultor','participant','granted','legacy',
                  'member','outsider','leader_b','assignee','gated','inactive_leader','gated_editor','coeditor','secretary']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET must_change_password = true WHERE id IN (pg_temp.uid('gated'), pg_temp.uid('gated_editor'));
INSERT INTO public.growth_communities (id, name) VALUES
  ('5e880000-0000-4000-8000-0000000000c1', 'SMH8 Comunidad A'),
  ('5e880000-0000-4000-8000-0000000000c2', 'SMH8 Comunidad B');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('5e880000-0000-4000-8000-0000000000a1', '5e880000-0000-4000-8000-0000000000c1'),
  ('5e880000-0000-4000-8000-0000000000a2', '5e880000-0000-4000-8000-0000000000c2');
INSERT INTO public.user_roles (user_id, role_type, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, c::uuid, a FROM (VALUES
  ('creator', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('facilitator', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('leader', 'lider_comunidad', '5e880000-0000-4000-8000-0000000000c1', true),
  ('inactive_leader', 'lider_comunidad', '5e880000-0000-4000-8000-0000000000c1', false),
  ('admin', 'admin', NULL, true),
  ('consultor', 'consultor', NULL, true),
  ('participant', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('granted', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('legacy', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('member', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('gated', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('gated_editor', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('coeditor', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('secretary', 'docente', '5e880000-0000-4000-8000-0000000000c1', true),
  ('leader_b', 'lider_comunidad', '5e880000-0000-4000-8000-0000000000c2', true),
  ('assignee', 'docente', '5e880000-0000-4000-8000-0000000000c2', true)) v(p, r, c, a);
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by, facilitator_id)
SELECT ('5e880000-0000-4000-8000-0000000000e' || k)::uuid, w::uuid, 'SMH8 M' || k, now() + interval '1 day', pg_temp.uid(c), f
FROM (VALUES
  ('1', '5e880000-0000-4000-8000-0000000000a1', 'creator', pg_temp.uid('facilitator')),
  ('2', '5e880000-0000-4000-8000-0000000000a2', 'leader_b', NULL::uuid),
  ('3', '5e880000-0000-4000-8000-0000000000a1', 'creator', NULL::uuid),
  ('4', '5e880000-0000-4000-8000-0000000000a1', 'creator', NULL::uuid),
  ('5', '5e880000-0000-4000-8000-0000000000a1', 'creator', NULL::uuid),
  ('6', '5e880000-0000-4000-8000-0000000000a1', 'creator', NULL::uuid),
  ('7', '5e880000-0000-4000-8000-0000000000a1', 'creator', NULL::uuid)) v(k, w, c, f);
UPDATE public.community_meetings SET secretary_id = pg_temp.uid('secretary') WHERE id = '5e880000-0000-4000-8000-0000000000e7';
UPDATE public.community_meetings SET secretary_id = pg_temp.uid('gated_editor') WHERE id = '5e880000-0000-4000-8000-0000000000e1';
INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES
  ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('participant'), 'participant'),
  ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('gated'), 'participant'),
  ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('legacy'), 'co_editor');
INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by)
VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('granted'), pg_temp.uid('creator'));
INSERT INTO public.meeting_agreements (meeting_id, agreement_text) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'Acuerdo M1'), ('5e880000-0000-4000-8000-0000000000e2', 'Acuerdo M2'),
  ('5e880000-0000-4000-8000-0000000000e7', 'Acuerdo M7');
INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES
  ('5e880000-0000-4000-8000-0000000000e1', 'Compromiso M1', pg_temp.uid('participant'), current_date - 3),
  ('5e880000-0000-4000-8000-0000000000e2', 'Compromiso M2', pg_temp.uid('leader_b'), current_date - 3);
INSERT INTO public.meeting_tasks (meeting_id, task_title, assigned_to, due_date) VALUES
  ('5e880000-0000-4000-8000-0000000000e1', 'Tarea M1', pg_temp.uid('assignee'), current_date - 3),
  ('5e880000-0000-4000-8000-0000000000e2', 'Tarea M2', pg_temp.uid('leader_b'), current_date - 3),
  ('5e880000-0000-4000-8000-0000000000e2', 'Tarea M2 para gated', pg_temp.uid('gated'), current_date - 3);
INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES
  ('5e880000-0000-4000-8000-0000000000e1', 'acta.pdf', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/1-acta.pdf', 10, 'application/pdf', pg_temp.uid('creator')),
  ('5e880000-0000-4000-8000-0000000000e2', 'acta.pdf', '5e880000-0000-4000-8000-0000000000a2/5e880000-0000-4000-8000-0000000000e2/1-acta.pdf', 10, 'application/pdf', pg_temp.uid('leader_b'));
-- The four bucket-only permissive policies that exist in Production outside
-- the migration history, modelled here so the restrictive limits are tested
-- against them; plus an unrelated bucket the limits must not touch.
CREATE POLICY "Authenticated users can view meeting documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'meeting-documents');
CREATE POLICY "Authenticated users can upload meeting documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-documents');
CREATE POLICY "Users can update their own meeting documents" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'meeting-documents') WITH CHECK (bucket_id = 'meeting-documents');
CREATE POLICY "Users can delete their own meeting documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'meeting-documents');
INSERT INTO storage.buckets (id, name, public) VALUES ('smh8-other', 'smh8-other', false);
CREATE POLICY "smh8 other bucket open" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'smh8-other') WITH CHECK (bucket_id = 'smh8-other');
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('smh8-other', 'libre/otro.pdf', pg_temp.uid('member'));
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/1-acta.pdf', pg_temp.uid('creator')),
  ('meeting-documents', '5e880000-0000-4000-8000-0000000000a2/5e880000-0000-4000-8000-0000000000e2/1-acta.pdf', pg_temp.uid('leader_b'));

-- ---------------------------------------------------------------------------
-- 1. Catalog
-- ---------------------------------------------------------------------------
SELECT policies_are('public', 'meeting_read_grants', ARRAY[
  'Editors and the grantee can view read grants', 'Verified meeting editors can add read grants',
  'Verified meeting editors can remove read grants', 'forced_password_change_guard'], 'read grants: exact policy set');
SELECT policies_are('public', 'meeting_commitments', ARRAY[
  'Meeting editors can update commitments', 'Users can create meeting commitments', 'Users can delete commitments for deletable meetings',
  'Users can delete meeting commitments', 'Users can view meeting commitments', 'forced_password_change_guard',
  'Commitment updates require a verified meeting editor'], 'commitments: baseline names kept (narrowed), one restrictive added');
SELECT policies_are('public', 'meeting_attachments', ARRAY[
  'Users can delete attachments for deletable meetings', 'Users can delete their own meeting attachments',
  'Users can upload meeting attachments', 'Users can view meeting attachments', 'forced_password_change_guard'],
  'attachments: baseline names kept (narrowed)');
SELECT policies_are('public', 'community_meetings', ARRAY[
  'Community leaders and admins can create meetings', 'Community members can create meetings', 'Community members can view meetings',
  'Community members can delete meetings', 'Meeting creators and authorized users can delete meetings', 'Meeting editors can update meetings',
  'forced_password_change_guard', 'Meeting updates require a verified meeting editor'], 'community_meetings: one restrictive UPDATE added');
SELECT ok((SELECT polcmd = 'd' AND pg_get_expr(polqual, polrelid) LIKE '%can_delete_meeting%' FROM pg_policy
  WHERE polrelid = 'public.community_meetings'::regclass AND polname = 'Community members can delete meetings'),
  'community_meetings: the former any-member DELETE policy now uses can_delete_meeting');
SELECT tests.rls_enabled('public', 'meeting_read_grants');
SELECT ok(NOT has_table_privilege('anon', 'public.meeting_read_grants', 'SELECT,INSERT,UPDATE,DELETE'), 'read grants: anon holds no table privilege');
SELECT ok(NOT has_table_privilege('authenticated', 'public.meeting_read_grants', 'UPDATE'), 'read grants: authenticated cannot UPDATE');
SELECT ok(NOT has_function_privilege('anon', f, 'EXECUTE'), format('anon cannot execute %s', f)) FROM unnest(ARRAY[
  'public.can_read_meeting_content(uuid,uuid)', 'public.can_delete_meeting(uuid,uuid)', 'public.is_meeting_community_member(uuid,uuid)',
  'public.meeting_document_meeting_id(text)', 'public.can_upload_meeting_document(uuid,text)', 'public.get_my_meeting_rights(uuid[])']) f;
SELECT ok(NOT has_function_privilege('authenticated', 'public.guard_community_meeting_update()', 'EXECUTE'), 'authenticated cannot call the trigger function');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'meeting-documents'), false, 'bucket meeting-documents is private');
SELECT ok((SELECT bool_and(p.prosecdef AND p.proconfig::text LIKE '%search_path%') FROM pg_proc p
  WHERE p.oid IN ('public.can_read_meeting_content(uuid,uuid)'::regprocedure, 'public.can_delete_meeting(uuid,uuid)'::regprocedure,
                  'public.is_meeting_community_member(uuid,uuid)'::regprocedure, 'public.can_upload_meeting_document(uuid,text)'::regprocedure)),
  'definer helpers pin search_path');

-- ---------------------------------------------------------------------------
-- 2. Read matrix: every actor x agreements, commitments, tasks, attachments,
--    stored documents of M1
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read creator %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read facilitator %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('leader');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read community leader %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('admin');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read admin %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('consultor');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read consultor %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('participant');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read participant %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('granted');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read person added by an editor %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('legacy');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 1, format('read legacy co_editor row (participant) %s: sees M1 content', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read community member who did not take part %s: sees nothing of M1', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('outsider');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read user with no role %s: sees nothing of M1', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('leader_b');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read leader of another community %s: sees nothing of M1', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('gated');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read participant who must change password %s: sees nothing of M1', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('gated_editor');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read secretary who must change password %s: sees nothing of M1', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('inactive_leader');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read inactive community leader %s: sees nothing of M1', t)) FROM content_tables ORDER BY t;
SELECT pg_temp.as_user('assignee');
SELECT is(pg_temp.visible('meeting_tasks', '5e880000-0000-4000-8000-0000000000e1'), 1, 'read assignee: sees the task assigned to them');
SELECT is(pg_temp.visible('meeting_agreements', '5e880000-0000-4000-8000-0000000000e1') + pg_temp.visible('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1') + pg_temp.visible('meeting_attachments', '5e880000-0000-4000-8000-0000000000e1') + pg_temp.visible('storage', '5e880000-0000-4000-8000-0000000000e1'), 0, 'read assignee: nothing else of M1');
SELECT pg_temp.as_user('participant');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e2'), 0, format('read participant of M1 %s: nothing of M2 (other community)', t)) FROM content_tables ORDER BY t;
SELECT is((SELECT count(*)::int FROM public.meeting_attendees WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 3, 'attendees: a community member sees the participant list');
SELECT is((SELECT count(*)::int FROM public.community_meetings WHERE id = '5e880000-0000-4000-8000-0000000000e1'), 1, 'meeting row (title/date/summary) stays visible to a participant');
SELECT pg_temp.as_user('member');
SELECT is((SELECT count(*)::int FROM public.community_meetings WHERE id = '5e880000-0000-4000-8000-0000000000e1'), 1, 'meeting row (title/date/summary) stays visible to a non-participant member');
SELECT is((SELECT count(*)::int FROM public.meeting_attendees WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 3, 'attendees: a non-participant member of the community sees the list');
SELECT pg_temp.as_user('leader_b');
SELECT is((SELECT count(*)::int FROM public.meeting_attendees WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 0, 'attendees: another community sees no list');
SELECT pg_temp.as_user('outsider');
SELECT is((SELECT count(*)::int FROM public.meeting_attendees WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 0, 'attendees: a user with no role sees no list');
SELECT pg_temp.set_anon();
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1'), 0, format('read anon %s: nothing', t)) FROM content_tables WHERE t <> 'storage' ORDER BY t;
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 3. Writes on content and participants
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('participant');
SELECT throws_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'x', auth.uid(), current_date)$$,
  '42501', NULL, 'write participant: cannot add a commitment');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), 'participant')$$,
  '42501', NULL, 'write participant: cannot add a participant');
SELECT is(pg_temp.del('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write participant: deletes no commitment');
SELECT is(pg_temp.upd_commitments('5e880000-0000-4000-8000-0000000000e1'), 0, 'write participant: updates no commitment');
SELECT is(pg_temp.del('meeting_attendees', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write participant: removes no participant');
SELECT pg_temp.as_user('granted');
SELECT throws_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'x', auth.uid(), current_date)$$,
  '42501', NULL, 'write granted: cannot add a commitment');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), 'participant')$$,
  '42501', NULL, 'write granted: cannot add a participant');
SELECT is(pg_temp.del('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write granted: deletes no commitment');
SELECT is(pg_temp.upd_commitments('5e880000-0000-4000-8000-0000000000e1'), 0, 'write granted: updates no commitment');
SELECT is(pg_temp.del('meeting_attendees', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write granted: removes no participant');
SELECT pg_temp.as_user('legacy');
SELECT throws_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'x', auth.uid(), current_date)$$,
  '42501', NULL, 'write legacy: cannot add a commitment');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), 'participant')$$,
  '42501', NULL, 'write legacy: cannot add a participant');
SELECT is(pg_temp.del('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write legacy: deletes no commitment');
SELECT is(pg_temp.upd_commitments('5e880000-0000-4000-8000-0000000000e1'), 0, 'write legacy: updates no commitment');
SELECT is(pg_temp.del('meeting_attendees', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write legacy: removes no participant');
SELECT pg_temp.as_user('member');
SELECT throws_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'x', auth.uid(), current_date)$$,
  '42501', NULL, 'write member: cannot add a commitment');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), 'participant')$$,
  '42501', NULL, 'write member: cannot add a participant');
SELECT is(pg_temp.del('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write member: deletes no commitment');
SELECT is(pg_temp.upd_commitments('5e880000-0000-4000-8000-0000000000e1'), 0, 'write member: updates no commitment');
SELECT is(pg_temp.del('meeting_attendees', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write member: removes no participant');
SELECT pg_temp.as_user('outsider');
SELECT throws_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'x', auth.uid(), current_date)$$,
  '42501', NULL, 'write outsider: cannot add a commitment');
SELECT throws_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), 'participant')$$,
  '42501', NULL, 'write outsider: cannot add a participant');
SELECT is(pg_temp.del('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write outsider: deletes no commitment');
SELECT is(pg_temp.upd_commitments('5e880000-0000-4000-8000-0000000000e1'), 0, 'write outsider: updates no commitment');
SELECT is(pg_temp.del('meeting_attendees', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write outsider: removes no participant');
SELECT pg_temp.as_user('gated');
SELECT is(pg_temp.del('meeting_attendees', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write gated: removes no participant');
SELECT pg_temp.as_user('facilitator');
SELECT lives_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'por facilitator', pg_temp.uid('participant'), current_date + 1)$$,
  'write facilitator: adds a commitment');
SELECT pg_temp.as_user('leader');
SELECT lives_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'por leader', pg_temp.uid('participant'), current_date + 1)$$,
  'write leader: adds a commitment');
SELECT pg_temp.as_user('admin');
SELECT lives_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'por admin', pg_temp.uid('participant'), current_date + 1)$$,
  'write admin: adds a commitment');
SELECT pg_temp.as_user('consultor');
SELECT lives_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'por consultor', pg_temp.uid('participant'), current_date + 1)$$,
  'write consultor: adds a commitment');
SELECT pg_temp.as_user('creator');
SELECT lives_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'por creator', pg_temp.uid('participant'), current_date + 1)$$,
  'write creator: adds a commitment');
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.upd_commitments('5e880000-0000-4000-8000-0000000000e1'), 6, 'write facilitator: updates the commitments');
SELECT lives_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('member'), 'participant')$$,
  'write facilitator: adds a participant');
SELECT is((SELECT count(*)::int FROM public.meeting_attendees WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND user_id = pg_temp.uid('member')), 1, 'write facilitator: participant row written');
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.visible('meeting_agreements', '5e880000-0000-4000-8000-0000000000e1'), 1, 'write: the added participant now reads M1');
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attendees WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND user_id = pg_temp.uid('member')$q$), 1,
  'write facilitator: removes a participant');
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.visible('meeting_agreements', '5e880000-0000-4000-8000-0000000000e1'), 0, 'write: the removed participant no longer reads M1');
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_agreements WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 1,
  'write facilitator: deletes an agreement (was creator/admin/leader only)');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_tasks WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e2'$q$), 0,
  'write facilitator: deletes nothing in M2');
SELECT pg_temp.reset_auth();
SELECT pg_temp.as_user('secretary');
SELECT is(pg_temp.visible('meeting_agreements', '5e880000-0000-4000-8000-0000000000e7'), 1, 'secretary: reads the meeting they are secretary of');
SELECT lives_ok($$INSERT INTO public.meeting_commitments (meeting_id, commitment_text, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e7', 'por secretaria', pg_temp.uid('participant'), current_date + 1)$$, 'secretary: adds a commitment');
SELECT is(pg_temp.del('meeting_agreements', '5e880000-0000-4000-8000-0000000000e7'), 1, 'secretary: deletes an agreement');
SELECT is(pg_temp.visible('meeting_agreements', '5e880000-0000-4000-8000-0000000000e1'), 0, 'secretary of M7: reads nothing of M1');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e7']::uuid[])$$,
  $$VALUES (true, false, true)$$, 'rights secretary: edit, no delete, read');
SELECT pg_temp.as_user('creator');
SELECT lives_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'creator.pdf', 'x/y/creator.pdf', 1, 'application/pdf', auth.uid())$$, 'attachments creator: adds a row');
SELECT pg_temp.as_user('leader');
SELECT lives_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'leader.pdf', 'x/y/leader.pdf', 1, 'application/pdf', auth.uid())$$, 'attachments leader: adds a row');
SELECT pg_temp.as_user('admin');
SELECT lives_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'admin.pdf', 'x/y/admin.pdf', 1, 'application/pdf', auth.uid())$$, 'attachments admin: adds a row');
SELECT pg_temp.as_user('consultor');
SELECT lives_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'consultor.pdf', 'x/y/consultor.pdf', 1, 'application/pdf', auth.uid())$$, 'attachments consultor: adds a row');
SELECT pg_temp.as_user('granted');
SELECT throws_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'granted.pdf', 'x/y/granted.pdf', 1, 'application/pdf', auth.uid())$$, '42501', NULL, 'attachments granted: cannot add a row');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'attachments granted: deletes no row');
SELECT pg_temp.as_user('legacy');
SELECT throws_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'legacy.pdf', 'x/y/legacy.pdf', 1, 'application/pdf', auth.uid())$$, '42501', NULL, 'attachments legacy: cannot add a row');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'attachments legacy: deletes no row');
SELECT pg_temp.as_user('member');
SELECT throws_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'member.pdf', 'x/y/member.pdf', 1, 'application/pdf', auth.uid())$$, '42501', NULL, 'attachments member: cannot add a row');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'attachments member: deletes no row');
SELECT pg_temp.as_user('outsider');
SELECT throws_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'outsider.pdf', 'x/y/outsider.pdf', 1, 'application/pdf', auth.uid())$$, '42501', NULL, 'attachments outsider: cannot add a row');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'attachments outsider: deletes no row');
SELECT pg_temp.as_user('creator');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND filename IN ('creator.pdf','leader.pdf','admin.pdf','consultor.pdf')$q$), 4, 'attachments creator: removes the added rows');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 3b. A verified co_editor demoted to participant keeps reading, loses writes;
--     attachment rows follow the editor rule
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');
SELECT lives_ok($$INSERT INTO public.meeting_attendees (meeting_id, user_id, role) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('coeditor'), 'co_editor')$$, 'demotion: creator grants co_editor');
SELECT pg_temp.as_user('coeditor');
SELECT lives_ok($$INSERT INTO public.meeting_tasks (meeting_id, task_title, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'del coeditor', pg_temp.uid('participant'), current_date + 2)$$, 'demotion: verified co_editor adds a task');
SELECT pg_temp.as_user('creator');
UPDATE public.meeting_attendees SET role = 'participant' WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND user_id = pg_temp.uid('coeditor');
SELECT pg_temp.as_user('coeditor');
SELECT ok(pg_temp.visible('meeting_tasks', '5e880000-0000-4000-8000-0000000000e1') > 0, 'demotion: still reads as a participant');
SELECT throws_ok($$INSERT INTO public.meeting_tasks (meeting_id, task_title, assigned_to, due_date) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'otra', pg_temp.uid('participant'), current_date + 2)$$, '42501', NULL, 'demotion: can no longer add a task');
SELECT is(pg_temp.exec_count($q$UPDATE public.meeting_tasks SET task_title = task_title WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'demotion: can no longer update tasks');
SELECT is(pg_temp.del('meeting_tasks', '5e880000-0000-4000-8000-0000000000e1'), 0, 'demotion: can no longer delete tasks');
SELECT pg_temp.as_user('participant');
SELECT throws_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'p.pdf', 'x/y/p.pdf', 1, 'application/pdf', auth.uid())$$, '42501', NULL, 'attachments participant: cannot add a row');
SELECT pg_temp.as_user('facilitator');
SELECT throws_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'f.pdf', 'x/y/f.pdf', 1, 'application/pdf', pg_temp.uid('creator'))$$, '42501', NULL, 'attachments facilitator: cannot record someone else as uploader');
SELECT lives_ok($$INSERT INTO public.meeting_attachments (meeting_id, filename, file_path, file_size, file_type, uploaded_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', 'f.pdf', 'x/y/f.pdf', 1, 'application/pdf', auth.uid())$$, 'attachments facilitator: adds a row');
SELECT pg_temp.reset_auth();
UPDATE public.community_meetings SET facilitator_id = NULL WHERE id = '5e880000-0000-4000-8000-0000000000e1';
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND filename = 'f.pdf'$q$), 0, 'attachments: an uploader who is no longer an editor cannot delete the row');
SELECT pg_temp.reset_auth();
UPDATE public.community_meetings SET facilitator_id = pg_temp.uid('facilitator') WHERE id = '5e880000-0000-4000-8000-0000000000e1';
SELECT pg_temp.as_user('leader');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_attachments WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND filename = 'f.pdf'$q$), 1, 'attachments: an editor deletes another person''s row');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 4. Meetings: delete, archive, guarded columns, unverified co_editor
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 0, 'delete member: cannot delete a meeting');
SELECT pg_temp.as_user('participant');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 0, 'delete participant: cannot delete a meeting');
SELECT pg_temp.as_user('facilitator');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e1'), 0, 'delete facilitator: cannot delete a meeting');
SELECT pg_temp.as_user('legacy');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e1'), 0, 'delete legacy: cannot delete a meeting');
SELECT pg_temp.as_user('granted');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e1'), 0, 'delete granted: cannot delete a meeting');
SELECT pg_temp.as_user('leader_b');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 0, 'delete leader_b: cannot delete a meeting');
SELECT pg_temp.as_user('consultor');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 0, 'delete consultor: cannot delete a meeting');
SELECT pg_temp.as_user('inactive_leader');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 0, 'delete inactive_leader: cannot delete a meeting');
SELECT pg_temp.as_user('outsider');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 0, 'delete outsider: cannot delete a meeting');
SELECT pg_temp.as_user('creator');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e3'), 1, 'delete creator: deletes the meeting');
SELECT pg_temp.as_user('leader');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e4'), 1, 'delete leader: deletes the meeting');
SELECT pg_temp.as_user('admin');
SELECT is(pg_temp.del_meeting('5e880000-0000-4000-8000-0000000000e5'), 1, 'delete admin: deletes the meeting');
SELECT pg_temp.as_user('facilitator');
SELECT throws_ok($$UPDATE public.community_meetings SET is_active = false WHERE id = '5e880000-0000-4000-8000-0000000000e1'$$, '42501', NULL, 'archive facilitator: denied');
SELECT throws_ok($$UPDATE public.community_meetings SET created_by = auth.uid() WHERE id = '5e880000-0000-4000-8000-0000000000e1'$$, '42501', NULL, 'guard facilitator: cannot take over created_by');
SELECT throws_ok($$UPDATE public.community_meetings SET workspace_id = '5e880000-0000-4000-8000-0000000000a2' WHERE id = '5e880000-0000-4000-8000-0000000000e1'$$, '42501', NULL, 'guard facilitator: cannot move the meeting to another workspace');
SELECT is(pg_temp.upd_meeting_title('5e880000-0000-4000-8000-0000000000e1'), 1, 'update facilitator: edits the meeting');
SELECT pg_temp.as_user('legacy');
SELECT is(pg_temp.upd_meeting_title('5e880000-0000-4000-8000-0000000000e1'), 0, 'update legacy co_editor (no provenance): changes nothing');
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.upd_meeting_title('5e880000-0000-4000-8000-0000000000e1'), 0, 'update member: changes nothing');
SELECT pg_temp.as_user('creator');
SELECT lives_ok($$UPDATE public.community_meetings SET is_active = false, deleted_at = now(), deleted_by = auth.uid() WHERE id = '5e880000-0000-4000-8000-0000000000e6'$$, 'archive creator: allowed');
SELECT pg_temp.reset_auth();
SELECT is((SELECT is_active FROM public.community_meetings WHERE id = '5e880000-0000-4000-8000-0000000000e6'), false, 'archive creator: row archived');
SELECT is((SELECT created_by FROM public.community_meetings WHERE id = '5e880000-0000-4000-8000-0000000000e1'), pg_temp.uid('creator'), 'guard: creator unchanged');
SELECT lives_ok($$UPDATE public.community_meetings SET is_active = true WHERE id = '5e880000-0000-4000-8000-0000000000e6'$$, 'guard: backend (no end-user identity) is not affected');

-- ---------------------------------------------------------------------------
-- 5. Read grants
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('participant');
SELECT throws_ok($$INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('member'), auth.uid())$$, '42501', NULL, 'grant participant: cannot add readers');
SELECT pg_temp.as_user('facilitator');
SELECT throws_ok($$INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('member'), pg_temp.uid('creator'))$$, '42501', NULL, 'grant facilitator: cannot record someone else as granter');
SELECT throws_ok($$INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('outsider'), auth.uid())$$, '42501', NULL, 'grant facilitator: cannot add someone outside the community');
SELECT throws_ok($$INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by) VALUES ('5e880000-0000-4000-8000-0000000000e2', pg_temp.uid('assignee'), auth.uid())$$, '42501', NULL, 'grant facilitator: cannot add readers to another community''s meeting');
SELECT lives_ok($$INSERT INTO public.meeting_read_grants (meeting_id, user_id, granted_by) VALUES ('5e880000-0000-4000-8000-0000000000e1', pg_temp.uid('member'), auth.uid())$$, 'grant facilitator: adds a community member as reader');
SELECT is((SELECT count(*)::int FROM public.meeting_read_grants WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 2, 'grant facilitator: sees all grants of the meeting');
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.visible(t, '5e880000-0000-4000-8000-0000000000e1') > 0, t <> 'meeting_agreements', format('grant: added reader sees M1 %s (agreement was deleted above)', t)) FROM content_tables ORDER BY t;
SELECT is((SELECT count(*)::int FROM public.meeting_read_grants WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 1, 'grant: a reader sees only their own grant');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_read_grants WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'grant: a reader cannot remove grants');
SELECT pg_temp.as_user('participant');
SELECT is((SELECT count(*)::int FROM public.meeting_read_grants WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1'), 0, 'grant: a participant does not see the grant list');
SELECT pg_temp.as_user('creator');
SELECT is(pg_temp.exec_count($q$DELETE FROM public.meeting_read_grants WHERE meeting_id = '5e880000-0000-4000-8000-0000000000e1' AND user_id = pg_temp.uid('member')$q$), 1, 'grant creator: removes a reader');
SELECT pg_temp.as_user('member');
SELECT is(pg_temp.visible('meeting_commitments', '5e880000-0000-4000-8000-0000000000e1'), 0, 'grant: removed reader no longer sees M1');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 6. Storage paths
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('facilitator');
SELECT lives_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/2-nuevo.pdf', auth.uid())$$, 'storage facilitator: uploads under the meeting folder');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a2/5e880000-0000-4000-8000-0000000000e1/3-x.pdf', auth.uid())$$, '42501', NULL, 'storage facilitator: wrong workspace folder denied');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/no-es-uuid/3-x.pdf', auth.uid())$$, '42501', NULL, 'storage facilitator: malformed path denied');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a2/5e880000-0000-4000-8000-0000000000e2/3-x.pdf', auth.uid())$$, '42501', NULL, 'storage facilitator: another community''s meeting denied');
SELECT is(pg_temp.upd_storage('5e880000-0000-4000-8000-0000000000e1'), 0, 'storage facilitator: no UPDATE in the bucket');
SELECT pg_temp.as_user('participant');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/4-participant.pdf', auth.uid())$$, '42501', NULL, 'storage participant: cannot upload');
SELECT is(pg_temp.del_storage('5e880000-0000-4000-8000-0000000000e1'), 0, 'storage participant: deletes nothing');
SELECT pg_temp.as_user('granted');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/4-granted.pdf', auth.uid())$$, '42501', NULL, 'storage granted: cannot upload');
SELECT is(pg_temp.del_storage('5e880000-0000-4000-8000-0000000000e1'), 0, 'storage granted: deletes nothing');
SELECT pg_temp.as_user('member');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/4-member.pdf', auth.uid())$$, '42501', NULL, 'storage member: cannot upload');
SELECT is(pg_temp.del_storage('5e880000-0000-4000-8000-0000000000e1'), 0, 'storage member: deletes nothing');
SELECT pg_temp.as_user('gated_editor');
SELECT throws_ok($$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('meeting-documents', '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/5-gated.pdf', auth.uid())$$, '42501', NULL, 'storage gated secretary: cannot upload');
SELECT is(pg_temp.del_storage('5e880000-0000-4000-8000-0000000000e1'), 0, 'storage gated secretary: deletes nothing');
SELECT pg_temp.as_user('member');
SELECT throws_ok($q$UPDATE storage.objects SET bucket_id = 'meeting-documents', name = '5e880000-0000-4000-8000-0000000000a1/5e880000-0000-4000-8000-0000000000e1/9-movido.pdf' WHERE bucket_id = 'smh8-other'$q$, '42501', NULL, 'storage member: cannot move an object into the meeting bucket');
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'smh8-other'), 1, 'storage: the limits do not hide other buckets');
SELECT pg_temp.as_user('creator');
SELECT is(pg_temp.exec_count($q$UPDATE storage.objects SET bucket_id = 'smh8-other', name = 'libre/sacado.pdf' WHERE bucket_id = 'meeting-documents' AND split_part(name, '/', 2) = '5e880000-0000-4000-8000-0000000000e1'$q$), 0, 'storage creator: cannot move a meeting document out of the bucket');
SELECT is(pg_temp.upd_storage('5e880000-0000-4000-8000-0000000000e1'), 0, 'storage creator: no UPDATE even with the Production permissive policy');
SELECT is(pg_temp.del_storage('5e880000-0000-4000-8000-0000000000e1'), 2, 'storage creator: deletes the meeting documents');
SELECT is(pg_temp.del_storage('5e880000-0000-4000-8000-0000000000e2'), 0, 'storage creator: deletes nothing of M2');
SELECT pg_temp.reset_auth();

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('creator');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (True, True, True)$$, 'rights creator: edit=t delete=t read=t');
SELECT pg_temp.as_user('facilitator');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (True, False, True)$$, 'rights facilitator: edit=t delete=f read=t');
SELECT pg_temp.as_user('leader');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (True, True, True)$$, 'rights leader: edit=t delete=t read=t');
SELECT pg_temp.as_user('admin');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (True, True, True)$$, 'rights admin: edit=t delete=t read=t');
SELECT pg_temp.as_user('consultor');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (True, False, True)$$, 'rights consultor: edit=t delete=f read=t');
SELECT pg_temp.as_user('participant');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (False, False, True)$$, 'rights participant: edit=f delete=f read=t');
SELECT pg_temp.as_user('legacy');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (False, False, True)$$, 'rights legacy: edit=f delete=f read=t');
SELECT pg_temp.as_user('member');
SELECT results_eq($$SELECT can_edit, can_delete, can_read_content FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])$$,
  $$VALUES (False, False, False)$$, 'rights member: edit=f delete=f read=f');
SELECT pg_temp.as_user('gated');
SELECT is((SELECT count(*)::int FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1']::uuid[])), 0, 'rights gated: password gate hides the meeting');
SELECT pg_temp.as_user('gated');
SELECT is((SELECT count(*)::int FROM public.get_overdue_items('5e880000-0000-4000-8000-0000000000a1'::uuid, NULL)), 0, 'overdue gated participant: nothing');
SELECT is((SELECT count(*)::int FROM public.get_overdue_items(NULL, NULL)), 0, 'overdue gated assignee, own mode: their own overdue task is withheld until the password is changed');
SELECT ok(NOT public.can_read_meeting_content(auth.uid(), '5e880000-0000-4000-8000-0000000000e1'), 'gated participant: can_read_meeting_content is false');
SELECT pg_temp.as_user('member');
SELECT ok(NOT public.is_meeting_community_member(pg_temp.uid('participant'), '5e880000-0000-4000-8000-0000000000e1'), 'membership probe: a non-editor gets no answer');
SELECT pg_temp.as_user('facilitator');
SELECT ok(public.is_meeting_community_member(pg_temp.uid('participant'), '5e880000-0000-4000-8000-0000000000e1'), 'membership probe: an editor of the meeting gets the answer');
SELECT ok(NOT public.is_meeting_community_member(pg_temp.uid('assignee'), '5e880000-0000-4000-8000-0000000000e2'), 'membership probe: not for another community''s meeting');
SELECT pg_temp.as_user('outsider');
SELECT is((SELECT count(*)::int FROM public.get_my_meeting_rights(ARRAY['5e880000-0000-4000-8000-0000000000e1', '5e880000-0000-4000-8000-0000000000e2']::uuid[])), 0, 'rights outsider: no meeting returned');
SELECT pg_temp.as_user('member');
SELECT ok(NOT public.can_read_meeting_content(pg_temp.uid('creator'), '5e880000-0000-4000-8000-0000000000e1'), 'actor binding: a member cannot ask on behalf of the creator');
SELECT ok(NOT public.can_delete_meeting(pg_temp.uid('creator'), '5e880000-0000-4000-8000-0000000000e1'), 'actor binding: can_delete_meeting refuses another user id');
SELECT is((SELECT count(*)::int FROM public.get_overdue_items('5e880000-0000-4000-8000-0000000000a1'::uuid, NULL)), 0, 'overdue: a non-participant member sees no titles of the workspace');
SELECT pg_temp.as_user('participant');
SELECT is((SELECT count(*)::int FROM public.get_overdue_items('5e880000-0000-4000-8000-0000000000a1'::uuid, NULL)), 2, 'overdue: a participant sees the overdue items of their meeting');
SELECT pg_temp.as_user('assignee');
SELECT is((SELECT count(*)::int FROM public.get_overdue_items(NULL, NULL)), 1, 'overdue: own mode returns the assignee''s task');
SELECT pg_temp.reset_auth();

SELECT * FROM finish();
ROLLBACK;
