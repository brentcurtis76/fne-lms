/**
 * Script to apply dev role migration to Supabase
 * This adds the 'dev' role type and creates supporting tables
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Starting dev role migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database', 'add-dev-role.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('⚡ Applying migration to database...\n');

    // Note: The migration SQL contains DO blocks and multiple statements
    // which need to be run in Supabase SQL Editor directly
    console.log('⚠️  IMPORTANT: This migration contains complex SQL that must be run directly in Supabase SQL Editor.');
    console.log('\n📋 Steps to apply the migration:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy the contents of /database/add-dev-role.sql');
    console.log('4. Paste and run the SQL in the editor');
    console.log('5. After successful migration, run: npm run assign-dev-role <user-email>');

    console.log('\n📝 Migration adds:');
    console.log('   - "dev" to user_role_type enum');
    console.log('   - dev_role_sessions table for tracking impersonation');
    console.log('   - dev_audit_log table for audit trail');
    console.log('   - Helper functions for role switching');
    console.log('   - RLS policies for security');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
applyMigration();