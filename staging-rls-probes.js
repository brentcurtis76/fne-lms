const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.staging' });
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const logDir = 'logs/mcp/20250904/rls-tests';

async function runQuery(query, description) {
  console.log(`\n=== ${description} ===`);
  try {
    const { data, error } = await supabase.rpc('query_runner', { 
      query_text: query 
    }).single();
    
    if (error) {
      // Try direct SQL if RPC doesn't exist
      const { data: sqlData, error: sqlError } = await supabase
        .from('pg_policies')
        .select('*')
        .limit(1);
      
      if (sqlError) {
        console.log('Note: Direct SQL queries not available via client');
        return null;
      }
    }
    return data;
  } catch (err) {
    console.log('Query execution not available via client');
    return null;
  }
}

async function getPolicies() {
  console.log('\n=== Policy Inventory ===');
  
  // Since we can't run raw SQL, let's get table info via API
  const tables = [
    'profiles', 'user_roles', 'schools', 'generations',
    'group_assignment_groups', 'group_assignment_members',
    'community_workspaces', 'community_messages', 'community_posts',
    'message_threads', 'redes_de_colegios'
  ];
  
  const results = [];
  
  for (const table of tables) {
    try {
      // Test if table exists and is accessible
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(0);
      
      if (!error) {
        results.push(`✅ ${table}: Table exists and is accessible`);
      } else {
        results.push(`❌ ${table}: ${error.message}`);
      }
    } catch (err) {
      results.push(`❌ ${table}: Error - ${err.message}`);
    }
  }
  
  const output = results.join('\n');
  fs.writeFileSync(path.join(logDir, '00-policy-inventory.log'), output);
  console.log(output);
  
  return results;
}

async function testRoleAccess() {
  console.log('\n=== Testing Table Access ===');
  
  const coreTables = ['profiles', 'user_roles', 'schools', 'generations'];
  const results = [];
  
  // Test with service role (should have full access)
  console.log('\nService Role Access:');
  for (const table of coreTables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    const status = error ? `❌ Error: ${error.message}` : `✅ ${count} records`;
    const line = `  ${table}: ${status}`;
    console.log(line);
    results.push(line);
  }
  
  fs.writeFileSync(path.join(logDir, '20-service-role.log'), results.join('\n'));
  
  // Test with anon key (should have restricted access)
  const supabaseAnon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  console.log('\nAnonymous Access:');
  const anonResults = [];
  for (const table of coreTables) {
    const { count, error } = await supabaseAnon
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    const status = error ? `❌ Blocked: ${error.message}` : `⚠️  ${count} records (unexpected access!)`;
    const line = `  ${table}: ${status}`;
    console.log(line);
    anonResults.push(line);
  }
  
  fs.writeFileSync(path.join(logDir, '18-anonymous.log'), anonResults.join('\n'));
}

async function getSchemaInfo() {
  console.log('\n=== Schema Information ===');
  
  // Get basic stats about the staging environment
  const stats = {
    environment: 'STAGING - tawmibvuoepqcndkykfn',
    url: supabaseUrl,
    timestamp: new Date().toISOString(),
    tables: {}
  };
  
  const tables = ['profiles', 'user_roles', 'schools', 'generations', 'courses', 'lessons'];
  
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    stats.tables[table] = count || 0;
  }
  
  const output = JSON.stringify(stats, null, 2);
  fs.writeFileSync(path.join(logDir, '00-environment-proof.log'), output);
  console.log(output);
  
  return stats;
}

async function main() {
  console.log('Starting staging RLS probes...');
  console.log('Logs will be saved to:', logDir);
  
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Run tests
  await getSchemaInfo();
  await getPolicies();
  await testRoleAccess();
  
  console.log('\n✅ RLS probe tests completed');
  console.log('Logs saved to:', logDir);
}

main().catch(console.error);