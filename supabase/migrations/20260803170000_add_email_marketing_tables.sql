-- =============================================================================
-- Email marketing ("Correos") schema — five tables (INSPIRA B3)
--
-- Additive migration. Creates five new tables plus their RLS posture and
-- privilege hardening. Nothing is dropped, truncated or destructively altered;
-- rollback is FORWARD-ONLY (disable the consumers, then ship a follow-up
-- migration — never drop these tables, their policies or their data). The
-- tables are dormant until B4a/B4b add the SECURITY DEFINER functions and the
-- Track-B feature phases add the routes that call them.
--
--   public.email_contacts        — the marketable audience (adults only, D-11)
--   public.email_campaigns       — broadcast drafts and their lifecycle
--   public.email_campaign_sends  — the per-recipient ledger (metrics live here)
--   public.email_suppression     — SHA-256 tombstones that survive erasure
--   public.email_webhook_events  — sanitized svix-id dedup ledger
--
-- ACCESS MATRIX (frozen decision D-04 — per-operation, not per-table, and
-- identical on all five tables). Enforced in TWO layers, because RLS alone is
-- not the write boundary: TRUNCATE (and REFERENCES/TRIGGER, and PostgreSQL
-- 17's MAINTAIN) are GRANT-level privileges that row-level security never
-- evaluates, and Supabase's default privileges hand them to `anon` and
-- `authenticated` on every new public table.
--
--   LAYER 1 — GRANTs, expressed as a GRANT-LIST, never a denylist. Both public
--   roles are stripped with `REVOKE ALL` and then handed back only what they
--   must hold. This form — not an enumerated REVOKE of the privileges that
--   exist today — is the project standard for every comms table (A2's second
--   remediation round: an enumerated revoke written against PostgreSQL 15
--   silently left `MAINTAIN` granted, because a privilege that does not exist
--   yet cannot appear in a denylist). Local and CI run PostgreSQL 17.6;
--   production runs 15.8, so the form has to be correct on both.
--
--   role            SELECT  INSERT  UPDATE  DELETE  TRUNCATE  REFERENCES/TRIGGER
--   ----------------------------------------------------------------------------
--   anon              no      no      no      no       no            no
--   authenticated     YES     no      no      no       no            no
--   service_role      YES     YES     YES     YES      YES           YES
--
--   ...and, for anon and authenticated, nothing else — including every table
--   privilege a future PostgreSQL release may introduce.
--
--   LAYER 2 — RLS policy (which rows the surviving SELECT may read):
--
--   role                              SELECT   INSERT   UPDATE   DELETE
--   ------------------------------------------------------------------
--   authenticated admin                 YES      no       no       no
--   any other authenticated role         no      no       no       no
--   anon                                 no      no       no       no
--   service_role                  (BYPASSRLS — the only write path)
--
-- Exactly ONE policy exists per table: an admin-only, SELECT-only USING clause.
-- There is deliberately no WITH CHECK anywhere, so no authenticated role can
-- INSERT/UPDATE/DELETE at all — and after the REVOKEs below it cannot even
-- reach the policy machinery for those commands, nor TRUNCATE around it. Every
-- mutation goes through service-role clients inside guarded API routes or the
-- SECURITY DEFINER RPCs of B4a/B4b.
--
-- ERASURE IS ANONYMIZE-ONLY (D-04/D-06). No code path deletes contacts,
-- suppression tombstones, send history or webhook events. That obligation is
-- expressed structurally here: `email_campaign_sends` holds ON DELETE RESTRICT
-- on BOTH foreign keys, so neither a contact nor a campaign can take send
-- history down with it. The draft-only campaign delete route (B9a) is
-- unaffected: `queue_campaign_sends` is the only writer of send rows and it
-- leaves a campaign in `draft` exactly when it queued nothing (D-07), so a
-- draft campaign never has send rows to restrict against.
--
-- CONSENT/BASIS COLUMNS CARRY NO DEFAULTS (D-12). `legal_basis` and
-- `basis_recorded_at` are NOT NULL without defaults: a default would let the
-- database manufacture a legal basis. `consent_notice_version` is nullable but
-- required whenever the basis is `consent_form`, via CHECK.
-- =============================================================================


-- =============================================================================
-- 1. email_contacts — the marketable audience
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  email_normalized text,
  first_name text,
  last_name text,
  organization text,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  source text NOT NULL,
  legal_basis text NOT NULL,
  basis_note text,
  basis_recorded_at timestamp with time zone NOT NULL,
  consent_notice_version text,
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unsubscribe_token uuid DEFAULT gen_random_uuid(),
  subscribed_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  suppressed_at timestamp with time zone,
  suppression_reason text,
  anonymized_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_contacts_email_normalized_key UNIQUE (email_normalized),
  CONSTRAINT email_contacts_unsubscribe_token_key UNIQUE (unsubscribe_token),
  -- The two-shape identity CHECK (D-06). A row is either a normal contact with
  -- a consistent normalized email and a usable unsubscribe token, or an
  -- anonymized tombstone-shaped row whose whole identity set is NULL. There is
  -- no third shape, so a partial anonymization cannot be committed.
  CONSTRAINT email_contacts_identity_shape_check CHECK (
    (
      anonymized_at IS NULL
      AND email IS NOT NULL
      AND email_normalized IS NOT NULL
      AND email_normalized = lower(btrim(email))
      AND email_normalized <> ''
      AND unsubscribe_token IS NOT NULL
    )
    OR
    (
      anonymized_at IS NOT NULL
      AND email IS NULL
      AND email_normalized IS NULL
      AND first_name IS NULL
      AND last_name IS NULL
      AND organization IS NULL
      AND basis_note IS NULL
      AND unsubscribe_token IS NULL
    )
  ),
  CONSTRAINT email_contacts_source_check
    CHECK (source = ANY (ARRAY[
      'manual'::text, 'csv_import'::text, 'profiles'::text,
      'tractor_signups'::text, 'pasantia_leads'::text, 'other'::text
    ])),
  CONSTRAINT email_contacts_legal_basis_check
    CHECK (legal_basis = ANY (ARRAY[
      'consent_form'::text, 'customer_relationship'::text, 'manual_verified'::text
    ])),
  -- D-12: consent-form basis is only evidence if the notice version is recorded.
  CONSTRAINT email_contacts_consent_version_check
    CHECK ((legal_basis <> 'consent_form') OR (consent_notice_version IS NOT NULL)),
  -- Suppression evidence is all-or-nothing in both directions.
  CONSTRAINT email_contacts_suppression_check
    CHECK (
      ((suppressed_at IS NULL) AND (suppression_reason IS NULL))
      OR
      ((suppressed_at IS NOT NULL) AND (suppression_reason IS NOT NULL))
    ),
  CONSTRAINT email_contacts_suppression_reason_check
    CHECK ((suppression_reason IS NULL) OR (suppression_reason = ANY (ARRAY[
      'bounce'::text, 'complaint'::text, 'manual'::text, 'failed'::text, 'suppressed'::text
    ])))
);

CREATE INDEX IF NOT EXISTS email_contacts_tags_idx
  ON public.email_contacts USING gin (tags);

CREATE INDEX IF NOT EXISTS email_contacts_created_idx
  ON public.email_contacts USING btree (created_at DESC);

CREATE OR REPLACE TRIGGER trg_email_contacts_updated_at
  BEFORE UPDATE ON public.email_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 2. email_campaigns — broadcast drafts and their lifecycle
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text DEFAULT ''::text NOT NULL,
  preheader text,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  content_html text DEFAULT ''::text NOT NULL,
  hero_image_url text,
  cta_label text,
  cta_url text,
  audience_tags text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  send_started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  -- D-07: there is no `failed` status. A campaign whose queue produced zero
  -- recipients stays in `draft`; only `queue_campaign_sends` /
  -- `complete_campaign_if_done` / `retry_failed_sends` move it (B4a).
  CONSTRAINT email_campaigns_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text, 'sending'::text, 'sent'::text, 'sent_with_errors'::text
    ]))
);

-- The drain picks the oldest `send_started_at` among `sending` campaigns (D-07).
CREATE INDEX IF NOT EXISTS email_campaigns_status_started_idx
  ON public.email_campaigns USING btree (status, send_started_at);

CREATE INDEX IF NOT EXISTS email_campaigns_created_idx
  ON public.email_campaigns USING btree (created_at DESC);

CREATE OR REPLACE TRIGGER trg_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 3. email_campaign_sends — the per-recipient ledger
--
-- Campaign metrics are ALWAYS computed from this table (D-06): there are no
-- denormalized counters anywhere, so a counter can never disagree with history.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES public.email_contacts(id) ON DELETE RESTRICT,
  email text,
  status text DEFAULT 'pending'::text NOT NULL,
  provider_batch_key text,
  claimed_at timestamp with time zone,
  sent_at timestamp with time zone,
  resend_email_id text,
  error text,
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  bounced_at timestamp with time zone,
  complained_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_campaign_sends_campaign_contact_key UNIQUE (campaign_id, contact_id),
  CONSTRAINT email_campaign_sends_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text
    ]))
);

CREATE INDEX IF NOT EXISTS email_campaign_sends_campaign_status_idx
  ON public.email_campaign_sends USING btree (campaign_id, status);

CREATE INDEX IF NOT EXISTS email_campaign_sends_resend_id_idx
  ON public.email_campaign_sends USING btree (resend_email_id);

CREATE INDEX IF NOT EXISTS email_campaign_sends_contact_idx
  ON public.email_campaign_sends USING btree (contact_id);


-- =============================================================================
-- 4. email_suppression — SHA-256 tombstones that survive erasure
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_suppression (
  email_hash text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_suppression_reason_check
    CHECK (reason = ANY (ARRAY[
      'bounce'::text, 'complaint'::text, 'manual'::text, 'failed'::text, 'suppressed'::text
    ]))
);


-- =============================================================================
-- 5. email_webhook_events — sanitized, PII-free svix-id dedup ledger
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_webhook_events (
  svix_id text PRIMARY KEY,
  event_type text NOT NULL,
  resend_email_id text,
  occurred_at timestamp with time zone,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS email_webhook_events_resend_id_idx
  ON public.email_webhook_events USING btree (resend_email_id);

CREATE INDEX IF NOT EXISTS email_webhook_events_received_idx
  ON public.email_webhook_events USING btree (received_at DESC);


-- =============================================================================
-- RLS: enabled on all five, one admin SELECT-only policy each.
--
-- Policies are created conditionally so the migration is re-runnable without
-- ever dropping an existing policy (additive rule, D-10).
-- =============================================================================
ALTER TABLE public.email_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'email_contacts', 'email_campaigns', 'email_campaign_sends',
    'email_suppression', 'email_webhook_events'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = t
         AND policyname = t || '_admin_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
        'USING (EXISTS ('
        '  SELECT 1 FROM public.user_roles ur '
        '   WHERE ur.user_id = auth.uid() '
        '     AND ur.role_type = ''admin''::public.user_role_type '
        '     AND ur.is_active = true))',
        t || '_admin_select', t
      );
    END IF;
  END LOOP;
END
$$;


-- =============================================================================
-- Privilege hardening (D-04). RLS governs rows, not commands: TRUNCATE is never
-- evaluated by a policy, and Supabase's ALTER DEFAULT PRIVILEGES grants ALL on
-- new public tables to `anon` and `authenticated`. Without these REVOKEs either
-- role could empty a table at the SQL layer despite the SELECT-only policy.
-- Idempotent and additive — revoking an inherited grant drops no object and no
-- data. `service_role` grants are deliberately untouched: it is the only write
-- path.
--
-- Grant-list form (see LAYER 1 in the header): revoke everything, then grant
-- back the single privilege the role needs. Upgrade-proof by construction — a
-- new server version's new privilege lands on the revoked side of the line, not
-- the granted side.
-- =============================================================================
REVOKE ALL ON public.email_contacts       FROM anon;
REVOKE ALL ON public.email_contacts       FROM authenticated;
GRANT SELECT ON public.email_contacts     TO authenticated;

REVOKE ALL ON public.email_campaigns      FROM anon;
REVOKE ALL ON public.email_campaigns      FROM authenticated;
GRANT SELECT ON public.email_campaigns    TO authenticated;

REVOKE ALL ON public.email_campaign_sends FROM anon;
REVOKE ALL ON public.email_campaign_sends FROM authenticated;
GRANT SELECT ON public.email_campaign_sends TO authenticated;

REVOKE ALL ON public.email_suppression    FROM anon;
REVOKE ALL ON public.email_suppression    FROM authenticated;
GRANT SELECT ON public.email_suppression  TO authenticated;

REVOKE ALL ON public.email_webhook_events FROM anon;
REVOKE ALL ON public.email_webhook_events FROM authenticated;
GRANT SELECT ON public.email_webhook_events TO authenticated;


-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON TABLE public.email_contacts IS
  'Correos audience. Admin-readable only; every write goes through service-role API routes and the B4a/B4b RPCs (D-04). anon holds no privilege at all and authenticated holds SELECT only, so TRUNCATE cannot bypass the policy. Adult professional contacts only — no student/family identities, no school_id (D-11). Erasure is anonymize-only: no code path deletes rows here.';

COMMENT ON COLUMN public.email_contacts.legal_basis IS
  'Lawful basis for marketing this contact (D-12). NOT NULL with NO DEFAULT: a default would let the database manufacture a legal basis. consent_form additionally requires consent_notice_version.';

COMMENT ON COLUMN public.email_contacts.basis_recorded_at IS
  'When the basis above was recorded (D-12). NOT NULL with NO DEFAULT — the write path must stamp real evidence. Platform imports record it together with imported_by and the admin attestation note (B6).';

COMMENT ON COLUMN public.email_contacts.basis_note IS
  'Free-text evidence for the basis (e.g. the import attestation). Nullable, and NULLed by anonymize_email_contact — it can name a person.';

COMMENT ON COLUMN public.email_contacts.anonymized_at IS
  'Anonymization marker (D-06). When set, the whole identity set (email, email_normalized, first_name, last_name, organization, basis_note, unsubscribe_token) is NULL — enforced by email_contacts_identity_shape_check, so a partial erasure cannot commit. Metrics survive because they are computed from email_campaign_sends.';

COMMENT ON COLUMN public.email_contacts.subscribed_at IS
  'Informational stamp of when the contact entered the list. The authoritative subscription predicate is unsubscribed_at IS NULL — deliberately no default here, so the database asserts nothing about a contact it has merely stored.';

COMMENT ON COLUMN public.email_contacts.unsubscribe_token IS
  'Per-recipient one-click unsubscribe token (D-08). Required on every non-anonymized row by the identity-shape CHECK; NULLed on anonymization, which is why the column is nullable and UNIQUE rather than NOT NULL.';

COMMENT ON TABLE public.email_campaigns IS
  'Correos broadcast campaigns. Admin-readable only; all writes via service-role routes (D-04). Statuses are draft|sending|sent|sent_with_errors — there is no failed status (D-07): a campaign that queues zero recipients stays draft. Only the B4a RPCs move a campaign between states.';

COMMENT ON COLUMN public.email_campaigns.send_started_at IS
  'Stamped when queue_campaign_sends flips the campaign to sending. The drain processes sending campaigns oldest-first by this column (D-07).';

COMMENT ON TABLE public.email_campaign_sends IS
  'Per-recipient send ledger and the sole source of campaign metrics (D-06 — no denormalized counters). Both foreign keys are ON DELETE RESTRICT because erasure is anonymize-only and send history is never deleted (D-04); the draft-only campaign delete route is unaffected, since a draft campaign never has send rows. The email column is a snapshot, NULLed by anonymize_email_contact.';

COMMENT ON COLUMN public.email_campaign_sends.provider_batch_key IS
  'Created unused at B3 (PLAN B3 [A1]). B2 findings §1.4.4: every non-status-quo idempotency option needs a persisted per-batch key stamped on the <=100 rows of one provider call before it is issued; a nullable column is free now versus a migration later. B10a decides the mechanism — nothing reads or writes this yet.';

COMMENT ON COLUMN public.email_campaign_sends.email IS
  'Recipient address snapshot at queue time. NULLed by anonymize_email_contact (D-06) — the send row itself survives so metrics and dedup keys are preserved.';

COMMENT ON TABLE public.email_suppression IS
  'Permanent SHA-256 tombstones of normalized email addresses (D-04/D-06). Checked at import AND at queue time so a suppressed or erased address can never be resurrected. Survives contact anonymization by construction — it stores only a hash. No code path deletes rows here, not even for an authenticated admin (pgTAP asserts the DELETE and TRUNCATE denial explicitly).';

COMMENT ON COLUMN public.email_suppression.email_hash IS
  'SHA-256 hex digest of the normalized (lower(btrim(...))) email address. Never the address itself.';

COMMENT ON TABLE public.email_webhook_events IS
  'Sanitized, PII-free svix-id dedup ledger for Resend webhooks (D-06/D-08). One row per svix-id; its presence means the event effect already committed, so a redelivery is a 200 no-op. Insert and effect happen in ONE transaction inside process_webhook_event (B4b), which is also where the payload is projected down to the allowlist below — no code path may write a raw provider payload here. Needs no scrubbing on anonymization, by construction.';

COMMENT ON COLUMN public.email_webhook_events.detail IS
  'ALLOWLISTED operational subset only (D-06): e.g. bounce classification/diagnostic code, delay reason. It must NEVER contain to/cc/bcc, any email address, subject or html. The projection is performed inside process_webhook_event (B4b) so the raw payload is never persisted; this column is created here and documented, and nothing writes it until B4b.';

COMMENT ON COLUMN public.email_webhook_events.occurred_at IS
  'Provider-reported event time (nullable — not every event type carries one). received_at is our own clock and is always set.';
