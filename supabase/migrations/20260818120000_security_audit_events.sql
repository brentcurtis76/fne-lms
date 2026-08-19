-- =============================================================================
-- security_audit_events — the durable trail for security-relevant operations (S3)
--
-- WHY THIS EXISTS. Eight code paths wrote to `public.audit_logs`. That table
-- does not exist and never has: it is absent from the baseline dump, absent from
-- every migration, and absent from the live production schema. PostgREST answers
-- `42P01 relation "public.audit_logs" does not exist`, every call site treats the
-- error as non-fatal ("Continue anyway as this is not critical"), and so the
-- platform has been silently discarding its entire security audit trail —
-- administrative password resets, voluntary password changes, role assignments,
-- e-mail changes and bulk user creation included — while reporting success.
--
-- Additive migration. Creates one table plus its RLS and privilege posture.
-- Nothing is dropped, truncated or destructively altered. Rollback is
-- FORWARD-ONLY: disable the writers, then ship a follow-up migration. Never drop
-- this table — an audit trail you can delete on a bad day is not an audit trail.
--
-- PRIVACY (Ley 21.719). This table holds NO minor data and NO student data, so
-- the Fase 2 consent-record + EIPD gate does not apply to it. What it holds is:
-- pseudonymous `auth.users` identifiers for the actor and the target, the
-- operation, its outcome, an organisational school id, and a small structured
-- metadata object. What it must NEVER hold — passwords, temporary credentials,
-- recovery tokens, invitation/recovery URLs, e-mail bodies, e-mail addresses,
-- API keys — is enforced in TWO layers:
--
--   Layer A (application): `lib/security/audit.ts` recursively strips forbidden
--   keys, redacts URL- and JWT-shaped values, and caps size and depth before the
--   row is built. It is the ONLY module that writes here.
--   Layer B (storage): the `metadata_no_secrets` CHECK below rejects the row
--   outright if a forbidden key appears at the top level. A CHECK cannot be
--   bypassed by a careless call site, a future refactor, or a psql session.
--
-- NO FOREIGN KEYS to auth.users, deliberately. ON DELETE CASCADE would let
-- deleting a user erase the evidence of what was done to (or by) that user —
-- exactly the event most worth keeping. ON DELETE RESTRICT would make the audit
-- trail block `delete-user.ts` and `teardownPlatformUser`. Both are wrong, so the
-- identifiers are stored as plain uuids and may outlive the accounts.
--
-- ACCESS MATRIX. Two layers, because RLS is not the write boundary: TRUNCATE is
-- a GRANT-level privilege that row-level security never evaluates, and Supabase's
-- default privileges hand it to `anon` and `authenticated` on every new public
-- table.
--
--   LAYER 1 — GRANTs, expressed as a grant-LIST (revoke all, then hand back only
--   what is needed) rather than an enumerated revoke. A privilege that does not
--   exist yet — PostgreSQL 17 added MAINTAIN — lands on the revoked side by
--   construction.
--
--   role            SELECT  INSERT  UPDATE  DELETE  TRUNCATE  REFERENCES/TRIGGER
--   ----------------------------------------------------------------------------
--   anon              no      no      no      no       no            no
--   authenticated     YES     no      no      no       no            no
--   service_role      YES     YES     YES     YES      YES           YES
--
--   LAYER 2 — RLS (which rows the surviving SELECT may read):
--
--   role                              SELECT   INSERT   UPDATE   DELETE
--   ------------------------------------------------------------------
--   authenticated admin                 YES      no       no       no
--   any other authenticated role         no      no       no       no
--   anon                                 no      no       no       no
--   service_role                  (BYPASSRLS — the only write path)
--
-- Exactly ONE policy: admin-only, SELECT-only, with no WITH CHECK anywhere, so
-- no authenticated role has an INSERT/UPDATE/DELETE path at all. Append-only is
-- the intent for service_role too; UPDATE/DELETE are granted solely so a future
-- retention policy can prune by age, and no application code path uses them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),

  -- The operation. Typed, not free text: triage indexes on the value, and a
  -- typo in a call site must fail the write rather than create a new category
  -- nobody queries. The TypeScript union in lib/security/audit.ts mirrors this
  -- list exactly and __tests__/lib/security/audit-actions.test.ts parses this
  -- file to prove the two have not drifted.
  action text NOT NULL,

  -- What happened. `partial_failure` is a first-class outcome because the
  -- operations here are multi-step: an administrative reset that changes the
  -- password but fails to persist the forced-change flag is neither a success
  -- nor a clean failure, and recording it as either would be a lie.
  outcome text NOT NULL,

  actor_user_id uuid,
  actor_role text,
  target_user_id uuid,
  school_id integer,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT security_audit_events_action_check CHECK (action = ANY (ARRAY[
    'password_reset_admin'::text,
    'password_change_voluntary'::text,
    'password_change_forced'::text,
    'password_change_recovery'::text,
    'user_created_manual'::text,
    'user_created_bulk'::text,
    'bulk_credentials_delivered'::text,
    'user_updated'::text,
    'user_email_changed'::text,
    'profile_rollback_skipped'::text,
    'role_assigned'::text,
    'role_removed'::text,
    'access_granted_new_user'::text,
    'access_granted_existing_user'::text,
    'invitation_sent'::text,
    'invitation_resent'::text,
    'qa_tester_status_changed'::text,
    'meeting_deleted'::text
  ])),

  CONSTRAINT security_audit_events_outcome_check CHECK (outcome = ANY (ARRAY[
    'success'::text,
    'failure'::text,
    'denied'::text,
    'partial_failure'::text
  ])),

  CONSTRAINT security_audit_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),

  -- Layer B of the privacy guarantee. Top-level keys only — a recursive check
  -- would have to be a function call inside a CHECK, which is not IMMUTABLE and
  -- cannot be trusted across a dump/restore. The recursive strip lives in
  -- lib/security/audit.ts; this is the floor beneath it, and it is the layer a
  -- careless call site cannot talk its way past.
  CONSTRAINT security_audit_events_metadata_no_secrets_check CHECK (
    NOT (metadata ?| ARRAY[
      'password', 'contrasena', 'temporary_password', 'temporaryPassword',
      'new_password', 'newPassword', 'current_password', 'currentPassword',
      'credential', 'credentials',
      'token', 'token_hash', 'tokenHash', 'access_token', 'refresh_token',
      'action_link', 'actionLink', 'recovery_url', 'recoveryUrl', 'reset_url',
      'secret', 'api_key', 'apiKey', 'authorization', 'cookie',
      'email', 'email_address', 'emailAddress', 'to', 'from',
      'html', 'body', 'email_body'
    ])
  )
);

-- Triage reads: "what happened lately", "what happened to this account", and
-- "every event of this kind". The (target_user_id, action, occurred_at) index is
-- load-bearing rather than speculative — the invitation-resend rate limiter
-- (S7) queries exactly that shape on every request.
CREATE INDEX IF NOT EXISTS security_audit_events_occurred_idx
  ON public.security_audit_events USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS security_audit_events_target_action_idx
  ON public.security_audit_events USING btree (target_user_id, action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS security_audit_events_action_idx
  ON public.security_audit_events USING btree (action, occurred_at DESC);

ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;

-- Created conditionally so the migration is re-runnable without ever dropping an
-- existing policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'security_audit_events'
       AND policyname = 'security_audit_events_admin_select'
  ) THEN
    CREATE POLICY "security_audit_events_admin_select" ON public.security_audit_events
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

-- Grant-list form: revoke everything from both public roles, then grant back the
-- single privilege `authenticated` needs so the admin policy has something to
-- govern. Idempotent and additive — revoking an inherited grant drops no object
-- and no data. `service_role` is untouched: it is the only write path.
REVOKE ALL ON public.security_audit_events FROM anon;
REVOKE ALL ON public.security_audit_events FROM authenticated;
GRANT SELECT ON public.security_audit_events TO authenticated;

COMMENT ON TABLE public.security_audit_events IS
  'Durable trail for security-relevant operations (S3). Replaces eight writers that targeted the non-existent public.audit_logs and therefore recorded nothing. Admin-readable only; every write goes through lib/security/audit.ts on a service-role client. anon holds no privilege at all and authenticated holds SELECT only, so TRUNCATE cannot bypass the policy. Holds no student or minor data — pseudonymous auth.users ids, the operation, its outcome and structured metadata. Passwords, credentials, tokens, recovery URLs, e-mail bodies and e-mail addresses are refused at the storage layer by the metadata_no_secrets CHECK. No FK to auth.users, so deleting an account can neither erase nor be blocked by its audit trail.';

COMMENT ON COLUMN public.security_audit_events.action IS
  'Typed operation identifier. The CHECK constraint is the source of truth; the TypeScript union in lib/security/audit.ts mirrors it and a unit test parses this migration to prove they agree.';

COMMENT ON COLUMN public.security_audit_events.outcome IS
  'success | failure | denied | partial_failure. partial_failure exists because these operations are multi-step: a reset that changed the password but failed to persist the forced-change flag is neither a success nor a clean failure.';

COMMENT ON COLUMN public.security_audit_events.metadata IS
  'Structured, non-sensitive context only. Forbidden top-level keys are rejected by CHECK; lib/security/audit.ts additionally strips them recursively and redacts URL- and JWT-shaped values.';
