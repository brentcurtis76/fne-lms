-- Z7-R12: retire the baseline arbitrary-SQL escape hatch. The function remains
-- in immutable schema history, but no API-exposed role may execute it.

REVOKE EXECUTE ON FUNCTION public.exec_sql(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- The retired function never populated its advertised audit table. Preserve
-- existing read policy/grants for historical inspection, but remove every
-- exposed-role mutation path so the record cannot be forged or erased.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON TABLE public.exec_sql_audit_log
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.exec_sql(text) IS
  'RETIRED: arbitrary runtime SQL is forbidden. EXECUTE is revoked from PUBLIC, anon, authenticated, and service_role; schema changes must use reviewed migrations and fixed-purpose RPCs.';

COMMENT ON TABLE public.exec_sql_audit_log IS
  'Historical table for the retired exec_sql function. Exposed roles may not mutate it; existing authorized reads are preserved.';
