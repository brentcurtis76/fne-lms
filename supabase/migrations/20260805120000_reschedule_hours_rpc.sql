-- =============================================================================
-- 20260805120000_reschedule_hours_rpc.sql — Z2-3a: atomic pre-execution reschedule
--
-- Plan §11: a pre-execution reschedule must update the hour reservation, the
-- planned-minutes snapshot and an append-only revision entry IN ONE TRANSACTION.
--
-- Before this migration NEITHER reschedule path touched the ledger at all:
--   pages/api/sessions/[id]/index.ts            (admin PUT)
--   pages/api/sessions/edit-requests/[eid].ts   (edit-request approve)
-- Moving a session from 09:00–10:30 to 09:00–11:30 left the school billed for
-- 1.5 h and the consultant paid for 1.5 h. Since one ledger value drives both
-- (plan §11, Brent 2026-07-13 — "what is booked is what the consultant is paid"),
-- that is a live billing bug; closing it is this migration's product value.
--
-- Why an RPC rather than three statements from the route: the routes' existing
-- activity-logging path is deliberately best-effort (a failed log does not fail
-- the update — `pages/api/sessions/[id]/index.ts`, "Don't fail the request"), so a
-- route-level sequence can leave the ledger updated with no revision trail. Here
-- the recomputation, the snapshot and the revision row commit or roll back together.
--
-- SECURITY: SECURITY DEFINER + SET search_path = '' + REVOKE-then-narrow-GRANT,
-- following supabase/migrations/20260731120000_zoom_provision_rpcs.sql:250-268.
-- The only callers are service-role API routes.
--
-- ADDITIVE ONLY: this migration performs NO DDL on any pre-existing object. It
-- creates one function and grants EXECUTE on it — nothing else. No DROP of any
-- kind, no TRUNCATE, no ALTER, no RLS change.
--
-- r21 (Sol item 1): this file originally widened `session_activity_log`'s `action`
-- CHECK allowlist with a new 'hours_revised' value, which forced
-- `ALTER TABLE … DROP CONSTRAINT` — the mechanism PostgreSQL requires for a CHECK
-- widening. CLAUDE.md states "NEVER DROP, TRUNCATE, or destructive ALTER" with no
-- mechanism exemption, and a hard rule that yields to a good argument is not a hard
-- rule. The whole block is gone and the allowlist stays at its 16 baseline values.
-- The revision row now uses the ALREADY-ALLOWED 'edited' action and carries a typed
-- `details.event_type = 'hours_revised'` discriminator, so the revision history is
-- still queryable on its own — the only thing a distinct action bought.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The transactional reschedule.
--
-- Reads the session's NEW planned duration from `scheduled_duration_minutes`
-- (GENERATED ALWAYS STORED from end_time - start_time), so the figure billed is
-- the database's own, never a caller-supplied number.
-- -----------------------------------------------------------------------------
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
        -- This is public.get_bucket_summary's available_hours for the session's
        -- bucket, restated with schema-qualified names: that function is a plain SQL
        -- function with NO search_path of its own, so it resolves table names against
        -- the CALLER's — and this one is deliberately empty. Calling it from here
        -- fails with "relation contract_hour_allocations does not exist".
        --
        -- Annex allocations are rolled into the bucket exactly as they are there
        -- (adds_to_allocation_id), because createReservation's budget check reads that
        -- same rollup. Suite 012 pins this expression against get_bucket_summary's own
        -- output for the same contract, so the two cannot drift apart silently.
        WITH effective_allocations AS (
            SELECT cha.id, cha.hour_type_id, cha.allocated_hours
              FROM public.contract_hour_allocations cha
             WHERE cha.contrato_id = v_contrato_id
            UNION ALL
            SELECT cha.id, cha.hour_type_id, cha.allocated_hours
              FROM public.contract_hour_allocations cha
             WHERE cha.adds_to_allocation_id IN (
                     SELECT id FROM public.contract_hour_allocations
                      WHERE contrato_id = v_contrato_id
                   )
        )
        SELECT SUM(ea.allocated_hours)
                 - COALESCE(SUM(CASE WHEN chl.status = 'reservada'
                                     THEN chl.hours END), 0)
                 - COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada')
                                     THEN chl.hours END), 0)
          INTO v_available
          FROM effective_allocations ea
          JOIN public.hour_types ht ON ht.id = ea.hour_type_id
          LEFT JOIN public.contract_hours_ledger chl
                 ON chl.allocation_id = ea.id
                AND chl.status IN ('reservada', 'consumida', 'penalizada')
         WHERE ht.key = v_hour_type_key
         GROUP BY ht.key;

        -- createReservation compares the new hours against an availability figure
        -- that does not yet contain them (hour-tracking.ts:245-330). Here THIS row's
        -- current reservation is already inside the bucket's reserved_hours, so it is
        -- added back before the comparison — the same rule, not a parallel one.
        -- No bucket (no allocation for this contract + hour type) → flag left as it
        -- was, mirroring createReservation's `budgetInfo ? … : false` fallback.
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
  'Z2-3a (plan §11): atomically recompute contract_hours_ledger.hours + planned_minutes_snapshot + session_date and append one revision row (action ''edited'', details.event_type ''hours_revised'') for a pre-execution reschedule. Refuses en_progreso/pendiente_informe/completada/cancelada and any non-reservada ledger row. Never yields hours <= 0. Service-role only. Called by public.apply_session_reschedule (r21), which wraps it together with the source-schedule UPDATE in one transaction.';


-- -----------------------------------------------------------------------------
-- 2. Grants — REVOKE then narrow GRANT, per 20260731120000_zoom_provision_rpcs.sql.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.reschedule_session_hours(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reschedule_session_hours(uuid, uuid)
  TO service_role;
