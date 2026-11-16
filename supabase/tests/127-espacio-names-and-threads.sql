-- =============================================================================
-- 127-espacio-names-and-threads.sql — GENERA fixes F11 (16 Nov 2026):
-- Espacio Colaborativo conversations and people's names.
--
--   EC-S4  a member creates a conversation with a plain INSERT and reads it
--          back in a second request; INSERT … RETURNING on message_threads
--          is refused by the RESTRICTIVE read rule messaging_read_boundary
--          (unchanged); a person outside the community still cannot create one
--
-- Personas (invented): two members of community A (school 9271), a member of
-- community B (same school), a member of community C (school 9272), a
-- consultor of school 9273 (foundation staff), an admin.
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT * FROM no_plan();

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('f11_a1');     -- docente, community A, school 9271
SELECT tests.create_supabase_user('f11_a2');     -- docente, community A, school 9271
SELECT tests.create_supabase_user('f11_b');      -- docente, community B, school 9271
SELECT tests.create_supabase_user('f11_c');      -- docente, community C, school 9272
SELECT tests.create_supabase_user('f11_staff');  -- consultor, school 9273
SELECT tests.create_supabase_user('f11_admin');  -- admin
SELECT tests.create_supabase_user('f11_cons2');  -- consultor of school 9274, assigned to school 9272

INSERT INTO public.profiles (id, email, name, first_name, last_name, avatar_url, approval_status)
SELECT pg_temp.uid(k), k || '@f11.test.local', k, fn, ln, 'https://example.invalid/' || k || '.png', 'approved'
  FROM (VALUES ('f11_a1', 'Ana', 'Uno'), ('f11_a2', 'María-José', 'Núñez'), ('f11_b', 'Bruno', 'Dos'),
               ('f11_c', 'Carla', 'Tres'), ('f11_staff', 'Sofía', 'Staff'), ('f11_admin', 'Adán', 'Admin'),
               ('f11_cons2', 'Ciro', 'Asesor')) v(k, fn, ln)
ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  avatar_url = EXCLUDED.avatar_url, email = EXCLUDED.email, approval_status = 'approved';

INSERT INTO public.schools (id, name) VALUES
  (9271, 'F11 school (pgTAP 127)'), (9272, 'F11 other school (pgTAP 127)'), (9273, 'F11 staff school (pgTAP 127)'),
  (9274, 'F11 consultor school (pgTAP 127)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('12700000-0000-4000-8000-0000000000c1', 9271, 'F11 community A'),
  ('12700000-0000-4000-8000-0000000000c2', 9271, 'F11 community B'),
  ('12700000-0000-4000-8000-0000000000c3', 9272, 'F11 community C');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('12700000-0000-4000-8000-0000000000b1', '12700000-0000-4000-8000-0000000000c1', 'F11 workspace A'),
  ('12700000-0000-4000-8000-0000000000b2', '12700000-0000-4000-8000-0000000000c2', 'F11 workspace B'),
  ('12700000-0000-4000-8000-0000000000b3', '12700000-0000-4000-8000-0000000000c3', 'F11 workspace C');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('f11_a1'),    'docente',   9271, '12700000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f11_a2'),    'docente',   9271, '12700000-0000-4000-8000-0000000000c1', true),
  (pg_temp.uid('f11_b'),     'docente',   9271, '12700000-0000-4000-8000-0000000000c2', true),
  (pg_temp.uid('f11_c'),     'docente',   9272, '12700000-0000-4000-8000-0000000000c3', true),
  (pg_temp.uid('f11_staff'), 'consultor', 9273, NULL, true),
  (pg_temp.uid('f11_admin'), 'admin',     NULL, NULL, true),
  (pg_temp.uid('f11_cons2'), 'consultor', 9274, NULL, true);
-- f11_cons2 is assigned (consultant_assignments, as the application records it) to school 9272.
INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, assignment_type)
VALUES (pg_temp.uid('f11_cons2'), 9272, true, 'monitoring');

-- ----------------------------------------------------------------------------
-- EC-S4: creating a conversation as a member of community A
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('f11_a1');

-- What the old code sent (insert and ask for the row back): refused, and stays so.
SELECT throws_ok($q$INSERT INTO public.message_threads (workspace_id, thread_title, category, created_by)
                    VALUES ('12700000-0000-4000-8000-0000000000b1', 'F11 returning', 'general', auth.uid()) RETURNING id$q$,
  '42501', 'new row violates row-level security policy "messaging_read_boundary" for table "message_threads"',
  'EC-S4 member: INSERT … RETURNING on message_threads is refused by the read rule (unchanged)');

-- What the fixed code sends: its own id, a plain INSERT, then a read by that id.
SELECT lives_ok($q$INSERT INTO public.message_threads (id, workspace_id, thread_title, description, category, custom_category_name,
                      created_by, is_pinned, is_locked, is_archived, last_message_at, message_count, participant_count)
                    VALUES ('12700000-0000-4000-8000-000000000301', '12700000-0000-4000-8000-0000000000b1', 'F11 thread A', 'd',
                      'custom', 'Mi categoría', auth.uid(), false, false, false, now(), 1, 1)$q$,
  'EC-S4 member: a plain INSERT of a conversation (with its own id and custom category name) is accepted');
SELECT is((SELECT custom_category_name::text FROM public.message_threads WHERE id = '12700000-0000-4000-8000-000000000301'),
  'Mi categoría', 'EC-S4 member: the conversation is read back by its id in a second request, custom category name kept');

-- The first message of the conversation, as the fixed code sends it (no returning) …
SELECT lives_ok($q$INSERT INTO public.community_messages (id, workspace_id, thread_id, author_id, content, message_type, is_edited, is_deleted)
                    VALUES ('12700000-0000-4000-8000-000000000401', '12700000-0000-4000-8000-0000000000b1',
                      '12700000-0000-4000-8000-000000000301', auth.uid(), 'Primer mensaje', 'regular', false, false)$q$,
  'EC-S4 member: the first message of the new conversation is accepted');
-- … and what the database answers to the other inserts that ask for a row back.
SELECT lives_ok($q$INSERT INTO public.community_messages (workspace_id, thread_id, author_id, content)
                    VALUES ('12700000-0000-4000-8000-0000000000b1', '12700000-0000-4000-8000-000000000301', auth.uid(), 'Segundo') RETURNING id$q$,
  'EC-S4 member: INSERT … RETURNING on community_messages is accepted (its rule does not look the new row up)');
SELECT lives_ok($q$INSERT INTO public.message_attachments (message_id, file_name, file_size, mime_type, storage_path, uploaded_by)
                    VALUES ('12700000-0000-4000-8000-000000000401', 'f11.pdf', 10, 'application/pdf', 'https://example.invalid/f11.pdf', auth.uid()) RETURNING id$q$,
  'EC-S4 member: INSERT … RETURNING on message_attachments is accepted (its rule reads the parent message)');
SELECT throws_ok($q$INSERT INTO public.message_mentions (message_id, mentioned_user_id, mention_text)
                    VALUES ('12700000-0000-4000-8000-000000000401', auth.uid(), '@Ana_Uno')$q$,
  '42501', NULL, 'EC-S4 member: message_mentions is written only by the server (no insert rule for members), as before');
-- Counters, as the fixed code updates them after the first message.
SELECT is((SELECT count(*)::int FROM public.message_threads WHERE id = '12700000-0000-4000-8000-000000000301'),
  1, 'EC-S4 member: the new conversation is in the list of the workspace');

-- ----------------------------------------------------------------------------
-- EC-S4: a person outside the community still cannot create one there
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('f11_c');
SELECT throws_ok($q$INSERT INTO public.message_threads (id, workspace_id, thread_title, category, created_by)
                    VALUES ('12700000-0000-4000-8000-000000000302', '12700000-0000-4000-8000-0000000000b1', 'F11 outsider', 'general', auth.uid())$q$,
  '42501', NULL, 'EC-S4 outsider: a plain INSERT into community A''s workspace is refused');
SELECT is((SELECT count(*)::int FROM public.message_threads WHERE id = '12700000-0000-4000-8000-000000000301'),
  0, 'EC-S4 outsider: community A''s conversation is not readable');

-- ----------------------------------------------------------------------------
-- EC-S5: other people's names reach the screens through get_profile_cards
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('f11_a1');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = pg_temp.uid('f11_a2')),
  0, 'EC-S5 member: a co-member''s profile row is still not readable (profiles rules unchanged)');
RESET ROLE;
SELECT ok(to_regprocedure('public.get_profile_cards(uuid[])') IS NOT NULL,
  'EC-S5 catalog: public.get_profile_cards(uuid[]) exists');
SELECT is((SELECT pg_get_function_result('public.get_profile_cards(uuid[])'::regprocedure)),
  'TABLE(id uuid, first_name text, last_name text, avatar_url text)',
  'EC-S5 catalog: it returns exactly id, first_name, last_name, avatar_url');
SELECT ok((SELECT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = 'public.get_profile_cards(uuid[])'::regprocedure),
  'EC-S5 catalog: STABLE, SECURITY DEFINER');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.get_profile_cards(uuid[])'::regprocedure),
  ARRAY['search_path=public, pg_temp'], 'EC-S5 catalog: search_path = public, pg_temp');
SELECT ok(NOT has_function_privilege('anon', 'public.get_profile_cards(uuid[])', 'EXECUTE'), 'EC-S5 catalog: anon may not execute');
SELECT ok(has_function_privilege('authenticated', 'public.get_profile_cards(uuid[])', 'EXECUTE'), 'EC-S5 catalog: authenticated may execute');
SELECT ok(has_function_privilege('service_role', 'public.get_profile_cards(uuid[])', 'EXECUTE'), 'EC-S5 catalog: service_role may execute');
SELECT is((SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
            WHERE p.oid = 'public.get_profile_cards(uuid[])'::regprocedure AND a.grantee = 0), 0,
  'EC-S5 catalog: PUBLIC holds no EXECUTE');

CREATE OR REPLACE FUNCTION pg_temp.cards(k text[]) RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(string_agg(c.first_name || ' ' || c.last_name, ', ' ORDER BY c.first_name), '')
    FROM public.get_profile_cards(ARRAY(SELECT pg_temp.uid(x) FROM unnest(k) x)) c
$$;
GRANT EXECUTE ON FUNCTION pg_temp.cards(text[]) TO authenticated;

SELECT tests.authenticate_as('f11_a1');
SELECT is(pg_temp.cards(ARRAY['f11_a1']), 'Ana Uno', 'EC-S5 member: own card');
SELECT is(pg_temp.cards(ARRAY['f11_a2']), 'María-José Núñez', 'EC-S5 member: card of a co-member of the community');
SELECT is(pg_temp.cards(ARRAY['f11_b']), 'Bruno Dos', 'EC-S5 member: card of a person of the same school, another community');
SELECT is(pg_temp.cards(ARRAY['f11_c']), '', 'EC-S5 member: no row for a person of another school and community');
SELECT is(pg_temp.cards(ARRAY['f11_staff', 'f11_admin']), 'Adán Admin, Sofía Staff', 'EC-S5 member: cards of foundation staff (admin, consultor)');
SELECT is(pg_temp.cards(ARRAY['f11_a1', 'f11_a2', 'f11_b', 'f11_c', 'f11_staff']), 'Ana Uno, Bruno Dos, María-José Núñez, Sofía Staff',
  'EC-S5 member: one call, only the people the caller may know');
SELECT is((SELECT count(*)::int FROM public.get_profile_cards(ARRAY['12700000-0000-4000-8000-00000000dead']::uuid[])),
  0, 'EC-S5 member: no row for an unknown id');
SELECT is((SELECT count(*)::int FROM public.get_profile_cards(NULL)), 0, 'EC-S5 member: no row for a NULL list');
SELECT is((SELECT count(*)::int FROM public.get_profile_cards(ARRAY[pg_temp.uid('f11_a2'), pg_temp.uid('f11_a2')])),
  1, 'EC-S5 member: an id asked twice gives one row');
-- More than 200 ids: only the first 200 are looked at.
SELECT is((SELECT count(*)::int FROM public.get_profile_cards(
            ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 199)) || pg_temp.uid('f11_a2') || pg_temp.uid('f11_b'))),
  1, 'EC-S5 member: with 201 ids, the id at place 200 is answered and the one at place 201 is not');
SELECT is((SELECT array_agg(c.id::text) FROM public.get_profile_cards(ARRAY[pg_temp.uid('f11_a2')]) c),
  ARRAY[pg_temp.uid('f11_a2')::text], 'EC-S5 member: the row carries the asked id');
SELECT is((SELECT avatar_url FROM public.get_profile_cards(ARRAY[pg_temp.uid('f11_a2')])),
  'https://example.invalid/f11_a2.png', 'EC-S5 member: the card carries the picture');

RESET ROLE;
SELECT tests.authenticate_as('f11_c');
SELECT is(pg_temp.cards(ARRAY['f11_a1', 'f11_a2', 'f11_b']), '', 'EC-S5 other school: no card of community A or B people');
SELECT is(pg_temp.cards(ARRAY['f11_c', 'f11_staff']), 'Carla Tres, Sofía Staff', 'EC-S5 other school: own card and staff card');

RESET ROLE;
SELECT tests.authenticate_as('f11_cons2');
SELECT is(pg_temp.cards(ARRAY['f11_c', 'f11_a1']), 'Carla Tres',
  'EC-S5 consultor: card of a person of the assigned school (9272), none of an unassigned school (9271)');

RESET ROLE;
SELECT tests.authenticate_as('f11_admin');
SELECT is(pg_temp.cards(ARRAY['f11_a1', 'f11_a2', 'f11_b', 'f11_c', 'f11_cons2']), 'Ana Uno, Bruno Dos, Carla Tres, Ciro Asesor, María-José Núñez',
  'EC-S5 admin: any id');

-- ----------------------------------------------------------------------------
-- EC-M3: the reactions query the page now sends works for a member
-- ----------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.message_reactions (id, message_id, user_id, reaction_type) VALUES
  ('12700000-0000-4000-8000-000000000501', '12700000-0000-4000-8000-000000000401', pg_temp.uid('f11_a1'), 'heart'),
  ('12700000-0000-4000-8000-000000000502', '12700000-0000-4000-8000-000000000401', pg_temp.uid('f11_a2'), 'heart');
SELECT tests.authenticate_as('f11_a2');
SELECT is((SELECT array_agg(user_id ORDER BY id)::text FROM (
             SELECT id, message_id, user_id, reaction_type, created_at FROM public.message_reactions
              WHERE message_id IN ('12700000-0000-4000-8000-000000000401')) r),
  (SELECT ARRAY[pg_temp.uid('f11_a1'), pg_temp.uid('f11_a2')]::text),
  'EC-M3 member: the reactions of a message of the community are read back after a reload');
SELECT is((SELECT count(*)::int FROM public.get_profile_cards(ARRAY[pg_temp.uid('f11_a1'), pg_temp.uid('f11_a2')])),
  2, 'EC-M3 member: and the names of the people who reacted come from their cards');
RESET ROLE;
SELECT tests.authenticate_as('f11_c');
SELECT is((SELECT count(*)::int FROM public.message_reactions WHERE message_id IN ('12700000-0000-4000-8000-000000000401')),
  0, 'EC-M3 outsider: no reactions of community A''s messages');

-- ----------------------------------------------------------------------------
-- EC-M10: the columns the sort options now map to exist; the old two do not
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT is((SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public'
            AND ((table_name = 'community_messages' AND column_name = 'created_at')
              OR (table_name = 'message_threads' AND column_name IN ('last_message_at', 'created_at', 'message_count', 'participant_count', 'thread_title')))),
  6, 'EC-M10 catalog: every column a sort option maps to exists');
SELECT is((SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public'
            AND table_name = 'community_messages' AND column_name IN ('relevance', 'thread_activity')),
  0, 'EC-M10 catalog: community_messages has no relevance or thread_activity column');

RESET ROLE;
SELECT set_config('role', 'anon', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT throws_ok($q$SELECT * FROM public.get_profile_cards(ARRAY['12700000-0000-4000-8000-00000000dead']::uuid[])$q$,
  '42501', NULL, 'EC-S5 anon: permission denied');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
