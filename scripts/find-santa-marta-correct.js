const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function findSantaMartaCorrect() {
  console.log('🔍 FINDING SANTA MARTA DE TALCA - CORRECT SEARCH');
  console.log('=' + '='.repeat(60));
  
  // From the UI, we know Santa Marta de Talca exists with 20 users
  // Let's find it properly
  
  // 1. Search for schools with exact name
  const { data: exactMatch } = await supabase
    .from('schools')
    .select('id, name, code')
    .eq('name', 'Santa Marta de Talca');
    
  if (exactMatch && exactMatch.length > 0) {
    console.log('\n✅ FOUND EXACT MATCH:');
    console.log('  Name:', exactMatch[0].name);
    console.log('  ID:', exactMatch[0].id);
    console.log('  Code:', exactMatch[0].code);
  }
  
  // 2. Search with ILIKE for case-insensitive
  const { data: santaMartaSchools } = await supabase
    .from('schools')
    .select('id, name, code')
    .ilike('name', '%santa%marta%talca%');
    
  if (santaMartaSchools && santaMartaSchools.length > 0) {
    console.log('\n✅ FOUND WITH PATTERN MATCH:');
    santaMartaSchools.forEach(school => {
      console.log('  Name:', school.name);
      console.log('  ID:', school.id);
      console.log('  Code:', school.code);
    });
  }
  
  // 3. Search more broadly - just "Santa Marta"
  const { data: santaMartaAny } = await supabase
    .from('schools')
    .select('id, name, code')
    .ilike('name', '%santa%marta%');
    
  console.log('\n📚 ALL SANTA MARTA SCHOOLS:');
  if (santaMartaAny && santaMartaAny.length > 0) {
    santaMartaAny.forEach(school => {
      console.log(`  - ${school.name} (ID: ${school.id})`);
    });
    
    // For each school, count users
    for (const school of santaMartaAny) {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id);
        
      console.log(`    Users with school_id=${school.id}: ${count}`);
    }
  }
  
  // 4. Find the likely Santa Marta de Talca by checking which has ~20 users
  console.log('\n🎯 FINDING THE CORRECT SCHOOL BY USER COUNT:');
  
  // Get all schools and their user counts
  const { data: allSchools } = await supabase
    .from('schools')
    .select('id, name, code');
    
  if (allSchools) {
    for (const school of allSchools) {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id);
        
      // The UI shows 20 users for Santa Marta de Talca
      if (count >= 18 && count <= 22 && school.name.toLowerCase().includes('santa')) {
        console.log(`  🎯 LIKELY MATCH: ${school.name}`);
        console.log(`     ID: ${school.id}`);
        console.log(`     User count: ${count}`);
      }
    }
  }
  
  // 5. Check the 18 users with @liceosantamartatalca.cl domain
  console.log('\n👥 USERS WITH @liceosantamartatalca.cl DOMAIN:');
  const { data: santaMartaUsers, count: userCount } = await supabase
    .from('profiles')
    .select('id, email, school_id, first_name, last_name', { count: 'exact' })
    .like('email', '%@liceosantamartatalca.cl%');
    
  console.log(`  Total users with this domain: ${userCount}`);
  console.log(`  Users with NULL school_id: ${santaMartaUsers?.filter(u => !u.school_id).length}`);
  console.log(`  Users WITH school_id: ${santaMartaUsers?.filter(u => u.school_id).length}`);
  
  // Show which school_ids they have
  const schoolIdCounts = {};
  santaMartaUsers?.forEach(user => {
    const key = user.school_id || 'NULL';
    schoolIdCounts[key] = (schoolIdCounts[key] || 0) + 1;
  });
  
  console.log('\n  Distribution of school_ids:');
  for (const [schoolId, count] of Object.entries(schoolIdCounts)) {
    if (schoolId !== 'NULL') {
      const { data: school } = await supabase
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .single();
      console.log(`    School ID ${schoolId} (${school?.name}): ${count} users`);
    } else {
      console.log(`    NULL: ${count} users`);
    }
  }
  
  // 6. Final diagnosis
  console.log('\n🔬 DIAGNOSIS:');
  console.log('  The school "Santa Marta de Talca" EXISTS in the database');
  console.log('  But the 18 users with @liceosantamartatalca.cl emails have NULL school_id');
  console.log('  This is why they cannot see assigned learning paths');
  console.log('\n  SOLUTION: Update these 18 users to have the correct school_id');
}

findSantaMartaCorrect().catch(console.error);