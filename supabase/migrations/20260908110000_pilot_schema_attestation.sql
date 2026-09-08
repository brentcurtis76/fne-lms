-- =============================================================================
-- 20260908110000_pilot_schema_attestation.sql — Procesos de Cambio review
-- remediation (R10): versioned, read-only schema attestation for the pilot
-- provisioning tooling. Additive and idempotent.
--
-- WHAT THIS ADDS
--   public.pilot_schema_attestation() RETURNS jsonb
--
--   A STABLE, SECURITY INVOKER catalog read that describes — deterministically,
--   with every list ordered — the exact database objects the pilot
--   provisioner depends on:
--     * the required tables: columns (name, type, not-null, default), whether
--       RLS is enabled / forced, every policy (command, permissive, roles,
--       USING, WITH CHECK), the table privileges of anon / authenticated /
--       service_role, every unique index definition, every non-internal
--       trigger definition and its enabled state, and every foreign key the
--       table declares;
--     * every foreign key ANYWHERE in `public` that references one of the
--       required tables (the cascade / restrict graph the synthetic reset
--       must inventory, R9);
--     * the required functions: identity arguments, return type, language,
--       SECURITY DEFINER flag, volatility, proconfig (search_path), the md5 of
--       the body, and their EXECUTE privileges.
--   The tooling hashes the canonical JSON of this payload and compares it
--   with the digest committed in config/pilot-schema-attestation.json: any
--   drift — a missing migration, a changed policy, a dropped grant, a new
--   cascade edge — is a stop before apply / reset / verify may proceed.
--
-- WHAT IT NEVER RETURNS
--   No row data, no secrets, no connection details, no auth schema content:
--   catalog definitions of `public` objects only. Column defaults and policy
--   expressions are the migration-authored expressions.
--
-- PRIVILEGES (least privilege)
--   EXECUTE is granted to service_role ONLY. anon and authenticated hold no
--   privilege: the provisioner runs with the service role after the target
--   guard accepted the target; nothing else needs the catalog picture.
--
-- RECOVERY
--   CREATE OR REPLACE FUNCTION in place. Changing this function's own body
--   changes the attestation digest (it attests itself), which is intended:
--   a new attestation version is a new expected digest.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pilot_schema_attestation()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
WITH required_tables(name) AS (
  VALUES
    ('schools'), ('ab_grades'), ('ab_migration_plan'),
    ('assessment_templates'), ('assessment_template_snapshots'),
    ('assessment_objectives'), ('assessment_modules'), ('assessment_indicators'),
    ('assessment_sub_questions'), ('assessment_year_expectations'),
    ('assessment_entity_year_weights'), ('assessment_context_questions'),
    ('assessment_demo_access'), ('assessment_instances'),
    ('assessment_instance_assignees'), ('assessment_responses'),
    ('school_course_structure'), ('school_course_docente_assignments'),
    ('school_transversal_context'), ('profiles'), ('user_roles')
),
required_functions(name) AS (
  VALUES
    ('auth_is_assessment_admin'), ('auth_is_school_directivo'),
    ('assessment_instance_progress_flags'), ('replace_course_docente'),
    ('save_transversal_context'), ('transversal_grade_sort_order'),
    ('pilot_schema_attestation')
),
tbl AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN (SELECT name FROM required_tables)
),
cols AS (
  SELECT a.attrelid,
         jsonb_agg(jsonb_build_object(
           'name', a.attname,
           'type', format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'default', pg_get_expr(d.adbin, d.adrelid)
         ) ORDER BY a.attnum) AS columns
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid IN (SELECT oid FROM tbl) AND a.attnum > 0 AND NOT a.attisdropped
   GROUP BY a.attrelid
),
pols AS (
  SELECT p.polrelid,
         jsonb_agg(jsonb_build_object(
           'name', p.polname,
           'command', p.polcmd,
           'permissive', p.polpermissive,
           'roles', CASE WHEN p.polroles = '{0}'::oid[] THEN ARRAY['public']
                         ELSE (SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY (p.polroles)) END,
           'using', pg_get_expr(p.polqual, p.polrelid),
           'with_check', pg_get_expr(p.polwithcheck, p.polrelid)
         ) ORDER BY p.polname) AS policies
    FROM pg_policy p
   WHERE p.polrelid IN (SELECT oid FROM tbl)
   GROUP BY p.polrelid
),
fk_rows AS (
  SELECT c.oid AS conoid, c.conname, c.conrelid, c.confrelid,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS columns,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS ref_columns,
         CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                            WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
         CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                            WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
),
fks AS (
  SELECT f.conrelid,
         jsonb_agg(jsonb_build_object(
           'name', f.conname,
           'columns', to_jsonb(f.columns),
           'references', f.confrelid::regclass::text,
           'ref_columns', to_jsonb(f.ref_columns),
           'on_delete', f.on_delete,
           'on_update', f.on_update
         ) ORDER BY f.conname) AS foreign_keys
    FROM fk_rows f
   WHERE f.conrelid IN (SELECT oid FROM tbl)
   GROUP BY f.conrelid
),
referencing AS (
  SELECT jsonb_agg(jsonb_build_object(
           'name', f.conname,
           'child', f.conrelid::regclass::text,
           'columns', to_jsonb(f.columns),
           'parent', f.confrelid::regclass::text,
           'ref_columns', to_jsonb(f.ref_columns),
           'on_delete', f.on_delete,
           'on_update', f.on_update
         ) ORDER BY f.confrelid::regclass::text, f.conrelid::regclass::text, f.conname) AS edges
    FROM fk_rows f
   WHERE f.confrelid IN (SELECT oid FROM tbl)
),
grants AS (
  SELECT g.table_name,
         jsonb_agg(jsonb_build_object('grantee', g.grantee, 'privilege', g.privilege_type)
                   ORDER BY g.grantee, g.privilege_type) AS privileges
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name IN (SELECT relname FROM tbl)
     AND g.grantee IN ('anon', 'authenticated', 'service_role')
   GROUP BY g.table_name
),
uidx AS (
  SELECT i.tablename,
         jsonb_agg(jsonb_build_object('name', i.indexname, 'definition', i.indexdef) ORDER BY i.indexname) AS unique_indexes
    FROM pg_indexes i
   WHERE i.schemaname = 'public'
     AND i.tablename IN (SELECT relname FROM tbl)
     AND i.indexdef LIKE 'CREATE UNIQUE INDEX%'
   GROUP BY i.tablename
),
trg AS (
  SELECT t.tgrelid,
         jsonb_agg(jsonb_build_object(
           'name', t.tgname,
           'enabled', t.tgenabled,
           'definition', pg_get_triggerdef(t.oid)
         ) ORDER BY t.tgname) AS triggers
    FROM pg_trigger t
   WHERE t.tgrelid IN (SELECT oid FROM tbl) AND NOT t.tgisinternal
   GROUP BY t.tgrelid
),
tables_json AS (
  SELECT jsonb_agg(jsonb_build_object(
           'name', t.relname,
           'rls_enabled', t.relrowsecurity,
           'rls_forced', t.relforcerowsecurity,
           'columns', COALESCE(c.columns, '[]'::jsonb),
           'policies', COALESCE(p.policies, '[]'::jsonb),
           'privileges', COALESCE(g.privileges, '[]'::jsonb),
           'foreign_keys', COALESCE(f.foreign_keys, '[]'::jsonb),
           'unique_indexes', COALESCE(u.unique_indexes, '[]'::jsonb),
           'triggers', COALESCE(tr.triggers, '[]'::jsonb)
         ) ORDER BY t.relname) AS tables
    FROM tbl t
    LEFT JOIN cols c ON c.attrelid = t.oid
    LEFT JOIN pols p ON p.polrelid = t.oid
    LEFT JOIN grants g ON g.table_name = t.relname
    LEFT JOIN fks f ON f.conrelid = t.oid
    LEFT JOIN uidx u ON u.tablename = t.relname
    LEFT JOIN trg tr ON tr.tgrelid = t.oid
),
fn AS (
  SELECT p.oid, p.proname,
         pg_get_function_identity_arguments(p.oid) AS identity_arguments,
         pg_get_function_result(p.oid) AS returns,
         l.lanname AS language,
         p.prosecdef AS security_definer,
         p.provolatile AS volatility,
         p.proconfig AS config,
         md5(p.prosrc) AS body_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname IN (SELECT name FROM required_functions)
),
fn_grants AS (
  SELECT rg.specific_name,
         jsonb_agg(jsonb_build_object('grantee', rg.grantee, 'privilege', rg.privilege_type)
                   ORDER BY rg.grantee, rg.privilege_type) AS privileges
    FROM information_schema.role_routine_grants rg
   WHERE rg.specific_schema = 'public'
     AND rg.grantee IN ('anon', 'authenticated', 'service_role')
   GROUP BY rg.specific_name
),
functions_json AS (
  SELECT jsonb_agg(jsonb_build_object(
           'name', f.proname,
           'arguments', f.identity_arguments,
           'returns', f.returns,
           'language', f.language,
           'security_definer', f.security_definer,
           'volatility', f.volatility,
           'config', to_jsonb(f.config),
           'body_md5', f.body_md5,
           'privileges', COALESCE(g.privileges, '[]'::jsonb)
         ) ORDER BY f.proname, f.identity_arguments) AS functions
    FROM fn f
    LEFT JOIN fn_grants g ON g.specific_name = f.proname || '_' || f.oid::text
)
SELECT jsonb_build_object(
  'attestation_version', 1,
  'missing_tables', COALESCE((SELECT jsonb_agg(r.name ORDER BY r.name) FROM required_tables r
                               WHERE r.name NOT IN (SELECT relname FROM tbl)), '[]'::jsonb),
  'missing_functions', COALESCE((SELECT jsonb_agg(r.name ORDER BY r.name) FROM required_functions r
                                  WHERE r.name NOT IN (SELECT proname FROM fn)), '[]'::jsonb),
  'tables', COALESCE((SELECT tables FROM tables_json), '[]'::jsonb),
  'referencing_foreign_keys', COALESCE((SELECT edges FROM referencing), '[]'::jsonb),
  'functions', COALESCE((SELECT functions FROM functions_json), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.pilot_schema_attestation() IS
  'Read-only, deterministic catalog description of the objects the pilot provisioning tooling depends on (tables, columns, RLS, policies, privileges, unique indexes, triggers, foreign keys, required functions). The tooling hashes it and refuses to proceed on drift. Returns no row data.';

REVOKE ALL ON FUNCTION public.pilot_schema_attestation() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_schema_attestation() TO service_role;
