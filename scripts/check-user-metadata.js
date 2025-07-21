import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserMetadata() {
  // First check if user exists in profiles table
  console.log('Checking profiles table for brent@perrotuertocm.cl...\n');
  
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'brent@perrotuertocm.cl')
    .single();
    
  if (profileError) {
    console.error('Error querying profiles:', profileError);
  } else if (profile) {
    console.log('Found in profiles table:');
    console.log('User ID:', profile.user_id);
    console.log('Email:', profile.email);
    console.log('First Name:', profile.first_name);
    console.log('Last Name:', profile.last_name);
  }

  // Now check auth.users using auth.admin
  console.log('\n\nChecking auth.users table using auth.admin API...\n');
  
  try {
    // Get all users and search manually
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    
    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }
    
    console.log(`Total users in auth.users: ${users.length}`);
    
    // Find user by email
    const brentUser = users.find(u => u.email === 'brent@perrotuertocm.cl');
    
    if (brentUser) {
      console.log('\nFound user in auth.users:');
      console.log('User ID:', brentUser.id);
      console.log('Email:', brentUser.email);
      console.log('Created:', brentUser.created_at);
      console.log('Updated:', brentUser.updated_at);
      console.log('\nraw_user_meta_data:');
      console.log(JSON.stringify(brentUser.raw_user_meta_data || {}, null, 2));
      
      console.log('\nuser_metadata:');
      console.log(JSON.stringify(brentUser.user_metadata || {}, null, 2));
      
      console.log('\nChecking for specific fields in raw_user_meta_data:');
      const metadata = brentUser.raw_user_meta_data || {};
      console.log('- first_name:', metadata.first_name || 'NOT FOUND');
      console.log('- last_name:', metadata.last_name || 'NOT FOUND');
      console.log('- role:', metadata.role || 'NOT FOUND');
      
      // Also check if profile.user_id matches
      if (profile && profile.user_id !== brentUser.id) {
        console.log('\n⚠️  WARNING: Profile user_id does not match auth.users id!');
        console.log(`Profile user_id: ${profile.user_id}`);
        console.log(`Auth user_id: ${brentUser.id}`);
      }
    } else {
      console.log('\nUser NOT found in auth.users with email brent@perrotuertocm.cl');
      
      // Show users with similar emails
      const similarUsers = users.filter(u => u.email && u.email.includes('brent'));
      if (similarUsers.length > 0) {
        console.log('\nUsers with "brent" in email:');
        similarUsers.forEach(u => {
          console.log(`- ${u.email} (ID: ${u.id})`);
        });
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkUserMetadata().catch(console.error);