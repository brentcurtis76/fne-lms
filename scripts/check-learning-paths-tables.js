#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTables() {
  console.log('🔍 Checking Learning Paths Tables...\n');

  const tablesToCheck = [
    'learning_paths',
    'learning_path_courses',
    'learning_path_assignments'
  ];

  for (const table of tablesToCheck) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(0); // Just check if table exists

    if (error) {
      console.log(`❌ ${table}: NOT FOUND or ERROR - ${error.message}`);
    } else {
      console.log(`✅ ${table}: EXISTS`);
      
      // Get column info
      const { data: columns, error: colError } = await supabase
        .rpc('get_table_columns', { table_name: table })
        .select('*');
        
      if (!colError && columns) {
        console.log(`   Columns: ${columns.map(c => c.column_name).join(', ')}`);
      }
    }
  }
  
  // Check if we can see columns directly
  console.log('\n📋 Checking learning_path_courses structure...');
  const { data: structure, error: structError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'learning_path_courses');
    
  if (!structError && structure) {
    console.log('Columns found:');
    structure.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
  } else {
    console.log('Could not query column information:', structError?.message);
  }
}

checkTables().catch(console.error);