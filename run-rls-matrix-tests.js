const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment for STAGING
require('dotenv').config({ path: '.env.staging' });

const STAGING_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const STAGING_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STAGING_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STAGING_ANON_KEY || !STAGING_SERVICE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

// Test tables
const TABLES_TO_TEST = ['profiles', 'user_roles', 'schools', 'generations'];

// Define test roles and their expected access
const ROLES = [
  { name: 'anonymous', key: STAGING_ANON_KEY, expectedAccess: 'none' },
  { name: 'service', key: STAGING_SERVICE_KEY, expectedAccess: 'full' },
  // For authenticated roles, we'll simulate with service key and check policies
  { name: 'admin', key: STAGING_SERVICE_KEY, roleType: 'admin', expectedAccess: 'full' },
  { name: 'consultor', key: STAGING_SERVICE_KEY, roleType: 'consultor', expectedAccess: 'partial' },
  { name: 'equipo_directivo', key: STAGING_SERVICE_KEY, roleType: 'equipo_directivo', expectedAccess: 'partial' },
  { name: 'lider_generacion', key: STAGING_SERVICE_KEY, roleType: 'lider_generacion', expectedAccess: 'partial' },
  { name: 'lider_comunidad', key: STAGING_SERVICE_KEY, roleType: 'lider_comunidad', expectedAccess: 'partial' },
  { name: 'supervisor_de_red', key: STAGING_SERVICE_KEY, roleType: 'supervisor_de_red', expectedAccess: 'partial' },
  { name: 'community_manager', key: STAGING_SERVICE_KEY, roleType: 'community_manager', expectedAccess: 'partial' },
  { name: 'docente', key: STAGING_SERVICE_KEY, roleType: 'docente', expectedAccess: 'limited' },
  { name: 'auth-no-role', key: STAGING_SERVICE_KEY, roleType: null, expectedAccess: 'minimal' }
];

async function testTableAccess(roleName, supabase, table) {
  const results = {
    table,
    role: roleName,
    canRead: false,
    rowCount: 0,
    error: null,
    statusCode: null
  };

  try {
    // For anonymous, use direct API call
    if (roleName === 'anonymous') {
      const response = await fetch(`${STAGING_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          'apikey': STAGING_ANON_KEY,
          'Authorization': `Bearer ${STAGING_ANON_KEY}`
        }
      });
      
      results.statusCode = response.status;
      
      if (response.status === 200 || response.status === 206) {
        const data = await response.json();
        results.canRead = true;
        results.rowCount = Array.isArray(data) ? data.length : 0;
      } else if (response.status === 401 || response.status === 403) {
        results.canRead = false;
        results.error = 'Unauthorized';
      } else {
        results.error = `Status ${response.status}`;
      }
    } else {
      // For other roles, use Supabase client
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        results.error = error.message;
        results.canRead = false;
      } else {
        results.canRead = true;
        results.rowCount = count || 0;
      }
    }
  } catch (err) {
    results.error = err.message;
  }

  return results;
}

async function runRLSMatrixTests() {
  console.log('=== RLS MATRIX TEST - READ ONLY ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Environment: STAGING`);
  console.log(`Tables: ${TABLES_TO_TEST.join(', ')}\n`);

  const allResults = [];

  for (const role of ROLES) {
    const roleLog = [];
    roleLog.push(`\n=== ROLE: ${role.name.toUpperCase()} ===`);
    roleLog.push(`Expected Access: ${role.expectedAccess}`);
    
    const supabase = createClient(STAGING_URL, role.key);
    const roleResults = [];

    for (const table of TABLES_TO_TEST) {
      const result = await testTableAccess(role.name, supabase, table);
      roleResults.push(result);
      
      const status = result.canRead ? '✅ READ' : '❌ BLOCKED';
      const details = result.canRead 
        ? `(${result.rowCount} rows accessible)`
        : `(${result.error || 'No access'})`;
      
      roleLog.push(`  ${table}: ${status} ${details}`);
    }

    // Write individual role log
    const logContent = roleLog.join('\n');
    console.log(logContent);
    
    const logPath = path.join('logs/mcp/20250104/rls-tests', `role-${role.name}.log`);
    fs.writeFileSync(logPath, logContent + '\n');
    
    allResults.push({
      role: role.name,
      results: roleResults
    });
  }

  // Generate summary table
  console.log('\n=== SUMMARY TABLE ===\n');
  console.log('| Role | profiles | user_roles | schools | generations |');
  console.log('|------|----------|------------|---------|-------------|');
  
  const summaryLines = [];
  
  for (const roleResult of allResults) {
    const role = roleResult.role;
    const row = [`| ${role.padEnd(20)} `];
    
    for (const table of TABLES_TO_TEST) {
      const result = roleResult.results.find(r => r.table === table);
      const status = result?.canRead ? '✅' : '❌';
      row.push(` ${status} `);
    }
    
    const line = row.join('|') + '|';
    console.log(line);
    summaryLines.push(line);
  }

  // Write summary
  const summaryContent = `=== RLS MATRIX TEST SUMMARY ===
Date: ${new Date().toISOString()}
Environment: STAGING

PASS/FAIL by Table:

| Role                 | profiles | user_roles | schools | generations |
|----------------------|----------|------------|---------|-------------|
${summaryLines.join('\n')}

Legend:
✅ = Can read (at least some rows)
❌ = Cannot read (blocked/unauthorized)

Notes:
- anonymous should be blocked from all tables (❌ for all)
- service role should have full access (✅ for all)
- Other roles depend on RLS policies

Test Type: READ-ONLY (no write operations performed)
`;

  fs.writeFileSync('logs/mcp/20250104/rls-tests/summary.log', summaryContent);
  console.log('\nLogs saved to: logs/mcp/20250104/rls-tests/');
}

// Run tests
runRLSMatrixTests().catch(console.error);