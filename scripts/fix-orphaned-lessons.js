const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixOrphanedLessons() {
  console.log('🔧 Fixing orphaned lessons without course_id...\n');
  
  try {
    // Get all lessons without course_id
    const { data: orphanedLessons, error: fetchError } = await supabase
      .from('lessons')
      .select('id, title, module_id')
      .is('course_id', null);
    
    if (fetchError) {
      console.error('Error fetching orphaned lessons:', fetchError);
      return;
    }
    
    if (!orphanedLessons || orphanedLessons.length === 0) {
      console.log('✅ No orphaned lessons found!');
      return;
    }
    
    console.log(`Found ${orphanedLessons.length} orphaned lessons:`);
    orphanedLessons.forEach(l => {
      console.log(`  - ${l.id}: ${l.title} (module_id: ${l.module_id})`);
    });
    
    // Try to fix each orphaned lesson
    for (const lesson of orphanedLessons) {
      if (lesson.module_id) {
        // Get course_id from the module
        const { data: module, error: moduleError } = await supabase
          .from('modules')
          .select('course_id, title')
          .eq('id', lesson.module_id)
          .single();
        
        if (!moduleError && module && module.course_id) {
          // Update the lesson with the course_id
          const { error: updateError } = await supabase
            .from('lessons')
            .update({ course_id: module.course_id })
            .eq('id', lesson.id);
          
          if (updateError) {
            console.error(`❌ Error updating lesson ${lesson.id}:`, updateError);
          } else {
            console.log(`✅ Fixed lesson "${lesson.title}" with course_id from module "${module.title}"`);
          }
        } else {
          console.log(`⚠️ Could not find module ${lesson.module_id} for lesson ${lesson.id}`);
        }
      } else {
        console.log(`⚠️ Lesson ${lesson.id} has no module_id - needs manual assignment`);
        
        // Let's see if we can find a course based on the lesson title or other criteria
        // For now, we'll log it for manual review
        console.log(`   Title: "${lesson.title}"`);
        console.log(`   This lesson needs to be manually assigned to a course`);
      }
    }
    
    // Verify the fix
    console.log('\n🔍 Verifying fix...');
    const { data: stillOrphaned, error: verifyError } = await supabase
      .from('lessons')
      .select('id, title')
      .is('course_id', null);
    
    if (!verifyError) {
      if (stillOrphaned && stillOrphaned.length > 0) {
        console.log(`\n⚠️ Still ${stillOrphaned.length} orphaned lessons:`);
        stillOrphaned.forEach(l => {
          console.log(`  - ${l.id}: ${l.title}`);
        });
        console.log('\nThese lessons need manual assignment to a course.');
      } else {
        console.log('✅ All lessons now have course_id!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the fix
fixOrphanedLessons();