/**
 * QA Seed Users Script for Assessment Builder
 *
 * Creates test users in auth.users with proper roles.
 * Run this BEFORE qa-seed.sql.
 *
 * Usage: node scripts/qa-seed-users.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_USERS = [
  {
    email: 'test_qa_admin@test.com',
    password: 'TestQA2025!',
    role: 'admin',
    full_name: 'TEST_QA Admin User',
  },
  {
    email: 'test_qa_directivo@test.com',
    password: 'TestQA2025!',
    role: 'equipo_directivo',  // Correct enum value for directivo
    full_name: 'TEST_QA Directivo User',
  },
  {
    email: 'test_qa_docente@test.com',
    password: 'TestQA2025!',
    role: 'docente',
    full_name: 'TEST_QA Docente User',
  },
  {
    email: 'test_qa_consultant@test.com',
    password: 'TestQA2025!',
    role: 'consultor',
    full_name: 'TEST_QA Consultant User',
  },
];

async function getSchoolId() {
  const { data, error } = await supabase
    .from('schools')
    .select('id')
    .eq('name', 'TEST_QA_School')
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error finding school:', error);
    return null;
  }

  return data?.id || null;
}

async function createSchool() {
  const { data, error } = await supabase
    .from('schools')
    .insert({
      name: 'TEST_QA_School',
      has_generations: false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating school:', error);
    return null;
  }

  console.log('✅ Created school:', data.id);
  return data.id;
}

async function createUser(user, schoolId) {
  console.log(`\nCreating user: ${user.email}`);

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', user.email)
    .single();

  if (existingUser) {
    console.log(`  User already exists: ${existingUser.id}`);
    return existingUser.id;
  }

  // Create user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.full_name,
      roles: [user.role],
    },
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log(`  User already registered in auth.users`);
      // Get existing user ID
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users?.users?.find(u => u.email === user.email);
      return existing?.id || null;
    }
    console.error(`  Error creating auth user: ${authError.message}`);
    return null;
  }

  const userId = authData.user.id;
  console.log(`  Created auth user: ${userId}`);

  // Create profile
  const nameParts = user.full_name.split(' ');
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: user.email,
      name: user.full_name,
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      school_id: (user.role === 'equipo_directivo' || user.role === 'docente') ? schoolId : null,
      approval_status: 'approved',  // Set to approved so login redirects work
      created_at: new Date().toISOString(),
    });

  if (profileError) {
    console.error(`  Error creating profile: ${profileError.message}`);
  } else {
    console.log(`  Created profile`);
  }

  // Create user_roles entry
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      role_type: user.role,
      school_id: (user.role === 'equipo_directivo' || user.role === 'docente') ? schoolId : null,
      is_active: true,
      assigned_at: new Date().toISOString(),
    });

  if (roleError) {
    console.error(`  Error creating role: ${roleError.message}`);
  } else {
    console.log(`  Assigned role: ${user.role}`);
  }

  return userId;
}

async function deleteExistingUsers() {
  console.log('\n🧹 Cleaning up existing test users...');

  for (const user of TEST_USERS) {
    // Find user in auth.users
    const { data: users } = await supabase.auth.admin.listUsers();
    const existingUser = users?.users?.find(u => u.email === user.email);

    if (existingUser) {
      // Delete from user_roles first
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', existingUser.id);

      // Delete profile
      await supabase
        .from('profiles')
        .delete()
        .eq('id', existingUser.id);

      // Delete auth user
      const { error } = await supabase.auth.admin.deleteUser(existingUser.id);
      if (error) {
        console.log(`  Could not delete ${user.email}: ${error.message}`);
      } else {
        console.log(`  Deleted: ${user.email}`);
      }
    }
  }
}

async function main() {
  console.log('🌱 Assessment Builder QA - User Seed Script');
  console.log('==========================================\n');

  // Option to clean first
  const cleanFirst = process.argv.includes('--clean');
  if (cleanFirst) {
    await deleteExistingUsers();
  }

  // Create or find school
  let schoolId = await getSchoolId();
  if (!schoolId) {
    schoolId = await createSchool();
  } else {
    console.log('Using existing school:', schoolId);
  }

  // Create users
  const createdUsers = [];
  for (const user of TEST_USERS) {
    const userId = await createUser(user, schoolId);
    if (userId) {
      createdUsers.push({ ...user, id: userId });
    }
  }

  // Summary
  console.log('\n==========================================');
  console.log('📋 Summary');
  console.log('==========================================');
  console.log(`School ID: ${schoolId}`);
  console.log('\nTest Users Created:');
  createdUsers.forEach(u => {
    console.log(`  - ${u.email} (${u.role}): ${u.id}`);
  });

  console.log('\n📝 Test Credentials:');
  console.log('  Password for all users: TestQA2025!');

  console.log('\n✅ User seed complete!');
  console.log('Now run: psql or Supabase SQL Editor → scripts/qa-seed.sql');
}

main().catch(console.error);
