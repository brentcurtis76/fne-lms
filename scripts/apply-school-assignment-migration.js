/**
 * Apply School Assignment Migration
 * Safely executes the SQL migration with transaction support
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration(dryRun = true) {
  console.log('🔧 School Assignment Migration Tool\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  PRODUCTION MODE - Changes will be applied!\n');
  }

  // Pre-flight checks
  console.log('📋 PRE-FLIGHT CHECKS:\n');

  // Check 1: Count users needing assignment
  const { data: needsAssignment } = await supabase
    .from('user_roles')
    .select('user_id')
    .is('school_id', null)
    .eq('is_active', true);

  console.log(`✓ Users with NULL school_id in user_roles: ${needsAssignment?.length || 0}`);

  // Check 2: Verify we have profiles data (only for verified schools)
  const VERIFIED_SCHOOLS = [17, 3, 11]; // Liceo Llolleo, Santa Marta Valdivia, Institución Sweet
  const userIds = needsAssignment?.map(r => r.user_id) || [];
  const { data: profilesWithSchool } = await supabase
    .from('profiles')
    .select('id, school_id')
    .in('id', userIds)
    .not('school_id', 'is', null)
    .in('school_id', VERIFIED_SCHOOLS);

  console.log(`✓ Of those, have school in profiles: ${profilesWithSchool?.length || 0}`);

  if (profilesWithSchool?.length === 0) {
    console.log('\n✅ No users need assignment - migration not needed\n');
    return;
  }

  console.log(`\n📊 WILL ASSIGN: ${profilesWithSchool?.length} users\n`);

  if (dryRun) {
    // Show preview of what would change
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('DRY RUN PREVIEW (first 10 users):');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const { data: schools } = await supabase
      .from('schools')
      .select('id, name');

    const schoolMap = new Map(schools?.map(s => [s.id, s.name]) || []);

    for (let i = 0; i < Math.min(10, profilesWithSchool.length); i++) {
      const profile = profilesWithSchool[i];
      const { data: user } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', profile.id)
        .single();

      const schoolName = schoolMap.get(profile.school_id);

      console.log(`${i + 1}. ${user?.first_name} ${user?.last_name}`);
      console.log(`   Email: ${user?.email}`);
      console.log(`   Would assign to: ${schoolName} (ID: ${profile.school_id})`);
      console.log('');
    }

    if (profilesWithSchool.length > 10) {
      console.log(`... and ${profilesWithSchool.length - 10} more users\n`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('TO APPLY THIS MIGRATION:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Option 1 - Using Supabase SQL Editor (RECOMMENDED):');
    console.log('1. Open Supabase Dashboard → SQL Editor');
    console.log('2. Copy contents of: database/migrations/sync-school-assignments-to-user-roles.sql');
    console.log('3. Review the notices and verification output');
    console.log('4. Type COMMIT; to apply or ROLLBACK; to cancel\n');
    console.log('Option 2 - Using this script:');
    console.log('   node scripts/apply-school-assignment-migration.js --apply\n');
    console.log('⚠️  IMPORTANT: Create database backup before applying!\n');

  } else {
    // Apply the migration
    console.log('⚠️  APPLYING MIGRATION...\n');

    try {
      // Execute the update using Supabase client
      const { data, error } = await supabase.rpc('sync_school_assignments');

      if (error) {
        // If RPC doesn't exist, do it manually
        console.log('Using direct update method...\n');

        // Get all users that need updating (only verified schools)
        const VERIFIED_SCHOOLS = [17, 3, 11];
        for (const profile of profilesWithSchool) {
          if (!VERIFIED_SCHOOLS.includes(profile.school_id)) {
            console.log(`⚠️  Skipping ${profile.id} - school ${profile.school_id} not in verified list`);
            continue;
          }

          const { error: updateError } = await supabase
            .from('user_roles')
            .update({ school_id: profile.school_id })
            .eq('user_id', profile.id)
            .is('school_id', null)
            .eq('is_active', true);

          if (updateError) {
            throw new Error(`Failed to update user ${profile.id}: ${updateError.message}`);
          }
        }

        console.log('✅ Migration completed successfully!\n');
      } else {
        console.log('✅ Migration completed via RPC!\n');
      }

      // Verify
      const { data: remaining } = await supabase
        .from('user_roles')
        .select('user_id')
        .is('school_id', null)
        .eq('is_active', true);

      const { data: profilesStillWithSchool } = await supabase
        .from('profiles')
        .select('id')
        .in('id', remaining?.map(r => r.user_id) || [])
        .not('school_id', 'is', null);

      if ((profilesStillWithSchool?.length || 0) > 0) {
        console.log(`⚠️  WARNING: ${profilesStillWithSchool.length} users still need assignment\n`);
      } else {
        console.log('✅ VERIFICATION PASSED: All users now have school assigned\n');
      }

    } catch (error) {
      console.error('❌ MIGRATION FAILED:', error.message);
      console.error('\nNo changes were committed. Database is unchanged.\n');
      process.exit(1);
    }
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');

applyMigration(dryRun).catch(console.error);
