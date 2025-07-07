const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixMissingProfiles() {
  try {
    console.log('Starting profile migration...');

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error fetching auth users:', authError);
      return;
    }

    console.log(`Found ${authUsers.users.length} auth users`);

    // Get all existing profiles
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id');

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }

    const existingProfileIds = new Set(profiles.map(p => p.id));
    console.log(`Found ${profiles.length} existing profiles`);

    // Find users without profiles
    const usersWithoutProfiles = authUsers.users.filter(user => !existingProfileIds.has(user.id));
    console.log(`Found ${usersWithoutProfiles.length} users without profiles`);

    // Create missing profiles
    for (const user of usersWithoutProfiles) {
      const profileData = {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        first_name: user.user_metadata?.first_name || '',
        last_name: user.user_metadata?.last_name || '',
        avatar_url: user.user_metadata?.avatar_url || null,
        approval_status: 'pending'
      };

      console.log(`Creating profile for user ${user.email}...`);

      const { error: insertError } = await supabase
        .from('profiles')
        .insert(profileData);

      if (insertError) {
        console.error(`Error creating profile for ${user.email}:`, insertError);
      } else {
        console.log(`✓ Created profile for ${user.email}`);
      }
    }

    // Migrate any admin roles from user metadata to user_roles table
    console.log('\nChecking for admin roles to migrate...');
    
    for (const user of authUsers.users) {
      if (user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin') {
        // Check if user already has admin role in user_roles
        const { data: existingRole, error: roleCheckError } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', user.id)
          .eq('role_type', 'admin')
          .eq('is_active', true)
          .single();

        if (roleCheckError && roleCheckError.code !== 'PGRST116') {
          console.error(`Error checking role for ${user.email}:`, roleCheckError);
          continue;
        }

        if (!existingRole) {
          console.log(`Migrating admin role for ${user.email}...`);
          
          const { error: roleInsertError } = await supabase
            .from('user_roles')
            .insert({
              user_id: user.id,
              role_type: 'admin',
              is_active: true,
              assigned_at: new Date().toISOString()
            });

          if (roleInsertError) {
            console.error(`Error creating admin role for ${user.email}:`, roleInsertError);
          } else {
            console.log(`✓ Created admin role for ${user.email}`);
          }
        }
      }
    }

    console.log('\nProfile migration completed!');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the migration
fixMissingProfiles();