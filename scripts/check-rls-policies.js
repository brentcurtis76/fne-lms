import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRLSPolicies() {
  try {
    console.log('=== Checking for RLS policies with legacy profiles.role references ===\n');

    // Query 1: Tables with RLS enabled
    console.log('1. Tables with Row Level Security enabled:');
    console.log('==========================================\n');
    
    const { data: rlsTables, error: rlsError } = await supabase.rpc('query_database', {
      query_text: `
        SELECT schemaname, tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND rowsecurity = true
        ORDER BY tablename;
      `
    });

    if (rlsError) {
      console.error('Error fetching RLS tables:', rlsError);
    } else {
      console.log(`Found ${rlsTables.length} tables with RLS enabled\n`);
      rlsTables.forEach(table => {
        console.log(`  - ${table.tablename}`);
      });
    }

    // Query 2: Policies with legacy references
    console.log('\n\n2. Policies with legacy profiles.role references:');
    console.log('================================================\n');
    
    const { data: legacyPolicies, error: policyError } = await supabase.rpc('query_database', {
      query_text: `
        SELECT 
            schemaname,
            tablename, 
            policyname,
            permissive,
            roles,
            cmd,
            qual,
            with_check
        FROM pg_policies 
        WHERE schemaname = 'public'
        AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%')
        ORDER BY tablename, policyname;
      `
    });

    if (policyError) {
      console.error('Error fetching policies:', policyError);
    } else {
      if (legacyPolicies.length === 0) {
        console.log('✅ No policies found with legacy profiles.role references!');
      } else {
        console.log(`⚠️  Found ${legacyPolicies.length} policies with legacy references:\n`);
        
        legacyPolicies.forEach(policy => {
          console.log(`Table: ${policy.tablename}`);
          console.log(`Policy: ${policy.policyname}`);
          console.log(`Command: ${policy.cmd}`);
          console.log(`Roles: ${policy.roles}`);
          
          if (policy.qual && policy.qual.includes('profiles.role')) {
            console.log(`QUAL contains legacy reference:`);
            console.log(`  ${policy.qual}`);
          }
          
          if (policy.with_check && policy.with_check.includes('profiles.role')) {
            console.log(`WITH CHECK contains legacy reference:`);
            console.log(`  ${policy.with_check}`);
          }
          
          console.log('---\n');
        });
      }
    }

    // Additional check for functions that might reference profiles.role
    console.log('\n3. Checking functions for legacy references:');
    console.log('==========================================\n');
    
    const { data: functions, error: funcError } = await supabase.rpc('query_database', {
      query_text: `
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_functiondef(p.oid) as function_definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND pg_get_functiondef(p.oid) LIKE '%profiles.role%'
        ORDER BY p.proname;
      `
    });

    if (funcError) {
      console.error('Error fetching functions:', funcError);
    } else {
      if (functions.length === 0) {
        console.log('✅ No functions found with legacy profiles.role references!');
      } else {
        console.log(`⚠️  Found ${functions.length} functions with legacy references:\n`);
        functions.forEach(func => {
          console.log(`Function: ${func.function_name}`);
          console.log('---\n');
        });
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the check
checkRLSPolicies().then(() => {
  console.log('\n✓ RLS policy check complete');
  process.exit(0);
}).catch(error => {
  console.error('Failed to complete check:', error);
  process.exit(1);
});