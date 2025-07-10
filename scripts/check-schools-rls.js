import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchoolsRls() {
  console.log('🔍 Checking current schools table RLS policies...\n');

  try {
    // Check if Jorge can see schools
    const jorgeEmail = 'jorge.parra@nuevaeducacion.org';
    
    // First check auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
    const jorge = authUser?.users?.find(u => u.email === jorgeEmail);
    
    if (jorge) {
      console.log(`✅ Found Jorge in auth.users:`, { id: jorge.id, email: jorge.email });
    } else {
      console.log(`❌ Jorge not found in auth.users`);
    }
    
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', jorgeEmail)
      .single();

    if (userData) {
      console.log(`✅ Found Jorge's profile:`, userData);
      
      // Check Jorge's role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role_type, is_active')
        .eq('user_id', userData.id)
        .single();
        
      if (roleData) {
        console.log(`📋 Jorge's role:`, roleData);
      }
    } else {
      console.log(`❌ Could not find Jorge's profile (${jorgeEmail})`);
    }

    // Try to fetch schools as service role
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name')
      .limit(5);

    if (schoolsError) {
      console.log('\n❌ Error fetching schools:', schoolsError.message);
    } else {
      console.log(`\n📚 Sample schools (${schools.length} found):`, schools);
    }

    console.log('\n📝 To apply the fix, please:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the contents of: database/fix-schools-rls-jorge.sql');
    console.log('4. Execute the script');
    console.log('5. Run this verification script again to confirm the fix worked');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the check
checkSchoolsRls();