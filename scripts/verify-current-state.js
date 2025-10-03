/**
 * Verify Current State of FNE Users
 * Check exactly what data exists for the users in your screenshot
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyCurrentState() {
  console.log('🔍 Verifying Current State for Screenshot Users\n');

  // Get school IDs
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name')
    .order('id');

  console.log('📚 Schools in database:');
  schools?.forEach(s => {
    console.log(`   ${s.id}: ${s.name}`);
  });
  console.log('');

  const fneSchool = schools?.find(s => s.name.includes('Fundación Nueva Educación'));
  const liceoSchool = schools?.find(s => s.name.includes('Juana Ross'));

  // Check the three users from screenshot
  const testEmails = [
    'mdelfresno@nuevaeducacion.org',
    'brent@perrotuertocm.cl',
    'tom@nuevaeducacion.org'
  ];

  console.log('👥 CHECKING SCREENSHOT USERS:\n');

  for (const email of testEmails) {
    console.log(`═══════════════════════════════════════════`);
    console.log(`User: ${email}`);
    console.log(`═══════════════════════════════════════════`);

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (!profile) {
      console.log('❌ Profile not found\n');
      continue;
    }

    console.log(`\n📋 PROFILE DATA:`);
    console.log(`   ID: ${profile.id}`);
    console.log(`   Name: ${profile.first_name} ${profile.last_name}`);
    console.log(`   school_id: ${profile.school_id} ${profile.school_id ? `(${schools?.find(s => s.id === profile.school_id)?.name || 'Unknown'})` : '(NULL)'}`);
    console.log(`   generation_id: ${profile.generation_id || 'NULL'}`);
    console.log(`   community_id: ${profile.community_id || 'NULL'}`);

    // Get user_roles
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true);

    console.log(`\n👤 USER_ROLES DATA (${userRoles?.length || 0} active roles):`);
    userRoles?.forEach((role, index) => {
      console.log(`   Role ${index + 1}:`);
      console.log(`      role_type: ${role.role_type}`);
      console.log(`      school_id: ${role.school_id} ${role.school_id ? `(${schools?.find(s => s.id === role.school_id)?.name || 'Unknown'})` : '(NULL)'}`);
      console.log(`      generation_id: ${role.generation_id || 'NULL'}`);
      console.log(`      community_id: ${role.community_id || 'NULL'}`);
      console.log(`      created_at: ${role.created_at}`);
    });

    // Determine what the API would show
    const roleWithSchool = userRoles?.find(r => r.school_id);
    const apiWouldShow = roleWithSchool?.school_id
      ? schools?.find(s => s.id === roleWithSchool.school_id)?.name
      : 'Sin escuela';

    console.log(`\n🎯 WHAT API SHOWS NOW (after fix):`);
    console.log(`   School: ${apiWouldShow}`);

    console.log(`\n✅ CORRECT?`);
    if (email.includes('@nuevaeducacion.org')) {
      console.log(`   Should be FNE: ${apiWouldShow === fneSchool?.name ? '✅ YES' : '❌ NO'}`);
    }

    console.log('\n');
  }

  // Now check if filtering by FNE returns these users
  console.log('═══════════════════════════════════════════');
  console.log('🔍 FILTER TEST: Users with FNE in user_roles');
  console.log('═══════════════════════════════════════════\n');

  const { data: fneRoleUsers } = await supabase
    .from('user_roles')
    .select('user_id, role_type, school_id')
    .eq('school_id', fneSchool?.id)
    .eq('is_active', true);

  console.log(`Users with FNE in user_roles.school_id: ${fneRoleUsers?.length || 0}`);

  for (const roleUser of fneRoleUsers || []) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', roleUser.user_id)
      .single();

    if (profile) {
      const isTestUser = testEmails.includes(profile.email);
      console.log(`   ${profile.first_name} ${profile.last_name} (${profile.email})${isTestUser ? ' ⭐ SCREENSHOT USER' : ''}`);
    }
  }
}

verifyCurrentState().catch(console.error);
