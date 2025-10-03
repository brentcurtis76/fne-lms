/**
 * Fix Migration - Direct Update Approach
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMigration() {
  console.log('🔧 Fixing School Assignment Migration\n');

  // Get users with NULL in user_roles but school in profiles
  const { data: nullRoles } = await supabase
    .from('user_roles')
    .select('id, user_id, school_id')
    .is('school_id', null)
    .eq('is_active', true);

  console.log(`Found ${nullRoles?.length || 0} user_roles with NULL school_id\n`);

  const userIds = [...new Set(nullRoles?.map(r => r.user_id) || [])];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, school_id, first_name, last_name')
    .in('id', userIds)
    .in('school_id', [17, 3, 11]); // Only verified schools

  console.log(`${profiles?.length || 0} have school in profiles (verified schools only)\n`);
  console.log('Starting update...\n');

  let updated = 0;
  for (const profile of profiles || []) {
    // Update ALL user_roles rows for this user with NULL school_id
    const userRolesToUpdate = nullRoles?.filter(r => r.user_id === profile.id) || [];

    for (const role of userRolesToUpdate) {
      const { error } = await supabase
        .from('user_roles')
        .update({ school_id: profile.school_id })
        .eq('id', role.id);

      if (error) {
        console.error(`❌ Error updating role ${role.id}:`, error.message);
      } else {
        updated++;
        console.log(`✅ Updated: ${profile.first_name} ${profile.last_name} (role ${role.id}) → school ${profile.school_id}`);
      }
    }
  }

  console.log(`\n✅ Total user_roles updated: ${updated}\n`);

  // Verify
  const { count: remaining } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .is('school_id', null)
    .eq('is_active', true);

  console.log(`Remaining NULL school_ids: ${remaining}\n`);
}

fixMigration().catch(console.error);
