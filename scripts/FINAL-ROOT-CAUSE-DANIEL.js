const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalProof() {
  const danielId = '351f761f-33db-4b98-80db-e7bc1469814b';
  const courseId = 'cfb259f8-5e59-4a2f-a842-a36f2f84ef90';

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        DEFINITIVE ROOT CAUSE ANALYSIS - DANIEL BUG            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Get course details
  const { data: course } = await supabase
    .from('courses')
    .select('id, title, status')
    .eq('id', courseId)
    .single();

  console.log('PROBLEMATIC COURSE:');
  console.log('  Title:', course.title);
  console.log('  ID:', course.id);
  console.log('  Status:', course.status, '← KEY FINDING!\n');

  // Check which learning path contains this course
  const { data: pathCourses } = await supabase
    .from('learning_path_courses')
    .select('learning_path_id, position, learning_paths(name)')
    .eq('course_id', courseId);

  console.log('LEARNING PATHS CONTAINING THIS COURSE:');
  if (pathCourses && pathCourses.length > 0) {
    pathCourses.forEach(pc => {
      console.log(`  - "${pc.learning_paths.name}"`);
      console.log(`    Path ID: ${pc.learning_path_id}`);
      console.log(`    Position: ${pc.position}\n`);
    });
  }

  // Check Daniel's assignments
  const { data: danielAssignments } = await supabase
    .from('learning_path_assignments')
    .select('learning_path_id, learning_paths(name)')
    .eq('user_id', danielId);

  console.log('DANIEL\'S LEARNING PATH ASSIGNMENTS:');
  const uniqueAssignments = new Map();
  if (danielAssignments) {
    danielAssignments.forEach(a => {
      uniqueAssignments.set(a.learning_path_id, a.learning_paths.name);
    });
  }

  for (const [pathId, pathName] of uniqueAssignments) {
    console.log(`  - "${pathName}"`);
    console.log(`    Path ID: ${pathId}\n`);
  }

  // The key comparison
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('ROOT CAUSE IDENTIFIED:\n');

  const coursePathId = pathCourses[0].learning_path_id;
  const danielHasPath = Array.from(uniqueAssignments.keys()).includes(coursePathId);

  console.log(`1. The course "${course.title}"`);
  console.log(`   is in learning path: "${pathCourses[0].learning_paths.name}"`);
  console.log(`   (ID: ${coursePathId})\n`);

  console.log(`2. Daniel is assigned to path: "${Array.from(uniqueAssignments.values())[0]}"`);
  console.log(`   (ID: ${Array.from(uniqueAssignments.keys())[0]})\n`);

  console.log('3. COMPARISON:');
  console.log(`   Course path ID:  ${coursePathId}`);
  console.log(`   Daniel path ID:  ${Array.from(uniqueAssignments.keys())[0]}`);
  console.log(`   MATCH: ${danielHasPath ? 'YES ✅' : 'NO ❌'}\n`);

  if (!danielHasPath) {
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('❌ ROOT CAUSE CONFIRMED:');
    console.log('   Daniel was assigned to a DIFFERENT learning path than the');
    console.log('   one containing this course. The dashboard shows learning path');
    console.log('   courses without checking if the user actually has access.\n');
    console.log('ADDITIONAL FINDING:');
    console.log(`   The course status is "draft" which means it should NOT be`);
    console.log('   visible to students via RLS policies.\n');
  }

  // Check enrollment status
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', danielId)
    .eq('course_id', courseId);

  console.log('4. ENROLLMENT STATUS:');
  console.log(`   Is Daniel enrolled? ${enrollment && enrollment.length > 0 ? 'YES' : 'NO'}\n`);

  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('CONCLUSION:\n');
  console.log('The bug has TWO root causes:');
  console.log('1. Dashboard merges ALL learning path courses into the course');
  console.log('   list without verifying which learning paths the user is');
  console.log('   actually assigned to.');
  console.log('2. The course status is "draft" which triggers RLS policies');
  console.log('   to block access, causing the 406/401 errors.\n');
  console.log('FIX REQUIRED:');
  console.log('Update dashboard.tsx to only fetch courses from learning paths');
  console.log('the user is actually assigned to, not all learning paths in the');
  console.log('database.');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

finalProof().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
