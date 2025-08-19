const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAndPrepareMigration() {
  console.log('🔍 Verifying current database state for flexible course structure...\n');
  
  try {
    // 1. Check current state of lessons table
    console.log('1️⃣ Checking lessons table structure...');
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, title, course_id, module_id')
      .limit(10);
    
    if (lessonsError) {
      console.error('❌ Error checking lessons:', lessonsError);
      return;
    }
    
    console.log(`✅ Found ${lessons?.length || 0} sample lessons`);
    
    // 2. Count lessons without course_id
    const { data: lessonsWithoutCourse, error: countError } = await supabase
      .from('lessons')
      .select('id', { count: 'exact' })
      .is('course_id', null);
    
    const countWithoutCourse = countError ? 0 : (lessonsWithoutCourse?.length || 0);
    console.log(`📊 Lessons without course_id: ${countWithoutCourse}`);
    
    // 3. Count lessons with module_id
    const { data: lessonsWithModule, error: moduleError } = await supabase
      .from('lessons')
      .select('id', { count: 'exact' })
      .not('module_id', 'is', null);
    
    const countWithModule = moduleError ? 0 : (lessonsWithModule?.length || 0);
    console.log(`📊 Lessons with module_id: ${countWithModule}`);
    
    // 4. Check if structure_type column exists
    console.log('\n2️⃣ Checking if structure_type column exists...');
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('*')
      .limit(1);
    
    if (!coursesError && courses && courses.length > 0) {
      const hasStructureType = 'structure_type' in courses[0];
      console.log(hasStructureType ? 
        '✅ structure_type column already exists' : 
        '⚠️ structure_type column does not exist yet'
      );
      
      if (hasStructureType) {
        // Count courses by structure type
        const { data: structuredCourses } = await supabase
          .from('courses')
          .select('id', { count: 'exact' })
          .eq('structure_type', 'structured');
        
        const { data: simpleCourses } = await supabase
          .from('courses')
          .select('id', { count: 'exact' })
          .eq('structure_type', 'simple');
        
        console.log(`📊 Structured courses: ${structuredCourses?.length || 0}`);
        console.log(`📊 Simple courses: ${simpleCourses?.length || 0}`);
      }
    }
    
    // 5. Find courses with very few lessons that might benefit from simple structure
    console.log('\n3️⃣ Finding courses that could use simple structure...');
    const { data: allCourses, error: allCoursesError } = await supabase
      .from('courses')
      .select('id, title');
    
    if (!allCoursesError && allCourses) {
      const courseAnalysis = [];
      
      for (const course of allCourses) {
        // Count modules for this course
        const { data: modules } = await supabase
          .from('modules')
          .select('id', { count: 'exact' })
          .eq('course_id', course.id);
        
        // Count total lessons for this course
        const { data: courseLessons } = await supabase
          .from('lessons')
          .select('id', { count: 'exact' })
          .eq('course_id', course.id);
        
        const moduleCount = modules?.length || 0;
        const lessonCount = courseLessons?.length || 0;
        
        if (moduleCount <= 1 && lessonCount <= 3 && lessonCount > 0) {
          courseAnalysis.push({
            id: course.id,
            title: course.title,
            modules: moduleCount,
            lessons: lessonCount
          });
        }
      }
      
      if (courseAnalysis.length > 0) {
        console.log('\n📝 Courses that might benefit from simple structure:');
        courseAnalysis.forEach(c => {
          console.log(`   - ${c.title}: ${c.modules} modules, ${c.lessons} lessons`);
        });
      } else {
        console.log('✅ No courses found with 1 or fewer modules and 3 or fewer lessons');
      }
    }
    
    // 6. Check for any potential data integrity issues
    console.log('\n4️⃣ Checking for data integrity issues...');
    
    // Check for lessons with module_id but no course_id
    const { data: orphanedLessons } = await supabase
      .from('lessons')
      .select('id, title, module_id, course_id')
      .not('module_id', 'is', null)
      .is('course_id', null);
    
    if (orphanedLessons && orphanedLessons.length > 0) {
      console.log(`⚠️ Found ${orphanedLessons.length} lessons with module_id but no course_id`);
      console.log('   These will be fixed by the migration');
    } else {
      console.log('✅ No orphaned lessons found');
    }
    
    // 7. Generate migration readiness report
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION READINESS REPORT');
    console.log('='.repeat(60));
    
    const issues = [];
    if (countWithoutCourse > 0) {
      issues.push(`${countWithoutCourse} lessons need course_id populated`);
    }
    
    if (issues.length === 0) {
      console.log('✅ Database is ready for migration!');
      console.log('   Run the migration script: 005_add_flexible_course_structure.sql');
    } else {
      console.log('⚠️ Issues to be fixed by migration:');
      issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('\n✅ These issues will be automatically fixed by the migration');
    }
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

// Run the verification
verifyAndPrepareMigration();