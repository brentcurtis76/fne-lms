

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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



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


CREATE TYPE "public"."meeting_status" AS ENUM (
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
    'docente'
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


CREATE OR REPLACE FUNCTION "public"."auth_get_user_role"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_role text;
BEGIN
    -- Get the highest priority role
    SELECT role_type INTO v_role
    FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    ORDER BY 
        CASE role_type
            WHEN 'admin' THEN 1
            WHEN 'consultor' THEN 2
            WHEN 'equipo_directivo' THEN 3
            WHEN 'lider_generacion' THEN 4
            WHEN 'lider_comunidad' THEN 5
            WHEN 'docente' THEN 6
            ELSE 7
        END
    LIMIT 1;
    
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


CREATE OR REPLACE FUNCTION "public"."auth_is_admin"() RETURNS boolean
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


ALTER FUNCTION "public"."auth_is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_is_admin"() IS 'Check if current user is admin. Uses JWT metadata first, then falls back to cached roles.';



CREATE OR REPLACE FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM course_enrollments ce
        WHERE ce.course_id = p_course_id
        AND ce.student_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."auth_is_teacher"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role_type IN ('admin', 'consultor')
        AND is_active = true
    );
END;
$$;


ALTER FUNCTION "public"."auth_is_teacher"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_is_teacher"() IS 'Check if current user is a teacher (admin or consultor). Uses JWT metadata first, then falls back to cached roles.';



CREATE OR REPLACE FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_group_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_assignments UUID[] := '{}';
BEGIN
    -- Validate that path exists
    IF NOT EXISTS (SELECT 1 FROM learning_paths WHERE id = p_path_id) THEN
        RAISE EXCEPTION 'Learning path not found';
    END IF;
    
    -- Check if user has permission to assign
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_assigned_by 
        AND is_active = true
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign learning paths';
    END IF;
    
    -- Process user assignments
    IF array_length(p_user_ids, 1) > 0 THEN
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
            RETURNING id INTO v_user_id;
            
            v_assignments := array_append(v_assignments, v_user_id);
            v_success_count := v_success_count + 1;
        END LOOP;
    END IF;
    
    -- Process group assignments
    IF array_length(p_group_ids, 1) > 0 THEN
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
            IF NOT EXISTS (SELECT 1 FROM groups WHERE id = v_group_id) THEN
                RAISE EXCEPTION 'Group with ID % does not exist', v_group_id;
            END IF;
            
            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, group_id, assigned_by)
            VALUES (p_path_id, v_group_id, p_assigned_by)
            RETURNING id INTO v_group_id;
            
            v_assignments := array_append(v_assignments, v_group_id);
            v_success_count := v_success_count + 1;
        END LOOP;
    END IF;
    
    -- Return summary
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'assignment_ids', v_assignments,
        'message', format('%s assignments created, %s skipped (already assigned)', 
                         v_success_count, v_skip_count)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any error will rollback all assignments
        RAISE;
END;
$$;


ALTER FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") IS 'Assigns a learning path to multiple users and/or groups in a single atomic transaction. 
Skips duplicates gracefully. If any assignment fails, all are rolled back.';



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


CREATE OR REPLACE FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_path_id UUID;
    v_course_id UUID;
    v_sequence INT := 1;
    v_result json;
BEGIN
    -- Validate inputs
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
            
            -- Insert course association
            INSERT INTO learning_path_courses (path_id, course_id, sequence)
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


COMMENT ON FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") IS 'Creates a learning path with associated courses in a single atomic transaction. 
If any part fails, the entire operation is rolled back.';



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


CREATE OR REPLACE FUNCTION "public"."exec_sql"("sql" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  execute sql;
end;
$$;


ALTER FUNCTION "public"."exec_sql"("sql" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."refresh_user_roles_cache"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache;
END;
$$;


ALTER FUNCTION "public"."refresh_user_roles_cache"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_path_owner UUID;
    v_is_admin BOOLEAN;
    v_course_id UUID;
    v_sequence INT := 1;
    v_result json;
BEGIN
    -- Validate inputs
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning path name cannot be empty';
    END IF;
    
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Learning path description cannot be empty';
    END IF;
    
    -- Check if learning path exists and get owner
    SELECT created_by INTO v_path_owner
    FROM learning_paths
    WHERE id = p_path_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Learning path not found';
    END IF;
    
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_updated_by 
        AND is_active = true
        AND role_type = 'admin'
    ) INTO v_is_admin;
    
    -- Check permissions: must be owner or admin
    IF v_path_owner != p_updated_by AND NOT v_is_admin THEN
        RAISE EXCEPTION 'You can only update your own learning paths';
    END IF;
    
    -- Start atomic update
    
    -- 1. Update the learning path metadata
    UPDATE learning_paths
    SET name = p_name,
        description = p_description,
        updated_at = NOW()
    WHERE id = p_path_id;
    
    -- 2. Delete all existing course associations
    DELETE FROM learning_path_courses
    WHERE path_id = p_path_id;
    
    -- 3. Create new course associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association
            INSERT INTO learning_path_courses (path_id, course_id, sequence)
            VALUES (p_path_id, v_course_id, v_sequence);
            
            v_sequence := v_sequence + 1;
        END LOOP;
    END IF;
    
    -- 4. Return the updated learning path
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


COMMENT ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") IS 'Updates a learning path and replaces all associated courses in a single atomic transaction. 
If any part fails, the entire operation is rolled back.';



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



CREATE OR REPLACE FUNCTION "public"."update_school_has_generations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_school_id uuid;
  v_generation_count integer;
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
  
  -- For DELETE operations, return OLD; for INSERT/UPDATE, return NEW
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
but actually has none (e.g., after all generations are deleted).';



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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."community_messages" OWNER TO "postgres";


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
    "total_lessons" integer DEFAULT 0,
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
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."growth_communities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "generation_id" "uuid",
    "school_id" integer,
    "name" "text" NOT NULL,
    "description" "text",
    "max_teachers" integer DEFAULT 16,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
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
    CONSTRAINT "profiles_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "has_generations" boolean DEFAULT false,
    "cliente_id" "uuid"
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



CREATE TABLE IF NOT EXISTS "public"."contratos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero_contrato" character varying(50) NOT NULL,
    "fecha_contrato" "date" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "programa_id" "uuid" NOT NULL,
    "precio_total_uf" numeric(10,2) NOT NULL,
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
    CONSTRAINT "contratos_nombre_ciclo_check" CHECK ((("nombre_ciclo")::"text" = ANY (ARRAY[('Primer Ciclo'::character varying)::"text", ('Segundo Ciclo'::character varying)::"text", ('Tercer Ciclo'::character varying)::"text", ('Equipo Directivo'::character varying)::"text"])))
);


ALTER TABLE "public"."contratos" OWNER TO "postgres";


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
    CONSTRAINT "courses_difficulty_level_check" CHECK ((("difficulty_level")::"text" = ANY (ARRAY[('beginner'::character varying)::"text", ('intermediate'::character varying)::"text", ('advanced'::character varying)::"text"]))),
    CONSTRAINT "description_not_empty" CHECK (("char_length"(TRIM(BOTH FROM "description")) > 0)),
    CONSTRAINT "title_not_empty" CHECK (("char_length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


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


ALTER TABLE "public"."cuotas" OWNER TO "postgres";


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
    CONSTRAINT "expense_items_currency_check" CHECK ((("currency")::"text" = ANY (ARRAY[('CLP'::character varying)::"text", ('USD'::character varying)::"text", ('EUR'::character varying)::"text"])))
);


ALTER TABLE "public"."expense_items" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."group_assignment_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_consultant_managed" boolean DEFAULT false
);


ALTER TABLE "public"."group_assignment_groups" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."instructors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."instructors" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lesson_assignment_submissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."lesson_assignment_submissions" IS 'Stores student submissions for assignments';



COMMENT ON COLUMN "public"."lesson_assignment_submissions"."status" IS 'Submission status: draft, submitted, graded, returned';



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
    "user_id" "uuid",
    "lesson_id" "uuid",
    "block_id" "uuid",
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



CREATE TABLE IF NOT EXISTS "public"."meeting_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "agreement_text" "text" NOT NULL,
    "order_index" integer DEFAULT 0,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
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
    CONSTRAINT "no_self_parent" CHECK (("parent_task_id" <> "id")),
    CONSTRAINT "task_completed_when_done" CHECK (((("status" = 'completado'::"public"."task_status") AND ("completed_at" IS NOT NULL) AND ("progress_percentage" = 100)) OR (("status" <> 'completado'::"public"."task_status") AND (("completed_at" IS NULL) OR ("progress_percentage" < 100))))),
    CONSTRAINT "task_title_not_empty" CHECK (("length"(TRIM(BOTH FROM "task_title")) > 0)),
    CONSTRAINT "valid_hours" CHECK (((("estimated_hours" IS NULL) OR ("estimated_hours" >= (0)::numeric)) AND (("actual_hours" IS NULL) OR ("actual_hours" >= (0)::numeric)))),
    CONSTRAINT "valid_task_progress" CHECK ((("progress_percentage" >= 0) AND ("progress_percentage" <= 100)))
);


ALTER TABLE "public"."meeting_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."meeting_tasks" IS 'Specific tasks assigned during meetings';



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
    "message_id" "uuid",
    "user_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


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
    "custom_category_name" character varying(100)
);


ALTER TABLE "public"."message_threads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."message_threads"."custom_category_name" IS 'Name for custom thread categories when category = "custom"';



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


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "endpoint" "text" NOT NULL,
    "keys" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."saved_posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."saved_posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."saved_posts" IS 'User bookmarked posts';



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


CREATE SEQUENCE IF NOT EXISTS "public"."schools_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."schools_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."schools_id_seq" OWNED BY "public"."schools"."id";



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
    CONSTRAINT "user_notifications_importance_check" CHECK ((("importance")::"text" = ANY (ARRAY[('low'::character varying)::"text", ('normal'::character varying)::"text", ('high'::character varying)::"text"])))
);


ALTER TABLE "public"."user_notifications" OWNER TO "postgres";


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
    CONSTRAINT "check_role_organizational_scope" CHECK ((("role_type" = 'admin'::"public"."user_role_type") OR (("role_type" = 'consultor'::"public"."user_role_type") AND ("school_id" IS NOT NULL)) OR (("role_type" = 'equipo_directivo'::"public"."user_role_type") AND ("school_id" IS NOT NULL)) OR (("role_type" = 'lider_generacion'::"public"."user_role_type") AND ("school_id" IS NOT NULL)) OR (("role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("school_id" IS NOT NULL)) OR (("role_type" = 'docente'::"public"."user_role_type") AND ("school_id" IS NOT NULL))))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."schools" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."schools_id_seq"'::"regclass");



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



ALTER TABLE ONLY "public"."assignment_feedback"
    ADD CONSTRAINT "assignment_feedback_assignment_id_student_id_key" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."assignment_feedback"
    ADD CONSTRAINT "assignment_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_templates"
    ADD CONSTRAINT "assignment_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocks"
    ADD CONSTRAINT "blocks_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_numero_contrato_key" UNIQUE ("numero_contrato");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_course_id_teacher_id_key" UNIQUE ("course_id", "teacher_id");



ALTER TABLE ONLY "public"."course_assignments"
    ADD CONSTRAINT "course_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_enrollments"
    ADD CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuotas"
    ADD CONSTRAINT "cuotas_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_reports"
    ADD CONSTRAINT "expense_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_activity"
    ADD CONSTRAINT "feedback_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_permissions"
    ADD CONSTRAINT "feedback_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_permissions"
    ADD CONSTRAINT "feedback_permissions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."instructors"
    ADD CONSTRAINT "instructors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "learning_path_courses_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."message_activity_log"
    ADD CONSTRAINT "message_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_mentions"
    ADD CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metadata_sync_log"
    ADD CONSTRAINT "metadata_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_triggers"
    ADD CONSTRAINT "notification_triggers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_types"
    ADD CONSTRAINT "notification_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."programas"
    ADD CONSTRAINT "programas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_lesson_id_block_id_student_id_attempt_numb_key" UNIQUE ("lesson_id", "block_id", "student_id", "attempt_number");



ALTER TABLE ONLY "public"."quiz_submissions"
    ADD CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_answers"
    ADD CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_updates"
    ADD CONSTRAINT "system_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultant_assignments"
    ADD CONSTRAINT "unique_active_consultant_student" UNIQUE ("consultant_id", "student_id");



ALTER TABLE ONLY "public"."course_prerequisites"
    ADD CONSTRAINT "unique_course_prerequisite" UNIQUE ("course_id", "prerequisite_course_id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "unique_document_version" UNIQUE ("document_id", "version_number");



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "unique_path_course" UNIQUE ("learning_path_id", "course_id");



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "unique_path_course_order" UNIQUE ("learning_path_id", "sequence_order");



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



ALTER TABLE ONLY "public"."user_mentions"
    ADD CONSTRAINT "user_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_notification_type_key" UNIQUE ("user_id", "notification_type");



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_assignment_feedback_assignment" ON "public"."assignment_feedback" USING "btree" ("assignment_id");



CREATE INDEX "idx_assignment_feedback_student" ON "public"."assignment_feedback" USING "btree" ("student_id");



CREATE INDEX "idx_assignment_instances_course" ON "public"."assignment_instances" USING "btree" ("course_id");



CREATE INDEX "idx_assignment_instances_status" ON "public"."assignment_instances" USING "btree" ("status");



CREATE INDEX "idx_assignment_instances_template" ON "public"."assignment_instances" USING "btree" ("template_id");



CREATE INDEX "idx_assignment_submissions_instance" ON "public"."assignment_submissions" USING "btree" ("instance_id");



CREATE INDEX "idx_assignment_submissions_user" ON "public"."assignment_submissions" USING "btree" ("user_id");



CREATE INDEX "idx_assignment_templates_lesson" ON "public"."assignment_templates" USING "btree" ("lesson_id");



CREATE INDEX "idx_blocks_is_visible" ON "public"."blocks" USING "btree" ("is_visible");



CREATE INDEX "idx_blocks_lesson_id" ON "public"."blocks" USING "btree" ("lesson_id");



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



CREATE INDEX "idx_community_documents_active" ON "public"."community_documents" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_community_documents_created_at" ON "public"."community_documents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_community_documents_file_name" ON "public"."community_documents" USING "btree" ("file_name");



CREATE INDEX "idx_community_documents_folder" ON "public"."community_documents" USING "btree" ("folder_id");



CREATE INDEX "idx_community_documents_tags" ON "public"."community_documents" USING "gin" ("tags");



CREATE INDEX "idx_community_documents_uploaded_by" ON "public"."community_documents" USING "btree" ("uploaded_by");



CREATE INDEX "idx_community_documents_workspace" ON "public"."community_documents" USING "btree" ("workspace_id");



CREATE INDEX "idx_community_meetings_created_by" ON "public"."community_meetings" USING "btree" ("created_by");



CREATE INDEX "idx_community_meetings_date" ON "public"."community_meetings" USING "btree" ("meeting_date");



CREATE INDEX "idx_community_meetings_is_active" ON "public"."community_meetings" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_community_meetings_status" ON "public"."community_meetings" USING "btree" ("status");



CREATE INDEX "idx_community_meetings_workspace_id" ON "public"."community_meetings" USING "btree" ("workspace_id");



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



CREATE INDEX "idx_contratos_is_anexo" ON "public"."contratos" USING "btree" ("is_anexo");



CREATE INDEX "idx_contratos_parent_id" ON "public"."contratos" USING "btree" ("parent_contrato_id");



CREATE INDEX "idx_course_assignments_course_id" ON "public"."course_assignments" USING "btree" ("course_id");



CREATE INDEX "idx_course_assignments_teacher_id" ON "public"."course_assignments" USING "btree" ("teacher_id");



CREATE INDEX "idx_course_assignments_teacher_role" ON "public"."course_assignments" USING "btree" ("teacher_id");



CREATE INDEX "idx_course_enrollments_completion" ON "public"."course_enrollments" USING "btree" ("is_completed");



CREATE INDEX "idx_course_enrollments_course_id" ON "public"."course_enrollments" USING "btree" ("course_id");



CREATE INDEX "idx_course_enrollments_status" ON "public"."course_enrollments" USING "btree" ("status");



CREATE INDEX "idx_course_enrollments_user_id" ON "public"."course_enrollments" USING "btree" ("user_id");



CREATE INDEX "idx_course_enrollments_user_stats" ON "public"."course_enrollments" USING "btree" ("user_id", "is_completed", "progress_percentage");



CREATE INDEX "idx_courses_difficulty" ON "public"."courses" USING "btree" ("difficulty_level");



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



CREATE INDEX "idx_expense_items_category_id" ON "public"."expense_items" USING "btree" ("category_id");



CREATE INDEX "idx_expense_items_date" ON "public"."expense_items" USING "btree" ("expense_date");



CREATE INDEX "idx_expense_items_report_id" ON "public"."expense_items" USING "btree" ("report_id");



CREATE INDEX "idx_expense_reports_dates" ON "public"."expense_reports" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_expense_reports_status" ON "public"."expense_reports" USING "btree" ("status");



CREATE INDEX "idx_expense_reports_submitted_by" ON "public"."expense_reports" USING "btree" ("submitted_by");



CREATE INDEX "idx_feedback_activity_created_at" ON "public"."feedback_activity" USING "btree" ("created_at");



CREATE INDEX "idx_feedback_activity_feedback_id" ON "public"."feedback_activity" USING "btree" ("feedback_id");



CREATE INDEX "idx_feedback_permissions_is_active" ON "public"."feedback_permissions" USING "btree" ("is_active");



CREATE INDEX "idx_feedback_permissions_user_id" ON "public"."feedback_permissions" USING "btree" ("user_id");



CREATE INDEX "idx_group_assignment_groups_assignment_id" ON "public"."group_assignment_groups" USING "btree" ("assignment_id");



CREATE INDEX "idx_group_assignment_groups_community_id" ON "public"."group_assignment_groups" USING "btree" ("community_id");



CREATE INDEX "idx_group_assignment_members_group_id" ON "public"."group_assignment_members" USING "btree" ("group_id");



CREATE INDEX "idx_group_assignment_members_user_id" ON "public"."group_assignment_members" USING "btree" ("user_id");



CREATE INDEX "idx_group_assignment_submissions_assignment_id" ON "public"."group_assignment_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_group_assignment_submissions_group_id" ON "public"."group_assignment_submissions" USING "btree" ("group_id");



CREATE INDEX "idx_group_assignment_submissions_user_id" ON "public"."group_assignment_submissions" USING "btree" ("user_id");



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



CREATE INDEX "idx_lesson_submissions_assignment" ON "public"."lesson_assignment_submissions" USING "btree" ("assignment_id");



CREATE INDEX "idx_lesson_submissions_status" ON "public"."lesson_assignment_submissions" USING "btree" ("status");



CREATE INDEX "idx_lesson_submissions_student" ON "public"."lesson_assignment_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_lesson_submissions_submitted_at" ON "public"."lesson_assignment_submissions" USING "btree" ("submitted_at");



CREATE INDEX "idx_lessons_difficulty" ON "public"."lessons" USING "btree" ("difficulty_level");



CREATE INDEX "idx_lessons_mandatory" ON "public"."lessons" USING "btree" ("is_mandatory");



CREATE INDEX "idx_lessons_type" ON "public"."lessons" USING "btree" ("lesson_type");



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



CREATE INDEX "idx_notification_events_processed" ON "public"."notification_events" USING "btree" ("processed_at");



CREATE INDEX "idx_notification_events_type" ON "public"."notification_events" USING "btree" ("event_type");



CREATE INDEX "idx_notification_triggers_active" ON "public"."notification_triggers" USING "btree" ("is_active");



CREATE INDEX "idx_notification_triggers_event_type" ON "public"."notification_triggers" USING "btree" ("event_type");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_entity" ON "public"."notifications" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_platform_feedback_created_at" ON "public"."platform_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_platform_feedback_created_by" ON "public"."platform_feedback" USING "btree" ("created_by");



CREATE INDEX "idx_platform_feedback_status" ON "public"."platform_feedback" USING "btree" ("status");



CREATE INDEX "idx_post_comments_post" ON "public"."post_comments" USING "btree" ("post_id");



CREATE INDEX "idx_post_hashtags_hashtag" ON "public"."post_hashtags" USING "btree" ("hashtag");



CREATE INDEX "idx_post_media_post" ON "public"."post_media" USING "btree" ("post_id");



CREATE INDEX "idx_post_reactions_post" ON "public"."post_reactions" USING "btree" ("post_id");



CREATE INDEX "idx_profiles_community_id" ON "public"."profiles" USING "btree" ("community_id") WHERE ("community_id" IS NOT NULL);



CREATE INDEX "idx_profiles_generation_id" ON "public"."profiles" USING "btree" ("generation_id") WHERE ("generation_id" IS NOT NULL);



CREATE INDEX "idx_profiles_last_active" ON "public"."profiles" USING "btree" ("last_active_at");



CREATE INDEX "idx_profiles_must_change_password" ON "public"."profiles" USING "btree" ("must_change_password") WHERE ("must_change_password" = true);



CREATE INDEX "idx_profiles_school_id" ON "public"."profiles" USING "btree" ("school_id") WHERE ("school_id" IS NOT NULL);



CREATE INDEX "idx_quiz_submissions_course" ON "public"."quiz_submissions" USING "btree" ("course_id");



CREATE INDEX "idx_quiz_submissions_graded_by" ON "public"."quiz_submissions" USING "btree" ("graded_by");



CREATE INDEX "idx_quiz_submissions_grading_status" ON "public"."quiz_submissions" USING "btree" ("grading_status");



CREATE INDEX "idx_quiz_submissions_student" ON "public"."quiz_submissions" USING "btree" ("student_id");



CREATE INDEX "idx_saved_posts_user" ON "public"."saved_posts" USING "btree" ("user_id");



CREATE INDEX "idx_schools_cliente_id" ON "public"."schools" USING "btree" ("cliente_id");



CREATE INDEX "idx_system_updates_importance" ON "public"."system_updates" USING "btree" ("importance");



CREATE INDEX "idx_system_updates_published" ON "public"."system_updates" USING "btree" ("published_at");



CREATE UNIQUE INDEX "idx_unique_anexo_per_parent" ON "public"."contratos" USING "btree" ("parent_contrato_id", "anexo_numero") WHERE ("is_anexo" = true);



CREATE UNIQUE INDEX "idx_unique_community_name_per_scope" ON "public"."growth_communities" USING "btree" ("name", "school_id", COALESCE("generation_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "idx_user_mentions_author" ON "public"."user_mentions" USING "btree" ("author_id");



CREATE INDEX "idx_user_mentions_mentioned" ON "public"."user_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "idx_user_notification_preferences_type" ON "public"."user_notification_preferences" USING "btree" ("notification_type");



CREATE INDEX "idx_user_notification_preferences_user_id" ON "public"."user_notification_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_user_notifications_created_at" ON "public"."user_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_notifications_is_read" ON "public"."user_notifications" USING "btree" ("is_read");



CREATE INDEX "idx_user_notifications_type" ON "public"."user_notifications" USING "btree" ("notification_type_id");



CREATE INDEX "idx_user_notifications_user_id" ON "public"."user_notifications" USING "btree" ("user_id");



CREATE INDEX "idx_user_progress_activity" ON "public"."user_progress" USING "btree" ("user_id", "last_interaction");



CREATE INDEX "idx_user_progress_completion" ON "public"."user_progress" USING "btree" ("user_id", "is_completed");



CREATE INDEX "idx_user_progress_last_interaction" ON "public"."user_progress" USING "btree" ("last_interaction");



CREATE INDEX "idx_user_progress_lesson_id" ON "public"."user_progress" USING "btree" ("lesson_id");



CREATE INDEX "idx_user_progress_user_id" ON "public"."user_progress" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_active" ON "public"."user_roles" USING "btree" ("is_active");



CREATE INDEX "idx_user_roles_role_type" ON "public"."user_roles" USING "btree" ("role_type");



CREATE INDEX "idx_user_roles_school" ON "public"."user_roles" USING "btree" ("school_id");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_workspace_activities_created_at" ON "public"."workspace_activities" USING "btree" ("created_at");



CREATE INDEX "idx_workspace_activities_workspace_id" ON "public"."workspace_activities" USING "btree" ("workspace_id");



CREATE INDEX "idx_workspace_messages_recipient" ON "public"."workspace_messages" USING "btree" ("recipient_id");



CREATE INDEX "idx_workspace_messages_sender" ON "public"."workspace_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_workspace_messages_thread" ON "public"."workspace_messages" USING "btree" ("thread_id");



CREATE INDEX "lesson_progress_lesson_block_idx" ON "public"."lesson_progress" USING "btree" ("lesson_id", "block_id");



CREATE INDEX "lesson_progress_user_lesson_idx" ON "public"."lesson_progress" USING "btree" ("user_id", "lesson_id");



CREATE OR REPLACE TRIGGER "check_community_organization_trigger" BEFORE INSERT OR UPDATE ON "public"."growth_communities" FOR EACH ROW EXECUTE FUNCTION "public"."check_community_organization"();



CREATE OR REPLACE TRIGGER "feedback_status_change" AFTER UPDATE ON "public"."platform_feedback" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."feedback_status_change_trigger"();



CREATE OR REPLACE TRIGGER "log_community_documents_access" AFTER UPDATE ON "public"."community_documents" FOR EACH ROW EXECUTE FUNCTION "public"."log_document_access"();



CREATE OR REPLACE TRIGGER "profiles_changed_refresh_cache" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH STATEMENT EXECUTE FUNCTION "public"."trigger_refresh_user_roles_cache"();



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



CREATE OR REPLACE TRIGGER "update_document_folders_timestamp" BEFORE UPDATE ON "public"."document_folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_folder_timestamp"();



CREATE OR REPLACE TRIGGER "update_lesson_assignment_submissions_updated_at" BEFORE UPDATE ON "public"."lesson_assignment_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lesson_assignments_updated_at" BEFORE UPDATE ON "public"."lesson_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_post_comments_updated_at" BEFORE UPDATE ON "public"."post_comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_school_generations_on_delete" AFTER DELETE ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_has_generations"();



CREATE OR REPLACE TRIGGER "update_school_generations_on_insert" AFTER INSERT ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_has_generations"();



CREATE OR REPLACE TRIGGER "update_school_generations_on_update" AFTER UPDATE OF "school_id" ON "public"."generations" FOR EACH ROW EXECUTE FUNCTION "public"."update_school_has_generations"();



CREATE OR REPLACE TRIGGER "update_streak_on_meditation" AFTER INSERT ON "public"."church_meditation_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_meditation_streak"();



CREATE OR REPLACE TRIGGER "update_user_notification_preferences_updated_at" BEFORE UPDATE ON "public"."user_notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_assignment_instance_course_trigger" BEFORE INSERT OR UPDATE ON "public"."assignment_instances" FOR EACH ROW EXECUTE FUNCTION "public"."validate_assignment_instance_course"();



ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_subscriptions"
    ADD CONSTRAINT "activity_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



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
    ADD CONSTRAINT "community_meetings_secretary_id_fkey" FOREIGN KEY ("secretary_id") REFERENCES "public"."profiles"("id");



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



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cuotas"
    ADD CONSTRAINT "cuotas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_notifications_type" FOREIGN KEY ("type") REFERENCES "public"."notification_types"("id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "fk_preferences_type" FOREIGN KEY ("notification_type") REFERENCES "public"."notification_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generations"
    ADD CONSTRAINT "generations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_assignment_groups"
    ADD CONSTRAINT "group_assignment_groups_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."growth_communities"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "learning_path_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_path_courses"
    ADD CONSTRAINT "learning_path_courses_learning_path_id_fkey" FOREIGN KEY ("learning_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE CASCADE;



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
    ADD CONSTRAINT "lesson_assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "public"."notification_triggers"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_posts"
    ADD CONSTRAINT "saved_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."system_updates"
    ADD CONSTRAINT "system_updates_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



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



CREATE POLICY "Admins can create workspaces" ON "public"."community_workspaces" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



CREATE POLICY "Admins can manage dev users" ON "public"."dev_users" USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"))) WITH CHECK ((("auth"."uid"() = "id") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Admins view all audit logs" ON "public"."dev_audit_log" FOR SELECT USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "Admins view all dev sessions" ON "public"."dev_role_sessions" FOR SELECT USING ("public"."is_global_admin"("auth"."uid"()));



CREATE POLICY "All users can view published updates" ON "public"."system_updates" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Allow Admins to manage all profiles" ON "public"."profiles" USING ((( SELECT "user_roles"."role_type"
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type"))
 LIMIT 1) = 'admin'::"public"."user_role_type"));



CREATE POLICY "Allow Admins to manage all workspaces" ON "public"."community_workspaces" USING ((( SELECT "user_roles"."role_type"
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type"))
 LIMIT 1) = 'admin'::"public"."user_role_type")) WITH CHECK ((( SELECT "user_roles"."role_type"
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'admin'::"public"."user_role_type"))
 LIMIT 1) = 'admin'::"public"."user_role_type"));



CREATE POLICY "Allow all users to select generations" ON "public"."generations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow all users to select growth_communities" ON "public"."growth_communities" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow community members to view their own workspace" ON "public"."community_workspaces" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."community_id" = "community_workspaces"."community_id") AND ("user_roles"."is_active" = true)))));



CREATE POLICY "Allow individual users to manage their own profile" ON "public"."profiles" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow insert if course exists" ON "public"."blocks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE ("courses"."id" = "blocks"."course_id"))));



CREATE POLICY "Allow read blocks" ON "public"."blocks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow update if course exists" ON "public"."blocks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE ("courses"."id" = "blocks"."course_id")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE ("courses"."id" = "blocks"."course_id"))));



CREATE POLICY "Allow users to update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow users to view profiles of community members" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "r1"
     JOIN "public"."user_roles" "r2" ON (("r1"."community_id" = "r2"."community_id")))
  WHERE (("r1"."user_id" = "auth"."uid"()) AND ("r2"."user_id" = "profiles"."id") AND ("r1"."is_active" = true) AND ("r2"."is_active" = true)))));



CREATE POLICY "Allow users to view their community members" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "r1"
     JOIN "public"."user_roles" "r2" ON (("r1"."community_id" = "r2"."community_id")))
  WHERE (("r1"."user_id" = "auth"."uid"()) AND ("r2"."user_id" = "profiles"."id") AND ("r1"."is_active" = true) AND ("r2"."is_active" = true) AND ("r1"."community_id" IS NOT NULL)))));



CREATE POLICY "Allow users to view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Anyone can create church prayer requests" ON "public"."church_prayer_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read group assignment settings" ON "public"."group_assignment_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Anyone can view hashtags" ON "public"."post_hashtags" FOR SELECT USING (true);



CREATE POLICY "Assignment creators can update their own assignments" ON "public"."lesson_assignments" FOR UPDATE USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Assignment creators can view all their assignments" ON "public"."lesson_assignments" FOR SELECT USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Authenticated users can view communities" ON "public"."growth_communities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view generations" ON "public"."generations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



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



CREATE POLICY "Community members can update workspace settings" ON "public"."community_workspaces" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "ur"."community_id") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true))))));



CREATE POLICY "Community members can view meetings" ON "public"."community_meetings" FOR SELECT USING (((("is_active" IS NULL) OR ("is_active" = true)) AND ((EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM (("public"."community_workspaces" "cw"
     JOIN "public"."growth_communities" "gc" ON (("gc"."id" = "cw"."community_id")))
     JOIN "public"."user_roles" "ur" ON (("ur"."school_id" = "gc"."school_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."is_active" = true)))))));



CREATE POLICY "Community members can view their workspace" ON "public"."community_workspaces" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "ur"."community_id") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."growth_communities" "gc" ON (("gc"."id" = "ur"."community_id")))
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'consultor'::"public"."user_role_type") AND ("ur"."school_id" = "gc"."school_id") AND ("ur"."is_active" = true))))));



CREATE POLICY "Consultants can manage settings" ON "public"."group_assignment_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role_type" = 'consultor'::"public"."user_role_type")))));



CREATE POLICY "Dev users can view their own record" ON "public"."dev_users" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Devs manage own sessions" ON "public"."dev_role_sessions" USING ((("dev_user_id" = "auth"."uid"()) AND "public"."is_dev_user"("auth"."uid"())));



CREATE POLICY "Devs view own audit log" ON "public"."dev_audit_log" FOR SELECT USING ((("dev_user_id" = "auth"."uid"()) AND "public"."is_dev_user"("auth"."uid"())));



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



CREATE POLICY "Meeting creators and authorized users can delete meetings" ON "public"."community_meetings" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'lider_comunidad'::"public"."user_role_type") AND ("ur"."is_active" = true))))));



CREATE POLICY "Meeting creators and leaders can update meetings" ON "public"."community_meetings" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."community_workspaces" "cw"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "cw"."community_id")))
  WHERE (("cw"."id" = "community_meetings"."workspace_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = ANY (ARRAY['lider_comunidad'::"public"."user_role_type", 'admin'::"public"."user_role_type"])) AND ("ur"."is_active" = true)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true))))));



CREATE POLICY "Mentions are managed through posts" ON "public"."post_mentions" USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_mentions"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Only church admins can update organization" ON "public"."church_organizations" FOR UPDATE USING (("id" IN ( SELECT "church_profiles"."organization_id"
   FROM "public"."church_profiles"
  WHERE (("church_profiles"."id" = "auth"."uid"()) AND ("church_profiles"."role" = 'admin'::"public"."church_user_role")))));



CREATE POLICY "Organization admins can manage invitations" ON "public"."church_invitations" USING (("organization_id" IN ( SELECT "church_profiles"."organization_id"
   FROM "public"."church_profiles"
  WHERE (("church_profiles"."id" = "auth"."uid"()) AND ("church_profiles"."role" = 'admin'::"public"."church_user_role")))));



CREATE POLICY "Permitir todo en clientes" ON "public"."clientes" USING (true);



CREATE POLICY "Permitir todo en contratos" ON "public"."contratos" USING (true);



CREATE POLICY "Permitir todo en cuotas" ON "public"."cuotas" USING (true);



CREATE POLICY "Permitir todo en programas" ON "public"."programas" USING (true);



CREATE POLICY "Public can read church about sections" ON "public"."church_about_sections" FOR SELECT USING (true);



CREATE POLICY "Public can read church contact info" ON "public"."church_contact_info" FOR SELECT USING (true);



CREATE POLICY "Public can read church hero sections" ON "public"."church_hero_sections" FOR SELECT USING (true);



CREATE POLICY "Public can read church schedules" ON "public"."church_schedules" FOR SELECT USING (true);



CREATE POLICY "Public can read church sermons" ON "public"."church_sermons" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Public can read church team members" ON "public"."church_team_members" FOR SELECT USING (true);



CREATE POLICY "Public can read church website settings" ON "public"."church_website_settings" FOR SELECT USING (true);



CREATE POLICY "Public can read published church events" ON "public"."church_events" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Published assignments are viewable by all authenticated users" ON "public"."lesson_assignments" FOR SELECT USING ((("is_published" = true) AND ("auth"."role"() = 'authenticated'::"text")));



CREATE POLICY "Published lesson assignments are viewable by authenticated user" ON "public"."lesson_assignments" FOR SELECT USING ((("is_published" = true) AND ("auth"."role"() = 'authenticated'::"text")));



CREATE POLICY "Simple admin profile access" ON "public"."profiles" TO "authenticated" USING ((("auth"."uid"() = "id") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"))) WITH CHECK ((("auth"."uid"() = "id") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Students can submit assignments" ON "public"."group_assignment_submissions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Students can update own submissions" ON "public"."group_assignment_submissions" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "Students can update their own lesson assignment submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING ((("student_id" = "auth"."uid"()) AND (("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text"])))) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can update their own submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING ((("student_id" = "auth"."uid"()) AND (("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('submitted'::character varying)::"text"])))) WITH CHECK (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view own submissions" ON "public"."group_assignment_submissions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own feedback" ON "public"."assignment_feedback" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their own lesson assignment submissions" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "Students can view their own submissions" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("student_id" = "auth"."uid"()));



CREATE POLICY "System can insert access logs" ON "public"."document_access_log" FOR INSERT WITH CHECK ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "System can insert notifications" ON "public"."user_notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "System updates lesson summary" ON "public"."lesson_completion_summary" USING (true) WITH CHECK (true);



CREATE POLICY "Teachers can grade lesson assignment submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Teachers can grade submissions" ON "public"."lesson_assignment_submissions" FOR UPDATE USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Teachers can view lesson assignment submissions for their assig" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



CREATE POLICY "Teachers can view submissions for their assignments" ON "public"."lesson_assignment_submissions" FOR SELECT USING (("assignment_id" IN ( SELECT "lesson_assignments"."id"
   FROM "public"."lesson_assignments"
  WHERE ("lesson_assignments"."created_by" = "auth"."uid"()))));



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



CREATE POLICY "Users can create groups in their community" ON "public"."group_assignment_groups" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "ur"."community_id") AND ("ur"."is_active" = true)))));



CREATE POLICY "Users can create meeting commitments" ON "public"."meeting_commitments" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can create mentions" ON "public"."user_mentions" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can create own favorites" ON "public"."church_meditation_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own preferences" ON "public"."church_meditation_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own recommendations" ON "public"."church_meditation_recommendations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own streaks" ON "public"."church_meditation_streaks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create posts in their communities" ON "public"."community_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "author_id") AND "public"."can_access_workspace"("auth"."uid"(), "workspace_id")));



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



CREATE POLICY "Users can delete media for their posts" ON "public"."post_media" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete meeting attendees" ON "public"."meeting_attendees" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can delete meeting commitments" ON "public"."meeting_commitments" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



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



CREATE POLICY "Users can insert own profile during registration" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own progress" ON "public"."user_progress" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own activities" ON "public"."workspace_activities" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own progress" ON "public"."lesson_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can join groups" ON "public"."group_assignment_members" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."group_assignment_groups" "gag"
     JOIN "public"."user_roles" "ur" ON (("ur"."community_id" = "gag"."community_id")))
  WHERE (("gag"."id" = "group_assignment_members"."group_id") AND ("ur"."user_id" = "auth"."uid"()) AND ("ur"."is_active" = true))))));



CREATE POLICY "Users can manage own push subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own profile" ON "public"."profiles" USING (("auth"."uid"() = "id"));



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



CREATE POLICY "Users can read their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can remove their own reactions" ON "public"."post_reactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can save posts" ON "public"."saved_posts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages" ON "public"."workspace_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can unsave posts" ON "public"."saved_posts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update media for their posts" ON "public"."post_media" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE (("p"."id" = "post_media"."post_id") AND ("p"."author_id" = "auth"."uid"())))));



CREATE POLICY "Users can update meeting attendees" ON "public"."meeting_attendees" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can update meeting commitments" ON "public"."meeting_commitments" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can update own enrollment progress" ON "public"."course_enrollments" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notifications" ON "public"."user_notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own preferences" ON "public"."church_meditation_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own progress" ON "public"."user_progress" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own recommendations" ON "public"."church_meditation_recommendations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own streaks" ON "public"."church_meditation_streaks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own activities" ON "public"."activity_feed" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own church profile" ON "public"."church_profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update their own comments" ON "public"."post_comments" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own documents or leaders can update any" ON "public"."community_documents" FOR UPDATE USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("uploaded_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "workspace_id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))));



CREATE POLICY "Users can update their own folders or leaders can update any" ON "public"."document_folders" FOR UPDATE USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND (("created_by" = "auth"."uid"()) OR ("public"."get_user_workspace_role"("auth"."uid"(), "workspace_id") = ANY (ARRAY['admin'::"text", 'lider_comunidad'::"text"])))));



CREATE POLICY "Users can update their own password change flag" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own posts" ON "public"."community_posts" FOR UPDATE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own progress" ON "public"."lesson_progress" FOR UPDATE USING (("auth"."uid"() = "user_id"));



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



CREATE POLICY "Users can view comments on visible posts" ON "public"."post_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE ("p"."id" = "post_comments"."post_id"))));



CREATE POLICY "Users can view documents in accessible workspaces" ON "public"."community_documents" FOR SELECT USING ((("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))) AND ("is_active" = true)));



CREATE POLICY "Users can view folders in accessible workspaces" ON "public"."document_folders" FOR SELECT USING (("workspace_id" IN ( SELECT "community_workspaces"."id"
   FROM "public"."community_workspaces"
  WHERE ("public"."get_user_workspace_role"("auth"."uid"(), "community_workspaces"."id") IS NOT NULL))));



CREATE POLICY "Users can view group members" ON "public"."group_assignment_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."group_assignment_members" "gam2"
  WHERE (("gam2"."group_id" = "group_assignment_members"."group_id") AND ("gam2"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view groups in their community" ON "public"."group_assignment_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."community_id" = "ur"."community_id") AND ("ur"."is_active" = true)))));



CREATE POLICY "Users can view media for visible posts" ON "public"."post_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."community_posts" "p"
  WHERE ("p"."id" = "post_media"."post_id"))));



CREATE POLICY "Users can view meeting attachments" ON "public"."meeting_attachments" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view meeting attendees" ON "public"."meeting_attendees" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view meeting commitments" ON "public"."meeting_commitments" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view mentions" ON "public"."post_mentions" FOR SELECT USING (true);



CREATE POLICY "Users can view mentions involving them" ON "public"."user_mentions" FOR SELECT USING ((("auth"."uid"() = "author_id") OR ("auth"."uid"() = "mentioned_user_id")));



CREATE POLICY "Users can view own enrollments" ON "public"."course_enrollments" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own favorites" ON "public"."church_meditation_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own feedback permissions" ON "public"."feedback_permissions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own notifications" ON "public"."user_notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own preferences" ON "public"."church_meditation_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own progress" ON "public"."user_progress" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own recommendations" ON "public"."church_meditation_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own streaks" ON "public"."church_meditation_streaks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view posts from their communities" ON "public"."community_posts" FOR SELECT USING ("public"."can_access_workspace"("auth"."uid"(), "workspace_id"));



CREATE POLICY "Users can view public activities" ON "public"."activity_feed" FOR SELECT USING ((("is_public" = true) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can view their church organization" ON "public"."church_organizations" FOR SELECT USING (("id" IN ( SELECT "church_profiles"."organization_id"
   FROM "public"."church_profiles"
  WHERE ("church_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own course assignments" ON "public"."course_assignments" FOR SELECT USING (("teacher_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own messages" ON "public"."workspace_messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can view their own progress" ON "public"."lesson_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their saved posts" ON "public"."saved_posts" FOR SELECT USING (("user_id" = "auth"."uid"()));



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



ALTER TABLE "public"."activity_aggregations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_feed" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_full_access_schools" ON "public"."schools" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role_type" = 'admin'::"public"."user_role_type") AND ("ur"."is_active" = true)))));



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



ALTER TABLE "public"."assignment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignment_templates_admin_all" ON "public"."assignment_templates" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "assignment_templates_authenticated_view" ON "public"."assignment_templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "assignment_templates_creator_manage" ON "public"."assignment_templates" TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "authenticated_users_read_schools" ON "public"."schools" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



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


ALTER TABLE "public"."community_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultant_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_assignments_admin_all" ON "public"."course_assignments" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "course_assignments_teacher_view_own" ON "public"."course_assignments" FOR SELECT TO "authenticated" USING (("teacher_id" = "auth"."uid"()));



ALTER TABLE "public"."course_enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "course_enrollments_admin_all" ON "public"."course_enrollments" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "course_enrollments_teacher_view" ON "public"."course_enrollments" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_teacher"("course_id"));



CREATE POLICY "course_enrollments_user_view_own" ON "public"."course_enrollments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "courses_admin_all" ON "public"."courses" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "courses_student_view" ON "public"."courses" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_student"("id"));



CREATE POLICY "courses_teacher_view" ON "public"."courses" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_teacher"("id"));



ALTER TABLE "public"."cuotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_role_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_access_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_admin_all" ON "public"."expense_categories" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "expense_categories_authenticated_view" ON "public"."expense_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "expense_categories_read" ON "public"."expense_categories" FOR SELECT USING (true);



ALTER TABLE "public"."expense_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_items_admin_all" ON "public"."expense_items" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "expense_items_insert" ON "public"."expense_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."expense_reports"
  WHERE (("expense_reports"."id" = "expense_items"."report_id") AND ("expense_reports"."submitted_by" = "auth"."uid"())))));



CREATE POLICY "expense_items_user_own" ON "public"."expense_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."expense_reports" "er"
  WHERE (("er"."id" = "expense_items"."report_id") AND ("er"."submitted_by" = "auth"."uid"())))));



ALTER TABLE "public"."expense_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_reports_admin_all" ON "public"."expense_reports" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "expense_reports_insert" ON "public"."expense_reports" FOR INSERT WITH CHECK (("submitted_by" = "auth"."uid"()));



CREATE POLICY "expense_reports_user_own" ON "public"."expense_reports" TO "authenticated" USING (("submitted_by" = "auth"."uid"())) WITH CHECK (("submitted_by" = "auth"."uid"()));



ALTER TABLE "public"."feedback_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_activity_admin_all" ON "public"."feedback_activity" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "feedback_activity_user_view_own" ON "public"."feedback_activity" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."feedback_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_permissions_admin_all" ON "public"."feedback_permissions" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "feedback_permissions_user_view_own" ON "public"."feedback_permissions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."generations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generations_admin_all" ON "public"."generations" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "generations_school_members_view" ON "public"."generations" FOR SELECT TO "authenticated" USING ("public"."auth_has_school_access"(("school_id")::bigint));



ALTER TABLE "public"."group_assignment_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_assignment_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_assignment_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_assignment_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_communities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "growth_communities_admin_all" ON "public"."growth_communities" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



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



ALTER TABLE "public"."meeting_agreements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_commitments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modules_admin_all" ON "public"."modules" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "modules_student_view" ON "public"."modules" FOR SELECT TO "authenticated" USING ("public"."auth_is_course_student"("course_id"));



CREATE POLICY "modules_teacher_manage" ON "public"."modules" TO "authenticated" USING ("public"."auth_is_course_teacher"("course_id")) WITH CHECK ("public"."auth_is_course_teacher"("course_id"));



ALTER TABLE "public"."notification_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_events_admin_all" ON "public"."notification_events" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



ALTER TABLE "public"."notification_triggers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_triggers_admin_all" ON "public"."notification_triggers" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



ALTER TABLE "public"."notification_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_types_select_policy" ON "public"."notification_types" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_policy" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_insert_policy" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_select_policy" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_policy" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."platform_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_feedback_admin_all" ON "public"."platform_feedback" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "platform_feedback_user_own" ON "public"."platform_feedback" TO "authenticated" USING (("created_by" = "auth"."uid"())) WITH CHECK (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."post_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_hashtags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


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



ALTER TABLE "public"."saved_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schools_admin_all" ON "public"."schools" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "schools_authenticated_view" ON "public"."schools" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."system_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_updates_admin_all" ON "public"."system_updates" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "system_updates_authenticated_view" ON "public"."system_updates" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."user_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notification_preferences_delete_policy" ON "public"."user_notification_preferences" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_preferences_insert_policy" ON "public"."user_notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_preferences_select_policy" ON "public"."user_notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_preferences_update_policy" ON "public"."user_notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notifications_admin_all" ON "public"."user_notifications" TO "authenticated" USING ("public"."auth_is_admin"()) WITH CHECK ("public"."auth_is_admin"());



CREATE POLICY "user_notifications_user_own" ON "public"."user_notifications" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_messages" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_feedback_activity"("p_feedback_id" "uuid", "p_message" "text", "p_user_id" "uuid", "p_is_system" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_has_school_access"("p_school_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_course_student"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_course_teacher"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_is_teacher"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_teacher"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_teacher"() TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_assign_learning_path"("p_path_id" "uuid", "p_user_ids" "uuid"[], "p_group_ids" "uuid"[], "p_assigned_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quiz_score"("submission_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_workspace"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_community_organization"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_community_organization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_community_organization"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_dev_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_dev_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_dev_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_communities"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_communities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_communities"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sample_notifications_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_notification"("p_user_id" "uuid", "p_notification_type_id" character varying, "p_title" character varying, "p_description" "text", "p_related_url" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_dev_impersonation"("p_dev_user_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."exec_sql"("sql" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exec_sql"("sql" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exec_sql"("sql" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_mentions"("p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_mentions"("p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_mentions"("p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."feedback_status_change_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."feedback_status_change_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."feedback_status_change_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_dev_impersonation"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_triggers"("p_event_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_stats"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_assignment_templates"("p_course_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_document_statistics"("workspace_uuid" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grade_quiz_feedback"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_review_status" "text", "p_general_feedback" "text", "p_question_feedback" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grade_quiz_open_responses"("p_submission_id" "uuid", "p_graded_by" "uuid", "p_grading_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_feedback_permission"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_document_counter"("document_uuid" "uuid", "counter_type" "text", "user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dev_user"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_dev_user"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dev_user"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_global_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_global_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_admin"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_document_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_document_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_document_access"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."refresh_user_roles_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_roles_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_roles_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_dev_impersonation"("p_dev_user_id" "uuid", "p_impersonated_role" "public"."user_role_type", "p_impersonated_user_id" "uuid", "p_school_id" integer, "p_generation_id" "uuid", "p_community_id" "uuid", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_quiz"("p_lesson_id" "uuid", "p_block_id" "text", "p_student_id" "uuid", "p_course_id" "uuid", "p_answers" "jsonb", "p_quiz_data" "jsonb", "p_time_spent" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_school_to_no_generations"("p_school_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_refresh_user_roles_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_refresh_user_roles_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_refresh_user_roles_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_meditation_streak"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_meditation_streak"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_meditation_streak"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_church_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_church_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_church_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_community_workspace_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_community_workspace_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_community_workspace_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_document_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_document_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_document_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_folder_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_folder_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_folder_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_meditation_streak"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_overdue_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_overdue_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_overdue_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_school_has_generations"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_school_has_generations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_school_has_generations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_thread_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_church_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_church_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_church_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_assignment_instance_course"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_assignment_instance_course"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_assignment_instance_course"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_aggregations" TO "anon";
GRANT ALL ON TABLE "public"."activity_aggregations" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_aggregations" TO "service_role";



GRANT ALL ON TABLE "public"."activity_feed" TO "anon";
GRANT ALL ON TABLE "public"."activity_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_feed" TO "service_role";



GRANT ALL ON TABLE "public"."activity_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."activity_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."answers" TO "anon";
GRANT ALL ON TABLE "public"."answers" TO "authenticated";
GRANT ALL ON TABLE "public"."answers" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_feedback" TO "anon";
GRANT ALL ON TABLE "public"."assignment_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_instances" TO "anon";
GRANT ALL ON TABLE "public"."assignment_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_instances" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_submissions" TO "anon";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_templates" TO "anon";
GRANT ALL ON TABLE "public"."assignment_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_templates" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."blocks" TO "anon";
GRANT ALL ON TABLE "public"."blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."blocks" TO "service_role";



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



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



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



GRANT ALL ON TABLE "public"."community_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."community_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."community_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."consultant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."consultant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."consultant_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."contratos" TO "anon";
GRANT ALL ON TABLE "public"."contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos" TO "service_role";



GRANT ALL ON TABLE "public"."course_assignments" TO "anon";
GRANT ALL ON TABLE "public"."course_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."course_prerequisites" TO "anon";
GRANT ALL ON TABLE "public"."course_prerequisites" TO "authenticated";
GRANT ALL ON TABLE "public"."course_prerequisites" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."cuotas" TO "anon";
GRANT ALL ON TABLE "public"."cuotas" TO "authenticated";
GRANT ALL ON TABLE "public"."cuotas" TO "service_role";



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



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expense_items" TO "anon";
GRANT ALL ON TABLE "public"."expense_items" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_items" TO "service_role";



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



GRANT ALL ON TABLE "public"."instructors" TO "anon";
GRANT ALL ON TABLE "public"."instructors" TO "authenticated";
GRANT ALL ON TABLE "public"."instructors" TO "service_role";



GRANT ALL ON TABLE "public"."learning_path_courses" TO "anon";
GRANT ALL ON TABLE "public"."learning_path_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_path_courses" TO "service_role";



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



GRANT ALL ON TABLE "public"."message_threads" TO "anon";
GRANT ALL ON TABLE "public"."message_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_threads" TO "service_role";



GRANT ALL ON TABLE "public"."metadata_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."metadata_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."metadata_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "anon";
GRANT ALL ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";



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



GRANT ALL ON TABLE "public"."quiz_submissions" TO "anon";
GRANT ALL ON TABLE "public"."quiz_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."pending_quiz_reviews" TO "anon";
GRANT ALL ON TABLE "public"."pending_quiz_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_quiz_reviews" TO "service_role";



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



GRANT ALL ON TABLE "public"."programas" TO "anon";
GRANT ALL ON TABLE "public"."programas" TO "authenticated";
GRANT ALL ON TABLE "public"."programas" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_statistics" TO "anon";
GRANT ALL ON TABLE "public"."quiz_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."saved_posts" TO "anon";
GRANT ALL ON TABLE "public"."saved_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_posts" TO "service_role";



GRANT ALL ON TABLE "public"."school_progress_report" TO "anon";
GRANT ALL ON TABLE "public"."school_progress_report" TO "authenticated";
GRANT ALL ON TABLE "public"."school_progress_report" TO "service_role";



GRANT ALL ON SEQUENCE "public"."schools_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."schools_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."schools_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."student_answers" TO "anon";
GRANT ALL ON TABLE "public"."student_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."student_answers" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."system_updates" TO "anon";
GRANT ALL ON TABLE "public"."system_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."system_updates" TO "service_role";



GRANT ALL ON TABLE "public"."user_mentions" TO "anon";
GRANT ALL ON TABLE "public"."user_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_notifications" TO "anon";
GRANT ALL ON TABLE "public"."user_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."user_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



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






RESET ALL;
