-- =============================================================================
-- 20260813120500_reschedule_tracking_pair_guard.sql — Z7 R7
--
-- Additive identical-signature replacement of public.reschedule_session_hours.
-- A programada row without a ledger entry is legacy only when BOTH tracking
-- columns are NULL. Fully tracked and XOR rows raise before the wrapper transaction
-- can commit its session update. Round 6 bucket integrity remains unchanged.
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
    v_bucket_count   integer;
    v_allocated      numeric;
    v_reserved       numeric;
    v_consumed       numeric;
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

    -- No-ledger is backward-compatible only for the genuine legacy shape. A fully
    -- tracked or XOR session without its required reservation is inconsistent and
    -- must abort the surrounding apply_session_reschedule transaction before its
    -- attempted session update, ledger state, or revision history can commit.
    IF NOT FOUND THEN
        IF v_contrato_id IS NULL AND v_hour_type_key IS NULL THEN
            RETURN jsonb_build_object('applied', false, 'reason', 'no_ledger_entry');
        END IF;
        RAISE EXCEPTION
            'Una sesión con seguimiento de horas requiere una entrada en el libro'
            USING ERRCODE = 'P0001';
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

    -- Duration changes on tracked rows require exactly one canonical financial
    -- bucket. The wrapper has already changed the session inside this transaction,
    -- but every exception below propagates through apply_session_reschedule and
    -- rolls that source UPDATE, this ledger row, and the revision back together.
    v_is_over_budget := v_old_over_budget;

    IF v_minutes_changed THEN
        IF (v_contrato_id IS NULL) <> (v_hour_type_key IS NULL) THEN
            RAISE EXCEPTION 'El contrato y el tipo de hora deben configurarse juntos'
                USING ERRCODE = 'P0001';
        END IF;
        IF v_contrato_id IS NULL OR v_hour_type_key IS NULL THEN
            RAISE EXCEPTION 'Una sesión con libro de horas requiere contrato y tipo de hora'
                USING ERRCODE = 'P0001';
        END IF;

        SELECT count(*), min(b.allocated_hours), min(b.reserved_hours),
               min(b.consumed_hours), min(b.available_hours)
          INTO v_bucket_count, v_allocated, v_reserved, v_consumed, v_available
          FROM public.get_bucket_summary(v_contrato_id) b
         WHERE b.hour_type_key = v_hour_type_key;

        IF v_bucket_count <> 1 THEN
            RAISE EXCEPTION 'La disponibilidad debe contener exactamente un bucket para el tipo'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_allocated IS NULL OR v_reserved IS NULL OR v_consumed IS NULL OR v_available IS NULL
           OR v_allocated::text IN ('NaN', 'Infinity', '-Infinity')
           OR v_reserved::text IN ('NaN', 'Infinity', '-Infinity')
           OR v_consumed::text IN ('NaN', 'Infinity', '-Infinity')
           OR v_available::text IN ('NaN', 'Infinity', '-Infinity')
           OR v_allocated < 0 OR v_allocated > 999999.99
           OR v_reserved < 0 OR v_reserved > 99999999.99
           OR v_consumed < 0 OR v_consumed > 99999999.99
           OR v_available < -99999999.99 OR v_available > 999999.99
           OR round(v_allocated, 2) <> v_allocated
           OR round(v_reserved, 2) <> v_reserved
           OR round(v_consumed, 2) <> v_consumed
           OR round(v_available, 2) <> v_available
           OR v_available <> v_allocated - v_reserved - v_consumed THEN
            RAISE EXCEPTION 'El bucket de disponibilidad es inválido o incoherente'
                USING ERRCODE = 'P0001';
        END IF;

        -- This row is already included in reserved_hours, so add its old amount
        -- back before comparing the replacement amount. Coherent negative
        -- availability remains valid and therefore over-budget.
        v_is_over_budget := (v_available + v_old_hours) < v_new_hours;
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
  'Z7 R7 additive identical-signature replacement: no_ledger_entry is valid only for both-null legacy sessions; fully tracked and XOR no-ledger rows raise before wrapper commit. Retains exact Round 6 coherent-bucket validation, date-only behavior, and owner-controlled service wrapper.';
