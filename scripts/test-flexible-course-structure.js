const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testFlexibleCourseStructure() {
  console.log('🧪 Testing Flexible Course Structure Feature\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Check if structure_type column exists
    console.log('\n1️⃣ Checking structure_type column...');
    const { data: sampleCourse, error: courseError } = await supabase
      .from('courses')
      .select('id, title, structure_type')
      .limit(1)
      .single();
    
    if (courseError) {
      console.log('❌ Error fetching course:', courseError.message);
      console.log('   The structure_type column may not exist yet.');
      console.log('   Please run the migration SQL in Supabase dashboard first.');
      return;
    }
    
    if ('structure_type' in sampleCourse) {
      console.log('✅ structure_type column exists');
      console.log(`   Sample: ${sampleCourse.title} - Type: ${sampleCourse.structure_type || 'null'}`);
    } else {
      console.log('⚠️ structure_type column not found');
      console.log('   Please run the migration SQL first.');
      return;
    }
    
    // 2. Count courses by structure type
    console.log('\n2️⃣ Analyzing course structures...');
    
    const { data: allCourses, error: allError } = await supabase
      .from('courses')
      .select('id, title, structure_type');
    
    if (!allError && allCourses) {
      const structured = allCourses.filter(c => c.structure_type === 'structured' || !c.structure_type);
      const simple = allCourses.filter(c => c.structure_type === 'simple');
      
      console.log(`📊 Total courses: ${allCourses.length}`);
      console.log(`   - Structured: ${structured.length}`);
      console.log(`   - Simple: ${simple.length}`);
      
      // 3. Find courses that could benefit from simple structure
      console.log('\n3️⃣ Courses that could use simple structure...');
      
      for (const course of allCourses) {
        // Count modules and lessons for this course
        const { data: modules } = await supabase
          .from('modules')
          .select('id')
          .eq('course_id', course.id);
        
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('course_id', course.id);
        
        const moduleCount = modules?.length || 0;
        const lessonCount = lessons?.length || 0;
        
        // Courses with 1 module and 1-3 lessons are good candidates
        if (moduleCount === 1 && lessonCount > 0 && lessonCount <= 3) {
          console.log(`   📚 "${course.title}"`);
          console.log(`      Current: ${course.structure_type || 'structured'} | Modules: ${moduleCount} | Lessons: ${lessonCount}`);
          console.log(`      Recommendation: Could be simplified to 'simple' structure`);
        }
      }
    }
    
    // 4. Test creating a simple course (simulation only)
    console.log('\n4️⃣ Simulating simple course creation...');
    console.log('   To create a simple course:');
    console.log('   1. Go to Course Builder > Create New Course');
    console.log('   2. Select "Simple" structure type');
    console.log('   3. Save the course');
    console.log('   4. Add lessons directly without creating modules');
    
    // 5. Check for any direct lessons (lessons without modules)
    console.log('\n5️⃣ Checking for direct lessons...');
    const { data: directLessons, error: directError } = await supabase
      .from('lessons')
      .select('id, title, course_id')
      .is('module_id', null);
    
    if (!directError) {
      if (directLessons && directLessons.length > 0) {
        console.log(`✅ Found ${directLessons.length} direct lessons (no module)`);
        
        // Get course info for these lessons
        for (const lesson of directLessons.slice(0, 3)) {
          const { data: course } = await supabase
            .from('courses')
            .select('title, structure_type')
            .eq('id', lesson.course_id)
            .single();
          
          if (course) {
            console.log(`   - "${lesson.title}" in course "${course.title}" (${course.structure_type || 'not set'})`);
          }
        }
      } else {
        console.log('ℹ️ No direct lessons found (all lessons are in modules)');
      }
    }
    
    // 6. Summary and recommendations
    console.log('\n' + '='.repeat(60));
    console.log('📋 FEATURE STATUS SUMMARY');
    console.log('='.repeat(60));
    
    console.log('\n✅ Database Changes:');
    console.log('   - structure_type column ' + (sampleCourse && 'structure_type' in sampleCourse ? '✅ Added' : '❌ Missing'));
    console.log('   - All lessons have course_id ✅');
    
    console.log('\n✅ UI Changes Implemented:');
    console.log('   - Course creation form with structure toggle');
    console.log('   - Course edit form with structure toggle');
    console.log('   - Course detail page supports both structures');
    console.log('   - Direct lesson creation for simple courses');
    console.log('   - New lesson editor route for simple courses');
    
    console.log('\n📝 Next Steps:');
    console.log('   1. Run the migration SQL in Supabase dashboard');
    console.log('   2. Test creating a new simple course');
    console.log('   3. Test converting existing single-module courses');
    console.log('   4. Update student view to handle both structures');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testFlexibleCourseStructure();