-- =============================================================================
-- 20260808120000_session_reschedule_atomic.sql — r21 (Sol item 2):
-- ONE transaction for a reschedule's source-schedule write AND its ledger write.
--
-- THE DEFECT. `public.reschedule_session_hours` (20260805120000) reads a session
-- that has ALREADY been updated and reconciles the ledger afterwards, so both
-- reschedule routes did the schedule write and the ledger write as two separate
-- PostgREST calls:
--   pages/api/sessions/[id]/index.ts            (admin PUT)
--   pages/api/sessions/edit-requests/[eid].ts   (edit-request approval)
-- A failure between the two left the session MOVED and the ledger STALE — the
-- school billed for the old duration on a session that now has a new one, with
-- nothing to roll back.
--
-- THE FIX. `public.apply_session_reschedule` performs, in ONE transaction:
--   the source-schedule UPDATE on public.consultor_sessions;
--   the optimistic-concurrency guard that used to live in the admin route;
--   and — via `public.reschedule_session_hours`, unchanged and still the single
--   implementation of the hours arithmetic — the ledger `hours`, the planned
--   snapshot, the ledger `session_date`, the over-budget state and the
--   append-only revision row.
-- Either all of it commits or none of it does.
--
-- NEW FUNCTION, NEW NAME. `reschedule_session_hours` is untouched: not dropped,
-- not overloaded, no signature change. It keeps its own pgTAP suite (012) and
-- remains callable on its own; this function is now its only caller in the app.
--
-- SECURITY: SECURITY DEFINER + SET search_path = '' + REVOKE-then-narrow-GRANT,
-- following supabase/migrations/20260731120000_zoom_provision_rpcs.sql:250-268.
-- The only callers are service-role API routes.
--
-- ADDITIVE ONLY: creates one function and grants EXECUTE on it. No DROP, no
-- TRUNCATE, no ALTER of any existing object, no RLS change.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- The updatable-column allowlist is the UNION of what the two callers may write:
--   pages/api/sessions/[id]/index.ts `allowedFields`, and
--   lib/types/consultor-sessions.types.ts `STRUCTURAL_FIELDS` (the only keys an
--   edit request may carry — pages/api/sessions/[id]/edit-requests.ts validates
--   `changes` against them).
-- Anything else raises and writes nothing: this function applies a caller-supplied
-- column map, so it fails closed rather than trusting the caller to have filtered.
-- `scheduled_duration_minutes` is deliberately absent — it is GENERATED ALWAYS.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_session_reschedule(
    p_session_id    uuid,
    p_actor_id      uuid,
    p_updates       jsonb,
    p_if_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    c_allowed_columns constant text[] := ARRAY[
        'title', 'description', 'objectives',
        'meeting_link', 'meeting_provider', 'location',
        'meeting_summary', 'meeting_transcript',
        'session_date', 'start_time', 'end_time',
        'modality', 'growth_community_id', 'school_id',
        'status', 'is_zoom_managed'
    ];

    v_keys       text[];
    v_rejected   text[];
    v_set_clause text;

    v_current    jsonb;
    v_updated_at timestamptz;
    v_row        jsonb;

    v_duration_relevant boolean;
    v_hours      jsonb := NULL;
BEGIN
    IF p_updates IS NULL
       OR jsonb_typeof(p_updates) <> 'object'
       OR p_updates = '{}'::jsonb THEN
        RAISE EXCEPTION 'No hay campos para actualizar'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_keys
      FROM jsonb_object_keys(p_updates) AS k;

    SELECT array_agg(k) INTO v_rejected
      FROM unnest(v_keys) AS k
     WHERE NOT (k = ANY (c_allowed_columns));

    IF v_rejected IS NOT NULL THEN
        RAISE EXCEPTION 'Campos no actualizables en esta ruta: %',
            array_to_string(v_rejected, ', ')
            USING ERRCODE = 'P0001';
    END IF;

    -- Lock the source row FIRST. Everything below — the concurrency guard, the
    -- UPDATE, the ledger reconciliation — reads and writes under this lock, so no
    -- concurrent reschedule can interleave between the guard and the write.
    SELECT to_jsonb(s), s.updated_at
      INTO v_current, v_updated_at
      FROM public.consultor_sessions s
     WHERE s.id = p_session_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesión no encontrada: %', p_session_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- OPTIMISTIC CONCURRENCY. This used to be `.eq('updated_at', if_updated_at)`
    -- appended to the route's own UPDATE; it lives here now so that the guard and
    -- the ledger write are on the same side of the transaction boundary. A stale
    -- timestamp returns WITHOUT having written to either table — the row lock is
    -- the only effect, and it is released on commit.
    --
    -- Stronger than the guard it replaces: the route compared inside the UPDATE's
    -- WHERE, this compares under FOR UPDATE, so the read cannot be overtaken.
    IF p_if_updated_at IS NOT NULL AND v_updated_at IS DISTINCT FROM p_if_updated_at THEN
        RETURN jsonb_build_object(
            'conflict', true,
            'current',  v_current
        );
    END IF;

    -- Apply the caller's column map. `jsonb_populate_record` does the jsonb → column
    -- type coercion with the table's own types, so no cast is hand-written here and a
    -- column type change cannot silently drift away from this function. Only the keys
    -- the caller actually sent appear in the SET list, so absent keys keep their
    -- stored value — the semantics of the PostgREST `.update()` this replaces.
    SELECT string_agg(format('%I = v.%I', k, k), ', ' ORDER BY k)
      INTO v_set_clause
      FROM unnest(v_keys) AS k;

    EXECUTE format(
        'UPDATE public.consultor_sessions AS t
            SET %s
           FROM (SELECT (jsonb_populate_record(NULL::public.consultor_sessions, $1)).*) AS v
          WHERE t.id = $2
      RETURNING to_jsonb(t)', v_set_clause)
      INTO v_row
     USING p_updates, p_session_id;

    -- The ledger only follows a PRE-EXECUTION reschedule, and only when something the
    -- ledger tracks actually moved. Both conditions are read from the row's POST-update
    -- state, which is what `reschedule_session_hours` will itself see.
    --
    -- Gated on `programada` rather than delegating to the inner function's own status
    -- refusal on purpose: a post-execution time edit is legitimate at the session level
    -- (the routes have always allowed it) and simply has no reservation to keep in step.
    -- The inner function still refuses `en_progreso` and beyond for any OTHER caller —
    -- it remains the security boundary, this is only about not provoking a refusal on a
    -- path that is allowed.
    v_duration_relevant :=
        (p_updates ? 'session_date') OR (p_updates ? 'start_time') OR (p_updates ? 'end_time');

    IF v_duration_relevant AND (v_row ->> 'status') = 'programada' THEN
        -- Re-raised with HINT = 'reschedule_hours' so the caller can tell an hours
        -- failure from a plain update failure and say so in Spanish. The re-raise
        -- still aborts everything: the sub-transaction rolls back the inner function's
        -- partial work, and the exception then propagates out of this function, taking
        -- the UPDATE above with it. THAT is the deliverable — the session does not move
        -- unless the ledger moves with it.
        BEGIN
            v_hours := public.reschedule_session_hours(p_session_id, p_actor_id);
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION '%', SQLERRM
                USING ERRCODE = SQLSTATE, HINT = 'reschedule_hours';
        END;
    END IF;

    RETURN jsonb_build_object(
        'conflict', false,
        'session',  v_row,
        'hours',    v_hours
    );
END;
$fn$;

COMMENT ON FUNCTION public.apply_session_reschedule(uuid, uuid, jsonb, timestamptz) IS
  'r21 (Sol item 2): apply a session update and its contract-hours reconciliation in ONE transaction. Locks the session, honours an optional if_updated_at guard (returns {conflict:true,current} having written nothing), applies the allowlisted column map, and — for a duration-relevant change on a programada session — delegates the ledger work to public.reschedule_session_hours. Any failure rolls back BOTH tables. Hours failures are re-raised with HINT ''reschedule_hours''. Service-role only.';


-- -----------------------------------------------------------------------------
-- Grants — REVOKE then narrow GRANT, per 20260731120000_zoom_provision_rpcs.sql.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.apply_session_reschedule(uuid, uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_session_reschedule(uuid, uuid, jsonb, timestamptz)
  TO service_role;
