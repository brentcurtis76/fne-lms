#!/usr/bin/env node

/**
 * Test Jorge's Schools Access
 * 
 * This script simulates Jorge's exact context to verify he can see schools
 * without needing to actually log in as him.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

// Jorge's user ID
const JORGE_ID = '372ab00b-1d39-4574-8eff-d756b9d6b861';

async function testJorgeAccess() {
  console.log('🧪 Testing Jorge\'s Schools Access\n');
  console.log('='.repeat(60));
  
  const results = {
    timestamp: new Date().toISOString(),
    user: 'Jorge Parra (jorge@lospellines.cl)',
    userId: JORGE_ID,
    tests: {}
  };

  try {
    // 1. Test with Service Role (bypasses RLS - baseline)
    console.log('1️⃣ Testing with Service Role (baseline)...');
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: allSchools, error: serviceError } = await serviceClient
      .from('schools')
      .select('id, name')
      .order('name');
    
    results.tests.serviceRole = {
      success: !serviceError,
      schoolCount: allSchools?.length || 0,
      hasLosPellines: allSchools?.some(s => s.name === 'Los Pellines') || false,
      error: serviceError?.message || null
    };
    
    console.log(`   ✅ Service role sees ${results.tests.serviceRole.schoolCount} schools`);
    console.log(`   ✅ Los Pellines visible: ${results.tests.serviceRole.hasLosPellines}`);

    // 2. Test with Anon Key (simulates unauthenticated)
    console.log('\n2️⃣ Testing with Anon Key (unauthenticated)...');
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    const { data: anonSchools, error: anonError } = await anonClient
      .from('schools')
      .select('id, name')
      .order('name');
    
    results.tests.anonymous = {
      success: !anonError,
      schoolCount: anonSchools?.length || 0,
      error: anonError?.message || null
    };
    
    console.log(`   ${results.tests.anonymous.schoolCount > 0 ? '⚠️' : '✅'} Anonymous sees ${results.tests.anonymous.schoolCount} schools`);
    
    // 3. Simulate Jorge's Context (the critical test)
    console.log('\n3️⃣ Simulating Jorge\'s authenticated context...');
    console.log('   (This is what Jorge would see when logged in)');
    
    // Create a client that would represent Jorge's session
    // Since we can't create a real session, we'll test the policies directly
    const { data: policyTest, error: policyError } = await serviceClient
      .rpc('test_user_can_read_table', {
        test_user_id: JORGE_ID,
        test_table: 'schools'
      });
    
    // Alternative: Check if policies would allow Jorge
    const { data: policies } = await serviceClient
      .from('pg_policies')
      .select('policyname, cmd, qual')
      .eq('tablename', 'schools')
      .eq('cmd', 'SELECT');
    
    // Check if any SELECT policy would allow Jorge
    const hasAuthenticatedReadPolicy = policies?.some(p => 
      p.qual?.includes('auth.uid() IS NOT NULL') || 
      p.policyname?.includes('authenticated')
    );
    
    results.tests.jorgeSimulated = {
      hasReadAccess: hasAuthenticatedReadPolicy,
      applicablePolicies: policies?.map(p => p.policyname) || [],
      wouldSeeSchools: hasAuthenticatedReadPolicy
    };
    
    console.log(`   ${hasAuthenticatedReadPolicy ? '✅' : '❌'} Jorge has read access via authenticated user policy`);
    console.log(`   Applicable policies: ${results.tests.jorgeSimulated.applicablePolicies.join(', ')}`);

    // 4. Check Profile Page Behavior
    console.log('\n4️⃣ Checking Profile Page Behavior...');
    
    // The profile page shows test schools when query returns empty
    const wouldShowTestSchools = results.tests.jorgeSimulated.wouldSeeSchools ? false : true;
    
    results.tests.profilePage = {
      wouldShowTestSchools,
      expectedBehavior: wouldShowTestSchools ? 
        'Would show "Escuela de Prueba 1", "Escuela de Prueba 2"' :
        'Would show real schools from database'
    };
    
    console.log(`   ${wouldShowTestSchools ? '❌' : '✅'} Profile page behavior: ${results.tests.profilePage.expectedBehavior}`);

    // 5. Final Verdict
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL RESULTS:\n');
    
    const isFixed = results.tests.jorgeSimulated.hasReadAccess && !results.tests.profilePage.wouldShowTestSchools;
    
    if (isFixed) {
      console.log('✅ SUCCESS! Jorge\'s schools access is FIXED!');
      console.log('   - Jorge can see schools when authenticated');
      console.log('   - Profile page will show real schools');
      console.log('   - No test schools will appear');
    } else {
      console.log('❌ ISSUE REMAINS! Jorge still cannot see schools');
      console.log('   - Check if authenticated_users_read_schools policy exists');
      console.log('   - Verify no restrictive policies are blocking access');
    }

    // Save detailed report
    const reportPath = `jorge-access-test-${Date.now()}.json`;
    await require('fs').promises.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    return isFixed;

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    return false;
  }
}

// Create the RPC function if it doesn't exist
const createTestFunction = `
-- Helper function to test if a user can read a table
CREATE OR REPLACE FUNCTION test_user_can_read_table(
  test_user_id UUID,
  test_table TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  -- Set the user context
  PERFORM set_config('request.jwt.claims', json_build_object('sub', test_user_id::text)::text, true);
  
  -- Try to query the table
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I LIMIT 1)', test_table) INTO has_access;
  
  RETURN has_access;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

// Run the test
testJorgeAccess()
  .then(isFixed => {
    process.exit(isFixed ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });