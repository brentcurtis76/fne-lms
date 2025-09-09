const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Function to check instance_id mismatches
async function checkInstanceMismatches(env, url, serviceKey) {
  console.log(`\nChecking ${env}...`);
  
  const supabase = createClient(url, serviceKey);
  
  // Query to find mismatched instance_id rows
  const query = `
    SELECT COUNT(*) as mismatch_count
    FROM auth.users u
    WHERE u.instance_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.instances i 
      WHERE i.id = u.instance_id
    )
  `;
  
  try {
    const { data, error } = await supabase.rpc('sql_query', { query_text: query });
    
    if (error) {
      // Try direct query if RPC doesn't work
      const { data: users, error: userError } = await supabase
        .from('auth.users')
        .select('id, instance_id')
        .not('instance_id', 'is', null);
      
      if (userError) {
        return { env, status: 'ERROR', message: userError.message };
      }
      
      // Count mismatches manually
      let mismatches = 0;
      if (users) {
        for (const user of users) {
          const { data: instance } = await supabase
            .from('auth.instances')
            .select('id')
            .eq('id', user.instance_id)
            .single();
          
          if (!instance) mismatches++;
        }
      }
      
      return { env, status: 'SUCCESS', count: mismatches };
    }
    
    return { env, status: 'SUCCESS', count: data?.[0]?.mismatch_count || 0 };
  } catch (err) {
    return { env, status: 'ERROR', message: err.message };
  }
}

async function main() {
  const results = [];
  const timestamp = new Date().toISOString();
  
  // Check STAGING
  console.log('=== SANTA MARTA INSTANCE_ID VERIFICATION ===');
  console.log(`Date: ${timestamp}\n`);
  
  // Load staging env
  require('dotenv').config({ path: '.env.staging' });
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const stagingResult = await checkInstanceMismatches(
      'STAGING',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    results.push(stagingResult);
  } else {
    console.log('STAGING: Environment variables not found');
    results.push({ env: 'STAGING', status: 'SKIPPED', message: 'No staging environment configured' });
  }
  
  // Check PRODUCTION
  require('dotenv').config({ path: '.env.local' });
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const prodResult = await checkInstanceMismatches(
      'PRODUCTION',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    results.push(prodResult);
  } else {
    console.log('PRODUCTION: Environment variables not found');
    results.push({ env: 'PRODUCTION', status: 'ERROR', message: 'Missing environment variables' });
  }
  
  // Generate log content
  let logContent = `=== SANTA MARTA INSTANCE_ID VERIFICATION LOG ===
Date: ${timestamp}
Purpose: Verify instance_id mismatches after Santa Marta login fix
Query: Count users where instance_id NOT IN auth.instances.id

============================================================
RESULTS:
============================================================\n\n`;
  
  for (const result of results) {
    if (result.status === 'SUCCESS') {
      logContent += `${result.env}:\n`;
      logContent += `  Status: ✅ SUCCESS\n`;
      logContent += `  Mismatched instance_id rows: ${result.count}\n`;
      logContent += `  Verification: ${result.count === 0 ? 'PASSED - No mismatches found' : `FAILED - ${result.count} mismatches found`}\n\n`;
      
      console.log(`${result.env}: ${result.count} mismatches`);
    } else {
      logContent += `${result.env}:\n`;
      logContent += `  Status: ❌ ${result.status}\n`;
      logContent += `  Message: ${result.message || 'Unable to verify'}\n\n`;
      
      console.log(`${result.env}: ${result.status} - ${result.message || 'Unable to verify'}`);
    }
  }
  
  logContent += `============================================================
SUMMARY:
============================================================\n`;
  
  const stagingResult = results.find(r => r.env === 'STAGING');
  const prodResult = results.find(r => r.env === 'PRODUCTION');
  
  if (stagingResult?.status === 'SUCCESS' && prodResult?.status === 'SUCCESS') {
    const totalMismatches = (stagingResult.count || 0) + (prodResult.count || 0);
    logContent += `Total mismatches across both environments: ${totalMismatches}\n`;
    logContent += `Overall status: ${totalMismatches === 0 ? '✅ VERIFIED FIXED' : '⚠️ ISSUES REMAIN'}\n`;
  } else {
    logContent += `Verification incomplete - check error messages above\n`;
  }
  
  logContent += `\n============================================================
NOTES:
============================================================
- Santa Marta login issue was reported on 2025-01-03
- Fix was applied by Brent Curtis on 2025-01-04
- This verification confirms instance_id referential integrity
- Query checks: SELECT COUNT(*) FROM auth.users WHERE instance_id NOT IN (SELECT id FROM auth.instances)

============================================================
`;
  
  // Save log file
  const logPath = path.join('logs', 'mcp', '20250104', 'santa-marta', 'verification.log');
  fs.writeFileSync(logPath, logContent);
  console.log(`\nLog saved to: ${logPath}`);
}

main().catch(console.error);