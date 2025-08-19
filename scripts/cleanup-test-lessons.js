const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupTestLessons() {
  console.log('🧹 Cleaning up test lessons without course or module...\n');
  
  try {
    // Get orphaned test lessons
    const testLessonIds = [
      'c6b41c28-9ae3-4150-b243-7e4b07da1777', // My First Lesson
      '90c8acd3-cf2b-4c54-85c5-3e98384f47a4', // Lesson from Code
      '05bfaf95-2871-46f5-8db1-6ecb4c908934', // Lesson from Code
      'a493c3af-5f87-4b60-ac22-7e3dcf26b89d'  // Lesson from Code
    ];
    
    console.log('These appear to be test lessons created during development:');
    console.log('- "My First Lesson" - likely a test');
    console.log('- "Lesson from Code" (3 instances) - clearly test data');
    console.log('\nThey have no module_id or course_id, making them orphaned.');
    
    // First, delete any blocks associated with these lessons
    console.log('\n1️⃣ Deleting blocks for test lessons...');
    const { data: deletedBlocks, error: blocksError } = await supabase
      .from('blocks')
      .delete()
      .in('lesson_id', testLessonIds);
    
    if (blocksError) {
      console.error('Error deleting blocks:', blocksError);
    } else {
      console.log('✅ Blocks deleted');
    }
    
    // Delete any lesson_progress for these lessons
    console.log('\n2️⃣ Deleting progress records...');
    const { data: deletedProgress, error: progressError } = await supabase
      .from('lesson_progress')
      .delete()
      .in('lesson_id', testLessonIds);
    
    if (progressError) {
      console.error('Error deleting progress:', progressError);
    } else {
      console.log('✅ Progress records deleted');
    }
    
    // Now delete the lessons themselves
    console.log('\n3️⃣ Deleting test lessons...');
    const { data: deletedLessons, error: lessonsError } = await supabase
      .from('lessons')
      .delete()
      .in('id', testLessonIds);
    
    if (lessonsError) {
      console.error('Error deleting lessons:', lessonsError);
    } else {
      console.log('✅ Test lessons deleted');
    }
    
    // Verify cleanup
    console.log('\n🔍 Verifying cleanup...');
    const { data: remainingOrphans, error: verifyError } = await supabase
      .from('lessons')
      .select('id, title')
      .is('course_id', null);
    
    if (!verifyError) {
      if (remainingOrphans && remainingOrphans.length > 0) {
        console.log(`⚠️ Still ${remainingOrphans.length} orphaned lessons:`);
        remainingOrphans.forEach(l => {
          console.log(`  - ${l.id}: ${l.title}`);
        });
      } else {
        console.log('✅ No more orphaned lessons! Database is clean.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the cleanup
cleanupTestLessons();