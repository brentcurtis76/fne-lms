require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRecursiveRLSPolicies() {
  console.log('Fixing recursive RLS policies on user_roles table...\n');

  try {
    // Drop all existing policies
    console.log('Step 1: Dropping all existing policies...');
    const dropQueries = [
      'DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles',
      'DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles',
      'DROP POLICY IF EXISTS "Service role can manage all roles" ON user_roles',
      'DROP POLICY IF EXISTS "Service role can insert roles" ON user_roles',
      'DROP POLICY IF EXISTS "Service role can update roles" ON user_roles',
      'DROP POLICY IF EXISTS "Service role can delete roles" ON user_roles',
      'DROP POLICY IF EXISTS "Block all direct mutations from authenticated users" ON user_roles'
    ];

    for (const query of dropQueries) {
      const { error } = await supabase.rpc('exec_sql', { sql: query });
      if (error) {
        console.error(`Error dropping policy: ${error.message}`);
      }
    }
    console.log('✅ All existing policies dropped\n');

    // Create new non-recursive policies
    console.log('Step 2: Creating new non-recursive policies...');
    const createQueries = [
      `CREATE POLICY "user_roles_self_view" ON user_roles
        FOR SELECT TO authenticated
        USING (auth.uid() = user_id)`,
      
      `CREATE POLICY "user_roles_admin_view" ON user_roles
        FOR SELECT TO authenticated
        USING (auth_is_admin())`,
      
      `CREATE POLICY "user_roles_block_mutations" ON user_roles
        FOR ALL TO authenticated
        USING (false)
        WITH CHECK (false)`
    ];

    for (const query of createQueries) {
      const { error } = await supabase.rpc('exec_sql', { sql: query });
      if (error) {
        console.error(`Error creating policy: ${error.message}`);
      }
    }
    console.log('✅ New non-recursive policies created\n');

    // Verify the policies
    console.log('Step 3: Verifying policies...');
    const { data: policies, error: verifyError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'user_roles')
      .order('policyname');

    if (verifyError) {
      console.error('Error verifying policies:', verifyError);
    } else {
      console.log('Current policies on user_roles table:');
      policies.forEach(policy => {
        console.log(`- ${policy.policyname} (${policy.cmd})`);
      });
    }

  } catch (error) {
    console.error('Error fixing RLS policies:', error);
  }
}

// Execute the fix
fixRecursiveRLSPolicies();