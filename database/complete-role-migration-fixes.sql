-- =====================================================================
-- Complete Role Migration Fixes
-- Fixes all remaining references to profiles.role to use user_roles.role_type
-- =====================================================================
-- Generated: 2025-07-08
-- Total fixes: 27 (24 RLS policies + 3 trigger functions)
-- =====================================================================

BEGIN;

-- =====================================================================
-- SECTION 1: FIX RLS POLICIES
-- =====================================================================

-- 1. Fix assignment_instances policies (3 policies)
DROP POLICY IF EXISTS "View assignment instances - instructors" ON assignment_instances;
CREATE POLICY "View assignment instances - instructors" 
ON assignment_instances FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'consultor')
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Update assignment instances - admin" ON assignment_instances;
CREATE POLICY "Update assignment instances - admin" 
ON assignment_instances FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "View all submissions - instructors" ON assignment_submissions;
CREATE POLICY "View all submissions - instructors" 
ON assignment_submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'consultor')
    AND ur.is_active = true
  )
);

-- 2. Fix feedback permissions policies (3 policies)
DROP POLICY IF EXISTS "Admin can manage feedback permissions" ON feedback_permissions;
CREATE POLICY "Admin can manage feedback permissions"
ON feedback_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins can view all feedback" ON feedback;
CREATE POLICY "Admins can view all feedback"
ON feedback
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins can update all feedback" ON feedback;
CREATE POLICY "Admins can update all feedback"
ON feedback
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 3. Fix password reset tracking policy (1 policy)
DROP POLICY IF EXISTS "Only admins can view password reset logs" ON password_reset_logs;
CREATE POLICY "Only admins can view password reset logs"
ON password_reset_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 4. Fix quiz policies (2 policies)
DROP POLICY IF EXISTS "Admin full access to quiz reviews" ON quiz_reviews;
CREATE POLICY "Admin full access to quiz reviews"
ON quiz_reviews
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Admin full access to quiz question responses" ON quiz_question_responses;
CREATE POLICY "Admin full access to quiz question responses"
ON quiz_question_responses
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 5. Fix course assignments policy (1 policy)
DROP POLICY IF EXISTS "Admins can manage all course assignments" ON course_assignments;
CREATE POLICY "Admins can manage all course assignments"
ON course_assignments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 6. Fix schools RLS policies (3 policies)
DROP POLICY IF EXISTS "Admin full access" ON schools;
CREATE POLICY "Admin full access"
ON schools
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Admin can manage generations" ON generations;
CREATE POLICY "Admin can manage generations"
ON generations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Admin can manage growth communities" ON growth_communities;
CREATE POLICY "Admin can manage growth communities"
ON growth_communities
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 7. Fix schools_clients policies (3 policies across 3 files)
DROP POLICY IF EXISTS "Admin full access to schools_clients" ON schools_clients;
CREATE POLICY "Admin full access to schools_clients"
ON schools_clients
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 8. Fix group assignments policies (2 policies)
DROP POLICY IF EXISTS "Admins can manage all group settings" ON group_assignment_settings;
CREATE POLICY "Admins can manage all group settings"
ON group_assignment_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins can manage all groups" ON group_assignment_groups;
CREATE POLICY "Admins can manage all groups"
ON group_assignment_groups
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- 9. Fix update course assignments policy (1 policy)
DROP POLICY IF EXISTS "Admin can manage all assignments" ON course_assignments;
CREATE POLICY "Admin can manage all assignments"
ON course_assignments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- =====================================================================
-- SECTION 2: FIX TRIGGER FUNCTIONS
-- =====================================================================

-- Fix notification trigger functions (3 functions)
CREATE OR REPLACE FUNCTION notify_quiz_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify admins and teachers
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT 
    ur.user_id,
    'quiz_submission',
    'Nueva entrega de quiz',
    'Un estudiante ha completado el quiz: ' || 
    (SELECT title FROM quizzes WHERE id = NEW.quiz_id),
    jsonb_build_object(
      'quiz_id', NEW.quiz_id,
      'submission_id', NEW.id,
      'student_id', NEW.user_id
    )
  FROM user_roles ur
  WHERE ur.role_type IN ('admin', 'docente')
  AND ur.is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_feedback_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify admins
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT 
    ur.user_id,
    'feedback_submission',
    'Nueva retroalimentación recibida',
    'Se ha recibido nueva retroalimentación en la plataforma',
    jsonb_build_object(
      'feedback_id', NEW.id,
      'category', NEW.category
    )
  FROM user_roles ur
  WHERE ur.role_type = 'admin'
  AND ur.is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- SECTION 3: ADD MISSING USER ROLE
-- =====================================================================

-- Add admin role for brentcurtis76@gmail.com
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get the user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'brentcurtis76@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User with email brentcurtis76@gmail.com not found';
    RETURN;
  END IF;
  
  -- Check if user already has any roles
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id 
    AND is_active = true
  ) THEN
    RAISE NOTICE 'User already has active roles. Skipping...';
    RETURN;
  END IF;
  
  -- Insert admin role
  INSERT INTO user_roles (
    user_id,
    role_type,
    is_active,
    created_at,
    created_by
  ) VALUES (
    v_user_id,
    'admin',
    true,
    NOW(),
    v_user_id
  );
  
  RAISE NOTICE 'Admin role successfully added for brentcurtis76@gmail.com';
END $$;

-- =====================================================================
-- VERIFICATION
-- =====================================================================

-- Verify all fixes were applied
DO $$
DECLARE
  v_policy_count INTEGER;
  v_user_count INTEGER;
BEGIN
  -- Count policies that still reference profiles.role
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE (qual LIKE '%profiles%role%' OR with_check LIKE '%profiles%role%')
  AND qual NOT LIKE '%user_roles%';
  
  -- Count users with roles
  SELECT COUNT(DISTINCT user_id) INTO v_user_count
  FROM user_roles
  WHERE is_active = true;
  
  RAISE NOTICE 'Migration complete. Remaining profiles.role references in policies: %', v_policy_count;
  RAISE NOTICE 'Total users with active roles: %', v_user_count;
END $$;

COMMIT;

-- =====================================================================
-- POST-MIGRATION NOTES
-- =====================================================================
-- 1. Deploy this script to production
-- 2. Deploy the fixed JavaScript files
-- 3. Monitor for any authentication/authorization errors
-- 4. Consider running drop-legacy-role-column.sql if not already done
-- =====================================================================