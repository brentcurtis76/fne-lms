import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const userId = 'b97101c1-aeba-4f1f-8e55-67ff600ec4c3';

async function debug() {
  console.log('=== DEBUGGING ARNOLDO SCHOOL ISSUE ===');
  console.log('User ID:', userId);
  console.log('');

  // 1. Check profiles.school
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, school')
    .eq('id', userId)
    .single();

  console.log('1. profiles table:');
  console.log('   Name:', profile?.first_name, profile?.last_name);
  console.log('   Email:', profile?.email);
  console.log('   profiles.school:', profile?.school);
  console.log('');

  // 2. Check user_roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, role_type, school_id, is_active')
    .eq('user_id', userId);

  console.log('2. user_roles table:');
  if (rolesError) {
    console.log('   ERROR:', rolesError.message);
  } else if (!roles || roles.length === 0) {
    console.log('   No roles found');
  } else {
    roles.forEach(r => {
      console.log('   Role:', r.role_type, '| school_id:', r.school_id, '| is_active:', r.is_active);
    });
  }
  console.log('');

  // 3. What the code does - query with filters
  const { data: filteredRoles, error: filteredError } = await supabase
    .from('user_roles')
    .select('school_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('school_id', 'is', null)
    .limit(1);

  console.log('3. Filtered user_roles query (is_active=true, school_id not null):');
  if (filteredError) {
    console.log('   ERROR:', filteredError.message);
  } else {
    console.log('   Result:', JSON.stringify(filteredRoles));
  }
  console.log('');

  // 4. If we got a school_id, look it up
  if (filteredRoles && filteredRoles.length > 0 && filteredRoles[0].school_id) {
    const schoolId = filteredRoles[0].school_id;
    console.log('4. Looking up school_id:', schoolId);

    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (schoolError) {
      console.log('   ERROR:', schoolError.message);
    } else {
      console.log('   School found:', school?.name);
    }
  } else {
    console.log('4. No school_id found in filtered roles');
  }

  // 5. List all schools to check school 19
  console.log('');
  console.log('5. Checking school 19 directly:');
  const { data: school19 } = await supabase
    .from('schools')
    .select('id, name')
    .eq('id', 19)
    .single();
  console.log('   School 19:', school19?.name);
}

debug().catch(console.error);
