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

async function verifyFunctions() {
  console.log('🔍 Verifying Learning Paths RPC Functions...\n');

  const functionsToCheck = [
    'create_full_learning_path',
    'update_full_learning_path', 
    'batch_assign_learning_path'
  ];

  let allFunctionsExist = true;

  for (const funcName of functionsToCheck) {
    const { data, error } = await supabase
      .rpc('pg_get_functiondef', {
        funcoid: `public.${funcName}::regproc`
      })
      .single();

    if (error) {
      console.log(`❌ ${funcName}: NOT FOUND`);
      allFunctionsExist = false;
    } else {
      console.log(`✅ ${funcName}: EXISTS`);
    }
  }

  console.log('\n' + '='.repeat(50));
  
  if (allFunctionsExist) {
    console.log('✅ All Learning Paths RPC functions are present!');
    console.log('You should now be able to create learning paths.');
  } else {
    console.log('❌ Some functions are missing!');
    console.log('\nTo fix this:');
    console.log('1. Go to https://app.supabase.com');
    console.log('2. Select your project');
    console.log('3. Go to SQL Editor');
    console.log('4. Copy the SQL from: /database/create-learning-paths-rpc-functions.sql');
    console.log('5. Paste and run it');
  }
}

verifyFunctions().catch(console.error);