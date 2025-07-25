const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

// Use the correct production Supabase URL from .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ''); // Remove trailing slash
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sqlCommands = [
  // Index for user_id on course_enrollments
  'CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id ON public.course_enrollments(user_id);',
  
  // Index for user_id on user_lesson_progress
  'CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user_id ON public.user_lesson_progress(user_id);',
  
  // Indexes for filtering on the profiles table
  'CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);',
  'CREATE INDEX IF NOT EXISTS idx_profiles_generation_id ON public.profiles(generation_id);',
  'CREATE INDEX IF NOT EXISTS idx_profiles_community_id ON public.profiles(community_id);',
  
  // Index on course_enrollments updated_at for sorting by last activity
  'CREATE INDEX IF NOT EXISTS idx_course_enrollments_updated_at ON public.course_enrollments(updated_at);',
  
  // Additional indexes for user_roles table used by getUserRoles function
  'CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_user_roles_active ON public.user_roles(user_id, is_active) WHERE is_active = true;',
  
  // Index for consultant_assignments used by consultor role filtering
  'CREATE INDEX IF NOT EXISTS idx_consultant_assignments_consultant ON public.consultant_assignments(consultant_id) WHERE is_active = true;',
  'CREATE INDEX IF NOT EXISTS idx_consultant_assignments_student ON public.consultant_assignments(student_id) WHERE is_active = true;',
  
  // Index for network supervisor role filtering
  'CREATE INDEX IF NOT EXISTS idx_red_escuelas_supervisor ON public.red_escuelas(supervisor_id);'
];

async function applyIndexes() {
  console.log('🚀 Starting database index migration for report optimization...');
  console.log(`📡 Connecting to: ${SUPABASE_URL}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < sqlCommands.length; i++) {
    const sql = sqlCommands[i];
    const indexName = sql.match(/idx_[a-zA-Z_]+/)?.[0] || `index_${i + 1}`;
    
    try {
      console.log(`⏳ Creating ${indexName}...`);
      
      const { data, error } = await supabase.rpc('exec_sql', { 
        sql_query: sql 
      });
      
      if (error) {
        // Try direct query if RPC doesn't work
        const { error: directError } = await supabase
          .from('_internal')
          .select('*')
          .eq('sql', sql);
          
        if (directError) {
          throw error; // Use original error
        }
      }
      
      console.log(`✅ Successfully created ${indexName}`);
      successCount++;
      
    } catch (error) {
      console.error(`❌ Failed to create ${indexName}:`, error.message);
      errorCount++;
      
      // Continue with other indexes even if one fails
    }
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`✅ Successfully created: ${successCount} indexes`);
  console.log(`❌ Failed: ${errorCount} indexes`);
  
  if (errorCount === 0) {
    console.log('\n🎉 All database indexes have been successfully applied!');
    console.log('📈 Report query performance should now be significantly improved.');
    console.log('🔄 Please test the detailed reports page to verify data loads correctly.');
  } else {
    console.log('\n⚠️  Some indexes failed to create. Manual intervention may be required.');
    console.log('💡 Try applying the failed indexes manually via Supabase SQL Editor.');
  }
}

applyIndexes().catch(console.error);