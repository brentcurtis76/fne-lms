-- =============================================================================
-- 20261124200100_email_lists_and_members.sql — Correos release 1, phase 2
--
-- Lists, list memberships, the one settings row, and the "erased" mark on the
-- block list. Part of the generic email kit: every name is `email_...`; no key,
-- rule or function here names a host table (the single admin SELECT rule uses
-- the same words as the five live email tables' rule, as the house requires).
--
-- ACCESS (the same posture as 20260803170000_add_email_marketing_tables.sql)
--   anon            nothing at all
--   authenticated   SELECT only; the one permissive rule lets an active admin
--                   read; everyone else reads zero rows. No write rule exists.
--   service_role    SELECT, INSERT, UPDATE only. DELETE and TRUNCATE are
--                   revoked from it too: a list, a membership and the settings
--                   row are never deleted (a list is retired by archived_at; a
--                   membership ends by state = 'unsubscribed').
--   Every table carries the forced_password_change_guard (test 053).
--
-- CONSENT / BASIS COLUMNS CARRY NO DEFAULTS. `legal_basis`, `basis_note`,
-- `basis_recorded_at`, `consent_notice_version`, `state` and `joined_via` on
-- email_list_members have no default: a default would let the database assert
-- a reason or a subscription nobody gave. `is_public` defaults to false (the
-- safe value; it asserts no consent).
--
-- THE BLOCK LIST GAINS "ERASED" WITHOUT CHANGING A RULE. The preferred change
-- (replacing email_suppression_reason_check and
-- email_contacts_suppression_reason_check with the same lists plus 'erased')
-- needs a DROP CONSTRAINT, which scripts/ci/check-destructive-migrations.mjs
-- refuses (rule DROP). So, as the brief's fallback says: the two rules stay as
-- they are, email_suppression gains a nullable `erased_at` (and `erased_by`,
-- the acting admin), and an erasure is stored with reason 'manual' and
-- erased_at set. "Erased" = erased_at IS NOT NULL.
--
-- Additive only: CREATE TABLE / INDEX / TRIGGER / POLICY, ADD COLUMN, GRANT,
-- REVOKE, and one seed row of settings. No DROP, no rename, no type change.
-- =============================================================================


-- =============================================================================
-- 1. email_lists
-- =============================================================================
CREATE TABLE public.email_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  archived_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  -- The name as it is compared: without case or surrounding spaces. Kept by
  -- the database, never written by anyone.
  name_norm text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  CONSTRAINT email_lists_name_check CHECK (btrim(name) <> ''::text AND char_length(name) <= 200),
  -- Two lists cannot share a name compared without case or surrounding spaces.
  -- Declared with the table it guards: the table is new, so no row can break it.
  CONSTRAINT email_lists_name_key UNIQUE (name_norm)
);

CREATE TRIGGER trg_email_lists_updated_at
  BEFORE UPDATE ON public.email_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 2. email_list_members — one person on one list, with the reason for THIS
--    membership
-- =============================================================================
CREATE TABLE public.email_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.email_lists(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES public.email_contacts(id) ON DELETE RESTRICT,
  state text NOT NULL,
  joined_via text NOT NULL,
  legal_basis text NOT NULL,
  basis_note text,
  basis_recorded_at timestamp with time zone NOT NULL,
  consent_notice_version text,
  added_by uuid,
  subscribed_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  unsubscribed_by text,
  confirmation_token uuid,
  confirmation_sent_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_list_members_list_contact_key UNIQUE (list_id, contact_id),
  CONSTRAINT email_list_members_confirmation_token_key UNIQUE (confirmation_token),
  CONSTRAINT email_list_members_state_check
    CHECK (state::text = ANY (ARRAY['pending'::text, 'subscribed'::text, 'unsubscribed'::text])),
  CONSTRAINT email_list_members_joined_via_check
    CHECK (joined_via::text = ANY (ARRAY[
      'manual'::text, 'csv_import'::text, 'profiles'::text, 'pasantia_leads'::text, 'signup_form'::text
    ])),
  CONSTRAINT email_list_members_legal_basis_check
    CHECK (legal_basis::text = ANY (ARRAY[
      'consent_form'::text, 'customer_relationship'::text, 'manual_verified'::text
    ])),
  -- A consent-form basis is only evidence if the notice version is recorded.
  CONSTRAINT email_list_members_consent_version_check
    CHECK ((legal_basis::text <> 'consent_form'::text) OR (consent_notice_version IS NOT NULL)),
  CONSTRAINT email_list_members_unsubscribed_by_check
    CHECK ((unsubscribed_by IS NULL) OR (unsubscribed_by::text = ANY (ARRAY['person'::text, 'admin'::text]))),
  -- A state carries its own date.
  CONSTRAINT email_list_members_subscribed_shape_check
    CHECK ((state::text <> 'subscribed'::text) OR (subscribed_at IS NOT NULL)),
  CONSTRAINT email_list_members_unsubscribed_shape_check
    CHECK ((state::text <> 'unsubscribed'::text) OR (unsubscribed_at IS NOT NULL))
);

-- "Members of a list by state" and "memberships of a contact".
CREATE INDEX email_list_members_list_state_idx
  ON public.email_list_members USING btree (list_id, state);

CREATE INDEX email_list_members_contact_idx
  ON public.email_list_members USING btree (contact_id);

CREATE TRIGGER trg_email_list_members_updated_at
  BEFORE UPDATE ON public.email_list_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 3. email_settings — exactly one row
-- =============================================================================
CREATE TABLE public.email_settings (
  id boolean PRIMARY KEY DEFAULT true,
  daily_limit integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_settings_single_row_check CHECK (id),
  CONSTRAINT email_settings_daily_limit_check CHECK (daily_limit > 0)
);

CREATE TRIGGER trg_email_settings_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.email_settings (id, daily_limit)
VALUES (true, 500)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 4. email_suppression: the erased mark (see the header)
-- =============================================================================
ALTER TABLE public.email_suppression
  ADD COLUMN IF NOT EXISTS erased_at timestamp with time zone;

ALTER TABLE public.email_suppression
  ADD COLUMN IF NOT EXISTS erased_by uuid;


-- =============================================================================
-- 5. Row security, the one admin read rule, privileges
-- =============================================================================
ALTER TABLE public.email_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_lists        FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_list_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_settings     FROM anon, authenticated;

GRANT SELECT ON TABLE public.email_lists        TO authenticated;
GRANT SELECT ON TABLE public.email_list_members TO authenticated;
GRANT SELECT ON TABLE public.email_settings     TO authenticated;

-- Nothing is ever deleted from these three, not even by the server.
REVOKE DELETE, TRUNCATE ON TABLE public.email_lists        FROM service_role;
REVOKE DELETE, TRUNCATE ON TABLE public.email_list_members FROM service_role;
REVOKE DELETE, TRUNCATE ON TABLE public.email_settings     FROM service_role;

SELECT public.apply_forced_password_change_guard('public', 'email_lists');
SELECT public.apply_forced_password_change_guard('public', 'email_list_members');
SELECT public.apply_forced_password_change_guard('public', 'email_settings');

CREATE POLICY email_lists_admin_select ON public.email_lists
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role_type = 'admin'::public.user_role_type
       AND ur.is_active = true));

CREATE POLICY email_list_members_admin_select ON public.email_list_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role_type = 'admin'::public.user_role_type
       AND ur.is_active = true));

CREATE POLICY email_settings_admin_select ON public.email_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role_type = 'admin'::public.user_role_type
       AND ur.is_active = true));


-- =============================================================================
-- 6. Documentation
-- =============================================================================
COMMENT ON TABLE public.email_lists IS
  'Correos mailing lists. Admin-readable only; written by the server with the service role (create, rename, describe, public or not, archive). A list is never deleted: no function deletes one, and DELETE/TRUNCATE are revoked even from service_role; archived_at retires it. Names are unique compared as lower(btrim(name)): the stored column name_norm holds that form and carries the unique key email_lists_name_key.';

COMMENT ON COLUMN public.email_lists.name_norm IS
  'The list name as it is compared for uniqueness, lower(btrim(name)). Generated and stored by the database; never written directly.';

COMMENT ON COLUMN public.email_lists.is_public IS
  'Whether people may see and join this list themselves (release 2). Defaults to false, the safe value; it asserts no consent.';

COMMENT ON TABLE public.email_list_members IS
  'One contact on one list, with the reason for THIS membership (legal_basis, basis_note, basis_recorded_at, consent_notice_version: no defaults). state pending|subscribed|unsubscribed; unsubscribed_by person|admin tells "left by their own choice" apart. Written by email_add_contacts and email_erase_contact (and the server); never deleted.';

COMMENT ON COLUMN public.email_list_members.legal_basis IS
  'Lawful basis for this membership. NOT NULL with NO DEFAULT: a default would let the database manufacture a legal basis. consent_form additionally requires consent_notice_version.';

COMMENT ON COLUMN public.email_list_members.basis_recorded_at IS
  'When the basis of this membership was recorded. NOT NULL with NO DEFAULT: the write path stamps real evidence.';

COMMENT ON COLUMN public.email_list_members.basis_note IS
  'Free-text evidence for the basis of this membership. NULLed by email_erase_contact, as it can name a person.';

COMMENT ON COLUMN public.email_list_members.confirmation_token IS
  'Double opt-in token (release 2). Unique when set; NULLed when the membership ends by erasure.';

COMMENT ON TABLE public.email_settings IS
  'Correos settings: exactly one row (id = true). daily_limit > 0, seeded with 500. Admin-readable; written by the server with the service role; never deleted.';

COMMENT ON COLUMN public.email_suppression.erased_at IS
  'Stamped when the address behind this fingerprint was erased by email_erase_contact. The reason rules were not widened (that would need removing and recreating a constraint, which the additive guard refuses), so an erasure is stored with reason ''manual'' and erased_at set; a block that existed before keeps its reason and gains erased_at. Never cleared.';

COMMENT ON COLUMN public.email_suppression.erased_by IS
  'The admin who erased the person (the acting admin passed to email_erase_contact). Names the admin, never the erased person.';
