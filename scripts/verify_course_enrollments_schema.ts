
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySchema() {
    console.log('Verifying course_enrollments schema...');

    // Try to select the columns that are causing issues
    const { data, error } = await supabase
        .from('course_enrollments')
        .select(`
      id,
      user_id,
      course_id,
      progress_percentage,
      lessons_completed,
      total_lessons,
      updated_at,
      created_at
    `)
        .limit(1);

    if (error) {
        console.error('Error selecting columns:', error);
        console.error('This confirms that one or more columns are missing or there is an RLS issue.');
    } else {
        console.log('Successfully selected columns. Data sample:', data);
        console.log('Schema seems correct.');
    }
}

verifySchema();
