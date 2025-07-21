const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create a client as the admin user would see it
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testProfileFetch() {
  console.log('🔍 Testing profile fetch as authenticated user...\n');
  
  // 1. Sign in as admin
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'brent@perrotuertocm.cl',
    password: 'NuevaEdu2025!'
  });
  
  if (authError) {
    console.error('❌ Login failed:', authError);
    return;
  }
  
  console.log('✅ Logged in successfully');
  console.log(`User ID: ${authData.user.id}`);
  console.log(`Email: ${authData.user.email}`);
  console.log(`User Metadata:`, authData.user.user_metadata);
  
  // 2. Try to fetch profile as the login page would
  console.log('\n📋 Fetching profile...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();
    
  if (profileError) {
    console.error('❌ Profile fetch error:', profileError);
  } else {
    console.log('✅ Profile fetched successfully:');
    console.log(`- First Name: "${profile.first_name}"`);
    console.log(`- Last Name: "${profile.last_name}"`);
    console.log(`- School: "${profile.school}"`);
    console.log(`- Approval Status: ${profile.approval_status}`);
  }
  
  // 3. Test checkProfileCompletionSimple logic
  console.log('\n🧪 Testing profile completion check...');
  const { data: simpleProfile, error: simpleError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', authData.user.id)
    .maybeSingle();
    
  if (simpleError) {
    console.error('❌ Simple profile check error:', simpleError);
  } else if (!simpleProfile) {
    console.log('❌ No profile found');
  } else {
    const hasName = Boolean(simpleProfile.first_name?.trim() && simpleProfile.last_name?.trim());
    console.log(`✅ Profile check result: ${hasName ? 'COMPLETE' : 'INCOMPLETE'}`);
    console.log(`   first_name: "${simpleProfile.first_name}"`);
    console.log(`   last_name: "${simpleProfile.last_name}"`);
  }
  
  // 4. Sign out
  await supabase.auth.signOut();
  console.log('\n✅ Signed out');
}

testProfileFetch().catch(console.error);