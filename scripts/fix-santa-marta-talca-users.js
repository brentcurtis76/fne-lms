const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function fixSantaMartaTalcaUsers() {
  console.log('🔧 FIXING SANTA MARTA DE TALCA USER ASSIGNMENTS');
  console.log('=' + '='.repeat(60));
  
  const SANTA_MARTA_TALCA_ID = 25;
  
  // 1. First, verify the school exists
  const { data: school } = await supabase
    .from('schools')
    .select('id, name')
    .eq('id', SANTA_MARTA_TALCA_ID)
    .single();
    
  if (!school) {
    console.log('❌ School with ID 25 not found!');
    return;
  }
  
  console.log(`\n✅ Target School: ${school.name} (ID: ${school.id})`);
  
  // 2. Get all users with @liceosantamartatalca.cl email and NULL school_id
  const { data: usersToFix, count } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, school_id', { count: 'exact' })
    .like('email', '%@liceosantamartatalca.cl%')
    .is('school_id', null);
    
  console.log(`\n📋 Found ${count} users to fix:`);
  
  if (usersToFix && usersToFix.length > 0) {
    usersToFix.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.first_name} ${user.last_name} (${user.email})`);
    });
    
    // 3. Update all users with the correct school_id
    console.log('\n🔄 Updating users with correct school_id...');
    
    const userIds = usersToFix.map(u => u.id);
    
    const { data: updated, error } = await supabase
      .from('profiles')
      .update({ school_id: SANTA_MARTA_TALCA_ID })
      .in('id', userIds)
      .select();
      
    if (error) {
      console.log('❌ Error updating users:', error);
      return;
    }
    
    console.log(`✅ Successfully updated ${updated?.length || 0} users`);
    
    // 4. Verify the fix
    console.log('\n📊 VERIFICATION:');
    
    const { count: fixedCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', SANTA_MARTA_TALCA_ID);
      
    console.log(`  Users now assigned to Santa Marta de Talca: ${fixedCount}`);
    
    // 5. Check if learning paths are assigned to this school
    console.log('\n🎯 CHECKING LEARNING PATHS FOR SCHOOL:');
    
    const { data: learningPaths } = await supabase
      .from('learning_paths')
      .select('id, title, school_ids, is_active')
      .or(`school_ids.cs.{${SANTA_MARTA_TALCA_ID}}`, 'is_global.eq.true');
      
    if (learningPaths && learningPaths.length > 0) {
      console.log(`  Found ${learningPaths.length} learning paths for this school:`);
      learningPaths.forEach(path => {
        const hasSchool = path.school_ids && path.school_ids.includes(SANTA_MARTA_TALCA_ID);
        console.log(`    - ${path.title}`);
        console.log(`      Active: ${path.is_active}, Assigned to school: ${hasSchool}`);
      });
      
      // 6. Check if users need to be enrolled in learning paths
      console.log('\n📚 CHECKING USER ENROLLMENTS:');
      
      // Check one user as example
      const sampleUser = usersToFix[0];
      const { data: enrollments } = await supabase
        .from('learning_path_enrollments')
        .select('learning_path_id, status')
        .eq('user_id', sampleUser.id);
        
      if (enrollments && enrollments.length > 0) {
        console.log(`  Sample user (${sampleUser.email}) has ${enrollments.length} enrollments`);
      } else {
        console.log(`  ⚠️ Sample user has NO learning path enrollments`);
        console.log('  Users may need to be enrolled in learning paths after school assignment');
      }
    } else {
      console.log('  ⚠️ No learning paths found for this school!');
      console.log('  Learning paths need to be assigned to school_id: 25');
    }
    
  } else {
    console.log('  No users found needing fixes');
  }
  
  console.log('\n✅ FIX COMPLETE!');
  console.log('  All users with @liceosantamartatalca.cl emails now have school_id = 25');
  console.log('  Next step: Ensure learning paths are assigned to school_id 25');
}

fixSantaMartaTalcaUsers().catch(console.error);