require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

async function applyFix() {
  console.log('🚀 Applying user_roles_cache fix...\n');

  const statements = [
    // Step 1: Create materialized view
    `CREATE MATERIALIZED VIEW IF NOT EXISTS public.user_roles_cache AS
SELECT
    ur.user_id,
    ur.role_type as role,
    ur.school_id,
    ur.generation_id,
    ur.community_id,
    p.approval_status,
    CASE WHEN ur.role_type = 'admin' THEN true ELSE false END as is_admin,
    CASE WHEN ur.role_type IN ('admin', 'consultor') THEN true ELSE false END as is_teacher,
    NOW() as cached_at
FROM user_roles ur
JOIN profiles p ON ur.user_id = p.id
WHERE ur.is_active = true AND p.approval_status = 'approved'`,

    // Step 2: Create indexes
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_cache_user_id ON user_roles_cache(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_cache_role ON user_roles_cache(role)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_cache_is_admin ON user_roles_cache(is_admin)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_cache_is_teacher ON user_roles_cache(is_teacher)`,

    // Step 3: Grant permissions
    `GRANT SELECT ON user_roles_cache TO authenticated`,
    `GRANT SELECT ON user_roles_cache TO anon`,

    // Step 4: Refresh view
    `REFRESH MATERIALIZED VIEW user_roles_cache`
  ];

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`📍 Supabase URL: ${SUPABASE_URL}\n`);

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const description = sql.substring(0, 50) + '...';

    console.log(`${i + 1}/${statements.length} Executing: ${description}`);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok) {
        const error = await response.text();
        console.log(`   ❌ Failed: ${error}`);

        // If the RPC doesn't exist, output manual instructions
        if (error.includes('not found') || error.includes('404')) {
          console.log('\n⚠️  SQL RPC not available. Manual execution required.\n');
          console.log('═'.repeat(80));
          console.log('EXECUTE THIS SQL IN SUPABASE DASHBOARD:');
          console.log('═'.repeat(80));
          console.log(`\n🔗 https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new\n`);
          console.log(statements.join(';\n\n') + ';');
          console.log('\n' + '═'.repeat(80));
          return;
        }
      } else {
        console.log(`   ✅ Success`);
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  console.log('\n✅ Migration complete!\n');
}

applyFix().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
