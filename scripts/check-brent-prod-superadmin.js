const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.prod' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required PRODUCTION environment variables');
  console.log('Make sure .env.prod has PRODUCTION credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkSuperadmin() {
  const userEmail = 'brent@perrotuertocm.cl';
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`\n🔍 Checking PRODUCTION superadmin status for ${userEmail}...`);
  
  try {
    // First verify the user exists
    const { data: userData, error: userError } = await supabase
      .from('auth.users')
      .select('id, email')
      .eq('email', userEmail)
      .single();
    
    if (userError) {
      console.error('❌ User not found in PRODUCTION:', userError.message);
      return;
    }
    
    console.log('✅ User found in PRODUCTION');
    console.log('   ID:', userData.id);
    console.log('   Email:', userData.email);
    
    // Check superadmin status using RPC
    const { data: superadminStatus, error: rpcError } = await supabase
      .rpc('auth_is_superadmin', { user_id: userId });
    
    if (rpcError) {
      console.error('❌ Error checking superadmin status:', rpcError);
      return;
    }
    
    console.log('\n📊 Superadmin Status:', superadminStatus ? '✅ YES' : '❌ NO');
    
    if (!superadminStatus) {
      console.log('\n⚠️  User is NOT a superadmin in PRODUCTION');
      console.log('   Would need to grant superadmin access if approved');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

checkSuperadmin();