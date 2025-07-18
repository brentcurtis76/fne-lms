/**
 * Script to create test users for E2E testing
 * Creates users with specific emails and passwords that match the E2E test configuration
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test users configuration - matching what E2E tests expect
const testUsers = [
  {
    email: 'admin@test.com',
    password: 'test123456',
    profile: {
      first_name: 'Admin',
      last_name: 'Test',
      role: 'admin'
    }
  },
  {
    email: 'consultant@test.com',
    password: 'test123456',
    profile: {
      first_name: 'Consultant',
      last_name: 'Test',
      role: 'consultor'
    }
  },
  {
    email: 'student@test.com',
    password: 'test123456',
    profile: {
      first_name: 'Student',
      last_name: 'Test',
      role: 'docente'
    }
  },
  {
    email: 'director@test.com',
    password: 'test123456',
    profile: {
      first_name: 'Director',
      last_name: 'Test',
      role: 'equipo_directivo'
    }
  }
];

async function createTestUsers() {
  console.log('🚀 Creating test users for E2E testing...\n');

  for (const testUser of testUsers) {
    try {
      // Check if user already exists in profiles table
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', testUser.email)
        .single();
      
      if (existingProfile) {
        console.log(`⚠️  User ${testUser.email} already exists. Skipping...`);
        continue;
      }

      // Create the user using the Admin API
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: testUser.email,
        password: testUser.password,
        options: {
          data: {
            first_name: testUser.profile.first_name,
            last_name: testUser.profile.last_name
          }
        }
      });

      if (authError) {
        console.error(`❌ Error creating ${testUser.email}:`, authError.message);
        continue;
      }

      const userId = authData.user?.id;
      if (!userId) {
        console.error(`❌ No user ID returned for ${testUser.email}`);
        continue;
      }

      console.log(`✅ Created auth user: ${testUser.email}`);

      // Create the profile (if not automatically created)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (!profile) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: testUser.email,
            first_name: testUser.profile.first_name,
            last_name: testUser.profile.last_name,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (profileError) {
          console.error(`❌ Error creating profile for ${testUser.email}:`, profileError.message);
          continue;
        }
      }

      // Create the user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role_type: testUser.profile.role,
          is_active: true,
          assigned_at: new Date().toISOString(),
          assigned_by: userId // Self-assigned for test users
        });

      if (roleError) {
        console.error(`❌ Error assigning role for ${testUser.email}:`, roleError.message);
        continue;
      }

      console.log(`✅ Created profile and assigned role: ${testUser.profile.role}`);
      console.log(`   User ID: ${userId}\n`);

    } catch (error) {
      console.error(`❌ Unexpected error creating ${testUser.email}:`, error.message);
    }
  }

  console.log('\n🎉 Test user creation complete!');
  console.log('\nYou can now run E2E tests with:');
  console.log('npm run test:e2e');
}

// Run the script
createTestUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });