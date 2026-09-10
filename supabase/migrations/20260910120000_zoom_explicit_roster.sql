-- =============================================================================
-- zoom_explicit_roster
-- FNE Zoom internal testing plan — Unit B2a: database foundation for the
-- explicit operator participant roster (two service_role roster RPCs, an
-- operator approval gate on consultor_sessions, and the operator exclusion in
-- the growth-community membership trigger)
-- =============================================================================
--
-- UNIT. B2a is the database half of Unit B's roster work (plan §4.1 "approval
-- of an operator session requires at least one expected attendee", §4.5
-- "explicit participant roster"). It ships no route and no UI: B2b consumes the
-- two RPCs from pages/api/sessions/[id]/attendees.ts (POST/DELETE) and fixes
-- the notification consumers, B3 supplies the roster UI. Until B2b ships, no
-- application code calls anything created here.
--
-- WHAT IS ENFORCED, AND WHAT IS DELIBERATELY NOT.
--
--   1. APPROVAL-TIME RULE (trigger trg_enforce_operator_roster_approval_gate).
--      Every write that moves an OPERATOR-tenant session INTO 'programada' —
--      a single UPDATE, a multi-row UPDATE, or an INSERT that is already
--      'programada' — and every write that moves a 'programada' session into
--      another school or growth community (PUT /api/sessions/[id] writes
--      school_id, growth_community_id and status), needs, at the serialization
--      point and in the NEW context, at least one ELIGIBLE attendee: a
--      session_attendees row with expected = true whose user holds an active
--      (is_active IS TRUE) user_roles row in the session's exact growth
--      community. A refused row aborts its whole statement, so a multi-session
--      UPDATE is all-or-nothing. client and qa tenants (by the NEW school),
--      writes that leave or keep a status other than 'programada', and
--      rewrites of a scheduled row with the same school and community
--      (same-value or metadata-only edits) pass untouched.
--
--   2. INTENTIONAL-REMOVAL PROTECTION (session_roster_remove_attendees). The
--      new removal RPC refuses to remove the last eligible attendee of a
--      'programada' operator session.
--
--   NOT a permanent non-empty-roster invariant. Membership revocation (the
--   user_roles trigger below) still sets expected = false even for the last
--   participant of a scheduled operator session, and nothing here can refuse
--   or roll it back. Direct DML on session_attendees is not intercepted either.
--   A roster emptied that way simply cannot be scheduled again (for example by
--   a later transition back into 'programada', or a move into another school
--   or community) until an eligible attendee is selected, while same-context
--   edits of the still-scheduled session keep working.
--
--   3. OPERATOR ROSTER STAYS EXPLICIT (sync_session_attendees_on_gc_change).
--      A new growth-community membership no longer auto-adds the member to
--      operator-tenant sessions. client and qa sessions are populated exactly
--      as before, and the revocation branch is unchanged for every tenant.
--
-- LOCKING PROTOCOL (the serialization point).
--
--   * Both RPCs first take the parent consultor_sessions row FOR NO KEY UPDATE.
--     That mode conflicts with the row lock an UPDATE of status takes, but not
--     with the FOR KEY SHARE lock foreign-key checks take, so child inserts
--     (attendees, notifications, activity log) are never blocked by it.
--   * An approval or context-change UPDATE therefore waits for an in-flight
--     roster RPC on the same session (and vice versa). The gate runs in a BEFORE ROW trigger,
--     after the row is locked; its queries take a fresh READ COMMITTED
--     statement snapshot, so a removal that committed while the approval was
--     waiting is visible to it. The removal RPC re-reads status under its lock,
--     so an approval that committed while the RPC waited is visible to it.
--   * The gate additionally pins one eligible attendee row and its user_roles
--     row FOR SHARE ... SKIP LOCKED. A pinned membership cannot be revoked (and
--     a pinned attendee cannot be deleted) until the approval commits, after
--     which the revocation sees the session as 'programada' and expires the
--     attendee as usual. SKIP LOCKED means the gate never waits on attendee or
--     membership rows: if every eligible row is locked by a concurrent writer
--     the approval fails with 55P03 (retry), and if none exists it fails with
--     23514. The gate never holds a lock a revocation needs while waiting for
--     one the revocation holds, so it cannot deadlock a revocation.
--   * The add RPC locks the members it validates (user_roles FOR SHARE NOWAIT)
--     and both RPCs lock the target attendee rows NOWAIT, in id order, before
--     any write. A concurrent revocation or attendance write on those rows
--     turns into the structural refusal 'roster_busy' (nothing written, retry)
--     instead of a lock wait, so the RPCs never wait on a row a revocation
--     holds either. Without the membership lock, an add racing a revocation
--     could leave a revoked member expected = true.
--   * The removal RPC's "is another eligible attendee left" read is an
--     unlocked read under the session lock. Any interleaving with a concurrent
--     revocation is equivalent to removal-then-revocation, which is allowed.
--   * Direct attendee DML that does not take the parent lock is still ordered
--     by the pin: an uncommitted DELETE of the only eligible row makes the gate
--     fail 55P03 without waiting (23514 once it commits), and a DELETE issued
--     after the gate pinned the row waits for the approval to commit. Direct
--     DML after that commit is not intercepted (approval-time rule).
--   * Residual, documented: a multi-row direct DML statement on
--     session_attendees can still deadlock with another multi-row writer;
--     PostgreSQL detects it (40P01) and aborts one transaction entirely.
--   * Under REPEATABLE READ or SERIALIZABLE callers, a concurrent change the
--     snapshot cannot see surfaces as 40001 on the locked rows instead of being
--     silently ignored. PostgREST and the application use READ COMMITTED.
--
-- SECURITY.
--
--   * session_roster_add_attendees / session_roster_remove_attendees: SECURITY
--     INVOKER, search_path '', EXECUTE revoked from PUBLIC, anon and
--     authenticated and granted to service_role only. They accept an actor id
--     (for the structural audit row) that the database cannot authenticate, so
--     no exposed role may call them; the calling API owns canView/
--     canContribute. Running as the invoker means even an accidental future
--     grant would still be bound by row level security.
--   * enforce_operator_roster_approval_gate: SECURITY DEFINER, search_path '',
--     EXECUTE revoked from PUBLIC, anon and authenticated. It must see the real
--     roster whatever row level security hides from the writer; it only ever
--     raises a constant message or returns NEW, so it discloses nothing.
--   * No table, policy, row-level-security posture or table privilege changes.
--
-- RETURN CONTRACT OF THE RPCS (jsonb). Refusals return before any write:
--   {"ok": false, "reason": <code>, "session_id": <uuid|null>,
--    "session_status": <text, only for session_status_not_editable>,
--    "user_ids": [<uuid>...], only for invalid_attendees /
--                              attendance_evidence_present /
--                              last_eligible_attendee}
--   reason codes: invalid_request, too_many_attendees, invalid_actor,
--   session_not_found, session_inactive, session_status_not_editable,
--   tenant_unresolved (remove only), roster_busy, invalid_attendees (add only),
--   attendance_evidence_present, last_eligible_attendee (remove only).
--   Success (add):    {"ok": true, "reason": "ok", "session_id", "session_status",
--                      "added_user_ids", "reactivated_user_ids",
--                      "already_present_user_ids", "added_count",
--                      "reactivated_count", "already_present_count"}
--   Success (remove): {"ok": true, "reason": "ok", "session_id", "session_status",
--                      "removed_user_ids", "missing_user_ids", "removed_count",
--                      "missing_count", "cancelled_notification_count"}
--   Unexpected database errors raise (the whole call rolls back).
--
-- ADDITIVITY. CREATE OR REPLACE FUNCTION, a pg_trigger-guarded CREATE TRIGGER,
-- REVOKE/GRANT on the new functions only, COMMENT. No row is inserted, updated
-- or removed by the migration itself. Safe to apply before B2b: the current
-- approval routes approve client/qa sessions exactly as before; an operator
-- session with an empty roster is refused by the database, which is the plan's
-- rule (no operator tenant is classified by any migration).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Approval gate: an operator session enters 'programada' only with an
--    eligible expected attendee
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_operator_roster_approval_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_kind text;
  v_pinned      uuid;
BEGIN
  -- Only a transition INTO 'programada' is gated. Re-writing an already
  -- scheduled row, or any other status, passes untouched.
  -- Gated: a row that becomes 'programada', and a 'programada' row whose school
  -- or growth community changes. A scheduled row rewritten with the same
  -- status, school and community (or with neither column changed) passes, so a
  -- roster emptied later by revocation never blocks ordinary edits.
  IF NEW.status IS DISTINCT FROM 'programada' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM 'programada'
     AND OLD.school_id IS NOT DISTINCT FROM NEW.school_id
     AND OLD.growth_community_id IS NOT DISTINCT FROM NEW.growth_community_id THEN
    RETURN NEW;
  END IF;

  SELECT s.tenant_kind
    INTO v_tenant_kind
    FROM public.schools s
   WHERE s.id = NEW.school_id;

  -- Fail closed, as the Unit A tenant guard does.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator roster gate: consultor_sessions.school_id could not be resolved to a tenant classification'
      USING ERRCODE = '23514';
  END IF;

  IF v_tenant_kind IS DISTINCT FROM 'operator' THEN
    RETURN NEW;
  END IF;

  -- Pin one eligible attendee and its membership. SKIP LOCKED: never wait on
  -- attendee/membership rows (see the locking protocol in the header).
  SELECT sa.id
    INTO v_pinned
    FROM public.session_attendees sa
    JOIN public.user_roles ur
      ON ur.user_id = sa.user_id
   WHERE sa.session_id = NEW.id
     AND sa.expected IS TRUE
     AND ur.community_id = NEW.growth_community_id
     AND ur.is_active IS TRUE
   LIMIT 1
     FOR SHARE OF sa, ur SKIP LOCKED;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Nothing could be pinned. Tell "busy" apart from "empty".
  IF EXISTS (
    SELECT 1
      FROM public.session_attendees sa
      JOIN public.user_roles ur
        ON ur.user_id = sa.user_id
     WHERE sa.session_id = NEW.id
       AND sa.expected IS TRUE
       AND ur.community_id = NEW.growth_community_id
       AND ur.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'operator roster gate: the eligible roster of this operator session is being changed concurrently; retry'
      USING ERRCODE = '55P03';
  END IF;

  RAISE EXCEPTION 'operator roster gate: an operator session needs at least one expected attendee who is an active member of its growth community before it can be scheduled'
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION public.enforce_operator_roster_approval_gate() IS
  'Operator roster approval gate for public.consultor_sessions (FNE Zoom internal testing, Unit B2a). For an operator-tenant row whose status becomes programada (INSERT already programada, or UPDATE from any other status), or a programada row whose school_id or growth_community_id changes (evaluated in the NEW context), requires at least one session_attendees row with expected = true whose user has an active user_roles row in the session growth community; otherwise raises 23514, or 55P03 when every eligible row is locked by a concurrent writer. Pins one eligible attendee and membership FOR SHARE SKIP LOCKED so a concurrent revocation or deletion cannot slip in before commit, and never waits on those rows. client and qa tenants, non-transitions and same-context rewrites of a programada row pass. An approval-time and context-change rule, not a permanent roster invariant: revocation may still expire the last participant afterwards. SECURITY DEFINER with an empty search_path so the real roster is visible regardless of the writer row level security; constant messages without ids.';

REVOKE ALL ON FUNCTION public.enforce_operator_roster_approval_gate() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgname = 'trg_enforce_operator_roster_approval_gate'
      AND tgrelid = 'public.consultor_sessions'::regclass
  ) THEN
    CREATE TRIGGER trg_enforce_operator_roster_approval_gate
      BEFORE INSERT OR UPDATE OF status, school_id, growth_community_id
      ON public.consultor_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_operator_roster_approval_gate();
  END IF;
END;
$$;

COMMENT ON TRIGGER trg_enforce_operator_roster_approval_gate ON public.consultor_sessions IS
  'Fires BEFORE INSERT and BEFORE UPDATE OF status, school_id, growth_community_id, after the row lock is taken, so every write that moves an operator-tenant session into programada, or moves a programada session into another school or growth community (single, bulk or insert), is checked against the live eligible roster at the serialization point. The logic lives in public.enforce_operator_roster_approval_gate().';

-- -----------------------------------------------------------------------------
-- 2. Roster add RPC (service_role only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.session_roster_add_attendees(
  p_session_id uuid,
  p_user_ids   uuid[],
  p_actor_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_max_attendees CONSTANT integer := 200;
  v_ids         uuid[];
  v_status      text;
  v_community   uuid;
  v_active      boolean;
  v_members     uuid[];
  v_invalid     uuid[];
  v_evidence    uuid[];
  v_added       uuid[];
  v_reactivated uuid[];
  v_present     uuid[];
BEGIN
  -- Request shape: all-or-nothing, before any lock or write.
  IF p_session_id IS NULL OR p_actor_id IS NULL OR p_user_ids IS NULL
     OR pg_catalog.cardinality(p_user_ids) = 0
     OR pg_catalog.array_ndims(p_user_ids) <> 1
     OR pg_catalog.array_position(p_user_ids, NULL) IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'invalid_request', 'session_id', p_session_id);
  END IF;

  -- Deduplicated and sorted, so every lock below is taken in a stable order.
  v_ids := ARRAY(SELECT DISTINCT u FROM pg_catalog.unnest(p_user_ids) AS u ORDER BY u);

  IF pg_catalog.cardinality(v_ids) > c_max_attendees THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'too_many_attendees', 'session_id', p_session_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_actor_id) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'invalid_actor', 'session_id', p_session_id);
  END IF;

  -- Serialization point shared with approval and removal.
  SELECT cs.status, cs.growth_community_id, cs.is_active
    INTO v_status, v_community, v_active
    FROM public.consultor_sessions cs
   WHERE cs.id = p_session_id
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'session_not_found', 'session_id', p_session_id);
  END IF;

  IF v_status NOT IN ('borrador', 'pendiente_aprobacion', 'programada') THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'session_status_not_editable',
      'session_id', p_session_id, 'session_status', v_status);
  END IF;

  IF v_active IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'session_inactive', 'session_id', p_session_id);
  END IF;

  BEGIN
    -- Lock the memberships that make each user eligible; a concurrent
    -- revocation must either be visible here or wait for this call.
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT m.user_id), '{}'::uuid[])
      INTO v_members
      FROM (
        SELECT ur.user_id
          FROM public.user_roles ur
         WHERE ur.user_id = ANY (v_ids)
           AND ur.community_id = v_community
           AND ur.is_active IS TRUE
         ORDER BY ur.id
           FOR SHARE OF ur NOWAIT
      ) m;

    -- Lock the attendee rows this call may reactivate, in id order.
    SELECT COALESCE(pg_catalog.array_agg(a.user_id ORDER BY a.user_id), '{}'::uuid[])
      INTO v_evidence
      FROM (
        SELECT sa.user_id,
               (sa.expected IS FALSE
                AND (sa.attended IS NOT NULL OR sa.marked_by IS NOT NULL
                     OR sa.marked_at IS NOT NULL OR sa.arrival_status IS NOT NULL
                     OR sa.notes IS NOT NULL)) AS blocked
          FROM public.session_attendees sa
         WHERE sa.session_id = p_session_id
           AND sa.user_id = ANY (v_ids)
         ORDER BY sa.id
           FOR NO KEY UPDATE OF sa NOWAIT
      ) a
     WHERE a.blocked;
  EXCEPTION WHEN lock_not_available THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'roster_busy', 'session_id', p_session_id);
  END;

  v_invalid := ARRAY(SELECT u FROM pg_catalog.unnest(v_ids) AS u
                      WHERE NOT (u = ANY (v_members)) ORDER BY u);

  IF pg_catalog.cardinality(v_invalid) > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'invalid_attendees', 'session_id', p_session_id,
      'user_ids', pg_catalog.to_jsonb(v_invalid));
  END IF;

  -- A de-selected row that carries attendance evidence is never reactivated.
  IF pg_catalog.cardinality(v_evidence) > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'attendance_evidence_present', 'session_id', p_session_id,
      'user_ids', pg_catalog.to_jsonb(v_evidence));
  END IF;

  -- Writes. Only the expected flag of an evidence-free de-selected row changes;
  -- no attendance column is ever written.
  WITH upd AS (
    UPDATE public.session_attendees sa
       SET expected = true
     WHERE sa.session_id = p_session_id
       AND sa.user_id = ANY (v_ids)
       AND sa.expected IS FALSE
       AND sa.attended IS NULL AND sa.marked_by IS NULL AND sa.marked_at IS NULL
       AND sa.arrival_status IS NULL AND sa.notes IS NULL
    RETURNING sa.user_id
  )
  SELECT COALESCE(pg_catalog.array_agg(upd.user_id ORDER BY upd.user_id), '{}'::uuid[])
    INTO v_reactivated
    FROM upd;

  WITH ins AS (
    INSERT INTO public.session_attendees (session_id, user_id, expected)
    SELECT p_session_id, u, true
      FROM pg_catalog.unnest(v_ids) AS u
     ORDER BY u
    ON CONFLICT (session_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT COALESCE(pg_catalog.array_agg(ins.user_id ORDER BY ins.user_id), '{}'::uuid[])
    INTO v_added
    FROM ins;

  v_present := ARRAY(SELECT u FROM pg_catalog.unnest(v_ids) AS u
                      WHERE NOT (u = ANY (v_added)) AND NOT (u = ANY (v_reactivated))
                      ORDER BY u);

  IF pg_catalog.cardinality(v_added) + pg_catalog.cardinality(v_reactivated) > 0 THEN
    INSERT INTO public.session_activity_log (session_id, user_id, action, details)
    VALUES (p_session_id, p_actor_id, 'edited', pg_catalog.jsonb_build_object(
      'change', 'roster_attendees_added',
      'source', 'session_roster_add_attendees',
      'added_user_ids', pg_catalog.to_jsonb(v_added),
      'reactivated_user_ids', pg_catalog.to_jsonb(v_reactivated)));
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'reason', 'ok',
    'session_id', p_session_id, 'session_status', v_status,
    'added_user_ids', pg_catalog.to_jsonb(v_added),
    'reactivated_user_ids', pg_catalog.to_jsonb(v_reactivated),
    'already_present_user_ids', pg_catalog.to_jsonb(v_present),
    'added_count', pg_catalog.cardinality(v_added),
    'reactivated_count', pg_catalog.cardinality(v_reactivated),
    'already_present_count', pg_catalog.cardinality(v_present));
END;
$$;

COMMENT ON FUNCTION public.session_roster_add_attendees(uuid, uuid[], uuid) IS
  'Explicit roster add (FNE Zoom internal testing, Unit B2a). service_role only; the calling API owns view/contribute authorization. Validates the whole request in one transaction: 1-200 distinct non-null user ids, an existing actor profile, a session in borrador, pendiente_aprobacion or programada that is active, and every user an active member (user_roles.is_active IS TRUE) of the session exact growth community; any failure refuses the whole batch before any write and returns {ok:false, reason}. Inserts missing rows as expected = true; reactivates a de-selected row only when it carries no attendance evidence (otherwise refuses attendance_evidence_present); duplicates are no-ops. Locks the session row FOR NO KEY UPDATE, then memberships and target rows NOWAIT (roster_busy on contention). Writes one edited activity row with structural details only when something changed.';

REVOKE ALL ON FUNCTION public.session_roster_add_attendees(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_roster_add_attendees(uuid, uuid[], uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Roster remove RPC (service_role only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.session_roster_remove_attendees(
  p_session_id uuid,
  p_user_ids   uuid[],
  p_actor_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_max_attendees CONSTANT integer := 200;
  v_ids         uuid[];
  v_status      text;
  v_community   uuid;
  v_school_id   integer;
  v_active      boolean;
  v_tenant_kind text;
  v_existing    uuid[];
  v_evidence    uuid[];
  v_missing     uuid[];
  v_removed     uuid[];
  v_cancelled   integer := 0;
BEGIN
  IF p_session_id IS NULL OR p_actor_id IS NULL OR p_user_ids IS NULL
     OR pg_catalog.cardinality(p_user_ids) = 0
     OR pg_catalog.array_ndims(p_user_ids) <> 1
     OR pg_catalog.array_position(p_user_ids, NULL) IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'invalid_request', 'session_id', p_session_id);
  END IF;

  v_ids := ARRAY(SELECT DISTINCT u FROM pg_catalog.unnest(p_user_ids) AS u ORDER BY u);

  IF pg_catalog.cardinality(v_ids) > c_max_attendees THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'too_many_attendees', 'session_id', p_session_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_actor_id) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'invalid_actor', 'session_id', p_session_id);
  END IF;

  SELECT cs.status, cs.growth_community_id, cs.school_id, cs.is_active
    INTO v_status, v_community, v_school_id, v_active
    FROM public.consultor_sessions cs
   WHERE cs.id = p_session_id
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'session_not_found', 'session_id', p_session_id);
  END IF;

  IF v_status NOT IN ('borrador', 'pendiente_aprobacion', 'programada') THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'session_status_not_editable',
      'session_id', p_session_id, 'session_status', v_status);
  END IF;

  IF v_active IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'session_inactive', 'session_id', p_session_id);
  END IF;

  SELECT sc.tenant_kind INTO v_tenant_kind
    FROM public.schools sc
   WHERE sc.id = v_school_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'tenant_unresolved', 'session_id', p_session_id);
  END IF;

  BEGIN
    SELECT COALESCE(pg_catalog.array_agg(t.user_id ORDER BY t.user_id), '{}'::uuid[]),
           COALESCE(pg_catalog.array_agg(t.user_id ORDER BY t.user_id)
                      FILTER (WHERE t.has_evidence), '{}'::uuid[])
      INTO v_existing, v_evidence
      FROM (
        SELECT sa.user_id,
               (sa.attended IS NOT NULL OR sa.marked_by IS NOT NULL
                OR sa.marked_at IS NOT NULL OR sa.arrival_status IS NOT NULL
                OR sa.notes IS NOT NULL) AS has_evidence
          FROM public.session_attendees sa
         WHERE sa.session_id = p_session_id
           AND sa.user_id = ANY (v_ids)
         ORDER BY sa.id
           FOR UPDATE OF sa NOWAIT
      ) t;
  EXCEPTION WHEN lock_not_available THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'roster_busy', 'session_id', p_session_id);
  END;

  -- Recorded attendance (attended true OR false, marker, arrival, notes) is
  -- evidence and is never erased through the roster.
  IF pg_catalog.cardinality(v_evidence) > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'attendance_evidence_present', 'session_id', p_session_id,
      'user_ids', pg_catalog.to_jsonb(v_evidence));
  END IF;

  v_missing := ARRAY(SELECT u FROM pg_catalog.unnest(v_ids) AS u
                      WHERE NOT (u = ANY (v_existing)) ORDER BY u);

  -- Intentional-removal protection: a scheduled operator session keeps at least
  -- one eligible attendee through this API. A roster that is already without
  -- one (for example after revocation) can still be cleaned up.
  IF v_status = 'programada' AND v_tenant_kind = 'operator'
     AND pg_catalog.cardinality(v_existing) > 0
     AND EXISTS (
       SELECT 1
         FROM public.session_attendees sa
         JOIN public.user_roles ur ON ur.user_id = sa.user_id
        WHERE sa.session_id = p_session_id
          AND sa.expected IS TRUE
          AND ur.community_id = v_community
          AND ur.is_active IS TRUE)
     AND NOT EXISTS (
       SELECT 1
         FROM public.session_attendees sa
         JOIN public.user_roles ur ON ur.user_id = sa.user_id
        WHERE sa.session_id = p_session_id
          AND sa.expected IS TRUE
          AND NOT (sa.user_id = ANY (v_existing))
          AND ur.community_id = v_community
          AND ur.is_active IS TRUE) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'last_eligible_attendee', 'session_id', p_session_id,
      'user_ids', pg_catalog.to_jsonb(v_existing));
  END IF;

  WITH del AS (
    DELETE FROM public.session_attendees sa
     WHERE sa.session_id = p_session_id
       AND sa.user_id = ANY (v_existing)
    RETURNING sa.user_id
  )
  SELECT COALESCE(pg_catalog.array_agg(del.user_id ORDER BY del.user_id), '{}'::uuid[])
    INTO v_removed
    FROM del;

  -- Cancel still-scheduled notifications of removed attendees for this session,
  -- in the same transaction. sent/failed/cancelled history is kept, and a
  -- removed user who is also a facilitator of the session keeps theirs.
  WITH c AS (
    UPDATE public.session_notifications n
       SET status = 'cancelled'
     WHERE n.session_id = p_session_id
       AND n.user_id = ANY (v_removed)
       AND n.status = 'scheduled'
       AND NOT EXISTS (
         SELECT 1 FROM public.session_facilitators sf
          WHERE sf.session_id = p_session_id AND sf.user_id = n.user_id)
    RETURNING n.id
  )
  SELECT pg_catalog.count(*)::integer INTO v_cancelled FROM c;

  IF pg_catalog.cardinality(v_removed) > 0 THEN
    INSERT INTO public.session_activity_log (session_id, user_id, action, details)
    VALUES (p_session_id, p_actor_id, 'edited', pg_catalog.jsonb_build_object(
      'change', 'roster_attendees_removed',
      'source', 'session_roster_remove_attendees',
      'removed_user_ids', pg_catalog.to_jsonb(v_removed),
      'cancelled_notification_count', v_cancelled));
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'reason', 'ok',
    'session_id', p_session_id, 'session_status', v_status,
    'removed_user_ids', pg_catalog.to_jsonb(v_removed),
    'missing_user_ids', pg_catalog.to_jsonb(v_missing),
    'removed_count', pg_catalog.cardinality(v_removed),
    'missing_count', pg_catalog.cardinality(v_missing),
    'cancelled_notification_count', v_cancelled);
END;
$$;

COMMENT ON FUNCTION public.session_roster_remove_attendees(uuid, uuid[], uuid) IS
  'Explicit roster removal (FNE Zoom internal testing, Unit B2a). service_role only; the calling API owns view/contribute authorization. Same request, actor, status and active-session validation as the add RPC (plus tenant resolution). Hard-deletes attendee rows that carry no attendance evidence and, atomically, cancels their still-scheduled session_notifications for this session (sent/failed history and facilitator notifications kept). Any evidence (attended true or false, marked_by, marked_at, arrival_status, notes) refuses the whole batch. Missing attendees are idempotent no-ops. For a programada operator session, removing the last eligible attendee is refused (last_eligible_attendee); drafts may become empty. Locks the session row FOR NO KEY UPDATE, then target rows NOWAIT (roster_busy on contention). Future notification suppression depends on consumers reading the live roster (Unit B2b).';

REVOKE ALL ON FUNCTION public.session_roster_remove_attendees(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_roster_remove_attendees(uuid, uuid[], uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Membership trigger: never auto-add a member to an operator session
-- -----------------------------------------------------------------------------
-- Replaces the baseline body. The only behavioural change is the operator
-- exclusion in the INSERT branch (tenant_kind, never ids or names); the
-- revocation branch is the baseline statement, schema-qualified. search_path
-- is now pinned to '' because every name is qualified. Owner, ACL and the
-- trigger itself are untouched by CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.sync_session_attendees_on_gc_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- On INSERT: add attendee to future scheduled sessions, except operator
  -- sessions, whose roster is explicit.
  IF TG_OP = 'INSERT' AND NEW.community_id IS NOT NULL THEN
    INSERT INTO public.session_attendees (session_id, user_id, expected)
    SELECT cs.id, NEW.user_id, true
      FROM public.consultor_sessions cs
     WHERE cs.growth_community_id = NEW.community_id
       AND cs.status = 'programada'
       AND cs.session_date > CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM public.schools sc
          WHERE sc.id = cs.school_id
            AND sc.tenant_kind = 'operator')
    ON CONFLICT (session_id, user_id) DO NOTHING;
  END IF;

  -- On DELETE/deactivation: expire from future sessions (every tenant,
  -- including the last participant of an operator session).
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    UPDATE public.session_attendees sa SET expected = false
      FROM public.consultor_sessions cs
     WHERE sa.session_id = cs.id
       AND sa.user_id = COALESCE(OLD.user_id, NEW.user_id)
       AND cs.growth_community_id = COALESCE(OLD.community_id, NEW.community_id)
       AND cs.status = 'programada'
       AND cs.session_date > CURRENT_DATE
       AND sa.attended IS NULL;  -- Only if attendance not yet recorded

    UPDATE public.session_notifications SET status = 'cancelled'
     WHERE user_id = COALESCE(OLD.user_id, NEW.user_id)
       AND status = 'scheduled'
       AND session_id IN (
         SELECT id FROM public.consultor_sessions
          WHERE growth_community_id = COALESCE(OLD.community_id, NEW.community_id)
            AND status = 'programada'
            AND session_date > CURRENT_DATE
       );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.sync_session_attendees_on_gc_change() IS
  'Growth-community membership sync for public.user_roles (baseline; operator exclusion added by Unit B2a). INSERT with a community adds the member as expected to future programada sessions of that community, except sessions of an operator-tenant school, whose roster is explicit (session_roster_add_attendees). DELETE or is_active true to false expires the member (expected = false, only where attendance is unrecorded) from future programada sessions of every tenant and cancels their scheduled notifications; this is never blocked by the operator approval gate. SECURITY DEFINER with an empty search_path.';
