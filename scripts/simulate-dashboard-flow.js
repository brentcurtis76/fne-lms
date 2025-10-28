const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

const danielId = '351f761f-33db-4b98-80db-e7bc1469814b';
const problematicCourseId = 'cfb259f8-5e59-4a2f-a842-a36f2f84ef90';

async function simulateDashboard() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SIMULATING DASHBOARD FLOW FOR DANIEL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Step 1: Fetch learning paths (simulating /api/learning-paths/my-paths)
  console.log('STEP 1: Fetching Daniel\'s learning paths...\n');

  const { data: assignments } = await adminClient
    .from('learning_path_assignments')
    .select('*, learning_paths(*)')
    .eq('user_id', danielId);

  console.log(`Found ${assignments?.length || 0} assignments`);

  const pathMap = new Map();
  (assignments || []).forEach((assignment) => {
    if (assignment.learning_paths && !pathMap.has(assignment.learning_paths.id)) {
      pathMap.set(assignment.learning_paths.id, {
        id: assignment.learning_paths.id,
        name: assignment.learning_paths.name,
        description: assignment.learning_paths.description
      });
    }
  });

  const paths = Array.from(pathMap.values());

  console.log(`\nUnique learning paths: ${paths.length}`);
  paths.forEach((path, i) => {
    console.log(`  ${i+1}. "${path.name}"`);
    console.log(`     ID: ${path.id}`);
  });
  console.log();

  // Step 2: For each path, get courses (simulating dashboard.tsx lines 309-317)
  console.log('STEP 2: Fetching courses from each learning path...\n');

  const pathCourseIds = new Set();

  for (const path of paths) {
    console.log(`Querying learning_path_courses WHERE learning_path_id = '${path.id}'`);

    const { data: pathCoursesData, error } = await adminClient
      .from('learning_path_courses')
      .select('course_id, courses(title, status)')
      .eq('learning_path_id', path.id);

    if (error) {
      console.log(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  Found ${pathCoursesData?.length || 0} courses`);

      if (pathCoursesData) {
        pathCoursesData.forEach(pc => {
          pathCourseIds.add(pc.course_id);
          const match = pc.course_id === problematicCourseId ? ' ⭐ PROBLEMATIC COURSE!' : '';
          console.log(`    - ${pc.courses.title} (${pc.courses.status})${match}`);
        });
      }
    }
    console.log();
  }

  console.log(`Total unique courses collected: ${pathCourseIds.size}\n`);

  // Step 3: Check if problematic course is in the set
  console.log('STEP 3: Checking if problematic course is in the set...\n');

  if (pathCourseIds.has(problematicCourseId)) {
    console.log('❌ PROBLEMATIC COURSE IS IN THE SET!');
    console.log('   This explains why Daniel sees it on the dashboard.');
    console.log();

    // Find which path it came from
    for (const path of paths) {
      const { data: check } = await adminClient
        .from('learning_path_courses')
        .select('course_id')
        .eq('learning_path_id', path.id)
        .eq('course_id', problematicCourseId);

      if (check && check.length > 0) {
        console.log(`   Found in path: "${path.name}" (${path.id})`);
      }
    }
  } else {
    console.log('✅ Problematic course is NOT in the set.');
    console.log('   The issue must be elsewhere.');
  }
  console.log();

  // Step 4: Check which learning path actually contains the problematic course
  console.log('STEP 4: Finding which learning path contains the problematic course...\n');

  const { data: actualPath } = await adminClient
    .from('learning_path_courses')
    .select('learning_path_id, learning_paths(name)')
    .eq('course_id', problematicCourseId)
    .single();

  if (actualPath) {
    console.log(`Course is in: "${actualPath.learning_paths.name}"`);
    console.log(`Path ID: ${actualPath.learning_path_id}`);

    const danielHasThisPath = paths.some(p => p.id === actualPath.learning_path_id);
    console.log(`Daniel is assigned to this path: ${danielHasThisPath ? 'YES ✅' : 'NO ❌'}`);
  }
  console.log();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CONCLUSION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('If problematic course appeared in STEP 2, then the dashboard');
  console.log('logic is working correctly and Daniel IS assigned to a learning');
  console.log('path containing that course.\n');

  console.log('If problematic course did NOT appear in STEP 2, then the bug is');
  console.log('elsewhere - possibly in RLS policies or frontend logic.');
}

simulateDashboard().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
