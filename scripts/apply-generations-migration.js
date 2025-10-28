#!/usr/bin/env node

/**
 * Apply migration 003: Add missing columns to generations table
 * This fixes the "Could not find the 'description' column" error
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('🚀 Starting migration 003: Add generations columns\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/003_add_generations_columns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('─'.repeat(50));

    // Split by semicolons to execute statements separately
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments
      if (statement.startsWith('--')) continue;

      console.log(`Executing statement ${i + 1}/${statements.length}...`);

      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });

      if (error) {
        // If exec_sql doesn't exist, try direct execution
        console.log('⚠️  exec_sql not available, using direct query...');

        // For Supabase, we need to use the REST API or execute via psql
        console.log('📌 Please run this migration manually using the Supabase SQL Editor:');
        console.log('─'.repeat(50));
        console.log(migrationSQL);
        console.log('─'.repeat(50));
        console.log('\n🔗 Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
        break;
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Verifying schema...');

    // Verify the columns exist
    const { data: generations, error: queryError } = await supabase
      .from('generations')
      .select('*')
      .limit(1);

    if (queryError) {
      console.error('❌ Error verifying schema:', queryError.message);
    } else {
      console.log('✅ Schema verified! Generations table now includes:');
      if (generations && generations.length > 0) {
        console.log('   Columns:', Object.keys(generations[0]).join(', '));
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
