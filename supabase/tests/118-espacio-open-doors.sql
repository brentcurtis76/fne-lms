-- =============================================================================
-- 118-espacio-open-doors.sql — F3 (16 Nov 2026), migration
-- 20261116171000_espacio_close_open_doors.sql:
--   EC-S2    posts_with_engagement runs with the caller's rights; anon refused
--   EC-V8    a post keeps its community and author, a comment its post,
--            parent and author, for every signed-in caller
--   EC-SMALL workspace_activities, post_reactions, post_mentions,
--            message_reactions and post_hashtags read (and activity insert)
--            only within the communities the caller can enter; a message
--            reaction is added only to a message the person can read
--
-- Personas: anon; member of community A; member of community B only; a
-- consultor of the school of both; a signed-in person of another school with
-- no community; an admin. Synthetic/local state only. Rolls back.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(63);

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
CREATE OR REPLACE FUNCTION pg_temp.affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
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

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('f3_a');      -- docente, community A (school 9181)
SELECT tests.create_supabase_user('f3_b');      -- docente, community B (school 9181)
SELECT tests.create_supabase_user('f3_cons');   -- consultor, school 9181
SELECT tests.create_supabase_user('f3_out');    -- docente, school 9182, no community
SELECT tests.create_supabase_user('f3_admin');  -- admin

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@f3.test.local', k, 'approved'
  FROM unnest(ARRAY['f3_a','f3_b','f3_cons','f3_out','f3_admin']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9181, 'F3 school (pgTAP 118)'), (9182, 'F3 other school (pgTAP 118)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('11800000-0000-4000-8000-0000000000c1', 9181, 'F3 community A'),
  ('11800000-0000-4000-8000-0000000000c2', 9181, 'F3 community B');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('11800000-0000-4000-8000-0000000000b1', '11800000-0000-4000-8000-0000000000c1', 'F3 workspace A'),
  ('11800000-0000-4000-8000-0000000000b2', '11800000-0000-4000-8000-0000000000c2', 'F3 workspace B');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f3_a'),     'docente',   9181, '11800000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f3_b'),     'docente',   9181, '11800000-0000-4000-8000-0000000000c2', true),
  (pg_temp.uid('f3_cons'),  'consultor', 9181, NULL, true),
  (pg_temp.uid('f3_out'),   'docente',   9182, NULL, true),
  (pg_temp.uid('f3_admin'), 'admin',     NULL, NULL, true);

INSERT INTO public.community_posts (id, workspace_id, author_id, type, content) VALUES
  ('11800000-0000-4000-8000-0000000000a1', '11800000-0000-4000-8000-0000000000b1', pg_temp.uid('f3_a'), 'text', '{"text":"F3 post A"}'::jsonb),
  ('11800000-0000-4000-8000-0000000000a2', '11800000-0000-4000-8000-0000000000b2', pg_temp.uid('f3_b'), 'text', '{"text":"F3 post B"}'::jsonb);
INSERT INTO public.post_comments (id, post_id, author_id, content) VALUES
  ('11800000-0000-4000-8000-0000000000d1', '11800000-0000-4000-8000-0000000000a1', pg_temp.uid('f3_a'), 'F3 comment A'),
  ('11800000-0000-4000-8000-0000000000d2', '11800000-0000-4000-8000-0000000000a2', pg_temp.uid('f3_b'), 'F3 comment B');
INSERT INTO public.post_hashtags (id, post_id, hashtag) VALUES
  ('11800000-0000-4000-8000-000000000601', '11800000-0000-4000-8000-0000000000a1', 'f3hashtag');
INSERT INTO public.post_reactions (id, post_id, user_id, reaction_type) VALUES
  ('11800000-0000-4000-8000-0000000000e1', '11800000-0000-4000-8000-0000000000a1', pg_temp.uid('f3_cons'), 'like'),
  ('11800000-0000-4000-8000-0000000000e2', '11800000-0000-4000-8000-0000000000a2', pg_temp.uid('f3_cons'), 'like');
INSERT INTO public.post_mentions (id, post_id, mentioned_user_id) VALUES
  ('11800000-0000-4000-8000-0000000000f1', '11800000-0000-4000-8000-0000000000a1', pg_temp.uid('f3_cons')),
  ('11800000-0000-4000-8000-0000000000f2', '11800000-0000-4000-8000-0000000000a2', pg_temp.uid('f3_cons'));
INSERT INTO public.post_media (id, post_id, type, url) VALUES
  ('11800000-0000-4000-8000-000000000101', '11800000-0000-4000-8000-0000000000a1', 'image', 'https://example.invalid/f3.png');
INSERT INTO public.workspace_activities (id, workspace_id, user_id, activity_type) VALUES
  ('11800000-0000-4000-8000-000000000201', '11800000-0000-4000-8000-0000000000b1', pg_temp.uid('f3_a'), 'workspace_accessed'),
  ('11800000-0000-4000-8000-000000000202', '11800000-0000-4000-8000-0000000000b2', pg_temp.uid('f3_b'), 'workspace_accessed');
INSERT INTO public.message_threads (id, workspace_id, thread_title, created_by) VALUES
  ('11800000-0000-4000-8000-000000000301', '11800000-0000-4000-8000-0000000000b1', 'F3 thread A', pg_temp.uid('f3_a')),
  ('11800000-0000-4000-8000-000000000302', '11800000-0000-4000-8000-0000000000b2', 'F3 thread B', pg_temp.uid('f3_b'));
INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content) VALUES
  ('11800000-0000-4000-8000-000000000401', '11800000-0000-4000-8000-0000000000b1', '11800000-0000-4000-8000-000000000301', pg_temp.uid('f3_a'), 'F3 message A'),
  ('11800000-0000-4000-8000-000000000402', '11800000-0000-4000-8000-0000000000b2', '11800000-0000-4000-8000-000000000302', pg_temp.uid('f3_b'), 'F3 message B');
INSERT INTO public.message_reactions (id, message_id, user_id, reaction_type) VALUES
  ('11800000-0000-4000-8000-000000000501', '11800000-0000-4000-8000-000000000401', pg_temp.uid('f3_cons'), 'thumbs_up');

-- ----------------------------------------------------------------------------
-- anon
-- ----------------------------------------------------------------------------
SELECT pg_temp.set_anon();
SELECT throws_ok($q$SELECT count(*) FROM public.posts_with_engagement WHERE id IN ('11800000-0000-4000-8000-0000000000a1','11800000-0000-4000-8000-0000000000a2')$q$,
  '42501', NULL, 'EC-S2 anon: the feed view is refused');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE id IN ('11800000-0000-4000-8000-0000000000e1','11800000-0000-4000-8000-0000000000e2')),
  0, 'EC-SMALL anon: no post reactions');
SELECT is((SELECT count(*)::int FROM public.post_mentions WHERE id IN ('11800000-0000-4000-8000-0000000000f1','11800000-0000-4000-8000-0000000000f2')),
  0, 'EC-SMALL anon: no post mentions');
SELECT is((SELECT count(*)::int FROM public.post_hashtags WHERE id = '11800000-0000-4000-8000-000000000601'),
  0, 'EC-SMALL anon: no post hashtags');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- member of B only
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f3_b');
SELECT is((SELECT count(*)::int FROM public.posts_with_engagement WHERE id = '11800000-0000-4000-8000-0000000000a1'),
  0, 'EC-S2 member B: community A''s post is not in the feed view');
SELECT is((SELECT count(*)::int FROM public.posts_with_engagement WHERE id = '11800000-0000-4000-8000-0000000000a2'),
  1, 'EC-S2 member B: own community''s post is in the feed view');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE id = '11800000-0000-4000-8000-0000000000e1'),
  0, 'EC-SMALL member B: A''s post reaction not readable');
SELECT is((SELECT count(*)::int FROM public.post_mentions WHERE id = '11800000-0000-4000-8000-0000000000f1'),
  0, 'EC-SMALL member B: A''s post mention not readable');
SELECT is((SELECT count(*)::int FROM public.workspace_activities WHERE id = '11800000-0000-4000-8000-000000000201'),
  0, 'EC-SMALL member B: A''s activity row not readable');
SELECT is((SELECT count(*)::int FROM public.message_reactions WHERE id = '11800000-0000-4000-8000-000000000501'),
  0, 'EC-SMALL member B: A''s message reaction not readable');
SELECT throws_ok($q$INSERT INTO public.workspace_activities (workspace_id, user_id, activity_type) VALUES ('11800000-0000-4000-8000-0000000000b1', auth.uid(), 'workspace_accessed')$q$,
  '42501', NULL, 'EC-SMALL member B: activity insert into workspace A refused');
SELECT throws_ok($q$INSERT INTO public.message_reactions (message_id, user_id, reaction_type) VALUES ('11800000-0000-4000-8000-000000000401', auth.uid(), 'thumbs_up')$q$,
  '42501', NULL, 'EC-SMALL member B: reaction on A''s message refused');
SELECT is((SELECT count(*)::int FROM public.post_hashtags WHERE id = '11800000-0000-4000-8000-000000000601'),
  0, 'EC-SMALL member B: A''s post hashtag not readable');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE id = '11800000-0000-4000-8000-0000000000e2'),
  1, 'EC-SMALL member B: own community''s post reaction readable');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- signed-in person of another school, no community
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f3_out');
SELECT is((SELECT count(*)::int FROM public.posts_with_engagement WHERE id IN ('11800000-0000-4000-8000-0000000000a1','11800000-0000-4000-8000-0000000000a2')),
  0, 'EC-S2 other school: no fixture post in the feed view');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- member of A: must still work
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f3_a');
SELECT is((SELECT format('%s/%s/%s', comment_count, reaction_count, media_count) FROM public.posts_with_engagement WHERE id = '11800000-0000-4000-8000-0000000000a1'),
  '1/1/1', 'EC-S2 member A: own post in the feed view with comment_count 1, reaction_count 1, media_count 1');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE id = '11800000-0000-4000-8000-0000000000e1'),
  1, 'EC-SMALL member A: A''s post reaction readable');
SELECT is((SELECT count(*)::int FROM public.post_mentions WHERE id = '11800000-0000-4000-8000-0000000000f1'),
  1, 'EC-SMALL member A: A''s post mention readable');
SELECT is((SELECT count(*)::int FROM public.workspace_activities WHERE id = '11800000-0000-4000-8000-000000000201'),
  1, 'EC-SMALL member A: A''s activity row readable');
SELECT is((SELECT count(*)::int FROM public.message_reactions WHERE id = '11800000-0000-4000-8000-000000000501'),
  1, 'EC-SMALL member A: A''s message reaction readable');
SELECT is((SELECT count(*)::int FROM public.post_hashtags WHERE id = '11800000-0000-4000-8000-000000000601'),
  1, 'EC-SMALL member A: A''s post hashtag readable');
SELECT throws_ok($q$INSERT INTO public.message_attachments (message_id, file_name, file_size, mime_type, storage_path, uploaded_by) VALUES ('11800000-0000-4000-8000-000000000402', 'f3.pdf', 1, 'application/pdf', 'f3-any-address', auth.uid())$q$,
  '42501', NULL, 'EC-S1c member A: attachment row on B''s message (unreachable) refused');
-- For the record: the uploader chooses storage_path, so a row on a message the
-- person CAN reach may point anywhere. This is why the download route binds a
-- file to the message id in the file's own path, not to the row's address.
SELECT lives_ok($q$INSERT INTO public.message_attachments (message_id, file_name, file_size, mime_type, storage_path, uploaded_by) VALUES ('11800000-0000-4000-8000-000000000401', 'f3.pdf', 1, 'application/pdf', 'http://127.0.0.1:54321/storage/v1/object/public/message-attachments/11800000-0000-4000-8000-0000000000b2/11800000-0000-4000-8000-000000000402/secret.pdf', auth.uid())$q$,
  'EC-S1c member A: attachment row on A''s own message with an arbitrary storage_path is accepted');
SELECT lives_ok($q$INSERT INTO public.workspace_activities (workspace_id, user_id, activity_type) VALUES ('11800000-0000-4000-8000-0000000000b1', auth.uid(), 'section_changed')$q$,
  'EC-SMALL member A: activity insert into own workspace');
SELECT lives_ok($q$INSERT INTO public.post_reactions (post_id, user_id, reaction_type) VALUES ('11800000-0000-4000-8000-0000000000a1', auth.uid(), 'love')$q$,
  'EC-SMALL member A: adds own reaction on A''s post');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE post_id = '11800000-0000-4000-8000-0000000000a1' AND user_id = auth.uid()),
  1, 'EC-SMALL member A: own new post reaction readable');
SELECT is(pg_temp.affected($q$DELETE FROM public.post_reactions WHERE post_id = '11800000-0000-4000-8000-0000000000a1' AND user_id = auth.uid()$q$),
  1, 'EC-SMALL member A: removes own reaction on A''s post');
SELECT lives_ok($q$INSERT INTO public.message_reactions (message_id, user_id, reaction_type) VALUES ('11800000-0000-4000-8000-000000000401', auth.uid(), 'heart')$q$,
  'EC-SMALL member A: adds own reaction on A''s message');
SELECT is(pg_temp.affected($q$DELETE FROM public.message_reactions WHERE message_id = '11800000-0000-4000-8000-000000000401' AND user_id = auth.uid()$q$),
  1, 'EC-SMALL member A: removes own reaction on A''s message');
SELECT is(pg_temp.affected($q$UPDATE public.community_posts SET content = '{"text":"F3 post A edited"}'::jsonb WHERE id = '11800000-0000-4000-8000-0000000000a1'$q$),
  1, 'EC-V8 member A: edits own post content');
SELECT is(pg_temp.affected($q$UPDATE public.post_comments SET content = 'F3 comment A edited', is_edited = true WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$),
  1, 'EC-V8 member A: edits own comment content');
SELECT lives_ok($q$SELECT public.increment_post_view_count('11800000-0000-4000-8000-0000000000a1')$q$,
  'EC-V8 member A: increment_post_view_count runs');
SELECT is((SELECT view_count FROM public.community_posts WHERE id = '11800000-0000-4000-8000-0000000000a1'),
  1, 'EC-V8 member A: increment_post_view_count updated view_count');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- consultor of the school of both: must still work
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f3_cons');
SELECT is((SELECT count(*)::int FROM public.posts_with_engagement WHERE id IN ('11800000-0000-4000-8000-0000000000a1','11800000-0000-4000-8000-0000000000a2')),
  2, 'EC-S2 consultor: both communities'' posts in the feed view');
SELECT is((SELECT format('%s/%s/%s', comment_count, reaction_count, media_count) FROM public.posts_with_engagement WHERE id = '11800000-0000-4000-8000-0000000000a1'),
  '1/1/1', 'EC-S2 consultor: A''s post counts 1/1/1');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE id IN ('11800000-0000-4000-8000-0000000000e1','11800000-0000-4000-8000-0000000000e2')),
  2, 'EC-SMALL consultor: both post reactions');
SELECT is((SELECT count(*)::int FROM public.post_mentions WHERE id IN ('11800000-0000-4000-8000-0000000000f1','11800000-0000-4000-8000-0000000000f2')),
  2, 'EC-SMALL consultor: both post mentions');
SELECT is((SELECT count(*)::int FROM public.workspace_activities WHERE id IN ('11800000-0000-4000-8000-000000000201','11800000-0000-4000-8000-000000000202')),
  2, 'EC-SMALL consultor: both activity rows');
SELECT is((SELECT count(*)::int FROM public.message_reactions WHERE id = '11800000-0000-4000-8000-000000000501'),
  1, 'EC-SMALL consultor: A''s message reaction');
SELECT is((SELECT count(*)::int FROM public.post_hashtags WHERE id = '11800000-0000-4000-8000-000000000601'),
  1, 'EC-SMALL consultor: A''s post hashtag');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- admin: must still work
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f3_admin');
SELECT is((SELECT count(*)::int FROM public.posts_with_engagement WHERE id IN ('11800000-0000-4000-8000-0000000000a1','11800000-0000-4000-8000-0000000000a2')),
  2, 'EC-S2 admin: all fixture posts in the feed view');
SELECT is((SELECT format('%s/%s/%s', comment_count, reaction_count, media_count) FROM public.posts_with_engagement WHERE id = '11800000-0000-4000-8000-0000000000a1'),
  '1/1/1', 'EC-S2 admin: A''s post counts 1/1/1');
SELECT is((SELECT count(*)::int FROM public.post_reactions WHERE id IN ('11800000-0000-4000-8000-0000000000e1','11800000-0000-4000-8000-0000000000e2')),
  2, 'EC-SMALL admin: both post reactions');
SELECT is((SELECT count(*)::int FROM public.post_mentions WHERE id IN ('11800000-0000-4000-8000-0000000000f1','11800000-0000-4000-8000-0000000000f2')),
  2, 'EC-SMALL admin: both post mentions');
SELECT is((SELECT count(*)::int FROM public.workspace_activities WHERE id IN ('11800000-0000-4000-8000-000000000201','11800000-0000-4000-8000-000000000202')),
  2, 'EC-SMALL admin: both activity rows');
SELECT is((SELECT count(*)::int FROM public.message_reactions WHERE id = '11800000-0000-4000-8000-000000000501'),
  1, 'EC-SMALL admin: A''s message reaction');
SELECT is((SELECT count(*)::int FROM public.post_hashtags WHERE id = '11800000-0000-4000-8000-000000000601'),
  1, 'EC-SMALL admin: A''s post hashtag');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- EC-V8: member A is ALSO made a member of B for this block, so the old
-- rules alone cannot refuse the move.
-- ----------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f3_a'), 'docente', 9181, '11800000-0000-4000-8000-0000000000c2', true);
-- a second person's comment on post A (added here so the counts above stay 1/1/1)
INSERT INTO public.post_comments (id, post_id, author_id, content) VALUES
  ('11800000-0000-4000-8000-0000000000d3', '11800000-0000-4000-8000-0000000000a1', pg_temp.uid('f3_cons'), 'F3 second comment on A');
SELECT tests.authenticate_as('f3_a');
SELECT ok(public.can_access_workspace(auth.uid(), '11800000-0000-4000-8000-0000000000b2'),
  'EC-V8 setup: member A can also enter workspace B');
SELECT throws_ok($q$UPDATE public.community_posts SET workspace_id = '11800000-0000-4000-8000-0000000000b2' WHERE id = '11800000-0000-4000-8000-0000000000a1'$q$,
  '42501', NULL, 'EC-V8 member A: moving own post to community B refused');
SELECT throws_ok($q$UPDATE public.community_posts SET author_id = (SELECT pg_temp.uid('f3_b')) WHERE id = '11800000-0000-4000-8000-0000000000a1'$q$,
  '42501', NULL, 'EC-V8 member A: handing own post to another author refused');
SELECT throws_ok($q$UPDATE public.post_comments SET post_id = '11800000-0000-4000-8000-0000000000a2' WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$,
  '42501', NULL, 'EC-V8 member A: moving own comment to B''s post refused');
SELECT throws_ok($q$UPDATE public.post_comments SET author_id = (SELECT pg_temp.uid('f3_b')) WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$,
  '42501', 'A comment cannot change post, parent or author', 'EC-V8 member A: handing own comment to another author refused (by the trigger)');
SELECT throws_ok($q$UPDATE public.post_comments SET parent_comment_id = '11800000-0000-4000-8000-0000000000d3' WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$,
  '42501', 'A comment cannot change post, parent or author', 'EC-V8 member A: giving own comment another comment as parent refused (by the trigger)');
SELECT is(pg_temp.affected($q$UPDATE public.post_comments SET content = 'F3 comment A edited again' WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$),
  1, 'EC-V8 member A: edits own comment content on a post with several comments');
SELECT lives_ok($q$SELECT public.increment_post_view_count('11800000-0000-4000-8000-0000000000a2')$q$,
  'EC-V8 member A (not the author of post B): increment_post_view_count raises no error');
RESET ROLE;
SELECT is((SELECT (author_id = pg_temp.uid('f3_a'))::text || ' ' || coalesce(parent_comment_id::text, 'null') FROM public.post_comments WHERE id = '11800000-0000-4000-8000-0000000000d1'),
  'true null', 'EC-V8: comment A keeps its author and has no parent');
SELECT is((SELECT workspace_id::text || ' ' || (author_id = pg_temp.uid('f3_a'))::text FROM public.community_posts WHERE id = '11800000-0000-4000-8000-0000000000a1'),
  '11800000-0000-4000-8000-0000000000b1 true', 'EC-V8: post A still in workspace A with its author');
SELECT is((SELECT post_id::text FROM public.post_comments WHERE id = '11800000-0000-4000-8000-0000000000d1'),
  '11800000-0000-4000-8000-0000000000a1', 'EC-V8: comment A still on post A');

-- no signed-in caller (superuser, no claims): not restricted
SELECT tests.clear_authentication();
SELECT ok(auth.uid() IS NULL, 'EC-V8 setup: no claims, auth.uid() is NULL');
SELECT is(pg_temp.affected($q$UPDATE public.community_posts SET workspace_id = '11800000-0000-4000-8000-0000000000b2' WHERE id = '11800000-0000-4000-8000-0000000000a1'$q$),
  1, 'EC-V8 superuser, no claims: post workspace_id update succeeds');
SELECT is(pg_temp.affected($q$UPDATE public.community_posts SET workspace_id = '11800000-0000-4000-8000-0000000000b1' WHERE id = '11800000-0000-4000-8000-0000000000a1'$q$),
  1, 'EC-V8 superuser, no claims: post workspace_id set back');
-- service role (backend, no signed-in caller): not restricted
SELECT pg_temp.set_service();
SELECT is(pg_temp.affected($q$UPDATE public.post_comments SET post_id = '11800000-0000-4000-8000-0000000000a2' WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$),
  1, 'EC-V8 service role: comment post_id update succeeds');
SELECT is(pg_temp.affected($q$UPDATE public.post_comments SET post_id = '11800000-0000-4000-8000-0000000000a1' WHERE id = '11800000-0000-4000-8000-0000000000d1'$q$),
  1, 'EC-V8 service role: comment post_id set back');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
