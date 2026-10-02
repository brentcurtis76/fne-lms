-- N3-05: notification unsubscribe — a server-controlled preference version and
-- the atomic one-click unsubscribe RPC (dormant).
--
-- Why: an unsubscribe link in an email is signed for one user, one category
-- and the preference version that held when the email was built. The database
-- has to say whether that version is still the current one, so that a replayed
-- or stale link can never undo a choice the user made later, and it has to
-- turn the category off and cancel that user's still-pending optional mail in
-- the category in one transaction. public.user_notification_category_prefs
-- had no version.
--
-- A link is only ever signed for an existing row. When the user has no row
-- for the category, the signer (server code, service_role) creates it first
-- in mode default, which decides nothing, and signs that row's version. No
-- version stands for "no row": a DELETE would make "no row" true again, and a
-- link signed for it would apply a second time. So the RPC never inserts a
-- preference row and refuses a version below 1.
--
-- Dormant: no application code calls the RPC until N5-02
-- (NOTIFICATION_OUTBOX_DELIVERY). The RPC is service-role only. Additive only:
-- one sequence, one column, one trigger and two functions; no table, policy,
-- constraint or index changes, and RLS stays as it is on both tables.

-- 1. Version source. One sequence for every row: a version is never handed
--    out twice, so a row that is deleted and inserted again cannot get back a
--    version an old link was signed with. 1 is the version of the rows that
--    exist before this migration, hence the start at 2; no version means "no
--    row". Supabase default privileges grant sequences to the browser roles;
--    only the trigger function below reads this one.
CREATE SEQUENCE public.user_notification_category_pref_version_seq AS bigint START WITH 2 MINVALUE 2 NO CYCLE;

REVOKE ALL ON SEQUENCE public.user_notification_category_pref_version_seq FROM PUBLIC, anon, authenticated;

COMMENT ON SEQUENCE public.user_notification_category_pref_version_seq IS
  'Source of user_notification_category_prefs.pref_version (starts at 2: 1 is a row older than the column; no version means no row). Read only by the trigger function set_user_notification_category_pref_version(); closed to PUBLIC, anon and authenticated.';

-- 2. Version column. Existing rows become 1; from step 3 on the default is
--    never stored. No CHECK constraint: the trigger is the only writer.
ALTER TABLE public.user_notification_category_prefs ADD COLUMN pref_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.user_notification_category_prefs.pref_version IS
  'Server-controlled version of this preference row, set by trigger from a sequence: a new value on INSERT and whenever email_mode, category or user_id changes; a value sent by the client is ignored. Unsubscribe links are signed with it, and only for an existing row: the signer creates the row first (mode default) when there is none (N3-05).';

-- 3. The version is server-controlled on INSERT and on UPDATE. SECURITY
--    DEFINER so the owner of a row (authenticated) and service_role need no
--    grant on the sequence. It reads and writes nothing but NEW, OLD and the
--    sequence.
CREATE FUNCTION public.set_user_notification_category_pref_version()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Whatever the client sent.
    NEW.pref_version := pg_catalog.nextval('public.user_notification_category_pref_version_seq'::pg_catalog.regclass);
  ELSIF NEW.email_mode IS DISTINCT FROM OLD.email_mode
        OR NEW.category IS DISTINCT FROM OLD.category
        OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    NEW.pref_version := pg_catalog.nextval('public.user_notification_category_pref_version_seq'::pg_catalog.regclass);
  ELSE
    -- Nothing a link is signed for changed: keep the version, ignore a client value.
    NEW.pref_version := OLD.pref_version;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_user_notification_category_pref_version() IS
  'Trigger function: sets pref_version from the version sequence on INSERT and on an UPDATE that changes email_mode, category or user_id; any other UPDATE keeps the old version. A client-sent pref_version is always ignored. SECURITY DEFINER for the sequence only; no EXECUTE for PUBLIC, anon or authenticated.';

REVOKE ALL ON FUNCTION public.set_user_notification_category_pref_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_user_notification_category_prefs_version
  BEFORE INSERT OR UPDATE ON public.user_notification_category_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_user_notification_category_pref_version();

COMMENT ON TRIGGER set_user_notification_category_prefs_version ON public.user_notification_category_prefs IS
  'Keeps pref_version server-controlled: a new sequence value on INSERT and on a change of email_mode, category or user_id; otherwise the old value.';

-- 4. One-click unsubscribe. p_versions[i] is the version the link was signed
--    with for p_categories[i], always that of a row that existed: the signer
--    creates the row first when there is none, so a version below 1 is
--    refused. A category is turned off only when its row still carries that
--    version, which is decided by the write itself (row lock), not by a read
--    before it: of two concurrent calls with the same version exactly one
--    applies. The function never inserts a preference row: a row that was
--    deleted took its version with it, so an unknown user, a missing row and
--    a row inserted again later are all stale.
--    Categories are taken in category order so two calls cannot deadlock.
--    Errors are never caught: a failure in any category rolls the whole call
--    back.
CREATE FUNCTION public.apply_notification_unsubscribe(p_user_id uuid, p_categories text[], p_versions bigint[])
RETURNS TABLE (category text, outcome text, cancelled integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_cat     text;
  v_ver     bigint;
  v_applied integer;
  v_mode    text;
BEGIN
  -- Validation. Messages never echo ids, categories or versions.
  IF p_user_id IS NULL OR p_categories IS NULL OR p_versions IS NULL
     OR COALESCE(pg_catalog.array_ndims(p_categories), 0) <> 1
     OR COALESCE(pg_catalog.array_ndims(p_versions), 0) <> 1
     OR pg_catalog.cardinality(p_categories) NOT BETWEEN 1 AND 8
     OR pg_catalog.cardinality(p_versions) <> pg_catalog.cardinality(p_categories) THEN
    RAISE EXCEPTION 'apply_notification_unsubscribe: invalid user or arrays (one dimension, same length, 1..8 elements)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM ROWS FROM (pg_catalog.unnest(p_categories), pg_catalog.unnest(p_versions)) AS t(c, v)
              WHERE t.c IS NULL OR t.v IS NULL OR t.v < 1
                 OR t.c NOT IN ('courses', 'assignments', 'community', 'sessions',
                                'advisory', 'licitaciones', 'qa_support', 'system'))
     OR (SELECT pg_catalog.count(DISTINCT t.c) FROM pg_catalog.unnest(p_categories) AS t(c))
        <> pg_catalog.cardinality(p_categories) THEN
    RAISE EXCEPTION 'apply_notification_unsubscribe: invalid, repeated or NULL category, or NULL version or version below 1' USING ERRCODE = '22023';
  END IF;

  FOR v_cat, v_ver IN
    SELECT t.c, t.v FROM ROWS FROM (pg_catalog.unnest(p_categories), pg_catalog.unnest(p_versions)) AS t(c, v)
     ORDER BY t.c COLLATE "C"
  LOOP
    -- Applies only to the version the link was signed with; the trigger
    -- advances it. No row, or a row with another version: nothing is written.
    UPDATE public.user_notification_category_prefs c
       SET email_mode = 'off'
     WHERE c.user_id = p_user_id AND c.category = v_cat
       AND c.pref_version = v_ver AND c.email_mode <> 'off';
    GET DIAGNOSTICS v_applied = ROW_COUNT;

    category := v_cat;
    IF v_applied = 1 THEN
      -- Cancel this user's mail in this category that has not been handed to
      -- a worker: pending, no frozen snapshot, not mandatory; immediate and
      -- digest rows alike. Sending rows, ambiguous rows (pending with a
      -- snapshot), terminal rows, mandatory mail, rows without a category and
      -- every other user and category are left as they are.
      UPDATE public.notification_email_outbox o
         SET status = 'cancelled', completed_at = pg_catalog.now(), last_error_code = 'unsubscribed',
             lease_owner = NULL, lease_expires_at = NULL
       WHERE o.user_id = p_user_id AND o.category = v_cat
         AND o.status = 'pending' AND o.send_snapshot IS NULL
         AND o.email_reason <> 'mandatory';
      GET DIAGNOSTICS cancelled = ROW_COUNT;
      outcome := 'unsubscribed';
    ELSE
      -- Not applied, no write: the category is already off, or the link is
      -- stale (another version, or no row: v_mode is then NULL).
      SELECT c.email_mode INTO v_mode FROM public.user_notification_category_prefs c
       WHERE c.user_id = p_user_id AND c.category = v_cat;
      outcome := CASE WHEN v_mode = 'off' THEN 'already_off' ELSE 'stale' END;
      cancelled := 0;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.apply_notification_unsubscribe(uuid, text[], bigint[]) IS
  'One-click unsubscribe for one user and 1..8 categories, each with the preference version its link was signed with (always that of an existing row, so >= 1: the signer creates the row first when there is none). Per category, in category order: unsubscribed (mode set to off, version advanced, that user''s pending optional outbox rows without a snapshot in the category cancelled; cancelled = their number), already_off or stale (no write). Never inserts a preference row: an unknown user and a missing row are stale for every version. Atomic: any error rolls the whole call back. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.apply_notification_unsubscribe(uuid, text[], bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_notification_unsubscribe(uuid, text[], bigint[]) TO service_role;
