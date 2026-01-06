#!/usr/bin/env node

/**
 * Genera - Test Notification Tables
 * 
 * This script tests if the notification tables exist and can be accessed.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testNotificationTables() {
  try {
    console.log('🔍 Testing notification system tables...');
    
    // Test if tables exist by querying them
    const tables = [
      'notification_types',
      'notifications', 
      'user_notification_preferences'
    ];
    
    for (const tableName of tables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
          
        if (error) {
          console.log(`❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`✅ ${tableName}: Table exists and accessible`);
        }
      } catch (err) {
        console.log(`❌ ${tableName}: ${err.message}`);
      }
    }
    
    // If notification_types exists, show the types
    try {
      const { data: types, error } = await supabase
        .from('notification_types')
        .select('id, name, category');
        
      if (!error && types && types.length > 0) {
        console.log('\n📦 Available notification types:');
        types.forEach(type => {
          console.log(`  • ${type.id} (${type.category}): ${type.name}`);
        });
      }
    } catch (err) {
      // Table might not exist yet
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testNotificationTables();