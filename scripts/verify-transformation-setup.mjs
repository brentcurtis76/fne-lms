#!/usr/bin/env node
/**
 * Verify Transformation Setup
 * Checks if database tables exist and rubric data is imported
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Verifying Transformation Setup...\n');

// Check 1: Verify tables exist
console.log('📋 Step 1: Checking database tables...');
const { data: tables, error: tablesError } = await supabase
  .from('information_schema.tables')
  .select('table_name')
  .like('table_name', 'transformation%');

if (tablesError) {
  console.error('❌ Could not query tables:', tablesError.message);
  console.log('💡 Trying alternative method...\n');

  // Try querying each table directly
  const tablesToCheck = [
    'transformation_rubric',
    'transformation_assessments',
    'transformation_results',
    'transformation_conversation_messages',
    'transformation_llm_usage'
  ];

  for (const table of tablesToCheck) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        console.log(`❌ Table does not exist: ${table}`);
      } else {
        console.log(`⚠️  Table exists but error: ${table} - ${error.message}`);
      }
    } else {
      console.log(`✅ Table exists: ${table}`);
    }
  }
} else {
  console.log(`✅ Found ${tables?.length || 0} transformation tables`);
  tables?.forEach(t => console.log(`   - ${t.table_name}`));
}

console.log('\n📊 Step 2: Checking rubric data...');
const { data: rubricCount, error: rubricError } = await supabase
  .from('transformation_rubric')
  .select('id', { count: 'exact', head: true })
  .eq('area', 'personalizacion');

if (rubricError) {
  if (rubricError.code === '42P01') {
    console.log('❌ transformation_rubric table does not exist');
    console.log('   → Need to apply database migrations');
  } else {
    console.log('❌ Error querying rubric:', rubricError.message);
  }
} else {
  const count = rubricCount;
  if (count === 0) {
    console.log('⚠️  transformation_rubric table exists but is EMPTY');
    console.log('   → Need to import rubric data');
  } else {
    console.log(`✅ Found ${count} rubric items for Personalización`);
  }
}

console.log('\n🏘️  Step 3: Checking communities with transformation enabled...');
const { data: communities, error: commError } = await supabase
  .from('growth_communities')
  .select('id, name, transformation_enabled')
  .eq('transformation_enabled', true);

if (commError) {
  console.log('❌ Error querying communities:', commError.message);
} else {
  if (communities.length === 0) {
    console.log('⚠️  No communities have transformation_enabled = true');
    console.log('   → Need to enable feature flag for test community');
  } else {
    console.log(`✅ Found ${communities.length} enabled communities:`);
    communities.forEach(c => console.log(`   - ${c.name} (${c.id})`));
  }
}

console.log('\n📝 Summary:');
console.log('─'.repeat(60));

// Generate summary
let allGood = true;
const issues = [];

if (rubricError?.code === '42P01') {
  allGood = false;
  issues.push('❌ Database tables not created - apply migrations');
} else if (rubricCount === 0) {
  allGood = false;
  issues.push('⚠️  Rubric data not imported - run import script');
}

if (!communities || communities.length === 0) {
  allGood = false;
  issues.push('⚠️  No enabled communities - enable feature flag');
}

if (allGood) {
  console.log('✅ All systems ready! You can start development.');
} else {
  console.log('⚠️  Setup incomplete. Issues to resolve:');
  issues.forEach(issue => console.log(`   ${issue}`));
}

console.log('─'.repeat(60));
