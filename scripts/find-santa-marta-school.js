const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function findSchool() {
  console.log('🏫 FINDING SANTA MARTA DE TALCA SCHOOL');
  console.log('=' + '='.repeat(60));
  
  // 1. Search for schools with "Santa Marta" and "Talca" in the name
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name, code, created_at')
    .or('name.ilike.%santa%marta%,name.ilike.%talca%')
    .order('name');
    
  console.log('\n📚 SCHOOLS MATCHING "SANTA MARTA" OR "TALCA":');
  if (schools && schools.length > 0) {
    schools.forEach(school => {
      console.log(`  - ${school.name}`);
      console.log(`    ID: ${school.id}`);
      console.log(`    Code: ${school.code}`);
    });
  } else {
    console.log('  No schools found matching those terms');
  }
  
  // 2. Look for users with similar email domain to find the school
  console.log('\n👥 CHECKING USERS WITH SIMILAR EMAIL DOMAIN:');
  const { data: similarUsers } = await supabase
    .from('profiles')
    .select('id, email, school_id, first_name, last_name')
    .like('email', '%liceosantamartatalca.cl')
    .limit(10);
    
  if (similarUsers && similarUsers.length > 0) {
    console.log(`  Found ${similarUsers.length} users with @liceosantamartatalca.cl domain:`);
    
    // Group by school_id to see the pattern
    const schoolGroups = {};
    similarUsers.forEach(user => {
      const schoolId = user.school_id || 'NULL';
      if (!schoolGroups[schoolId]) {
        schoolGroups[schoolId] = [];
      }
      schoolGroups[schoolId].push(user);
    });
    
    for (const [schoolId, users] of Object.entries(schoolGroups)) {
      console.log(`\n  School ID: ${schoolId}`);
      console.log(`    ${users.length} users:`);
      users.slice(0, 3).forEach(user => {
        console.log(`      - ${user.first_name} ${user.last_name} (${user.email})`);
      });
      
      // If school_id is not null, get the school name
      if (schoolId !== 'NULL') {
        const { data: school } = await supabase
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .single();
        console.log(`    School Name: ${school?.name || 'Not found'}`);
      }
    }
  }
  
  // 3. Check if there's a specific pattern in the school assignment
  console.log('\n🔍 ANALYZING THE PROBLEM:');
  
  // Count users with null school_id from this domain
  const { count: nullSchoolCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .like('email', '%liceosantamartatalca.cl')
    .is('school_id', null);
    
  const { count: totalDomainCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .like('email', '%liceosantamartatalca.cl');
    
  console.log(`  Users with @liceosantamartatalca.cl domain: ${totalDomainCount}`);
  console.log(`  Users with NULL school_id: ${nullSchoolCount}`);
  console.log(`  Users with assigned school_id: ${totalDomainCount - nullSchoolCount}`);
  
  // 4. Check recent bulk enrollments to see if Santa Marta was targeted
  console.log('\n📋 CHECKING RECENT BULK ENROLLMENTS:');
  const { data: recentBulkEnrollments } = await supabase
    .from('bulk_enrollments')
    .select(`
      id,
      school_id,
      learning_path_id,
      user_count,
      status,
      created_at,
      schools (
        name
      ),
      learning_paths (
        title
      )
    `)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (recentBulkEnrollments && recentBulkEnrollments.length > 0) {
    console.log('  Recent bulk enrollments:');
    recentBulkEnrollments.forEach(be => {
      console.log(`    - ${be.schools?.name || 'Unknown School'}`);
      console.log(`      Path: ${be.learning_paths?.title}`);
      console.log(`      Users: ${be.user_count}, Status: ${be.status}`);
      console.log(`      Date: ${be.created_at}`);
    });
  }
  
  // 5. Look for the most likely school ID based on users who DO have it assigned
  console.log('\n🎯 DETERMINING CORRECT SCHOOL ID:');
  const { data: assignedUsers } = await supabase
    .from('profiles')
    .select('school_id')
    .like('email', '%liceosantamartatalca.cl')
    .not('school_id', 'is', null)
    .limit(1);
    
  if (assignedUsers && assignedUsers.length > 0) {
    const correctSchoolId = assignedUsers[0].school_id;
    const { data: correctSchool } = await supabase
      .from('schools')
      .select('*')
      .eq('id', correctSchoolId)
      .single();
      
    console.log('  ✅ FOUND THE CORRECT SCHOOL:');
    console.log('    ID:', correctSchool.id);
    console.log('    Name:', correctSchool.name);
    console.log('    Code:', correctSchool.code);
    
    // Count how many users need fixing
    console.log('\n  🔧 USERS THAT NEED SCHOOL_ID FIXED:');
    console.log(`    ${nullSchoolCount} users have NULL school_id`);
    console.log(`    They should all be assigned to: ${correctSchool.name}`);
  } else {
    console.log('  ❌ Could not determine correct school - all users have NULL school_id');
  }
}

findSchool().catch(console.error);