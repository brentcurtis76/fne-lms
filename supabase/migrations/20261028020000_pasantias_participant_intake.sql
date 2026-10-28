-- =============================================================================
-- pasantias_intake_rosters / pasantias_intake_participants — January (enero-2027)
-- participant intake by private school link. PASANT-PARTICIPANT-INTAKE-DB-01.
-- Contract: docs/plan/evidence/pasant-intake/db-contract.md (FIRST review §3).
-- One roster per (school, program) carries the link: only the SHA-256 hex of a
-- 256-bit random token is stored. A coordinator holding the token saves adult
-- participants one at a time and finalizes the roster; any later real edit
-- reopens it. Adult professional data only; no minor data.
--
-- Additive only: two new tables, one index, two triggers, two service-role
-- RPCs (no caller until the app unit lands). Nothing existing is dropped,
-- truncated, altered or re-granted; no default privilege changes. Rollback is
-- FORWARD-ONLY: stop the callers, then ship a follow-up migration.
--
-- Pending human answers (arrival/departure option sets, single vs multi
-- dietary) are NOT encoded here: dates are plain `date` values with a
-- structural order check, dietary is a text[] over the five ratified codes.
-- The exact option sets live in lib/pasantias/participants/dates.ts.
--
-- ACCESS MATRIX (both tables; every grant explicit)
--   role           table privileges        rows                RPC EXECUTE
--   PUBLIC, anon   none (REVOKE ALL)        -                   none
--   authenticated  none (REVOKE ALL)        -                   none   (admins included)
--   service_role   SELECT/INSERT/UPDATE     BYPASSRLS           both
-- RLS is enabled with no permissive policy; the restrictive
-- forced_password_change_guard is installed on both. Both functions are
-- plpgsql, SECURITY INVOKER, search_path = '', and raise
-- '<function>: <code>' with SQLSTATE 22023.
--
-- Concurrency: every RPC locks the roster row FOR UPDATE through the token
-- predicate (hash matches, not revoked, not expired) and re-checks it in the
-- same transaction as its write, so a revoke/rotate that commits first wins
-- (READ COMMITTED re-evaluates the predicate on the newest row version), and
-- all writes to one roster's participants are serialized.
-- =============================================================================

CREATE TABLE public.pasantias_intake_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort text NOT NULL,
  program text NOT NULL,
  school_name text NOT NULL,
  school_name_key text NOT NULL GENERATED ALWAYS AS (lower(regexp_replace(school_name, '[[:space:]]+', ' ', 'g'))) STORED,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  status text NOT NULL DEFAULT 'open',
  submitted_at timestamptz NULL,              -- set exactly while status = 'submitted'
  last_submitted_at timestamptz NULL,         -- kept when the roster reopens
  version integer NOT NULL DEFAULT 1,
  created_by uuid NULL,                       -- admin user id; deliberately no FK
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_intake_rosters_identity_check
    CHECK (cohort = 'enero-2027' AND program IN ('inspira', 'mirada-profunda')),
  CONSTRAINT pasantias_intake_rosters_school_name_check
    CHECK (char_length(school_name) BETWEEN 2 AND 160 AND school_name !~ '^[[:space:]]|[[:space:]]$'),
  CONSTRAINT pasantias_intake_rosters_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT pasantias_intake_rosters_status_check
    CHECK (status IN ('open', 'submitted')),
  CONSTRAINT pasantias_intake_rosters_submitted_check
    CHECK ((status = 'submitted') = (submitted_at IS NOT NULL)),
  CONSTRAINT pasantias_intake_rosters_version_check
    CHECK (version >= 1),
  CONSTRAINT pasantias_intake_rosters_token_hash_key UNIQUE (token_hash),
  CONSTRAINT pasantias_intake_rosters_school_key UNIQUE (cohort, program, school_name_key)
);

CREATE TABLE public.pasantias_intake_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL,
  client_request_id uuid NOT NULL,
  first_names text NOT NULL,
  last_names text NOT NULL,
  rut text NOT NULL,                          -- 12345678-5 form; check digit verified by the RPC
  passport_number text NULL,
  flights_funding text NOT NULL,              -- no default: never silently chosen
  lodging_funding text NOT NULL,              -- no default: never silently chosen
  arrival_date date NULL,
  departure_date date NULL,
  focus text NULL,
  dietary_restrictions text[] NOT NULL DEFAULT '{}',  -- empty = not provided
  dietary_other text NULL,
  acknowledged_at timestamptz NOT NULL,
  notice_version text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_intake_participants_roster_fkey FOREIGN KEY (roster_id)
    REFERENCES public.pasantias_intake_rosters (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_intake_participants_client_request_key UNIQUE (roster_id, client_request_id),
  CONSTRAINT pasantias_intake_participants_rut_key UNIQUE (roster_id, rut),
  CONSTRAINT pasantias_intake_participants_names_check
    CHECK (char_length(first_names) BETWEEN 1 AND 80 AND first_names !~ '^[[:space:]]|[[:space:]]$'
           AND char_length(last_names) BETWEEN 1 AND 80 AND last_names !~ '^[[:space:]]|[[:space:]]$'),
  CONSTRAINT pasantias_intake_participants_rut_check
    CHECK (rut ~ '^[1-9][0-9]{6,7}-[0-9K]$'),
  CONSTRAINT pasantias_intake_participants_passport_check
    CHECK (passport_number IS NULL OR passport_number ~ '^[A-Z0-9]{5,20}$'),
  CONSTRAINT pasantias_intake_participants_funding_check
    CHECK (flights_funding IN ('sep', 'colegio') AND lodging_funding IN ('sep', 'colegio')),
  CONSTRAINT pasantias_intake_participants_dates_check
    CHECK (arrival_date IS NULL OR departure_date IS NULL OR departure_date > arrival_date),
  CONSTRAINT pasantias_intake_participants_focus_check
    CHECK (focus IS NULL OR focus IN ('infantil', 'primer_ciclo', 'segundo_ciclo', 'tercer_ciclo')),
  -- One-dimensional, at most five, every element one of the five codes. `<@`
  -- never matches a NULL element, so NULL elements are refused too.
  CONSTRAINT pasantias_intake_participants_dietary_check
    CHECK (coalesce(array_ndims(dietary_restrictions), 1) = 1 AND cardinality(dietary_restrictions) <= 5
           AND dietary_restrictions <@ ARRAY['otra', 'sin_gluten', 'sin_lactosa', 'vegano', 'vegetariano']::text[]),
  CONSTRAINT pasantias_intake_participants_dietary_other_check
    CHECK (dietary_other IS NULL OR ('otra' = ANY (dietary_restrictions) AND char_length(dietary_other) BETWEEN 1 AND 200
                                     AND dietary_other !~ '^[[:space:]]|[[:space:]]$')),
  CONSTRAINT pasantias_intake_participants_notice_version_check
    CHECK (char_length(notice_version) BETWEEN 1 AND 64),
  CONSTRAINT pasantias_intake_participants_version_check
    CHECK (version >= 1)
);

CREATE INDEX pasantias_intake_participants_roster_created_idx
  ON public.pasantias_intake_participants (roster_id, created_at, id);

CREATE TRIGGER trg_pasantias_intake_rosters_updated_at
  BEFORE UPDATE ON public.pasantias_intake_rosters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pasantias_intake_participants_updated_at
  BEFORE UPDATE ON public.pasantias_intake_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pasantias_intake_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasantias_intake_participants ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'pasantias_intake_rosters');
SELECT public.apply_forced_password_change_guard('public', 'pasantias_intake_participants');

REVOKE ALL ON TABLE public.pasantias_intake_rosters FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pasantias_intake_participants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_intake_rosters TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_intake_participants TO service_role;

COMMENT ON TABLE public.pasantias_intake_rosters IS
  'January (enero-2027) participant intake roster: one per (school, program), holding the SHA-256 hex of its private link token. Service-role only; no direct access for anon or any authenticated user (D: pasant-intake db-contract).';
COMMENT ON TABLE public.pasantias_intake_participants IS
  'Adult participants entered by a school coordinator through a roster link. Written only by pasantias_intake_save_participant; service-role only.';

-- -----------------------------------------------------------------------------
-- Save one participant (create or optimistic update) through a live link.
--   create  p_participant_id NULL and p_expected_version NULL; p_client_request_id
--           required. Same client_request_id in this roster -> that row, replayed
--           (fields of the retry are NOT applied). Otherwise 60-person cap, then
--           duplicate RUT, then insert.
--   update  both given; p_client_request_id ignored (stored value never changes).
--           Unknown in this roster -> unknown_participant; version mismatch ->
--           stale_version; identical participant data -> replayed, no write.
--   Any real write bumps the roster version and reopens a submitted roster
--   (submitted_at cleared, last_submitted_at kept).
-- Inputs are validated as given, never trimmed or rewritten.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_intake_save_participant(
  p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid,
  p_first_names text, p_last_names text, p_rut text, p_passport_number text,
  p_flights_funding text, p_lodging_funding text, p_arrival_date date, p_departure_date date,
  p_focus text, p_dietary_restrictions text[], p_dietary_other text, p_notice_version text)
RETURNS TABLE (participant_id uuid, participant_version integer, replayed boolean, roster_status text, roster_version integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  c_edge_space constant text := '^[[:space:]]|[[:space:]]$';
  c_diet constant text[] := ARRAY['otra', 'sin_gluten', 'sin_lactosa', 'vegano', 'vegetariano'];
  v_bad text;
  v_sum integer;
  v_dv text;
  v_roster_id uuid;
  v_rstatus text;
  v_rversion integer;
  v_row public.pasantias_intake_participants%ROWTYPE;
  v_pid uuid;
  v_pversion integer;
BEGIN
  -- 1. Arguments (pure; nothing read, nothing locked).
  IF p_participant_id IS NULL AND p_expected_version IS NULL THEN
    IF p_client_request_id IS NULL THEN v_bad := 'invalid_argument'; END IF;
  ELSIF p_participant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    v_bad := 'invalid_argument';
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
  ELSIF p_flights_funding IS NULL OR p_flights_funding NOT IN ('sep', 'colegio') THEN
    v_bad := 'invalid_flights_funding';
  ELSIF p_lodging_funding IS NULL OR p_lodging_funding NOT IN ('sep', 'colegio') THEN
    v_bad := 'invalid_lodging_funding';
  ELSIF p_arrival_date IS NOT NULL AND p_departure_date IS NOT NULL AND p_departure_date <= p_arrival_date THEN
    v_bad := 'invalid_dates';
  ELSIF p_focus IS NOT NULL AND p_focus NOT IN ('infantil', 'primer_ciclo', 'segundo_ciclo', 'tercer_ciclo') THEN
    v_bad := 'invalid_focus';
  ELSIF p_dietary_restrictions IS NULL OR coalesce(array_ndims(p_dietary_restrictions), 1) <> 1 THEN
    v_bad := 'invalid_dietary';
  ELSIF EXISTS (SELECT 1 FROM unnest(p_dietary_restrictions) AS u(d) WHERE u.d IS NULL OR NOT (u.d = ANY (c_diet))) THEN
    v_bad := 'invalid_dietary';
  ELSIF p_dietary_restrictions IS DISTINCT FROM
        ARRAY(SELECT u.d FROM unnest(p_dietary_restrictions) AS u(d) GROUP BY u.d ORDER BY u.d COLLATE "C") THEN
    v_bad := 'invalid_dietary';               -- not sorted (C collation) and distinct, or not 1-based
  ELSIF ('otra' = ANY (p_dietary_restrictions)) <> (p_dietary_other IS NOT NULL) THEN
    v_bad := 'invalid_dietary';               -- Otra requires a detail; a detail requires Otra
  ELSIF p_dietary_other IS NOT NULL AND (char_length(p_dietary_other) NOT BETWEEN 1 AND 200
        OR p_dietary_other ~ c_edge_space OR p_dietary_other ~ '[[:cntrl:]]') THEN
    v_bad := 'invalid_dietary';
  ELSIF p_notice_version IS NULL OR char_length(p_notice_version) NOT BETWEEN 1 AND 64 THEN
    v_bad := 'invalid_notice_version';
  END IF;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'pasantias_intake_save_participant: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- 2. Link: lock the live roster row; revoke/rotate/expiry re-checked under the lock.
  IF p_token_hash IS NOT NULL AND p_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT r.id, r.status, r.version INTO v_roster_id, v_rstatus, v_rversion
      FROM public.pasantias_intake_rosters r
     WHERE r.token_hash = p_token_hash AND r.revoked_at IS NULL AND r.expires_at > now()
       FOR UPDATE;
  END IF;
  IF v_roster_id IS NULL THEN
    RAISE EXCEPTION 'pasantias_intake_save_participant: link_unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_participant_id IS NULL THEN
    -- 3a. Create.
    SELECT p.id, p.version INTO v_pid, v_pversion
      FROM public.pasantias_intake_participants p
     WHERE p.roster_id = v_roster_id AND p.client_request_id = p_client_request_id;
    IF v_pid IS NOT NULL THEN
      RETURN QUERY SELECT v_pid, v_pversion, true, v_rstatus, v_rversion;
      RETURN;
    END IF;
    IF (SELECT count(*) FROM public.pasantias_intake_participants p WHERE p.roster_id = v_roster_id) >= 60 THEN
      RAISE EXCEPTION 'pasantias_intake_save_participant: roster_full' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pasantias_intake_participants p WHERE p.roster_id = v_roster_id AND p.rut = p_rut) THEN
      RAISE EXCEPTION 'pasantias_intake_save_participant: duplicate_rut' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.pasantias_intake_participants AS p (
      roster_id, client_request_id, first_names, last_names, rut, passport_number,
      flights_funding, lodging_funding, arrival_date, departure_date, focus,
      dietary_restrictions, dietary_other, acknowledged_at, notice_version)
    VALUES (
      v_roster_id, p_client_request_id, p_first_names, p_last_names, p_rut, p_passport_number,
      p_flights_funding, p_lodging_funding, p_arrival_date, p_departure_date, p_focus,
      p_dietary_restrictions, p_dietary_other, now(), p_notice_version)
    RETURNING p.id, p.version INTO v_pid, v_pversion;
  ELSE
    -- 3b. Update.
    SELECT p.* INTO v_row
      FROM public.pasantias_intake_participants p
     WHERE p.id = p_participant_id AND p.roster_id = v_roster_id
       FOR UPDATE;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'pasantias_intake_save_participant: unknown_participant' USING ERRCODE = '22023';
    END IF;
    IF v_row.version <> p_expected_version THEN
      RAISE EXCEPTION 'pasantias_intake_save_participant: stale_version' USING ERRCODE = '22023';
    END IF;
    -- No-op: participant data identical (notice_version / acknowledged_at are
    -- evidence of a write, not participant data, and are not compared).
    IF ROW(v_row.first_names, v_row.last_names, v_row.rut, v_row.passport_number, v_row.flights_funding,
           v_row.lodging_funding, v_row.arrival_date, v_row.departure_date, v_row.focus,
           v_row.dietary_restrictions, v_row.dietary_other)
       IS NOT DISTINCT FROM
       ROW(p_first_names, p_last_names, p_rut, p_passport_number, p_flights_funding,
           p_lodging_funding, p_arrival_date, p_departure_date, p_focus,
           p_dietary_restrictions, p_dietary_other) THEN
      RETURN QUERY SELECT v_row.id, v_row.version, true, v_rstatus, v_rversion;
      RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM public.pasantias_intake_participants p
                WHERE p.roster_id = v_roster_id AND p.rut = p_rut AND p.id <> p_participant_id) THEN
      RAISE EXCEPTION 'pasantias_intake_save_participant: duplicate_rut' USING ERRCODE = '22023';
    END IF;
    UPDATE public.pasantias_intake_participants p
       SET first_names = p_first_names, last_names = p_last_names, rut = p_rut,
           passport_number = p_passport_number, flights_funding = p_flights_funding,
           lodging_funding = p_lodging_funding, arrival_date = p_arrival_date,
           departure_date = p_departure_date, focus = p_focus,
           dietary_restrictions = p_dietary_restrictions, dietary_other = p_dietary_other,
           acknowledged_at = now(), notice_version = p_notice_version, version = p.version + 1
     WHERE p.id = p_participant_id AND p.roster_id = v_roster_id AND p.version = p_expected_version
    RETURNING p.id, p.version INTO v_pid, v_pversion;
  END IF;

  -- 4. Real write: bump the roster and reopen it if it was submitted.
  UPDATE public.pasantias_intake_rosters r
     SET version = r.version + 1, status = 'open', submitted_at = NULL
   WHERE r.id = v_roster_id
  RETURNING r.status, r.version INTO v_rstatus, v_rversion;

  RETURN QUERY SELECT v_pid, v_pversion, false, v_rstatus, v_rversion;
END;
$$;

-- -----------------------------------------------------------------------------
-- Finalize (send to FNE) through a live link.
--   already submitted and p_expected_roster_version = version or version - 1
--     -> returned as is (replay of this finalize, or of the state the caller
--        saw); no write, submitted_at not re-stamped
--   version mismatch otherwise -> stale_version
--   no participants -> empty_roster
--   else status submitted, submitted_at = last_submitted_at = now(), version + 1
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_intake_finalize(p_token_hash text, p_expected_roster_version integer)
RETURNS TABLE (roster_status text, roster_version integer, submitted_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_roster_id uuid;
  v_rstatus text;
  v_rversion integer;
  v_submitted timestamptz;
BEGIN
  IF p_expected_roster_version IS NULL OR p_expected_roster_version < 1 THEN
    RAISE EXCEPTION 'pasantias_intake_finalize: invalid_argument' USING ERRCODE = '22023';
  END IF;

  IF p_token_hash IS NOT NULL AND p_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT r.id, r.status, r.version, r.submitted_at INTO v_roster_id, v_rstatus, v_rversion, v_submitted
      FROM public.pasantias_intake_rosters r
     WHERE r.token_hash = p_token_hash AND r.revoked_at IS NULL AND r.expires_at > now()
       FOR UPDATE;
  END IF;
  IF v_roster_id IS NULL THEN
    RAISE EXCEPTION 'pasantias_intake_finalize: link_unavailable' USING ERRCODE = '22023';
  END IF;

  IF v_rstatus = 'submitted' AND p_expected_roster_version IN (v_rversion - 1, v_rversion) THEN
    RETURN QUERY SELECT v_rstatus, v_rversion, v_submitted;
    RETURN;
  END IF;
  IF v_rversion <> p_expected_roster_version THEN
    RAISE EXCEPTION 'pasantias_intake_finalize: stale_version' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pasantias_intake_participants p WHERE p.roster_id = v_roster_id) THEN
    RAISE EXCEPTION 'pasantias_intake_finalize: empty_roster' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pasantias_intake_rosters r
     SET status = 'submitted', submitted_at = now(), last_submitted_at = now(), version = r.version + 1
   WHERE r.id = v_roster_id
  RETURNING r.status, r.version, r.submitted_at INTO v_rstatus, v_rversion, v_submitted;

  RETURN QUERY SELECT v_rstatus, v_rversion, v_submitted;
END;
$$;

REVOKE ALL ON FUNCTION public.pasantias_intake_save_participant(text, uuid, integer, uuid, text, text, text, text,
  text, text, date, date, text, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_intake_save_participant(text, uuid, integer, uuid, text, text, text, text,
  text, text, date, date, text, text[], text, text) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_intake_finalize(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_intake_finalize(text, integer) TO service_role;
