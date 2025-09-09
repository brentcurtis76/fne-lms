const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.staging' });
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const logDir = 'logs/mcp/20250904/rls-tests';
const logFile = path.join(logDir, '00-user_roles-fix.log');

const log = (message) => {
  console.log(message);
  fs.appendFileSync(logFile, message + '\n');
};

async function executeSQL(sql, description) {
  log(`\n=== ${description} ===`);
  log(`SQL: ${sql}`);
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Use the Supabase SQL editor endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    
    if (!response.ok) {
      // Try alternative approach via direct database manipulation
      log(`Note: Direct SQL execution not available via RPC, attempting via migrations...`);
      return false;
    }
    
    const result = await response.json();
    log(`Result: ${JSON.stringify(result)}`);
    return true;
  } catch (error) {
    log(`Error: ${error.message}`);
    return false;
  }
}

async function applyEmergencyLockdown() {
  log('=== EMERGENCY USER_ROLES LOCKDOWN - STAGING ONLY ===');
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Target: ${supabaseUrl}`);
  log('');
  
  // Since we can't execute raw SQL directly, we'll need to use Supabase Dashboard
  // But we can document the SQL that needs to be run
  
  const lockdownSQL = `
-- EMERGENCY LOCKDOWN SQL FOR user_roles TABLE
-- Execute these commands in Supabase Dashboard SQL Editor for STAGING project

-- Step 1: Revoke all permissions from public roles
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.user_roles FROM authenticated;
REVOKE ALL ON public.user_roles FROM public;

-- Step 2: Enable RLS on user_roles table
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 3: Force RLS for all roles (including table owner)
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

-- Step 4: Grant basic permissions back to authenticated users only
GRANT SELECT ON public.user_roles TO authenticated;

-- Step 5: Create policy for users to read their own roles
CREATE POLICY "Users can read their own roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- Step 6: Create policy for service role bypass (optional, for admin operations)
CREATE POLICY "Service role has full access" 
ON public.user_roles 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);
`;
  
  log('=== LOCKDOWN SQL COMMANDS ===');
  log(lockdownSQL);
  
  // Save SQL to file for manual execution
  fs.writeFileSync(path.join(logDir, 'emergency-lockdown.sql'), lockdownSQL);
  log('\nSQL saved to: logs/mcp/20250904/rls-tests/emergency-lockdown.sql');
  
  return lockdownSQL;
}

async function verifyAnonymousBlocked() {
  log('\n=== VERIFYING ANONYMOUS ACCESS (POST-LOCKDOWN) ===');
  
  try {
    // Test via PostgREST with anon key
    const response = await fetch(`${supabaseUrl}/rest/v1/user_roles?select=*&limit=5`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });
    
    const data = await response.json();
    const count = response.headers.get('content-range');
    
    log(`PostgREST Response Status: ${response.status}`);
    log(`Content-Range: ${count || 'none'}`);
    
    if (response.status === 401 || response.status === 403) {
      log('✅ SUCCESS: Anonymous access now properly blocked!');
      log(`Error message: ${JSON.stringify(data)}`);
    } else if (response.status === 200 || response.status === 206) {
      if (Array.isArray(data) && data.length === 0) {
        log('✅ SUCCESS: Anonymous access returns empty (no rows visible)');
      } else {
        log(`⚠️ WARNING: Anonymous still has access! Status: ${response.status}`);
        log(`Records returned: ${Array.isArray(data) ? data.length : 'error'}`);
      }
    } else {
      log(`Unexpected status: ${response.status}`);
      log(`Response: ${JSON.stringify(data)}`);
    }
    
    // Save to anonymous HTTP log
    const anonLog = [
      `=== POST-LOCKDOWN VERIFICATION ===`,
      `Timestamp: ${new Date().toISOString()}`,
      `Status: ${response.status}`,
      `Records: ${Array.isArray(data) ? data.length : 'N/A'}`,
      `Result: ${response.status === 401 || response.status === 403 || (Array.isArray(data) && data.length === 0) ? '✅ BLOCKED' : '⚠️ STILL ACCESSIBLE'}`
    ].join('\n');
    
    fs.writeFileSync(path.join(logDir, '18-anonymous-http-post-fix.log'), anonLog);
    
  } catch (error) {
    log(`Error verifying: ${error.message}`);
  }
}

async function testAuthenticatedAccess() {
  log('\n=== TESTING AUTHENTICATED USER ACCESS ===');
  
  // We would need a real authenticated user JWT to properly test this
  // For now, we'll document what should happen
  
  log('Expected behavior after lockdown:');
  log('- Anonymous users: 401/403 or empty result');
  log('- Authenticated users: Can see only their own user_roles rows');
  log('- Service role: Can see all rows (bypass RLS)');
  
  // Test with service role to confirm table still accessible
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, count, error } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true });
  
  if (!error) {
    log(`\nService role verification: ✅ Can access table (${count} total rows)`);
  } else {
    log(`\nService role error: ${error.message}`);
  }
}

async function main() {
  log('Starting emergency user_roles lockdown...\n');
  
  // Generate lockdown SQL
  const sql = await applyEmergencyLockdown();
  
  log('\n' + '='.repeat(60));
  log('⚠️  IMPORTANT: Manual action required!');
  log('='.repeat(60));
  log('\n1. Go to Supabase Dashboard for STAGING project');
  log('2. Navigate to SQL Editor');
  log('3. Copy and execute the SQL from:');
  log('   logs/mcp/20250904/rls-tests/emergency-lockdown.sql');
  log('4. After execution, run this script again with --verify flag');
  log('');
  log('To verify after applying SQL:');
  log('  node emergency-user-roles-lockdown.js --verify');
  
  // If --verify flag is passed, run verification
  if (process.argv.includes('--verify')) {
    log('\n' + '='.repeat(60));
    log('RUNNING POST-LOCKDOWN VERIFICATION');
    log('='.repeat(60));
    await verifyAnonymousBlocked();
    await testAuthenticatedAccess();
  }
  
  log('\n✅ Script complete. Check logs at:');
  log(`  - ${logFile}`);
  log(`  - ${path.join(logDir, '18-anonymous-http-post-fix.log')}`);
}

main().catch(console.error);