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

async function resetPassword() {
  const userEmail = 'brent@perrotuertocm.cl';
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  const newPassword = 'TestPassword123!';
  
  console.log(`\n🔧 Resetting password for ${userEmail}...`);
  
  try {
    // Update the user's password using the Admin API
    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      { 
        password: newPassword,
        email_confirm: true
      }
    );
    
    if (error) {
      console.error('❌ Error resetting password:', error);
      return;
    }
    
    console.log('✅ Password successfully reset!');
    console.log('\n📧 Email:', userEmail);
    console.log('🔑 New Password:', newPassword);
    console.log('\n⚠️  Please change this password after logging in');
    
    // Verify the user exists and is a superadmin
    const { data: superadminData, error: superadminError } = await supabase
      .from('superadmins')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (superadminError) {
      console.error('⚠️  Warning: Could not verify superadmin status:', superadminError.message);
    } else {
      console.log('✅ Superadmin status confirmed');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

resetPassword();