const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkSuperadmin() {
  console.log('=== Checking Test Superadmin Status ===\n');
  
  // Get the superadmin user
  const { data: superadmins, error: saError } = await supabase
    .from('superadmins')
    .select('*')
    .eq('is_active', true);
    
  if (saError) {
    console.log('❌ Error querying superadmins:', saError.message);
    return;
  }
  
  if (!superadmins || superadmins.length === 0) {
    console.log('❌ No active superadmins found');
    console.log('\nNeed to grant superadmin to a test user.');
    console.log('Looking for available users...\n');
    
    // Try to find brentcurtis76@gmail.com
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', 'brentcurtis76@gmail.com')
      .single();
      
    if (userData) {
      console.log('Found user: brentcurtis76@gmail.com');
      console.log('User ID:', userData.id);
      console.log('\nTo grant superadmin, run this SQL in Supabase SQL Editor:');
      console.log(`
INSERT INTO public.superadmins (user_id, granted_by, reason, is_active)
VALUES ('${userData.id}', '${userData.id}', 'Local RBAC Phase 2 test grant', true)
ON CONFLICT (user_id)
DO UPDATE SET is_active = true, updated_at = now();
      `);
    } else {
      console.log('User brentcurtis76@gmail.com not found in profiles table.');
      console.log('Checking auth.users directly...');
      
      // Note: We can't query auth.users directly from client, but we can try to sign in
      console.log('\nPlease ensure a test superadmin user exists in the test database.');
    }
    return;
  }
  
  console.log(`✅ Found ${superadmins.length} active superadmin(s)`);
  
  // For each superadmin, try to get user info
  for (const admin of superadmins) {
    console.log(`\nSuperadmin User ID: ${admin.user_id}`);
    
    // Try to get user email from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', admin.user_id)
      .single();
      
    if (profile) {
      console.log(`  Email: ${profile.email}`);
      console.log(`  Name: ${profile.full_name || 'N/A'}`);
    } else {
      console.log('  Email: Not found in profiles table');
    }
    
    // Check if superadmin function works
    const { data: isSuperadmin } = await supabase
      .rpc('auth_is_superadmin', { check_user_id: admin.user_id });
      
    console.log(`  auth_is_superadmin: ${isSuperadmin}`);
  }
  
  console.log('\n=== Superadmin Check Complete ===');
}

checkSuperadmin().catch(console.error);