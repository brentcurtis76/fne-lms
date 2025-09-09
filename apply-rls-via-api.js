const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.staging' });
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ID from URL
const projectId = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

const logDir = 'logs/mcp/20250904/rls-tests';
const logFile = path.join(logDir, '00-user_roles-fix.log');

const log = (message) => {
  console.log(message);
  fs.appendFileSync(logFile, message + '\n');
};

async function executeSQLViaAPI(sql, description) {
  log(`\n=== ${description} ===`);
  log(`Executing: ${sql.substring(0, 100)}...`);
  
  try {
    // Try using the Supabase query endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        query: sql
      })
    });
    
    if (response.ok) {
      log(`✅ Success`);
      return true;
    } else {
      log(`❌ Failed with status: ${response.status}`);
      const error = await response.text();
      log(`Error: ${error}`);
      return false;
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`);
    return false;
  }
}

async function applyRLSViaSupabaseClient() {
  log('\n=== ATTEMPTING TO APPLY RLS VIA SUPABASE CLIENT ===');
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  });
  
  // First, let's check current table status
  log('\nChecking current table accessibility...');
  
  // Test with anon client first
  const supabaseAnon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('user_roles')
    .select('*')
    .limit(1);
  
  if (!anonError && anonData) {
    log(`⚠️ CONFIRMED: Anonymous can still access user_roles (${anonData.length} rows returned)`);
    
    // Since we cannot directly execute ALTER TABLE commands via API,
    // we need to create a migration file for manual execution
    
    const migrationSQL = `
-- ============================================================
-- EMERGENCY RLS LOCKDOWN FOR user_roles TABLE
-- Project: ${projectId} (STAGING)
-- Generated: ${new Date().toISOString()}
-- ============================================================

BEGIN;

-- Check current RLS status
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_roles';

-- Step 1: Drop any existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.user_roles;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.user_roles;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Service role has full access" ON public.user_roles;

-- Step 2: Revoke permissions
REVOKE ALL PRIVILEGES ON public.user_roles FROM anon;
REVOKE ALL PRIVILEGES ON public.user_roles FROM authenticated;
REVOKE SELECT ON public.user_roles FROM public;

-- Step 3: Enable and force RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

-- Step 4: Grant minimal permissions
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Step 5: Create restrictive policies
-- Policy 1: Users can only see their own roles
CREATE POLICY "read_own_roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Policy 2: Service role bypass
CREATE POLICY "service_role_all" 
ON public.user_roles 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- Verify the changes
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  using,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'user_roles'
ORDER BY policyname;

COMMIT;

-- Test queries to verify lockdown
-- Should return 0 rows when run as anonymous:
-- SELECT COUNT(*) FROM public.user_roles;
`;
    
    // Save migration file
    const migrationFile = path.join(logDir, 'emergency-migration.sql');
    fs.writeFileSync(migrationFile, migrationSQL);
    
    log(`\n✅ Migration SQL generated and saved to:`);
    log(`   ${migrationFile}`);
    
    log('\n' + '='.repeat(70));
    log('⚠️  MANUAL ACTION REQUIRED - APPLY IN SUPABASE DASHBOARD');
    log('='.repeat(70));
    log('\nSTEPS TO APPLY:');
    log('1. Go to: https://supabase.com/dashboard/project/' + projectId);
    log('2. Navigate to: SQL Editor');
    log('3. Create new query');
    log('4. Copy and paste contents from: ' + migrationFile);
    log('5. Click "Run" to execute');
    log('6. Verify success messages');
    log('7. Run verification: node apply-rls-via-api.js --verify');
    
    return migrationSQL;
  } else {
    log('✅ Anonymous access might already be restricted');
    log(`Error/Empty: ${anonError?.message || 'No data returned'}`);
  }
}

async function verifyLockdown() {
  log('\n=== VERIFICATION: POST-LOCKDOWN STATUS ===');
  
  const tests = [];
  
  // Test 1: Anonymous access via HTTP
  log('\n--- Test 1: Anonymous HTTP Access ---');
  const httpResponse = await fetch(`${supabaseUrl}/rest/v1/user_roles?select=*&limit=1`, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    }
  });
  
  const httpData = await httpResponse.json();
  
  if (httpResponse.status === 401 || httpResponse.status === 403) {
    log(`✅ Anonymous HTTP: BLOCKED (${httpResponse.status})`);
    tests.push('Anonymous HTTP: ✅ BLOCKED');
  } else if (Array.isArray(httpData) && httpData.length === 0) {
    log(`✅ Anonymous HTTP: Empty result (properly filtered)`);
    tests.push('Anonymous HTTP: ✅ Empty (filtered)');
  } else {
    log(`❌ Anonymous HTTP: Still accessible! Status ${httpResponse.status}, ${httpData.length} rows`);
    tests.push(`Anonymous HTTP: ❌ ACCESSIBLE (${httpData.length} rows)`);
  }
  
  // Test 2: Service role access
  log('\n--- Test 2: Service Role Access ---');
  const { createClient } = require('@supabase/supabase-js');
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
  
  const { count: serviceCount, error: serviceError } = await supabaseService
    .from('user_roles')
    .select('*', { count: 'exact', head: true });
  
  if (!serviceError && serviceCount > 0) {
    log(`✅ Service role: Can access (${serviceCount} rows)`);
    tests.push(`Service role: ✅ Full access (${serviceCount} rows)`);
  } else {
    log(`⚠️ Service role issue: ${serviceError?.message || 'No access'}`);
    tests.push(`Service role: ⚠️ ${serviceError?.message || 'No access'}`);
  }
  
  // Summary
  log('\n' + '='.repeat(50));
  log('VERIFICATION SUMMARY:');
  tests.forEach(test => log(`  - ${test}`));
  log('='.repeat(50));
  
  // Save verification results
  const verifyLog = tests.join('\n') + '\n\nTimestamp: ' + new Date().toISOString();
  fs.writeFileSync(path.join(logDir, '18-anonymous-http-verified.log'), verifyLog);
  
  return tests;
}

async function main() {
  log('=== RLS EMERGENCY LOCKDOWN SCRIPT ===');
  log(`Target: ${supabaseUrl} (${projectId})`);
  log(`Time: ${new Date().toISOString()}`);
  
  if (process.argv.includes('--verify')) {
    await verifyLockdown();
  } else {
    await applyRLSViaSupabaseClient();
  }
  
  log('\n✅ Complete. Logs saved to: ' + logDir);
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`);
  console.error(error);
});