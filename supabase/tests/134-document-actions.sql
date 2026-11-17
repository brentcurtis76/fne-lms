-- =============================================================================
-- 134-document-actions.sql — GENERA fixes F12b, EC-D2a (+ N139): migration
-- 20261117163000_document_actions.sql.
--
-- Who may rename, move and hide (the screen's «Eliminar») a document of a
-- community's workspace: the community's leader, the person who uploaded it
-- while they still hold an active role in that community, and an admin
-- (owner decision 17 Nov 2026). "Hidden" means is_active = false: the row and
-- the stored file stay.
--
--   1. catalog: the five functions are definer, search_path pinned, no PUBLIC
--      and no anon grant, authenticated may execute, each has a comment; the
--      two questions are STABLE
--   2. can_manage_workspace_documents / can_manage_community_document answers
--   3. rename, move and hide, each as a real call by every kind of person:
--      allowed ones change only the named columns; refused ones change nothing
--   4. hidden: no signed-in person reads it through the table, the row still
--      exists, one access-log row 'delete', a second hide is refused
--   5. invalid title and folder refused, row unchanged; a folder of another
--      workspace refused; NULL folder means "no folder"
--   6. N139: a direct update of the table by the uploader, the leader or a
--      member changes nothing, whatever the column; an admin's still works;
--      the view counter (increment_document_counter) and an upload by a
--      member still work. (Section 3 runs with the narrowed rules in place,
--      so it also proves the functions still work for uploader and leader.)
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(171);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;

-- Workspaces and folders of the fixtures.
--   WA: workspace of community A; WB: workspace of community B
--   FA1, FA2: folders of WA; FB: folder of WB
CREATE OR REPLACE FUNCTION pg_temp.ws(k text) RETURNS uuid AS $$
  SELECT CASE k WHEN 'A' THEN 'f12b0000-0000-4000-8000-0000000000a1'::uuid
                WHEN 'B' THEN 'f12b0000-0000-4000-8000-0000000000a2'::uuid END;
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION pg_temp.folder(k text) RETURNS uuid AS $$
  SELECT CASE k WHEN 'FA1' THEN 'f12b0000-0000-4000-8000-0000000000b1'::uuid
                WHEN 'FA2' THEN 'f12b0000-0000-4000-8000-0000000000b2'::uuid
                WHEN 'FB'  THEN 'f12b0000-0000-4000-8000-0000000000b3'::uuid END;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.reset_auth() RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.become(p text) RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM tests.clear_authentication();
  IF p = 'anon' THEN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  ELSE
    PERFORM tests.authenticate_as('f12b_' || p);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run one statement as person p; 'ok', or SQLSTATE:message. Back to postgres after.
CREATE OR REPLACE FUNCTION pg_temp.call_as(p text, stmt text) RETURNS text AS $$
DECLARE r text := 'ok';
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    r := SQLSTATE || ':' || SQLERRM;
  END;
  PERFORM pg_temp.reset_auth();
  IF r LIKE '42501:permission denied%' THEN r := '42501:permission_denied'; END IF;
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- A boolean question asked as person p.
CREATE OR REPLACE FUNCTION pg_temp.ask_as(p text, q text) RETURNS text AS $$
DECLARE r text;
BEGIN
  PERFORM pg_temp.become(p);
  BEGIN
    EXECUTE q INTO r;
  EXCEPTION WHEN others THEN
    r := SQLSTATE || ':' || SQLERRM;
  END;
  PERFORM pg_temp.reset_auth();
  IF r LIKE '42501:permission denied%' THEN r := '42501:permission_denied'; END IF;
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- The whole row, read as postgres (no row rule hides it).
CREATE OR REPLACE FUNCTION pg_temp.row_json(d uuid) RETURNS jsonb AS $$
  SELECT to_jsonb(cd) FROM public.community_documents cd WHERE cd.id = d;
$$ LANGUAGE sql;

-- A fresh active document in workspace w uploaded by person up (as postgres).
CREATE OR REPLACE FUNCTION pg_temp.new_doc(w text, up text) RETURNS uuid AS $$
  INSERT INTO public.community_documents (workspace_id, folder_id, title, file_name, file_size, mime_type, storage_path, uploaded_by)
  VALUES (pg_temp.ws(w), NULL, 'Acta sintética', 'acta.pdf', 10, 'application/pdf',
          'documents/' || pg_temp.ws(w) || '/root/acta.pdf', pg_temp.uid(up))
  RETURNING id;
$$ LANGUAGE sql;

-- The folder a move targets: FA1 for a document of WA, FB for one of WB.
CREATE OR REPLACE FUNCTION pg_temp.target(d uuid) RETURNS uuid AS $$
  SELECT CASE WHEN (pg_temp.row_json(d)->>'workspace_id')::uuid = pg_temp.ws('B') THEN pg_temp.folder('FB') ELSE pg_temp.folder('FA1') END;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.stmt(kind text, d uuid) RETURNS text AS $$
  SELECT CASE kind
    WHEN 'rename' THEN format('SELECT public.rename_community_document(%L, %L)', d, '  Nombre nuevo  ')
    WHEN 'move'   THEN format('SELECT public.move_community_document(%L, %L)', d, pg_temp.target(d))
    WHEN 'hide'   THEN format('SELECT public.hide_community_document(%L)', d) END;
$$ LANGUAGE sql;

-- Run one action of `kind` on document d as person p. Returns 'ok' only when the
-- call succeeded, the named column took its new value and NO other column
-- changed; a refusal is returned as SQLSTATE:message only when the row is
-- byte-identical afterwards.
CREATE OR REPLACE FUNCTION pg_temp.run(p text, kind text, d uuid) RETURNS text AS $$
DECLARE
  b jsonb := pg_temp.row_json(d);
  a jsonb;
  r text;
  named text[] := CASE kind WHEN 'rename' THEN ARRAY['title','updated_at']
                            WHEN 'move'   THEN ARRAY['folder_id','updated_at']
                            ELSE ARRAY['is_active','updated_at'] END;
BEGIN
  r := pg_temp.call_as(p, pg_temp.stmt(kind, d));
  a := pg_temp.row_json(d);
  IF r = 'ok' THEN
    IF (b - named) IS DISTINCT FROM (a - named) THEN RETURN 'ok, but other columns changed'; END IF;
    IF kind = 'rename' AND a->>'title' IS DISTINCT FROM 'Nombre nuevo' THEN RETURN 'ok, but title is ' || coalesce(a->>'title', 'NULL'); END IF;
    IF kind = 'move' AND (a->>'folder_id')::uuid IS DISTINCT FROM pg_temp.target(d) THEN RETURN 'ok, but folder not set'; END IF;
    IF kind = 'hide' AND (a->>'is_active')::boolean IS DISTINCT FROM false THEN RETURN 'ok, but still active'; END IF;
    RETURN 'ok';
  END IF;
  IF b IS DISTINCT FROM a THEN RETURN r || ', but the row changed'; END IF;
  RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). School 13401; community A (workspace WA, folders
-- FA1, FA2) and community B (workspace WB, folder FB).
--   up1, up2   docente of A (uploaders)
--   leader     lider_comunidad of A
--   leaderb    lider_comunidad of B
--   dual1      docente row inserted first, then lider_comunidad, both in A
--   dual2      lider_comunidad row inserted first, then docente, both in A
--   admin      admin
--   outsider   docente of B
--   consultor  consultor of the school (no community)
--   gone       docente of A whose role was deactivated (uploader)
--   gated      docente of A held by a forced password change (uploader)
--   nobody     no role at all
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('f12b_' || p, 'f12b-' || p || '@example.test')
FROM unnest(ARRAY['up1','up2','leader','leaderb','dual1','dual2','admin','outsider','consultor','gone','gated','nobody']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET must_change_password = true WHERE id = pg_temp.uid('gated');
INSERT INTO public.schools (id, name) VALUES (13401, 'F12B colegio sintético (pgTAP 134)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('f12b0000-0000-4000-8000-0000000000c1', 13401, 'F12B Comunidad A'),
  ('f12b0000-0000-4000-8000-0000000000c2', 13401, 'F12B Comunidad B');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  (pg_temp.ws('A'), 'f12b0000-0000-4000-8000-0000000000c1', 'F12B espacio A'),
  (pg_temp.ws('B'), 'f12b0000-0000-4000-8000-0000000000c2', 'F12B espacio B');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, 13401, c::uuid, act FROM (VALUES
  (1, 'up1',      'docente',         'f12b0000-0000-4000-8000-0000000000c1', true),
  (2, 'up2',      'docente',         'f12b0000-0000-4000-8000-0000000000c1', true),
  (3, 'leader',   'lider_comunidad', 'f12b0000-0000-4000-8000-0000000000c1', true),
  (4, 'leaderb',  'lider_comunidad', 'f12b0000-0000-4000-8000-0000000000c2', true),
  (5, 'dual1',    'docente',         'f12b0000-0000-4000-8000-0000000000c1', true),
  (6, 'dual1',    'lider_comunidad', 'f12b0000-0000-4000-8000-0000000000c1', true),
  (7, 'dual2',    'lider_comunidad', 'f12b0000-0000-4000-8000-0000000000c1', true),
  (8, 'dual2',    'docente',         'f12b0000-0000-4000-8000-0000000000c1', true),
  (9, 'outsider', 'docente',         'f12b0000-0000-4000-8000-0000000000c2', true),
  (10, 'gone',    'docente',         'f12b0000-0000-4000-8000-0000000000c1', true),
  (11, 'gated',   'docente',         'f12b0000-0000-4000-8000-0000000000c1', true)) v(n, p, r, c, act)
ORDER BY n;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('consultor'), 'consultor', 13401, true);
INSERT INTO public.user_roles (user_id, role_type, is_active) VALUES
  (pg_temp.uid('admin'), 'admin', true);
INSERT INTO public.document_folders (id, workspace_id, folder_name, created_by) VALUES
  (pg_temp.folder('FA1'), pg_temp.ws('A'), 'Actas',      pg_temp.uid('up1')),
  (pg_temp.folder('FA2'), pg_temp.ws('A'), 'Planillas',  pg_temp.uid('up1')),
  (pg_temp.folder('FB'),  pg_temp.ws('B'), 'Otra',       pg_temp.uid('outsider'));

-- Documents uploaded before a role is deactivated stay the uploader's.
CREATE TEMP TABLE docs ON COMMIT DROP AS
SELECT 'gone_own'::text AS k, pg_temp.new_doc('A', 'gone') AS id;
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('gone');

-- ---------------------------------------------------------------------------
-- 1. Catalog (5 functions × 6 + 2 STABLE = 32)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE fns (sig text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO fns VALUES
  ('public.can_manage_workspace_documents(uuid)'),
  ('public.can_manage_community_document(uuid)'),
  ('public.rename_community_document(uuid,text)'),
  ('public.move_community_document(uuid,uuid)'),
  ('public.hide_community_document(uuid)');
SELECT ok(to_regprocedure(sig) IS NOT NULL, sig || ' exists') FROM fns ORDER BY sig;
SELECT ok(coalesce((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(sig)), false), sig || ' is SECURITY DEFINER') FROM fns ORDER BY sig;
SELECT ok(coalesce((SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid = to_regprocedure(sig)), false), sig || ' pins search_path') FROM fns ORDER BY sig;
SELECT ok(to_regprocedure(sig) IS NOT NULL AND NOT has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE'), sig || ': anon cannot execute') FROM fns ORDER BY sig;
SELECT ok(to_regprocedure(sig) IS NOT NULL AND has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE')
          AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = to_regprocedure(sig) AND a.grantee = 0),
          sig || ': authenticated executes, PUBLIC holds nothing') FROM fns ORDER BY sig;
SELECT ok(obj_description(to_regprocedure(sig), 'pg_proc') IS NOT NULL, sig || ' has a comment') FROM fns ORDER BY sig;
SELECT ok(coalesce((SELECT provolatile = 's' FROM pg_proc WHERE oid = to_regprocedure(sig)), false), sig || ' is STABLE')
  FROM fns WHERE sig LIKE 'public.can_manage%' ORDER BY sig;

-- ---------------------------------------------------------------------------
-- 2. The two questions (13)
-- ---------------------------------------------------------------------------
INSERT INTO docs SELECT 'q_up1', pg_temp.new_doc('A', 'up1');
SELECT is(pg_temp.ask_as(p, format('SELECT public.can_manage_workspace_documents(%L)::text', pg_temp.ws(w))), want,
          format('can_manage_workspace_documents: %s on workspace %s → %s', p, w, want))
  FROM (VALUES (1, 'leader', 'A', 'true'), (2, 'leader', 'B', 'false'), (3, 'dual1', 'A', 'true'), (4, 'dual2', 'A', 'true'),
               (5, 'admin', 'B', 'true'), (6, 'up1', 'A', 'false'), (7, 'consultor', 'A', 'false'),
               (8, 'anon', 'A', '42501:permission_denied')) v(n, p, w, want)
 ORDER BY n;
SELECT is(pg_temp.ask_as('admin', 'SELECT public.can_manage_workspace_documents(''f12b0000-0000-4000-8000-00000000dead'')::text'), 'false',
          'can_manage_workspace_documents: unknown workspace → false, even for an admin');
SELECT is(pg_temp.ask_as(p, format('SELECT public.can_manage_community_document(%L)::text', (SELECT id FROM docs WHERE k = 'q_up1'))), want,
          format('can_manage_community_document: %s on up1''s document → %s', p, want))
  FROM (VALUES (1, 'up1', 'true'), (2, 'up2', 'false'), (3, 'gone', 'false')) v(n, p, want)
 ORDER BY n;
SELECT is(pg_temp.ask_as('gone', format('SELECT public.can_manage_community_document(%L)::text', (SELECT id FROM docs WHERE k = 'gone_own'))), 'false',
          'can_manage_community_document: an uploader whose role was deactivated no longer manages their document');

-- ---------------------------------------------------------------------------
-- 3. rename, move and hide as every kind of person (17 cases × 3 = 51)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE cases (n int, p text, w text, up text, want text, label text) ON COMMIT DROP;
INSERT INTO cases VALUES
  (1,  'up1',       'A', 'up1',      'ok',                      'the uploader on their own document'),
  (2,  'up1',       'A', 'up2',      '42501:not_allowed',       'a member on another member''s document'),
  (3,  'leader',    'A', 'up1',      'ok',                      'the community''s leader on a member''s document'),
  (4,  'leader',    'A', 'leader',   'ok',                      'the community''s leader on their own document'),
  (5,  'leader',    'B', 'outsider', '42501:not_allowed',       'a leader on a document of another community'),
  (6,  'dual1',     'A', 'up1',      'ok',                      'docente + lider_comunidad (docente row first)'),
  (7,  'dual2',     'A', 'up1',      'ok',                      'docente + lider_comunidad (leader row first)'),
  (8,  'admin',     'A', 'up1',      'ok',                      'an admin in community A'),
  (9,  'admin',     'B', 'outsider', 'ok',                      'an admin in community B'),
  (10, 'outsider',  'A', 'up1',      '42501:not_allowed',       'a member of another community'),
  (11, 'leaderb',   'A', 'up1',      '42501:not_allowed',       'the leader of another community'),
  (12, 'consultor', 'A', 'up1',      '42501:not_allowed',       'a consultor of the school'),
  (13, 'gone',      'A', 'gone',     '42501:not_allowed',       'an uploader whose role in the community was deactivated'),
  (14, 'gated',     'A', 'gated',    '42501:not_allowed',       'an uploader held by a forced password change'),
  (15, 'nobody',    'A', 'up1',      '42501:not_allowed',       'a signed-in person with no role'),
  (16, 'anon',      'A', 'up1',      '42501:permission_denied', 'anon'),
  (17, 'up2',       'A', 'up2',      'ok',                      'a second uploader on their own document');
CREATE TEMP TABLE kinds (m int, kind text) ON COMMIT DROP;
INSERT INTO kinds VALUES (1, 'rename'), (2, 'move'), (3, 'hide');
-- Case 13 reuses the document `gone` uploaded while still active (refused, so unchanged).
SELECT is(pg_temp.run(c.p, a.kind,
            CASE WHEN c.n = 13 THEN (SELECT d.id FROM docs d WHERE d.k = 'gone_own') ELSE pg_temp.new_doc(c.w, c.up) END),
          c.want, format('%s: %s → %s', a.kind, c.label, c.want))
  FROM cases c CROSS JOIN kinds a
 ORDER BY a.m, c.n;

-- ---------------------------------------------------------------------------
-- 4. Hidden (13)
-- ---------------------------------------------------------------------------
INSERT INTO docs SELECT 'hid', pg_temp.new_doc('A', 'up1');
SELECT is(pg_temp.ask_as('up1', format('SELECT count(*)::text FROM public.community_documents WHERE id = %L', (SELECT id FROM docs WHERE k = 'hid'))), '1',
          'before hiding: up1 reads the document through the table');
SELECT is(pg_temp.run('leader', 'hide', (SELECT id FROM docs WHERE k = 'hid')), 'ok', 'hide: the leader hides up1''s document');
SELECT is(pg_temp.ask_as(p, format('SELECT count(*)::text FROM public.community_documents WHERE id = %L', (SELECT id FROM docs WHERE k = 'hid'))), '0',
          format('hidden: %s no longer reads it through the table', p))
  FROM (VALUES (1, 'up1'), (2, 'leader'), (3, 'admin'), (4, 'consultor')) v(n, p) ORDER BY n;
SELECT ok((SELECT count(*) = 1 FROM public.community_documents WHERE id = (SELECT id FROM docs WHERE k = 'hid') AND is_active = false
             AND storage_path = 'documents/' || pg_temp.ws('A') || '/root/acta.pdf'),
          'hidden: the row and its stored-file path still exist (seen as the owner role)');
SELECT is((SELECT count(*)::int FROM public.document_access_log
            WHERE document_id = (SELECT id FROM docs WHERE k = 'hid') AND action_type = 'delete'
              AND user_id = pg_temp.uid('leader') AND workspace_id = pg_temp.ws('A')), 1,
          'hidden: one access-log row (document, caller, workspace, delete)');
SELECT is(pg_temp.run('leader', 'hide', (SELECT id FROM docs WHERE k = 'hid')), '42501:not_allowed', 'hide: a second hide is refused');
SELECT is(pg_temp.run('leader', 'rename', (SELECT id FROM docs WHERE k = 'hid')), '42501:not_allowed', 'rename: a hidden document is refused');
SELECT is(pg_temp.run('up1', 'move', (SELECT id FROM docs WHERE k = 'hid')), '42501:not_allowed', 'move: a hidden document is refused');
SELECT is(pg_temp.call_as('admin', 'SELECT public.rename_community_document(''f12b0000-0000-4000-8000-00000000dead'', ''x'')'), '42501:not_allowed',
          'rename: a document that does not exist → not_allowed');
SELECT is(pg_temp.call_as('admin', 'SELECT public.hide_community_document(''f12b0000-0000-4000-8000-00000000dead'')'), '42501:not_allowed',
          'hide: a document that does not exist → not_allowed');

-- ---------------------------------------------------------------------------
-- 5. Invalid title and folder (9)
-- ---------------------------------------------------------------------------
INSERT INTO docs SELECT 'inv', pg_temp.new_doc('A', 'up1');
CREATE TEMP TABLE inv0 ON COMMIT DROP AS SELECT pg_temp.row_json((SELECT id FROM docs WHERE k = 'inv')) AS v;
SELECT is(pg_temp.call_as('up1', format('SELECT public.rename_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'inv'), t)), '22023:invalid_title',
          format('rename: %s refused', label))
  FROM (VALUES (1, '', 'an empty title'), (2, '    ', 'a blank title'), (3, repeat('x', 201), 'a 201-character title')) v(n, t, label) ORDER BY n;
SELECT is(pg_temp.call_as('up1', format('SELECT public.rename_community_document(%L, NULL)', (SELECT id FROM docs WHERE k = 'inv'))), '22023:invalid_title',
          'rename: a NULL title refused');
SELECT is(pg_temp.call_as('up1', format('SELECT public.move_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'inv'), pg_temp.folder('FB'))), '22023:invalid_folder',
          'move: a folder of another workspace refused');
SELECT is(pg_temp.call_as('up1', format('SELECT public.move_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'inv'), 'f12b0000-0000-4000-8000-00000000dead')), '22023:invalid_folder',
          'move: a folder that does not exist refused');
SELECT is(pg_temp.row_json((SELECT id FROM docs WHERE k = 'inv')), (SELECT v FROM inv0), 'invalid title and folder: the row is unchanged');
SELECT is(pg_temp.call_as('up1', format('SELECT public.move_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'inv'), pg_temp.folder('FA2'))) ||
          '|' || (pg_temp.row_json((SELECT id FROM docs WHERE k = 'inv'))->>'folder_id') || '|' ||
          pg_temp.call_as('up1', format('SELECT public.move_community_document(%L, NULL)', (SELECT id FROM docs WHERE k = 'inv'))) ||
          '|' || coalesce(pg_temp.row_json((SELECT id FROM docs WHERE k = 'inv'))->>'folder_id', 'none'),
          'ok|' || pg_temp.folder('FA2') || '|ok|none', 'move: into a folder of the workspace, then back to «no folder» (NULL)');
SELECT is(pg_temp.call_as('up1', format('SELECT public.rename_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'inv'), repeat('y', 200))) ||
          '|' || length(pg_temp.row_json((SELECT id FROM docs WHERE k = 'inv'))->>'title'),
          'ok|200', 'rename: a 200-character title is accepted');

-- ---------------------------------------------------------------------------
-- 5b. Send-back 1: a name that shows as nothing or holds a control character
--     is refused, row unchanged; white space at both ends is stripped
--     (6 + 19 + 4 = 29)
-- ---------------------------------------------------------------------------
-- The Unicode spaces and zero-width characters the rename strips at the ends.
CREATE TEMP TABLE wsc (cp int PRIMARY KEY) ON COMMIT DROP;
INSERT INTO wsc SELECT unnest(ARRAY[160, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
                                    8203, 8204, 8205, 8232, 8233, 8239, 8287, 12288, 65279]);
INSERT INTO docs SELECT 'blank', pg_temp.new_doc('A', 'up1');
CREATE TEMP TABLE blank0 ON COMMIT DROP AS SELECT pg_temp.row_json((SELECT id FROM docs WHERE k = 'blank')) AS v;
CREATE OR REPLACE FUNCTION pg_temp.rename_blank(t text) RETURNS text AS $$
  SELECT pg_temp.call_as('up1', format('SELECT public.rename_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'blank'), t))
         || CASE WHEN pg_temp.row_json((SELECT id FROM docs WHERE k = 'blank')) = (SELECT v FROM blank0) THEN '|unchanged' ELSE '|changed' END;
$$ LANGUAGE sql;
SELECT is(pg_temp.rename_blank(t), '22023:invalid_title|unchanged', format('rename: %s refused, row unchanged', label))
  FROM (VALUES (1, E'\t', 'a tab'),
               (2, E'\t\r\n', 'tab, carriage return and line feed'),
               (3, chr(8195), 'an em space (U+2003)'),
               (4, chr(160), 'a no-break space (U+00A0)'),
               (5, chr(1), 'the control character U+0001'),
               (6, 'Acta' || chr(1) || 'final', 'a control character in the middle («Acta» U+0001 «final»)')) v(n, t, label)
 ORDER BY n;
SELECT is(pg_temp.rename_blank(chr(cp)), '22023:invalid_title|unchanged', format('rename: U+%s alone refused, row unchanged', lpad(upper(to_hex(cp)), 4, '0')))
  FROM wsc WHERE cp <> 8195 AND cp <> 160 ORDER BY cp;
INSERT INTO docs SELECT 'named', pg_temp.new_doc('A', 'up1');
SELECT is(pg_temp.call_as('up1', format('SELECT public.rename_community_document(%L, %L)', (SELECT id FROM docs WHERE k = 'named'), t))
          || '|' || (pg_temp.row_json((SELECT id FROM docs WHERE k = 'named'))->>'title'),
          'ok|' || want, format('rename: %s', label))
  FROM (VALUES (1, 'Acta de reunión Nº 3: ñandú, Peñalolén (versión final) 2026!', 'Acta de reunión Nº 3: ñandú, Peñalolén (versión final) 2026!',
                'accents, ñ, digits, punctuation and inner single spaces are kept'),
               (2, 'Ñ', 'Ñ', 'a one-character name is accepted'),
               (3, E'  \t' || chr(160) || 'Acta final' || chr(160) || E'\t  ', 'Acta final',
                'spaces, tabs and no-break spaces at both ends are stripped'),
               (4, (SELECT E' \t\r\n' || string_agg(chr(cp), '' ORDER BY cp) FROM wsc) || 'Plan anual' ||
                   (SELECT string_agg(chr(cp), '' ORDER BY cp DESC) || E'\n\r\t ' FROM wsc), 'Plan anual',
                'every white-space and zero-width character named is stripped at both ends')) v(n, t, want, label)
 ORDER BY n;

-- ---------------------------------------------------------------------------
-- 6. N139: direct updates (7 columns × 3 people + 3 = 24)
-- ---------------------------------------------------------------------------
-- 'unchanged' when the row is byte-identical after the statement (refused or
-- zero rows), 'changed' otherwise.
CREATE OR REPLACE FUNCTION pg_temp.direct(p text, d uuid, set_clause text) RETURNS text AS $$
DECLARE
  b jsonb := pg_temp.row_json(d);
  r text;
BEGIN
  r := pg_temp.call_as(p, format('UPDATE public.community_documents SET %s WHERE id = %L', set_clause, d));
  RETURN CASE WHEN pg_temp.row_json(d) IS DISTINCT FROM b THEN 'changed' ELSE 'unchanged' END;
END;
$$ LANGUAGE plpgsql;
INSERT INTO docs SELECT 'n139', pg_temp.new_doc('A', 'up1');
CREATE TEMP TABLE cols (n int, set_clause text, label text) ON COMMIT DROP;
INSERT INTO cols VALUES
  (1, 'storage_path = ''documents/otro/archivo.pdf''',                    'storage_path (another stored file)'),
  (2, format('uploaded_by = %L', pg_temp.uid('nobody')),                   'uploaded_by (another uploader)'),
  (3, format('workspace_id = %L', pg_temp.ws('B')),                        'workspace_id (another workspace)'),
  (4, 'title = ''Cambiado directo''',                                       'title'),
  (5, format('folder_id = %L', pg_temp.folder('FA2')),                     'folder_id'),
  (6, 'is_active = false',                                                  'is_active'),
  (7, 'view_count = 999',                                                   'view_count');
-- A fresh document of up1 for every statement, so no earlier statement has
-- already written the value.
SELECT is(pg_temp.direct(w.p, pg_temp.new_doc('A', 'up1'), c.set_clause), 'unchanged',
          format('N139: a direct update of %s by %s changes nothing', c.label, w.who))
  FROM (VALUES (1, 'up1', 'the uploader'), (2, 'leader', 'the community''s leader'), (3, 'up2', 'a member')) w(m, p, who)
  CROSS JOIN cols c
 ORDER BY w.m, c.n;
SELECT is(pg_temp.direct('admin', (SELECT d.id FROM docs d WHERE d.k = 'n139'), 'title = ''Corregido por admin'''), 'changed',
          'N139: an admin''s direct update still works');
INSERT INTO docs SELECT 'n139c', pg_temp.new_doc('A', 'up1');
SELECT is(pg_temp.call_as('up2', format('SELECT public.increment_document_counter(%L, ''view'', NULL)', (SELECT d.id FROM docs d WHERE d.k = 'n139c')))
          || '|' || (pg_temp.row_json((SELECT d.id FROM docs d WHERE d.k = 'n139c'))->>'view_count'),
          'ok|1', 'N139: increment_document_counter still counts a view by a plain member (0 → 1)');
SELECT is(pg_temp.call_as('up2', format(
            'INSERT INTO public.community_documents (workspace_id, title, file_name, file_size, mime_type, storage_path, uploaded_by) VALUES (%L, ''Subido'', ''subido.pdf'', 5, ''application/pdf'', ''documents/x/root/subido.pdf'', auth.uid())',
            pg_temp.ws('A'))), 'ok', 'N139: an upload (INSERT) by a member still works');

SELECT * FROM finish();
ROLLBACK;
