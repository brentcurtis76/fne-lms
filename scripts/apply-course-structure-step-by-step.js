const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigrationStepByStep() {
  console.log('🚀 Applying flexible course structure migration step by step...\n');
  
  try {
    // Step 1: First, let's populate missing course_id values in lessons
    console.log('Step 1: Populating missing course_id values in lessons...');
    
    // Get all lessons with module_id but no course_id
    const { data: lessonsToFix, error: fetchError } = await supabase
      .from('lessons')
      .select('id, module_id')
      .not('module_id', 'is', null)
      .is('course_id', null);
    
    if (fetchError) {
      console.error('Error fetching lessons:', fetchError);
    } else if (lessonsToFix && lessonsToFix.length > 0) {
      console.log(`Found ${lessonsToFix.length} lessons to fix`);
      
      // For each lesson, get the course_id from its module
      for (const lesson of lessonsToFix) {
        const { data: module, error: moduleError } = await supabase
          .from('modules')
          .select('course_id')
          .eq('id', lesson.module_id)
          .single();
        
        if (!moduleError && module) {
          // Update the lesson with the course_id
          const { error: updateError } = await supabase
            .from('lessons')
            .update({ course_id: module.course_id })
            .eq('id', lesson.id);
          
          if (updateError) {
            console.error(`Error updating lesson ${lesson.id}:`, updateError);
          } else {
            console.log(`✅ Updated lesson ${lesson.id} with course_id ${module.course_id}`);
          }
        }
      }
    } else {
      console.log('✅ All lessons already have course_id');
    }
    
    // Step 2: Verify all lessons now have course_id
    console.log('\nStep 2: Verifying all lessons have course_id...');
    const { data: orphanedLessons, error: orphanError } = await supabase
      .from('lessons')
      .select('id', { count: 'exact' })
      .is('course_id', null);
    
    if (!orphanError) {
      const orphanCount = orphanedLessons?.length || 0;
      if (orphanCount === 0) {
        console.log('✅ All lessons have course_id!');
      } else {
        console.log(`⚠️ Still ${orphanCount} lessons without course_id`);
      }
    }
    
    // Step 3: Display migration SQL that needs to be run manually
    console.log('\n' + '='.repeat(60));
    console.log('📋 MANUAL STEPS REQUIRED');
    console.log('='.repeat(60));
    console.log('\nPlease run the following SQL in your Supabase SQL Editor:');
    console.log('(Dashboard > SQL Editor > New Query)\n');
    
    const manualSQL = `
-- Add structure_type column to courses table
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS structure_type VARCHAR(20) DEFAULT 'structured' 
CHECK (structure_type IN ('simple', 'structured'));

-- Update all existing courses to 'structured' type
UPDATE courses 
SET structure_type = 'structured' 
WHERE structure_type IS NULL;

-- Add comment to explain the structure types
COMMENT ON COLUMN courses.structure_type IS 'Determines course organization: simple (direct lessons) or structured (with modules)';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module_id ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_courses_structure_type ON courses(structure_type);

-- Add constraint to ensure lessons have course_id
ALTER TABLE lessons 
DROP CONSTRAINT IF EXISTS check_lesson_course_relationship;

ALTER TABLE lessons 
ADD CONSTRAINT check_lesson_course_relationship 
CHECK (course_id IS NOT NULL);`;
    
    console.log(manualSQL);
    
    console.log('\n' + '='.repeat(60));
    console.log('After running the SQL above, the migration will be complete!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
  }
}

// Run the migration
applyMigrationStepByStep();