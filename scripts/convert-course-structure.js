const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function convertCourseStructure(courseId, targetStructure) {
  console.log('🔄 COURSE STRUCTURE CONVERSION TOOL\n');
  console.log('='.repeat(60));
  
  if (!courseId || !targetStructure) {
    console.error('❌ Usage: node convert-course-structure.js <course-id> <simple|structured>');
    return;
  }
  
  if (targetStructure !== 'simple' && targetStructure !== 'structured') {
    console.error('❌ Target structure must be either "simple" or "structured"');
    return;
  }
  
  try {
    // 1. Fetch course details
    console.log(`\n📚 Fetching course: ${courseId}`);
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();
    
    if (courseError || !course) {
      console.error('❌ Course not found:', courseError?.message);
      return;
    }
    
    console.log(`   Title: "${course.title}"`);
    console.log(`   Current structure: ${course.structure_type || 'structured'}`);
    console.log(`   Target structure: ${targetStructure}`);
    
    const currentStructure = course.structure_type || 'structured';
    
    if (currentStructure === targetStructure) {
      console.log('\n⚠️ Course is already in the target structure!');
      return;
    }
    
    // 2. Validate conversion possibility
    console.log('\n🔍 Validating conversion...');
    
    const { data: modules } = await supabase
      .from('modules')
      .select('*')
      .eq('course_id', courseId)
      .order('order_number');
    
    const { data: directLessons } = await supabase
      .from('lessons')
      .select('*')
      .eq('course_id', courseId)
      .is('module_id', null)
      .order('order_number');
    
    const { data: moduleLessons } = await supabase
      .from('lessons')
      .select('*')
      .eq('course_id', courseId)
      .not('module_id', 'is', null)
      .order('order_number');
    
    console.log(`   Modules: ${modules?.length || 0}`);
    console.log(`   Direct lessons: ${directLessons?.length || 0}`);
    console.log(`   Module lessons: ${moduleLessons?.length || 0}`);
    
    // 3. Perform conversion based on direction
    if (targetStructure === 'simple') {
      // CONVERTING TO SIMPLE
      console.log('\n📝 Converting to SIMPLE structure...');
      
      if (!modules || modules.length === 0) {
        console.log('   No modules to convert, updating structure type only...');
      } else if (modules.length > 1) {
        console.log('\n⚠️ WARNING: Course has multiple modules!');
        console.log('   All lessons will be flattened into direct lessons.');
        console.log('   Module organization will be lost.');
        
        // Ask for confirmation (in a real CLI, we'd use readline)
        console.log('\n   Proceeding with conversion...');
      }
      
      // Flatten all module lessons to direct lessons
      if (moduleLessons && moduleLessons.length > 0) {
        console.log(`\n   Converting ${moduleLessons.length} module lessons to direct lessons...`);
        
        let orderNumber = (directLessons?.length || 0) + 1;
        
        for (const lesson of moduleLessons) {
          const { error: updateError } = await supabase
            .from('lessons')
            .update({ 
              module_id: null,
              order_number: orderNumber++
            })
            .eq('id', lesson.id);
          
          if (updateError) {
            console.error(`   ❌ Failed to update lesson ${lesson.title}:`, updateError.message);
            return;
          }
          console.log(`   ✅ Converted: ${lesson.title}`);
        }
      }
      
      // Delete all modules
      if (modules && modules.length > 0) {
        console.log(`\n   Removing ${modules.length} empty modules...`);
        const { error: deleteError } = await supabase
          .from('modules')
          .delete()
          .eq('course_id', courseId);
        
        if (deleteError) {
          console.error('   ❌ Failed to delete modules:', deleteError.message);
          return;
        }
        console.log('   ✅ Modules removed');
      }
      
    } else {
      // CONVERTING TO STRUCTURED
      console.log('\n📝 Converting to STRUCTURED...');
      
      if (!directLessons || directLessons.length === 0) {
        console.log('   No direct lessons to organize, updating structure type only...');
      } else {
        console.log(`   Creating module for ${directLessons.length} direct lessons...`);
        
        // Create a default module
        const { data: newModule, error: moduleError } = await supabase
          .from('modules')
          .insert({
            course_id: courseId,
            title: 'Módulo Principal',
            description: 'Módulo creado durante conversión de estructura',
            order_number: 1
          })
          .select()
          .single();
        
        if (moduleError || !newModule) {
          console.error('   ❌ Failed to create module:', moduleError?.message);
          return;
        }
        
        console.log(`   ✅ Created module: "${newModule.title}"`);
        
        // Move all direct lessons to the new module
        console.log(`   Moving ${directLessons.length} lessons to module...`);
        
        for (const lesson of directLessons) {
          const { error: updateError } = await supabase
            .from('lessons')
            .update({ 
              module_id: newModule.id
            })
            .eq('id', lesson.id);
          
          if (updateError) {
            console.error(`   ❌ Failed to update lesson ${lesson.title}:`, updateError.message);
            return;
          }
          console.log(`   ✅ Moved: ${lesson.title}`);
        }
      }
    }
    
    // 4. Update course structure type
    console.log('\n📝 Updating course structure type...');
    const { error: updateError } = await supabase
      .from('courses')
      .update({ structure_type: targetStructure })
      .eq('id', courseId);
    
    if (updateError) {
      console.error('❌ Failed to update course structure type:', updateError.message);
      return;
    }
    
    // 5. Verify conversion
    console.log('\n✅ CONVERSION COMPLETE!');
    console.log('\n📊 Verification:');
    
    const { data: updatedCourse } = await supabase
      .from('courses')
      .select('structure_type')
      .eq('id', courseId)
      .single();
    
    const { data: finalModules } = await supabase
      .from('modules')
      .select('id')
      .eq('course_id', courseId);
    
    const { data: finalDirectLessons } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', courseId)
      .is('module_id', null);
    
    const { data: finalModuleLessons } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', courseId)
      .not('module_id', 'is', null);
    
    console.log(`   New structure type: ${updatedCourse?.structure_type}`);
    console.log(`   Modules: ${finalModules?.length || 0}`);
    console.log(`   Direct lessons: ${finalDirectLessons?.length || 0}`);
    console.log(`   Module lessons: ${finalModuleLessons?.length || 0}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Course successfully converted to', targetStructure.toUpperCase(), 'structure!');
    console.log('='.repeat(60));
    
    console.log('\n📝 Next steps:');
    console.log(`   1. Visit the course at: http://localhost:3000/admin/course-builder/${courseId}`);
    console.log('   2. Review the new structure');
    console.log('   3. Update lesson order if needed');
    if (targetStructure === 'structured') {
      console.log('   4. Consider renaming the default module or creating additional modules');
    }
    
  } catch (error) {
    console.error('❌ Conversion failed:', error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const courseId = args[0];
const targetStructure = args[1];

// Run the conversion
convertCourseStructure(courseId, targetStructure);