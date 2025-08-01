#!/usr/bin/env node

/**
 * Script to seed test users and groups for learning path assignment testing
 * Creates 1000+ users and 50+ groups for scalability testing
 */

const { createClient } = require('@supabase/supabase-js');
const { faker } = require('@faker-js/faker');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Configuration
const USER_COUNT = 1000;
const GROUP_COUNT = 50;
const BATCH_SIZE = 100;

async function createTestUsers() {
  console.log(`Creating ${USER_COUNT} test users...`);
  
  const users = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();
    
    users.push({
      id: faker.string.uuid(),
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'estudiante',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Insert in batches
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    
    // First create auth users
    for (const user of batch) {
      const { error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: 'TestPassword123!',
        email_confirm: true,
        user_metadata: {
          first_name: user.first_name,
          last_name: user.last_name
        }
      });
      
      if (authError && !authError.message.includes('already registered')) {
        console.error(`Failed to create auth user ${user.email}:`, authError);
      }
    }
    
    // Then create profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(batch, { onConflict: 'email' });
    
    if (profileError) {
      console.error(`Failed to create profiles batch ${i / BATCH_SIZE + 1}:`, profileError);
    } else {
      console.log(`Created batch ${i / BATCH_SIZE + 1} of ${Math.ceil(users.length / BATCH_SIZE)}`);
    }
  }
  
  console.log(`✅ Created ${USER_COUNT} test users`);
  return users;
}

async function createTestGroups() {
  console.log(`Creating ${GROUP_COUNT} test groups...`);
  
  const groups = [];
  const groupTypes = ['Departamento', 'Equipo', 'Proyecto', 'Comunidad', 'Clase'];
  
  for (let i = 0; i < GROUP_COUNT; i++) {
    const groupType = faker.helpers.arrayElement(groupTypes);
    const name = `${groupType} ${faker.company.catchPhrase()}`;
    
    groups.push({
      id: faker.string.uuid(),
      name,
      description: faker.lorem.paragraph(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Insert all groups at once
  const { error } = await supabase
    .from('groups')
    .insert(groups);
  
  if (error) {
    console.error('Failed to create groups:', error);
  } else {
    console.log(`✅ Created ${GROUP_COUNT} test groups`);
  }
  
  return groups;
}

async function assignUsersToGroups(users, groups) {
  console.log('Assigning users to groups...');
  
  const assignments = [];
  
  // Assign random users to each group
  for (const group of groups) {
    const memberCount = faker.number.int({ min: 5, max: 50 });
    const selectedUsers = faker.helpers.arrayElements(users, memberCount);
    
    for (const user of selectedUsers) {
      assignments.push({
        id: faker.string.uuid(),
        user_id: user.id,
        community_id: group.id,
        role_type: 'estudiante',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  // Insert in batches
  for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
    const batch = assignments.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('user_roles')
      .insert(batch);
    
    if (error) {
      console.error(`Failed to create assignments batch ${i / BATCH_SIZE + 1}:`, error);
    }
  }
  
  console.log(`✅ Created ${assignments.length} user-group assignments`);
}

async function createSampleLearningPathAssignments(users, groups) {
  console.log('Creating sample learning path assignments...');
  
  // Get a sample learning path
  const { data: paths, error: pathError } = await supabase
    .from('learning_paths')
    .select('id')
    .limit(1)
    .single();
  
  if (pathError || !paths) {
    console.log('No learning paths found, skipping assignment creation');
    return;
  }
  
  const pathId = paths.id;
  const assignments = [];
  
  // Assign to 10% of users directly
  const assignedUsers = faker.helpers.arrayElements(users, Math.floor(users.length * 0.1));
  for (const user of assignedUsers) {
    assignments.push({
      id: faker.string.uuid(),
      path_id: pathId,
      user_id: user.id,
      assigned_by: users[0].id, // Use first user as assigner
      assigned_at: new Date().toISOString()
    });
  }
  
  // Assign to 20% of groups
  const assignedGroups = faker.helpers.arrayElements(groups, Math.floor(groups.length * 0.2));
  for (const group of assignedGroups) {
    assignments.push({
      id: faker.string.uuid(),
      path_id: pathId,
      group_id: group.id,
      assigned_by: users[0].id,
      assigned_at: new Date().toISOString()
    });
  }
  
  const { error } = await supabase
    .from('learning_path_assignments')
    .insert(assignments);
  
  if (error) {
    console.error('Failed to create learning path assignments:', error);
  } else {
    console.log(`✅ Created ${assignments.length} learning path assignments`);
  }
}

async function main() {
  try {
    console.log('🚀 Starting test data seeding...\n');
    
    const users = await createTestUsers();
    const groups = await createTestGroups();
    await assignUsersToGroups(users, groups);
    await createSampleLearningPathAssignments(users, groups);
    
    console.log('\n✅ Test data seeding completed successfully!');
    console.log(`
Summary:
- Users created: ${USER_COUNT}
- Groups created: ${GROUP_COUNT}
- Users assigned to groups
- Sample learning path assignments created
    `);
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    process.exit(1);
  }
}

// Run the script
main();