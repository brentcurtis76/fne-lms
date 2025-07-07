/**
 * Test script to verify authentication fixes
 * Run with: node scripts/test-auth-fixes.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

async function testAuth() {
  console.log('Testing Supabase authentication...\n');
  
  // Create a Supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  try {
    // 1. Test basic connection
    console.log('1. Testing basic connection...');
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Failed to connect to profiles table:', countError.message);
    } else {
      console.log('✅ Successfully connected to database. Profile count:', count);
    }
    
    // 2. Test auth session
    console.log('\n2. Testing auth session...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('❌ Error getting session:', sessionError.message);
    } else if (!session) {
      console.log('⚠️  No active session found (this is normal if not logged in)');
    } else {
      console.log('✅ Active session found for user:', session.user.email);
    }
    
    // 3. Test table access without auth
    console.log('\n3. Testing table access without authentication...');
    const tables = ['schools', 'platform_feedback', 'profiles'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: Accessible (returned ${data?.length || 0} rows)`);
      }
    }
    
    console.log('\n✅ Authentication test completed!');
    console.log('\nRecommendations:');
    console.log('- If you see 500 errors above, check RLS policies');
    console.log('- Make sure all API routes use the new auth helpers');
    console.log('- Ensure components use auth-helpers hooks instead of direct imports');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
  }
}

// Run the test
testAuth();