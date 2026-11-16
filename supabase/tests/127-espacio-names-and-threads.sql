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

INSERT INTO public.profiles (id, email, name, first_name, last_name, avatar_url, approval_status)
SELECT pg_temp.uid(k), k || '@f11.test.local', k, fn, ln, 'https://example.invalid/' || k || '.png', 'approved'
  FROM (VALUES ('f11_a1', 'Ana', 'Uno'), ('f11_a2', 'María-José', 'Núñez'), ('f11_b', 'Bruno', 'Dos'),
               ('f11_c', 'Carla', 'Tres'), ('f11_staff', 'Sofía', 'Staff'), ('f11_admin', 'Adán', 'Admin')) v(k, fn, ln)
ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
  avatar_url = EXCLUDED.avatar_url, email = EXCLUDED.email, approval_status = 'approved';

INSERT INTO public.schools (id, name) VALUES
  (9271, 'F11 school (pgTAP 127)'), (9272, 'F11 other school (pgTAP 127)'), (9273, 'F11 staff school (pgTAP 127)')
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
  (pg_temp.uid('f11_admin'), 'admin',     NULL, NULL, true);

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

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
