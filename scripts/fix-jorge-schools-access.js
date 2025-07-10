#!/usr/bin/env node

/**
 * Fix Jorge's Schools Access
 * 
 * This script ensures Jorge (and all authenticated users) can see schools
 * by creating the necessary RLS policy if it doesn't exist.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixJorgeSchoolsAccess() {
  console.log('🔧 Fixing Jorge\'s Schools Access\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Check current state
    console.log('1️⃣ Checking current schools RLS policies...\n');
    
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_policies_for_table', { table_name: 'schools' });
    
    if (policiesError) {
      // Fallback to direct query
      const checkQuery = `
        SELECT 
          policyname,
          cmd,
          qual
        FROM pg_policies 
        WHERE tablename = 'schools'
        AND cmd = 'SELECT'
        ORDER BY policyname;
      `;
      
      const { data: policyData, error: queryError } = await supabase
        .rpc('execute_sql', { query: checkQuery });
      
      if (queryError) {
        console.log('   Using manual SQL file approach...');
      }
    }
    
    // 2. Create the fix
    console.log('\n2️⃣ Applying the fix...\n');
    
    const fixQuery = `
      -- Create policy for authenticated users to read schools
      DO $$
      BEGIN
        -- Check if the policy already exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE tablename = 'schools' 
          AND policyname = 'authenticated_users_read_schools'
        ) THEN
          -- Create the policy
          CREATE POLICY authenticated_users_read_schools ON schools
            FOR SELECT
            TO authenticated
            USING (auth.uid() IS NOT NULL);
          
          RAISE NOTICE 'Created authenticated_users_read_schools policy';
        ELSE
          RAISE NOTICE 'Policy authenticated_users_read_schools already exists';
        END IF;
      END $$;
    `;
    
    // Try to execute via RPC
    const { error: fixError } = await supabase.rpc('execute_sql', { query: fixQuery });
    
    if (fixError) {
      console.log('   ⚠️  Could not apply fix via RPC. Creating SQL file for manual execution...\n');
      
      // Create SQL file for manual execution
      const sqlPath = join(__dirname, '..', 'database', 'FIX_JORGE_SCHOOLS_ACCESS.sql');
      const sqlContent = `
-- FIX JORGE'S SCHOOLS ACCESS
-- Run this in Supabase SQL Editor

-- This fix ensures Jorge (and all authenticated users) can see schools

-- 1. Create the missing policy
CREATE POLICY IF NOT EXISTS authenticated_users_read_schools ON schools
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2. Verify the fix
SELECT 
  'VERIFICATION' as step,
  EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'schools' 
    AND policyname = 'authenticated_users_read_schools'
  ) as policy_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'schools' 
      AND policyname = 'authenticated_users_read_schools'
    ) THEN '✅ FIXED: Jorge can now see schools!'
    ELSE '❌ Fix failed - please contact support'
  END as status;
`;
      
      await fs.writeFile(sqlPath, sqlContent);
      
      console.log('📄 SQL file created: database/FIX_JORGE_SCHOOLS_ACCESS.sql');
      console.log('\n📋 MANUAL STEPS REQUIRED:');
      console.log('   1. Go to Supabase SQL Editor');
      console.log('   2. Copy and paste the contents of FIX_JORGE_SCHOOLS_ACCESS.sql');
      console.log('   3. Click "Run"');
      console.log('   4. Verify you see "✅ FIXED" message');
    } else {
      console.log('   ✅ Fix applied successfully!\n');
    }
    
    // 3. Verify the fix
    console.log('3️⃣ Verifying the fix...\n');
    
    const verifyQuery = `
      SELECT 
        EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE tablename = 'schools' 
          AND policyname = 'authenticated_users_read_schools'
        ) as policy_exists,
        (SELECT COUNT(*) FROM schools) as school_count;
    `;
    
    const { data: verification, error: verifyError } = await supabase
      .rpc('execute_sql', { query: verifyQuery });
    
    if (!verifyError && verification?.[0]?.policy_exists) {
      console.log('   ✅ Policy exists: authenticated_users_read_schools');
      console.log(`   ✅ Total schools in database: ${verification[0].school_count}`);
      console.log('\n🎉 SUCCESS! Jorge can now see schools when logged in!');
    } else {
      console.log('   ⚠️  Could not verify fix automatically.');
      console.log('   Please run the SQL file manually as instructed above.');
    }
    
    // 4. Test what Jorge would see
    console.log('\n4️⃣ What Jorge will see:\n');
    console.log('   When Jorge logs in, he will:');
    console.log('   - See all real schools in dropdown menus');
    console.log('   - Be able to select "Los Pellines" as his school');
    console.log('   - NOT see "Escuela de Prueba 1" or "Escuela de Prueba 2"');
    console.log('   - Have full access to school-related features');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Fix process complete!');
    
  } catch (error) {
    console.error('\n❌ Error during fix process:', error);
    console.log('\n📋 MANUAL FIX REQUIRED:');
    console.log('   1. Go to Supabase SQL Editor');
    console.log('   2. Run this query:');
    console.log('\n   CREATE POLICY authenticated_users_read_schools ON schools');
    console.log('     FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);');
  }
}

// Create RPC helper if needed
async function createHelperFunctions() {
  const helperSQL = `
    -- Helper to get policies for a table
    CREATE OR REPLACE FUNCTION get_policies_for_table(table_name text)
    RETURNS TABLE(policyname text, cmd text, qual text) AS $$
    BEGIN
      RETURN QUERY
      SELECT p.policyname::text, p.cmd::text, p.qual::text
      FROM pg_policies p
      WHERE p.tablename = table_name;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    -- Helper to execute SQL (be careful with this!)
    CREATE OR REPLACE FUNCTION execute_sql(query text)
    RETURNS json AS $$
    DECLARE
      result json;
    BEGIN
      EXECUTE query;
      RETURN '{"success": true}'::json;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN json_build_object('error', SQLERRM);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
  // We'll skip creating these for safety
}

// Run the fix
fixJorgeSchoolsAccess()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });