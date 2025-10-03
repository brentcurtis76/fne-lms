#!/usr/bin/env node
/**
 * Test Supabase MCP Connection
 * Tests if we can connect to Supabase using the service role key
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase MCP Connection...\n');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'MISSING');
console.log('');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Test 1: Basic table access
    console.log('Test 1: Basic table access (expense_items)...');
    const { data: items, error: itemsError } = await supabase
      .from('expense_items')
      .select('count')
      .limit(1);

    if (itemsError) {
      console.log('   ❌ FAILED:', itemsError.message);
    } else {
      console.log('   ✅ SUCCESS: Can read expense_items table');
    }

    // Test 2: Check RLS policies
    console.log('\nTest 2: Query RLS policies...');
    const { data: policies, error: policiesError } = await supabase
      .rpc('exec_sql', {
        sql: "SELECT * FROM pg_policies WHERE tablename = 'expense_items'"
      })
      .single();

    if (policiesError) {
      console.log('   ⚠️  Cannot query policies (expected with RLS):', policiesError.message);
    } else {
      console.log('   ✅ SUCCESS: Can query policies');
      console.log('   Policies found:', policies);
    }

    // Test 3: Check if is_global_admin function exists
    console.log('\nTest 3: Check is_global_admin function...');
    const { data: funcs, error: funcsError } = await supabase
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'is_global_admin')
      .limit(1);

    if (funcsError) {
      console.log('   ⚠️  Cannot query functions:', funcsError.message);
    } else {
      console.log('   ✅ Function check complete');
    }

    console.log('\n✅ MCP Connection Test Complete');

  } catch (error) {
    console.error('❌ Test failed with exception:', error.message);
    process.exit(1);
  }
}

testConnection();