-- Delta 67 infrastructure (12 Oct 2026): the first database item, published through the same Publish path it enables.
-- Additive only. The publisher recognises this file by its exact SHA-256 (its own installed copy): it is the one release
-- allowed to run while pm_publish.pending does not exist yet.
--
-- pm_publish.pending   the cross-host reservation: a release whose database changes are in Production but whose code is
--                      not merged yet. While a row exists for a project, no other release of it may apply anything.
-- pm_inspect           read-only, count-only access for agents and hand sessions: migration versions/names, the catalog
--                      (readable by every role), and aggregate helpers. Never SELECT on an app table.
-- No DROP, no row deletion, no transaction control: the publisher wraps this file in its own transaction.

CREATE SCHEMA IF NOT EXISTS pm_publish;
REVOKE ALL ON SCHEMA pm_publish FROM PUBLIC;

CREATE TABLE IF NOT EXISTS pm_publish.pending (
  project text NOT NULL,
  release text NOT NULL,
  pr_head text NOT NULL,
  applied_fingerprint jsonb NOT NULL,
  versions text[] NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project, release)
);
ALTER TABLE pm_publish.pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pm_publish.pending FROM PUBLIC;

DO $pm$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA pm_publish FROM anon, authenticated, service_role';
    EXECUTE 'REVOKE ALL ON TABLE pm_publish.pending FROM anon, authenticated, service_role';
  END IF;
END
$pm$;

-- The agent role. NOLOGIN here: the installer gives it a login and password (stored for the agents' session only) in a
-- separate, reviewed step, so this file never carries a secret.
DO $pm$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pm_inspect') THEN
    CREATE ROLE pm_inspect NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$pm$;

CREATE SCHEMA IF NOT EXISTS pm_inspect;
REVOKE ALL ON SCHEMA pm_inspect FROM PUBLIC;
GRANT USAGE ON SCHEMA pm_inspect TO pm_inspect;
GRANT USAGE ON SCHEMA supabase_migrations TO pm_inspect;
GRANT SELECT (version, name) ON supabase_migrations.schema_migrations TO pm_inspect;

-- How many rows hold NULL in a column (preflight for SET NOT NULL). Returns a count only, never values.
CREATE OR REPLACE FUNCTION pm_inspect.null_count(tbl regclass, col text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl AND attname = col AND attnum > 0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'pm_inspect.null_count: no column % on %', col, tbl;
  END IF;
  EXECUTE format('SELECT count(*) FROM %s WHERE %I IS NULL', tbl, col) INTO n;
  RETURN n;
END
$fn$;

-- How many value groups occur more than once over the given columns (preflight for a new UNIQUE). Count only.
CREATE OR REPLACE FUNCTION pm_inspect.duplicate_count(tbl regclass, cols text[])
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  n bigint;
  c text;
  v_cols text := '';
  v_notnull text := '';
BEGIN
  IF cols IS NULL OR array_length(cols, 1) IS NULL THEN
    RAISE EXCEPTION 'pm_inspect.duplicate_count: no columns';
  END IF;
  FOREACH c IN ARRAY cols LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl AND attname = c AND attnum > 0 AND NOT attisdropped) THEN
      RAISE EXCEPTION 'pm_inspect.duplicate_count: no column % on %', c, tbl;
    END IF;
    v_cols := v_cols || CASE WHEN v_cols = '' THEN '' ELSE ', ' END || quote_ident(c);
    v_notnull := v_notnull || CASE WHEN v_notnull = '' THEN '' ELSE ' AND ' END || quote_ident(c) || ' IS NOT NULL';
  END LOOP;
  EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM %s WHERE %s GROUP BY %s HAVING count(*) > 1) d', tbl, v_notnull, v_cols) INTO n;
  RETURN n;
END
$fn$;

-- How many rows a table holds (preflight for ADD COLUMN ... NOT NULL without a default). Count only.
CREATE OR REPLACE FUNCTION pm_inspect.row_count(tbl regclass)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  n bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s', tbl) INTO n;
  RETURN n;
END
$fn$;

-- How many rows break a CHECK expression the release wants to add (preflight for ADD CONSTRAINT ... CHECK). The
-- expression comes from the reviewed migration file via the publisher, never from an agent at run time.
CREATE OR REPLACE FUNCTION pm_inspect.violation_count(tbl regclass, predicate text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  n bigint;
BEGIN
  IF predicate ~ ';' THEN
    RAISE EXCEPTION 'pm_inspect.violation_count: one expression only';
  END IF;
  EXECUTE format('SELECT count(*) FROM %s WHERE NOT (%s)', tbl, predicate) INTO n;
  RETURN n;
END
$fn$;

REVOKE ALL ON FUNCTION pm_inspect.null_count(regclass, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pm_inspect.duplicate_count(regclass, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION pm_inspect.violation_count(regclass, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pm_inspect.row_count(regclass) FROM PUBLIC;
DO $pm$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION pm_inspect.null_count(regclass, text) FROM anon, authenticated, service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION pm_inspect.duplicate_count(regclass, text[]) FROM anon, authenticated, service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION pm_inspect.violation_count(regclass, text) FROM anon, authenticated, service_role';
    EXECUTE 'REVOKE ALL ON FUNCTION pm_inspect.row_count(regclass) FROM anon, authenticated, service_role';
  END IF;
END
$pm$;
GRANT EXECUTE ON FUNCTION pm_inspect.null_count(regclass, text) TO pm_inspect;
GRANT EXECUTE ON FUNCTION pm_inspect.duplicate_count(regclass, text[]) TO pm_inspect;
GRANT EXECUTE ON FUNCTION pm_inspect.row_count(regclass) TO pm_inspect;
-- violation_count takes an expression: the publisher (postgres) uses it for preflight; agents do not get it.
