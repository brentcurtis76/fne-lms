const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeCourseStructure() {
  console.log('🔍 COURSE STRUCTURE ANALYSIS TOOL\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Get all courses
    console.log('\n📚 Fetching all courses...');
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, structure_type, created_at')
      .order('created_at', { ascending: false });
    
    if (coursesError) {
      console.error('❌ Error fetching courses:', coursesError.message);
      return;
    }
    
    console.log(`Found ${courses.length} courses total\n`);
    
    // 2. Analyze each course
    const analysisResults = [];
    
    for (const course of courses) {
      const analysis = {
        id: course.id,
        title: course.title,
        currentStructure: course.structure_type || 'structured',
        modules: 0,
        totalLessons: 0,
        directLessons: 0,
        lessonsInModules: 0,
        blocks: 0,
        recommendation: '',
        canConvert: false,
        conversionNotes: []
      };
      
      // Count modules
      const { data: modules, error: modulesError } = await supabase
        .from('modules')
        .select('id, title')
        .eq('course_id', course.id);
      
      if (!modulesError && modules) {
        analysis.modules = modules.length;
      }
      
      // Count direct lessons (lessons without module_id)
      const { data: directLessons } = await supabase
        .from('lessons')
        .select('id, title')
        .eq('course_id', course.id)
        .is('module_id', null);
      
      if (directLessons) {
        analysis.directLessons = directLessons.length;
      }
      
      // Count lessons in modules
      const { data: moduleLessons } = await supabase
        .from('lessons')
        .select('id, module_id')
        .eq('course_id', course.id)
        .not('module_id', 'is', null);
      
      if (moduleLessons) {
        analysis.lessonsInModules = moduleLessons.length;
      }
      
      analysis.totalLessons = analysis.directLessons + analysis.lessonsInModules;
      
      // Count total blocks
      if (analysis.totalLessons > 0) {
        const { data: allLessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('course_id', course.id);
        
        if (allLessons) {
          let totalBlocks = 0;
          for (const lesson of allLessons) {
            const { count } = await supabase
              .from('blocks')
              .select('*', { count: 'exact', head: true })
              .eq('lesson_id', lesson.id);
            totalBlocks += count || 0;
          }
          analysis.blocks = totalBlocks;
        }
      }
      
      // Generate recommendations
      if (analysis.currentStructure === 'structured' || !analysis.currentStructure) {
        if (analysis.modules === 1 && analysis.totalLessons <= 5) {
          analysis.recommendation = 'CONVERT TO SIMPLE';
          analysis.canConvert = true;
          analysis.conversionNotes.push('Single module with few lessons - ideal for simple structure');
        } else if (analysis.modules === 0 && analysis.directLessons > 0) {
          analysis.recommendation = 'ALREADY SIMPLE (UPDATE TYPE)';
          analysis.canConvert = true;
          analysis.conversionNotes.push('Has direct lessons but marked as structured');
        } else if (analysis.modules > 1) {
          analysis.recommendation = 'KEEP STRUCTURED';
          analysis.canConvert = false;
          analysis.conversionNotes.push('Multiple modules benefit from structured organization');
        } else if (analysis.totalLessons === 0) {
          analysis.recommendation = 'EMPTY COURSE';
          analysis.canConvert = false;
          analysis.conversionNotes.push('No content to convert');
        } else {
          analysis.recommendation = 'KEEP STRUCTURED';
          analysis.canConvert = false;
        }
      } else if (analysis.currentStructure === 'simple') {
        if (analysis.totalLessons > 10) {
          analysis.recommendation = 'CONSIDER STRUCTURED';
          analysis.canConvert = true;
          analysis.conversionNotes.push('Many lessons could benefit from module organization');
        } else if (analysis.modules > 0) {
          analysis.recommendation = 'INCONSISTENT STATE';
          analysis.canConvert = false;
          analysis.conversionNotes.push('Simple course has modules - needs cleanup');
        } else {
          analysis.recommendation = 'KEEP SIMPLE';
          analysis.canConvert = false;
        }
      }
      
      analysisResults.push(analysis);
    }
    
    // 3. Display results
    console.log('📊 ANALYSIS RESULTS\n');
    console.log('='.repeat(60));
    
    // Summary statistics
    const simpleCount = analysisResults.filter(a => a.currentStructure === 'simple').length;
    const structuredCount = analysisResults.filter(a => a.currentStructure === 'structured' || !a.currentStructure).length;
    const convertibleCount = analysisResults.filter(a => a.canConvert).length;
    
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Simple courses: ${simpleCount}`);
    console.log(`   Structured courses: ${structuredCount}`);
    console.log(`   Convertible courses: ${convertibleCount}`);
    
    // Courses that should be converted to simple
    console.log(`\n✅ RECOMMENDED FOR CONVERSION TO SIMPLE:`);
    const toSimple = analysisResults.filter(a => a.recommendation === 'CONVERT TO SIMPLE');
    if (toSimple.length > 0) {
      toSimple.forEach(course => {
        console.log(`\n   📚 "${course.title}"`);
        console.log(`      ID: ${course.id}`);
        console.log(`      Current: ${course.currentStructure}`);
        console.log(`      Structure: ${course.modules} modules, ${course.totalLessons} lessons`);
        console.log(`      Notes: ${course.conversionNotes.join('; ')}`);
      });
    } else {
      console.log('   None found');
    }
    
    // Courses with inconsistent state
    console.log(`\n⚠️ COURSES WITH ISSUES:`);
    const withIssues = analysisResults.filter(a => 
      a.recommendation === 'INCONSISTENT STATE' || 
      a.recommendation === 'ALREADY SIMPLE (UPDATE TYPE)'
    );
    if (withIssues.length > 0) {
      withIssues.forEach(course => {
        console.log(`\n   📚 "${course.title}"`);
        console.log(`      ID: ${course.id}`);
        console.log(`      Issue: ${course.recommendation}`);
        console.log(`      Structure: ${course.modules} modules, ${course.directLessons} direct, ${course.lessonsInModules} in modules`);
        console.log(`      Notes: ${course.conversionNotes.join('; ')}`);
      });
    } else {
      console.log('   None found');
    }
    
    // Empty courses
    const emptyCourses = analysisResults.filter(a => a.recommendation === 'EMPTY COURSE');
    if (emptyCourses.length > 0) {
      console.log(`\n📭 EMPTY COURSES: ${emptyCourses.length} courses have no content`);
    }
    
    // Export detailed report
    console.log('\n' + '='.repeat(60));
    console.log('💾 DETAILED ANALYSIS EXPORT');
    console.log('='.repeat(60));
    
    const fs = require('fs');
    const reportPath = './course-structure-analysis.json';
    fs.writeFileSync(reportPath, JSON.stringify(analysisResults, null, 2));
    console.log(`\n✅ Full analysis saved to: ${reportPath}`);
    
    // Show conversion commands
    if (convertibleCount > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('🔧 CONVERSION COMMANDS');
      console.log('='.repeat(60));
      console.log('\nTo convert specific courses, use:');
      console.log('node scripts/convert-course-structure.js <course-id> <target-structure>');
      console.log('\nExample conversions:');
      
      const firstConvertible = analysisResults.find(a => a.canConvert);
      if (firstConvertible) {
        const targetStructure = firstConvertible.currentStructure === 'simple' ? 'structured' : 'simple';
        console.log(`node scripts/convert-course-structure.js ${firstConvertible.id} ${targetStructure}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Run the analysis
analyzeCourseStructure();