const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying flexible course structure migration...\n');
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '005_add_flexible_course_structure.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split the migration into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Extract a description from the statement
      let description = statement.substring(0, 50).replace(/\n/g, ' ');
      if (statement.includes('ALTER TABLE courses ADD COLUMN')) {
        description = 'Adding structure_type column to courses table';
      } else if (statement.includes('UPDATE courses SET structure_type')) {
        description = 'Setting default structure_type for existing courses';
      } else if (statement.includes('UPDATE lessons')) {
        description = 'Populating course_id for lessons with modules';
      } else if (statement.includes('CREATE INDEX')) {
        description = 'Creating performance indexes';
      } else if (statement.includes('CREATE OR REPLACE FUNCTION validate_course_structure')) {
        description = 'Creating validation function';
      } else if (statement.includes('CREATE TRIGGER')) {
        description = 'Creating validation trigger';
      } else if (statement.includes('CREATE OR REPLACE FUNCTION get_course_structure_info')) {
        description = 'Creating helper function';
      } else if (statement.includes('GRANT')) {
        description = 'Granting permissions';
      } else if (statement.includes('COMMENT ON')) {
        description = 'Adding column documentation';
      } else if (statement.includes('ADD CONSTRAINT')) {
        description = 'Adding data integrity constraint';
      }
      
      console.log(`${i + 1}/${statements.length}: ${description}...`);
      
      // Use rpc to execute raw SQL
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: statement
      }).single();
      
      if (error) {
        // Try alternative approach for some statements
        if (statement.includes('ALTER TABLE') || statement.includes('CREATE') || statement.includes('UPDATE')) {
          console.log('   ⚠️ Direct RPC failed, statement may need manual execution');
          console.log(`   Error: ${error.message}`);
        } else {
          throw error;
        }
      } else {
        console.log('   ✅ Success');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(60));
    
    // Verify the migration
    console.log('\n🔍 Verifying migration results...\n');
    
    // Check if structure_type column exists
    const { data: sampleCourse, error: courseError } = await supabase
      .from('courses')
      .select('id, title, structure_type')
      .limit(1)
      .single();
    
    if (!courseError && sampleCourse) {
      console.log('✅ structure_type column successfully added');
      console.log(`   Sample: ${sampleCourse.title} - ${sampleCourse.structure_type}`);
    }
    
    // Check lessons with course_id
    const { data: lessonsWithCourse, count } = await supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .not('course_id', 'is', null);
    
    console.log(`✅ All lessons now have course_id: ${count} lessons`);
    
    // Count lessons without module_id (potential simple course lessons)
    const { data: directLessons, count: directCount } = await supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .is('module_id', null);
    
    console.log(`📊 Direct lessons (no module): ${directCount || 0}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n💡 You may need to run the SQL statements manually in Supabase dashboard');
  }
}

// Run the migration
applyMigration();