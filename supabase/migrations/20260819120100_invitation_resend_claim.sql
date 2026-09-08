-- =============================================================================
-- claim_invitation_resend — making the invitation-resend cooldown atomic (F5)
--
-- WHAT WAS WRONG. `pages/api/admin/tractor-signups/resend-invite.ts` enforced
-- its ten-minute per-target cooldown in three separate round trips:
--
--     1. SELECT the most recent `invitation_resent` row for the target
--     2. if there is none, INSERT a reservation row
--     3. send the mail
--
-- Between (1) and (2) there is no lock and no uniqueness constraint, so two
-- requests for the same recipient — a double click, a retried fetch, two
-- administrators on the same signup — both read "no recent resend", both insert,
-- and both send. The ledger then shows two rows and the recipient gets two
-- recovery links, the second of which silently kills the first. The cooldown
-- was advisory in exactly the situation it exists for.
--
-- THE FIX is to make "check and reserve" one indivisible step. Two ingredients:
--
--   pg_advisory_xact_lock, keyed on the TARGET USER ID. Taken first, so
--   concurrent claims for the same recipient serialise: the second waits, and by
--   the time it runs its check the first has already inserted. The lock is
--   transaction-scoped, so it is released when the RPC's implicit transaction
--   ends — no unlock to leak, and a crashed backend releases it. Different
--   targets hash to different keys and never wait on each other.
--
--   THE INSERT ITSELF, inside the same transaction as the check. It is the
--   reservation, written BEFORE the provider is called and written as `failure`,
--   because at that instant that is what it is. A provider call that then fails,
--   or a process that dies mid-send, leaves a row that both tells the truth and
--   consumes the cooldown — which is the safe direction: a failing mailer must
--   not become an unlimited allowance to mail recovery links at an address.
--
-- WHY AN ADVISORY LOCK RATHER THAN A CONSTRAINT. A partial unique index would
-- have to be expressed over a moving time window, which no index can do. A
-- serializable transaction would work but would surface as a retry the caller
-- has to implement. The advisory lock is the smallest thing that makes the
-- existing append-only ledger behave atomically, and it needs no new table.
--
-- Additive: one function. Nothing dropped, truncated or destructively altered,
-- no row-level security disabled. `security_audit_events` keeps the posture
-- 20260818120000 gave it — this function is SECURITY DEFINER and EXECUTE is
-- granted to `service_role` alone, so it opens no new path for a browser.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_invitation_resend(
  p_target_user_id  uuid,
  p_actor_user_id   uuid,
  p_cooldown_seconds integer,
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  claimed              boolean,
  retry_after_seconds  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_since      timestamptz;
  v_last       timestamptz;
  v_metadata   jsonb;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'claim_invitation_resend requires a target user id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_cooldown_seconds IS NULL OR p_cooldown_seconds <= 0 THEN
    RAISE EXCEPTION 'claim_invitation_resend requires a positive cooldown'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialise every claim for THIS recipient. Two arguments so the key space is
  -- namespaced away from any other advisory lock in the database; the target id
  -- is hashed into the second.
  PERFORM pg_advisory_xact_lock(
    hashtext('public.claim_invitation_resend'),
    hashtext(p_target_user_id::text)
  );

  v_since := now() - make_interval(secs => p_cooldown_seconds);

  -- Any outcome counts, not just successes. A provider rejection that reset the
  -- window would turn a retry loop into a mail-bomb.
  SELECT max(e.occurred_at)
    INTO v_last
    FROM public.security_audit_events e
   WHERE e.action = 'invitation_resent'
     AND e.target_user_id = p_target_user_id
     AND e.occurred_at >= v_since;

  IF v_last IS NOT NULL THEN
    claimed := false;
    retry_after_seconds :=
      GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (v_last + make_interval(secs => p_cooldown_seconds)) - now()))
      )::integer;
    RETURN NEXT;
    RETURN;
  END IF;

  -- The reservation. Merged with the caller's context, then forced back onto the
  -- two keys this row must carry so a caller cannot mislabel its own stage.
  v_metadata := COALESCE(p_metadata, '{}'::jsonb)
                || jsonb_build_object('stage', 'requested', 'claim', true);

  INSERT INTO public.security_audit_events
    (action, outcome, actor_user_id, actor_role, target_user_id, metadata)
  VALUES
    ('invitation_resent', 'failure', p_actor_user_id, 'admin', p_target_user_id, v_metadata);

  claimed := true;
  retry_after_seconds := 0;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.claim_invitation_resend(uuid, uuid, integer, jsonb) IS
  'Atomically claims the invitation-resend cooldown window for one recipient. Takes a transaction-scoped advisory lock on the target id, then checks the security_audit_events ledger and writes the reservation row in the same transaction, so two concurrent requests for the same recipient produce at most one claim and therefore at most one provider call. Different recipients never block each other. The reservation is written as `failure` before the send, so a failed or abandoned attempt still consumes the cooldown. service_role only.';

REVOKE ALL ON FUNCTION public.claim_invitation_resend(uuid, uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_invitation_resend(uuid, uuid, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.claim_invitation_resend(uuid, uuid, integer, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_resend(uuid, uuid, integer, jsonb) TO service_role;
