const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('=== Applying Consultant Group Management Migration ===\n');

  try {
    // Since we can't read SQL files or execute raw SQL through RPC without custom functions,
    // we'll provide instructions for manual application
    
    console.log('📋 Migration Instructions:\n');
    console.log('1. Open Supabase Dashboard SQL Editor');
    console.log('2. Copy the contents of: database/migrations/20250108_add_consultant_group_management_settings.sql');
    console.log('3. Paste and execute in SQL Editor');
    console.log('4. Verify the migration by running the test script\n');
    
    console.log('Alternative: Use Supabase CLI');
    console.log('$ supabase db push --include-all\n');
    
    console.log('Files created:');
    console.log('✅ database/migrations/20250108_add_consultant_group_management_settings.sql');
    console.log('✅ database/migrations/20250108_rollback_consultant_group_management.sql');
    console.log('✅ database/migrations/test_consultant_group_migration.sql');
    console.log('✅ Updated groupAssignmentsV2Service with branching logic');
    console.log('✅ Updated student UI to show consultant-managed status\n');
    
    console.log('What the migration does:');
    console.log('- Adds created_by, is_consultant_managed, max_members columns to group_assignment_groups');
    console.log('- Creates group_assignment_settings table for per-assignment configuration');
    console.log('- Adds RLS policies for consultant access');
    console.log('- Preserves all existing data with safe defaults');
    console.log('- Enables gradual rollout through per-assignment settings\n');
    
    console.log('Testing the changes:');
    console.log('1. Apply the migration in Supabase');
    console.log('2. Create a test assignment and enable consultant management');
    console.log('3. Students will see "Esperando asignación del consultor"');
    console.log('4. Existing assignments continue with auto-grouping');

  } catch (error) {
    console.error('Error:', error);
  }
}

applyMigration();