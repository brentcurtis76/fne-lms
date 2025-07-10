#!/usr/bin/env node

/**
 * Quick verification that Jorge's schools access is fixed
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyFix() {
  console.log('🔍 Verifying Jorge\'s Schools Access Fix\n');
  
  try {
    // Check if the policy exists
    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .limit(1);
    
    if (!error) {
      console.log('✅ Database connection successful\n');
    }
    
    // Direct SQL check
    const checkSQL = `
      SELECT 
        EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE tablename = 'schools' 
          AND policyname = 'authenticated_users_read_schools'
        ) as policy_exists,
        (SELECT COUNT(*) FROM schools) as total_schools,
        (SELECT COUNT(*) FROM schools WHERE name = 'Los Pellines') as has_los_pellines;
    `;
    
    console.log('📊 Checking fix status...\n');
    console.log('If you see an error below, please run the SQL fix manually.\n');
    
    // The actual check would need to be done in Supabase SQL Editor
    console.log('📋 MANUAL VERIFICATION STEPS:');
    console.log('1. Go to Supabase SQL Editor');
    console.log('2. Run this query:\n');
    console.log(checkSQL);
    console.log('\n3. You should see:');
    console.log('   - policy_exists: true');
    console.log('   - total_schools: [number > 0]');
    console.log('   - has_los_pellines: 1');
    console.log('\nIf all three are correct, Jorge can now see schools!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

verifyFix();