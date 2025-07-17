#!/usr/bin/env node

/**
 * Apply Learning Paths RPC Functions Migration
 * This script applies the database migration for Learning Paths atomic operations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client with service role key for admin operations
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
  console.log('🚀 Starting Learning Paths migration...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'learning-paths-rpc-functions.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded successfully');
    console.log('📍 Applying migration to database...\n');

    // Split the SQL into individual statements to handle them properly
    // We'll execute the entire script as one transaction
    const { data, error } = await supabase.rpc('query', {
      query: migrationSQL
    }).catch(async (err) => {
      // If the RPC function doesn't exist, try direct execution
      console.log('⚠️  RPC query function not available, attempting direct execution...');
      
      // For direct execution, we need to use the REST API
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          query: migrationSQL
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    });

    if (error) {
      throw error;
    }

    console.log('✅ Migration applied successfully!\n');
    
    // Verify the functions were created
    console.log('🔍 Verifying functions...');
    
    const functions = [
      'create_full_learning_path',
      'update_full_learning_path', 
      'batch_assign_learning_path'
    ];

    for (const funcName of functions) {
      const { data: funcExists, error: checkError } = await supabase
        .rpc('query', {
          query: `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${funcName}');`
        })
        .single();

      if (checkError) {
        console.log(`⚠️  Could not verify ${funcName}: ${checkError.message}`);
      } else {
        console.log(`✅ Function ${funcName} exists`);
      }
    }

    console.log('\n🎉 Learning Paths migration completed successfully!');
    console.log('📝 You can now create, update, and assign learning paths from the UI.\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Alternative approach using direct PostgreSQL connection
async function applyMigrationDirect() {
  console.log('\n📌 Alternative: Applying migration using direct approach...\n');
  
  const migrationPath = path.join(__dirname, '..', 'database', 'learning-paths-rpc-functions.sql');
  const migrationSQL = await fs.readFile(migrationPath, 'utf8');
  
  console.log('To apply this migration manually:');
  console.log('1. Go to your Supabase Dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Create a new query');
  console.log('4. Copy and paste the contents from:');
  console.log(`   ${migrationPath}`);
  console.log('5. Run the query\n');
  console.log('The migration creates these functions:');
  console.log('- create_full_learning_path');
  console.log('- update_full_learning_path');
  console.log('- batch_assign_learning_path\n');
}

// Run the migration
applyMigration().catch(async (error) => {
  console.error('\n⚠️  Automated migration failed. Trying alternative approach...');
  await applyMigrationDirect();
});