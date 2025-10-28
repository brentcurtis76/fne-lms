const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixUserRolesCache() {
  console.log('🔧 Fixing user_roles_cache issue...\n');

  // The complete SQL to create the materialized view and functions
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

  console.log('📄 SQL prepared for execution\n');
  console.log('🌐 Supabase Project: sxlogxqzmarhqsblxmtj');
  console.log('📍 URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('\n' + '='.repeat(80));
  console.log('IMPORTANT: Execute this SQL in Supabase SQL Editor');
  console.log('='.repeat(80));
  console.log('\n1. Open: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
  console.log('\n2. Copy and execute the following SQL:\n');
  console.log('─'.repeat(80));
  console.log(migrationSQL);
  console.log('─'.repeat(80));

  // Save to file for easy access
  const sqlFilePath = '/tmp/fix_user_roles_cache.sql';
  fs.writeFileSync(sqlFilePath, migrationSQL);
  console.log(`\n✅ SQL saved to: ${sqlFilePath}`);

  // Try to verify current state
  console.log('\n🔍 Checking current state...');

  const { data: cacheCheck, error: cacheError } = await supabase
    .from('user_roles_cache')
    .select('*')
    .limit(1);

  if (cacheError) {
    console.log('❌ user_roles_cache does NOT exist (confirmed)');
    console.log('   Error:', cacheError.message);
  } else {
    console.log('✅ user_roles_cache already exists!');
    console.log('   Sample data:', cacheCheck);
  }

  // Check user_roles table
  const { count: userRolesCount } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 user_roles table has ${userRolesCount} rows`);

  // Check profiles with approval status
  const { count: approvedCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('approval_status', 'approved');

  console.log(`📊 ${approvedCount} approved profiles`);

  console.log('\n' + '='.repeat(80));
  console.log('NEXT STEPS:');
  console.log('='.repeat(80));
  console.log('1. Execute the SQL in Supabase Dashboard (link above)');
  console.log('2. Run: node scripts/verify-cache-fix.js');
  console.log('3. Test course loading in browser');
  console.log('='.repeat(80));
}

fixUserRolesCache().catch(console.error);
