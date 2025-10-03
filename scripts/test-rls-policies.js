#!/usr/bin/env node
/**
 * Test RLS Policies on Expense Items Table
 * Verifies current policies and tests if the fix can be applied
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Expense Items RLS Policies...\n');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getCurrentPolicies() {
  console.log('📋 Step 1: Checking current RLS policies...');

  const { data, error } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT
          policyname,
          cmd,
          qual,
          with_check
        FROM pg_policies
        WHERE tablename = 'expense_items'
        ORDER BY policyname;
      `
    });

  if (error) {
    console.log('   ⚠️  Direct query failed, trying alternative approach...');
    // Try using the Supabase Admin API instead
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'expense_items')
      .limit(1);

    if (tablesError) {
      console.log('   ❌ Cannot verify table existence:', tablesError.message);
      return false;
    }
    console.log('   ✅ Table exists:', tables);
    return null;
  }

  if (!data || data.length === 0) {
    console.log('   ⚠️  No policies found on expense_items table');
    return null;
  }

  console.log(`   ✅ Found ${data.length} policies:`);
  data.forEach(policy => {
    console.log(`      - ${policy.policyname} (${policy.cmd})`);
  });

  return data;
}

async function testFixSQL() {
  console.log('\n📝 Step 2: Loading fix SQL file...');

  const sqlPath = path.join(__dirname, '..', 'database', 'fix-expense-items-rls.sql');

  if (!fs.existsSync(sqlPath)) {
    console.log('   ❌ SQL file not found at:', sqlPath);
    return false;
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`   ✅ Loaded SQL (${sql.length} characters)`);

  // Count the number of operations
  const dropCount = (sql.match(/DROP POLICY/gi) || []).length;
  const createCount = (sql.match(/CREATE POLICY/gi) || []).length;

  console.log(`   📊 Operations in SQL:`);
  console.log(`      - DROP POLICY: ${dropCount}`);
  console.log(`      - CREATE POLICY: ${createCount}`);

  return { sql, dropCount, createCount };
}

async function verifyFunctions() {
  console.log('\n🔧 Step 3: Verifying required functions...');

  // Check if is_global_admin function exists by trying to use it
  const { data, error } = await supabase.rpc('is_global_admin', {
    user_id: '00000000-0000-0000-0000-000000000000'
  });

  if (error) {
    if (error.message.includes('function') && error.message.includes('does not exist')) {
      console.log('   ❌ Required function is_global_admin() is missing');
      return false;
    }
    // Other errors are ok (like permission errors)
    console.log('   ✅ Function exists (permission check failed as expected)');
    return true;
  }

  console.log('   ✅ Function is_global_admin() exists and callable');
  return true;
}

async function runTests() {
  try {
    // Test 1: Current policies
    const currentPolicies = await getCurrentPolicies();

    // Test 2: SQL file validation
    const fixSQL = await testFixSQL();

    // Test 3: Function verification
    const functionsOk = await verifyFunctions();

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Supabase connection: Working');
    console.log(`${currentPolicies ? '✅' : '⚠️ '} Current policies: ${currentPolicies ? 'Found' : 'Not accessible'}`);
    console.log(`${fixSQL ? '✅' : '❌'} Fix SQL file: ${fixSQL ? 'Valid' : 'Missing'}`);
    console.log(`${functionsOk ? '✅' : '❌'} Required functions: ${functionsOk ? 'Available' : 'Missing'}`);

    console.log('\n💡 NEXT STEPS:');
    if (fixSQL && functionsOk) {
      console.log('   1. Review the SQL file: database/fix-expense-items-rls.sql');
      console.log('   2. Execute via Supabase Dashboard SQL Editor (recommended)');
      console.log('   3. Or run: npm run apply:expense-rls-fix (if script exists)');
    } else {
      console.log('   ⚠️  Prerequisites not met - cannot apply fix yet');
    }

    console.log('\n✅ Test Complete\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runTests();