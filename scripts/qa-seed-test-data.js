/**
 * QA Seed Test Data Script
 *
 * Creates test data for E2E tests including:
 * - Learning paths
 * - Course enrollments
 * - Community posts
 *
 * Run AFTER qa-seed-users.js
 * Usage: node scripts/qa-seed-test-data.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_USERS = {
  admin: 'test_qa_admin@test.com',
  directivo: 'test_qa_directivo@test.com',
  docente: 'test_qa_docente@test.com',
  consultant: 'test_qa_consultant@test.com',
};

async function getUserId(email) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  return data?.id;
}

async function getOrCreateSchool() {
  // Check if test school exists
  const { data: existing } = await supabase
    .from('schools')
    .select('id')
    .eq('name', 'TEST_QA School')
    .single();

  if (existing) {
    console.log('Using existing school:', existing.id);
    return existing.id;
  }

  // Create new school
  const { data, error } = await supabase
    .from('schools')
    .insert({
      name: 'TEST_QA School',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating school:', error);
    return null;
  }

  console.log('Created school:', data.id);
  return data.id;
}

async function getOrCreateGeneration(schoolId) {
  // Check if test generation exists
  const { data: existing } = await supabase
    .from('generations')
    .select('id')
    .eq('name', 'TEST_QA Generation')
    .eq('school_id', schoolId)
    .single();

  if (existing) {
    console.log('Using existing generation:', existing.id);
    return existing.id;
  }

  // Create new generation
  const { data, error } = await supabase
    .from('generations')
    .insert({
      name: 'TEST_QA Generation',
      school_id: schoolId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating generation:', error);
    return null;
  }

  console.log('Created generation:', data.id);
  return data.id;
}

async function getOrCreateCommunity(schoolId, generationId, createdBy) {
  // Check if test community exists - try growth_communities table
  const { data: existing } = await supabase
    .from('growth_communities')
    .select('id')
    .eq('name', 'TEST_QA Community')
    .single();

  if (existing) {
    console.log('Using existing community:', existing.id);
    return existing.id;
  }

  // Create new community in growth_communities table
  const { data, error } = await supabase
    .from('growth_communities')
    .insert({
      name: 'TEST_QA Community',
      school_id: schoolId,
      generation_id: generationId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating community:', error);
    return null;
  }

  console.log('Created community:', data.id);
  return data.id;
}

async function addUserToCommunity(communityId, userId) {
  const { error } = await supabase
    .from('community_members')
    .upsert({
      community_id: communityId,
      user_id: userId,
      role: 'member',
      joined_at: new Date().toISOString(),
    });

  if (error && !error.message?.includes('duplicate')) {
    console.error(`Error adding user ${userId} to community:`, error);
  }
}

async function updateUserSchool(userId, schoolId, generationId) {
  const { error } = await supabase
    .from('profiles')
    .update({
      school_id: schoolId,
      generation_id: generationId,
    })
    .eq('id', userId);

  if (error) {
    console.error(`Error updating user school ${userId}:`, error);
  }
}

async function getOrCreateLearningPath() {
  // Check if test learning path exists
  const { data: existing } = await supabase
    .from('learning_paths')
    .select('id')
    .eq('name', 'TEST_QA Learning Path')
    .single();

  if (existing) {
    console.log('Using existing learning path:', existing.id);
    return existing.id;
  }

  // Get admin user for created_by
  const adminId = await getUserId(TEST_USERS.admin);

  // Create new learning path
  const { data, error } = await supabase
    .from('learning_paths')
    .insert({
      name: 'TEST_QA Learning Path',
      description: 'Test learning path for E2E tests',
      is_active: true,
      created_by: adminId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating learning path:', error);
    return null;
  }

  console.log('Created learning path:', data.id);
  return data.id;
}

async function getOrCreateInstructor() {
  // Check if test instructor exists
  const { data: existing } = await supabase
    .from('instructors')
    .select('id')
    .eq('full_name', 'TEST_QA Instructor')
    .single();

  if (existing) {
    console.log('Using existing instructor:', existing.id);
    return existing.id;
  }

  // Create new instructor
  const { data, error } = await supabase
    .from('instructors')
    .insert({
      full_name: 'TEST_QA Instructor',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating instructor:', error);
    return null;
  }

  console.log('Created instructor:', data.id);
  return data.id;
}

async function getOrCreateCourse(instructorId) {
  // Check if test course exists
  const { data: existing } = await supabase
    .from('courses')
    .select('id')
    .eq('title', 'TEST_QA Course')
    .single();

  if (existing) {
    console.log('Using existing course:', existing.id);
    return existing.id;
  }

  // Get consultant user for created_by
  const consultantId = await getUserId(TEST_USERS.consultant);

  // Create new course
  const { data, error } = await supabase
    .from('courses')
    .insert({
      title: 'TEST_QA Course',
      description: 'Test course for E2E tests',
      status: 'published',
      instructor_id: instructorId,
      created_by: consultantId,
      structure_type: 'simple',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating course:', error);
    return null;
  }

  console.log('Created course:', data.id);
  return data.id;
}

async function enrollUserInCourse(userId, courseId) {
  const { error } = await supabase
    .from('course_enrollments')
    .upsert({
      user_id: userId,
      course_id: courseId,
      enrolled_at: new Date().toISOString(),
    });

  if (error && !error.message?.includes('duplicate')) {
    console.error(`Error enrolling user ${userId}:`, error);
  }
}

async function assignLearningPath(userId, pathId, assignedBy) {
  const { error } = await supabase
    .from('learning_path_assignments')
    .upsert({
      user_id: userId,
      path_id: pathId,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
    });

  if (error && !error.message?.includes('duplicate')) {
    console.error(`Error assigning learning path to ${userId}:`, error);
  }
}

async function linkCourseToLearningPath(courseId, pathId) {
  const { error } = await supabase
    .from('learning_path_courses')
    .upsert({
      learning_path_id: pathId,
      course_id: courseId,
      sequence_order: 0,
    });

  if (error && !error.message?.includes('duplicate')) {
    console.error('Error linking course to path:', error);
  }
}

async function main() {
  console.log('🌱 QA Test Data Seed Script');
  console.log('============================\n');

  // Get user IDs
  const userIds = {};
  for (const [role, email] of Object.entries(TEST_USERS)) {
    userIds[role] = await getUserId(email);
    console.log(`${role}: ${userIds[role] || 'NOT FOUND'}`);
  }

  // Create school, generation, community hierarchy
  console.log('\nCreating school and community infrastructure...');
  const schoolId = await getOrCreateSchool();
  const generationId = schoolId ? await getOrCreateGeneration(schoolId) : null;
  const communityId = schoolId && generationId ? await getOrCreateCommunity(schoolId, generationId, userIds.admin) : null;

  // Update user profiles with school and generation
  if (schoolId && generationId) {
    console.log('\nUpdating user school assignments...');
    for (const [role, userId] of Object.entries(userIds)) {
      if (userId) {
        await updateUserSchool(userId, schoolId, generationId);
        console.log(`  Updated ${role}`);
      }
    }
  }

  // Add users to community
  if (communityId) {
    console.log('\nAdding users to community...');
    for (const [role, userId] of Object.entries(userIds)) {
      if (userId) {
        await addUserToCommunity(communityId, userId);
        console.log(`  Added ${role} to community`);
      }
    }
  }

  // Create instructor, learning path, and course
  const instructorId = await getOrCreateInstructor();
  const pathId = await getOrCreateLearningPath();
  const courseId = await getOrCreateCourse(instructorId);

  if (!pathId || !courseId) {
    console.error('Failed to create learning path or course');
    process.exit(1);
  }

  // Link course to learning path
  console.log('\nLinking course to learning path...');
  await linkCourseToLearningPath(courseId, pathId);

  // Enroll test users in course
  console.log('\nEnrolling users in course...');
  for (const [role, userId] of Object.entries(userIds)) {
    if (userId && role !== 'admin') {
      await enrollUserInCourse(userId, courseId);
      console.log(`  Enrolled ${role}`);
    }
  }

  // Assign learning path to users
  console.log('\nAssigning learning path to users...');
  for (const [role, userId] of Object.entries(userIds)) {
    if (userId && role !== 'admin') {
      await assignLearningPath(userId, pathId, userIds.admin);
      console.log(`  Assigned to ${role}`);
    }
  }

  console.log('\n============================');
  console.log('📋 Summary');
  console.log('============================');
  console.log(`School ID: ${schoolId}`);
  console.log(`Generation ID: ${generationId}`);
  console.log(`Community ID: ${communityId}`);
  console.log(`Learning Path ID: ${pathId}`);
  console.log(`Course ID: ${courseId}`);
  console.log('\n✅ Test data seed complete!');
}

main().catch(console.error);
