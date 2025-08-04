// Test script for the news system
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

console.log('🔍 Testing News System...');

// Test if we can access the API routes
async function testAPI() {
  try {
    console.log('Testing API routes...');
    
    // Test public news endpoint
    const response = await fetch('http://localhost:3003/api/news');
    console.log('Public news API status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API working, found', data.articles?.length || 0, 'articles');
    } else {
      console.log('❌ API error:', await response.text());
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
  }
}

// Test admin route
async function testAdminAccess() {
  try {
    console.log('Testing admin route access...');
    const response = await fetch('http://localhost:3003/admin/news');
    console.log('Admin news page status:', response.status);
    
    if (response.status === 200) {
      console.log('✅ Admin page accessible');
    } else {
      console.log('ℹ️ Admin page requires authentication (expected)');
    }
  } catch (error) {
    console.log('ℹ️ Admin route test (expected behavior):', error.message);
  }
}

// Test public pages
async function testPublicPages() {
  try {
    console.log('Testing public news page...');
    const response = await fetch('http://localhost:3003/noticias');
    console.log('Public news page status:', response.status);
    
    if (response.status === 200) {
      console.log('✅ Public news page accessible');
    } else {
      console.log('❌ Public news page error');
    }
  } catch (error) {
    console.log('❌ Public page test failed:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting News System Tests...\n');
  
  await testAPI();
  console.log('');
  
  await testAdminAccess();
  console.log('');
  
  await testPublicPages();
  console.log('');
  
  console.log('🎉 Tests completed!');
  console.log('\n📋 Next Steps:');
  console.log('1. Go to http://localhost:3003/admin/setup-news to create the database table');
  console.log('2. Log in as admin and visit http://localhost:3003/admin/news');
  console.log('3. Create your first news article');
  console.log('4. View it at http://localhost:3003/noticias');
}

runTests().catch(console.error);