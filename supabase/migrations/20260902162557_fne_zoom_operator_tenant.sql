-- =============================================================================
-- fne_zoom_operator_tenant
-- FNE Zoom internal testing plan — Unit A: schema-only foundation for the
-- operator tenant (schools.tenant_kind, an insertion-only testing switch, and
-- two database guards on consultor_sessions and contract_hours_ledger)
-- =============================================================================
--
-- UNIT. This is Unit A of the FNE-ZOOM-INTERNAL-TEST plan: the database
-- foundation that lets Fundación Nueva Educación run Genera against itself
-- (the "operator" tenant) to exercise the Zoom integration internally, without
-- that activity ever being mistaken for client delivery. It is schema-only:
-- no application code ships in this unit, no row is classified, no school is
-- touched. Unit B (application code) builds on the objects created here.
--
-- INVARIANT ENFORCED, at the database boundary, for every writer. A school
-- whose tenant_kind is 'operator' can never carry contract, hour-type or
-- session-program classification on its sessions, and no contract-hours
-- ledger row can ever point at one of its sessions. Concretely, for a
-- public.consultor_sessions row whose school is an operator tenant:
--
--   * contrato_id            must be NULL
--   * hour_type_key          must be NULL
--   * program_enrollment_id  must be NULL
--
-- and for public.contract_hours_ledger, session_id must never resolve to an
-- operator-tenant session. In addition, a NEW operator session can only be
-- created while schools.internal_zoom_testing_enabled is true for that
-- school. Sessions of 'client' and 'qa' tenants pass through both guards
-- untouched; nothing about their behaviour changes.
--
-- THE TWO COLUMNS ON public.schools.
--
--   tenant_kind text NOT NULL DEFAULT 'client', restricted to
--   ('client', 'operator', 'qa') by schools_tenant_kind_check, a constraint
--   validated against every existing row when it is added (not deferred):
--     client   — real client-school delivery; may use contracts; included in
--                official reporting.
--     operator — FNE operating Genera; forbidden from any financial or
--                session-program classification; excluded from official
--                reporting.
--     qa       — synthetic/test tenant; excluded from official reporting but
--                allowed to exercise contract and ledger behaviour.
--
--   internal_zoom_testing_enabled boolean NOT NULL DEFAULT false: an
--   INSERTION-ONLY database switch for creating NEW operator sessions. It is
--   checked on INSERT and only on INSERT, so switching it off later never
--   blocks the lifecycle of an operator session that already exists (approve,
--   finalise, cancel, reschedule). It does not reclassify history, and it is
--   not a Zoom provisioning or cleanup gate — those remain application
--   concerns.
--
-- WHY TWO TRIGGERS. The invariant has two independent entry points:
--
--   1. trg_enforce_operator_session_tenant_guard on public.consultor_sessions
--      (BEFORE INSERT OR UPDATE OF school_id, contrato_id, hour_type_key,
--      program_enrollment_id). It fires when a session is created, when it is
--      moved to another school, or when any of the three classification
--      columns is written, so an operator session cannot be created with — or
--      later acquire — a contract, an hour type or a program enrollment, and
--      a classified client session cannot be re-pointed at an operator school.
--
--   2. trg_enforce_operator_ledger_guard on public.contract_hours_ledger
--      (BEFORE INSERT OR UPDATE OF session_id, allocation_id). The ledger
--      references sessions through its own foreign key, independently of the
--      session's classification columns, so guard 1 alone cannot stop a ledger
--      row from being attached to an operator session. session_id and
--      allocation_id are independent foreign keys: the exposed roles cannot
--      update either today (their UPDATE privilege is column-scoped and
--      excludes both — migrations 20260813120800 / 20260813120900), but the
--      table owner and other privileged writers can, and none of them may
--      associate an operator session with a contract's allocation. Hence the
--      allocation_id event is mandatory, not decorative.
--
-- DESIGN: SECURITY INVOKER, EMPTY search_path, FAIL CLOSED. Both trigger
-- functions run with the rights of the role performing the write — never with
-- the owner's rights — and with search_path set to '' so every object they
-- name is schema-qualified and cannot be shadowed. Because they run as the
-- invoker, the lookup that classifies the tenant is subject to row level
-- security exactly as the invoker is: a schools row (or session row) that a
-- policy hides from the invoker, or a school_id / session_id that does not
-- exist, yields no row. An unclassifiable tenant must never pass, so both
-- functions raise on NOT FOUND rather than defaulting to "client". Deliberate
-- consequence: a non-existent school_id (or session_id) now fails with the
-- guard's 23514 (check_violation) before the foreign key's 23503 would have
-- fired. Every exception carries a constant, deterministic message with no
-- interpolated ids, names or emails.
--
-- ADDITIVITY AND RERUNNABILITY. Strictly additive: ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, and catalog-guarded DO blocks (pg_constraint /
-- pg_trigger existence checks) around the constraint and the two triggers, so
-- re-applying the file is a no-op. Nothing is removed, no existing object is
-- altered destructively, the row-security posture of the three tables is
-- unchanged (they keep exactly the row level security they have), no
-- row-security policy is added or modified, no privilege changes, no table or
-- index is created, and no row is inserted or updated.
--
-- DEPLOYMENT ORDER. The deployed application code neither reads nor writes
-- tenant_kind or internal_zoom_testing_enabled, so this migration is safe to
-- apply before Unit B ships. It classifies NO school: every existing row
-- defaults to tenant_kind = 'client' with internal_zoom_testing_enabled =
-- false, which is exactly today's behaviour. Marking a real school as
-- 'operator' or 'qa' is a separate, explicitly authorised operation that this
-- file deliberately does not perform and does not guard.
--
-- ROLLBACK is forward-only, as always in this repository. To stop NEW operator
-- sessions, set internal_zoom_testing_enabled = false on the operator school;
-- retiring an operator tenant entirely is a separately authorised
-- reclassification. Both guards are inert for client and qa tenants, so
-- leaving them in place costs nothing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tenant classification columns on public.schools (additive, rerunnable)
-- -----------------------------------------------------------------------------

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS tenant_kind text NOT NULL DEFAULT 'client';

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS internal_zoom_testing_enabled boolean NOT NULL DEFAULT false;

-- The allowed values. Guarded by a pg_constraint existence check (Postgres has
-- no ADD CONSTRAINT IF NOT EXISTS) so re-application is a no-op. Validated
-- against every existing row on purpose: all of them default to 'client', and
-- an unclassified school must not be able to exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'schools_tenant_kind_check'
      AND conrelid = 'public.schools'::regclass
      AND contype = 'c'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_tenant_kind_check
      CHECK (tenant_kind IN ('client', 'operator', 'qa'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.schools.tenant_kind IS
  'Tenant classification of this school. client = real client-school delivery: may use contracts, hour types and program enrollments on its sessions, and is included in official reporting. operator = Fundación Nueva Educación operating Genera against itself (internal Zoom testing): forbidden from any financial or session-program classification and excluded from official reporting. qa = synthetic/test tenant: excluded from official reporting but allowed to exercise contract and ledger behaviour. Every pre-existing row defaults to client, and the migration that introduced this column classified no school.';

COMMENT ON COLUMN public.schools.internal_zoom_testing_enabled IS
  'An insertion-only database switch for creating NEW consultor_sessions rows under an operator tenant: trg_enforce_operator_session_tenant_guard checks it on INSERT and only on INSERT. It never reclassifies history, it does not block lifecycle updates to operator sessions that already exist when switched off, and it is not a Zoom provisioning or cleanup gate. It has no effect for client and qa tenants.';

COMMENT ON CONSTRAINT schools_tenant_kind_check ON public.schools IS
  'tenant_kind must be exactly one of client, operator or qa. Added as a constraint validated against every existing row, so every row, historical or new, carries a known classification.';

-- -----------------------------------------------------------------------------
-- 2. Session guard: an operator tenant carries no contract / hour-type /
--    program classification, and a NEW operator session needs the switch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_operator_session_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tenant_kind     text;
  v_testing_enabled boolean;
BEGIN
  -- Classify the tenant of the school this row points at. SECURITY INVOKER
  -- means this SELECT runs under the invoker's row level security, so a
  -- schools row the invoker cannot see behaves exactly like one that does
  -- not exist: no row comes back.
  SELECT s.tenant_kind, s.internal_zoom_testing_enabled
    INTO v_tenant_kind, v_testing_enabled
    FROM public.schools s
   WHERE s.id = NEW.school_id;

  -- FAIL CLOSED. An unclassifiable tenant must never pass. Deliberate
  -- consequence: a school_id that does not exist now fails here with 23514
  -- before the foreign key (consultor_sessions_school_id_fkey) would have
  -- raised 23503.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator tenant guard: consultor_sessions.school_id could not be resolved to a tenant classification'
      USING ERRCODE = '23514';
  END IF;

  IF v_tenant_kind = 'operator' THEN
    -- The switch is INSERTION-ONLY: checked for INSERT and never for UPDATE,
    -- so switching it off later never blocks the lifecycle of an operator
    -- session that already exists. (The column is NOT NULL, so the boolean
    -- is never NULL here.)
    IF TG_OP = 'INSERT' AND NOT v_testing_enabled THEN
      RAISE EXCEPTION 'operator tenant guard: internal Zoom testing is disabled for this operator school; new operator sessions are refused'
        USING ERRCODE = '23514';
    END IF;

    -- Each classification column is checked independently, in this order,
    -- with its own constant message.
    IF NEW.contrato_id IS NOT NULL THEN
      RAISE EXCEPTION 'operator tenant guard: consultor_sessions.contrato_id must be NULL for an operator tenant'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.hour_type_key IS NOT NULL THEN
      RAISE EXCEPTION 'operator tenant guard: consultor_sessions.hour_type_key must be NULL for an operator tenant'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.program_enrollment_id IS NOT NULL THEN
      RAISE EXCEPTION 'operator tenant guard: consultor_sessions.program_enrollment_id must be NULL for an operator tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- client and qa tenants, and compliant operator rows, pass through untouched.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_operator_session_tenant_guard() IS
  'Operator tenant guard for public.consultor_sessions (FNE Zoom internal testing, Unit A). Resolves the tenant classification of NEW.school_id and, for an operator tenant, refuses a NEW session while schools.internal_zoom_testing_enabled is false (the switch is insertion-only: it is checked for INSERT and never for UPDATE, so later lifecycle changes to an existing operator session are never blocked by it) and refuses any row whose contrato_id, hour_type_key or program_enrollment_id is not NULL. client and qa tenants pass through untouched. SECURITY INVOKER with an empty search_path, so the lookup runs with the invoker rights and under the invoker row level security, and it fails closed: a school the invoker cannot see, or one that does not exist, raises 23514 rather than being treated as a client. Every message is constant and carries no ids, names or emails.';

-- Created additively, guarded on pg_trigger so a re-run is a no-op. The
-- behaviour lives in the function above (CREATE OR REPLACE), so the trigger
-- itself never needs to be recreated to change what it does.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgname = 'trg_enforce_operator_session_tenant_guard'
      AND tgrelid = 'public.consultor_sessions'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_operator_session_tenant_guard
      BEFORE INSERT OR UPDATE OF school_id, contrato_id, hour_type_key, program_enrollment_id
      ON public.consultor_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_operator_session_tenant_guard();
  END IF;
END;
$$;

COMMENT ON TRIGGER trg_enforce_operator_session_tenant_guard ON public.consultor_sessions IS
  'Fires BEFORE INSERT and BEFORE UPDATE OF school_id, contrato_id, hour_type_key, program_enrollment_id, so an operator session can neither be created with nor later acquire a contract, hour type or program enrollment, a classified session cannot be re-pointed at an operator school, and a NEW operator session requires schools.internal_zoom_testing_enabled. The logic lives in public.enforce_operator_session_tenant_guard().';

-- -----------------------------------------------------------------------------
-- 3. Ledger guard: no contract-hours ledger row may reference an operator
--    tenant session
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_operator_ledger_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tenant_kind text;
BEGIN
  -- A manual ledger row carries no session and is outside this invariant.
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the tenant of the session's school under the invoker's row level
  -- security (SECURITY INVOKER). Only tenant_kind is read: this function
  -- neither reads nor writes any other ledger column.
  SELECT sc.tenant_kind
    INTO v_tenant_kind
    FROM public.consultor_sessions cs
    JOIN public.schools sc ON sc.id = cs.school_id
   WHERE cs.id = NEW.session_id;

  -- FAIL CLOSED, same reasoning as the session guard: a session the invoker
  -- cannot see, or one that does not exist, cannot be classified and must not
  -- pass. Deliberate consequence: a non-existent session_id now fails here
  -- with 23514 before contract_hours_ledger_session_id_fkey would have raised
  -- 23503.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator ledger guard: contract_hours_ledger.session_id could not be resolved to a tenant classification'
      USING ERRCODE = '23514';
  END IF;

  IF v_tenant_kind = 'operator' THEN
    RAISE EXCEPTION 'operator ledger guard: contract_hours_ledger rows may not reference a session of an operator tenant'
      USING ERRCODE = '23514';
  END IF;

  -- client and qa tenant sessions pass through untouched.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_operator_ledger_guard() IS
  'Operator ledger guard for public.contract_hours_ledger (FNE Zoom internal testing, Unit A). A ledger row with session_id NULL (manual entry) is outside the invariant and passes. Otherwise the session is joined to its school and, if that school is an operator tenant, the row is refused: operator activity must never produce contract-hours ledger state. SECURITY INVOKER with an empty search_path, failing closed with 23514 when the session cannot be resolved (hidden from the invoker by row level security, or non-existent). The trigger that calls this fires on UPDATE OF allocation_id as well as session_id because they are independent foreign keys: exposed roles cannot update either today, but the table owner and other privileged writers can, and a service-role or owner writer must not be able to associate an operator session with another contract allocation. It reads no other ledger column.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgname = 'trg_enforce_operator_ledger_guard'
      AND tgrelid = 'public.contract_hours_ledger'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_operator_ledger_guard
      BEFORE INSERT OR UPDATE OF session_id, allocation_id
      ON public.contract_hours_ledger
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_operator_ledger_guard();
  END IF;
END;
$$;

COMMENT ON TRIGGER trg_enforce_operator_ledger_guard ON public.contract_hours_ledger IS
  'Fires BEFORE INSERT and BEFORE UPDATE OF session_id, allocation_id so no contract-hours ledger row can be created for, or re-associated with, a session of an operator tenant. The logic lives in public.enforce_operator_ledger_guard().';
