-- =============================================================================
-- 135-workspace-rename.sql — GENERA fixes F12c, EC-V1a: migration
-- 20261118100000_workspace_rename.sql.
--
-- Any member of a community may rename its workspace (owner decision
-- 17 Nov 2026: "Any member"); an admin may too; a consultor of the school
-- does not. The function sets only custom_name and updated_at. The table's
-- own write rules are untouched: a member's direct update still changes
-- nothing.
--
--   1. catalog: definer, search_path pinned, no PUBLIC and no anon grant,
--      authenticated may execute, a comment
--   2. allowed callers rename, and only custom_name and updated_at change
--   3. refused callers and an unknown workspace: not_allowed, row unchanged
--   4. invalid names refused, row unchanged (also nothing to read, controls,
--      separators, direction and zero-width characters anywhere); ordinary
--      names accepted; trimming; 100 characters accepted
--   5. a member's direct update of the table changes nothing; the community
--      manager's and an admin's direct picture update still work
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(61);

CREATE TEMP TABLE ids (p text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT SELECT ON ids TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.uid(name text) RETURNS uuid AS $$
  SELECT id FROM ids WHERE p = name;
$$ LANGUAGE sql;

-- WA: workspace of community A; WB: workspace of community B.
CREATE OR REPLACE FUNCTION pg_temp.ws(k text) RETURNS uuid AS $$
  SELECT CASE k WHEN 'A' THEN 'f12c0000-0000-4000-8000-0000000000a1'::uuid
                WHEN 'B' THEN 'f12c0000-0000-4000-8000-0000000000a2'::uuid
                WHEN 'X' THEN 'f12c0000-0000-4000-8000-00000000dead'::uuid END;
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
    PERFORM tests.authenticate_as('f12c_' || p);
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

-- The whole row, read as postgres (no row rule hides it).
CREATE OR REPLACE FUNCTION pg_temp.row_json(w uuid) RETURNS jsonb AS $$
  SELECT to_jsonb(cw) FROM public.community_workspaces cw WHERE cw.id = w;
$$ LANGUAGE sql;

-- Rename workspace w to name t as person p. 'ok|<stored custom_name>' only
-- when the call succeeded and NO column other than custom_name and updated_at
-- changed; a refusal is returned as SQLSTATE:message|unchanged only when the
-- row is byte-identical afterwards.
CREATE OR REPLACE FUNCTION pg_temp.rename(p text, w text, t text) RETURNS text AS $$
DECLARE
  b jsonb := pg_temp.row_json(pg_temp.ws(w));
  a jsonb;
  r text;
BEGIN
  r := pg_temp.call_as(p, format('SELECT public.rename_community_workspace(%L, %L)', pg_temp.ws(w), t));
  a := pg_temp.row_json(pg_temp.ws(w));
  IF r = 'ok' THEN
    IF (b - ARRAY['custom_name','updated_at']) IS DISTINCT FROM (a - ARRAY['custom_name','updated_at']) THEN
      RETURN 'ok, but other columns changed';
    END IF;
    RETURN 'ok|' || coalesce(a->>'custom_name', 'NULL');
  END IF;
  RETURN r || CASE WHEN b IS DISTINCT FROM a THEN '|changed' ELSE '|unchanged' END;
END;
$$ LANGUAGE plpgsql;

-- 'unchanged' when the row is byte-identical after a direct UPDATE by p.
CREATE OR REPLACE FUNCTION pg_temp.direct(p text, w text, set_clause text) RETURNS text AS $$
DECLARE
  b jsonb := pg_temp.row_json(pg_temp.ws(w));
  r text;
BEGIN
  r := pg_temp.call_as(p, format('UPDATE public.community_workspaces SET %s WHERE id = %L', set_clause, pg_temp.ws(w)));
  RETURN CASE WHEN pg_temp.row_json(pg_temp.ws(w)) IS DISTINCT FROM b THEN 'changed' ELSE 'unchanged' END;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). School 13501; community A (workspace WA) and
-- community B (workspace WB).
--   doc        docente of A
--   leader     lider_comunidad of A
--   manager    community_manager of A
--   dual       docente and lider_comunidad, both in A
--   admin      admin
--   outsider   docente of B
--   consultor  consultor of the school (no community)
--   gone       docente of A whose role was deactivated
--   gated      docente of A held by a forced password change
--   nobody     no role at all
--   cons_a     consultor whose (only) consultor role row names community A
--   cons_doc   consultor role row in A AND a docente role row in A
-- ---------------------------------------------------------------------------
INSERT INTO ids SELECT p, tests.create_supabase_user('f12c_' || p, 'f12c-' || p || '@example.test')
FROM unnest(ARRAY['doc','leader','manager','dual','admin','outsider','consultor','gone','gated','nobody','cons_a','cons_doc']) p;
INSERT INTO public.profiles (id) SELECT id FROM ids ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET must_change_password = true WHERE id = pg_temp.uid('gated');
INSERT INTO public.schools (id, name) VALUES (13501, 'F12C colegio sintético (pgTAP 135)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('f12c0000-0000-4000-8000-0000000000c1', 13501, 'F12C Comunidad A'),
  ('f12c0000-0000-4000-8000-0000000000c2', 13501, 'F12C Comunidad B');
INSERT INTO public.community_workspaces (id, community_id, name, description, image_url, image_storage_path) VALUES
  (pg_temp.ws('A'), 'f12c0000-0000-4000-8000-0000000000c1', 'Espacio de F12C Comunidad A', 'Descripción A',
   'https://example.test/a.png', 'community-images/a.png'),
  (pg_temp.ws('B'), 'f12c0000-0000-4000-8000-0000000000c2', 'Espacio de F12C Comunidad B', NULL, NULL, NULL);
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
SELECT pg_temp.uid(p), r::user_role_type, 13501, c::uuid, true FROM (VALUES
  (1, 'doc',      'docente',           'f12c0000-0000-4000-8000-0000000000c1'),
  (2, 'leader',   'lider_comunidad',   'f12c0000-0000-4000-8000-0000000000c1'),
  (3, 'manager',  'community_manager', 'f12c0000-0000-4000-8000-0000000000c1'),
  (4, 'dual',     'docente',           'f12c0000-0000-4000-8000-0000000000c1'),
  (5, 'dual',     'lider_comunidad',   'f12c0000-0000-4000-8000-0000000000c1'),
  (6, 'outsider', 'docente',           'f12c0000-0000-4000-8000-0000000000c2'),
  (7, 'gone',     'docente',           'f12c0000-0000-4000-8000-0000000000c1'),
  (8, 'gated',    'docente',           'f12c0000-0000-4000-8000-0000000000c1'),
  (9, 'cons_a',   'consultor',         'f12c0000-0000-4000-8000-0000000000c1'),
  (10, 'cons_doc', 'consultor',        'f12c0000-0000-4000-8000-0000000000c1'),
  (11, 'cons_doc', 'docente',          'f12c0000-0000-4000-8000-0000000000c1')) v(n, p, r, c)
ORDER BY n;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('consultor'), 'consultor', 13501, true);
INSERT INTO public.user_roles (user_id, role_type, is_active) VALUES
  (pg_temp.uid('admin'), 'admin', true);
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('gone');

-- ---------------------------------------------------------------------------
-- 1. Catalog (6)
-- ---------------------------------------------------------------------------
SELECT ok(to_regprocedure('public.rename_community_workspace(uuid,text)') IS NOT NULL,
          'rename_community_workspace(uuid,text) exists');
SELECT ok(coalesce((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.rename_community_workspace(uuid,text)')), false),
          'rename_community_workspace is SECURITY DEFINER');
SELECT ok(coalesce((SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid = to_regprocedure('public.rename_community_workspace(uuid,text)')), false),
          'rename_community_workspace pins search_path');
SELECT ok(to_regprocedure('public.rename_community_workspace(uuid,text)') IS NOT NULL
          AND NOT has_function_privilege('anon', to_regprocedure('public.rename_community_workspace(uuid,text)'), 'EXECUTE'),
          'rename_community_workspace: anon cannot execute');
SELECT ok(to_regprocedure('public.rename_community_workspace(uuid,text)') IS NOT NULL
          AND has_function_privilege('authenticated', to_regprocedure('public.rename_community_workspace(uuid,text)'), 'EXECUTE')
          AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                           WHERE p.oid = to_regprocedure('public.rename_community_workspace(uuid,text)') AND a.grantee = 0),
          'rename_community_workspace: authenticated executes, PUBLIC holds nothing');
SELECT ok(obj_description(to_regprocedure('public.rename_community_workspace(uuid,text)'), 'pg_proc') IS NOT NULL,
          'rename_community_workspace has a comment');

-- ---------------------------------------------------------------------------
-- 2. Allowed callers (6): renamed, only custom_name and updated_at changed
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.rename(p, 'A', 'Nombre de ' || p), 'ok|Nombre de ' || p, format('rename: %s → renamed, nothing else changed', label))
  FROM (VALUES (1, 'doc',     'a docente member'),
               (2, 'leader',  'the community''s leader'),
               (3, 'manager', 'the community''s manager'),
               (4, 'dual',    'a person with two role rows in the community'),
               (5, 'admin',   'an admin'),
               (6, 'cons_doc', 'a consultor who also holds a docente row in the community')) v(n, p, label)
 ORDER BY n;

-- ---------------------------------------------------------------------------
-- 3. Refused callers (8) and an unknown workspace (2): row unchanged
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.rename(p, 'A', 'Intruso'), want || '|unchanged', format('rename: %s → %s, row unchanged', label, want))
  FROM (VALUES (1, 'outsider',  '42501:not_allowed',       'a member of another community'),
               (2, 'consultor', '42501:not_allowed',       'a consultor of the school (no community)'),
               (3, 'gone',      '42501:not_allowed',       'a member whose role was deactivated'),
               (4, 'gated',     '42501:not_allowed',       'a member held by a forced password change'),
               (5, 'nobody',    '42501:not_allowed',       'a person with no role'),
               (6, 'anon',      '42501:permission_denied', 'anon'),
               (7, 'cons_a',    '42501:not_allowed',       'a consultor whose consultor role row names the community')) v(n, p, want, label)
 ORDER BY n;
SELECT is(pg_temp.rename('leader', 'B', 'Intruso'), '42501:not_allowed|unchanged',
          'rename: a leader of A on the workspace of B → not_allowed, row unchanged');
SELECT is(pg_temp.call_as(p, format('SELECT public.rename_community_workspace(%L, %L)', pg_temp.ws('X'), 'Nombre')), '42501:not_allowed',
          format('rename: unknown workspace → not_allowed (%s)', p))
  FROM (VALUES (1, 'admin'), (2, 'doc')) v(n, p)
 ORDER BY n;

-- ---------------------------------------------------------------------------
-- 4. Names (33)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.rename('doc', 'A', t), '22023:invalid_name|unchanged', format('rename: %s → invalid_name, row unchanged', label))
  FROM (VALUES (1, '', 'an empty name'),
               (2, '     ', 'spaces only'),
               (3, repeat('a', 101), '101 characters'),
               (4, NULL, 'NULL')) v(n, t, label)
 ORDER BY n;
-- Nothing to read, or characters that play tricks (anywhere in the name):
-- invalid_name, row unchanged. (U+0000 cannot be stored in text at all.)
SELECT is(pg_temp.rename('doc', 'A', t), '22023:invalid_name|unchanged', format('rename: %s → invalid_name, row unchanged', label))
  FROM (VALUES (1,  E'\u2060',                    'only a word joiner U+2060'),
               (2,  E'\u200E\u200E\u200E',        'only left-to-right marks U+200E'),
               (3,  E'\u200F\u200E',              'only direction marks U+200F U+200E'),
               (4,  E'\u0301\u0301\u0301',        'only combining marks U+0301 ×3'),
               (5,  E'A\u202Eb',                   '«Ab» with a right-to-left override U+202E in the middle'),
               (6,  E'A\nb',                       '«Ab» with a line break in the middle'),
               (7,  E'A\tb',                       '«Ab» with a tab in the middle'),
               (8,  E'A\u0001b',                   '«Ab» with control character U+0001 in the middle'),
               (9,  E'A\u001Fb',                   '«Ab» with control character U+001F in the middle'),
               (10, E'A\u007Fb',                   '«Ab» with DEL U+007F in the middle'),
               (11, E'A\u0085b',                   '«Ab» with next-line U+0085 in the middle'),
               (12, E'A\u2028b',                   '«Ab» with a line separator U+2028 in the middle'),
               (13, E'A\u2029b',                   '«Ab» with a paragraph separator U+2029 in the middle'),
               (14, E'A\u202Ab',                   '«Ab» with an embedding U+202A in the middle'),
               (15, E'A\u2066b',                   '«Ab» with an isolate U+2066 in the middle'),
               (16, E'A\u2069b',                   '«Ab» with a pop isolate U+2069 in the middle'),
               (17, E'A\u200Bb',                   '«Ab» with a zero-width space U+200B in the middle'),
               (18, E'A\u200Db',                   '«Ab» with a zero-width joiner U+200D in the middle'),
               (19, E'A\u2060b',                   '«Ab» with a word joiner U+2060 in the middle'),
               (20, E'A\uFEFFb',                   '«Ab» with U+FEFF in the middle'),
               (21, E'\U0001F680',                 'an emoji alone (no letter or digit)'),
               (22, E'Equipo \U0001F468\u200D\U0001F469', 'an emoji sequence joined by U+200D (accepted cost)')) v(n, t, label)
 ORDER BY n;
-- Ordinary names keep working.
SELECT is(pg_temp.rename('doc', 'A', t), 'ok|' || t, format('rename: %s is accepted', label))
  FROM (VALUES (1, 'Comunidad Ñandú 2º básico', '«Comunidad Ñandú 2º básico»'),
               (2, 'Equipo A/B – ciclo 1',      '«Equipo A/B – ciclo 1»'),
               (3, E'Equipo \U0001F680',        'an emoji with letters «Equipo 🚀»'),
               (4, '日本語チーム',                 'a name in non-Latin letters'),
               (5, '2026',                       'digits only')) v(n, t, label)
 ORDER BY n;
SELECT is(pg_temp.rename('doc', 'A', ' x '), 'ok|x', 'rename: « x » is stored as «x»');
SELECT is(pg_temp.rename('doc', 'A', repeat('ñ', 100)), 'ok|' || repeat('ñ', 100), 'rename: exactly 100 characters is accepted');

-- ---------------------------------------------------------------------------
-- 5. The table's rules are untouched (6)
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.direct('doc', 'A', set_clause), 'unchanged', format('direct update of %s by a member changes nothing', label))
  FROM (VALUES (1, 'custom_name = ''Directo''',                                  'custom_name'),
               (2, 'image_url = ''https://example.test/otra.png''',              'image_url'),
               (3, 'community_id = ''f12c0000-0000-4000-8000-0000000000c2''',    'community_id'),
               (4, 'is_active = false',                                           'is_active')) v(n, set_clause, label)
 ORDER BY n;
SELECT is(pg_temp.direct('manager', 'A', 'image_url = ''https://example.test/gestor.png'''), 'changed',
          'the community''s manager''s direct picture update still works');
SELECT is(pg_temp.direct('admin', 'A', 'image_url = ''https://example.test/admin.png'''), 'changed',
          'an admin''s direct picture update still works');

SELECT * FROM finish();
ROLLBACK;
