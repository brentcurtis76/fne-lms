-- N3-01: notification email outbox and the atomic enqueue RPC (dormant).
--
-- Why: the live path writes the in-app row and calls the email provider in
-- separate steps, so a crash between them loses or repeats an email and a
-- digest choice cannot be honoured. public.enqueue_notification resolves both
-- channels and writes the in-app row and a durable outbox row in one
-- transaction under the live idempotency key.
--
-- Dormant: no application code calls either object until N5-02
-- (NOTIFICATION_OUTBOX_DELIVERY). Service-role only. Additive only.

-- 1. Table.
CREATE TABLE public.notification_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  occurrence_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_id uuid NULL REFERENCES public.user_notifications(id) ON DELETE SET NULL,
  category text NULL,
  email_mode text NOT NULL,
  email_reason text NOT NULL,
  related_url text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Worker fields (N3-03/N3-04); nothing sets them yet.
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text NULL, lease_expires_at timestamptz NULL,
  first_attempt_at timestamptz NULL, last_attempt_at timestamptz NULL, completed_at timestamptz NULL,
  last_error_code text NULL, provider_message_id text NULL,
  send_snapshot bytea NULL,  -- encrypted by the worker
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_outbox_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT notification_email_outbox_key_check CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  CONSTRAINT notification_email_outbox_event_type_check CHECK (event_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT notification_email_outbox_occurrence_check CHECK (char_length(occurrence_id) <= 255 AND btrim(occurrence_id) <> ''),
  CONSTRAINT notification_email_outbox_category_check CHECK (category IN (
    'courses', 'assignments', 'community', 'sessions', 'advisory', 'licitaciones', 'qa_support', 'system')),
  CONSTRAINT notification_email_outbox_email_mode_check CHECK (email_mode IN ('immediate', 'digest')),
  CONSTRAINT notification_email_outbox_email_reason_check CHECK (
    email_reason IN ('mandatory', 'category_mode', 'catalog_default', 'unmapped_event')),
  -- Only an event the catalog does not map has no category.
  CONSTRAINT notification_email_outbox_unmapped_check CHECK ((category IS NULL) = (email_reason = 'unmapped_event')),
  -- Same-origin path only: a leading '/', not '//' or '/\', no control characters.
  CONSTRAINT notification_email_outbox_related_url_check CHECK (
    char_length(related_url) <= 500 AND related_url ~ '^/([^/\\]|$)' AND related_url !~ '[[:cntrl:]]'),
  -- The allowlisted email payload: a flat object of string or number values.
  CONSTRAINT notification_email_outbox_payload_check CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 4096
    AND NOT jsonb_path_exists(payload, 'strict $.* ? (@.type() != "string" && @.type() != "number")')),
  CONSTRAINT notification_email_outbox_status_check CHECK (status IN (
    'pending', 'sending', 'sent', 'failed', 'cancelled', 'cancelled_after_ambiguous', 'unknown')),
  CONSTRAINT notification_email_outbox_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT notification_email_outbox_lease_owner_check CHECK (char_length(lease_owner) <= 200),
  CONSTRAINT notification_email_outbox_error_code_check CHECK (char_length(last_error_code) <= 100),
  CONSTRAINT notification_email_outbox_provider_id_check CHECK (char_length(provider_message_id) <= 255),
  -- The encrypted send snapshot must not outlive a terminal status.
  CONSTRAINT notification_email_outbox_snapshot_check CHECK (send_snapshot IS NULL OR status IN ('pending', 'sending'))
);

-- 2. RLS on immediately, then the restrictive guard required on every
--    row-secured public table (pgTAP 053). No other policy: browser roles hold
--    no grant, and service_role bypasses RLS.
ALTER TABLE public.notification_email_outbox ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'notification_email_outbox');

-- 3. Privileges: service_role only.
REVOKE ALL ON TABLE public.notification_email_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_email_outbox TO service_role;

-- 4. Indexes: claiming, retention purge, recipient and in-app row lookups.
CREATE INDEX notification_email_outbox_claim_idx ON public.notification_email_outbox (next_attempt_at) WHERE status IN ('pending', 'sending');
CREATE INDEX notification_email_outbox_created_at_idx ON public.notification_email_outbox (created_at);
CREATE INDEX notification_email_outbox_user_id_idx ON public.notification_email_outbox (user_id);
CREATE INDEX notification_email_outbox_notification_id_idx ON public.notification_email_outbox (notification_id);

-- 5. Keep updated_at current.
CREATE TRIGGER update_notification_email_outbox_updated_at BEFORE UPDATE ON public.notification_email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.notification_email_outbox IS
  'One email per recipient per event occurrence (idempotency_key = the in-app row key). Dormant until N5-02 (NOTIFICATION_OUTBOX_DELIVERY): nothing enqueues or sends yet. Service-role only.';

-- 6. Enqueue RPC. Mirrors lib/notifications/resolve-preference.ts and the
--    legacy lookup of lib/notificationService.ts. Errors are never caught: a
--    failed preference read or insert rolls the whole call back.
CREATE FUNCTION public.enqueue_notification(
  p_event_type text, p_occurrence_id text, p_user_id uuid, p_category text,
  p_email_default text, p_mandatory boolean, p_title text, p_description text,
  p_related_url text, p_importance text, p_notification_type_id text, p_email_payload jsonb
)
RETURNS TABLE (notification_id uuid, outbox_id uuid, idempotency_key text,
               in_app boolean, email_mode text, email_reason text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_payload    jsonb := COALESCE(p_email_payload, '{}'::jsonb);
  v_importance text := COALESCE(p_importance, 'normal');
  v_key text; v_leg_inapp boolean; v_leg_email boolean; v_suppressed boolean;
  v_cat_mode text; v_mode text; v_reason text; v_nid uuid; v_oid uuid;
BEGIN
  -- Validation. Messages never echo ids, titles or payload values.
  IF p_event_type IS NULL OR p_event_type !~ '^[a-z][a-z0-9_]{0,63}$'
     OR p_occurrence_id IS NULL OR pg_catalog.btrim(p_occurrence_id) = '' OR pg_catalog.char_length(p_occurrence_id) > 255
     OR p_user_id IS NULL OR p_mandatory IS NULL
     OR p_title IS NULL OR pg_catalog.btrim(p_title) = '' OR pg_catalog.char_length(p_title) > 255
     OR pg_catalog.char_length(p_description) > 2000
     OR v_importance NOT IN ('low', 'normal', 'high')
     OR (p_related_url IS NOT NULL AND (pg_catalog.char_length(p_related_url) > 500
         OR p_related_url !~ '^/([^/\\]|$)' OR p_related_url ~ '[[:cntrl:]]')) THEN
    RAISE EXCEPTION 'enqueue_notification: invalid event, occurrence, recipient, text, url or importance' USING ERRCODE = '22023';
  END IF;
  IF (p_category IS NULL AND (p_email_default IS NOT NULL OR p_mandatory))
     OR (p_category IS NOT NULL AND (p_category NOT IN ('courses', 'assignments', 'community', 'sessions',
           'advisory', 'licitaciones', 'qa_support', 'system')
         OR p_email_default IS NULL OR p_email_default NOT IN ('immediate', 'digest', 'off'))) THEN
    RAISE EXCEPTION 'enqueue_notification: invalid catalog metadata' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(v_payload) <> 'object' OR pg_catalog.octet_length(v_payload::text) > 4096
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(v_payload) e
                 WHERE pg_catalog.jsonb_typeof(e.value) NOT IN ('string', 'number')) THEN
    RAISE EXCEPTION 'enqueue_notification: payload must be a flat object of strings and numbers (<= 4096 bytes)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_user_id) THEN
    RAISE EXCEPTION 'enqueue_notification: unknown recipient' USING ERRCODE = '22023';
  END IF;

  -- The live key: 'notif-' || sha256(JSON.stringify([eventType, occurrence, userId])).
  v_key := 'notif-' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
             pg_catalog.format('[%s,%s,%s]', pg_catalog.to_json(p_event_type)::text,
               pg_catalog.to_json(p_occurrence_id)::text, pg_catalog.to_json(p_user_id::text)::text),
             'UTF8')), 'hex');

  -- Legacy row for this event type: in-app is off only when explicitly false.
  SELECT unp.in_app_enabled, unp.email_enabled INTO v_leg_inapp, v_leg_email
    FROM public.user_notification_preferences unp
   WHERE unp.user_id = p_user_id AND unp.notification_type = p_event_type;
  v_suppressed := COALESCE(v_leg_email = false, false);
  IF p_event_type = 'meeting_finalized' THEN
    -- Meeting summary rule: any legacy row with email off suppresses.
    v_suppressed := EXISTS (SELECT 1 FROM public.user_notification_preferences unp
                             WHERE unp.user_id = p_user_id AND unp.email_enabled = false);
  END IF;

  -- A mandatory email is decided before (and without) the category read.
  IF p_category IS NOT NULL AND NOT p_mandatory THEN
    SELECT c.email_mode INTO v_cat_mode FROM public.user_notification_category_prefs c
     WHERE c.user_id = p_user_id AND c.category = p_category;
  END IF;

  IF p_mandatory THEN
    v_mode := 'immediate'; v_reason := 'mandatory';
  ELSIF p_category IS NOT NULL AND v_cat_mode IN ('immediate', 'digest', 'off') THEN
    v_mode := v_cat_mode; v_reason := 'category_mode';
  ELSIF v_suppressed THEN
    v_mode := 'off'; v_reason := 'legacy_suppressed';
  ELSIF p_category IS NULL THEN
    v_mode := 'immediate'; v_reason := 'unmapped_event';
  ELSE
    v_mode := p_email_default; v_reason := 'catalog_default';
  END IF;

  IF v_leg_inapp IS DISTINCT FROM false THEN
    INSERT INTO public.user_notifications AS un
      (user_id, title, description, category, related_url, importance, idempotency_key, notification_type_id)
    VALUES (p_user_id, p_title, p_description, COALESCE(p_category, 'general'), p_related_url,
            v_importance, v_key, p_notification_type_id)
    ON CONFLICT ON CONSTRAINT unique_notification_idempotency_key DO NOTHING
    RETURNING un.id INTO v_nid;
    IF v_nid IS NULL THEN  -- already written (retry, or the live sync path)
      SELECT un.id INTO v_nid FROM public.user_notifications un WHERE un.idempotency_key = v_key; END IF;
  END IF;

  IF v_mode <> 'off' THEN
    INSERT INTO public.notification_email_outbox AS o
      (idempotency_key, event_type, occurrence_id, user_id, notification_id, category,
       email_mode, email_reason, related_url, payload)
    VALUES (v_key, p_event_type, p_occurrence_id, p_user_id, v_nid, p_category,
            v_mode, v_reason, p_related_url, v_payload)
    ON CONFLICT ON CONSTRAINT notification_email_outbox_idempotency_key_key DO NOTHING
    RETURNING o.id INTO v_oid;
    IF v_oid IS NULL THEN
      SELECT o.id INTO v_oid FROM public.notification_email_outbox o WHERE o.idempotency_key = v_key; END IF;
  END IF;

  RETURN QUERY SELECT v_nid, v_oid, v_key, v_leg_inapp IS DISTINCT FROM false, v_mode, v_reason;
END;
$$;

COMMENT ON FUNCTION public.enqueue_notification(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb) IS
  'Resolves the in-app and email channels for one recipient of one event occurrence and writes the in-app row and the outbox row atomically and idempotently (key = live notif- key). Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.enqueue_notification(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb) TO service_role;
