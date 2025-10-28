const https = require('https');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// SQL to fix the issue
const migrationSQL = `
-- Create a materialized view for role lookups to avoid recursion
CREATE MATERIALIZED VIEW IF NOT EXISTS public.user_roles_cache AS
SELECT
    ur.user_id,
    ur.role_type as role,
    ur.school_id,
    ur.generation_id,
    ur.community_id,
    p.approval_status,
    CASE
        WHEN ur.role_type = 'admin' THEN true
        ELSE false
    END as is_admin,
    CASE
        WHEN ur.role_type IN ('admin', 'consultor') THEN true
        ELSE false
    END as is_teacher,
    NOW() as cached_at
FROM user_roles ur
JOIN profiles p ON ur.user_id = p.id
WHERE ur.is_active = true
AND p.approval_status = 'approved';

-- Create index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_cache_user_id ON user_roles_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_cache_role ON user_roles_cache(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_cache_is_admin ON user_roles_cache(is_admin);
CREATE INDEX IF NOT EXISTS idx_user_roles_cache_is_teacher ON user_roles_cache(is_teacher);

-- Grant select on the cache to authenticated users
GRANT SELECT ON user_roles_cache TO authenticated;
GRANT SELECT ON user_roles_cache TO anon;

-- Refresh the view
REFRESH MATERIALIZED VIEW user_roles_cache;
`;

async function executeSQLViaAPI() {
  console.log('🚀 Executing migration via Supabase Management API...\n');

  const url = new URL('/rest/v1/rpc/exec', SUPABASE_URL);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  };

  const data = JSON.stringify({ query: migrationSQL });

  console.log('Making API request...');

  // Try using curl instead
  const { execSync } = require('child_process');

  try {
    // First, let's try the SQL editor endpoint
    const curlCmd = `curl -X POST '${SUPABASE_URL}/rest/v1/rpc/exec' \\
  -H "apikey: ${SERVICE_KEY}" \\
  -H "Authorization: Bearer ${SERVICE_KEY}" \\
  -H "Content-Type: application/json" \\
  --data '{"query":"${migrationSQL.replace(/'/g, "'\\''")}"}' 2>&1`;

    console.log('Attempting API execution...\n');

    const result = execSync(curlCmd, { encoding: 'utf8' });
    console.log('Response:', result);

  } catch (err) {
    console.log('❌ API execution failed:', err.message);
    console.log('\n📋 MANUAL EXECUTION REQUIRED');
    console.log('─'.repeat(80));
    console.log('\nPlease execute this SQL manually in Supabase Dashboard:');
    console.log(`\n🔗 https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new\n`);
    console.log(migrationSQL);
    console.log('─'.repeat(80));
  }
}

executeSQLViaAPI().catch(console.error);
