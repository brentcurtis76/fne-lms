

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."activity_type" AS ENUM (
    'meeting_created',
    'meeting_updated',
    'meeting_completed',
    'meeting_deleted',
    'agreement_added',
    'agreement_updated',
    'commitment_made',
    'commitment_completed',
    'task_assigned',
    'task_completed',
    'task_updated',
    'attendee_added',
    'document_uploaded',
    'document_updated',
    'document_downloaded',
    'document_shared',
    'document_deleted',
    'folder_created',
    'folder_updated',
    'folder_deleted',
    'version_created',
    'access_granted',
    'access_revoked',
    'message_sent',
    'message_edited',
    'message_deleted',
    'thread_created',
    'thread_updated',
    'reaction_added',
    'mention_created',
    'attachment_uploaded',
    'user_joined',
    'user_left',
    'role_changed',
    'login_tracked',
    'profile_updated',
    'workspace_created',
    'workspace_updated',
    'settings_changed',
    'bulk_operation',
    'notification_sent',
    'report_generated',
    'backup_created',
    'maintenance_performed'
);


ALTER TYPE "public"."activity_type" OWNER TO "postgres";


CREATE TYPE "public"."assignment_action" AS ENUM (
    'assigned',
    'unassigned'
);


ALTER TYPE "public"."assignment_action" OWNER TO "postgres";


CREATE TYPE "public"."assignment_content_type" AS ENUM (
    'course',
    'learning_path'
);


ALTER TYPE "public"."assignment_content_type" OWNER TO "postgres";


CREATE TYPE "public"."assignment_entity_type" AS ENUM (
    'user',
    'community_workspace'
);


ALTER TYPE "public"."assignment_entity_type" OWNER TO "postgres";


CREATE TYPE "public"."assignment_source" AS ENUM (
    'direct',
    'learning_path'
);


ALTER TYPE "public"."assignment_source" OWNER TO "postgres";


CREATE TYPE "public"."church_account_type" AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
);


ALTER TYPE "public"."church_account_type" OWNER TO "postgres";


CREATE TYPE "public"."church_transaction_type" AS ENUM (
    'income',
    'expense',
    'transfer'
);


ALTER TYPE "public"."church_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."church_user_role" AS ENUM (
    'admin',
    'treasurer',
    'presenter',
    'member'
);


ALTER TYPE "public"."church_user_role" OWNER TO "postgres";


CREATE TYPE "public"."debug_bug_category" AS ENUM (
    'auth',
    'database',
    'ui',
    'rls',
    'realtime',
    'performance',
    'api'
);


ALTER TYPE "public"."debug_bug_category" OWNER TO "postgres";


CREATE TYPE "public"."debug_bug_environment" AS ENUM (
    'development',
    'staging',
    'production'
);


ALTER TYPE "public"."debug_bug_environment" OWNER TO "postgres";


CREATE TYPE "public"."debug_bug_severity" AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);


ALTER TYPE "public"."debug_bug_severity" OWNER TO "postgres";


CREATE TYPE "public"."debug_bug_status" AS ENUM (
    'open',
    'investigating',
    'resolved',
    'wont_fix'
);


ALTER TYPE "public"."debug_bug_status" OWNER TO "postgres";


CREATE TYPE "public"."debug_log_level" AS ENUM (
    'error',
    'warn',
    'info',
    'debug'
);


ALTER TYPE "public"."debug_log_level" OWNER TO "postgres";


CREATE TYPE "public"."entity_type" AS ENUM (
    'meeting',
    'agreement',
    'commitment',
    'task',
    'attendee',
    'document',
    'folder',
    'version',
    'access_permission',
    'message',
    'thread',
    'reaction',
    'mention',
    'attachment',
    'user',
    'workspace',
    'notification',
    'report',
    'system'
);


ALTER TYPE "public"."entity_type" OWNER TO "postgres";


CREATE TYPE "public"."generation_type" AS ENUM (
    'GT',
    'GI'
);


ALTER TYPE "public"."generation_type" OWNER TO "postgres";


CREATE TYPE "public"."meeting_status" AS ENUM (
    'borrador',
    'programada',
    'en_progreso',
    'completada',
    'cancelada',
    'pospuesta'
);


ALTER TYPE "public"."meeting_status" OWNER TO "postgres";


CREATE TYPE "public"."message_activity_type" AS ENUM (
    'message_sent',
    'message_edited',
    'message_deleted',
    'thread_created',
    'reaction_added',
    'mention_created',
    'attachment_uploaded'
);


ALTER TYPE "public"."message_activity_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_method" AS ENUM (
    'in_app',
    'email',
    'push',
    'sms'
);


ALTER TYPE "public"."notification_method" OWNER TO "postgres";


CREATE TYPE "public"."task_priority" AS ENUM (
    'baja',
    'media',
    'alta',
    'critica'
);


ALTER TYPE "public"."task_priority" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'pendiente',
    'en_progreso',
    'completado',
    'vencido',
    'cancelado'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role_type" AS ENUM (
    'admin',
    'consultor',
    'equipo_directivo',
    'lider_generacion',
    'lider_comunidad',
    'docente',
    'supervisor_de_red',
    'community_manager',
    'encargado_licitacion'
);


ALTER TYPE "public"."user_role_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO feedback_activity (
    feedback_id,
    message,
    created_by,
    is_system_message
  ) VALUES (
    p_feedback_id,
    p_message,
    p_user_id,
    p_is_system
  ) RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$;


ALTER FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_assessments_on_access_removal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
BEGIN
  -- Solo archivar si se desactiva el acceso (true → false)
  IF NEW.is_active = false AND OLD.is_active = true THEN

    -- 📋 Capturar IDs de assessments que serán archivados (para logging)
    SELECT ARRAY_AGG(id), COUNT(*)
    INTO affected_ids, affected_count
    FROM transformation_assessments
    WHERE growth_community_id = NEW.growth_community_id
      AND status IN ('in_progress', 'completed');

    -- Archivar assessments activos
    UPDATE transformation_assessments
    SET
      status = 'archived',
      updated_at = now()
    WHERE growth_community_id = NEW.growth_community_id
      AND status IN ('in_progress', 'completed');

    -- Registrar quién y cuándo archivó en el registro de acceso
    NEW.archived_at := now();
    NEW.archived_by := auth.uid();

    -- 🔍 Registrar en audit log para trazabilidad completa
    INSERT INTO transformation_access_audit_log (
      growth_community_id,
      action,
      performed_by,
      affected_assessment_ids,
      assessment_count,
      notes
    ) VALUES (
      NEW.growth_community_id,
      'revoked',
      auth.uid(),
      affected_ids,
      affected_count,
      format('Archivados %s assessments. IDs: %s',
             affected_count,
             ARRAY_TO_STRING(affected_ids, ', '))
    );

  -- Log cuando se ASIGNA acceso también (con advertencia de no-reactivación)
  ELSIF NEW.is_active = true AND OLD.is_active = false THEN
    INSERT INTO transformation_access_audit_log (
      growth_community_id,
      action,
      performed_by,
      notes
    ) VALUES (
      NEW.growth_community_id,
      'assigned',
      auth.uid(),
      '⚠️ Acceso reasignado. IMPORTANTE: Los assessments previamente archivados NO se reactivan automáticamente.'
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."archive_assessments_on_access_removal"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."archive_assessments_on_access_removal"() IS 'Trigger function que archiva assessments automáticamente al revocar acceso y registra los IDs en audit log. También registra reasignaciones con advertencia de no-reactivación.';



CREATE OR REPLACE FUNCTION "public"."audit_role_permission_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO permission_audit_log (
      action,
      role_type,
      permission_key,
      new_value,
      performed_by,
      reason,
      test_run_id,
      is_test,
      diff
    ) VALUES (
      'permission_overlay_created',
      NEW.role_type,
      NEW.permission_key,
      jsonb_build_object('granted', NEW.granted),
      NEW.created_by,
      NEW.reason,
      NEW.test_run_id,
      NEW.is_test,
      jsonb_build_object(
        'role_type', NEW.role_type,
        'permission_key', NEW.permission_key,
        'granted', NEW.granted,
        'test_run_id', NEW.test_run_id
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO permission_audit_log (
      action,
      role_type,
      permission_key,
      old_value,
      performed_by,
      reason,
      test_run_id,
      is_test,
      diff
    ) VALUES (
      'permission_overlay_deleted',
      OLD.role_type,
      OLD.permission_key,
      jsonb_build_object('granted', OLD.granted),
      auth.uid(),
      'Test overlay cleanup',
      OLD.test_run_id,
      OLD.is_test,
      jsonb_build_object(
        'deleted_id', OLD.id,
        'test_run_id', OLD.test_run_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_role_permission_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_get_user_role"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_role text;
BEGIN
  -- First check JWT metadata
  v_role := auth.jwt() -> 'user_metadata' ->> 'role';
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- Fall back to roles array if provided
  SELECT value
  INTO v_role
  FROM jsonb_array_elements_text(
    COALESCE((auth.jwt() -> 'user_metadata' -> 'roles')::jsonb, '[]'::jsonb)
  ) AS role(value)
  ORDER BY CASE WHEN role.value = 'admin' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- Last chance: cached roles
  SELECT role INTO v_role
  FROM user_roles_cache
  WHERE user_id = auth.uid();

  RETURN v_role;
END;
$$;


ALTER FUNCTION "public"."auth_get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_user_school_id bigint;
BEGIN
    -- Admins have access to all schools
    IF auth_is_admin() THEN
        RETURN true;
    END IF;
    
    -- Check user's school
    SELECT school_id INTO v_user_school_id
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    RETURN v_user_school_id = p_school_id;
END;
$$;


ALTER FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_has_school_access_uuid"("p_school_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id uuid;
    v_has_access boolean;
BEGIN
    -- Get the current user's ID
    v_user_id := auth.uid();

    -- Check if user is null (not authenticated)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if user is admin (admins have access to all schools)
    IF auth_is_admin() THEN
        RETURN true;
    END IF;

    -- Check if user has a role in the specified school
    -- FIXED: Removed "AND is_active = true" because user_roles_cache doesn't have that column
    SELECT EXISTS (
        SELECT 1
        FROM user_roles_cache
        WHERE user_id = v_user_id
        AND school_id = p_school_id
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$;


ALTER FUNCTION "public"."auth_has_school_access_uuid"("p_school_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_has_school_access_uuid"("p_school_id" bigint) IS 'Fixed: Removed is_active check that referenced non-existent column. Checks if authenticated user has access to a specific school via role or admin status';



CREATE OR REPLACE FUNCTION "public"."auth_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role_type = 'admin'
        AND is_active = true
    );
END;
$$;


ALTER FUNCTION "public"."auth_is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_is_admin"() IS 'Check if current user is admin. Uses JWT metadata first, then falls back to cached roles.';



CREATE OR REPLACE FUNCTION "public"."auth_is_assessment_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."auth_is_assessment_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM course_enrollments ce
        WHERE ce.course_id = p_course_id
        AND ce.user_id = auth.uid()  -- Fixed: was student_id, now user_id
    );
END;
$$;


ALTER FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") IS 'Fixed 2025-10-07: Changed student_id to user_id to match actual column name in course_enrollments table';



CREATE OR REPLACE FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    -- Admins are teachers for all courses
    IF auth_is_admin() THEN
        RETURN true;
    END IF;
    
    -- Check course assignments
    RETURN EXISTS (
        SELECT 1
        FROM course_assignments ca
        WHERE ca.course_id = p_course_id
        AND ca.teacher_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_is_learning_path_member"("p_course_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learning_path_courses lpc
    JOIN learning_path_assignments lpa ON lpa.path_id = lpc.learning_path_id
    LEFT JOIN user_roles ur ON ur.community_id = lpa.group_id AND ur.user_id = auth.uid() AND ur.is_active = true
    WHERE lpc.course_id = p_course_id
    AND (
      lpa.user_id = auth.uid()
      OR
      (lpa.group_id IS NOT NULL AND ur.user_id IS NOT NULL)
    )
  );
$$;


ALTER FUNCTION "public"."auth_is_learning_path_member"("p_course_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_is_school_directivo"("p_school_id" integer) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'equipo_directivo'
      AND school_id = p_school_id
      AND is_active = true
    );
  END;
  $$;


ALTER FUNCTION "public"."auth_is_school_directivo"("p_school_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_is_superadmin"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM superadmins 
    WHERE user_id = check_user_id 
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."auth_is_superadmin"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_is_teacher"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_is_teacher boolean;
BEGIN
  -- First check JWT metadata
  IF (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'consultor') THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE((auth.jwt() -> 'user_metadata' -> 'roles')::jsonb, '[]'::jsonb)
    ) AS role(value)
    WHERE role.value IN ('admin', 'consultor')
  ) THEN
    RETURN true;
  END IF;

  -- Then check the cache
  SELECT is_teacher INTO v_is_teacher
  FROM user_roles_cache
  WHERE user_id = auth.uid();

  RETURN COALESCE(v_is_teacher, false);
END;
$$;


ALTER FUNCTION "public"."auth_is_teacher"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_is_teacher"() IS 'Check if current user is a teacher (admin or consultor). Uses JWT metadata first, then falls back to cached roles.';



CREATE OR REPLACE FUNCTION "public"."auth_user_community_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT community_id
    FROM user_roles
    WHERE user_id = auth.uid()
    AND community_id IS NOT NULL
    AND is_active = true;
$$;


ALTER FUNCTION "public"."auth_user_community_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_user_community_ids"() IS 'Returns community IDs for the current authenticated user. Uses SECURITY DEFINER to avoid RLS recursion.';



CREATE OR REPLACE FUNCTION "public"."award_course_completion_badge"("p_user_id" "uuid", "p_course_id" "uuid", "p_course_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_badge_id UUID;
    v_user_badge_id UUID;
BEGIN
    -- Get the course completion badge ID
    SELECT id INTO v_badge_id
    FROM badges
    WHERE badge_type = 'course_completion'
    AND is_active = true
    LIMIT 1;

    IF v_badge_id IS NULL THEN
        RAISE EXCEPTION 'No active course completion badge found';
    END IF;

    -- Insert the user badge (or do nothing if exists)
    INSERT INTO user_badges (user_id, badge_id, course_id, metadata)
    VALUES (
        p_user_id,
        v_badge_id,
        p_course_id,
        jsonb_build_object(
            'course_name', p_course_name,
            'completed_at', NOW()
        )
    )
    ON CONFLICT (user_id, badge_id, course_id) DO NOTHING
    RETURNING id INTO v_user_badge_id;

    RETURN v_user_badge_id;
END;
$$;


ALTER FUNCTION "public"."award_course_completion_badge"("p_user_id" "uuid", "p_course_id" "uuid", "p_course_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."batch_assign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_caller_id UUID;
    v_user_id UUID;
    v_assignment_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_enroll_count INT := 0;
    v_assignments UUID[] := '{}';
    v_total_lessons INT;
BEGIN
    -- SECURITY: Get authenticated caller ID from JWT
    -- This cannot be spoofed by the client
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate course exists
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    -- Check caller has permission (not a passed parameter)
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_caller_id
        AND is_active = true
        AND role_type IN ('admin', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign courses';
    END IF;

    -- Get total lessons for this course
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons
    WHERE course_id = p_course_id;

    -- Process user assignments
    IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
        FOREACH v_user_id IN ARRAY p_user_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM course_assignments
                WHERE course_id = p_course_id AND teacher_id = v_user_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;

            -- Verify user exists
            IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
                RAISE EXCEPTION 'User with ID % does not exist', v_user_id;
            END IF;

            -- Create assignment (using authenticated caller ID)
            INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assigned_at)
            VALUES (p_course_id, v_user_id, v_caller_id, NOW())
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- Auto-create or update course enrollment (using authenticated caller ID)
            INSERT INTO course_enrollments (
                course_id,
                user_id,
                enrollment_type,
                enrolled_by,
                enrolled_at,
                status,
                total_lessons
            )
            VALUES (
                p_course_id,
                v_user_id,
                'assigned',
                v_caller_id,
                NOW(),
                'active',
                v_total_lessons
            )
            ON CONFLICT (course_id, user_id) DO UPDATE
            SET
                status = 'active',
                enrollment_type = 'assigned',
                enrolled_by = v_caller_id,
                enrolled_at = NOW(),
                total_lessons = v_total_lessons;

            IF FOUND THEN
                v_enroll_count := v_enroll_count + 1;
            END IF;
        END LOOP;
    END IF;

    -- Return summary with enrollment count
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'enrollments_created', v_enroll_count,
        'assignment_ids', v_assignments,
        'message', format('%s assignment(s) created, %s enrollment(s) created, %s skipped (already assigned)',
                         v_success_count, v_enroll_count, v_skip_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Any error will rollback all assignments and enrollments
        RAISE;
END;
$$;


ALTER FUNCTION "public"."batch_assign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."batch_assign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) IS 'Assigns courses to multiple users atomically, automatically creating or updating course enrollments. All operations are transactional. Caller authentication is derived from auth.uid() to prevent privilege escalation.';



CREATE OR REPLACE FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_group_id UUID;
    v_course_id UUID;
    v_group_member_id UUID;
    v_assignment_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_enroll_count INT := 0;
    v_assignments UUID[] := '{}';
BEGIN
    -- Validate path exists
    IF NOT EXISTS (SELECT 1 FROM learning_paths WHERE id = p_path_id) THEN
        RAISE EXCEPTION 'Learning path not found';
    END IF;

    -- Check permissions
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_assigned_by
        AND is_active = true
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign learning paths';
    END IF;

    -- Process user assignments
    IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
        FOREACH v_user_id IN ARRAY p_user_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM learning_path_assignments
                WHERE path_id = p_path_id AND user_id = v_user_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;

            -- Verify user exists
            IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
                RAISE EXCEPTION 'User with ID % does not exist', v_user_id;
            END IF;

            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
            VALUES (p_path_id, v_user_id, p_assigned_by)
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- Auto-enroll user in all courses with total_lessons
            FOR v_course_id IN
                SELECT course_id
                FROM learning_path_courses
                WHERE learning_path_id = p_path_id
                ORDER BY sequence_order
            LOOP
                INSERT INTO course_enrollments (
                    course_id,
                    user_id,
                    enrollment_type,
                    enrolled_by,
                    enrolled_at,
                    status,
                    total_lessons
                )
                VALUES (
                    v_course_id,
                    v_user_id,
                    'assigned',
                    p_assigned_by,
                    NOW(),
                    'active',
                    (SELECT COUNT(*) FROM lessons WHERE course_id = v_course_id)
                )
                ON CONFLICT (course_id, user_id) DO NOTHING;

                IF FOUND THEN
                    v_enroll_count := v_enroll_count + 1;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- Process group assignments
    IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
        FOREACH v_group_id IN ARRAY p_group_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM learning_path_assignments
                WHERE path_id = p_path_id AND group_id = v_group_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;

            -- Verify group exists
            IF NOT EXISTS (SELECT 1 FROM community_workspaces WHERE id = v_group_id) THEN
                RAISE EXCEPTION 'Group with ID % does not exist', v_group_id;
            END IF;

            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, group_id, assigned_by)
            VALUES (p_path_id, v_group_id, p_assigned_by)
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- Auto-enroll all active group members with total_lessons
            FOR v_group_member_id IN
                SELECT DISTINCT user_id
                FROM user_roles
                WHERE community_id = v_group_id
                AND is_active = true
            LOOP
                FOR v_course_id IN
                    SELECT course_id
                    FROM learning_path_courses
                    WHERE learning_path_id = p_path_id
                    ORDER BY sequence_order
                LOOP
                    INSERT INTO course_enrollments (
                        course_id,
                        user_id,
                        enrollment_type,
                        enrolled_by,
                        enrolled_at,
                        status,
                        total_lessons
                    )
                    VALUES (
                        v_course_id,
                        v_group_member_id,
                        'assigned',
                        p_assigned_by,
                        NOW(),
                        'active',
                        (SELECT COUNT(*) FROM lessons WHERE course_id = v_course_id)
                    )
                    ON CONFLICT (course_id, user_id) DO NOTHING;

                    IF FOUND THEN
                        v_enroll_count := v_enroll_count + 1;
                    END IF;
                END LOOP;
            END LOOP;
        END LOOP;
    END IF;

    -- Return summary
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'enrollments_created', v_enroll_count,
        'assignment_ids', v_assignments,
        'message', format('%s assignment(s) created, %s enrollment(s) created, %s skipped',
                         v_success_count, v_enroll_count, v_skip_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;


ALTER FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") IS 'Assigns learning paths to users/groups, auto-enrolling in courses. Fixed 2025-10-07 to include total_lessons.';



CREATE OR REPLACE FUNCTION "public"."batch_unassign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_caller_id UUID;
    v_unassigned_count INT := 0;
BEGIN
    -- SECURITY: Get authenticated caller ID from JWT
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check caller has permission
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_caller_id
        AND is_active = true
        AND role_type IN ('admin', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to unassign courses';
    END IF;

    -- Validate course exists
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    -- Validate user IDs provided
    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one user ID must be provided';
    END IF;

    -- Delete course assignments ONLY
    -- DO NOT touch course_enrollments - this preserves:
    -- 1. Course visibility in "Mis Cursos"
    -- 2. Active status for assignment submission
    -- 3. All lesson_progress data
    DELETE FROM course_assignments
    WHERE course_id = p_course_id
    AND teacher_id = ANY(p_user_ids);

    GET DIAGNOSTICS v_unassigned_count = ROW_COUNT;

    -- NOTE: Enrollment status is intentionally NOT updated
    -- The user retains their enrollment and all progress
    -- Re-assignment will use ON CONFLICT to update existing enrollment

    -- Return summary
    RETURN json_build_object(
        'success', true,
        'unassigned_count', v_unassigned_count,
        'message', format('%s assignment(s) removed (enrollment preserved)', v_unassigned_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;


ALTER FUNCTION "public"."batch_unassign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."batch_unassign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) IS 'Removes course assignment records without affecting enrollment status. Users retain course access and progress after unassignment. Caller authentication is derived from auth.uid() to prevent privilege escalation.';



CREATE OR REPLACE FUNCTION "public"."bot_save_expense_item"("p_user_id" "uuid", "p_report_id" "uuid", "p_report_name" "text", "p_start" "date", "p_end" "date", "p_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_currency" "text", "p_original_amount" numeric, "p_conversion_rate" numeric, "p_conversion_date" "date", "p_expense_date" "date", "p_vendor" "text", "p_expense_number" "text", "p_receipt_url" "text", "p_receipt_filename" "text", "p_notes" "text", "p_report_description" "text" DEFAULT 'Creado desde Telegram'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_report_id uuid;
BEGIN
  IF p_report_id IS NULL THEN
    INSERT INTO expense_reports
      (report_name, description, start_date, end_date, status, total_amount, submitted_by)
    VALUES
      (p_report_name, p_report_description, p_start, p_end, 'draft', 0, p_user_id)
    RETURNING id INTO v_report_id;
  ELSE
    SELECT id INTO v_report_id
    FROM expense_reports
    WHERE id = p_report_id AND submitted_by = p_user_id AND status = 'draft'
    FOR UPDATE;
    IF v_report_id IS NULL THEN
      RAISE EXCEPTION 'REPORT_NOT_EDITABLE';
    END IF;
  END IF;

  INSERT INTO expense_items
    (report_id, category_id, description, amount, expense_date, vendor,
     expense_number, receipt_url, receipt_filename, notes, currency,
     original_amount, conversion_rate, conversion_date)
  VALUES
    (v_report_id, p_category_id, p_description, p_amount, p_expense_date, p_vendor,
     p_expense_number, p_receipt_url, p_receipt_filename, p_notes, p_currency,
     p_original_amount, p_conversion_rate, p_conversion_date);

  UPDATE expense_reports SET
    total_amount = (SELECT COALESCE(SUM(amount), 0) FROM expense_items WHERE report_id = v_report_id),
    start_date = LEAST(start_date, p_expense_date),
    end_date = GREATEST(end_date, p_expense_date),
    updated_at = now()
  WHERE id = v_report_id;

  RETURN v_report_id;
END;
$$;


ALTER FUNCTION "public"."bot_save_expense_item"("p_user_id" "uuid", "p_report_id" "uuid", "p_report_name" "text", "p_start" "date", "p_end" "date", "p_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_currency" "text", "p_original_amount" numeric, "p_conversion_rate" numeric, "p_conversion_date" "date", "p_expense_date" "date", "p_vendor" "text", "p_expense_number" "text", "p_receipt_url" "text", "p_receipt_filename" "text", "p_notes" "text", "p_report_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_group_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    nights_count INTEGER;
    rooms_needed INTEGER;
BEGIN
    -- Calculate nights
    nights_count := COALESCE(NEW.departure_date - NEW.arrival_date, 0);
    
    -- Calculate number of rooms needed based on room type
    IF NEW.room_type = 'single' THEN
        -- Single rooms: one room per person
        rooms_needed := NEW.num_participants;
    ELSE
        -- Double rooms: 2 people per room (round up for odd numbers)
        rooms_needed := CEIL(NEW.num_participants::numeric / 2);
    END IF;
    
    -- Calculate accommodation total (nights * price per room * number of rooms)
    NEW.accommodation_total := nights_count * COALESCE(NEW.room_price_per_night, 0) * rooms_needed;
    
    -- Calculate flight total (price per person * number of participants)
    NEW.flight_total := COALESCE(NEW.flight_price, 0) * NEW.num_participants;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_group_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") RETURNS TABLE("final_score" integer, "percentage" numeric, "is_fully_graded" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    qs.auto_graded_score + qs.manual_graded_score as final_score,
    CASE 
      WHEN qs.total_possible_points > 0 
      THEN ((qs.auto_graded_score + qs.manual_graded_score)::DECIMAL / qs.total_possible_points::DECIMAL) * 100
      ELSE 0
    END as percentage,
    CASE 
      WHEN qs.manual_gradable_points = 0 THEN true
      WHEN qs.grading_status = 'completed' THEN true
      ELSE false
    END as is_fully_graded
  FROM quiz_submissions qs
  WHERE qs.id = submission_id;
END;
$$;


ALTER FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_quote_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    programs_total DECIMAL(10,2);
    accommodation_cost DECIMAL(10,2);
    room_price DECIMAL(10,2);
BEGIN
    -- Calculate program costs
    SELECT COALESCE(SUM(price), 0) INTO programs_total
    FROM public.pasantias_programs
    WHERE id = ANY(NEW.selected_programs)
    AND is_active = true;
    
    -- Get the appropriate room price
    IF NEW.room_type = 'single' THEN
        room_price := NEW.single_room_price;
    ELSE
        room_price := NEW.double_room_price;
    END IF;
    
    -- Calculate accommodation total
    accommodation_cost := COALESCE((NEW.departure_date - NEW.arrival_date) * room_price, 0);
    
    -- Update totals
    NEW.program_total := programs_total;
    NEW.accommodation_total := accommodation_cost;
    NEW.total_per_person := COALESCE(NEW.flight_price, 0) + accommodation_cost + programs_total;
    NEW.grand_total := NEW.total_per_person * NEW.num_pasantes;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_quote_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_quote_totals_with_discount"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    programs_cost_per_person DECIMAL(10,2);
    accommodation_cost_per_person DECIMAL(10,2);
    room_price DECIMAL(10,2);
    discount_per_person DECIMAL(10,2) := 0;
    nights_count INTEGER;
    rooms_needed DECIMAL(10,2);
BEGIN
    -- Skip calculation if using groups system
    IF NEW.use_groups = true THEN
        RETURN NEW;
    END IF;
    
    -- Only calculate if we have the necessary fields
    IF NEW.arrival_date IS NOT NULL AND NEW.departure_date IS NOT NULL THEN
        -- Calculate nights
        nights_count := NEW.departure_date - NEW.arrival_date;
        
        -- Calculate program costs per person
        SELECT COALESCE(SUM(price), 0) INTO programs_cost_per_person
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Store original program total (for all participants)
        NEW.original_program_total := programs_cost_per_person * COALESCE(NEW.num_pasantes, 1);
        
        -- Apply early bird discount if enabled ($500,000 CLP discount per program per person)
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discount per person (number of programs * 500000)
            SELECT COALESCE(COUNT(*) * 500000, 0) INTO discount_per_person
            FROM public.pasantias_programs
            WHERE id = ANY(NEW.selected_programs)
            AND is_active = true;
            
            -- Apply discount to per-person cost
            programs_cost_per_person := GREATEST(0, programs_cost_per_person - discount_per_person);
            
            -- Total discount for all participants
            NEW.discount_amount := discount_per_person * COALESCE(NEW.num_pasantes, 1);
        ELSE
            NEW.discount_amount := 0;
        END IF;
        
        -- Get the appropriate room price and calculate rooms needed
        IF NEW.room_type = 'single' THEN
            room_price := NEW.single_room_price;
            rooms_needed := NEW.num_pasantes;  -- One room per person
            accommodation_cost_per_person := nights_count * room_price;  -- Full room cost per person
        ELSE
            room_price := NEW.double_room_price;
            rooms_needed := CEIL(NEW.num_pasantes::numeric / 2);  -- Two people per room
            -- CRITICAL: Accommodation per person is room cost divided by 2 for double occupancy
            accommodation_cost_per_person := nights_count * room_price / 2;
        END IF;
        
        -- Calculate accommodation total based on number of rooms
        NEW.accommodation_total := nights_count * room_price * rooms_needed;
        
        -- Update totals
        NEW.program_total := programs_cost_per_person * COALESCE(NEW.num_pasantes, 1);
        NEW.total_per_person := COALESCE(NEW.flight_price, 0) + accommodation_cost_per_person + programs_cost_per_person;
        NEW.grand_total := NEW.total_per_person * COALESCE(NEW.num_pasantes, 1);
    END IF;
    
    RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."calculate_quote_totals_with_discount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_quote_totals_with_groups"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    programs_total DECIMAL(10,2);
    groups_accommodation_total DECIMAL(10,2);
    groups_flight_total DECIMAL(10,2);
    total_participants INTEGER;
BEGIN
    -- Only calculate if using groups system
    IF NEW.use_groups = true THEN
        -- Calculate program costs
        SELECT COALESCE(SUM(price), 0) INTO programs_total
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Calculate totals from groups
        SELECT 
            COALESCE(SUM(accommodation_total), 0),
            COALESCE(SUM(flight_total), 0),
            COALESCE(SUM(num_participants), 0)
        INTO groups_accommodation_total, groups_flight_total, total_participants
        FROM public.pasantias_quote_groups
        WHERE quote_id = NEW.id;
        
        -- Update totals
        NEW.num_pasantes := GREATEST(total_participants, 1);
        NEW.accommodation_total := groups_accommodation_total;
        NEW.program_total := programs_total * NEW.num_pasantes;
        NEW.total_per_person := (groups_flight_total + groups_accommodation_total + (programs_total * NEW.num_pasantes)) / GREATEST(NEW.num_pasantes, 1);
        NEW.grand_total := groups_flight_total + groups_accommodation_total + (programs_total * NEW.num_pasantes);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_quote_totals_with_groups"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_quote_totals_with_groups_and_discount"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    programs_cost_per_person DECIMAL(10,2);
    groups_accommodation_total DECIMAL(10,2);
    groups_flight_total DECIMAL(10,2);
    total_participants INTEGER;
    discount_per_person DECIMAL(10,2) := 0;
BEGIN
    -- Only calculate if using groups system
    IF NEW.use_groups = true THEN
        -- Calculate program costs per person
        SELECT COALESCE(SUM(price), 0) INTO programs_cost_per_person
        FROM public.pasantias_programs
        WHERE id = ANY(NEW.selected_programs)
        AND is_active = true;
        
        -- Get totals from groups (already calculated correctly by trigger)
        SELECT 
            COALESCE(SUM(accommodation_total), 0),
            COALESCE(SUM(flight_total), 0),
            COALESCE(SUM(num_participants), 0)
        INTO groups_accommodation_total, groups_flight_total, total_participants
        FROM public.pasantias_quote_groups
        WHERE quote_id = NEW.id;
        
        -- Store original program total
        NEW.original_program_total := programs_cost_per_person * GREATEST(total_participants, 1);
        
        -- Apply early bird discount if enabled
        IF NEW.apply_early_bird_discount = true THEN
            -- Calculate discount per person
            SELECT COALESCE(COUNT(*) * 500000, 0) INTO discount_per_person
            FROM public.pasantias_programs
            WHERE id = ANY(NEW.selected_programs)
            AND is_active = true;
            
            -- Apply discount to per-person cost
            programs_cost_per_person := GREATEST(0, programs_cost_per_person - discount_per_person);
            
            -- Total discount for all participants
            NEW.discount_amount := discount_per_person * GREATEST(total_participants, 1);
        ELSE
            NEW.discount_amount := 0;
        END IF;
        
        -- Update totals
        NEW.num_pasantes := GREATEST(total_participants, 1);
        NEW.accommodation_total := groups_accommodation_total;
        NEW.program_total := programs_cost_per_person * NEW.num_pasantes;
        NEW.total_per_person := (groups_flight_total + groups_accommodation_total + (programs_cost_per_person * NEW.num_pasantes)) / GREATEST(NEW.num_pasantes, 1);
        NEW.grand_total := groups_flight_total + groups_accommodation_total + (programs_cost_per_person * NEW.num_pasantes);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_quote_totals_with_groups_and_discount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_viaticos_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Calculate viáticos total based on type
    IF NEW.viaticos_type = 'daily' AND NEW.viaticos_amount > 0 THEN
        -- Daily rate: multiply by number of days (nights + 1) and participants
        NEW.viaticos_total := NEW.viaticos_amount * (COALESCE(NEW.nights, 0) + 1) * NEW.num_pasantes;
    ELSIF NEW.viaticos_type = 'total' AND NEW.viaticos_amount > 0 THEN
        -- Total amount per participant: multiply by number of participants
        NEW.viaticos_total := NEW.viaticos_amount * NEW.num_pasantes;
    ELSE
        NEW.viaticos_total := 0;
    END IF;
    
    -- Calculate display amount with 15% surcharge (not itemized)
    IF NEW.viaticos_total > 0 THEN
        NEW.viaticos_display_amount := NEW.viaticos_total * 1.15;
    ELSE
        NEW.viaticos_display_amount := 0;
    END IF;
    
    -- Update grand total to include viáticos display amount
    -- Note: We add the display amount (with surcharge) to the grand total
    NEW.grand_total := COALESCE(NEW.accommodation_total, 0) + 
                       COALESCE(NEW.program_total, 0) + 
                       COALESCE(NEW.flight_price * NEW.num_pasantes, 0) +
                       COALESCE(NEW.viaticos_display_amount, 0);
    
    -- Recalculate total per person
    IF NEW.num_pasantes > 0 THEN
        NEW.total_per_person := NEW.grand_total / NEW.num_pasantes;
    ELSE
        NEW.total_per_person := 0;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_viaticos_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Check if user is admin
    IF EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id 
        AND role_type = 'admin' 
        AND is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    -- Check if user is a member of the community that owns this workspace
    IF EXISTS (
        SELECT 1 
        FROM community_workspaces cw
        INNER JOIN user_roles ur ON ur.community_id = cw.community_id
        WHERE cw.id = p_workspace_id
        AND ur.user_id = p_user_id
        AND ur.is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    -- Check if user is a consultant for the school that has this community
    IF EXISTS (
        SELECT 1 
        FROM community_workspaces cw
        INNER JOIN growth_communities gc ON gc.id = cw.community_id
        INNER JOIN user_roles ur ON ur.school_id = gc.school_id
        WHERE cw.id = p_workspace_id
        AND ur.user_id = p_user_id
        AND ur.role_type = 'consultor'
        AND ur.is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") IS 'Checks if a user can access a specific workspace';



CREATE OR REPLACE FUNCTION "public"."can_edit_meeting"("check_user_id" "uuid", "check_meeting_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF check_user_id IS NULL OR check_meeting_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Global admin / consultor short-circuit.
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = check_user_id
      AND role_type IN ('admin','consultor')
      AND is_active = true
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM community_meetings cm
    JOIN community_workspaces cw ON cw.id = cm.workspace_id
    WHERE cm.id = check_meeting_id
      AND (
        cm.created_by     = check_user_id
        OR cm.facilitator_id = check_user_id
        OR cm.secretary_id   = check_user_id
        OR EXISTS (
          SELECT 1 FROM meeting_attendees ma
          WHERE ma.meeting_id = cm.id
            AND ma.user_id    = check_user_id
            AND ma.role       = 'co_editor'
        )
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id      = check_user_id
            AND ur.community_id = cw.community_id
            AND ur.role_type    = 'lider_comunidad'
            AND ur.is_active    = true
        )
      )
  );
END;
$$;


ALTER FUNCTION "public"."can_edit_meeting"("check_user_id" "uuid", "check_meeting_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cascade_lesson_submission_updates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- When an original submission is updated, update all derived submissions
  IF NEW.is_original = true AND (
    OLD.content IS DISTINCT FROM NEW.content
    OR OLD.file_url IS DISTINCT FROM NEW.file_url
    OR OLD.submission_text IS DISTINCT FROM NEW.submission_text
  ) THEN
    UPDATE lesson_assignment_submissions
    SET
      content = NEW.content,
      file_url = NEW.file_url,
      submission_text = NEW.submission_text,
      updated_at = now()
    WHERE source_submission_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cascade_lesson_submission_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_community_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If generation_id is provided, validate it exists
  IF NEW.generation_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM generations WHERE id = NEW.generation_id) THEN
      RAISE EXCEPTION 'Invalid generation_id provided';
    END IF;
    RETURN NEW;
  END IF;
  
  -- If generation_id is NULL, check if the school actually has generations
  -- This now checks the real count, not just the flag
  IF NOT EXISTS (
    SELECT 1 FROM generations 
    WHERE school_id = NEW.school_id
  ) THEN
    -- School has no generations, allow NULL generation_id
    RETURN NEW;
  END IF;
  
  -- Also allow if has_generations is explicitly false
  IF EXISTS (
    SELECT 1 FROM schools 
    WHERE id = NEW.school_id 
    AND has_generations = false
  ) THEN
    RETURN NEW;
  END IF;
  
  -- If we get here, the school has generations but none was provided
  RAISE EXCEPTION 'generation_id is required for schools with generations';
END;
$$;


ALTER FUNCTION "public"."check_community_organization"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_community_organization"() IS 'Validates that communities have proper organizational structure. 
Communities require generation_id only if the school has generations enabled.
Schools without generations (has_generations = false) can have communities without generation_id.';



CREATE OR REPLACE FUNCTION "public"."check_duplicate_notification"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_time_window_seconds" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_notifications
    WHERE user_id = p_user_id
      AND title = p_title
      AND (description = p_description OR (description IS NULL AND p_description IS NULL))
      AND created_at > (NOW() - INTERVAL '1 second' * p_time_window_seconds)
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."check_duplicate_notification"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_time_window_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_duplicate_notification"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_time_window_seconds" integer) IS 'Checks if a similar notification exists for the user within the specified time window (default 60 seconds).';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_dev_sessions"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE dev_role_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE is_active = TRUE
    AND expires_at < NOW();
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_dev_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_test_runs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired test overlays
  DELETE FROM role_permissions
  WHERE is_test = true
  AND expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Reset expired test mode states
  UPDATE test_mode_state
  SET enabled = false,
      test_run_id = NULL
  WHERE expires_at < now()
  AND enabled = true;
  
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_test_runs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_communities"() RETURNS TABLE("deleted_id" "uuid", "deleted_name" "text", "deleted_school_id" "uuid", "deleted_generation_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  DELETE FROM growth_communities gc
  WHERE gc.id IN (
    SELECT gc2.id
    FROM growth_communities gc2
    WHERE NOT EXISTS (
      -- Check if any active role references this community
      SELECT 1 
      FROM user_roles ur
      WHERE ur.community_id = gc2.id
        AND ur.is_active = true
    )
    -- Only delete auto-created communities (those with leader names)
    AND gc2.name LIKE 'Comunidad de %'
  )
  RETURNING gc.id, gc.name, gc.school_id, gc.generation_id;
END;
$$;


ALTER FUNCTION "public"."cleanup_orphaned_communities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_propuesta_rate_limits"() RETURNS "void"
    LANGUAGE "sql"
    AS $$ DELETE FROM propuesta_rate_limits WHERE attempted_at < NOW() - INTERVAL '24 hours'; $$;


ALTER FUNCTION "public"."cleanup_propuesta_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contratos_set_representante_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.snapshot_nombre_representante IS NULL THEN
    SELECT cl.nombre_representante
      INTO NEW.snapshot_nombre_representante
      FROM clientes cl
     WHERE cl.id = NEW.cliente_id;
  END IF;

  IF NEW.snapshot_rut_representante IS NULL THEN
    SELECT cl.rut_representante
      INTO NEW.snapshot_rut_representante
      FROM clientes cl
     WHERE cl.id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."contratos_set_representante_snapshot"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."contratos_set_representante_snapshot"() IS 'BEFORE INSERT trigger: snapshots the current clientes representative fields onto contratos when not explicitly provided.';



CREATE OR REPLACE FUNCTION "public"."create_activity"("p_workspace_id" "uuid", "p_activity_type" "public"."activity_type", "p_entity_type" "public"."entity_type", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_importance_score" integer DEFAULT 1, "p_tags" "text"[] DEFAULT '{}'::"text"[], "p_related_users" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO activity_feed (
        workspace_id,
        user_id,
        activity_type,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        importance_score,
        tags,
        related_users
    ) VALUES (
        p_workspace_id,
        COALESCE(p_user_id, auth.uid()),
        p_activity_type,
        p_entity_type,
        p_entity_id,
        COALESCE(p_title, p_activity_type::text),
        p_description,
        p_metadata,
        p_importance_score,
        p_tags,
        p_related_users
    ) RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$;


ALTER FUNCTION "public"."create_activity"("p_workspace_id" "uuid", "p_activity_type" "public"."activity_type", "p_entity_type" "public"."entity_type", "p_user_id" "uuid", "p_entity_id" "uuid", "p_title" "text", "p_description" "text", "p_metadata" "jsonb", "p_importance_score" integer, "p_tags" "text"[], "p_related_users" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_assignment_template_from_block"("p_lesson_id" "uuid", "p_block_id" "uuid", "p_block_data" "jsonb", "p_created_by" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_template_id UUID;
    v_assignment_type VARCHAR(20);
BEGIN
    -- Determine assignment type
    v_assignment_type := CASE 
        WHEN p_block_data->>'type' = 'group-assignment' THEN 'group'
        ELSE 'individual'
    END;
    
    -- Create or update template
    INSERT INTO assignment_templates (
        lesson_id,
        block_id,
        title,
        description,
        instructions,
        assignment_type,
        min_group_size,
        max_group_size,
        created_by
    ) VALUES (
        p_lesson_id,
        p_block_id,
        COALESCE(p_block_data->'payload'->>'title', 'Sin título'),
        p_block_data->'payload'->>'description',
        p_block_data->'payload'->>'instructions',
        v_assignment_type,
        COALESCE((p_block_data->'payload'->>'min_group_size')::INTEGER, 2),
        COALESCE((p_block_data->'payload'->>'max_group_size')::INTEGER, 5),
        p_created_by
    )
    ON CONFLICT (lesson_id, block_id) 
    DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        instructions = EXCLUDED.instructions,
        min_group_size = EXCLUDED.min_group_size,
        max_group_size = EXCLUDED.max_group_size,
        updated_at = NOW()
    RETURNING id INTO v_template_id;
    
    RETURN v_template_id;
END;
$$;


ALTER FUNCTION "public"."create_assignment_template_from_block"("p_lesson_id" "uuid", "p_block_id" "uuid", "p_block_data" "jsonb", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_document_version"("document_uuid" "uuid", "new_storage_path" "text", "new_file_size" bigint, "new_mime_type" character varying, "user_uuid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_version_number INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 
  INTO new_version_number
  FROM document_versions
  WHERE document_id = document_uuid;
  
  -- Insert new version
  INSERT INTO document_versions (
    document_id, 
    version_number, 
    storage_path, 
    file_size, 
    mime_type, 
    uploaded_by
  ) VALUES (
    document_uuid, 
    new_version_number, 
    new_storage_path, 
    new_file_size, 
    new_mime_type, 
    user_uuid
  );
  
  -- Update current document
  UPDATE community_documents 
  SET 
    current_version = new_version_number,
    storage_path = new_storage_path,
    file_size = new_file_size,
    mime_type = new_mime_type,
    updated_at = NOW()
  WHERE id = document_uuid;
  
  RETURN new_version_number;
END;
$$;


ALTER FUNCTION "public"."create_document_version"("document_uuid" "uuid", "new_storage_path" "text", "new_file_size" bigint, "new_mime_type" character varying, "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_path_id UUID;
    v_course_id UUID;
    v_sequence INTEGER := 1;
    v_result JSONB;
BEGIN
    -- Input validation
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning path name cannot be empty';
    END IF;
    
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Learning path description cannot be empty';
    END IF;
    
    -- Check if user has permission to create learning paths
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_created_by 
        AND is_active = true
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to create learning paths';
    END IF;
    
    -- Start transaction block (implicit in function)
    
    -- 1. Create the learning path
    INSERT INTO learning_paths (name, description, created_by)
    VALUES (p_name, p_description, p_created_by)
    RETURNING id INTO v_path_id;
    
    -- 2. Create course associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association (FIXED: use learning_path_id instead of path_id)
            INSERT INTO learning_path_courses (learning_path_id, course_id, sequence_order)
            VALUES (v_path_id, v_course_id, v_sequence);
            
            v_sequence := v_sequence + 1;
        END LOOP;
    END IF;
    
    -- 3. Return the created learning path
    SELECT json_build_object(
        'id', id,
        'name', name,
        'description', description,
        'created_by', created_by,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO v_result
    FROM learning_paths
    WHERE id = v_path_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any error will automatically rollback the entire transaction
        RAISE;
END;
$$;


ALTER FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") IS 'Creates a learning path with associated courses in a single atomic transaction. FIXED: Uses correct column names (learning_path_id for learning_path_courses table).';



CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" character varying, "p_title" character varying, "p_message" "text", "p_entity_type" character varying DEFAULT NULL::character varying, "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_entity_type, p_entity_id, p_metadata)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" character varying, "p_title" character varying, "p_message" "text", "p_entity_type" character varying, "p_entity_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification_safe"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_category" character varying DEFAULT 'general'::character varying, "p_related_url" character varying DEFAULT NULL::character varying, "p_importance" character varying DEFAULT 'normal'::character varying, "p_notification_type_id" character varying DEFAULT NULL::character varying, "p_idempotency_key" character varying DEFAULT NULL::character varying) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_notification_id UUID;
  v_final_idempotency_key VARCHAR;
BEGIN
  -- Check for recent duplicates if no idempotency key provided
  IF p_idempotency_key IS NULL THEN
    IF check_duplicate_notification(p_user_id, p_title, p_description, 60) THEN
      -- Return NULL to indicate duplicate was prevented
      RETURN NULL;
    END IF;
  END IF;
  
  -- Use provided idempotency key or generate one
  v_final_idempotency_key := COALESCE(
    p_idempotency_key,
    generate_notification_idempotency_key(
      'manual',
      MD5(p_title || COALESCE(p_description, '')),
      p_user_id
    )
  );
  
  -- Try to insert the notification
  INSERT INTO public.user_notifications (
    user_id,
    title,
    description,
    category,
    related_url,
    importance,
    notification_type_id,
    idempotency_key,
    is_read,
    created_at
  ) VALUES (
    p_user_id,
    p_title,
    p_description,
    p_category,
    p_related_url,
    p_importance,
    p_notification_type_id,
    v_final_idempotency_key,
    false,
    NOW()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;


ALTER FUNCTION "public"."create_notification_safe"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_category" character varying, "p_related_url" character varying, "p_importance" character varying, "p_notification_type_id" character varying, "p_idempotency_key" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notification_safe"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_category" character varying, "p_related_url" character varying, "p_importance" character varying, "p_notification_type_id" character varying, "p_idempotency_key" character varying) IS 'Creates a notification with built-in deduplication. Returns notification ID if created, NULL if duplicate was prevented.';



CREATE OR REPLACE FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  notifications_created INTEGER := 0;
  notification_type_record RECORD;
BEGIN
  -- Get some notification types to use for samples
  FOR notification_type_record IN 
    SELECT id, name FROM notification_types LIMIT 8
  LOOP
    -- Create a sample notification based on the type
    CASE 
      WHEN notification_type_record.name ILIKE '%aprobado%' OR notification_type_record.name ILIKE '%usuario%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Tu cuenta ha sido aprobada',
          'Bienvenido a la plataforma FNE. Tu cuenta ha sido aprobada por un administrador.',
          '/dashboard'
        );
        
      WHEN notification_type_record.name ILIKE '%curso%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Nuevo curso disponible: Liderazgo Educativo',
          'Se te ha asignado el curso "Liderazgo Educativo en el Siglo XXI".',
          '/student/course/123'
        );
        
      WHEN notification_type_record.name ILIKE '%tarea%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Nueva tarea asignada',
          'Tarea: "Análisis de Caso Práctico". Fecha límite: 15 de junio.',
          '/assignments/789'
        );
        
      WHEN notification_type_record.name ILIKE '%mensaje%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Nuevo mensaje de María González',
          'Mensaje sobre el proyecto de innovación en el espacio colaborativo.',
          '/community/workspace?tab=messaging'
        );
        
      WHEN notification_type_record.name ILIKE '%sistema%' OR notification_type_record.name ILIKE '%actualizaci%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Actualización de la plataforma',
          'Mantenimiento programado el sábado de 2:00 a 4:00 AM.',
          '/dashboard'
        );
        
      WHEN notification_type_record.name ILIKE '%documento%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Documento compartido contigo',
          'Juan Pérez compartió "Guía de Implementación 2025".',
          '/community/workspace?tab=documents'
        );
        
      WHEN notification_type_record.name ILIKE '%reuni%' THEN
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Reunión programada para mañana',
          'Reunión de seguimiento mañana a las 15:00.',
          '/community/workspace?tab=meetings'
        );
        
      ELSE
        -- Generic notification for any other type
        PERFORM create_user_notification(
          p_user_id,
          notification_type_record.id,
          'Notificación de prueba: ' || notification_type_record.name,
          'Esta es una notificación de ejemplo para probar el sistema.',
          '/dashboard'
        );
    END CASE;
    
    notifications_created := notifications_created + 1;
  END LOOP;

  RETURN notifications_created;
END;
$$;


ALTER FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text" DEFAULT NULL::"text", "p_related_url" character varying DEFAULT NULL::character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO user_notifications (
    user_id,
    notification_type_id,
    title,
    description,
    related_url
  ) VALUES (
    p_user_id,
    p_notification_type_id,
    p_title,
    p_description,
    p_related_url
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;


ALTER FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Update active sessions
    UPDATE dev_role_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE dev_user_id = p_dev_user_id
    AND is_active = TRUE;
    
    -- Log the action
    INSERT INTO dev_audit_log (dev_user_id, action, details, ip_address, user_agent)
    VALUES (
        p_dev_user_id,
        'end_impersonation',
        '{}',
        p_ip_address,
        p_user_agent
    );
    
    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_session_record public.learning_path_progress_sessions;
BEGIN
  SELECT * INTO v_session_record
  FROM public.learning_path_progress_sessions
  WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_session_record.session_end IS NOT NULL THEN
    RETURN TRUE; -- already closed
  END IF;

  UPDATE public.learning_path_progress_sessions
  SET session_end = NOW(),
      time_spent_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - session_start)) / 60)),
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exec_sql"("sql_query" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."exec_sql"("sql_query" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."exec_sql"("sql_query" "text") IS 'Executes arbitrary SQL queries with the current session context.
Used by the RLS Debugger MCP server to test Row Level Security policies.
SECURITY: Only accessible to service role and admin users.
WARNING: This function can execute any SQL - use with caution!';



CREATE OR REPLACE FUNCTION "public"."extract_mentions"("p_content" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
      mentions TEXT[];
  BEGIN
      -- Simple regex to find @username patterns
      SELECT array_agg(DISTINCT match[1])
      INTO mentions
      FROM regexp_matches(p_content, '@([a-zA-Z0-9_]+)', 'g') AS match;

      RETURN COALESCE(mentions, ARRAY[]::TEXT[]);
  END;
  $$;


ALTER FUNCTION "public"."extract_mentions"("p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."feedback_status_change_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM add_feedback_activity(
      NEW.id,
      'Estado cambiado de ' || OLD.status || ' a ' || NEW.status,
      NEW.created_by,
      true
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."feedback_status_change_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_is_events_manager"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  is_manager boolean := false;
  has_superadmins boolean := false;
BEGIN
  -- Check if user has admin or community_manager role
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND ur.role_type IN ('admin','community_manager')
  ) INTO is_manager;
  
  -- If already a manager, return true
  IF is_manager THEN
    RETURN true;
  END IF;
  
  -- Check if superadmins table exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'superadmins'
  ) INTO has_superadmins;
  
  -- If superadmins table exists, check if user is a superadmin
  IF has_superadmins THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.superadmins sa
      WHERE sa.user_id = p_user_id
      AND sa.is_active = true
    ) INTO is_manager;
  END IF;
  
  RETURN is_manager;
END;
$$;


ALTER FUNCTION "public"."fn_is_events_manager"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_notification_idempotency_key"("p_event_type" character varying, "p_event_id" character varying, "p_user_id" "uuid", "p_timestamp" timestamp without time zone DEFAULT "now"()) RETURNS character varying
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Generate a key that includes timestamp truncated to minute to allow 
  -- for the same event to create notifications after a reasonable time
  RETURN MD5(
    COALESCE(p_event_type, 'unknown') || '-' ||
    COALESCE(p_event_id, 'none') || '-' ||
    p_user_id::TEXT || '-' ||
    DATE_TRUNC('minute', p_timestamp)::TEXT
  );
END;
$$;


ALTER FUNCTION "public"."generate_notification_idempotency_key"("p_event_type" character varying, "p_event_id" character varying, "p_user_id" "uuid", "p_timestamp" timestamp without time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_notification_idempotency_key"("p_event_type" character varying, "p_event_id" character varying, "p_user_id" "uuid", "p_timestamp" timestamp without time zone) IS 'Generates a consistent idempotency key for notifications based on event data. Includes minute-level timestamp to allow same events after time passes.';



CREATE OR REPLACE FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") RETURNS TABLE("impersonated_role" "public"."user_role_type", "impersonated_user_id" "uuid", "school_id" integer, "generation_id" "uuid", "community_id" "uuid", "session_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ds.impersonated_role,
        ds.impersonated_user_id,
        ds.school_id,
        ds.generation_id,
        ds.community_id,
        ds.session_token,
        ds.expires_at
    FROM dev_role_sessions ds
    WHERE ds.dev_user_id = user_uuid
    AND ds.is_active = TRUE
    AND ds.expires_at > NOW()
    ORDER BY ds.started_at DESC
    LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_triggers"("p_event_type" "text") RETURNS TABLE("trigger_id" "uuid", "template" "jsonb", "category" character varying, "conditions" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nt.id,
        nt.notification_template,
        nt.category,
        nt.trigger_condition
    FROM notification_triggers nt
    WHERE nt.event_type = p_event_type 
    AND nt.is_active = true;
END;
$$;


ALTER FUNCTION "public"."get_active_triggers"("p_event_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") IS 'Helper function to retrieve active triggers for an event type';



CREATE OR REPLACE FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    stats JSONB := '{}';
    total_count INTEGER;
    today_count INTEGER;
    week_count INTEGER;
    most_active_type activity_type;
BEGIN
    -- Get total activities
    SELECT COUNT(*) INTO total_count
    FROM activity_feed 
    WHERE workspace_id = p_workspace_id OR p_workspace_id IS NULL;
    
    -- Get today's activities
    SELECT COUNT(*) INTO today_count
    FROM activity_feed 
    WHERE (workspace_id = p_workspace_id OR p_workspace_id IS NULL)
    AND created_at >= CURRENT_DATE;
    
    -- Get this week's activities
    SELECT COUNT(*) INTO week_count
    FROM activity_feed 
    WHERE (workspace_id = p_workspace_id OR p_workspace_id IS NULL)
    AND created_at >= DATE_TRUNC('week', CURRENT_DATE);
    
    -- Get most active activity type
    SELECT activity_type INTO most_active_type
    FROM activity_feed 
    WHERE workspace_id = p_workspace_id OR p_workspace_id IS NULL
    GROUP BY activity_type 
    ORDER BY COUNT(*) DESC 
    LIMIT 1;
    
    -- Build stats object
    stats := jsonb_build_object(
        'total_activities', total_count,
        'activities_today', today_count,
        'activities_this_week', week_count,
        'most_active_type', most_active_type,
        'most_active_user', NULL,
        'engagement_trend', 'stable',
        'peak_hours', ARRAY[9, 10, 11, 14, 15, 16]
    );
    
    RETURN stats;
END;
$$;


ALTER FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_auth_users"() RETURNS TABLE("id" "uuid", "email" "text", "created_at" timestamp with time zone, "email_confirmed_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "first_name" "text", "last_name" "text", "school_id" integer, "school_name" "text", "approval_status" "text", "role_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (au.id)
    au.id,
    au.email::TEXT,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    p.first_name::TEXT,
    p.last_name::TEXT,
    p.school_id,
    s.name::TEXT AS school_name,
    p.approval_status::TEXT,
    (
      SELECT ur.role_type::TEXT
      FROM public.user_roles ur
      WHERE ur.user_id = au.id
        AND ur.is_active = TRUE
      ORDER BY
        CASE ur.role_type
          WHEN 'admin' THEN 1
          WHEN 'consultor' THEN 2
          WHEN 'equipo_directivo' THEN 3
          WHEN 'supervisor_de_red' THEN 4
          WHEN 'community_manager' THEN 5
          WHEN 'lider_generacion' THEN 6
          WHEN 'lider_comunidad' THEN 7
          WHEN 'docente' THEN 8
          ELSE 99
        END,
        ur.assigned_at DESC NULLS LAST,
        ur.created_at DESC NULLS LAST
      LIMIT 1
    ) AS role_type
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  WHERE au.deleted_at IS NULL
  ORDER BY au.id, au.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_auth_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") RETURNS TABLE("template_id" "uuid", "lesson_id" "uuid", "lesson_title" character varying, "module_title" character varying, "template_title" character varying, "assignment_type" character varying, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        at.id AS template_id,
        l.id AS lesson_id,
        l.title AS lesson_title,
        m.title AS module_title,
        at.title AS template_title,
        at.assignment_type,
        at.created_at
    FROM assignment_templates at
    JOIN lessons l ON at.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = p_course_id
    ORDER BY m.order_index, l.order_index, at.created_at;
END;
$$;


ALTER FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_baseline_permissions"("p_role_type" "text") RETURNS TABLE("permission_key" "text", "granted" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    permission_key,
    granted
  FROM role_permission_baseline
  WHERE role_type = p_role_type
  ORDER BY permission_key;
$$;


ALTER FUNCTION "public"."get_baseline_permissions"("p_role_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_baseline_permissions"("p_role_type" "text") IS 'Returns only baseline permissions for a role, without any overlays.';



CREATE OR REPLACE FUNCTION "public"."get_bucket_summary"("p_contrato_id" "uuid") RETURNS TABLE("hour_type_key" "text", "display_name" "text", "allocated_hours" numeric, "reserved_hours" numeric, "consumed_hours" numeric, "available_hours" numeric, "is_fixed_allocation" boolean, "annex_hours" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  WITH effective_allocations AS (
    -- Direct allocations for this contract
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation,
           false AS is_annex
    FROM contract_hour_allocations cha
    WHERE cha.contrato_id = p_contrato_id

    UNION ALL

    -- Annex allocations that add hours to this contract's buckets
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation,
           true AS is_annex
    FROM contract_hour_allocations cha
    WHERE cha.adds_to_allocation_id IN (
      SELECT id FROM contract_hour_allocations
      WHERE contrato_id = p_contrato_id
    )
  )
  SELECT
    ht.key AS hour_type_key,
    ht.display_name,
    SUM(ea.allocated_hours) AS allocated_hours,
    COALESCE(SUM(CASE WHEN chl.status = 'reservada' THEN chl.hours END), 0) AS reserved_hours,
    COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada') THEN chl.hours END), 0) AS consumed_hours,
    SUM(ea.allocated_hours)
      - COALESCE(SUM(CASE WHEN chl.status = 'reservada' THEN chl.hours END), 0)
      - COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada') THEN chl.hours END), 0)
    AS available_hours,
    BOOL_OR(ea.is_fixed_allocation) AS is_fixed_allocation,
    COALESCE(SUM(ea.allocated_hours) FILTER (WHERE ea.is_annex), 0) AS annex_hours
  FROM effective_allocations ea
  JOIN hour_types ht ON ht.id = ea.hour_type_id
  LEFT JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
    AND chl.status IN ('reservada', 'consumida', 'penalizada')
  GROUP BY ht.key, ht.display_name, ht.sort_order
  ORDER BY ht.sort_order;
$$;


ALTER FUNCTION "public"."get_bucket_summary"("p_contrato_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_bucket_summary"("p_contrato_id" "uuid") IS 'Returns hour bucket summary for a contract: allocated, reserved, consumed, available, annex_hours. Includes annex allocations. Used for the admin and equipo_directivo hour tracking dashboard.';



CREATE OR REPLACE FUNCTION "public"."get_consultant_earnings"("p_consultant_id" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("hour_type_key" "text", "display_name" "text", "total_hours" numeric, "rate_eur" numeric, "total_eur" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    ht.key AS hour_type_key,
    ht.display_name,
    SUM(chl.hours) AS total_hours,
    cr.rate_eur,
    SUM(chl.hours) * cr.rate_eur AS total_eur
  FROM contract_hours_ledger chl
  JOIN consultor_sessions cs ON cs.id = chl.session_id
  JOIN session_facilitators sf ON sf.session_id = cs.id
    AND sf.user_id = p_consultant_id
  JOIN contract_hour_allocations cha ON cha.id = chl.allocation_id
  JOIN hour_types ht ON ht.id = cha.hour_type_id
  LEFT JOIN consultant_rates cr ON cr.consultant_id = p_consultant_id
    AND cr.hour_type_id = cha.hour_type_id
    AND chl.session_date >= cr.effective_from
    AND (cr.effective_to IS NULL OR chl.session_date < cr.effective_to)
  WHERE chl.session_date BETWEEN p_from AND p_to
    AND chl.status IN ('consumida', 'penalizada')
  GROUP BY ht.key, ht.display_name, cr.rate_eur, ht.sort_order
  ORDER BY ht.sort_order;
$$;


ALTER FUNCTION "public"."get_consultant_earnings"("p_consultant_id" "uuid", "p_from" "date", "p_to" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_consultant_earnings"("p_consultant_id" "uuid", "p_from" "date", "p_to" "date") IS 'Returns earnings breakdown for a consultant over a date range. Groups by hour_type and rate. NULL rate_eur means no rate is configured for that bucket.';



CREATE OR REPLACE FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_documents', COALESCE(total_docs.count, 0),
    'total_folders', COALESCE(total_folders.count, 0),
    'total_storage_bytes', COALESCE(total_storage.sum, 0),
    'total_downloads', COALESCE(total_downloads.sum, 0),
    'recent_uploads', COALESCE(recent_uploads.count, 0),
    'file_types', COALESCE(file_types.types, '[]'::json),
    'top_uploaders', COALESCE(top_uploaders.uploaders, '[]'::json)
  ) INTO result
  FROM 
    (SELECT COUNT(*) as count FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_docs
  CROSS JOIN
    (SELECT COUNT(*) as count FROM document_folders WHERE workspace_id = workspace_uuid) total_folders
  CROSS JOIN
    (SELECT COALESCE(SUM(file_size), 0) as sum FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_storage
  CROSS JOIN
    (SELECT COALESCE(SUM(download_count), 0) as sum FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_downloads
  CROSS JOIN
    (SELECT COUNT(*) as count FROM community_documents 
     WHERE workspace_id = workspace_uuid AND is_active = true AND created_at >= NOW() - INTERVAL '7 days') recent_uploads
  CROSS JOIN
    (SELECT COALESCE(json_agg(json_build_object('mime_type', mime_type, 'count', count)), '[]'::json) as types
     FROM (SELECT mime_type, COUNT(*) as count 
           FROM community_documents 
           WHERE workspace_id = workspace_uuid AND is_active = true
           GROUP BY mime_type
           ORDER BY count DESC
           LIMIT 10) types) file_types
  CROSS JOIN
    (SELECT COALESCE(json_agg(json_build_object('user_id', uploaded_by, 'count', count)), '[]'::json) as uploaders
     FROM (SELECT uploaded_by, COUNT(*) as count 
           FROM community_documents 
           WHERE workspace_id = workspace_uuid AND is_active = true
           GROUP BY uploaded_by
           ORDER BY count DESC
           LIMIT 5) uploaders) top_uploaders;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_effective_permissions"("p_role_type" "text", "p_test_run_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("permission_key" "text", "granted" boolean, "source" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH baseline AS (
    SELECT b.permission_key, b.granted, 'baseline'::text AS source
    FROM role_permission_baseline b
    WHERE b.role_type = p_role_type
  ),
  overlays AS (
    SELECT o.permission_key, o.granted, 'test_overlay'::text AS source
    FROM role_permissions o
    WHERE o.role_type = p_role_type
      AND o.is_test = true
      AND o.active = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
      AND o.test_run_id = p_test_run_id
  ),
  combined AS (
    SELECT ov.permission_key, ov.granted, ov.source FROM overlays ov
    UNION ALL
    SELECT b.permission_key, b.granted, b.source
    FROM baseline b
    WHERE NOT EXISTS (
      SELECT 1 FROM overlays ov WHERE ov.permission_key = b.permission_key
    )
  )
  SELECT c.permission_key, c.granted, c.source
  FROM combined c
  ORDER BY c.permission_key;
END;
$$;


ALTER FUNCTION "public"."get_effective_permissions"("p_role_type" "text", "p_test_run_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_effective_permissions"("p_role_type" "text", "p_test_run_id" "uuid") IS 'Returns effective permissions for a role, combining baseline with test overlays. 
Overlays take precedence over baseline. Returns source to indicate origin of each permission.';



CREATE OR REPLACE FUNCTION "public"."get_effective_user_role"("user_uuid" "uuid") RETURNS "public"."user_role_type"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_impersonated_role user_role_type;
    v_actual_role user_role_type;
BEGIN
    -- Check if user is a dev with active impersonation
    IF is_dev_user(user_uuid) THEN
        SELECT impersonated_role INTO v_impersonated_role
        FROM get_active_dev_impersonation(user_uuid);
        
        IF v_impersonated_role IS NOT NULL THEN
            RETURN v_impersonated_role;
        END IF;
    END IF;
    
    -- Return user's highest actual role
    SELECT role_type INTO v_actual_role
    FROM user_roles
    WHERE user_id = user_uuid
    AND is_active = TRUE
    ORDER BY 
        CASE role_type
            WHEN 'admin' THEN 1
            WHEN 'consultor' THEN 2
            WHEN 'equipo_directivo' THEN 3
            WHEN 'lider_generacion' THEN 4
            WHEN 'lider_comunidad' THEN 5
            WHEN 'docente' THEN 6
        END
    LIMIT 1;
    
    -- If user is a dev but has no other role, return admin to give them access
    IF v_actual_role IS NULL AND is_dev_user(user_uuid) THEN
        RETURN 'admin'::user_role_type;
    END IF;
    
    RETURN v_actual_role;
END;
$$;


ALTER FUNCTION "public"."get_effective_user_role"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_emotion_recommendations"("p_user_id" "uuid") RETURNS TABLE("emotion" "text", "score" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH time_period AS (
    SELECT 
      CASE 
        WHEN EXTRACT(HOUR FROM NOW()) < 6 THEN 'night'
        WHEN EXTRACT(HOUR FROM NOW()) < 12 THEN 'morning'
        WHEN EXTRACT(HOUR FROM NOW()) < 18 THEN 'afternoon'
        ELSE 'evening'
      END AS current_period,
      EXTRACT(DOW FROM NOW())::INTEGER AS current_dow
  ),
  user_patterns AS (
    SELECT 
      r.emotion,
      SUM(r.frequency) AS total_frequency,
      MAX(CASE WHEN r.time_of_day = tp.current_period THEN r.frequency ELSE 0 END) AS time_match,
      MAX(CASE WHEN r.day_of_week = tp.current_dow THEN r.frequency ELSE 0 END) AS day_match,
      MAX(r.last_used) AS last_used
    FROM church_meditation_recommendations r
    CROSS JOIN time_period tp
    WHERE r.user_id = p_user_id
    GROUP BY r.emotion
  )
  SELECT 
    p.emotion,
    (
      COALESCE(p.total_frequency, 0) * 0.3 +
      COALESCE(p.time_match, 0) * 0.4 +
      COALESCE(p.day_match, 0) * 0.2 +
      CASE 
        WHEN p.last_used IS NULL THEN 0.1
        WHEN p.last_used < NOW() - INTERVAL '7 days' THEN 0.1
        ELSE 0
      END
    )::NUMERIC AS score
  FROM user_patterns p
  ORDER BY score DESC
  LIMIT 3;
END;
$$;


ALTER FUNCTION "public"."get_emotion_recommendations"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_folder_breadcrumb"("folder_uuid" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  breadcrumb JSON;
BEGIN
  WITH RECURSIVE folder_path AS (
    -- Base case: start with the target folder
    SELECT id, folder_name, parent_folder_id, 0 as level
    FROM document_folders
    WHERE id = folder_uuid
    
    UNION ALL
    
    -- Recursive case: get parent folders
    SELECT df.id, df.folder_name, df.parent_folder_id, fp.level + 1
    FROM document_folders df
    JOIN folder_path fp ON df.id = fp.parent_folder_id
  )
  SELECT json_agg(
    json_build_object(
      'id', id,
      'name', folder_name
    ) ORDER BY level DESC
  ) INTO breadcrumb
  FROM folder_path;
  
  RETURN COALESCE(breadcrumb, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."get_folder_breadcrumb"("folder_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_meeting_stats"("p_workspace_id" "uuid") RETURNS TABLE("total_meetings" bigint, "upcoming_meetings" bigint, "completed_meetings" bigint, "total_tasks" bigint, "completed_tasks" bigint, "overdue_tasks" bigint, "total_commitments" bigint, "completed_commitments" bigint, "overdue_commitments" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.is_active = TRUE),
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.status = 'programada' AND cm.meeting_date > NOW()),
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.status = 'completada'),
    
    (SELECT COUNT(*) FROM meeting_tasks mt 
     JOIN community_meetings cm ON cm.id = mt.meeting_id 
     WHERE cm.workspace_id = p_workspace_id),
    (SELECT COUNT(*) FROM meeting_tasks mt 
     JOIN community_meetings cm ON cm.id = mt.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mt.status = 'completado'),
    (SELECT COUNT(*) FROM meeting_tasks mt 
     JOIN community_meetings cm ON cm.id = mt.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mt.status IN ('pendiente', 'en_progreso') AND mt.due_date < CURRENT_DATE),
    
    (SELECT COUNT(*) FROM meeting_commitments mc 
     JOIN community_meetings cm ON cm.id = mc.meeting_id 
     WHERE cm.workspace_id = p_workspace_id),
    (SELECT COUNT(*) FROM meeting_commitments mc 
     JOIN community_meetings cm ON cm.id = mc.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mc.status = 'completado'),
    (SELECT COUNT(*) FROM meeting_commitments mc 
     JOIN community_meetings cm ON cm.id = mc.meeting_id 
     WHERE cm.workspace_id = p_workspace_id AND mc.status IN ('pendiente', 'en_progreso') AND mc.due_date < CURRENT_DATE);
END;
$$;


ALTER FUNCTION "public"."get_meeting_stats"("p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_meeting_stats"("p_workspace_id" "uuid") IS 'Returns statistical summary of meetings for a workspace';



CREATE OR REPLACE FUNCTION "public"."get_or_create_community_for_leader"("p_leader_id" "uuid", "p_school_id" "uuid", "p_generation_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_community_id UUID;
  v_leader_name TEXT;
  v_community_name TEXT;
  v_generation_name TEXT;
BEGIN
  -- Get leader's name
  SELECT first_name || ' ' || last_name INTO v_leader_name
  FROM profiles
  WHERE id = p_leader_id;
  
  -- If no name found, use a default
  IF v_leader_name IS NULL OR v_leader_name = ' ' THEN
    v_leader_name := 'Líder';
  END IF;
  
  -- Build community name
  v_community_name := 'Comunidad de ' || v_leader_name;
  
  -- If generation is provided, add it to the name
  IF p_generation_id IS NOT NULL THEN
    SELECT name INTO v_generation_name
    FROM generations
    WHERE id = p_generation_id;
    
    IF v_generation_name IS NOT NULL THEN
      v_community_name := v_community_name || ' - ' || v_generation_name;
    END IF;
  END IF;
  
  -- First, check if a community with this exact name already exists for this school/generation
  SELECT id INTO v_community_id
  FROM growth_communities
  WHERE name = v_community_name
    AND school_id = p_school_id
    AND (generation_id = p_generation_id OR (generation_id IS NULL AND p_generation_id IS NULL));
  
  -- If found, return existing community
  IF v_community_id IS NOT NULL THEN
    RETURN v_community_id;
  END IF;
  
  -- If not found, create new community
  INSERT INTO growth_communities (school_id, generation_id, name, max_teachers)
  VALUES (p_school_id, p_generation_id, v_community_name, 16)
  RETURNING id INTO v_community_id;
  
  RETURN v_community_id;
  
EXCEPTION
  WHEN unique_violation THEN
    -- If we hit the unique constraint (race condition), try to fetch again
    SELECT id INTO v_community_id
    FROM growth_communities
    WHERE name = v_community_name
      AND school_id = p_school_id
      AND (generation_id = p_generation_id OR (generation_id IS NULL AND p_generation_id IS NULL));
    
    RETURN v_community_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_community_for_leader"("p_leader_id" "uuid", "p_school_id" "uuid", "p_generation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_community_for_leader"("p_leader_id" "uuid", "p_school_id" "uuid", "p_generation_id" "uuid") IS 'Safely gets or creates a community for a community leader, preventing duplicates.
This function should be used instead of directly creating communities when assigning
the lider_comunidad role to ensure no duplicate communities are created.';



CREATE OR REPLACE FUNCTION "public"."get_or_create_community_workspace"("p_community_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_workspace_id UUID;
    v_community_name TEXT;
  BEGIN
    -- Try to get existing workspace
    SELECT id INTO v_workspace_id
    FROM community_workspaces
    WHERE community_id = p_community_id;

    -- If workspace doesn't exist, create it
    IF v_workspace_id IS NULL THEN
      -- Get community name for workspace naming
      SELECT name INTO v_community_name
      FROM growth_communities
      WHERE id = p_community_id;

      -- Create new workspace
      INSERT INTO community_workspaces (
        community_id,
        name,
        description,
        settings
      ) VALUES (
        p_community_id,
        'Espacio de ' || COALESCE(v_community_name, 'Comunidad'),
        'Espacio colaborativo para ' || COALESCE(v_community_name, 'esta comunidad'),
        '{
          "features": {
            "meetings": true,
            "documents": true,
            "messaging": true,
            "feed": true
          },
          "permissions": {
            "all_can_post": true,
            "all_can_upload": true
          }
        }'::jsonb
      )
      RETURNING id INTO v_workspace_id;
    END IF;

    RETURN v_workspace_id;
  END;
  $$;


ALTER FUNCTION "public"."get_or_create_community_workspace"("p_community_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_community_workspace"("p_community_id" "uuid") IS 'Gets existing workspace or creates one for a community';



CREATE OR REPLACE FUNCTION "public"."get_overdue_items"("p_workspace_id" "uuid" DEFAULT NULL::"uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("item_type" "text", "item_id" "uuid", "title" "text", "due_date" "date", "days_overdue" integer, "assigned_to" "uuid", "meeting_title" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'commitment'::TEXT as item_type,
    mc.id as item_id,
    mc.commitment_text as title,
    mc.due_date,
    (CURRENT_DATE - mc.due_date)::INTEGER as days_overdue,
    mc.assigned_to,
    cm.title as meeting_title
  FROM meeting_commitments mc
  JOIN community_meetings cm ON cm.id = mc.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mc.status IN ('pendiente', 'en_progreso')
    AND mc.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (p_user_id IS NULL OR mc.assigned_to = p_user_id)
  
  UNION ALL
  
  SELECT 
    'task'::TEXT as item_type,
    mt.id as item_id,
    mt.task_title as title,
    mt.due_date,
    (CURRENT_DATE - mt.due_date)::INTEGER as days_overdue,
    mt.assigned_to,
    cm.title as meeting_title
  FROM meeting_tasks mt
  JOIN community_meetings cm ON cm.id = mt.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mt.status IN ('pendiente', 'en_progreso')
    AND mt.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (p_user_id IS NULL OR mt.assigned_to = p_user_id)
  
  ORDER BY days_overdue DESC, due_date DESC;
END;
$$;


ALTER FUNCTION "public"."get_overdue_items"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_overdue_items"("p_workspace_id" "uuid", "p_user_id" "uuid") IS 'Returns overdue tasks and commitments for a workspace or user';



CREATE OR REPLACE FUNCTION "public"."get_recent_document_activity"("workspace_uuid" "uuid", "limit_count" integer DEFAULT 20) RETURNS TABLE("document_id" "uuid", "document_title" character varying, "action_type" character varying, "user_id" "uuid", "accessed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dal.document_id,
    cd.title as document_title,
    dal.action_type,
    dal.user_id,
    dal.accessed_at
  FROM document_access_log dal
  JOIN community_documents cd ON dal.document_id = cd.id
  WHERE dal.workspace_id = workspace_uuid
    AND cd.is_active = true
  ORDER BY dal.accessed_at DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_recent_document_activity"("workspace_uuid" "uuid", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_related_bugs"("target_bug_id" "uuid", "result_limit" integer DEFAULT 5) RETURNS TABLE("bug_id" "uuid", "title" "text", "common_tags" "text"[], "common_files" "text"[], "relevance_score" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH target_bug AS (
    SELECT tags, affected_files, category
    FROM debug_bugs
    WHERE id = target_bug_id
  )
  SELECT
    db.id as bug_id,
    db.title,
    array(SELECT unnest(db.tags) INTERSECT SELECT unnest(tb.tags)) as common_tags,
    array(SELECT unnest(db.affected_files) INTERSECT SELECT unnest(tb.affected_files)) as common_files,
    (
      cardinality(array(SELECT unnest(db.tags) INTERSECT SELECT unnest(tb.tags))) +
      cardinality(array(SELECT unnest(db.affected_files) INTERSECT SELECT unnest(tb.affected_files))) +
      CASE WHEN db.category = tb.category THEN 2 ELSE 0 END
    ) as relevance_score
  FROM debug_bugs db, target_bug tb
  WHERE db.id != target_bug_id
  AND (
    db.tags && tb.tags OR
    db.affected_files && tb.affected_files OR
    db.category = tb.category
  )
  ORDER BY relevance_score DESC
  LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."get_related_bugs"("target_bug_id" "uuid", "result_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_related_bugs"("target_bug_id" "uuid", "result_limit" integer) IS 'Finds related bugs based on common tags, affected files, and category';



CREATE OR REPLACE FUNCTION "public"."get_reportable_users"("requesting_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "user_email" "text", "user_name" "text", "user_role" "text", "school_name" "text", "generation_name" "text", "community_name" "text", "can_view" boolean, "can_assign_courses" boolean, "relationship_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  requesting_roles RECORD;
  is_admin BOOLEAN;
BEGIN
  -- Check if user has admin role
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = requesting_user_id 
    AND role_type = 'admin' 
    AND is_active = TRUE
  ) INTO is_admin;

  -- If admin, return all users
  IF is_admin THEN
    RETURN QUERY
    SELECT 
      p.id as user_id,
      p.email as user_email,
      CONCAT(p.first_name, ' ', p.last_name) as user_name,
      COALESCE(
        (SELECT string_agg(ur.role_type, ', ' ORDER BY ur.role_type) 
         FROM user_roles ur WHERE ur.user_id = p.id AND ur.is_active = TRUE), 
        'no_role'
      ) as user_role,
      s.name as school_name,
      g.name as generation_name,
      gc.name as community_name,
      TRUE as can_view,
      TRUE as can_assign_courses,
      'admin' as relationship_type
    FROM profiles p
    LEFT JOIN schools s ON p.school_id = s.id
    LEFT JOIN generations g ON p.generation_id = g.id
    LEFT JOIN growth_communities gc ON p.community_id = gc.id
    WHERE p.approval_status = 'approved';
  ELSE
    -- Non-admin: process based on roles
    FOR requesting_roles IN 
      SELECT ur.role_type, ur.school_id, ur.generation_id, ur.community_id
      FROM user_roles ur 
      WHERE ur.user_id = requesting_user_id AND ur.is_active = TRUE
    LOOP
      CASE requesting_roles.role_type
        -- LEADERSHIP TEAM: Can see all users in their school
        WHEN 'equipo_directivo' THEN
          RETURN QUERY
          SELECT 
            p.id as user_id,
            p.email as user_email,
            CONCAT(p.first_name, ' ', p.last_name) as user_name,
            COALESCE(
              (SELECT string_agg(ur.role_type, ', ' ORDER BY ur.role_type) 
               FROM user_roles ur WHERE ur.user_id = p.id AND ur.is_active = TRUE), 
              'no_role'
            ) as user_role,
            s.name as school_name,
            g.name as generation_name,
            gc.name as community_name,
            TRUE as can_view,
            TRUE as can_assign_courses,
            'school_leadership' as relationship_type
          FROM profiles p
          LEFT JOIN schools s ON p.school_id = s.id
          LEFT JOIN generations g ON p.generation_id = g.id
          LEFT JOIN growth_communities gc ON p.community_id = gc.id
          WHERE p.school_id = requesting_roles.school_id
            AND p.approval_status = 'approved'
            AND p.id != requesting_user_id;

        -- GENERATION LEADER: Can see all users in their generation
        WHEN 'lider_generacion' THEN
          RETURN QUERY
          SELECT 
            p.id as user_id,
            p.email as user_email,
            CONCAT(p.first_name, ' ', p.last_name) as user_name,
            COALESCE(
              (SELECT string_agg(ur.role_type, ', ' ORDER BY ur.role_type) 
               FROM user_roles ur WHERE ur.user_id = p.id AND ur.is_active = TRUE), 
              'no_role'
            ) as user_role,
            s.name as school_name,
            g.name as generation_name,
            gc.name as community_name,
            TRUE as can_view,
            TRUE as can_assign_courses,
            'generation_leadership' as relationship_type
          FROM profiles p
          LEFT JOIN schools s ON p.school_id = s.id
          LEFT JOIN generations g ON p.generation_id = g.id
          LEFT JOIN growth_communities gc ON p.community_id = gc.id
          WHERE p.generation_id = requesting_roles.generation_id
            AND p.approval_status = 'approved'
            AND p.id != requesting_user_id;

        -- COMMUNITY LEADER: Can see all users in their community
        WHEN 'lider_comunidad' THEN
          RETURN QUERY
          SELECT 
            p.id as user_id,
            p.email as user_email,
            CONCAT(p.first_name, ' ', p.last_name) as user_name,
            COALESCE(
              (SELECT string_agg(ur.role_type, ', ' ORDER BY ur.role_type) 
               FROM user_roles ur WHERE ur.user_id = p.id AND ur.is_active = TRUE), 
              'no_role'
            ) as user_role,
            s.name as school_name,
            g.name as generation_name,
            gc.name as community_name,
            TRUE as can_view,
            TRUE as can_assign_courses,
            'community_leadership' as relationship_type
          FROM profiles p
          LEFT JOIN schools s ON p.school_id = s.id
          LEFT JOIN generations g ON p.generation_id = g.id
          LEFT JOIN growth_communities gc ON p.community_id = gc.id
          WHERE p.community_id = requesting_roles.community_id
            AND p.approval_status = 'approved'
            AND p.id != requesting_user_id;

        ELSE
          -- TEACHER or other roles: Can only see themselves
          RETURN QUERY
          SELECT 
            p.id as user_id,
            p.email as user_email,
            CONCAT(p.first_name, ' ', p.last_name) as user_name,
            COALESCE(
              (SELECT string_agg(ur.role_type, ', ' ORDER BY ur.role_type) 
               FROM user_roles ur WHERE ur.user_id = p.id AND ur.is_active = TRUE), 
              'no_role'
            ) as user_role,
            s.name as school_name,
            g.name as generation_name,
            gc.name as community_name,
            TRUE as can_view,
            FALSE as can_assign_courses,
            'self' as relationship_type
          FROM profiles p
          LEFT JOIN schools s ON p.school_id = s.id
          LEFT JOIN generations g ON p.generation_id = g.id
          LEFT JOIN growth_communities gc ON p.community_id = gc.id
          WHERE p.id = requesting_user_id;
      END CASE;
    END LOOP;
  END IF;

  RETURN;
END;
$$;


ALTER FUNCTION "public"."get_reportable_users"("requesting_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reportable_users_enhanced"("requesting_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "first_name" character varying, "last_name" character varying, "email" character varying, "role" character varying, "school_id" "uuid", "generation_id" "uuid", "community_id" "uuid", "assignment_type" character varying, "can_view_progress" boolean, "assignment_scope" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH direct_assignments AS (
        -- Individual assignments
        SELECT 
            p.id as user_id,
            p.first_name,
            p.last_name,
            p.email,
            COALESCE(
              (SELECT ur.role_type::varchar 
               FROM user_roles ur 
               WHERE ur.user_id = p.id AND ur.is_active = TRUE 
               LIMIT 1), 
              'no_role'
            ) as role,
            ca.school_id,
            ca.generation_id,
            ca.community_id,
            ca.assignment_type,
            ca.can_view_progress,
            'individual'::TEXT as assignment_scope
        FROM consultant_assignments ca
        JOIN profiles p ON p.id = ca.student_id
        WHERE ca.consultant_id = requesting_user_id
            AND ca.is_active = true
            AND ca.can_view_progress = true
            AND (ca.ends_at IS NULL OR ca.ends_at > NOW())
            AND ca.student_id IS NOT NULL
    ),
    group_assignments AS (
        -- Group assignments (school, generation, or community level)
        SELECT 
            p.id as user_id,
            p.first_name,
            p.last_name,
            p.email,
            COALESCE(
              (SELECT ur.role_type::varchar 
               FROM user_roles ur 
               WHERE ur.user_id = p.id AND ur.is_active = TRUE 
               LIMIT 1), 
              'no_role'
            ) as role,
            ca.school_id,
            ca.generation_id,
            ca.community_id,
            ca.assignment_type,
            ca.can_view_progress,
            CASE 
                WHEN ca.community_id IS NOT NULL THEN 'community'
                WHEN ca.generation_id IS NOT NULL THEN 'generation'
                WHEN ca.school_id IS NOT NULL THEN 'school'
            END::TEXT as assignment_scope
        FROM consultant_assignments ca
        JOIN profiles p ON 
            (ca.community_id IS NOT NULL AND p.community_id = ca.community_id) OR
            (ca.community_id IS NULL AND ca.generation_id IS NOT NULL AND p.generation_id = ca.generation_id) OR
            (ca.community_id IS NULL AND ca.generation_id IS NULL AND ca.school_id IS NOT NULL AND p.school_id = ca.school_id)
        WHERE ca.consultant_id = requesting_user_id
            AND ca.is_active = true
            AND ca.can_view_progress = true
            AND (ca.ends_at IS NULL OR ca.ends_at > NOW())
            AND ca.student_id IS NULL
    )
    SELECT DISTINCT * FROM (
        SELECT * FROM direct_assignments
        UNION ALL
        SELECT * FROM group_assignments
    ) combined_assignments
    ORDER BY last_name, first_name;
END;
$$;


ALTER FUNCTION "public"."get_reportable_users_enhanced"("requesting_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_reportable_users_enhanced"("requesting_user_id" "uuid") IS 'Returns all users a consultant can report on, including both individual and group assignments';



CREATE OR REPLACE FUNCTION "public"."get_school_user_counts"() RETURNS TABLE("school_id" integer, "user_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.school_id::integer,
        COUNT(DISTINCT ur.user_id) as user_count
    FROM user_roles ur
    WHERE ur.school_id IS NOT NULL
    GROUP BY ur.school_id;
END;
$$;


ALTER FUNCTION "public"."get_school_user_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_thread_statistics"("p_thread_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
      result JSON;
  BEGIN
      SELECT json_build_object(
          'message_count', COALESCE(COUNT(cm.id), 0),
          'participant_count', COALESCE(COUNT(DISTINCT cm.author_id), 0),
          'last_message_at', COALESCE(MAX(cm.created_at), NOW())
      )
      INTO result
      FROM community_messages cm
      WHERE cm.thread_id = p_thread_id AND cm.is_deleted = FALSE;

      RETURN result;
  END;
  $$;


ALTER FUNCTION "public"."get_thread_statistics"("p_thread_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_count"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM user_notifications
  WHERE user_id = p_user_id AND is_read = FALSE;
  
  RETURN unread_count;
END;
$$;


ALTER FUNCTION "public"."get_unread_notification_count"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_admin_status"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = user_uuid
        AND role_type = 'admin'
        AND is_active = TRUE
    );
END;
$$;


ALTER FUNCTION "public"."get_user_admin_status"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_badges"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "badge_name" "text", "badge_description" "text", "badge_type" "text", "icon_name" "text", "color_primary" "text", "color_secondary" "text", "course_id" "uuid", "course_name" "text", "earned_at" timestamp with time zone, "points_value" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        ub.id,
        b.name AS badge_name,
        b.description AS badge_description,
        b.badge_type,
        b.icon_name,
        b.color_primary,
        b.color_secondary,
        ub.course_id,
        COALESCE(ub.metadata->>'course_name', c.title) AS course_name,
        ub.earned_at,
        b.points_value
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    LEFT JOIN courses c ON c.id = ub.course_id
    WHERE ub.user_id = p_user_id
    ORDER BY ub.earned_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_user_badges"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_messaging_permissions"("p_user_id" "uuid", "p_workspace_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    has_admin_role BOOLEAN;
    has_community_leader_role BOOLEAN;
    result JSON;
BEGIN
    -- Check if user has admin role
    SELECT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id 
        AND role_type = 'admin' 
        AND is_active = true
    ) INTO has_admin_role;

    -- Check if user has community leader role
    SELECT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id 
        AND role_type = 'lider_comunidad' 
        AND is_active = true
    ) INTO has_community_leader_role;

    -- Set permissions based on roles
    result := json_build_object(
        'can_view_messages', TRUE,
        'can_send_messages', TRUE,
        'can_create_threads', TRUE,
        'can_edit_own_messages', TRUE,
        'can_delete_own_messages', TRUE,
        'can_moderate_messages', has_admin_role,
        'can_pin_threads', has_admin_role OR has_community_leader_role,
        'can_archive_threads', has_admin_role OR has_community_leader_role,
        'can_upload_attachments', TRUE,
        'can_mention_all', has_admin_role OR has_community_leader_role,
        'can_view_analytics', has_admin_role OR has_community_leader_role,
        'can_manage_reactions', TRUE
    );

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_user_messaging_permissions"("p_user_id" "uuid", "p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_workspace_role"("p_user_id" "uuid", "p_workspace_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- First check if user is admin (global access)
    SELECT role_type INTO v_role
    FROM user_roles
    WHERE user_id = p_user_id
    AND role_type = 'admin'
    AND is_active = TRUE
    LIMIT 1;
    
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;
    
    -- Check user's role in the workspace's community
    SELECT ur.role_type INTO v_role
    FROM user_roles ur
    JOIN community_workspaces cw ON cw.community_id = ur.community_id
    WHERE ur.user_id = p_user_id
    AND cw.id = p_workspace_id
    AND ur.is_active = TRUE
    LIMIT 1;
    
    IF v_role IS NOT NULL THEN
        RETURN v_role;
    END IF;
    
    -- Check if user is consultant with access to this workspace's community school
    SELECT ur.role_type INTO v_role
    FROM user_roles ur
    JOIN community_workspaces cw ON cw.id = p_workspace_id
    JOIN growth_communities gc ON gc.id = cw.community_id
    WHERE ur.user_id = p_user_id
    AND ur.role_type = 'consultor'
    AND ur.school_id = gc.school_id
    AND ur.is_active = TRUE
    LIMIT 1;
    
    RETURN v_role; -- Will be NULL if no access
END;
$$;


ALTER FUNCTION "public"."get_user_workspace_role"("p_user_id" "uuid", "p_workspace_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_workspace_role"("p_user_id" "uuid", "p_workspace_id" "uuid") IS 'Returns the user role type for a given workspace, or NULL if no access';



CREATE OR REPLACE FUNCTION "public"."get_users_needing_metadata_sync"() RETURNS TABLE("user_id" "uuid", "profile_role" "text", "needs_sync" boolean)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    -- Return empty result set since profiles.role column no longer exists
    -- All users should now be using the user_roles table
    RETURN;
END;
$$;


ALTER FUNCTION "public"."get_users_needing_metadata_sync"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_needing_metadata_sync"() IS 'Returns list of users needing metadata sync';



CREATE OR REPLACE FUNCTION "public"."get_workspace_messaging_stats"("p_workspace_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
      result JSON;
  BEGIN
      SELECT json_build_object(
          'total_threads', COALESCE(COUNT(DISTINCT mt.id), 0),
          'total_messages', COALESCE(COUNT(DISTINCT cm.id), 0),
          'active_participants', COALESCE(COUNT(DISTINCT cm.author_id), 0),
          'recent_activity', COALESCE(COUNT(DISTINCT cm.id) FILTER (WHERE cm.created_at > NOW() - INTERVAL '7 days'), 0),
          'pinned_threads', COALESCE(COUNT(DISTINCT mt.id) FILTER (WHERE mt.is_pinned = TRUE), 0),
          'total_attachments', COALESCE(COUNT(DISTINCT ma.id), 0)
      )
      INTO result
      FROM message_threads mt
      LEFT JOIN community_messages cm ON mt.id = cm.thread_id AND cm.is_deleted = FALSE
      LEFT JOIN message_attachments ma ON cm.id = ma.message_id AND ma.is_active = TRUE
      WHERE mt.workspace_id = p_workspace_id AND mt.is_archived = FALSE;

      RETURN result;
  END;
  $$;


ALTER FUNCTION "public"."get_workspace_messaging_stats"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE quiz_submissions
    SET 
        review_status = p_review_status,
        general_feedback = p_general_feedback,
        grading_feedback = p_question_feedback,
        graded_by = p_graded_by,
        graded_at = NOW(),
        grading_status = 'completed'
    WHERE id = p_submission_id;
    
    -- Update the submission answers with feedback
    IF p_question_feedback IS NOT NULL THEN
        UPDATE quiz_submissions
        SET open_responses = (
            SELECT jsonb_agg(
                CASE 
                    WHEN (p_question_feedback->>item->>'question_id') IS NOT NULL THEN
                        item || jsonb_build_object('feedback', p_question_feedback->>item->>'question_id')
                    ELSE
                        item
                END
            )
            FROM jsonb_array_elements(open_responses) AS item
        )
        WHERE id = p_submission_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_total_manual_score INTEGER := 0;
  v_grade JSONB;
BEGIN
  -- Calculate total manual score
  FOR v_grade IN SELECT * FROM jsonb_array_elements(p_grading_data)
  LOOP
    v_total_manual_score := v_total_manual_score + (v_grade->>'score')::INTEGER;
  END LOOP;
  
  -- Update the submission
  UPDATE quiz_submissions
  SET 
    manual_graded_score = v_total_manual_score,
    grading_status = 'completed',
    graded_at = CURRENT_TIMESTAMP,
    graded_by = p_graded_by,
    grading_feedback = p_grading_data
  WHERE id = p_submission_id;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Admins always have permission
  IF EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = check_user_id 
    AND role_type = 'admin'
    AND is_active = true
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has been granted permission
  RETURN EXISTS (
    SELECT 1 FROM feedback_permissions 
    WHERE user_id = check_user_id 
    AND is_active = TRUE 
    AND revoked_at IS NULL
  );
END;
$$;


ALTER FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") IS 'Checks if a user has permission to submit feedback (admins always have permission)';



CREATE OR REPLACE FUNCTION "public"."has_global_workspace_access"("check_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = check_user_id
      AND role_type IN ('admin', 'consultor')
      AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."has_global_workspace_access"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_transformation_access"("community_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  -- Verificar nueva tabla primero
  IF EXISTS (
    SELECT 1
    FROM growth_community_transformation_access gcta
    WHERE gcta.growth_community_id = community_id
      AND gcta.is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- Fallback TEMPORAL al flag viejo durante período de migración
  -- Este bloque se eliminará en migración 023 (cleanup)
  IF EXISTS (
    SELECT 1
    FROM growth_communities gc
    WHERE gc.id = community_id
      AND gc.transformation_enabled = true
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


ALTER FUNCTION "public"."has_transformation_access"("community_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_transformation_access"("community_id" "uuid") IS 'Helper para RLS policies. Durante migración verifica AMBOS: nueva tabla Y flag viejo. Después de cleanup (migración 023) solo verificará la tabla nueva. Esto permite deployment gradual sin downtime.';



CREATE OR REPLACE FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  workspace_uuid UUID;
BEGIN
  -- Get workspace ID
  SELECT workspace_id INTO workspace_uuid 
  FROM community_documents 
  WHERE id = document_uuid;
  
  -- Update document counters
  IF counter_type = 'view' THEN
    UPDATE community_documents 
    SET view_count = view_count + 1, updated_at = NOW()
    WHERE id = document_uuid;
  ELSIF counter_type = 'download' THEN
    UPDATE community_documents 
    SET download_count = download_count + 1, updated_at = NOW()
    WHERE id = document_uuid;
  END IF;
  
  -- Log the access if user is provided
  IF user_uuid IS NOT NULL AND workspace_uuid IS NOT NULL THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (document_uuid, user_uuid, workspace_uuid, counter_type);
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_path_assignment_time"("p_user_id" "uuid", "p_path_id" "uuid", "p_minutes" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.learning_path_assignments
  SET total_time_spent_minutes = COALESCE(total_time_spent_minutes, 0) + GREATEST(p_minutes, 0),
      last_activity_at = NOW()
  WHERE user_id = p_user_id
    AND path_id = p_path_id;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."increment_path_assignment_time"("p_user_id" "uuid", "p_path_id" "uuid", "p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_post_view_count"("post_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE community_posts
  SET view_count = view_count + 1
  WHERE id = post_id;
END;
$$;


ALTER FUNCTION "public"."increment_post_view_count"("post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_roles 
    WHERE user_id = auth.uid() 
      AND role_type = 'admin' 
      AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_consultor"("p_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT EXISTS (
SELECT 1
FROM public.user_roles ur
WHERE ur.user_id = p_uid
AND COALESCE(ur.is_active, true)
AND ur.role_type IN ('admin','consultor','equipo_directivo')
);
$$;


ALTER FUNCTION "public"."is_admin_or_consultor"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_assessment_collaborator"("assessment_uuid" "uuid", "uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM transformation_assessment_collaborators
        WHERE assessment_id = assessment_uuid
          AND user_id = uid
          AND can_edit = true
    );
$$;


ALTER FUNCTION "public"."is_assessment_collaborator"("assessment_uuid" "uuid", "uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_community_member"("check_user_id" "uuid", "check_community_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = check_user_id
      AND community_id = check_community_id
      AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_community_member"("check_user_id" "uuid", "check_community_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dev_user"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM dev_users 
        WHERE user_id = user_uuid 
        AND is_active = TRUE
    );
END;
$$;


ALTER FUNCTION "public"."is_dev_user"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_global_admin"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN
      RETURN EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = user_uuid
          AND role_type = 'admin'
          AND is_active = TRUE
      );
  END;
  $$;


ALTER FUNCTION "public"."is_global_admin"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_document_access"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only log if view_count or download_count changed
  IF (OLD.view_count != NEW.view_count) THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (NEW.id, auth.uid(), NEW.workspace_id, 'view');
  END IF;
  
  IF (OLD.download_count != NEW.download_count) THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (NEW.id, auth.uid(), NEW.workspace_id, 'download');
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_document_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_initial_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Log first-time assignments (INSERT operations)
  INSERT INTO transformation_access_audit_log (
    growth_community_id,
    action,
    performed_by,
    notes
  ) VALUES (
    NEW.growth_community_id,
    'assigned',
    NEW.assigned_by,
    'Asignación inicial de paquete completo (7 vías)'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_initial_assignment"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_initial_assignment"() IS '🔧 FIX: Registra asignaciones iniciales en audit log (trigger UPDATE solo capturaba reasignaciones)';



CREATE OR REPLACE FUNCTION "public"."log_metadata_sync_needed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role) THEN
        INSERT INTO metadata_sync_log (user_id, old_role, new_role)
        VALUES (
            NEW.id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.role ELSE NULL END,
            NEW.role
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_metadata_sync_needed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_notification_event"("p_event_type" "text", "p_event_data" "jsonb", "p_trigger_id" "uuid" DEFAULT NULL::"uuid", "p_notifications_count" integer DEFAULT 0, "p_status" "text" DEFAULT 'success'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO notification_events (
        event_type,
        event_data,
        trigger_id,
        notifications_created,
        status
    ) VALUES (
        p_event_type,
        p_event_data,
        p_trigger_id,
        p_notifications_count,
        p_status
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$;


ALTER FUNCTION "public"."log_notification_event"("p_event_type" "text", "p_event_data" "jsonb", "p_trigger_id" "uuid", "p_notifications_count" integer, "p_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_notification_event"("p_event_type" "text", "p_event_data" "jsonb", "p_trigger_id" "uuid", "p_notifications_count" integer, "p_status" "text") IS 'Helper function to log notification trigger events';



CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE user_notifications 
  SET is_read = TRUE, read_at = NOW()
  WHERE user_id = p_user_id AND is_read = FALSE;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;


ALTER FUNCTION "public"."mark_all_notifications_read"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("notification_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE notifications 
  SET is_read = true, read_at = NOW()
  WHERE id = notification_id AND user_id = auth.uid();
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."mark_notification_read"("notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE user_notifications 
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_assignments_to_enrollments"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  assignment_record RECORD;
  enrollment_count INTEGER := 0;
  user_id_column TEXT;
  course_id_column TEXT;
  created_at_column TEXT;
  id_column TEXT;
  sql_query TEXT;
BEGIN
  -- First check what columns exist in course_assignments table
  SELECT column_name INTO user_id_column
  FROM information_schema.columns 
  WHERE table_name = 'course_assignments' 
    AND column_name IN ('user_id', 'teacher_id', 'student_id', 'profile_id')
  LIMIT 1;
  
  SELECT column_name INTO course_id_column
  FROM information_schema.columns 
  WHERE table_name = 'course_assignments' 
    AND column_name IN ('course_id', 'course')
  LIMIT 1;
  
  SELECT column_name INTO created_at_column
  FROM information_schema.columns 
  WHERE table_name = 'course_assignments' 
    AND column_name IN ('created_at', 'created', 'date_created', 'assigned_at')
  LIMIT 1;
  
  SELECT column_name INTO id_column
  FROM information_schema.columns 
  WHERE table_name = 'course_assignments' 
    AND column_name IN ('id', 'assignment_id')
  LIMIT 1;
  
  -- Only proceed if we found the essential columns and the table exists
  IF user_id_column IS NOT NULL AND course_id_column IS NOT NULL THEN
    
    -- Build dynamic query based on actual column names
    sql_query := format('
      SELECT ca.%I as user_id, ca.%I as course_id, %s as created_at, %s as assignment_id
      FROM course_assignments ca
      WHERE EXISTS (SELECT 1 FROM profiles WHERE id = ca.%I)
        AND EXISTS (SELECT 1 FROM courses WHERE id = ca.%I)
        AND NOT EXISTS (
          SELECT 1 FROM course_enrollments ce 
          WHERE ce.user_id = ca.%I AND ce.course_id = ca.%I
        )', 
      user_id_column, 
      course_id_column,
      CASE WHEN created_at_column IS NOT NULL THEN format('ca.%I', created_at_column) ELSE 'NOW()' END,
      CASE WHEN id_column IS NOT NULL THEN format('ca.%I', id_column) ELSE 'NULL' END,
      user_id_column, 
      course_id_column,
      user_id_column, 
      course_id_column
    );
    
    FOR assignment_record IN EXECUTE sql_query LOOP
      INSERT INTO course_enrollments (
        user_id,
        course_id,
        enrolled_at,
        enrolled_by,
        enrollment_type,
        status,
        enrollment_data
      ) VALUES (
        assignment_record.user_id,
        assignment_record.course_id,
        assignment_record.created_at,
        NULL,
        'assigned',
        'active',
        jsonb_build_object(
          'migrated_from_assignment', TRUE,
          'original_assignment_id', assignment_record.assignment_id
        )
      );
      
      enrollment_count := enrollment_count + 1;
    END LOOP;
  ELSE
    -- Log that no migration was needed
    RAISE NOTICE 'No course_assignments table found or missing required columns. Skipping migration.';
  END IF;
  
  RETURN enrollment_count;
END;
$$;


ALTER FUNCTION "public"."migrate_assignments_to_enrollments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_rubric_deletion_with_results"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transformation_results tr
    WHERE tr.rubric_item_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar el ítem de rúbrica % porque existen resultados asociados', OLD.id;
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_rubric_deletion_with_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_expense_report_total"("p_report_id" "uuid") RETURNS numeric
    LANGUAGE "sql"
    AS $$
  UPDATE expense_reports SET
    total_amount = (SELECT COALESCE(SUM(amount), 0) FROM expense_items WHERE report_id = p_report_id),
    updated_at = now()
  WHERE id = p_report_id
  RETURNING total_amount;
$$;


ALTER FUNCTION "public"."recompute_expense_report_total"("p_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_user_roles_cache"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache;
END;
$$;


ALTER FUNCTION "public"."refresh_user_roles_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_bugs_by_similarity"("search_query" "text", "similarity_threshold" double precision DEFAULT 0.3, "result_limit" integer DEFAULT 10) RETURNS TABLE("bug_id" "uuid", "title" "text", "category" "public"."debug_bug_category", "severity" "public"."debug_bug_severity", "status" "public"."debug_bug_status", "similarity_score" double precision)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    db.id as bug_id,
    db.title,
    db.category,
    db.severity,
    db.status,
    ts_rank(
      to_tsvector('english',
        coalesce(db.title, '') || ' ' ||
        coalesce(db.description, '') || ' ' ||
        coalesce(db.error_message, '')
      ),
      plainto_tsquery('english', search_query)
    ) as similarity_score
  FROM debug_bugs db
  WHERE to_tsvector('english',
    coalesce(db.title, '') || ' ' ||
    coalesce(db.description, '') || ' ' ||
    coalesce(db.error_message, '')
  ) @@ plainto_tsquery('english', search_query)
  AND ts_rank(
    to_tsvector('english',
      coalesce(db.title, '') || ' ' ||
      coalesce(db.description, '') || ' ' ||
      coalesce(db.error_message, '')
    ),
    plainto_tsquery('english', search_query)
  ) >= similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."search_bugs_by_similarity"("search_query" "text", "similarity_threshold" double precision, "result_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_bugs_by_similarity"("search_query" "text", "similarity_threshold" double precision, "result_limit" integer) IS 'Searches bugs using full-text search with configurable similarity threshold';



CREATE OR REPLACE FUNCTION "public"."set_enrollment_total_lessons"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_lesson_count INT;
BEGIN
    -- Get lesson count for the course
    SELECT COUNT(*) INTO v_lesson_count 
    FROM lessons 
    WHERE course_id = NEW.course_id;
    
    -- Auto-fill total_lessons if NULL or 0
    IF NEW.total_lessons IS NULL OR NEW.total_lessons = 0 THEN
        NEW.total_lessons := v_lesson_count;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_enrollment_total_lessons"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_enrollment_total_lessons"() IS 'Auto-populates total_lessons from course lesson count on enrollment creation/update. Prevents zero/null values.';



CREATE OR REPLACE FUNCTION "public"."set_expense_report_access_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_expense_report_access_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_updated_at"() IS 'Generic trigger function to auto-update updated_at timestamp';



CREATE OR REPLACE FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid" DEFAULT NULL::"uuid", "p_school_id" integer DEFAULT NULL::integer, "p_generation_id" "uuid" DEFAULT NULL::"uuid", "p_community_id" "uuid" DEFAULT NULL::"uuid", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_session_token TEXT;
BEGIN
    -- Verify user is a dev
    IF NOT is_dev_user(p_dev_user_id) THEN
        RAISE EXCEPTION 'User is not authorized as a developer';
    END IF;
    
    -- End any existing active sessions
    UPDATE dev_role_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE dev_user_id = p_dev_user_id
    AND is_active = TRUE;
    
    -- Generate session token
    v_session_token := encode(gen_random_bytes(32), 'hex');
    
    -- Create new impersonation session
    INSERT INTO dev_role_sessions (
        dev_user_id,
        impersonated_role,
        impersonated_user_id,
        school_id,
        generation_id,
        community_id,
        session_token,
        ip_address,
        user_agent
    ) VALUES (
        p_dev_user_id,
        p_impersonated_role,
        p_impersonated_user_id,
        p_school_id,
        p_generation_id,
        p_community_id,
        v_session_token,
        p_ip_address,
        p_user_agent
    );
    
    -- Log the action
    INSERT INTO dev_audit_log (dev_user_id, action, details, ip_address, user_agent)
    VALUES (
        p_dev_user_id,
        'start_impersonation',
        jsonb_build_object(
            'role', p_impersonated_role,
            'user_id', p_impersonated_user_id,
            'school_id', p_school_id,
            'generation_id', p_generation_id,
            'community_id', p_community_id
        ),
        p_ip_address,
        p_user_agent
    );
    
    RETURN v_session_token;
END;
$$;


ALTER FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid" DEFAULT NULL::"uuid", "p_activity_type" character varying DEFAULT 'path_view'::character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Close any open sessions for this user/path
  UPDATE public.learning_path_progress_sessions
  SET session_end = NOW(),
      time_spent_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - session_start)) / 60)),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND path_id = p_path_id
    AND session_end IS NULL;

  -- Record the new session
  INSERT INTO public.learning_path_progress_sessions (user_id, path_id, course_id, activity_type)
  VALUES (p_user_id, p_path_id, p_course_id, p_activity_type)
  RETURNING id INTO v_session_id;

  -- Touch assignment progress metadata if assignment exists
  UPDATE public.learning_path_assignments
  SET started_at = COALESCE(started_at, NOW()),
      last_activity_at = NOW()
  WHERE user_id = p_user_id
    AND path_id = p_path_id;

  RETURN v_session_id;
END;
$$;


ALTER FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid", "p_activity_type" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer DEFAULT NULL::integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_submission_id UUID;
  v_auto_score INTEGER := 0;
  v_total_points INTEGER := 0;
  v_auto_points INTEGER := 0;
  v_manual_points INTEGER := 0;
  v_open_responses JSONB := '[]'::jsonb;
  v_question JSONB;
  v_answer JSONB;
  v_correct_answer TEXT;
BEGIN
  -- Calculate scores
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_quiz_data->'questions')
  LOOP
    v_total_points := v_total_points + (v_question->>'points')::INTEGER;
    
    -- Get the student's answer for this question
    v_answer := p_answers->(v_question->>'id');
    
    IF v_question->>'type' = 'open-ended' THEN
      -- Track manual points and collect open responses
      v_manual_points := v_manual_points + (v_question->>'points')::INTEGER;
      v_open_responses := v_open_responses || jsonb_build_object(
        'question_id', v_question->>'id',
        'question', v_question->>'question',
        'response', v_answer->>'text',
        'points', (v_question->>'points')::INTEGER,
        'expectedAnswer', v_question->>'expectedAnswer',
        'gradingGuidelines', v_question->>'gradingGuidelines'
      );
    ELSE
      -- Auto-gradable question
      v_auto_points := v_auto_points + (v_question->>'points')::INTEGER;
      
      -- Check if answer is correct
      IF v_question->>'type' = 'multiple-choice' THEN
        -- Find the correct option
        SELECT o->>'id' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') o
        WHERE (o->>'isCorrect')::boolean = true
        LIMIT 1;
        
        IF v_answer->>'selectedOption' = v_correct_answer THEN
          v_auto_score := v_auto_score + (v_question->>'points')::INTEGER;
        END IF;
      ELSIF v_question->>'type' = 'true-false' THEN
        -- Similar logic for true/false
        SELECT o->>'id' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') o
        WHERE (o->>'isCorrect')::boolean = true
        LIMIT 1;
        
        IF v_answer->>'selectedOption' = v_correct_answer THEN
          v_auto_score := v_auto_score + (v_question->>'points')::INTEGER;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  -- Insert the submission
  INSERT INTO quiz_submissions (
    lesson_id,
    block_id,
    student_id,
    course_id,
    auto_graded_score,
    manual_graded_score,
    total_possible_points,
    auto_gradable_points,
    manual_gradable_points,
    grading_status,
    answers,
    open_responses,
    time_spent
  ) VALUES (
    p_lesson_id,
    p_block_id,
    p_student_id,
    p_course_id,
    v_auto_score,
    0, -- Manual score starts at 0
    v_total_points,
    v_auto_points,
    v_manual_points,
    CASE WHEN v_manual_points > 0 THEN 'pending_review' ELSE 'completed' END,
    p_answers,
    CASE WHEN v_manual_points > 0 THEN v_open_responses ELSE NULL END,
    p_time_spent
  )
  RETURNING id INTO v_submission_id;
  
  -- If there are open-ended questions, create a notification for the teacher
  IF v_manual_points > 0 THEN
    -- This will be handled by the application layer to send notification
    -- We'll return the submission ID so the app can handle it
    NULL;
  END IF;
  
  RETURN v_submission_id;
END;
$$;


ALTER FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) IS 'Submits a quiz with auto-grading. Uses student_id parameter which maps to the student_id column in quiz_submissions table.';



CREATE OR REPLACE FUNCTION "public"."supervisor_can_access_user"("supervisor_user_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  supervisor_network_id UUID;
  target_school_id INTEGER;
  school_in_network BOOLEAN;
BEGIN
  -- Get supervisor's network ID
  SELECT red_id INTO supervisor_network_id
  FROM user_roles
  WHERE user_id = supervisor_user_id
    AND role_type = 'supervisor_de_red'
    AND is_active = true
    AND red_id IS NOT NULL
  LIMIT 1;

  -- If supervisor has no network assignment, deny access
  IF supervisor_network_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get target user's school ID (from their active role)
  SELECT school_id INTO target_school_id
  FROM user_roles
  WHERE user_id = target_user_id
    AND is_active = true
    AND school_id IS NOT NULL
  LIMIT 1;

  -- If target user has no school assignment, deny access
  IF target_school_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if target user's school is in supervisor's network
  SELECT EXISTS (
    SELECT 1 FROM red_escuelas
    WHERE red_id = supervisor_network_id
      AND school_id = target_school_id
  ) INTO school_in_network;

  RETURN school_in_network;
END;
$$;


ALTER FUNCTION "public"."supervisor_can_access_user"("supervisor_user_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."supervisor_can_access_user"("supervisor_user_id" "uuid", "target_user_id" "uuid") IS 'Check if a supervisor_de_red can access a user based on network-school membership (used by roleUtils.ts)';



CREATE OR REPLACE FUNCTION "public"."sync_legacy_transformation_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Sync legacy transformation_enabled flag with new table
  -- This is CRITICAL until migration 023 cleanup, otherwise fallback breaks

  UPDATE growth_communities
  SET transformation_enabled = NEW.is_active
  WHERE id = NEW.growth_community_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_legacy_transformation_flag"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_legacy_transformation_flag"() IS '🔧 CRITICAL: Mantiene transformation_enabled sincronizado con nueva tabla hasta cleanup migration 023. Sin esto, el fallback en has_transformation_access() fallará después de revocaciones.';



CREATE OR REPLACE FUNCTION "public"."sync_session_attendees_on_gc_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- On INSERT: add attendee to future sessions
  IF TG_OP = 'INSERT' AND NEW.community_id IS NOT NULL THEN
    INSERT INTO session_attendees (session_id, user_id, expected)
    SELECT cs.id, NEW.user_id, true
    FROM consultor_sessions cs
    WHERE cs.growth_community_id = NEW.community_id
      AND cs.status = 'programada'
      AND cs.session_date > CURRENT_DATE
    ON CONFLICT (session_id, user_id) DO NOTHING;
  END IF;

  -- On DELETE/deactivation: remove from future sessions
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true) THEN
    UPDATE session_attendees sa SET expected = false
    FROM consultor_sessions cs
    WHERE sa.session_id = cs.id
      AND sa.user_id = COALESCE(OLD.user_id, NEW.user_id)
      AND cs.growth_community_id = COALESCE(OLD.community_id, NEW.community_id)
      AND cs.status = 'programada'
      AND cs.session_date > CURRENT_DATE
      AND sa.attended IS NULL;  -- Only if attendance not yet recorded

    UPDATE session_notifications SET status = 'cancelled'
    WHERE user_id = COALESCE(OLD.user_id, NEW.user_id)
      AND status = 'scheduled'
      AND session_id IN (
        SELECT id FROM consultor_sessions
        WHERE growth_community_id = COALESCE(OLD.community_id, NEW.community_id)
          AND status = 'programada'
          AND session_date > CURRENT_DATE
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_session_attendees_on_gc_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_session_attendees_on_gc_change"() IS 'Syncs session attendees when users join/leave Growth Communities';



CREATE OR REPLACE FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") RETURNS TABLE("affected_users" integer, "affected_communities" integer, "affected_generations" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_affected_users INTEGER;
  v_affected_communities INTEGER;
  v_affected_generations INTEGER;
BEGIN
  -- Count affected records
  SELECT COUNT(*) INTO v_affected_users
  FROM profiles 
  WHERE school_id = p_school_id AND generation_id IS NOT NULL;
  
  SELECT COUNT(*) INTO v_affected_communities
  FROM growth_communities 
  WHERE school_id = p_school_id AND generation_id IS NOT NULL;
  
  SELECT COUNT(*) INTO v_affected_generations
  FROM generations 
  WHERE school_id = p_school_id;
  
  -- Update school to not have generations
  UPDATE schools 
  SET has_generations = false 
  WHERE id = p_school_id;
  
  -- Clear generation references from communities
  UPDATE growth_communities 
  SET generation_id = NULL 
  WHERE school_id = p_school_id;
  
  -- Clear generation references from profiles
  UPDATE profiles 
  SET generation_id = NULL 
  WHERE school_id = p_school_id;
  
  -- Note: We don't delete the generations themselves
  -- They remain for historical reference but are unused
  
  RETURN QUERY SELECT v_affected_users, v_affected_communities, v_affected_generations;
END;
$$;


ALTER FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") IS 'Safely transitions a school to operate without generations';



CREATE OR REPLACE FUNCTION "public"."trigger_refresh_user_roles_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Use pg_notify to handle this asynchronously
    PERFORM pg_notify('refresh_user_roles_cache', 'profiles_changed');
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trigger_refresh_user_roles_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_meditation_streak"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM update_meditation_streak(NEW.user_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_meditation_streak"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_assessment_objectives_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_assessment_objectives_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_assignment_on_test_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- When a test run is completed, update the corresponding assignment
  IF NEW.status = 'completed' AND NEW.overall_result IS NOT NULL THEN
    UPDATE qa_scenario_assignments
    SET
      status = CASE
        WHEN NEW.overall_result IN ('pass', 'partial') THEN 'completed'
        WHEN NEW.overall_result = 'fail' THEN 'in_progress' -- Failed tests stay in progress for re-testing
        ELSE status
      END,
      completed_at = CASE
        WHEN NEW.overall_result IN ('pass', 'partial') THEN NOW()
        ELSE completed_at
      END
    WHERE scenario_id = NEW.scenario_id
      AND tester_id = NEW.tester_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_assignment_on_test_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_church_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_church_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_community_workspace_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_community_workspace_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_course_enrollment_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_course_id UUID;
    v_total_lessons INT;
    v_completed_lessons INT;
    v_progress_pct NUMERIC;
BEGIN
    -- Get course_id for this lesson
    SELECT course_id INTO v_course_id
    FROM lessons
    WHERE id = NEW.lesson_id;

    IF v_course_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count total lessons
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons
    WHERE course_id = v_course_id;

    -- Count completed lessons
    -- A lesson is complete when ALL its blocks have completed lesson_progress records
    SELECT COUNT(DISTINCT l.id) INTO v_completed_lessons
    FROM lessons l
    WHERE l.course_id = v_course_id
      -- All blocks must be completed
      AND NOT EXISTS (
          SELECT 1
          FROM blocks b
          WHERE b.lesson_id = l.id
            AND NOT EXISTS (
                SELECT 1
                FROM lesson_progress lp
                WHERE lp.lesson_id = l.id
                  AND lp.block_id = b.id
                  AND lp.user_id = NEW.user_id
                  AND lp.completed_at IS NOT NULL
            )
      );

    -- Calculate progress
    IF v_total_lessons > 0 THEN
        v_progress_pct := ROUND((v_completed_lessons::NUMERIC / v_total_lessons * 100), 2);
    ELSE
        v_progress_pct := 0;
    END IF;

    -- Update enrollment
    UPDATE course_enrollments
    SET
        lessons_completed = v_completed_lessons,
        progress_percentage = v_progress_pct,
        is_completed = (v_progress_pct >= 100),
        completed_at = CASE
            WHEN v_progress_pct >= 100 AND completed_at IS NULL
            THEN NOW()
            ELSE completed_at
        END,
        updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_course_enrollment_progress"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_course_enrollment_progress"() IS 'Auto-updates course_enrollments when lessons complete. Fixed 2025-10-07 - removed is_mandatory.';



CREATE OR REPLACE FUNCTION "public"."update_course_proposals_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_course_proposals_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_document_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_document_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_folder_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_folder_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_course_id UUID;
    v_sequence INTEGER := 1;
    v_result JSONB;
BEGIN
    -- Input validation
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning path name cannot be empty';
    END IF;
    
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Learning path description cannot be empty';
    END IF;
    
    -- Check if path exists and user has permission
    IF NOT EXISTS (
        SELECT 1 FROM learning_paths lp
        JOIN user_roles ur ON ur.user_id = p_updated_by
        WHERE lp.id = p_path_id 
        AND ur.is_active = true
        AND (ur.role_type IN ('admin', 'equipo_directivo', 'consultor') OR lp.created_by = p_updated_by)
    ) THEN
        RAISE EXCEPTION 'Learning path not found or user does not have permission to update it';
    END IF;
    
    -- Start transaction block (implicit in function)
    
    -- 1. Update the learning path
    UPDATE learning_paths 
    SET name = p_name, 
        description = p_description, 
        updated_at = NOW()
    WHERE id = p_path_id;
    
    -- 2. Replace course associations
    -- First delete existing associations (FIXED: use learning_path_id instead of path_id)
    DELETE FROM learning_path_courses
    WHERE learning_path_id = p_path_id;
    
    -- Then add new associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association (FIXED: use learning_path_id instead of path_id)
            INSERT INTO learning_path_courses (learning_path_id, course_id, sequence_order)
            VALUES (p_path_id, v_course_id, v_sequence);
            
            v_sequence := v_sequence + 1;
        END LOOP;
    END IF;
    
    -- 3. Return the updated learning path
    SELECT json_build_object(
        'id', id,
        'name', name,
        'description', description,
        'created_by', created_by,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO v_result
    FROM learning_paths
    WHERE id = p_path_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any error will automatically rollback the entire transaction
        RAISE;
END;
$$;


ALTER FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") IS 'Updates a learning path and replaces all course associations in a single atomic transaction. FIXED: Uses correct column names (learning_path_id for learning_path_courses table).';



CREATE OR REPLACE FUNCTION "public"."update_generations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Only update if the row actually changed
    IF (NEW.* IS DISTINCT FROM OLD.*) THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_generations_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_generations_updated_at"() IS 'Automatically updates the updated_at column when a generation record is modified';



CREATE OR REPLACE FUNCTION "public"."update_lesson_submission_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lesson_submission_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_last_date DATE;
  v_current_streak INTEGER;
  v_longest_streak INTEGER;
BEGIN
  -- Get current streak data
  SELECT last_meditation_date, current_streak, longest_streak
  INTO v_last_date, v_current_streak, v_longest_streak
  FROM church_meditation_streaks
  WHERE user_id = p_user_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO church_meditation_streaks (user_id, current_streak, longest_streak, last_meditation_date, total_meditations)
    VALUES (p_user_id, 1, 1, CURRENT_DATE, 1);
    RETURN;
  END IF;

  -- Update streak based on last meditation date
  IF v_last_date = CURRENT_DATE THEN
    -- Already meditated today, just increment total
    UPDATE church_meditation_streaks
    SET total_meditations = total_meditations + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF v_last_date = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Consecutive day, increment streak
    v_current_streak := v_current_streak + 1;
    v_longest_streak := GREATEST(v_longest_streak, v_current_streak);
    
    UPDATE church_meditation_streaks
    SET current_streak = v_current_streak,
        longest_streak = v_longest_streak,
        last_meditation_date = CURRENT_DATE,
        total_meditations = total_meditations + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    -- Streak broken, reset to 1
    UPDATE church_meditation_streaks
    SET current_streak = 1,
        last_meditation_date = CURRENT_DATE,
        total_meditations = total_meditations + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_overdue_status"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Update overdue commitments
  UPDATE meeting_commitments 
  SET status = 'vencido', updated_at = NOW()
  WHERE status IN ('pendiente', 'en_progreso')
    AND due_date < CURRENT_DATE
    AND status != 'vencido';
  
  -- Update overdue tasks
  UPDATE meeting_tasks 
  SET status = 'vencido', updated_at = NOW()
  WHERE status IN ('pendiente', 'en_progreso')
    AND due_date < CURRENT_DATE
    AND status != 'vencido';
END;
$$;


ALTER FUNCTION "public"."update_overdue_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_overdue_status"() IS 'Updates status of overdue tasks and commitments';



CREATE OR REPLACE FUNCTION "public"."update_pasantias_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_pasantias_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_qa_scenarios_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_qa_scenarios_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_quote_on_group_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Force recalculation of the parent quote
    UPDATE public.pasantias_quotes
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.quote_id, OLD.quote_id)
    AND use_groups = true;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_quote_on_group_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_school_has_generations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_school_id INTEGER;  -- ✅ FIXED: Changed from UUID to INTEGER
  v_generation_count INTEGER;
BEGIN
  -- Determine which school to update based on the operation
  IF TG_OP = 'DELETE' THEN
    v_school_id := OLD.school_id;
  ELSE
    v_school_id := NEW.school_id;
  END IF;

  -- Count remaining generations for this school
  SELECT COUNT(*) INTO v_generation_count
  FROM generations
  WHERE school_id = v_school_id;

  -- Update the has_generations flag based on the count
  UPDATE schools
  SET has_generations = (v_generation_count > 0)
  WHERE id = v_school_id;

  -- Return the appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_school_has_generations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_school_has_generations"() IS 'Automatically maintains the has_generations flag on schools table.
When generations are added or removed, this function updates the flag accordingly.
This prevents data inconsistencies where a school is marked as having generations
but actually has none (e.g., after all generations are deleted).
FIXED: Changed v_school_id from UUID to INTEGER to match schema.';



CREATE OR REPLACE FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.learning_path_progress_sessions
  SET last_heartbeat = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id
    AND session_end IS NULL;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_thread_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
      -- Update thread statistics
      UPDATE message_threads
      SET
          message_count = (
              SELECT COUNT(*)
              FROM community_messages
              WHERE thread_id = COALESCE(NEW.thread_id, OLD.thread_id)
              AND is_deleted = FALSE
          ),
          participant_count = (
              SELECT COUNT(DISTINCT author_id)
              FROM community_messages
              WHERE thread_id = COALESCE(NEW.thread_id, OLD.thread_id)
              AND is_deleted = FALSE
          ),
          last_message_at = (
              SELECT MAX(created_at)
              FROM community_messages
              WHERE thread_id = COALESCE(NEW.thread_id, OLD.thread_id)
              AND is_deleted = FALSE
          ),
          updated_at = NOW()
      WHERE id = COALESCE(NEW.thread_id, OLD.thread_id);

      RETURN COALESCE(NEW, OLD);
  END;
  $$;


ALTER FUNCTION "public"."update_thread_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_upcoming_courses_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_upcoming_courses_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_church_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT organization_id FROM church_profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."user_church_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_in_group"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  -- Check if the user is a member of the specified group
  RETURN EXISTS (
    SELECT 1
    FROM public.group_assignment_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."user_is_in_group"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_is_in_group"("p_group_id" "uuid", "p_user_id" "uuid") IS 'Security definer function to check group membership without triggering RLS recursion. Returns TRUE if the specified user is a member of the specified group.';



CREATE OR REPLACE FUNCTION "public"."user_school_ids"("uid" "uuid") RETURNS integer[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT COALESCE(
        ARRAY_AGG(DISTINCT school_id),
        '{}'::INTEGER[]
    )
    FROM user_roles
    WHERE user_id = uid
      AND is_active = true
      AND school_id IS NOT NULL;
$$;


ALTER FUNCTION "public"."user_school_ids"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_assignment_instance_course"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_template_course_id UUID;
BEGIN
    -- Get the course_id for the template's lesson
    SELECT m.course_id INTO v_template_course_id
    FROM assignment_templates at
    JOIN lessons l ON at.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE at.id = NEW.template_id;
    
    -- Check if the course matches
    IF v_template_course_id IS NULL THEN
        RAISE EXCEPTION 'Template not found';
    ELSIF v_template_course_id != NEW.course_id THEN
        RAISE EXCEPTION 'Assignment instance course must match the template lesson course';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_assignment_instance_course"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ab_grades" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "is_always_gt" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ab_grades" OWNER TO "postgres";


COMMENT ON TABLE "public"."ab_grades" IS 'Reference table for grade levels in assessment builder';



COMMENT ON COLUMN "public"."ab_grades"."is_always_gt" IS 'Whether this grade is always part of Generación Tractor (pre-K through 2nd grade)';



CREATE SEQUENCE IF NOT EXISTS "public"."ab_grades_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."ab_grades_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ab_grades_id_seq" OWNED BY "public"."ab_grades"."id";



CREATE TABLE IF NOT EXISTS "public"."ab_migration_plan" (
    "id" integer NOT NULL,
    "school_id" integer NOT NULL,
    "year_number" integer NOT NULL,
    "grade_id" integer NOT NULL,
    "generation_type" "public"."generation_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ab_migration_plan_year_number_check" CHECK ((("year_number" >= 1) AND ("year_number" <= 5)))
);


ALTER TABLE "public"."ab_migration_plan" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ab_migration_plan_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."ab_migration_plan_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ab_migration_plan_id_seq" OWNED BY "public"."ab_migration_plan"."id";



CREATE TABLE IF NOT EXISTS "public"."activity_aggregations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "aggregation_date" "date" NOT NULL,
    "aggregation_type" "text" NOT NULL,
    "activity_counts" "jsonb" DEFAULT '{}'::"jsonb",
    "entity_counts" "jsonb" DEFAULT '{}'::"jsonb",
    "top_users" "jsonb" DEFAULT '[]'::"jsonb",
    "engagement_metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "total_activities" integer DEFAULT 0,
    "unique_users" integer DEFAULT 0,
    "peak_hour" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_aggregations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_feed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "user_id" "uuid",
    "activity_type" "public"."activity_type" NOT NULL,
    "entity_type" "public"."entity_type" NOT NULL,
    "entity_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_public" boolean DEFAULT true,
    "is_system" boolean DEFAULT false,
    "importance_score" integer DEFAULT 1,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "related_users" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."activity_feed" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_feed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "workspace_id" "uuid",
    "activity_types" "public"."activity_type"[] DEFAULT '{}'::"public"."activity_type"[],
    "entity_types" "public"."entity_type"[] DEFAULT '{}'::"public"."entity_type"[],
    "notification_methods" "public"."notification_method"[] DEFAULT '{in_app}'::"public"."notification_method"[],
    "is_enabled" boolean DEFAULT true,
    "daily_digest" boolean DEFAULT false,
    "weekly_digest" boolean DEFAULT false,
    "importance_threshold" integer DEFAULT 1,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid",
    "text" "text" NOT NULL,
    "is_correct" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "objective_id" "uuid" NOT NULL,
    "action_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_actions" IS 'Actions within an objective that are evaluated';



CREATE TABLE IF NOT EXISTS "public"."assessment_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_areas" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_areas" IS 'Top-level areas for rubric assessments (e.g., Aprendizaje, Evaluación)';



CREATE TABLE IF NOT EXISTS "public"."assessment_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "school_id" integer,
    "generation_id" "uuid",
    "title" "text",
    "instructions" "text",
    "due_date" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_assignments" IS 'Optional assignments for managed assessment rollouts to schools/generations';



CREATE TABLE IF NOT EXISTS "public"."assessment_context_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "options" "jsonb",
    "placeholder" "text",
    "help_text" "text",
    "is_required" boolean DEFAULT true,
    "validation_rules" "jsonb",
    "display_order" integer NOT NULL,
    "visibility_condition" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assessment_context_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['text'::"text", 'number'::"text", 'select'::"text", 'multiselect'::"text", 'boolean'::"text", 'scale'::"text"])))
);


ALTER TABLE "public"."assessment_context_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_demo_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assessment_demo_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_dimensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action_id" "uuid" NOT NULL,
    "dimension_type" "text" NOT NULL,
    "level_1_label" "text" DEFAULT 'Incipiente'::"text" NOT NULL,
    "level_1_descriptor" "text" DEFAULT ''::"text" NOT NULL,
    "level_2_label" "text" DEFAULT 'En Desarrollo'::"text" NOT NULL,
    "level_2_descriptor" "text" DEFAULT ''::"text" NOT NULL,
    "level_3_label" "text" DEFAULT 'Avanzado'::"text" NOT NULL,
    "level_3_descriptor" "text" DEFAULT ''::"text" NOT NULL,
    "level_4_label" "text" DEFAULT 'Consolidado'::"text" NOT NULL,
    "level_4_descriptor" "text" DEFAULT ''::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assessment_dimensions_dimension_type_check" CHECK (("dimension_type" = ANY (ARRAY['cobertura'::"text", 'frecuencia'::"text", 'profundidad'::"text"])))
);


ALTER TABLE "public"."assessment_dimensions" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_dimensions" IS 'Fixed 3 dimensions per action: cobertura, frecuencia, profundidad';



CREATE TABLE IF NOT EXISTS "public"."assessment_entity_year_weights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "year" smallint NOT NULL,
    "weight" numeric(5,2) DEFAULT 1.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assessment_entity_year_weights_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['objective'::"text", 'module'::"text", 'indicator'::"text"]))),
    CONSTRAINT "assessment_entity_year_weights_weight_check" CHECK (("weight" >= (0)::numeric)),
    CONSTRAINT "assessment_entity_year_weights_year_check" CHECK ((("year" >= 1) AND ("year" <= 5)))
);


ALTER TABLE "public"."assessment_entity_year_weights" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_entity_year_weights" IS 'Per-year weight distribution for assessment template entities (objectives, modules, indicators). Weights are percentages that sum to 100 within each parent group per year. Used by the scoring service to determine relative importance of each entity for a given transformation year (1-5). When no row exists for a (entity_id, year) pair, the scoring service falls back to the entity''s default weight column.';



COMMENT ON COLUMN "public"."assessment_entity_year_weights"."entity_type" IS 'Discriminator for the polymorphic entity_id. One of: objective, module, indicator.';



COMMENT ON COLUMN "public"."assessment_entity_year_weights"."entity_id" IS 'UUID of the referenced entity. References assessment_objectives.id, assessment_modules.id, or assessment_indicators.id depending on entity_type.';



COMMENT ON COLUMN "public"."assessment_entity_year_weights"."year" IS 'Transformation year (1-5). Matches the transformation_year field on assessment_instances. Weights for different years are independent.';



COMMENT ON COLUMN "public"."assessment_entity_year_weights"."weight" IS 'Weight as a percentage contribution within the parent group for this year. Within a group (same parent, same year), all weights must sum to 100 (±0.5). Stored as DECIMAL(5,2) to allow values like 33.33.';



CREATE TABLE IF NOT EXISTS "public"."assessment_evaluation_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cache_key" "text" NOT NULL,
    "evaluation_result" "jsonb" NOT NULL,
    "tokens_used" integer,
    "model_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval)
);


ALTER TABLE "public"."assessment_evaluation_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_evaluation_cache" IS 'Cache for LLM evaluation results to improve performance';



CREATE TABLE IF NOT EXISTS "public"."assessment_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_id" "uuid" NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "frequency_config" "jsonb",
    "level_0_descriptor" "text",
    "level_1_descriptor" "text",
    "level_2_descriptor" "text",
    "level_3_descriptor" "text",
    "level_4_descriptor" "text",
    "display_order" integer NOT NULL,
    "weight" numeric(5,4) DEFAULT 1.0,
    "visibility_condition" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "frequency_unit_options" "jsonb" DEFAULT '["dia", "semana", "mes", "trimestre", "semestre", "año"]'::"jsonb",
    "detalle_options" "jsonb",
    "evaluation_guidance" "text",
    CONSTRAINT "assessment_indicators_category_check" CHECK (("category" = ANY (ARRAY['cobertura'::"text", 'frecuencia'::"text", 'profundidad'::"text", 'traspaso'::"text", 'detalle'::"text"]))),
    CONSTRAINT "assessment_indicators_weight_check" CHECK ((("weight" >= (0)::numeric) AND ("weight" <= (10)::numeric)))
);


ALTER TABLE "public"."assessment_indicators" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_indicators" IS 'Evaluation criteria/indicators within modules';



COMMENT ON COLUMN "public"."assessment_indicators"."frequency_unit_options" IS 'Array of allowed frequency units for this indicator. Options: dia, semana, mes, trimestre, semestre, año';



COMMENT ON COLUMN "public"."assessment_indicators"."detalle_options" IS 'JSON array of option label strings for detalle-category indicators. Example: ["ABP", "Cajas de Aprendizaje", "Gamificación"]. Only populated when category = ''detalle''. NULL for all other categories. Detalle responses are stored in assessment_indicator_responses.sub_responses as { "selected_options": ["ABP", "Gamificación"] }.';



CREATE TABLE IF NOT EXISTS "public"."assessment_instance_assignees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "can_edit" boolean DEFAULT true,
    "can_submit" boolean DEFAULT true,
    "has_started" boolean DEFAULT false,
    "has_submitted" boolean DEFAULT false,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid"
);


ALTER TABLE "public"."assessment_instance_assignees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_instance_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "total_score" numeric(5,2),
    "overall_level" integer,
    "module_scores" "jsonb",
    "expected_level" integer,
    "meets_expectations" boolean,
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    "calculated_by" "uuid",
    CONSTRAINT "assessment_instance_results_overall_level_check" CHECK ((("overall_level" IS NULL) OR (("overall_level" >= 0) AND ("overall_level" <= 4))))
);


ALTER TABLE "public"."assessment_instance_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_snapshot_id" "uuid" NOT NULL,
    "growth_community_id" "uuid",
    "school_id" integer,
    "course_structure_id" "uuid",
    "transformation_year" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "context_responses" "jsonb",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "generation_type" "public"."generation_type",
    CONSTRAINT "assessment_instances_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "assessment_instances_transformation_year_check" CHECK ((("transformation_year" >= 1) AND ("transformation_year" <= 5)))
);


ALTER TABLE "public"."assessment_instances" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_instances" IS 'Assigned assessment instances to schools/courses';



COMMENT ON COLUMN "public"."assessment_instances"."generation_type" IS 'GT = Generacion Tractor, GI = Generacion Innova. Determined from Migration Plan at assignment time.';



CREATE TABLE IF NOT EXISTS "public"."assessment_llm_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "endpoint" "text" NOT NULL,
    "tokens_input" integer,
    "tokens_output" integer,
    "model_id" "text",
    "latency_ms" integer,
    "success" boolean DEFAULT true,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_llm_usage" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_llm_usage" IS 'Tracking table for LLM API usage and costs';



CREATE TABLE IF NOT EXISTS "public"."assessment_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "instructions" "text",
    "display_order" integer NOT NULL,
    "weight" numeric(5,4) DEFAULT 1.0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "objective_id" "uuid",
    CONSTRAINT "assessment_modules_weight_check" CHECK ((("weight" >= (0)::numeric) AND ("weight" <= (10)::numeric)))
);


ALTER TABLE "public"."assessment_modules" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_modules" IS 'Modules/sections within an assessment template';



CREATE TABLE IF NOT EXISTS "public"."assessment_objectives" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 1 NOT NULL,
    "weight" numeric(5,2) DEFAULT 1.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "section_id" "uuid",
    "dimension_id" "uuid",
    "question_type" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "description" "text",
    "required" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "evaluation_guidance" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assessment_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['open_ended'::"text", 'percentage'::"text", 'multiple_choice'::"text", 'checkbox'::"text", 'likert'::"text", 'numeric_rating'::"text"])))
);


ALTER TABLE "public"."assessment_questions" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_questions" IS 'Questions that can be attached to templates or dimensions';



COMMENT ON COLUMN "public"."assessment_questions"."config" IS 'Question-specific config: options for multiple choice, scale for likert, etc.';



COMMENT ON COLUMN "public"."assessment_questions"."evaluation_guidance" IS 'LLM hints: key_indicators, red_flags, exemplary_response, scoring_notes';



CREATE TABLE IF NOT EXISTS "public"."assessment_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "indicator_id" "uuid" NOT NULL,
    "coverage_value" boolean,
    "frequency_value" numeric(10,2),
    "profundity_level" integer,
    "rationale" "text",
    "evidence_notes" "text",
    "sub_responses" "jsonb",
    "responded_by" "uuid",
    "responded_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "frequency_unit" "text",
    CONSTRAINT "assessment_responses_profundity_level_check" CHECK ((("profundity_level" IS NULL) OR (("profundity_level" >= 0) AND ("profundity_level" <= 4))))
);


ALTER TABLE "public"."assessment_responses" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_responses" IS 'Individual responses per indicator';



COMMENT ON COLUMN "public"."assessment_responses"."frequency_unit" IS 'Selected frequency unit for frequency-type indicators. E.g., semana, mes, trimestre';



CREATE TABLE IF NOT EXISTS "public"."assessment_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "overall_score" numeric,
    "area_scores" "jsonb",
    "dimension_scores" "jsonb",
    "summary" "text",
    "strengths" "jsonb",
    "growth_areas" "jsonb",
    "recommendations" "jsonb",
    "detailed_feedback" "text",
    "raw_llm_response" "jsonb",
    "model_used" "text",
    "tokens_used" integer,
    "evaluation_duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_results" IS 'LLM-generated evaluation results for completed submissions';



CREATE TABLE IF NOT EXISTS "public"."assessment_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "max_questions" integer DEFAULT 10,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessment_sections" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_sections" IS 'Logical groupings of questions for chunked LLM evaluation';



CREATE TABLE IF NOT EXISTS "public"."assessment_sub_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "indicator_id" "uuid",
    "parent_question_id" "uuid",
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "options" "jsonb",
    "help_text" "text",
    "is_required" boolean DEFAULT false,
    "validation_rules" "jsonb",
    "trigger_condition" "jsonb" NOT NULL,
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assessment_sub_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['text'::"text", 'number'::"text", 'select'::"text", 'multiselect'::"text", 'boolean'::"text", 'scale'::"text"]))),
    CONSTRAINT "has_single_parent" CHECK (((("indicator_id" IS NOT NULL) AND ("parent_question_id" IS NULL)) OR (("indicator_id" IS NULL) AND ("parent_question_id" IS NOT NULL))))
);


ALTER TABLE "public"."assessment_sub_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "assignment_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "school_id" integer NOT NULL,
    "nivel" "text" NOT NULL,
    "curso" "text" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "evaluated_at" timestamp with time zone,
    "time_spent_seconds" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assessment_submissions_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'evaluated'::"text"])))
);


ALTER TABLE "public"."assessment_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_submissions" IS 'User attempts at taking assessments with context (school, nivel, curso)';



COMMENT ON COLUMN "public"."assessment_submissions"."nivel" IS 'User-provided grade level at assessment start';



COMMENT ON COLUMN "public"."assessment_submissions"."curso" IS 'User-provided class/section at assessment start';



CREATE TABLE IF NOT EXISTS "public"."assessment_template_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "version" "text" NOT NULL,
    "snapshot_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."assessment_template_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessment_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "area" "text" NOT NULL,
    "version" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "scoring_config" "jsonb" DEFAULT '{"default_weights": {"module": 1.0, "indicator": 1.0}, "level_thresholds": {"advanced": 62.5, "emerging": 12.5, "developing": 37.5, "consolidated": 87.5}}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_archived" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "grade_id" integer,
    CONSTRAINT "assessment_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."assessment_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."assessment_templates" IS 'Assessment templates by transformation area (versioned)';



CREATE TABLE IF NOT EXISTS "public"."assessment_year_expectations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "indicator_id" "uuid" NOT NULL,
    "year_1_expected" integer,
    "year_2_expected" integer,
    "year_3_expected" integer,
    "year_4_expected" integer,
    "year_5_expected" integer,
    "tolerance" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "year_1_expected_unit" "text",
    "year_2_expected_unit" "text",
    "year_3_expected_unit" "text",
    "year_4_expected_unit" "text",
    "year_5_expected_unit" "text",
    "generation_type" "public"."generation_type" DEFAULT 'GT'::"public"."generation_type" NOT NULL,
    CONSTRAINT "assessment_year_expectations_tolerance_check" CHECK ((("tolerance" >= 0) AND ("tolerance" <= 2))),
    CONSTRAINT "year_1_expected_check" CHECK ((("year_1_expected" IS NULL) OR ("year_1_expected" >= 0))),
    CONSTRAINT "year_2_expected_check" CHECK ((("year_2_expected" IS NULL) OR ("year_2_expected" >= 0))),
    CONSTRAINT "year_3_expected_check" CHECK ((("year_3_expected" IS NULL) OR ("year_3_expected" >= 0))),
    CONSTRAINT "year_4_expected_check" CHECK ((("year_4_expected" IS NULL) OR ("year_4_expected" >= 0))),
    CONSTRAINT "year_5_expected_check" CHECK ((("year_5_expected" IS NULL) OR ("year_5_expected" >= 0)))
);


ALTER TABLE "public"."assessment_year_expectations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."assessment_year_expectations"."year_1_expected_unit" IS 'Frequency unit for year 1 expectation. E.g., dia, semana, mes, trimestre, semestre, año';



COMMENT ON COLUMN "public"."assessment_year_expectations"."year_2_expected_unit" IS 'Frequency unit for year 2 expectation. E.g., dia, semana, mes, trimestre, semestre, año';



COMMENT ON COLUMN "public"."assessment_year_expectations"."year_3_expected_unit" IS 'Frequency unit for year 3 expectation. E.g., dia, semana, mes, trimestre, semestre, año';



COMMENT ON COLUMN "public"."assessment_year_expectations"."year_4_expected_unit" IS 'Frequency unit for year 4 expectation. E.g., dia, semana, mes, trimestre, semestre, año';



COMMENT ON COLUMN "public"."assessment_year_expectations"."year_5_expected_unit" IS 'Frequency unit for year 5 expectation. E.g., dia, semana, mes, trimestre, semestre, año';



COMMENT ON COLUMN "public"."assessment_year_expectations"."generation_type" IS 'GT = Generación Tractor (higher expectations), GI = Generación Innova (lower expectations)';



CREATE TABLE IF NOT EXISTS "public"."assignment_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action" "public"."assignment_action" NOT NULL,
    "entity_type" "public"."assignment_entity_type" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "content_type" "public"."assignment_content_type" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "source" "public"."assignment_source" NOT NULL,
    "source_learning_path_id" "uuid",
    "performed_by" "uuid" NOT NULL,
    "performed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."assignment_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."assignment_audit_log" IS 'Tracks all assignment and unassignment actions for courses and learning paths. INSERT is server-only (service_role).';



COMMENT ON COLUMN "public"."assignment_audit_log"."action" IS 'Whether content was assigned or unassigned';



COMMENT ON COLUMN "public"."assignment_audit_log"."entity_type" IS 'Type of entity receiving the assignment: user (individual) or community_workspace (group)';



COMMENT ON COLUMN "public"."assignment_audit_log"."entity_id" IS 'UUID of the user (auth.users.id) or workspace (community_workspaces.id)';



COMMENT ON COLUMN "public"."assignment_audit_log"."content_type" IS 'Type of content being assigned (course or learning_path)';



COMMENT ON COLUMN "public"."assignment_audit_log"."content_id" IS 'ID of the course or learning path';



COMMENT ON COLUMN "public"."assignment_audit_log"."source" IS 'Whether this was a direct assignment or via learning path enrollment';



COMMENT ON COLUMN "public"."assignment_audit_log"."source_learning_path_id" IS 'If source is learning_path, the ID of that LP (for course enrollments derived from LP assignment)';



COMMENT ON COLUMN "public"."assignment_audit_log"."performed_by" IS 'User who performed the action (from auth.uid() at API level)';



COMMENT ON COLUMN "public"."assignment_audit_log"."metadata" IS 'Additional context: batchSize, viaWorkspaceGroup, bulkUnassignment, memberCount, etc.';



CREATE TABLE IF NOT EXISTS "public"."assignment_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "instructor_id" "uuid",
    "feedback_text" "text" NOT NULL,
    "grade" numeric(5,2),
    "status" character varying(50) DEFAULT 'reviewed'::character varying,
    "provided_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assignment_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "course_id" "uuid",
    "title" character varying(255) NOT NULL,
    "description" "text",
    "instructions" "text",
    "school_id" integer,
    "community_id" "uuid",
    "cohort_name" character varying(255),
    "start_date" timestamp with time zone,
    "due_date" timestamp with time zone,
    "groups" "jsonb" DEFAULT '[]'::"jsonb",
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "assignment_instances_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('active'::character varying)::"text", ('completed'::character varying)::"text", ('archived'::character varying)::"text"])))
);


ALTER TABLE "public"."assignment_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_submission_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_submission_id" "uuid" NOT NULL,
    "shared_with_user_id" "uuid" NOT NULL,
    "community_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assignment_submission_shares" OWNER TO "postgres";


COMMENT ON TABLE "public"."assignment_submission_shares" IS 'Audit table tracking which users received shared submissions';



CREATE TABLE IF NOT EXISTS "public"."assignment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid",
    "user_id" "uuid",
    "group_id" character varying(100),
    "content" "jsonb" DEFAULT '{}'::"jsonb",
    "file_url" "text",
    "submission_type" character varying(50),
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "grade" numeric(5,2),
    "feedback" "text",
    "graded_by" "uuid",
    "graded_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assignment_submissions_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text", ('graded'::character varying)::"text", ('returned'::character varying)::"text"])))
);


ALTER TABLE "public"."assignment_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "block_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "instructions" "text",
    "assignment_type" character varying(20) DEFAULT 'individual'::character varying,
    "min_group_size" integer DEFAULT 2,
    "max_group_size" integer DEFAULT 5,
    "submission_type" character varying(50) DEFAULT 'file'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "assignment_templates_assignment_type_check" CHECK ((("assignment_type")::"text" = ANY (ARRAY[('individual'::character varying)::"text", ('group'::character varying)::"text"])))
);


ALTER TABLE "public"."assignment_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "instructions" "text" NOT NULL,
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notification_sent" boolean DEFAULT false,
    "due_reminder_sent" boolean DEFAULT false
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "badge_type" "text" DEFAULT 'course_completion'::"text" NOT NULL,
    "icon_name" "text" DEFAULT 'award'::"text",
    "color_primary" "text" DEFAULT '#fbbf24'::"text",
    "color_secondary" "text" DEFAULT '#0a0a0a'::"text",
    "criteria" "jsonb" DEFAULT '{}'::"jsonb",
    "points_value" integer DEFAULT 100,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "badges_badge_type_check" CHECK (("badge_type" = ANY (ARRAY['course_completion'::"text", 'module_completion'::"text", 'milestone'::"text", 'special'::"text"])))
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "position" integer,
    "type" "text",
    "payload" "jsonb",
    "lesson_id" "uuid",
    "estimated_duration_minutes" integer DEFAULT 5,
    "interaction_required" boolean DEFAULT true,
    "completion_tracking" "jsonb" DEFAULT '{"track_time": true, "track_interaction": true}'::"jsonb",
    "block_weight" numeric(3,2) DEFAULT 1.0,
    "analytics_data" "jsonb" DEFAULT '{}'::"jsonb",
    "is_visible" boolean DEFAULT true,
    CONSTRAINT "blocks_block_weight_check" CHECK (("block_weight" >= (0)::numeric))
);


ALTER TABLE "public"."blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "platform_user_id" "text" NOT NULL,
    "chat_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "link_method" "text" DEFAULT 'code'::"text" NOT NULL,
    "linked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bot_identities_platform_check" CHECK (("platform" = ANY (ARRAY['telegram'::"text", 'whatsapp'::"text"])))
);


ALTER TABLE "public"."bot_identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_link_codes" (
    "code" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "used_at" timestamp with time zone
);


ALTER TABLE "public"."bot_link_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_pending_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "file_ref" "text" NOT NULL,
    "file_mime" "text",
    "file_name" "text",
    "caption" "text",
    "extraction" "jsonb",
    "category_id" "uuid",
    "target_report_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "card_message_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '72:00:00'::interval) NOT NULL,
    CONSTRAINT "bot_pending_items_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'active'::"text", 'saving'::"text", 'saved'::"text", 'discarded'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."bot_pending_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_processed_updates" (
    "platform" "text" NOT NULL,
    "update_id" bigint NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."bot_processed_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "chat_id" "text" NOT NULL,
    "user_id" "uuid",
    "state" "text" DEFAULT 'idle'::"text" NOT NULL,
    "active_item_id" "uuid",
    "edit_field" "text",
    "submit_report_id" "uuid",
    "failed_link_attempts" integer DEFAULT 0 NOT NULL,
    "link_locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bot_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_about_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Nuestro Propósito'::"text",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_about_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."church_account_type" NOT NULL,
    "parent_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_contact_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "address" "text",
    "phone" "text",
    "email" "text",
    "whatsapp" "text",
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "map_embed_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_contact_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone,
    "location" "text",
    "description" "text",
    "is_published" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_hero_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "welcome_badge" "text" DEFAULT 'Bienvenido'::"text",
    "headline" "text" NOT NULL,
    "subheadline" "text",
    "cta_primary_text" "text",
    "cta_primary_link" "text",
    "cta_secondary_text" "text",
    "cta_secondary_link" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_hero_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."church_user_role" NOT NULL,
    "token" "text" NOT NULL,
    "invited_by" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_meditation_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "session_id" "uuid",
    "scripture_reference" "text" NOT NULL,
    "scripture_text" "text" NOT NULL,
    "scripture_version" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_meditation_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_meditation_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "preferred_voice" "text" DEFAULT 'maria'::"text",
    "preferred_duration" "text" DEFAULT 'medium'::"text",
    "morning_emotion" "text",
    "evening_emotion" "text",
    "show_onboarding" boolean DEFAULT true,
    "enable_notifications" boolean DEFAULT true,
    "notification_time" time without time zone DEFAULT '08:00:00'::time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_meditation_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_meditation_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "emotion" "text" NOT NULL,
    "time_of_day" "text",
    "day_of_week" integer,
    "frequency" integer DEFAULT 1,
    "last_used" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "church_meditation_recommendations_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "church_meditation_recommendations_time_of_day_check" CHECK (("time_of_day" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text", 'night'::"text"])))
);


ALTER TABLE "public"."church_meditation_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_meditation_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emotion" "text" NOT NULL,
    "scripture_reference" "text",
    "scripture_text" "text",
    "meditation_text" "text",
    "audio_url" "text",
    "duration" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_meditation_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_meditation_streaks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "current_streak" integer DEFAULT 0,
    "longest_streak" integer DEFAULT 0,
    "last_meditation_date" "date",
    "total_meditations" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_meditation_streaks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{"currency": "CLP", "language": "es", "timezone": "America/Santiago"}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_prayer_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "request" "text" NOT NULL,
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_prayer_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_presentation_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slides" "jsonb" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_presentation_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_profiles" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "role" "public"."church_user_role" DEFAULT 'member'::"public"."church_user_role" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "day_of_week" integer,
    "time" time without time zone NOT NULL,
    "service_name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "church_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."church_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_sermons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "speaker" "text",
    "date" "date" NOT NULL,
    "description" "text",
    "audio_url" "text",
    "video_url" "text",
    "spotify_url" "text",
    "is_published" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_sermons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "slides" "jsonb" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_songs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "artist" "text",
    "lyrics" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_songs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "bio" "text",
    "image_url" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_transaction_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "debit" numeric(12,2) DEFAULT 0,
    "credit" numeric(12,2) DEFAULT 0,
    CONSTRAINT "positive_amounts" CHECK ((("debit" >= (0)::numeric) AND ("credit" >= (0)::numeric))),
    CONSTRAINT "single_sided" CHECK (((("debit" > (0)::numeric) AND ("credit" = (0)::numeric)) OR (("debit" = (0)::numeric) AND ("credit" > (0)::numeric))))
);


ALTER TABLE "public"."church_transaction_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "description" "text",
    "reference_number" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."church_website_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "theme" "text" DEFAULT 'casa'::"text",
    "custom_css" "text",
    "custom_js" "text",
    "meta_description" "text",
    "social_image_url" "text",
    "favicon_url" "text",
    "google_analytics_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."church_website_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_legal" character varying(500) NOT NULL,
    "nombre_fantasia" character varying(300) NOT NULL,
    "rut" character varying(15) NOT NULL,
    "direccion" "text" NOT NULL,
    "nombre_representante" character varying(300) NOT NULL,
    "rut_representante" character varying(15) NOT NULL,
    "fecha_escritura" "date" NOT NULL,
    "nombre_notario" character varying(300) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "comuna" "text",
    "ciudad" "text",
    "comuna_notaria" "text",
    "nombre_encargado_proyecto" "text",
    "telefono_encargado_proyecto" "text",
    "email_encargado_proyecto" "text",
    "nombre_contacto_administrativo" "text",
    "telefono_contacto_administrativo" "text",
    "email_contacto_administrativo" "text",
    "school_id" integer
);

ALTER TABLE ONLY "public"."clientes" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clientes"."nombre_encargado_proyecto" IS 'Nombre del 
  encargado del proyecto del colegio';



COMMENT ON COLUMN "public"."clientes"."telefono_encargado_proyecto" IS 'Teléfono de 
  contacto del encargado del proyecto';



COMMENT ON COLUMN "public"."clientes"."email_encargado_proyecto" IS 'Email de contacto
   del encargado del proyecto';



COMMENT ON COLUMN "public"."clientes"."nombre_contacto_administrativo" IS 'Nombre del 
  contacto administrativo que recibe facturas';



COMMENT ON COLUMN "public"."clientes"."telefono_contacto_administrativo" IS 'Teléfono 
  del contacto administrativo para facturación';



COMMENT ON COLUMN "public"."clientes"."email_contacto_administrativo" IS 'Email del 
  contacto administrativo donde se envían las facturas';



CREATE TABLE IF NOT EXISTS "public"."codebase_index" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feature_area" "text" NOT NULL,
    "route" "text",
    "file_path" "text",
    "roles_allowed" "text"[],
    "component_summary" "text",
    "key_behaviors" "jsonb",
    "expected_outcomes" "jsonb",
    "last_indexed" timestamp with time zone DEFAULT "now"(),
    "indexed_by" "text" DEFAULT 'claude-code'::"text"
);


ALTER TABLE "public"."codebase_index" OWNER TO "postgres";


COMMENT ON TABLE "public"."codebase_index" IS 'Stores analyzed code summaries for AI-powered QA scenario generation';



COMMENT ON COLUMN "public"."codebase_index"."feature_area" IS 'Logical grouping (e.g., user_management, course_management)';



COMMENT ON COLUMN "public"."codebase_index"."route" IS 'URL route for this feature (e.g., /admin/user-management)';



COMMENT ON COLUMN "public"."codebase_index"."file_path" IS 'Primary file path for this route';



COMMENT ON COLUMN "public"."codebase_index"."roles_allowed" IS 'Array of roles that can access this feature';



COMMENT ON COLUMN "public"."codebase_index"."component_summary" IS 'Human-readable summary of the component';



COMMENT ON COLUMN "public"."codebase_index"."key_behaviors" IS 'JSON object describing key UI behaviors and actions';



COMMENT ON COLUMN "public"."codebase_index"."expected_outcomes" IS 'JSON object describing expected outcomes for success/failure';



COMMENT ON COLUMN "public"."codebase_index"."last_indexed" IS 'When this entry was last updated';



COMMENT ON COLUMN "public"."codebase_index"."indexed_by" IS 'Who/what created this index entry';



CREATE TABLE IF NOT EXISTS "public"."community_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "folder_id" "uuid",
    "title" character varying(200) NOT NULL,
    "description" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "file_name" character varying(255) NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" character varying(100) NOT NULL,
    "storage_path" "text" NOT NULL,
    "thumbnail_url" "text",
    "current_version" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "download_count" integer DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "current_version_positive" CHECK (("current_version" > 0)),
    CONSTRAINT "document_title_not_empty" CHECK (("length"(TRIM(BOTH FROM "title")) > 0)),
    CONSTRAINT "file_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "file_name")) > 0)),
    CONSTRAINT "file_size_positive" CHECK (("file_size" > 0))
);


ALTER TABLE "public"."community_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "meeting_date" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "location" "text",
    "status" "public"."meeting_status" DEFAULT 'programada'::"public"."meeting_status",
    "summary" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "facilitator_id" "uuid",
    "secretary_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "summary_doc" "jsonb",
    "notes_doc" "jsonb",
    "started_at" timestamp with time zone,
    "version" integer DEFAULT 0 NOT NULL,
    "updated_by" "uuid",
    "finalized_at" timestamp with time zone,
    "finalized_by" "uuid",
    "finalize_audience" "text",
    CONSTRAINT "community_meetings_finalize_audience_check" CHECK (("finalize_audience" = ANY (ARRAY['community'::"text", 'attended'::"text"]))),
    CONSTRAINT "meeting_date_not_past" CHECK (("meeting_date" > '2020-01-01 00:00:00'::timestamp without time zone)),
    CONSTRAINT "valid_duration" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 480)))
);


ALTER TABLE "public"."community_meetings" OWNER TO "postgres";


COMMENT ON TABLE "public"."community_meetings" IS 'Community meeting documentation and management';



COMMENT ON COLUMN "public"."community_meetings"."is_active" IS 'Soft delete flag - false means meeting is archived';



COMMENT ON COLUMN "public"."community_meetings"."deleted_at" IS 'Timestamp when meeting was soft deleted';



COMMENT ON COLUMN "public"."community_meetings"."deleted_by" IS 'User who soft deleted the meeting';



CREATE TABLE IF NOT EXISTS "public"."community_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "thread_id" "uuid",
    "reply_to_id" "uuid",
    "author_id" "uuid",
    "content" "text" NOT NULL,
    "content_html" "text",
    "is_edited" boolean DEFAULT false,
    "is_deleted" boolean DEFAULT false,
    "edited_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "message_type" "text" DEFAULT 'regular'::"text"
);


ALTER TABLE "public"."community_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."community_messages"."message_type" IS 'Message type: regular, announcement, system, etc.';



CREATE TABLE IF NOT EXISTS "public"."community_posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "visibility" "text" DEFAULT 'community'::"text",
    "is_pinned" boolean DEFAULT false,
    "is_archived" boolean DEFAULT false,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "community_posts_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'document'::"text", 'link'::"text", 'poll'::"text", 'question'::"text"]))),
    CONSTRAINT "community_posts_visibility_check" CHECK (("visibility" = ANY (ARRAY['community'::"text", 'school'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."community_posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."community_posts" IS 'Instagram-style posts for collaborative spaces';



CREATE TABLE IF NOT EXISTS "public"."course_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "enrolled_by" "uuid",
    "enrollment_type" character varying(50) DEFAULT 'assigned'::character varying,
    "progress_percentage" numeric(5,2) DEFAULT 0,
    "lessons_completed" integer DEFAULT 0,
    "total_lessons" integer DEFAULT 0 NOT NULL,
    "is_completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "completion_certificate_url" "text",
    "total_time_spent_seconds" integer DEFAULT 0,
    "estimated_completion_time_seconds" integer,
    "status" character varying(50) DEFAULT 'active'::character varying,
    "overall_score" numeric(5,2),
    "passing_threshold" numeric(5,2) DEFAULT 70,
    "has_passed" boolean DEFAULT false,
    "access_expires_at" timestamp with time zone,
    "enrollment_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completion_notification_sent" boolean DEFAULT false,
    CONSTRAINT "course_enrollments_enrollment_type_check" CHECK ((("enrollment_type")::"text" = ANY (ARRAY[('assigned'::character varying)::"text", ('self_enrolled'::character varying)::"text", ('bulk_assigned'::character varying)::"text"]))),
    CONSTRAINT "course_enrollments_progress_percentage_check" CHECK ((("progress_percentage" >= (0)::numeric) AND ("progress_percentage" <= (100)::numeric))),
    CONSTRAINT "course_enrollments_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('active'::character varying)::"text", ('paused'::character varying)::"text", ('completed'::character varying)::"text", ('dropped'::character varying)::"text", ('expired'::character varying)::"text"]))),
    CONSTRAINT "valid_lessons_completed" CHECK (("lessons_completed" >= 0)),
    CONSTRAINT "valid_progress" CHECK ((("progress_percentage" >= (0)::numeric) AND ("progress_percentage" <= (100)::numeric))),
    CONSTRAINT "valid_time_spent" CHECK (("total_time_spent_seconds" >= 0)),
    CONSTRAINT "valid_total_lessons" CHECK (("total_lessons" >= 0))
);


ALTER TABLE "public"."course_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer,
    "name" "text" NOT NULL,
    "grade_range" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generations" OWNER TO "postgres";


COMMENT ON TABLE "public"."generations" IS 'Academic generations/cohorts within schools. Typically represents grade-level groupings like Tractor (PreK-2nd) or Innova (3rd-12th)';



COMMENT ON COLUMN "public"."generations"."id" IS 'Unique identifier (UUID)';



COMMENT ON COLUMN "public"."generations"."school_id" IS 'Foreign key to schools table (integer)';



COMMENT ON COLUMN "public"."generations"."name" IS 'Name of the generation (e.g., Tractor, Innova)';



COMMENT ON COLUMN "public"."generations"."grade_range" IS 'Grade range description (e.g., PreKinder-8vo, 3rd-12th)';



COMMENT ON COLUMN "public"."generations"."created_at" IS 'Timestamp when the generation was created';



COMMENT ON COLUMN "public"."generations"."description" IS 'Optional description providing additional context about the generation';



COMMENT ON COLUMN "public"."generations"."updated_at" IS 'Timestamp when the generation was last modified (auto-updated by trigger)';



CREATE TABLE IF NOT EXISTS "public"."growth_communities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "generation_id" "uuid",
    "school_id" integer,
    "name" "text" NOT NULL,
    "description" "text",
    "max_teachers" integer DEFAULT 16,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transformation_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."growth_communities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."growth_communities"."generation_id" IS 'Generation ID - NULL for schools without generations';



CREATE TABLE IF NOT EXISTS "public"."lesson_completion_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "is_completed" boolean DEFAULT false,
    "completion_date" timestamp with time zone,
    "blocks_completed" integer DEFAULT 0,
    "total_blocks" integer DEFAULT 0,
    "progress_percentage" numeric(5,2) DEFAULT 0,
    "total_time_spent_seconds" integer DEFAULT 0,
    "first_accessed_at" timestamp with time zone,
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "quiz_score" numeric(5,2),
    "quiz_attempts" integer DEFAULT 0,
    "has_passed_assessments" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_blocks_completed" CHECK (("blocks_completed" >= 0)),
    CONSTRAINT "valid_progress_percentage" CHECK ((("progress_percentage" >= (0)::numeric) AND ("progress_percentage" <= (100)::numeric))),
    CONSTRAINT "valid_quiz_attempts" CHECK (("quiz_attempts" >= 0)),
    CONSTRAINT "valid_total_blocks" CHECK (("total_blocks" >= 0))
);


ALTER TABLE "public"."lesson_completion_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "email" "text",
    "first_name" "text",
    "middle_name" "text",
    "last_name" "text",
    "description" "text",
    "school" "text",
    "avatar_url" "text",
    "growth_community" "text",
    "approval_status" "text" DEFAULT 'pending'::"text",
    "school_id" integer,
    "generation_id" "uuid",
    "community_id" "uuid",
    "learning_preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "notification_preferences" "jsonb" DEFAULT '{"progress_reminders": true, "assignment_notifications": true, "completion_notifications": true}'::"jsonb",
    "timezone" character varying(50) DEFAULT 'America/Santiago'::character varying,
    "last_active_at" timestamp with time zone DEFAULT "now"(),
    "total_learning_time_seconds" integer DEFAULT 0,
    "courses_completed" integer DEFAULT 0,
    "lessons_completed" integer DEFAULT 0,
    "avg_quiz_score" numeric(5,2),
    "must_change_password" boolean DEFAULT false,
    "external_school_affiliation" "text",
    "can_run_qa_tests" boolean DEFAULT false,
    CONSTRAINT "profiles_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles table with strict RLS enforcement. Users can only access their own profile unless they are admins.';



COMMENT ON COLUMN "public"."profiles"."external_school_affiliation" IS 'External school affiliation for consultants (informational only)';



CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "has_generations" boolean DEFAULT false,
    "cliente_id" "uuid",
    "logo_url" "text"
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


COMMENT ON COLUMN "public"."schools"."has_generations" IS 'Whether this school uses the generation concept (true by default)';



CREATE OR REPLACE VIEW "public"."community_progress_report" AS
 SELECT "gc"."id" AS "community_id",
    "gc"."name" AS "community_name",
    "gc"."school_id",
    "s"."name" AS "school_name",
    "gc"."generation_id",
    "g"."name" AS "generation_name",
    "count"(DISTINCT "p"."id") AS "total_teachers",
    "count"(DISTINCT "ce"."course_id") AS "total_courses_assigned",
    "count"(DISTINCT
        CASE
            WHEN "ce"."is_completed" THEN "ce"."course_id"
            ELSE NULL::"uuid"
        END) AS "courses_completed",
    "round"("avg"("ce"."progress_percentage"), 2) AS "avg_progress_percentage",
    "count"(DISTINCT
        CASE
            WHEN "ce"."is_completed" THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "teachers_with_completed_courses",
    "count"(DISTINCT "lcs"."lesson_id") AS "total_lessons_accessed",
    "count"(DISTINCT
        CASE
            WHEN "lcs"."is_completed" THEN "lcs"."lesson_id"
            ELSE NULL::"uuid"
        END) AS "lessons_completed",
    "sum"("ce"."total_time_spent_seconds") AS "total_time_spent_seconds",
    "round"("avg"("ce"."total_time_spent_seconds"), 0) AS "avg_time_per_teacher_seconds",
    "round"("avg"("lcs"."quiz_score"), 2) AS "avg_quiz_score",
    "sum"("lcs"."quiz_attempts") AS "total_quiz_attempts",
    "count"(DISTINCT
        CASE
            WHEN ("ce"."updated_at" > ("now"() - '7 days'::interval)) THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "active_last_7_days",
    "count"(DISTINCT
        CASE
            WHEN ("ce"."updated_at" > ("now"() - '30 days'::interval)) THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "active_last_30_days",
    "min"("ce"."enrolled_at") AS "first_enrollment_date",
    "max"("ce"."updated_at") AS "last_activity_date"
   FROM ((((("public"."growth_communities" "gc"
     LEFT JOIN "public"."schools" "s" ON (("gc"."school_id" = "s"."id")))
     LEFT JOIN "public"."generations" "g" ON (("gc"."generation_id" = "g"."id")))
     LEFT JOIN "public"."profiles" "p" ON ((("p"."community_id" = "gc"."id") AND ("p"."approval_status" = 'approved'::"text"))))
     LEFT JOIN "public"."course_enrollments" "ce" ON (("ce"."user_id" = "p"."id")))
     LEFT JOIN "public"."lesson_completion_summary" "lcs" ON (("lcs"."user_id" = "p"."id")))
  GROUP BY "gc"."id", "gc"."name", "gc"."school_id", "s"."name", "gc"."generation_id", "g"."name";


ALTER TABLE "public"."community_progress_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "thread_title" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "is_pinned" boolean DEFAULT false,
    "is_locked" boolean DEFAULT false,
    "is_archived" boolean DEFAULT false,
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "message_count" integer DEFAULT 0,
    "participant_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "custom_category_name" character varying(100),
    "category" "text" DEFAULT 'general'::"text"
);


ALTER TABLE "public"."message_threads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."message_threads"."custom_category_name" IS 'Name for custom thread categories when category = "custom"';



CREATE OR REPLACE VIEW "public"."community_threads" AS
 SELECT "message_threads"."id",
    "message_threads"."workspace_id",
    "message_threads"."thread_title",
    "message_threads"."description",
    "message_threads"."created_by",
    "message_threads"."is_pinned",
    "message_threads"."is_locked",
    "message_threads"."is_archived",
    "message_threads"."last_message_at",
    "message_threads"."message_count",
    "message_threads"."participant_count",
    "message_threads"."created_at",
    "message_threads"."updated_at",
    "message_threads"."custom_category_name"
   FROM "public"."message_threads";


ALTER TABLE "public"."community_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "name" "text",
    "description" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "custom_name" "text",
    "image_url" "text",
    "image_storage_path" "text"
);


ALTER TABLE "public"."community_workspaces" OWNER TO "postgres";


COMMENT ON TABLE "public"."community_workspaces" IS 'Collaborative workspaces for growth communities';



COMMENT ON COLUMN "public"."community_workspaces"."custom_name" IS 'User-defined name for the community workspace (like WhatsApp group names)';



COMMENT ON COLUMN "public"."community_workspaces"."image_url" IS 'Public URL for the community group image';



COMMENT ON COLUMN "public"."community_workspaces"."image_storage_path" IS 'Supabase storage path for the uploaded image';



CREATE TABLE IF NOT EXISTS "public"."consultant_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "consultant_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "school_id" integer,
    "generation_id" "uuid",
    "community_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid",
    "is_active" boolean DEFAULT true,
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "ends_at" timestamp with time zone,
    "assignment_type" character varying(50) DEFAULT 'monitoring'::character varying,
    "can_view_progress" boolean DEFAULT true,
    "can_assign_courses" boolean DEFAULT false,
    "can_message_student" boolean DEFAULT true,
    "assignment_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notification_sent" boolean DEFAULT false,
    CONSTRAINT "consultant_assignments_assignment_type_check" CHECK ((("assignment_type")::"text" = ANY (ARRAY[('monitoring'::character varying)::"text", ('mentoring'::character varying)::"text", ('evaluation'::character varying)::"text", ('support'::character varying)::"text", ('comprehensive'::character varying)::"text"]))),
    CONSTRAINT "consultant_not_self" CHECK ((("student_id" IS NULL) OR ("consultant_id" <> "student_id"))),
    CONSTRAINT "no_self_assignment" CHECK (("consultant_id" <> "student_id")),
    CONSTRAINT "valid_date_range" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at")))
);


ALTER TABLE "public"."consultant_assignments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."consultant_assignments"."student_id" IS 'Individual user ID for direct assignments (NULL for group assignments)';



COMMENT ON COLUMN "public"."consultant_assignments"."assignment_type" IS 'Type of assignment: monitoring, mentoring, evaluation, support, or comprehensive';



CREATE TABLE IF NOT EXISTS "public"."consultant_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "consultant_id" "uuid" NOT NULL,
    "hour_type_id" "uuid" NOT NULL,
    "rate_eur" numeric(10,2) NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "consultant_rates_rate_eur_check" CHECK (("rate_eur" >= (0)::numeric))
);


ALTER TABLE "public"."consultant_rates" OWNER TO "postgres";


COMMENT ON TABLE "public"."consultant_rates" IS 'Hourly rates in EUR per consultant per service type. Effective date ranges prevent overlaps via btree_gist EXCLUDE constraint. effective_to is the exclusive upper bound (half-open interval [)).';



CREATE TABLE IF NOT EXISTS "public"."consultor_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "growth_community_id" "uuid" NOT NULL,
    "program_enrollment_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "objectives" "text",
    "session_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "scheduled_duration_minutes" integer GENERATED ALWAYS AS (((EXTRACT(epoch FROM ("end_time" - "start_time")) / (60)::numeric))::integer) STORED,
    "actual_duration_minutes" integer,
    "modality" "text" NOT NULL,
    "meeting_link" "text",
    "meeting_provider" "text",
    "location" "text",
    "status" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "recurrence_rule" "text",
    "recurrence_group_id" "uuid",
    "session_number" integer,
    "meeting_summary" "text",
    "meeting_transcript" "text",
    "created_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "finalized_by" "uuid",
    "finalized_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "hour_type_key" "text",
    "contrato_id" "uuid",
    "cancelled_notice_hours" numeric(8,2),
    CONSTRAINT "consultor_sessions_meeting_provider_check" CHECK (("meeting_provider" = ANY (ARRAY['zoom'::"text", 'google_meet'::"text", 'teams'::"text", 'otro'::"text"]))),
    CONSTRAINT "consultor_sessions_modality_check" CHECK (("modality" = ANY (ARRAY['presencial'::"text", 'online'::"text", 'hibrida'::"text"]))),
    CONSTRAINT "consultor_sessions_status_check" CHECK (("status" = ANY (ARRAY['borrador'::"text", 'pendiente_aprobacion'::"text", 'programada'::"text", 'en_progreso'::"text", 'pendiente_informe'::"text", 'completada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."consultor_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."consultor_sessions" IS 'Core table for consultant-led sessions at schools';



COMMENT ON COLUMN "public"."consultor_sessions"."hour_type_key" IS 'Links session to one of the 9 service categories. NULL for legacy sessions. Required for new sessions that consume hours from a bucket.';



COMMENT ON COLUMN "public"."consultor_sessions"."contrato_id" IS 'Links session to the specific contract whose hours are being consumed. NULL for legacy sessions created before hour tracking.';



COMMENT ON COLUMN "public"."consultor_sessions"."cancelled_notice_hours" IS 'Hours of notice given before session start time. Calculated at cancellation time. Used to determine which cancellation clause from contract QUINTO applies.';



CREATE TABLE IF NOT EXISTS "public"."context_general_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_key" "text" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "options" "jsonb",
    "placeholder" "text",
    "help_text" "text",
    "is_required" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "widget_type" "text" DEFAULT 'generic'::"text",
    "structural_key" "text",
    CONSTRAINT "context_general_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['text'::"text", 'number'::"text", 'select'::"text", 'multiselect'::"text", 'boolean'::"text", 'scale'::"text", 'textarea'::"text"])))
);


ALTER TABLE "public"."context_general_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."context_general_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "question_id" "uuid" NOT NULL,
    "response" "jsonb" NOT NULL,
    "responded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."context_general_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_extraction_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_id" "uuid",
    "field_name" "text" NOT NULL,
    "extracted_value" "text",
    "corrected_value" "text",
    "confidence" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."contract_extraction_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_hour_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" "uuid" NOT NULL,
    "hour_type_id" "uuid" NOT NULL,
    "allocated_hours" numeric(8,2) NOT NULL,
    "is_fixed_allocation" boolean DEFAULT false NOT NULL,
    "adds_to_allocation_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "contract_hour_allocations_allocated_hours_check" CHECK (("allocated_hours" >= (0)::numeric))
);


ALTER TABLE "public"."contract_hour_allocations" OWNER TO "postgres";


COMMENT ON TABLE "public"."contract_hour_allocations" IS 'Hour budget buckets per contract/annex. Sum of allocated_hours must equal contratos.horas_contratadas. Annex buckets can extend parent buckets via adds_to_allocation_id.';



CREATE TABLE IF NOT EXISTS "public"."contract_hour_reallocation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" "uuid" NOT NULL,
    "from_hour_type_id" "uuid" NOT NULL,
    "to_hour_type_id" "uuid" NOT NULL,
    "hours" numeric(6,2) NOT NULL,
    "reason" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_hour_reallocation_log_hours_check" CHECK (("hours" > (0)::numeric))
);


ALTER TABLE "public"."contract_hour_reallocation_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."contract_hour_reallocation_log" IS 'Immutable audit log of hour reallocations between buckets within the same contract. No UPDATE or DELETE — append-only.';



CREATE TABLE IF NOT EXISTS "public"."contract_hours_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allocation_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "hours" numeric(6,2) NOT NULL,
    "status" "text" NOT NULL,
    "session_date" "date" NOT NULL,
    "is_over_budget" boolean DEFAULT false NOT NULL,
    "is_manual" boolean DEFAULT false NOT NULL,
    "cancellation_clause" "text",
    "cancellation_reason" "text",
    "admin_override" boolean DEFAULT false NOT NULL,
    "admin_override_reason" "text",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone,
    "updated_by" "uuid",
    "notes" "text",
    CONSTRAINT "contract_hours_ledger_hours_check" CHECK (("hours" > (0)::numeric)),
    CONSTRAINT "contract_hours_ledger_status_check" CHECK (("status" = ANY (ARRAY['reservada'::"text", 'consumida'::"text", 'devuelta'::"text", 'penalizada'::"text"])))
);


ALTER TABLE "public"."contract_hours_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."contract_hours_ledger" IS 'Tracks hour reservations and consumption per session. One entry per session. Status transitions: reservada → consumida (completed), reservada → devuelta (cancelled with notice), reservada → penalizada (cancelled late). Manual corrections use is_manual=true. Consultant earnings derived by joining session → session_facilitators → consultant_rates.';



CREATE TABLE IF NOT EXISTS "public"."contratos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_contrato" character varying(50) NOT NULL,
    "fecha_contrato" "date" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "programa_id" "uuid",
    "precio_total_uf" numeric(10,2) DEFAULT 0 NOT NULL,
    "numero_cuotas" integer DEFAULT 4 NOT NULL,
    "estado" character varying(50) DEFAULT 'vigente'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "firmado" boolean DEFAULT false,
    "incluir_en_flujo" boolean DEFAULT false,
    "contrato_url" "text",
    "fecha_fin" "date",
    "tipo_moneda" character varying DEFAULT 'UF'::character varying,
    "is_anexo" boolean DEFAULT false,
    "parent_contrato_id" "uuid",
    "anexo_numero" integer,
    "anexo_fecha" "date",
    "numero_participantes" integer,
    "nombre_ciclo" character varying(50),
    "es_manual" boolean DEFAULT false,
    "descripcion_manual" "text",
    "pdf_extracted" boolean DEFAULT false,
    "extraction_data" "jsonb",
    "extraction_confidence" numeric(3,2),
    "extraction_timestamp" timestamp with time zone,
    "licitacion_id" "uuid",
    "horas_contratadas" numeric(8,2),
    "snapshot_nombre_representante" "text",
    "snapshot_rut_representante" "text",
    CONSTRAINT "contratos_nombre_ciclo_check" CHECK ((("nombre_ciclo")::"text" = ANY (ARRAY[('Primer Ciclo'::character varying)::"text", ('Segundo Ciclo'::character varying)::"text", ('Tercer Ciclo'::character varying)::"text", ('Equipo Directivo'::character varying)::"text"])))
);

ALTER TABLE ONLY "public"."contratos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."contratos"."es_manual" IS 'Indicates if this is a manually uploaded external contract';



COMMENT ON COLUMN "public"."contratos"."descripcion_manual" IS 'Brief description of what the manual contract covers';



COMMENT ON COLUMN "public"."contratos"."pdf_extracted" IS 'Indicates if contract data was extracted from a PDF using AI';



COMMENT ON COLUMN "public"."contratos"."extraction_data" IS 'JSON data containing the raw extraction results from AI processing';



COMMENT ON COLUMN "public"."contratos"."extraction_confidence" IS 'Overall confidence score (0-1) of the AI extraction';



COMMENT ON COLUMN "public"."contratos"."extraction_timestamp" IS 'When the PDF extraction was performed';



COMMENT ON COLUMN "public"."contratos"."licitacion_id" IS 'Links contract back to its originating licitacion when FNE wins the procurement';



COMMENT ON COLUMN "public"."contratos"."horas_contratadas" IS 'Total contracted hours. Populated from programa default on creation, can be overridden by admin. Single source of truth for allocation total.';



COMMENT ON COLUMN "public"."contratos"."snapshot_nombre_representante" IS 'Legal representative name captured from clientes at contract creation time. Immutable historical record.';



COMMENT ON COLUMN "public"."contratos"."snapshot_rut_representante" IS 'Legal representative RUT captured from clientes at contract creation time. Immutable historical record.';



CREATE TABLE IF NOT EXISTS "public"."course_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assignment_type" character varying(50) DEFAULT 'individual'::character varying,
    "due_date" timestamp with time zone,
    "priority" character varying(20) DEFAULT 'normal'::character varying,
    "notes" "text",
    "assignment_data" "jsonb" DEFAULT '{}'::"jsonb",
    "status" character varying(50) DEFAULT 'active'::character varying,
    "progress_percentage" numeric(5,2) DEFAULT 0,
    CONSTRAINT "course_assignments_assignment_type_check" CHECK ((("assignment_type")::"text" = ANY (ARRAY[('individual'::character varying)::"text", ('group'::character varying)::"text", ('bulk'::character varying)::"text"]))),
    CONSTRAINT "course_assignments_priority_check" CHECK ((("priority")::"text" = ANY (ARRAY[('low'::character varying)::"text", ('normal'::character varying)::"text", ('high'::character varying)::"text", ('urgent'::character varying)::"text"]))),
    CONSTRAINT "course_assignments_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('pending'::character varying)::"text", ('active'::character varying)::"text", ('completed'::character varying)::"text", ('overdue'::character varying)::"text", ('cancelled'::character varying)::"text"])))
);


ALTER TABLE "public"."course_assignments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."course_assignments"."teacher_id" IS 'ID of the user assigned to the course (can be any role: admin, consultor, docente, etc.)';



CREATE TABLE IF NOT EXISTS "public"."course_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "module_id" "uuid",
    "completion_type" "text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completion_notification_sent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "course_completions_completion_type_check" CHECK (("completion_type" = ANY (ARRAY['course'::"text", 'module'::"text", 'aprobado'::"text"])))
);


ALTER TABLE "public"."course_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_prerequisites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "prerequisite_course_id" "uuid" NOT NULL,
    "is_required" boolean DEFAULT true,
    "minimum_score" numeric(5,2) DEFAULT 70,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "no_self_prerequisite" CHECK (("course_id" <> "prerequisite_course_id"))
);


ALTER TABLE "public"."course_prerequisites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" character varying(255) NOT NULL,
    "descripcion_corta" "text" NOT NULL,
    "competencias_desarrollar" "text" NOT NULL,
    "tiempo_requerido_desarrollo" character varying(100) NOT NULL,
    "necesita_ayuda_diseno_instruccional" boolean DEFAULT false,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" character varying(50) DEFAULT 'pending'::character varying,
    CONSTRAINT "course_proposals_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'reviewed'::character varying, 'approved'::character varying, 'rejected'::character varying])::"text"[])))
);


ALTER TABLE "public"."course_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "thumbnail_url" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_by" "uuid",
    "estimated_duration_hours" integer,
    "difficulty_level" character varying(20),
    "prerequisites" "jsonb" DEFAULT '[]'::"jsonb",
    "learning_objectives" "jsonb" DEFAULT '[]'::"jsonb",
    "completion_criteria" "jsonb" DEFAULT '{"requires_all_lessons": true, "overall_passing_score": 70}'::"jsonb",
    "certificate_template_url" "text",
    "is_self_paced" boolean DEFAULT true,
    "enrollment_limit" integer,
    "analytics_data" "jsonb" DEFAULT '{}'::"jsonb",
    "structure_type" character varying(20) DEFAULT 'structured'::character varying,
    CONSTRAINT "courses_difficulty_level_check" CHECK ((("difficulty_level")::"text" = ANY (ARRAY[('beginner'::character varying)::"text", ('intermediate'::character varying)::"text", ('advanced'::character varying)::"text"]))),
    CONSTRAINT "courses_structure_type_check" CHECK ((("structure_type")::"text" = ANY (ARRAY[('simple'::character varying)::"text", ('structured'::character varying)::"text"]))),
    CONSTRAINT "description_not_empty" CHECK (("char_length"(TRIM(BOTH FROM "description")) > 0)),
    CONSTRAINT "title_not_empty" CHECK (("char_length"(TRIM(BOTH FROM "title")) > 0))
);

ALTER TABLE ONLY "public"."courses" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."courses"."structure_type" IS 'Determines course 
  organization: simple (direct lessons) or structured (with modules)';



CREATE TABLE IF NOT EXISTS "public"."cuotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contrato_id" "uuid" NOT NULL,
    "numero_cuota" integer NOT NULL,
    "fecha_vencimiento" "date" NOT NULL,
    "monto_uf" numeric(10,2) NOT NULL,
    "pagada" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "monto" numeric,
    "factura_url" "text",
    "factura_pagada" boolean DEFAULT false,
    "factura_filename" "text",
    "factura_size" integer,
    "factura_type" "text",
    "factura_uploaded_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."cuotas" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."cuotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debug_bugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "category" "public"."debug_bug_category" NOT NULL,
    "severity" "public"."debug_bug_severity" NOT NULL,
    "description" "text",
    "error_message" "text",
    "stack_trace" "text",
    "reproduction_steps" "text",
    "solution" "text",
    "affected_files" "text"[],
    "related_roles" "text"[],
    "status" "public"."debug_bug_status" DEFAULT 'open'::"public"."debug_bug_status" NOT NULL,
    "environment" "public"."debug_bug_environment" DEFAULT 'development'::"public"."debug_bug_environment" NOT NULL,
    "user_id" "uuid",
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "detected_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "resolved_status_requires_date" CHECK (((("status" = 'resolved'::"public"."debug_bug_status") AND ("resolved_at" IS NOT NULL)) OR ("status" <> 'resolved'::"public"."debug_bug_status"))),
    CONSTRAINT "valid_resolution_date" CHECK ((("resolved_at" IS NULL) OR ("resolved_at" >= "reported_at")))
);


ALTER TABLE "public"."debug_bugs" OWNER TO "postgres";


COMMENT ON TABLE "public"."debug_bugs" IS 'Main bug tracking table with categorization, severity, and full lifecycle tracking';



COMMENT ON COLUMN "public"."debug_bugs"."title" IS 'Short, descriptive title of the bug';



COMMENT ON COLUMN "public"."debug_bugs"."category" IS 'System area where bug occurred (auth, database, ui, etc.)';



COMMENT ON COLUMN "public"."debug_bugs"."severity" IS 'Bug severity level (critical, high, medium, low)';



COMMENT ON COLUMN "public"."debug_bugs"."affected_files" IS 'Array of file paths affected by this bug';



COMMENT ON COLUMN "public"."debug_bugs"."related_roles" IS 'User roles that may be affected by this bug';



COMMENT ON COLUMN "public"."debug_bugs"."metadata" IS 'Flexible JSON field for additional context';



COMMENT ON COLUMN "public"."debug_bugs"."detected_by" IS 'Source of bug detection: "manual" for user-reported, "proactive-monitor" for auto-detected';



CREATE TABLE IF NOT EXISTS "public"."debug_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "log_level" "public"."debug_log_level" NOT NULL,
    "message" "text" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "source" "text",
    "user_id" "uuid",
    "session_id" "text",
    "bug_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."debug_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."debug_logs" IS 'Structured logging table with context and bug relationships';



COMMENT ON COLUMN "public"."debug_logs"."log_level" IS 'Severity level of the log entry';



COMMENT ON COLUMN "public"."debug_logs"."context" IS 'JSON context including request data, state, etc.';



COMMENT ON COLUMN "public"."debug_logs"."source" IS 'Source component or file that generated the log';



COMMENT ON COLUMN "public"."debug_logs"."session_id" IS 'Browser/user session identifier';



COMMENT ON COLUMN "public"."debug_logs"."bug_id" IS 'Related bug if this log is part of bug investigation';



CREATE TABLE IF NOT EXISTS "public"."debug_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bug_id" "uuid" NOT NULL,
    "agent_version" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "steps_taken" "jsonb"[] DEFAULT '{}'::"jsonb"[],
    "outcome" "text",
    "files_modified" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "valid_completion_date" CHECK ((("completed_at" IS NULL) OR ("completed_at" >= "started_at")))
);


ALTER TABLE "public"."debug_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."debug_sessions" IS 'Tracks debugging sessions including agent actions and outcomes';



COMMENT ON COLUMN "public"."debug_sessions"."agent_version" IS 'Version of Claude or debugging agent used';



COMMENT ON COLUMN "public"."debug_sessions"."steps_taken" IS 'Array of JSON objects describing each debugging step';



COMMENT ON COLUMN "public"."debug_sessions"."outcome" IS 'Final result or resolution notes';



COMMENT ON COLUMN "public"."debug_sessions"."files_modified" IS 'List of files modified during this debug session';



CREATE TABLE IF NOT EXISTS "public"."deleted_blocks" (
    "id" "uuid" NOT NULL,
    "lesson_id" "uuid",
    "module_id" "uuid",
    "course_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text",
    "payload" "jsonb",
    "position" integer,
    "created_at" timestamp with time zone,
    "deleted_at" timestamp with time zone DEFAULT "now"(),
    "deleted_by" "uuid",
    "created_by" "uuid"
);


ALTER TABLE "public"."deleted_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_courses" (
    "id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "instructor_id" "uuid",
    "thumbnail_url" "text",
    "status" "text",
    "created_at" timestamp with time zone,
    "deleted_at" timestamp with time zone DEFAULT "now"(),
    "deleted_by" "uuid",
    "created_by" "uuid"
);


ALTER TABLE "public"."deleted_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_lessons" (
    "id" "uuid" NOT NULL,
    "module_id" "uuid",
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text",
    "order_number" integer DEFAULT 1,
    "created_at" timestamp with time zone,
    "deleted_at" timestamp with time zone DEFAULT "now"(),
    "deleted_by" "uuid",
    "created_by" "uuid"
);


ALTER TABLE "public"."deleted_lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_modules" (
    "id" "uuid" NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "order_number" integer DEFAULT 1,
    "created_at" timestamp with time zone,
    "deleted_at" timestamp with time zone DEFAULT "now"(),
    "deleted_by" "uuid",
    "created_by" "uuid"
);


ALTER TABLE "public"."deleted_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dev_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dev_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dev_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dev_role_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dev_user_id" "uuid" NOT NULL,
    "impersonated_role" "public"."user_role_type" NOT NULL,
    "impersonated_user_id" "uuid",
    "school_id" integer,
    "generation_id" "uuid",
    "community_id" "uuid",
    "session_token" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '08:00:00'::interval),
    "ended_at" timestamp with time zone,
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dev_role_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dev_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dev_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_access_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "action_type" character varying(20) NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "accessed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_action_type" CHECK ((("action_type")::"text" = ANY (ARRAY[('view'::character varying)::"text", ('download'::character varying)::"text", ('upload'::character varying)::"text", ('delete'::character varying)::"text"])))
);


ALTER TABLE "public"."document_access_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "folder_name" character varying(100) NOT NULL,
    "parent_folder_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "folder_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "folder_name")) > 0)),
    CONSTRAINT "no_self_parent" CHECK (("id" <> "parent_folder_id"))
);


ALTER TABLE "public"."document_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" character varying(100) NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "file_size_positive" CHECK (("file_size" > 0)),
    CONSTRAINT "version_number_positive" CHECK (("version_number" > 0))
);


ALTER TABLE "public"."document_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "location" character varying(255) NOT NULL,
    "date_start" "date" NOT NULL,
    "date_end" "date",
    "time" character varying(50),
    "description" "text",
    "link_url" character varying(500),
    "link_display" character varying(255),
    "is_published" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exec_sql_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"(),
    "executed_by" "uuid",
    "sql_query" "text",
    "success" boolean,
    "error_message" "text"
);


ALTER TABLE "public"."exec_sql_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."exec_sql_audit_log" IS 'Audit log for exec_sql function executions.
Tracks who executed what SQL and when, for security monitoring.';



CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "color" character varying(7) DEFAULT '#6B7280'::character varying,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid",
    "category_id" "uuid",
    "description" character varying(300) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "expense_date" "date" NOT NULL,
    "vendor" character varying(200),
    "receipt_url" "text",
    "receipt_filename" character varying(300),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "currency" character varying(3) DEFAULT 'CLP'::character varying,
    "original_amount" numeric(10,2),
    "conversion_rate" numeric(10,4),
    "conversion_date" "date",
    "expense_number" "text",
    CONSTRAINT "expense_items_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "expense_items_currency_check" CHECK ((("currency")::"text" = ANY (ARRAY['CLP'::"text", 'USD'::"text", 'EUR'::"text", 'GBP'::"text"])))
);


ALTER TABLE "public"."expense_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_report_access" (
    "user_id" "uuid" NOT NULL,
    "can_submit" boolean DEFAULT true NOT NULL,
    "granted_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expense_report_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_name" character varying(200) NOT NULL,
    "description" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" character varying(20) DEFAULT 'draft'::character varying,
    "total_amount" numeric(12,2) DEFAULT 0,
    "submitted_by" "uuid",
    "submitted_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "expense_reports_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text", ('approved'::character varying)::"text", ('rejected'::character varying)::"text"])))
);


ALTER TABLE "public"."expense_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feedback_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "is_system_message" boolean DEFAULT false,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feedback_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "revoked_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "notes" "text"
);


ALTER TABLE "public"."feedback_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."feedback_permissions" IS 'Tracks which non-admin users have permission to submit feedback';



CREATE TABLE IF NOT EXISTS "public"."platform_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "description" "text" NOT NULL,
    "type" "text" DEFAULT 'feedback'::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "page_url" "text",
    "user_agent" "text",
    "browser_info" "jsonb",
    "screenshot_url" "text",
    "screenshot_filename" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    "resolution_notes" "text",
    CONSTRAINT "platform_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'seen'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "platform_feedback_type_check" CHECK (("type" = ANY (ARRAY['bug'::"text", 'idea'::"text", 'feedback'::"text"])))
);


ALTER TABLE "public"."platform_feedback" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."feedback_stats" AS
 SELECT "count"(*) FILTER (WHERE ("platform_feedback"."status" = 'new'::"text")) AS "new_count",
    "count"(*) FILTER (WHERE ("platform_feedback"."status" = 'seen'::"text")) AS "seen_count",
    "count"(*) FILTER (WHERE ("platform_feedback"."status" = 'in_progress'::"text")) AS "in_progress_count",
    "count"(*) FILTER (WHERE ("platform_feedback"."status" = 'resolved'::"text")) AS "resolved_count",
    "count"(*) FILTER (WHERE ("platform_feedback"."type" = 'bug'::"text")) AS "bug_count",
    "count"(*) FILTER (WHERE ("platform_feedback"."type" = 'idea'::"text")) AS "idea_count",
    "count"(*) FILTER (WHERE ("platform_feedback"."type" = 'feedback'::"text")) AS "feedback_count"
   FROM "public"."platform_feedback";


ALTER TABLE "public"."feedback_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feriados_chile" (
    "id" integer NOT NULL,
    "fecha" "date" NOT NULL,
    "nombre" "text" NOT NULL,
    "year" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feriados_chile" OWNER TO "postgres";


COMMENT ON TABLE "public"."feriados_chile" IS 'Chilean public holidays used for business day calculation in licitaciones timeline';



CREATE SEQUENCE IF NOT EXISTS "public"."feriados_chile_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."feriados_chile_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."feriados_chile_id_seq" OWNED BY "public"."feriados_chile"."id";



CREATE TABLE IF NOT EXISTS "public"."fx_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "to_currency" "text" DEFAULT 'CLP'::"text" NOT NULL,
    "rate" numeric(12,4) NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'api'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fx_rates_rate_check" CHECK (("rate" > (0)::numeric))
);


ALTER TABLE "public"."fx_rates" OWNER TO "postgres";


COMMENT ON TABLE "public"."fx_rates" IS 'Exchange rate cache. Append-only. Latest rate per currency pair is the active rate, auto-refreshed when stale (>1 hour). Indexed for fast latest-rate lookup.';



CREATE TABLE IF NOT EXISTS "public"."group_assignment_discussions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "workspace_id" "uuid",
    "thread_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."group_assignment_discussions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_assignment_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "community_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_consultant_managed" boolean DEFAULT false,
    "school_id" integer NOT NULL
);


ALTER TABLE "public"."group_assignment_groups" OWNER TO "postgres";


COMMENT ON COLUMN "public"."group_assignment_groups"."community_id" IS 'Optional growth community context. Null for school-only group creators with no community role.';



COMMENT ON COLUMN "public"."group_assignment_groups"."school_id" IS 'School the group belongs to. Required. Independent of community_id so school-only users can create groups.';



CREATE TABLE IF NOT EXISTS "public"."group_assignment_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "assignment_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_assignment_members_role_check" CHECK (("role" = ANY (ARRAY['leader'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."group_assignment_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_assignment_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "consultant_managed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."group_assignment_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_assignment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text",
    "file_url" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "grade" numeric(5,2),
    "feedback" "text",
    "submitted_at" timestamp with time zone,
    "graded_at" timestamp with time zone,
    "graded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_assignment_submissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'graded'::"text"])))
);


ALTER TABLE "public"."group_assignment_submissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."group_assignments_with_status" AS
 SELECT "gas"."assignment_id",
    "gas"."user_id",
    "gas"."group_id",
    "gag"."name" AS "group_name",
    "gag"."community_id",
    "gas"."status",
    "gas"."grade",
    "gas"."feedback",
    "gas"."submitted_at",
    "gas"."graded_at",
    "count"("gam"."id") AS "group_member_count"
   FROM (("public"."group_assignment_submissions" "gas"
     JOIN "public"."group_assignment_groups" "gag" ON (("gag"."id" = "gas"."group_id")))
     LEFT JOIN "public"."group_assignment_members" "gam" ON (("gam"."group_id" = "gas"."group_id")))
  GROUP BY "gas"."assignment_id", "gas"."user_id", "gas"."group_id", "gag"."name", "gag"."community_id", "gas"."status", "gas"."grade", "gas"."feedback", "gas"."submitted_at", "gas"."graded_at";


ALTER TABLE "public"."group_assignments_with_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."growth_community_transformation_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "growth_community_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."growth_community_transformation_access" OWNER TO "postgres";


COMMENT ON TABLE "public"."growth_community_transformation_access" IS 'Asignación de paquete completo de 7 Vías de Transformación a Growth Communities. Las 7 vías (Aprendizaje, Personalización, Evaluación, Propósito, Familias, Trabajo Docente, Liderazgo) se asignan/remueven como unidad indivisible.';



COMMENT ON COLUMN "public"."growth_community_transformation_access"."growth_community_id" IS 'Growth Community que tiene acceso al paquete completo de vías';



COMMENT ON COLUMN "public"."growth_community_transformation_access"."is_active" IS 'Si false, el acceso fue revocado y los assessments archivados. NO se reactivan automáticamente si se vuelve a asignar.';



CREATE TABLE IF NOT EXISTS "public"."hour_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "modality" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hour_types_modality_check" CHECK (("modality" = ANY (ARRAY['online'::"text", 'presencial'::"text"])))
);


ALTER TABLE "public"."hour_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."hour_types" IS 'Reference table for the 9 standard service hour categories. Keys are stable identifiers used across sessions, allocations, and rates.';



CREATE TABLE IF NOT EXISTS "public"."instructors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "photo_url" "text",
    "bio" "text",
    "specialty" "text"
);


ALTER TABLE "public"."instructors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_path_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "path_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "group_id" "uuid",
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "total_time_spent_minutes" integer DEFAULT 0,
    "last_activity_at" timestamp with time zone,
    "progress_percentage" integer DEFAULT 0,
    "completed_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "current_course_sequence" integer DEFAULT 1,
    "estimated_completion_minutes" integer,
    CONSTRAINT "learning_path_assignments_progress_percentage_check" CHECK ((("progress_percentage" >= 0) AND ("progress_percentage" <= 100))),
    CONSTRAINT "learning_path_assignments_user_or_group_exclusive" CHECK (((("user_id" IS NOT NULL) AND ("group_id" IS NULL)) OR (("user_id" IS NULL) AND ("group_id" IS NOT NULL))))
);


ALTER TABLE "public"."learning_path_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_path_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learning_path_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "sequence_order" integer NOT NULL,
    "is_required" boolean DEFAULT true,
    "unlock_criteria" "jsonb" DEFAULT '{"previous_course_completion": true}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."learning_path_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_path_progress_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "path_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "activity_type" character varying(50) NOT NULL,
    "session_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_end" timestamp with time zone,
    "time_spent_minutes" integer DEFAULT 0,
    "session_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_heartbeat" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learning_path_progress_sessions_activity_type_check" CHECK ((("activity_type")::"text" = ANY ((ARRAY['path_view'::character varying, 'course_start'::character varying, 'course_progress'::character varying, 'course_complete'::character varying, 'path_complete'::character varying])::"text"[]))),
    CONSTRAINT "learning_path_progress_sessions_time_valid" CHECK ((("session_end" IS NULL) OR ("session_end" >= "session_start")))
);


ALTER TABLE "public"."learning_path_progress_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_paths" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "description" "text",
    "school_id" integer,
    "generation_id" "uuid",
    "is_active" boolean DEFAULT true,
    "path_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."learning_paths" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_assignment_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "content" "text",
    "attachment_urls" "jsonb" DEFAULT '[]'::"jsonb",
    "status" character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    "submitted_at" timestamp with time zone,
    "graded_at" timestamp with time zone,
    "graded_by" "uuid",
    "score" numeric(5,2),
    "feedback" "text",
    "attempt_number" integer DEFAULT 1,
    "is_late" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "submitted_by" "uuid" NOT NULL,
    "source_submission_id" "uuid",
    "is_original" boolean DEFAULT true
);


ALTER TABLE "public"."lesson_assignment_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."lesson_assignment_submissions" IS 'Stores student submissions for assignments';



COMMENT ON COLUMN "public"."lesson_assignment_submissions"."status" IS 'Submission status: draft, submitted, graded, returned';



COMMENT ON COLUMN "public"."lesson_assignment_submissions"."submitted_by" IS 'The user who actually submitted the assignment (original submitter)';



COMMENT ON COLUMN "public"."lesson_assignment_submissions"."source_submission_id" IS 'Reference to the original submission if this is a derived (shared) submission';



COMMENT ON COLUMN "public"."lesson_assignment_submissions"."is_original" IS 'TRUE if this is the original submission, FALSE if derived from a share';



CREATE TABLE IF NOT EXISTS "public"."lesson_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "course_id" "uuid",
    "lesson_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "due_date" timestamp with time zone,
    "points" integer DEFAULT 0,
    "assignment_type" character varying(50) DEFAULT 'individual'::character varying NOT NULL,
    "instructions" "text",
    "resources" "jsonb" DEFAULT '[]'::"jsonb",
    "is_published" boolean DEFAULT false,
    "allow_late_submission" boolean DEFAULT true,
    "max_attempts" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "assignment_for" "text" DEFAULT 'individual'::"text",
    "assigned_to_community_id" "uuid",
    "max_group_size" integer DEFAULT 5,
    "min_group_size" integer DEFAULT 2,
    "require_all_members_submit" boolean DEFAULT false,
    "group_assignments" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "lesson_assignments_assignment_for_check" CHECK (("assignment_for" = ANY (ARRAY['individual'::"text", 'group'::"text"])))
);


ALTER TABLE "public"."lesson_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."lesson_assignments" IS 'Stores individual assignments created by teachers';



COMMENT ON COLUMN "public"."lesson_assignments"."assignment_type" IS 'Type of assignment: task, quiz, project, etc.';



COMMENT ON COLUMN "public"."lesson_assignments"."group_assignments" IS 'JSON array of groups with members and submissions for group assignments';



CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "block_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone,
    "completion_data" "jsonb" DEFAULT '{}'::"jsonb",
    "time_spent" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "module_id" "uuid",
    "course_id" "uuid",
    "order_number" integer DEFAULT 1,
    "estimated_duration_minutes" integer,
    "difficulty_level" character varying(20),
    "prerequisites" "jsonb" DEFAULT '[]'::"jsonb",
    "completion_criteria" "jsonb" DEFAULT '{"passing_score": 70, "requires_all_blocks": true}'::"jsonb",
    "is_mandatory" boolean DEFAULT true,
    "lesson_type" character varying(50) DEFAULT 'standard'::character varying,
    "analytics_data" "jsonb" DEFAULT '{}'::"jsonb",
    "downloadable_files" "jsonb",
    "has_files" boolean DEFAULT false,
    "entry_quiz" "jsonb",
    "exit_quiz" "jsonb",
    "has_entry_quiz" boolean DEFAULT false,
    "has_exit_quiz" boolean DEFAULT false,
    CONSTRAINT "lessons_difficulty_level_check" CHECK ((("difficulty_level")::"text" = ANY (ARRAY[('beginner'::character varying)::"text", ('intermediate'::character varying)::"text", ('advanced'::character varying)::"text"]))),
    CONSTRAINT "lessons_lesson_type_check" CHECK ((("lesson_type")::"text" = ANY (ARRAY[('standard'::character varying)::"text", ('assessment'::character varying)::"text", ('project'::character varying)::"text", ('discussion'::character varying)::"text", ('resource'::character varying)::"text"])))
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lessons"."downloadable_files" IS 'Array of file URLs for lesson resources';



COMMENT ON COLUMN "public"."lessons"."has_files" IS 'Flag indicating if lesson has downloadable files';



COMMENT ON COLUMN "public"."lessons"."entry_quiz" IS 'Quiz to be taken before the lesson';



COMMENT ON COLUMN "public"."lessons"."exit_quiz" IS 'Quiz to be taken after the lesson';



COMMENT ON COLUMN "public"."lessons"."has_entry_quiz" IS 'Flag indicating if lesson has an entry quiz';



COMMENT ON COLUMN "public"."lessons"."has_exit_quiz" IS 'Flag indicating if lesson has an exit quiz';



CREATE TABLE IF NOT EXISTS "public"."licitacion_ates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid" NOT NULL,
    "nombre_ate" "text" NOT NULL,
    "rut_ate" "text",
    "nombre_contacto" "text",
    "email" "text",
    "telefono" "text",
    "fecha_solicitud_bases" "date",
    "fecha_envio_bases" "date",
    "propuesta_url" "text",
    "propuesta_filename" "text",
    "propuesta_size" integer,
    "propuesta_mime_type" "text",
    "fecha_propuesta" "date",
    "monto_propuesto" numeric,
    "puntaje_tecnico" numeric,
    "puntaje_economico" numeric,
    "puntaje_tecnico_ponderado" numeric,
    "puntaje_economico_ponderado" numeric,
    "puntaje_total" numeric,
    "es_ganador" boolean DEFAULT false,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."licitacion_ates" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitacion_ates" IS 'ATEs participating in a licitacion -- tracks bases distribution, proposals, and evaluation scores';



CREATE TABLE IF NOT EXISTS "public"."licitacion_comision" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "rut" "text",
    "cargo" "text",
    "orden" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "licitacion_comision_orden_check" CHECK ((("orden" >= 1) AND ("orden" <= 3)))
);


ALTER TABLE "public"."licitacion_comision" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitacion_comision" IS 'Evaluation committee members (up to 3) for the Acta de Reunion document';



CREATE TABLE IF NOT EXISTS "public"."licitacion_consultas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid" NOT NULL,
    "ate_id" "uuid",
    "pregunta" "text" NOT NULL,
    "respuesta" "text",
    "fecha_pregunta" "date",
    "fecha_respuesta" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."licitacion_consultas" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitacion_consultas" IS 'Optional: ATE questions and school answers during the bases distribution period';



CREATE TABLE IF NOT EXISTS "public"."licitacion_documentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer,
    "mime_type" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "licitacion_documentos_tipo_check" CHECK (("tipo" = ANY (ARRAY['publicacion_imagen'::"text", 'bases_generadas'::"text", 'bases_enviadas'::"text", 'propuesta'::"text", 'evaluacion_generada'::"text", 'evaluacion_firmada'::"text", 'carta_adjudicacion_generada'::"text", 'carta_adjudicacion_firmada'::"text", 'anexos'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."licitacion_documentos" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitacion_documentos" IS 'All documents associated with a licitacion -- both system-generated and user-uploaded. Full audit trail.';



CREATE TABLE IF NOT EXISTS "public"."licitacion_evaluaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid" NOT NULL,
    "ate_id" "uuid" NOT NULL,
    "criterio_id" "uuid" NOT NULL,
    "puntaje" numeric NOT NULL,
    "comentario" "text",
    "evaluado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "licitacion_evaluaciones_puntaje_check" CHECK (("puntaje" >= (0)::numeric))
);


ALTER TABLE "public"."licitacion_evaluaciones" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitacion_evaluaciones" IS 'Individual criterion scores per ATE per licitacion. One row per ATE x criterion combination.';



CREATE TABLE IF NOT EXISTS "public"."licitacion_historial" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid" NOT NULL,
    "accion" "text" NOT NULL,
    "estado_anterior" "text",
    "estado_nuevo" "text",
    "detalles" "jsonb",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."licitacion_historial" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitacion_historial" IS 'Audit log for every action on a licitacion -- status changes, uploads, edits, etc.';



CREATE TABLE IF NOT EXISTS "public"."licitaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_licitacion" "text" NOT NULL,
    "school_id" integer NOT NULL,
    "cliente_id" "text",
    "programa_id" "text" NOT NULL,
    "nombre_licitacion" "text" NOT NULL,
    "year" integer NOT NULL,
    "estado" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "email_licitacion" "text",
    "monto_minimo" numeric,
    "monto_maximo" numeric,
    "tipo_moneda" "text" DEFAULT 'UF'::"text" NOT NULL,
    "duracion_minima" "text",
    "duracion_maxima" "text",
    "peso_evaluacion_tecnica" integer,
    "peso_evaluacion_economica" integer,
    "participantes_estimados" integer,
    "modalidad_preferida" "text",
    "fecha_publicacion" "date",
    "fecha_limite_solicitud_bases" "date",
    "fecha_limite_consultas" "date",
    "fecha_inicio_propuestas" "date",
    "fecha_limite_propuestas" "date",
    "fecha_limite_evaluacion" "date",
    "fecha_adjudicacion" "date",
    "ganador_ate_id" "uuid",
    "ganador_es_fne" boolean,
    "contrato_id" "uuid",
    "publicacion_imagen_url" "text",
    "bases_documento_url" "text",
    "evaluacion_pdf_url" "text",
    "carta_adjudicacion_url" "text",
    "monto_adjudicado_uf" numeric,
    "condiciones_pago" "text",
    "fecha_oferta_ganadora" "date",
    "contacto_coordinacion_nombre" "text",
    "contacto_coordinacion_email" "text",
    "contacto_coordinacion_telefono" "text",
    "hora_inicio_evaluacion" "text",
    "hora_fin_evaluacion" "text",
    "notas" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "licitaciones_duracion_maxima_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("duracion_maxima" IS NOT NULL))),
    CONSTRAINT "licitaciones_duracion_minima_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("duracion_minima" IS NOT NULL))),
    CONSTRAINT "licitaciones_email_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("email_licitacion" IS NOT NULL))),
    CONSTRAINT "licitaciones_estado_check" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'publicacion_pendiente'::"text", 'recepcion_bases_pendiente'::"text", 'propuestas_pendientes'::"text", 'evaluacion_pendiente'::"text", 'adjudicacion_pendiente'::"text", 'contrato_pendiente'::"text", 'contrato_generado'::"text", 'adjudicada_externo'::"text", 'cerrada'::"text"]))),
    CONSTRAINT "licitaciones_monto_check" CHECK ((("monto_minimo" IS NULL) OR ("monto_maximo" IS NULL) OR ("monto_maximo" >= "monto_minimo"))),
    CONSTRAINT "licitaciones_monto_maximo_check" CHECK ((("monto_maximo" IS NULL) OR ("monto_maximo" >= (0)::numeric))),
    CONSTRAINT "licitaciones_monto_maximo_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("monto_maximo" IS NOT NULL))),
    CONSTRAINT "licitaciones_monto_minimo_check" CHECK ((("monto_minimo" IS NULL) OR ("monto_minimo" >= (0)::numeric))),
    CONSTRAINT "licitaciones_monto_minimo_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("monto_minimo" IS NOT NULL))),
    CONSTRAINT "licitaciones_peso_check" CHECK ((("peso_evaluacion_tecnica" IS NULL) OR ("peso_evaluacion_economica" IS NULL) OR (("peso_evaluacion_tecnica" + "peso_evaluacion_economica") = 100))),
    CONSTRAINT "licitaciones_peso_economica_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("peso_evaluacion_economica" IS NOT NULL))),
    CONSTRAINT "licitaciones_peso_evaluacion_economica_check" CHECK ((("peso_evaluacion_economica" IS NULL) OR (("peso_evaluacion_economica" >= 1) AND ("peso_evaluacion_economica" <= 99)))),
    CONSTRAINT "licitaciones_peso_evaluacion_tecnica_check" CHECK ((("peso_evaluacion_tecnica" IS NULL) OR (("peso_evaluacion_tecnica" >= 1) AND ("peso_evaluacion_tecnica" <= 99)))),
    CONSTRAINT "licitaciones_peso_tecnica_required_when_live" CHECK ((("estado" = 'cerrada'::"text") OR ("peso_evaluacion_tecnica" IS NOT NULL))),
    CONSTRAINT "licitaciones_tipo_moneda_check" CHECK (("tipo_moneda" = ANY (ARRAY['UF'::"text", 'CLP'::"text"])))
);


ALTER TABLE "public"."licitaciones" OWNER TO "postgres";


COMMENT ON TABLE "public"."licitaciones" IS 'Main licitacion records tracking the 10-state procurement workflow. State flow: borrador -> publicacion_pendiente -> recepcion_bases_pendiente -> propuestas_pendientes -> evaluacion_pendiente -> adjudicacion_pendiente -> contrato_pendiente -> contrato_generado/adjudicada_externo -> cerrada';



CREATE TABLE IF NOT EXISTS "public"."meeting_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "agreement_text" "text" NOT NULL,
    "order_index" integer DEFAULT 0,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "agreement_doc" "jsonb",
    CONSTRAINT "agreement_not_empty" CHECK (("length"(TRIM(BOTH FROM "agreement_text")) > 0))
);


ALTER TABLE "public"."meeting_agreements" OWNER TO "postgres";


COMMENT ON TABLE "public"."meeting_agreements" IS 'Agreements reached during community meetings';



CREATE TABLE IF NOT EXISTS "public"."meeting_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "file_type" "text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."meeting_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_attendees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "attendance_status" "text" DEFAULT 'invited'::"text",
    "role" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meeting_attendees" OWNER TO "postgres";


COMMENT ON TABLE "public"."meeting_attendees" IS 'Meeting attendance tracking';



CREATE TABLE IF NOT EXISTS "public"."meeting_commitments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "commitment_text" "text" NOT NULL,
    "assigned_to" "uuid" NOT NULL,
    "due_date" "date",
    "status" "public"."task_status" DEFAULT 'pendiente'::"public"."task_status",
    "notes" "text",
    "completed_at" timestamp with time zone,
    "progress_percentage" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "commitment_doc" "jsonb",
    CONSTRAINT "commitment_not_empty" CHECK (("length"(TRIM(BOTH FROM "commitment_text")) > 0)),
    CONSTRAINT "completed_when_done" CHECK (((("status" = 'completado'::"public"."task_status") AND ("completed_at" IS NOT NULL) AND ("progress_percentage" = 100)) OR (("status" <> 'completado'::"public"."task_status") AND (("completed_at" IS NULL) OR ("progress_percentage" < 100))))),
    CONSTRAINT "valid_progress" CHECK ((("progress_percentage" >= 0) AND ("progress_percentage" <= 100)))
);


ALTER TABLE "public"."meeting_commitments" OWNER TO "postgres";


COMMENT ON TABLE "public"."meeting_commitments" IS 'Individual commitments made during meetings';



CREATE TABLE IF NOT EXISTS "public"."meeting_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "task_title" "text" NOT NULL,
    "task_description" "text",
    "assigned_to" "uuid" NOT NULL,
    "due_date" "date",
    "priority" "public"."task_priority" DEFAULT 'media'::"public"."task_priority",
    "status" "public"."task_status" DEFAULT 'pendiente'::"public"."task_status",
    "estimated_hours" numeric(5,2),
    "actual_hours" numeric(5,2),
    "category" "text",
    "parent_task_id" "uuid",
    "completed_at" timestamp with time zone,
    "progress_percentage" integer DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "task_description_doc" "jsonb",
    CONSTRAINT "no_self_parent" CHECK (("parent_task_id" <> "id")),
    CONSTRAINT "task_completed_when_done" CHECK (((("status" = 'completado'::"public"."task_status") AND ("completed_at" IS NOT NULL) AND ("progress_percentage" = 100)) OR (("status" <> 'completado'::"public"."task_status") AND (("completed_at" IS NULL) OR ("progress_percentage" < 100))))),
    CONSTRAINT "task_title_not_empty" CHECK (("length"(TRIM(BOTH FROM "task_title")) > 0)),
    CONSTRAINT "valid_hours" CHECK (((("estimated_hours" IS NULL) OR ("estimated_hours" >= (0)::numeric)) AND (("actual_hours" IS NULL) OR ("actual_hours" >= (0)::numeric)))),
    CONSTRAINT "valid_task_progress" CHECK ((("progress_percentage" >= 0) AND ("progress_percentage" <= 100)))
);


ALTER TABLE "public"."meeting_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."meeting_tasks" IS 'Specific tasks assigned during meetings';



CREATE TABLE IF NOT EXISTS "public"."meeting_work_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_heartbeat_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "client_id" "text"
);


ALTER TABLE "public"."meeting_work_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_permissions" (
    "role_type" "text" NOT NULL,
    "menu_item_id" "text" NOT NULL,
    "can_view" boolean DEFAULT false
);


ALTER TABLE "public"."menu_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "workspace_id" "uuid",
    "message_id" "uuid",
    "thread_id" "uuid",
    "action_type" "public"."message_activity_type" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "thumbnail_path" "text",
    "description" "text",
    "uploaded_by" "uuid",
    "download_count" integer DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid",
    "mentioned_user_id" "uuid",
    "mention_text" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['thumbs_up'::"text", 'heart'::"text", 'lightbulb'::"text", 'celebration'::"text", 'eyes'::"text", 'question'::"text"])))
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_reactions" IS 'Stores user reactions (likes, hearts, etc.) on community messages';



COMMENT ON COLUMN "public"."message_reactions"."reaction_type" IS 'Type of reaction: thumbs_up, heart, lightbulb, celebration, eyes, question';



CREATE TABLE IF NOT EXISTS "public"."metadata_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "old_role" "text",
    "new_role" "text",
    "sync_requested_at" timestamp with time zone DEFAULT "now"(),
    "sync_completed_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."metadata_sync_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."metadata_sync_log" IS 'Tracks profile role changes that require metadata sync';



CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "order" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "order_number" integer DEFAULT 1
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_articles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "content_html" "text" NOT NULL,
    "featured_image" "text",
    "is_published" boolean DEFAULT false,
    "author_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "display_date" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."news_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" character varying(50) NOT NULL,
    "event_data" "jsonb" NOT NULL,
    "trigger_id" "uuid",
    "notifications_created" integer DEFAULT 0,
    "processed_at" timestamp with time zone DEFAULT "now"(),
    "status" character varying(20) DEFAULT 'success'::character varying
);


ALTER TABLE "public"."notification_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_events" IS 'Audit log of all notification trigger events';



CREATE TABLE IF NOT EXISTS "public"."notification_triggers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" character varying(50) NOT NULL,
    "trigger_condition" "jsonb",
    "notification_template" "jsonb" NOT NULL,
    "category" character varying(50) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_triggers" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_triggers" IS 'Stores templates and conditions for automated notification generation';



CREATE TABLE IF NOT EXISTS "public"."notification_types" (
    "id" character varying(50) NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "default_enabled" boolean DEFAULT true,
    "category" character varying(50) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" character varying(50) NOT NULL,
    "title" character varying(200) NOT NULL,
    "message" "text" NOT NULL,
    "entity_type" character varying(50),
    "entity_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "notifications_message_not_empty" CHECK (("length"(TRIM(BOTH FROM "message")) > 0)),
    CONSTRAINT "notifications_title_not_empty" CHECK (("length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pasantias_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "pdf_url" "text",
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."pasantias_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pasantias_quote_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "group_name" "text",
    "num_participants" integer DEFAULT 1 NOT NULL,
    "arrival_date" "date" NOT NULL,
    "departure_date" "date" NOT NULL,
    "nights" integer GENERATED ALWAYS AS (("departure_date" - "arrival_date")) STORED,
    "flight_price" numeric(10,2) DEFAULT 0,
    "room_type" "text" NOT NULL,
    "room_price_per_night" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "accommodation_total" numeric(10,2) DEFAULT 0,
    "flight_total" numeric(10,2) DEFAULT 0,
    "viaticos_type" "text",
    "viaticos_amount" numeric(10,2) DEFAULT 0,
    "viaticos_total" numeric(10,2) DEFAULT 0,
    "viaticos_display_amount" numeric(10,2) DEFAULT 0,
    CONSTRAINT "pasantias_quote_groups_num_participants_check" CHECK (("num_participants" > 0)),
    CONSTRAINT "pasantias_quote_groups_room_type_check" CHECK (("room_type" = ANY (ARRAY['single'::"text", 'double'::"text"]))),
    CONSTRAINT "pasantias_quote_groups_viaticos_type_check" CHECK (("viaticos_type" = ANY (ARRAY['daily'::"text", 'total'::"text", NULL::"text"])))
);


ALTER TABLE "public"."pasantias_quote_groups" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pasantias_quote_groups"."viaticos_type" IS 'Type of viáticos calculation for this group: daily (per day) or total (lump sum) per participant';



COMMENT ON COLUMN "public"."pasantias_quote_groups"."viaticos_amount" IS 'Base viáticos amount for this group (before 15% surcharge) in CLP';



COMMENT ON COLUMN "public"."pasantias_quote_groups"."viaticos_total" IS 'Total viáticos for this group (calculated field)';



COMMENT ON COLUMN "public"."pasantias_quote_groups"."viaticos_display_amount" IS 'Amount to display for this group (includes 15% surcharge) in CLP';



CREATE SEQUENCE IF NOT EXISTS "public"."pasantias_quote_number_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."pasantias_quote_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pasantias_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_name" "text" NOT NULL,
    "client_email" "text",
    "client_phone" "text",
    "client_institution" "text",
    "arrival_date" "date" NOT NULL,
    "departure_date" "date" NOT NULL,
    "nights" integer GENERATED ALWAYS AS (("departure_date" - "arrival_date")) STORED,
    "flight_price" numeric(10,2) DEFAULT 0,
    "flight_notes" "text",
    "room_type" "text",
    "single_room_price" numeric(10,2) DEFAULT 0,
    "double_room_price" numeric(10,2) DEFAULT 0,
    "num_pasantes" integer DEFAULT 1 NOT NULL,
    "selected_programs" "uuid"[] DEFAULT ARRAY[]::"uuid"[],
    "program_total" numeric(10,2) DEFAULT 0,
    "accommodation_total" numeric(10,2) DEFAULT 0,
    "total_per_person" numeric(10,2) DEFAULT 0,
    "grand_total" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "internal_notes" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "valid_until" "date",
    "viewed_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "use_groups" boolean DEFAULT false,
    "apply_early_bird_discount" boolean DEFAULT false,
    "early_bird_payment_date" "date",
    "discount_amount" numeric(10,2) DEFAULT 0,
    "original_program_total" numeric(10,2) DEFAULT 0,
    "quote_number" integer DEFAULT "nextval"('"public"."pasantias_quote_number_seq"'::"regclass") NOT NULL,
    "viaticos_type" "text",
    "viaticos_amount" numeric(10,2) DEFAULT 0,
    "viaticos_total" numeric(10,2) DEFAULT 0,
    "viaticos_display_amount" numeric(10,2) DEFAULT 0,
    CONSTRAINT "pasantias_quotes_num_pasantes_check" CHECK (("num_pasantes" > 0)),
    CONSTRAINT "pasantias_quotes_room_type_check" CHECK (("room_type" = ANY (ARRAY['single'::"text", 'double'::"text"]))),
    CONSTRAINT "pasantias_quotes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'viewed'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"]))),
    CONSTRAINT "pasantias_quotes_viaticos_type_check" CHECK (("viaticos_type" = ANY (ARRAY['daily'::"text", 'total'::"text", NULL::"text"])))
);


ALTER TABLE "public"."pasantias_quotes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pasantias_quotes"."viaticos_type" IS 'Type of viáticos calculation: daily (per day) or total (lump sum) per participant';



COMMENT ON COLUMN "public"."pasantias_quotes"."viaticos_amount" IS 'Base viáticos amount (before 15% surcharge) in CLP - either daily rate or total amount depending on viaticos_type';



COMMENT ON COLUMN "public"."pasantias_quotes"."viaticos_total" IS 'Total viáticos for all participants (calculated field)';



COMMENT ON COLUMN "public"."pasantias_quotes"."viaticos_display_amount" IS 'Amount to display in client proposal (includes 15% surcharge) in CLP';



CREATE TABLE IF NOT EXISTS "public"."quiz_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "block_id" "text" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "auto_graded_score" integer DEFAULT 0,
    "manual_graded_score" integer DEFAULT 0,
    "total_possible_points" integer NOT NULL,
    "auto_gradable_points" integer NOT NULL,
    "manual_gradable_points" integer NOT NULL,
    "grading_status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "graded_at" timestamp with time zone,
    "graded_by" "uuid",
    "answers" "jsonb" NOT NULL,
    "open_responses" "jsonb",
    "grading_feedback" "jsonb",
    "time_spent" integer,
    "attempt_number" integer DEFAULT 1,
    "review_status" "text" DEFAULT 'pending'::"text",
    "general_feedback" "text",
    CONSTRAINT "quiz_submissions_grading_status_check" CHECK (("grading_status" = ANY (ARRAY['completed'::"text", 'pending_review'::"text"]))),
    CONSTRAINT "quiz_submissions_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending'::"text", 'pass'::"text", 'needs_review'::"text"])))
);


ALTER TABLE "public"."quiz_submissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."pending_quiz_reviews" AS
 SELECT "qs"."id",
    "qs"."lesson_id",
    "qs"."block_id",
    "qs"."student_id",
    "qs"."course_id",
    "qs"."submitted_at",
    "qs"."open_responses",
    "p"."name" AS "student_name",
    "p"."email" AS "student_email",
    "c"."title" AS "course_title",
    "l"."title" AS "lesson_title",
    ( SELECT "count"(*) AS "count"
           FROM "public"."quiz_submissions" "qs2"
          WHERE (("qs2"."review_status" = 'pending'::"text") AND ("qs2"."course_id" = "qs"."course_id"))) AS "reviewer_workload"
   FROM ((("public"."quiz_submissions" "qs"
     JOIN "public"."profiles" "p" ON (("p"."id" = "qs"."student_id")))
     JOIN "public"."courses" "c" ON (("c"."id" = "qs"."course_id")))
     JOIN "public"."lessons" "l" ON (("l"."id" = "qs"."lesson_id")))
  WHERE (("qs"."review_status" = 'pending'::"text") AND ("qs"."open_responses" IS NOT NULL) AND ("jsonb_array_length"("qs"."open_responses") > 0))
  ORDER BY "qs"."submitted_at";


ALTER TABLE "public"."pending_quiz_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permission_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action" "text" NOT NULL,
    "user_id" "uuid",
    "performed_by" "uuid",
    "test_run_id" "uuid",
    "is_test" boolean DEFAULT false NOT NULL,
    "reason" "text",
    "diff" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role_type" "text",
    "permission_key" "text",
    "old_value" "jsonb",
    "new_value" "jsonb"
);

ALTER TABLE ONLY "public"."permission_audit_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."permissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_comments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "parent_comment_id" "uuid",
    "is_edited" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_comments" IS 'Comments on posts with nested reply support';



CREATE TABLE IF NOT EXISTS "public"."post_hashtags" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "hashtag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_hashtags" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_hashtags" IS 'Hashtags used in posts';



CREATE TABLE IF NOT EXISTS "public"."post_media" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "url" "text" NOT NULL,
    "storage_path" "text",
    "thumbnail_url" "text",
    "caption" "text",
    "order_index" integer DEFAULT 0,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "post_media_type_check" CHECK (("type" = ANY (ARRAY['image'::"text", 'video'::"text", 'document'::"text"])))
);


ALTER TABLE "public"."post_media" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_media" IS 'Media attachments for posts (images, videos)';



CREATE TABLE IF NOT EXISTS "public"."post_mentions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_mentions" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_mentions" IS 'User mentions in posts';



CREATE TABLE IF NOT EXISTS "public"."post_reactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction_type" "text" DEFAULT 'like'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "post_reactions_reaction_type_check" CHECK (("reaction_type" = ANY (ARRAY['like'::"text", 'love'::"text", 'celebrate'::"text", 'support'::"text", 'insightful'::"text"])))
);


ALTER TABLE "public"."post_reactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."post_reactions" IS 'User reactions (likes, etc.) on posts';



CREATE OR REPLACE VIEW "public"."posts_with_engagement" AS
 SELECT "p"."id",
    "p"."workspace_id",
    "p"."author_id",
    "p"."type",
    "p"."content",
    "p"."visibility",
    "p"."is_pinned",
    "p"."is_archived",
    "p"."view_count",
    "p"."created_at",
    "p"."updated_at",
    COALESCE("reaction_counts"."total_reactions", (0)::bigint) AS "reaction_count",
    COALESCE("comment_counts"."total_comments", (0)::bigint) AS "comment_count",
    COALESCE("media_counts"."total_media", (0)::bigint) AS "media_count"
   FROM ((("public"."community_posts" "p"
     LEFT JOIN ( SELECT "post_reactions"."post_id",
            "count"(*) AS "total_reactions"
           FROM "public"."post_reactions"
          GROUP BY "post_reactions"."post_id") "reaction_counts" ON (("p"."id" = "reaction_counts"."post_id")))
     LEFT JOIN ( SELECT "post_comments"."post_id",
            "count"(*) AS "total_comments"
           FROM "public"."post_comments"
          GROUP BY "post_comments"."post_id") "comment_counts" ON (("p"."id" = "comment_counts"."post_id")))
     LEFT JOIN ( SELECT "post_media"."post_id",
            "count"(*) AS "total_media"
           FROM "public"."post_media"
          GROUP BY "post_media"."post_id") "media_counts" ON (("p"."id" = "media_counts"."post_id")));


ALTER TABLE "public"."posts_with_engagement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles_role_backup" (
    "id" "uuid",
    "role" "text",
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."profiles_role_backup" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles_role_backup" IS 'Backup of legacy role data from profiles table before dropping the column. Created on migration date.';



CREATE TABLE IF NOT EXISTS "public"."program_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "program_type" "text" NOT NULL,
    "program_year" integer NOT NULL,
    "academic_year" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "contracted_hours" numeric(8,2) NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'suspended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."program_enrollments" OWNER TO "postgres";


COMMENT ON TABLE "public"."program_enrollments" IS 'Future-ready: tracks contracted programs per school per academic year';



CREATE TABLE IF NOT EXISTS "public"."program_hours_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_enrollment_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "hours_consumed" numeric(6,2) NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."program_hours_ledger" OWNER TO "postgres";


COMMENT ON TABLE "public"."program_hours_ledger" IS 'Tracks program hours consumed per session (future-ready)';



CREATE TABLE IF NOT EXISTS "public"."programa_bases_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "programa_id" "text" NOT NULL,
    "nombre_servicio" "text" NOT NULL,
    "objetivo" "text" NOT NULL,
    "objetivos_especificos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "especificaciones_admin" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resultados_esperados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "requisitos_ate" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "documentos_adjuntar" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "condiciones_pago" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programa_bases_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."programa_bases_templates" IS 'Per-program Bases document templates with section content for licitacion document generation';



CREATE TABLE IF NOT EXISTS "public"."programa_evaluacion_criterios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "programa_id" "text" NOT NULL,
    "nombre_criterio" "text" NOT NULL,
    "puntaje_maximo" numeric NOT NULL,
    "descripcion" "text",
    "orden" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "programa_evaluacion_criterios_puntaje_maximo_check" CHECK (("puntaje_maximo" > (0)::numeric))
);


ALTER TABLE "public"."programa_evaluacion_criterios" OWNER TO "postgres";


COMMENT ON TABLE "public"."programa_evaluacion_criterios" IS 'Technical evaluation sub-criteria per FNE program. Points must sum to 100 per program. Weight split (tech/econ) is set per-licitacion, not here.';



CREATE TABLE IF NOT EXISTS "public"."programas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo_servicio" character varying(10),
    "nombre" character varying(500) NOT NULL,
    "descripcion" "text",
    "horas_totales" integer,
    "modalidad" character varying(50) DEFAULT 'mixta'::character varying,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."programas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_consultores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "perfil_profesional" "text",
    "formacion_academica" "jsonb",
    "experiencia_profesional" "jsonb",
    "referencias" "jsonb",
    "especialidades" "text"[],
    "foto_path" "text",
    "cv_pdf_path" "text",
    "activo" boolean DEFAULT true,
    "orden" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."propuesta_consultores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_contenido_bloques" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clave" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "contenido" "jsonb" NOT NULL,
    "imagenes" "jsonb",
    "programa_tipo" "text",
    "orden" integer DEFAULT 0,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."propuesta_contenido_bloques" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_documentos_biblioteca" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "descripcion" "text",
    "archivo_path" "text" NOT NULL,
    "fecha_emision" "date",
    "fecha_vencimiento" "date",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."propuesta_documentos_biblioteca" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_fichas_servicio" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "folio" integer NOT NULL,
    "nombre_servicio" "text" NOT NULL,
    "dimension" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "horas_presenciales" integer NOT NULL,
    "horas_no_presenciales" integer DEFAULT 0,
    "total_horas" integer NOT NULL,
    "destinatarios" "text"[] NOT NULL,
    "objetivo_general" "text",
    "metodologia" "text",
    "equipo_trabajo" "jsonb",
    "fecha_inscripcion" "date",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."propuesta_fichas_servicio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_generadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "licitacion_id" "uuid",
    "plantilla_id" "uuid",
    "ficha_id" "uuid",
    "configuracion" "jsonb" NOT NULL,
    "consultores_ids" "uuid"[],
    "documentos_ids" "uuid"[],
    "archivo_path" "text",
    "pdf_sha256" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "error_message" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "generado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "access_code" character varying(60),
    "access_code_plain" character varying(8),
    "web_slug" character varying(64),
    "viewed_at" timestamp with time zone,
    "view_count" integer DEFAULT 0,
    "web_status" "text",
    "snapshot_json" "jsonb",
    CONSTRAINT "propuesta_generadas_web_status_check" CHECK (("web_status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'viewed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."propuesta_generadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_plantillas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo_servicio" "text" NOT NULL,
    "ficha_id" "uuid",
    "bloques_orden" "text"[] NOT NULL,
    "horas_default" integer,
    "configuracion_default" "jsonb",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."propuesta_plantillas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propuesta_rate_limits" (
    "id" integer NOT NULL,
    "ip_address" character varying(45) NOT NULL,
    "slug" character varying(64) NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."propuesta_rate_limits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."propuesta_rate_limits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."propuesta_rate_limits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."propuesta_rate_limits_id_seq" OWNED BY "public"."propuesta_rate_limits"."id";



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "endpoint" "text" NOT NULL,
    "keys" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_coverage_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_name" "text",
    "overall_lines" numeric,
    "overall_statements" numeric,
    "overall_functions" numeric,
    "overall_branches" numeric,
    "file_coverage" "jsonb",
    "git_commit" "text",
    "git_branch" "text",
    "test_suite" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."qa_coverage_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_feature_checklist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feature_name" "text" NOT NULL,
    "feature_area" "text" NOT NULL,
    "description" "text",
    "route_pattern" "text",
    "is_critical" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."qa_feature_checklist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_lighthouse_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url" "text" NOT NULL,
    "performance_score" integer,
    "accessibility_score" integer,
    "best_practices_score" integer,
    "seo_score" integer,
    "pwa_score" integer,
    "first_contentful_paint" numeric,
    "largest_contentful_paint" numeric,
    "total_blocking_time" numeric,
    "cumulative_layout_shift" numeric,
    "speed_index" numeric,
    "time_to_interactive" numeric,
    "audit_details" "jsonb",
    "environment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "qa_lighthouse_results_accessibility_score_check" CHECK ((("accessibility_score" >= 0) AND ("accessibility_score" <= 100))),
    CONSTRAINT "qa_lighthouse_results_best_practices_score_check" CHECK ((("best_practices_score" >= 0) AND ("best_practices_score" <= 100))),
    CONSTRAINT "qa_lighthouse_results_performance_score_check" CHECK ((("performance_score" >= 0) AND ("performance_score" <= 100))),
    CONSTRAINT "qa_lighthouse_results_pwa_score_check" CHECK ((("pwa_score" >= 0) AND ("pwa_score" <= 100))),
    CONSTRAINT "qa_lighthouse_results_seo_score_check" CHECK ((("seo_score" >= 0) AND ("seo_score" <= 100)))
);


ALTER TABLE "public"."qa_lighthouse_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_load_test_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_name" "text" NOT NULL,
    "test_script" "text",
    "description" "text",
    "duration_seconds" integer,
    "virtual_users" integer,
    "requests_total" integer,
    "requests_per_second" numeric,
    "response_time_avg" numeric,
    "response_time_min" numeric,
    "response_time_max" numeric,
    "response_time_p50" numeric,
    "response_time_p90" numeric,
    "response_time_p95" numeric,
    "response_time_p99" numeric,
    "error_rate" numeric,
    "errors_total" integer,
    "data_received_kb" numeric,
    "data_sent_kb" numeric,
    "iterations_total" integer,
    "target_url" "text",
    "environment" "text",
    "metrics_json" "jsonb",
    "status" "text" DEFAULT 'passed'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "qa_load_test_results_error_rate_check" CHECK ((("error_rate" >= (0)::numeric) AND ("error_rate" <= (100)::numeric))),
    CONSTRAINT "qa_load_test_results_status_check" CHECK (("status" = ANY (ARRAY['passed'::"text", 'failed'::"text", 'warning'::"text"])))
);


ALTER TABLE "public"."qa_load_test_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_performance_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_name" "text" NOT NULL,
    "budget_value" numeric NOT NULL,
    "page_pattern" "text" DEFAULT '*'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."qa_performance_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_scenario_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scenario_id" "uuid" NOT NULL,
    "tester_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid",
    "due_date" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "completed_at" timestamp with time zone,
    CONSTRAINT "qa_scenario_assignments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."qa_scenario_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."qa_scenario_assignments" IS 'Tracks which QA testers are assigned to which test scenarios';



COMMENT ON COLUMN "public"."qa_scenario_assignments"."status" IS 'pending: not started, in_progress: being worked on, completed: finished, skipped: not applicable';



CREATE TABLE IF NOT EXISTS "public"."qa_scenarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "feature_area" "text" NOT NULL,
    "role_required" "text" NOT NULL,
    "preconditions" "jsonb" DEFAULT '[]'::"jsonb",
    "steps" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "is_active" boolean DEFAULT true,
    "priority" integer DEFAULT 2,
    "estimated_duration_minutes" integer DEFAULT 5,
    "automated_only" boolean DEFAULT false,
    "is_multi_user" boolean DEFAULT false,
    "testing_channel" "text" DEFAULT 'human'::"text" NOT NULL,
    CONSTRAINT "qa_scenarios_testing_channel_check" CHECK (("testing_channel" = ANY (ARRAY['automation'::"text", 'human'::"text", 'not_applicable'::"text"])))
);


ALTER TABLE "public"."qa_scenarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_step_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_run_id" "uuid" NOT NULL,
    "step_index" integer NOT NULL,
    "step_instruction" "text" NOT NULL,
    "expected_outcome" "text" NOT NULL,
    "passed" boolean,
    "tester_note" "text",
    "console_logs" "jsonb" DEFAULT '[]'::"jsonb",
    "network_logs" "jsonb" DEFAULT '[]'::"jsonb",
    "screenshot_url" "text",
    "dom_snapshot" "text",
    "captured_at" timestamp with time zone DEFAULT "now"(),
    "time_spent_seconds" integer,
    "active_seconds" integer DEFAULT 0,
    "current_url" "text"
);


ALTER TABLE "public"."qa_step_results" OWNER TO "postgres";


COMMENT ON COLUMN "public"."qa_step_results"."current_url" IS 'Browser URL (window.location.href) captured at the time the step result was saved. Used for QA failure diagnostics.';



CREATE TABLE IF NOT EXISTS "public"."qa_test_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scenario_id" "uuid" NOT NULL,
    "tester_id" "uuid" NOT NULL,
    "role_used" "text" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "environment" "text" DEFAULT 'local'::"text",
    "browser_info" "jsonb",
    "overall_result" "text",
    "notes" "text",
    "total_active_seconds" integer DEFAULT 0
);


ALTER TABLE "public"."qa_test_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_tester_time_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tester_id" "uuid",
    "date" "date" NOT NULL,
    "total_seconds" integer DEFAULT 0,
    "test_runs_count" integer DEFAULT 0,
    "scenarios_completed" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."qa_tester_time_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_web_vitals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_url" "text" NOT NULL,
    "metric_name" "text" NOT NULL,
    "metric_value" numeric NOT NULL,
    "rating" "text",
    "navigation_type" "text",
    "user_agent" "text",
    "connection_type" "text",
    "device_type" "text",
    "session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "qa_web_vitals_metric_name_check" CHECK (("metric_name" = ANY (ARRAY['LCP'::"text", 'INP'::"text", 'CLS'::"text", 'FCP'::"text", 'TTFB'::"text"]))),
    CONSTRAINT "qa_web_vitals_rating_check" CHECK (("rating" = ANY (ARRAY['good'::"text", 'needs-improvement'::"text", 'poor'::"text"])))
);


ALTER TABLE "public"."qa_web_vitals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid",
    "text" "text" NOT NULL,
    "type" "text" NOT NULL,
    "order" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "questions_type_check" CHECK (("type" = ANY (ARRAY['multiple_choice'::"text", 'true_false'::"text", 'short_answer'::"text"])))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."quiz_statistics" AS
 SELECT "quiz_submissions"."lesson_id",
    "quiz_submissions"."block_id",
    "count"(*) AS "total_submissions",
    "count"(*) FILTER (WHERE ("quiz_submissions"."review_status" = 'pending'::"text")) AS "pending_reviews",
    "count"(*) FILTER (WHERE ("quiz_submissions"."review_status" = 'pass'::"text")) AS "passed",
    "count"(*) FILTER (WHERE ("quiz_submissions"."review_status" = 'needs_review'::"text")) AS "needs_review"
   FROM "public"."quiz_submissions"
  GROUP BY "quiz_submissions"."lesson_id", "quiz_submissions"."block_id";


ALTER TABLE "public"."quiz_statistics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lesson_id" "uuid",
    "title" "text" NOT NULL,
    "instructions" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."red_escuelas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "red_id" "uuid" NOT NULL,
    "school_id" bigint NOT NULL,
    "fecha_agregada" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "agregado_por" "uuid" NOT NULL
);


ALTER TABLE "public"."red_escuelas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redes_de_colegios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" character varying(255) NOT NULL,
    "descripcion" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "last_updated_by" "uuid"
);


ALTER TABLE "public"."redes_de_colegios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."roadmap_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."roadmap_data" IS 'Key/value store for GENERA admin roadmap data. Each row is a named JSON document. Currently holds a single row with key=genera-roadmap-v1.';



COMMENT ON COLUMN "public"."roadmap_data"."key" IS 'Unique string identifier for the document, e.g. ''genera-roadmap-v1''.';



COMMENT ON COLUMN "public"."roadmap_data"."value" IS 'Full roadmap data as JSONB (phases, tasks, progress, etc.).';



COMMENT ON COLUMN "public"."roadmap_data"."updated_by" IS 'FK to profiles(id) -- the admin who last saved this row.';



CREATE TABLE IF NOT EXISTS "public"."role_permission_baseline" (
    "role_type" "text" NOT NULL,
    "permission_key" "text" NOT NULL,
    "granted" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."role_permission_baseline" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permission_baseline" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permission_baseline" IS 'Baseline permissions for roles - read-only, modified only via migrations';



COMMENT ON COLUMN "public"."role_permission_baseline"."metadata" IS 'Optional metadata like category, description, etc.';



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_type" "text" NOT NULL,
    "permission_key" "text" NOT NULL,
    "granted" boolean NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "test_run_id" "uuid",
    "is_test" boolean DEFAULT true,
    "active" boolean DEFAULT true,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."role_permissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."role_types" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."saved_posts" IS 'User bookmarked posts';



CREATE TABLE IF NOT EXISTS "public"."school_change_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "feature" "text" NOT NULL,
    "action" "text" NOT NULL,
    "previous_state" "jsonb",
    "new_state" "jsonb",
    "changed_fields" "text"[],
    "user_id" "uuid" NOT NULL,
    "user_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "school_change_history_action_check" CHECK (("action" = ANY (ARRAY['initial_save'::"text", 'update'::"text"]))),
    CONSTRAINT "school_change_history_feature_check" CHECK (("feature" = ANY (ARRAY['transversal_context'::"text", 'migration_plan'::"text", 'context_responses'::"text"])))
);


ALTER TABLE "public"."school_change_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_course_docente_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_structure_id" "uuid" NOT NULL,
    "docente_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."school_course_docente_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."school_course_docente_assignments" IS 'Docente assignments to courses (triggers auto-assignment via API)';



CREATE TABLE IF NOT EXISTS "public"."school_course_structure" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "context_id" "uuid" NOT NULL,
    "grade_level" "text" NOT NULL,
    "course_name" "text" NOT NULL,
    "professionals" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "grade_id" integer
);


ALTER TABLE "public"."school_course_structure" OWNER TO "postgres";


COMMENT ON TABLE "public"."school_course_structure" IS 'Course structure derived from transversal questionnaire';



CREATE TABLE IF NOT EXISTS "public"."school_plan_completion_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "feature" "text" NOT NULL,
    "is_completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "school_plan_completion_status_feature_check" CHECK (("feature" = ANY (ARRAY['migration_plan'::"text", 'context_responses'::"text"])))
);


ALTER TABLE "public"."school_plan_completion_status" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."school_progress_report" AS
 SELECT "s"."id" AS "school_id",
    "s"."name" AS "school_name",
    "count"(DISTINCT "p"."id") AS "total_users",
    "count"(DISTINCT "g"."id") AS "total_generations",
    "count"(DISTINCT "gc"."id") AS "total_communities",
    "count"(DISTINCT "ce"."course_id") AS "total_courses_assigned",
    "count"(DISTINCT
        CASE
            WHEN ("g"."name" = 'Tractor'::"text") THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "tractor_teachers",
    "count"(DISTINCT
        CASE
            WHEN ("g"."name" = 'Innova'::"text") THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "innova_teachers",
    "count"(DISTINCT
        CASE
            WHEN ("g"."name" = 'Equipo Directivo'::"text") THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "leadership_members",
    "round"("avg"("ce"."progress_percentage"), 2) AS "avg_progress_percentage",
    "count"(DISTINCT
        CASE
            WHEN "ce"."is_completed" THEN "ce"."course_id"
            ELSE NULL::"uuid"
        END) AS "courses_completed",
    "count"(DISTINCT
        CASE
            WHEN "ce"."is_completed" THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "users_with_completed_courses",
    "sum"("ce"."total_time_spent_seconds") AS "total_time_spent_seconds",
    "round"("avg"("ce"."total_time_spent_seconds"), 0) AS "avg_time_per_user_seconds",
    "round"("avg"("lcs"."quiz_score"), 2) AS "avg_quiz_score",
    "sum"("lcs"."quiz_attempts") AS "total_quiz_attempts",
    "count"(DISTINCT
        CASE
            WHEN ("ce"."updated_at" > ("now"() - '7 days'::interval)) THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "active_last_7_days",
    "count"(DISTINCT
        CASE
            WHEN ("ce"."updated_at" > ("now"() - '30 days'::interval)) THEN "p"."id"
            ELSE NULL::"uuid"
        END) AS "active_last_30_days",
    "count"(DISTINCT "ca"."consultant_id") AS "assigned_consultants",
    "count"(DISTINCT "ca"."student_id") AS "students_with_consultants",
    "min"("ce"."enrolled_at") AS "first_enrollment_date",
    "max"("ce"."updated_at") AS "last_activity_date"
   FROM (((((("public"."schools" "s"
     LEFT JOIN "public"."generations" "g" ON (("g"."school_id" = "s"."id")))
     LEFT JOIN "public"."growth_communities" "gc" ON (("gc"."school_id" = "s"."id")))
     LEFT JOIN "public"."profiles" "p" ON ((("p"."school_id" = "s"."id") AND ("p"."approval_status" = 'approved'::"text"))))
     LEFT JOIN "public"."course_enrollments" "ce" ON (("ce"."user_id" = "p"."id")))
     LEFT JOIN "public"."lesson_completion_summary" "lcs" ON (("lcs"."user_id" = "p"."id")))
     LEFT JOIN "public"."consultant_assignments" "ca" ON ((("ca"."school_id" = "s"."id") AND ("ca"."is_active" = true))))
  GROUP BY "s"."id", "s"."name";


ALTER TABLE "public"."school_progress_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_transversal_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" integer NOT NULL,
    "total_students" integer NOT NULL,
    "grade_levels" "text"[] NOT NULL,
    "courses_per_level" "jsonb" NOT NULL,
    "implementation_year_2026" integer NOT NULL,
    "subjects_per_level" "jsonb",
    "generacion_tractor_history" "jsonb",
    "generacion_innova_history" "jsonb",
    "programa_inicia_completed" boolean DEFAULT false,
    "programa_inicia_hours" integer,
    "programa_inicia_year" integer,
    "period_system" "text" NOT NULL,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_completed" boolean DEFAULT false,
    CONSTRAINT "school_transversal_context_implementation_year_2026_check" CHECK ((("implementation_year_2026" >= 1) AND ("implementation_year_2026" <= 5))),
    CONSTRAINT "school_transversal_context_period_system_check" CHECK (("period_system" = ANY (ARRAY['semestral'::"text", 'trimestral'::"text"]))),
    CONSTRAINT "school_transversal_context_programa_inicia_hours_check" CHECK ((("programa_inicia_hours" IS NULL) OR ("programa_inicia_hours" = ANY (ARRAY[20, 40, 80]))))
);


ALTER TABLE "public"."school_transversal_context" OWNER TO "postgres";


COMMENT ON TABLE "public"."school_transversal_context" IS 'School context questionnaire responses (11 questions)';



CREATE SEQUENCE IF NOT EXISTS "public"."schools_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."schools_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."schools_id_seq" OWNED BY "public"."schools"."id";



CREATE TABLE IF NOT EXISTS "public"."session_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_activity_log_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'viewed'::"text", 'edited'::"text", 'status_changed'::"text", 'materials_uploaded'::"text", 'materials_deleted'::"text", 'report_filed'::"text", 'report_updated'::"text", 'attendance_recorded'::"text", 'attendance_updated'::"text", 'communication_added'::"text", 'edit_requested'::"text", 'edit_approved'::"text", 'edit_rejected'::"text", 'cancelled'::"text", 'finalized'::"text"])))
);


ALTER TABLE "public"."session_activity_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_activity_log" IS 'Audit trail for all session actions';



CREATE TABLE IF NOT EXISTS "public"."session_attendees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expected" boolean DEFAULT true NOT NULL,
    "attended" boolean,
    "marked_by" "uuid",
    "marked_at" timestamp with time zone,
    "arrival_status" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_attendees_arrival_status_check" CHECK (("arrival_status" = ANY (ARRAY['on_time'::"text", 'late'::"text", 'left_early'::"text"])))
);


ALTER TABLE "public"."session_attendees" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_attendees" IS 'Tracks expected and actual attendance for each session';



CREATE TABLE IF NOT EXISTS "public"."session_communications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "visibility" "text" DEFAULT 'all_participants'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_communications_visibility_check" CHECK (("visibility" = ANY (ARRAY['facilitators_only'::"text", 'all_participants'::"text"])))
);


ALTER TABLE "public"."session_communications" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_communications" IS 'Session-specific communications and announcements';



CREATE TABLE IF NOT EXISTS "public"."session_edit_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "changes" "jsonb" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_edit_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."session_edit_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_edit_requests" IS 'Consultant requests for structural session edits (requires admin approval)';



CREATE TABLE IF NOT EXISTS "public"."session_facilitators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "facilitator_role" "text" NOT NULL,
    "is_lead" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_facilitators_facilitator_role_check" CHECK (("facilitator_role" = ANY (ARRAY['consultor_externo'::"text", 'equipo_interno'::"text"])))
);


ALTER TABLE "public"."session_facilitators" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_facilitators" IS 'Tracks which consultants/staff are assigned to each session';



CREATE TABLE IF NOT EXISTS "public"."session_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "description" "text",
    "visibility" "text" DEFAULT 'all_participants'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_materials_visibility_check" CHECK (("visibility" = ANY (ARRAY['facilitators_only'::"text", 'all_participants'::"text"])))
);


ALTER TABLE "public"."session_materials" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_materials" IS 'Materials uploaded for sessions (slides, handouts, etc.)';



CREATE TABLE IF NOT EXISTS "public"."session_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "error_message" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_notifications_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'email'::"text"]))),
    CONSTRAINT "session_notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['session_created'::"text", 'session_reminder_1w'::"text", 'session_reminder_2d'::"text", 'session_reminder_30m'::"text", 'session_reminder_24h'::"text", 'session_reminder_1h'::"text", 'session_rescheduled'::"text", 'session_cancelled'::"text", 'materials_uploaded'::"text", 'report_shared'::"text", 'edit_request_pending'::"text", 'edit_request_resolved'::"text", 'report_overdue'::"text"]))),
    CONSTRAINT "session_notifications_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."session_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_notifications" IS 'Scheduled notifications for session events (in-app and email)';



COMMENT ON CONSTRAINT "session_notifications_notification_type_check" ON "public"."session_notifications" IS 'Allowed notification types for session notifications. Extended 2026-02-12 to include session_reminder_24h and session_reminder_1h for the cron-based reminder system.';



CREATE TABLE IF NOT EXISTS "public"."session_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "audio_url" "text",
    "transcript" "text",
    "visibility" "text" DEFAULT 'facilitators_only'::"text" NOT NULL,
    "report_type" "text" DEFAULT 'session_report'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['session_report'::"text", 'planning_notes'::"text"]))),
    CONSTRAINT "session_reports_visibility_check" CHECK (("visibility" = ANY (ARRAY['facilitators_only'::"text", 'all_participants'::"text"])))
);


ALTER TABLE "public"."session_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."session_reports" IS 'Post-session reports and planning notes';



CREATE TABLE IF NOT EXISTS "public"."student_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid",
    "question_id" "uuid",
    "answer_id" "uuid",
    "is_correct" boolean,
    "answered_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid",
    "user_id" "uuid",
    "submission_url" "text",
    "notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."superadmins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid",
    "reason" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."superadmins" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."superadmins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supervisor_auditorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supervisor_id" "uuid" NOT NULL,
    "accion" character varying(255) NOT NULL,
    "red_id" "uuid",
    "school_id" bigint,
    "detalles" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."supervisor_auditorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text" NOT NULL,
    "version" character varying(50),
    "features" "jsonb" DEFAULT '[]'::"jsonb",
    "importance" character varying(20) DEFAULT 'low'::character varying,
    "target_users" character varying(50) DEFAULT 'all'::character varying,
    "published_by" "uuid",
    "published_at" timestamp with time zone DEFAULT "now"(),
    "is_published" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "system_updates_importance_check" CHECK ((("importance")::"text" = ANY (ARRAY[('low'::character varying)::"text", ('normal'::character varying)::"text", ('high'::character varying)::"text"])))
);


ALTER TABLE "public"."system_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_mode_state" (
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false,
    "test_run_id" "uuid",
    "enabled_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "request_count" integer DEFAULT 0,
    "last_request_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."test_mode_state" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_mode_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tractor_signups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'lideres_generacion_tractor'::"text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "email_normalized" "text" NOT NULL,
    "school_id" integer NOT NULL,
    "birth_date" "date" NOT NULL,
    "profession" "text" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "consent_accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "linked_user_id" "uuid",
    "granted_by" "uuid",
    "granted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tractor_signups_birth_date_check" CHECK ((("birth_date" >= '1900-01-01'::"date") AND ("birth_date" <= CURRENT_DATE))),
    CONSTRAINT "tractor_signups_email_normalized_check" CHECK ((("email_normalized" = "lower"("btrim"("email"))) AND ("email_normalized" <> ''::"text"))),
    CONSTRAINT "tractor_signups_role_check" CHECK (("role" = ANY (ARRAY['docente'::"text", 'equipo_directivo'::"text"]))),
    CONSTRAINT "tractor_signups_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'granted'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."tractor_signups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transformation_access_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "growth_community_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "affected_assessment_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "assessment_count" integer DEFAULT 0,
    "notes" "text",
    CONSTRAINT "transformation_access_audit_log_action_check" CHECK (("action" = ANY (ARRAY['assigned'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."transformation_access_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."transformation_access_audit_log" IS '📋 Audit log para rastrear asignaciones/revocaciones de acceso y los assessments afectados. Crítico para soporte: permite rastrear exactamente qué assessments fueron archivados y cuándo.';



CREATE TABLE IF NOT EXISTS "public"."transformation_assessment_collaborators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assessment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'collaborator'::"text" NOT NULL,
    "can_edit" boolean DEFAULT true NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "added_by" "uuid",
    CONSTRAINT "transformation_assessment_collaborators_role_check" CHECK (("role" = ANY (ARRAY['creator'::"text", 'collaborator'::"text"])))
);


ALTER TABLE "public"."transformation_assessment_collaborators" OWNER TO "postgres";


COMMENT ON TABLE "public"."transformation_assessment_collaborators" IS 'Junction table linking users to transformation assessments they collaborate on';



COMMENT ON COLUMN "public"."transformation_assessment_collaborators"."role" IS 'Role in the assessment: creator (original author) or collaborator (added later)';



COMMENT ON COLUMN "public"."transformation_assessment_collaborators"."can_edit" IS 'Whether this user can edit the assessment (all collaborators can edit by default)';



CREATE TABLE IF NOT EXISTS "public"."transformation_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "growth_community_id" "uuid",
    "area" "text" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "context_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "completed_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "school_id" integer,
    "grades" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "transformation_assessments_status_check" CHECK (("status" = ANY (ARRAY['in_progress'::"text", 'completed'::"text", 'archived'::"text"]))),
    CONSTRAINT "valid_transformation_area" CHECK (("area" = ANY (ARRAY['personalizacion'::"text", 'aprendizaje'::"text", 'evaluacion'::"text"])))
);


ALTER TABLE "public"."transformation_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transformation_conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assessment_id" "uuid" NOT NULL,
    "rubric_item_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "transformation_conversation_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."transformation_conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transformation_llm_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "assessment_id" "uuid" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."transformation_llm_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transformation_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assessment_id" "uuid" NOT NULL,
    "rubric_item_id" "uuid" NOT NULL,
    "determined_level" integer NOT NULL,
    "rationale" "text",
    "determined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "transformation_results_determined_level_check" CHECK ((("determined_level" >= 1) AND ("determined_level" <= 4)))
);


ALTER TABLE "public"."transformation_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transformation_rubric" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "area" "text" NOT NULL,
    "objective_number" integer NOT NULL,
    "objective_text" "text" NOT NULL,
    "action_number" integer NOT NULL,
    "action_text" "text" NOT NULL,
    "dimension" "text" NOT NULL,
    "level_1_descriptor" "text" NOT NULL,
    "level_2_descriptor" "text" NOT NULL,
    "level_3_descriptor" "text" NOT NULL,
    "level_4_descriptor" "text" NOT NULL,
    "initial_questions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "transformation_rubric_dimension_check" CHECK (("dimension" = ANY (ARRAY['cobertura'::"text", 'frecuencia'::"text", 'profundidad'::"text"])))
);


ALTER TABLE "public"."transformation_rubric" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."upcoming_courses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "instructor_id" "uuid",
    "thumbnail_url" character varying(500),
    "estimated_release_date" "date",
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."upcoming_courses" OWNER TO "postgres";


COMMENT ON TABLE "public"."upcoming_courses" IS 'Stores upcoming/coming soon courses for dashboard preview. Managed by admins.';



COMMENT ON COLUMN "public"."upcoming_courses"."estimated_release_date" IS 'Estimated date when the course will be available.';



COMMENT ON COLUMN "public"."upcoming_courses"."display_order" IS 'Order for displaying courses. Lower numbers appear first.';



CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "badge_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "earned_at" timestamp with time zone DEFAULT "now"(),
    "displayed_in_community" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_badges_with_details" AS
 SELECT "ub"."id",
    "ub"."user_id",
    "ub"."badge_id",
    "ub"."course_id",
    "ub"."earned_at",
    "ub"."displayed_in_community",
    "ub"."metadata",
    "b"."name" AS "badge_name",
    "b"."description" AS "badge_description",
    "b"."badge_type",
    "b"."icon_name",
    "b"."color_primary",
    "b"."color_secondary",
    "b"."points_value",
    "c"."title" AS "course_title",
    "c"."thumbnail_url" AS "course_thumbnail"
   FROM (("public"."user_badges" "ub"
     JOIN "public"."badges" "b" ON (("b"."id" = "ub"."badge_id")))
     LEFT JOIN "public"."courses" "c" ON (("c"."id" = "ub"."course_id")))
  WHERE ("b"."is_active" = true);


ALTER TABLE "public"."user_badges_with_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "mentioned_user_id" "uuid",
    "context" character varying(255) NOT NULL,
    "discussion_id" "uuid",
    "content" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "notification_type" character varying(50),
    "email_enabled" boolean DEFAULT true,
    "in_app_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type_id" character varying,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "related_url" character varying(500),
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "read_at" timestamp with time zone,
    "category" character varying(50) DEFAULT 'general'::character varying,
    "importance" character varying(20) DEFAULT 'normal'::character varying,
    "idempotency_key" character varying(255),
    CONSTRAINT "user_notifications_importance_check" CHECK ((("importance")::"text" = ANY (ARRAY[('low'::character varying)::"text", ('normal'::character varying)::"text", ('high'::character varying)::"text"])))
);


ALTER TABLE "public"."user_notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_notifications"."idempotency_key" IS 'Unique key to prevent duplicate notifications. Generated from event type, event ID, user ID, and timestamp (truncated to minute).';



CREATE TABLE IF NOT EXISTS "public"."user_onboarding_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tours_completed" "jsonb" DEFAULT '{}'::"jsonb",
    "tours_skipped" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_onboarding_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "block_id" "uuid",
    "is_completed" boolean DEFAULT false,
    "completion_date" timestamp with time zone,
    "time_spent_seconds" integer DEFAULT 0,
    "interaction_count" integer DEFAULT 0,
    "last_interaction" timestamp with time zone DEFAULT "now"(),
    "score" numeric(5,2),
    "max_score" numeric(5,2),
    "attempts" integer DEFAULT 0,
    "progress_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_attempts" CHECK (("attempts" >= 0)),
    CONSTRAINT "valid_score" CHECK ((("score" IS NULL) OR (("score" >= (0)::numeric) AND ("score" <= (100)::numeric)))),
    CONSTRAINT "valid_time_spent" CHECK (("time_spent_seconds" >= 0))
);


ALTER TABLE "public"."user_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_type" "public"."user_role_type" NOT NULL,
    "school_id" integer,
    "generation_id" "uuid",
    "community_id" "uuid",
    "is_active" boolean DEFAULT true,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "assigned_by" "uuid",
    "reporting_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "feedback_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "red_id" "uuid"
);

ALTER TABLE ONLY "public"."user_roles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_roles"."red_id" IS 'Network assignment for supervisor_de_red role (links to redes_de_colegios)';



CREATE MATERIALIZED VIEW "public"."user_roles_cache" AS
 SELECT "ur"."user_id",
    "ur"."role_type" AS "role",
    "ur"."school_id",
    "ur"."generation_id",
    "ur"."community_id",
    "p"."approval_status",
        CASE
            WHEN ("ur"."role_type" = 'admin'::"public"."user_role_type") THEN true
            ELSE false
        END AS "is_admin",
        CASE
            WHEN ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) THEN true
            ELSE false
        END AS "is_teacher",
    "now"() AS "cached_at"
   FROM ("public"."user_roles" "ur"
     JOIN "public"."profiles" "p" ON (("ur"."user_id" = "p"."id")))
  WHERE (("ur"."is_active" = true) AND ("p"."approval_status" = 'approved'::"text"))
  WITH NO DATA;


ALTER TABLE "public"."user_roles_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "activity_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workspace_activities" OWNER TO "postgres";


COMMENT ON TABLE "public"."workspace_activities" IS 'Activity log for workspace events and user interactions';



CREATE TABLE IF NOT EXISTS "public"."workspace_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "recipient_id" "uuid",
    "content" "text" NOT NULL,
    "subject" character varying(255),
    "thread_id" "uuid",
    "context" character varying(100) DEFAULT 'direct_message'::character varying,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "notification_sent" boolean DEFAULT false,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workspace_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ab_grades" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ab_grades_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ab_migration_plan" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ab_migration_plan_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."feriados_chile" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."feriados_chile_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."propuesta_rate_limits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."propuesta_rate_limits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."schools" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."schools_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ab_grades"
    ADD CONSTRAINT "ab_grades_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ab_grades"
    ADD CONSTRAINT "ab_grades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ab_grades"
    ADD CONSTRAINT "ab_grades_sort_order_key" UNIQUE ("sort_order");



ALTER TABLE ONLY "public"."ab_migration_plan"
    ADD CONSTRAINT "ab_migration_plan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ab_migration_plan"
    ADD CONSTRAINT "ab_migration_plan_school_id_year_number_grade_id_key" UNIQUE ("school_id", "year_number", "grade_id");



ALTER TABLE ONLY "public"."activity_aggregations"
    ADD CONSTRAINT "activity_aggregations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_aggregations"
    ADD CONSTRAINT "activity_aggregations_workspace_id_aggregation_date_aggrega_key" UNIQUE ("workspace_id", "aggregation_date", "aggregation_type");



ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_subscriptions"
    ADD CONSTRAINT "activity_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_subscriptions"
    ADD CONSTRAINT "activity_subscriptions_user_id_workspace_id_key" UNIQUE ("user_id", "workspace_id");



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_actions"
    ADD CONSTRAINT "assessment_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_areas"
    ADD CONSTRAINT "assessment_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_assignments"
    ADD CONSTRAINT "assessment_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_assignments"
    ADD CONSTRAINT "assessment_assignments_template_id_school_id_generation_id_key" UNIQUE ("template_id", "school_id", "generation_id");



ALTER TABLE ONLY "public"."assessment_context_questions"
    ADD CONSTRAINT "assessment_context_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_demo_access"
    ADD CONSTRAINT "assessment_demo_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_demo_access"
    ADD CONSTRAINT "assessment_demo_access_template_id_user_id_key" UNIQUE ("template_id", "user_id");



ALTER TABLE ONLY "public"."assessment_dimensions"
    ADD CONSTRAINT "assessment_dimensions_action_id_dimension_type_key" UNIQUE ("action_id", "dimension_type");



ALTER TABLE ONLY "public"."assessment_dimensions"
    ADD CONSTRAINT "assessment_dimensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_entity_year_weights"
    ADD CONSTRAINT "assessment_entity_year_weight_template_id_entity_type_entit_key" UNIQUE ("template_id", "entity_type", "entity_id", "year");



ALTER TABLE ONLY "public"."assessment_entity_year_weights"
    ADD CONSTRAINT "assessment_entity_year_weights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_evaluation_cache"
    ADD CONSTRAINT "assessment_evaluation_cache_cache_key_key" UNIQUE ("cache_key");



ALTER TABLE ONLY "public"."assessment_evaluation_cache"
    ADD CONSTRAINT "assessment_evaluation_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_indicators"
    ADD CONSTRAINT "assessment_indicators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_instance_assignees"
    ADD CONSTRAINT "assessment_instance_assignees_instance_id_user_id_key" UNIQUE ("instance_id", "user_id");



ALTER TABLE ONLY "public"."assessment_instance_assignees"
    ADD CONSTRAINT "assessment_instance_assignees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_instance_results"
    ADD CONSTRAINT "assessment_instance_results_instance_id_key" UNIQUE ("instance_id");



ALTER TABLE ONLY "public"."assessment_instance_results"
    ADD CONSTRAINT "assessment_instance_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_instances"
    ADD CONSTRAINT "assessment_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_llm_usage"
    ADD CONSTRAINT "assessment_llm_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_modules"
    ADD CONSTRAINT "assessment_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_objectives"
    ADD CONSTRAINT "assessment_objectives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_questions"
    ADD CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_responses"
    ADD CONSTRAINT "assessment_responses_instance_id_indicator_id_key" UNIQUE ("instance_id", "indicator_id");



ALTER TABLE ONLY "public"."assessment_responses"
    ADD CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_results"
    ADD CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_results"
    ADD CONSTRAINT "assessment_results_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."assessment_sections"
    ADD CONSTRAINT "assessment_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_sub_questions"
    ADD CONSTRAINT "assessment_sub_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_submissions"
    ADD CONSTRAINT "assessment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_template_snapshots"
    ADD CONSTRAINT "assessment_template_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_template_snapshots"
    ADD CONSTRAINT "assessment_template_snapshots_template_id_version_key" UNIQUE ("template_id", "version");



ALTER TABLE ONLY "public"."assessment_templates"
    ADD CONSTRAINT "assessment_templates_area_grade_version_key" UNIQUE ("area", "grade_id", "version");



ALTER TABLE ONLY "public"."assessment_templates"
    ADD CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessment_year_expectations"
    ADD CONSTRAINT "assessment_year_expectations_template_indicator_gen_unique" UNIQUE ("template_id", "indicator_id", "generation_type");



ALTER TABLE ONLY "public"."assignment_audit_log"
    ADD CONSTRAINT "assignment_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_feedback"
    ADD CONSTRAINT "assignment_feedback_assignment_id_student_id_key" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."assignment_feedback"
    ADD CONSTRAINT "assignment_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_submission_shares"
    ADD CONSTRAINT "assignment_submission_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_submission_shares"
    ADD CONSTRAINT "assignment_submission_shares_source_submission_id_shared_wi_key" UNIQUE ("source_submission_id", "shared_with_user_id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_templates"
    ADD CONSTRAINT "assignment_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_identities"
    ADD CONSTRAINT "bot_identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_identities"
    ADD CONSTRAINT "bot_identities_platform_platform_user_id_key" UNIQUE ("platform", "platform_user_id");



ALTER TABLE ONLY "public"."bot_link_codes"
    ADD CONSTRAINT "bot_link_codes_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."bot_pending_items"
    ADD CONSTRAINT "bot_pending_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_processed_updates"
    ADD CONSTRAINT "bot_processed_updates_pkey" PRIMARY KEY ("platform", "update_id");



ALTER TABLE ONLY "public"."bot_sessions"
    ADD CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_sessions"
    ADD CONSTRAINT "bot_sessions_platform_chat_id_key" UNIQUE ("platform", "chat_id");



ALTER TABLE ONLY "public"."church_about_sections"
    ADD CONSTRAINT "church_about_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_accounts"
    ADD CONSTRAINT "church_accounts_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."church_accounts"
    ADD CONSTRAINT "church_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_contact_info"
    ADD CONSTRAINT "church_contact_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_events"
    ADD CONSTRAINT "church_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_hero_sections"
    ADD CONSTRAINT "church_hero_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_invitations"
    ADD CONSTRAINT "church_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_invitations"
    ADD CONSTRAINT "church_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."church_meditation_favorites"
    ADD CONSTRAINT "church_meditation_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_meditation_favorites"
    ADD CONSTRAINT "church_meditation_favorites_user_id_session_id_key" UNIQUE ("user_id", "session_id");



ALTER TABLE ONLY "public"."church_meditation_preferences"
    ADD CONSTRAINT "church_meditation_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_meditation_preferences"
    ADD CONSTRAINT "church_meditation_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."church_meditation_recommendations"
    ADD CONSTRAINT "church_meditation_recommendat_user_id_emotion_time_of_day_d_key" UNIQUE ("user_id", "emotion", "time_of_day", "day_of_week");



ALTER TABLE ONLY "public"."church_meditation_recommendations"
    ADD CONSTRAINT "church_meditation_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_meditation_sessions"
    ADD CONSTRAINT "church_meditation_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_meditation_streaks"
    ADD CONSTRAINT "church_meditation_streaks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_meditation_streaks"
    ADD CONSTRAINT "church_meditation_streaks_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."church_organizations"
    ADD CONSTRAINT "church_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_organizations"
    ADD CONSTRAINT "church_organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."church_prayer_requests"
    ADD CONSTRAINT "church_prayer_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_presentation_templates"
    ADD CONSTRAINT "church_presentation_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_profiles"
    ADD CONSTRAINT "church_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_schedules"
    ADD CONSTRAINT "church_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_sermons"
    ADD CONSTRAINT "church_sermons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_services"
    ADD CONSTRAINT "church_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_songs"
    ADD CONSTRAINT "church_songs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_team_members"
    ADD CONSTRAINT "church_team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_transaction_lines"
    ADD CONSTRAINT "church_transaction_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_transactions"
    ADD CONSTRAINT "church_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."church_website_settings"
    ADD CONSTRAINT "church_website_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_rut_key" UNIQUE ("rut");



ALTER TABLE ONLY "public"."codebase_index"
    ADD CONSTRAINT "codebase_index_feature_area_route_key" UNIQUE ("feature_area", "route");



ALTER TABLE ONLY "public"."codebase_index"
    ADD CONSTRAINT "codebase_index_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_documents"
    ADD CONSTRAINT "community_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_messages"
    ADD CONSTRAINT "community_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_workspaces"
    ADD CONSTRAINT "community_workspaces_community_id_key" UNIQUE ("community_id");



ALTER TABLE ONLY "public"."community_workspaces"
    ADD CONSTRAINT "community_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultant_rates"
    ADD CONSTRAINT "consultant_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."context_general_questions"
    ADD CONSTRAINT "context_general_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."context_general_questions"
    ADD CONSTRAINT "context_general_questions_question_key_key" UNIQUE ("question_key");



ALTER TABLE ONLY "public"."context_general_responses"
    ADD CONSTRAINT "context_general_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."context_general_responses"
    ADD CONSTRAINT "context_general_responses_school_id_question_id_key" UNIQUE ("school_id", "question_id");



ALTER TABLE ONLY "public"."contract_extraction_feedback"
    ADD CONSTRAINT "contract_extraction_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_hour_allocations"
    ADD CONSTRAINT "contract_hour_allocations_contrato_id_hour_type_id_key" UNIQUE ("contrato_id", "hour_type_id");



ALTER TABLE ONLY "public"."contract_hour_allocations"
    ADD CONSTRAINT "contract_hour_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_hour_reallocation_log"
    ADD CONSTRAINT "contract_hour_reallocation_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_hours_ledger"
    ADD CONSTRAINT "contract_hours_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_numero_contrato_key" UNIQUE ("numero_contrato");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_course_id_teacher_id_key" UNIQUE ("course_id", "teacher_id");



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_completions"
    ADD CONSTRAINT "course_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_completions"
    ADD CONSTRAINT "course_completions_user_id_course_id_completion_type_module_key" UNIQUE ("user_id", "course_id", "completion_type", "module_id");



ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_proposals"
    ADD CONSTRAINT "course_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuotas"
    ADD CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debug_bugs"
    ADD CONSTRAINT "debug_bugs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debug_logs"
    ADD CONSTRAINT "debug_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debug_sessions"
    ADD CONSTRAINT "debug_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_blocks"
    ADD CONSTRAINT "deleted_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_courses"
    ADD CONSTRAINT "deleted_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_lessons"
    ADD CONSTRAINT "deleted_lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_modules"
    ADD CONSTRAINT "deleted_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dev_audit_log"
    ADD CONSTRAINT "dev_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_session_token_key" UNIQUE ("session_token");



ALTER TABLE ONLY "public"."dev_users"
    ADD CONSTRAINT "dev_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dev_users"
    ADD CONSTRAINT "dev_users_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."document_access_log"
    ADD CONSTRAINT "document_access_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exec_sql_audit_log"
    ADD CONSTRAINT "exec_sql_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_report_access"
    ADD CONSTRAINT "expense_report_access_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."expense_reports"
    ADD CONSTRAINT "expense_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_activity"
    ADD CONSTRAINT "feedback_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_permissions"
    ADD CONSTRAINT "feedback_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_permissions"
    ADD CONSTRAINT "feedback_permissions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."feriados_chile"
    ADD CONSTRAINT "feriados_chile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fx_rates"
    ADD CONSTRAINT "fx_rates_from_currency_to_currency_fetched_at_key" UNIQUE ("from_currency", "to_currency", "fetched_at");



ALTER TABLE ONLY "public"."fx_rates"
    ADD CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_assignment_discussions"
    ADD CONSTRAINT "group_assignment_discussions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_assignment_groups"
    ADD CONSTRAINT "group_assignment_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_assignment_members"
    ADD CONSTRAINT "group_assignment_members_assignment_id_user_id_key" UNIQUE ("assignment_id", "user_id");



ALTER TABLE ONLY "public"."group_assignment_members"
    ADD CONSTRAINT "group_assignment_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_assignment_settings"
    ADD CONSTRAINT "group_assignment_settings_assignment_id_key" UNIQUE ("assignment_id");



ALTER TABLE ONLY "public"."group_assignment_settings"
    ADD CONSTRAINT "group_assignment_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_assignment_submissions"
    ADD CONSTRAINT "group_assignment_submissions_assignment_id_user_id_key" UNIQUE ("assignment_id", "user_id");



ALTER TABLE ONLY "public"."group_assignment_submissions"
    ADD CONSTRAINT "group_assignment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_communities"
    ADD CONSTRAINT "growth_communities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_community_transformation_access"
    ADD CONSTRAINT "growth_community_transformation_access_growth_community_id_key" UNIQUE ("growth_community_id");



ALTER TABLE ONLY "public"."growth_community_transformation_access"
    ADD CONSTRAINT "growth_community_transformation_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hour_types"
    ADD CONSTRAINT "hour_types_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."hour_types"
    ADD CONSTRAINT "hour_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructors"
    ADD CONSTRAINT "instructors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "learning_path_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "learning_path_assignments_unique_group_path" UNIQUE ("group_id", "path_id");



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "learning_path_assignments_unique_user_path" UNIQUE ("user_id", "path_id");



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "learning_path_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_paths"
    ADD CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_assignment_id_student_id_atte_key" UNIQUE ("assignment_id", "student_id", "attempt_number");



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_assignments"
    ADD CONSTRAINT "lesson_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_completion_summary"
    ADD CONSTRAINT "lesson_completion_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_user_lesson_block_unique" UNIQUE ("user_id", "lesson_id", "block_id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitacion_ates"
    ADD CONSTRAINT "licitacion_ates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitacion_comision"
    ADD CONSTRAINT "licitacion_comision_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitacion_consultas"
    ADD CONSTRAINT "licitacion_consultas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitacion_documentos"
    ADD CONSTRAINT "licitacion_documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitacion_evaluaciones"
    ADD CONSTRAINT "licitacion_evaluaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitacion_historial"
    ADD CONSTRAINT "licitacion_historial_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licitaciones"
    ADD CONSTRAINT "licitaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_agreements"
    ADD CONSTRAINT "meeting_agreements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_attachments"
    ADD CONSTRAINT "meeting_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_meeting_id_user_id_key" UNIQUE ("meeting_id", "user_id");



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_commitments"
    ADD CONSTRAINT "meeting_commitments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_tasks"
    ADD CONSTRAINT "meeting_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_work_sessions"
    ADD CONSTRAINT "meeting_work_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_permissions"
    ADD CONSTRAINT "menu_permissions_pkey" PRIMARY KEY ("role_type", "menu_item_id");



ALTER TABLE ONLY "public"."message_activity_log"
    ADD CONSTRAINT "message_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_mentions"
    ADD CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_reaction_type_key" UNIQUE ("message_id", "user_id", "reaction_type");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metadata_sync_log"
    ADD CONSTRAINT "metadata_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."consultant_rates"
    ADD CONSTRAINT "no_overlapping_rates" EXCLUDE USING "gist" ("consultant_id" WITH =, "hour_type_id" WITH =, "daterange"("effective_from", COALESCE("effective_to", '9999-12-31'::"date"), '[)'::"text") WITH &&);



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_triggers"
    ADD CONSTRAINT "notification_triggers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_types"
    ADD CONSTRAINT "notification_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pasantias_programs"
    ADD CONSTRAINT "pasantias_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pasantias_quote_groups"
    ADD CONSTRAINT "pasantias_quote_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pasantias_quotes"
    ADD CONSTRAINT "pasantias_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pasantias_quotes"
    ADD CONSTRAINT "pasantias_quotes_quote_number_key" UNIQUE ("quote_number");



ALTER TABLE ONLY "public"."permission_audit_log"
    ADD CONSTRAINT "permission_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_feedback"
    ADD CONSTRAINT "platform_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_hashtags"
    ADD CONSTRAINT "post_hashtags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_hashtags"
    ADD CONSTRAINT "post_hashtags_post_id_hashtag_key" UNIQUE ("post_id", "hashtag");



ALTER TABLE ONLY "public"."post_media"
    ADD CONSTRAINT "post_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_post_id_mentioned_user_id_key" UNIQUE ("post_id", "mentioned_user_id");



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_enrollments"
    ADD CONSTRAINT "program_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_hours_ledger"
    ADD CONSTRAINT "program_hours_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_hours_ledger"
    ADD CONSTRAINT "program_hours_ledger_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."programa_bases_templates"
    ADD CONSTRAINT "programa_bases_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programa_evaluacion_criterios"
    ADD CONSTRAINT "programa_evaluacion_criterios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programas"
    ADD CONSTRAINT "programas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_consultores"
    ADD CONSTRAINT "propuesta_consultores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_contenido_bloques"
    ADD CONSTRAINT "propuesta_contenido_bloques_clave_key" UNIQUE ("clave");



ALTER TABLE ONLY "public"."propuesta_contenido_bloques"
    ADD CONSTRAINT "propuesta_contenido_bloques_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_documentos_biblioteca"
    ADD CONSTRAINT "propuesta_documentos_biblioteca_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_fichas_servicio"
    ADD CONSTRAINT "propuesta_fichas_servicio_folio_key" UNIQUE ("folio");



ALTER TABLE ONLY "public"."propuesta_fichas_servicio"
    ADD CONSTRAINT "propuesta_fichas_servicio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "propuesta_generadas_access_code_key" UNIQUE ("access_code");



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "propuesta_generadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "propuesta_generadas_web_slug_key" UNIQUE ("web_slug");



ALTER TABLE ONLY "public"."propuesta_plantillas"
    ADD CONSTRAINT "propuesta_plantillas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propuesta_rate_limits"
    ADD CONSTRAINT "propuesta_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."qa_coverage_reports"
    ADD CONSTRAINT "qa_coverage_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_feature_checklist"
    ADD CONSTRAINT "qa_feature_checklist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_lighthouse_results"
    ADD CONSTRAINT "qa_lighthouse_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_load_test_results"
    ADD CONSTRAINT "qa_load_test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_performance_budgets"
    ADD CONSTRAINT "qa_performance_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_scenario_assignments"
    ADD CONSTRAINT "qa_scenario_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_scenario_assignments"
    ADD CONSTRAINT "qa_scenario_assignments_scenario_id_tester_id_key" UNIQUE ("scenario_id", "tester_id");



ALTER TABLE ONLY "public"."qa_scenarios"
    ADD CONSTRAINT "qa_scenarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_step_results"
    ADD CONSTRAINT "qa_step_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_test_runs"
    ADD CONSTRAINT "qa_test_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_tester_time_logs"
    ADD CONSTRAINT "qa_tester_time_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qa_tester_time_logs"
    ADD CONSTRAINT "qa_tester_time_logs_tester_id_date_key" UNIQUE ("tester_id", "date");



ALTER TABLE ONLY "public"."qa_web_vitals"
    ADD CONSTRAINT "qa_web_vitals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_lesson_id_block_id_student_id_attempt_numb_key" UNIQUE ("lesson_id", "block_id", "student_id", "attempt_number");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."red_escuelas"
    ADD CONSTRAINT "red_escuelas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."red_escuelas"
    ADD CONSTRAINT "red_escuelas_red_id_school_id_key" UNIQUE ("red_id", "school_id");



ALTER TABLE ONLY "public"."redes_de_colegios"
    ADD CONSTRAINT "redes_de_colegios_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."redes_de_colegios"
    ADD CONSTRAINT "redes_de_colegios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_data"
    ADD CONSTRAINT "roadmap_data_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."roadmap_data"
    ADD CONSTRAINT "roadmap_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permission_baseline"
    ADD CONSTRAINT "role_permission_baseline_pkey" PRIMARY KEY ("role_type", "permission_key");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_types"
    ADD CONSTRAINT "role_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_types"
    ADD CONSTRAINT "role_types_type_key" UNIQUE ("type");



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."school_change_history"
    ADD CONSTRAINT "school_change_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_course_docente_assignments"
    ADD CONSTRAINT "school_course_docente_assignm_course_structure_id_docente_i_key" UNIQUE ("course_structure_id", "docente_id");



ALTER TABLE ONLY "public"."school_course_docente_assignments"
    ADD CONSTRAINT "school_course_docente_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_course_structure"
    ADD CONSTRAINT "school_course_structure_context_id_grade_level_course_name_key" UNIQUE ("context_id", "grade_level", "course_name");



ALTER TABLE ONLY "public"."school_course_structure"
    ADD CONSTRAINT "school_course_structure_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_plan_completion_status"
    ADD CONSTRAINT "school_plan_completion_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_plan_completion_status"
    ADD CONSTRAINT "school_plan_completion_status_school_id_feature_key" UNIQUE ("school_id", "feature");



ALTER TABLE ONLY "public"."school_transversal_context"
    ADD CONSTRAINT "school_transversal_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_activity_log"
    ADD CONSTRAINT "session_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_session_id_user_id_key" UNIQUE ("session_id", "user_id");



ALTER TABLE ONLY "public"."session_communications"
    ADD CONSTRAINT "session_communications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_edit_requests"
    ADD CONSTRAINT "session_edit_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_facilitators"
    ADD CONSTRAINT "session_facilitators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_facilitators"
    ADD CONSTRAINT "session_facilitators_session_id_user_id_key" UNIQUE ("session_id", "user_id");



ALTER TABLE ONLY "public"."session_materials"
    ADD CONSTRAINT "session_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_notifications"
    ADD CONSTRAINT "session_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_reports"
    ADD CONSTRAINT "session_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."supervisor_auditorias"
    ADD CONSTRAINT "supervisor_auditorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_updates"
    ADD CONSTRAINT "system_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_mode_state"
    ADD CONSTRAINT "test_mode_state_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."tractor_signups"
    ADD CONSTRAINT "tractor_signups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_access_audit_log"
    ADD CONSTRAINT "transformation_access_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_assessment_collaborators"
    ADD CONSTRAINT "transformation_assessment_collaborato_assessment_id_user_id_key" UNIQUE ("assessment_id", "user_id");



ALTER TABLE ONLY "public"."transformation_assessment_collaborators"
    ADD CONSTRAINT "transformation_assessment_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_assessments"
    ADD CONSTRAINT "transformation_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_conversation_messages"
    ADD CONSTRAINT "transformation_conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_llm_usage"
    ADD CONSTRAINT "transformation_llm_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_results"
    ADD CONSTRAINT "transformation_results_assessment_id_rubric_item_id_key" UNIQUE ("assessment_id", "rubric_item_id");



ALTER TABLE ONLY "public"."transformation_results"
    ADD CONSTRAINT "transformation_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_rubric"
    ADD CONSTRAINT "transformation_rubric_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transformation_rubric"
    ADD CONSTRAINT "transformation_rubric_semantic_key" UNIQUE ("area", "objective_number", "action_number", "dimension");



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "unique_active_consultant_student" UNIQUE ("consultant_id", "student_id");



ALTER TABLE ONLY "public"."group_assignment_groups"
    ADD CONSTRAINT "unique_assignment_community" UNIQUE ("assignment_id", "community_id");



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "unique_course_prerequisite" UNIQUE ("course_id", "prerequisite_course_id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "unique_document_version" UNIQUE ("document_id", "version_number");



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "unique_notification_idempotency_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "unique_path_course" UNIQUE ("learning_path_id", "course_id");



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "unique_path_course_order" UNIQUE ("learning_path_id", "sequence_order");



ALTER TABLE ONLY "public"."contract_hours_ledger"
    ADD CONSTRAINT "unique_session_ledger" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "unique_submission_per_instance" UNIQUE ("instance_id", "user_id", "group_id");



ALTER TABLE ONLY "public"."assignment_templates"
    ADD CONSTRAINT "unique_template_per_block" UNIQUE ("lesson_id", "block_id");



ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "unique_user_course_enrollment" UNIQUE ("user_id", "course_id");



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "unique_user_lesson_block" UNIQUE ("user_id", "lesson_id", "block_id");



ALTER TABLE ONLY "public"."lesson_completion_summary"
    ADD CONSTRAINT "unique_user_lesson_summary" UNIQUE ("user_id", "lesson_id");



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "unique_version_per_licitacion" UNIQUE ("licitacion_id", "version");



ALTER TABLE ONLY "public"."upcoming_courses"
    ADD CONSTRAINT "upcoming_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_badge_id_course_id_key" UNIQUE ("user_id", "badge_id", "course_id");



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_notification_type_key" UNIQUE ("user_id", "notification_type");



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_onboarding_state"
    ADD CONSTRAINT "user_onboarding_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_onboarding_state"
    ADD CONSTRAINT "user_onboarding_state_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_activities"
    ADD CONSTRAINT "workspace_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_messages"
    ADD CONSTRAINT "workspace_messages_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "consultant_community_assignment_unique" ON "public"."consultant_assignments" USING "btree" ("consultant_id", "school_id", "generation_id", "community_id", "is_active") WHERE (("student_id" IS NULL) AND ("school_id" IS NOT NULL) AND ("generation_id" IS NOT NULL) AND ("community_id" IS NOT NULL) AND ("is_active" = true));



CREATE UNIQUE INDEX "consultant_generation_assignment_unique" ON "public"."consultant_assignments" USING "btree" ("consultant_id", "school_id", "generation_id", "is_active") WHERE (("student_id" IS NULL) AND ("community_id" IS NULL) AND ("school_id" IS NOT NULL) AND ("generation_id" IS NOT NULL) AND ("is_active" = true));



CREATE UNIQUE INDEX "consultant_individual_assignment_unique" ON "public"."consultant_assignments" USING "btree" ("consultant_id", "student_id", "is_active") WHERE (("student_id" IS NOT NULL) AND ("is_active" = true));



CREATE UNIQUE INDEX "consultant_school_assignment_unique" ON "public"."consultant_assignments" USING "btree" ("consultant_id", "school_id", "is_active") WHERE (("student_id" IS NULL) AND ("generation_id" IS NULL) AND ("community_id" IS NULL) AND ("school_id" IS NOT NULL) AND ("is_active" = true));



CREATE INDEX "group_assignment_groups_school_id_idx" ON "public"."group_assignment_groups" USING "btree" ("school_id");



CREATE INDEX "idx_activity_aggregations_date_type" ON "public"."activity_aggregations" USING "btree" ("aggregation_date", "aggregation_type");



CREATE INDEX "idx_activity_aggregations_workspace_date" ON "public"."activity_aggregations" USING "btree" ("workspace_id", "aggregation_date");



CREATE INDEX "idx_activity_feed_created" ON "public"."activity_feed" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_feed_entity" ON "public"."activity_feed" USING "btree" ("entity_type");



CREATE INDEX "idx_activity_feed_importance" ON "public"."activity_feed" USING "btree" ("importance_score");



CREATE INDEX "idx_activity_feed_public" ON "public"."activity_feed" USING "btree" ("is_public");



CREATE INDEX "idx_activity_feed_type" ON "public"."activity_feed" USING "btree" ("activity_type");



CREATE INDEX "idx_activity_feed_user" ON "public"."activity_feed" USING "btree" ("user_id");



CREATE INDEX "idx_activity_feed_workspace" ON "public"."activity_feed" USING "btree" ("workspace_id");



CREATE INDEX "idx_activity_feed_workspace_created" ON "public"."activity_feed" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "idx_activity_subscriptions_user_workspace" ON "public"."activity_subscriptions" USING "btree" ("user_id", "workspace_id");



CREATE INDEX "idx_activity_subscriptions_workspace" ON "public"."activity_subscriptions" USING "btree" ("workspace_id");



CREATE INDEX "idx_assessment_actions_objective" ON "public"."assessment_actions" USING "btree" ("objective_id");



CREATE INDEX "idx_assessment_actions_order" ON "public"."assessment_actions" USING "btree" ("objective_id", "display_order");



CREATE INDEX "idx_assessment_areas_order" ON "public"."assessment_areas" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_assessment_areas_template" ON "public"."assessment_areas" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_assignments_active" ON "public"."assessment_assignments" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_assessment_assignments_generation" ON "public"."assessment_assignments" USING "btree" ("generation_id");



CREATE INDEX "idx_assessment_assignments_school" ON "public"."assessment_assignments" USING "btree" ("school_id");



CREATE INDEX "idx_assessment_assignments_template" ON "public"."assessment_assignments" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_cache_expires" ON "public"."assessment_evaluation_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_assessment_cache_key" ON "public"."assessment_evaluation_cache" USING "btree" ("cache_key");



CREATE INDEX "idx_assessment_dimensions_action" ON "public"."assessment_dimensions" USING "btree" ("action_id");



CREATE INDEX "idx_assessment_instances_generation_type" ON "public"."assessment_instances" USING "btree" ("generation_type");



CREATE INDEX "idx_assessment_llm_usage_template" ON "public"."assessment_llm_usage" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_llm_usage_user" ON "public"."assessment_llm_usage" USING "btree" ("user_id", "created_at");



CREATE INDEX "idx_assessment_modules_objective_id" ON "public"."assessment_modules" USING "btree" ("objective_id");



CREATE INDEX "idx_assessment_objectives_display_order" ON "public"."assessment_objectives" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_assessment_objectives_template_id" ON "public"."assessment_objectives" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_questions_dimension" ON "public"."assessment_questions" USING "btree" ("dimension_id");



CREATE INDEX "idx_assessment_questions_order" ON "public"."assessment_questions" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_assessment_questions_section" ON "public"."assessment_questions" USING "btree" ("section_id");



CREATE INDEX "idx_assessment_questions_template" ON "public"."assessment_questions" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_results_submission" ON "public"."assessment_results" USING "btree" ("submission_id");



CREATE INDEX "idx_assessment_sections_order" ON "public"."assessment_sections" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_assessment_sections_template" ON "public"."assessment_sections" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_submissions_curso" ON "public"."assessment_submissions" USING "btree" ("curso");



CREATE INDEX "idx_assessment_submissions_nivel" ON "public"."assessment_submissions" USING "btree" ("nivel");



CREATE INDEX "idx_assessment_submissions_school" ON "public"."assessment_submissions" USING "btree" ("school_id");



CREATE INDEX "idx_assessment_submissions_started" ON "public"."assessment_submissions" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_assessment_submissions_status" ON "public"."assessment_submissions" USING "btree" ("status");



CREATE INDEX "idx_assessment_submissions_template" ON "public"."assessment_submissions" USING "btree" ("template_id");



CREATE INDEX "idx_assessment_submissions_user" ON "public"."assessment_submissions" USING "btree" ("user_id");



CREATE INDEX "idx_assessment_templates_grade_id" ON "public"."assessment_templates" USING "btree" ("grade_id");



CREATE INDEX "idx_assessment_templates_is_archived" ON "public"."assessment_templates" USING "btree" ("is_archived");



CREATE INDEX "idx_assignees_instance" ON "public"."assessment_instance_assignees" USING "btree" ("instance_id");



CREATE INDEX "idx_assignees_pending" ON "public"."assessment_instance_assignees" USING "btree" ("user_id", "has_submitted") WHERE ("has_submitted" = false);



CREATE INDEX "idx_assignees_user" ON "public"."assessment_instance_assignees" USING "btree" ("user_id");



CREATE INDEX "idx_assignment_feedback_assignment" ON "public"."assignment_feedback" USING "btree" ("assignment_id");



CREATE INDEX "idx_assignment_feedback_student" ON "public"."assignment_feedback" USING "btree" ("student_id");



CREATE INDEX "idx_assignment_instances_course" ON "public"."assignment_instances" USING "btree" ("course_id");



CREATE INDEX "idx_assignment_instances_status" ON "public"."assignment_instances" USING "btree" ("status");



CREATE INDEX "idx_assignment_instances_template" ON "public"."assignment_instances" USING "btree" ("template_id");



CREATE INDEX "idx_assignment_submissions_instance" ON "public"."assignment_submissions" USING "btree" ("instance_id");



CREATE INDEX "idx_assignment_submissions_user" ON "public"."assignment_submissions" USING "btree" ("user_id");



CREATE INDEX "idx_assignment_templates_lesson" ON "public"."assignment_templates" USING "btree" ("lesson_id");



CREATE INDEX "idx_audit_content" ON "public"."assignment_audit_log" USING "btree" ("content_type", "content_id", "performed_at" DESC);



CREATE INDEX "idx_audit_entity" ON "public"."assignment_audit_log" USING "btree" ("entity_type", "entity_id", "performed_at" DESC);



CREATE INDEX "idx_audit_log_action" ON "public"."permission_audit_log" USING "btree" ("action");



CREATE INDEX "idx_audit_log_created" ON "public"."permission_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_performed_by" ON "public"."permission_audit_log" USING "btree" ("performed_by");



CREATE INDEX "idx_audit_log_user" ON "public"."permission_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_audit_performed_at" ON "public"."assignment_audit_log" USING "btree" ("performed_at" DESC);



CREATE INDEX "idx_audit_performer" ON "public"."assignment_audit_log" USING "btree" ("performed_by", "performed_at" DESC);



CREATE INDEX "idx_badges_active" ON "public"."badges" USING "btree" ("is_active");



CREATE INDEX "idx_badges_type" ON "public"."badges" USING "btree" ("badge_type");



CREATE INDEX "idx_blocks_is_visible" ON "public"."blocks" USING "btree" ("is_visible");



CREATE INDEX "idx_blocks_lesson_id" ON "public"."blocks" USING "btree" ("lesson_id");



CREATE INDEX "idx_bot_identities_user_id" ON "public"."bot_identities" USING "btree" ("user_id");



CREATE INDEX "idx_bot_link_codes_user_id" ON "public"."bot_link_codes" USING "btree" ("user_id");



CREATE INDEX "idx_bot_pending_session" ON "public"."bot_pending_items" USING "btree" ("session_id", "status");



CREATE INDEX "idx_bot_processed_updates_processed_at" ON "public"."bot_processed_updates" USING "btree" ("processed_at");



CREATE INDEX "idx_ca_teacher_course" ON "public"."course_assignments" USING "btree" ("teacher_id", "course_id");



COMMENT ON INDEX "public"."idx_ca_teacher_course" IS 'Optimizes direct assignment detection by user';



CREATE INDEX "idx_ce_user_course" ON "public"."course_enrollments" USING "btree" ("user_id", "course_id");



COMMENT ON INDEX "public"."idx_ce_user_course" IS 'Optimizes enrollment lookups by user for Assignment Matrix';



CREATE INDEX "idx_cgq_active" ON "public"."context_general_questions" USING "btree" ("is_active", "display_order");



CREATE INDEX "idx_cgr_question" ON "public"."context_general_responses" USING "btree" ("question_id");



CREATE INDEX "idx_cgr_school" ON "public"."context_general_responses" USING "btree" ("school_id");



CREATE INDEX "idx_cha_adds_to" ON "public"."contract_hour_allocations" USING "btree" ("adds_to_allocation_id") WHERE ("adds_to_allocation_id" IS NOT NULL);



CREATE INDEX "idx_cha_contrato" ON "public"."contract_hour_allocations" USING "btree" ("contrato_id");



CREATE INDEX "idx_cha_hour_type" ON "public"."contract_hour_allocations" USING "btree" ("hour_type_id");



CREATE INDEX "idx_chl_allocation" ON "public"."contract_hours_ledger" USING "btree" ("allocation_id");



CREATE INDEX "idx_chl_session" ON "public"."contract_hours_ledger" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_chl_session_date" ON "public"."contract_hours_ledger" USING "btree" ("session_date");



CREATE INDEX "idx_chl_status" ON "public"."contract_hours_ledger" USING "btree" ("status");



CREATE INDEX "idx_chrl_contrato" ON "public"."contract_hour_reallocation_log" USING "btree" ("contrato_id");



CREATE INDEX "idx_church_about_organization" ON "public"."church_about_sections" USING "btree" ("organization_id");



CREATE INDEX "idx_church_accounts_organization" ON "public"."church_accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_church_contact_organization" ON "public"."church_contact_info" USING "btree" ("organization_id");



CREATE INDEX "idx_church_events_date" ON "public"."church_events" USING "btree" ("date");



CREATE INDEX "idx_church_events_organization" ON "public"."church_events" USING "btree" ("organization_id");



CREATE INDEX "idx_church_hero_organization" ON "public"."church_hero_sections" USING "btree" ("organization_id");



CREATE INDEX "idx_church_organizations_slug" ON "public"."church_organizations" USING "btree" ("slug");



CREATE INDEX "idx_church_prayer_requests_organization" ON "public"."church_prayer_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_church_profiles_organization" ON "public"."church_profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_church_schedules_organization" ON "public"."church_schedules" USING "btree" ("organization_id");



CREATE INDEX "idx_church_sermons_date" ON "public"."church_sermons" USING "btree" ("date");



CREATE INDEX "idx_church_sermons_organization" ON "public"."church_sermons" USING "btree" ("organization_id");



CREATE INDEX "idx_church_services_date" ON "public"."church_services" USING "btree" ("date");



CREATE INDEX "idx_church_services_organization" ON "public"."church_services" USING "btree" ("organization_id");



CREATE INDEX "idx_church_songs_organization" ON "public"."church_songs" USING "btree" ("organization_id");



CREATE INDEX "idx_church_team_organization" ON "public"."church_team_members" USING "btree" ("organization_id");



CREATE INDEX "idx_church_transactions_date" ON "public"."church_transactions" USING "btree" ("date");



CREATE INDEX "idx_church_transactions_organization" ON "public"."church_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_church_website_settings_organization" ON "public"."church_website_settings" USING "btree" ("organization_id");



CREATE INDEX "idx_clientes_email_administrativo" ON "public"."clientes" USING "btree" ("email_contacto_administrativo");



CREATE INDEX "idx_clientes_email_encargado" ON "public"."clientes" USING "btree" ("email_encargado_proyecto");



CREATE INDEX "idx_clientes_school_id" ON "public"."clientes" USING "btree" ("school_id");



CREATE INDEX "idx_codebase_index_feature_area" ON "public"."codebase_index" USING "btree" ("feature_area");



CREATE INDEX "idx_codebase_index_last_indexed" ON "public"."codebase_index" USING "btree" ("last_indexed");



CREATE INDEX "idx_community_documents_active" ON "public"."community_documents" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_community_documents_created_at" ON "public"."community_documents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_community_documents_file_name" ON "public"."community_documents" USING "btree" ("file_name");



CREATE INDEX "idx_community_documents_folder" ON "public"."community_documents" USING "btree" ("folder_id");



CREATE INDEX "idx_community_documents_tags" ON "public"."community_documents" USING "gin" ("tags");



CREATE INDEX "idx_community_documents_uploaded_by" ON "public"."community_documents" USING "btree" ("uploaded_by");



CREATE INDEX "idx_community_documents_workspace" ON "public"."community_documents" USING "btree" ("workspace_id");



CREATE INDEX "idx_community_meetings_created_by" ON "public"."community_meetings" USING "btree" ("created_by");



CREATE INDEX "idx_community_meetings_date" ON "public"."community_meetings" USING "btree" ("meeting_date");



CREATE INDEX "idx_community_meetings_finalized" ON "public"."community_meetings" USING "btree" ("finalized_at" DESC) WHERE ("finalized_at" IS NOT NULL);



CREATE INDEX "idx_community_meetings_is_active" ON "public"."community_meetings" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_community_meetings_status" ON "public"."community_meetings" USING "btree" ("status");



CREATE INDEX "idx_community_meetings_updated_by" ON "public"."community_meetings" USING "btree" ("updated_by");



CREATE INDEX "idx_community_meetings_workspace_id" ON "public"."community_meetings" USING "btree" ("workspace_id");



CREATE INDEX "idx_community_messages_reply_to" ON "public"."community_messages" USING "btree" ("reply_to_id");



CREATE INDEX "idx_community_posts_author" ON "public"."community_posts" USING "btree" ("author_id");



CREATE INDEX "idx_community_posts_created" ON "public"."community_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_community_posts_type" ON "public"."community_posts" USING "btree" ("type");



CREATE INDEX "idx_community_posts_workspace" ON "public"."community_posts" USING "btree" ("workspace_id");



CREATE INDEX "idx_community_workspaces_active" ON "public"."community_workspaces" USING "btree" ("is_active");



CREATE INDEX "idx_community_workspaces_community_id" ON "public"."community_workspaces" USING "btree" ("community_id");



CREATE INDEX "idx_consultant_assignments_active" ON "public"."consultant_assignments" USING "btree" ("is_active");



CREATE INDEX "idx_consultant_assignments_consultant" ON "public"."consultant_assignments" USING "btree" ("consultant_id");



CREATE INDEX "idx_consultant_assignments_school" ON "public"."consultant_assignments" USING "btree" ("school_id");



CREATE INDEX "idx_consultant_assignments_student" ON "public"."consultant_assignments" USING "btree" ("student_id");



CREATE INDEX "idx_consultor_sessions_created_by" ON "public"."consultor_sessions" USING "btree" ("created_by");



CREATE INDEX "idx_consultor_sessions_date" ON "public"."consultor_sessions" USING "btree" ("session_date");



CREATE INDEX "idx_consultor_sessions_gc" ON "public"."consultor_sessions" USING "btree" ("growth_community_id");



CREATE INDEX "idx_consultor_sessions_recurrence_group" ON "public"."consultor_sessions" USING "btree" ("recurrence_group_id");



CREATE INDEX "idx_consultor_sessions_school" ON "public"."consultor_sessions" USING "btree" ("school_id");



CREATE INDEX "idx_consultor_sessions_status" ON "public"."consultor_sessions" USING "btree" ("status");



CREATE INDEX "idx_context_questions_order" ON "public"."assessment_context_questions" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_context_questions_template" ON "public"."assessment_context_questions" USING "btree" ("template_id");



CREATE INDEX "idx_contratos_estado" ON "public"."contratos" USING "btree" ("estado");



CREATE INDEX "idx_contratos_is_anexo" ON "public"."contratos" USING "btree" ("is_anexo");



CREATE UNIQUE INDEX "idx_contratos_licitacion_id" ON "public"."contratos" USING "btree" ("licitacion_id") WHERE ("licitacion_id" IS NOT NULL);



CREATE INDEX "idx_contratos_numero_estado" ON "public"."contratos" USING "btree" ("numero_contrato", "estado");



CREATE INDEX "idx_contratos_parent_id" ON "public"."contratos" USING "btree" ("parent_contrato_id");



CREATE INDEX "idx_contratos_pdf_extracted" ON "public"."contratos" USING "btree" ("pdf_extracted");



CREATE INDEX "idx_course_assignments_course_id" ON "public"."course_assignments" USING "btree" ("course_id");



CREATE INDEX "idx_course_assignments_teacher_id" ON "public"."course_assignments" USING "btree" ("teacher_id");



CREATE INDEX "idx_course_assignments_teacher_role" ON "public"."course_assignments" USING "btree" ("teacher_id");



CREATE INDEX "idx_course_completions_user_course" ON "public"."course_completions" USING "btree" ("user_id", "course_id");



CREATE INDEX "idx_course_docente_active" ON "public"."school_course_docente_assignments" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_course_docente_course" ON "public"."school_course_docente_assignments" USING "btree" ("course_structure_id");



CREATE INDEX "idx_course_docente_docente" ON "public"."school_course_docente_assignments" USING "btree" ("docente_id");



CREATE INDEX "idx_course_enrollments_completion" ON "public"."course_enrollments" USING "btree" ("is_completed");



CREATE INDEX "idx_course_enrollments_course_id" ON "public"."course_enrollments" USING "btree" ("course_id");



CREATE INDEX "idx_course_enrollments_status" ON "public"."course_enrollments" USING "btree" ("status");



CREATE INDEX "idx_course_enrollments_updated_at" ON "public"."course_enrollments" USING "btree" ("updated_at");



CREATE INDEX "idx_course_enrollments_user_id" ON "public"."course_enrollments" USING "btree" ("user_id");



CREATE INDEX "idx_course_enrollments_user_stats" ON "public"."course_enrollments" USING "btree" ("user_id", "is_completed", "progress_percentage");



CREATE INDEX "idx_course_proposals_created_at" ON "public"."course_proposals" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_course_proposals_created_by" ON "public"."course_proposals" USING "btree" ("created_by");



CREATE INDEX "idx_course_structure_context" ON "public"."school_course_structure" USING "btree" ("context_id");



CREATE INDEX "idx_course_structure_school" ON "public"."school_course_structure" USING "btree" ("school_id");



CREATE INDEX "idx_courses_difficulty" ON "public"."courses" USING "btree" ("difficulty_level");



CREATE INDEX "idx_courses_structure_type" ON "public"."courses" USING "btree" ("structure_type");



CREATE INDEX "idx_cr_consultant" ON "public"."consultant_rates" USING "btree" ("consultant_id");



CREATE INDEX "idx_cr_effective" ON "public"."consultant_rates" USING "btree" ("effective_from", "effective_to");



CREATE INDEX "idx_cr_hour_type" ON "public"."consultant_rates" USING "btree" ("hour_type_id");



CREATE INDEX "idx_cw_community_id" ON "public"."community_workspaces" USING "btree" ("community_id");



CREATE INDEX "idx_cw_name_trgm" ON "public"."community_workspaces" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_debug_bugs_affected_files" ON "public"."debug_bugs" USING "gin" ("affected_files");



CREATE INDEX "idx_debug_bugs_category" ON "public"."debug_bugs" USING "btree" ("category");



CREATE INDEX "idx_debug_bugs_category_status" ON "public"."debug_bugs" USING "btree" ("category", "status");



CREATE INDEX "idx_debug_bugs_detected_by" ON "public"."debug_bugs" USING "btree" ("detected_by");



CREATE INDEX "idx_debug_bugs_environment" ON "public"."debug_bugs" USING "btree" ("environment");



CREATE INDEX "idx_debug_bugs_metadata" ON "public"."debug_bugs" USING "gin" ("metadata");



CREATE INDEX "idx_debug_bugs_related_roles" ON "public"."debug_bugs" USING "gin" ("related_roles");



CREATE INDEX "idx_debug_bugs_reported_at" ON "public"."debug_bugs" USING "btree" ("reported_at" DESC);



CREATE INDEX "idx_debug_bugs_search" ON "public"."debug_bugs" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text")) || ' '::"text") || COALESCE("error_message", ''::"text")) || ' '::"text") || COALESCE("solution", ''::"text"))));



CREATE INDEX "idx_debug_bugs_severity" ON "public"."debug_bugs" USING "btree" ("severity");



CREATE INDEX "idx_debug_bugs_status" ON "public"."debug_bugs" USING "btree" ("status");



CREATE INDEX "idx_debug_bugs_status_detected_by" ON "public"."debug_bugs" USING "btree" ("status", "detected_by");



CREATE INDEX "idx_debug_bugs_status_severity" ON "public"."debug_bugs" USING "btree" ("status", "severity");



CREATE INDEX "idx_debug_bugs_tags" ON "public"."debug_bugs" USING "gin" ("tags");



CREATE INDEX "idx_debug_bugs_user_id" ON "public"."debug_bugs" USING "btree" ("user_id");



CREATE INDEX "idx_debug_logs_bug_id" ON "public"."debug_logs" USING "btree" ("bug_id");



CREATE INDEX "idx_debug_logs_context" ON "public"."debug_logs" USING "gin" ("context");



CREATE INDEX "idx_debug_logs_created_at" ON "public"."debug_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_debug_logs_log_level" ON "public"."debug_logs" USING "btree" ("log_level");



CREATE INDEX "idx_debug_logs_session_id" ON "public"."debug_logs" USING "btree" ("session_id");



CREATE INDEX "idx_debug_logs_user_id" ON "public"."debug_logs" USING "btree" ("user_id");



CREATE INDEX "idx_debug_sessions_bug_id" ON "public"."debug_sessions" USING "btree" ("bug_id");



CREATE INDEX "idx_debug_sessions_started_at" ON "public"."debug_sessions" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_debug_sessions_steps_taken" ON "public"."debug_sessions" USING "gin" ("steps_taken");



CREATE INDEX "idx_demo_access_template" ON "public"."assessment_demo_access" USING "btree" ("template_id");



CREATE INDEX "idx_demo_access_user" ON "public"."assessment_demo_access" USING "btree" ("user_id");



CREATE INDEX "idx_dev_audit_created" ON "public"."dev_audit_log" USING "btree" ("created_at");



CREATE INDEX "idx_dev_audit_user" ON "public"."dev_audit_log" USING "btree" ("dev_user_id");



CREATE INDEX "idx_dev_sessions_active" ON "public"."dev_role_sessions" USING "btree" ("is_active");



CREATE INDEX "idx_dev_sessions_dev_user" ON "public"."dev_role_sessions" USING "btree" ("dev_user_id");



CREATE INDEX "idx_dev_sessions_expires" ON "public"."dev_role_sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_dev_sessions_token" ON "public"."dev_role_sessions" USING "btree" ("session_token");



CREATE INDEX "idx_dev_users_user_id" ON "public"."dev_users" USING "btree" ("user_id");



CREATE INDEX "idx_document_access_log_accessed_at" ON "public"."document_access_log" USING "btree" ("accessed_at" DESC);



CREATE INDEX "idx_document_access_log_document" ON "public"."document_access_log" USING "btree" ("document_id");



CREATE INDEX "idx_document_access_log_user" ON "public"."document_access_log" USING "btree" ("user_id");



CREATE INDEX "idx_document_access_log_workspace" ON "public"."document_access_log" USING "btree" ("workspace_id");



CREATE INDEX "idx_document_folders_created_by" ON "public"."document_folders" USING "btree" ("created_by");



CREATE INDEX "idx_document_folders_parent" ON "public"."document_folders" USING "btree" ("parent_folder_id");



CREATE INDEX "idx_document_folders_workspace" ON "public"."document_folders" USING "btree" ("workspace_id");



CREATE INDEX "idx_document_versions_created_at" ON "public"."document_versions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_document_versions_document" ON "public"."document_versions" USING "btree" ("document_id");



CREATE INDEX "idx_entity_year_weights_lookup" ON "public"."assessment_entity_year_weights" USING "btree" ("entity_type", "entity_id", "year");



CREATE INDEX "idx_entity_year_weights_template" ON "public"."assessment_entity_year_weights" USING "btree" ("template_id");



CREATE INDEX "idx_events_date_start" ON "public"."events" USING "btree" ("date_start");



CREATE INDEX "idx_events_is_published" ON "public"."events" USING "btree" ("is_published");



CREATE INDEX "idx_expectations_indicator" ON "public"."assessment_year_expectations" USING "btree" ("indicator_id");



CREATE INDEX "idx_expectations_template" ON "public"."assessment_year_expectations" USING "btree" ("template_id");



CREATE INDEX "idx_expense_items_category_id" ON "public"."expense_items" USING "btree" ("category_id");



CREATE INDEX "idx_expense_items_date" ON "public"."expense_items" USING "btree" ("expense_date");



CREATE INDEX "idx_expense_items_report_id" ON "public"."expense_items" USING "btree" ("report_id");



CREATE INDEX "idx_expense_reports_dates" ON "public"."expense_reports" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_expense_reports_status" ON "public"."expense_reports" USING "btree" ("status");



CREATE INDEX "idx_expense_reports_submitted_by" ON "public"."expense_reports" USING "btree" ("submitted_by");



CREATE INDEX "idx_extraction_feedback_contract" ON "public"."contract_extraction_feedback" USING "btree" ("contract_id");



CREATE INDEX "idx_feedback_activity_created_at" ON "public"."feedback_activity" USING "btree" ("created_at");



CREATE INDEX "idx_feedback_activity_feedback_id" ON "public"."feedback_activity" USING "btree" ("feedback_id");



CREATE INDEX "idx_feedback_permissions_is_active" ON "public"."feedback_permissions" USING "btree" ("is_active");



CREATE INDEX "idx_feedback_permissions_user_id" ON "public"."feedback_permissions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_feriados_chile_fecha" ON "public"."feriados_chile" USING "btree" ("fecha");



CREATE INDEX "idx_feriados_chile_year" ON "public"."feriados_chile" USING "btree" ("year");



CREATE INDEX "idx_fx_currencies" ON "public"."fx_rates" USING "btree" ("from_currency", "to_currency", "fetched_at" DESC);



CREATE INDEX "idx_gc_transformation_active" ON "public"."growth_community_transformation_access" USING "btree" ("growth_community_id") WHERE ("is_active" = true);



CREATE INDEX "idx_generations_created_at" ON "public"."generations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_generations_name" ON "public"."generations" USING "btree" ("name");



CREATE INDEX "idx_generations_school_grade" ON "public"."generations" USING "btree" ("school_id", "grade_range") WHERE (("school_id" IS NOT NULL) AND ("grade_range" IS NOT NULL));



CREATE INDEX "idx_generations_school_id" ON "public"."generations" USING "btree" ("school_id") WHERE ("school_id" IS NOT NULL);



CREATE INDEX "idx_group_assignment_discussions_assignment" ON "public"."group_assignment_discussions" USING "btree" ("assignment_id");



CREATE INDEX "idx_group_assignment_discussions_group" ON "public"."group_assignment_discussions" USING "btree" ("group_id");



CREATE UNIQUE INDEX "idx_group_assignment_discussions_unique" ON "public"."group_assignment_discussions" USING "btree" ("assignment_id", "group_id", "thread_id");



CREATE INDEX "idx_group_assignment_groups_assignment_id" ON "public"."group_assignment_groups" USING "btree" ("assignment_id");



CREATE INDEX "idx_group_assignment_groups_community_id" ON "public"."group_assignment_groups" USING "btree" ("community_id");



CREATE INDEX "idx_group_assignment_members_group_id" ON "public"."group_assignment_members" USING "btree" ("group_id");



CREATE INDEX "idx_group_assignment_members_user_id" ON "public"."group_assignment_members" USING "btree" ("user_id");



CREATE INDEX "idx_group_assignment_submissions_assignment_id" ON "public"."group_assignment_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_group_assignment_submissions_group_id" ON "public"."group_assignment_submissions" USING "btree" ("group_id");



CREATE INDEX "idx_group_assignment_submissions_user_id" ON "public"."group_assignment_submissions" USING "btree" ("user_id");



CREATE INDEX "idx_indicators_category" ON "public"."assessment_indicators" USING "btree" ("category");



CREATE INDEX "idx_indicators_module" ON "public"."assessment_indicators" USING "btree" ("module_id");



CREATE INDEX "idx_indicators_order" ON "public"."assessment_indicators" USING "btree" ("module_id", "display_order");



CREATE INDEX "idx_instances_community" ON "public"."assessment_instances" USING "btree" ("growth_community_id");



CREATE INDEX "idx_instances_course" ON "public"."assessment_instances" USING "btree" ("course_structure_id");



CREATE INDEX "idx_instances_school" ON "public"."assessment_instances" USING "btree" ("school_id");



CREATE INDEX "idx_instances_snapshot" ON "public"."assessment_instances" USING "btree" ("template_snapshot_id");



CREATE INDEX "idx_instances_status" ON "public"."assessment_instances" USING "btree" ("status");



CREATE INDEX "idx_instances_year" ON "public"."assessment_instances" USING "btree" ("transformation_year");



CREATE INDEX "idx_learning_path_assignments_assigned_at" ON "public"."learning_path_assignments" USING "btree" ("assigned_at");



CREATE INDEX "idx_learning_path_assignments_assigned_by" ON "public"."learning_path_assignments" USING "btree" ("assigned_by");



CREATE INDEX "idx_learning_path_assignments_group_id" ON "public"."learning_path_assignments" USING "btree" ("group_id");



CREATE INDEX "idx_learning_path_assignments_path_id" ON "public"."learning_path_assignments" USING "btree" ("path_id");



CREATE INDEX "idx_learning_path_assignments_user_id" ON "public"."learning_path_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_lesson_assignments_community" ON "public"."lesson_assignments" USING "btree" ("assigned_to_community_id");



CREATE INDEX "idx_lesson_assignments_course" ON "public"."lesson_assignments" USING "btree" ("course_id");



CREATE INDEX "idx_lesson_assignments_created_by" ON "public"."lesson_assignments" USING "btree" ("created_by");



CREATE INDEX "idx_lesson_assignments_due_date" ON "public"."lesson_assignments" USING "btree" ("due_date");



CREATE INDEX "idx_lesson_assignments_for" ON "public"."lesson_assignments" USING "btree" ("assignment_for");



CREATE INDEX "idx_lesson_assignments_lesson" ON "public"."lesson_assignments" USING "btree" ("lesson_id");



CREATE INDEX "idx_lesson_assignments_published" ON "public"."lesson_assignments" USING "btree" ("is_published");



CREATE INDEX "idx_lesson_completion_course_id" ON "public"."lesson_completion_summary" USING "btree" ("course_id");



CREATE INDEX "idx_lesson_completion_status" ON "public"."lesson_completion_summary" USING "btree" ("is_completed");



CREATE INDEX "idx_lesson_completion_user_id" ON "public"."lesson_completion_summary" USING "btree" ("user_id");



CREATE INDEX "idx_lesson_progress_user_completed" ON "public"."lesson_progress" USING "btree" ("user_id", "completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_lesson_progress_user_id" ON "public"."lesson_progress" USING "btree" ("user_id");



CREATE INDEX "idx_lesson_progress_user_lesson_lookup" ON "public"."lesson_progress" USING "btree" ("user_id", "lesson_id", "completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_lesson_submissions_assignment" ON "public"."lesson_assignment_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_lesson_submissions_source_id" ON "public"."lesson_assignment_submissions" USING "btree" ("source_submission_id");



CREATE INDEX "idx_lesson_submissions_status" ON "public"."lesson_assignment_submissions" USING "btree" ("status");



CREATE INDEX "idx_lesson_submissions_student" ON "public"."lesson_assignment_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_lesson_submissions_student_id" ON "public"."lesson_assignment_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_lesson_submissions_submitted_at" ON "public"."lesson_assignment_submissions" USING "btree" ("submitted_at");



CREATE INDEX "idx_lesson_submissions_submitted_by" ON "public"."lesson_assignment_submissions" USING "btree" ("submitted_by");



CREATE INDEX "idx_lessons_course_id" ON "public"."lessons" USING "btree" ("course_id");



CREATE INDEX "idx_lessons_difficulty" ON "public"."lessons" USING "btree" ("difficulty_level");



CREATE INDEX "idx_lessons_mandatory" ON "public"."lessons" USING "btree" ("is_mandatory");



CREATE INDEX "idx_lessons_module_id" ON "public"."lessons" USING "btree" ("module_id");



CREATE INDEX "idx_lessons_type" ON "public"."lessons" USING "btree" ("lesson_type");



CREATE INDEX "idx_licitacion_ates_ganador" ON "public"."licitacion_ates" USING "btree" ("licitacion_id", "es_ganador") WHERE ("es_ganador" = true);



CREATE INDEX "idx_licitacion_ates_licitacion" ON "public"."licitacion_ates" USING "btree" ("licitacion_id");



CREATE INDEX "idx_licitacion_comision_licitacion" ON "public"."licitacion_comision" USING "btree" ("licitacion_id");



CREATE INDEX "idx_licitacion_consultas_licitacion" ON "public"."licitacion_consultas" USING "btree" ("licitacion_id");



CREATE INDEX "idx_licitacion_documentos_licitacion" ON "public"."licitacion_documentos" USING "btree" ("licitacion_id");



CREATE INDEX "idx_licitacion_documentos_tipo" ON "public"."licitacion_documentos" USING "btree" ("licitacion_id", "tipo");



CREATE INDEX "idx_licitacion_eval_ate" ON "public"."licitacion_evaluaciones" USING "btree" ("ate_id");



CREATE INDEX "idx_licitacion_eval_licitacion" ON "public"."licitacion_evaluaciones" USING "btree" ("licitacion_id");



CREATE UNIQUE INDEX "idx_licitacion_eval_unique" ON "public"."licitacion_evaluaciones" USING "btree" ("licitacion_id", "ate_id", "criterio_id");



CREATE INDEX "idx_licitacion_historial_created" ON "public"."licitacion_historial" USING "btree" ("created_at");



CREATE INDEX "idx_licitacion_historial_licitacion" ON "public"."licitacion_historial" USING "btree" ("licitacion_id");



CREATE INDEX "idx_licitaciones_estado" ON "public"."licitaciones" USING "btree" ("estado");



CREATE UNIQUE INDEX "idx_licitaciones_numero" ON "public"."licitaciones" USING "btree" ("numero_licitacion");



CREATE INDEX "idx_licitaciones_programa" ON "public"."licitaciones" USING "btree" ("programa_id");



CREATE INDEX "idx_licitaciones_school" ON "public"."licitaciones" USING "btree" ("school_id");



CREATE UNIQUE INDEX "idx_licitaciones_school_programa_year" ON "public"."licitaciones" USING "btree" ("school_id", "programa_id", "year") WHERE ("estado" <> ALL (ARRAY['cerrada'::"text", 'adjudicada_externo'::"text"]));



CREATE INDEX "idx_licitaciones_year" ON "public"."licitaciones" USING "btree" ("year");



CREATE INDEX "idx_lpa_path_group" ON "public"."learning_path_assignments" USING "btree" ("path_id", "group_id") WHERE ("group_id" IS NOT NULL);



CREATE INDEX "idx_lpa_path_id_counts" ON "public"."learning_path_assignments" USING "btree" ("path_id");



CREATE INDEX "idx_lpa_path_user" ON "public"."learning_path_assignments" USING "btree" ("path_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_lpa_user_path" ON "public"."learning_path_assignments" USING "btree" ("user_id", "path_id") WHERE ("user_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_lpa_user_path" IS 'Optimizes LP assignment lookups for source attribution';



CREATE INDEX "idx_lpc_path_course" ON "public"."learning_path_courses" USING "btree" ("learning_path_id", "course_id");



COMMENT ON INDEX "public"."idx_lpc_path_course" IS 'Optimizes course membership lookups for overlap detection';



CREATE INDEX "idx_meditation_favorites_user" ON "public"."church_meditation_favorites" USING "btree" ("user_id");



CREATE INDEX "idx_meditation_preferences_user" ON "public"."church_meditation_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_meditation_recommendations_time" ON "public"."church_meditation_recommendations" USING "btree" ("time_of_day");



CREATE INDEX "idx_meditation_recommendations_user" ON "public"."church_meditation_recommendations" USING "btree" ("user_id");



CREATE INDEX "idx_meditation_streaks_user" ON "public"."church_meditation_streaks" USING "btree" ("user_id");



CREATE INDEX "idx_meeting_agreements_meeting_id" ON "public"."meeting_agreements" USING "btree" ("meeting_id");



CREATE INDEX "idx_meeting_agreements_order" ON "public"."meeting_agreements" USING "btree" ("meeting_id", "order_index");



CREATE INDEX "idx_meeting_attachments_meeting_id" ON "public"."meeting_attachments" USING "btree" ("meeting_id");



CREATE INDEX "idx_meeting_attachments_uploaded_by" ON "public"."meeting_attachments" USING "btree" ("uploaded_by");



CREATE INDEX "idx_meeting_attendees_meeting_id" ON "public"."meeting_attendees" USING "btree" ("meeting_id");



CREATE INDEX "idx_meeting_attendees_user_id" ON "public"."meeting_attendees" USING "btree" ("user_id");



CREATE INDEX "idx_meeting_commitments_assigned_to" ON "public"."meeting_commitments" USING "btree" ("assigned_to");



CREATE INDEX "idx_meeting_commitments_due_date" ON "public"."meeting_commitments" USING "btree" ("due_date");



CREATE INDEX "idx_meeting_commitments_meeting_id" ON "public"."meeting_commitments" USING "btree" ("meeting_id");



CREATE INDEX "idx_meeting_commitments_status" ON "public"."meeting_commitments" USING "btree" ("status");



CREATE INDEX "idx_meeting_tasks_assigned_to" ON "public"."meeting_tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_meeting_tasks_due_date" ON "public"."meeting_tasks" USING "btree" ("due_date");



CREATE INDEX "idx_meeting_tasks_meeting_id" ON "public"."meeting_tasks" USING "btree" ("meeting_id");



CREATE INDEX "idx_meeting_tasks_priority" ON "public"."meeting_tasks" USING "btree" ("priority");



CREATE INDEX "idx_meeting_tasks_status" ON "public"."meeting_tasks" USING "btree" ("status");



CREATE INDEX "idx_meeting_work_sessions_heartbeat" ON "public"."meeting_work_sessions" USING "btree" ("meeting_id", "last_heartbeat_at" DESC) WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_meeting_work_sessions_meeting_active" ON "public"."meeting_work_sessions" USING "btree" ("meeting_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_meeting_work_sessions_user" ON "public"."meeting_work_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_menu_permissions_role" ON "public"."menu_permissions" USING "btree" ("role_type");



CREATE INDEX "idx_message_reactions_message" ON "public"."message_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_message_reactions_type" ON "public"."message_reactions" USING "btree" ("reaction_type");



CREATE INDEX "idx_message_reactions_user" ON "public"."message_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_migration_plan_school" ON "public"."ab_migration_plan" USING "btree" ("school_id");



CREATE INDEX "idx_migration_plan_school_year" ON "public"."ab_migration_plan" USING "btree" ("school_id", "year_number");



CREATE INDEX "idx_modules_order" ON "public"."assessment_modules" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_modules_template" ON "public"."assessment_modules" USING "btree" ("template_id");



CREATE INDEX "idx_news_published" ON "public"."news_articles" USING "btree" ("is_published", "created_at" DESC);



CREATE INDEX "idx_news_slug" ON "public"."news_articles" USING "btree" ("slug");



CREATE INDEX "idx_notification_events_processed" ON "public"."notification_events" USING "btree" ("processed_at");



CREATE INDEX "idx_notification_events_type" ON "public"."notification_events" USING "btree" ("event_type");



CREATE INDEX "idx_notification_triggers_active" ON "public"."notification_triggers" USING "btree" ("is_active");



CREATE INDEX "idx_notification_triggers_event_type" ON "public"."notification_triggers" USING "btree" ("event_type");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_entity" ON "public"."notifications" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_pasantias_programs_active" ON "public"."pasantias_programs" USING "btree" ("is_active");



CREATE INDEX "idx_pasantias_quotes_client_name" ON "public"."pasantias_quotes" USING "btree" ("client_name");



CREATE INDEX "idx_pasantias_quotes_created_at" ON "public"."pasantias_quotes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pasantias_quotes_number" ON "public"."pasantias_quotes" USING "btree" ("quote_number");



CREATE INDEX "idx_pasantias_quotes_status" ON "public"."pasantias_quotes" USING "btree" ("status");



CREATE INDEX "idx_platform_feedback_created_at" ON "public"."platform_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_platform_feedback_created_by" ON "public"."platform_feedback" USING "btree" ("created_by");



CREATE INDEX "idx_platform_feedback_status" ON "public"."platform_feedback" USING "btree" ("status");



CREATE INDEX "idx_post_comments_post" ON "public"."post_comments" USING "btree" ("post_id");



CREATE INDEX "idx_post_hashtags_hashtag" ON "public"."post_hashtags" USING "btree" ("hashtag");



CREATE INDEX "idx_post_media_post" ON "public"."post_media" USING "btree" ("post_id");



CREATE INDEX "idx_post_reactions_post" ON "public"."post_reactions" USING "btree" ("post_id");



CREATE INDEX "idx_profiles_community_id" ON "public"."profiles" USING "btree" ("community_id") WHERE ("community_id" IS NOT NULL);



CREATE INDEX "idx_profiles_email_trgm" ON "public"."profiles" USING "gin" ("email" "public"."gin_trgm_ops");



CREATE INDEX "idx_profiles_first_name_trgm" ON "public"."profiles" USING "gin" ("first_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_profiles_generation_id" ON "public"."profiles" USING "btree" ("generation_id") WHERE ("generation_id" IS NOT NULL);



CREATE INDEX "idx_profiles_last_active" ON "public"."profiles" USING "btree" ("last_active_at");



CREATE INDEX "idx_profiles_last_name_trgm" ON "public"."profiles" USING "gin" ("last_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_profiles_must_change_password" ON "public"."profiles" USING "btree" ("must_change_password") WHERE ("must_change_password" = true);



CREATE INDEX "idx_profiles_school_id" ON "public"."profiles" USING "btree" ("school_id") WHERE ("school_id" IS NOT NULL);



CREATE INDEX "idx_program_enrollments_school" ON "public"."program_enrollments" USING "btree" ("school_id");



CREATE INDEX "idx_program_enrollments_status" ON "public"."program_enrollments" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_program_enrollments_unique" ON "public"."program_enrollments" USING "btree" ("school_id", "program_type", "academic_year");



CREATE INDEX "idx_program_hours_ledger_enrollment" ON "public"."program_hours_ledger" USING "btree" ("program_enrollment_id");



CREATE INDEX "idx_programa_bases_templates_active" ON "public"."programa_bases_templates" USING "btree" ("programa_id", "is_active");



CREATE INDEX "idx_programa_bases_templates_programa" ON "public"."programa_bases_templates" USING "btree" ("programa_id");



CREATE INDEX "idx_programa_eval_criterios_programa" ON "public"."programa_evaluacion_criterios" USING "btree" ("programa_id");



CREATE INDEX "idx_progress_sessions_active" ON "public"."learning_path_progress_sessions" USING "btree" ("session_end", "last_heartbeat") WHERE ("session_end" IS NULL);



CREATE INDEX "idx_progress_sessions_activity" ON "public"."learning_path_progress_sessions" USING "btree" ("path_id", "activity_type", "session_start" DESC);



CREATE INDEX "idx_progress_sessions_user_path" ON "public"."learning_path_progress_sessions" USING "btree" ("user_id", "path_id", "session_start");



CREATE UNIQUE INDEX "idx_propuesta_generadas_access_code" ON "public"."propuesta_generadas" USING "btree" ("access_code") WHERE ("access_code" IS NOT NULL);



CREATE UNIQUE INDEX "idx_propuesta_generadas_web_slug" ON "public"."propuesta_generadas" USING "btree" ("web_slug") WHERE ("web_slug" IS NOT NULL);



CREATE INDEX "idx_propuesta_rate_limits_lookup" ON "public"."propuesta_rate_limits" USING "btree" ("ip_address", "slug", "attempted_at");



CREATE INDEX "idx_qa_assignments_due_date" ON "public"."qa_scenario_assignments" USING "btree" ("due_date") WHERE ("due_date" IS NOT NULL);



CREATE INDEX "idx_qa_assignments_scenario" ON "public"."qa_scenario_assignments" USING "btree" ("scenario_id");



CREATE INDEX "idx_qa_assignments_status" ON "public"."qa_scenario_assignments" USING "btree" ("status");



CREATE INDEX "idx_qa_assignments_tester" ON "public"."qa_scenario_assignments" USING "btree" ("tester_id");



CREATE INDEX "idx_qa_feature_checklist_area" ON "public"."qa_feature_checklist" USING "btree" ("feature_area");



CREATE INDEX "idx_qa_scenarios_active" ON "public"."qa_scenarios" USING "btree" ("is_active");



CREATE INDEX "idx_qa_scenarios_automated_only" ON "public"."qa_scenarios" USING "btree" ("automated_only");



CREATE INDEX "idx_qa_scenarios_feature" ON "public"."qa_scenarios" USING "btree" ("feature_area");



CREATE INDEX "idx_qa_scenarios_role" ON "public"."qa_scenarios" USING "btree" ("role_required");



CREATE INDEX "idx_qa_scenarios_testing_channel" ON "public"."qa_scenarios" USING "btree" ("testing_channel");



CREATE INDEX "idx_qa_step_results_passed" ON "public"."qa_step_results" USING "btree" ("passed");



CREATE INDEX "idx_qa_step_results_run" ON "public"."qa_step_results" USING "btree" ("test_run_id");



CREATE INDEX "idx_qa_test_runs_result" ON "public"."qa_test_runs" USING "btree" ("overall_result");



CREATE INDEX "idx_qa_test_runs_scenario" ON "public"."qa_test_runs" USING "btree" ("scenario_id");



CREATE INDEX "idx_qa_test_runs_status" ON "public"."qa_test_runs" USING "btree" ("status");



CREATE INDEX "idx_qa_test_runs_tester" ON "public"."qa_test_runs" USING "btree" ("tester_id");



CREATE INDEX "idx_qa_tester_time_logs_date" ON "public"."qa_tester_time_logs" USING "btree" ("date");



CREATE INDEX "idx_qa_tester_time_logs_tester" ON "public"."qa_tester_time_logs" USING "btree" ("tester_id");



CREATE INDEX "idx_quiz_submissions_course" ON "public"."quiz_submissions" USING "btree" ("course_id");



CREATE INDEX "idx_quiz_submissions_graded_by" ON "public"."quiz_submissions" USING "btree" ("graded_by");



CREATE INDEX "idx_quiz_submissions_grading_status" ON "public"."quiz_submissions" USING "btree" ("grading_status");



CREATE INDEX "idx_quiz_submissions_student" ON "public"."quiz_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_quote_groups_quote_id" ON "public"."pasantias_quote_groups" USING "btree" ("quote_id");



CREATE INDEX "idx_red_escuelas_red_id" ON "public"."red_escuelas" USING "btree" ("red_id");



CREATE INDEX "idx_red_escuelas_school_id" ON "public"."red_escuelas" USING "btree" ("school_id");



CREATE INDEX "idx_redes_de_colegios_created_by" ON "public"."redes_de_colegios" USING "btree" ("created_by");



CREATE INDEX "idx_responses_indicator" ON "public"."assessment_responses" USING "btree" ("indicator_id");



CREATE INDEX "idx_responses_instance" ON "public"."assessment_responses" USING "btree" ("instance_id");



CREATE INDEX "idx_responses_user" ON "public"."assessment_responses" USING "btree" ("responded_by");



CREATE INDEX "idx_results_instance" ON "public"."assessment_instance_results" USING "btree" ("instance_id");



CREATE INDEX "idx_role_permission_baseline_role" ON "public"."role_permission_baseline" USING "btree" ("role_type");



CREATE INDEX "idx_role_permissions_expires" ON "public"."role_permissions" USING "btree" ("expires_at");



CREATE INDEX "idx_role_permissions_role" ON "public"."role_permissions" USING "btree" ("role_type");



CREATE INDEX "idx_role_permissions_test_run" ON "public"."role_permissions" USING "btree" ("test_run_id");



CREATE UNIQUE INDEX "idx_role_permissions_unique_active" ON "public"."role_permissions" USING "btree" ("role_type", "permission_key", "test_run_id") WHERE (("active" = true) AND ("is_test" = true));



CREATE INDEX "idx_saved_posts_user" ON "public"."saved_posts" USING "btree" ("user_id");



CREATE INDEX "idx_school_change_history_created" ON "public"."school_change_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_school_change_history_feature" ON "public"."school_change_history" USING "btree" ("school_id", "feature");



CREATE INDEX "idx_school_change_history_school" ON "public"."school_change_history" USING "btree" ("school_id");



CREATE INDEX "idx_schools_cliente_id" ON "public"."schools" USING "btree" ("cliente_id");



CREATE INDEX "idx_session_activity_log_created" ON "public"."session_activity_log" USING "btree" ("created_at");



CREATE INDEX "idx_session_activity_log_session" ON "public"."session_activity_log" USING "btree" ("session_id");



CREATE INDEX "idx_session_activity_log_user" ON "public"."session_activity_log" USING "btree" ("user_id");



CREATE INDEX "idx_session_attendees_session" ON "public"."session_attendees" USING "btree" ("session_id");



CREATE INDEX "idx_session_attendees_user" ON "public"."session_attendees" USING "btree" ("user_id");



CREATE INDEX "idx_session_communications_session" ON "public"."session_communications" USING "btree" ("session_id");



CREATE INDEX "idx_session_edit_requests_session" ON "public"."session_edit_requests" USING "btree" ("session_id");



CREATE INDEX "idx_session_edit_requests_status" ON "public"."session_edit_requests" USING "btree" ("status");



CREATE INDEX "idx_session_facilitators_session" ON "public"."session_facilitators" USING "btree" ("session_id");



CREATE INDEX "idx_session_facilitators_user" ON "public"."session_facilitators" USING "btree" ("user_id");



CREATE INDEX "idx_session_materials_session" ON "public"."session_materials" USING "btree" ("session_id");



CREATE INDEX "idx_session_notifications_scheduled" ON "public"."session_notifications" USING "btree" ("scheduled_for") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "idx_session_notifications_session" ON "public"."session_notifications" USING "btree" ("session_id");



CREATE INDEX "idx_session_notifications_user" ON "public"."session_notifications" USING "btree" ("user_id");



CREATE INDEX "idx_session_reports_session" ON "public"."session_reports" USING "btree" ("session_id");



CREATE INDEX "idx_snapshots_template" ON "public"."assessment_template_snapshots" USING "btree" ("template_id");



CREATE INDEX "idx_snapshots_version" ON "public"."assessment_template_snapshots" USING "btree" ("template_id", "version");



CREATE INDEX "idx_sub_questions_indicator" ON "public"."assessment_sub_questions" USING "btree" ("indicator_id");



CREATE INDEX "idx_sub_questions_parent" ON "public"."assessment_sub_questions" USING "btree" ("parent_question_id");



CREATE INDEX "idx_submission_shares_source" ON "public"."assignment_submission_shares" USING "btree" ("source_submission_id");



CREATE INDEX "idx_submission_shares_user" ON "public"."assignment_submission_shares" USING "btree" ("shared_with_user_id");



CREATE INDEX "idx_superadmins_active" ON "public"."superadmins" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_superadmins_user_id" ON "public"."superadmins" USING "btree" ("user_id");



CREATE INDEX "idx_supervisor_auditorias_created_at" ON "public"."supervisor_auditorias" USING "btree" ("created_at");



CREATE INDEX "idx_supervisor_auditorias_supervisor_id" ON "public"."supervisor_auditorias" USING "btree" ("supervisor_id");



CREATE INDEX "idx_system_updates_importance" ON "public"."system_updates" USING "btree" ("importance");



CREATE INDEX "idx_system_updates_published" ON "public"."system_updates" USING "btree" ("published_at");



CREATE INDEX "idx_templates_area" ON "public"."assessment_templates" USING "btree" ("area");



CREATE INDEX "idx_templates_published" ON "public"."assessment_templates" USING "btree" ("status", "published_at") WHERE ("status" = 'published'::"text");



CREATE INDEX "idx_templates_status" ON "public"."assessment_templates" USING "btree" ("status");



CREATE INDEX "idx_test_mode_state_expires" ON "public"."test_mode_state" USING "btree" ("expires_at");



CREATE INDEX "idx_test_mode_state_user" ON "public"."test_mode_state" USING "btree" ("user_id");



CREATE INDEX "idx_transformation_assessments_community" ON "public"."transformation_assessments" USING "btree" ("growth_community_id");



CREATE INDEX "idx_transformation_assessments_school" ON "public"."transformation_assessments" USING "btree" ("school_id");



CREATE INDEX "idx_transformation_assessments_status" ON "public"."transformation_assessments" USING "btree" ("status");



CREATE INDEX "idx_transformation_audit_community" ON "public"."transformation_access_audit_log" USING "btree" ("growth_community_id");



CREATE INDEX "idx_transformation_audit_date" ON "public"."transformation_access_audit_log" USING "btree" ("performed_at" DESC);



CREATE INDEX "idx_transformation_collaborators_assessment" ON "public"."transformation_assessment_collaborators" USING "btree" ("assessment_id");



CREATE INDEX "idx_transformation_collaborators_role" ON "public"."transformation_assessment_collaborators" USING "btree" ("role");



CREATE INDEX "idx_transformation_collaborators_user" ON "public"."transformation_assessment_collaborators" USING "btree" ("user_id");



CREATE INDEX "idx_transformation_conversation_messages_composite" ON "public"."transformation_conversation_messages" USING "btree" ("assessment_id", "rubric_item_id", "created_at" DESC);



CREATE INDEX "idx_transformation_llm_usage_assessment" ON "public"."transformation_llm_usage" USING "btree" ("assessment_id", "created_at" DESC);



CREATE INDEX "idx_transformation_llm_usage_user_created_at" ON "public"."transformation_llm_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_transformation_results_assessment" ON "public"."transformation_results" USING "btree" ("assessment_id");



CREATE INDEX "idx_transformation_results_rubric" ON "public"."transformation_results" USING "btree" ("rubric_item_id");



CREATE INDEX "idx_transformation_rubric_area" ON "public"."transformation_rubric" USING "btree" ("area", "display_order");



CREATE INDEX "idx_transversal_context_completed" ON "public"."school_transversal_context" USING "btree" ("completed_at");



CREATE INDEX "idx_transversal_context_school" ON "public"."school_transversal_context" USING "btree" ("school_id");



CREATE UNIQUE INDEX "idx_unique_anexo_per_parent" ON "public"."contratos" USING "btree" ("parent_contrato_id", "anexo_numero") WHERE ("is_anexo" = true);



CREATE UNIQUE INDEX "idx_unique_community_name_per_scope" ON "public"."growth_communities" USING "btree" ("name", "school_id", COALESCE("generation_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "idx_upcoming_courses_active" ON "public"."upcoming_courses" USING "btree" ("is_active");



CREATE INDEX "idx_upcoming_courses_order" ON "public"."upcoming_courses" USING "btree" ("display_order");



CREATE INDEX "idx_upcoming_courses_release_date" ON "public"."upcoming_courses" USING "btree" ("estimated_release_date");



CREATE INDEX "idx_user_badges_badge" ON "public"."user_badges" USING "btree" ("badge_id");



CREATE INDEX "idx_user_badges_earned" ON "public"."user_badges" USING "btree" ("earned_at" DESC);



CREATE INDEX "idx_user_badges_user" ON "public"."user_badges" USING "btree" ("user_id");



CREATE INDEX "idx_user_mentions_author" ON "public"."user_mentions" USING "btree" ("author_id");



CREATE INDEX "idx_user_mentions_mentioned" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "idx_user_notification_preferences_type" ON "public"."user_notification_preferences" USING "btree" ("notification_type");



CREATE INDEX "idx_user_notification_preferences_user_id" ON "public"."user_notification_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_user_notifications_created_at" ON "public"."user_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_notifications_dedup" ON "public"."user_notifications" USING "btree" ("user_id", "title", "created_at" DESC);



CREATE INDEX "idx_user_notifications_is_read" ON "public"."user_notifications" USING "btree" ("is_read");



CREATE INDEX "idx_user_notifications_type" ON "public"."user_notifications" USING "btree" ("notification_type_id");



CREATE INDEX "idx_user_notifications_user_id" ON "public"."user_notifications" USING "btree" ("user_id");



CREATE INDEX "idx_user_onboarding_state_user_id" ON "public"."user_onboarding_state" USING "btree" ("user_id");



CREATE INDEX "idx_user_progress_activity" ON "public"."user_progress" USING "btree" ("user_id", "last_interaction");



CREATE INDEX "idx_user_progress_completion" ON "public"."user_progress" USING "btree" ("user_id", "is_completed");



CREATE INDEX "idx_user_progress_last_interaction" ON "public"."user_progress" USING "btree" ("last_interaction");



CREATE INDEX "idx_user_progress_lesson_id" ON "public"."user_progress" USING "btree" ("lesson_id");



CREATE INDEX "idx_user_progress_user_id" ON "public"."user_progress" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_active" ON "public"."user_roles" USING "btree" ("is_active");



CREATE INDEX "idx_user_roles_cache_is_admin" ON "public"."user_roles_cache" USING "btree" ("is_admin");



CREATE INDEX "idx_user_roles_cache_is_teacher" ON "public"."user_roles_cache" USING "btree" ("is_teacher");



CREATE INDEX "idx_user_roles_cache_role" ON "public"."user_roles_cache" USING "btree" ("role");



CREATE INDEX "idx_user_roles_cache_user_id" ON "public"."user_roles_cache" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_community_active" ON "public"."user_roles" USING "btree" ("community_id", "is_active") WHERE (("community_id" IS NOT NULL) AND ("is_active" = true));



CREATE INDEX "idx_user_roles_role_type" ON "public"."user_roles" USING "btree" ("role_type");



CREATE INDEX "idx_user_roles_school" ON "public"."user_roles" USING "btree" ("school_id");



CREATE INDEX "idx_user_roles_school_active" ON "public"."user_roles" USING "btree" ("school_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_user_school_active" ON "public"."user_roles" USING "btree" ("user_id", "school_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_workspace_activities_created_at" ON "public"."workspace_activities" USING "btree" ("created_at");



CREATE INDEX "idx_workspace_activities_workspace_id" ON "public"."workspace_activities" USING "btree" ("workspace_id");



CREATE INDEX "idx_workspace_messages_recipient" ON "public"."workspace_messages" USING "btree" ("recipient_id");



CREATE INDEX "idx_workspace_messages_sender" ON "public"."workspace_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_workspace_messages_thread" ON "public"."workspace_messages" USING "btree" ("thread_id");



CREATE INDEX "idx_year_expectations_generation_type" ON "public"."assessment_year_expectations" USING "btree" ("generation_type");



CREATE INDEX "idx_year_expectations_template_gen" ON "public"."assessment_year_expectations" USING "btree" ("template_id", "generation_type");



CREATE INDEX "lesson_progress_lesson_block_idx" ON "public"."lesson_progress" USING "btree" ("lesson_id", "block_id");



CREATE INDEX "lesson_progress_user_lesson_idx" ON "public"."lesson_progress" USING "btree" ("user_id", "lesson_id");



CREATE INDEX "tractor_signups_created_idx" ON "public"."tractor_signups" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "tractor_signups_email_normalized_uidx" ON "public"."tractor_signups" USING "btree" ("email_normalized");



CREATE INDEX "tractor_signups_school_idx" ON "public"."tractor_signups" USING "btree" ("school_id");



CREATE INDEX "tractor_signups_source_idx" ON "public"."tractor_signups" USING "btree" ("source");



CREATE INDEX "tractor_signups_status_idx" ON "public"."tractor_signups" USING "btree" ("status");



CREATE UNIQUE INDEX "uq_course_completions_user_course_type" ON "public"."course_completions" USING "btree" ("user_id", "course_id", "completion_type") WHERE ("module_id" IS NULL);



CREATE OR REPLACE TRIGGER "audit_role_permission_changes" AFTER INSERT OR DELETE ON "public"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_role_permission_change"();



CREATE OR REPLACE TRIGGER "calculate_group_totals_trigger" BEFORE INSERT OR UPDATE ON "public"."pasantias_quote_groups" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_group_totals"();



CREATE OR REPLACE TRIGGER "calculate_pasantias_quote_totals_with_discount" BEFORE INSERT OR UPDATE ON "public"."pasantias_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_quote_totals_with_discount"();



CREATE OR REPLACE TRIGGER "calculate_quote_totals_with_groups_and_discount_trigger" BEFORE INSERT OR UPDATE ON "public"."pasantias_quotes" FOR EACH ROW WHEN (("new"."use_groups" = true)) EXECUTE FUNCTION "public"."calculate_quote_totals_with_groups_and_discount"();



CREATE OR REPLACE TRIGGER "calculate_viaticos_totals_trigger" BEFORE INSERT OR UPDATE ON "public"."pasantias_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_viaticos_totals"();



CREATE OR REPLACE TRIGGER "check_community_organization_trigger" BEFORE INSERT OR UPDATE ON "public"."growth_communities" FOR EACH ROW EXECUTE FUNCTION "public"."check_community_organization"();



CREATE OR REPLACE TRIGGER "contratos_set_representante_snapshot_trg" BEFORE INSERT ON "public"."contratos" FOR EACH ROW EXECUTE FUNCTION "public"."contratos_set_representante_snapshot"();



CREATE OR REPLACE TRIGGER "feedback_status_change" AFTER UPDATE ON "public"."platform_feedback" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."feedback_status_change_trigger"();



CREATE OR REPLACE TRIGGER "generations_updated_at_trigger" BEFORE UPDATE ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_generations_updated_at"();



CREATE OR REPLACE TRIGGER "learning_path_progress_sessions_updated_at" BEFORE UPDATE ON "public"."learning_path_progress_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "log_community_documents_access" AFTER UPDATE ON "public"."community_documents" FOR EACH ROW EXECUTE FUNCTION "public"."log_document_access"();



CREATE OR REPLACE TRIGGER "profiles_changed_refresh_cache" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH STATEMENT EXECUTE FUNCTION "public"."trigger_refresh_user_roles_cache"();



CREATE OR REPLACE TRIGGER "protect_transformation_rubric_deletion" BEFORE DELETE ON "public"."transformation_rubric" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_rubric_deletion_with_results"();



CREATE OR REPLACE TRIGGER "qa_scenarios_updated_at" BEFORE UPDATE ON "public"."qa_scenarios" FOR EACH ROW EXECUTE FUNCTION "public"."update_qa_scenarios_updated_at"();



CREATE OR REPLACE TRIGGER "trg_consultor_sessions_updated_at" BEFORE UPDATE ON "public"."consultor_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_expense_report_access_set_updated" BEFORE UPDATE ON "public"."expense_report_access" FOR EACH ROW EXECUTE FUNCTION "public"."set_expense_report_access_updated_at"();



CREATE OR REPLACE TRIGGER "trg_licitacion_ates_updated_at" BEFORE UPDATE ON "public"."licitacion_ates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_licitaciones_updated_at" BEFORE UPDATE ON "public"."licitaciones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_program_enrollments_updated_at" BEFORE UPDATE ON "public"."program_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_programa_bases_templates_updated_at" BEFORE UPDATE ON "public"."programa_bases_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_session_communications_updated_at" BEFORE UPDATE ON "public"."session_communications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_session_reports_updated_at" BEFORE UPDATE ON "public"."session_reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_session_attendees_on_gc_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_session_attendees_on_gc_change"();



COMMENT ON TRIGGER "trg_sync_session_attendees_on_gc_change" ON "public"."user_roles" IS 'Auto-syncs session attendees when GC membership changes';



CREATE OR REPLACE TRIGGER "trg_tractor_signups_updated_at" BEFORE UPDATE ON "public"."tractor_signups" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_assignment_on_completion" AFTER UPDATE ON "public"."qa_test_runs" FOR EACH ROW WHEN (("new"."status" = 'completed'::"text")) EXECUTE FUNCTION "public"."update_assignment_on_test_completion"();



CREATE OR REPLACE TRIGGER "trigger_archive_on_access_removal" BEFORE UPDATE ON "public"."growth_community_transformation_access" FOR EACH ROW EXECUTE FUNCTION "public"."archive_assessments_on_access_removal"();



CREATE OR REPLACE TRIGGER "trigger_assessment_objectives_updated_at" BEFORE UPDATE ON "public"."assessment_objectives" FOR EACH ROW EXECUTE FUNCTION "public"."update_assessment_objectives_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_cascade_lesson_submission_updates" AFTER UPDATE ON "public"."lesson_assignment_submissions" FOR EACH ROW WHEN (("new"."is_original" = true)) EXECUTE FUNCTION "public"."cascade_lesson_submission_updates"();



CREATE OR REPLACE TRIGGER "trigger_entity_year_weights_updated_at" BEFORE UPDATE ON "public"."assessment_entity_year_weights" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_log_initial_assignment" AFTER INSERT ON "public"."growth_community_transformation_access" FOR EACH ROW EXECUTE FUNCTION "public"."log_initial_assignment"();



CREATE OR REPLACE TRIGGER "trigger_set_enrollment_total_lessons" BEFORE INSERT OR UPDATE ON "public"."course_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."set_enrollment_total_lessons"();



CREATE OR REPLACE TRIGGER "trigger_sync_legacy_flag_insert" AFTER INSERT ON "public"."growth_community_transformation_access" FOR EACH ROW EXECUTE FUNCTION "public"."sync_legacy_transformation_flag"();



CREATE OR REPLACE TRIGGER "trigger_sync_legacy_flag_update" AFTER UPDATE ON "public"."growth_community_transformation_access" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."sync_legacy_transformation_flag"();



CREATE OR REPLACE TRIGGER "trigger_upcoming_courses_updated_at" BEFORE UPDATE ON "public"."upcoming_courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_upcoming_courses_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_enrollment_progress" AFTER INSERT OR UPDATE OF "completed_at" ON "public"."lesson_progress" FOR EACH ROW WHEN (("new"."completed_at" IS NOT NULL)) EXECUTE FUNCTION "public"."update_course_enrollment_progress"();



CREATE OR REPLACE TRIGGER "trigger_update_lesson_submission_timestamp" BEFORE UPDATE ON "public"."lesson_assignment_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_lesson_submission_updated_at"();



CREATE OR REPLACE TRIGGER "update_assessment_actions_updated_at" BEFORE UPDATE ON "public"."assessment_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_areas_updated_at" BEFORE UPDATE ON "public"."assessment_areas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_assignments_updated_at" BEFORE UPDATE ON "public"."assessment_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_context_questions_updated_at" BEFORE UPDATE ON "public"."assessment_context_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_dimensions_updated_at" BEFORE UPDATE ON "public"."assessment_dimensions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_indicators_updated_at" BEFORE UPDATE ON "public"."assessment_indicators" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_instances_updated_at" BEFORE UPDATE ON "public"."assessment_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_modules_updated_at" BEFORE UPDATE ON "public"."assessment_modules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_questions_updated_at" BEFORE UPDATE ON "public"."assessment_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_responses_updated_at" BEFORE UPDATE ON "public"."assessment_responses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_sections_updated_at" BEFORE UPDATE ON "public"."assessment_sections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_sub_questions_updated_at" BEFORE UPDATE ON "public"."assessment_sub_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_submissions_updated_at" BEFORE UPDATE ON "public"."assessment_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_templates_updated_at" BEFORE UPDATE ON "public"."assessment_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assessment_year_expectations_updated_at" BEFORE UPDATE ON "public"."assessment_year_expectations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assignment_instances_updated_at" BEFORE UPDATE ON "public"."assignment_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assignment_submissions_updated_at" BEFORE UPDATE ON "public"."assignment_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_assignment_templates_updated_at" BEFORE UPDATE ON "public"."assignment_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_about_sections_updated_at" BEFORE UPDATE ON "public"."church_about_sections" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_accounts_updated_at" BEFORE UPDATE ON "public"."church_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_contact_info_updated_at" BEFORE UPDATE ON "public"."church_contact_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_events_updated_at" BEFORE UPDATE ON "public"."church_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_hero_sections_updated_at" BEFORE UPDATE ON "public"."church_hero_sections" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_organizations_updated_at" BEFORE UPDATE ON "public"."church_organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_presentation_templates_updated_at" BEFORE UPDATE ON "public"."church_presentation_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_profiles_updated_at" BEFORE UPDATE ON "public"."church_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_schedules_updated_at" BEFORE UPDATE ON "public"."church_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_sermons_updated_at" BEFORE UPDATE ON "public"."church_sermons" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_services_updated_at" BEFORE UPDATE ON "public"."church_services" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_songs_updated_at" BEFORE UPDATE ON "public"."church_songs" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_team_members_updated_at" BEFORE UPDATE ON "public"."church_team_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_transactions_updated_at" BEFORE UPDATE ON "public"."church_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_church_website_settings_updated_at" BEFORE UPDATE ON "public"."church_website_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_church_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_community_documents_timestamp" BEFORE UPDATE ON "public"."community_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_document_timestamp"();



CREATE OR REPLACE TRIGGER "update_community_posts_updated_at" BEFORE UPDATE ON "public"."community_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_community_workspace_timestamp" BEFORE UPDATE ON "public"."community_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."update_community_workspace_timestamp"();



CREATE OR REPLACE TRIGGER "update_course_proposals_timestamp" BEFORE UPDATE ON "public"."course_proposals" FOR EACH ROW EXECUTE FUNCTION "public"."update_course_proposals_updated_at"();



CREATE OR REPLACE TRIGGER "update_document_folders_timestamp" BEFORE UPDATE ON "public"."document_folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_folder_timestamp"();



CREATE OR REPLACE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lesson_assignment_submissions_updated_at" BEFORE UPDATE ON "public"."lesson_assignment_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lesson_assignments_updated_at" BEFORE UPDATE ON "public"."lesson_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pasantias_programs_updated_at" BEFORE UPDATE ON "public"."pasantias_programs" FOR EACH ROW EXECUTE FUNCTION "public"."update_pasantias_updated_at"();



CREATE OR REPLACE TRIGGER "update_pasantias_quotes_updated_at" BEFORE UPDATE ON "public"."pasantias_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."update_pasantias_updated_at"();



CREATE OR REPLACE TRIGGER "update_post_comments_updated_at" BEFORE UPDATE ON "public"."post_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quote_on_group_change_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."pasantias_quote_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_quote_on_group_change"();



CREATE OR REPLACE TRIGGER "update_redes_de_colegios_updated_at" BEFORE UPDATE ON "public"."redes_de_colegios" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_school_generations_on_delete" AFTER DELETE ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_has_generations"();



CREATE OR REPLACE TRIGGER "update_school_generations_on_insert" AFTER INSERT ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_has_generations"();



CREATE OR REPLACE TRIGGER "update_school_generations_on_update" AFTER UPDATE OF "school_id" ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_has_generations"();



CREATE OR REPLACE TRIGGER "update_school_transversal_context_updated_at" BEFORE UPDATE ON "public"."school_transversal_context" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_streak_on_meditation" AFTER INSERT ON "public"."church_meditation_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_meditation_streak"();



CREATE OR REPLACE TRIGGER "update_superadmins_updated_at" BEFORE UPDATE ON "public"."superadmins" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_test_mode_state_updated_at" BEFORE UPDATE ON "public"."test_mode_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_notification_preferences_updated_at" BEFORE UPDATE ON "public"."user_notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_assignment_instance_course_trigger" BEFORE INSERT OR UPDATE ON "public"."assignment_instances" FOR EACH ROW EXECUTE FUNCTION "public"."validate_assignment_instance_course"();



ALTER TABLE ONLY "public"."ab_migration_plan"
    ADD CONSTRAINT "ab_migration_plan_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."ab_grades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ab_migration_plan"
    ADD CONSTRAINT "ab_migration_plan_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_subscriptions"
    ADD CONSTRAINT "activity_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_assignments"
    ADD CONSTRAINT "assessment_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_assignments"
    ADD CONSTRAINT "assessment_assignments_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_assignments"
    ADD CONSTRAINT "assessment_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_context_questions"
    ADD CONSTRAINT "assessment_context_questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_demo_access"
    ADD CONSTRAINT "assessment_demo_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_demo_access"
    ADD CONSTRAINT "assessment_demo_access_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_demo_access"
    ADD CONSTRAINT "assessment_demo_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_dimensions"
    ADD CONSTRAINT "assessment_dimensions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."assessment_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_entity_year_weights"
    ADD CONSTRAINT "assessment_entity_year_weights_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_indicators"
    ADD CONSTRAINT "assessment_indicators_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."assessment_modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_instance_assignees"
    ADD CONSTRAINT "assessment_instance_assignees_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_instance_assignees"
    ADD CONSTRAINT "assessment_instance_assignees_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."assessment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_instance_assignees"
    ADD CONSTRAINT "assessment_instance_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_instance_results"
    ADD CONSTRAINT "assessment_instance_results_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_instance_results"
    ADD CONSTRAINT "assessment_instance_results_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."assessment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_instances"
    ADD CONSTRAINT "assessment_instances_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_instances"
    ADD CONSTRAINT "assessment_instances_course_structure_id_fkey" FOREIGN KEY ("course_structure_id") REFERENCES "public"."school_course_structure"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessment_instances"
    ADD CONSTRAINT "assessment_instances_growth_community_id_fkey" FOREIGN KEY ("growth_community_id") REFERENCES "public"."growth_communities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessment_instances"
    ADD CONSTRAINT "assessment_instances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessment_instances"
    ADD CONSTRAINT "assessment_instances_template_snapshot_id_fkey" FOREIGN KEY ("template_snapshot_id") REFERENCES "public"."assessment_template_snapshots"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assessment_llm_usage"
    ADD CONSTRAINT "assessment_llm_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_modules"
    ADD CONSTRAINT "assessment_modules_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."assessment_objectives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_modules"
    ADD CONSTRAINT "assessment_modules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_objectives"
    ADD CONSTRAINT "assessment_objectives_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_questions"
    ADD CONSTRAINT "assessment_questions_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "public"."assessment_dimensions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_questions"
    ADD CONSTRAINT "assessment_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessment_responses"
    ADD CONSTRAINT "assessment_responses_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."assessment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_responses"
    ADD CONSTRAINT "assessment_responses_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_results"
    ADD CONSTRAINT "assessment_results_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."assessment_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_sub_questions"
    ADD CONSTRAINT "assessment_sub_questions_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "public"."assessment_indicators"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_sub_questions"
    ADD CONSTRAINT "assessment_sub_questions_parent_question_id_fkey" FOREIGN KEY ("parent_question_id") REFERENCES "public"."assessment_sub_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_submissions"
    ADD CONSTRAINT "assessment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assessment_assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessment_submissions"
    ADD CONSTRAINT "assessment_submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."assessment_submissions"
    ADD CONSTRAINT "assessment_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_template_snapshots"
    ADD CONSTRAINT "assessment_template_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_template_snapshots"
    ADD CONSTRAINT "assessment_template_snapshots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assessment_templates"
    ADD CONSTRAINT "assessment_templates_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_templates"
    ADD CONSTRAINT "assessment_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_templates"
    ADD CONSTRAINT "assessment_templates_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."ab_grades"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessment_templates"
    ADD CONSTRAINT "assessment_templates_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assessment_year_expectations"
    ADD CONSTRAINT "assessment_year_expectations_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "public"."assessment_indicators"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessment_year_expectations"
    ADD CONSTRAINT "assessment_year_expectations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assessment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_audit_log"
    ADD CONSTRAINT "assignment_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."assignment_feedback"
    ADD CONSTRAINT "assignment_feedback_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_feedback"
    ADD CONSTRAINT "assignment_feedback_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."assignment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submission_shares"
    ADD CONSTRAINT "assignment_submission_shares_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id");



ALTER TABLE ONLY "public"."assignment_submission_shares"
    ADD CONSTRAINT "assignment_submission_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submission_shares"
    ADD CONSTRAINT "assignment_submission_shares_source_submission_id_fkey" FOREIGN KEY ("source_submission_id") REFERENCES "public"."lesson_assignment_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."assignment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."assignment_templates"
    ADD CONSTRAINT "assignment_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."assignment_templates"
    ADD CONSTRAINT "assignment_templates_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_identities"
    ADD CONSTRAINT "bot_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_link_codes"
    ADD CONSTRAINT "bot_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_pending_items"
    ADD CONSTRAINT "bot_pending_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id");



ALTER TABLE ONLY "public"."bot_pending_items"
    ADD CONSTRAINT "bot_pending_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."bot_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_pending_items"
    ADD CONSTRAINT "bot_pending_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_sessions"
    ADD CONSTRAINT "bot_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_about_sections"
    ADD CONSTRAINT "church_about_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_accounts"
    ADD CONSTRAINT "church_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_accounts"
    ADD CONSTRAINT "church_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."church_accounts"("id");



ALTER TABLE ONLY "public"."church_contact_info"
    ADD CONSTRAINT "church_contact_info_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_events"
    ADD CONSTRAINT "church_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_hero_sections"
    ADD CONSTRAINT "church_hero_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_invitations"
    ADD CONSTRAINT "church_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."church_profiles"("id");



ALTER TABLE ONLY "public"."church_invitations"
    ADD CONSTRAINT "church_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_meditation_favorites"
    ADD CONSTRAINT "church_meditation_favorites_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."church_meditation_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_meditation_favorites"
    ADD CONSTRAINT "church_meditation_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_meditation_preferences"
    ADD CONSTRAINT "church_meditation_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_meditation_recommendations"
    ADD CONSTRAINT "church_meditation_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_meditation_sessions"
    ADD CONSTRAINT "church_meditation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."church_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_meditation_streaks"
    ADD CONSTRAINT "church_meditation_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_prayer_requests"
    ADD CONSTRAINT "church_prayer_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_presentation_templates"
    ADD CONSTRAINT "church_presentation_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."church_profiles"("id");



ALTER TABLE ONLY "public"."church_presentation_templates"
    ADD CONSTRAINT "church_presentation_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_profiles"
    ADD CONSTRAINT "church_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_profiles"
    ADD CONSTRAINT "church_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_schedules"
    ADD CONSTRAINT "church_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_sermons"
    ADD CONSTRAINT "church_sermons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_services"
    ADD CONSTRAINT "church_services_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."church_profiles"("id");



ALTER TABLE ONLY "public"."church_services"
    ADD CONSTRAINT "church_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_songs"
    ADD CONSTRAINT "church_songs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."church_profiles"("id");



ALTER TABLE ONLY "public"."church_songs"
    ADD CONSTRAINT "church_songs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_team_members"
    ADD CONSTRAINT "church_team_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_transaction_lines"
    ADD CONSTRAINT "church_transaction_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."church_accounts"("id");



ALTER TABLE ONLY "public"."church_transaction_lines"
    ADD CONSTRAINT "church_transaction_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."church_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_transactions"
    ADD CONSTRAINT "church_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."church_profiles"("id");



ALTER TABLE ONLY "public"."church_transactions"
    ADD CONSTRAINT "church_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."church_website_settings"
    ADD CONSTRAINT "church_website_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."church_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_documents"
    ADD CONSTRAINT "community_documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_documents"
    ADD CONSTRAINT "community_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."community_documents"
    ADD CONSTRAINT "community_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_secretary_id_fkey" FOREIGN KEY ("secretary_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_meetings"
    ADD CONSTRAINT "community_meetings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_messages"
    ADD CONSTRAINT "community_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_messages"
    ADD CONSTRAINT "community_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."community_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_messages"
    ADD CONSTRAINT "community_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_messages"
    ADD CONSTRAINT "community_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_posts"
    ADD CONSTRAINT "community_posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_workspaces"
    ADD CONSTRAINT "community_workspaces_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "consultant_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultant_rates"
    ADD CONSTRAINT "consultant_rates_consultant_id_fkey" FOREIGN KEY ("consultant_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."consultant_rates"
    ADD CONSTRAINT "consultant_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."consultant_rates"
    ADD CONSTRAINT "consultant_rates_hour_type_id_fkey" FOREIGN KEY ("hour_type_id") REFERENCES "public"."hour_types"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_growth_community_id_fkey" FOREIGN KEY ("growth_community_id") REFERENCES "public"."growth_communities"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_program_enrollment_id_fkey" FOREIGN KEY ("program_enrollment_id") REFERENCES "public"."program_enrollments"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "consultor_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."context_general_questions"
    ADD CONSTRAINT "context_general_questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."context_general_responses"
    ADD CONSTRAINT "context_general_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."context_general_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."context_general_responses"
    ADD CONSTRAINT "context_general_responses_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."context_general_responses"
    ADD CONSTRAINT "context_general_responses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."contract_extraction_feedback"
    ADD CONSTRAINT "contract_extraction_feedback_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_extraction_feedback"
    ADD CONSTRAINT "contract_extraction_feedback_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_hour_allocations"
    ADD CONSTRAINT "contract_hour_allocations_adds_to_allocation_id_fkey" FOREIGN KEY ("adds_to_allocation_id") REFERENCES "public"."contract_hour_allocations"("id");



ALTER TABLE ONLY "public"."contract_hour_allocations"
    ADD CONSTRAINT "contract_hour_allocations_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."contract_hour_allocations"
    ADD CONSTRAINT "contract_hour_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_hour_allocations"
    ADD CONSTRAINT "contract_hour_allocations_hour_type_id_fkey" FOREIGN KEY ("hour_type_id") REFERENCES "public"."hour_types"("id");



ALTER TABLE ONLY "public"."contract_hour_reallocation_log"
    ADD CONSTRAINT "contract_hour_reallocation_log_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."contract_hour_reallocation_log"
    ADD CONSTRAINT "contract_hour_reallocation_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_hour_reallocation_log"
    ADD CONSTRAINT "contract_hour_reallocation_log_from_hour_type_id_fkey" FOREIGN KEY ("from_hour_type_id") REFERENCES "public"."hour_types"("id");



ALTER TABLE ONLY "public"."contract_hour_reallocation_log"
    ADD CONSTRAINT "contract_hour_reallocation_log_to_hour_type_id_fkey" FOREIGN KEY ("to_hour_type_id") REFERENCES "public"."hour_types"("id");



ALTER TABLE ONLY "public"."contract_hours_ledger"
    ADD CONSTRAINT "contract_hours_ledger_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."contract_hour_allocations"("id");



ALTER TABLE ONLY "public"."contract_hours_ledger"
    ADD CONSTRAINT "contract_hours_ledger_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contract_hours_ledger"
    ADD CONSTRAINT "contract_hours_ledger_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id");



ALTER TABLE ONLY "public"."contract_hours_ledger"
    ADD CONSTRAINT "contract_hours_ledger_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_parent_contrato_id_fkey" FOREIGN KEY ("parent_contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_programa_id_fkey" FOREIGN KEY ("programa_id") REFERENCES "public"."programas"("id");



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_completions"
    ADD CONSTRAINT "course_completions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_completions"
    ADD CONSTRAINT "course_completions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_completions"
    ADD CONSTRAINT "course_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_prerequisite_course_id_fkey" FOREIGN KEY ("prerequisite_course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_proposals"
    ADD CONSTRAINT "course_proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cuotas"
    ADD CONSTRAINT "cuotas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debug_bugs"
    ADD CONSTRAINT "debug_bugs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."debug_logs"
    ADD CONSTRAINT "debug_logs_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "public"."debug_bugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debug_logs"
    ADD CONSTRAINT "debug_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."debug_sessions"
    ADD CONSTRAINT "debug_sessions_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "public"."debug_bugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deleted_blocks"
    ADD CONSTRAINT "deleted_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_blocks"
    ADD CONSTRAINT "deleted_blocks_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_courses"
    ADD CONSTRAINT "deleted_courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_courses"
    ADD CONSTRAINT "deleted_courses_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_lessons"
    ADD CONSTRAINT "deleted_lessons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_lessons"
    ADD CONSTRAINT "deleted_lessons_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_modules"
    ADD CONSTRAINT "deleted_modules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deleted_modules"
    ADD CONSTRAINT "deleted_modules_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."dev_audit_log"
    ADD CONSTRAINT "dev_audit_log_dev_user_id_fkey" FOREIGN KEY ("dev_user_id") REFERENCES "public"."dev_users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_dev_user_id_fkey" FOREIGN KEY ("dev_user_id") REFERENCES "public"."dev_users"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_impersonated_user_id_fkey" FOREIGN KEY ("impersonated_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dev_role_sessions"
    ADD CONSTRAINT "dev_role_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dev_users"
    ADD CONSTRAINT "dev_users_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."dev_users"
    ADD CONSTRAINT "dev_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_access_log"
    ADD CONSTRAINT "document_access_log_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."community_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_access_log"
    ADD CONSTRAINT "document_access_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."document_access_log"
    ADD CONSTRAINT "document_access_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."document_folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_folders"
    ADD CONSTRAINT "document_folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."community_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."exec_sql_audit_log"
    ADD CONSTRAINT "exec_sql_audit_log_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_report_access"
    ADD CONSTRAINT "expense_report_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_report_access"
    ADD CONSTRAINT "expense_report_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_reports"
    ADD CONSTRAINT "expense_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_reports"
    ADD CONSTRAINT "expense_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_activity"
    ADD CONSTRAINT "feedback_activity_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."feedback_activity"
    ADD CONSTRAINT "feedback_activity_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "public"."platform_feedback"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_permissions"
    ADD CONSTRAINT "feedback_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."feedback_permissions"
    ADD CONSTRAINT "feedback_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "fk_learning_path_assignments_assigned_by" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "fk_learning_path_assignments_group_id" FOREIGN KEY ("group_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "fk_learning_path_assignments_path_id" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_assignments"
    ADD CONSTRAINT "fk_learning_path_assignments_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_notifications_type" FOREIGN KEY ("type") REFERENCES "public"."notification_types"("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "fk_preferences_type" FOREIGN KEY ("notification_type") REFERENCES "public"."notification_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "fk_session_contrato" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."consultor_sessions"
    ADD CONSTRAINT "fk_session_hour_type" FOREIGN KEY ("hour_type_key") REFERENCES "public"."hour_types"("key");



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_discussions"
    ADD CONSTRAINT "group_assignment_discussions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group_assignment_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_discussions"
    ADD CONSTRAINT "group_assignment_discussions_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_discussions"
    ADD CONSTRAINT "group_assignment_discussions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_groups"
    ADD CONSTRAINT "group_assignment_groups_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_groups"
    ADD CONSTRAINT "group_assignment_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."group_assignment_members"
    ADD CONSTRAINT "group_assignment_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group_assignment_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_members"
    ADD CONSTRAINT "group_assignment_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_submissions"
    ADD CONSTRAINT "group_assignment_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."group_assignment_submissions"
    ADD CONSTRAINT "group_assignment_submissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."group_assignment_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_submissions"
    ADD CONSTRAINT "group_assignment_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_communities"
    ADD CONSTRAINT "growth_communities_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."growth_communities"
    ADD CONSTRAINT "growth_communities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_community_transformation_access"
    ADD CONSTRAINT "growth_community_transformation_access_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."growth_community_transformation_access"
    ADD CONSTRAINT "growth_community_transformation_access_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."growth_community_transformation_access"
    ADD CONSTRAINT "growth_community_transformation_access_growth_community_id_fkey" FOREIGN KEY ("growth_community_id") REFERENCES "public"."growth_communities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "learning_path_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "learning_path_courses_learning_path_id_fkey" FOREIGN KEY ("learning_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_progress_sessions"
    ADD CONSTRAINT "learning_path_progress_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_paths"
    ADD CONSTRAINT "learning_paths_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_paths"
    ADD CONSTRAINT "learning_paths_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learning_paths"
    ADD CONSTRAINT "learning_paths_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."lesson_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_source_submission_id_fkey" FOREIGN KEY ("source_submission_id") REFERENCES "public"."lesson_assignment_submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_assignment_submissions"
    ADD CONSTRAINT "lesson_assignment_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_assignments"
    ADD CONSTRAINT "lesson_assignments_assigned_to_community_id_fkey" FOREIGN KEY ("assigned_to_community_id") REFERENCES "public"."growth_communities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_assignments"
    ADD CONSTRAINT "lesson_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_assignments"
    ADD CONSTRAINT "lesson_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lesson_assignments"
    ADD CONSTRAINT "lesson_assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_completion_summary"
    ADD CONSTRAINT "lesson_completion_summary_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_completion_summary"
    ADD CONSTRAINT "lesson_completion_summary_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_completion_summary"
    ADD CONSTRAINT "lesson_completion_summary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id");



ALTER TABLE ONLY "public"."licitacion_ates"
    ADD CONSTRAINT "licitacion_ates_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_comision"
    ADD CONSTRAINT "licitacion_comision_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_consultas"
    ADD CONSTRAINT "licitacion_consultas_ate_id_fkey" FOREIGN KEY ("ate_id") REFERENCES "public"."licitacion_ates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."licitacion_consultas"
    ADD CONSTRAINT "licitacion_consultas_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_documentos"
    ADD CONSTRAINT "licitacion_documentos_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_documentos"
    ADD CONSTRAINT "licitacion_documentos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."licitacion_evaluaciones"
    ADD CONSTRAINT "licitacion_evaluaciones_ate_id_fkey" FOREIGN KEY ("ate_id") REFERENCES "public"."licitacion_ates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_evaluaciones"
    ADD CONSTRAINT "licitacion_evaluaciones_criterio_id_fkey" FOREIGN KEY ("criterio_id") REFERENCES "public"."programa_evaluacion_criterios"("id");



ALTER TABLE ONLY "public"."licitacion_evaluaciones"
    ADD CONSTRAINT "licitacion_evaluaciones_evaluado_por_fkey" FOREIGN KEY ("evaluado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."licitacion_evaluaciones"
    ADD CONSTRAINT "licitacion_evaluaciones_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_historial"
    ADD CONSTRAINT "licitacion_historial_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licitacion_historial"
    ADD CONSTRAINT "licitacion_historial_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."licitaciones"
    ADD CONSTRAINT "licitaciones_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."licitaciones"
    ADD CONSTRAINT "licitaciones_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."meeting_agreements"
    ADD CONSTRAINT "meeting_agreements_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."community_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_attachments"
    ADD CONSTRAINT "meeting_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."community_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meeting_commitments"
    ADD CONSTRAINT "meeting_commitments_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meeting_commitments"
    ADD CONSTRAINT "meeting_commitments_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."community_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_tasks"
    ADD CONSTRAINT "meeting_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meeting_tasks"
    ADD CONSTRAINT "meeting_tasks_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."community_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_tasks"
    ADD CONSTRAINT "meeting_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."meeting_tasks"("id");



ALTER TABLE ONLY "public"."meeting_work_sessions"
    ADD CONSTRAINT "meeting_work_sessions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."community_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_work_sessions"
    ADD CONSTRAINT "meeting_work_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_activity_log"
    ADD CONSTRAINT "message_activity_log_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."community_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_activity_log"
    ADD CONSTRAINT "message_activity_log_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_activity_log"
    ADD CONSTRAINT "message_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_activity_log"
    ADD CONSTRAINT "message_activity_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."community_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_mentions"
    ADD CONSTRAINT "message_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_mentions"
    ADD CONSTRAINT "message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."community_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."community_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metadata_sync_log"
    ADD CONSTRAINT "metadata_sync_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."news_articles"
    ADD CONSTRAINT "news_articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "public"."notification_triggers"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pasantias_quote_groups"
    ADD CONSTRAINT "pasantias_quote_groups_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."pasantias_quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pasantias_quotes"
    ADD CONSTRAINT "pasantias_quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pasantias_quotes"
    ADD CONSTRAINT "pasantias_quotes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."permission_audit_log"
    ADD CONSTRAINT "permission_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."permission_audit_log"
    ADD CONSTRAINT "permission_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."platform_feedback"
    ADD CONSTRAINT "platform_feedback_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."post_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_comments"
    ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_hashtags"
    ADD CONSTRAINT "post_hashtags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_media"
    ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."post_mentions"
    ADD CONSTRAINT "post_mentions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_reactions"
    ADD CONSTRAINT "post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."program_enrollments"
    ADD CONSTRAINT "program_enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."program_hours_ledger"
    ADD CONSTRAINT "program_hours_ledger_program_enrollment_id_fkey" FOREIGN KEY ("program_enrollment_id") REFERENCES "public"."program_enrollments"("id");



ALTER TABLE ONLY "public"."program_hours_ledger"
    ADD CONSTRAINT "program_hours_ledger_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."program_hours_ledger"
    ADD CONSTRAINT "program_hours_ledger_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id");



ALTER TABLE ONLY "public"."programa_bases_templates"
    ADD CONSTRAINT "programa_bases_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "propuesta_generadas_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "public"."propuesta_fichas_servicio"("id");



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "propuesta_generadas_licitacion_id_fkey" FOREIGN KEY ("licitacion_id") REFERENCES "public"."licitaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."propuesta_generadas"
    ADD CONSTRAINT "propuesta_generadas_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "public"."propuesta_plantillas"("id");



ALTER TABLE ONLY "public"."propuesta_plantillas"
    ADD CONSTRAINT "propuesta_plantillas_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "public"."propuesta_fichas_servicio"("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qa_coverage_reports"
    ADD CONSTRAINT "qa_coverage_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_feature_checklist"
    ADD CONSTRAINT "qa_feature_checklist_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_lighthouse_results"
    ADD CONSTRAINT "qa_lighthouse_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_load_test_results"
    ADD CONSTRAINT "qa_load_test_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_performance_budgets"
    ADD CONSTRAINT "qa_performance_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_scenario_assignments"
    ADD CONSTRAINT "qa_scenario_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_scenario_assignments"
    ADD CONSTRAINT "qa_scenario_assignments_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "public"."qa_scenarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qa_scenario_assignments"
    ADD CONSTRAINT "qa_scenario_assignments_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qa_scenarios"
    ADD CONSTRAINT "qa_scenarios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_step_results"
    ADD CONSTRAINT "qa_step_results_test_run_id_fkey" FOREIGN KEY ("test_run_id") REFERENCES "public"."qa_test_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qa_test_runs"
    ADD CONSTRAINT "qa_test_runs_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "public"."qa_scenarios"("id");



ALTER TABLE ONLY "public"."qa_test_runs"
    ADD CONSTRAINT "qa_test_runs_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."qa_tester_time_logs"
    ADD CONSTRAINT "qa_tester_time_logs_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."red_escuelas"
    ADD CONSTRAINT "red_escuelas_agregado_por_fkey" FOREIGN KEY ("agregado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."red_escuelas"
    ADD CONSTRAINT "red_escuelas_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "public"."redes_de_colegios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."red_escuelas"
    ADD CONSTRAINT "red_escuelas_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."redes_de_colegios"
    ADD CONSTRAINT "redes_de_colegios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."redes_de_colegios"
    ADD CONSTRAINT "redes_de_colegios_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."roadmap_data"
    ADD CONSTRAINT "roadmap_data_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."school_change_history"
    ADD CONSTRAINT "school_change_history_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."school_change_history"
    ADD CONSTRAINT "school_change_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."school_course_docente_assignments"
    ADD CONSTRAINT "school_course_docente_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."school_course_docente_assignments"
    ADD CONSTRAINT "school_course_docente_assignments_course_structure_id_fkey" FOREIGN KEY ("course_structure_id") REFERENCES "public"."school_course_structure"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_course_docente_assignments"
    ADD CONSTRAINT "school_course_docente_assignments_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_course_structure"
    ADD CONSTRAINT "school_course_structure_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "public"."school_transversal_context"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_course_structure"
    ADD CONSTRAINT "school_course_structure_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."ab_grades"("id");



ALTER TABLE ONLY "public"."school_course_structure"
    ADD CONSTRAINT "school_course_structure_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_plan_completion_status"
    ADD CONSTRAINT "school_plan_completion_status_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."school_plan_completion_status"
    ADD CONSTRAINT "school_plan_completion_status_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."school_transversal_context"
    ADD CONSTRAINT "school_transversal_context_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."school_transversal_context"
    ADD CONSTRAINT "school_transversal_context_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_activity_log"
    ADD CONSTRAINT "session_activity_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_activity_log"
    ADD CONSTRAINT "session_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_attendees"
    ADD CONSTRAINT "session_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_communications"
    ADD CONSTRAINT "session_communications_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_communications"
    ADD CONSTRAINT "session_communications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_edit_requests"
    ADD CONSTRAINT "session_edit_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_edit_requests"
    ADD CONSTRAINT "session_edit_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_edit_requests"
    ADD CONSTRAINT "session_edit_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_facilitators"
    ADD CONSTRAINT "session_facilitators_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_facilitators"
    ADD CONSTRAINT "session_facilitators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_materials"
    ADD CONSTRAINT "session_materials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_materials"
    ADD CONSTRAINT "session_materials_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_notifications"
    ADD CONSTRAINT "session_notifications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_notifications"
    ADD CONSTRAINT "session_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_reports"
    ADD CONSTRAINT "session_reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_reports"
    ADD CONSTRAINT "session_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultor_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supervisor_auditorias"
    ADD CONSTRAINT "supervisor_auditorias_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "public"."redes_de_colegios"("id");



ALTER TABLE ONLY "public"."supervisor_auditorias"
    ADD CONSTRAINT "supervisor_auditorias_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."supervisor_auditorias"
    ADD CONSTRAINT "supervisor_auditorias_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."system_updates"
    ADD CONSTRAINT "system_updates_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."test_mode_state"
    ADD CONSTRAINT "test_mode_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tractor_signups"
    ADD CONSTRAINT "tractor_signups_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tractor_signups"
    ADD CONSTRAINT "tractor_signups_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tractor_signups"
    ADD CONSTRAINT "tractor_signups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id");



ALTER TABLE ONLY "public"."transformation_access_audit_log"
    ADD CONSTRAINT "transformation_access_audit_log_growth_community_id_fkey" FOREIGN KEY ("growth_community_id") REFERENCES "public"."growth_communities"("id");



ALTER TABLE ONLY "public"."transformation_access_audit_log"
    ADD CONSTRAINT "transformation_access_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transformation_assessment_collaborators"
    ADD CONSTRAINT "transformation_assessment_collaborators_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transformation_assessment_collaborators"
    ADD CONSTRAINT "transformation_assessment_collaborators_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."transformation_assessments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_assessment_collaborators"
    ADD CONSTRAINT "transformation_assessment_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_assessments"
    ADD CONSTRAINT "transformation_assessments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transformation_assessments"
    ADD CONSTRAINT "transformation_assessments_growth_community_id_fkey" FOREIGN KEY ("growth_community_id") REFERENCES "public"."growth_communities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_assessments"
    ADD CONSTRAINT "transformation_assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transformation_conversation_messages"
    ADD CONSTRAINT "transformation_conversation_messages_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."transformation_assessments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_conversation_messages"
    ADD CONSTRAINT "transformation_conversation_messages_rubric_item_id_fkey" FOREIGN KEY ("rubric_item_id") REFERENCES "public"."transformation_rubric"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_llm_usage"
    ADD CONSTRAINT "transformation_llm_usage_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."transformation_assessments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_llm_usage"
    ADD CONSTRAINT "transformation_llm_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_results"
    ADD CONSTRAINT "transformation_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."transformation_assessments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transformation_results"
    ADD CONSTRAINT "transformation_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transformation_results"
    ADD CONSTRAINT "transformation_results_rubric_item_id_fkey" FOREIGN KEY ("rubric_item_id") REFERENCES "public"."transformation_rubric"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."upcoming_courses"
    ADD CONSTRAINT "upcoming_courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."upcoming_courses"
    ADD CONSTRAINT "upcoming_courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_notification_type_id_fkey" FOREIGN KEY ("notification_type_id") REFERENCES "public"."notification_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_onboarding_state"
    ADD CONSTRAINT "user_onboarding_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "public"."redes_de_colegios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_activities"
    ADD CONSTRAINT "workspace_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_activities"
    ADD CONSTRAINT "workspace_activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."community_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_messages"
    ADD CONSTRAINT "workspace_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_messages"
    ADD CONSTRAINT "workspace_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin and Consultor can create proposals" ON "public"."course_proposals" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admin and Consultor can view proposals" ON "public"."course_proposals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admin and consultor can read all responses" ON "public"."context_general_responses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admin can manage all responses" ON "public"."context_general_responses" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admin can manage extraction feedback" ON "public"."contract_extraction_feedback" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admin can manage questions" ON "public"."context_general_questions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins and consultants can delete submissions" ON "public"."group_assignment_submissions" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "consultant_role" ON ((("consultant_role"."community_id" = "gag"."community_id") AND ("consultant_role"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("consultant_role"."is_active" = true))))
  WHERE (("gag"."id" = "group_assignment_submissions"."group_id") AND ("consultant_role"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Admins can manage all assignments" ON "public"."qa_scenario_assignments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage all network schools" ON "public"."red_escuelas" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage all networks" ON "public"."redes_de_colegios" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage all submissions" ON "public"."lesson_assignment_submissions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "Admins can manage codebase_index" ON "public"."codebase_index" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage coverage reports" ON "public"."qa_coverage_reports" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage dev users" ON "public"."dev_users" USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage feature checklist" ON "public"."qa_feature_checklist" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage lighthouse" ON "public"."qa_lighthouse_results" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can manage load test results" ON "public"."qa_load_test_results" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can view all audit logs" ON "public"."supervisor_auditorias" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins can view exec_sql audit log" ON "public"."exec_sql_audit_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "Admins full access sessions" ON "public"."learning_path_progress_sessions" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "Admins manage budgets" ON "public"."qa_performance_budgets" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Admins view all audit logs" ON "public"."dev_audit_log" FOR SELECT USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Admins view all dev sessions" ON "public"."dev_role_sessions" FOR SELECT USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Admins view vitals" ON "public"."qa_web_vitals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "All users can view published updates" ON "public"."system_updates" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Allow admin full access on profiles" ON "public"."profiles" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow admins to read audit logs" ON "public"."permission_audit_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role_type")::"text" = 'admin'::"text") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Allow all users to select generations" ON "public"."generations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow all users to select growth_communities" ON "public"."growth_communities" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow insert if course exists" ON "public"."blocks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE ("courses"."id" = "blocks"."course_id"))));



CREATE POLICY "Allow read blocks" ON "public"."blocks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow update if course exists" ON "public"."blocks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE ("courses"."id" = "blocks"."course_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE ("courses"."id" = "blocks"."course_id"))));



CREATE POLICY "Allow users to insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Allow users to read their own role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (("role_type" IN ( SELECT ("user_roles"."role_type")::"text" AS "role_type"
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Allow users to update their own profile" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() = "id") OR "public"."is_admin"())) WITH CHECK ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Allow users to view their own profile" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Anyone authenticated can read active questions" ON "public"."context_general_questions" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Anyone can create church prayer requests" ON "public"."church_prayer_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert vitals" ON "public"."qa_web_vitals" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Anyone can read group assignment settings" ON "public"."group_assignment_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Anyone can view active badges" ON "public"."badges" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Anyone can view hashtags" ON "public"."post_hashtags" FOR SELECT USING (true);



CREATE POLICY "Anyone can view permissions catalog" ON "public"."permissions" FOR SELECT USING (true);



CREATE POLICY "Anyone can view role types" ON "public"."role_types" FOR SELECT USING (true);



CREATE POLICY "Assignment creators can update their own assignments" ON "public"."lesson_assignments" FOR UPDATE USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Assignment creators can view all their assignments" ON "public"."lesson_assignments" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Authenticated users can view communities" ON "public"."growth_communities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view generations" ON "public"."generations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Baseline permissions are read-only" ON "public"."role_permission_baseline" FOR SELECT USING (true);



CREATE POLICY "Church organization members can modify about sections" ON "public"."church_about_sections" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify contact info" ON "public"."church_contact_info" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify events" ON "public"."church_events" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify hero sections" ON "public"."church_hero_sections" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify schedules" ON "public"."church_schedules" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify sermons" ON "public"."church_sermons" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify team members" ON "public"."church_team_members" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can modify website settings" ON "public"."church_website_settings" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Church organization members can read prayer requests" ON "public"."church_prayer_requests" FOR SELECT USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Community leaders and admins can create meetings" ON "public"."community_meetings" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = ANY (ARRAY['lider_comunidad'::"public"."user_role_type", 'admin'::"public"."user_role_type"])) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true))))));



CREATE POLICY "Community members can create meetings" ON "public"."community_meetings" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_global_workspace_access"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Community members can delete meetings" ON "public"."community_meetings" FOR DELETE TO "authenticated" USING (("public"."has_global_workspace_access"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Community members can view meetings" ON "public"."community_meetings" FOR SELECT TO "authenticated" USING (("public"."has_global_workspace_access"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Consultants can manage settings" ON "public"."group_assignment_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'consultor'::"public"."user_role_type")))));



CREATE POLICY "Create test overlays only" ON "public"."role_permissions" FOR INSERT WITH CHECK ((("is_test" = true) AND ("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."test_mode_state" "tms"
  WHERE (("tms"."user_id" = "auth"."uid"()) AND ("tms"."enabled" = true) AND ("tms"."expires_at" > "now"()))))));



CREATE POLICY "Delete own test overlays" ON "public"."role_permissions" FOR DELETE USING ((("is_test" = true) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Dev users can view their own record" ON "public"."dev_users" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Devs manage own sessions" ON "public"."dev_role_sessions" USING ((("dev_user_id" = "auth"."uid"()) AND "public"."is_dev_user"("auth"."uid"())));



CREATE POLICY "Devs view own audit log" ON "public"."dev_audit_log" FOR SELECT USING ((("dev_user_id" = "auth"."uid"()) AND "public"."is_dev_user"("auth"."uid"())));



CREATE POLICY "Directivo can insert own school responses" ON "public"."context_general_responses" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "context_general_responses"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Directivo can read own school responses" ON "public"."context_general_responses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "context_general_responses"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Directivo can update own school responses" ON "public"."context_general_responses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "context_general_responses"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Global admins manage all enrollments" ON "public"."course_enrollments" USING ("public"."is_global_admin"("auth"."uid"())) WITH CHECK ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Global admins manage all progress" ON "public"."user_progress" USING ("public"."is_global_admin"("auth"."uid"())) WITH CHECK ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Global admins manage consultant assignments" ON "public"."consultant_assignments" USING ("public"."is_global_admin"("auth"."uid"())) WITH CHECK ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Global admins view all progress" ON "public"."user_progress" FOR SELECT USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Hashtags are managed through posts" ON "public"."post_hashtags" USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_hashtags"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Leaders and document owners can view access logs" ON "public"."document_access_log" FOR SELECT USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))) OR ("document_id" IN ( SELECT "community_documents"."id"
   FROM "public"."community_documents"
  WHERE ("community_documents"."uploaded_by" = "auth"."uid"())))));



CREATE POLICY "Lesson assignment creators can update their own assignments" ON "public"."lesson_assignments" FOR UPDATE USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Manage own submissions" ON "public"."assignment_submissions" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Managers can delete events" ON "public"."events" FOR DELETE TO "authenticated" USING ("public"."fn_is_events_manager"("auth"."uid"()));



CREATE POLICY "Managers can modify events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK ("public"."fn_is_events_manager"("auth"."uid"()));



CREATE POLICY "Managers can read all events" ON "public"."events" FOR SELECT TO "authenticated" USING ("public"."fn_is_events_manager"("auth"."uid"()));



CREATE POLICY "Managers can update events" ON "public"."events" FOR UPDATE TO "authenticated" USING ("public"."fn_is_events_manager"("auth"."uid"())) WITH CHECK ("public"."fn_is_events_manager"("auth"."uid"()));



CREATE POLICY "Meeting creators and authorized users can delete meetings" ON "public"."community_meetings" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true))))));



CREATE POLICY "Meeting editors can update agreements" ON "public"."meeting_agreements" FOR UPDATE TO "authenticated" USING ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id")) WITH CHECK ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id"));



CREATE POLICY "Meeting editors can update attendees" ON "public"."meeting_attendees" FOR UPDATE TO "authenticated" USING ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id")) WITH CHECK ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id"));



CREATE POLICY "Meeting editors can update commitments" ON "public"."meeting_commitments" FOR UPDATE TO "authenticated" USING ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id")) WITH CHECK ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id"));



CREATE POLICY "Meeting editors can update meetings" ON "public"."community_meetings" FOR UPDATE TO "authenticated" USING ("public"."can_edit_meeting"("auth"."uid"(), "id")) WITH CHECK ("public"."can_edit_meeting"("auth"."uid"(), "id"));



CREATE POLICY "Meeting editors can update tasks" ON "public"."meeting_tasks" FOR UPDATE TO "authenticated" USING ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id")) WITH CHECK ("public"."can_edit_meeting"("auth"."uid"(), "meeting_id"));



CREATE POLICY "Mentions are managed through posts" ON "public"."post_mentions" USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_mentions"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Only church admins can update organization" ON "public"."church_organizations" FOR UPDATE USING (("id" IN ( SELECT "church_profiles"."organization_id"
   FROM "public"."church_profiles"
  WHERE (("church_profiles"."id" = "auth"."uid"()) AND ("church_profiles"."role" = 'admin'::"public"."church_user_role")))));



CREATE POLICY "Organization admins can manage invitations" ON "public"."church_invitations" USING (("organization_id" IN ( SELECT "church_profiles"."organization_id"
   FROM "public"."church_profiles"
  WHERE (("church_profiles"."id" = "auth"."uid"()) AND ("church_profiles"."role" = 'admin'::"public"."church_user_role")))));



CREATE POLICY "Original submitters can update" ON "public"."lesson_assignment_submissions" FOR UPDATE USING ((("auth"."uid"() = "submitted_by") AND ("is_original" = true))) WITH CHECK ((("auth"."uid"() = "submitted_by") AND ("is_original" = true)));



CREATE POLICY "Permitir todo en clientes" ON "public"."clientes" USING (true);



CREATE POLICY "Permitir todo en cuotas" ON "public"."cuotas" USING (true);



CREATE POLICY "Permitir todo en programas" ON "public"."programas" USING (true);



CREATE POLICY "Programs are editable by admins" ON "public"."pasantias_programs" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Programs are viewable by everyone" ON "public"."pasantias_programs" FOR SELECT USING (true);



CREATE POLICY "Public can read church about sections" ON "public"."church_about_sections" FOR SELECT USING (true);



CREATE POLICY "Public can read church contact info" ON "public"."church_contact_info" FOR SELECT USING (true);



CREATE POLICY "Public can read church hero sections" ON "public"."church_hero_sections" FOR SELECT USING (true);



CREATE POLICY "Public can read church schedules" ON "public"."church_schedules" FOR SELECT USING (true);



CREATE POLICY "Public can read church sermons" ON "public"."church_sermons" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public can read church team members" ON "public"."church_team_members" FOR SELECT USING (true);



CREATE POLICY "Public can read church website settings" ON "public"."church_website_settings" FOR SELECT USING (true);



CREATE POLICY "Public can read published church events" ON "public"."church_events" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public can view published events" ON "public"."events" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public read published news" ON "public"."news_articles" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Published assignments are viewable by all authenticated users" ON "public"."lesson_assignments" FOR SELECT USING ((("is_published" = true) AND ("auth"."role"() = 'authenticated'::"text")));



CREATE POLICY "Published lesson assignments are viewable by authenticated user" ON "public"."lesson_assignments" FOR SELECT USING ((("is_published" = true) AND ("auth"."role"() = 'authenticated'::"text")));



CREATE POLICY "QA testers can view feature checklist" ON "public"."qa_feature_checklist" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."can_run_qa_tests" = true)))));



CREATE POLICY "Quote groups are manageable by admins and consultors" ON "public"."pasantias_quote_groups" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Quote groups are viewable by ID" ON "public"."pasantias_quote_groups" FOR SELECT USING (true);



CREATE POLICY "Quotes are manageable by admins and consultors" ON "public"."pasantias_quotes" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Quotes are viewable by ID" ON "public"."pasantias_quotes" FOR SELECT USING (true);



CREATE POLICY "Service role can create shares" ON "public"."assignment_submission_shares" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role full access sessions" ON "public"."learning_path_progress_sessions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access" ON "public"."course_completions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full badges access" ON "public"."badges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full user_badges access" ON "public"."user_badges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Students can update their own lesson assignment submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING ((("student_id" = "auth"."uid"()) AND (("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text"])))) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can update their own submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING ((("student_id" = "auth"."uid"()) AND (("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text"])))) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own feedback" ON "public"."assignment_feedback" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their own lesson assignment submissions" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own submissions" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Superadmins can view audit log" ON "public"."permission_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."superadmins" "s"
  WHERE (("s"."user_id" = "auth"."uid"()) AND ("s"."is_active" = true)))));



CREATE POLICY "System can insert access logs" ON "public"."document_access_log" FOR INSERT WITH CHECK ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "System can insert audit log" ON "public"."permission_audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "System can insert notifications" ON "public"."user_notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "System updates lesson summary" ON "public"."lesson_completion_summary" USING (true) WITH CHECK (true);



CREATE POLICY "Teachers can grade lesson assignment submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Teachers can grade submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Teachers can view course submissions" ON "public"."lesson_assignment_submissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = ANY (ARRAY['consultor'::"public"."user_role_type", 'admin'::"public"."user_role_type", 'equipo_directivo'::"public"."user_role_type", 'lider_generacion'::"public"."user_role_type"])) AND ("ur"."is_active" = true)))));



CREATE POLICY "Teachers can view lesson assignment submissions for their assig" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Teachers can view shares" ON "public"."assignment_submission_shares" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = ANY (ARRAY['consultor'::"public"."user_role_type", 'admin'::"public"."user_role_type", 'equipo_directivo'::"public"."user_role_type", 'lider_generacion'::"public"."user_role_type"])) AND ("ur"."is_active" = true)))));



CREATE POLICY "Teachers can view submissions for their assignments" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Testers can update own assignment status" ON "public"."qa_scenario_assignments" FOR UPDATE TO "authenticated" USING (("tester_id" = "auth"."uid"())) WITH CHECK (("tester_id" = "auth"."uid"()));



CREATE POLICY "Testers can view own assignments" ON "public"."qa_scenario_assignments" FOR SELECT TO "authenticated" USING (("tester_id" = "auth"."uid"()));



CREATE POLICY "Users can add comments to their feedback" ON "public"."feedback_activity" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."platform_feedback"
  WHERE (("platform_feedback"."id" = "feedback_activity"."feedback_id") AND ("platform_feedback"."created_by" = "auth"."uid"())))) AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Users can add reactions to visible posts" ON "public"."post_reactions" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE ("p"."id" = "post_reactions"."post_id")))));



CREATE POLICY "Users can comment on visible posts" ON "public"."post_comments" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE ("p"."id" = "post_comments"."post_id")))));



CREATE POLICY "Users can create activities" ON "public"."activity_feed" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create folders in accessible workspaces" ON "public"."document_folders" FOR INSERT WITH CHECK ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Users can create groups in their community" ON "public"."group_assignment_groups" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "group_assignment_groups"."community_id") AND ("ur"."is_active" = true)))) OR (("community_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."school_id" = "group_assignment_groups"."school_id") AND ("ur"."is_active" = true)))))));



CREATE POLICY "Users can create meeting commitments" ON "public"."meeting_commitments" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can create mentions" ON "public"."user_mentions" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can create own favorites" ON "public"."church_meditation_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own preferences" ON "public"."church_meditation_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own recommendations" ON "public"."church_meditation_recommendations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own streaks" ON "public"."church_meditation_streaks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create posts in their communities" ON "public"."community_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "author_id") AND "public"."can_access_workspace"("auth"."uid"(), "workspace_id")));



CREATE POLICY "Users can create submissions" ON "public"."lesson_assignment_submissions" FOR INSERT WITH CHECK (("auth"."uid"() = "submitted_by"));



CREATE POLICY "Users can create submissions based on role" ON "public"."group_assignment_submissions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "consultant_role" ON ((("consultant_role"."community_id" = "gag"."community_id") AND ("consultant_role"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("consultant_role"."is_active" = true))))
  WHERE (("gag"."id" = "group_assignment_submissions"."group_id") AND ("consultant_role"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create versions for documents they can access" ON "public"."document_versions" FOR INSERT WITH CHECK ((("document_id" IN ( SELECT "cd"."id"
   FROM "public"."community_documents" "cd"
  WHERE (("cd"."workspace_id" IN ( SELECT "community_workspaces"."id"
           FROM "public"."community_workspaces"
          WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("cd"."uploaded_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "cd"."workspace_id") IS NOT NULL))))) AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "Users can delete agreements for deletable meetings" ON "public"."meeting_agreements" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_meetings" "cm"
  WHERE (("cm"."id" = "meeting_agreements"."meeting_id") AND (("cm"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
           FROM ("public"."community_workspaces" "cw"
             JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
          WHERE (("cw"."id" = "cm"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))))))));



CREATE POLICY "Users can delete attachments for deletable meetings" ON "public"."meeting_attachments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_meetings" "cm"
  WHERE (("cm"."id" = "meeting_attachments"."meeting_id") AND (("cm"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
           FROM ("public"."community_workspaces" "cw"
             JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
          WHERE (("cw"."id" = "cm"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))))))));



CREATE POLICY "Users can delete attendees for deletable meetings" ON "public"."meeting_attendees" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_meetings" "cm"
  WHERE (("cm"."id" = "meeting_attendees"."meeting_id") AND (("cm"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
           FROM ("public"."community_workspaces" "cw"
             JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
          WHERE (("cw"."id" = "cm"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))))))));



CREATE POLICY "Users can delete commitments for deletable meetings" ON "public"."meeting_commitments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_meetings" "cm"
  WHERE (("cm"."id" = "meeting_commitments"."meeting_id") AND (("cm"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
           FROM ("public"."community_workspaces" "cw"
             JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
          WHERE (("cw"."id" = "cm"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))))))));



CREATE POLICY "Users can delete groups in their community" ON "public"."group_assignment_groups" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "group_assignment_groups"."community_id") AND ("ur"."is_active" = true)))) OR (("community_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."school_id" = "group_assignment_groups"."school_id") AND ("ur"."is_active" = true)))))));



CREATE POLICY "Users can delete media for their posts" ON "public"."post_media" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete meeting attendees" ON "public"."meeting_attendees" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can delete meeting commitments" ON "public"."meeting_commitments" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can delete own attachments" ON "public"."message_attachments" FOR DELETE TO "authenticated" USING (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "Users can delete own favorites" ON "public"."church_meditation_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete tasks for deletable meetings" ON "public"."meeting_tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_meetings" "cm"
  WHERE (("cm"."id" = "meeting_tasks"."meeting_id") AND (("cm"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
           FROM ("public"."community_workspaces" "cw"
             JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
          WHERE (("cw"."id" = "cm"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))))))));



CREATE POLICY "Users can delete their own activities" ON "public"."activity_feed" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own comments" ON "public"."post_comments" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own documents or leaders can delete any" ON "public"."community_documents" FOR UPDATE USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("uploaded_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "workspace_id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))));



CREATE POLICY "Users can delete their own folders or leaders can delete any" ON "public"."document_folders" FOR DELETE USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("created_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "workspace_id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))));



CREATE POLICY "Users can delete their own meeting attachments" ON "public"."meeting_attachments" FOR DELETE USING (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "Users can delete their own posts" ON "public"."community_posts" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can insert media for their posts" ON "public"."post_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert meeting attendees" ON "public"."meeting_attendees" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert message attachments" ON "public"."message_attachments" FOR INSERT TO "authenticated" WITH CHECK (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "Users can insert own progress" ON "public"."user_progress" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own progress sessions" ON "public"."learning_path_progress_sessions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own activities" ON "public"."workspace_activities" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own audit logs" ON "public"."supervisor_auditorias" FOR INSERT WITH CHECK (("supervisor_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own completions" ON "public"."course_completions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own progress" ON "public"."lesson_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own test mode state" ON "public"."test_mode_state" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can join groups in their community" ON "public"."group_assignment_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "gag"."community_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "gag"."school_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("gag"."community_id" IS NULL) AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Users can leave groups in their community" ON "public"."group_assignment_members" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "gag"."community_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("ur"."is_active" = true))))));



CREATE POLICY "Users can manage own onboarding state" ON "public"."user_onboarding_state" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage own push subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own subscriptions" ON "public"."activity_subscriptions" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage transaction lines for their org" ON "public"."church_transaction_lines" USING (("transaction_id" IN ( SELECT "church_transactions"."id"
   FROM "public"."church_transactions"
  WHERE ("church_transactions"."organization_id" = "public"."user_church_organization_id"()))));



CREATE POLICY "Users can only access their church organization's accounts" ON "public"."church_accounts" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Users can only access their church organization's services" ON "public"."church_services" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Users can only access their church organization's songs" ON "public"."church_songs" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Users can only access their church organization's templates" ON "public"."church_presentation_templates" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Users can only access their church organization's transactions" ON "public"."church_transactions" USING (("organization_id" = "public"."user_church_organization_id"()));



CREATE POLICY "Users can only access their own church meditation sessions" ON "public"."church_meditation_sessions" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can remove their own reactions" ON "public"."post_reactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can save posts" ON "public"."saved_posts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages" ON "public"."workspace_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can unsave posts" ON "public"."saved_posts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update group memberships in their community" ON "public"."group_assignment_members" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "gag"."community_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "gag"."school_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("gag"."community_id" IS NULL) AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Users can update groups in their community" ON "public"."group_assignment_groups" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "group_assignment_groups"."community_id") AND ("ur"."is_active" = true)))) OR (("community_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."school_id" = "group_assignment_groups"."school_id") AND ("ur"."is_active" = true)))))));



CREATE POLICY "Users can update media for their posts" ON "public"."post_media" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own enrollment progress" ON "public"."course_enrollments" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notifications" ON "public"."user_notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own preferences" ON "public"."church_meditation_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own progress" ON "public"."user_progress" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own progress sessions" ON "public"."learning_path_progress_sessions" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("session_end" IS NULL))) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own recommendations" ON "public"."church_meditation_recommendations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own streaks" ON "public"."church_meditation_streaks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update submissions based on role" ON "public"."group_assignment_submissions" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"text", 'draft'::"text"]))) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "consultant_role" ON ((("consultant_role"."community_id" = "gag"."community_id") AND ("consultant_role"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("consultant_role"."is_active" = true))))
  WHERE (("gag"."id" = "group_assignment_submissions"."group_id") AND ("consultant_role"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update their own activities" ON "public"."activity_feed" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own church profile" ON "public"."church_profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update their own comments" ON "public"."post_comments" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own documents or leaders can update any" ON "public"."community_documents" FOR UPDATE USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("uploaded_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "workspace_id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))));



CREATE POLICY "Users can update their own folders or leaders can update any" ON "public"."document_folders" FOR UPDATE USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("created_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "workspace_id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))));



CREATE POLICY "Users can update their own posts" ON "public"."community_posts" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own progress" ON "public"."lesson_progress" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own test mode state" ON "public"."test_mode_state" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their sent messages" ON "public"."workspace_messages" FOR UPDATE USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can upload documents to accessible workspaces" ON "public"."community_documents" FOR INSERT WITH CHECK ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "Users can upload meeting attachments" ON "public"."meeting_attachments" FOR INSERT WITH CHECK (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "Users can view active triggers" ON "public"."notification_triggers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view activity for their feedback" ON "public"."feedback_activity" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."platform_feedback"
  WHERE (("platform_feedback"."id" = "feedback_activity"."feedback_id") AND ("platform_feedback"."created_by" = "auth"."uid"())))));



CREATE POLICY "Users can view aggregations" ON "public"."activity_aggregations" FOR SELECT USING (true);



CREATE POLICY "Users can view all reactions" ON "public"."post_reactions" FOR SELECT USING (true);



CREATE POLICY "Users can view church profiles in their organization" ON "public"."church_profiles" FOR SELECT USING (("organization_id" IN ( SELECT "church_profiles_1"."organization_id"
   FROM "public"."church_profiles" "church_profiles_1"
  WHERE ("church_profiles_1"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view clients for their school" ON "public"."clientes" FOR SELECT USING ((("school_id" IN ( SELECT "profiles"."school_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = 'admin'::"public"."user_role_type"))))));



CREATE POLICY "Users can view comments on visible posts" ON "public"."post_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE ("p"."id" = "post_comments"."post_id"))));



CREATE POLICY "Users can view community member badges" ON "public"."user_badges" FOR SELECT TO "authenticated" USING ((("displayed_in_community" = true) AND (EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur1"
     JOIN "public"."user_roles" "ur2" ON (("ur1"."community_id" = "ur2"."community_id")))
  WHERE (("ur1"."user_id" = "auth"."uid"()) AND ("ur2"."user_id" = "user_badges"."user_id") AND ("ur1"."is_active" = true) AND ("ur2"."is_active" = true))))));



CREATE POLICY "Users can view documents in accessible workspaces" ON "public"."community_documents" FOR SELECT USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("is_active" = true)));



CREATE POLICY "Users can view folders in accessible workspaces" ON "public"."document_folders" FOR SELECT USING (("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))));



CREATE POLICY "Users can view group members" ON "public"."group_assignment_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."user_is_in_group"("group_id", "auth"."uid"())));



CREATE POLICY "Users can view group memberships in their community" ON "public"."group_assignment_members" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "gag"."community_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Users can view groups in their community" ON "public"."group_assignment_groups" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "group_assignment_groups"."community_id") AND ("ur"."is_active" = true)))) OR (("community_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."school_id" = "group_assignment_groups"."school_id") AND ("ur"."is_active" = true)))))));



CREATE POLICY "Users can view media for visible posts" ON "public"."post_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE ("p"."id" = "post_media"."post_id"))));



CREATE POLICY "Users can view meeting attachments" ON "public"."meeting_attachments" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view meeting attendees" ON "public"."meeting_attendees" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view meeting commitments" ON "public"."meeting_commitments" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view mentions" ON "public"."post_mentions" FOR SELECT USING (true);



CREATE POLICY "Users can view mentions involving them" ON "public"."user_mentions" FOR SELECT USING ((("auth"."uid"() = "author_id") OR ("auth"."uid"() = "mentioned_user_id")));



CREATE POLICY "Users can view message attachments" ON "public"."message_attachments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view own and shared submissions" ON "public"."lesson_assignment_submissions" FOR SELECT USING ((("auth"."uid"() = "student_id") OR ("auth"."uid"() = "submitted_by") OR (EXISTS ( SELECT 1
   FROM "public"."assignment_submission_shares" "ass"
  WHERE (("ass"."source_submission_id" = "lesson_assignment_submissions"."id") AND ("ass"."shared_with_user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view own enrollments" ON "public"."course_enrollments" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own favorites" ON "public"."church_meditation_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own feedback permissions" ON "public"."feedback_permissions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own notifications" ON "public"."user_notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own preferences" ON "public"."church_meditation_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own progress" ON "public"."user_progress" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own progress sessions" ON "public"."learning_path_progress_sessions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."auth_is_admin"()));



CREATE POLICY "Users can view own recommendations" ON "public"."church_meditation_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own streaks" ON "public"."church_meditation_streaks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view posts from their communities" ON "public"."community_posts" FOR SELECT USING ("public"."can_access_workspace"("auth"."uid"(), "workspace_id"));



CREATE POLICY "Users can view submissions based on role" ON "public"."group_assignment_submissions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "consultant_role" ON ((("consultant_role"."community_id" = "gag"."community_id") AND ("consultant_role"."role_type" = 'consultor'::"public"."user_role_type") AND ("consultant_role"."is_active" = true))))
  WHERE (("gag"."id" = "group_assignment_submissions"."group_id") AND ("consultant_role"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON ((("ur"."community_id" = "gag"."community_id") AND ("ur"."is_active" = true))))
  WHERE (("gag"."id" = "group_assignment_submissions"."group_id") AND ("ur"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their church organization" ON "public"."church_organizations" FOR SELECT USING (("id" IN ( SELECT "church_profiles"."organization_id"
   FROM "public"."church_profiles"
  WHERE ("church_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own audit logs" ON "public"."supervisor_auditorias" FOR SELECT USING (("supervisor_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own badges" ON "public"."user_badges" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own completions" ON "public"."course_completions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own course assignments" ON "public"."course_assignments" FOR SELECT USING (("teacher_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own messages" ON "public"."workspace_messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can view their own progress" ON "public"."lesson_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own test mode state" ON "public"."test_mode_state" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their saved posts" ON "public"."saved_posts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their shares" ON "public"."assignment_submission_shares" FOR SELECT USING (("shared_with_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view transaction lines for their org transactions" ON "public"."church_transaction_lines" FOR SELECT USING (("transaction_id" IN ( SELECT "church_transactions"."id"
   FROM "public"."church_transactions"
  WHERE ("church_transactions"."organization_id" = "public"."user_church_organization_id"()))));



CREATE POLICY "Users can view versions of accessible documents" ON "public"."document_versions" FOR SELECT USING (("document_id" IN ( SELECT "cd"."id"
   FROM "public"."community_documents" "cd"
  WHERE (("cd"."workspace_id" IN ( SELECT "community_workspaces"."id"
           FROM "public"."community_workspaces"
          WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("cd"."is_active" = true)))));



CREATE POLICY "Users can view workspace activities" ON "public"."workspace_activities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "View own submissions" ON "public"."assignment_submissions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "View test overlays" ON "public"."role_permissions" FOR SELECT USING ((("is_test" = true) AND (("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."superadmins" "s"
  WHERE (("s"."user_id" = "auth"."uid"()) AND ("s"."is_active" = true)))))));



ALTER TABLE "public"."ab_grades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ab_grades_read_authenticated" ON "public"."ab_grades" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."ab_migration_plan" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ab_migration_plan_delete" ON "public"."ab_migration_plan" FOR DELETE USING (true);



CREATE POLICY "ab_migration_plan_insert" ON "public"."ab_migration_plan" FOR INSERT WITH CHECK (true);



CREATE POLICY "ab_migration_plan_select" ON "public"."ab_migration_plan" FOR SELECT USING (true);



CREATE POLICY "ab_migration_plan_update" ON "public"."ab_migration_plan" FOR UPDATE USING (true);



ALTER TABLE "public"."activity_aggregations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_feed" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_log_admin_select" ON "public"."session_activity_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "activity_log_consultor_select" ON "public"."session_activity_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "cs"."school_id")))
  WHERE (("cs"."id" = "session_activity_log"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."activity_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_consultor_directivo_view" ON "public"."assignment_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type", 'equipo_directivo'::"public"."user_role_type"]))))));



CREATE POLICY "admin_full_access" ON "public"."assessment_demo_access" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "admin_full_access" ON "public"."propuesta_consultores" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admin_full_access" ON "public"."propuesta_contenido_bloques" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admin_full_access" ON "public"."propuesta_documentos_biblioteca" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admin_full_access" ON "public"."propuesta_fichas_servicio" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admin_full_access" ON "public"."propuesta_generadas" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admin_full_access" ON "public"."propuesta_plantillas" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admin_full_access_assessment_actions" ON "public"."assessment_actions" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_full_access_assessment_areas" ON "public"."assessment_areas" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_full_access_assessment_cache" ON "public"."assessment_evaluation_cache" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_full_access_assessment_dimensions" ON "public"."assessment_dimensions" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_full_access_assessment_questions" ON "public"."assessment_questions" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_full_access_assessment_sections" ON "public"."assessment_sections" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_full_access_schools" ON "public"."schools" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "admin_insert_llm_usage" ON "public"."assessment_llm_usage" FOR INSERT WITH CHECK (("public"."auth_is_admin"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "admin_manage_assignments" ON "public"."assessment_assignments" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_manage_results" ON "public"."assessment_results" USING ("public"."auth_is_admin"());



CREATE POLICY "admin_or_consultor_can_read_clientes" ON "public"."clientes" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_consultor"("auth"."uid"()));



CREATE POLICY "admin_or_consultor_can_read_contratos" ON "public"."contratos" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_consultor"("auth"."uid"()));



CREATE POLICY "admin_or_consultor_can_read_cuotas" ON "public"."cuotas" FOR SELECT TO "authenticated" USING ("public"."is_admin_or_consultor"("auth"."uid"()));



CREATE POLICY "admin_read_write" ON "public"."roadmap_data" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "admin_update_submissions" ON "public"."assessment_submissions" FOR UPDATE USING ("public"."auth_is_admin"());



CREATE POLICY "admin_view_all_llm_usage" ON "public"."assessment_llm_usage" FOR SELECT USING ("public"."auth_is_admin"());



CREATE POLICY "admin_view_all_submissions" ON "public"."assessment_submissions" FOR SELECT USING ("public"."auth_is_admin"());



CREATE POLICY "admins_consultors_insert_sessions" ON "public"."debug_sessions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"]))))));



CREATE POLICY "admins_insert_bugs" ON "public"."debug_bugs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_modify_all_workspaces" ON "public"."community_workspaces" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_read_all_bugs" ON "public"."debug_bugs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_read_all_logs" ON "public"."debug_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_read_all_sessions" ON "public"."debug_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_read_all_workspaces" ON "public"."community_workspaces" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_read_audit_log" ON "public"."transformation_access_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"]))))));



CREATE POLICY "admins_update_all_bugs" ON "public"."debug_bugs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



CREATE POLICY "admins_update_all_sessions" ON "public"."debug_sessions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type")))));



ALTER TABLE "public"."assessment_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_context_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_context_questions_select" ON "public"."assessment_context_questions" FOR SELECT USING (true);



CREATE POLICY "assessment_context_questions_write" ON "public"."assessment_context_questions" USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assessment_demo_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_dimensions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_entity_year_weights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_evaluation_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_indicators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_indicators_delete" ON "public"."assessment_indicators" FOR DELETE USING ("public"."auth_is_assessment_admin"());



CREATE POLICY "assessment_indicators_insert" ON "public"."assessment_indicators" FOR INSERT WITH CHECK ("public"."auth_is_assessment_admin"());



CREATE POLICY "assessment_indicators_select" ON "public"."assessment_indicators" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."assessment_modules" "m"
     JOIN "public"."assessment_templates" "t" ON (("t"."id" = "m"."template_id")))
  WHERE (("m"."id" = "assessment_indicators"."module_id") AND ("t"."status" = 'published'::"text"))))));



CREATE POLICY "assessment_indicators_update" ON "public"."assessment_indicators" FOR UPDATE USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assessment_instance_assignees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_instance_assignees_select" ON "public"."assessment_instance_assignees" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "assessment_instance_assignees_write" ON "public"."assessment_instance_assignees" USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assessment_instance_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_instance_results_select" ON "public"."assessment_instance_results" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assessment_instance_assignees" "aia"
  WHERE (("aia"."instance_id" = "assessment_instance_results"."instance_id") AND ("aia"."user_id" = "auth"."uid"()))))));



CREATE POLICY "assessment_instance_results_write" ON "public"."assessment_instance_results" USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assessment_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_instances_insert" ON "public"."assessment_instances" FOR INSERT WITH CHECK ("public"."auth_is_assessment_admin"());



CREATE POLICY "assessment_instances_select" ON "public"."assessment_instances" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR (("school_id" IS NOT NULL) AND "public"."auth_is_school_directivo"("school_id")) OR (EXISTS ( SELECT 1
   FROM "public"."assessment_instance_assignees" "aia"
  WHERE (("aia"."instance_id" = "assessment_instances"."id") AND ("aia"."user_id" = "auth"."uid"()))))));



CREATE POLICY "assessment_instances_update" ON "public"."assessment_instances" FOR UPDATE USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assessment_instance_assignees" "aia"
  WHERE (("aia"."instance_id" = "assessment_instances"."id") AND ("aia"."user_id" = "auth"."uid"()) AND ("aia"."can_edit" = true))))));



ALTER TABLE "public"."assessment_llm_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_modules_delete" ON "public"."assessment_modules" FOR DELETE USING ("public"."auth_is_assessment_admin"());



CREATE POLICY "assessment_modules_insert" ON "public"."assessment_modules" FOR INSERT WITH CHECK ("public"."auth_is_assessment_admin"());



CREATE POLICY "assessment_modules_select" ON "public"."assessment_modules" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assessment_templates" "t"
  WHERE (("t"."id" = "assessment_modules"."template_id") AND ("t"."status" = 'published'::"text"))))));



CREATE POLICY "assessment_modules_update" ON "public"."assessment_modules" FOR UPDATE USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assessment_objectives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_objectives_delete_authenticated" ON "public"."assessment_objectives" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "assessment_objectives_insert_authenticated" ON "public"."assessment_objectives" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "assessment_objectives_select_authenticated" ON "public"."assessment_objectives" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "assessment_objectives_update_authenticated" ON "public"."assessment_objectives" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."assessment_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_responses_insert" ON "public"."assessment_responses" FOR INSERT WITH CHECK (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assessment_instance_assignees" "aia"
  WHERE (("aia"."instance_id" = "assessment_responses"."instance_id") AND ("aia"."user_id" = "auth"."uid"()) AND ("aia"."can_edit" = true))))));



CREATE POLICY "assessment_responses_select" ON "public"."assessment_responses" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assessment_instance_assignees" "aia"
  WHERE (("aia"."instance_id" = "assessment_responses"."instance_id") AND ("aia"."user_id" = "auth"."uid"()))))));



CREATE POLICY "assessment_responses_update" ON "public"."assessment_responses" FOR UPDATE USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assessment_instance_assignees" "aia"
  WHERE (("aia"."instance_id" = "assessment_responses"."instance_id") AND ("aia"."user_id" = "auth"."uid"()) AND ("aia"."can_edit" = true))))));



ALTER TABLE "public"."assessment_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_sub_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_sub_questions_select" ON "public"."assessment_sub_questions" FOR SELECT USING (true);



CREATE POLICY "assessment_sub_questions_write" ON "public"."assessment_sub_questions" USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assessment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessment_template_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_template_snapshots_insert" ON "public"."assessment_template_snapshots" FOR INSERT WITH CHECK ("public"."auth_is_assessment_admin"());



CREATE POLICY "assessment_template_snapshots_select" ON "public"."assessment_template_snapshots" FOR SELECT USING (true);



ALTER TABLE "public"."assessment_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_templates_delete_admin_only" ON "public"."assessment_templates" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "assessment_templates_insert_admin_only" ON "public"."assessment_templates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "assessment_templates_select_admin_consultor" ON "public"."assessment_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "assessment_templates_update_admin_only" ON "public"."assessment_templates" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."assessment_year_expectations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assessment_year_expectations_select" ON "public"."assessment_year_expectations" FOR SELECT USING (true);



CREATE POLICY "assessment_year_expectations_write" ON "public"."assessment_year_expectations" USING ("public"."auth_is_assessment_admin"());



ALTER TABLE "public"."assignment_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignment_feedback_admin_all" ON "public"."assignment_feedback" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "assignment_feedback_instructor_manage" ON "public"."assignment_feedback" TO "authenticated" USING (("instructor_id" = "auth"."uid"())) WITH CHECK (("instructor_id" = "auth"."uid"()));



CREATE POLICY "assignment_feedback_student_view_own" ON "public"."assignment_feedback" FOR SELECT TO "authenticated" USING (("student_id" = "auth"."uid"()));



CREATE POLICY "assignment_feedback_teacher_course" ON "public"."assignment_feedback" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."assignment_instances" "ai"
  WHERE (("ai"."id" = "assignment_feedback"."assignment_id") AND "public"."auth_is_course_teacher"("ai"."course_id")))));



ALTER TABLE "public"."assignment_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignment_instances_admin_all" ON "public"."assignment_instances" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "assignment_instances_student_view" ON "public"."assignment_instances" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_student"("course_id"));



CREATE POLICY "assignment_instances_teacher_manage" ON "public"."assignment_instances" TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."auth_is_course_teacher"("course_id"))) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."auth_is_course_teacher"("course_id")));



ALTER TABLE "public"."assignment_submission_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignment_templates_admin_all" ON "public"."assignment_templates" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "assignment_templates_authenticated_view" ON "public"."assignment_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "assignment_templates_creator_manage" ON "public"."assignment_templates" TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "attendees_admin_all" ON "public"."session_attendees" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "attendees_consultor_select" ON "public"."session_attendees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_attendees"."session_id") AND ("sf"."user_id" = "auth"."uid"())))));



CREATE POLICY "attendees_consultor_update" ON "public"."session_attendees" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_attendees"."session_id") AND ("sf"."user_id" = "auth"."uid"())))));



CREATE POLICY "attendees_cross_consultor_select" ON "public"."session_attendees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "cs"."school_id")))
  WHERE (("cs"."id" = "session_attendees"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "attendees_gc_leader_select" ON "public"."session_attendees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_attendees"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "attendees_gc_leader_update" ON "public"."session_attendees" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_attendees"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "attendees_gc_member_insert" ON "public"."session_attendees" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_attendees"."session_id") AND ("ur"."user_id" = "session_attendees"."user_id") AND ("ur"."is_active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_attendees"."session_id") AND ("sf"."user_id" = "auth"."uid"()))))));



CREATE POLICY "attendees_gc_member_select" ON "public"."session_attendees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_attendees"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))));



CREATE POLICY "authenticated_insert_bugs" ON "public"."debug_bugs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "authenticated_insert_logs" ON "public"."debug_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "authenticated_read_transformation_rubric" ON "public"."transformation_rubric" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_users_view_growth_communities" ON "public"."growth_communities" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blocks_admin_all" ON "public"."blocks" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "blocks_delete_policy" ON "public"."blocks" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "blocks_insert_policy" ON "public"."blocks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "blocks_select_policy" ON "public"."blocks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "blocks_student_view" ON "public"."blocks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."lessons" "l"
     JOIN "public"."modules" "m" ON (("m"."id" = "l"."module_id")))
  WHERE (("l"."id" = "blocks"."lesson_id") AND "public"."auth_is_course_student"("m"."course_id")))));



CREATE POLICY "blocks_teacher_manage" ON "public"."blocks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."lessons" "l"
     JOIN "public"."modules" "m" ON (("m"."id" = "l"."module_id")))
  WHERE (("l"."id" = "blocks"."lesson_id") AND "public"."auth_is_course_teacher"("m"."course_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."lessons" "l"
     JOIN "public"."modules" "m" ON (("m"."id" = "l"."module_id")))
  WHERE (("l"."id" = "blocks"."lesson_id") AND "public"."auth_is_course_teacher"("m"."course_id")))));



CREATE POLICY "blocks_update_policy" ON "public"."blocks" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."bot_identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_link_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_pending_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_processed_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cha_admin_all" ON "public"."contract_hour_allocations" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "cha_consultor_select" ON "public"."contract_hour_allocations" FOR SELECT USING (("contrato_id" IN ( SELECT "cs"."contrato_id"
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."session_facilitators" "sf" ON (("sf"."session_id" = "cs"."id")))
  WHERE (("sf"."user_id" = "auth"."uid"()) AND ("cs"."contrato_id" IS NOT NULL)))));



CREATE POLICY "cha_equipo_directivo_select" ON "public"."contract_hour_allocations" FOR SELECT USING (("contrato_id" IN ( SELECT "c"."id"
   FROM ("public"."contratos" "c"
     JOIN "public"."clientes" "cl" ON (("c"."cliente_id" = "cl"."id")))
  WHERE ("cl"."school_id" IN ( SELECT "ur"."school_id"
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("ur"."is_active" = true)))))));



CREATE POLICY "chl_admin_insert" ON "public"."contract_hours_ledger" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "chl_admin_select" ON "public"."contract_hours_ledger" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "chl_admin_update" ON "public"."contract_hours_ledger" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "chl_consultor_select" ON "public"."contract_hours_ledger" FOR SELECT USING (("session_id" IN ( SELECT "cs"."id"
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."session_facilitators" "sf" ON (("sf"."session_id" = "cs"."id")))
  WHERE ("sf"."user_id" = "auth"."uid"()))));



CREATE POLICY "chl_equipo_directivo_select" ON "public"."contract_hours_ledger" FOR SELECT USING (("allocation_id" IN ( SELECT "cha"."id"
   FROM "public"."contract_hour_allocations" "cha"
  WHERE ("cha"."contrato_id" IN ( SELECT "c"."id"
           FROM ("public"."contratos" "c"
             JOIN "public"."clientes" "cl" ON (("c"."cliente_id" = "cl"."id")))
          WHERE ("cl"."school_id" IN ( SELECT "ur"."school_id"
                   FROM "public"."user_roles" "ur"
                  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("ur"."is_active" = true)))))))));



CREATE POLICY "chrl_admin_insert" ON "public"."contract_hour_reallocation_log" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "chrl_admin_select" ON "public"."contract_hour_reallocation_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "chrl_equipo_directivo_select" ON "public"."contract_hour_reallocation_log" FOR SELECT USING (("contrato_id" IN ( SELECT "c"."id"
   FROM ("public"."contratos" "c"
     JOIN "public"."clientes" "cl" ON (("c"."cliente_id" = "cl"."id")))
  WHERE ("cl"."school_id" IN ( SELECT "ur"."school_id"
           FROM "public"."user_roles" "ur"
          WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("ur"."is_active" = true)))))));



ALTER TABLE "public"."church_about_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_contact_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_hero_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_meditation_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_meditation_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_meditation_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_meditation_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_meditation_streaks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_prayer_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_presentation_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_sermons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_songs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_transaction_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."church_website_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."codebase_index" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "collaborators_delete" ON "public"."transformation_assessment_collaborators" FOR DELETE TO "authenticated" USING (("public"."is_admin_or_consultor"("auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."transformation_assessments" "ta"
  WHERE (("ta"."id" = "transformation_assessment_collaborators"."assessment_id") AND ("ta"."created_by" = "auth"."uid"()))))));



CREATE POLICY "collaborators_insert" ON "public"."transformation_assessment_collaborators" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin_or_consultor"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."transformation_assessments" "ta"
  WHERE (("ta"."id" = "transformation_assessment_collaborators"."assessment_id") AND (("ta"."created_by" = "auth"."uid"()) OR "public"."is_assessment_collaborator"("ta"."id", "auth"."uid"())))))));



CREATE POLICY "collaborators_select" ON "public"."transformation_assessment_collaborators" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."transformation_assessments" "ta"
  WHERE (("ta"."id" = "transformation_assessment_collaborators"."assessment_id") AND ("public"."is_admin_or_consultor"("auth"."uid"()) OR ("ta"."school_id" = ANY ("public"."user_school_ids"("auth"."uid"()))) OR ("ta"."created_by" = "auth"."uid"()) OR "public"."is_assessment_collaborator"("ta"."id", "auth"."uid"()))))));



CREATE POLICY "collaborators_service_role" ON "public"."transformation_assessment_collaborators" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "comms_admin_all" ON "public"."session_communications" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "comms_consultor_insert" ON "public"."session_communications" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_communications"."session_id") AND ("sf"."user_id" = "auth"."uid"()))))));



CREATE POLICY "comms_consultor_select" ON "public"."session_communications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "cs"."school_id")))
  WHERE (("cs"."id" = "session_communications"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "comms_gc_member_select" ON "public"."session_communications" FOR SELECT USING ((("visibility" = 'all_participants'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_communications"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



ALTER TABLE "public"."community_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_managers_modify_their_workspace" ON "public"."community_workspaces" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'community_manager'::"public"."user_role_type") AND ("user_roles"."community_id" = "community_workspaces"."community_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'community_manager'::"public"."user_role_type") AND ("user_roles"."community_id" = "community_workspaces"."community_id")))));



ALTER TABLE "public"."community_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_messages_delete_own" ON "public"."community_messages" FOR DELETE TO "authenticated" USING (("author_id" = "auth"."uid"()));



CREATE POLICY "community_messages_insert_own" ON "public"."community_messages" FOR INSERT TO "authenticated" WITH CHECK (("author_id" = "auth"."uid"()));



CREATE POLICY "community_messages_select" ON "public"."community_messages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "community_messages_service_role" ON "public"."community_messages" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "community_messages_update_own" ON "public"."community_messages" FOR UPDATE TO "authenticated" USING (("author_id" = "auth"."uid"())) WITH CHECK (("author_id" = "auth"."uid"()));



ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultant_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultant_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultants_read_school_workspaces" ON "public"."community_workspaces" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles"
     JOIN "public"."growth_communities" ON (("growth_communities"."school_id" = "user_roles"."school_id")))
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'consultor'::"public"."user_role_type") AND ("growth_communities"."id" = "community_workspaces"."community_id")))));



ALTER TABLE "public"."consultor_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultors_insert_bugs" ON "public"."debug_bugs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."role_type" = 'consultor'::"public"."user_role_type")))));



CREATE POLICY "consultors_read_scoped_bugs" ON "public"."debug_bugs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND (("debug_bugs"."user_id" = "auth"."uid"()) OR (("debug_bugs"."metadata" ->> 'school_id'::"text") IN ( SELECT ("user_roles"."school_id")::"text" AS "school_id"
           FROM "public"."user_roles"
          WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."school_id" IS NOT NULL)))))))));



CREATE POLICY "consultors_update_scoped_bugs" ON "public"."debug_bugs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND (("debug_bugs"."user_id" = "auth"."uid"()) OR (("debug_bugs"."metadata" ->> 'school_id'::"text") IN ( SELECT ("user_roles"."school_id")::"text" AS "school_id"
           FROM "public"."user_roles"
          WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."school_id" IS NOT NULL))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type")))));



ALTER TABLE "public"."context_general_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."context_general_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_extraction_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_hour_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_hour_reallocation_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_hours_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contratos_delete_admin_only" ON "public"."contratos" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "contratos_insert_admin_only" ON "public"."contratos" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "contratos_select_admin_only" ON "public"."contratos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "contratos_update_admin_only" ON "public"."contratos" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."course_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_assignments_admin_all" ON "public"."course_assignments" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "course_assignments_teacher_view_own" ON "public"."course_assignments" FOR SELECT TO "authenticated" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."course_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_enrollments_admin_all" ON "public"."course_enrollments" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "course_enrollments_teacher_view" ON "public"."course_enrollments" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_teacher"("course_id"));



CREATE POLICY "course_enrollments_user_view_own" ON "public"."course_enrollments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."course_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "courses_admin_all" ON "public"."courses" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "courses_learning_path_member_view" ON "public"."courses" FOR SELECT TO "authenticated" USING ("public"."auth_is_learning_path_member"("id"));



CREATE POLICY "cr_admin_all" ON "public"."consultant_rates" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "cr_consultor_select_own" ON "public"."consultant_rates" FOR SELECT USING (("consultant_id" = "auth"."uid"()));



ALTER TABLE "public"."cuotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debug_bugs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debug_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debug_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_role_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_access_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "edit_requests_admin_all" ON "public"."session_edit_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "edit_requests_consultor_insert" ON "public"."session_edit_requests" FOR INSERT WITH CHECK ((("requested_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_edit_requests"."session_id") AND ("sf"."user_id" = "auth"."uid"()))))));



CREATE POLICY "edit_requests_consultor_select" ON "public"."session_edit_requests" FOR SELECT USING (("requested_by" = "auth"."uid"()));



CREATE POLICY "enrolled_or_owner_can_read_courses" ON "public"."courses" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."course_enrollments" "ce"
  WHERE (("ce"."course_id" = "courses"."id") AND ("ce"."user_id" = "auth"."uid"())))) OR ("created_by" = "auth"."uid"()) OR "public"."is_admin_or_consultor"("auth"."uid"())));



CREATE POLICY "enrollments_admin_all" ON "public"."program_enrollments" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "entity_year_weights_delete" ON "public"."assessment_entity_year_weights" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "entity_year_weights_insert" ON "public"."assessment_entity_year_weights" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "entity_year_weights_select" ON "public"."assessment_entity_year_weights" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



CREATE POLICY "entity_year_weights_update" ON "public"."assessment_entity_year_weights" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exec_sql_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_admin_all" ON "public"."expense_categories" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "expense_categories_authenticated_view" ON "public"."expense_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "expense_categories_read" ON "public"."expense_categories" FOR SELECT USING (true);



ALTER TABLE "public"."expense_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_items_admin_all" ON "public"."expense_items" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "expense_items_delete" ON "public"."expense_items" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"()) AND (("er"."status")::"text" = 'draft'::"text")))) AND ((EXISTS ( SELECT 1
   FROM "public"."expense_report_access"
  WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true)))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false))));



CREATE POLICY "expense_items_insert" ON "public"."expense_items" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"()) AND (("er"."status")::"text" = 'draft'::"text")))) AND ((EXISTS ( SELECT 1
   FROM "public"."expense_report_access"
  WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true)))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false))));



CREATE POLICY "expense_items_select" ON "public"."expense_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ((("er"."submitted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
           FROM "public"."expense_report_access"
          WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true))))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false))))));



CREATE POLICY "expense_items_update" ON "public"."expense_items" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"()) AND (("er"."status")::"text" = 'draft'::"text")))) AND ((EXISTS ( SELECT 1
   FROM "public"."expense_report_access"
  WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true)))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false)))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"()) AND (("er"."status")::"text" = 'draft'::"text")))) AND ((EXISTS ( SELECT 1
   FROM "public"."expense_report_access"
  WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true)))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false))));



CREATE POLICY "expense_items_user_own" ON "public"."expense_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"())))));



ALTER TABLE "public"."expense_report_access" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_report_access_admin_manage" ON "public"."expense_report_access" USING (COALESCE("public"."is_global_admin"("auth"."uid"()), false)) WITH CHECK (COALESCE("public"."is_global_admin"("auth"."uid"()), false));



CREATE POLICY "expense_report_access_self_read" ON "public"."expense_report_access" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."expense_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_reports_access" ON "public"."expense_reports" USING (((("submitted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."expense_report_access"
  WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true))))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false))) WITH CHECK (((("submitted_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."expense_report_access"
  WHERE (("expense_report_access"."user_id" = "auth"."uid"()) AND ("expense_report_access"."can_submit" = true))))) OR COALESCE("public"."is_global_admin"("auth"."uid"()), false)));



CREATE POLICY "expense_reports_admin_all" ON "public"."expense_reports" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "expense_reports_insert" ON "public"."expense_reports" FOR INSERT WITH CHECK (("submitted_by" = "auth"."uid"()));



CREATE POLICY "expense_reports_user_own" ON "public"."expense_reports" TO "authenticated" USING (("submitted_by" = "auth"."uid"())) WITH CHECK (("submitted_by" = "auth"."uid"()));



CREATE POLICY "facilitators_admin_all" ON "public"."session_facilitators" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "facilitators_consultor_select" ON "public"."session_facilitators" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "cs"."school_id")))
  WHERE (("cs"."id" = "session_facilitators"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "facilitators_gc_member_select" ON "public"."session_facilitators" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_facilitators"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."feedback_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_activity_admin_all" ON "public"."feedback_activity" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "feedback_activity_user_view_own" ON "public"."feedback_activity" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."feedback_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_permissions_admin_all" ON "public"."feedback_permissions" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "feedback_permissions_user_view_own" ON "public"."feedback_permissions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."feriados_chile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feriados_chile_admin_all" ON "public"."feriados_chile" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "feriados_chile_select_all" ON "public"."feriados_chile" FOR SELECT USING (true);



ALTER TABLE "public"."fx_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fx_rates_admin_insert" ON "public"."fx_rates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "fx_rates_authenticated_select" ON "public"."fx_rates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."generations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generations_admin_all" ON "public"."generations" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "generations_delete_policy" ON "public"."generations" FOR DELETE USING ("public"."auth_is_admin"());



CREATE POLICY "generations_insert_policy" ON "public"."generations" FOR INSERT WITH CHECK (("public"."auth_is_admin"() OR "public"."auth_has_school_access_uuid"(("school_id")::bigint)));



CREATE POLICY "generations_school_members_view" ON "public"."generations" FOR SELECT TO "authenticated" USING ("public"."auth_has_school_access"(("school_id")::bigint));



CREATE POLICY "generations_select_policy" ON "public"."generations" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("public"."auth_is_admin"() OR "public"."auth_has_school_access_uuid"(("school_id")::bigint))));



CREATE POLICY "generations_update_policy" ON "public"."generations" FOR UPDATE USING (("public"."auth_is_admin"() OR "public"."auth_has_school_access_uuid"(("school_id")::bigint))) WITH CHECK (("public"."auth_is_admin"() OR "public"."auth_has_school_access_uuid"(("school_id")::bigint)));



ALTER TABLE "public"."group_assignment_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_assignment_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_assignment_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_assignment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_communities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_communities_admin_all" ON "public"."growth_communities" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "growth_communities_delete_policy" ON "public"."growth_communities" FOR DELETE USING ("public"."auth_is_admin"());



CREATE POLICY "growth_communities_insert_policy" ON "public"."growth_communities" FOR INSERT WITH CHECK (("public"."auth_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."generations" "g"
  WHERE (("g"."id" = "growth_communities"."generation_id") AND "public"."auth_has_school_access_uuid"(("g"."school_id")::bigint))))));



CREATE POLICY "growth_communities_select_policy" ON "public"."growth_communities" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("public"."auth_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."generations" "g"
  WHERE (("g"."id" = "growth_communities"."generation_id") AND "public"."auth_has_school_access_uuid"(("g"."school_id")::bigint)))))));



CREATE POLICY "growth_communities_update_policy" ON "public"."growth_communities" FOR UPDATE USING (("public"."auth_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."generations" "g"
  WHERE (("g"."id" = "growth_communities"."generation_id") AND "public"."auth_has_school_access_uuid"(("g"."school_id")::bigint)))))) WITH CHECK (("public"."auth_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."generations" "g"
  WHERE (("g"."id" = "growth_communities"."generation_id") AND "public"."auth_has_school_access_uuid"(("g"."school_id")::bigint))))));



ALTER TABLE "public"."hour_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hour_types_admin_insert" ON "public"."hour_types" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "hour_types_admin_update" ON "public"."hour_types" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "hour_types_authenticated_select" ON "public"."hour_types" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."learning_path_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learning_path_assignments_delete_policy" ON "public"."learning_path_assignments" FOR DELETE USING (true);



CREATE POLICY "learning_path_assignments_insert_policy" ON "public"."learning_path_assignments" FOR INSERT WITH CHECK (true);



CREATE POLICY "learning_path_assignments_select_policy" ON "public"."learning_path_assignments" FOR SELECT USING (true);



CREATE POLICY "learning_path_assignments_update_policy" ON "public"."learning_path_assignments" FOR UPDATE USING (true);



CREATE POLICY "learning_path_assignments_user_progress_update" ON "public"."learning_path_assignments" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."learning_path_progress_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ledger_admin_all" ON "public"."program_hours_ledger" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."lesson_assignment_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_assignment_submissions_admin_all" ON "public"."lesson_assignment_submissions" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "lesson_assignment_submissions_student_own" ON "public"."lesson_assignment_submissions" TO "authenticated" USING (("student_id" = "auth"."uid"())) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "lesson_assignment_submissions_teacher_view" ON "public"."lesson_assignment_submissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."lesson_assignments" "la"
  WHERE (("la"."id" = "lesson_assignment_submissions"."assignment_id") AND "public"."auth_is_course_teacher"("la"."course_id")))));



ALTER TABLE "public"."lesson_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_assignments_admin_all" ON "public"."lesson_assignments" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "lesson_assignments_student_view" ON "public"."lesson_assignments" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_student"("course_id"));



CREATE POLICY "lesson_assignments_teacher_manage" ON "public"."lesson_assignments" TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."auth_is_course_teacher"("course_id"))) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."auth_is_course_teacher"("course_id")));



ALTER TABLE "public"."lesson_completion_summary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lesson_progress_admin_all" ON "public"."lesson_progress" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "lesson_progress_teacher_view" ON "public"."lesson_progress" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."lessons" "l"
     JOIN "public"."modules" "m" ON (("m"."id" = "l"."module_id")))
  WHERE (("l"."id" = "lesson_progress"."lesson_id") AND "public"."auth_is_course_teacher"("m"."course_id")))));



CREATE POLICY "lesson_progress_user_own" ON "public"."lesson_progress" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lessons_admin_all" ON "public"."lessons" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "lessons_student_view" ON "public"."lessons" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_student"(( SELECT "m"."course_id"
   FROM "public"."modules" "m"
  WHERE ("m"."id" = "lessons"."module_id"))));



CREATE POLICY "lessons_teacher_manage" ON "public"."lessons" TO "authenticated" USING ("public"."auth_is_course_teacher"(( SELECT "m"."course_id"
   FROM "public"."modules" "m"
  WHERE ("m"."id" = "lessons"."module_id")))) WITH CHECK ("public"."auth_is_course_teacher"(( SELECT "m"."course_id"
   FROM "public"."modules" "m"
  WHERE ("m"."id" = "lessons"."module_id"))));



ALTER TABLE "public"."licitacion_ates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitacion_ates_admin_all" ON "public"."licitacion_ates" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitacion_ates_encargado_insert" ON "public"."licitacion_ates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_ates"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_ates_encargado_select" ON "public"."licitacion_ates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_ates"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_ates_encargado_update" ON "public"."licitacion_ates" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_ates"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."licitacion_comision" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitacion_comision_admin_all" ON "public"."licitacion_comision" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitacion_comision_encargado_insert" ON "public"."licitacion_comision" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_comision"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_comision_encargado_select" ON "public"."licitacion_comision" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_comision"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_comision_encargado_update" ON "public"."licitacion_comision" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_comision"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."licitacion_consultas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitacion_consultas_admin_all" ON "public"."licitacion_consultas" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitacion_consultas_encargado_insert" ON "public"."licitacion_consultas" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_consultas"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_consultas_encargado_select" ON "public"."licitacion_consultas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_consultas"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_consultas_encargado_update" ON "public"."licitacion_consultas" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_consultas"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."licitacion_documentos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitacion_documentos_admin_all" ON "public"."licitacion_documentos" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitacion_documentos_encargado_insert" ON "public"."licitacion_documentos" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_documentos"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_documentos_encargado_select" ON "public"."licitacion_documentos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_documentos"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."licitacion_evaluaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitacion_evaluaciones_admin_all" ON "public"."licitacion_evaluaciones" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitacion_evaluaciones_encargado_insert" ON "public"."licitacion_evaluaciones" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_evaluaciones"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_evaluaciones_encargado_select" ON "public"."licitacion_evaluaciones" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_evaluaciones"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_evaluaciones_encargado_update" ON "public"."licitacion_evaluaciones" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_evaluaciones"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."licitacion_historial" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitacion_historial_admin_all" ON "public"."licitacion_historial" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitacion_historial_encargado_insert" ON "public"."licitacion_historial" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_historial"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "licitacion_historial_encargado_select" ON "public"."licitacion_historial" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."licitaciones" "l"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "l"."school_id")))
  WHERE (("l"."id" = "licitacion_historial"."licitacion_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."licitaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "licitaciones_admin_all" ON "public"."licitaciones" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitaciones_encargado_select" ON "public"."licitaciones" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("user_roles"."school_id" = "licitaciones"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "licitaciones_encargado_update" ON "public"."licitaciones" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("user_roles"."school_id" = "licitaciones"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "materials_admin_all" ON "public"."session_materials" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "materials_consultor_delete" ON "public"."session_materials" FOR DELETE USING (("uploaded_by" = "auth"."uid"()));



CREATE POLICY "materials_consultor_insert" ON "public"."session_materials" FOR INSERT WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_materials"."session_id") AND ("sf"."user_id" = "auth"."uid"()))))));



CREATE POLICY "materials_consultor_select" ON "public"."session_materials" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "cs"."school_id")))
  WHERE (("cs"."id" = "session_materials"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "materials_gc_member_select" ON "public"."session_materials" FOR SELECT USING ((("visibility" = 'all_participants'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_materials"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



ALTER TABLE "public"."meeting_agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_commitments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_work_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_delete_transformation_conversation_messages" ON "public"."transformation_conversation_messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."transformation_assessments" "ta"
  WHERE (("ta"."id" = "transformation_conversation_messages"."assessment_id") AND "public"."has_transformation_access"("ta"."growth_community_id")))));



CREATE POLICY "members_delete_transformation_results" ON "public"."transformation_results" FOR DELETE USING (("public"."has_transformation_access"(( SELECT "transformation_assessments"."growth_community_id"
   FROM "public"."transformation_assessments"
  WHERE ("transformation_assessments"."id" = "transformation_results"."assessment_id"))) AND (EXISTS ( SELECT 1
   FROM ("public"."transformation_assessments" "ta"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "ta"."growth_community_id")))
  WHERE (("ta"."id" = "transformation_results"."assessment_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])))))));



CREATE POLICY "members_insert_transformation_assessments" ON "public"."transformation_assessments" FOR INSERT WITH CHECK (("public"."has_transformation_access"("growth_community_id") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND (("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) OR ("ur"."community_id" = "transformation_assessments"."growth_community_id")))))));



CREATE POLICY "members_insert_transformation_conversation_messages" ON "public"."transformation_conversation_messages" FOR INSERT WITH CHECK (("public"."has_transformation_access"(( SELECT "transformation_assessments"."growth_community_id"
   FROM "public"."transformation_assessments"
  WHERE ("transformation_assessments"."id" = "transformation_conversation_messages"."assessment_id"))) AND (EXISTS ( SELECT 1
   FROM ("public"."transformation_assessments" "ta"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "ta"."growth_community_id")))
  WHERE (("ta"."id" = "transformation_conversation_messages"."assessment_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "members_insert_transformation_results" ON "public"."transformation_results" FOR INSERT WITH CHECK (("public"."has_transformation_access"(( SELECT "transformation_assessments"."growth_community_id"
   FROM "public"."transformation_assessments"
  WHERE ("transformation_assessments"."id" = "transformation_results"."assessment_id"))) AND (EXISTS ( SELECT 1
   FROM ("public"."transformation_assessments" "ta"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "ta"."growth_community_id")))
  WHERE (("ta"."id" = "transformation_results"."assessment_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "members_read_their_workspaces" ON "public"."community_workspaces" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true) AND ("user_roles"."community_id" = "community_workspaces"."community_id")))));



CREATE POLICY "members_read_transformation_assessments" ON "public"."transformation_assessments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND (("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) OR ("ur"."community_id" = "transformation_assessments"."growth_community_id"))))));



CREATE POLICY "members_read_transformation_conversation_messages" ON "public"."transformation_conversation_messages" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."transformation_assessments" "ta"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "ta"."growth_community_id")))
  WHERE (("ta"."id" = "transformation_conversation_messages"."assessment_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])))))));



CREATE POLICY "members_read_transformation_results" ON "public"."transformation_results" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."transformation_assessments" "ta"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "ta"."growth_community_id")))
  WHERE (("ta"."id" = "transformation_results"."assessment_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])))))));



CREATE POLICY "members_update_transformation_assessments" ON "public"."transformation_assessments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND (("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) OR ("ur"."community_id" = "transformation_assessments"."growth_community_id")))))) WITH CHECK (("public"."has_transformation_access"("growth_community_id") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND (("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) OR ("ur"."community_id" = "transformation_assessments"."growth_community_id")))))));



CREATE POLICY "members_update_transformation_results" ON "public"."transformation_results" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."transformation_assessments" "ta"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "ta"."growth_community_id")))
  WHERE (("ta"."id" = "transformation_results"."assessment_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))) WITH CHECK ("public"."has_transformation_access"(( SELECT "transformation_assessments"."growth_community_id"
   FROM "public"."transformation_assessments"
  WHERE ("transformation_assessments"."id" = "transformation_results"."assessment_id"))));



ALTER TABLE "public"."message_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reactions_delete" ON "public"."message_reactions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "message_reactions_insert" ON "public"."message_reactions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "message_reactions_select" ON "public"."message_reactions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "message_reactions_service_role" ON "public"."message_reactions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."message_threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_threads_insert_own" ON "public"."message_threads" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



COMMENT ON POLICY "message_threads_insert_own" ON "public"."message_threads" IS 'Allows authenticated users to create threads where they are the creator';



CREATE POLICY "message_threads_select_workspace" ON "public"."message_threads" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "message_threads_service_role" ON "public"."message_threads" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "message_threads_update_own" ON "public"."message_threads" FOR UPDATE TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "modules_admin_all" ON "public"."modules" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "modules_student_view" ON "public"."modules" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_student"("course_id"));



CREATE POLICY "modules_teacher_manage" ON "public"."modules" TO "authenticated" USING ("public"."auth_is_course_teacher"("course_id")) WITH CHECK ("public"."auth_is_course_teacher"("course_id"));



ALTER TABLE "public"."news_articles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "news_articles_admin_cm_all" ON "public"."news_articles" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'community_manager'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'community_manager'::"public"."user_role_type"])) AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."notification_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_events_admin_all" ON "public"."notification_events" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



ALTER TABLE "public"."notification_triggers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_triggers_admin_all" ON "public"."notification_triggers" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



ALTER TABLE "public"."notification_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_types_select_policy" ON "public"."notification_types" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_all" ON "public"."session_notifications" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "notifications_delete_policy" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_insert_policy" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_select_policy" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_policy" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_user_self_select" ON "public"."session_notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."pasantias_programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pasantias_quote_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pasantias_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_feedback_admin_all" ON "public"."platform_feedback" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "platform_feedback_user_own" ON "public"."platform_feedback" TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."post_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_hashtags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_hours_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programa_bases_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programa_bases_templates_admin_all" ON "public"."programa_bases_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "programa_bases_templates_encargado_select" ON "public"."programa_bases_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "programa_eval_criterios_admin_all" ON "public"."programa_evaluacion_criterios" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "programa_eval_criterios_encargado_select" ON "public"."programa_evaluacion_criterios" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'encargado_licitacion'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."programa_evaluacion_criterios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propuesta_consultores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propuesta_contenido_bloques" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propuesta_documentos_biblioteca" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propuesta_fichas_servicio" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propuesta_generadas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."propuesta_plantillas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_coverage_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_feature_checklist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_lighthouse_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_load_test_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_performance_budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_scenario_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_scenarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qa_scenarios_admin_delete" ON "public"."qa_scenarios" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "qa_scenarios_admin_insert" ON "public"."qa_scenarios" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "qa_scenarios_admin_update" ON "public"."qa_scenarios" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "qa_scenarios_read" ON "public"."qa_scenarios" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."qa_step_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qa_step_results_admin_read" ON "public"."qa_step_results" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "qa_step_results_own_insert" ON "public"."qa_step_results" FOR INSERT TO "authenticated" WITH CHECK (("test_run_id" IN ( SELECT "qa_test_runs"."id"
   FROM "public"."qa_test_runs"
  WHERE ("qa_test_runs"."tester_id" = "auth"."uid"()))));



CREATE POLICY "qa_step_results_own_select" ON "public"."qa_step_results" FOR SELECT TO "authenticated" USING (("test_run_id" IN ( SELECT "qa_test_runs"."id"
   FROM "public"."qa_test_runs"
  WHERE ("qa_test_runs"."tester_id" = "auth"."uid"()))));



CREATE POLICY "qa_step_results_own_update" ON "public"."qa_step_results" FOR UPDATE TO "authenticated" USING (("test_run_id" IN ( SELECT "qa_test_runs"."id"
   FROM "public"."qa_test_runs"
  WHERE ("qa_test_runs"."tester_id" = "auth"."uid"()))));



ALTER TABLE "public"."qa_test_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qa_test_runs_admin_read" ON "public"."qa_test_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "qa_test_runs_own_insert" ON "public"."qa_test_runs" FOR INSERT TO "authenticated" WITH CHECK (("tester_id" = "auth"."uid"()));



CREATE POLICY "qa_test_runs_own_select" ON "public"."qa_test_runs" FOR SELECT TO "authenticated" USING (("tester_id" = "auth"."uid"()));



CREATE POLICY "qa_test_runs_own_update" ON "public"."qa_test_runs" FOR UPDATE TO "authenticated" USING (("tester_id" = "auth"."uid"()));



ALTER TABLE "public"."qa_web_vitals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quiz_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz_submissions_admin_all" ON "public"."quiz_submissions" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "quiz_submissions_consultant_manage" ON "public"."quiz_submissions" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type")))) AND (EXISTS ( SELECT 1
   FROM "public"."consultant_assignments" "ca"
  WHERE (("ca"."consultant_id" = "auth"."uid"()) AND ("ca"."student_id" = "quiz_submissions"."student_id")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type")))) AND (EXISTS ( SELECT 1
   FROM "public"."consultant_assignments" "ca"
  WHERE (("ca"."consultant_id" = "auth"."uid"()) AND ("ca"."student_id" = "quiz_submissions"."student_id"))))));



CREATE POLICY "quiz_submissions_student_own" ON "public"."quiz_submissions" TO "authenticated" USING (("student_id" = "auth"."uid"())) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "quiz_submissions_teacher_manage" ON "public"."quiz_submissions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."lessons" "l"
     JOIN "public"."modules" "m" ON (("m"."id" = "l"."module_id")))
  WHERE (("l"."id" = "quiz_submissions"."lesson_id") AND "public"."auth_is_course_teacher"("m"."course_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."lessons" "l"
     JOIN "public"."modules" "m" ON (("m"."id" = "l"."module_id")))
  WHERE (("l"."id" = "quiz_submissions"."lesson_id") AND "public"."auth_is_course_teacher"("m"."course_id")))));



CREATE POLICY "read_own_roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."red_escuelas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "red_escuelas_supervisor_network_select" ON "public"."red_escuelas" FOR SELECT USING ((("red_id" IN ( SELECT "ur"."red_id"
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'supervisor_de_red'::"public"."user_role_type") AND ("ur"."is_active" = true) AND ("ur"."red_id" IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))));



ALTER TABLE "public"."redes_de_colegios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "redes_de_colegios_supervisor_select" ON "public"."redes_de_colegios" FOR SELECT USING ((("id" IN ( SELECT "ur"."red_id"
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'supervisor_de_red'::"public"."user_role_type") AND ("ur"."is_active" = true) AND ("ur"."red_id" IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true))))));



CREATE POLICY "reports_facilitator_insert" ON "public"."session_reports" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."session_facilitators" "sf"
  WHERE (("sf"."session_id" = "session_reports"."session_id") AND ("sf"."user_id" = "auth"."uid"()))))));



CREATE POLICY "reports_facilitator_select" ON "public"."session_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "cs"."school_id")))
  WHERE (("cs"."id" = "session_reports"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type"])) AND ("ur"."is_active" = true)))));



CREATE POLICY "reports_gc_member_select" ON "public"."session_reports" FOR SELECT USING ((("visibility" = 'all_participants'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."consultor_sessions" "cs"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cs"."growth_community_id")))
  WHERE (("cs"."id" = "session_reports"."session_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



ALTER TABLE "public"."roadmap_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permission_baseline" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_change_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_change_history_admin_all" ON "public"."school_change_history" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "school_change_history_consultor_select" ON "public"."school_change_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."consultant_assignments" "ca"
  WHERE (("ca"."consultant_id" = "auth"."uid"()) AND ("ca"."school_id" = "school_change_history"."school_id") AND ("ca"."is_active" = true)))));



CREATE POLICY "school_change_history_directivo_insert" ON "public"."school_change_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "school_change_history"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "school_change_history_directivo_select" ON "public"."school_change_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "school_change_history"."school_id") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."school_course_docente_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_course_docente_assignments_insert" ON "public"."school_course_docente_assignments" FOR INSERT WITH CHECK (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."school_course_structure" "cs"
  WHERE (("cs"."id" = "school_course_docente_assignments"."course_structure_id") AND "public"."auth_is_school_directivo"("cs"."school_id"))))));



CREATE POLICY "school_course_docente_assignments_select" ON "public"."school_course_docente_assignments" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR ("docente_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."school_course_structure" "cs"
  WHERE (("cs"."id" = "school_course_docente_assignments"."course_structure_id") AND "public"."auth_is_school_directivo"("cs"."school_id"))))));



CREATE POLICY "school_course_docente_assignments_update" ON "public"."school_course_docente_assignments" FOR UPDATE USING (("public"."auth_is_assessment_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."school_course_structure" "cs"
  WHERE (("cs"."id" = "school_course_docente_assignments"."course_structure_id") AND "public"."auth_is_school_directivo"("cs"."school_id"))))));



ALTER TABLE "public"."school_course_structure" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_course_structure_insert" ON "public"."school_course_structure" FOR INSERT WITH CHECK (("public"."auth_is_assessment_admin"() OR "public"."auth_is_school_directivo"("school_id")));



CREATE POLICY "school_course_structure_select" ON "public"."school_course_structure" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR "public"."auth_is_school_directivo"("school_id")));



CREATE POLICY "school_course_structure_update" ON "public"."school_course_structure" FOR UPDATE USING (("public"."auth_is_assessment_admin"() OR "public"."auth_is_school_directivo"("school_id")));



CREATE POLICY "school_plan_completion_admin_all" ON "public"."school_plan_completion_status" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "school_plan_completion_consultor_select" ON "public"."school_plan_completion_status" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."consultant_assignments" "ca"
  WHERE (("ca"."consultant_id" = "auth"."uid"()) AND ("ca"."school_id" = "school_plan_completion_status"."school_id") AND ("ca"."is_active" = true)))));



CREATE POLICY "school_plan_completion_directivo_insert" ON "public"."school_plan_completion_status" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "school_plan_completion_status"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "school_plan_completion_directivo_select" ON "public"."school_plan_completion_status" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "school_plan_completion_status"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "school_plan_completion_directivo_update" ON "public"."school_plan_completion_status" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("user_roles"."school_id" = "school_plan_completion_status"."school_id") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."school_plan_completion_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_transversal_context" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_transversal_context_insert" ON "public"."school_transversal_context" FOR INSERT WITH CHECK (("public"."auth_is_assessment_admin"() OR "public"."auth_is_school_directivo"("school_id")));



CREATE POLICY "school_transversal_context_select" ON "public"."school_transversal_context" FOR SELECT USING (("public"."auth_is_assessment_admin"() OR "public"."auth_is_school_directivo"("school_id")));



CREATE POLICY "school_transversal_context_update" ON "public"."school_transversal_context" FOR UPDATE USING (("public"."auth_is_assessment_admin"() OR "public"."auth_is_school_directivo"("school_id")));



ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schools_admin_all" ON "public"."schools" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "schools_delete_policy" ON "public"."schools" FOR DELETE USING ("public"."auth_is_admin"());



CREATE POLICY "schools_insert_admin" ON "public"."schools" FOR INSERT TO "authenticated" WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "schools_read_authenticated" ON "public"."schools" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "schools_update_policy" ON "public"."schools" FOR UPDATE USING (("public"."auth_is_admin"() OR "public"."auth_has_school_access_uuid"(("id")::bigint))) WITH CHECK (("public"."auth_is_admin"() OR "public"."auth_has_school_access_uuid"(("id")::bigint)));



CREATE POLICY "service_role_bypass" ON "public"."user_roles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_bypass_activity_feed" ON "public"."activity_feed" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_bypass_clientes" ON "public"."clientes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_bypass_contratos" ON "public"."contratos" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_bypass_courses" ON "public"."courses" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_bypass_cuotas" ON "public"."cuotas" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."session_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_communications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_edit_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_facilitators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_admin_all" ON "public"."consultor_sessions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "sessions_consultor_select" ON "public"."consultor_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'consultor'::"public"."user_role_type") AND ("user_roles"."school_id" = "consultor_sessions"."school_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "sessions_consultor_update" ON "public"."consultor_sessions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."session_facilitators" "sf"
     JOIN "public"."user_roles" "ur" ON (("ur"."user_id" = "sf"."user_id")))
  WHERE (("sf"."session_id" = "consultor_sessions"."id") AND ("sf"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "sessions_gc_member_select" ON "public"."consultor_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."community_id" = "consultor_sessions"."growth_community_id") AND ("user_roles"."is_active" = true)))));



ALTER TABLE "public"."superadmins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "superadmins_read_own" ON "public"."superadmins" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("is_active" = true)));



ALTER TABLE "public"."supervisor_auditorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_updates_admin_all" ON "public"."system_updates" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "system_updates_authenticated_view" ON "public"."system_updates" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."test_mode_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tractor_signups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tractor_signups_admin_all" ON "public"."tractor_signups" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



ALTER TABLE "public"."transformation_access_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transformation_assessment_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transformation_assessments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transformation_assessments_delete" ON "public"."transformation_assessments" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_consultor"("auth"."uid"()));



CREATE POLICY "transformation_assessments_insert" ON "public"."transformation_assessments" FOR INSERT TO "authenticated" WITH CHECK (((("school_id" IS NOT NULL) AND ("school_id" = ANY ("public"."user_school_ids"("auth"."uid"())))) OR "public"."is_admin_or_consultor"("auth"."uid"())));



CREATE POLICY "transformation_assessments_select" ON "public"."transformation_assessments" FOR SELECT TO "authenticated" USING (("public"."is_admin_or_consultor"("auth"."uid"()) OR ("school_id" = ANY ("public"."user_school_ids"("auth"."uid"()))) OR (("school_id" IS NULL) AND ("growth_community_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true) AND ("ur"."community_id" = "transformation_assessments"."growth_community_id"))))) OR "public"."is_assessment_collaborator"("id", "auth"."uid"()) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "transformation_assessments_update" ON "public"."transformation_assessments" FOR UPDATE TO "authenticated" USING (("public"."is_admin_or_consultor"("auth"."uid"()) OR "public"."is_assessment_collaborator"("id", "auth"."uid"()) OR ("created_by" = "auth"."uid"()))) WITH CHECK ((("school_id" IS NULL) OR ("school_id" = ANY ("public"."user_school_ids"("auth"."uid"()))) OR "public"."is_admin_or_consultor"("auth"."uid"())));



ALTER TABLE "public"."transformation_conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transformation_llm_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transformation_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transformation_rubric" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."upcoming_courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "upcoming_courses_public_read" ON "public"."upcoming_courses" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_delete_llm_usage" ON "public"."transformation_llm_usage" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_insert_llm_usage" ON "public"."transformation_llm_usage" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notification_preferences_delete_policy" ON "public"."user_notification_preferences" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_preferences_insert_policy" ON "public"."user_notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_preferences_select_policy" ON "public"."user_notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_preferences_update_policy" ON "public"."user_notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notifications_admin_all" ON "public"."user_notifications" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "user_notifications_user_own" ON "public"."user_notifications" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_onboarding_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_read_llm_usage" ON "public"."transformation_llm_usage" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_read_own" ON "public"."assessment_demo_access" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_community_member_view" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("community_id" IS NOT NULL) AND ("community_id" IN ( SELECT "public"."auth_user_community_ids"() AS "auth_user_community_ids"))));



COMMENT ON POLICY "user_roles_community_member_view" ON "public"."user_roles" IS 'Allows users to view roles of other members in their same growth community. Uses auth_user_community_ids() function to avoid RLS recursion.';



CREATE POLICY "user_view_own_llm_usage" ON "public"."assessment_llm_usage" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_manage_own_submissions" ON "public"."assessment_submissions" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_read_bug_logs" ON "public"."debug_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."debug_bugs"
  WHERE (("debug_bugs"."id" = "debug_logs"."bug_id") AND ("debug_bugs"."user_id" = "auth"."uid"())))));



CREATE POLICY "users_read_bug_sessions" ON "public"."debug_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."debug_bugs"
  WHERE (("debug_bugs"."id" = "debug_sessions"."bug_id") AND ("debug_bugs"."user_id" = "auth"."uid"())))));



CREATE POLICY "users_read_own_bugs" ON "public"."debug_bugs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_read_own_logs" ON "public"."debug_logs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users_update_own_bugs" ON "public"."debug_bugs" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users_view_own_results" ON "public"."assessment_results" FOR SELECT USING (("submission_id" IN ( SELECT "assessment_submissions"."id"
   FROM "public"."assessment_submissions"
  WHERE ("assessment_submissions"."user_id" = "auth"."uid"()))));



CREATE POLICY "users_view_school_assignments" ON "public"."assessment_assignments" FOR SELECT USING ((("is_active" = true) AND ("school_id" IN ( SELECT "user_roles"."school_id"
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_active" = true))))));



ALTER TABLE "public"."workspace_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspace_members_can_read_activity" ON "public"."activity_feed" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."is_active" IS NULL) OR ("ur"."is_active" = true)) AND ("ur"."role_type" = ANY (ARRAY['admin'::"public"."user_role_type", 'consultor'::"public"."user_role_type", 'equipo_directivo'::"public"."user_role_type"])))))));



ALTER TABLE "public"."workspace_messages" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."activity_feed";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."community_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_mentions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_threads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_notification_preferences";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";








































































































































































GRANT ALL ON FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_assessments_on_access_removal"() TO "anon";
GRANT ALL ON FUNCTION "public"."archive_assessments_on_access_removal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_assessments_on_access_removal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_role_permission_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_role_permission_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_role_permission_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_has_school_access_uuid"("p_school_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."auth_has_school_access_uuid"("p_school_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_has_school_access_uuid"("p_school_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_assessment_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_assessment_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_assessment_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_learning_path_member"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_learning_path_member"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_learning_path_member"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_school_directivo"("p_school_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_school_directivo"("p_school_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_school_directivo"("p_school_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_superadmin"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_superadmin"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_superadmin"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_teacher"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_teacher"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_teacher"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_user_community_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_community_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_community_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."award_course_completion_badge"("p_user_id" "uuid", "p_course_id" "uuid", "p_course_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."award_course_completion_badge"("p_user_id" "uuid", "p_course_id" "uuid", "p_course_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_course_completion_badge"("p_user_id" "uuid", "p_course_id" "uuid", "p_course_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_assign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."batch_assign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_assign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_unassign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."batch_unassign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_unassign_courses"("p_course_id" "uuid", "p_user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."bot_save_expense_item"("p_user_id" "uuid", "p_report_id" "uuid", "p_report_name" "text", "p_start" "date", "p_end" "date", "p_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_currency" "text", "p_original_amount" numeric, "p_conversion_rate" numeric, "p_conversion_date" "date", "p_expense_date" "date", "p_vendor" "text", "p_expense_number" "text", "p_receipt_url" "text", "p_receipt_filename" "text", "p_notes" "text", "p_report_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bot_save_expense_item"("p_user_id" "uuid", "p_report_id" "uuid", "p_report_name" "text", "p_start" "date", "p_end" "date", "p_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_currency" "text", "p_original_amount" numeric, "p_conversion_rate" numeric, "p_conversion_date" "date", "p_expense_date" "date", "p_vendor" "text", "p_expense_number" "text", "p_receipt_url" "text", "p_receipt_filename" "text", "p_notes" "text", "p_report_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_group_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_group_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_group_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quote_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_discount"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_discount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_discount"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_groups"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_groups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_groups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_groups_and_discount"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_groups_and_discount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals_with_groups_and_discount"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_viaticos_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_viaticos_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_viaticos_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_edit_meeting"("check_user_id" "uuid", "check_meeting_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_edit_meeting"("check_user_id" "uuid", "check_meeting_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_meeting"("check_user_id" "uuid", "check_meeting_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_meeting"("check_user_id" "uuid", "check_meeting_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cascade_lesson_submission_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_lesson_submission_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_lesson_submission_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_community_organization"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_community_organization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_community_organization"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_duplicate_notification"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_time_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_duplicate_notification"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_time_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_duplicate_notification"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_time_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_dev_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_dev_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_dev_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_test_runs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_test_runs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_test_runs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_communities"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_communities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_communities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_propuesta_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_propuesta_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_propuesta_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."contratos_set_representante_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."contratos_set_representante_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contratos_set_representante_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_activity"("p_workspace_id" "uuid", "p_activity_type" "public"."activity_type", "p_entity_type" "public"."entity_type", "p_user_id" "uuid", "p_entity_id" "uuid", "p_title" "text", "p_description" "text", "p_metadata" "jsonb", "p_importance_score" integer, "p_tags" "text"[], "p_related_users" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_activity"("p_workspace_id" "uuid", "p_activity_type" "public"."activity_type", "p_entity_type" "public"."entity_type", "p_user_id" "uuid", "p_entity_id" "uuid", "p_title" "text", "p_description" "text", "p_metadata" "jsonb", "p_importance_score" integer, "p_tags" "text"[], "p_related_users" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_activity"("p_workspace_id" "uuid", "p_activity_type" "public"."activity_type", "p_entity_type" "public"."entity_type", "p_user_id" "uuid", "p_entity_id" "uuid", "p_title" "text", "p_description" "text", "p_metadata" "jsonb", "p_importance_score" integer, "p_tags" "text"[], "p_related_users" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_assignment_template_from_block"("p_lesson_id" "uuid", "p_block_id" "uuid", "p_block_data" "jsonb", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_assignment_template_from_block"("p_lesson_id" "uuid", "p_block_id" "uuid", "p_block_data" "jsonb", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_assignment_template_from_block"("p_lesson_id" "uuid", "p_block_id" "uuid", "p_block_data" "jsonb", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_document_version"("document_uuid" "uuid", "new_storage_path" "text", "new_file_size" bigint, "new_mime_type" character varying, "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_document_version"("document_uuid" "uuid", "new_storage_path" "text", "new_file_size" bigint, "new_mime_type" character varying, "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_document_version"("document_uuid" "uuid", "new_storage_path" "text", "new_file_size" bigint, "new_mime_type" character varying, "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" character varying, "p_title" character varying, "p_message" "text", "p_entity_type" character varying, "p_entity_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" character varying, "p_title" character varying, "p_message" "text", "p_entity_type" character varying, "p_entity_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_type" character varying, "p_title" character varying, "p_message" "text", "p_entity_type" character varying, "p_entity_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification_safe"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_category" character varying, "p_related_url" character varying, "p_importance" character varying, "p_notification_type_id" character varying, "p_idempotency_key" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification_safe"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_category" character varying, "p_related_url" character varying, "p_importance" character varying, "p_notification_type_id" character varying, "p_idempotency_key" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification_safe"("p_user_id" "uuid", "p_title" character varying, "p_description" "text", "p_category" character varying, "p_related_url" character varying, "p_importance" character varying, "p_notification_type_id" character varying, "p_idempotency_key" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_learning_path_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."exec_sql"("sql_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_mentions"("p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_mentions"("p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_mentions"("p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."feedback_status_change_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."feedback_status_change_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."feedback_status_change_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_is_events_manager"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_is_events_manager"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_is_events_manager"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_notification_idempotency_key"("p_event_type" character varying, "p_event_id" character varying, "p_user_id" "uuid", "p_timestamp" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_notification_idempotency_key"("p_event_type" character varying, "p_event_id" character varying, "p_user_id" "uuid", "p_timestamp" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_notification_idempotency_key"("p_event_type" character varying, "p_event_id" character varying, "p_user_id" "uuid", "p_timestamp" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_auth_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_auth_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_auth_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_baseline_permissions"("p_role_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_baseline_permissions"("p_role_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_baseline_permissions"("p_role_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bucket_summary"("p_contrato_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_bucket_summary"("p_contrato_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bucket_summary"("p_contrato_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_consultant_earnings"("p_consultant_id" "uuid", "p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_consultant_earnings"("p_consultant_id" "uuid", "p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_consultant_earnings"("p_consultant_id" "uuid", "p_from" "date", "p_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_permissions"("p_role_type" "text", "p_test_run_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_permissions"("p_role_type" "text", "p_test_run_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_permissions"("p_role_type" "text", "p_test_run_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_user_role"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_user_role"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_user_role"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_emotion_recommendations"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_emotion_recommendations"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_emotion_recommendations"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_folder_breadcrumb"("folder_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_folder_breadcrumb"("folder_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_folder_breadcrumb"("folder_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_meeting_stats"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_meeting_stats"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_meeting_stats"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_community_for_leader"("p_leader_id" "uuid", "p_school_id" "uuid", "p_generation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_community_for_leader"("p_leader_id" "uuid", "p_school_id" "uuid", "p_generation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_community_for_leader"("p_leader_id" "uuid", "p_school_id" "uuid", "p_generation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_community_workspace"("p_community_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_community_workspace"("p_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_community_workspace"("p_community_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_overdue_items"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_overdue_items"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overdue_items"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_document_activity"("workspace_uuid" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_document_activity"("workspace_uuid" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_document_activity"("workspace_uuid" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_related_bugs"("target_bug_id" "uuid", "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_related_bugs"("target_bug_id" "uuid", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_related_bugs"("target_bug_id" "uuid", "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reportable_users"("requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reportable_users"("requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reportable_users"("requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reportable_users_enhanced"("requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reportable_users_enhanced"("requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reportable_users_enhanced"("requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_school_user_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_school_user_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_school_user_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_thread_statistics"("p_thread_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_thread_statistics"("p_thread_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_thread_statistics"("p_thread_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_notification_count"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_admin_status"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_admin_status"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_admin_status"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_badges"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_badges"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_badges"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_messaging_permissions"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_messaging_permissions"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_messaging_permissions"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_workspace_role"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_workspace_role"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_workspace_role"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_needing_metadata_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_needing_metadata_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_needing_metadata_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_workspace_messaging_stats"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_messaging_stats"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_messaging_stats"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_global_workspace_access"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_global_workspace_access"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_global_workspace_access"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_transformation_access"("community_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_transformation_access"("community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_transformation_access"("community_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_path_assignment_time"("p_user_id" "uuid", "p_path_id" "uuid", "p_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_path_assignment_time"("p_user_id" "uuid", "p_path_id" "uuid", "p_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_path_assignment_time"("p_user_id" "uuid", "p_path_id" "uuid", "p_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_or_consultor"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_or_consultor"("p_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_or_consultor"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_consultor"("p_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_assessment_collaborator"("assessment_uuid" "uuid", "uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_assessment_collaborator"("assessment_uuid" "uuid", "uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_assessment_collaborator"("assessment_uuid" "uuid", "uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_community_member"("check_user_id" "uuid", "check_community_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_community_member"("check_user_id" "uuid", "check_community_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_community_member"("check_user_id" "uuid", "check_community_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dev_user"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_dev_user"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dev_user"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_global_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_global_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_admin"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_document_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_document_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_document_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_initial_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_initial_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_initial_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_metadata_sync_needed"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_metadata_sync_needed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_metadata_sync_needed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_notification_event"("p_event_type" "text", "p_event_data" "jsonb", "p_trigger_id" "uuid", "p_notifications_count" integer, "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_notification_event"("p_event_type" "text", "p_event_data" "jsonb", "p_trigger_id" "uuid", "p_notifications_count" integer, "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_notification_event"("p_event_type" "text", "p_event_data" "jsonb", "p_trigger_id" "uuid", "p_notifications_count" integer, "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_notification_read"("notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_assignments_to_enrollments"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_assignments_to_enrollments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_assignments_to_enrollments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_rubric_deletion_with_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_rubric_deletion_with_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_rubric_deletion_with_results"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_expense_report_total"("p_report_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_expense_report_total"("p_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_expense_report_total"("p_report_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_user_roles_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_roles_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_roles_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_bugs_by_similarity"("search_query" "text", "similarity_threshold" double precision, "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_bugs_by_similarity"("search_query" "text", "similarity_threshold" double precision, "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_bugs_by_similarity"("search_query" "text", "similarity_threshold" double precision, "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_enrollment_total_lessons"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_enrollment_total_lessons"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_enrollment_total_lessons"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_expense_report_access_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_expense_report_access_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_expense_report_access_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid", "p_activity_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid", "p_activity_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_learning_path_session"("p_user_id" "uuid", "p_path_id" "uuid", "p_course_id" "uuid", "p_activity_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."supervisor_can_access_user"("supervisor_user_id" "uuid", "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."supervisor_can_access_user"("supervisor_user_id" "uuid", "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supervisor_can_access_user"("supervisor_user_id" "uuid", "target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_legacy_transformation_flag"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_legacy_transformation_flag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_legacy_transformation_flag"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_session_attendees_on_gc_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_session_attendees_on_gc_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_session_attendees_on_gc_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_refresh_user_roles_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_refresh_user_roles_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_refresh_user_roles_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_meditation_streak"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_meditation_streak"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_meditation_streak"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_assessment_objectives_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_assessment_objectives_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_assessment_objectives_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_assignment_on_test_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_assignment_on_test_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_assignment_on_test_completion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_church_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_church_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_church_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_community_workspace_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_community_workspace_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_community_workspace_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_course_enrollment_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_course_enrollment_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_course_enrollment_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_course_proposals_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_course_proposals_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_course_proposals_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_document_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_document_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_document_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_folder_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_folder_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_folder_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_generations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_generations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_generations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lesson_submission_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lesson_submission_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lesson_submission_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_overdue_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_overdue_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_overdue_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_pasantias_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_pasantias_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pasantias_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_qa_scenarios_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_qa_scenarios_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_qa_scenarios_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quote_on_group_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_quote_on_group_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quote_on_group_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_school_has_generations"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_school_has_generations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_school_has_generations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_heartbeat"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_upcoming_courses_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_upcoming_courses_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_upcoming_courses_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_church_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_church_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_church_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_is_in_group"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_in_group"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_in_group"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_school_ids"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_school_ids"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_school_ids"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_assignment_instance_course"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_assignment_instance_course"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_assignment_instance_course"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."ab_grades" TO "anon";
GRANT ALL ON TABLE "public"."ab_grades" TO "authenticated";
GRANT ALL ON TABLE "public"."ab_grades" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ab_grades_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ab_grades_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ab_grades_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ab_migration_plan" TO "anon";
GRANT ALL ON TABLE "public"."ab_migration_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."ab_migration_plan" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ab_migration_plan_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ab_migration_plan_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ab_migration_plan_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."activity_aggregations" TO "anon";
GRANT ALL ON TABLE "public"."activity_aggregations" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_aggregations" TO "service_role";



GRANT ALL ON TABLE "public"."activity_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_feed" TO "service_role";



GRANT ALL ON TABLE "public"."activity_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."activity_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."answers" TO "anon";
GRANT ALL ON TABLE "public"."answers" TO "authenticated";
GRANT ALL ON TABLE "public"."answers" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_actions" TO "anon";
GRANT ALL ON TABLE "public"."assessment_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_actions" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_areas" TO "anon";
GRANT ALL ON TABLE "public"."assessment_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_areas" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_assignments" TO "anon";
GRANT ALL ON TABLE "public"."assessment_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_context_questions" TO "anon";
GRANT ALL ON TABLE "public"."assessment_context_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_context_questions" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_demo_access" TO "anon";
GRANT ALL ON TABLE "public"."assessment_demo_access" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_demo_access" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_dimensions" TO "anon";
GRANT ALL ON TABLE "public"."assessment_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_dimensions" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_entity_year_weights" TO "anon";
GRANT ALL ON TABLE "public"."assessment_entity_year_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_entity_year_weights" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_evaluation_cache" TO "anon";
GRANT ALL ON TABLE "public"."assessment_evaluation_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_evaluation_cache" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_indicators" TO "anon";
GRANT ALL ON TABLE "public"."assessment_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_indicators" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_instance_assignees" TO "anon";
GRANT ALL ON TABLE "public"."assessment_instance_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_instance_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_instance_results" TO "anon";
GRANT ALL ON TABLE "public"."assessment_instance_results" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_instance_results" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_instances" TO "anon";
GRANT ALL ON TABLE "public"."assessment_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_instances" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_llm_usage" TO "anon";
GRANT ALL ON TABLE "public"."assessment_llm_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_llm_usage" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_modules" TO "anon";
GRANT ALL ON TABLE "public"."assessment_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_modules" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_objectives" TO "anon";
GRANT ALL ON TABLE "public"."assessment_objectives" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_objectives" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_questions" TO "anon";
GRANT ALL ON TABLE "public"."assessment_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_questions" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_responses" TO "anon";
GRANT ALL ON TABLE "public"."assessment_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_responses" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_results" TO "anon";
GRANT ALL ON TABLE "public"."assessment_results" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_results" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_sections" TO "anon";
GRANT ALL ON TABLE "public"."assessment_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_sections" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_sub_questions" TO "anon";
GRANT ALL ON TABLE "public"."assessment_sub_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_sub_questions" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."assessment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_template_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."assessment_template_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_template_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_templates" TO "anon";
GRANT ALL ON TABLE "public"."assessment_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_templates" TO "service_role";



GRANT ALL ON TABLE "public"."assessment_year_expectations" TO "anon";
GRANT ALL ON TABLE "public"."assessment_year_expectations" TO "authenticated";
GRANT ALL ON TABLE "public"."assessment_year_expectations" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."assignment_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_feedback" TO "anon";
GRANT ALL ON TABLE "public"."assignment_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_instances" TO "anon";
GRANT ALL ON TABLE "public"."assignment_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_instances" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_submission_shares" TO "anon";
GRANT ALL ON TABLE "public"."assignment_submission_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_submission_shares" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_templates" TO "anon";
GRANT ALL ON TABLE "public"."assignment_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_templates" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "service_role";



GRANT ALL ON TABLE "public"."blocks" TO "anon";
GRANT ALL ON TABLE "public"."blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."blocks" TO "service_role";



GRANT ALL ON TABLE "public"."bot_identities" TO "anon";
GRANT ALL ON TABLE "public"."bot_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_identities" TO "service_role";



GRANT ALL ON TABLE "public"."bot_link_codes" TO "anon";
GRANT ALL ON TABLE "public"."bot_link_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_link_codes" TO "service_role";



GRANT ALL ON TABLE "public"."bot_pending_items" TO "anon";
GRANT ALL ON TABLE "public"."bot_pending_items" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_pending_items" TO "service_role";



GRANT ALL ON TABLE "public"."bot_processed_updates" TO "anon";
GRANT ALL ON TABLE "public"."bot_processed_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_processed_updates" TO "service_role";



GRANT ALL ON TABLE "public"."bot_sessions" TO "anon";
GRANT ALL ON TABLE "public"."bot_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."church_about_sections" TO "anon";
GRANT ALL ON TABLE "public"."church_about_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."church_about_sections" TO "service_role";



GRANT ALL ON TABLE "public"."church_accounts" TO "anon";
GRANT ALL ON TABLE "public"."church_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."church_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."church_contact_info" TO "anon";
GRANT ALL ON TABLE "public"."church_contact_info" TO "authenticated";
GRANT ALL ON TABLE "public"."church_contact_info" TO "service_role";



GRANT ALL ON TABLE "public"."church_events" TO "anon";
GRANT ALL ON TABLE "public"."church_events" TO "authenticated";
GRANT ALL ON TABLE "public"."church_events" TO "service_role";



GRANT ALL ON TABLE "public"."church_hero_sections" TO "anon";
GRANT ALL ON TABLE "public"."church_hero_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."church_hero_sections" TO "service_role";



GRANT ALL ON TABLE "public"."church_invitations" TO "anon";
GRANT ALL ON TABLE "public"."church_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."church_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."church_meditation_favorites" TO "anon";
GRANT ALL ON TABLE "public"."church_meditation_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."church_meditation_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."church_meditation_preferences" TO "anon";
GRANT ALL ON TABLE "public"."church_meditation_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."church_meditation_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."church_meditation_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."church_meditation_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."church_meditation_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."church_meditation_sessions" TO "anon";
GRANT ALL ON TABLE "public"."church_meditation_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."church_meditation_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."church_meditation_streaks" TO "anon";
GRANT ALL ON TABLE "public"."church_meditation_streaks" TO "authenticated";
GRANT ALL ON TABLE "public"."church_meditation_streaks" TO "service_role";



GRANT ALL ON TABLE "public"."church_organizations" TO "anon";
GRANT ALL ON TABLE "public"."church_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."church_organizations" TO "service_role";



GRANT ALL ON TABLE "public"."church_prayer_requests" TO "anon";
GRANT ALL ON TABLE "public"."church_prayer_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."church_prayer_requests" TO "service_role";



GRANT ALL ON TABLE "public"."church_presentation_templates" TO "anon";
GRANT ALL ON TABLE "public"."church_presentation_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."church_presentation_templates" TO "service_role";



GRANT ALL ON TABLE "public"."church_profiles" TO "anon";
GRANT ALL ON TABLE "public"."church_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."church_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."church_schedules" TO "anon";
GRANT ALL ON TABLE "public"."church_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."church_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."church_sermons" TO "anon";
GRANT ALL ON TABLE "public"."church_sermons" TO "authenticated";
GRANT ALL ON TABLE "public"."church_sermons" TO "service_role";



GRANT ALL ON TABLE "public"."church_services" TO "anon";
GRANT ALL ON TABLE "public"."church_services" TO "authenticated";
GRANT ALL ON TABLE "public"."church_services" TO "service_role";



GRANT ALL ON TABLE "public"."church_songs" TO "anon";
GRANT ALL ON TABLE "public"."church_songs" TO "authenticated";
GRANT ALL ON TABLE "public"."church_songs" TO "service_role";



GRANT ALL ON TABLE "public"."church_team_members" TO "anon";
GRANT ALL ON TABLE "public"."church_team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."church_team_members" TO "service_role";



GRANT ALL ON TABLE "public"."church_transaction_lines" TO "anon";
GRANT ALL ON TABLE "public"."church_transaction_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."church_transaction_lines" TO "service_role";



GRANT ALL ON TABLE "public"."church_transactions" TO "anon";
GRANT ALL ON TABLE "public"."church_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."church_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."church_website_settings" TO "anon";
GRANT ALL ON TABLE "public"."church_website_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."church_website_settings" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."codebase_index" TO "anon";
GRANT ALL ON TABLE "public"."codebase_index" TO "authenticated";
GRANT ALL ON TABLE "public"."codebase_index" TO "service_role";



GRANT ALL ON TABLE "public"."community_documents" TO "anon";
GRANT ALL ON TABLE "public"."community_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."community_documents" TO "service_role";



GRANT ALL ON TABLE "public"."community_meetings" TO "anon";
GRANT ALL ON TABLE "public"."community_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."community_meetings" TO "service_role";



GRANT ALL ON TABLE "public"."community_messages" TO "anon";
GRANT ALL ON TABLE "public"."community_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."community_messages" TO "service_role";



GRANT ALL ON TABLE "public"."community_posts" TO "anon";
GRANT ALL ON TABLE "public"."community_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_posts" TO "service_role";



GRANT ALL ON TABLE "public"."course_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."course_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."generations" TO "anon";
GRANT ALL ON TABLE "public"."generations" TO "authenticated";
GRANT ALL ON TABLE "public"."generations" TO "service_role";



GRANT ALL ON TABLE "public"."growth_communities" TO "anon";
GRANT ALL ON TABLE "public"."growth_communities" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_communities" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_completion_summary" TO "anon";
GRANT ALL ON TABLE "public"."lesson_completion_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_completion_summary" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."community_progress_report" TO "anon";
GRANT ALL ON TABLE "public"."community_progress_report" TO "authenticated";
GRANT ALL ON TABLE "public"."community_progress_report" TO "service_role";



GRANT ALL ON TABLE "public"."message_threads" TO "anon";
GRANT ALL ON TABLE "public"."message_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_threads" TO "service_role";



GRANT ALL ON TABLE "public"."community_threads" TO "anon";
GRANT ALL ON TABLE "public"."community_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."community_threads" TO "service_role";



GRANT ALL ON TABLE "public"."community_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."community_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."community_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."consultant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."consultant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."consultant_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."consultant_rates" TO "anon";
GRANT ALL ON TABLE "public"."consultant_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."consultant_rates" TO "service_role";



GRANT ALL ON TABLE "public"."consultor_sessions" TO "anon";
GRANT ALL ON TABLE "public"."consultor_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."consultor_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."context_general_questions" TO "anon";
GRANT ALL ON TABLE "public"."context_general_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."context_general_questions" TO "service_role";



GRANT ALL ON TABLE "public"."context_general_responses" TO "anon";
GRANT ALL ON TABLE "public"."context_general_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."context_general_responses" TO "service_role";



GRANT ALL ON TABLE "public"."contract_extraction_feedback" TO "anon";
GRANT ALL ON TABLE "public"."contract_extraction_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_extraction_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."contract_hour_allocations" TO "anon";
GRANT ALL ON TABLE "public"."contract_hour_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_hour_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."contract_hour_reallocation_log" TO "anon";
GRANT ALL ON TABLE "public"."contract_hour_reallocation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_hour_reallocation_log" TO "service_role";



GRANT ALL ON TABLE "public"."contract_hours_ledger" TO "anon";
GRANT ALL ON TABLE "public"."contract_hours_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_hours_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos" TO "service_role";



GRANT ALL ON TABLE "public"."course_assignments" TO "anon";
GRANT ALL ON TABLE "public"."course_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."course_completions" TO "anon";
GRANT ALL ON TABLE "public"."course_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."course_completions" TO "service_role";



GRANT ALL ON TABLE "public"."course_prerequisites" TO "anon";
GRANT ALL ON TABLE "public"."course_prerequisites" TO "authenticated";
GRANT ALL ON TABLE "public"."course_prerequisites" TO "service_role";



GRANT ALL ON TABLE "public"."course_proposals" TO "anon";
GRANT ALL ON TABLE "public"."course_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."course_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."cuotas" TO "authenticated";
GRANT ALL ON TABLE "public"."cuotas" TO "service_role";



GRANT ALL ON TABLE "public"."debug_bugs" TO "anon";
GRANT ALL ON TABLE "public"."debug_bugs" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_bugs" TO "service_role";



GRANT ALL ON TABLE "public"."debug_logs" TO "anon";
GRANT ALL ON TABLE "public"."debug_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_logs" TO "service_role";



GRANT ALL ON TABLE "public"."debug_sessions" TO "anon";
GRANT ALL ON TABLE "public"."debug_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."deleted_blocks" TO "anon";
GRANT ALL ON TABLE "public"."deleted_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."deleted_courses" TO "anon";
GRANT ALL ON TABLE "public"."deleted_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_courses" TO "service_role";



GRANT ALL ON TABLE "public"."deleted_lessons" TO "anon";
GRANT ALL ON TABLE "public"."deleted_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_lessons" TO "service_role";



GRANT ALL ON TABLE "public"."deleted_modules" TO "anon";
GRANT ALL ON TABLE "public"."deleted_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_modules" TO "service_role";



GRANT ALL ON TABLE "public"."dev_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."dev_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."dev_role_sessions" TO "anon";
GRANT ALL ON TABLE "public"."dev_role_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_role_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."dev_users" TO "anon";
GRANT ALL ON TABLE "public"."dev_users" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_users" TO "service_role";



GRANT ALL ON TABLE "public"."document_access_log" TO "anon";
GRANT ALL ON TABLE "public"."document_access_log" TO "authenticated";
GRANT ALL ON TABLE "public"."document_access_log" TO "service_role";



GRANT ALL ON TABLE "public"."document_folders" TO "anon";
GRANT ALL ON TABLE "public"."document_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."document_folders" TO "service_role";



GRANT ALL ON TABLE "public"."document_versions" TO "anon";
GRANT ALL ON TABLE "public"."document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."document_versions" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."exec_sql_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."exec_sql_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."exec_sql_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expense_items" TO "anon";
GRANT ALL ON TABLE "public"."expense_items" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_items" TO "service_role";



GRANT ALL ON TABLE "public"."expense_report_access" TO "anon";
GRANT ALL ON TABLE "public"."expense_report_access" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_report_access" TO "service_role";



GRANT ALL ON TABLE "public"."expense_reports" TO "anon";
GRANT ALL ON TABLE "public"."expense_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_reports" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_activity" TO "anon";
GRANT ALL ON TABLE "public"."feedback_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_activity" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_permissions" TO "anon";
GRANT ALL ON TABLE "public"."feedback_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."platform_feedback" TO "anon";
GRANT ALL ON TABLE "public"."platform_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_stats" TO "anon";
GRANT ALL ON TABLE "public"."feedback_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_stats" TO "service_role";



GRANT ALL ON TABLE "public"."feriados_chile" TO "anon";
GRANT ALL ON TABLE "public"."feriados_chile" TO "authenticated";
GRANT ALL ON TABLE "public"."feriados_chile" TO "service_role";



GRANT ALL ON SEQUENCE "public"."feriados_chile_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."feriados_chile_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."feriados_chile_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fx_rates" TO "anon";
GRANT ALL ON TABLE "public"."fx_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."fx_rates" TO "service_role";



GRANT ALL ON TABLE "public"."group_assignment_discussions" TO "anon";
GRANT ALL ON TABLE "public"."group_assignment_discussions" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignment_discussions" TO "service_role";



GRANT ALL ON TABLE "public"."group_assignment_groups" TO "anon";
GRANT ALL ON TABLE "public"."group_assignment_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignment_groups" TO "service_role";



GRANT ALL ON TABLE "public"."group_assignment_members" TO "anon";
GRANT ALL ON TABLE "public"."group_assignment_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignment_members" TO "service_role";



GRANT ALL ON TABLE "public"."group_assignment_settings" TO "anon";
GRANT ALL ON TABLE "public"."group_assignment_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignment_settings" TO "service_role";



GRANT ALL ON TABLE "public"."group_assignment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."group_assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."group_assignments_with_status" TO "anon";
GRANT ALL ON TABLE "public"."group_assignments_with_status" TO "authenticated";
GRANT ALL ON TABLE "public"."group_assignments_with_status" TO "service_role";



GRANT ALL ON TABLE "public"."growth_community_transformation_access" TO "anon";
GRANT ALL ON TABLE "public"."growth_community_transformation_access" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_community_transformation_access" TO "service_role";



GRANT ALL ON TABLE "public"."hour_types" TO "anon";
GRANT ALL ON TABLE "public"."hour_types" TO "authenticated";
GRANT ALL ON TABLE "public"."hour_types" TO "service_role";



GRANT ALL ON TABLE "public"."instructors" TO "anon";
GRANT ALL ON TABLE "public"."instructors" TO "authenticated";
GRANT ALL ON TABLE "public"."instructors" TO "service_role";



GRANT ALL ON TABLE "public"."learning_path_assignments" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."learning_path_courses" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_courses" TO "service_role";



GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_progress_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."learning_paths" TO "anon";
GRANT ALL ON TABLE "public"."learning_paths" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_paths" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_assignment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."lesson_assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_assignment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_assignments" TO "anon";
GRANT ALL ON TABLE "public"."lesson_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_progress" TO "anon";
GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."licitacion_ates" TO "anon";
GRANT ALL ON TABLE "public"."licitacion_ates" TO "authenticated";
GRANT ALL ON TABLE "public"."licitacion_ates" TO "service_role";



GRANT ALL ON TABLE "public"."licitacion_comision" TO "anon";
GRANT ALL ON TABLE "public"."licitacion_comision" TO "authenticated";
GRANT ALL ON TABLE "public"."licitacion_comision" TO "service_role";



GRANT ALL ON TABLE "public"."licitacion_consultas" TO "anon";
GRANT ALL ON TABLE "public"."licitacion_consultas" TO "authenticated";
GRANT ALL ON TABLE "public"."licitacion_consultas" TO "service_role";



GRANT ALL ON TABLE "public"."licitacion_documentos" TO "anon";
GRANT ALL ON TABLE "public"."licitacion_documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."licitacion_documentos" TO "service_role";



GRANT ALL ON TABLE "public"."licitacion_evaluaciones" TO "anon";
GRANT ALL ON TABLE "public"."licitacion_evaluaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."licitacion_evaluaciones" TO "service_role";



GRANT ALL ON TABLE "public"."licitacion_historial" TO "anon";
GRANT ALL ON TABLE "public"."licitacion_historial" TO "authenticated";
GRANT ALL ON TABLE "public"."licitacion_historial" TO "service_role";



GRANT ALL ON TABLE "public"."licitaciones" TO "anon";
GRANT ALL ON TABLE "public"."licitaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."licitaciones" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_agreements" TO "anon";
GRANT ALL ON TABLE "public"."meeting_agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_agreements" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_attachments" TO "anon";
GRANT ALL ON TABLE "public"."meeting_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_attendees" TO "anon";
GRANT ALL ON TABLE "public"."meeting_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_commitments" TO "anon";
GRANT ALL ON TABLE "public"."meeting_commitments" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_commitments" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_tasks" TO "anon";
GRANT ALL ON TABLE "public"."meeting_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_work_sessions" TO "anon";
GRANT ALL ON TABLE "public"."meeting_work_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_work_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."menu_permissions" TO "anon";
GRANT ALL ON TABLE "public"."menu_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."message_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."message_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."message_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."message_mentions" TO "anon";
GRANT ALL ON TABLE "public"."message_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."metadata_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."metadata_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."metadata_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "anon";
GRANT ALL ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";



GRANT ALL ON TABLE "public"."news_articles" TO "anon";
GRANT ALL ON TABLE "public"."news_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."news_articles" TO "service_role";



GRANT ALL ON TABLE "public"."notification_events" TO "anon";
GRANT ALL ON TABLE "public"."notification_events" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_events" TO "service_role";



GRANT ALL ON TABLE "public"."notification_triggers" TO "anon";
GRANT ALL ON TABLE "public"."notification_triggers" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_triggers" TO "service_role";



GRANT ALL ON TABLE "public"."notification_types" TO "anon";
GRANT ALL ON TABLE "public"."notification_types" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_types" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."pasantias_programs" TO "anon";
GRANT ALL ON TABLE "public"."pasantias_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."pasantias_programs" TO "service_role";



GRANT ALL ON TABLE "public"."pasantias_quote_groups" TO "anon";
GRANT ALL ON TABLE "public"."pasantias_quote_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."pasantias_quote_groups" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pasantias_quote_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pasantias_quote_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pasantias_quote_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pasantias_quotes" TO "anon";
GRANT ALL ON TABLE "public"."pasantias_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."pasantias_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_submissions" TO "anon";
GRANT ALL ON TABLE "public"."quiz_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."pending_quiz_reviews" TO "anon";
GRANT ALL ON TABLE "public"."pending_quiz_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_quiz_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."permission_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."permission_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."permission_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."post_comments" TO "anon";
GRANT ALL ON TABLE "public"."post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."post_hashtags" TO "anon";
GRANT ALL ON TABLE "public"."post_hashtags" TO "authenticated";
GRANT ALL ON TABLE "public"."post_hashtags" TO "service_role";



GRANT ALL ON TABLE "public"."post_media" TO "anon";
GRANT ALL ON TABLE "public"."post_media" TO "authenticated";
GRANT ALL ON TABLE "public"."post_media" TO "service_role";



GRANT ALL ON TABLE "public"."post_mentions" TO "anon";
GRANT ALL ON TABLE "public"."post_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."post_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."post_reactions" TO "anon";
GRANT ALL ON TABLE "public"."post_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."post_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."posts_with_engagement" TO "anon";
GRANT ALL ON TABLE "public"."posts_with_engagement" TO "authenticated";
GRANT ALL ON TABLE "public"."posts_with_engagement" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_role_backup" TO "anon";
GRANT ALL ON TABLE "public"."profiles_role_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_role_backup" TO "service_role";



GRANT ALL ON TABLE "public"."program_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."program_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."program_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."program_hours_ledger" TO "anon";
GRANT ALL ON TABLE "public"."program_hours_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."program_hours_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."programa_bases_templates" TO "anon";
GRANT ALL ON TABLE "public"."programa_bases_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."programa_bases_templates" TO "service_role";



GRANT ALL ON TABLE "public"."programa_evaluacion_criterios" TO "anon";
GRANT ALL ON TABLE "public"."programa_evaluacion_criterios" TO "authenticated";
GRANT ALL ON TABLE "public"."programa_evaluacion_criterios" TO "service_role";



GRANT ALL ON TABLE "public"."programas" TO "anon";
GRANT ALL ON TABLE "public"."programas" TO "authenticated";
GRANT ALL ON TABLE "public"."programas" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_consultores" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_consultores" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_consultores" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_contenido_bloques" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_contenido_bloques" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_contenido_bloques" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_documentos_biblioteca" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_documentos_biblioteca" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_documentos_biblioteca" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_fichas_servicio" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_fichas_servicio" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_fichas_servicio" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_generadas" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_generadas" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_generadas" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_plantillas" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_plantillas" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_plantillas" TO "service_role";



GRANT ALL ON TABLE "public"."propuesta_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."propuesta_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."propuesta_rate_limits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."propuesta_rate_limits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."propuesta_rate_limits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."propuesta_rate_limits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."qa_coverage_reports" TO "anon";
GRANT ALL ON TABLE "public"."qa_coverage_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_coverage_reports" TO "service_role";



GRANT ALL ON TABLE "public"."qa_feature_checklist" TO "anon";
GRANT ALL ON TABLE "public"."qa_feature_checklist" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_feature_checklist" TO "service_role";



GRANT ALL ON TABLE "public"."qa_lighthouse_results" TO "anon";
GRANT ALL ON TABLE "public"."qa_lighthouse_results" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_lighthouse_results" TO "service_role";



GRANT ALL ON TABLE "public"."qa_load_test_results" TO "anon";
GRANT ALL ON TABLE "public"."qa_load_test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_load_test_results" TO "service_role";



GRANT ALL ON TABLE "public"."qa_performance_budgets" TO "anon";
GRANT ALL ON TABLE "public"."qa_performance_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_performance_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."qa_scenario_assignments" TO "anon";
GRANT ALL ON TABLE "public"."qa_scenario_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_scenario_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."qa_scenarios" TO "anon";
GRANT ALL ON TABLE "public"."qa_scenarios" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_scenarios" TO "service_role";



GRANT ALL ON TABLE "public"."qa_step_results" TO "anon";
GRANT ALL ON TABLE "public"."qa_step_results" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_step_results" TO "service_role";



GRANT ALL ON TABLE "public"."qa_test_runs" TO "anon";
GRANT ALL ON TABLE "public"."qa_test_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_test_runs" TO "service_role";



GRANT ALL ON TABLE "public"."qa_tester_time_logs" TO "anon";
GRANT ALL ON TABLE "public"."qa_tester_time_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_tester_time_logs" TO "service_role";



GRANT ALL ON TABLE "public"."qa_web_vitals" TO "anon";
GRANT ALL ON TABLE "public"."qa_web_vitals" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_web_vitals" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_statistics" TO "anon";
GRANT ALL ON TABLE "public"."quiz_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."red_escuelas" TO "anon";
GRANT ALL ON TABLE "public"."red_escuelas" TO "authenticated";
GRANT ALL ON TABLE "public"."red_escuelas" TO "service_role";



GRANT ALL ON TABLE "public"."redes_de_colegios" TO "anon";
GRANT ALL ON TABLE "public"."redes_de_colegios" TO "authenticated";
GRANT ALL ON TABLE "public"."redes_de_colegios" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_data" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_data" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_data" TO "service_role";



GRANT ALL ON TABLE "public"."role_permission_baseline" TO "anon";
GRANT ALL ON TABLE "public"."role_permission_baseline" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permission_baseline" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."role_types" TO "anon";
GRANT ALL ON TABLE "public"."role_types" TO "authenticated";
GRANT ALL ON TABLE "public"."role_types" TO "service_role";



GRANT ALL ON TABLE "public"."saved_posts" TO "anon";
GRANT ALL ON TABLE "public"."saved_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_posts" TO "service_role";



GRANT ALL ON TABLE "public"."school_change_history" TO "anon";
GRANT ALL ON TABLE "public"."school_change_history" TO "authenticated";
GRANT ALL ON TABLE "public"."school_change_history" TO "service_role";



GRANT ALL ON TABLE "public"."school_course_docente_assignments" TO "anon";
GRANT ALL ON TABLE "public"."school_course_docente_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."school_course_docente_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."school_course_structure" TO "anon";
GRANT ALL ON TABLE "public"."school_course_structure" TO "authenticated";
GRANT ALL ON TABLE "public"."school_course_structure" TO "service_role";



GRANT ALL ON TABLE "public"."school_plan_completion_status" TO "anon";
GRANT ALL ON TABLE "public"."school_plan_completion_status" TO "authenticated";
GRANT ALL ON TABLE "public"."school_plan_completion_status" TO "service_role";



GRANT ALL ON TABLE "public"."school_progress_report" TO "anon";
GRANT ALL ON TABLE "public"."school_progress_report" TO "authenticated";
GRANT ALL ON TABLE "public"."school_progress_report" TO "service_role";



GRANT ALL ON TABLE "public"."school_transversal_context" TO "anon";
GRANT ALL ON TABLE "public"."school_transversal_context" TO "authenticated";
GRANT ALL ON TABLE "public"."school_transversal_context" TO "service_role";



GRANT ALL ON SEQUENCE "public"."schools_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."schools_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."schools_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."session_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."session_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."session_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."session_attendees" TO "anon";
GRANT ALL ON TABLE "public"."session_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."session_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."session_communications" TO "anon";
GRANT ALL ON TABLE "public"."session_communications" TO "authenticated";
GRANT ALL ON TABLE "public"."session_communications" TO "service_role";



GRANT ALL ON TABLE "public"."session_edit_requests" TO "anon";
GRANT ALL ON TABLE "public"."session_edit_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."session_edit_requests" TO "service_role";



GRANT ALL ON TABLE "public"."session_facilitators" TO "anon";
GRANT ALL ON TABLE "public"."session_facilitators" TO "authenticated";
GRANT ALL ON TABLE "public"."session_facilitators" TO "service_role";



GRANT ALL ON TABLE "public"."session_materials" TO "anon";
GRANT ALL ON TABLE "public"."session_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."session_materials" TO "service_role";



GRANT ALL ON TABLE "public"."session_notifications" TO "anon";
GRANT ALL ON TABLE "public"."session_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."session_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."session_reports" TO "anon";
GRANT ALL ON TABLE "public"."session_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."session_reports" TO "service_role";



GRANT ALL ON TABLE "public"."student_answers" TO "anon";
GRANT ALL ON TABLE "public"."student_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."student_answers" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."superadmins" TO "anon";
GRANT ALL ON TABLE "public"."superadmins" TO "authenticated";
GRANT ALL ON TABLE "public"."superadmins" TO "service_role";



GRANT ALL ON TABLE "public"."supervisor_auditorias" TO "anon";
GRANT ALL ON TABLE "public"."supervisor_auditorias" TO "authenticated";
GRANT ALL ON TABLE "public"."supervisor_auditorias" TO "service_role";



GRANT ALL ON TABLE "public"."system_updates" TO "anon";
GRANT ALL ON TABLE "public"."system_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."system_updates" TO "service_role";



GRANT ALL ON TABLE "public"."test_mode_state" TO "anon";
GRANT ALL ON TABLE "public"."test_mode_state" TO "authenticated";
GRANT ALL ON TABLE "public"."test_mode_state" TO "service_role";



GRANT ALL ON TABLE "public"."tractor_signups" TO "anon";
GRANT ALL ON TABLE "public"."tractor_signups" TO "authenticated";
GRANT ALL ON TABLE "public"."tractor_signups" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_access_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."transformation_access_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_access_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_assessment_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."transformation_assessment_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_assessment_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_assessments" TO "anon";
GRANT ALL ON TABLE "public"."transformation_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."transformation_conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_llm_usage" TO "anon";
GRANT ALL ON TABLE "public"."transformation_llm_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_llm_usage" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_results" TO "anon";
GRANT ALL ON TABLE "public"."transformation_results" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_results" TO "service_role";



GRANT ALL ON TABLE "public"."transformation_rubric" TO "anon";
GRANT ALL ON TABLE "public"."transformation_rubric" TO "authenticated";
GRANT ALL ON TABLE "public"."transformation_rubric" TO "service_role";



GRANT ALL ON TABLE "public"."upcoming_courses" TO "anon";
GRANT ALL ON TABLE "public"."upcoming_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."upcoming_courses" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges_with_details" TO "anon";
GRANT ALL ON TABLE "public"."user_badges_with_details" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges_with_details" TO "service_role";



GRANT ALL ON TABLE "public"."user_mentions" TO "anon";
GRANT ALL ON TABLE "public"."user_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_notifications" TO "anon";
GRANT ALL ON TABLE "public"."user_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."user_onboarding_state" TO "anon";
GRANT ALL ON TABLE "public"."user_onboarding_state" TO "authenticated";
GRANT ALL ON TABLE "public"."user_onboarding_state" TO "service_role";



GRANT ALL ON TABLE "public"."user_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT SELECT ON TABLE "public"."user_roles" TO "anon";



GRANT ALL ON TABLE "public"."user_roles_cache" TO "anon";
GRANT ALL ON TABLE "public"."user_roles_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles_cache" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_activities" TO "anon";
GRANT ALL ON TABLE "public"."workspace_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_activities" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_messages" TO "anon";
GRANT ALL ON TABLE "public"."workspace_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























