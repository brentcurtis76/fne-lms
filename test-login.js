#!/usr/bin/env node

/**
 * Test script to verify login credentials work with local Supabase
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.test.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testLogin() {
  console.log('🧪 Testing login credentials with local Supabase...');
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  
  const testUsers = [
    { email: 'brent@perrotuertocm.cl', password: 'NuevaEdu2025!', name: 'Admin' },
    { email: 'consultant@nuevaeducacion.org', password: 'test123456', name: 'Consultant' },
    { email: 'student@nuevaeducacion.org', password: 'test123456', name: 'Student' },
    { email: 'director@nuevaeducacion.org', password: 'test123456', name: 'Director' }
  ];

  for (const user of testUsers) {
    console.log(`\n🔐 Testing ${user.name} (${user.email})...`);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });

      if (error) {
        console.log(`❌ Login failed: ${error.message}`);
      } else {
        console.log(`✅ Login successful! User ID: ${data.user.id}`);
        
        // Sign out immediately
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.log(`❌ Login error: ${err.message}`);
    }
  }
}

testLogin().then(() => {
  console.log('\n🏁 Login test complete');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});