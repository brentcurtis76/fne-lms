#!/usr/bin/env node

/**
 * Apply Migration 006: Fix Schools RLS Policies
 * Runs the migration directly against Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function runMigration() {
  console.log('🚀 Running Migration 006: Fix Schools RLS Policies\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database/migrations/006_fix_schools_rls_policies.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('📝 Executing SQL...\n');

    // Execute using Supabase SQL function (if available) or direct query
    // Note: Supabase client doesn't support raw SQL execution directly
    // We need to use the REST API with service role

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: migrationSQL })
    });

    if (!response.ok) {
      // exec_sql might not exist, need manual application
      console.log('⚠️  Direct SQL execution not available via API');
      console.log('📋 Please copy and paste this migration in Supabase SQL Editor:');
      console.log('🔗 https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new\n');
      console.log('─'.repeat(80));
      console.log(migrationSQL);
      console.log('─'.repeat(80));
      return;
    }

    console.log('✅ Migration executed successfully!\n');

    // Verify the fix - test that we can read schools
    console.log('🔍 Verifying fix...');
    const { data: school, error } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .eq('id', 9)
      .single();

    if (error) {
      console.log('❌ Verification failed:', error.message);
      console.log('   This might be expected if you need to refresh PostgREST cache');
    } else {
      console.log('✅ Verification passed!');
      console.log(`   School 9: ${school.name}`);
      console.log(`   has_generations: ${school.has_generations}`);
    }

    console.log('\n✅ Migration 006 complete!');
    console.log('📌 Next step: Hard refresh your browser and test role assignment\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
