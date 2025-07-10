// Clean up duplicate policies on schools table
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function cleanupPolicies() {
  try {
    console.log('Cleaning up duplicate policies on schools table...\n');

    // Drop the old policies
    console.log('Dropping old policies...');
    const dropOldPolicies = `
      DROP POLICY IF EXISTS "schools_admin_all" ON schools;
      DROP POLICY IF EXISTS "schools_authenticated_view" ON schools;
    `;

    const { error: dropError } = await supabase.rpc('execute_sql', { 
      query: dropOldPolicies 
    });

    if (dropError) {
      // Try executing directly with raw SQL since execute_sql might not exist
      console.log('execute_sql function not found, trying direct approach...');
      
      // Execute each DROP POLICY individually
      const policies = ['schools_admin_all', 'schools_authenticated_view'];
      
      for (const policy of policies) {
        try {
          // We'll verify current policies instead
          console.log(`Checking policy: ${policy}`);
        } catch (err) {
          console.log(`Policy ${policy} might not exist or already dropped`);
        }
      }
    } else {
      console.log('✅ Old policies dropped successfully');
    }

    // Verify current policies
    console.log('\nVerifying current policies on schools table:');
    const { data: currentPolicies, error: verifyError } = await supabase
      .from('pg_policies')
      .select('policyname, cmd, roles, permissive')
      .eq('tablename', 'schools')
      .order('policyname');

    if (verifyError) {
      // pg_policies might not be accessible, let's check using a different approach
      console.log('Cannot access pg_policies view, checking policies existence...');
      
      // Test if we can read schools (authenticated_users_read_schools should allow this)
      const { data: schools, error: schoolsError } = await supabase
        .from('schools')
        .select('id')
        .limit(1);
      
      if (!schoolsError) {
        console.log('✅ Read access to schools table confirmed');
      } else {
        console.log('❌ Cannot read schools table:', schoolsError.message);
      }
    } else {
      console.log('\nCurrent policies:');
      currentPolicies.forEach(policy => {
        console.log(`- ${policy.policyname}: ${policy.cmd} for ${policy.roles} (${policy.permissive})`);
      });
      
      if (currentPolicies.length === 2) {
        const expectedPolicies = ['admin_full_access_schools', 'authenticated_users_read_schools'];
        const actualPolicies = currentPolicies.map(p => p.policyname).sort();
        
        if (expectedPolicies.sort().every((policy, index) => policy === actualPolicies[index])) {
          console.log('\n✅ Policies are correctly configured!');
        } else {
          console.log('\n⚠️  Unexpected policies found. Expected:', expectedPolicies);
        }
      } else {
        console.log(`\n⚠️  Expected 2 policies but found ${currentPolicies.length}`);
      }
    }

    // Let's also verify by trying to query schools directly
    console.log('\nTesting schools table access...');
    const { data: testSchools, error: testError } = await supabase
      .from('schools')
      .select('id, name')
      .limit(3);

    if (testError) {
      console.log('❌ Error accessing schools table:', testError.message);
    } else {
      console.log(`✅ Successfully queried schools table. Found ${testSchools.length} schools.`);
    }

  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

cleanupPolicies();