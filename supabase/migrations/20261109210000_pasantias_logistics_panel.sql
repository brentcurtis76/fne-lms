-- =============================================================================
-- pasantias_panel_* — FNE's logistics panel for the January (enero-2027)
-- Pasantías cohort: per-traveller tracking (airfare, lodging, program
-- payments), per-roster letter wording, private documents and an activity log.
-- Read and written only by the admin routes under /api/admin/pasantias-panel.
--
-- Additive only: five new tables, four triggers, eleven new service-role
-- functions and one private storage bucket. No column, constraint, trigger,
-- policy, grant or comment of any existing object changes; the intake tables
-- and their RPCs stay byte-identical, so pgTAP 114 and 115 keep their pins.
-- Nothing is dropped, truncated or destructively altered; no data is copied or
-- derived. Rollback is FORWARD-ONLY: stop the callers, then ship a follow-up
-- migration.
--
-- The school form now saves through two wrappers defined here
-- (pasantias_panel_school_save_participant / _school_save_funding). Each takes
-- the roster lock, applies the "ticket already bought" locks, then calls the
-- unchanged pasantias_nomina_* function; the participant wrapper also stores
-- the traveller's email in pasantias_panel_contacts.
--
-- ACCESS MATRIX (every grant explicit)
--   role           logistics / roster_details / contacts   documents               activity               functions
--   PUBLIC, anon   none (REVOKE ALL)                        none                    none                   none
--   authenticated  none (REVOKE ALL; admins included)       none                    none                   none
--   service_role   SELECT/INSERT/UPDATE                     SELECT/INSERT/UPDATE/   SELECT/INSERT/DELETE   all eleven
--                                                           DELETE
-- RLS enabled, no permissive policy, restrictive forced_password_change_guard
-- installed. An admin removes a document by stamping removed_at/removed_by (the
-- API deletes the stored file); activity gets no UPDATE grant. DELETE exists
-- on documents and activity only for the retention sweep
-- (pasantias_panel_purge_expired): no route deletes rows any other way.
--
-- Storage: bucket pasantias-documents is private and has NO storage.objects
-- policy, so only the service-role API reaches it (the licitaciones precedent).
--
-- Concurrency: pasantias_panel_save_participant locks the roster row and then
-- the participant row, the same order as the coordinator RPCs, so an admin
-- correction and a school edit of the same roster are serialized. The two
-- logistics functions lock only participant rows (bulk: in id order) and never
-- a roster afterwards, so no lock cycle exists.
-- =============================================================================

CREATE TABLE public.pasantias_panel_logistics (
  participant_id uuid NOT NULL,
  flight_status text NOT NULL DEFAULT 'pending',
  lodging_status text NOT NULL DEFAULT 'pending',
  deposit_received boolean NOT NULL DEFAULT false,
  balance_received boolean NOT NULL DEFAULT false,
  salutation text NULL,                       -- letter greeting; NULL = not chosen yet
  notes text NULL,
  scl_departure_date date NULL,               -- the traveller's real flights, entered by FNE
  bcn_arrival_date date NULL,
  bcn_departure_date date NULL,
  scl_arrival_date date NULL,
  letter_sent_at timestamptz NULL,            -- last time the invitation letter was emailed
  letter_sent_to text NULL,
  letter_send_claimed_at timestamptz NULL,    -- a send in progress (lease, 15 minutes)
  letter_send_error text NULL,                -- why the last attempt sent nothing (a code)
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NULL,                       -- admin id, no FK (as rosters.created_by)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_panel_logistics_pkey PRIMARY KEY (participant_id),
  CONSTRAINT pasantias_panel_logistics_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.pasantias_intake_participants (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_panel_logistics_flight_check
    CHECK (flight_status IN ('pending', 'purchased', 'paid')),
  CONSTRAINT pasantias_panel_logistics_lodging_check
    CHECK (lodging_status IN ('pending', 'reserved', 'paid')),
  CONSTRAINT pasantias_panel_logistics_salutation_check
    CHECK (salutation IS NULL OR salutation IN ('estimado', 'estimada')),
  CONSTRAINT pasantias_panel_logistics_notes_check
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  -- The four flight dates never run backwards (same-day legs allowed).
  CONSTRAINT pasantias_panel_logistics_flight_dates_check
    CHECK ((scl_departure_date IS NULL OR bcn_arrival_date IS NULL OR bcn_arrival_date >= scl_departure_date)
       AND (scl_departure_date IS NULL OR bcn_departure_date IS NULL OR bcn_departure_date >= scl_departure_date)
       AND (scl_departure_date IS NULL OR scl_arrival_date IS NULL OR scl_arrival_date >= scl_departure_date)
       AND (bcn_arrival_date IS NULL OR bcn_departure_date IS NULL OR bcn_departure_date >= bcn_arrival_date)
       AND (bcn_arrival_date IS NULL OR scl_arrival_date IS NULL OR scl_arrival_date >= bcn_arrival_date)
       AND (bcn_departure_date IS NULL OR scl_arrival_date IS NULL OR scl_arrival_date >= bcn_departure_date)),
  CONSTRAINT pasantias_panel_logistics_letter_sent_check
    CHECK ((letter_sent_at IS NULL) = (letter_sent_to IS NULL)),
  CONSTRAINT pasantias_panel_logistics_letter_error_check
    CHECK (letter_send_error IS NULL OR letter_send_error ~ '^[a-z_]{1,40}$'),
  CONSTRAINT pasantias_panel_logistics_version_check
    CHECK (version >= 1)
);

-- The traveller's email: asked on the school form, correctable by FNE. Stored
-- lower-case; it is also how a traveller's GENERA account is recognised.
CREATE TABLE public.pasantias_panel_contacts (
  participant_id uuid NOT NULL,
  email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_panel_contacts_pkey PRIMARY KEY (participant_id),
  CONSTRAINT pasantias_panel_contacts_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.pasantias_intake_participants (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_panel_contacts_email_check
    CHECK (email IS NULL
           OR (char_length(email) BETWEEN 6 AND 254 AND email = lower(email)
               AND email ~ '^[^[:space:][:cntrl:]@<>,;]+@[^[:space:][:cntrl:]@<>,;]+[.][^[:space:][:cntrl:]@<>,;]+$'))
);

CREATE INDEX pasantias_panel_contacts_email_idx
  ON public.pasantias_panel_contacts (email) WHERE email IS NOT NULL;

CREATE TABLE public.pasantias_panel_roster_details (
  roster_id uuid NOT NULL,
  letter_school_line text NULL,               -- e.g. "del Colegio X, de la Región de Y, Chile"
  letter_lodging_line text NULL,              -- e.g. "la Residencia Z, ubicada en ..."
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_panel_roster_details_pkey PRIMARY KEY (roster_id),
  CONSTRAINT pasantias_panel_roster_details_roster_fkey FOREIGN KEY (roster_id)
    REFERENCES public.pasantias_intake_rosters (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_panel_roster_details_school_line_check
    CHECK (letter_school_line IS NULL
           OR (char_length(letter_school_line) BETWEEN 1 AND 300 AND letter_school_line !~ '[[:cntrl:]]')),
  CONSTRAINT pasantias_panel_roster_details_lodging_line_check
    CHECK (letter_lodging_line IS NULL
           OR (char_length(letter_lodging_line) BETWEEN 1 AND 300 AND letter_lodging_line !~ '[[:cntrl:]]')),
  CONSTRAINT pasantias_panel_roster_details_version_check
    CHECK (version >= 1)
);

CREATE TABLE public.pasantias_panel_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  kind text NOT NULL,
  description text NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,
  removed_by uuid NULL,
  CONSTRAINT pasantias_panel_documents_pkey PRIMARY KEY (id),
  CONSTRAINT pasantias_panel_documents_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.pasantias_intake_participants (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_panel_documents_storage_path_key UNIQUE (storage_path),
  CONSTRAINT pasantias_panel_documents_kind_check
    CHECK (kind IN ('ticket', 'invitation_letter', 'other')),
  CONSTRAINT pasantias_panel_documents_description_check
    CHECK (description IS NULL
           OR (char_length(description) BETWEEN 1 AND 200 AND description !~ '[[:cntrl:]]')),
  CONSTRAINT pasantias_panel_documents_storage_path_check
    CHECK (storage_path ~ '^participants/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  CONSTRAINT pasantias_panel_documents_file_name_check
    CHECK (char_length(file_name) BETWEEN 1 AND 200 AND file_name !~ '[[:cntrl:]/\\]'),
  CONSTRAINT pasantias_panel_documents_mime_check
    CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT pasantias_panel_documents_size_check
    CHECK (size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT pasantias_panel_documents_removed_check
    CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);

CREATE INDEX pasantias_panel_documents_participant_idx
  ON public.pasantias_panel_documents (participant_id, created_at)
  WHERE removed_at IS NULL;

CREATE TABLE public.pasantias_panel_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  actor_id uuid NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- clock_timestamp(), not now(): two rows written in one transaction keep their order.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pasantias_panel_activity_pkey PRIMARY KEY (id),
  CONSTRAINT pasantias_panel_activity_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.pasantias_intake_participants (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_panel_activity_action_check
    CHECK (action IN ('logistics_updated', 'participant_corrected', 'document_uploaded',
                      'document_removed', 'letter_generated', 'letter_sent')),
  CONSTRAINT pasantias_panel_activity_details_check
    CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX pasantias_panel_activity_participant_idx
  ON public.pasantias_panel_activity (participant_id, created_at DESC);

CREATE TRIGGER trg_pasantias_panel_logistics_updated_at
  BEFORE UPDATE ON public.pasantias_panel_logistics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pasantias_panel_contacts_updated_at
  BEFORE UPDATE ON public.pasantias_panel_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pasantias_panel_roster_details_updated_at
  BEFORE UPDATE ON public.pasantias_panel_roster_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pasantias_panel_logistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasantias_panel_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasantias_panel_roster_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasantias_panel_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasantias_panel_activity ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'pasantias_panel_logistics');
SELECT public.apply_forced_password_change_guard('public', 'pasantias_panel_contacts');
SELECT public.apply_forced_password_change_guard('public', 'pasantias_panel_roster_details');
SELECT public.apply_forced_password_change_guard('public', 'pasantias_panel_documents');
SELECT public.apply_forced_password_change_guard('public', 'pasantias_panel_activity');

REVOKE ALL ON TABLE public.pasantias_panel_logistics FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pasantias_panel_contacts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pasantias_panel_roster_details FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pasantias_panel_documents FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pasantias_panel_activity FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_panel_logistics TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_panel_contacts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_panel_roster_details TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pasantias_panel_documents TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.pasantias_panel_activity TO service_role;

COMMENT ON TABLE public.pasantias_panel_logistics IS
  'FNE tracking per enero-2027 intake participant (airfare, lodging, program payments, real flight dates, letter greeting, notes, letter email state). No row = everything pending. Written only by the pasantias_panel_* functions; service-role only.';
COMMENT ON TABLE public.pasantias_panel_contacts IS
  'Email of an enero-2027 intake participant. Written only by pasantias_panel_school_save_participant (school form) and pasantias_panel_save_participant (FNE correction); service-role only.';
COMMENT ON TABLE public.pasantias_panel_roster_details IS
  'Per roster (school + program) wording FNE fills in for the invitation letter. No row = not defined. Service-role only.';
COMMENT ON TABLE public.pasantias_panel_documents IS
  'Metadata of private files (bucket pasantias-documents) FNE keeps per intake participant. removed_at set = removed (file deleted by the API). Rows are deleted one month after the program ends by pasantias_panel_purge_expired. Service-role only.';
COMMENT ON TABLE public.pasantias_panel_activity IS
  'Append-only record of what FNE admins changed for an intake participant through the logistics panel (actor NULL = the automatic letter send). Rows are deleted one month after the program ends by pasantias_panel_purge_expired. Service-role only.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pasantias-documents', 'pasantias-documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The one email rule (the contacts CHECK states the same): lower-case, 6-254
-- characters, one @, a dot in the domain, no spaces or separators.
CREATE FUNCTION public.pasantias_panel_email_ok(p_email text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT p_email IS NOT NULL
     AND char_length(p_email) BETWEEN 6 AND 254
     AND p_email = lower(p_email)
     AND p_email ~ '^[^[:space:][:cntrl:]@<>,;]+@[^[:space:][:cntrl:]@<>,;]+[.][^[:space:][:cntrl:]@<>,;]+$';
$$;

-- -----------------------------------------------------------------------------
-- Save one participant's tracking (full replace of the ten tracking values).
--   p_expected_version NULL = "no row expected"; otherwise the row's version.
--   Identical values -> replayed under ANY expected version, no write, no log.
--   Else a mismatch -> stale_version. A real write inserts (version 1) or
--   updates (version + 1) and appends one activity row naming each changed
--   field with its old and new value, as {"old": …, "new": …} (notes: only that they changed).
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_save_logistics(
  p_participant_id uuid, p_expected_version integer, p_flight_status text, p_lodging_status text,
  p_deposit_received boolean, p_balance_received boolean, p_salutation text, p_notes text,
  p_scl_departure_date date, p_bcn_arrival_date date, p_bcn_departure_date date, p_scl_arrival_date date,
  p_actor uuid)
RETURNS TABLE (logistics_version integer, replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_bad text;
  v_found boolean := false;
  v_row public.pasantias_panel_logistics%ROWTYPE;
  v_changes jsonb := '{}'::jsonb;
  v_version integer;
BEGIN
  IF p_participant_id IS NULL OR p_actor IS NULL
     OR (p_expected_version IS NOT NULL AND p_expected_version < 1) THEN
    v_bad := 'invalid_argument';
  ELSIF p_flight_status IS NULL OR p_flight_status NOT IN ('pending', 'purchased', 'paid') THEN
    v_bad := 'invalid_flight_status';
  ELSIF p_lodging_status IS NULL OR p_lodging_status NOT IN ('pending', 'reserved', 'paid') THEN
    v_bad := 'invalid_lodging_status';
  ELSIF p_deposit_received IS NULL OR p_balance_received IS NULL THEN
    v_bad := 'invalid_payment';
  ELSIF p_salutation IS NOT NULL AND p_salutation NOT IN ('estimado', 'estimada') THEN
    v_bad := 'invalid_salutation';
  ELSIF p_notes IS NOT NULL AND char_length(p_notes) NOT BETWEEN 1 AND 2000 THEN
    v_bad := 'invalid_notes';
  ELSIF (p_scl_departure_date IS NOT NULL AND p_bcn_arrival_date IS NOT NULL AND p_bcn_arrival_date < p_scl_departure_date)
     OR (p_scl_departure_date IS NOT NULL AND p_bcn_departure_date IS NOT NULL AND p_bcn_departure_date < p_scl_departure_date)
     OR (p_scl_departure_date IS NOT NULL AND p_scl_arrival_date IS NOT NULL AND p_scl_arrival_date < p_scl_departure_date)
     OR (p_bcn_arrival_date IS NOT NULL AND p_bcn_departure_date IS NOT NULL AND p_bcn_departure_date < p_bcn_arrival_date)
     OR (p_bcn_arrival_date IS NOT NULL AND p_scl_arrival_date IS NOT NULL AND p_scl_arrival_date < p_bcn_arrival_date)
     OR (p_bcn_departure_date IS NOT NULL AND p_scl_arrival_date IS NOT NULL AND p_scl_arrival_date < p_bcn_departure_date) THEN
    v_bad := 'invalid_flight_dates';
  END IF;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'pasantias_panel_save_logistics: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- Serialize every tracking write for this participant.
  PERFORM 1 FROM public.pasantias_intake_participants p WHERE p.id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pasantias_panel_save_logistics: unknown_participant' USING ERRCODE = '22023';
  END IF;

  SELECT l.* INTO v_row FROM public.pasantias_panel_logistics l WHERE l.participant_id = p_participant_id;
  v_found := FOUND;

  IF v_found
     AND v_row.flight_status = p_flight_status AND v_row.lodging_status = p_lodging_status
     AND v_row.deposit_received = p_deposit_received AND v_row.balance_received = p_balance_received
     AND v_row.salutation IS NOT DISTINCT FROM p_salutation AND v_row.notes IS NOT DISTINCT FROM p_notes
     AND v_row.scl_departure_date IS NOT DISTINCT FROM p_scl_departure_date
     AND v_row.bcn_arrival_date IS NOT DISTINCT FROM p_bcn_arrival_date
     AND v_row.bcn_departure_date IS NOT DISTINCT FROM p_bcn_departure_date
     AND v_row.scl_arrival_date IS NOT DISTINCT FROM p_scl_arrival_date THEN
    RETURN QUERY SELECT v_row.version, true;
    RETURN;
  END IF;
  IF p_expected_version IS DISTINCT FROM (CASE WHEN v_found THEN v_row.version END) THEN
    RAISE EXCEPTION 'pasantias_panel_save_logistics: stale_version' USING ERRCODE = '22023';
  END IF;

  IF NOT v_found THEN
    v_row.flight_status := 'pending';
    v_row.lodging_status := 'pending';
    v_row.deposit_received := false;
    v_row.balance_received := false;
    v_row.salutation := NULL;
    v_row.notes := NULL;
  END IF;
  IF v_row.flight_status <> p_flight_status THEN
    v_changes := v_changes || jsonb_build_object('flight_status',
      jsonb_build_object('old', v_row.flight_status, 'new', p_flight_status));
  END IF;
  IF v_row.lodging_status <> p_lodging_status THEN
    v_changes := v_changes || jsonb_build_object('lodging_status',
      jsonb_build_object('old', v_row.lodging_status, 'new', p_lodging_status));
  END IF;
  IF v_row.deposit_received <> p_deposit_received THEN
    v_changes := v_changes || jsonb_build_object('deposit_received',
      jsonb_build_object('old', v_row.deposit_received, 'new', p_deposit_received));
  END IF;
  IF v_row.balance_received <> p_balance_received THEN
    v_changes := v_changes || jsonb_build_object('balance_received',
      jsonb_build_object('old', v_row.balance_received, 'new', p_balance_received));
  END IF;
  IF v_row.salutation IS DISTINCT FROM p_salutation THEN
    v_changes := v_changes || jsonb_build_object('salutation',
      jsonb_build_object('old', v_row.salutation, 'new', p_salutation));
  END IF;
  IF v_row.notes IS DISTINCT FROM p_notes THEN
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('changed', true));
  END IF;
  -- A row that did not exist has NULL dates already (v_row is all-NULL then).
  IF v_row.scl_departure_date IS DISTINCT FROM p_scl_departure_date THEN
    v_changes := v_changes || jsonb_build_object('scl_departure_date',
      jsonb_build_object('old', v_row.scl_departure_date, 'new', p_scl_departure_date));
  END IF;
  IF v_row.bcn_arrival_date IS DISTINCT FROM p_bcn_arrival_date THEN
    v_changes := v_changes || jsonb_build_object('bcn_arrival_date',
      jsonb_build_object('old', v_row.bcn_arrival_date, 'new', p_bcn_arrival_date));
  END IF;
  IF v_row.bcn_departure_date IS DISTINCT FROM p_bcn_departure_date THEN
    v_changes := v_changes || jsonb_build_object('bcn_departure_date',
      jsonb_build_object('old', v_row.bcn_departure_date, 'new', p_bcn_departure_date));
  END IF;
  IF v_row.scl_arrival_date IS DISTINCT FROM p_scl_arrival_date THEN
    v_changes := v_changes || jsonb_build_object('scl_arrival_date',
      jsonb_build_object('old', v_row.scl_arrival_date, 'new', p_scl_arrival_date));
  END IF;

  IF NOT v_found THEN
    INSERT INTO public.pasantias_panel_logistics AS l (
      participant_id, flight_status, lodging_status, deposit_received, balance_received,
      salutation, notes, scl_departure_date, bcn_arrival_date, bcn_departure_date, scl_arrival_date, updated_by)
    VALUES (p_participant_id, p_flight_status, p_lodging_status, p_deposit_received, p_balance_received,
            p_salutation, p_notes, p_scl_departure_date, p_bcn_arrival_date, p_bcn_departure_date,
            p_scl_arrival_date, p_actor)
    RETURNING l.version INTO v_version;
  ELSE
    UPDATE public.pasantias_panel_logistics l
       SET flight_status = p_flight_status, lodging_status = p_lodging_status,
           deposit_received = p_deposit_received, balance_received = p_balance_received,
           salutation = p_salutation, notes = p_notes,
           scl_departure_date = p_scl_departure_date, bcn_arrival_date = p_bcn_arrival_date,
           bcn_departure_date = p_bcn_departure_date, scl_arrival_date = p_scl_arrival_date,
           updated_by = p_actor, version = l.version + 1
     WHERE l.participant_id = p_participant_id
    RETURNING l.version INTO v_version;
  END IF;

  -- A first save that equals the defaults changes nothing worth logging.
  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.pasantias_panel_activity (participant_id, actor_id, action, details)
    VALUES (p_participant_id, p_actor, 'logistics_updated', jsonb_build_object('fields', v_changes));
  END IF;

  RETURN QUERY SELECT v_version, false;
END;
$$;

-- -----------------------------------------------------------------------------
-- Set ONE tracking field to one value for up to 200 participants.
--   p_field  flight_status | lodging_status | deposit_received | balance_received
--   p_value  the status, or 'true' / 'false' for the two payment flags
-- Last write wins (no expected version): the admin chose the value for the
-- whole selection. Rows already holding the value are left untouched. Any
-- unknown id refuses the whole call. Returns the number of rows changed.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_bulk_set(
  p_participant_ids uuid[], p_field text, p_value text, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_row public.pasantias_panel_logistics%ROWTYPE;
  v_found boolean;
  v_old text;
  v_changed integer := 0;
BEGIN
  IF p_actor IS NULL OR p_participant_ids IS NULL OR coalesce(array_ndims(p_participant_ids), 0) <> 1
     OR EXISTS (SELECT 1 FROM unnest(p_participant_ids) AS u(i) WHERE u.i IS NULL) THEN
    RAISE EXCEPTION 'pasantias_panel_bulk_set: invalid_argument' USING ERRCODE = '22023';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT u.i FROM unnest(p_participant_ids) AS u(i) ORDER BY u.i);
  IF cardinality(v_ids) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'pasantias_panel_bulk_set: invalid_argument' USING ERRCODE = '22023';
  END IF;
  IF p_field IS NULL OR p_value IS NULL
     OR NOT ((p_field = 'flight_status' AND p_value IN ('pending', 'purchased', 'paid'))
          OR (p_field = 'lodging_status' AND p_value IN ('pending', 'reserved', 'paid'))
          OR (p_field IN ('deposit_received', 'balance_received') AND p_value IN ('true', 'false'))) THEN
    RAISE EXCEPTION 'pasantias_panel_bulk_set: invalid_field_value' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP          -- id order: two bulk calls cannot deadlock
    PERFORM 1 FROM public.pasantias_intake_participants p WHERE p.id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'pasantias_panel_bulk_set: unknown_participant' USING ERRCODE = '22023';
    END IF;
    SELECT l.* INTO v_row FROM public.pasantias_panel_logistics l WHERE l.participant_id = v_id;
    v_found := FOUND;
    v_old := CASE p_field
      WHEN 'flight_status' THEN coalesce(v_row.flight_status, 'pending')
      WHEN 'lodging_status' THEN coalesce(v_row.lodging_status, 'pending')
      WHEN 'deposit_received' THEN coalesce(v_row.deposit_received, false)::text
      ELSE coalesce(v_row.balance_received, false)::text END;
    CONTINUE WHEN v_old = p_value;

    IF NOT v_found THEN
      INSERT INTO public.pasantias_panel_logistics (participant_id, updated_by) VALUES (v_id, p_actor);
    END IF;
    UPDATE public.pasantias_panel_logistics l
       SET flight_status = CASE WHEN p_field = 'flight_status' THEN p_value ELSE l.flight_status END,
           lodging_status = CASE WHEN p_field = 'lodging_status' THEN p_value ELSE l.lodging_status END,
           deposit_received = CASE WHEN p_field = 'deposit_received' THEN p_value::boolean ELSE l.deposit_received END,
           balance_received = CASE WHEN p_field = 'balance_received' THEN p_value::boolean ELSE l.balance_received END,
           updated_by = p_actor,
           version = CASE WHEN v_found THEN l.version + 1 ELSE l.version END
     WHERE l.participant_id = v_id;

    INSERT INTO public.pasantias_panel_activity (participant_id, actor_id, action, details)
    VALUES (v_id, p_actor, 'logistics_updated',
            jsonb_build_object('bulk', true, 'fields', jsonb_build_object(p_field,
              CASE WHEN p_field IN ('deposit_received', 'balance_received')
                   THEN jsonb_build_object('old', v_old::boolean, 'new', p_value::boolean)
                   ELSE jsonb_build_object('old', v_old, 'new', p_value) END)));
    v_changed := v_changed + 1;
  END LOOP;

  RETURN v_changed;
END;
$$;

-- -----------------------------------------------------------------------------
-- An FNE admin corrects the data a school entered for one participant.
-- Same field rules as pasantias_nomina_save_participant (inputs validated as
-- given, never trimmed), keyed by participant id instead of a link token:
--   unknown_participant; stale_version; identical data -> replayed, no write;
--   duplicate_rut inside the roster; else update, focus side row upserted.
-- Differences from the coordinator save, on purpose:
--   - works whatever the link state (revoked / expired) and with or without a
--     school funding row; the copied funding columns are not touched;
--   - acknowledged_at / notice_version are the SCHOOL's declaration and stay;
--   - the roster is NOT reopened (status and submitted_at stay), but its
--     version is bumped so a coordinator tab opened before the correction
--     cannot finalize a list it has not re-read;
--   - one activity row records every changed field with old and new value.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_save_participant(
  p_participant_id uuid, p_expected_version integer,
  p_first_names text, p_last_names text, p_rut text, p_passport_number text,
  p_arrival_date date, p_departure_date date, p_focus text,
  p_dietary_restrictions text[], p_dietary_other text, p_email text, p_actor uuid)
RETURNS TABLE (participant_version integer, replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  c_edge_space constant text := '^[[:space:]]|[[:space:]]$';
  c_diet constant text[] := ARRAY['otra', 'sin_gluten', 'sin_lactosa', 'vegano', 'vegetariano'];
  v_all_levels constant boolean := (p_focus IS NOT DISTINCT FROM 'todos');
  v_level constant text := CASE WHEN p_focus IS NOT DISTINCT FROM 'todos' THEN NULL ELSE p_focus END;
  v_bad text;
  v_sum integer;
  v_dv text;
  v_roster_id uuid;
  v_row public.pasantias_intake_participants%ROWTYPE;
  v_stored_all boolean;
  v_old_focus text;
  v_old_email text;
  v_changes jsonb := '{}'::jsonb;
  v_version integer;
BEGIN
  -- 1. Arguments (pure; nothing read, nothing locked).
  IF p_participant_id IS NULL OR p_actor IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    v_bad := 'invalid_argument';
  ELSIF p_email IS NOT NULL AND NOT public.pasantias_panel_email_ok(p_email) THEN
    v_bad := 'invalid_email';
  END IF;

  IF v_bad IS NULL AND p_rut ~ '^[1-9][0-9]{6,7}-[0-9K]$' THEN
    SELECT sum(substr(reverse(split_part(p_rut, '-', 1)), g.i, 1)::integer * (2 + (g.i - 1) % 6))::integer
      INTO v_sum
      FROM generate_series(1, char_length(split_part(p_rut, '-', 1))) AS g(i);
    v_dv := CASE 11 - v_sum % 11 WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE (11 - v_sum % 11)::text END;
  END IF;

  IF v_bad IS NOT NULL THEN
    NULL;
  ELSIF p_first_names IS NULL OR char_length(p_first_names) NOT BETWEEN 1 AND 80
        OR p_first_names ~ c_edge_space OR p_first_names ~ '[[:cntrl:]]' THEN
    v_bad := 'invalid_first_names';
  ELSIF p_last_names IS NULL OR char_length(p_last_names) NOT BETWEEN 1 AND 80
        OR p_last_names ~ c_edge_space OR p_last_names ~ '[[:cntrl:]]' THEN
    v_bad := 'invalid_last_names';
  ELSIF v_dv IS NULL OR v_dv <> right(p_rut, 1) THEN
    v_bad := 'invalid_rut';
  ELSIF p_passport_number IS NOT NULL AND p_passport_number !~ '^[A-Z0-9]{5,20}$' THEN
    v_bad := 'invalid_passport_number';
  ELSIF p_arrival_date IS NOT NULL AND p_departure_date IS NOT NULL AND p_departure_date <= p_arrival_date THEN
    v_bad := 'invalid_dates';
  ELSIF p_focus IS NOT NULL
        AND p_focus NOT IN ('infantil', 'primer_ciclo', 'segundo_ciclo', 'tercer_ciclo', 'todos') THEN
    v_bad := 'invalid_focus';
  ELSIF p_dietary_restrictions IS NULL OR coalesce(array_ndims(p_dietary_restrictions), 1) <> 1 THEN
    v_bad := 'invalid_dietary';
  ELSIF EXISTS (SELECT 1 FROM unnest(p_dietary_restrictions) AS u(d) WHERE u.d IS NULL OR NOT (u.d = ANY (c_diet))) THEN
    v_bad := 'invalid_dietary';
  ELSIF p_dietary_restrictions IS DISTINCT FROM
        ARRAY(SELECT u.d FROM unnest(p_dietary_restrictions) AS u(d) GROUP BY u.d ORDER BY u.d COLLATE "C") THEN
    v_bad := 'invalid_dietary';
  ELSIF ('otra' = ANY (p_dietary_restrictions)) <> (p_dietary_other IS NOT NULL) THEN
    v_bad := 'invalid_dietary';
  ELSIF p_dietary_other IS NOT NULL AND (char_length(p_dietary_other) NOT BETWEEN 1 AND 200
        OR p_dietary_other ~ c_edge_space OR p_dietary_other ~ '[[:cntrl:]]') THEN
    v_bad := 'invalid_dietary';
  END IF;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'pasantias_panel_save_participant: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- 2. Locks, roster first (the coordinator RPCs' order). roster_id never changes.
  SELECT p.roster_id INTO v_roster_id
    FROM public.pasantias_intake_participants p WHERE p.id = p_participant_id;
  IF v_roster_id IS NULL THEN
    RAISE EXCEPTION 'pasantias_panel_save_participant: unknown_participant' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.pasantias_intake_rosters r WHERE r.id = v_roster_id FOR UPDATE;
  SELECT p.* INTO v_row
    FROM public.pasantias_intake_participants p WHERE p.id = p_participant_id FOR UPDATE;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'pasantias_panel_save_participant: stale_version' USING ERRCODE = '22023';
  END IF;

  SELECT f.all_levels INTO v_stored_all
    FROM public.pasantias_nomina_participant_focus f WHERE f.participant_id = p_participant_id;
  v_old_focus := CASE WHEN v_stored_all IS TRUE THEN 'todos' ELSE v_row.focus END;
  SELECT c.email INTO v_old_email
    FROM public.pasantias_panel_contacts c WHERE c.participant_id = p_participant_id;

  -- 3. No-op.
  IF ROW(v_row.first_names, v_row.last_names, v_row.rut, v_row.passport_number,
         v_row.arrival_date, v_row.departure_date, v_old_focus,
         v_row.dietary_restrictions, v_row.dietary_other, v_old_email)
     IS NOT DISTINCT FROM
     ROW(p_first_names, p_last_names, p_rut, p_passport_number,
         p_arrival_date, p_departure_date, p_focus,
         p_dietary_restrictions, p_dietary_other, p_email) THEN
    RETURN QUERY SELECT v_row.version, true;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pasantias_intake_participants p
              WHERE p.roster_id = v_roster_id AND p.rut = p_rut AND p.id <> p_participant_id) THEN
    RAISE EXCEPTION 'pasantias_panel_save_participant: duplicate_rut' USING ERRCODE = '22023';
  END IF;

  -- 4. What changed, for the activity log.
  IF v_row.first_names <> p_first_names THEN
    v_changes := v_changes || jsonb_build_object('first_names', jsonb_build_object('old', v_row.first_names, 'new', p_first_names));
  END IF;
  IF v_row.last_names <> p_last_names THEN
    v_changes := v_changes || jsonb_build_object('last_names', jsonb_build_object('old', v_row.last_names, 'new', p_last_names));
  END IF;
  IF v_row.rut <> p_rut THEN
    v_changes := v_changes || jsonb_build_object('rut', jsonb_build_object('old', v_row.rut, 'new', p_rut));
  END IF;
  IF v_row.passport_number IS DISTINCT FROM p_passport_number THEN
    v_changes := v_changes || jsonb_build_object('passport_number', jsonb_build_object('old', v_row.passport_number, 'new', p_passport_number));
  END IF;
  IF v_row.arrival_date IS DISTINCT FROM p_arrival_date THEN
    v_changes := v_changes || jsonb_build_object('arrival_date', jsonb_build_object('old', v_row.arrival_date, 'new', p_arrival_date));
  END IF;
  IF v_row.departure_date IS DISTINCT FROM p_departure_date THEN
    v_changes := v_changes || jsonb_build_object('departure_date', jsonb_build_object('old', v_row.departure_date, 'new', p_departure_date));
  END IF;
  IF v_old_focus IS DISTINCT FROM p_focus THEN
    v_changes := v_changes || jsonb_build_object('focus', jsonb_build_object('old', v_old_focus, 'new', p_focus));
  END IF;
  IF v_row.dietary_restrictions IS DISTINCT FROM p_dietary_restrictions
     OR v_row.dietary_other IS DISTINCT FROM p_dietary_other THEN
    v_changes := v_changes || jsonb_build_object('dietary', jsonb_build_object(
      'old', jsonb_build_object('codes', to_jsonb(v_row.dietary_restrictions), 'other', v_row.dietary_other),
      'new', jsonb_build_object('codes', to_jsonb(p_dietary_restrictions), 'other', p_dietary_other)));
  END IF;
  IF v_old_email IS DISTINCT FROM p_email THEN
    v_changes := v_changes || jsonb_build_object('email', jsonb_build_object('old', v_old_email, 'new', p_email));
  END IF;

  -- 5. Write.
  UPDATE public.pasantias_intake_participants p
     SET first_names = p_first_names, last_names = p_last_names, rut = p_rut,
         passport_number = p_passport_number, arrival_date = p_arrival_date,
         departure_date = p_departure_date, focus = v_level,
         dietary_restrictions = p_dietary_restrictions, dietary_other = p_dietary_other,
         version = p.version + 1
   WHERE p.id = p_participant_id
  RETURNING p.version INTO v_version;

  INSERT INTO public.pasantias_nomina_participant_focus AS f (participant_id, all_levels)
  VALUES (p_participant_id, v_all_levels)
  ON CONFLICT ON CONSTRAINT pasantias_nomina_participant_focus_pkey
    DO UPDATE SET all_levels = EXCLUDED.all_levels
    WHERE f.all_levels IS DISTINCT FROM EXCLUDED.all_levels;

  IF v_old_email IS DISTINCT FROM p_email THEN
    INSERT INTO public.pasantias_panel_contacts AS c (participant_id, email)
    VALUES (p_participant_id, p_email)
    ON CONFLICT ON CONSTRAINT pasantias_panel_contacts_pkey DO UPDATE SET email = EXCLUDED.email;
  END IF;

  UPDATE public.pasantias_intake_rosters r SET version = r.version + 1 WHERE r.id = v_roster_id;

  INSERT INTO public.pasantias_panel_activity (participant_id, actor_id, action, details)
  VALUES (p_participant_id, p_actor, 'participant_corrected', jsonb_build_object('fields', v_changes));

  RETURN QUERY SELECT v_version, false;
END;
$$;

-- -----------------------------------------------------------------------------
-- The school form's participant save: pasantias_nomina_save_participant plus
-- the traveller's email and the "ticket already bought" lock.
--   invalid_email   p_email is required here and must pass pasantias_panel_email_ok.
--   dates_locked    an update that would change arrival_date or departure_date
--                   of a participant whose airfare FNE has marked purchased or
--                   paid. Checked only when the expected version is current, so
--                   a stale tab still gets stale_version from the inner call.
-- Every other refusal is the inner function's, raised under ITS name.
-- The roster row is locked first (the same live-link predicate), then the
-- participant row: the coordinator order. A replayed create applies nothing,
-- the email included. An update whose only change is the email is still a real
-- write: participant and roster versions bump and a sent roster reopens.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_school_save_participant(
  p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid,
  p_first_names text, p_last_names text, p_rut text, p_passport_number text,
  p_arrival_date date, p_departure_date date, p_focus text,
  p_dietary_restrictions text[], p_dietary_other text, p_notice_version text, p_email text)
RETURNS TABLE (participant_id uuid, participant_version integer, replayed boolean, roster_status text, roster_version integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_roster_id uuid;
  v_version integer;
  v_arrival date;
  v_departure date;
  v_flight text;
  v_pid uuid;
  v_pversion integer;
  v_replayed boolean;
  v_rstatus text;
  v_rversion integer;
  v_old_email text;
BEGIN
  IF NOT public.pasantias_panel_email_ok(p_email) THEN
    RAISE EXCEPTION 'pasantias_panel_school_save_participant: invalid_email' USING ERRCODE = '22023';
  END IF;

  IF p_token_hash IS NOT NULL AND p_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT r.id INTO v_roster_id
      FROM public.pasantias_intake_rosters r
     WHERE r.token_hash = p_token_hash AND r.revoked_at IS NULL AND r.expires_at > now()
       FOR UPDATE;
  END IF;

  IF v_roster_id IS NOT NULL AND p_participant_id IS NOT NULL THEN
    SELECT p.version, p.arrival_date, p.departure_date INTO v_version, v_arrival, v_departure
      FROM public.pasantias_intake_participants p
     WHERE p.id = p_participant_id AND p.roster_id = v_roster_id
       FOR UPDATE;
    IF v_version IS NOT NULL AND v_version IS NOT DISTINCT FROM p_expected_version THEN
      SELECT l.flight_status INTO v_flight
        FROM public.pasantias_panel_logistics l WHERE l.participant_id = p_participant_id;
      IF v_flight IN ('purchased', 'paid')
         AND (v_arrival IS DISTINCT FROM p_arrival_date OR v_departure IS DISTINCT FROM p_departure_date) THEN
        RAISE EXCEPTION 'pasantias_panel_school_save_participant: dates_locked' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  -- A dead link, bad arguments, a stale version: the inner function refuses.
  SELECT s.participant_id, s.participant_version, s.replayed, s.roster_status, s.roster_version
    INTO v_pid, v_pversion, v_replayed, v_rstatus, v_rversion
    FROM public.pasantias_nomina_save_participant(
      p_token_hash, p_participant_id, p_expected_version, p_client_request_id,
      p_first_names, p_last_names, p_rut, p_passport_number,
      p_arrival_date, p_departure_date, p_focus,
      p_dietary_restrictions, p_dietary_other, p_notice_version) AS s;

  IF NOT (p_participant_id IS NULL AND v_replayed) THEN
    SELECT c.email INTO v_old_email
      FROM public.pasantias_panel_contacts c WHERE c.participant_id = v_pid;
    IF v_old_email IS DISTINCT FROM p_email THEN
      INSERT INTO public.pasantias_panel_contacts AS c (participant_id, email)
      VALUES (v_pid, p_email)
      ON CONFLICT ON CONSTRAINT pasantias_panel_contacts_pkey DO UPDATE SET email = EXCLUDED.email;
      IF v_replayed THEN
        UPDATE public.pasantias_intake_participants p
           SET version = p.version + 1, acknowledged_at = now(), notice_version = p_notice_version
         WHERE p.id = v_pid
        RETURNING p.version INTO v_pversion;
        UPDATE public.pasantias_intake_rosters r
           SET version = r.version + 1, status = 'open', submitted_at = NULL
         WHERE r.id = v_roster_id
        RETURNING r.status, r.version INTO v_rstatus, v_rversion;
        v_replayed := false;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_pid, v_pversion, v_replayed, v_rstatus, v_rversion;
END;
$$;

-- -----------------------------------------------------------------------------
-- The school form's funding save: pasantias_nomina_save_school_funding plus
--   lodging_locked  the school already saved its funding, this call would
--                   change WHO PAYS THE LODGING, and FNE has marked the airfare
--                   of at least one traveller of this list purchased or paid.
-- Every other refusal is the inner function's, raised under ITS name.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_school_save_funding(
  p_token_hash text, p_expected_funding_version integer, p_flights_funding text, p_lodging_funding text)
RETURNS TABLE (funding_flights text, funding_lodging text, funding_version integer, replayed boolean,
               roster_status text, roster_version integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_roster_id uuid;
  v_lodging text;
BEGIN
  IF p_token_hash IS NOT NULL AND p_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT r.id INTO v_roster_id
      FROM public.pasantias_intake_rosters r
     WHERE r.token_hash = p_token_hash AND r.revoked_at IS NULL AND r.expires_at > now()
       FOR UPDATE;
  END IF;
  IF v_roster_id IS NOT NULL THEN
    SELECT f.lodging_funding INTO v_lodging
      FROM public.pasantias_nomina_school_funding f WHERE f.roster_id = v_roster_id;
    IF v_lodging IS NOT NULL AND v_lodging <> p_lodging_funding
       AND EXISTS (SELECT 1
                     FROM public.pasantias_intake_participants p
                     JOIN public.pasantias_panel_logistics l ON l.participant_id = p.id
                    WHERE p.roster_id = v_roster_id AND l.flight_status IN ('purchased', 'paid')) THEN
      RAISE EXCEPTION 'pasantias_panel_school_save_funding: lodging_locked' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
    SELECT s.funding_flights, s.funding_lodging, s.funding_version, s.replayed, s.roster_status, s.roster_version
      FROM public.pasantias_nomina_save_school_funding(
        p_token_hash, p_expected_funding_version, p_flights_funding, p_lodging_funding) AS s;
END;
$$;

-- -----------------------------------------------------------------------------
-- Emailing the invitation letter, in two steps so two runs never send twice.
--   claim   true = this caller may send now. False when the letter was already
--           sent (unless p_force: an admin's "send now"), or another send holds
--           the 15-minute lease. Creates the tracking row when there is none.
--   finish  p_sent true: stamps letter_sent_at / letter_sent_to, clears the
--           error and the lease, appends one 'letter_sent' activity row
--           (p_actor NULL = the automatic send). p_sent false: records p_error
--           (a short code) and clears the lease so the next run retries.
-- Neither bumps the tracking version: they touch no value an admin edits.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_claim_letter_send(p_participant_id uuid, p_force boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_sent timestamptz;
  v_claimed timestamptz;
BEGIN
  IF p_participant_id IS NULL OR p_force IS NULL THEN
    RAISE EXCEPTION 'pasantias_panel_claim_letter_send: invalid_argument' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.pasantias_intake_participants p WHERE p.id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pasantias_panel_claim_letter_send: unknown_participant' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.pasantias_panel_logistics (participant_id) VALUES (p_participant_id)
  ON CONFLICT ON CONSTRAINT pasantias_panel_logistics_pkey DO NOTHING;
  SELECT l.letter_sent_at, l.letter_send_claimed_at INTO v_sent, v_claimed
    FROM public.pasantias_panel_logistics l WHERE l.participant_id = p_participant_id;
  IF (v_sent IS NOT NULL AND NOT p_force)
     OR (v_claimed IS NOT NULL AND v_claimed > clock_timestamp() - interval '15 minutes') THEN
    RETURN false;
  END IF;
  UPDATE public.pasantias_panel_logistics l
     SET letter_send_claimed_at = clock_timestamp()
   WHERE l.participant_id = p_participant_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.pasantias_panel_finish_letter_send(
  p_participant_id uuid, p_sent boolean, p_email text, p_error text, p_actor uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
BEGIN
  IF p_participant_id IS NULL OR p_sent IS NULL
     OR (p_sent AND (p_error IS NOT NULL OR NOT public.pasantias_panel_email_ok(p_email)))
     OR (NOT p_sent AND (p_error IS NULL OR p_error !~ '^[a-z_]{1,40}$')) THEN
    RAISE EXCEPTION 'pasantias_panel_finish_letter_send: invalid_argument' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.pasantias_intake_participants p WHERE p.id = p_participant_id FOR UPDATE;
  IF p_sent THEN
    UPDATE public.pasantias_panel_logistics l
       SET letter_sent_at = clock_timestamp(), letter_sent_to = p_email,
           letter_send_error = NULL, letter_send_claimed_at = NULL
     WHERE l.participant_id = p_participant_id;
  ELSE
    UPDATE public.pasantias_panel_logistics l
       SET letter_send_error = p_error, letter_send_claimed_at = NULL
     WHERE l.participant_id = p_participant_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pasantias_panel_finish_letter_send: unknown_participant' USING ERRCODE = '22023';
  END IF;
  IF p_sent THEN
    INSERT INTO public.pasantias_panel_activity (participant_id, actor_id, action, details)
    VALUES (p_participant_id, p_actor, 'letter_sent', jsonb_build_object('automatic', p_actor IS NULL));
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Retention: tickets, letters, other files and the change history go one month
-- after the traveller's program ends (INSPIRA ends 28 Jan 2027, Mirada Profunda
-- 29 Jan 2027; both reach the limit on 28 Feb 2027). p_as_of is "today" as the
-- caller's clock sees it (the daily job passes the date in Chile).
--   expired_document_paths  the stored files to delete first (removed rows have
--                           no file left and are skipped).
--   purge_expired           deletes the document rows and the activity rows of
--                           every expired participant; returns how many rows
--                           went. Tracking, contacts and the school's own data
--                           are not touched.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_expired_document_paths(p_as_of date)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT d.storage_path
    FROM public.pasantias_panel_documents d
    JOIN public.pasantias_intake_participants p ON p.id = d.participant_id
    JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
   WHERE d.removed_at IS NULL
     AND p_as_of IS NOT NULL
     AND p_as_of >= ((CASE r.program WHEN 'inspira' THEN date '2027-01-28'
                                     WHEN 'mirada-profunda' THEN date '2027-01-29' END) + interval '1 month')::date
   ORDER BY d.storage_path;
$$;

CREATE FUNCTION public.pasantias_panel_purge_expired(p_as_of date)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_documents integer;
  v_activity integer;
BEGIN
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'pasantias_panel_purge_expired: invalid_argument' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT p.id
      FROM public.pasantias_intake_participants p
      JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
     WHERE p_as_of >= ((CASE r.program WHEN 'inspira' THEN date '2027-01-28'
                                       WHEN 'mirada-profunda' THEN date '2027-01-29' END) + interval '1 month')::date
  ), gone AS (
    DELETE FROM public.pasantias_panel_documents d USING expired e WHERE d.participant_id = e.id RETURNING 1
  )
  SELECT count(*)::integer INTO v_documents FROM gone;

  WITH expired AS (
    SELECT p.id
      FROM public.pasantias_intake_participants p
      JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
     WHERE p_as_of >= ((CASE r.program WHEN 'inspira' THEN date '2027-01-28'
                                       WHEN 'mirada-profunda' THEN date '2027-01-29' END) + interval '1 month')::date
  ), gone AS (
    DELETE FROM public.pasantias_panel_activity a USING expired e WHERE a.participant_id = e.id RETURNING 1
  )
  SELECT count(*)::integer INTO v_activity FROM gone;

  RETURN v_documents + v_activity;
END;
$$;

REVOKE ALL ON FUNCTION public.pasantias_panel_email_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_email_ok(text) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_save_logistics(uuid, integer, text, text, boolean, boolean, text, text,
  date, date, date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_save_logistics(uuid, integer, text, text, boolean, boolean, text, text,
  date, date, date, date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_bulk_set(uuid[], text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_bulk_set(uuid[], text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_save_participant(uuid, integer, text, text, text, text,
  date, date, text, text[], text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_save_participant(uuid, integer, text, text, text, text,
  date, date, text, text[], text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_school_save_participant(text, uuid, integer, uuid, text, text, text, text,
  date, date, text, text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_school_save_participant(text, uuid, integer, uuid, text, text, text, text,
  date, date, text, text[], text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_school_save_funding(text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_school_save_funding(text, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_claim_letter_send(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_claim_letter_send(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_finish_letter_send(uuid, boolean, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_finish_letter_send(uuid, boolean, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_expired_document_paths(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_expired_document_paths(date) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_panel_purge_expired(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_purge_expired(date) TO service_role;

-- -----------------------------------------------------------------------------
-- Which travellers already have a GENERA account: the traveller's email equals
-- a profile's email, compared lower-case. One account per traveller (the
-- lowest id when a mailbox was registered twice).
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_panel_platform_accounts()
RETURNS TABLE (participant_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT DISTINCT ON (c.participant_id) c.participant_id, pr.id
    FROM public.pasantias_panel_contacts c
    JOIN public.profiles pr ON lower(pr.email) = c.email
   WHERE c.email IS NOT NULL
   ORDER BY c.participant_id, pr.id;
$$;

REVOKE ALL ON FUNCTION public.pasantias_panel_platform_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_panel_platform_accounts() TO service_role;
