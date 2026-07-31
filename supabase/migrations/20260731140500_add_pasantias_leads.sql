-- =============================================================================
-- pasantias_leads — interest leads for Pasantías INSPIRA Barcelona (INSPIRA A2)
--
-- Additive migration. Creates one new table plus its RLS posture. Nothing is
-- dropped, truncated or destructively altered; rollback is FORWARD-ONLY
-- (disable the consumers, then ship a follow-up migration — never drop this
-- table, its policy or its data).
--
-- ACCESS MATRIX (frozen decision D-04 — per-operation, not per-table):
--
--   role                SELECT   INSERT   UPDATE   DELETE
--   ------------------------------------------------------------------
--   authenticated admin   YES      no       no       no
--   any other authenticated role
--                          no      no       no       no
--   anon                   no      no       no       no
--   service_role          (BYPASSRLS — the only write path)
--
-- Exactly ONE policy exists on this table: an admin-only, SELECT-only USING
-- clause. There is deliberately no WITH CHECK anywhere, so no authenticated
-- role can INSERT/UPDATE/DELETE at all. Every mutation goes through
-- service-role clients inside guarded API routes (A5/A8), which is also where
-- the lead status transition graph is enforced (D-03: the graph lives in
-- lib/pasantias/leads.ts, NOT in SQL — the CHECK below constrains the set of
-- legal statuses, never the legal transitions between them).
--
-- Consent is split evidence (D-12): `consent_accepted_at` / `consent_notice_version`
-- record the REQUIRED processing consent and carry no default — a row cannot
-- exist without the caller stamping real evidence. `marketing_opt_in` is the
-- OPTIONAL, separately evidenced purpose and defaults to false, which asserts
-- nothing; its timestamp/version columns are all-or-nothing via CHECK.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pasantias_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  institution text NOT NULL,
  phone text,
  role_title text,
  message text,
  source_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  notes text,
  num_people integer,
  status text NOT NULL DEFAULT 'new',
  consent_accepted_at timestamp with time zone NOT NULL,
  consent_notice_version text NOT NULL,
  marketing_opt_in boolean DEFAULT false NOT NULL,
  marketing_opt_in_at timestamp with time zone,
  marketing_notice_version text,
  brochure_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT pasantias_leads_email_normalized_check
    CHECK ((email_normalized = lower(btrim(email))) AND (email_normalized <> '')),
  CONSTRAINT pasantias_leads_num_people_check
    CHECK ((num_people IS NULL) OR ((num_people >= 1) AND (num_people <= 60))),
  CONSTRAINT pasantias_leads_status_check
    CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'dismissed'::text])),
  CONSTRAINT pasantias_leads_marketing_consent_check
    CHECK (
      ((marketing_opt_in = false) AND (marketing_opt_in_at IS NULL) AND (marketing_notice_version IS NULL))
      OR
      ((marketing_opt_in = true) AND (marketing_opt_in_at IS NOT NULL) AND (marketing_notice_version IS NOT NULL))
    ),
  CONSTRAINT pasantias_leads_email_cohort_key UNIQUE (email_normalized, cohort)
);

CREATE INDEX IF NOT EXISTS pasantias_leads_status_idx
  ON public.pasantias_leads USING btree (status);

CREATE INDEX IF NOT EXISTS pasantias_leads_created_idx
  ON public.pasantias_leads USING btree (created_at DESC);

CREATE OR REPLACE TRIGGER trg_pasantias_leads_updated_at
  BEFORE UPDATE ON public.pasantias_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pasantias_leads ENABLE ROW LEVEL SECURITY;

-- The single policy. Created conditionally so the migration is re-runnable
-- without ever dropping an existing policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'pasantias_leads'
       AND policyname = 'pasantias_leads_admin_select'
  ) THEN
    CREATE POLICY "pasantias_leads_admin_select" ON public.pasantias_leads
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1
          FROM public.user_roles ur
         WHERE ur.user_id = auth.uid()
           AND ur.role_type = 'admin'::public.user_role_type
           AND ur.is_active = true
      ));
  END IF;
END
$$;

COMMENT ON TABLE public.pasantias_leads IS
  'Interest leads for Pasantías INSPIRA. Admin-readable only; every write goes through service-role API routes (D-04). Status transitions are enforced in lib/pasantias/leads.ts, not in SQL (D-03).';

COMMENT ON COLUMN public.pasantias_leads.consent_accepted_at IS
  'REQUIRED processing consent evidence (D-12). No default: the write path must stamp it.';

COMMENT ON COLUMN public.pasantias_leads.marketing_opt_in IS
  'OPTIONAL marketing purpose (D-12). Defaults to false, which asserts no consent; only opted-in leads may ever reach Correos.';
