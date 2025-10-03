const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDatabaseStructure() {
  console.log('🔍 Verifying Database Structure\n');
  
  // Check if group_assignments column exists
  const { data: sampleAssignment, error } = await supabase
    .from('lesson_assignments')
    .select('id, title, assignment_type, group_assignments')
    .eq('assignment_type', 'group')
    .limit(1)
    .single();
    
  if (error && error.message.includes('column')) {
    console.log('❌ group_assignments column does not exist');
    console.log('   Run: database/simplify-group-assignments.sql');
    return false;
  }
  
  console.log('✅ lesson_assignments table has correct structure');
  
  // Check for old tables (should not exist in simplified version)
  const oldTables = [
    'group_assignment_members',
    'group_assignment_submissions',
    'group_assignment_discussions'
  ];
  
  console.log('\nChecking for old tables (should be removed):');
  for (const table of oldTables) {
    const { error: tableError } = await supabase
      .from(table)
      .select('count')
      .limit(1);
      
    if (!tableError) {
      console.log(`  ⚠️  ${table} still exists - consider removing`);
    } else {
      console.log(`  ✅ ${table} not found (good)`);
    }
  }
  
  return true;
}

async function checkBlockTypes() {
  console.log('\n📦 Checking Block Type Configuration\n');
  
  // This would need to be done through the application
  console.log('  ℹ️  Block types are configured in:');
  console.log('     - /config/blockTypes.ts');
  console.log('     - /types/blocks.ts');
  console.log('  ℹ️  Group Assignment block should appear in lesson editor');
}

async function findGroupAssignments() {
  console.log('\n📋 Finding Existing Group Assignments\n');
  
  const { data: assignments, error } = await supabase
    .from('lesson_assignments')
    .select(`
      id,
      title,
      assignment_type,
      assignment_for,
      group_assignments,
      created_at,
      courses!inner(title),
      lessons!inner(title)
    `)
    .eq('assignment_type', 'group')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching assignments:', error);
    return;
  }
  
  if (!assignments || assignments.length === 0) {
    console.log('  No group assignments found');
    console.log('  Run: node scripts/test-group-assignments-complete.js');
    return;
  }
  
  console.log(`Found ${assignments.length} group assignment(s):\n`);
  
  assignments.forEach((assignment, index) => {
    console.log(`${index + 1}. ${assignment.title}`);
    console.log(`   Course: ${assignment.courses?.title || 'N/A'}`);
    console.log(`   Lesson: ${assignment.lessons?.title || 'N/A'}`);
    console.log(`   Created: ${new Date(assignment.created_at).toLocaleDateString()}`);
    
    if (assignment.group_assignments) {
      const groups = assignment.group_assignments;
      console.log(`   Groups: ${groups.length}`);
      
      groups.forEach(group => {
        console.log(`     - ${group.group_name}: ${group.members.length} members`);
        if (group.submission) {
          console.log(`       ✅ Submitted on ${new Date(group.submission.submitted_at).toLocaleDateString()}`);
        }
      });
    }
    console.log('');
  });
}

async function checkUserRoles() {
  console.log('\n👥 Checking User Roles\n');
  
  const { data: roleCounts, error } = await supabase
    .from('profiles')
    .select('role')
    .order('role');
    
  if (error) {
    console.error('Error fetching roles:', error);
    return;
  }
  
  const counts = roleCounts.reduce((acc, { role }) => {
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  
  console.log('User counts by role:');
  Object.entries(counts).forEach(([role, count]) => {
    console.log(`  ${role}: ${count}`);
  });
  
  console.log('\nRemember:');
  console.log('  - consultores create assignments (teachers)');
  console.log('  - docentes submit assignments (students)');
}

async function testStudentQuery(studentId) {
  if (!studentId) {
    console.log('\n📚 To test student view, provide a student ID');
    return;
  }
  
  console.log(`\n📚 Testing student view for user ${studentId}\n`);
  
  // Direct query approach (since RPC might not exist)
  const { data: assignments, error } = await supabase
    .from('lesson_assignments')
    .select('*')
    .eq('assignment_type', 'group');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const studentAssignments = assignments.filter(a => {
    if (!a.group_assignments) return false;
    return a.group_assignments.some(g => 
      g.members.some(m => m.user_id === studentId)
    );
  });
  
  console.log(`Student can see ${studentAssignments.length} assignment(s)`);
  studentAssignments.forEach(a => {
    const group = a.group_assignments.find(g => 
      g.members.some(m => m.user_id === studentId)
    );
    console.log(`  - ${a.title}`);
    console.log(`    Group: ${group.group_name}`);
    console.log(`    Members: ${group.members.map(m => m.name).join(', ')}`);
  });
}

async function runVerification() {
  console.log('🚀 Group Assignments System Verification\n');
  
  await verifyDatabaseStructure();
  await checkBlockTypes();
  await findGroupAssignments();
  await checkUserRoles();
  
  // Optional: test specific student
  const studentId = process.argv[2];
  if (studentId) {
    await testStudentQuery(studentId);
  }
  
  console.log('\n✅ Verification complete');
}

runVerification();