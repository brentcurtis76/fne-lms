require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

// Create both service and anon clients for testing
const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

async function verifyRLSFix() {
  console.log('Verifying RLS fix on user_roles table...\n');

  try {
    // Test 1: Check if auth_is_admin function exists
    console.log('Test 1: Checking auth_is_admin function...');
    const { data: funcData, error: funcError } = await supabaseService
      .rpc('exec_sql', {
        sql: `SELECT proname FROM pg_proc WHERE proname = 'auth_is_admin'`
      });
    
    if (funcError) {
      console.error('❌ Error checking function:', funcError);
    } else if (funcData && funcData.length > 0) {
      console.log('✅ auth_is_admin function exists');
    } else {
      console.log('❌ auth_is_admin function does not exist');
    }

    // Test 2: Check current policies
    console.log('\nTest 2: Checking current policies on user_roles...');
    const { data: policies, error: policyError } = await supabaseService
      .rpc('exec_sql', {
        sql: `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_roles' ORDER BY policyname`
      });

    if (policyError) {
      console.error('❌ Error checking policies:', policyError);
    } else if (policies) {
      console.log('Current policies:');
      policies.forEach(p => console.log(`  - ${p.policyname} (${p.cmd})`));
    }

    // Test 3: Try to read user_roles as anon user (should fail)
    console.log('\nTest 3: Testing anon access (should fail)...');
    const { data: anonData, error: anonError } = await supabaseAnon
      .from('user_roles')
      .select('*')
      .limit(1);

    if (anonError) {
      console.log('✅ Anon access correctly blocked:', anonError.message);
    } else {
      console.log('❌ Anon access not blocked - this is a security issue!');
    }

    // Test 4: Check for recursive policy definitions
    console.log('\nTest 4: Checking for recursive policies...');
    const { data: recursiveCheck, error: recursiveError } = await supabaseService
      .rpc('exec_sql', {
        sql: `
          SELECT policyname, qual 
          FROM pg_policies 
          WHERE tablename = 'user_roles' 
          AND qual LIKE '%user_roles%'
          AND qual NOT LIKE '%auth.uid() = user_id%'
        `
      });

    if (recursiveError) {
      console.error('❌ Error checking for recursion:', recursiveError);
    } else if (recursiveCheck && recursiveCheck.length > 0) {
      console.log('⚠️  Found potentially recursive policies:');
      recursiveCheck.forEach(p => console.log(`  - ${p.policyname}`));
    } else {
      console.log('✅ No recursive policies detected');
    }

    // Test 5: Check if regular users can query their own roles
    console.log('\nTest 5: Checking if authenticated users can view their own roles...');
    const testUserId = 'test-user-id'; // This would need to be a real user ID in production
    const { data: testQuery, error: testError } = await supabaseService
      .rpc('exec_sql', {
        sql: `
          SELECT COUNT(*) as policy_count
          FROM pg_policies 
          WHERE tablename = 'user_roles' 
          AND cmd = 'SELECT'
          AND qual LIKE '%auth.uid() = user_id%'
        `
      });

    if (testError) {
      console.error('❌ Error checking self-view policy:', testError);
    } else if (testQuery && testQuery[0].policy_count > 0) {
      console.log('✅ Self-view policy exists');
    } else {
      console.log('❌ Self-view policy missing');
    }

    console.log('\n✨ Verification complete!');
    console.log('\nTo apply the fix, run the following SQL files in order:');
    console.log('1. database/ensure-auth-is-admin-function.sql');
    console.log('2. database/fix-recursive-rls-policies.sql');

  } catch (error) {
    console.error('Error during verification:', error);
  }
}

// Run verification
verifyRLSFix();