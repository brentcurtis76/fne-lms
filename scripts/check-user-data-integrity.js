/**
 * User Data Integrity Check Script
 * 
 * This script diagnoses data integrity issues between auth.users and profiles tables.
 * It identifies:
 * 1. Orphaned profiles (profiles without corresponding auth.users)
 * 2. Orphaned auth users (auth.users without corresponding profiles)
 * 3. Data mismatches between the two tables
 * 
 * Usage: node scripts/check-user-data-integrity.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role key for full access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function checkDataIntegrity() {
  console.log('='.repeat(80));
  console.log('USER DATA INTEGRITY CHECK');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Get all profiles
    console.log('Fetching all profiles...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name, first_name, last_name, approval_status, created_at')
      .order('created_at', { ascending: false });

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }

    console.log(`Found ${profiles.length} profiles\n`);

    // Step 2: Get all auth users
    console.log('Fetching all auth users...');
    const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      return;
    }

    console.log(`Found ${authUsers.length} auth users\n`);

    // Step 3: Find orphaned profiles (profiles without auth users)
    console.log('='.repeat(80));
    console.log('ORPHANED PROFILES (exist in profiles but not in auth.users)');
    console.log('='.repeat(80));
    
    const authUserIds = new Set(authUsers.map(u => u.id));
    const orphanedProfiles = profiles.filter(p => !authUserIds.has(p.id));
    
    if (orphanedProfiles.length === 0) {
      console.log('✅ No orphaned profiles found!\n');
    } else {
      console.log(`❌ Found ${orphanedProfiles.length} orphaned profiles:\n`);
      orphanedProfiles.forEach(profile => {
        console.log(`  ID: ${profile.id}`);
        console.log(`  Email: ${profile.email}`);
        console.log(`  Name: ${profile.name || `${profile.first_name} ${profile.last_name}`.trim()}`);
        console.log(`  Status: ${profile.approval_status}`);
        console.log(`  Created: ${profile.created_at}`);
        console.log('  ---');
      });
    }

    // Step 4: Find orphaned auth users (auth users without profiles)
    console.log('='.repeat(80));
    console.log('ORPHANED AUTH USERS (exist in auth.users but not in profiles)');
    console.log('='.repeat(80));
    
    const profileIds = new Set(profiles.map(p => p.id));
    const orphanedAuthUsers = authUsers.filter(u => !profileIds.has(u.id));
    
    if (orphanedAuthUsers.length === 0) {
      console.log('✅ No orphaned auth users found!\n');
    } else {
      console.log(`❌ Found ${orphanedAuthUsers.length} orphaned auth users:\n`);
      orphanedAuthUsers.forEach(user => {
        console.log(`  ID: ${user.id}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  Created: ${user.created_at}`);
        console.log(`  Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
        console.log('  ---');
      });
    }

    // Step 5: Check for email mismatches
    console.log('='.repeat(80));
    console.log('EMAIL MISMATCHES');
    console.log('='.repeat(80));
    
    const mismatches = [];
    profiles.forEach(profile => {
      const authUser = authUsers.find(u => u.id === profile.id);
      if (authUser && authUser.email !== profile.email) {
        mismatches.push({
          id: profile.id,
          profileEmail: profile.email,
          authEmail: authUser.email
        });
      }
    });
    
    if (mismatches.length === 0) {
      console.log('✅ No email mismatches found!\n');
    } else {
      console.log(`❌ Found ${mismatches.length} email mismatches:\n`);
      mismatches.forEach(m => {
        console.log(`  ID: ${m.id}`);
        console.log(`  Profile Email: ${m.profileEmail}`);
        console.log(`  Auth Email: ${m.authEmail}`);
        console.log('  ---');
      });
    }

    // Step 6: Summary and recommendations
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Profiles: ${profiles.length}`);
    console.log(`Total Auth Users: ${authUsers.length}`);
    console.log(`Orphaned Profiles: ${orphanedProfiles.length}`);
    console.log(`Orphaned Auth Users: ${orphanedAuthUsers.length}`);
    console.log(`Email Mismatches: ${mismatches.length}`);
    console.log();

    const totalIssues = orphanedProfiles.length + orphanedAuthUsers.length + mismatches.length;
    if (totalIssues === 0) {
      console.log('✅ SYSTEM HEALTHY: No data integrity issues found!');
    } else {
      console.log(`⚠️  ATTENTION REQUIRED: ${totalIssues} data integrity issues found!`);
      console.log('\nRECOMMENDATIONS:');
      
      if (orphanedProfiles.length > 0) {
        console.log('\n1. For orphaned profiles:');
        console.log('   - Option A: Create corresponding auth users');
        console.log('   - Option B: Delete the orphaned profile records');
        console.log('   Run: node scripts/cleanup-orphaned-users.js');
      }
      
      if (orphanedAuthUsers.length > 0) {
        console.log('\n2. For orphaned auth users:');
        console.log('   - Create corresponding profile records');
        console.log('   Run: node scripts/cleanup-orphaned-users.js');
      }
      
      if (mismatches.length > 0) {
        console.log('\n3. For email mismatches:');
        console.log('   - Update profile emails to match auth user emails');
        console.log('   - Review why emails diverged');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Unexpected error during integrity check:', error);
  }
}

// Run the check
checkDataIntegrity();