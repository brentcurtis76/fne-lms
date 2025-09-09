const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function grantSuperadmin() {
  const userEmail = 'brent@perrotuertocm.cl';
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  console.log(`\n🔧 Granting superadmin to ${userEmail} (${userId})...`);
  
  try {
    // First check if the row already exists
    const { data: existingData, error: checkError } = await supabase
      .from('superadmins')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking existing superadmin:', checkError);
      return;
    }
    
    if (existingData) {
      console.log('✅ User is already a superadmin');
      console.log('   Granted at:', existingData.granted_at);
      console.log('   Granted by:', existingData.granted_by);
      return;
    }
    
    // Grant superadmin
    const { data, error } = await supabase
      .from('superadmins')
      .insert({
        user_id: userId,
        granted_at: new Date().toISOString(),
        granted_by: 'script'
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error granting superadmin:', error);
      return;
    }
    
    console.log('✅ Successfully granted superadmin to', userEmail);
    console.log('   User ID:', userId);
    console.log('   Granted at:', data.granted_at);
    
    // Verify the grant
    const { data: verifyData, error: verifyError } = await supabase
      .from('superadmins')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (verifyError) {
      console.error('❌ Error verifying superadmin grant:', verifyError);
    } else {
      console.log('\n✅ Verification successful - superadmin access confirmed');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

grantSuperadmin();