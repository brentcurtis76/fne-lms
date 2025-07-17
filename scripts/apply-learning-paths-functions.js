#!/usr/bin/env node

/**
 * Script to apply learning paths RPC functions to Supabase
 * This creates atomic functions for creating, updating, and assigning learning paths
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Please check your .env.local file.');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyFunctions() {
  console.log('🚀 Applying learning paths RPC functions...\n');

  try {
    // Read the SQL file
    const sqlPath = path.resolve(__dirname, '../database/create-learning-paths-rpc-functions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 SQL file loaded successfully');
    console.log('⏳ Executing SQL migration...\n');

    // Since we can't execute raw SQL through the JS client, we'll need to use the Supabase Dashboard
    console.log('⚠️  IMPORTANT: The Supabase JavaScript client cannot execute raw SQL directly.');
    console.log('\n📋 Please follow these steps to apply the migration:\n');
    console.log('1. Go to your Supabase Dashboard: https://app.supabase.com');
    console.log('2. Select your project (sxlogxqzmarhqsblxmtj)');
    console.log('3. Navigate to the SQL Editor');
    console.log('4. Copy and paste the contents of the following file:');
    console.log(`   ${sqlPath}`);
    console.log('5. Click "Run" to execute the migration\n');

    // Let's at least verify that the tables exist
    console.log('✅ Verifying required tables exist...');
    
    const tables = ['learning_paths', 'learning_path_courses', 'learning_path_assignments', 'user_roles', 'courses', 'profiles', 'groups'];
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.error(`❌ Table '${table}' not found or not accessible:`, error.message);
      } else {
        console.log(`✅ Table '${table}' exists`);
      }
    }

    console.log('\n📝 Functions to be created:');
    console.log('   - create_full_learning_path(): Create learning paths with courses atomically');
    console.log('   - update_full_learning_path(): Update learning paths and courses atomically');
    console.log('   - batch_assign_learning_path(): Assign paths to multiple users/groups atomically');

    console.log('\n🎯 Once applied, these functions will ensure:');
    console.log('   - All operations are atomic (succeed or fail together)');
    console.log('   - Proper permission checks');
    console.log('   - Data validation');
    console.log('   - Clean error handling');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
applyFunctions();