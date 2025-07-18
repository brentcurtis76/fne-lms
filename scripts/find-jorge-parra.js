const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findJorgeParra() {
  console.log('Searching for Jorge Parra in profiles table...\n');

  try {
    // Search for Jorge Parra or related email domain
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, created_at, school_id')
      .or('first_name.ilike.%Jorge%,last_name.ilike.%Parra%,email.ilike.%liceosanandres.cl%')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error searching profiles:', error);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('No profiles found matching the search criteria.');
      return;
    }

    console.log(`Found ${profiles.length} matching profile(s):\n`);
    
    profiles.forEach((profile, index) => {
      console.log(`Profile ${index + 1}:`);
      console.log(`  ID: ${profile.id}`);
      console.log(`  Name: ${profile.first_name || 'N/A'} ${profile.last_name || 'N/A'}`);
      console.log(`  Email: ${profile.email}`);
      console.log(`  School ID: ${profile.school_id || 'Not assigned'}`);
      console.log(`  Created: ${new Date(profile.created_at).toLocaleDateString()}`);
      console.log('');
    });

    // Also check user_roles for these users
    const userIds = profiles.map(p => p.id);
    console.log('Checking roles for found users...\n');

    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type, school_id, generation_id, community_id')
      .in('user_id', userIds);

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      return;
    }

    if (roles && roles.length > 0) {
      console.log('User roles:');
      roles.forEach(role => {
        const profile = profiles.find(p => p.id === role.user_id);
        console.log(`  ${profile.first_name || 'N/A'} ${profile.last_name || 'N/A'} (${profile.email}):`);
        console.log(`    - Role: ${role.role_type}`);
        console.log(`    - School ID: ${role.school_id || 'N/A'}`);
        console.log(`    - Generation ID: ${role.generation_id || 'N/A'}`);
        console.log(`    - Community ID: ${role.community_id || 'N/A'}`);
        console.log('');
      });
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

findJorgeParra();