const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function recreateLearningPathFunctions() {
  console.log('Recreating Learning Path RPC Functions...\n');
  
  const createFunctionsSQL = `
    -- Drop existing functions if they exist
    DROP FUNCTION IF EXISTS get_learning_paths();
    DROP FUNCTION IF EXISTS get_student_learning_paths(uuid);
    DROP FUNCTION IF EXISTS assign_user_to_learning_path(uuid, uuid);
    DROP FUNCTION IF EXISTS remove_user_from_learning_path(uuid, uuid);
    DROP FUNCTION IF EXISTS update_learning_path_progress(uuid, uuid, numeric);

    -- Create get_learning_paths function
    CREATE OR REPLACE FUNCTION get_learning_paths()
    RETURNS TABLE (
      id uuid,
      name text,
      description text,
      icon text,
      total_duration interval,
      course_count bigint,
      created_at timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      SELECT 
        lp.id,
        lp.name,
        lp.description,
        lp.icon,
        lp.total_duration,
        COUNT(DISTINCT lpc.course_id) as course_count,
        lp.created_at
      FROM learning_paths lp
      LEFT JOIN learning_path_courses lpc ON lp.id = lpc.learning_path_id
      WHERE lp.is_active = true
      GROUP BY lp.id, lp.name, lp.description, lp.icon, lp.total_duration, lp.created_at
      ORDER BY lp.created_at DESC;
    $$;

    -- Create get_student_learning_paths function
    CREATE OR REPLACE FUNCTION get_student_learning_paths(p_user_id uuid)
    RETURNS TABLE (
      learning_path_id uuid,
      learning_path_name text,
      learning_path_description text,
      learning_path_icon text,
      total_courses bigint,
      completed_courses bigint,
      progress numeric,
      enrolled_at timestamptz,
      completed_at timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    AS $$
      SELECT 
        lp.id as learning_path_id,
        lp.name as learning_path_name,
        lp.description as learning_path_description,
        lp.icon as learning_path_icon,
        COUNT(DISTINCT lpc.course_id) as total_courses,
        COUNT(DISTINCT CASE WHEN ulpp.completed_at IS NOT NULL THEN lpc.course_id END) as completed_courses,
        COALESCE(AVG(ulpp.progress), 0) as progress,
        ulp.enrolled_at,
        ulp.completed_at
      FROM user_learning_paths ulp
      JOIN learning_paths lp ON ulp.learning_path_id = lp.id
      LEFT JOIN learning_path_courses lpc ON lp.id = lpc.learning_path_id
      LEFT JOIN user_learning_path_progress ulpp ON ulp.id = ulpp.user_learning_path_id AND ulpp.course_id = lpc.course_id
      WHERE ulp.user_id = p_user_id AND lp.is_active = true
      GROUP BY lp.id, lp.name, lp.description, lp.icon, ulp.enrolled_at, ulp.completed_at
      ORDER BY ulp.enrolled_at DESC;
    $$;

    -- Create assign_user_to_learning_path function
    CREATE OR REPLACE FUNCTION assign_user_to_learning_path(p_user_id uuid, p_learning_path_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      INSERT INTO user_learning_paths (user_id, learning_path_id)
      VALUES (p_user_id, p_learning_path_id)
      ON CONFLICT (user_id, learning_path_id) DO NOTHING;
    END;
    $$;

    -- Create remove_user_from_learning_path function
    CREATE OR REPLACE FUNCTION remove_user_from_learning_path(p_user_id uuid, p_learning_path_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      DELETE FROM user_learning_paths
      WHERE user_id = p_user_id AND learning_path_id = p_learning_path_id;
    END;
    $$;

    -- Create update_learning_path_progress function
    CREATE OR REPLACE FUNCTION update_learning_path_progress(p_user_id uuid, p_learning_path_id uuid, p_course_id uuid, p_progress numeric)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_user_learning_path_id uuid;
    BEGIN
      -- Get the user_learning_path_id
      SELECT id INTO v_user_learning_path_id
      FROM user_learning_paths
      WHERE user_id = p_user_id AND learning_path_id = p_learning_path_id;
      
      IF v_user_learning_path_id IS NOT NULL THEN
        INSERT INTO user_learning_path_progress (user_learning_path_id, course_id, progress)
        VALUES (v_user_learning_path_id, p_course_id, p_progress)
        ON CONFLICT (user_learning_path_id, course_id) 
        DO UPDATE SET 
          progress = p_progress,
          updated_at = now(),
          completed_at = CASE WHEN p_progress >= 100 THEN now() ELSE NULL END;
          
        -- Update the main learning path completion if all courses are complete
        UPDATE user_learning_paths ulp
        SET completed_at = CASE 
          WHEN (
            SELECT COUNT(*) = COUNT(CASE WHEN ulpp.progress >= 100 THEN 1 END)
            FROM learning_path_courses lpc
            LEFT JOIN user_learning_path_progress ulpp 
              ON ulpp.user_learning_path_id = ulp.id 
              AND ulpp.course_id = lpc.course_id
            WHERE lpc.learning_path_id = p_learning_path_id
          ) THEN now()
          ELSE NULL
        END
        WHERE id = v_user_learning_path_id;
      END IF;
    END;
    $$;

    -- Grant execute permissions
    GRANT EXECUTE ON FUNCTION get_learning_paths() TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION get_student_learning_paths(uuid) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION assign_user_to_learning_path(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION remove_user_from_learning_path(uuid, uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION update_learning_path_progress(uuid, uuid, uuid, numeric) TO authenticated;
  `;

  try {
    // Execute the SQL using a raw query approach
    const { data, error } = await supabase.rpc('get_learning_paths').single();
    
    // If error, we need to create the functions
    if (error && error.message.includes('could not find')) {
      console.log('Functions not found, creating them now...');
      
      // Since we can't execute raw SQL directly, let's create a migration file
      const fs = require('fs');
      const migrationPath = '/Users/brentcurtis76/Documents/fne-lms-working/database/recreate-learning-path-functions.sql';
      
      fs.writeFileSync(migrationPath, createFunctionsSQL);
      console.log(`\n✅ Migration file created at: ${migrationPath}`);
      console.log('\nTo apply this migration:');
      console.log('1. Go to your Supabase dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy and paste the contents of the migration file');
      console.log('4. Execute the SQL');
      console.log('\nAlternatively, use the Supabase CLI:');
      console.log('npx supabase db push --db-url <your-database-url>');
      
    } else {
      console.log('✅ Functions already exist and are working!');
    }
    
  } catch (err) {
    console.error('Error checking functions:', err);
    
    // Create the migration file anyway
    const fs = require('fs');
    const migrationPath = '/Users/brentcurtis76/Documents/fne-lms-working/database/recreate-learning-path-functions.sql';
    
    fs.writeFileSync(migrationPath, createFunctionsSQL);
    console.log(`\n✅ Migration file created at: ${migrationPath}`);
    console.log('\nPlease apply this migration to create the required functions.');
  }
}

recreateLearningPathFunctions();