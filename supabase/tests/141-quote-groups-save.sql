-- =============================================================================
-- 141-quote-groups-save.sql — GENERA fixes F15c, send-back 1 (GES-2.12).
-- Proves public.save_quote_with_groups (migration 20261118104000_quote_groups_save.sql):
--   * service role only (anon and signed-in people: permission denied), INVOKER, pinned search_path,
--     and it locks the quote's row (FOR UPDATE) before anything else;
--   * a save updates listed groups, adds new ones, removes unlisted ones and updates the quote's own
--     fields, all in one statement; another quote's groups are never touched;
--   * the reader's case: a save whose quote update fails (client_name null) writes nothing at all;
--   * an empty / null / non-array / malformed list, a foreign or non-uuid id and a repeated id are
--     refused with their message, writing nothing;
--   * id, quote_id, nights and created_at of an element and quote columns outside the allow-list are
--     never written; absent keys keep the stored value (update) or the table's default (insert);
--   * the tables' triggers still compute the totals; a stale grand_total in p_fields does not survive.
-- Synthetic fixtures (uuids 14100000-…); everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(72);

-- -----------------------------------------------------------------------------
-- (1) Structure, privileges and the lock
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'save_quote_with_groups', ARRAY['uuid', 'jsonb', 'jsonb']::name[],
  'save_quote_with_groups(uuid, jsonb, jsonb) exists');
SELECT function_returns('public', 'save_quote_with_groups', ARRAY['uuid', 'jsonb', 'jsonb']::name[],
  'void', 'it returns void');
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.save_quote_with_groups(uuid, jsonb, jsonb)'::regprocedure),
  'it is SECURITY INVOKER');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
           WHERE p.oid = 'public.save_quote_with_groups(uuid, jsonb, jsonb)'::regprocedure
             AND cfg = 'search_path=public, pg_temp'),
  'it pins search_path = public, pg_temp');
SELECT function_privs_are('public', 'save_quote_with_groups', ARRAY['uuid', 'jsonb', 'jsonb']::name[],
  'service_role', ARRAY['EXECUTE']::name[], 'service_role can execute it');
SELECT function_privs_are('public', 'save_quote_with_groups', ARRAY['uuid', 'jsonb', 'jsonb']::name[],
  'authenticated', ARRAY[]::name[], 'authenticated cannot execute it');
SELECT function_privs_are('public', 'save_quote_with_groups', ARRAY['uuid', 'jsonb', 'jsonb']::name[],
  'anon', ARRAY[]::name[], 'anon cannot execute it');
SELECT ok(
  NOT has_function_privilege('public', 'public.save_quote_with_groups(uuid, jsonb, jsonb)', 'EXECUTE'),
  'PUBLIC cannot execute it');
-- (11) The lock: a two-session race cannot run inside one pgTAP transaction; the text is pinned.
SELECT ok(
  lower(pg_get_functiondef('public.save_quote_with_groups(uuid, jsonb, jsonb)'::regprocedure))
    ~ 'from public\.pasantias_quotes\s+where id = p_quote_id\s+for update',
  'it reads the quote''s row FOR UPDATE');

-- -----------------------------------------------------------------------------
-- Fixtures (postgres): quote A in group mode with G1 and G2; quote B with H1
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('f15c141_owner');
INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
VALUES (tests.get_supabase_uid('f15c141_owner'), 'f15c141_owner@test.local', 'f15c141_owner', 'approved', false);

INSERT INTO public.pasantias_quotes
  (id, client_name, arrival_date, departure_date, flight_price, use_groups, status, created_by)
VALUES
  ('14100000-0000-4000-8000-00000000000a', 'Cliente F15c-141 A', '2027-03-01', '2027-03-05', 10000, true, 'draft',
   tests.get_supabase_uid('f15c141_owner')),
  ('14100000-0000-4000-8000-00000000000b', 'Cliente F15c-141 B', '2027-04-01', '2027-04-03', 0, true, 'draft',
   tests.get_supabase_uid('f15c141_owner'));

INSERT INTO public.pasantias_quote_groups
  (id, quote_id, group_name, num_participants, arrival_date, departure_date, flight_price, room_type, room_price_per_night)
VALUES
  ('14100000-0000-4000-8000-0000000000a1', '14100000-0000-4000-8000-00000000000a', 'G1', 2,
   '2027-03-01', '2027-03-05', 500000, 'double', 100000),
  ('14100000-0000-4000-8000-0000000000a2', '14100000-0000-4000-8000-00000000000a', 'G2', 3,
   '2027-03-01', '2027-03-03', 0, 'single', 80000),
  ('14100000-0000-4000-8000-0000000000b1', '14100000-0000-4000-8000-00000000000b', 'H1', 1,
   '2027-04-01', '2027-04-03', 0, 'single', 70000);

-- The owner's id, readable by the service role inside the calls below.
SELECT set_config('f15c141.owner', tests.get_supabase_uid('f15c141_owner')::text, true);

-- A fingerprint of both quotes and all their groups, to prove "nothing changed".
CREATE FUNCTION pg_temp.fp141() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg(row(g.*)::text, '|' ORDER BY g.id)
                     FROM public.pasantias_quote_groups g
                    WHERE g.quote_id IN ('14100000-0000-4000-8000-00000000000a', '14100000-0000-4000-8000-00000000000b')), '')
         || '#' ||
         (SELECT string_agg(row(q.*)::text, '|' ORDER BY q.id)
            FROM public.pasantias_quotes q
           WHERE q.id IN ('14100000-0000-4000-8000-00000000000a', '14100000-0000-4000-8000-00000000000b'))
$$;
CREATE TEMP TABLE snap141 (k text PRIMARY KEY, v text) ON COMMIT DROP;
INSERT INTO snap141 VALUES
  ('all', pg_temp.fp141()),
  ('h1', (SELECT row(g.*)::text FROM public.pasantias_quote_groups g WHERE g.id = '14100000-0000-4000-8000-0000000000b1')),
  ('g1_created', (SELECT created_at::text FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'));

-- (10) the baseline the triggers left: 2 + 3 participants; accommodation 4 nights × 100000 × 1 room
-- + 2 nights × 80000 × 3 rooms = 880000; grand_total = accommodation + programs (none)
-- + the QUOTE's flight_price × participants (10000 × 5) + viáticos (none) — the groups' own flights
-- are not in it (the viáticos trigger runs last and recomputes grand_total that way).
SELECT is((SELECT num_pasantes FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  5, 'baseline: quote A counts 5 participants (from its groups)');
SELECT is((SELECT accommodation_total FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  880000.00::numeric, 'baseline: quote A accommodation 880000 (from its groups)');
SELECT is((SELECT grand_total FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  930000.00::numeric, 'baseline: quote A grand_total 930000 (accommodation + quote flight × participants)');

-- -----------------------------------------------------------------------------
-- (1) Nobody but the service role can call it
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('f15c141_owner');
SELECT throws_ok(
  $$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
      '[{"id": "14100000-0000-4000-8000-0000000000a1"}]')$$,
  '42501', NULL, 'a signed-in person (even the owner) cannot call it (permission denied)');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
      '[{"id": "14100000-0000-4000-8000-0000000000a1"}]')$$,
  '42501', NULL, 'a visitor cannot call it (permission denied)');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- (3) THE READER'S CASE 1: groups change, then the quote update fails → nothing written
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a',
      '{"client_name": null}',
      '[{"id": "14100000-0000-4000-8000-0000000000a1", "num_participants": 6},
        {"group_name": "G3", "num_participants": 1, "arrival_date": "2027-03-02",
         "departure_date": "2027-03-04", "room_type": "single", "room_price_per_night": 50000}]')$$,
  '23502', NULL, 'a save whose quote update breaks NOT NULL (client_name null) fails');
RESET ROLE;
SELECT is((SELECT num_participants FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  2, 'case 1: G1 keeps its participants');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a2'),
  1, 'case 1: G2 still exists');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id = '14100000-0000-4000-8000-00000000000a'),
  2, 'case 1: no new group');
SELECT is((SELECT client_name FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  'Cliente F15c-141 A', 'case 1: the quote keeps its name');
SELECT is(pg_temp.fp141(), (SELECT v FROM snap141 WHERE k = 'all'), 'case 1: both quotes and all groups are unchanged');

-- -----------------------------------------------------------------------------
-- (4) Empty, null, an object, a list holding a string; and an unknown quote
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}', '[]')$$,
  '22023', 'groups_empty', 'an empty list is refused (groups_empty)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}', NULL)$$,
  '22023', 'groups_empty', 'a SQL null list is refused (groups_empty)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}', 'null')$$,
  '22023', 'groups_empty', 'a JSON null list is refused (groups_empty)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
    '{"id": "14100000-0000-4000-8000-0000000000a1"}')$$,
  '22023', 'groups_empty', 'an object instead of a list is refused (groups_empty)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
    '[{"id": "14100000-0000-4000-8000-0000000000a1"}, "G2"]')$$,
  '22023', 'group_malformed', 'a list holding a string is refused (group_malformed)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-0000000000ff', '{}',
    '[{"id": "14100000-0000-4000-8000-0000000000a1"}]')$$,
  'P0002', 'quote_not_found', 'an unknown quote is refused (quote_not_found)');
RESET ROLE;
SELECT is(pg_temp.fp141(), (SELECT v FROM snap141 WHERE k = 'all'), 'case 4: nothing changed');

-- -----------------------------------------------------------------------------
-- (5) A group of another quote, a non-uuid id; (6) the same id twice
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{"client_name": "X"}',
    '[{"id": "14100000-0000-4000-8000-0000000000a1", "num_participants": 9},
      {"id": "14100000-0000-4000-8000-0000000000b1", "num_participants": 9}]')$$,
  '22023', 'group_foreign', 'another quote''s group is refused (group_foreign)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
    '[{"id": "not-a-uuid", "num_participants": 9}]')$$,
  '22023', 'group_foreign', 'an id that is not a uuid is refused (group_foreign)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
    '[{"id": 7, "num_participants": 9}]')$$,
  '22023', 'group_foreign', 'a numeric id is refused (group_foreign)');
SELECT throws_ok($$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{"client_name": "X"}',
    '[{"id": "14100000-0000-4000-8000-0000000000a1", "num_participants": 9},
      {"id": "14100000-0000-4000-8000-0000000000a1", "num_participants": 8}]')$$,
  '22023', 'group_duplicate', 'the same group listed twice is refused (group_duplicate)');
RESET ROLE;
SELECT is((SELECT row(g.*)::text FROM public.pasantias_quote_groups g WHERE g.id = '14100000-0000-4000-8000-0000000000b1'),
  (SELECT v FROM snap141 WHERE k = 'h1'), 'cases 5–6: H1 untouched');
SELECT is(pg_temp.fp141(), (SELECT v FROM snap141 WHERE k = 'all'), 'cases 5–6: nothing changed');

-- -----------------------------------------------------------------------------
-- (2) A save: G1 changed, a new group, G2 left out, the name changed
--     (9, update half) keys absent from G1's element keep their stored value
--     (10) a stale grand_total / total_per_person in p_fields
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a',
      jsonb_build_object('client_name', 'Cliente F15c-141 A2', 'grand_total', 1, 'total_per_person', 1,
                         'updated_by', current_setting('f15c141.owner')),
      '[{"id": "14100000-0000-4000-8000-0000000000a1", "num_participants": 4, "group_name": "G1b"},
        {"group_name": "G3", "num_participants": 1, "arrival_date": "2027-03-02",
         "departure_date": "2027-03-04", "room_type": "single", "room_price_per_night": 50000}]')$$,
  'case 2: the save succeeds');
RESET ROLE;
SELECT is((SELECT num_participants FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  4, 'case 2: G1''s participants changed');
SELECT is((SELECT group_name FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  'G1b', 'case 2: G1''s name changed');
SELECT is((SELECT room_price_per_night FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  100000.00::numeric, 'case 9: a key absent from G1''s element keeps its stored value (room price)');
SELECT is((SELECT flight_price FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  500000.00::numeric, 'case 9: a key absent from G1''s element keeps its stored value (flight price)');
SELECT is((SELECT room_type FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  'double', 'case 9: a key absent from G1''s element keeps its stored value (room type)');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups
            WHERE quote_id = '14100000-0000-4000-8000-00000000000a' AND group_name = 'G3'),
  1, 'case 2: one new group G3 in quote A');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a2'),
  0, 'case 2: G2 is gone');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id = '14100000-0000-4000-8000-00000000000a'),
  2, 'case 2: quote A has exactly G1 and G3');
SELECT is((SELECT client_name FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  'Cliente F15c-141 A2', 'case 2: the quote''s name changed');
SELECT is((SELECT updated_by FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  tests.get_supabase_uid('f15c141_owner'), 'case 2: updated_by written from p_fields');
SELECT is((SELECT row(g.*)::text FROM public.pasantias_quote_groups g WHERE g.id = '14100000-0000-4000-8000-0000000000b1'),
  (SELECT v FROM snap141 WHERE k = 'h1'), 'case 2: H1 untouched');
SELECT is((SELECT client_name FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000b'),
  'Cliente F15c-141 B', 'case 2: quote B untouched');
-- (10) G1: 4 nights × 100000 × 2 rooms = 800000; G3: 2 nights × 50000 × 1 = 100000.
SELECT is((SELECT accommodation_total FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  800000.00::numeric, 'case 10: G1''s own total recomputed by its trigger');
SELECT is((SELECT num_pasantes FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  5, 'case 10: quote A now counts 4 + 1 participants');
SELECT is((SELECT accommodation_total FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  900000.00::numeric, 'case 10: quote A accommodation moved 880000 → 900000');
SELECT is((SELECT grand_total FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  950000.00::numeric, 'case 10: grand_total is the triggers'' 900000 + 10000 × 5, not p_fields'' 1');
SELECT is((SELECT total_per_person FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  190000.00::numeric, 'case 10: total_per_person is the triggers'' 950000 / 5, not p_fields'' 1');

-- -----------------------------------------------------------------------------
-- (7) id, quote_id, nights, created_at of an element are never written
-- (9, insert half) keys absent from a new group take the table's defaults
-- -----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a', '{}',
      '[{"id": "14100000-0000-4000-8000-0000000000a1", "quote_id": "14100000-0000-4000-8000-00000000000b",
         "nights": 99, "created_at": "2000-01-01T00:00:00Z"},
        {"id": null, "quote_id": "14100000-0000-4000-8000-00000000000b", "nights": 99,
         "created_at": "2000-01-01T00:00:00Z", "group_name": "G4",
         "arrival_date": "2027-03-01", "departure_date": "2027-03-03", "room_type": "double"}]')$$,
  'case 7: the save succeeds');
RESET ROLE;
SELECT is((SELECT quote_id FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  '14100000-0000-4000-8000-00000000000a'::uuid, 'case 7: G1 stays in quote A');
SELECT is((SELECT nights FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  4, 'case 7: G1''s nights are the table''s');
SELECT is((SELECT created_at::text FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  (SELECT v FROM snap141 WHERE k = 'g1_created'), 'case 7: G1''s created_at unchanged');
SELECT is((SELECT num_participants FROM public.pasantias_quote_groups WHERE id = '14100000-0000-4000-8000-0000000000a1'),
  4, 'case 9: an element with no editable key leaves G1''s columns as stored');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id = '14100000-0000-4000-8000-00000000000b'),
  1, 'case 7: quote B still has only H1');
SELECT is((SELECT quote_id FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  '14100000-0000-4000-8000-00000000000a'::uuid, 'case 7: the new group G4 belongs to quote A');
SELECT is((SELECT nights FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  2, 'case 7: G4''s nights are the table''s (2), not 99');
SELECT ok((SELECT created_at > '2001-01-01' FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  'case 7: G4''s created_at is the database''s, not 2000');
SELECT ok((SELECT id NOT IN ('14100000-0000-4000-8000-0000000000a1', '14100000-0000-4000-8000-0000000000a2',
                             '14100000-0000-4000-8000-0000000000b1')
             FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  'case 7: G4''s id is a new one');
SELECT is((SELECT num_participants FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  1, 'case 9: G4 without num_participants gets the default 1');
SELECT is((SELECT flight_price FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  0.00::numeric, 'case 9: G4 without flight_price gets the default 0');
SELECT is((SELECT room_price_per_night FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  0.00::numeric, 'case 9: G4 without room_price_per_night gets the default 0');
SELECT is((SELECT viaticos_type FROM public.pasantias_quote_groups WHERE group_name = 'G4'),
  NULL, 'case 9: G4 without viaticos_type gets the default (null)');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE group_name = 'G3'),
  0, 'case 7: G3, not listed, is gone');

-- -----------------------------------------------------------------------------
-- (8) p_fields outside the allow-list are never written
-- -----------------------------------------------------------------------------
INSERT INTO snap141
SELECT 'qa_protected', row(quote_number, created_by, viewed_at, id, created_at)::text
  FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a';
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.save_quote_with_groups('14100000-0000-4000-8000-00000000000a',
      '{"client_phone": "+56 9 0000 1410", "quote_number": 999999, "created_by": null,
        "viewed_at": "2000-01-01T00:00:00Z", "id": "14100000-0000-4000-8000-0000000000ee",
        "created_at": "2000-01-01T00:00:00Z", "accepted_at": "2000-01-01T00:00:00Z"}',
      ('[{"id": "14100000-0000-4000-8000-0000000000a1"},
        {"id": "' || (SELECT id::text FROM public.pasantias_quote_groups WHERE group_name = 'G4') || '"}]')::jsonb)$$,
  'case 8: the save succeeds');
RESET ROLE;
SELECT is((SELECT client_phone FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  '+56 9 0000 1410', 'case 8: an allow-listed column (client_phone) is written');
SELECT is((SELECT row(quote_number, created_by, viewed_at, id, created_at)::text
             FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  (SELECT v FROM snap141 WHERE k = 'qa_protected'),
  'case 8: quote_number, created_by, viewed_at, id and created_at are unchanged');
SELECT is((SELECT accepted_at FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-00000000000a'),
  NULL, 'case 8: accepted_at is not written');
SELECT is((SELECT count(*)::int FROM public.pasantias_quotes WHERE id = '14100000-0000-4000-8000-0000000000ee'),
  0, 'case 8: no quote took the id from p_fields');
SELECT is((SELECT count(*)::int FROM public.pasantias_quote_groups WHERE quote_id = '14100000-0000-4000-8000-00000000000a'),
  2, 'case 8: quote A keeps G1 and G4');

SELECT * FROM finish();
ROLLBACK;
