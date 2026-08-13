-- =============================================================================
-- 20260813120400_override_audit_write_privileges.sql — Z7 R7
--
-- The audit ledger is written only by the owner-executed SECURITY DEFINER RPC.
-- RLS is not a boundary for service_role, so table privileges must also deny every
-- exposed role a direct mutation path. SELECT grants/policies are intentionally
-- unchanged. This is additive privilege hardening; no historical migration moves.
-- =============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON TABLE public.session_hour_overrides
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.session_hour_overrides IS
  'Append-only §11 admin hour-override audit. SELECT remains policy-controlled; INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER are revoked from every exposed role. Only owner-executed apply_session_hour_override may append an actor-bound event.';
