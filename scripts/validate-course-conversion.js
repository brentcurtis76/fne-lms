const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function validateCourseConversion(courseId) {
  console.log('🔍 COURSE CONVERSION VALIDATION TOOL\n');
  console.log('='.repeat(60));
  
  if (!courseId) {
    console.error('❌ Usage: node validate-course-conversion.js <course-id>');
    return;
  }
  
  const validationResults = {
    courseId,
    passed: true,
    warnings: [],
    errors: [],
    stats: {}
  };
  
  try {
    // 1. Check if course exists
    console.log('\n📚 Validating course existence...');
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();
    
    if (courseError || !course) {
      validationResults.errors.push(`Course not found: ${courseId}`);
      validationResults.passed = false;
      console.error('   ❌ Course not found');
      return validationResults;
    }
    
    console.log(`   ✅ Course found: "${course.title}"`);
    validationResults.stats.courseTitle = course.title;
    validationResults.stats.currentStructure = course.structure_type || 'structured';
    
    // 2. Check lesson integrity
    console.log('\n📝 Validating lesson integrity...');
    
    // Check for orphaned lessons (no course_id)
    const { data: orphanedLessons } = await supabase
      .from('lessons')
      .select('id, title')
      .is('course_id', null)
      .eq('module_id', course.id); // Common mistake: module_id set to course_id
    
    if (orphanedLessons && orphanedLessons.length > 0) {
      validationResults.errors.push(`Found ${orphanedLessons.length} orphaned lessons`);
      validationResults.passed = false;
      console.error(`   ❌ Found ${orphanedLessons.length} orphaned lessons`);
    } else {
      console.log('   ✅ No orphaned lessons');
    }
    
    // Check for lessons with both course_id and invalid module_id
    const { data: allLessons } = await supabase
      .from('lessons')
      .select('id, title, course_id, module_id')
      .eq('course_id', courseId);
    
    const { data: validModules } = await supabase
      .from('modules')
      .select('id')
      .eq('course_id', courseId);
    
    const validModuleIds = validModules ? validModules.map(m => m.id) : [];
    
    const lessonsWithInvalidModules = allLessons ? allLessons.filter(l => 
      l.module_id && !validModuleIds.includes(l.module_id)
    ) : [];
    
    if (lessonsWithInvalidModules.length > 0) {
      validationResults.errors.push(`Found ${lessonsWithInvalidModules.length} lessons with invalid module_id`);
      validationResults.passed = false;
      console.error(`   ❌ Found ${lessonsWithInvalidModules.length} lessons with invalid module_id`);
    } else {
      console.log('   ✅ All lesson module references are valid');
    }
    
    // 3. Check module integrity
    console.log('\n📦 Validating module integrity...');
    
    const { data: modules } = await supabase
      .from('modules')
      .select('id, title, order_number')
      .eq('course_id', courseId)
      .order('order_number');
    
    validationResults.stats.moduleCount = modules ? modules.length : 0;
    
    // Check for duplicate order numbers
    if (modules && modules.length > 0) {
      const orderNumbers = modules.map(m => m.order_number);
      const duplicates = orderNumbers.filter((item, index) => orderNumbers.indexOf(item) !== index);
      
      if (duplicates.length > 0) {
        validationResults.warnings.push('Found duplicate module order numbers');
        console.warn('   ⚠️ Found duplicate module order numbers');
      } else {
        console.log('   ✅ Module order numbers are unique');
      }
      
      // Check for empty modules
      for (const module of modules) {
        const { count } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('module_id', module.id);
        
        if (count === 0) {
          validationResults.warnings.push(`Module "${module.title}" has no lessons`);
          console.warn(`   ⚠️ Module "${module.title}" has no lessons`);
        }
      }
    }
    
    // 4. Check lesson order integrity
    console.log('\n🔢 Validating lesson order...');
    
    const directLessons = allLessons ? allLessons.filter(l => !l.module_id) : [];
    const moduleLessons = allLessons ? allLessons.filter(l => l.module_id) : [];
    
    validationResults.stats.directLessonCount = directLessons.length;
    validationResults.stats.moduleLessonCount = moduleLessons.length;
    validationResults.stats.totalLessonCount = allLessons ? allLessons.length : 0;
    
    // Check for duplicate order numbers in direct lessons
    if (directLessons.length > 0) {
      const orderNumbers = directLessons.map(l => l.order_number).filter(n => n !== null);
      const duplicates = orderNumbers.filter((item, index) => orderNumbers.indexOf(item) !== index);
      
      if (duplicates.length > 0) {
        validationResults.warnings.push('Found duplicate order numbers in direct lessons');
        console.warn('   ⚠️ Found duplicate order numbers in direct lessons');
      }
    }
    
    // 5. Check blocks integrity
    console.log('\n🧱 Validating blocks integrity...');
    
    let totalBlocks = 0;
    let blocksWithoutLesson = 0;
    
    if (allLessons) {
      for (const lesson of allLessons) {
        const { count } = await supabase
          .from('blocks')
          .select('*', { count: 'exact', head: true })
          .eq('lesson_id', lesson.id);
        
        totalBlocks += count || 0;
      }
    }
    
    // Check for blocks without valid lesson_id
    const { count: orphanedBlocksCount } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .not('lesson_id', 'in', `(${allLessons ? allLessons.map(l => `'${l.id}'`).join(',') : "''"})`)
      .eq('lesson_id', courseId); // Common mistake
    
    if (orphanedBlocksCount > 0) {
      validationResults.warnings.push(`Found ${orphanedBlocksCount} blocks with invalid lesson_id`);
      console.warn(`   ⚠️ Found ${orphanedBlocksCount} blocks with invalid lesson_id`);
    }
    
    validationResults.stats.totalBlocks = totalBlocks;
    console.log(`   ✅ Total blocks in course: ${totalBlocks}`);
    
    // 6. Check structure consistency
    console.log('\n🏗️ Validating structure consistency...');
    
    const currentStructure = course.structure_type || 'structured';
    
    if (currentStructure === 'simple') {
      if (modules && modules.length > 0) {
        validationResults.errors.push('Simple course has modules - inconsistent state');
        validationResults.passed = false;
        console.error('   ❌ Simple course has modules - inconsistent state');
      } else if (moduleLessons.length > 0) {
        validationResults.errors.push('Simple course has lessons with module_id - inconsistent state');
        validationResults.passed = false;
        console.error('   ❌ Simple course has lessons with module_id');
      } else {
        console.log('   ✅ Simple structure is consistent');
      }
    } else if (currentStructure === 'structured') {
      if (directLessons.length > 0 && modules && modules.length > 0) {
        validationResults.warnings.push('Structured course has both direct lessons and module lessons');
        console.warn('   ⚠️ Structured course has both direct lessons and module lessons');
      } else {
        console.log('   ✅ Structured course is consistent');
      }
    }
    
    // 7. Check conversion safety
    console.log('\n🛡️ Checking conversion safety...');
    
    const canConvertToSimple = !validationResults.errors.length && 
                               (!modules || modules.length <= 1) &&
                               validationResults.stats.totalLessonCount <= 10;
    
    const canConvertToStructured = !validationResults.errors.length &&
                                   currentStructure === 'simple';
    
    if (currentStructure === 'simple') {
      if (canConvertToStructured) {
        console.log('   ✅ Safe to convert to structured');
        validationResults.stats.canConvertTo = 'structured';
      } else {
        console.log('   ⚠️ Cannot convert to structured due to errors');
      }
    } else {
      if (canConvertToSimple) {
        console.log('   ✅ Safe to convert to simple');
        validationResults.stats.canConvertTo = 'simple';
      } else if (modules && modules.length > 1) {
        console.log('   ⚠️ Multiple modules - consider keeping structured');
        validationResults.warnings.push('Multiple modules benefit from structured organization');
      } else {
        console.log('   ⚠️ Cannot convert to simple due to errors or complexity');
      }
    }
    
    // 8. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\n📚 Course: "${validationResults.stats.courseTitle}"`);
    console.log(`   Structure: ${validationResults.stats.currentStructure}`);
    console.log(`   Modules: ${validationResults.stats.moduleCount}`);
    console.log(`   Total Lessons: ${validationResults.stats.totalLessonCount}`);
    console.log(`   Direct Lessons: ${validationResults.stats.directLessonCount}`);
    console.log(`   Module Lessons: ${validationResults.stats.moduleLessonCount}`);
    console.log(`   Blocks: ${validationResults.stats.totalBlocks}`);
    
    if (validationResults.errors.length > 0) {
      console.log('\n❌ ERRORS (must fix before conversion):');
      validationResults.errors.forEach(error => {
        console.log(`   • ${error}`);
      });
    }
    
    if (validationResults.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS (review before conversion):');
      validationResults.warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }
    
    if (validationResults.passed) {
      console.log('\n✅ Validation PASSED - Course is ready for conversion');
      if (validationResults.stats.canConvertTo) {
        console.log(`\n💡 Recommended conversion command:`);
        console.log(`   node scripts/convert-course-structure.js ${courseId} ${validationResults.stats.canConvertTo}`);
      }
    } else {
      console.log('\n❌ Validation FAILED - Fix errors before attempting conversion');
    }
    
    return validationResults;
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    validationResults.errors.push(`Validation error: ${error.message}`);
    validationResults.passed = false;
    return validationResults;
  }
}

// Get command line arguments
const courseId = process.argv[2];

// Run validation
if (courseId) {
  validateCourseConversion(courseId);
} else {
  console.error('❌ Usage: node validate-course-conversion.js <course-id>');
}