#!/usr/bin/env node

/**
 * Script to apply community customization migration
 * Adds custom_name and image_url fields to community_workspaces table
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('🚀 Starting community customization migration...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'add-community-customization.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Execute the migration
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Migration failed:', error);
      return;
    }

    console.log('✅ Community customization migration applied successfully!');
    console.log('\n📝 Changes applied:');
    console.log('- Added custom_name field to community_workspaces');
    console.log('- Added image_url field to community_workspaces');
    console.log('- Added image_storage_path field to community_workspaces');
    console.log('- Updated RLS policies for community leaders');
    console.log('\n⚠️  Note: You need to create the "community-images" storage bucket in Supabase Dashboard');
    console.log('1. Go to Storage in Supabase Dashboard');
    console.log('2. Create a new bucket called "community-images"');
    console.log('3. Make it public');
    console.log('4. Add storage policies for authenticated users');

  } catch (error) {
    console.error('❌ Error during migration:', error);
  }
}

// Run the migration
applyMigration();