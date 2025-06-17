const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCommunities() {
  console.log('Testing growth communities...\n');

  // 1. Get all schools
  const { data: schools, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name')
    .order('name');

  if (schoolsError) {
    console.error('Error fetching schools:', schoolsError);
    return;
  }

  console.log('Schools in database:');
  schools.forEach(school => {
    console.log(`  - ${school.name} (ID: ${school.id})`);
  });

  // 2. Get all communities
  const { data: communities, error: commError } = await supabase
    .from('growth_communities')
    .select('*, school:schools(*), generation:generations(*)')
    .order('created_at', { ascending: false });

  if (commError) {
    console.error('Error fetching communities:', commError);
    return;
  }

  console.log(`\nTotal communities: ${communities.length}`);
  console.log('\nCommunities details:');
  communities.forEach(comm => {
    console.log(`  - ${comm.name}`);
    console.log(`    ID: ${comm.id}`);
    console.log(`    School ID: ${comm.school_id} (type: ${typeof comm.school_id})`);
    console.log(`    School Name: ${comm.school?.name || 'N/A'}`);
    console.log(`    Generation: ${comm.generation?.name || 'None'}`);
    console.log(`    Created: ${new Date(comm.created_at).toLocaleString()}\n`);
  });

  // 3. Test filtering by school
  if (schools.length > 0) {
    const testSchoolId = schools[0].id;
    console.log(`\nTesting filter by school ID ${testSchoolId} (${schools[0].name}):`);
    
    const { data: filteredComms, error: filterError } = await supabase
      .from('growth_communities')
      .select('*')
      .eq('school_id', testSchoolId);

    if (filterError) {
      console.error('Error filtering communities:', filterError);
    } else {
      console.log(`Found ${filteredComms.length} communities for this school`);
      filteredComms.forEach(comm => {
        console.log(`  - ${comm.name}`);
      });
    }
  }
}

testCommunities().catch(console.error);