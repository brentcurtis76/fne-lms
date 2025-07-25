/**
 * Test user generation in isolation
 */

const { createClient } = require('@supabase/supabase-js');
const { generateOrganizations } = require('./data-seeding/generators/organizations');
const { generateUsers } = require('./data-seeding/generators/users');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function testUserGeneration() {
  console.log('🧪 Testing user generation in isolation...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  try {
    // First, generate minimal organizational structure
    console.log('1. Generating minimal organizational structure...');
    
    const scenarios = {
      DATA_VOLUMES: {
        schools: 2,
        generations: 4,
        communities: 8,
        users: 10, // Small number for testing
        admins: 1,
        consultors: 2,
        supervisors: 1
      },
      SPANISH_DATA: {
        schools: [`Colegio Test ${Date.now()}-1`, `Colegio Test ${Date.now()}-2`]
      }
    };
    
    const orgData = await generateOrganizations(supabase, scenarios);
    
    console.log('📊 Generated organizational data:');
    console.log(`  - Schools: ${orgData.schools?.length || 0}`);
    console.log(`  - Generations: ${orgData.generations?.length || 0}`);
    console.log(`  - Communities: ${orgData.communities?.length || 0}`);
    
    if (orgData.schools && orgData.schools.length > 0) {
      console.log('✅ Sample school:', orgData.schools[0]);
    }
    
    // Now test user generation
    console.log('\n2. Testing user generation...');
    
    const generatedData = {
      organizations: orgData
    };
    
    const userData = await generateUsers(supabase, scenarios, generatedData);
    
    console.log('✅ User generation successful!');
    console.log(`Generated ${userData?.length || 0} users`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run test
if (require.main === module) {
  testUserGeneration()
    .then(success => {
      if (success) {
        console.log('\n🎉 USER GENERATION TEST PASSED!');
        console.log('✅ Issue identified and resolved');
      } else {
        console.log('\n❌ USER GENERATION TEST FAILED');
        console.log('Further debugging required');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 TEST CRASHED:', error.message);
      process.exit(1);
    });
}