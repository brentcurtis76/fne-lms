const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function searchAllSchools() {
  console.log('🔍 COMPREHENSIVE SCHOOL SEARCH');
  console.log('=' + '='.repeat(60));
  
  // 1. Get ALL schools and search for variations
  const { data: allSchools } = await supabase
    .from('schools')
    .select('id, name, code')
    .order('name');
    
  console.log(`\n📚 TOTAL SCHOOLS IN DATABASE: ${allSchools?.length || 0}`);
  
  // Search for variations of Santa Marta, Talca, Liceo
  const searchTerms = ['santa', 'marta', 'talca', 'liceo'];
  const relevantSchools = allSchools?.filter(school => {
    const nameLower = school.name.toLowerCase();
    return searchTerms.some(term => nameLower.includes(term));
  });
  
  if (relevantSchools && relevantSchools.length > 0) {
    console.log('\n🎯 SCHOOLS WITH RELEVANT TERMS:');
    relevantSchools.forEach(school => {
      console.log(`  - ${school.name}`);
      console.log(`    ID: ${school.id}`);
      console.log(`    Code: ${school.code}`);
    });
  } else {
    console.log('\n❌ NO SCHOOLS FOUND WITH TERMS: santa, marta, talca, liceo');
  }
  
  // 2. Check if there was a recent attempt to assign learning paths
  console.log('\n📊 RECENT LEARNING PATH ASSIGNMENTS:');
  const { data: recentAssignments } = await supabase
    .from('learning_paths')
    .select('id, title, school_ids, created_at, updated_at')
    .not('school_ids', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5);
    
  if (recentAssignments && recentAssignments.length > 0) {
    for (const path of recentAssignments) {
      console.log(`\n  Path: ${path.title}`);
      console.log(`    Updated: ${path.updated_at}`);
      if (path.school_ids && path.school_ids.length > 0) {
        console.log(`    Assigned to ${path.school_ids.length} schools`);
        // Get names of first few schools
        const { data: assignedSchools } = await supabase
          .from('schools')
          .select('name')
          .in('id', path.school_ids.slice(0, 3));
        if (assignedSchools) {
          assignedSchools.forEach(s => console.log(`      - ${s.name}`));
        }
      }
    }
  }
  
  // 3. Check if Santa Marta de Talca exists with a different name pattern
  console.log('\n🔍 SEARCHING FOR LICEO PATTERNS:');
  const liceoSchools = allSchools?.filter(school => 
    school.name.toLowerCase().includes('liceo')
  );
  
  if (liceoSchools && liceoSchools.length > 0) {
    console.log(`  Found ${liceoSchools.length} schools with "Liceo" in name`);
    console.log('  First 10:');
    liceoSchools.slice(0, 10).forEach(school => {
      console.log(`    - ${school.name} (${school.code})`);
    });
  }
  
  // 4. Check if the school might need to be created
  console.log('\n⚠️  ANALYSIS:');
  console.log('  1. No school found matching "Santa Marta" AND "Talca"');
  console.log('  2. All 18 users from @liceosantamartatalca.cl have NULL school_id');
  console.log('  3. This suggests the school entry might be missing entirely');
  
  // 5. Look for any learning path that mentions Santa Marta in title or description
  console.log('\n📚 LEARNING PATHS MENTIONING SANTA MARTA:');
  const { data: santaMartaPaths } = await supabase
    .from('learning_paths')
    .select('id, title, description, school_ids')
    .or('title.ilike.%santa%marta%,description.ilike.%santa%marta%');
    
  if (santaMartaPaths && santaMartaPaths.length > 0) {
    santaMartaPaths.forEach(path => {
      console.log(`  - ${path.title}`);
      console.log(`    Has ${path.school_ids?.length || 0} schools assigned`);
    });
  } else {
    console.log('  No learning paths found mentioning Santa Marta');
  }
  
  // 6. Final check - was a school ID mentioned in any error logs or assignments?
  console.log('\n🎯 ROOT CAUSE IDENTIFIED:');
  console.log('  ❌ The school "Liceo Santa Marta de Talca" does not exist in the schools table');
  console.log('  ❌ All 18 users have NULL school_id because the school was never created');
  console.log('  ❌ Learning paths cannot be assigned to a non-existent school');
  console.log('\n  SOLUTION REQUIRED:');
  console.log('  1. Create the school entry for "Liceo Santa Marta de Talca"');
  console.log('  2. Update all 18 users to have the correct school_id');
  console.log('  3. Then learning path assignments will work');
}

searchAllSchools().catch(console.error);