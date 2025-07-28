/**
 * Check if test users exist in production database
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTestUsers() {
  console.log('🔍 Checking test users in production database...');
  
  const testUsers = [
    'consultant@nuevaeducacion.org',
    'student@nuevaeducacion.org', 
    'director@nuevaeducacion.org',
    'brent@perrotuertocm.cl'
  ];
  
  try {
    for (const email of testUsers) {
      console.log(`\n🔍 Checking ${email}...`);
      
      // Check in profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, approval_status')
        .eq('email', email)
        .single();
        
      if (profileError) {
        console.log(`❌ Profile not found: ${profileError.message}`);
      } else {
        console.log(`✅ Profile found: ${profile.first_name} ${profile.last_name} (Status: ${profile.approval_status})`);
      }
      
      // Check roles
      if (profile) {
        const { data: roles, error: rolesError } = await supabase
          .from('user_roles')
          .select('role_type, is_active')
          .eq('user_id', profile.id);
          
        if (rolesError) {
          console.log(`❌ Roles error: ${rolesError.message}`);
        } else {
          console.log(`👤 Roles: ${roles.map(r => `${r.role_type} (${r.is_active ? 'active' : 'inactive'})`).join(', ')}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTestUsers();