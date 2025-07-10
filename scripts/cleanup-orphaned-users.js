/**
 * User Data Cleanup Script
 * 
 * This script fixes data integrity issues between auth.users and profiles tables.
 * It can:
 * 1. Create auth users for orphaned profiles
 * 2. Create profiles for orphaned auth users
 * 3. Delete orphaned records
 * 
 * Usage: 
 *   node scripts/cleanup-orphaned-users.js --dry-run    (preview changes)
 *   node scripts/cleanup-orphaned-users.js --execute    (apply changes)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

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

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isExecute = args.includes('--execute');

if (!isDryRun && !isExecute) {
  console.log('Usage: node scripts/cleanup-orphaned-users.js [--dry-run | --execute]');
  console.log('  --dry-run   Preview changes without applying them');
  console.log('  --execute   Apply the cleanup changes');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase());
    });
  });
}

async function generateTempPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function cleanupOrphanedRecords() {
  console.log('='.repeat(80));
  console.log('USER DATA CLEANUP SCRIPT');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'EXECUTE (changes will be applied)'}`);
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Get all profiles and auth users
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, name, first_name, last_name, approval_status, created_at')
      .order('created_at', { ascending: false });

    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();

    const authUserIds = new Set(authUsers.map(u => u.id));
    const profileIds = new Set(profiles.map(p => p.id));

    // Find orphaned records
    const orphanedProfiles = profiles.filter(p => !authUserIds.has(p.id));
    const orphanedAuthUsers = authUsers.filter(u => !profileIds.has(u.id));

    // Handle orphaned profiles
    if (orphanedProfiles.length > 0) {
      console.log(`Found ${orphanedProfiles.length} orphaned profiles\n`);
      
      for (const profile of orphanedProfiles) {
        console.log('='.repeat(60));
        console.log(`Profile: ${profile.email}`);
        console.log(`ID: ${profile.id}`);
        console.log(`Name: ${profile.name || `${profile.first_name} ${profile.last_name}`.trim()}`);
        console.log(`Status: ${profile.approval_status}`);
        
        const action = await askQuestion('\nWhat would you like to do? [c]reate auth user, [d]elete profile, [s]kip: ');
        
        if (action === 'c') {
          const tempPassword = await generateTempPassword();
          console.log(`Creating auth user with temporary password: ${tempPassword}`);
          
          if (isExecute) {
            const { data, error } = await supabase.auth.admin.createUser({
              id: profile.id,
              email: profile.email,
              email_confirm: true,
              password: tempPassword,
              user_metadata: {
                name: profile.name || `${profile.first_name} ${profile.last_name}`.trim()
              }
            });
            
            if (error) {
              console.error('❌ Error creating auth user:', error.message);
            } else {
              console.log('✅ Auth user created successfully');
              
              // Update profile to require password change
              await supabase
                .from('profiles')
                .update({ must_change_password: true })
                .eq('id', profile.id);
            }
          } else {
            console.log('[DRY RUN] Would create auth user');
          }
        } else if (action === 'd') {
          console.log('Deleting orphaned profile...');
          
          if (isExecute) {
            // First delete any role assignments
            await supabase
              .from('user_roles')
              .delete()
              .eq('user_id', profile.id);
            
            // Then delete the profile
            const { error } = await supabase
              .from('profiles')
              .delete()
              .eq('id', profile.id);
            
            if (error) {
              console.error('❌ Error deleting profile:', error.message);
            } else {
              console.log('✅ Profile deleted successfully');
            }
          } else {
            console.log('[DRY RUN] Would delete profile');
          }
        } else {
          console.log('Skipping...');
        }
      }
    }

    // Handle orphaned auth users
    if (orphanedAuthUsers.length > 0) {
      console.log(`\nFound ${orphanedAuthUsers.length} orphaned auth users\n`);
      
      for (const authUser of orphanedAuthUsers) {
        console.log('='.repeat(60));
        console.log(`Auth User: ${authUser.email}`);
        console.log(`ID: ${authUser.id}`);
        console.log(`Created: ${authUser.created_at}`);
        console.log(`Confirmed: ${authUser.email_confirmed_at ? 'Yes' : 'No'}`);
        
        const action = await askQuestion('\nWhat would you like to do? [c]reate profile, [d]elete auth user, [s]kip: ');
        
        if (action === 'c') {
          console.log('Creating profile...');
          
          if (isExecute) {
            const { error } = await supabase
              .from('profiles')
              .insert({
                id: authUser.id,
                email: authUser.email,
                name: authUser.user_metadata?.name || authUser.email.split('@')[0],
                approval_status: 'pending',
                must_change_password: true
              });
            
            if (error) {
              console.error('❌ Error creating profile:', error.message);
            } else {
              console.log('✅ Profile created successfully');
            }
          } else {
            console.log('[DRY RUN] Would create profile');
          }
        } else if (action === 'd') {
          console.log('Deleting orphaned auth user...');
          
          if (isExecute) {
            const { error } = await supabase.auth.admin.deleteUser(authUser.id);
            
            if (error) {
              console.error('❌ Error deleting auth user:', error.message);
            } else {
              console.log('✅ Auth user deleted successfully');
            }
          } else {
            console.log('[DRY RUN] Would delete auth user');
          }
        } else {
          console.log('Skipping...');
        }
      }
    }

    if (orphanedProfiles.length === 0 && orphanedAuthUsers.length === 0) {
      console.log('✅ No orphaned records found! System is healthy.');
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Unexpected error during cleanup:', error);
  } finally {
    rl.close();
  }
}

// Run the cleanup
cleanupOrphanedRecords();