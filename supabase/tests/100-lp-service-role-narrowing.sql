-- =============================================================================
-- 100-lp-service-role-narrowing.sql — W-B2c-01 G4
-- (migration 20261002100000_lp_service_role_narrowing.sql)
--
-- service_role keeps SELECT/INSERT/UPDATE/DELETE on the four learning-path
-- tables (pinned in 070) but no longer holds TRUNCATE, REFERENCES or TRIGGER,
-- and a real TRUNCATE as service_role is refused.
-- =============================================================================
BEGIN;
SELECT plan(24);

CREATE TEMP TABLE lp_tables(tbl text) ON COMMIT DROP;
INSERT INTO lp_tables VALUES
  ('learning_paths'), ('learning_path_courses'),
  ('learning_path_assignments'), ('learning_path_progress_sessions');
CREATE TEMP TABLE lp_dropped(op text) ON COMMIT DROP;
INSERT INTO lp_dropped VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER');
GRANT SELECT ON lp_tables, lp_dropped TO service_role;

SELECT ok(NOT has_table_privilege('service_role', format('public.%I', t.tbl), d.op),
  format('service_role no longer holds %s on public.%s', d.op, t.tbl))
FROM lp_tables t CROSS JOIN lp_dropped d ORDER BY t.tbl, d.op;                                       -- 12

SELECT ok(has_table_privilege('service_role', format('public.%I', t.tbl), 'SELECT')
      AND has_table_privilege('service_role', format('public.%I', t.tbl), 'INSERT')
      AND has_table_privilege('service_role', format('public.%I', t.tbl), 'UPDATE')
      AND has_table_privilege('service_role', format('public.%I', t.tbl), 'DELETE'),
  format('service_role still reads and writes rows of public.%s', t.tbl))
FROM lp_tables t ORDER BY t.tbl;                                                                      -- 4

SET LOCAL ROLE service_role;
SELECT throws_ok(format('TRUNCATE public.%I', 'learning_paths'), '42501', NULL,
  'service_role cannot TRUNCATE learning_paths');
SELECT throws_ok(format('TRUNCATE public.%I', 'learning_path_courses'), '42501', NULL,
  'service_role cannot TRUNCATE learning_path_courses');
SELECT throws_ok(format('TRUNCATE public.%I', 'learning_path_assignments'), '42501', NULL,
  'service_role cannot TRUNCATE learning_path_assignments');
SELECT throws_ok(format('TRUNCATE public.%I', 'learning_path_progress_sessions'), '42501', NULL,
  'service_role cannot TRUNCATE learning_path_progress_sessions');
SELECT lives_ok('SELECT count(*) FROM public.learning_paths',
  'service_role can still read learning_paths');
SELECT lives_ok('SELECT count(*) FROM public.learning_path_assignments',
  'service_role can still read learning_path_assignments');
RESET ROLE;

-- Browser roles were already without these (070); this file must not be the
-- reason they lost them, and must not have widened them either.
SELECT ok(NOT has_table_privilege('authenticated', 'public.learning_paths', 'TRUNCATE'),
  'authenticated still cannot TRUNCATE learning_paths');
SELECT ok(NOT has_table_privilege('anon', 'public.learning_paths', 'SELECT'),
  'anon still holds nothing on learning_paths');

SELECT * FROM finish();
ROLLBACK;
