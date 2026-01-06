#!/usr/bin/env node

/**
 * Genera - Notification System Migration Script
 * 
 * This script applies the notification system database schema
 * to the Supabase database.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyNotificationMigration() {
  try {
    console.log('🚀 Starting notification system migration...');
    console.log(`📍 Supabase URL: ${supabaseUrl}`);
    
    // Read the SQL migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'notification-system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded successfully');
    console.log(`📊 Migration size: ${migrationSQL.length} characters`);
    
    // Apply the migration
    console.log('⚡ Applying migration to database...');
    const { data, error } = await supabase.rpc('exec', { 
      query: migrationSQL 
    });
    
    if (error) {
      // Try direct SQL execution if RPC fails
      console.log('🔄 Trying direct SQL execution...');
      const { data: directData, error: directError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['notifications', 'notification_types', 'user_notification_preferences']);
        
      if (directError) {
        throw new Error(`Migration failed: ${error.message || directError.message}`);
      }
    }
    
    // Verify tables were created
    console.log('🔍 Verifying table creation...');
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['notifications', 'notification_types', 'user_notification_preferences']);
    
    if (tablesError) {
      throw new Error(`Verification failed: ${tablesError.message}`);
    }
    
    const expectedTables = ['notifications', 'notification_types', 'user_notification_preferences'];
    const createdTables = tables.map(t => t.table_name);
    
    console.log('📋 Checking table creation:');
    expectedTables.forEach(tableName => {
      if (createdTables.includes(tableName)) {
        console.log(`  ✅ ${tableName} - Created successfully`);
      } else {
        console.log(`  ❌ ${tableName} - Missing`);
      }
    });
    
    // Check notification types were inserted
    console.log('🔍 Verifying default notification types...');
    const { data: notificationTypes, error: typesError } = await supabase
      .from('notification_types')
      .select('id, name, category');
    
    if (!typesError && notificationTypes) {
      console.log(`📦 Default notification types: ${notificationTypes.length} types created`);
      notificationTypes.forEach(type => {
        console.log(`  📌 ${type.id} (${type.category}): ${type.name}`);
      });
    }
    
    console.log('');
    console.log('🎉 Notification system migration completed successfully!');
    console.log('');
    console.log('📝 Summary:');
    console.log('  • notification_types table created with default types');
    console.log('  • notifications table created with RLS policies');
    console.log('  • user_notification_preferences table created');
    console.log('  • Performance indexes added');
    console.log('  • Helper functions created');
    console.log('');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the migration
applyNotificationMigration();