#!/usr/bin/env node

/**
 * Script to create indexes using Supabase service role client
 * This avoids needing direct database credentials
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const indexes = [
  {
    name: 'idx_user_roles_school_active',
    sql: `CREATE INDEX CONCURRENTLY idx_user_roles_school_active 
          ON user_roles(school_id, is_active) 
          WHERE is_active = true`
  },
  {
    name: 'idx_user_roles_community_active',
    sql: `CREATE INDEX CONCURRENTLY idx_user_roles_community_active 
          ON user_roles(community_id, is_active) 
          WHERE community_id IS NOT NULL AND is_active = true`
  },
  {
    name: 'idx_user_roles_user_school_active',
    sql: `CREATE INDEX CONCURRENTLY idx_user_roles_user_school_active 
          ON user_roles(user_id, school_id, is_active) 
          WHERE is_active = true`
  },
  {
    name: 'idx_cw_community_id',
    sql: `CREATE INDEX CONCURRENTLY idx_cw_community_id 
          ON community_workspaces(community_id)`
  },
  {
    name: 'idx_cw_name_trgm',
    sql: `CREATE INDEX CONCURRENTLY idx_cw_name_trgm 
          ON community_workspaces USING gin(name gin_trgm_ops)`
  },
  {
    name: 'idx_lpa_path_user',
    sql: `CREATE INDEX CONCURRENTLY idx_lpa_path_user 
          ON learning_path_assignments(path_id, user_id) 
          WHERE user_id IS NOT NULL`
  },
  {
    name: 'idx_lpa_path_group',
    sql: `CREATE INDEX CONCURRENTLY idx_lpa_path_group 
          ON learning_path_assignments(path_id, group_id) 
          WHERE group_id IS NOT NULL`
  },
  {
    name: 'idx_lpa_path_id_counts',
    sql: `CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts 
          ON learning_path_assignments(path_id) 
          INCLUDE (user_id, group_id)`
  },
  {
    name: 'idx_profiles_first_name_trgm',
    sql: `CREATE INDEX CONCURRENTLY idx_profiles_first_name_trgm 
          ON profiles USING gin(first_name gin_trgm_ops)`
  },
  {
    name: 'idx_profiles_last_name_trgm',
    sql: `CREATE INDEX CONCURRENTLY idx_profiles_last_name_trgm 
          ON profiles USING gin(last_name gin_trgm_ops)`
  },
  {
    name: 'idx_profiles_email_trgm',
    sql: `CREATE INDEX CONCURRENTLY idx_profiles_email_trgm 
          ON profiles USING gin(email gin_trgm_ops)`
  }
];

async function createIndexes() {
  console.log('Learning Path Search Indexes Creation');
  console.log('=====================================\n');

  // First enable pg_trgm extension
  console.log('Enabling pg_trgm extension...');
  try {
    const { error: extError } = await supabase.rpc('exec_sql', {
      sql: 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
    });
    if (extError) console.log('Extension may already exist');
  } catch (err) {
    console.log('Note: exec_sql RPC not available, trying direct approach...');
  }

  console.log('\nChecking existing indexes...');
  
  // Check which indexes exist
  const { data: existingIndexes } = await supabase
    .from('pg_indexes')
    .select('indexname')
    .in('indexname', indexes.map(i => i.name));

  const existingNames = new Set((existingIndexes || []).map(i => i.indexname));
  
  console.log(`Found ${existingNames.size} existing indexes\n`);

  // Create each index
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const index of indexes) {
    process.stdout.write(`Creating ${index.name}... `);
    
    if (existingNames.has(index.name)) {
      console.log('SKIPPED (already exists)');
      skipped++;
      continue;
    }

    try {
      // Note: Supabase doesn't expose direct SQL execution via client library
      // We'll need to use the Database API or run these manually
      console.log('MANUAL (run in Supabase SQL Editor)');
      console.log(`  SQL: ${index.sql.replace(/\s+/g, ' ')}`);
      created++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=====================================');
  console.log(`Summary: ${created} to create, ${skipped} skipped, ${failed} failed`);
  console.log('\nNOTE: Since Supabase client doesn\'t support direct DDL,');
  console.log('please run the SQL commands shown above in the Supabase SQL Editor.');
  console.log('\nOr use the Supabase CLI with proper database credentials.');
}

createIndexes().catch(console.error);