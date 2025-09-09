const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' }); // PRODUCTION
const fs = require('fs');
const path = require('path');

const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const prodAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const logDir = 'logs/mcp/20250904/rls-tests';

async function checkTableExposure(tableName) {
  try {
    const response = await fetch(`${prodUrl}/rest/v1/${tableName}?select=*&limit=5`, {
      headers: {
        'apikey': prodAnonKey,
        'Authorization': `Bearer ${prodAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });
    
    const data = await response.json();
    const count = response.headers.get('content-range');
    
    if (response.status === 401 || response.status === 403) {
      return { table: tableName, exposed: false, status: 'BLOCKED', count: 0 };
    } else if (response.status === 200 || response.status === 206) {
      if (Array.isArray(data) && data.length === 0) {
        return { table: tableName, exposed: false, status: 'EMPTY/FILTERED', count: 0 };
      } else {
        const totalCount = count ? count.split('/')[1] : 'unknown';
        return { 
          table: tableName, 
          exposed: true, 
          status: 'EXPOSED', 
          count: totalCount,
          sample: data[0] 
        };
      }
    } else {
      return { table: tableName, exposed: false, status: `ERROR-${response.status}`, count: 0 };
    }
  } catch (error) {
    return { table: tableName, exposed: false, status: 'ERROR', error: error.message };
  }
}

async function main() {
  console.log('=== PRODUCTION EXPOSURE CHECK - REMAINING TABLES ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Environment: PRODUCTION (${prodUrl})\n`);
  
  const tables = ['courses', 'activity_feed', 'clientes', 'contratos', 'cuotas'];
  const results = [];
  
  for (const table of tables) {
    console.log(`Checking ${table}...`);
    const result = await checkTableExposure(table);
    results.push(result);
    
    if (result.exposed) {
      console.log(`  ⚠️ EXPOSED: ${result.count} total rows accessible`);
      if (result.sample) {
        console.log(`     Sample columns: ${Object.keys(result.sample).slice(0, 5).join(', ')}`);
      }
    } else {
      console.log(`  ✅ PROTECTED: ${result.status}`);
    }
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    environment: 'PRODUCTION',
    tables_checked: tables.length,
    exposed_tables: results.filter(r => r.exposed),
    protected_tables: results.filter(r => !r.exposed)
  };
  
  // Save detailed report
  fs.writeFileSync(
    path.join(logDir, 'PROD-remaining-tables-exposure.json'),
    JSON.stringify(report, null, 2)
  );
  
  // Create fix priority list
  console.log('\n=== FIX PRIORITY ORDER ===');
  console.log('Based on exposure and criticality:\n');
  
  const priority = [
    { table: 'clientes', reason: 'Contains client/organization data', order: 1 },
    { table: 'contratos', reason: 'Contains contract/financial data', order: 2 },
    { table: 'cuotas', reason: 'Contains payment/quota data', order: 3 },
    { table: 'courses', reason: 'Educational content (less sensitive)', order: 4 },
    { table: 'activity_feed', reason: 'Activity logs (least sensitive)', order: 5 }
  ];
  
  priority.forEach(p => {
    const status = results.find(r => r.table === p.table);
    if (status?.exposed) {
      console.log(`${p.order}. ${p.table} - ${p.reason}`);
      console.log(`   Exposed rows: ${status.count}`);
    }
  });
  
  // Save priority list
  fs.writeFileSync(
    path.join(logDir, 'PROD-fix-priority.txt'),
    priority.map(p => `${p.order}. ${p.table} - ${p.reason}`).join('\n')
  );
  
  console.log('\n✅ Exposure check complete');
  console.log('Reports saved to logs/mcp/20250904/rls-tests/');
  
  return report;
}

main().catch(console.error);