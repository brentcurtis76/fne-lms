-- ============================================================
-- TIGHTEN RLS FOR COURSES - STAGING FIRST
-- Date: 2025-09-05
-- Purpose: Restrict course reads to enrolled students, owners, and admin/consultor
-- ============================================================

BEGIN;

-- Ensure RLS is enabled and forced
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses FORCE ROW LEVEL SECURITY;

-- Revoke dangerous permissions
REVOKE ALL ON public.courses FROM anon;
REVOKE ALL ON public.courses FROM public;

-- Grant minimal permissions
GRANT SELECT ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;

-- Drop existing policies
DROP POLICY IF EXISTS "authenticated_read_courses" ON public.courses;
DROP POLICY IF EXISTS "service_role_bypass_courses" ON public.courses;
DROP POLICY IF EXISTS "enrolled_or_owner_can_read_courses" ON public.courses;

-- Create new restrictive SELECT policy with feature detection
DO $$
DECLARE
  enrollments_exists boolean;
  created_by_exists boolean;
  policy_sql text;
BEGIN
  -- Check if course_enrollments table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'course_enrollments'
  ) INTO enrollments_exists;
  
  -- Check if created_by column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'courses' 
    AND column_name = 'created_by'
  ) INTO created_by_exists;
  
  -- Build policy SQL based on what exists
  policy_sql := 'CREATE POLICY "enrolled_or_owner_can_read_courses" ' ||
                'ON public.courses FOR SELECT TO authenticated USING (';
  
  -- Start with admin/consultor check (always present)
  policy_sql := policy_sql || 'EXISTS (' ||
    'SELECT 1 FROM public.user_roles ur ' ||
    'WHERE ur.user_id = auth.uid() ' ||
    'AND (ur.is_active IS NULL OR ur.is_active = true) ' ||
    'AND ur.role_type IN (''admin'', ''consultor'', ''equipo_directivo'')' ||
  ')';
  
  -- Add enrollment check if table exists
  IF enrollments_exists THEN
    policy_sql := policy_sql || ' OR EXISTS (' ||
      'SELECT 1 FROM public.course_enrollments ce ' ||
      'WHERE ce.course_id = courses.id ' ||
      'AND ce.user_id = auth.uid()' ||
    ')';
  END IF;
  
  -- Add owner check if column exists
  IF created_by_exists THEN
    policy_sql := policy_sql || ' OR courses.created_by = auth.uid()';
  END IF;
  
  policy_sql := policy_sql || ')';
  
  -- Execute the dynamically built policy
  EXECUTE policy_sql;
  
  -- Log what was created
  RAISE NOTICE 'Policy created with enrollments=%s, created_by=%s', 
    enrollments_exists, created_by_exists;
END $$;

-- Create service role bypass policy
CREATE POLICY "service_role_bypass_courses" 
ON public.courses 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (Run separately)
-- ============================================================
-- 1. Check policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'courses';

-- 2. Test as anonymous (should fail)
-- SET LOCAL role TO anon;
-- SELECT COUNT(*) FROM public.courses;

-- 3. Test as authenticated non-enrolled (should see 0 or only admin sees all)
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claims TO '{"sub": "test-user-id"}';
-- SELECT COUNT(*) FROM public.courses;

-- 4. Test as service_role (should see all)
-- SET LOCAL role TO service_role;
-- SELECT COUNT(*) FROM public.courses;

-- ============================================================
-- ROLLBACK SCRIPT
-- ============================================================
/*
BEGIN;

-- Drop new policies
DROP POLICY IF EXISTS "enrolled_or_owner_can_read_courses" ON public.courses;
DROP POLICY IF EXISTS "service_role_bypass_courses" ON public.courses;

-- Restore broad authenticated read policy
CREATE POLICY "authenticated_read_courses" 
ON public.courses 
FOR SELECT 
TO authenticated
USING (true);

-- Restore service role bypass
CREATE POLICY "service_role_bypass_courses" 
ON public.courses 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;
*/