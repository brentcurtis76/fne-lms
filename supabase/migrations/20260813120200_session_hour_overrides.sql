-- =============================================================================
-- 20260813120200_session_hour_overrides.sql — Z7-4: the §11 override machinery.
--
-- INVARIANT (plan §11): the amount discounted from the contract = the planned/
-- approved duration. Zoom execution data is comparison/audit only and can NEVER
-- automatically change billed hours. The ONLY path that adjusts a finalized
-- session's billable time is the admin-session-gated RPC below — it derives its
-- actor from auth.uid() INSIDE the function, aborts when that is NULL (which
-- closes the service-role/jobs path structurally), and has no service-side caller.
--
-- ADDITIVE ONLY: one table, one trigger, one nullable ledger column, one RPC, and
-- a CREATE OR REPLACE of get_bucket_summary at its identical signature (the
-- repo-approved mechanism — 20260809120000 — preserving grants and return shape).
-- The existing `hours > 0` CHECK is never touched: `hours` keeps the original
-- reserved value as historical evidence, and billable time is read as
-- round(effective_minutes/60.0, 2) when set, else `hours` (§11 zero-waiver model).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. contract_hours_ledger.effective_minutes — the additive zero-waiver column.
-- -----------------------------------------------------------------------------

ALTER TABLE public.contract_hours_ledger
  ADD COLUMN effective_minutes integer
  CONSTRAINT contract_hours_ledger_effective_minutes_check CHECK (effective_minutes >= 0);

COMMENT ON COLUMN public.contract_hours_ledger.effective_minutes IS
  'Admin-overridden billable minutes (§11). NULL = no override, the planned value (hours) governs. 0 is a full waiver ("Sesión eximida"). Written ONLY by apply_session_hour_override; every consumer reads billable time as round(effective_minutes/60.0, 2) when set, else hours (lib/services/billable-hours.ts, get_bucket_summary).';

-- -----------------------------------------------------------------------------
-- 2. public.session_hour_overrides — the append-only audit trail.
--
-- One row per override EVENT (apply or reversal); rows are immutable at the
-- database level (trigger below), so history is never erased — reversal writes a
-- NEW row that points at what it reverses.
-- -----------------------------------------------------------------------------

CREATE TABLE public.session_hour_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- §6 invariant: every public row is school-scoped.
    school_id integer NOT NULL REFERENCES public.schools(id),
    session_id uuid NOT NULL REFERENCES public.consultor_sessions(id),
    ledger_id uuid NOT NULL REFERENCES public.contract_hours_ledger(id),
    -- The DB-owned total order of the chain. "Latest unreversed" is decided on
    -- this, never on created_at, which can tie.
    seq bigint GENERATED ALWAYS AS IDENTITY,
    -- The ledger's effective_minutes BEFORE this event. NULL = the planned value
    -- governed. Reversal restores exactly this value (§11 v2.1.2).
    previous_minutes integer,
    -- The value this event set. NULL only on a reversal restoring "no override".
    new_minutes integer,
    planned_minutes_snapshot integer,
    reason text NOT NULL CHECK (btrim(reason) <> ''),
    reason_category text NOT NULL CHECK (reason_category IN
      ('consultant_shortfall', 'school_request', 'technical_failure', 'other')),
    -- The caller hash is retained as audit evidence, but PostgreSQL owns replay
    -- equality through request_payload below; the caller cannot forge equivalence.
    request_id text NOT NULL UNIQUE,
    payload_hash text NOT NULL,
    request_payload jsonb NOT NULL,
    -- The admin, bound to auth.uid() inside the RPC — never caller-supplied.
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Set on a reversal row. UNIQUE: an override can be reversed at most once, at
    -- the database rather than by convention.
    reverses_override_id uuid UNIQUE REFERENCES public.session_hour_overrides(id),
    -- An APPLY always carries a value >= 0 (0 = zero waiver); only a reversal may
    -- restore NULL.
    CONSTRAINT session_hour_overrides_new_minutes_shape CHECK (
      (reverses_override_id IS NOT NULL AND (new_minutes IS NULL OR new_minutes >= 0))
      OR (reverses_override_id IS NULL AND new_minutes >= 0)
    )
);

CREATE INDEX session_hour_overrides_ledger_idx
  ON public.session_hour_overrides (ledger_id, seq DESC);
CREATE INDEX session_hour_overrides_session_idx
  ON public.session_hour_overrides (session_id);

COMMENT ON TABLE public.session_hour_overrides IS
  'Append-only audit of §11 admin hour overrides: one immutable row per apply/reversal event. The ledger''s effective_minutes holds the CURRENT value; this table holds how it got there. Writes only via apply_session_hour_override (admin auth.uid() inside); UPDATE/DELETE refused by trigger.';

-- Append-only BY TRIGGER, not by convention (§11).
CREATE OR REPLACE FUNCTION public.session_hour_overrides_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'session_hour_overrides is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'P0001';
END
$$;

CREATE TRIGGER session_hour_overrides_no_update_delete
  BEFORE UPDATE OR DELETE ON public.session_hour_overrides
  FOR EACH ROW EXECUTE FUNCTION public.session_hour_overrides_immutable();

-- RLS: §7 matrix row — admin SELECT only; nobody else reads, nobody writes from a
-- session (the RPC is SECURITY DEFINER and inserts as the function owner).
ALTER TABLE public.session_hour_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_hour_overrides_admin_select" ON public.session_hour_overrides
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_roles.user_id = auth.uid()
       AND user_roles.role_type = 'admin'::public.user_role_type
       AND user_roles.is_active = true
  ));

-- -----------------------------------------------------------------------------
-- 3. The single transactional apply/reverse RPC.
--
-- SECURITY DEFINER + SET search_path = '' + REVOKE-then-narrow-GRANT, following
-- 20260805120000_reschedule_hours_rpc.sql. EXECUTE is granted to `authenticated`
-- — authorization happens INSIDE via the auth.uid() admin check — and revoked
-- from anon and service_role's PUBLIC grant; the function aborts on a NULL
-- auth.uid(), so the service-role/jobs path is closed structurally, not by
-- convention (§11: the override RPC has no service-side caller).
--
-- Error taxonomy (SQLSTATE → route mapping):
--   P0403 — caller is not an active admin (or auth.uid() is NULL)   → 403
--   P0404 — session or ledger entry not found                       → 404
--   P0400 — input validation (minutes, reason, category)            → 400
--   P0409 — state conflicts: tamper on request_id, not-consumida,
--           reversal-integrity violations, cross-tenant mismatch    → 409
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_session_hour_override(
    p_session_id uuid,
    p_new_minutes integer,
    p_reason text,
    p_reason_category text,
    p_request_id text,
    p_payload_hash text,
    p_reverses_override_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor uuid;
    v_existing public.session_hour_overrides%ROWTYPE;
    v_target public.session_hour_overrides%ROWTYPE;
    v_latest_id uuid;
    v_school_id integer;
    v_contrato_id uuid;
    v_ledger_id uuid;
    v_ledger_status text;
    v_ledger_effective integer;
    v_planned_snapshot integer;
    v_alloc_contrato uuid;
    v_cliente_school integer;
    v_next_effective integer;
    v_override_id uuid;
    v_request_payload jsonb;
BEGIN
    -- Actor bound to the authenticated identity, INSIDE the function (§11 v2.1.1).
    v_actor := auth.uid();
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Solo una sesión de administrador autenticada puede ajustar horas'
            USING ERRCODE = 'P0403';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = v_actor
           AND ur.role_type = 'admin'::public.user_role_type
           AND ur.is_active = true
    ) THEN
        RAISE EXCEPTION 'Solo un administrador puede ajustar horas descontadas'
            USING ERRCODE = 'P0403';
    END IF;

    IF p_request_id IS NULL OR btrim(p_request_id) = ''
       OR p_payload_hash IS NULL OR btrim(p_payload_hash) = '' THEN
        RAISE EXCEPTION 'request_id y payload_hash son obligatorios'
            USING ERRCODE = 'P0400';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'El motivo del ajuste es obligatorio'
            USING ERRCODE = 'P0400';
    END IF;
    IF p_reason_category IS NULL OR p_reason_category NOT IN
       ('consultant_shortfall', 'school_request', 'technical_failure', 'other') THEN
        RAISE EXCEPTION 'Categoría de motivo inválida'
            USING ERRCODE = 'P0400';
    END IF;
    -- Canonical normalized intent, derived INSIDE PostgreSQL. `p_payload_hash` is
    -- never a security boundary: a caller may forge or reuse it, while jsonb
    -- equality below compares every operation field under the request-id lock.
    v_request_payload := jsonb_build_object(
      'session_id', p_session_id,
      'new_minutes', p_new_minutes,
      'reason', btrim(p_reason),
      'reason_category', p_reason_category,
      'reverses_override_id', p_reverses_override_id
    );

    -- Serialize ownership of the idempotency key BEFORE checking it (Z7-R7).
    -- The old precheck ran before the session/ledger row locks, so two transactions
    -- could both see no row and the loser surfaced the UNIQUE constraint as 23505.
    -- A hash collision only serializes unrelated requests; it cannot merge them,
    -- because exact canonical-payload equality below still decides replay.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_request_id, 0)
    );

    -- Idempotency with tamper detection (§11): the same request replayed is a
    -- no-op that answers with the original event; the same id with a DIFFERENT
    -- payload is refused. This check now runs while this transaction owns the
    -- request-id advisory lock, so concurrent callers observe the same contract.
    SELECT * INTO v_existing
      FROM public.session_hour_overrides
     WHERE request_id = p_request_id;
    IF FOUND THEN
        IF v_existing.request_payload = v_request_payload THEN
            RETURN jsonb_build_object(
                'applied', false,
                'replay', true,
                'override_id', v_existing.id,
                'previous_minutes', v_existing.previous_minutes,
                'new_minutes', v_existing.new_minutes
            );
        END IF;
        RAISE EXCEPTION 'request_id ya utilizado con un contenido distinto'
            USING ERRCODE = 'P0409';
    END IF;

    IF p_reverses_override_id IS NOT NULL AND p_new_minutes IS NOT NULL THEN
        RAISE EXCEPTION 'Una reversión no acepta minutos'
            USING ERRCODE = 'P0400';
    END IF;

    -- Lock the session, then its ledger row: every chain mutation serialises on
    -- the ledger row, so two concurrent applies (or an apply racing a reversal)
    -- cannot interleave between read and write.
    SELECT s.school_id, s.contrato_id
      INTO v_school_id, v_contrato_id
      FROM public.consultor_sessions s
     WHERE s.id = p_session_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesión no encontrada: %', p_session_id
            USING ERRCODE = 'P0404';
    END IF;

    SELECT l.id, l.status, l.effective_minutes, l.planned_minutes_snapshot
      INTO v_ledger_id, v_ledger_status, v_ledger_effective, v_planned_snapshot
      FROM public.contract_hours_ledger l
     WHERE l.session_id = p_session_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La sesión no tiene una entrada en el libro de horas'
            USING ERRCODE = 'P0404';
    END IF;

    -- §11 override × cancellation: overrides are valid only against consumida
    -- (post-finalize) entries. Cancellation clauses are a fully separate flow.
    IF v_ledger_status <> 'consumida' THEN
        RAISE EXCEPTION
            'Solo una sesión finalizada (consumida) admite ajuste de horas; estado actual: %',
            v_ledger_status
            USING ERRCODE = 'P0409';
    END IF;

    -- Cross-tenant validation (§11): the ledger's allocation must belong to the
    -- SESSION's own contract, and that contract's client — when school-linked —
    -- must be the session's school. Any mismatch aborts before anything is written.
    SELECT cha.contrato_id, cl.school_id
      INTO v_alloc_contrato, v_cliente_school
      FROM public.contract_hours_ledger l
      JOIN public.contract_hour_allocations cha ON cha.id = l.allocation_id
      JOIN public.contratos c ON c.id = cha.contrato_id
      LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
     WHERE l.id = v_ledger_id;
    IF v_alloc_contrato IS DISTINCT FROM v_contrato_id
       OR (v_cliente_school IS NOT NULL AND v_cliente_school <> v_school_id) THEN
        RAISE EXCEPTION 'Los datos de sesión, contrato y colegio no coinciden'
            USING ERRCODE = 'P0409';
    END IF;

    IF p_reverses_override_id IS NULL THEN
        -- ---- APPLY -----------------------------------------------------------
        IF p_new_minutes IS NULL OR p_new_minutes < 0 THEN
            RAISE EXCEPTION
                'Los minutos ajustados deben ser un entero >= 0 (0 = sesión eximida)'
                USING ERRCODE = 'P0400';
        END IF;
        v_next_effective := p_new_minutes;
    ELSE
        -- ---- REVERSE ---------------------------------------------------------
        SELECT * INTO v_target
          FROM public.session_hour_overrides
         WHERE id = p_reverses_override_id;
        IF NOT FOUND OR v_target.ledger_id <> v_ledger_id THEN
            RAISE EXCEPTION 'El ajuste a revertir no existe para esta sesión'
                USING ERRCODE = 'P0404';
        END IF;
        IF v_target.reverses_override_id IS NOT NULL THEN
            RAISE EXCEPTION 'Una reversión no puede revertirse; aplique un nuevo ajuste'
                USING ERRCODE = 'P0409';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.session_hour_overrides r
             WHERE r.reverses_override_id = v_target.id
        ) THEN
            RAISE EXCEPTION 'Ese ajuste ya fue revertido'
                USING ERRCODE = 'P0409';
        END IF;
        -- Only the LATEST unreversed apply of the chain may be reversed (§11).
        SELECT o.id INTO v_latest_id
          FROM public.session_hour_overrides o
         WHERE o.ledger_id = v_ledger_id
           AND o.reverses_override_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.session_hour_overrides r
              WHERE r.reverses_override_id = o.id
           )
         ORDER BY o.seq DESC
         LIMIT 1;
        IF v_latest_id IS DISTINCT FROM v_target.id THEN
            RAISE EXCEPTION
                'Solo el último ajuste vigente puede revertirse'
                USING ERRCODE = 'P0409';
        END IF;
        -- §11 v2.1.2: the reversal restores the REVERSED event''s own
        -- previous_minutes — NULL only when it was the first of its chain, at
        -- which point the planned value governs again.
        v_next_effective := v_target.previous_minutes;
    END IF;

    INSERT INTO public.session_hour_overrides
      (school_id, session_id, ledger_id, previous_minutes, new_minutes,
       planned_minutes_snapshot, reason, reason_category, request_id,
       payload_hash, request_payload, created_by, reverses_override_id)
    VALUES
      (v_school_id, p_session_id, v_ledger_id, v_ledger_effective, v_next_effective,
       v_planned_snapshot, p_reason, p_reason_category, p_request_id,
       p_payload_hash, v_request_payload, v_actor, p_reverses_override_id)
    RETURNING id INTO v_override_id;

    UPDATE public.contract_hours_ledger
       SET effective_minutes = v_next_effective,
           admin_override = (v_next_effective IS NOT NULL),
           admin_override_reason = CASE WHEN v_next_effective IS NULL THEN NULL ELSE p_reason END,
           updated_at = now(),
           updated_by = v_actor
     WHERE id = v_ledger_id;

    RETURN jsonb_build_object(
        'applied', true,
        'override_id', v_override_id,
        'previous_minutes', v_ledger_effective,
        'new_minutes', v_next_effective,
        'planned_minutes_snapshot', v_planned_snapshot
    );
END
$$;

COMMENT ON FUNCTION public.apply_session_hour_override(uuid, integer, text, text, text, text, uuid) IS
  'The ONE path that adjusts a finalized session''s billable minutes (§11): apply (p_reverses_override_id NULL, p_new_minutes >= 0, 0 = zero waiver) or reverse (restores the reversed event''s previous_minutes; NULL back to planned). Actor = auth.uid() inside — NULL aborts, non-admin aborts — so no webhook, job, service client or AI process can reach it. Insert + ledger update are one transaction; request_id ownership is transaction-advisory-locked before PostgreSQL compares the canonical normalized request payload. The caller hash is audit evidence only.';

-- service_role is revoked EXPLICITLY: Supabase's default privileges grant new
-- public functions to anon/authenticated/service_role, and §11 requires the
-- override path to have NO service-side caller — the jobs/webhook path is closed
-- at the grant, before the function's own null-uid abort even runs.
REVOKE EXECUTE ON FUNCTION public.apply_session_hour_override(
  uuid, integer, text, text, text, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_session_hour_override(
  uuid, integer, text, text, text, text, uuid)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. get_bucket_summary reads the override-adjusted value (§11: "a single
-- adjusted value flows to both consumption and payment"; required test "override
-- 60→45 updates aggregates once").
--
-- CREATE OR REPLACE at the IDENTICAL signature — the repo-approved mechanism
-- (20260809120000): return shape, language, volatility, search_path and grants
-- all preserved. The ONLY change: the two ledger sums read
-- round(effective_minutes/60.0, 2) when set, else hours — the same coalesce
-- lib/services/billable-hours.ts applies, with the same §11 "one rounding rule"
-- (calculateHours: minutes/60, two decimals, half-up). effective_minutes is only
-- ever written on consumida rows, so the reservada sum is unchanged in practice;
-- the uniform rule means there is exactly ONE formula to read.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_bucket_summary(p_contrato_id uuid)
RETURNS TABLE(
  hour_type_key text,
  display_name text,
  allocated_hours numeric,
  reserved_hours numeric,
  consumed_hours numeric,
  available_hours numeric,
  is_fixed_allocation boolean,
  annex_hours numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH effective_allocations AS (
    -- Direct allocations for this contract
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation,
           false AS is_annex
    FROM contract_hour_allocations cha
    WHERE cha.contrato_id = p_contrato_id

    UNION ALL

    -- Annex allocations that add hours to this contract's buckets
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation,
           true AS is_annex
    FROM contract_hour_allocations cha
    WHERE cha.adds_to_allocation_id IN (
      SELECT id FROM contract_hour_allocations
      WHERE contrato_id = p_contrato_id
    )
  ),
  -- One row per hour type, over ALLOCATIONS ONLY. The ledger is not in scope
  -- here, so nothing can multiply these sums.
  allocation_totals AS (
    SELECT
      ea.hour_type_id,
      SUM(ea.allocated_hours) AS allocated_hours,
      BOOL_OR(ea.is_fixed_allocation) AS is_fixed_allocation,
      COALESCE(SUM(ea.allocated_hours) FILTER (WHERE ea.is_annex), 0) AS annex_hours
    FROM effective_allocations ea
    GROUP BY ea.hour_type_id
  ),
  -- One row per hour type, over the LEDGER ONLY. Each ledger row is counted
  -- exactly once. Billable time per row is the §11 coalesce: the admin-adjusted
  -- effective_minutes when set (0 = full waiver returns the hours to
  -- availability), else the reserved hours.
  ledger_totals AS (
    SELECT
      ea.hour_type_id,
      COALESCE(SUM(
        COALESCE(round(chl.effective_minutes::numeric / 60, 2), chl.hours)
      ) FILTER (WHERE chl.status = 'reservada'), 0) AS reserved_hours,
      COALESCE(SUM(
        COALESCE(round(chl.effective_minutes::numeric / 60, 2), chl.hours)
      ) FILTER (WHERE chl.status IN ('consumida', 'penalizada')), 0) AS consumed_hours
    FROM effective_allocations ea
    JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
      AND chl.status IN ('reservada', 'consumida', 'penalizada')
    GROUP BY ea.hour_type_id
  )
  SELECT
    ht.key AS hour_type_key,
    ht.display_name,
    alloc.allocated_hours,
    COALESCE(led.reserved_hours, 0) AS reserved_hours,
    COALESCE(led.consumed_hours, 0) AS consumed_hours,
    alloc.allocated_hours
      - COALESCE(led.reserved_hours, 0)
      - COALESCE(led.consumed_hours, 0)
    AS available_hours,
    alloc.is_fixed_allocation,
    alloc.annex_hours
  FROM allocation_totals alloc
  JOIN hour_types ht ON ht.id = alloc.hour_type_id
  LEFT JOIN ledger_totals led ON led.hour_type_id = alloc.hour_type_id
  ORDER BY ht.sort_order;
$$;

-- -----------------------------------------------------------------------------
-- 5. Consultant payment reads the SAME override-adjusted value (Z7-R1).
--
-- The baseline RPC still summed `chl.hours`, so an override reduced school
-- consumption while continuing to pay/report the historical planned amount.
-- Replace at the IDENTICAL signature and return shape. CREATE OR REPLACE preserves
-- the existing anon/authenticated/service_role grants and owner; `hours` remains
-- available as historical evidence but is no longer the billable derivation.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_consultant_earnings(
  p_consultant_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE(
  hour_type_key text,
  display_name text,
  total_hours numeric,
  rate_eur numeric,
  total_eur numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH billable AS (
    SELECT
      ht.key AS hour_type_key,
      ht.display_name,
      ht.sort_order,
      cr.rate_eur,
      COALESCE(round(chl.effective_minutes::numeric / 60, 2), chl.hours) AS hours
    FROM public.contract_hours_ledger chl
    JOIN public.consultor_sessions cs ON cs.id = chl.session_id
    JOIN public.session_facilitators sf ON sf.session_id = cs.id
      AND sf.user_id = p_consultant_id
    JOIN public.contract_hour_allocations cha ON cha.id = chl.allocation_id
    JOIN public.hour_types ht ON ht.id = cha.hour_type_id
    LEFT JOIN public.consultant_rates cr ON cr.consultant_id = p_consultant_id
      AND cr.hour_type_id = cha.hour_type_id
      AND chl.session_date >= cr.effective_from
      AND (cr.effective_to IS NULL OR chl.session_date < cr.effective_to)
    WHERE chl.session_date BETWEEN p_from AND p_to
      AND chl.status IN ('consumida', 'penalizada')
  )
  SELECT
    billable.hour_type_key,
    billable.display_name,
    SUM(billable.hours) AS total_hours,
    billable.rate_eur,
    SUM(billable.hours) * billable.rate_eur AS total_eur
  FROM billable
  GROUP BY billable.hour_type_key, billable.display_name,
           billable.rate_eur, billable.sort_order
  ORDER BY billable.sort_order;
$$;

COMMENT ON FUNCTION public.get_consultant_earnings(uuid, date, date) IS
  'Returns consultant earnings by hour type/rate using the canonical §11 billable value: round(effective_minutes/60.0, 2) when adjusted, otherwise historical hours. NULL rate_eur means no rate is configured.';
