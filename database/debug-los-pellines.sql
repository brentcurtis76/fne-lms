-- Debug Los Pellines has_generations issue
-- First, let's see the actual value and when it was created
SELECT 
  id, 
  name, 
  has_generations,
  created_at,
  updated_at
FROM schools 
WHERE name = 'Los Pellines';

-- Check if there are any RLS policies on schools table that might affect has_generations
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'schools';

-- Check if there are any triggers on the schools table
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'schools';

-- Let's also check the column definition
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'schools' 
  AND column_name = 'has_generations';