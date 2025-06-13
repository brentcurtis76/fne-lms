const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role key for admin access
);

async function resetPassword() {
  const email = 'brent@perrotuertocm.cl';
  const newPassword = 'NuevaEdu2025!'; // New password
  
  console.log('=== Password Reset ===\n');
  console.log(`Resetting password for: ${email}`);
  
  try {
    // First, get the user
    const { data: users, error: fetchError } = await supabase.auth.admin.listUsers();
    
    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      return;
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error('User not found!');
      return;
    }
    
    console.log('User found:', {
      id: user.id,
      email: user.email,
      created: user.created_at
    });
    
    // Update the password
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );
    
    if (error) {
      console.error('Error updating password:', error);
    } else {
      console.log('\n✅ Password successfully updated!');
      console.log('New password:', newPassword);
      console.log('\nYou can now login with:');
      console.log('Email:', email);
      console.log('Password:', newPassword);
    }
    
  } catch (error) {
    console.error('Exception:', error);
  }
}

resetPassword();