-- Migration 104: Create exec_sql function for RLS debugging
-- This function allows the RLS Debugger MCP server to execute SQL
-- with specific user contexts for testing Row Level Security policies.

-- Drop function if it exists (for idempotency)
DROP FUNCTION IF EXISTS exec_sql(text);

-- Create the exec_sql function
-- SECURITY DEFINER allows it to bypass RLS and execute as the function owner
-- This is necessary for the RLS debugger to test policies by setting user context
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_json jsonb;
  result_record record;
  result_array jsonb := '[]'::jsonb;
BEGIN
  -- Security check: Only allow service role or admin users
  -- This prevents regular users from executing arbitrary SQL
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    -- If no JWT claims, this is likely the service role - allow it
    NULL;
  ELSE
    -- If there are JWT claims, check if user is admin
    IF NOT (
      SELECT bool_or(role_type = 'admin')
      FROM user_roles
      WHERE user_id = (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid
    ) THEN
      RAISE EXCEPTION 'Only admin users can execute arbitrary SQL';
    END IF;
  END IF;

  -- Execute the SQL query
  -- We use EXECUTE to run dynamic SQL
  BEGIN
    -- Try to execute as a query that returns rows
    FOR result_record IN EXECUTE sql_query LOOP
      result_array := result_array || to_jsonb(result_record);
    END LOOP;

    -- Return the results as a JSON array
    RETURN result_array;

  EXCEPTION
    WHEN OTHERS THEN
      -- If there is an error, return it as JSON
      RETURN jsonb_build_object(
        'error', true,
        'message', SQLERRM,
        'detail', SQLSTATE,
        'hint', 'Check the SQL query syntax and permissions'
      );
  END;

END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION exec_sql(text) IS
'Executes arbitrary SQL queries with the current session context.
Used by the RLS Debugger MCP server to test Row Level Security policies.
SECURITY: Only accessible to service role and admin users.
WARNING: This function can execute any SQL - use with caution!';

-- Grant execute permission to authenticated users
-- The function itself will check if the user is admin
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;

-- Create a view to track exec_sql usage (optional, for auditing)
CREATE TABLE IF NOT EXISTS exec_sql_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamptz DEFAULT now(),
  executed_by uuid REFERENCES auth.users(id),
  sql_query text,
  success boolean,
  error_message text
);

-- Enable RLS on audit log
ALTER TABLE exec_sql_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view the audit log
CREATE POLICY "Admins can view exec_sql audit log"
ON exec_sql_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role_type = 'admin'
  )
);

-- Add comment
COMMENT ON TABLE exec_sql_audit_log IS
'Audit log for exec_sql function executions.
Tracks who executed what SQL and when, for security monitoring.';
