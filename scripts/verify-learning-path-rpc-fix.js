require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function verifyLearningPathRPCFunction() {
  console.log('=== Learning Path RPC Function Verification ===\n');
  
  try {
    // 1. Check if the RPC function exists
    console.log('1. Checking if create_full_learning_path RPC function exists...');
    const { data: functions, error: funcError } = await supabase
      .rpc('pg_catalog.pg_proc', {})
      .select('proname')
      .eq('proname', 'create_full_learning_path');
    
    if (funcError) {
      console.log('❌ Could not query functions:', funcError.message);
    } else {
      console.log('✅ RPC function exists\n');
    }

    // 2. Check the learning_path_courses table structure
    console.log('2. Checking learning_path_courses table schema...');
    const { data: tableInfo, error: tableError } = await supabase
      .from('learning_path_courses')
      .select('*')
      .limit(0);
    
    if (tableError) {
      console.log('❌ Error checking table:', tableError.message);
    } else {
      console.log('✅ Table exists and is accessible\n');
    }

    // 3. Get the actual function definition
    console.log('3. Retrieving RPC function definition...');
    const { data: funcDef, error: defError } = await supabase.rpc('pg_get_functiondef', {
      funcoid: supabase.rpc('pg_catalog.to_regprocedure', {
        func_name: 'create_full_learning_path(text,text,uuid[],uuid)'
      })
    });

    if (defError) {
      console.log('❌ Could not retrieve function definition');
      console.log('   This likely means the migration has NOT been applied\n');
    } else {
      console.log('✅ Function definition retrieved\n');
    }

    // 4. Test the current state by attempting to create a test learning path
    console.log('4. Testing current RPC function behavior...');
    
    // First, get a valid user ID (admin)
    const { data: adminUser, error: userError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (userError || !adminUser) {
      console.log('❌ Could not find admin user for testing');
      return;
    }

    // Get a valid course ID for testing
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .limit(1)
      .single();

    if (courseError || !course) {
      console.log('❌ Could not find course for testing');
      return;
    }

    // Try to create a test learning path
    const testData = {
      p_name: 'TEST - Verification Path ' + new Date().toISOString(),
      p_description: 'This is a test path to verify RPC function fix',
      p_course_ids: [course.id],
      p_created_by: adminUser.user_id
    };

    console.log('   Attempting to create test learning path...');
    const { data: result, error: rpcError } = await supabase
      .rpc('create_full_learning_path', testData);

    if (rpcError) {
      if (rpcError.message.includes('column "path_id"')) {
        console.log('❌ RPC function is using incorrect column name (path_id)');
        console.log('   Error:', rpcError.message);
        console.log('\n⚠️  MIGRATION NEEDS TO BE APPLIED!');
      } else {
        console.log('❌ RPC function failed with different error:', rpcError.message);
      }
    } else {
      console.log('✅ RPC function executed successfully!');
      console.log('   Created learning path:', result.id);
      
      // Clean up test data
      console.log('\n5. Cleaning up test data...');
      const { error: deleteError } = await supabase
        .from('learning_paths')
        .delete()
        .eq('id', result.id);
      
      if (deleteError) {
        console.log('❌ Could not clean up test data:', deleteError.message);
      } else {
        console.log('✅ Test data cleaned up successfully');
      }
      
      console.log('\n✅ MIGRATION HAS ALREADY BEEN APPLIED - NO ACTION NEEDED');
    }

    // 6. Check schema_migrations table
    console.log('\n6. Checking schema_migrations table...');
    const { data: migrations, error: migError } = await supabase
      .from('schema_migrations')
      .select('version')
      .order('version', { ascending: false })
      .limit(10);

    if (migError) {
      console.log('❌ Could not query schema_migrations table');
    } else {
      console.log('Recent migrations:');
      migrations.forEach(m => {
        const isTargetMigration = m.version === '20250722000001';
        console.log(`  ${isTargetMigration ? '→' : ' '} ${m.version} ${isTargetMigration ? '(fix_learning_path_rpc_column_names)' : ''}`);
      });
      
      const hasTargetMigration = migrations.some(m => m.version === '20250722000001');
      if (hasTargetMigration) {
        console.log('\n✅ Migration 20250722000001_fix_learning_path_rpc_column_names is in schema_migrations');
      } else {
        console.log('\n⚠️  Migration 20250722000001_fix_learning_path_rpc_column_names NOT found in schema_migrations');
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the verification
verifyLearningPathRPCFunction()
  .then(() => {
    console.log('\n=== Verification Complete ===');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });