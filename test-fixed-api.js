/**
 * Test the fixed search API
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFixedAPI() {
  console.log('🧪 Testing the fixed search API...');
  
  try {
    // Get auth token for Brent
    console.log('🔐 Authenticating as Brent...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'brent@perrotuertocm.cl',
      password: 'NuevaEdu2025!'
    });
    
    if (authError) {
      console.error('❌ Auth error:', authError);
      return;
    }
    
    console.log('✅ Authenticated successfully');
    
    // Wait a moment for deployment
    console.log('⏳ Waiting for deployment to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test the search API for "bob"
    console.log('\n🔍 Testing search for "bob"...');
    const searchResponse = await fetch('https://fne-lms.vercel.app/api/community/search-users?q=bob', {
      headers: {
        'Authorization': `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Search API Response status:', searchResponse.status);
    
    if (searchResponse.ok) {
      const searchResults = await searchResponse.json();
      console.log('✅ Search API results:', searchResults);
      
      if (searchResults.length > 0) {
        console.log('🎉 SUCCESS: Bob Dylan now appears in search results!');
        console.log('👤 Found users:', searchResults.map(u => u.display_name));
      } else {
        console.log('❌ STILL ISSUE: No users found for "bob"');
      }
    } else {
      const errorText = await searchResponse.text();
      console.error('❌ Search API error:', errorText);
    }
    
    // Also test search for partial matches
    console.log('\n🔍 Testing search for "dyl"...');
    const dylResponse = await fetch('https://fne-lms.vercel.app/api/community/search-users?q=dyl', {
      headers: {
        'Authorization': `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (dylResponse.ok) {
      const dylResults = await dylResponse.json();
      console.log('✅ "dyl" search results:', dylResults);
    }
    
    // Test empty search (should return all community members)
    console.log('\n🔍 Testing empty search (all community members)...');
    const allResponse = await fetch('https://fne-lms.vercel.app/api/community/search-users', {
      headers: {
        'Authorization': `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (allResponse.ok) {
      const allResults = await allResponse.json();
      console.log('✅ All community members:', allResults.map(u => u.display_name));
    }
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  }
}

testFixedAPI();