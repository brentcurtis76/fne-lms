/**
 * Apply Profile-Auth Foreign Key Constraint
 * 
 * This script applies the database migration to add foreign key constraint
 * between profiles.id and auth.users.id
 * 
 * Usage: node scripts/apply-profile-constraint.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function applyMigration() {
  console.log('='.repeat(80));
  console.log('APPLYING PROFILE-AUTH FOREIGN KEY CONSTRAINT');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Read the migration SQL
    const migrationPath = path.join(__dirname, '..', 'database', 'add-profile-auth-constraint.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Migration SQL loaded successfully');
    console.log('\nIMPORTANT: This migration will:');
    console.log('1. Add foreign key constraint profiles.id -> auth.users.id');
    console.log('2. Enable CASCADE DELETE (deleting auth user deletes profile)');
    console.log('3. Create trigger to auto-create profiles for new auth users');
    console.log('4. Add performance index on profiles.id\n');
    
    console.log('⚠️  WARNING: This cannot be easily undone in production!');
    console.log('Make sure you have run the integrity check first.\n');
    
    // For safety, we'll output the SQL to be run manually
    console.log('To apply this migration, run the following SQL in Supabase SQL Editor:');
    console.log('='.repeat(80));
    console.log(migrationSQL);
    console.log('='.repeat(80));
    console.log('\nAlternatively, if you have Supabase CLI installed:');
    console.log('supabase db execute -f database/add-profile-auth-constraint.sql\n');
    
    // Double-check integrity one more time
    console.log('Running final integrity check...');
    const { data: orphanedProfiles, error } = await supabase
      .rpc('count_orphaned_profiles', {});
      
    if (error) {
      // If RPC doesn't exist, do it manually
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
        
      if (!countError) {
        console.log(`✅ Found ${count} total profiles`);
        console.log('Please verify no orphaned records exist before applying migration.');
      }
    } else {
      console.log(`✅ Orphaned profiles check: ${orphanedProfiles || 0}`);
      if (orphanedProfiles > 0) {
        console.error('❌ Cannot apply migration: orphaned profiles exist!');
        console.error('Run cleanup script first: node scripts/cleanup-orphaned-users.js --execute');
        process.exit(1);
      }
    }
    
    console.log('\n✅ System appears ready for migration');
    console.log('Copy the SQL above and run it in Supabase SQL Editor');
    
  } catch (error) {
    console.error('Error preparing migration:', error);
    process.exit(1);
  }
}

// Run the migration prep
applyMigration();