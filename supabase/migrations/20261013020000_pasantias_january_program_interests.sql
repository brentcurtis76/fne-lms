-- =============================================================================
-- pasantias_lead_program_interests — January (enero-2027) program interests.
-- PASANT-B002a, dormant: docs/plan/evidence/pasant-january/b002-database-contract.md
-- One contact per (email_normalized, cohort) stays in public.pasantias_leads;
-- each January program a contact asks about (inspira, mirada-profunda) is one
-- interest row with its own consent evidence and its own 24 h reply claim.
-- Adult professional contact data only; no minor data.
--
-- Additive only: one UNIQUE (id, cohort) on pasantias_leads (no column, row,
-- default, policy or grant of that table changes), one new table and three
-- service-role RPCs (no caller yet; B002b wires them). Nothing is dropped,
-- truncated or destructively altered. Rollback is FORWARD-ONLY: stop the
-- callers, then ship a follow-up migration.
--
-- ACCESS MATRIX (D-04 grant-list; RLS decides rows of the surviving SELECT)
--   role           table privileges            rows                 RPC EXECUTE
--   PUBLIC, anon   none (REVOKE ALL)            -                    none
--   authenticated  SELECT                       active admin only    none
--   service_role   SELECT/INSERT/UPDATE/DELETE  BYPASSRLS            all three
-- The restrictive forced_password_change_guard narrows a flagged admin to 0
-- rows. All functions are SECURITY INVOKER with search_path = ''.
-- =============================================================================

ALTER TABLE public.pasantias_leads ADD CONSTRAINT pasantias_leads_id_cohort_key UNIQUE (id, cohort);

CREATE TABLE public.pasantias_lead_program_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  cohort text NOT NULL,
  program text NOT NULL,
  consent_accepted_at timestamptz NOT NULL,
  consent_notice_version text NOT NULL,
  reply_claimed_at timestamptz NULL,          -- claim time, NOT a delivery stamp
  reply_claim_token uuid NULL,                -- owner of the open claim
  reply_claim_previous_at timestamptz NULL,   -- reply_claimed_at before the open claim
  reply_provider_accepted_at timestamptz NULL, -- provider accepted; never mailbox delivery
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pasantias_lead_program_interests_lead_fkey FOREIGN KEY (lead_id, cohort)
    REFERENCES public.pasantias_leads (id, cohort) ON DELETE CASCADE,
  CONSTRAINT pasantias_lead_program_interests_identity_check
    CHECK (cohort = 'enero-2027' AND program IN ('inspira', 'mirada-profunda')),
  CONSTRAINT pasantias_lead_program_interests_notice_version_check
    CHECK (char_length(consent_notice_version) BETWEEN 1 AND 64),
  CONSTRAINT pasantias_lead_program_interests_claim_token_check
    CHECK (reply_claim_token IS NULL OR reply_claimed_at IS NOT NULL),
  CONSTRAINT pasantias_lead_program_interests_claim_previous_check
    CHECK (reply_claim_previous_at IS NULL OR reply_claim_token IS NOT NULL),
  CONSTRAINT pasantias_lead_program_interests_lead_program_key UNIQUE (lead_id, program)
);

CREATE TRIGGER trg_pasantias_lead_program_interests_updated_at
  BEFORE UPDATE ON public.pasantias_lead_program_interests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pasantias_lead_program_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY pasantias_lead_program_interests_admin_select ON public.pasantias_lead_program_interests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role_type = 'admin'::public.user_role_type
       AND ur.is_active = true
  ));

SELECT public.apply_forced_password_change_guard('public', 'pasantias_lead_program_interests');

REVOKE ALL ON TABLE public.pasantias_lead_program_interests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.pasantias_lead_program_interests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pasantias_lead_program_interests TO service_role;

COMMENT ON TABLE public.pasantias_lead_program_interests IS
  'January (enero-2027) program interests of a pasantias_leads contact: per-program consent evidence and 24 h reply claim. Admin-readable; written only by service-role RPCs (D-04). reply_* columns never mean mailbox delivery.';

-- -----------------------------------------------------------------------------
-- Submission: validate everything, then upsert the contact and the interest.
-- Contact semantics mirror pages/api/pasantias/lead.ts (contactColumns,
-- marketingColumns, sourcePathColumns, D-03 dismissed -> new); notes and
-- brochure_sent_at are never written.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_submit_program_interest(
  p_cohort text, p_program text, p_first_name text, p_last_name text, p_email text,
  p_institution text, p_phone text, p_role_title text, p_num_people integer, p_message text,
  p_source_path text, p_utm_source text, p_utm_medium text, p_utm_campaign text,
  p_processing_consent boolean, p_consent_notice_version text,
  p_marketing_opt_in boolean, p_marketing_notice_version text)
RETURNS TABLE (lead_id uuid, interest_id uuid, lead_created boolean, interest_created boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  ws constant text := E' \t\n\r\f\x0B';
  v_first text := nullif(btrim(p_first_name, ws), '');
  v_last text := nullif(btrim(p_last_name, ws), '');
  v_email text := nullif(btrim(p_email, ws), '');
  v_inst text := nullif(btrim(p_institution, ws), '');
  v_phone text := nullif(btrim(p_phone, ws), '');
  v_role text := nullif(btrim(p_role_title, ws), '');
  v_msg text := nullif(btrim(p_message, ws), '');
  v_utm_s text := nullif(btrim(p_utm_source, ws), '');
  v_utm_m text := nullif(btrim(p_utm_medium, ws), '');
  v_utm_c text := nullif(btrim(p_utm_campaign, ws), '');
  v_path text := nullif(p_source_path, '');   -- raw: surrounding whitespace is a refusal
  v_cver text := nullif(btrim(p_consent_notice_version, ws), '');
  v_mver text := nullif(btrim(p_marketing_notice_version, ws), '');
  v_bad text;
  v_now timestamptz := now();
  v_lead uuid; v_lead_new boolean; v_int uuid; v_int_new boolean;
BEGIN
  v_bad := CASE
    WHEN p_cohort IS DISTINCT FROM 'enero-2027' OR p_program IS NULL
      OR p_program NOT IN ('inspira', 'mirada-profunda') THEN 'invalid_identity'
    WHEN p_processing_consent IS NOT TRUE THEN 'processing_consent_required'
    WHEN v_cver IS NULL OR char_length(v_cver) > 64 THEN 'invalid_consent_notice_version'
    WHEN v_first IS NULL OR char_length(v_first) > 80 THEN 'invalid_first_name'
    WHEN v_last IS NULL OR char_length(v_last) > 80 THEN 'invalid_last_name'
    WHEN v_email IS NULL OR char_length(v_email) > 140
      OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN 'invalid_email'
    WHEN v_inst IS NULL OR char_length(v_inst) > 140 THEN 'invalid_institution'
    WHEN char_length(v_phone) > 40 THEN 'invalid_phone'
    WHEN char_length(v_role) > 140 THEN 'invalid_role_title'
    WHEN p_num_people NOT BETWEEN 1 AND 60 THEN 'invalid_num_people'
    WHEN char_length(v_msg) > 1000 THEN 'invalid_message'
    WHEN char_length(v_utm_s) > 140 THEN 'invalid_utm_source'
    WHEN char_length(v_utm_m) > 140 THEN 'invalid_utm_medium'
    WHEN char_length(v_utm_c) > 140 THEN 'invalid_utm_campaign'
    WHEN char_length(v_path) > 200 OR left(v_path, 1) <> '/' OR substr(v_path, 2, 1) IN ('/', '\')
      OR v_path ~ '[[:space:][:cntrl:]]' THEN 'invalid_source_path'
    WHEN p_marketing_opt_in IS NULL THEN 'invalid_marketing_opt_in'
    WHEN p_marketing_opt_in AND (v_mver IS NULL OR char_length(v_mver) > 64) THEN 'invalid_marketing_notice_version'
  END;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'pasantias_submit_program_interest: %', v_bad USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pasantias_leads AS l (
    cohort, status, first_name, last_name, email, email_normalized, institution, phone, role_title,
    num_people, message, source_path, utm_source, utm_medium, utm_campaign,
    consent_accepted_at, consent_notice_version, marketing_opt_in, marketing_opt_in_at, marketing_notice_version)
  VALUES (
    p_cohort, 'new', v_first, v_last, v_email, lower(v_email), v_inst, v_phone, v_role,
    p_num_people, v_msg, v_path, v_utm_s, v_utm_m, v_utm_c, v_now, v_cver, p_marketing_opt_in,
    CASE WHEN p_marketing_opt_in THEN v_now END, CASE WHEN p_marketing_opt_in THEN v_mver END)
  ON CONFLICT ON CONSTRAINT pasantias_leads_email_cohort_key DO UPDATE SET
    first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email,
    institution = EXCLUDED.institution, phone = EXCLUDED.phone, role_title = EXCLUDED.role_title,
    num_people = EXCLUDED.num_people, message = EXCLUDED.message, utm_source = EXCLUDED.utm_source,
    utm_medium = EXCLUDED.utm_medium, utm_campaign = EXCLUDED.utm_campaign,
    consent_accepted_at = EXCLUDED.consent_accepted_at, consent_notice_version = EXCLUDED.consent_notice_version,
    marketing_opt_in = CASE WHEN EXCLUDED.marketing_opt_in THEN true ELSE l.marketing_opt_in END,
    marketing_opt_in_at = CASE WHEN EXCLUDED.marketing_opt_in THEN EXCLUDED.marketing_opt_in_at ELSE l.marketing_opt_in_at END,
    marketing_notice_version = CASE WHEN EXCLUDED.marketing_opt_in THEN EXCLUDED.marketing_notice_version
                                    ELSE l.marketing_notice_version END,
    source_path = coalesce(EXCLUDED.source_path, l.source_path),
    status = CASE WHEN l.status = 'dismissed' THEN 'new' ELSE l.status END
  RETURNING l.id, (l.xmax = 0) INTO v_lead, v_lead_new;

  INSERT INTO public.pasantias_lead_program_interests AS i (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
  VALUES (v_lead, p_cohort, p_program, v_now, v_cver)
  ON CONFLICT ON CONSTRAINT pasantias_lead_program_interests_lead_program_key DO UPDATE SET
    consent_accepted_at = EXCLUDED.consent_accepted_at, consent_notice_version = EXCLUDED.consent_notice_version
  RETURNING i.id, (i.xmax = 0) INTO v_int, v_int_new;

  RETURN QUERY SELECT v_lead, v_int, v_lead_new, v_int_new;
END;
$$;

-- -----------------------------------------------------------------------------
-- Reply claim: one conditional UPDATE; claimable when never claimed or the
-- last claim is older than 24 h. pasantias_leads.brochure_sent_at is untouched.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_claim_program_reply(p_interest_id uuid)
RETURNS TABLE (claimed boolean, claim_token uuid, claimed_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_token uuid; v_at timestamptz;
BEGIN
  IF p_interest_id IS NULL THEN RAISE EXCEPTION 'pasantias_claim_program_reply: invalid_interest_id' USING ERRCODE = '22023'; END IF;
  UPDATE public.pasantias_lead_program_interests i
     SET reply_claim_previous_at = i.reply_claimed_at, reply_claimed_at = now(),
         reply_claim_token = gen_random_uuid()
   WHERE i.id = p_interest_id
     AND (i.reply_claimed_at IS NULL OR i.reply_claimed_at < now() - interval '24 hours')
  RETURNING i.reply_claim_token, i.reply_claimed_at INTO v_token, v_at;
  IF v_token IS NULL AND NOT EXISTS (
       SELECT 1 FROM public.pasantias_lead_program_interests i WHERE i.id = p_interest_id) THEN
    RAISE EXCEPTION 'pasantias_claim_program_reply: unknown_interest' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT v_token IS NOT NULL, v_token, v_at;
END;
$$;

-- -----------------------------------------------------------------------------
-- Settle: true only while p_claim_token is the open token. not_sent restores
-- the pre-claim value (claimable again); provider_accepted stamps the provider
-- acceptance and keeps the claim; ambiguous keeps the claim for its 24 h.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pasantias_settle_program_reply(p_interest_id uuid, p_claim_token uuid, p_outcome text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF p_interest_id IS NULL OR p_claim_token IS NULL OR p_outcome IS NULL
     OR p_outcome NOT IN ('not_sent', 'provider_accepted', 'ambiguous') THEN
    RAISE EXCEPTION 'pasantias_settle_program_reply: invalid_argument' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pasantias_lead_program_interests i
     SET reply_claimed_at = CASE WHEN p_outcome = 'not_sent' THEN i.reply_claim_previous_at ELSE i.reply_claimed_at END,
         reply_provider_accepted_at = CASE WHEN p_outcome = 'provider_accepted' THEN now()
                                           ELSE i.reply_provider_accepted_at END,
         reply_claim_token = NULL, reply_claim_previous_at = NULL
   WHERE i.id = p_interest_id AND i.reply_claim_token = p_claim_token;
  IF FOUND THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pasantias_lead_program_interests i WHERE i.id = p_interest_id) THEN
    RAISE EXCEPTION 'pasantias_settle_program_reply: unknown_interest' USING ERRCODE = '22023';
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.pasantias_submit_program_interest(text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, boolean, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_submit_program_interest(text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, boolean, text, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_claim_program_reply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_claim_program_reply(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pasantias_settle_program_reply(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pasantias_settle_program_reply(uuid, uuid, text) TO service_role;
