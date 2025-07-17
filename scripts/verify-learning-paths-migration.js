#!/usr/bin/env node

/**
 * Verify Learning Paths Migration
 * Run this after applying the migration to confirm it worked
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyMigration() {
  console.log('🔍 Verifying Learning Paths migration...\n');

  const functions = [
    'create_full_learning_path',
    'update_full_learning_path', 
    'batch_assign_learning_path'
  ];

  let allGood = true;

  for (const funcName of functions) {
    try {
      // Try to get function info from pg_proc
      const { data, error } = await supabase
        .from('pg_proc')
        .select('proname')
        .eq('proname', funcName)
        .single();

      if (error) {
        console.log(`❌ Function ${funcName} NOT FOUND`);
        allGood = false;
      } else {
        console.log(`✅ Function ${funcName} exists`);
      }
    } catch (err) {
      console.log(`❌ Function ${funcName} check failed:`, err.message);
      allGood = false;
    }
  }

  console.log('\n' + (allGood ? '🎉 All functions verified successfully!' : '⚠️  Some functions are missing'));
  
  if (!allGood) {
    console.log('\nPlease apply the migration from:');
    console.log('/Users/brentcurtis76/Desktop/learning-paths-migration.sql');
  }
}

verifyMigration();