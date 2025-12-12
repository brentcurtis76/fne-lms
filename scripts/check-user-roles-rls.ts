import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkRLS() {
  console.log('=== CHECKING RLS POLICIES ON user_roles ===\n');

  // Check if RLS is enabled
  const { data: tableInfo } = await serviceClient
    .from('pg_tables')
    .select('*')
    .eq('tablename', 'user_roles')
    .eq('schemaname', 'public');

  console.log('Table info:', JSON.stringify(tableInfo, null, 2));

  // Get RLS policies using raw SQL
  const { data: policies, error } = await serviceClient.rpc('exec_sql', {
    sql_query: `
      SELECT
        policyname,
        permissive,
        roles,
        cmd,
        qual::text as using_expression,
        with_check::text as with_check_expression
      FROM pg_policies
      WHERE tablename = 'user_roles'
        AND schemaname = 'public'
      ORDER BY policyname;
    `
  });

  if (error) {
    console.log('Error getting policies via RPC:', error.message);

    // Try direct query
    const { data: directPolicies, error: directError } = await serviceClient
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'user_roles')
      .eq('schemaname', 'public');

    console.log('Direct query result:', JSON.stringify(directPolicies, null, 2));
    console.log('Direct query error:', directError?.message);
  } else {
    console.log('RLS Policies on user_roles:');
    console.log(JSON.stringify(policies, null, 2));
  }
}

checkRLS().catch(console.error);
