const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkSchools() {
  try {
    // Check if 'lospellines' exists
    console.log("Checking for 'lospellines' school...");
    console.log("=" * 50);
    
    const { data: lospeллinesSchool, error: searchError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .ilike('name', '%lospellines%');
    
    if (searchError) {
      console.error('Error searching for lospellines:', searchError);
    } else if (lospeллinesSchool && lospeллinesSchool.length > 0) {
      console.log('Found school(s) matching "lospellines":');
      console.log(lospeллinesSchool);
    } else {
      console.log('No school found with name containing "lospellines"');
    }
    
    console.log("\n");
    console.log("Sample of existing schools:");
    console.log("=" * 50);
    
    // Get a sample of existing schools
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('name')
      .limit(10);
    
    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
    } else {
      console.log(`Found ${schools.length} schools (showing first 10):`);
      schools.forEach((school, index) => {
        console.log(`${index + 1}. ${school.name} (ID: ${school.id}, Has Generations: ${school.has_generations})`);
      });
    }
    
    // Also count total schools
    const { count, error: countError } = await supabase
      .from('schools')
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log(`\nTotal schools in database: ${count}`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkSchools();