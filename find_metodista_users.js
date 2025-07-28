const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findMetodistaUsers() {
  try {
    console.log('Searching for users from Colegio Metodista de Santiago...');
    
    // First, let's check what schools exist with 'Metodista' in the name
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .ilike('name', '%metodista%');
      
    if (!schoolError && schools && schools.length > 0) {
      console.log('Schools with "Metodista" in name:');
      schools.forEach(school => {
        console.log(`- ${school.name} (ID: ${school.id})`);
      });
      
      // Now search for users in these schools
      const schoolIds = schools.map(s => s.id);
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          school_id
        `)
        .in('school_id', schoolIds)
        .limit(10);

      if (!userError && users && users.length > 0) {
        console.log(`\nFound ${users.length} users from Metodista schools:`);
        console.log('ID | Name | Email | School ID');
        console.log('---|------|-------|----------');
        users.forEach(user => {
          const school = schools.find(s => s.id === user.school_id);
          console.log(`${user.id} | ${user.first_name} ${user.last_name} | ${user.email} | ${school?.name || user.school_id}`);
        });
      } else {
        console.log('\nNo users found in Metodista schools');
        if (userError) console.error('User query error:', userError);
      }
    } else {
      console.log('No schools found with "Metodista" in the name');
      if (schoolError) console.error('School query error:', schoolError);
      
      // Let's check for any schools with 'Santiago' in the name
      const { data: santiagoSchools } = await supabase
        .from('schools')
        .select('id, name')
        .ilike('name', '%santiago%')
        .limit(5);
        
      if (santiagoSchools && santiagoSchools.length > 0) {
        console.log('\nSchools with "Santiago" in name (first 5):');
        santiagoSchools.forEach(school => {
          console.log(`- ${school.name} (ID: ${school.id})`);
        });
      }
    }

    // Let's also check the total count of users for context
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\nTotal users in database: ${count}`);
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

findMetodistaUsers();