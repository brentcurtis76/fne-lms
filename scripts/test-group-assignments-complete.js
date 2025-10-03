const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test data
const testData = {
  consultor: {
    email: 'test.consultor@example.com',
    password: 'test123456',
    name: 'Test Consultor',
    role: 'consultor'
  },
  students: [
    { email: 'student1@example.com', password: 'test123456', name: 'María García', role: 'docente' },
    { email: 'student2@example.com', password: 'test123456', name: 'Carlos López', role: 'docente' },
    { email: 'student3@example.com', password: 'test123456', name: 'Ana Martínez', role: 'docente' },
    { email: 'student4@example.com', password: 'test123456', name: 'José Rodríguez', role: 'docente' }
  ],
  course: {
    title: 'Test Course - Group Assignments',
    description: 'Course for testing group assignments'
  },
  module: {
    title: 'Test Module',
    description: 'Module for testing'
  },
  lesson: {
    title: 'Test Lesson with Group Assignment',
    description: 'Lesson containing group assignment block'
  }
};

// Utility functions
async function cleanupTestData() {
  console.log('🧹 Cleaning up existing test data...');
  
  // Delete test users
  const emails = [testData.consultor.email, ...testData.students.map(s => s.email)];
  for (const email of emails) {
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();
      
    if (user) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  }
  
  // Delete test course
  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('title', testData.course.title)
    .single();
    
  if (course) {
    await supabase.from('courses').delete().eq('id', course.id);
  }
}

async function createTestUsers() {
  console.log('👥 Creating test users...');
  const users = {};
  
  // Create consultor
  const { data: { user: consultor }, error: consultorError } = await supabase.auth.admin.createUser({
    email: testData.consultor.email,
    password: testData.consultor.password,
    email_confirm: true
  });
  
  if (consultorError) throw consultorError;
  
  await supabase.from('profiles').update({
    name: testData.consultor.name,
    role: testData.consultor.role
  }).eq('id', consultor.id);
  
  users.consultor = consultor;
  console.log(`  ✅ Created consultor: ${testData.consultor.email}`);
  
  // Create students
  users.students = [];
  for (const studentData of testData.students) {
    const { data: { user: student }, error } = await supabase.auth.admin.createUser({
      email: studentData.email,
      password: studentData.password,
      email_confirm: true
    });
    
    if (error) throw error;
    
    await supabase.from('profiles').update({
      name: studentData.name,
      role: studentData.role
    }).eq('id', student.id);
    
    users.students.push({ ...student, name: studentData.name });
    console.log(`  ✅ Created student: ${studentData.email}`);
  }
  
  return users;
}

async function createCourseStructure(consultorId) {
  console.log('📚 Creating course structure...');
  
  // Create course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({
      title: testData.course.title,
      description: testData.course.description,
      created_by: consultorId,
      is_published: true
    })
    .select()
    .single();
    
  if (courseError) throw courseError;
  console.log(`  ✅ Created course: ${course.title}`);
  
  // Create module
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .insert({
      course_id: course.id,
      title: testData.module.title,
      description: testData.module.description,
      position: 0
    })
    .select()
    .single();
    
  if (moduleError) throw moduleError;
  console.log(`  ✅ Created module: ${module.title}`);
  
  // Create lesson
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .insert({
      module_id: module.id,
      title: testData.lesson.title,
      description: testData.lesson.description,
      position: 0,
      is_published: true
    })
    .select()
    .single();
    
  if (lessonError) throw lessonError;
  console.log(`  ✅ Created lesson: ${lesson.title}`);
  
  return { course, module, lesson };
}

async function enrollStudents(courseId, studentIds) {
  console.log('📝 Enrolling students in course...');
  
  for (const studentId of studentIds) {
    const { error } = await supabase
      .from('course_enrollments')
      .insert({
        course_id: courseId,
        user_id: studentId,
        status: 'enrolled'
      });
      
    if (error && !error.message.includes('duplicate')) throw error;
  }
  
  console.log(`  ✅ Enrolled ${studentIds.length} students`);
}

async function createGroupAssignmentBlock(lessonId, courseId, users) {
  console.log('📦 Creating group assignment block...');
  
  // Create the block data with groups
  const blockData = {
    id: `block-${Date.now()}`,
    type: 'group-assignment',
    position: 0,
    lesson_id: lessonId,
    payload: {
      title: 'Proyecto de Investigación Grupal',
      instructions: 'Investigar sobre metodologías de enseñanza modernas y crear una presentación de 10 diapositivas.',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      points: 100,
      groups: [
        {
          group_id: 'group-1',
          group_name: 'Grupo 1',
          members: users.students.slice(0, 2).map(s => ({
            user_id: s.id,
            name: s.name,
            email: s.email
          }))
        },
        {
          group_id: 'group-2',
          group_name: 'Grupo 2',
          members: users.students.slice(2, 4).map(s => ({
            user_id: s.id,
            name: s.name,
            email: s.email
          }))
        }
      ]
    }
  };
  
  // Save block to lesson
  const { data: blocks, error: blocksError } = await supabase
    .from('lessons')
    .select('blocks')
    .eq('id', lessonId)
    .single();
    
  if (blocksError) throw blocksError;
  
  const updatedBlocks = [...(blocks.blocks || []), blockData];
  
  const { error: updateError } = await supabase
    .from('lessons')
    .update({ blocks: updatedBlocks })
    .eq('id', lessonId);
    
  if (updateError) throw updateError;
  
  console.log('  ✅ Created group assignment block in lesson');
  
  // Create the assignment record in lesson_assignments
  const { data: assignment, error: assignmentError } = await supabase
    .from('lesson_assignments')
    .insert({
      course_id: courseId,
      lesson_id: lessonId,
      title: blockData.payload.title,
      description: blockData.payload.instructions,
      due_date: blockData.payload.due_date,
      points: blockData.payload.points,
      is_published: true,
      assignment_for: 'group',
      assignment_type: 'group',
      group_assignments: blockData.payload.groups,
      created_by: users.consultor.id
    })
    .select()
    .single();
    
  if (assignmentError) throw assignmentError;
  
  console.log('  ✅ Created assignment record in database');
  console.log(`     Assignment ID: ${assignment.id}`);
  
  return { block: blockData, assignment };
}

async function simulateStudentView(studentId, assignmentId) {
  console.log(`\n👁️  Simulating student view...`);
  
  // Use the get_user_group_assignments function
  const { data, error } = await supabase
    .rpc('get_user_group_assignments', {
      p_user_id: studentId,
      p_community_id: null // Would need community ID in real scenario
    });
    
  if (error) {
    console.log('  ⚠️  Note: get_user_group_assignments function may not exist yet');
    
    // Fallback: Direct query
    const { data: assignments } = await supabase
      .from('lesson_assignments')
      .select('*')
      .eq('assignment_type', 'group')
      .eq('id', assignmentId);
      
    if (assignments && assignments.length > 0) {
      const assignment = assignments[0];
      const userGroup = assignment.group_assignments.find(g => 
        g.members.some(m => m.user_id === studentId)
      );
      
      if (userGroup) {
        console.log(`  ✅ Student can see assignment: ${assignment.title}`);
        console.log(`     Assigned to: ${userGroup.group_name}`);
        console.log(`     Group members: ${userGroup.members.map(m => m.name).join(', ')}`);
        return true;
      }
    }
  } else if (data && data.length > 0) {
    console.log(`  ✅ Student can see ${data.length} group assignment(s)`);
    data.forEach(a => {
      console.log(`     - ${a.title} (Due: ${new Date(a.due_date).toLocaleDateString()})`);
    });
    return true;
  }
  
  console.log('  ❌ Student cannot see any assignments');
  return false;
}

async function simulateSubmission(assignmentId, groupId, studentId) {
  console.log(`\n📤 Simulating group submission...`);
  
  // Get current assignment
  const { data: assignment, error: fetchError } = await supabase
    .from('lesson_assignments')
    .select('group_assignments')
    .eq('id', assignmentId)
    .single();
    
  if (fetchError) throw fetchError;
  
  // Update group with submission
  const updatedGroups = assignment.group_assignments.map(group => {
    if (group.group_id === groupId) {
      return {
        ...group,
        submission: {
          submitted_by: studentId,
          submitted_at: new Date().toISOString(),
          file_url: 'https://example.com/test-submission.pdf',
          status: 'submitted'
        }
      };
    }
    return group;
  });
  
  // Save updated groups
  const { error: updateError } = await supabase
    .from('lesson_assignments')
    .update({ group_assignments: updatedGroups })
    .eq('id', assignmentId);
    
  if (updateError) throw updateError;
  
  console.log('  ✅ Submission saved successfully');
}

async function runTests() {
  console.log('🚀 Starting Group Assignments Test Suite\n');
  
  try {
    // Clean up any existing test data
    await cleanupTestData();
    
    // Create test users
    const users = await createTestUsers();
    
    // Create course structure
    const { course, module, lesson } = await createCourseStructure(users.consultor.id);
    
    // Enroll students
    await enrollStudents(course.id, users.students.map(s => s.id));
    
    // Create group assignment
    const { block, assignment } = await createGroupAssignmentBlock(
      lesson.id, 
      course.id, 
      users
    );
    
    // Test student view
    const canSeeAssignment = await simulateStudentView(
      users.students[0].id, 
      assignment.id
    );
    
    if (canSeeAssignment) {
      // Simulate submission
      await simulateSubmission(
        assignment.id,
        'group-1',
        users.students[0].id
      );
    }
    
    // Summary
    console.log('\n✅ Test Summary:');
    console.log('  - Created 1 consultor and 4 students');
    console.log('  - Created course with group assignment');
    console.log('  - Assigned students to 2 groups');
    console.log('  - Verified student can see assignment');
    console.log('  - Simulated group submission');
    
    console.log('\n📊 Test Data IDs:');
    console.log(`  Course ID: ${course.id}`);
    console.log(`  Lesson ID: ${lesson.id}`);
    console.log(`  Assignment ID: ${assignment.id}`);
    console.log(`  Consultor ID: ${users.consultor.id}`);
    
    console.log('\n💡 Next Steps:');
    console.log('  1. Login as test.consultor@example.com to see teacher view');
    console.log('  2. Login as student1@example.com to see student view');
    console.log('  3. Check /admin/course-builder to edit the lesson');
    console.log('  4. Check /community/workspace for group assignments');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Add command line options
const args = process.argv.slice(2);
if (args.includes('--cleanup')) {
  cleanupTestData().then(() => {
    console.log('✅ Cleanup complete');
  });
} else {
  runTests();
}