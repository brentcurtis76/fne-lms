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

async function diagnoseLearningPathBug() {
  console.log('=== Learning Path Bug Root Cause Analysis ===\n');
  
  try {
    // 1. Check the current RPC function definition
    console.log('1. Checking current create_full_learning_path function...');
    
    // Try to get the function definition by querying pg_proc directly
    const { data: funcDef, error: funcError } = await supabase
      .from('pg_proc')
      .select('prosrc')
      .eq('proname', 'create_full_learning_path')
      .single();

    if (funcError) {
      console.log('❌ Could not retrieve function definition:', funcError.message);
    } else {
      console.log('✅ Function definition retrieved');
      
      // Check if it contains the old wrong column name
      if (funcDef && funcDef.prosrc && funcDef.prosrc.includes('path_id')) {
        console.log('🚨 FOUND THE BUG: Function still uses "path_id" instead of "learning_path_id"');
        
        // Count occurrences
        const pathIdCount = (funcDef.prosrc.match(/path_id/g) || []).length;
        const learningPathIdCount = (funcDef.prosrc.match(/learning_path_id/g) || []).length;
        
        console.log(`   - "path_id" appears ${pathIdCount} times`);
        console.log(`   - "learning_path_id" appears ${learningPathIdCount} times`);
        
        if (pathIdCount > learningPathIdCount) {
          console.log('   ❌ Function is using WRONG column names!');
        }
      } else {
        console.log('✅ Function appears to use correct column names');
      }
    }

    // 2. Check the learning_path_courses table structure
    console.log('\n2. Checking learning_path_courses table structure...');
    
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'learning_path_courses')
      .eq('table_schema', 'public');

    if (tableError) {
      console.log('❌ Could not check table structure:', tableError.message);
    } else {
      console.log('✅ Table structure:');
      tableInfo.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });
      
      const hasPathId = tableInfo.some(col => col.column_name === 'path_id');
      const hasLearningPathId = tableInfo.some(col => col.column_name === 'learning_path_id');
      
      if (hasPathId && !hasLearningPathId) {
        console.log('   📊 Table uses "path_id" column');
      } else if (hasLearningPathId && !hasPathId) {
        console.log('   📊 Table uses "learning_path_id" column');
      } else if (hasPathId && hasLearningPathId) {
        console.log('   ⚠️  Table has BOTH columns (unusual)');
      }
    }

    // 3. Check migration status
    console.log('\n3. Checking migration 20250722000001 status...');
    
    const { data: migrationStatus, error: migError } = await supabase
      .from('supabase_migrations.schema_migrations')
      .select('version, statements')
      .eq('version', '20250722000001');

    if (migError) {
      console.log('❌ Could not check migration status:', migError.message);
    } else if (migrationStatus && migrationStatus.length > 0) {
      console.log('✅ Migration 20250722000001 is recorded as applied');
      console.log('   However, the RPC function may not have been updated correctly');
    } else {
      console.log('❌ Migration 20250722000001 is NOT recorded as applied');
    }

    // 4. Test current function behavior
    console.log('\n4. Testing current function behavior...');
    
    // Get admin user for testing
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

    // Get course for testing  
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .limit(1)
      .single();

    if (courseError || !course) {
      console.log('❌ Could not find course for testing');
      return;
    }

    // Try to call the RPC function
    const { data: result, error: rpcError } = await supabase
      .rpc('create_full_learning_path', {
        p_name: 'DIAGNOSTIC TEST - ' + new Date().toISOString(),
        p_description: 'Testing RPC function to diagnose bug',
        p_course_ids: [course.id],
        p_created_by: adminUser.user_id
      });

    if (rpcError) {
      if (rpcError.message.includes('column "path_id"')) {
        console.log('🚨 CONFIRMED: RPC function is trying to use "path_id" column');
        console.log('   Error:', rpcError.message);
        console.log('\n🔍 ROOT CAUSE IDENTIFIED:');
        console.log('   The migration 20250722000001 is marked as applied but');  
        console.log('   the RPC function was not actually updated in the database.');
      } else {
        console.log('❌ Different error occurred:', rpcError.message);
      }
    } else {
      console.log('✅ RPC function works correctly');
      console.log('   Test learning path created:', result.id);
      
      // Clean up
      await supabase.from('learning_paths').delete().eq('id', result.id);
      console.log('✅ Test data cleaned up');
    }

  } catch (error) {
    console.error('❌ Diagnostic error:', error.message);
  }
}

// Run the diagnostic
diagnoseLearningPathBug()
  .then(() => {
    console.log('\n=== Diagnostic Complete ===');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });