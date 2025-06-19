const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import the service
const { groupAssignmentsV2Service } = require('../lib/services/groupAssignmentsV2');

async function testService() {
  console.log('Testing Group Assignments V2 Service...\n');

  try {
    // Get a test user
    const { data: testUser } = await supabase
      .from('user_roles')
      .select('id, role_type, community_id')
      .eq('role_type', 'docente')
      .not('community_id', 'is', null)
      .limit(1)
      .single();

    if (!testUser) {
      console.log('No test user found. Trying any user with community...');
      const { data: anyUser } = await supabase
        .from('user_roles')
        .select('id, role_type, community_id')
        .not('community_id', 'is', null)
        .limit(1)
        .single();
      
      if (anyUser) {
        testUser = anyUser;
      } else {
        console.error('No users with community found');
        return;
      }
    }

    console.log('Test user:', testUser);

    // Test the service method
    console.log('\nTesting getGroupAssignmentsForUser...');
    const result = await groupAssignmentsV2Service.getGroupAssignmentsForUser(testUser.id);
    
    if (result.error) {
      console.error('Service error:', result.error);
    } else {
      console.log(`Found ${result.assignments.length} group assignments`);
      if (result.assignments.length > 0) {
        console.log('\nFirst assignment:', result.assignments[0]);
      }
    }

    // Check consultant assignments for this community
    console.log('\nChecking consultant assignments for community:', testUser.community_id);
    const { data: consultantAssignments } = await supabase
      .from('consultant_assignments')
      .select('*')
      .eq('community_id', testUser.community_id)
      .eq('is_active', true);

    console.log(`Found ${consultantAssignments?.length || 0} consultant assignments for this community`);
    
    if (consultantAssignments?.length > 0) {
      console.log('Course IDs assigned:', consultantAssignments.map(ca => ca.assigned_entity_id));
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testService();