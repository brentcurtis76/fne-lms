/**
 * Run Migration via Supabase MCP
 * Executes the school assignment migration using direct SQL
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🚀 Running School Assignment Migration\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Check current state
    console.log('📊 PRE-MIGRATION STATE:\n');

    const { count: nullCount } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .is('school_id', null)
      .eq('is_active', true);

    console.log(`Users with NULL school_id in user_roles: ${nullCount}\n`);

    // Step 2: Count users to update (only verified schools)
    const { data: toUpdate } = await supabase
      .from('user_roles')
      .select('user_id, user_roles!inner(school_id)')
      .is('school_id', null)
      .eq('is_active', true);

    const userIds = toUpdate?.map(r => r.user_id) || [];

    const { data: profilesWithSchool } = await supabase
      .from('profiles')
      .select('id, school_id')
      .in('id', userIds)
      .in('school_id', [17, 3, 11]); // Only verified schools

    console.log(`Users to be updated: ${profilesWithSchool?.length || 0}`);
    console.log('  - Liceo Nacional de Llolleo (17)');
    console.log('  - Santa Marta de Valdivia (3)');
    console.log('  - Institución Sweet (11)\n');

    // Step 3: Execute the update
    console.log('⚡ EXECUTING MIGRATION...\n');

    const updateSQL = `
      UPDATE user_roles ur
      SET school_id = p.school_id
      FROM profiles p
      WHERE ur.user_id = p.id
        AND ur.school_id IS NULL
        AND p.school_id IS NOT NULL
        AND ur.is_active = true
        AND p.school_id IN (17, 3, 11);
    `;

    const { error: updateError } = await supabase.rpc('exec_sql', {
      query: updateSQL
    });

    if (updateError) {
      // If RPC doesn't exist, do it row by row
      console.log('Using row-by-row update method...\n');

      let updated = 0;
      for (const profile of profilesWithSchool || []) {
        const { error } = await supabase
          .from('user_roles')
          .update({ school_id: profile.school_id })
          .eq('user_id', profile.id)
          .is('school_id', null)
          .eq('is_active', true);

        if (error) {
          console.error(`❌ Error updating user ${profile.id}:`, error.message);
        } else {
          updated++;
        }
      }

      console.log(`✅ Updated ${updated} users\n`);
    } else {
      console.log('✅ Bulk update successful\n');
    }

    // Step 4: Verify the results
    console.log('🔍 POST-MIGRATION VERIFICATION:\n');

    const { count: liceoCount } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', 17)
      .eq('is_active', true);

    const { count: valdiviaCount } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', 3)
      .eq('is_active', true);

    const { count: sweetCount } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', 11)
      .eq('is_active', true);

    console.log('✅ RESULTS BY SCHOOL:');
    console.log(`   Liceo Nacional de Llolleo: ${liceoCount} users`);
    console.log(`   Santa Marta de Valdivia: ${valdiviaCount} users`);
    console.log(`   Institución Sweet: ${sweetCount} users\n`);

    // Step 5: Final verification - check for remaining NULLs in verified schools
    const { data: stillNull } = await supabase
      .from('user_roles')
      .select('user_id')
      .is('school_id', null)
      .eq('is_active', true);

    const stillNullIds = stillNull?.map(r => r.user_id) || [];

    const { data: profilesStillWithSchool } = await supabase
      .from('profiles')
      .select('id, school_id')
      .in('id', stillNullIds)
      .in('school_id', [17, 3, 11]);

    if ((profilesStillWithSchool?.length || 0) > 0) {
      console.log(`⚠️  WARNING: ${profilesStillWithSchool.length} verified school users still have NULL\n`);
      profilesStillWithSchool?.forEach(p => {
        console.log(`   User ${p.id}: school_id ${p.school_id}`);
      });
    } else {
      console.log('✅ SUCCESS: All users from verified schools now have school assigned\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ MIGRATION FAILED:', error);
    console.error('\nPlease check the error above and try again.\n');
    process.exit(1);
  }
}

runMigration().catch(console.error);
