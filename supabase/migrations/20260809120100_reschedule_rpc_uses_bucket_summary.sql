-- =============================================================================
-- 20260809120100_reschedule_rpc_uses_bucket_summary.sql — Z2 r22 (Sol item 3)
--
-- ONE FORMULA (PM ruling 4). 20260805120000_reschedule_hours_rpc.sql:163-171
-- restated get_bucket_summary's availability inline, because that function pinned
-- no search_path and therefore could not be called from a hardened
-- (`SET search_path = ''`) SECURITY DEFINER function. The inline copy carried the
-- SAME fan-out bug — it, too, summed allocated_hours over a set already multiplied
-- by the ledger LEFT JOIN.
--
-- 20260809120000 repaired get_bucket_summary AND pinned its search_path, which
-- removes the obstacle. This migration replaces reschedule_session_hours with a
-- body identical to the r21 version EXCEPT for that one block, which now CALLS
-- public.get_bucket_summary instead of restating it. There is no second copy of
-- the formula left to drift.
--
-- Privilege context is unchanged: get_bucket_summary is invoker-rights, so inside
-- this SECURITY DEFINER function it executes exactly as the inline query did.
--
-- ADDITIVE ONLY: CREATE OR REPLACE at the identical signature. No DROP, no ALTER,
-- no TRUNCATE, no RLS change. Grants are preserved by CREATE OR REPLACE and are
-- deliberately not restated (service_role only, set by 20260805120000).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reschedule_session_hours(
    p_session_id uuid,
    p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status         text;
    v_session_date   date;
    v_new_minutes    integer;
    v_contrato_id    uuid;
    v_hour_type_key  text;

    v_ledger_id        uuid;
    v_ledger_status    text;
    v_old_minutes      integer;
    v_old_hours        numeric(6,2);
    v_old_session_date date;
    v_old_over_budget  boolean;

    v_new_hours      numeric(6,2);
    v_available      numeric;
    v_is_over_budget boolean;
    v_minutes_changed boolean;
    v_date_changed    boolean;
BEGIN
    -- Lock the session row so a concurrent reschedule cannot interleave between
    -- this read and the ledger write below.
    SELECT s.status, s.session_date, s.scheduled_duration_minutes,
           s.contrato_id, s.hour_type_key
      INTO v_status, v_session_date, v_new_minutes, v_contrato_id, v_hour_type_key
      FROM public.consultor_sessions s
     WHERE s.id = p_session_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesión no encontrada: %', p_session_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- S2 — the pre-execution guard. It lives HERE, not only in the caller, because
    -- the caller is not the security boundary. Once execution has begun the planned
    -- values are frozen; the only path that may move them is the Z7 admin override,
    -- which does not exist yet.
    IF v_status IN ('en_progreso', 'pendiente_informe', 'completada', 'cancelada') THEN
        RAISE EXCEPTION
            'Las horas planificadas están congeladas: la sesión está en estado %', v_status
            USING ERRCODE = 'P0001';
    END IF;

    -- Before approval there is no reservation yet (createReservation writes it at
    -- approve time), so there is nothing to keep in sync. That is ordinary draft
    -- editing, not an error.
    IF v_status <> 'programada' THEN
        RETURN jsonb_build_object(
            'applied', false, 'reason', 'not_reserved_yet', 'status', v_status
        );
    END IF;

    SELECT l.id, l.status, l.planned_minutes_snapshot, l.hours,
           l.session_date, l.is_over_budget
      INTO v_ledger_id, v_ledger_status, v_old_minutes, v_old_hours,
           v_old_session_date, v_old_over_budget
      FROM public.contract_hours_ledger l
     WHERE l.session_id = p_session_id
       FOR UPDATE;

    -- A `programada` session with no ledger row is the backward-compatible case
    -- createReservation already skips (null hour_type_key / contrato_id).
    IF NOT FOUND THEN
        RETURN jsonb_build_object('applied', false, 'reason', 'no_ledger_entry');
    END IF;

    -- A finalized ledger row is frozen for the same reason the session status is.
    IF v_ledger_status <> 'reservada' THEN
        RAISE EXCEPTION
            'Las horas planificadas están congeladas: la entrada del libro de horas está en estado %',
            v_ledger_status
            USING ERRCODE = 'P0001';
    END IF;

    IF v_new_minutes IS NULL THEN
        RAISE EXCEPTION 'La sesión no tiene una duración planificada calculable'
            USING ERRCODE = 'P0001';
    END IF;

    -- Matches calculateHours (lib/services/hour-tracking.ts:145): minutes/60 to two
    -- decimals, ROUND_HALF_UP. numeric round() is half-up, as Math.round() is there.
    v_new_hours := round(v_new_minutes::numeric / 60, 2);

    -- Ruling 1: `hours > 0` is never violated and its CHECK is never relaxed. A
    -- recomputation that would yield 0 raises and the WHOLE reschedule fails. The
    -- zero-waiver case is Z7's additive `effective_minutes`, deliberately additive
    -- precisely so this constraint stays untouched (plan §11, v2.1.1).
    IF v_new_hours <= 0 THEN
        RAISE EXCEPTION
            'La duración recalculada sería 0 h; la reprogramación se cancela'
            USING ERRCODE = 'check_violation';
    END IF;

    v_minutes_changed := v_new_minutes IS DISTINCT FROM v_old_minutes;
    v_date_changed    := v_session_date IS DISTINCT FROM v_old_session_date;

    IF NOT v_minutes_changed AND NOT v_date_changed THEN
        RETURN jsonb_build_object('applied', false, 'reason', 'no_change');
    END IF;

    -- Ruling 4: a lengthening reschedule past the contract's available hours is NOT
    -- blocked — rescheduling is an operational act and `is_over_budget` is the
    -- existing signal. A date-only move keeps the flag it already had.
    v_is_over_budget := v_old_over_budget;

    IF v_minutes_changed AND v_contrato_id IS NOT NULL AND v_hour_type_key IS NOT NULL THEN
        -- r22 (Sol item 3): the availability figure is READ FROM
        -- public.get_bucket_summary rather than restated here. The previous inline
        -- copy could not call it — the function pinned no search_path of its own and
        -- this one is deliberately empty — so 20260809120000 pinned it to 'public'
        -- as part of repairing the fan-out. Annex allocations are therefore rolled
        -- into the bucket by the same code the dashboards read, not by a parallel
        -- expression, and drift is now impossible rather than merely test-pinned.
        --
        -- No bucket (no allocation for this contract + hour type) → v_available stays
        -- NULL and the flag is left as it was, mirroring createReservation's
        -- `budgetInfo ? … : false` fallback.
        SELECT b.available_hours
          INTO v_available
          FROM public.get_bucket_summary(v_contrato_id) b
         WHERE b.hour_type_key = v_hour_type_key;

        -- createReservation compares the new hours against an availability figure
        -- that does not yet contain them (hour-tracking.ts:245-330). Here THIS row's
        -- current reservation is already inside the bucket's reserved_hours, so it is
        -- added back before the comparison — the same rule, not a parallel one.
        IF v_available IS NOT NULL THEN
            v_is_over_budget := (v_available + v_old_hours) < v_new_hours;
        END IF;
    END IF;

    UPDATE public.contract_hours_ledger
       SET hours = CASE WHEN v_minutes_changed THEN v_new_hours ELSE hours END,
           planned_minutes_snapshot =
             CASE WHEN v_minutes_changed THEN v_new_minutes ELSE planned_minutes_snapshot END,
           -- session_date is a column that exists on the ledger and was never
           -- maintained by any reschedule path until now.
           session_date = v_session_date,
           is_over_budget = v_is_over_budget,
           updated_at = now(),
           updated_by = p_actor_id
     WHERE id = v_ledger_id;

    -- Ruling 3: append-only. A prior entry is never updated or deleted; a duration
    -- change adds one row. A date-only move writes NO revision row — there is no
    -- duration revision to record.
    --
    -- r21 (Sol item 1): the row carries the pre-existing 'edited' action plus a typed
    -- `details.event_type`. The revision history is queryable on the discriminator
    -- ALONE — `WHERE details ->> 'event_type' = 'hours_revised'` selects exactly these
    -- rows and nothing else, because no other writer of session_activity_log sets
    -- `event_type` at all. That keeps plan §11's "every historical approved value
    -- remains reconstructible" without touching the action CHECK allowlist.
    IF v_minutes_changed THEN
        INSERT INTO public.session_activity_log (session_id, user_id, action, details)
        VALUES (
            p_session_id,
            p_actor_id,
            'edited',
            jsonb_build_object(
                'event_type',        'hours_revised',
                'ledger_entry_id',   v_ledger_id,
                'old_minutes',       v_old_minutes,
                'new_minutes',       v_new_minutes,
                'old_hours',         v_old_hours,
                'new_hours',         v_new_hours,
                'old_session_date',  v_old_session_date,
                'new_session_date',  v_session_date,
                'is_over_budget',    v_is_over_budget,
                'actor_id',          p_actor_id,
                'revised_at',        now()
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'applied',          true,
        'ledger_entry_id',  v_ledger_id,
        'old_minutes',      v_old_minutes,
        'new_minutes',      v_new_minutes,
        'hours',            CASE WHEN v_minutes_changed THEN v_new_hours ELSE v_old_hours END,
        'is_over_budget',   v_is_over_budget,
        'session_date',     v_session_date,
        'revision_written', v_minutes_changed
    );
END;
$$;

COMMENT ON FUNCTION public.reschedule_session_hours(uuid, uuid) IS
  'Z2-3a (plan §11): atomically recompute contract_hours_ledger.hours + planned_minutes_snapshot + session_date and append one revision row (action ''edited'', details.event_type ''hours_revised'') for a pre-execution reschedule. Refuses en_progreso/pendiente_informe/completada/cancelada and any non-reservada ledger row. Never yields hours <= 0. Service-role only. Called by public.apply_session_reschedule (r21), which wraps it together with the source-schedule UPDATE in one transaction. r22: availability comes from public.get_bucket_summary — one formula, no inline copy.';
