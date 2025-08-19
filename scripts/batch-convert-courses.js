const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function batchConvertCourses(dryRun = true) {
  console.log('🔄 BATCH COURSE CONVERSION TOOL\n');
  console.log('='.repeat(60));
  console.log(dryRun ? '🧪 DRY RUN MODE (no changes will be made)' : '⚠️ LIVE MODE (changes will be applied)');
  console.log('='.repeat(60));
  
  try {
    // Load analysis results
    const analysisPath = './course-structure-analysis.json';
    if (!fs.existsSync(analysisPath)) {
      console.error('❌ Analysis file not found. Run analyze-course-structure.js first.');
      return;
    }
    
    const analysisResults = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    
    // Filter courses recommended for conversion to simple
    const toConvert = analysisResults.filter(a => 
      a.recommendation === 'CONVERT TO SIMPLE' && 
      a.canConvert === true
    );
    
    console.log(`\n📊 Found ${toConvert.length} courses recommended for conversion to simple structure\n`);
    
    if (toConvert.length === 0) {
      console.log('No courses to convert.');
      return;
    }
    
    const conversionResults = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    // Process each course
    for (const course of toConvert) {
      console.log(`\n${'='.repeat(40)}`);
      console.log(`📚 Processing: "${course.title}"`);
      console.log(`   ID: ${course.id}`);
      console.log(`   Current: ${course.currentStructure}`);
      console.log(`   Modules: ${course.modules}, Lessons: ${course.totalLessons}`);
      
      if (dryRun) {
        console.log('   🧪 [DRY RUN] Would convert to simple structure');
        conversionResults.successful.push({
          id: course.id,
          title: course.title,
          status: 'dry-run'
        });
        continue;
      }
      
      try {
        // Validate before conversion
        console.log('   🔍 Validating...');
        
        // Check current structure
        const { data: currentCourse } = await supabase
          .from('courses')
          .select('structure_type')
          .eq('id', course.id)
          .single();
        
        if (currentCourse?.structure_type === 'simple') {
          console.log('   ⏭️ Already converted to simple, skipping...');
          conversionResults.skipped.push({
            id: course.id,
            title: course.title,
            reason: 'Already simple'
          });
          continue;
        }
        
        // Perform conversion
        console.log('   🔄 Converting to simple structure...');
        
        // Get module lessons
        const { data: moduleLessons } = await supabase
          .from('lessons')
          .select('*')
          .eq('course_id', course.id)
          .not('module_id', 'is', null);
        
        // Flatten lessons
        if (moduleLessons && moduleLessons.length > 0) {
          let orderNumber = 1;
          for (const lesson of moduleLessons) {
            await supabase
              .from('lessons')
              .update({ 
                module_id: null,
                order_number: orderNumber++
              })
              .eq('id', lesson.id);
          }
          console.log(`   ✅ Flattened ${moduleLessons.length} lessons`);
        }
        
        // Delete modules
        const { error: deleteError } = await supabase
          .from('modules')
          .delete()
          .eq('course_id', course.id);
        
        if (deleteError) {
          throw deleteError;
        }
        
        // Update structure type
        const { error: updateError } = await supabase
          .from('courses')
          .update({ structure_type: 'simple' })
          .eq('id', course.id);
        
        if (updateError) {
          throw updateError;
        }
        
        console.log('   ✅ Successfully converted to simple structure');
        
        conversionResults.successful.push({
          id: course.id,
          title: course.title,
          status: 'converted'
        });
        
      } catch (error) {
        console.error(`   ❌ Conversion failed: ${error.message}`);
        conversionResults.failed.push({
          id: course.id,
          title: course.title,
          error: error.message
        });
      }
    }
    
    // Summary report
    console.log('\n' + '='.repeat(60));
    console.log('📊 BATCH CONVERSION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\n✅ Successful: ${conversionResults.successful.length}`);
    if (conversionResults.successful.length > 0) {
      conversionResults.successful.forEach(c => {
        console.log(`   • ${c.title} (${c.status})`);
      });
    }
    
    if (conversionResults.skipped.length > 0) {
      console.log(`\n⏭️ Skipped: ${conversionResults.skipped.length}`);
      conversionResults.skipped.forEach(c => {
        console.log(`   • ${c.title} (${c.reason})`);
      });
    }
    
    if (conversionResults.failed.length > 0) {
      console.log(`\n❌ Failed: ${conversionResults.failed.length}`);
      conversionResults.failed.forEach(c => {
        console.log(`   • ${c.title}: ${c.error}`);
      });
    }
    
    // Save results
    const resultsPath = './batch-conversion-results.json';
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: dryRun ? 'dry-run' : 'live',
      results: conversionResults
    }, null, 2));
    
    console.log(`\n💾 Results saved to: ${resultsPath}`);
    
    if (dryRun) {
      console.log('\n💡 This was a DRY RUN. To apply changes, run:');
      console.log('   node scripts/batch-convert-courses.js --apply');
    }
    
  } catch (error) {
    console.error('❌ Batch conversion failed:', error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');

// Run batch conversion
batchConvertCourses(!shouldApply);