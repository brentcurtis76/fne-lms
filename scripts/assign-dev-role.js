/**
 * Script to assign dev role to a user
 * Usage: node scripts/assign-dev-role.js <user-email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function assignDevRole(email) {
  if (!email) {
    console.error('❌ Usage: node scripts/assign-dev-role.js <user-email>');
    process.exit(1);
  }

  console.log(`🚀 Assigning dev role to user: ${email}\n`);

  try {
    // First, find the user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${profile.first_name} ${profile.last_name} (${profile.id})`);

    // Check if user already has dev role
    const { data: existingDev, error: devCheckError } = await supabase
      .from('dev_users')
      .select('id, is_active')
      .eq('user_id', profile.id)
      .single();

    if (existingDev && existingDev.is_active) {
      console.log('ℹ️  User already has active dev access');
      return;
    }

    if (existingDev && !existingDev.is_active) {
      // Reactivate existing dev access
      const { error: updateError } = await supabase
        .from('dev_users')
        .update({ is_active: true })
        .eq('id', existingDev.id);

      if (updateError) {
        console.error('❌ Error reactivating dev access:', updateError.message);
        process.exit(1);
      }

      console.log('✅ Dev access reactivated successfully!');
    } else {
      // Create new dev user entry
      const { error: insertError } = await supabase
        .from('dev_users')
        .insert({
          user_id: profile.id,
          is_active: true,
          assigned_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('❌ Error assigning dev access:', insertError.message);
        console.error('\n💡 Make sure the dev tables have been created.');
        process.exit(1);
      }

      console.log('✅ Dev access assigned successfully!');
    }

    console.log('\n📝 Next steps:');
    console.log('1. User should log out and log back in');
    console.log('2. A purple dev button will appear in the bottom right');
    console.log('3. Click it to switch between different roles');
    console.log('\n⚠️  Remember: Dev role switching is for testing only!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get email from command line arguments
const email = process.argv[2];
assignDevRole(email);