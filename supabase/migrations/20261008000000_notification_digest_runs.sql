-- N5-01 (storage phase): daily notification digest runs — one run per user and
-- Santiago civil date, its fixed membership, a token-bound lease, the frozen
-- encrypted send snapshot, settlement and retention (dormant).
--
-- Why: outbox rows in email_mode 'digest' (N3-01, or handed over by
-- finish_notification_email(..., 'digest')) have no sender. A daily digest is
-- one email that carries many outbox rows, so it needs its own identity (user
-- and civil date, a stable provider key), a membership that no row can join
-- twice, an owner that no stale worker can overrule, and the same
-- freeze/retry/settle semantics the immediate worker already has. Membership
-- is fixed when the run is opened and may only shrink (a cancelled outbox row)
-- until the snapshot freezes; from the freeze on, membership, bytes, address
-- and provider key never change. A frozen member's outbox row is 'sending'
-- without a lease, so no immediate-worker RPC and no unsubscribe can touch it,
-- and settlement only ever moves 'sending' members: a cancelled row is never
-- resurrected. The member's own outbox row is the single source of member
-- state. The snapshot is opaque ciphertext built by the application; nothing
-- here renders, decrypts or stores minor data.
--
-- Dormant: no application code calls these objects, no schedule or producer
-- exists; the later consumer phase of N5-01 is their first caller. Service-role
-- only. Additive only: two tables, two trigger functions and eleven functions;
-- public.notification_email_outbox (columns, constraints, indexes, triggers)
-- and every existing function are as earlier migrations left them. Every clock
-- is the database clock. The digest hour is fixed at 09:00 America/Santiago
-- (no stored per-user hour exists).

-- 1. Runs. One row per user and local (Santiago) date. The status vocabulary
--    is the outbox's: a run is 'sending' exactly while it holds a frozen
--    snapshot; an unfrozen run under a lease stays 'pending'.
CREATE TABLE public.notification_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  provider_key text NOT NULL,  -- set by trigger, derived from (user_id, local_date)
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid NULL, lease_expires_at timestamptz NULL,
  first_attempt_at timestamptz NULL, last_attempt_at timestamptz NULL, completed_at timestamptz NULL,
  last_error_code text NULL, provider_message_id text NULL,
  address_digest text NULL,    -- keyed HMAC of the address (never the address), frozen with the snapshot
  send_snapshot bytea NULL,    -- encrypted by the application
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_digest_runs_user_date_key UNIQUE (user_id, local_date),
  CONSTRAINT notification_digest_runs_provider_key_key UNIQUE (provider_key),
  CONSTRAINT notification_digest_runs_provider_key_check CHECK (provider_key ~ '^notif-digest-[0-9a-f]{64}$'),
  CONSTRAINT notification_digest_runs_local_date_check CHECK (isfinite(local_date)),
  CONSTRAINT notification_digest_runs_status_check CHECK (status IN (
    'pending', 'sending', 'sent', 'failed', 'cancelled', 'cancelled_after_ambiguous', 'unknown')),
  CONSTRAINT notification_digest_runs_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT notification_digest_runs_lease_check CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT notification_digest_runs_error_code_check CHECK (last_error_code ~ '^[a-z0-9_:]{1,100}$'),
  CONSTRAINT notification_digest_runs_provider_id_check CHECK (char_length(provider_message_id) BETWEEN 1 AND 255),
  CONSTRAINT notification_digest_runs_address_digest_check CHECK (address_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notification_digest_runs_snapshot_size_check CHECK (octet_length(send_snapshot) BETWEEN 1 AND 262144),
  -- Frozen = 'sending': a snapshot exists exactly then, with its address and first attempt.
  CONSTRAINT notification_digest_runs_frozen_check CHECK (
    (send_snapshot IS NOT NULL) = (status = 'sending')
    AND (status <> 'sending' OR (address_digest IS NOT NULL AND first_attempt_at IS NOT NULL))),
  -- Terminal = completed, without a lease (and, by the frozen check, without a snapshot).
  CONSTRAINT notification_digest_runs_terminal_check CHECK (
    (status IN ('pending', 'sending')) = (completed_at IS NULL)
    AND (status IN ('pending', 'sending') OR lease_token IS NULL))
);

-- 2. Members. An outbox row belongs to at most one run (primary key). No
--    status column: the outbox row's own status is the member's state.
CREATE TABLE public.notification_digest_run_members (
  outbox_id uuid PRIMARY KEY REFERENCES public.notification_email_outbox(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.notification_digest_runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS on immediately, then the restrictive guard required on every
--    row-secured public table (pgTAP 053). No other policy: browser roles hold
--    no grant, and service_role bypasses RLS.
ALTER TABLE public.notification_digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_digest_run_members ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'notification_digest_runs');
SELECT public.apply_forced_password_change_guard('public', 'notification_digest_run_members');

-- 4. Privileges: service_role only. Members are insert-only for it: no UPDATE
--    (also refused by trigger) and no DELETE; a member leaves only with its
--    run or its outbox row (FK cascade, which runs as the table owner).
REVOKE ALL ON TABLE public.notification_digest_runs, public.notification_digest_run_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_digest_runs TO service_role;
REVOKE ALL ON TABLE public.notification_digest_run_members FROM service_role;
GRANT SELECT, INSERT ON TABLE public.notification_digest_run_members TO service_role;

-- 5. Indexes: claiming, retention purge, members of a run (and the run FK cascade).
CREATE INDEX notification_digest_runs_claim_idx ON public.notification_digest_runs (next_attempt_at) WHERE status IN ('pending', 'sending');
CREATE INDEX notification_digest_runs_created_at_idx ON public.notification_digest_runs (created_at);
CREATE INDEX notification_digest_run_members_run_id_idx ON public.notification_digest_run_members (run_id);

-- 6. Run guard. INSERT: a run starts pending, unfrozen, unleased, unattempted,
--    and its provider key is always derived here from (user_id, local_date):
--    'notif-digest-' || sha256('["<user uuid>","<YYYY-MM-DD>"]'). UPDATE: the
--    identity never changes; a frozen snapshot or address is never replaced;
--    a frozen run never becomes unfrozen ('sending' never goes back to
--    'pending'); only pending -> sending | cancelled and sending -> sent |
--    failed | cancelled_after_ambiguous | unknown are status changes; a
--    terminal run never changes again.
CREATE FUNCTION public.notification_digest_runs_guard()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  -- Messages never echo ids, keys, digests or bytes.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.send_snapshot IS NOT NULL OR NEW.address_digest IS NOT NULL
       OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.attempt_count <> 0
       OR NEW.first_attempt_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'notification_digest_runs: a run starts pending, unfrozen, unleased and unattempted' USING ERRCODE = 'P0409';
    END IF;
    NEW.provider_key := 'notif-digest-' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
                          pg_catalog.format('[%s,%s]', pg_catalog.to_json(NEW.user_id::text)::text,
                            pg_catalog.to_json(pg_catalog.to_char(NEW.local_date, 'YYYY-MM-DD'))::text),
                          'UTF8')), 'hex');
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('pending', 'sending') THEN
    RAISE EXCEPTION 'notification_digest_runs: a finished run never changes' USING ERRCODE = 'P0409';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.local_date IS DISTINCT FROM OLD.local_date OR NEW.provider_key IS DISTINCT FROM OLD.provider_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notification_digest_runs: the identity of a run never changes' USING ERRCODE = 'P0409';
  END IF;
  IF (OLD.send_snapshot IS NOT NULL AND NEW.send_snapshot IS NOT NULL AND NEW.send_snapshot <> OLD.send_snapshot)
     OR (OLD.address_digest IS NOT NULL AND NEW.address_digest IS DISTINCT FROM OLD.address_digest) THEN
    RAISE EXCEPTION 'notification_digest_runs: a frozen snapshot or address is never replaced' USING ERRCODE = 'P0409';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('sending', 'cancelled'))
       OR (OLD.status = 'sending' AND NEW.status IN ('sent', 'failed', 'cancelled_after_ambiguous', 'unknown'))) THEN
    RAISE EXCEPTION 'notification_digest_runs: invalid status transition' USING ERRCODE = 'P0409';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notification_digest_runs_guard() IS
  'Trigger function: a new digest run starts pending, unfrozen, unleased and unattempted, and its provider key is derived from (user_id, local_date); afterwards the identity never changes, a frozen snapshot or address is never replaced, only pending -> sending|cancelled and sending -> sent|failed|cancelled_after_ambiguous|unknown are allowed, and a terminal run never changes again (P0409).';

REVOKE ALL ON FUNCTION public.notification_digest_runs_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notification_digest_runs_guard BEFORE INSERT OR UPDATE ON public.notification_digest_runs
  FOR EACH ROW EXECUTE FUNCTION public.notification_digest_runs_guard();

CREATE TRIGGER update_notification_digest_runs_updated_at BEFORE UPDATE ON public.notification_digest_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Member guard. A member row is never updated. A row joins only a pending
--    (unfrozen) run of its own recipient, and only while it is eligible: a
--    digest row, pending, without a snapshot, not mandatory.
CREATE FUNCTION public.notification_digest_run_members_guard()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  -- Messages never echo ids.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'notification_digest_run_members: a member row is never updated' USING ERRCODE = 'P0409';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.notification_digest_runs r JOIN public.notification_email_outbox o ON o.user_id = r.user_id
        WHERE r.id = NEW.run_id AND r.status = 'pending' AND r.send_snapshot IS NULL
          AND o.id = NEW.outbox_id AND o.email_mode = 'digest' AND o.status = 'pending'
          AND o.send_snapshot IS NULL AND o.email_reason <> 'mandatory') THEN
    RAISE EXCEPTION 'notification_digest_run_members: only an eligible digest row joins a pending run of its recipient' USING ERRCODE = 'P0409';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notification_digest_run_members_guard() IS
  'Trigger function: digest run members are never updated, and an outbox row joins only a pending, unfrozen run of its own recipient while it is a pending digest row without a snapshot and not mandatory (P0409).';

REVOKE ALL ON FUNCTION public.notification_digest_run_members_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notification_digest_run_members_guard BEFORE INSERT OR UPDATE ON public.notification_digest_run_members
  FOR EACH ROW EXECUTE FUNCTION public.notification_digest_run_members_guard();

COMMENT ON TABLE public.notification_digest_runs IS
  'One daily notification digest per user and America/Santiago civil date (due 09:00 local). Stable provider key derived from (user_id, local_date); status vocabulary of the outbox (sending = frozen encrypted snapshot); token-bound lease. Terminal runs keep no snapshot and are purged 90 days after completion. Dormant until the N5-01 consumer phase; service-role only.';
COMMENT ON TABLE public.notification_digest_run_members IS
  'The outbox rows one digest run carries; an outbox row belongs to at most one run. Fixed when the run is opened; never updated; the outbox row''s status is the member''s state. Deleted only with its run or outbox row (FK cascade). Service-role only.';

-- 8. Due date. The latest civil date D whose 09:00 in America/Santiago is at or
--    before p_at, and that instant. Civil-date arithmetic in the zone, never
--    24-hour steps: a DST change makes a day 23 or 25 hours long. 09:00 is
--    never inside a Chilean DST gap or overlap. Independent of the session
--    TimeZone and DateStyle.
CREATE FUNCTION public.notification_digest_due(p_at timestamptz)
RETURNS TABLE (local_date date, due_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_date date;
BEGIN
  IF p_at IS NULL OR NOT pg_catalog.isfinite(p_at) THEN
    RAISE EXCEPTION 'notification_digest_due: invalid instant (finite timestamptz required)' USING ERRCODE = '22023';
  END IF;
  v_date := ((p_at AT TIME ZONE 'America/Santiago') - interval '9 hours')::date;
  local_date := v_date;
  due_at := (v_date + time '09:00') AT TIME ZONE 'America/Santiago';
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.notification_digest_due(timestamptz) IS
  'The digest date due at p_at: the latest civil date whose 09:00 America/Santiago is at or before p_at, and that instant (civil-date arithmetic, DST-safe, session-timezone independent). Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.notification_digest_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_digest_due(timestamptz) TO service_role;

-- 9. Open. D = the date due now. Up to p_limit users that have eligible rows
--    and no run for D yet (whatever that run's state), oldest eligible row
--    first; one run per user with up to p_max_members of that user's eligible
--    rows created before D's due instant, oldest first. Eligible: a digest row,
--    pending, without a snapshot, not mandatory, in no run. Rows over the cap,
--    and rows created at or after the due instant, stay pending for a later
--    date. Concurrent openers never wait: a user another opener holds (per-user
--    transaction advisory try-lock) and rows another transaction holds are
--    skipped. A run is created only together with at least one member.
CREATE FUNCTION public.open_notification_digest_runs(p_limit integer, p_max_members integer)
RETURNS TABLE (run_id uuid, user_id uuid, local_date date, members integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_date   date;
  v_due    timestamptz;
  v_user   uuid;
  v_ids    uuid[];
  v_run    uuid;
  v_opened integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_max_members IS NULL OR p_max_members NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'open_notification_digest_runs: invalid limit (1..100) or max members (1..200)' USING ERRCODE = '22023';
  END IF;

  SELECT d.local_date, d.due_at INTO v_date, v_due FROM public.notification_digest_due(pg_catalog.now()) d;

  FOR v_user IN
    SELECT o.user_id FROM public.notification_email_outbox o
     WHERE o.email_mode = 'digest' AND o.status = 'pending' AND o.send_snapshot IS NULL
       AND o.email_reason <> 'mandatory' AND o.created_at < v_due
       AND NOT EXISTS (SELECT 1 FROM public.notification_digest_run_members m WHERE m.outbox_id = o.id)
       AND NOT EXISTS (SELECT 1 FROM public.notification_digest_runs r WHERE r.user_id = o.user_id AND r.local_date = v_date)
     GROUP BY o.user_id
     ORDER BY pg_catalog.min(o.created_at), o.user_id
  LOOP
    EXIT WHEN v_opened >= p_limit;
    -- Another opener holds this user: skip it, never wait.
    CONTINUE WHEN NOT pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('notification_digest_open:' || v_user::text, 0));
    -- A fresh statement: a run committed by an opener that held the lock before is visible now.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.notification_digest_runs r WHERE r.user_id = v_user AND r.local_date = v_date);

    SELECT pg_catalog.array_agg(x.id ORDER BY x.created_at, x.id) INTO v_ids
      FROM (SELECT o.id, o.created_at FROM public.notification_email_outbox o
             WHERE o.user_id = v_user AND o.email_mode = 'digest' AND o.status = 'pending'
               AND o.send_snapshot IS NULL AND o.email_reason <> 'mandatory' AND o.created_at < v_due
               AND NOT EXISTS (SELECT 1 FROM public.notification_digest_run_members m WHERE m.outbox_id = o.id)
             ORDER BY o.created_at, o.id
             LIMIT p_max_members
               FOR NO KEY UPDATE OF o SKIP LOCKED) x;
    CONTINUE WHEN v_ids IS NULL;

    INSERT INTO public.notification_digest_runs AS r (user_id, local_date) VALUES (v_user, v_date)
    ON CONFLICT DO NOTHING
    RETURNING r.id INTO v_run;
    CONTINUE WHEN v_run IS NULL;

    INSERT INTO public.notification_digest_run_members (run_id, outbox_id)
    SELECT v_run, u.id FROM pg_catalog.unnest(v_ids) AS u(id);

    v_opened := v_opened + 1;
    run_id := v_run; user_id := v_user; local_date := v_date; members := pg_catalog.cardinality(v_ids);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.open_notification_digest_runs(integer, integer) IS
  'Opens the digest runs due now (09:00 America/Santiago): up to p_limit (1..100) users with eligible rows and no run for that date, oldest backlog first; each run takes up to p_max_members (1..200) of the user''s eligible rows created before the due instant (pending digest rows without a snapshot, not mandatory, in no run), oldest first. Concurrent openers skip users and rows another one holds. Returns one row per run opened. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.open_notification_digest_runs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_notification_digest_runs(integer, integer) TO service_role;

-- 10. Claim: recovery mail first (no row, no lease while it is due), then up to
--     p_limit due non-terminal runs whose lease is free or expired, oldest due
--     first, SKIP LOCKED; each gets a new random lease token. Snapshot and
--     attempt fields are untouched.
CREATE FUNCTION public.claim_notification_digest_runs(p_limit integer, p_lease_seconds integer)
RETURNS TABLE (run_id uuid, lease_token uuid, user_id uuid, local_date date, provider_key text, status text,
               attempt_count integer, has_snapshot boolean, expired boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'claim_notification_digest_runs: invalid limit (1..100) or lease seconds (30..900)' USING ERRCODE = '22023';
  END IF;

  IF public.password_recovery_email_due() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT r.id FROM public.notification_digest_runs r
     WHERE r.status IN ('pending', 'sending') AND r.next_attempt_at <= pg_catalog.now()
       AND (r.lease_expires_at IS NULL OR r.lease_expires_at <= pg_catalog.now())
     ORDER BY r.next_attempt_at, r.id
     LIMIT p_limit
       FOR UPDATE OF r SKIP LOCKED
  ), claimed AS (
    UPDATE public.notification_digest_runs r
       SET lease_token = pg_catalog.gen_random_uuid(),
           lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds)
      FROM due
     WHERE r.id = due.id
    RETURNING r.id, r.lease_token, r.user_id, r.local_date, r.provider_key, r.status, r.attempt_count,
              r.send_snapshot IS NOT NULL AS has_snapshot,
              COALESCE(r.send_snapshot IS NOT NULL AND r.first_attempt_at <= pg_catalog.now() - interval '24 hours', false) AS expired,
              r.next_attempt_at
  )
  SELECT c.id, c.lease_token, c.user_id, c.local_date, c.provider_key, c.status, c.attempt_count, c.has_snapshot, c.expired
    FROM claimed c
   ORDER BY c.next_attempt_at, c.id;
END;
$$;

COMMENT ON FUNCTION public.claim_notification_digest_runs(integer, integer) IS
  'Leases up to p_limit (1..100) due pending/sending digest runs whose lease is free or expired for p_lease_seconds (30..900, database clock, FOR UPDATE SKIP LOCKED), each under a new random lease token. Returns no row and leases nothing while password-recovery mail is due. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.claim_notification_digest_runs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_digest_runs(integer, integer) TO service_role;

-- 11. Renew: the live token only.
CREATE FUNCTION public.renew_notification_digest_run(p_run_id uuid, p_lease_token uuid, p_lease_seconds integer)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_done uuid;
BEGIN
  IF p_run_id IS NULL OR p_lease_token IS NULL
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'renew_notification_digest_run: invalid run, token or lease seconds (30..900)' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_digest_runs r
     SET lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds)
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now()
  RETURNING r.id INTO v_done;

  RETURN v_done IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.renew_notification_digest_run(uuid, uuid, integer) IS
  'Live lease token only: extends the lease of a digest run to now + p_lease_seconds (30..900). False and no change otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.renew_notification_digest_run(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_notification_digest_run(uuid, uuid, integer) TO service_role;

-- 12. State: what the live owner needs before an attempt. No row otherwise.
CREATE FUNCTION public.notification_digest_run_state(p_run_id uuid, p_lease_token uuid)
RETURNS TABLE (status text, attempt_count integer, has_snapshot boolean, expired boolean, address_suppressed boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_run_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'notification_digest_run_state: invalid run or token' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT r.status, r.attempt_count, r.send_snapshot IS NOT NULL,
         COALESCE(r.send_snapshot IS NOT NULL AND r.first_attempt_at <= pg_catalog.now() - interval '24 hours', false),
         EXISTS (SELECT 1 FROM public.notification_email_suppressions s WHERE s.address_digest = r.address_digest)
    FROM public.notification_digest_runs r
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now();
END;
$$;

COMMENT ON FUNCTION public.notification_digest_run_state(uuid, uuid) IS
  'Live lease token only, read-only: status, attempt count, whether a snapshot is frozen, whether it is expired (first attempt 24 hours old or older) and whether the frozen address is suppressed (false while none is frozen). No row otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.notification_digest_run_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_digest_run_state(uuid, uuid) TO service_role;

-- 13. Members: the live owner reads every member with its current outbox state
--     and source reference, oldest first. Email-only rows (no in-app row)
--     included. No row otherwise.
CREATE FUNCTION public.notification_digest_run_members(p_run_id uuid, p_lease_token uuid)
RETURNS TABLE (outbox_id uuid, status text, event_type text, category text, email_reason text, related_url text,
               payload jsonb, notification_id uuid, created_at timestamptz, source_kind text, source_id text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_run_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'notification_digest_run_members: invalid run or token' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT o.id, o.status, o.event_type, o.category, o.email_reason, o.related_url, o.payload, o.notification_id,
         o.created_at, s.source_kind, s.source_id
    FROM public.notification_digest_runs r
    JOIN public.notification_digest_run_members m ON m.run_id = r.id
    JOIN public.notification_email_outbox o ON o.id = m.outbox_id
    LEFT JOIN public.notification_email_outbox_source s ON s.outbox_id = o.id
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now()
   ORDER BY o.created_at, o.id;
END;
$$;

COMMENT ON FUNCTION public.notification_digest_run_members(uuid, uuid) IS
  'Live lease token only, read-only: every member of a digest run with its current outbox status, event, category, reason, related url, allowlisted payload, in-app id (NULL for email-only rows), created_at and source reference, oldest first. No row otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.notification_digest_run_members(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_digest_run_members(uuid, uuid) TO service_role;

-- 14. Cancel one member before the freeze (the consumer's per-member access,
--     preference or recipient check failed): live token, unfrozen run, member
--     still pending without a snapshot -> outbox 'cancelled'. False otherwise.
CREATE FUNCTION public.cancel_notification_digest_member(p_run_id uuid, p_lease_token uuid, p_outbox_id uuid, p_error_code text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_done uuid;
BEGIN
  -- Messages never echo ids or codes.
  IF p_run_id IS NULL OR p_lease_token IS NULL OR p_outbox_id IS NULL
     OR p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_:]{1,100}$' THEN
    RAISE EXCEPTION 'cancel_notification_digest_member: invalid run, token, member or error code' USING ERRCODE = '22023';
  END IF;

  -- The run first (the lock order of begin and finish), then the member row.
  PERFORM 1 FROM public.notification_digest_runs r
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now()
     AND r.status = 'pending' AND r.send_snapshot IS NULL
     FOR NO KEY UPDATE OF r;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.notification_email_outbox o
     SET status = 'cancelled', completed_at = pg_catalog.now(), last_error_code = p_error_code
    FROM public.notification_digest_run_members m
   WHERE m.run_id = p_run_id AND m.outbox_id = p_outbox_id AND o.id = m.outbox_id
     AND o.status = 'pending' AND o.send_snapshot IS NULL
  RETURNING o.id INTO v_done;

  RETURN v_done IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.cancel_notification_digest_member(uuid, uuid, uuid, text) IS
  'Live lease token only, before the freeze: cancels one still-pending member of an unfrozen digest run (outbox status cancelled, completed_at, error code). False and no change otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.cancel_notification_digest_member(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_notification_digest_member(uuid, uuid, uuid, text) TO service_role;

-- 15. Begin an attempt. Live token only.
--     First attempt (the freeze): p_member_ids must equal exactly the run's
--     members whose outbox row is still a pending digest row without a
--     snapshot; every member row is locked in id order without waiting (a row
--     another transaction holds, e.g. an unsubscribe in flight, makes the call
--     return NULL); the address must not be suppressed. Then, at once: the run
--     stores snapshot and address and becomes 'sending'; the member rows
--     become 'sending' without a lease (no immediate-worker RPC and no
--     unsubscribe takes them from here on); their address rows record the
--     digest. Retry (frozen): the stored bytes come back, the arguments are
--     ignored; refused once expired (first attempt 24 hours old or older) or
--     while the frozen address is suppressed. NULL and no change otherwise.
CREATE FUNCTION public.begin_notification_digest_attempt(
  p_run_id uuid, p_lease_token uuid, p_snapshot bytea, p_member_ids uuid[], p_address_digest text
)
RETURNS bytea
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_run     record;
  v_members integer;
  v_locked  integer;
  v_pending uuid[];
  v_stored  bytea;
BEGIN
  -- Messages never echo ids, tokens, digests or snapshot bytes.
  IF p_run_id IS NULL OR p_lease_token IS NULL
     OR (p_snapshot IS NOT NULL AND pg_catalog.octet_length(p_snapshot) NOT BETWEEN 1 AND 262144)
     OR (p_address_digest IS NOT NULL AND p_address_digest !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'begin_notification_digest_attempt: invalid run, token, snapshot size (1..262144 bytes) or address digest (64 lowercase hex characters)' USING ERRCODE = '22023';
  END IF;
  IF p_member_ids IS NOT NULL AND (
       COALESCE(pg_catalog.array_ndims(p_member_ids), 0) <> 1
       OR pg_catalog.cardinality(p_member_ids) NOT BETWEEN 1 AND 200
       OR pg_catalog.array_position(p_member_ids, NULL) IS NOT NULL
       OR (SELECT pg_catalog.count(DISTINCT u.id) FROM pg_catalog.unnest(p_member_ids) AS u(id)) <> pg_catalog.cardinality(p_member_ids)) THEN
    RAISE EXCEPTION 'begin_notification_digest_attempt: invalid member ids (one dimension, 1..200 distinct non-NULL ids)' USING ERRCODE = '22023';
  END IF;

  SELECT r.status, r.send_snapshot, r.first_attempt_at, r.address_digest INTO v_run
    FROM public.notification_digest_runs r
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now()
     AND r.status IN ('pending', 'sending')
     FOR NO KEY UPDATE OF r;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_run.status = 'sending' THEN
    IF v_run.first_attempt_at <= pg_catalog.now() - interval '24 hours'
       OR EXISTS (SELECT 1 FROM public.notification_email_suppressions s WHERE s.address_digest = v_run.address_digest) THEN
      RETURN NULL;
    END IF;
    UPDATE public.notification_digest_runs r
       SET attempt_count = r.attempt_count + 1, last_attempt_at = pg_catalog.now()
     WHERE r.id = p_run_id
    RETURNING r.send_snapshot INTO v_stored;
    RETURN v_stored;
  END IF;

  IF p_snapshot IS NULL OR p_member_ids IS NULL OR p_address_digest IS NULL
     OR EXISTS (SELECT 1 FROM public.notification_email_suppressions s WHERE s.address_digest = p_address_digest) THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_members
    FROM public.notification_digest_run_members m WHERE m.run_id = p_run_id;
  SELECT pg_catalog.count(*)::integer,
         pg_catalog.array_agg(x.id ORDER BY x.id) FILTER (WHERE x.pending)
    INTO v_locked, v_pending
    FROM (SELECT o.id, (o.email_mode = 'digest' AND o.status = 'pending' AND o.send_snapshot IS NULL) AS pending
            FROM public.notification_email_outbox o
            JOIN public.notification_digest_run_members m ON m.outbox_id = o.id
           WHERE m.run_id = p_run_id
           ORDER BY o.id
             FOR NO KEY UPDATE OF o SKIP LOCKED) x;
  IF v_locked <> v_members OR v_pending IS NULL
     OR v_pending <> (SELECT pg_catalog.array_agg(u.id ORDER BY u.id) FROM pg_catalog.unnest(p_member_ids) AS u(id)) THEN
    RETURN NULL;
  END IF;

  UPDATE public.notification_email_outbox o
     SET status = 'sending', lease_owner = NULL, lease_expires_at = NULL,
         first_attempt_at = COALESCE(o.first_attempt_at, pg_catalog.now()), last_attempt_at = pg_catalog.now()
   WHERE o.id = ANY (v_pending);

  INSERT INTO public.notification_email_outbox_address (outbox_id, address_digest)
  SELECT u.id, p_address_digest FROM pg_catalog.unnest(v_pending) AS u(id)
  ON CONFLICT (outbox_id) DO UPDATE SET address_digest = EXCLUDED.address_digest;

  UPDATE public.notification_digest_runs r
     SET status = 'sending', send_snapshot = p_snapshot, address_digest = p_address_digest,
         attempt_count = r.attempt_count + 1, first_attempt_at = pg_catalog.now(), last_attempt_at = pg_catalog.now()
   WHERE r.id = p_run_id
  RETURNING r.send_snapshot INTO v_stored;

  RETURN v_stored;
END;
$$;

COMMENT ON FUNCTION public.begin_notification_digest_attempt(uuid, uuid, bytea, uuid[], text) IS
  'Live lease token only. First attempt: when p_member_ids equals exactly the run''s still-pending members (all lockable without waiting) and the address digest is not suppressed, freezes snapshot, address and membership (run and member rows sending, member address rows recorded) and returns the snapshot. Retry: returns the frozen bytes whatever is passed, unless expired (24 hours after the first attempt) or the frozen address is suppressed. NULL and no change otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.begin_notification_digest_attempt(uuid, uuid, bytea, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_notification_digest_attempt(uuid, uuid, bytea, uuid[], text) TO service_role;

-- 16. Finish. Live token only; false and no change otherwise.
--     sent / failed: frozen runs only; the run and its 'sending' members get
--       the outcome (cancelled members stay cancelled). sent stores the
--       provider id on the run, the members and their address rows and, under
--       the bounce advisory lock of N3-06, applies bounce evidence that arrived
--       first (suppresses the frozen address).
--     cancelled: unfrozen runs only; the run and its still-pending members.
--     retry: releases the lease until now + p_retry_seconds; snapshot and
--       membership are kept.
--     Terminal outcomes clear the snapshot and the lease.
CREATE FUNCTION public.finish_notification_digest_run(
  p_run_id uuid, p_lease_token uuid, p_outcome text, p_error_code text, p_provider_message_id text, p_retry_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_run    record;
  v_pid    text;
  v_ids    uuid[];
BEGIN
  -- Messages never echo ids, tokens, codes or provider ids.
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'failed', 'cancelled', 'retry') THEN
    RAISE EXCEPTION 'finish_notification_digest_run: invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_run_id IS NULL OR p_lease_token IS NULL
     OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_:]{1,100}$')
     OR (p_error_code IS NULL AND p_outcome IN ('failed', 'cancelled', 'retry'))
     OR pg_catalog.char_length(p_provider_message_id) > 255
     OR (p_outcome = 'retry' AND (p_retry_seconds IS NULL OR p_retry_seconds NOT BETWEEN 60 AND 86400)) THEN
    RAISE EXCEPTION 'finish_notification_digest_run: invalid run, token, error code, provider message id or retry seconds (60..86400)' USING ERRCODE = '22023';
  END IF;

  SELECT r.status, r.address_digest INTO v_run
    FROM public.notification_digest_runs r
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now()
     AND r.status IN ('pending', 'sending')
     FOR NO KEY UPDATE OF r;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF (p_outcome IN ('sent', 'failed') AND v_run.status <> 'sending')
     OR (p_outcome = 'cancelled' AND v_run.status <> 'pending') THEN
    RETURN false;
  END IF;

  IF p_outcome = 'retry' THEN
    UPDATE public.notification_digest_runs r
       SET lease_token = NULL, lease_expires_at = NULL, last_error_code = p_error_code,
           next_attempt_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_retry_seconds)
     WHERE r.id = p_run_id;
    RETURN true;
  END IF;

  -- An empty id is no id: the address table refuses it, and finish must not fail.
  v_pid := CASE WHEN p_outcome = 'sent' THEN NULLIF(p_provider_message_id, '') END;

  UPDATE public.notification_digest_runs r
     SET status = p_outcome, completed_at = pg_catalog.now(), send_snapshot = NULL,
         lease_token = NULL, lease_expires_at = NULL,
         last_error_code = CASE WHEN p_outcome = 'sent' THEN NULL ELSE p_error_code END,
         provider_message_id = v_pid
   WHERE r.id = p_run_id;

  IF p_outcome = 'cancelled' THEN
    UPDATE public.notification_email_outbox o
       SET status = 'cancelled', completed_at = pg_catalog.now(), last_error_code = p_error_code
      FROM public.notification_digest_run_members m
     WHERE m.run_id = p_run_id AND o.id = m.outbox_id AND o.status = 'pending' AND o.send_snapshot IS NULL;
    RETURN true;
  END IF;

  WITH done AS (
    UPDATE public.notification_email_outbox o
       SET status = p_outcome, completed_at = pg_catalog.now(),
           last_error_code = CASE WHEN p_outcome = 'sent' THEN NULL ELSE p_error_code END,
           provider_message_id = CASE WHEN p_outcome = 'sent' THEN v_pid ELSE o.provider_message_id END
      FROM public.notification_digest_run_members m
     WHERE m.run_id = p_run_id AND o.id = m.outbox_id AND o.status = 'sending'
    RETURNING o.id
  )
  SELECT pg_catalog.array_agg(d.id) INTO v_ids FROM done d;

  IF p_outcome = 'sent' AND v_pid IS NOT NULL AND v_ids IS NOT NULL THEN
    UPDATE public.notification_email_outbox_address a SET provider_message_id = v_pid
     WHERE a.outbox_id = ANY (v_ids);

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('notification_email_bounce:' || v_pid, 0));

    -- Evidence that arrived first and matched nothing: apply it now.
    UPDATE public.notification_email_bounce_events e SET applied_at = pg_catalog.now()
     WHERE e.provider_message_id = v_pid AND e.applied_at IS NULL;
    IF FOUND THEN
      INSERT INTO public.notification_email_suppressions (address_digest) VALUES (v_run.address_digest)
      ON CONFLICT (address_digest) DO NOTHING;
    END IF;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.finish_notification_digest_run(uuid, uuid, text, text, text, integer) IS
  'Live lease token only: sent or failed (frozen runs; the run and its sending members), cancelled (unfrozen runs; the run and its pending members) or retry (lease released until now + 60..86400 s; snapshot and membership kept). Terminal outcomes clear snapshot and lease; cancelled members stay cancelled. sent records the provider id on the members'' address rows and applies earlier bounce evidence under the N3-06 advisory lock. False and no change otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.finish_notification_digest_run(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_notification_digest_run(uuid, uuid, text, text, text, integer) TO service_role;

-- 17. Settle a frozen (ambiguous) run: cancelled_after_ambiguous (a member was
--     revoked or the address suppressed after the freeze: the bytes cannot be
--     re-rendered), or unknown once expired. The run and its 'sending'
--     members; snapshot and lease cleared. False and no change otherwise.
CREATE FUNCTION public.settle_ambiguous_notification_digest_run(
  p_run_id uuid, p_lease_token uuid, p_outcome text, p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_done uuid;
BEGIN
  -- Messages never echo ids, tokens or codes.
  IF p_outcome IS NULL OR p_outcome NOT IN ('cancelled_after_ambiguous', 'unknown') THEN
    RAISE EXCEPTION 'settle_ambiguous_notification_digest_run: invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_run_id IS NULL OR p_lease_token IS NULL OR p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_:]{1,100}$' THEN
    RAISE EXCEPTION 'settle_ambiguous_notification_digest_run: invalid run, token or error code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_digest_runs r
     SET status = p_outcome, completed_at = pg_catalog.now(), last_error_code = p_error_code,
         send_snapshot = NULL, lease_token = NULL, lease_expires_at = NULL
   WHERE r.id = p_run_id AND r.lease_token = p_lease_token AND r.lease_expires_at > pg_catalog.now()
     AND r.status = 'sending'
     AND (p_outcome <> 'unknown' OR r.first_attempt_at <= pg_catalog.now() - interval '24 hours')
  RETURNING r.id INTO v_done;
  IF v_done IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.notification_email_outbox o
     SET status = p_outcome, completed_at = pg_catalog.now(), last_error_code = p_error_code
    FROM public.notification_digest_run_members m
   WHERE m.run_id = p_run_id AND o.id = m.outbox_id AND o.status = 'sending';

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.settle_ambiguous_notification_digest_run(uuid, uuid, text, text) IS
  'Live lease token only: ends a frozen digest run and its sending members as cancelled_after_ambiguous, or as unknown once its first attempt is 24 hours old or older; clears snapshot and lease. False and no change otherwise. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.settle_ambiguous_notification_digest_run(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_ambiguous_notification_digest_run(uuid, uuid, text, text) TO service_role;

-- 18. Retention: delete up to p_limit terminal runs completed and created more
--     than 90 days ago, oldest created first; member rows go through the FK
--     cascade. Pending and sending runs are never deleted.
CREATE FUNCTION public.purge_notification_digest_runs(p_limit integer)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'purge_notification_digest_runs: invalid limit (1..5000)' USING ERRCODE = '22023';
  END IF;

  WITH old AS (
    SELECT r.id FROM public.notification_digest_runs r
     WHERE r.status IN ('sent', 'failed', 'cancelled', 'cancelled_after_ambiguous', 'unknown')
       AND r.completed_at < pg_catalog.now() - interval '90 days'
       AND r.created_at < pg_catalog.now() - interval '90 days'
     ORDER BY r.created_at, r.id
     LIMIT p_limit
       FOR UPDATE OF r SKIP LOCKED
  ), gone AS (
    DELETE FROM public.notification_digest_runs r USING old WHERE r.id = old.id RETURNING r.id
  )
  SELECT pg_catalog.count(*)::integer INTO v_deleted FROM gone;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_notification_digest_runs(integer) IS
  'Deletes up to p_limit (1..5000) terminal digest runs completed and created more than 90 days ago, oldest created first, with their member rows (FK cascade), and returns the number deleted. Pending and sending runs are never deleted. Dormant; server-only (service_role).';

REVOKE ALL ON FUNCTION public.purge_notification_digest_runs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_notification_digest_runs(integer) TO service_role;
