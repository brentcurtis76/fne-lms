const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function listAllSchools() {
  console.log('📚 LISTING ALL SCHOOLS IN DATABASE');
  console.log('=' + '='.repeat(60));
  
  // Get ALL schools without any filter
  const { data: schools, error, count } = await supabase
    .from('schools')
    .select('*', { count: 'exact' })
    .order('name');
    
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  console.log(`\nTotal schools found: ${count}\n`);
  
  if (schools && schools.length > 0) {
    for (const school of schools) {
      console.log(`ID: ${school.id}`);
      console.log(`Name: ${school.name}`);
      console.log(`Code: ${school.code || 'N/A'}`);
      
      // Count users for this school
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id);
        
      console.log(`Users: ${userCount}`);
      console.log('-'.repeat(40));
    }
  } else {
    console.log('No schools found!');
  }
  
  // Also check if there are users with school_ids that don't exist
  console.log('\n🔍 CHECKING FOR ORPHANED SCHOOL_IDs:');
  const { data: uniqueSchoolIds } = await supabase
    .from('profiles')
    .select('school_id')
    .not('school_id', 'is', null);
    
  if (uniqueSchoolIds) {
    const schoolIds = [...new Set(uniqueSchoolIds.map(p => p.school_id))];
    console.log(`\nUnique school_ids in profiles table: ${schoolIds.join(', ')}`);
    
    // Check if these exist in schools table
    const { data: existingSchools } = await supabase
      .from('schools')
      .select('id')
      .in('id', schoolIds);
      
    const existingIds = existingSchools?.map(s => s.id) || [];
    const orphanedIds = schoolIds.filter(id => !existingIds.includes(id));
    
    if (orphanedIds.length > 0) {
      console.log(`❌ Orphaned school_ids (exist in profiles but not in schools): ${orphanedIds.join(', ')}`);
    } else {
      console.log('✅ All school_ids in profiles exist in schools table');
    }
  }
}

listAllSchools().catch(console.error);