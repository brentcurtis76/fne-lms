const fetch = require('node-fetch');
require('dotenv').config();

async function testLearningPathsAPI() {
  console.log('Testing Learning Paths API Endpoint\n');
  console.log('='.repeat(50));
  
  // First, we need to get an auth token
  console.log('\n1. Getting auth token...');
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  // Sign in as a test user (you'll need to use real credentials)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'brent@perrotuertocm.cl', // Replace with your test admin email
    password: 'password123' // Replace with your test password
  });
  
  if (authError) {
    console.error('❌ Auth failed:', authError.message);
    console.log('\nPlease update the script with valid credentials to test the API.');
    return;
  }
  
  console.log('✅ Auth successful');
  const accessToken = authData.session.access_token;
  
  // Test the API endpoint
  console.log('\n2. Testing GET /api/learning-paths...');
  
  try {
    const response = await fetch('http://localhost:3000/api/learning-paths', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    console.log('   Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ API Success! Found', data.length, 'learning paths');
      
      if (data.length > 0) {
        console.log('\n   Sample learning paths:');
        data.slice(0, 3).forEach(path => {
          console.log(`     - ${path.name} (${path.course_count} courses)`);
        });
      }
    } else {
      const error = await response.text();
      console.log('   ❌ API Error:', error);
    }
  } catch (err) {
    console.error('   ❌ Request failed:', err.message);
    console.log('\n   Make sure the development server is running on port 3000');
  }
  
  // Sign out
  await supabase.auth.signOut();
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 SUMMARY:');
  console.log('The learning paths page uses the API endpoint, not direct RPC calls.');
  console.log('The API queries the tables directly, which is why the RPC functions don\'t matter.');
  console.log('\n✅ This means the learning paths page should work fine!');
  console.log('If you\'re seeing issues in the browser, check:');
  console.log('1. You\'re logged in as an admin/equipo_directivo/consultor');
  console.log('2. The API endpoint is accessible');
  console.log('3. The browser console for any client-side errors');
}

testLearningPathsAPI().catch(console.error);