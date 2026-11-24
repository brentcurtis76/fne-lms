-- =============================================================================
-- 20261124200200_email_contact_functions.sql — Correos release 1, phase 2
--
-- The only way the application writes contacts and memberships:
--
--   email_address_fingerprint(text) -> text
--       SHA-256 hex of lower(btrim(address)) in UTF-8; NULL or blank gives
--       NULL. The same digest email_suppression.email_hash holds.
--
--   email_add_contacts(rows, list ids, source, legal basis, basis note,
--                      basis recorded at, consent notice version, actor) -> jsonb
--       The ONE function behind all four ways of bringing people in (by hand,
--       CSV, host users, pasantías leads), so the rules cannot differ between
--       them. Set-based (one statement classifies and writes every row). One
--       transaction: a failure saves nothing.
--
--   email_erase_contact(contact id, actor) -> jsonb
--       Fingerprint into the block list (reason 'manual', erased_at set: see
--       20261124200100), then the contact made anonymous, its address removed
--       from every send row, every membership ended. The row is NOT deleted.
--       A second call changes nothing.
--
-- No function here deletes a row, lifts a block (no UPDATE or DELETE of an
-- existing email_suppression row beyond stamping erased_at once), deletes a
-- contact, a list or a member. No parameter has a default.
--
-- All three: SECURITY DEFINER, search_path = public, pg_temp, EXECUTE for
-- service_role only. Part of the generic email kit: no host table is read.
--
-- Serialisation: email_add_contacts and email_erase_contact take the same
-- transaction-level advisory lock, so two imports, or an import and an
-- erasure, never interleave (no lost classification, no duplicate-key race).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The fingerprint
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_address_fingerprint(p_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_address IS NULL OR btrim(p_address) = '' THEN NULL
           ELSE encode(sha256(convert_to(lower(btrim(p_address)), 'UTF8')), 'hex')
         END;
$$;

REVOKE ALL ON FUNCTION public.email_address_fingerprint(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_address_fingerprint(text) TO service_role;

COMMENT ON FUNCTION public.email_address_fingerprint(text) IS
  'SHA-256 hex digest of lower(btrim(address)) in UTF-8 (the email_suppression.email_hash form). NULL or blank address gives NULL. Service role only.';


-- -----------------------------------------------------------------------------
-- 2. Bringing people in
--
-- p_rows: a jsonb ARRAY (at most 20000 elements) of objects
--   { "email": text, "first_name": text?, "last_name": text?,
--     "organization": text?, "basis_recorded_at": timestamptz text?,
--     "consent_notice_version": text? }
--   Cells are trimmed and stored as plain text, blank -> NULL; nothing is
--   interpreted. A row's own basis_recorded_at / consent_notice_version
--   (pasantías leads: the tick's time and notice version) wins over the call's.
-- p_list_ids: at least one; every one exists and is not archived.
-- p_source: manual | csv_import | profiles | pasantia_leads.
-- p_legal_basis: consent_form | customer_relationship | manual_verified.
-- p_basis_note: required (non-blank) for manual and csv_import.
-- p_basis_recorded_at: required.
-- p_consent_notice_version: required (here or on every row) for consent_form.
-- p_actor: required; stored as imported_by (new contacts) and added_by.
--
-- Each row, in this order:
--   a. malformed address                                   -> invalid
--   b. same lower(btrim()) address earlier in the call     -> duplicate
--   c. fingerprint in email_suppression, or the contact has
--      suppressed_at or anonymized_at                      -> blocked
--   d. contact has unsubscribed_at, or is 'unsubscribed' on
--      every chosen list                                   -> left
--   e. contact has a membership (subscribed or pending) on
--      every chosen list where it is not unsubscribed      -> duplicate
--   f. otherwise                                           -> accepted
--      (contact created if new; existing names and basis untouched; a
--       'subscribed' membership with this call's reason on every chosen list
--       where the contact has none; unsubscribed and pending memberships are
--       never changed)
--
-- Returns { "total", "accepted", "duplicate", "blocked", "left", "invalid",
--           "contacts_created", "memberships_created" } (integers);
-- total = accepted + duplicate + blocked + left + invalid.
-- Errors (SQLSTATE 22023, message 'email_add_contacts: <code>'): rows_not_array,
-- too_many_rows, lists_required, list_not_found_or_archived, source_invalid,
-- legal_basis_invalid, basis_note_required, basis_recorded_at_required,
-- consent_notice_version_required, actor_required.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_add_contacts(
  p_rows jsonb,
  p_list_ids uuid[],
  p_source text,
  p_legal_basis text,
  p_basis_note text,
  p_basis_recorded_at timestamp with time zone,
  p_consent_notice_version text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source  text := nullif(btrim(p_source), '');
  v_basis   text := nullif(btrim(p_legal_basis), '');
  v_note    text := nullif(btrim(p_basis_note), '');
  v_version text := nullif(btrim(p_consent_notice_version), '');
  v_lists   uuid[];
  v_n_lists integer;
  v_found   integer;
  v_now     timestamp with time zone := now();
  v_result  jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'email_add_contacts: rows_not_array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 20000 THEN
    RAISE EXCEPTION 'email_add_contacts: too_many_rows' USING ERRCODE = '22023';
  END IF;
  IF v_source IS NULL OR NOT (v_source = ANY (ARRAY['manual', 'csv_import', 'profiles', 'pasantia_leads'])) THEN
    RAISE EXCEPTION 'email_add_contacts: source_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_basis IS NULL OR NOT (v_basis = ANY (ARRAY['consent_form', 'customer_relationship', 'manual_verified'])) THEN
    RAISE EXCEPTION 'email_add_contacts: legal_basis_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL AND v_source = ANY (ARRAY['manual', 'csv_import']) THEN
    RAISE EXCEPTION 'email_add_contacts: basis_note_required' USING ERRCODE = '22023';
  END IF;
  IF p_basis_recorded_at IS NULL THEN
    RAISE EXCEPTION 'email_add_contacts: basis_recorded_at_required' USING ERRCODE = '22023';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'email_add_contacts: actor_required' USING ERRCODE = '22023';
  END IF;
  IF p_list_ids IS NULL OR cardinality(p_list_ids) = 0 OR array_position(p_list_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'email_add_contacts: lists_required' USING ERRCODE = '22023';
  END IF;
  IF v_basis = 'consent_form' AND v_version IS NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_rows) AS r(val)
        WHERE nullif(btrim(CASE WHEN jsonb_typeof(r.val) = 'object'
                                THEN r.val->>'consent_notice_version' END), '') IS NULL) THEN
    RAISE EXCEPTION 'email_add_contacts: consent_notice_version_required' USING ERRCODE = '22023';
  END IF;

  -- One import or erasure at a time.
  PERFORM pg_advisory_xact_lock(hashtext('public.email_contacts:write'));

  SELECT array_agg(DISTINCT x) INTO v_lists FROM unnest(p_list_ids) AS x;
  v_n_lists := cardinality(v_lists);

  -- The chosen lists exist, are not archived, and stay so until we commit.
  PERFORM 1 FROM public.email_lists l
    WHERE l.id = ANY (v_lists) AND l.archived_at IS NULL
    FOR SHARE;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found <> v_n_lists THEN
    RAISE EXCEPTION 'email_add_contacts: list_not_found_or_archived' USING ERRCODE = '22023';
  END IF;

  WITH src AS (
    SELECT r.ord,
           nullif(btrim(o.val->>'email'), '')                  AS email,
           nullif(btrim(o.val->>'first_name'), '')             AS first_name,
           nullif(btrim(o.val->>'last_name'), '')              AS last_name,
           nullif(btrim(o.val->>'organization'), '')           AS organization,
           coalesce(nullif(btrim(o.val->>'basis_recorded_at'), '')::timestamptz,
                    p_basis_recorded_at)                       AS recorded_at,
           coalesce(nullif(btrim(o.val->>'consent_notice_version'), ''),
                    v_version)                                 AS notice_version
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS r(val, ord)
      CROSS JOIN LATERAL (
        SELECT CASE WHEN jsonb_typeof(r.val) = 'object' THEN r.val ELSE '{}'::jsonb END AS val
      ) o
  ),
  checked AS (
    SELECT s.*,
           (s.email IS NOT NULL
            AND char_length(s.email) <= 254
            AND s.email ~ '^[^[:space:][:cntrl:]@<>,;]+@[^[:space:][:cntrl:]@<>,;]+[.][^[:space:][:cntrl:]@<>,;]+$'
           ) AS valid,
           lower(s.email) AS norm
      FROM src s
  ),
  ranked AS MATERIALIZED (
    SELECT c.*,
           CASE WHEN c.valid
                THEN row_number() OVER (PARTITION BY c.valid, c.norm ORDER BY c.ord)
           END AS rn,
           CASE WHEN c.valid THEN public.email_address_fingerprint(c.norm) END AS fp
      FROM checked c
  ),
  -- The chosen lists' memberships per contact, aggregated once (joins, not a
  -- lookup per row, so the plan stays linear whatever the table statistics).
  memberships AS (
    SELECT m.contact_id,
           count(*) FILTER (WHERE m.state = 'unsubscribed') AS n_left,
           count(*)                                         AS n_member
      FROM public.email_list_members m
     WHERE m.list_id = ANY (v_lists)
     GROUP BY m.contact_id
  ),
  cls AS MATERIALIZED (
    SELECT k.*,
           ec.id AS contact_id,
           CASE
             WHEN NOT k.valid THEN 'invalid'
             WHEN k.rn > 1 THEN 'duplicate'
             WHEN es.email_hash IS NOT NULL
               OR ec.suppressed_at IS NOT NULL
               OR ec.anonymized_at IS NOT NULL THEN 'blocked'
             WHEN ec.id IS NOT NULL
              AND (ec.unsubscribed_at IS NOT NULL OR coalesce(ms.n_left, 0) = v_n_lists) THEN 'left'
             WHEN ec.id IS NOT NULL AND coalesce(ms.n_member, 0) = v_n_lists THEN 'duplicate'
             ELSE 'accepted'
           END AS outcome
      FROM ranked k
      LEFT JOIN public.email_suppression es
        ON k.rn = 1 AND es.email_hash = k.fp
      LEFT JOIN public.email_contacts ec
        ON k.rn = 1 AND ec.email_normalized = k.norm
      LEFT JOIN memberships ms
        ON ms.contact_id = ec.id
  ),
  -- The accepted rows with the contact they land on: the existing one, or a
  -- new id given here (so no join back to the inserted rows is needed).
  targets AS MATERIALIZED (
    SELECT c.*, coalesce(c.contact_id, gen_random_uuid()) AS target_id
      FROM cls c
     WHERE c.outcome = 'accepted'
  ),
  new_contacts AS (
    INSERT INTO public.email_contacts (
      id, email, email_normalized, first_name, last_name, organization,
      source, legal_basis, basis_note, basis_recorded_at, consent_notice_version,
      imported_by, subscribed_at
    )
    SELECT t.target_id, t.email, t.norm, t.first_name, t.last_name, t.organization,
           v_source, v_basis, v_note, t.recorded_at, t.notice_version,
           p_actor, v_now
      FROM targets t
     WHERE t.contact_id IS NULL
    RETURNING id
  ),
  new_members AS (
    INSERT INTO public.email_list_members (
      list_id, contact_id, state, joined_via,
      legal_basis, basis_note, basis_recorded_at, consent_notice_version,
      added_by, subscribed_at
    )
    SELECT l.list_id, t.target_id, 'subscribed', v_source,
           v_basis, v_note, t.recorded_at, t.notice_version,
           p_actor, v_now
      FROM targets t
      CROSS JOIN unnest(v_lists) AS l(list_id)
     WHERE t.contact_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.email_list_members m
                        WHERE m.contact_id = t.contact_id AND m.list_id = l.list_id)
    RETURNING 1
  )
  SELECT jsonb_build_object(
           'total',               (SELECT count(*) FROM cls),
           'accepted',            (SELECT count(*) FROM cls WHERE outcome = 'accepted'),
           'duplicate',           (SELECT count(*) FROM cls WHERE outcome = 'duplicate'),
           'blocked',             (SELECT count(*) FROM cls WHERE outcome = 'blocked'),
           'left',                (SELECT count(*) FROM cls WHERE outcome = 'left'),
           'invalid',             (SELECT count(*) FROM cls WHERE outcome = 'invalid'),
           'contacts_created',    (SELECT count(*) FROM new_contacts),
           'memberships_created', (SELECT count(*) FROM new_members)
         )
    INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.email_add_contacts(jsonb, uuid[], text, text, text, timestamp with time zone, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_add_contacts(jsonb, uuid[], text, text, text, timestamp with time zone, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.email_add_contacts(jsonb, uuid[], text, text, text, timestamp with time zone, text, uuid) IS
  'Correos: the one way people are brought in (manual, csv_import, profiles, pasantia_leads). Rows are classified in order invalid, duplicate (inside the call), blocked (fingerprint in email_suppression, or contact suppressed/anonymized), left (contact unsubscribed, or unsubscribed on every chosen list), duplicate (already on every chosen list), accepted. Accepted: contact created if new (existing names and basis untouched) and a subscribed membership with this call''s reason on each chosen list without one. Never changes an unsubscribed or pending membership, never lifts a block, deletes nothing. No defaults; NULL or blank source, legal basis, actor, basis time, or (manual/csv) note raises and saves nothing. Returns total/accepted/duplicate/blocked/left/invalid/contacts_created/memberships_created. Service role only.';


-- -----------------------------------------------------------------------------
-- 3. Erasing a person
--
-- Returns { "contact_id": uuid, "erased": bool (true when this call erased),
--           "already_erased": bool, "sends_cleared": int,
--           "memberships_ended": int }.
-- Errors (message 'email_erase_contact: <code>'): actor_required (22023),
-- contact_not_found (P0002).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_erase_contact(
  p_contact_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact public.email_contacts%ROWTYPE;
  v_hash    text;
  v_sends   integer := 0;
  v_members integer := 0;
  v_now     timestamp with time zone := now();
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'email_erase_contact: actor_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.email_contacts:write'));

  SELECT * INTO v_contact FROM public.email_contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'email_erase_contact: contact_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_contact.anonymized_at IS NULL THEN
    -- 1. The block, by fingerprint only. An existing block keeps its reason
    --    and gains the erased mark once; nothing is ever lifted.
    v_hash := public.email_address_fingerprint(v_contact.email_normalized);
    INSERT INTO public.email_suppression AS es (email_hash, reason, erased_at, erased_by)
    VALUES (v_hash, 'manual', v_now, p_actor)
    ON CONFLICT (email_hash) DO UPDATE
      SET erased_at = v_now, erased_by = p_actor
      WHERE es.erased_at IS NULL;
  END IF;

  -- 2. The address leaves every past send row.
  UPDATE public.email_campaign_sends
     SET email = NULL
   WHERE contact_id = p_contact_id
     AND email IS NOT NULL;
  GET DIAGNOSTICS v_sends = ROW_COUNT;

  -- 3. Every membership ends; its token and its free-text note go.
  UPDATE public.email_list_members m
     SET unsubscribed_by    = CASE WHEN m.state = 'unsubscribed' THEN m.unsubscribed_by ELSE 'admin' END,
         unsubscribed_at    = CASE WHEN m.state = 'unsubscribed' THEN coalesce(m.unsubscribed_at, v_now) ELSE v_now END,
         state              = 'unsubscribed',
         confirmation_token = NULL,
         basis_note         = NULL
   WHERE m.contact_id = p_contact_id
     AND (m.state <> 'unsubscribed' OR m.confirmation_token IS NOT NULL OR m.basis_note IS NOT NULL);
  GET DIAGNOSTICS v_members = ROW_COUNT;

  -- 4. The contact becomes anonymous (the shape email_contacts_identity_shape_check
  --    demands) and suppressed; the row stays.
  IF v_contact.anonymized_at IS NULL THEN
    UPDATE public.email_contacts
       SET email              = NULL,
           email_normalized   = NULL,
           first_name         = NULL,
           last_name          = NULL,
           organization       = NULL,
           basis_note         = NULL,
           unsubscribe_token  = NULL,
           anonymized_at      = v_now,
           suppressed_at      = coalesce(suppressed_at, v_now),
           suppression_reason = coalesce(suppression_reason, 'manual')
     WHERE id = p_contact_id;
  END IF;

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'erased', v_contact.anonymized_at IS NULL,
    'already_erased', v_contact.anonymized_at IS NOT NULL,
    'sends_cleared', v_sends,
    'memberships_ended', v_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.email_erase_contact(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_erase_contact(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.email_erase_contact(uuid, uuid) IS
  'Correos: erases a person. Writes the address fingerprint into email_suppression (reason manual, erased_at/erased_by set; an existing block keeps its reason and gains erased_at), makes the contact anonymous and suppressed (address, names, organisation, basis note, unsubscribe token NULL; anonymized_at set), NULLs email on every send row of the contact, and ends every membership (unsubscribed, token and note NULL). The row is not deleted; a second call changes nothing; an unknown id raises contact_not_found. Service role only.';
