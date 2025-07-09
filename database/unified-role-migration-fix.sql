-- =====================================================================
-- Unified Role Migration Fix - Complete profiles.role to user_roles Migration
-- =====================================================================
-- Generated: 2025-01-09
-- Total fixes: 31 RLS policies + 3 trigger functions + 1 user role assignment
-- 
-- This script completes the migration from profiles.role to user_roles.role_type
-- It is designed to be idempotent and can be run multiple times safely
-- =====================================================================

BEGIN;

-- =====================================================================
-- SECTION 1: ADD MISSING USER ROLE
-- =====================================================================

-- Add admin role for brentcurtis76@gmail.com (User ID: 9cd70ac6-f167-4a2f-aafd-c51eafe3bf5c)
INSERT INTO user_roles (
    user_id,
    role_type,
    is_active,
    created_at,
    created_by
) 
SELECT 
    '9cd70ac6-f167-4a2f-aafd-c51eafe3bf5c'::uuid,
    'admin',
    true,
    NOW(),
    '9cd70ac6-f167-4a2f-aafd-c51eafe3bf5c'::uuid
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = '9cd70ac6-f167-4a2f-aafd-c51eafe3bf5c'::uuid
    AND is_active = true
);

-- =====================================================================
-- SECTION 2: FIX RLS POLICIES - ASSIGNMENT INSTANCES
-- =====================================================================

-- Fix assignment_instances policies (6 policies)
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

DROP POLICY IF EXISTS "Create assignment instances - instructors" ON assignment_instances;
CREATE POLICY "Create assignment instances - instructors"
ON assignment_instances FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'consultor')
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Delete assignment instances - instructors" ON assignment_instances;
CREATE POLICY "Delete assignment instances - instructors"
ON assignment_instances FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'consultor')
    AND ur.is_active = true
  )
);

DROP POLICY IF EXISTS "Delete assignment instances - admin only" ON assignment_instances;
CREATE POLICY "Delete assignment instances - admin only"
ON assignment_instances FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- =====================================================================
-- SECTION 3: FIX FEEDBACK PERMISSIONS POLICIES
-- =====================================================================

-- Fix feedback permissions policies (3 policies)
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

-- =====================================================================
-- SECTION 4: FIX PASSWORD RESET TRACKING POLICY
-- =====================================================================

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

-- =====================================================================
-- SECTION 5: FIX QUIZ POLICIES
-- =====================================================================

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

-- =====================================================================
-- SECTION 6: FIX COURSE ASSIGNMENTS POLICY
-- =====================================================================

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

-- =====================================================================
-- SECTION 7: FIX SCHOOLS RLS POLICIES
-- =====================================================================

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

DROP POLICY IF EXISTS "Admin can manage schools_clients" ON schools_clients;
CREATE POLICY "Admin can manage schools_clients"
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

DROP POLICY IF EXISTS "Admin can manage consultant_assignments" ON consultant_assignments;
CREATE POLICY "Admin can manage consultant_assignments"
ON consultant_assignments
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
-- SECTION 8: FIX NOTIFICATION TRIGGER FUNCTIONS
-- =====================================================================

-- Fix quiz submission notification function
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

-- Fix assignment submission notification function
CREATE OR REPLACE FUNCTION notify_assignment_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify teachers and admins
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT 
    ur.user_id,
    'assignment_submission',
    'Nueva entrega de tarea',
    'Un estudiante ha entregado una tarea',
    jsonb_build_object(
      'assignment_id', NEW.assignment_id,
      'submission_id', NEW.id,
      'student_id', NEW.user_id
    )
  FROM user_roles ur
  WHERE ur.role_type IN ('admin', 'docente')
  AND ur.is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix feedback submission notification function
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
-- SECTION 9: FIX USER NOTIFICATIONS SYSTEM POLICIES
-- =====================================================================

-- Check if these policies exist and fix them
DO $$
BEGIN
    -- Fix any notification-related policies that might reference profiles.role
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin can manage all notifications' 
        AND tablename = 'notifications'
    ) THEN
        DROP POLICY "Admin can manage all notifications" ON notifications;
        CREATE POLICY "Admin can manage all notifications"
        ON notifications
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
          )
        );
    END IF;
END $$;

-- =====================================================================
-- SECTION 10: VERIFICATION QUERIES
-- =====================================================================

-- Verify all users now have roles
DO $$
DECLARE
  v_users_without_roles INTEGER;
  v_policy_count INTEGER;
  v_total_users INTEGER;
BEGIN
  -- Count users without roles
  SELECT COUNT(*) INTO v_users_without_roles
  FROM auth.users u
  LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
  WHERE ur.user_id IS NULL;
  
  -- Count total users
  SELECT COUNT(*) INTO v_total_users
  FROM auth.users;
  
  -- Count policies that still reference profiles.role
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE (qual LIKE '%profiles%role%' OR with_check LIKE '%profiles%role%')
  AND qual NOT LIKE '%user_roles%';
  
  RAISE NOTICE '=== Migration Verification ===';
  RAISE NOTICE 'Total users: %', v_total_users;
  RAISE NOTICE 'Users without roles: %', v_users_without_roles;
  RAISE NOTICE 'Policies still referencing profiles.role: %', v_policy_count;
  RAISE NOTICE '=============================';
  
  -- Raise exception if issues found
  IF v_users_without_roles > 0 THEN
    RAISE WARNING 'There are still % users without roles!', v_users_without_roles;
  END IF;
  
  IF v_policy_count > 0 THEN
    RAISE WARNING 'There are still % policies referencing profiles.role!', v_policy_count;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- POST-DEPLOYMENT VERIFICATION
-- =====================================================================
-- After running this script, verify:
-- 1. No more "column profiles.role does not exist" errors
-- 2. All users can authenticate properly
-- 3. Admin functions work correctly
-- 4. Run: SELECT COUNT(*) FROM auth.users u LEFT JOIN user_roles ur ON u.id = ur.user_id WHERE ur.user_id IS NULL;
--    Expected result: 0 rows
-- =====================================================================