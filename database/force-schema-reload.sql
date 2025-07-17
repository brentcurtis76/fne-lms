
-- Force PostgREST to reload its schema cache
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
  PERFORM pg_notify('pgrst', 'reload config');
END $$;

-- Also try the direct reload command
NOTIFY pgrst, 'reload schema';
