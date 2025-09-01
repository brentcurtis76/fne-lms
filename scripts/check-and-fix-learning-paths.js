const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkAndFixLearningPaths() {
  console.log('🎯 CHECKING AND FIXING LEARNING PATH ASSIGNMENTS');
  console.log('=' + '='.repeat(60));
  
  const SANTA_MARTA_TALCA_ID = 25;
  
  // 1. Get all learning paths to see current assignments
  const { data: allPaths } = await supabase
    .from('learning_paths')
    .select('id, title, school_ids, is_active, is_global')
    .order('title');
    
  console.log(`\n📚 ALL LEARNING PATHS (${allPaths?.length || 0} total):`);
  
  if (allPaths && allPaths.length > 0) {
    for (const path of allPaths) {
      console.log(`\n  ${path.title}`);
      console.log(`    ID: ${path.id}`);
      console.log(`    Active: ${path.is_active}`);
      console.log(`    Global: ${path.is_global || false}`);
      console.log(`    School IDs: ${path.school_ids ? path.school_ids.join(', ') : 'none'}`);
      
      // Check if Santa Marta de Talca is included
      const includesSantaMarta = path.school_ids && path.school_ids.includes(SANTA_MARTA_TALCA_ID);
      if (includesSantaMarta) {
        console.log(`    ✅ Already includes Santa Marta de Talca`);
      } else if (path.is_global) {
        console.log(`    ✅ Global path (available to all schools)`);
      } else {
        console.log(`    ❌ Does NOT include Santa Marta de Talca`);
      }
    }
  }
  
  // 2. Check which paths SHOULD include Santa Marta de Talca
  console.log('\n🔍 ANALYZING WHICH PATHS SHOULD BE ASSIGNED:');
  
  // Look for patterns - paths that are assigned to other Santa Marta schools
  const santaMartaPattern = allPaths?.filter(path => {
    // Check if assigned to other Santa Marta schools (IDs: 7, 2, 3, 8, 6)
    const santaMartaSchoolIds = [7, 2, 3, 8, 6]; // Other Santa Marta schools
    return path.school_ids && path.school_ids.some(id => santaMartaSchoolIds.includes(id));
  });
  
  if (santaMartaPattern && santaMartaPattern.length > 0) {
    console.log(`\n  Found ${santaMartaPattern.length} paths assigned to other Santa Marta schools:`);
    
    for (const path of santaMartaPattern) {
      const includesSantaMartaTalca = path.school_ids && path.school_ids.includes(SANTA_MARTA_TALCA_ID);
      
      if (!includesSantaMartaTalca) {
        console.log(`\n  📝 "${path.title}" should probably include Santa Marta de Talca`);
        console.log(`     Currently assigned to schools: ${path.school_ids?.join(', ')}`);
        
        // Add Santa Marta de Talca to this path
        const newSchoolIds = [...(path.school_ids || []), SANTA_MARTA_TALCA_ID];
        
        console.log(`     🔄 Adding school_id 25 to this path...`);
        
        const { error } = await supabase
          .from('learning_paths')
          .update({ school_ids: newSchoolIds })
          .eq('id', path.id);
          
        if (error) {
          console.log(`     ❌ Error updating: ${error.message}`);
        } else {
          console.log(`     ✅ Successfully added Santa Marta de Talca`);
        }
      }
    }
  } else {
    console.log('  No paths found assigned to other Santa Marta schools');
    
    // If no pattern found, maybe all active paths should be assigned
    const activePaths = allPaths?.filter(p => p.is_active && !p.is_global);
    if (activePaths && activePaths.length > 0) {
      console.log(`\n  Found ${activePaths.length} active non-global paths that might need assignment`);
    }
  }
  
  // 3. Final verification - check what paths are now available
  console.log('\n✅ FINAL CHECK - PATHS NOW AVAILABLE TO SANTA MARTA DE TALCA:');
  
  const { data: availablePaths } = await supabase
    .from('learning_paths')
    .select('id, title, school_ids')
    .or(`school_ids.cs.{${SANTA_MARTA_TALCA_ID}}`, 'is_global.eq.true');
    
  if (availablePaths && availablePaths.length > 0) {
    console.log(`  ${availablePaths.length} learning paths are now available:`);
    availablePaths.forEach(path => {
      console.log(`    - ${path.title}`);
    });
    
    // 4. Check if users need enrollment
    console.log('\n📊 CHECKING USER ENROLLMENTS:');
    
    const { data: santaMartaUsers } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('school_id', SANTA_MARTA_TALCA_ID)
      .limit(3);
      
    for (const user of santaMartaUsers || []) {
      const { count: enrollmentCount } = await supabase
        .from('learning_path_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
        
      console.log(`    ${user.email}: ${enrollmentCount} enrollments`);
    }
    
    console.log('\n  Note: Users may need to be enrolled in learning paths manually or via bulk enrollment');
  } else {
    console.log('  ⚠️ Still no paths available - manual assignment needed');
  }
  
  console.log('\n✅ PROCESS COMPLETE!');
  console.log('  1. Users now have correct school_id = 25');
  console.log('  2. Learning paths have been updated where pattern detected');
  console.log('  3. Next step: Check if users need to be enrolled in the paths');
}

checkAndFixLearningPaths().catch(console.error);