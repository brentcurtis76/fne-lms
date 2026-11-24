-- =============================================================================
-- Correos release 1, phase 2 — the contact functions (pgTAP)
--
--   email_address_fingerprint(text)
--   email_add_contacts(jsonb, uuid[], text, text, text, timestamptz, text, uuid)
--   email_erase_contact(uuid, uuid)
--
-- Covers the database half of:
--   C1/C3/I4  one person by hand; same address in other case = same person;
--             cells stored as plain text exactly as given (trimmed)
--   P1        a lead's own tick time and notice version are stored
--   M2        NULL / blank legal basis, source, actor, basis time, (manual,
--             csv) note, lists, consent version: refused, nothing saved
--   B1/E2     bounce, complaint and erased × the four sources, address in
--             another case and with spaces: blocked, nobody added (12 cases)
--   B3        left one list: not re-subscribed to it by any source, counted
--             "left"; left everything: added to nothing
--   E1        erasure: row kept, identity NULL, send rows emptied, no
--             membership subscribed, fingerprint blocked as erased, search
--             finds nothing, a second erase changes nothing
--   I1        12,000 invented rows in one call: six counts exact, add up,
--             exactly the accepted ones become new members; the same call
--             again accepts nobody (the call's time is printed as a diag line)
--   A3/B2     by behaviour: every block row seen during the run is still
--             there at the end; no function deletes a contact
--
-- Every call runs as service_role (the functions are service-role only; 041
-- asserts the refusals for anon and authenticated). Invented people only
-- (@example.test). Runs inside a transaction and rolls back — local only.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(99);

\set actor '''00000000-0000-0000-0000-0000000042aa'''
-- Inside dollar-quoted bodies the literal uuids are used:
--   actor 00000000-0000-0000-0000-0000000042aa
--   L1 42000000-0000-4000-8000-0000000000a1   L2 …a2   archived …a3   L4 …a4   big …b1

INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES (:actor::uuid, 'admin42@correos-prueba.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, email, name, approval_status)
VALUES (:actor::uuid, 'admin42@correos-prueba.invalid', 'Admin Prueba 42', 'approved')
ON CONFLICT (id) DO NOTHING;
INSERT INTO user_roles (user_id, role_type, school_id, is_active) VALUES (:actor::uuid, 'admin', NULL, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.email_lists (id, name, is_public, archived_at) VALUES
  ('42000000-0000-4000-8000-0000000000a1', 'Lista Prueba 42 Uno', false, NULL),
  ('42000000-0000-4000-8000-0000000000a2', 'Lista Prueba 42 Dos', true, NULL),
  ('42000000-0000-4000-8000-0000000000a3', 'Lista Prueba 42 Archivada', false, now()),
  ('42000000-0000-4000-8000-0000000000a4', 'Lista Prueba 42 Cuatro', false, NULL),
  ('42000000-0000-4000-8000-0000000000b1', 'Lista Prueba 42 Grande', false, NULL);

-- Every block row the run ever sees; checked at the end (B2).
CREATE TEMP TABLE seen_blocks (email_hash text PRIMARY KEY, reason text NOT NULL);
CREATE OR REPLACE FUNCTION pg_temp.note_blocks() RETURNS void LANGUAGE sql AS $$
  INSERT INTO seen_blocks SELECT email_hash, reason FROM public.email_suppression ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.fp(a text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(lower(btrim(a)), 'UTF8')), 'hex');
$$;

-- One call with the reason each source would give (manual and csv carry a
-- note; leads carry a consent notice version).
CREATE OR REPLACE FUNCTION pg_temp.add(p_rows jsonb, p_lists uuid[], p_source text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.email_add_contacts(
    p_rows, p_lists, p_source,
    CASE p_source WHEN 'pasantia_leads' THEN 'consent_form'
                  WHEN 'manual' THEN 'manual_verified'
                  ELSE 'customer_relationship' END,
    CASE p_source WHEN 'manual' THEN 'Lo pidió en persona (prueba)'
                  WHEN 'csv_import' THEN 'Archivo de prueba: lista de asistentes'
                  ELSE NULL END,
    now(),
    CASE p_source WHEN 'pasantia_leads' THEN 'aviso-prueba-v1' ELSE NULL END,
    '00000000-0000-0000-0000-0000000042aa'::uuid);
$$;

CREATE OR REPLACE FUNCTION pg_temp.one(a text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(jsonb_build_object('email', a));
$$;

CREATE OR REPLACE FUNCTION pg_temp.n(r jsonb, k text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT (r->>k)::int;
$$;

CREATE TEMP TABLE results (k text PRIMARY KEY, r jsonb);
CREATE TEMP TABLE i1_rows (rows jsonb);

GRANT ALL ON seen_blocks, results, i1_rows TO service_role;
GRANT EXECUTE ON FUNCTION pg_temp.note_blocks(), pg_temp.as_service(), pg_temp.fp(text),
  pg_temp.add(jsonb, uuid[], text), pg_temp.one(text), pg_temp.n(jsonb, text) TO service_role;

SELECT pg_temp.note_blocks();

-- =============================================================================
-- 1. The fingerprint
-- =============================================================================
SELECT pg_temp.as_service();

SELECT is(public.email_address_fingerprint('ana@example.test'),
          encode(sha256(convert_to('ana@example.test', 'UTF8')), 'hex'),
          'fingerprint: SHA-256 hex of the address in UTF-8');
SELECT is(public.email_address_fingerprint('  ANA@Example.Test '),
          public.email_address_fingerprint('ana@example.test'),
          'fingerprint: letter case and surrounding spaces make no difference');
SELECT is(public.email_address_fingerprint('peña@example.test'),
          encode(sha256(convert_to('peña@example.test', 'UTF8')), 'hex'),
          'fingerprint: non-ASCII letters hashed as UTF-8');
SELECT ok(public.email_address_fingerprint(NULL) IS NULL, 'fingerprint: NULL gives NULL');
SELECT ok(public.email_address_fingerprint('   ') IS NULL, 'fingerprint: blank gives NULL');
RESET ROLE;
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid = 'public.email_address_fingerprint(text)'::regprocedure), 'i',
          'fingerprint: IMMUTABLE');

-- =============================================================================
-- 2. [M2] Refusals: nothing saved
-- =============================================================================
SELECT pg_temp.as_service();

SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', NULL, 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: legal_basis_invalid', 'M2: a NULL legal basis raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', '  ', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: legal_basis_invalid', 'M2: a blank legal basis raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', 'implied', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: legal_basis_invalid', 'M2: an unknown legal basis raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   NULL, 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: source_invalid', 'M2: a NULL source raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'tractor_signups', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: source_invalid', 'M2: a source outside the four ways raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', 'manual_verified', 'nota', now(), NULL, NULL)$$,
  '22023', 'email_add_contacts: actor_required', 'M2: a NULL actor raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', 'manual_verified', NULL, now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: basis_note_required', 'M2: by hand without a note raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'csv_import', 'manual_verified', '   ', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: basis_note_required', 'M2: CSV with a blank note raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', 'manual_verified', 'nota', NULL, NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: basis_recorded_at_required', 'M2: no time for the basis raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', NULL,
                   'manual', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: lists_required', 'no list raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY[]::uuid[],
                   'manual', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: lists_required', 'an empty list of lists raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]',
                   ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a3'::uuid],
                   'manual', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: list_not_found_or_archived', 'an archived list among the chosen raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-00000000ffff'::uuid],
                   'manual', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: list_not_found_or_archived', 'an unknown list raises');
SELECT throws_ok($$SELECT public.email_add_contacts('[{"email":"m2@example.test"}]', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'pasantia_leads', 'consent_form', NULL, now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: consent_notice_version_required', 'consent_form without a notice version raises');
SELECT throws_ok($$SELECT public.email_add_contacts('{"email":"m2@example.test"}', ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                   'manual', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: rows_not_array', 'rows that are not an array raise');
SELECT throws_ok($$SELECT public.email_add_contacts(
                     (SELECT jsonb_agg(jsonb_build_object('email', 'm2-' || i || '@example.test')) FROM generate_series(1, 20001) i),
                     ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid],
                     'csv_import', 'manual_verified', 'nota', now(), NULL, '00000000-0000-0000-0000-0000000042aa')$$,
  '22023', 'email_add_contacts: too_many_rows', 'more than 20,000 rows raise');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public.email_contacts WHERE email_normalized LIKE 'm2%@example.test'), 0,
  'M2: none of the refused calls saved a contact');

-- =============================================================================
-- 3. [C1/C3/I4/P1] One person; the same person again; plain text; leads
-- =============================================================================
SELECT pg_temp.as_service();

INSERT INTO results VALUES ('c1', pg_temp.add(
  '[{"email":"  Ana.Prueba@Example.TEST ", "first_name":" =SUM(A1) ", "last_name":"Peña", "organization":"<b>Colegio</b> de Prueba"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid], 'manual'));
RESET ROLE;

SELECT is((SELECT r FROM results WHERE k = 'c1'),
  '{"total":1,"accepted":1,"duplicate":0,"blocked":0,"left":0,"invalid":0,"contacts_created":1,"memberships_created":1}'::jsonb,
  'C1: one person by hand: accepted, one contact, one membership');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', email, email_normalized, first_name, last_name, organization)
     FROM public.email_contacts WHERE email_normalized = 'ana.prueba@example.test'),
  'Ana.Prueba@Example.TEST|ana.prueba@example.test|=SUM(A1)|Peña|<b>Colegio</b> de Prueba',
  'I4/C1: cells stored as plain text exactly as given, after trimming');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', source, legal_basis, basis_note, imported_by, subscribed_at IS NOT NULL AND unsubscribed_at IS NULL)
     FROM public.email_contacts WHERE email_normalized = 'ana.prueba@example.test'),
  'manual|manual_verified|Lo pidió en persona (prueba)|00000000-0000-0000-0000-0000000042aa|t',
  'C1: the contact carries the source, the basis, the note and who added them');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s|%s', m.state, m.joined_via, m.legal_basis, m.basis_note, m.added_by, m.subscribed_at IS NOT NULL)
     FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE c.email_normalized = 'ana.prueba@example.test' AND m.list_id = '42000000-0000-4000-8000-0000000000a1'),
  'subscribed|manual|manual_verified|Lo pidió en persona (prueba)|00000000-0000-0000-0000-0000000042aa|t',
  'C1: subscribed at once, with the reason, its date, who added them and how they joined');

SELECT pg_temp.as_service();
INSERT INTO results VALUES ('c3', pg_temp.add(
  '[{"email":"ANA.PRUEBA@example.test", "first_name":"Otra", "last_name":"Persona"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], 'csv_import'));
INSERT INTO results VALUES ('c3b', pg_temp.add(
  '[{"email":" ana.prueba@EXAMPLE.test "}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], 'manual'));
RESET ROLE;

SELECT is((SELECT r FROM results WHERE k = 'c3'),
  '{"total":1,"accepted":1,"duplicate":0,"blocked":0,"left":0,"invalid":0,"contacts_created":0,"memberships_created":1}'::jsonb,
  'C3: same address in other case: no second contact; the missing list is added');
SELECT is((SELECT count(*)::int FROM public.email_contacts WHERE email_normalized = 'ana.prueba@example.test'), 1,
  'C3: still one contact');
SELECT is((SELECT first_name || ' ' || last_name || '|' || legal_basis FROM public.email_contacts WHERE email_normalized = 'ana.prueba@example.test'),
  '=SUM(A1) Peña|manual_verified', 'C3: an existing contact''s names and basis are not overwritten');
SELECT is((SELECT m.joined_via || '|' || m.legal_basis FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
            WHERE c.email_normalized = 'ana.prueba@example.test' AND m.list_id = '42000000-0000-4000-8000-0000000000a2'),
  'csv_import|customer_relationship', 'C3: the new membership carries THIS call''s reason');
SELECT is(pg_temp.n((SELECT r FROM results WHERE k = 'c3b'), 'duplicate'), 1,
  'C3: on every chosen list already: counted duplicate, nothing changes');

-- P1: a lead's own tick time and notice version
SELECT pg_temp.as_service();
INSERT INTO results VALUES ('p1', pg_temp.add(
  '[{"email":"lead.prueba@example.test", "first_name":"Lía", "basis_recorded_at":"2026-07-15T10:00:00Z", "consent_notice_version":"2026-07-v1"},
    {"email":"lead.dos@example.test", "basis_recorded_at":"2026-08-01T09:30:00Z"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid], 'pasantia_leads'));
INSERT INTO results VALUES ('u1', pg_temp.add(
  '[{"email":"usuario.prueba@example.test", "first_name":"Uno"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid], 'profiles'));
RESET ROLE;

SELECT is(pg_temp.n((SELECT r FROM results WHERE k = 'p1'), 'accepted'), 2, 'P1: two leads accepted');
SELECT is(
  (SELECT format('%s|%s|%s', c.basis_recorded_at = '2026-07-15T10:00:00Z'::timestamptz, c.consent_notice_version, c.legal_basis)
     FROM public.email_contacts c WHERE c.email_normalized = 'lead.prueba@example.test'),
  't|2026-07-v1|consent_form',
  'P1: the lead''s own tick time and notice version are stored on the contact');
SELECT is(
  (SELECT format('%s|%s|%s', m.basis_recorded_at = '2026-07-15T10:00:00Z'::timestamptz, m.consent_notice_version, m.joined_via)
     FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE c.email_normalized = 'lead.prueba@example.test'),
  't|2026-07-v1|pasantia_leads',
  'P1: … and on the membership');
SELECT is(
  (SELECT format('%s|%s', m.basis_recorded_at = '2026-08-01T09:30:00Z'::timestamptz, m.consent_notice_version)
     FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE c.email_normalized = 'lead.dos@example.test'),
  't|aviso-prueba-v1',
  'P1: a row without its own version takes the call''s');
SELECT is(
  (SELECT format('%s|%s|%s', c.source, c.legal_basis, c.basis_note IS NULL) FROM public.email_contacts c
    WHERE c.email_normalized = 'usuario.prueba@example.test'),
  'profiles|customer_relationship|t',
  'U1: a host user is added with the stated basis (a note is optional for this source)');

-- =============================================================================
-- 4. [B3] Left by their own choice
-- =============================================================================
SELECT pg_temp.as_service();
INSERT INTO results VALUES ('b3-setup', pg_temp.add(
  '[{"email":"sale-una@example.test"}, {"email":"sale-todo@example.test"}, {"email":"pendiente@example.test"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], 'manual'));
RESET ROLE;

-- As the person's own link will do in release 2: leave L2 only / leave everything.
UPDATE public.email_list_members m SET state = 'unsubscribed', unsubscribed_at = now(), unsubscribed_by = 'person'
  FROM public.email_contacts c
 WHERE c.id = m.contact_id AND c.email_normalized = 'sale-una@example.test' AND m.list_id = '42000000-0000-4000-8000-0000000000a2';
UPDATE public.email_contacts SET unsubscribed_at = now() WHERE email_normalized = 'sale-todo@example.test';
UPDATE public.email_list_members m SET state = 'unsubscribed', unsubscribed_at = now(), unsubscribed_by = 'person'
  FROM public.email_contacts c
 WHERE c.id = m.contact_id AND c.email_normalized = 'sale-todo@example.test';
-- A pending membership (double opt-in, release 2) on L1 only.
UPDATE public.email_list_members m SET state = 'pending', confirmation_token = '42000000-0000-4000-8000-00000000cafe'
  FROM public.email_contacts c
 WHERE c.id = m.contact_id AND c.email_normalized = 'pendiente@example.test' AND m.list_id = '42000000-0000-4000-8000-0000000000a1';
UPDATE public.email_list_members m SET state = 'unsubscribed', unsubscribed_at = now(), unsubscribed_by = 'person'
  FROM public.email_contacts c
 WHERE c.id = m.contact_id AND c.email_normalized = 'pendiente@example.test' AND m.list_id = '42000000-0000-4000-8000-0000000000a2';

SELECT pg_temp.as_service();
SELECT is(pg_temp.add(pg_temp.one('  SALE-UNA@Example.test '), ARRAY['42000000-0000-4000-8000-0000000000a2'::uuid], s),
  '{"total":1,"accepted":0,"duplicate":0,"blocked":0,"left":1,"invalid":0,"contacts_created":0,"memberships_created":0}'::jsonb,
  'B3: left one list, tried again on it by ' || s || ': counted left, nothing changes')
  FROM unnest(ARRAY['manual', 'csv_import', 'profiles', 'pasantia_leads']) AS s;
SELECT is(pg_temp.add(pg_temp.one('Sale-Todo@example.test'),
                      ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], s),
  '{"total":1,"accepted":0,"duplicate":0,"blocked":0,"left":1,"invalid":0,"contacts_created":0,"memberships_created":0}'::jsonb,
  'B3: left everything, tried by ' || s || ': counted left, added to nothing')
  FROM unnest(ARRAY['manual', 'csv_import', 'profiles', 'pasantia_leads']) AS s;
-- Left L2 and pending on L1: the person is on no list to add, so it is a
-- duplicate (L1 pending, L2 left) and neither membership changes.
SELECT is(pg_temp.n(pg_temp.add(pg_temp.one('pendiente@example.test'),
                      ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], 'csv_import'), 'duplicate'),
  1, 'B3: pending on one list and left the other: nothing to add, counted duplicate');
SELECT is(pg_temp.n(pg_temp.add(pg_temp.one('pendiente@example.test'),
                      ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a4'::uuid], 'csv_import'), 'accepted'),
  1, 'pending on one list, new list chosen too: accepted for the new list');
RESET ROLE;

SELECT is(
  (SELECT string_agg(l.name || '=' || m.state || '/' || coalesce(m.unsubscribed_by, '-'), '; ' ORDER BY l.name)
     FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id JOIN public.email_lists l ON l.id = m.list_id
    WHERE c.email_normalized = 'sale-una@example.test'),
  'Lista Prueba 42 Dos=unsubscribed/person; Lista Prueba 42 Uno=subscribed/-',
  'B3: the list they left is still left (by their own choice); the other unchanged');
SELECT is(
  (SELECT count(*)::int FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE c.email_normalized = 'sale-todo@example.test' AND m.state <> 'unsubscribed'),
  0, 'B3: the person who left everything is on no list');
SELECT is(
  (SELECT string_agg(l.name || '=' || m.state, '; ' ORDER BY l.name)
     FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id JOIN public.email_lists l ON l.id = m.list_id
    WHERE c.email_normalized = 'pendiente@example.test'),
  'Lista Prueba 42 Cuatro=subscribed; Lista Prueba 42 Dos=unsubscribed; Lista Prueba 42 Uno=pending',
  'a pending membership is left as it is; a left one is never changed');
SELECT is((SELECT suppressed_at IS NULL FROM public.email_contacts WHERE email_normalized = 'sale-todo@example.test'), true,
  'B3: leaving is not a block (their own link brings them back in release 2)');

-- =============================================================================
-- 5. [B1/E2] Bounce, complaint, erased × the four sources (12 cases)
-- =============================================================================
-- bounce: a block row only (the address was never a contact)
INSERT INTO public.email_suppression (email_hash, reason) VALUES (pg_temp.fp('rebote@example.test'), 'bounce');
-- complaint: a contact on L1, then the complaint (block row + contact suppressed)
SELECT pg_temp.as_service();
INSERT INTO results VALUES ('b1-setup', pg_temp.add(
  '[{"email":"queja@example.test"}, {"email":"borrada@example.test", "first_name":"Bea"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid], 'manual'));
RESET ROLE;
INSERT INTO public.email_suppression (email_hash, reason) VALUES (pg_temp.fp('queja@example.test'), 'complaint');
UPDATE public.email_contacts SET suppressed_at = now(), suppression_reason = 'complaint'
 WHERE email_normalized = 'queja@example.test';
-- erased: through the function
SELECT pg_temp.as_service();
INSERT INTO results SELECT 'b1-erase', public.email_erase_contact(id, '00000000-0000-0000-0000-0000000042aa')
  FROM public.email_contacts WHERE email_normalized = 'borrada@example.test';
RESET ROLE;
SELECT pg_temp.note_blocks();

SELECT pg_temp.as_service();
SELECT is(
  pg_temp.add(pg_temp.one('  ' || upper(b.addr) || '  '),
              ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], s),
  '{"total":1,"accepted":0,"duplicate":0,"blocked":1,"left":0,"invalid":0,"contacts_created":0,"memberships_created":0}'::jsonb,
  'B1/E2: ' || b.kind || ' address, other case and spaces, by ' || s || ': blocked, nobody added')
  FROM (VALUES ('bounce', 'rebote@example.test'), ('complaint', 'queja@example.test'), ('erased', 'borrada@example.test')) AS b(kind, addr)
  CROSS JOIN unnest(ARRAY['manual', 'csv_import', 'profiles', 'pasantia_leads']) AS s;
RESET ROLE;

SELECT is(
  (SELECT string_agg(s.reason || ':' || (s.erased_at IS NOT NULL)::text, '; ' ORDER BY s.reason)
     FROM public.email_suppression s
    WHERE s.email_hash IN (pg_temp.fp('rebote@example.test'), pg_temp.fp('queja@example.test'), pg_temp.fp('borrada@example.test'))),
  'bounce:false; complaint:false; manual:true',
  'B1: the three blocks are still there, unchanged (the erased one with its erased mark)');
SELECT is((SELECT count(*)::int FROM public.email_contacts WHERE email_normalized IN ('rebote@example.test', 'borrada@example.test')), 0,
  'B1: no contact was created for the bounced or the erased address');
SELECT is(
  (SELECT count(*)::int FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE c.email_normalized = 'queja@example.test'),
  1, 'B1: the complained address got no new membership');
SELECT is(
  (SELECT count(*)::int FROM public.email_list_members m
    WHERE m.contact_id = (SELECT (r->>'contact_id')::uuid FROM results WHERE k = 'b1-erase') AND m.state <> 'unsubscribed'),
  0, 'E2: the erased person is on no list');

-- =============================================================================
-- 6. [E1] Erase this person
-- =============================================================================
SELECT pg_temp.as_service();
INSERT INTO results VALUES ('e1-setup', pg_temp.add(
  '[{"email":"Borrar.Prueba@example.test", "first_name":"Berta", "last_name":"Borrador", "organization":"Colegio Prueba"}]',
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid, '42000000-0000-4000-8000-0000000000a2'::uuid], 'manual'));
RESET ROLE;
UPDATE public.email_list_members m SET state = 'pending', confirmation_token = '42000000-0000-4000-8000-0000000beef0'
  FROM public.email_contacts c
 WHERE c.id = m.contact_id AND c.email_normalized = 'borrar.prueba@example.test' AND m.list_id = '42000000-0000-4000-8000-0000000000a2';
INSERT INTO public.email_campaigns (id, subject) VALUES ('42000000-0000-4000-8000-0000000000e1', 'Campaña de prueba 42');
INSERT INTO public.email_campaign_sends (campaign_id, contact_id, email, status)
SELECT '42000000-0000-4000-8000-0000000000e1', c.id, c.email, 'sent' FROM public.email_contacts c
 WHERE c.email_normalized = 'borrar.prueba@example.test';
INSERT INTO public.email_campaigns (id, subject) VALUES ('42000000-0000-4000-8000-0000000000e2', 'Campaña de prueba 42 b');
INSERT INTO public.email_campaign_sends (campaign_id, contact_id, email, status)
SELECT '42000000-0000-4000-8000-0000000000e2', c.id, c.email, 'sent' FROM public.email_contacts c
 WHERE c.email_normalized = 'borrar.prueba@example.test';
CREATE TEMP TABLE e1 AS SELECT id FROM public.email_contacts WHERE email_normalized = 'borrar.prueba@example.test';
GRANT SELECT ON e1 TO service_role;

SELECT pg_temp.as_service();
INSERT INTO results SELECT 'e1', public.email_erase_contact(e1.id, '00000000-0000-0000-0000-0000000042aa') FROM e1;
RESET ROLE;
SELECT pg_temp.note_blocks();

SELECT is((SELECT r - 'contact_id' FROM results WHERE k = 'e1'),
  '{"erased":true,"already_erased":false,"sends_cleared":2,"memberships_ended":2}'::jsonb,
  'E1: the erase reports what it did');
SELECT is((SELECT count(*)::int FROM public.email_contacts c JOIN e1 USING (id)), 1, 'E1: the contact row still exists');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s|%s|%s', c.email IS NULL, c.email_normalized IS NULL, c.first_name IS NULL, c.last_name IS NULL,
                 c.organization IS NULL, c.basis_note IS NULL, c.unsubscribe_token IS NULL)
     FROM public.email_contacts c JOIN e1 USING (id)),
  't|t|t|t|t|t|t',
  'E1: address, normalised address, names, organisation, note and token are empty');
SELECT is((SELECT anonymized_at IS NOT NULL AND suppressed_at IS NOT NULL FROM public.email_contacts c JOIN e1 USING (id)), true,
  'E1: the contact is marked anonymized and suppressed');
SELECT is((SELECT count(*)::int FROM public.email_campaign_sends s JOIN e1 ON e1.id = s.contact_id WHERE s.email IS NOT NULL), 0,
  'E1: the address is gone from every past send row');
SELECT is((SELECT count(*)::int FROM public.email_campaign_sends s JOIN e1 ON e1.id = s.contact_id), 2,
  'E1: the send rows themselves remain');
SELECT is(
  (SELECT string_agg(m.state || '/' || coalesce(m.unsubscribed_by, '-') || '/' || (m.confirmation_token IS NULL)::text || '/' || (m.basis_note IS NULL)::text,
                     '; ' ORDER BY m.list_id)
     FROM public.email_list_members m JOIN e1 ON e1.id = m.contact_id),
  'unsubscribed/admin/true/true; unsubscribed/admin/true/true',
  'E1: every membership ended (by an admin), token and note empty; none subscribed');
SELECT is(
  (SELECT reason || '|' || (erased_at IS NOT NULL)::text || '|' || erased_by::text FROM public.email_suppression
    WHERE email_hash = pg_temp.fp('borrar.prueba@example.test')),
  'manual|true|00000000-0000-0000-0000-0000000042aa',
  'E1: the fingerprint is in the block list, marked erased, with the acting admin');
SELECT is(
  (SELECT count(*)::int FROM public.email_contacts
    WHERE email ILIKE '%borrar.prueba%' OR email_normalized ILIKE '%borrar.prueba%'
       OR first_name ILIKE '%berta%' OR last_name ILIKE '%borrador%'),
  0, 'E1: a search for the old address or name finds nothing');

CREATE TEMP TABLE e1_before AS
SELECT (SELECT to_jsonb(c) FROM public.email_contacts c JOIN e1 USING (id)) AS contact,
       (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.email_list_members m JOIN e1 ON e1.id = m.contact_id) AS members,
       (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.email_campaign_sends s JOIN e1 ON e1.id = s.contact_id) AS sends,
       (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.email_hash) FROM public.email_suppression s) AS blocks;

SELECT pg_temp.as_service();
INSERT INTO results SELECT 'e1-again', public.email_erase_contact(e1.id, '00000000-0000-0000-0000-0000000042aa') FROM e1;
RESET ROLE;

SELECT is((SELECT r - 'contact_id' FROM results WHERE k = 'e1-again'),
  '{"erased":false,"already_erased":true,"sends_cleared":0,"memberships_ended":0}'::jsonb,
  'E1: a second erase raises nothing and reports nothing done');
SELECT is(
  (SELECT jsonb_build_object(
            'contact', (SELECT to_jsonb(c) FROM public.email_contacts c JOIN e1 USING (id)),
            'members', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.email_list_members m JOIN e1 ON e1.id = m.contact_id),
            'sends',   (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.email_campaign_sends s JOIN e1 ON e1.id = s.contact_id),
            'blocks',  (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.email_hash) FROM public.email_suppression s))),
  (SELECT jsonb_build_object('contact', contact, 'members', members, 'sends', sends, 'blocks', blocks) FROM e1_before),
  'E1: a second erase changes nothing (contact, memberships, sends, block list identical)');

-- Erasing an address that was already blocked for a bounce: the block keeps its reason.
SELECT pg_temp.as_service();
INSERT INTO results VALUES ('e1-bounced-setup', pg_temp.add(pg_temp.one('rebotada@example.test'),
  ARRAY['42000000-0000-4000-8000-0000000000a1'::uuid], 'manual'));
RESET ROLE;
INSERT INTO public.email_suppression (email_hash, reason) VALUES (pg_temp.fp('rebotada@example.test'), 'bounce');
SELECT pg_temp.note_blocks();
SELECT pg_temp.as_service();
INSERT INTO results SELECT 'e1-bounced', public.email_erase_contact(c.id, '00000000-0000-0000-0000-0000000042aa')
  FROM public.email_contacts c WHERE c.email_normalized = 'rebotada@example.test';
SELECT throws_ok($$SELECT public.email_erase_contact('42000000-0000-4000-8000-00000000dead', '00000000-0000-0000-0000-0000000042aa')$$,
  'P0002', 'email_erase_contact: contact_not_found', 'E1: an unknown contact raises a plain error');
SELECT throws_ok($$SELECT public.email_erase_contact(id, NULL) FROM public.email_contacts LIMIT 1$$,
  '22023', 'email_erase_contact: actor_required', 'E1: erasing without an acting admin raises');
RESET ROLE;
SELECT is(
  (SELECT reason || '|' || (erased_at IS NOT NULL)::text FROM public.email_suppression WHERE email_hash = pg_temp.fp('rebotada@example.test')),
  'bounce|true',
  'E1: erasing an address already blocked for a bounce keeps the reason and adds the erased mark');

-- =============================================================================
-- 7. [I1] 12,000 invented rows, one call
--
--   9000  new addresses                                   -> accepted (new contact)
--    200  known contacts, not on the list                 -> accepted (membership only)
--    500  repeats inside the call (250 exact, 250 in other
--         case with spaces)                               -> duplicate
--    500  already subscribed to the list                  -> duplicate
--    300  bounced (block row only)                        -> blocked
--    300  complained (contact suppressed + block row)     -> blocked
--    200  erased (through email_erase_contact)            -> blocked
--    400  left everything (contact unsubscribed_at)       -> left
--    100  left this list (membership unsubscribed)        -> left
--    500  malformed                                       -> invalid
--  12000  total; accepted 9200, duplicate 1000, blocked 800, left 500, invalid 500
-- =============================================================================
INSERT INTO public.email_contacts (email, email_normalized, first_name, source, legal_basis, basis_note, basis_recorded_at,
                                   subscribed_at, unsubscribed_at, suppressed_at, suppression_reason)
SELECT g.kind || '-' || i || '@example.test', g.kind || '-' || i || '@example.test', 'Original',
       'manual', 'manual_verified', 'nota de prueba', now(), now(),
       CASE WHEN g.kind = 'left' THEN now() END,
       CASE WHEN g.kind = 'complaint' THEN now() END,
       CASE WHEN g.kind = 'complaint' THEN 'complaint' END
  FROM (VALUES ('sub', 500), ('complaint', 300), ('erased', 200), ('left', 400), ('leftlist', 100), ('known', 200)) AS g(kind, n)
  CROSS JOIN LATERAL generate_series(1, g.n) AS i;

INSERT INTO public.email_list_members (list_id, contact_id, state, joined_via, legal_basis, basis_note, basis_recorded_at,
                                       subscribed_at, unsubscribed_at, unsubscribed_by)
SELECT '42000000-0000-4000-8000-0000000000b1', c.id,
       CASE WHEN c.email LIKE 'leftlist-%' THEN 'unsubscribed' ELSE 'subscribed' END,
       'manual', 'manual_verified', 'nota de prueba', now(), now(),
       CASE WHEN c.email LIKE 'leftlist-%' THEN now() END,
       CASE WHEN c.email LIKE 'leftlist-%' THEN 'person' END
  FROM public.email_contacts c
 WHERE c.email ~ '^(sub|leftlist|erased)-[0-9]+@example[.]test$';

INSERT INTO public.email_suppression (email_hash, reason)
SELECT pg_temp.fp(k || '-' || i || '@example.test'), k
  FROM (VALUES ('bounce', 300), ('complaint', 300)) AS g(k, n)
  CROSS JOIN LATERAL generate_series(1, g.n) AS i;

SELECT pg_temp.as_service();
INSERT INTO results
SELECT 'i1-erase-' || c.id, public.email_erase_contact(c.id, '00000000-0000-0000-0000-0000000042aa')
  FROM public.email_contacts c WHERE c.email ~ '^erased-[0-9]+@example[.]test$';
RESET ROLE;
SELECT pg_temp.note_blocks();

INSERT INTO i1_rows
SELECT jsonb_agg(jsonb_build_object('email', a.email, 'first_name', 'Nombre ' || a.ord, 'last_name', 'Apellido',
                                    'organization', 'Colegio Prueba')
                 ORDER BY a.grp, a.ord)
  FROM (
    SELECT 1 AS grp, i AS ord, 'new-' || i || '@example.test' AS email FROM generate_series(1, 9000) i
    UNION ALL SELECT 2, i, 'Sub-' || i || '@Example.Test' FROM generate_series(1, 500) i
    UNION ALL SELECT 3, i, 'BOUNCE-' || i || '@example.test' FROM generate_series(1, 300) i
    UNION ALL SELECT 4, i, ' complaint-' || i || '@EXAMPLE.test' FROM generate_series(1, 300) i
    UNION ALL SELECT 5, i, 'Erased-' || i || '@example.TEST' FROM generate_series(1, 200) i
    UNION ALL SELECT 6, i, 'left-' || i || '@example.test' FROM generate_series(1, 400) i
    UNION ALL SELECT 7, i, 'LeftList-' || i || '@example.test' FROM generate_series(1, 100) i
    UNION ALL SELECT 8, i, 'known-' || i || '@example.test' FROM generate_series(1, 200) i
    UNION ALL SELECT 9, i,
      CASE i % 6
        WHEN 0 THEN 'sinarroba' || i || '.example.test'
        WHEN 1 THEN 'dos@' || i || '@example.test'
        WHEN 2 THEN 'con espacio' || i || '@example.test'
        WHEN 3 THEN 'sinpunto' || i || '@example'
        WHEN 4 THEN repeat('x', 250) || i || '@example.test'
        ELSE CASE WHEN i % 12 = 5 THEN '' ELSE 'ctl' || chr(9) || i || '@example.test' END
      END
      FROM generate_series(1, 500) i
    UNION ALL SELECT 10, i,
      CASE WHEN i <= 250 THEN 'new-' || i || '@example.test' ELSE '  NEW-' || i || '@EXAMPLE.TEST  ' END
      FROM generate_series(1, 500) i
  ) a;

SELECT is((SELECT jsonb_array_length(rows) FROM i1_rows), 12000, 'I1: the invented file has 12,000 rows');

CREATE TEMP TABLE i1_before AS
SELECT (SELECT count(*) FROM public.email_contacts) AS contacts,
       (SELECT count(*) FROM public.email_list_members WHERE list_id = '42000000-0000-4000-8000-0000000000b1') AS members,
       (SELECT count(*) FROM public.email_suppression) AS blocks;

SELECT pg_temp.as_service();
SELECT set_config('p2db.t0', clock_timestamp()::text, true);
INSERT INTO results SELECT 'i1', public.email_add_contacts(
  (SELECT rows FROM i1_rows), ARRAY['42000000-0000-4000-8000-0000000000b1'::uuid],
  'csv_import', 'customer_relationship', 'Archivo de prueba de 12.000 filas', now(), NULL,
  '00000000-0000-0000-0000-0000000042aa');
SELECT diag('I1: the 12,000-row call took ' || round(extract(epoch FROM clock_timestamp() - current_setting('p2db.t0')::timestamptz) * 1000) || ' ms');
SELECT set_config('p2db.t0', clock_timestamp()::text, true);
INSERT INTO results SELECT 'i1-again', public.email_add_contacts(
  (SELECT rows FROM i1_rows), ARRAY['42000000-0000-4000-8000-0000000000b1'::uuid],
  'csv_import', 'customer_relationship', 'Archivo de prueba de 12.000 filas', now(), NULL,
  '00000000-0000-0000-0000-0000000042aa');
SELECT diag('I1: the same call again took ' || round(extract(epoch FROM clock_timestamp() - current_setting('p2db.t0')::timestamptz) * 1000) || ' ms');
RESET ROLE;

SELECT is((SELECT r FROM results WHERE k = 'i1'),
  '{"total":12000,"accepted":9200,"duplicate":1000,"blocked":800,"left":500,"invalid":500,"contacts_created":9000,"memberships_created":9200}'::jsonb,
  'I1: the six counts equal the known numbers');
SELECT is((SELECT pg_temp.n(r, 'accepted') + pg_temp.n(r, 'duplicate') + pg_temp.n(r, 'blocked') + pg_temp.n(r, 'left') + pg_temp.n(r, 'invalid')
             FROM results WHERE k = 'i1'), 12000,
  'I1: the counts add up to 12,000');
SELECT is((SELECT count(*) FROM public.email_contacts) - (SELECT contacts FROM i1_before), 9000::bigint,
  'I1: exactly 9,000 new contacts');
SELECT is((SELECT count(*) FROM public.email_list_members WHERE list_id = '42000000-0000-4000-8000-0000000000b1')
          - (SELECT members FROM i1_before), 9200::bigint,
  'I1: exactly 9,200 new members');
SELECT is(
  (SELECT count(*)::int FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE m.list_id = '42000000-0000-4000-8000-0000000000b1' AND m.joined_via = 'csv_import' AND m.state = 'subscribed'
      AND c.email_normalized ~ '^(new-[0-9]+|known-[0-9]+)@example[.]test$'),
  9200, 'I1: the new members are exactly the accepted ones (the new and the known addresses), subscribed');
SELECT is((SELECT count(DISTINCT email_normalized)::int FROM public.email_contacts WHERE email_normalized ~ '^new-[0-9]+@example[.]test$'), 9000,
  'I1: each new address once, repeats inside the call not doubled');
SELECT is(
  (SELECT count(*)::int FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
    WHERE m.list_id = '42000000-0000-4000-8000-0000000000b1' AND m.joined_via = 'csv_import'
      AND (c.email_normalized !~ '^(new-[0-9]+|known-[0-9]+)@example[.]test$' OR c.email_normalized IS NULL)),
  0, 'I1: no blocked, left, already-subscribed or erased person got a membership');
SELECT is((SELECT count(*)::int FROM public.email_contacts WHERE email_normalized ~ '^bounce-[0-9]+@example[.]test$'), 0,
  'I1: no contact for a bounced address');
SELECT is((SELECT count(*)::int FROM public.email_list_members m JOIN public.email_contacts c ON c.id = m.contact_id
            WHERE c.email_normalized ~ '^leftlist-[0-9]+@example[.]test$' AND m.state = 'unsubscribed' AND m.unsubscribed_by = 'person'), 100,
  'I1: the hundred who left this list are still left');
SELECT is((SELECT count(*)::int FROM public.email_contacts WHERE email_normalized ~ '^known-[0-9]+@example[.]test$' AND first_name = 'Original'), 200,
  'I1: known contacts keep their own names');
SELECT is(
  (SELECT format('%s|%s|%s|%s', c.source, c.legal_basis, c.basis_note, c.imported_by)
     FROM public.email_contacts c WHERE c.email_normalized = 'new-1@example.test'),
  'csv_import|customer_relationship|Archivo de prueba de 12.000 filas|00000000-0000-0000-0000-0000000042aa',
  'I2: the stated reason, its note and the admin are stored on an accepted person');
SELECT is((SELECT count(*) FROM public.email_suppression), (SELECT blocks FROM i1_before),
  'I1: the block list is unchanged by the import');

SELECT is((SELECT r FROM results WHERE k = 'i1-again'),
  '{"total":12000,"accepted":0,"duplicate":10200,"blocked":800,"left":500,"invalid":500,"contacts_created":0,"memberships_created":0}'::jsonb,
  'I1: the same call a second time accepts nobody');

-- =============================================================================
-- 8. [A3/B2] By behaviour: no block lifted, no contact deleted
-- =============================================================================
SELECT is(
  (SELECT count(*)::int FROM seen_blocks b
    WHERE NOT EXISTS (SELECT 1 FROM public.email_suppression s WHERE s.email_hash = b.email_hash AND s.reason = b.reason)),
  0,
  'B2: every block row seen during the run is still there with its reason, after every function call');
SELECT is((SELECT count(*)::int FROM seen_blocks), (SELECT count(*)::int FROM public.email_suppression),
  'B2: the run saw every block row there is');
SELECT is(
  (SELECT count(*)::int FROM results r WHERE r.k LIKE '%erase%' OR r.k IN ('e1', 'e1-again', 'e1-bounced')),
  (SELECT count(*)::int FROM results r JOIN public.email_contacts c ON c.id = (r.r->>'contact_id')::uuid
    WHERE r.k LIKE '%erase%' OR r.k IN ('e1', 'e1-again', 'e1-bounced')),
  'A3: every erased contact row still exists (no function deletes a contact)');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.oid IN ('public.email_address_fingerprint(text)'::regprocedure,
                    'public.email_add_contacts(jsonb, uuid[], text, text, text, timestamp with time zone, text, uuid)'::regprocedure,
                    'public.email_erase_contact(uuid, uuid)'::regprocedure)
      AND p.prosrc ~* '\mdelete\M|\mtruncate\M'),
  0,
  'B2/A3: no new function holds a DELETE or a TRUNCATE');

SELECT * FROM finish();

ROLLBACK;
