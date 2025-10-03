/**
 * Final Verification - Confirm Migration Success
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalVerification() {
  console.log('🔍 FINAL VERIFICATION\n');
  
  // Test 1: Los Pellines (should be 10 users)
  const { data: lpSchool } = await supabase.from('schools').select('id').ilike('name', '%Los Pellines%').single();
  const { data: lpRoles } = await supabase.from('user_roles').select('user_id').eq('school_id', lpSchool.id).eq('is_active', true);
  const lpUsers = [...new Set(lpRoles?.map(r => r.user_id) || [])].length;
  
  console.log(`TEST 1 - Los Pellines: ${lpUsers} users ${lpUsers === 10 ? '✅' : '❌ (expected 10)'}`);
  
  // Test 2: Migration count
  const { count: c1 } = await supabase.from('user_roles').select('*', {count:'exact',head:true}).eq('school_id',17).eq('is_active',true);
  const { count: c2 } = await supabase.from('user_roles').select('*', {count:'exact',head:true}).eq('school_id',3).eq('is_active',true);
  const { count: c3 } = await supabase.from('user_roles').select('*', {count:'exact',head:true}).eq('school_id',11).eq('is_active',true);
  const total = c1 + c2 + c3;
  
  console.log(`TEST 2 - Migration: ${total} users ${total >= 106 ? '✅' : '❌ (expected 106+)'}`);
  console.log(`   Liceo: ${c1}, Valdivia: ${c2}, Sweet: ${c3}`);
  
  console.log(total >= 106 && lpUsers === 10 ? '\n✅ ALL SYSTEMS GO!' : '\n⚠️  Issues detected');
}

finalVerification().catch(console.error);
