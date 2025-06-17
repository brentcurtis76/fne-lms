const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserSchool() {
  // Find Fabian Torres
  const { data: users, error } = await supabase
    .from('profiles')
    .select('*, user_roles!user_roles_user_id_fkey(*)')
    .or('first_name.ilike.%fabian%,last_name.ilike.%torres%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error finding user:', error);
    return;
  }

  console.log(`Found ${users.length} users matching "Fabian Torres":\n`);
  
  users.forEach(user => {
    console.log(`User: ${user.first_name} ${user.last_name}`);
    console.log(`Email: ${user.email}`);
    console.log(`ID: ${user.id}`);
    console.log(`Roles:`, user.user_roles);
    console.log('---');
  });

  // Check what school is being selected when trying to assign
  console.log('\nChecking school IDs for community assignment...');
  
  // Los Pellines school (where communities exist)
  const { data: losPellines } = await supabase
    .from('schools')
    .select('*')
    .eq('name', 'Los Pellines')
    .single();
    
  console.log('\nLos Pellines school:', losPellines);
  
  // Check communities for Los Pellines
  if (losPellines) {
    const { data: communities } = await supabase
      .from('growth_communities')
      .select('*')
      .eq('school_id', losPellines.id);
      
    console.log(`\nCommunities for Los Pellines (ID: ${losPellines.id}):`, communities);
  }
}

checkUserSchool().catch(console.error);