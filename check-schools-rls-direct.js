import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPolicies() {
  console.log('🔍 Checking current RLS policies on schools table...\n');
  
  // Direct query to pg_policies
  const { data, error } = await supabase
    .from('pg_policies')
    .select('policyname, permissive, roles, cmd, qual, with_check')
    .eq('tablename', 'schools')
    .order('policyname');
  
  if (error) {
    console.error('❌ Error fetching policies:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('⚠️  No policies found on schools table!');
    return;
  }
  
  console.log(`Found ${data.length} policies:\n`);
  
  data.forEach((policy, index) => {
    console.log(`Policy ${index + 1}: ${policy.policyname}`);
    console.log(`  Permissive: ${policy.permissive}`);
    console.log(`  Roles: ${JSON.stringify(policy.roles)}`);
    console.log(`  Command: ${policy.cmd}`);
    console.log(`  USING clause: ${policy.qual || 'None'}`);
    console.log(`  WITH CHECK: ${policy.with_check || 'None'}`);
    console.log('  ---');
  });
}

checkPolicies();