#!/usr/bin/env node

/**
 * Genera - Test API Fix
 * 
 * This script tests the notification types API fix by comparing
 * regular client vs service role client results.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testAPIFix() {
  console.log('🔍 Testing API Fix - Service Role vs Regular Client');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Test 1: Regular client (what was used before - might fail due to RLS)
    console.log('📋 TEST 1: Regular Client (Anon Key)');
    console.log('-'.repeat(40));
    
    const supabaseRegular = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: regularData, error: regularError } = await supabaseRegular
      .from('notification_types')
      .select('id, name, description, category, default_enabled, created_at')
      .order('category', { ascending: true });

    if (regularError) {
      console.log(`❌ Regular client error: ${regularError.message}`);
      console.log('   This is likely due to RLS policies blocking access');
    } else {
      console.log(`✅ Regular client success: ${regularData?.length || 0} types found`);
    }

    console.log('');

    // Test 2: Service role client (what the fix uses - should work)
    console.log('📋 TEST 2: Service Role Client');
    console.log('-'.repeat(40));
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from('notification_types')
      .select('id, name, description, category, default_enabled, created_at')
      .order('category', { ascending: true });

    if (adminError) {
      console.log(`❌ Service role error: ${adminError.message}`);
      console.log('   This should NOT happen - service role bypasses RLS');
    } else {
      console.log(`✅ Service role success: ${adminData?.length || 0} types found`);
      
      if (adminData && adminData.length > 0) {
        console.log('   📊 Sample data:');
        adminData.slice(0, 3).forEach((type, index) => {
          console.log(`     ${index + 1}. ${type.id} (${type.category}) - ${type.name}`);
        });
      }
    }

    console.log('');

    // Test 3: API endpoint test
    console.log('📋 TEST 3: API Endpoint Test');
    console.log('-'.repeat(40));
    
    try {
      const apiResponse = await fetch('http://localhost:3000/api/admin/notification-types');
      console.log(`   Status: ${apiResponse.status}`);
      
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        console.log(`   Response: ${JSON.stringify(apiData, null, 2)}`);
        
        if (apiData.success && apiData.totalCount > 0) {
          console.log(`   ✅ API working: ${apiData.totalCount} types returned`);
        } else {
          console.log(`   ⚠️  API issue: ${apiData.error || 'No data returned'}`);
        }
      } else {
        console.log(`   ❌ API error: ${apiResponse.status} ${apiResponse.statusText}`);
      }
    } catch (err) {
      console.log(`   ❌ API connection error: ${err.message}`);
    }

    console.log('');
    console.log('🎯 SUMMARY');
    console.log('=' .repeat(60));
    
    const regularCount = regularData?.length || 0;
    const adminCount = adminData?.length || 0;
    
    if (adminCount > 0) {
      console.log('✅ FIX SUCCESSFUL!');
      console.log(`   Service role client returns ${adminCount} notification types`);
      console.log('   API should now work correctly with the service role fix');
    } else {
      console.log('❌ FIX FAILED!');
      console.log('   Service role client also returns empty data');
      console.log('   Issue is not RLS - might be table/data problem');
    }
    
    if (regularCount === 0 && adminCount > 0) {
      console.log('');
      console.log('🔍 DIAGNOSIS: RLS was blocking access');
      console.log('   Regular client: 0 types (blocked by RLS)');
      console.log(`   Service role: ${adminCount} types (bypasses RLS)`);
      console.log('   API fix using service role should resolve the issue');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAPIFix();