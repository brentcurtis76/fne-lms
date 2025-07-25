/**
 * Reset password for admin user using Supabase Admin API
 * This is the recommended approach for Supabase password management
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function resetAdminPassword() {
  const email = 'bcurtis@nuevaeducacion.org';
  const newPassword = 'FNE2025admin!';
  
  console.log('🔐 Resetting password for:', email);
  
  try {
    // First, check if user exists
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error('❌ Error listing users:', userError.message);
      return;
    }
    
    const user = userData.users.find(u => u.email === email);
    console.log(`Found ${userData.users.length} total users`);
    
    if (!user) {
      console.log('❌ User not found. Creating new user...');
      
      // Create user if doesn't exist
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: newPassword,
        email_confirm: true
      });
      
      if (createError) {
        console.error('❌ Error creating user:', createError.message);
        return;
      }
      
      console.log('✅ User created successfully');
      console.log('   User ID:', newUser.user.id);
    } else {
      console.log('✅ User found. Updating password...');
      
      // Update existing user's password
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );
      
      if (updateError) {
        console.error('❌ Error updating password:', updateError.message);
        return;
      }
      
      console.log('✅ Password updated successfully');
    }
    
    console.log('\n📋 Login credentials:');
    console.log('   Email:', email);
    console.log('   Password:', newPassword);
    console.log('\n🚀 You can now login at: http://localhost:3000/login');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the password reset
resetAdminPassword();