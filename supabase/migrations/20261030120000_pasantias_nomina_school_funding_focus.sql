-- =============================================================================
-- pasantias_nomina_school_funding / pasantias_nomina_participant_focus — school-
-- level funding (F01) and "Todos" focus (F04) for the January (enero-2027)
-- participant intake. PASANT-PARTICIPANT-INTAKE-CORRECTIONS-DB-01.
-- Contract: docs/plan/evidence/pasant-intake/db-contract-corrections-01.md
-- (FIRST corrections review §3, §6, §8; conditions C1-C5, C8-C9).
--
-- Funding owner is the existing roster (one per school + program, the scope of
-- one private link); a school in both programs has two independent answers.
-- No funding row = "Datos del colegio" not yet defined.
--
-- Additive only (C1): two new tables, two triggers, two new service-role RPCs.
-- No column, constraint, trigger, policy, grant or comment of any existing
-- object changes; pasantias_intake_save_participant and
-- pasantias_intake_finalize stay byte-identical, so pgTAP 114 keeps its 176
-- pins. Nothing is dropped, truncated or destructively altered; no data is
-- copied or derived. Rollback is FORWARD-ONLY: stop the callers, then ship a
-- follow-up migration.
--
-- Why side tables: participants.flights_funding/lodging_funding stay NOT NULL
-- (relaxing them is a destructive ALTER and breaks 114); they become a copy the
-- RPCs keep equal to the school row (invariant I1) and nothing reads. The
-- participants focus CHECK cannot be widened, so "todos" is all_levels = true
-- with participants.focus NULL (invariant I2); NULL focus is all_levels = false.
--
-- ACCESS MATRIX (both new tables; every grant explicit)
--   role           table privileges        rows                RPC EXECUTE
--   PUBLIC, anon   none (REVOKE ALL)        -                   none
--   authenticated  none (REVOKE ALL)        -                   none   (admins included)
--   service_role   SELECT/INSERT/UPDATE     BYPASSRLS           both new
-- RLS enabled, no permissive policy, restrictive forced_password_change_guard
-- installed. No DELETE for anyone: a funding row, once written, never goes.
--
-- Concurrency: both RPCs lock the roster row FOR UPDATE through the DB-01
-- token predicate and write in the same transaction, so every coordinator
-- write to one roster (funding, participants, finalize) is serialized and a
-- revoke/rotate that commits first wins.
--
-- RELEASE PRECONDITION (C8; not executed here): outside local, this must
-- return 0 before release, else stop and ask:
--   SELECT count(*) FROM public.pasantias_intake_participants p
--    WHERE NOT EXISTS (SELECT 1 FROM public.pasantias_nomina_school_funding f
--                       WHERE f.roster_id = p.roster_id);
-- =============================================================================

CREATE TABLE public.pasantias_nomina_school_funding (
  roster_id uuid NOT NULL,
  flights_funding text NOT NULL,              -- no default: never silently chosen
  lodging_funding text NOT NULL,              -- no default: never silently chosen
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_nomina_school_funding_pkey PRIMARY KEY (roster_id),
  CONSTRAINT pasantias_nomina_school_funding_roster_fkey FOREIGN KEY (roster_id)
    REFERENCES public.pasantias_intake_rosters (id) ON DELETE RESTRICT,
  CONSTRAINT pasantias_nomina_school_funding_funding_check
    CHECK (flights_funding IN ('sep', 'colegio') AND lodging_funding IN ('sep', 'colegio')),
  CONSTRAINT pasantias_nomina_school_funding_version_check
    CHECK (version >= 1)
);

CREATE TABLE public.pasantias_nomina_participant_focus (
  participant_id uuid NOT NULL,
  all_levels boolean NOT NULL,                -- no default: false for a level or NULL focus, true for todos
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_nomina_participant_focus_pkey PRIMARY KEY (participant_id),
  CONSTRAINT pasantias_nomina_participant_focus_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.pasantias_intake_participants (id) ON DELETE RESTRICT
);

CREATE TRIGGER trg_pasantias_nomina_school_funding_updated_at
  BEFORE UPDATE ON public.pasantias_nomina_school_funding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pasantias_nomina_participant_focus_updated_at
  BEFORE UPDATE ON public.pasantias_nomina_participant_focus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pasantias_nomina_school_funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasantias_nomina_participant_focus ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'pasantias_nomina_school_funding');
SELECT public.apply_forced_password_change_guard('public', 'pasantias_nomina_participant_focus');

REVOKE ALL ON TABLE public.pasantias_nomina_school_funding FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.pasantias_nomina_participant_focus FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_nomina_school_funding TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pasantias_nomina_participant_focus TO service_role;

COMMENT ON TABLE public.pasantias_nomina_school_funding IS
  'School-level (per roster = school + program) Pasajes/Estadia funding for the enero-2027 intake. No row = not yet defined. Written only by pasantias_nomina_save_school_funding; service-role only.';
COMMENT ON TABLE public.pasantias_nomina_participant_focus IS
  'Effective focus of an intake participant: all_levels = true means Todos (participants.focus is then NULL); false means participants.focus (a level or NULL). Written only by pasantias_nomina_save_participant; service-role only.';

-- -----------------------------------------------------------------------------
-- Save the school's funding through a live link.
--   p_expected_funding_version NULL = "no row expected"; otherwise the row's
--   version. Same two values as the stored row -> replayed under ANY expected
--   version, no write. Else a mismatch -> stale_version. A real write inserts
--   (version 1) or updates (version + 1), copies the values into every
--   participant of the roster whose copy differs (participant versions not
--   bumped), bumps the roster version and reopens a submitted roster
--   (submitted_at cleared, last_submitted_at kept).
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_nomina_save_school_funding(
  p_token_hash text, p_expected_funding_version integer, p_flights_funding text, p_lodging_funding text)
RETURNS TABLE (funding_flights text, funding_lodging text, funding_version integer, replayed boolean,
               roster_status text, roster_version integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  v_roster_id uuid;
  v_rstatus text;
  v_rversion integer;
  v_ff text;
  v_lf text;
  v_fversion integer;
BEGIN
  -- 1. Arguments (pure).
  IF p_expected_funding_version IS NOT NULL AND p_expected_funding_version < 1 THEN
    RAISE EXCEPTION 'pasantias_nomina_save_school_funding: invalid_argument' USING ERRCODE = '22023';
  END IF;
  IF p_flights_funding IS NULL OR p_flights_funding NOT IN ('sep', 'colegio') THEN
    RAISE EXCEPTION 'pasantias_nomina_save_school_funding: invalid_flights_funding' USING ERRCODE = '22023';
  END IF;
  IF p_lodging_funding IS NULL OR p_lodging_funding NOT IN ('sep', 'colegio') THEN
    RAISE EXCEPTION 'pasantias_nomina_save_school_funding: invalid_lodging_funding' USING ERRCODE = '22023';
  END IF;

  -- 2. Link: lock the live roster row (DB-01 predicate, re-checked under the lock).
  IF p_token_hash IS NOT NULL AND p_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT r.id, r.status, r.version INTO v_roster_id, v_rstatus, v_rversion
      FROM public.pasantias_intake_rosters r
     WHERE r.token_hash = p_token_hash AND r.revoked_at IS NULL AND r.expires_at > now()
       FOR UPDATE;
  END IF;
  IF v_roster_id IS NULL THEN
    RAISE EXCEPTION 'pasantias_nomina_save_school_funding: link_unavailable' USING ERRCODE = '22023';
  END IF;

  -- 3. Replay, then optimistic version.
  SELECT f.flights_funding, f.lodging_funding, f.version INTO v_ff, v_lf, v_fversion
    FROM public.pasantias_nomina_school_funding f
   WHERE f.roster_id = v_roster_id
     FOR UPDATE;
  IF v_fversion IS NOT NULL AND v_ff = p_flights_funding AND v_lf = p_lodging_funding THEN
    RETURN QUERY SELECT v_ff, v_lf, v_fversion, true, v_rstatus, v_rversion;
    RETURN;
  END IF;
  IF p_expected_funding_version IS DISTINCT FROM v_fversion THEN
    RAISE EXCEPTION 'pasantias_nomina_save_school_funding: stale_version' USING ERRCODE = '22023';
  END IF;

  -- 4. Real write.
  IF v_fversion IS NULL THEN
    INSERT INTO public.pasantias_nomina_school_funding AS f (roster_id, flights_funding, lodging_funding)
    VALUES (v_roster_id, p_flights_funding, p_lodging_funding)
    RETURNING f.flights_funding, f.lodging_funding, f.version INTO v_ff, v_lf, v_fversion;
  ELSE
    UPDATE public.pasantias_nomina_school_funding f
       SET flights_funding = p_flights_funding, lodging_funding = p_lodging_funding, version = f.version + 1
     WHERE f.roster_id = v_roster_id
    RETURNING f.flights_funding, f.lodging_funding, f.version INTO v_ff, v_lf, v_fversion;
  END IF;

  -- I1: every participant of the roster carries the school's values.
  UPDATE public.pasantias_intake_participants p
     SET flights_funding = v_ff, lodging_funding = v_lf
   WHERE p.roster_id = v_roster_id
     AND (p.flights_funding IS DISTINCT FROM v_ff OR p.lodging_funding IS DISTINCT FROM v_lf);

  UPDATE public.pasantias_intake_rosters r
     SET version = r.version + 1, status = 'open', submitted_at = NULL
   WHERE r.id = v_roster_id
  RETURNING r.status, r.version INTO v_rstatus, v_rversion;

  RETURN QUERY SELECT v_ff, v_lf, v_fversion, false, v_rstatus, v_rversion;
END;
$$;

-- -----------------------------------------------------------------------------
-- Save one participant without per-person funding (DB-01 save minus the two
-- funding arguments; focus additionally accepts 'todos').
--   create  same client_request_id in this roster -> that row, replayed (fields
--           of the retry NOT applied); else school_data_missing (no funding
--           row), 60-person cap, duplicate RUT, insert with funding copied from
--           the school row, participants.focus NULL for todos, and a focus row
--           (all_levels true for todos, false for a level or NULL).
--   update  p_client_request_id ignored; unknown_participant; stale_version;
--           no-op (names, RUT, passport, dates, EFFECTIVE focus, dietary codes
--           and detail identical; funding never compared) -> replayed, no
--           write; else school_data_missing, duplicate RUT, update with funding
--           re-copied and the focus row upserted.
--   Any real write bumps the participant (update) and roster versions and
--   reopens a submitted roster (submitted_at cleared, last_submitted_at kept).
-- Inputs are validated as given, never trimmed or rewritten.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_nomina_save_participant(
  p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid,
  p_first_names text, p_last_names text, p_rut text, p_passport_number text,
  p_arrival_date date, p_departure_date date, p_focus text,
  p_dietary_restrictions text[], p_dietary_other text, p_notice_version text)
RETURNS TABLE (participant_id uuid, participant_version integer, replayed boolean, roster_status text, roster_version integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict error
DECLARE
  c_edge_space constant text := '^[[:space:]]|[[:space:]]$';
  c_diet constant text[] := ARRAY['otra', 'sin_gluten', 'sin_lactosa', 'vegano', 'vegetariano'];
  -- 'todos' -> all_levels true + participants.focus NULL; a level or NULL -> false (never SQL NULL).
  v_all_levels constant boolean := (p_focus IS NOT DISTINCT FROM 'todos');
  v_level constant text := CASE WHEN p_focus IS NOT DISTINCT FROM 'todos' THEN NULL ELSE p_focus END;
  v_bad text;
  v_sum integer;
  v_dv text;
  v_roster_id uuid;
  v_rstatus text;
  v_rversion integer;
  v_ff text;
  v_lf text;
  v_row public.pasantias_intake_participants%ROWTYPE;
  v_stored_all boolean;
  v_pid uuid;
  v_pversion integer;
BEGIN
  -- 1. Arguments (pure; nothing read, nothing locked). DB-01 order minus funding.
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
    RAISE EXCEPTION 'pasantias_nomina_save_participant: %', v_bad USING ERRCODE = '22023';
  END IF;

  -- 2. Link: lock the live roster row; revoke/rotate/expiry re-checked under the lock.
  IF p_token_hash IS NOT NULL AND p_token_hash ~ '^[0-9a-f]{64}$' THEN
    SELECT r.id, r.status, r.version INTO v_roster_id, v_rstatus, v_rversion
      FROM public.pasantias_intake_rosters r
     WHERE r.token_hash = p_token_hash AND r.revoked_at IS NULL AND r.expires_at > now()
       FOR UPDATE;
  END IF;
  IF v_roster_id IS NULL THEN
    RAISE EXCEPTION 'pasantias_nomina_save_participant: link_unavailable' USING ERRCODE = '22023';
  END IF;

  -- School funding (never deleted; changes serialized by the roster lock).
  SELECT f.flights_funding, f.lodging_funding INTO v_ff, v_lf
    FROM public.pasantias_nomina_school_funding f
   WHERE f.roster_id = v_roster_id;

  IF p_participant_id IS NULL THEN
    -- 3a. Create.
    SELECT p.id, p.version INTO v_pid, v_pversion
      FROM public.pasantias_intake_participants p
     WHERE p.roster_id = v_roster_id AND p.client_request_id = p_client_request_id;
    IF v_pid IS NOT NULL THEN
      RETURN QUERY SELECT v_pid, v_pversion, true, v_rstatus, v_rversion;
      RETURN;
    END IF;
    IF v_ff IS NULL THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: school_data_missing' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.pasantias_intake_participants p WHERE p.roster_id = v_roster_id) >= 60 THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: roster_full' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pasantias_intake_participants p WHERE p.roster_id = v_roster_id AND p.rut = p_rut) THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: duplicate_rut' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.pasantias_intake_participants AS p (
      roster_id, client_request_id, first_names, last_names, rut, passport_number,
      flights_funding, lodging_funding, arrival_date, departure_date, focus,
      dietary_restrictions, dietary_other, acknowledged_at, notice_version)
    VALUES (
      v_roster_id, p_client_request_id, p_first_names, p_last_names, p_rut, p_passport_number,
      v_ff, v_lf, p_arrival_date, p_departure_date, v_level,
      p_dietary_restrictions, p_dietary_other, now(), p_notice_version)
    RETURNING p.id, p.version INTO v_pid, v_pversion;
    INSERT INTO public.pasantias_nomina_participant_focus AS f (participant_id, all_levels)
    VALUES (v_pid, v_all_levels);
  ELSE
    -- 3b. Update.
    SELECT p.* INTO v_row
      FROM public.pasantias_intake_participants p
     WHERE p.id = p_participant_id AND p.roster_id = v_roster_id
       FOR UPDATE;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: unknown_participant' USING ERRCODE = '22023';
    END IF;
    IF v_row.version <> p_expected_version THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: stale_version' USING ERRCODE = '22023';
    END IF;
    SELECT f.all_levels INTO v_stored_all
      FROM public.pasantias_nomina_participant_focus f
     WHERE f.participant_id = p_participant_id;
    -- No-op: participant data identical, focus compared as its effective value
    -- (no focus row = all_levels false). Funding, notice_version and
    -- acknowledged_at are not participant data and are not compared.
    IF ROW(v_row.first_names, v_row.last_names, v_row.rut, v_row.passport_number,
           v_row.arrival_date, v_row.departure_date,
           CASE WHEN v_stored_all IS TRUE THEN 'todos' ELSE v_row.focus END,
           v_row.dietary_restrictions, v_row.dietary_other)
       IS NOT DISTINCT FROM
       ROW(p_first_names, p_last_names, p_rut, p_passport_number,
           p_arrival_date, p_departure_date, p_focus,
           p_dietary_restrictions, p_dietary_other) THEN
      RETURN QUERY SELECT v_row.id, v_row.version, true, v_rstatus, v_rversion;
      RETURN;
    END IF;
    IF v_ff IS NULL THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: school_data_missing' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pasantias_intake_participants p
                WHERE p.roster_id = v_roster_id AND p.rut = p_rut AND p.id <> p_participant_id) THEN
      RAISE EXCEPTION 'pasantias_nomina_save_participant: duplicate_rut' USING ERRCODE = '22023';
    END IF;
    UPDATE public.pasantias_intake_participants p
       SET first_names = p_first_names, last_names = p_last_names, rut = p_rut,
           passport_number = p_passport_number, flights_funding = v_ff,
           lodging_funding = v_lf, arrival_date = p_arrival_date,
           departure_date = p_departure_date, focus = v_level,
           dietary_restrictions = p_dietary_restrictions, dietary_other = p_dietary_other,
           acknowledged_at = now(), notice_version = p_notice_version, version = p.version + 1
     WHERE p.id = p_participant_id AND p.roster_id = v_roster_id AND p.version = p_expected_version
    RETURNING p.id, p.version INTO v_pid, v_pversion;
    -- ON CONSTRAINT, not a column list: the OUT column participant_id would
    -- otherwise be an ambiguous reference.
    INSERT INTO public.pasantias_nomina_participant_focus AS f (participant_id, all_levels)
    VALUES (v_pid, v_all_levels)
    ON CONFLICT ON CONSTRAINT pasantias_nomina_participant_focus_pkey
      DO UPDATE SET all_levels = EXCLUDED.all_levels
      WHERE f.all_levels IS DISTINCT FROM EXCLUDED.all_levels;
  END IF;

  -- 4. Real write: bump the roster and reopen it if it was submitted.
  UPDATE public.pasantias_intake_rosters r
     SET version = r.version + 1, status = 'open', submitted_at = NULL
   WHERE r.id = v_roster_id
  RETURNING r.status, r.version INTO v_rstatus, v_rversion;

  RETURN QUERY SELECT v_pid, v_pversion, false, v_rstatus, v_rversion;
END;
$$;

REVOKE ALL ON FUNCTION public.pasantias_nomina_save_school_funding(text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_nomina_save_school_funding(text, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_nomina_save_participant(text, uuid, integer, uuid, text, text, text, text,
  date, date, text, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_nomina_save_participant(text, uuid, integer, uuid, text, text, text, text,
  date, date, text, text[], text, text) TO service_role;
