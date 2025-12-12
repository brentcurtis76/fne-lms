import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Test with ANON key (same as client-side would use)
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Test with service role key
const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const userId = 'b97101c1-aeba-4f1f-8e55-67ff600ec4c3';

async function debug() {
  console.log('=== COMPARING ANON vs SERVICE ROLE CLIENT ===');
  console.log('User ID:', userId);
  console.log('');

  // Test with service role
  console.log('1. SERVICE ROLE CLIENT (bypasses RLS):');
  const { data: serviceRoles, error: serviceError } = await serviceClient
    .from('user_roles')
    .select('school_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('school_id', 'is', null)
    .limit(1);

  console.log('   Result:', JSON.stringify(serviceRoles));
  console.log('   Error:', serviceError?.message || 'none');
  console.log('');

  // Test with anon key (RLS applies)
  console.log('2. ANON CLIENT (RLS applies):');
  const { data: anonRoles, error: anonError } = await anonClient
    .from('user_roles')
    .select('school_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('school_id', 'is', null)
    .limit(1);

  console.log('   Result:', JSON.stringify(anonRoles));
  console.log('   Error:', anonError?.message || 'none');
  console.log('');

  // Test schools table access with anon
  console.log('3. ANON CLIENT - schools table access:');
  const { data: anonSchool, error: schoolError } = await anonClient
    .from('schools')
    .select('id, name')
    .eq('id', 19)
    .single();

  console.log('   Result:', JSON.stringify(anonSchool));
  console.log('   Error:', schoolError?.message || 'none');
  console.log('');

  // Check user_roles RLS policies
  console.log('4. Checking RLS on user_roles table:');
  const { data: policies } = await serviceClient.rpc('get_policies_for_table', { table_name: 'user_roles' });
  console.log('   Policies:', JSON.stringify(policies, null, 2));
}

debug().catch(console.error);
