#!/usr/bin/env node

/**
 * Test script to demonstrate why NOT NULL constraint requires manual intervention
 * This script attempts to apply the constraint programmatically and documents the results
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testConstraintApplication() {
  console.log('🔍 Testing NOT NULL constraint application for schools.has_generations\n');

  try {
    // 1. Check current permissions and role
    console.log('1. Checking current database role and permissions...');
    const roleQuery = await supabase.rpc('sql', {
      query: 'SELECT current_user, session_user, current_database();'
    });
    
    if (roleQuery.error) {
      console.log('   Cannot execute direct SQL queries via RPC');
      console.log('   Error:', roleQuery.error.message);
    } else {
      console.log('   Current role info:', roleQuery.data);
    }

    // 2. Check table ownership and permissions
    console.log('\n2. Checking table ownership...');
    const ownershipQuery = await supabase.rpc('sql', {
      query: `
        SELECT schemaname, tablename, tableowner, hasindexes, hasrules, hastriggers 
        FROM pg_tables 
        WHERE tablename = 'schools';
      `
    });
    
    if (ownershipQuery.error) {
      console.log('   Cannot query pg_tables via RPC');
      console.log('   Error:', ownershipQuery.error.message);
    } else {
      console.log('   Table ownership info:', ownershipQuery.data);
    }

    // 3. Try to apply the NOT NULL constraint
    console.log('\n3. Attempting to apply NOT NULL constraint...');
    const constraintQuery = await supabase.rpc('sql', {
      query: 'ALTER TABLE schools ALTER COLUMN has_generations SET NOT NULL;'
    });
    
    if (constraintQuery.error) {
      console.log('   ❌ FAILED to apply constraint via service role');
      console.log('   Error:', constraintQuery.error.message);
      console.log('   Code:', constraintQuery.error.code);
    } else {
      console.log('   ✅ SUCCESS: Constraint applied successfully');
      console.log('   Result:', constraintQuery.data);
    }

  } catch (error) {
    console.error('❌ Script execution failed:', error.message);
  }

  // 4. Document the manual steps required
  console.log('\n📋 MANUAL INTERVENTION REQUIRED:');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Due to Supabase security restrictions, the NOT NULL constraint');
  console.log('must be applied manually through the Supabase Dashboard SQL Editor:');
  console.log('');
  console.log('1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql');
  console.log('2. Execute the following SQL:');
  console.log('');
  console.log('   -- Set default value first (for safety)');
  console.log('   ALTER TABLE schools ');
  console.log('   ALTER COLUMN has_generations SET DEFAULT false;');
  console.log('');
  console.log('   -- Apply NOT NULL constraint');
  console.log('   ALTER TABLE schools ');
  console.log('   ALTER COLUMN has_generations SET NOT NULL;');
  console.log('');
  console.log('3. Verify the constraint was applied:');
  console.log('');
  console.log('   SELECT column_name, is_nullable, column_default');
  console.log('   FROM information_schema.columns');
  console.log('   WHERE table_name = \'schools\' AND column_name = \'has_generations\';');
  console.log('');
  console.log('════════════════════════════════════════════════════════════════');

  // 5. Test current column state
  console.log('\n5. Current column information...');
  try {
    const { data: schools, error } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .limit(3);

    if (error) {
      console.log('   Error fetching schools:', error.message);
    } else {
      console.log('   Sample schools data:');
      schools.forEach(school => {
        console.log(`   - ${school.name}: has_generations = ${school.has_generations}`);
      });
    }
  } catch (error) {
    console.log('   Error:', error.message);
  }
}

// Run the test
testConstraintApplication()
  .then(() => {
    console.log('\n✅ Test completed');
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
  });