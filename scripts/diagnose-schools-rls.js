/**
 * Diagnose schools table RLS issues
 * Run with: node scripts/diagnose-schools-rls.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create two clients - one with service role (bypasses RLS) and one with anon key (respects RLS)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

async function diagnoseRLS() {
  console.log('🔍 Diagnosing schools table RLS...\n');
  
  // 1. Check if RLS is enabled
  console.log('1️⃣ Checking if RLS is enabled on schools table:');
  const { data: rlsStatus, error: rlsError } = await supabaseAdmin.rpc('query', {
    sql: `SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'schools'`
  });
  
  if (rlsError) {
    console.error('❌ Error checking RLS status:', rlsError.message);
  } else {
    console.table(rlsStatus);
    const isEnabled = rlsStatus[0]?.relrowsecurity;
    console.log(isEnabled ? '✅ RLS is ENABLED' : '❌ RLS is DISABLED');
  }
  
  // 2. Check current policies
  console.log('\n2️⃣ Current RLS policies on schools table:');
  const { data: policies, error: policyError } = await supabaseAdmin.rpc('query', {
    sql: `
      SELECT 
        policyname,
        permissive,
        cmd,
        qual
      FROM pg_policies 
      WHERE tablename = 'schools'
      ORDER BY policyname
    `
  });
  
  if (policyError) {
    console.error('❌ Error checking policies:', policyError.message);
  } else {
    if (policies.length === 0) {
      console.log('⚠️  No policies found!');
    } else {
      console.table(policies);
      
      // Check if policies use old profiles.role
      const oldRolePolicies = policies.filter(p => p.qual && p.qual.includes('profiles.role'));
      if (oldRolePolicies.length > 0) {
        console.log('\n⚠️  WARNING: Found policies using old profiles.role column:');
        oldRolePolicies.forEach(p => console.log(`   - ${p.policyname}`));
      }
    }
  }
  
  // 3. Test read access with service role (bypasses RLS)
  console.log('\n3️⃣ Testing read access with service role (bypasses RLS):');
  const { data: adminSchools, error: adminError } = await supabaseAdmin
    .from('schools')
    .select('id, name')
    .limit(3);
  
  if (adminError) {
    console.error('❌ Error with admin read:', adminError.message);
  } else {
    console.log(`✅ Admin can read ${adminSchools.length} schools`);
    if (adminSchools.length > 0) {
      console.table(adminSchools);
    }
  }
  
  // 4. Test read access with anon key (respects RLS)
  console.log('\n4️⃣ Testing read access with anon key (respects RLS):');
  const { data: anonSchools, error: anonError } = await supabaseAnon
    .from('schools')
    .select('id, name')
    .limit(3);
  
  if (anonError) {
    console.error('❌ Error with anon read:', anonError.message);
    console.log('   This suggests RLS policies are blocking access');
  } else {
    console.log(`✅ Anon can read ${anonSchools.length} schools`);
    if (anonSchools.length > 0) {
      console.table(anonSchools);
    }
  }
  
  // 5. Check if profiles table still has role column
  console.log('\n5️⃣ Checking profiles table structure:');
  const { data: profileCols, error: colError } = await supabaseAdmin.rpc('query', {
    sql: `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      AND column_name = 'role'
    `
  });
  
  if (colError) {
    console.error('❌ Error checking columns:', colError.message);
  } else {
    if (profileCols.length === 0) {
      console.log('✅ profiles.role column does NOT exist (as expected after migration)');
    } else {
      console.log('⚠️  profiles.role column still exists:', profileCols[0]);
    }
  }
  
  // 6. Check user_roles table
  console.log('\n6️⃣ Checking user_roles table (new role system):');
  const { data: sampleRoles, error: roleError } = await supabaseAdmin.rpc('query', {
    sql: `
      SELECT COUNT(*) as total_roles,
             COUNT(DISTINCT user_id) as unique_users,
             COUNT(CASE WHEN role_type = 'admin' THEN 1 END) as admin_count
      FROM user_roles
    `
  });
  
  if (roleError) {
    console.error('❌ Error checking user_roles:', roleError.message);
  } else {
    console.table(sampleRoles);
  }
  
  console.log('\n📋 DIAGNOSIS SUMMARY:');
  console.log('If users cannot read schools data, it\'s likely because:');
  console.log('1. RLS policies are using the old profiles.role column');
  console.log('2. The system has migrated to user_roles.role_type');
  console.log('3. Run: node scripts/apply-schools-rls-fix.js to fix this issue');
}

// Run diagnosis
diagnoseRLS();