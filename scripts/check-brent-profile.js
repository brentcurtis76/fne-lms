const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkBrentProfile() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found');
    process.exit(1);
  }

  console.log('🔍 Checking profile data for brent@perrotuertocm.cl...\n');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // First get the user ID from auth.users
    const { data: authData, error: authError } = await supabase
      .rpc('get_user_by_email', { email_param: 'brent@perrotuertocm.cl' });
    
    if (authError) {
      console.error('Error fetching auth user:', authError.message);
      
      // Try direct query as fallback
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', 'brent@perrotuertocm.cl')
        .single();
      
      if (profileError) {
        console.error('Error fetching profile:', profileError.message);
        return;
      }
      
      console.log('Profile data from direct query:');
      console.log(JSON.stringify(profileData, null, 2));
      return;
    }
    
    if (!authData) {
      console.log('No user found with email: brent@perrotuertocm.cl');
      return;
    }
    
    // Get the profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.id)
      .single();
    
    if (profileError) {
      console.error('Error fetching profile:', profileError.message);
      return;
    }
    
    console.log('Profile data:');
    console.log(JSON.stringify(profile, null, 2));
    
    // Also check user_roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', authData.id);
    
    if (!rolesError && roles) {
      console.log('\nUser roles:');
      console.log(JSON.stringify(roles, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkBrentProfile();