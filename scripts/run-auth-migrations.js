/**
 * Auth System Migration Runner
 * This script safely applies the authentication system migrations
 * 
 * Run with: node scripts/run-auth-migrations.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('\nTo run migrations, you need the service role key from your Supabase project.');
  console.log('Set it with: export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

// Create admin client
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Migration files
const migrations = [
  {
    name: '001_create_role_detection_system',
    file: 'database/migrations/001_create_role_detection_system.sql',
    description: 'Creates materialized view and functions for non-recursive role detection'
  },
  {
    name: '002_update_all_rls_policies',
    file: 'database/migrations/002_update_all_rls_policies.sql',
    description: 'Updates all RLS policies to use the new role detection system'
  },
  {
    name: '003_sync_user_metadata',
    file: 'database/migrations/003_sync_user_metadata.sql',
    description: 'Syncs user roles from profiles to auth.users metadata'
  }
];

// Helper to check if migration was already applied
async function isMigrationApplied(name) {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('version')
    .eq('version', name)
    .single();
    
  // If table doesn't exist, we'll create it
  if (error && error.code === 'PGRST116') {
    await createMigrationsTable();
    return false;
  }
  
  return !!data;
}

// Create migrations table if it doesn't exist
async function createMigrationsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
  
  const { error } = await supabase.rpc('exec_sql', { query: createTableSQL });
  if (error) {
    console.error('Failed to create migrations table:', error);
    throw error;
  }
}

// Record that a migration was applied
async function recordMigration(name) {
  const { error } = await supabase
    .from('schema_migrations')
    .insert({ version: name });
    
  if (error) {
    console.error('Failed to record migration:', error);
    throw error;
  }
}

// Apply a single migration
async function applyMigration(migration) {
  console.log(`\n📄 Migration: ${migration.name}`);
  console.log(`   ${migration.description}`);
  
  // Check if already applied
  const applied = await isMigrationApplied(migration.name);
  if (applied) {
    console.log('   ✅ Already applied');
    return;
  }
  
  // Read migration file
  const filePath = path.join(process.cwd(), migration.file);
  let sql;
  try {
    sql = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`   ❌ Failed to read file: ${migration.file}`);
    throw error;
  }
  
  // Apply migration
  console.log('   ⏳ Applying migration...');
  
  // For complex migrations, we need to use the Supabase SQL editor
  // or apply them through the dashboard
  console.log('\n   ⚠️  This migration needs to be applied manually:');
  console.log(`   1. Go to your Supabase dashboard`);
  console.log(`   2. Navigate to SQL Editor`);
  console.log(`   3. Copy and paste the contents of: ${migration.file}`);
  console.log(`   4. Execute the migration`);
  console.log(`   5. Run this script again to continue`);
  
  // For now, we'll mark it as needing manual application
  console.log('\n   📋 Migration preview (first 500 chars):');
  console.log('   ' + sql.substring(0, 500).replace(/\n/g, '\n   ') + '...');
  
  return false; // Indicates manual action needed
}

// Main migration runner
async function runMigrations() {
  console.log('🚀 Authentication System Migration Runner');
  console.log('========================================\n');
  
  let allApplied = true;
  
  for (const migration of migrations) {
    const result = await applyMigration(migration);
    if (result === false) {
      allApplied = false;
      break; // Stop at first migration that needs manual application
    }
  }
  
  console.log('\n========================================');
  
  if (allApplied) {
    console.log('✅ All migrations have been applied!');
    console.log('\nNext steps:');
    console.log('1. Run the test script: node scripts/test-auth-system-comprehensive.js');
    console.log('2. Update remaining API routes to use auth helpers');
    console.log('3. Test the application thoroughly');
  } else {
    console.log('⚠️  Manual action required!');
    console.log('\nAfter applying the migration manually, run this script again.');
  }
}

// Alternative: Direct migration application (if RPC is available)
async function applyMigrationDirect(name, sql) {
  try {
    // This would require a custom RPC function in Supabase
    const { error } = await supabase.rpc('apply_migration', { 
      migration_name: name,
      migration_sql: sql 
    });
    
    if (error) throw error;
    
    await recordMigration(name);
    console.log('   ✅ Applied successfully');
    return true;
  } catch (error) {
    console.error('   ❌ Failed to apply:', error.message);
    return false;
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('\n💥 Migration failed:', error);
  process.exit(1);
});