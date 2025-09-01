const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function verifyCriticalIssue() {
  console.log('🚨 CRITICAL VERIFICATION - DATABASE STATE CHECK');
  console.log('=' + '='.repeat(60));
  
  // 1. Count schools
  const { count: schoolCount, error: schoolError } = await supabase
    .from('schools')
    .select('*', { count: 'exact', head: true });
    
  console.log('\n📚 SCHOOLS TABLE:');
  console.log(`  Total schools: ${schoolCount}`);
  if (schoolError) {
    console.log('  Error:', schoolError.message);
  }
  
  // 2. Count learning paths
  const { count: pathCount } = await supabase
    .from('learning_paths')
    .select('*', { count: 'exact', head: true });
    
  console.log('\n🎯 LEARNING PATHS:');
  console.log(`  Total learning paths: ${pathCount}`);
  
  // 3. Count users with school assignments
  const { count: usersWithSchool } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('school_id', 'is', null);
    
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
    
  console.log('\n👥 USER STATISTICS:');
  console.log(`  Total users: ${totalUsers}`);
  console.log(`  Users WITH school_id: ${usersWithSchool}`);
  console.log(`  Users WITHOUT school_id: ${totalUsers - usersWithSchool}`);
  
  // 4. Check if there are ANY non-null school_ids in profiles
  const { data: sampleSchoolIds } = await supabase
    .from('profiles')
    .select('school_id')
    .not('school_id', 'is', null)
    .limit(5);
    
  if (sampleSchoolIds && sampleSchoolIds.length > 0) {
    console.log('\n🔍 SAMPLE SCHOOL IDs FROM PROFILES:');
    sampleSchoolIds.forEach(p => {
      console.log(`  - ${p.school_id}`);
    });
    
    // Try to find these schools
    const schoolIds = [...new Set(sampleSchoolIds.map(p => p.school_id))];
    const { data: foundSchools } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);
      
    if (foundSchools && foundSchools.length > 0) {
      console.log('\n  These schools exist:');
      foundSchools.forEach(s => console.log(`    - ${s.name}`));
    } else {
      console.log('\n  ❌ These school IDs do not exist in schools table!');
    }
  }
  
  // 5. Check bulk_enrollments table
  const { count: bulkEnrollmentCount } = await supabase
    .from('bulk_enrollments')
    .select('*', { count: 'exact', head: true });
    
  console.log('\n📋 BULK ENROLLMENTS:');
  console.log(`  Total bulk enrollment records: ${bulkEnrollmentCount}`);
  
  // 6. Check what tables exist
  console.log('\n🗄️ CHECKING TABLE EXISTENCE:');
  
  // Try to query each table to see if it exists
  const tables = ['schools', 'communities', 'organizations', 'networks'];
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .select('id')
      .limit(1);
      
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
      console.log(`  ❌ Table "${table}" does not exist`);
    } else if (error) {
      console.log(`  ⚠️ Table "${table}" exists but has error: ${error.message}`);
    } else {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      console.log(`  ✅ Table "${table}" exists with ${count} records`);
    }
  }
  
  // 7. Final diagnosis
  console.log('\n🔬 DIAGNOSIS:');
  if (schoolCount === 0) {
    console.log('  🚨 CRITICAL: The schools table is EMPTY!');
    console.log('  This explains why:');
    console.log('    - Users have NULL school_id');
    console.log('    - Learning paths cannot be assigned');
    console.log('    - No courses are visible to users');
    console.log('\n  ROOT CAUSE: Database appears to be missing school data entirely');
    console.log('  This might be a test/staging database or data was deleted');
  } else {
    console.log(`  Schools table has ${schoolCount} entries`);
  }
}

verifyCriticalIssue().catch(console.error);