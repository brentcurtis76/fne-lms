const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function updateUserMetadata() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  
  try {
    // First, get the current user to see existing metadata
    const { data: user, error: fetchError } = await supabase.auth.admin.getUserById(userId);
    
    if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return;
    }
    
    console.log('Current user_metadata:', JSON.stringify(user.user.user_metadata, null, 2));
    
    // Update user metadata, preserving existing fields
    const updatedMetadata = {
      ...user.user.user_metadata,
      first_name: 'Brent',
      last_name: 'Curtis'
    };
    
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        user_metadata: updatedMetadata
      }
    );
    
    if (updateError) {
      console.error('Error updating user:', updateError);
      return;
    }
    
    console.log('\nSuccessfully updated user metadata!');
    console.log('New user_metadata:', JSON.stringify(updatedUser.user.user_metadata, null, 2));
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

updateUserMetadata();