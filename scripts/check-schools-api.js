const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchools() {
  console.log('Checking schools table...\n');

  try {
    // First, check if schools table exists and has data
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name')
      .order('name');

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return;
    }

    console.log(`Found ${schools?.length || 0} schools in database:`);
    schools?.forEach(school => {
      console.log(`- [${school.id}] ${school.name}`);
    });

    // Check network assignments
    console.log('\nChecking network assignments...');
    const { data: assignments, error: assignError } = await supabase
      .from('red_escuelas')
      .select(`
        school_id,
        red_id,
        redes_de_colegios (
          id,
          name
        )
      `);

    if (assignError) {
      console.error('Error fetching assignments:', assignError);
      return;
    }

    console.log(`\nFound ${assignments?.length || 0} school-network assignments`);
    
    // Map assignments by school
    const assignmentMap = {};
    assignments?.forEach(assignment => {
      if (assignment.redes_de_colegios) {
        assignmentMap[assignment.school_id] = assignment.redes_de_colegios.name;
      }
    });

    // Show which schools are in which networks
    console.log('\nSchool Network Assignments:');
    schools?.forEach(school => {
      const network = assignmentMap[school.id];
      console.log(`- ${school.name}: ${network || 'No network assigned'}`);
    });

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkSchools();