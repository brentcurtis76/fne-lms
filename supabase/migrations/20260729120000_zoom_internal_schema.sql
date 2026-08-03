-- =============================================================================
-- zoom_internal schema + lockdown (Zoom plan §6 access mechanics, Z1b-1)
--
-- The schema holds every Zoom-credential-shaped object (tokens, meeting
-- numbers, plaintext passcodes, join URLs, raw transcripts, jobs). It IS
-- exposed to PostgREST locally (supabase/config.toml [api].schemas) so the
-- service-role client can address it via serviceClient.schema('zoom_internal'),
-- but access is denied by GRANTS, not by the exposure list:
--   - REVOKE ALL from PUBLIC / anon / authenticated on the schema and on all
--     current + future objects (ALTER DEFAULT PRIVILEGES);
--   - GRANT USAGE + ALL to service_role only;
--   - RLS enabled with ZERO policies on every table (belt-and-braces —
--     service_role bypasses RLS; nobody else can even reach the schema).
-- pgTAP suite 002-zoom-internal-isolation.sql proves the denial.
-- PRODUCTION exposure of the schema is an ops checklist item at release
-- (§16) — this migration only manages grants, never API config.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS zoom_internal;

ALTER SCHEMA zoom_internal OWNER TO postgres;

-- Deny-by-grants: nothing for PUBLIC, anon, authenticated -----------------------
REVOKE ALL ON SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;

-- Future objects created by postgres in this schema inherit the denial.
-- (Per-schema default-privilege entries are additive to global ones, so each
-- later migration in this schema ALSO re-runs explicit blanket REVOKEs after
-- creating its objects — the pgTAP grants check is the enforcing proof.)
ALTER DEFAULT PRIVILEGES IN SCHEMA zoom_internal
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA zoom_internal
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA zoom_internal
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- service_role is the only consumer -------------------------------------------
GRANT USAGE ON SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA zoom_internal
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA zoom_internal
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA zoom_internal
  GRANT ALL ON FUNCTIONS TO service_role;

COMMENT ON SCHEMA zoom_internal IS
  'Private Zoom integration schema (plan §6). Service-role only: denied to anon/authenticated by grants; RLS-with-zero-policies on every table as belt-and-braces. Locally exposed to PostgREST via config.toml; production exposure is a release ops item (§16).';
