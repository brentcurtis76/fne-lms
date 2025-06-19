const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRequirements() {
  // Get community details
  const { data: community } = await supabase
    .from('growth_communities')
    .select('*, school:schools(*)')
    .limit(1)
    .single();
    
  console.log('Community:', community?.name);
  console.log('School ID:', community?.school_id);
  console.log('School:', community?.school);
  
  // Check if consultant needs school_id
  const { data: existingConsultors } = await supabase
    .from('user_roles')
    .select('*')
    .eq('role_type', 'consultor')
    .limit(3);
    
  console.log('\nExisting consultors:');
  existingConsultors?.forEach(c => {
    console.log(`- User: ${c.user_id}, School: ${c.school_id}, Community: ${c.community_id}`);
  });
}

checkRequirements();