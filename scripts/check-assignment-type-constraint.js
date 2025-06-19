const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkConstraint() {
  console.log('Checking course_assignments constraints...\n');

  try {
    // Try different assignment types to see which ones work
    const types = ['mandatory', 'optional', 'custom', 'regular', 'monitoring', 'mentoring', 'evaluation', 'support', 'teacher', 'course'];
    
    for (const type of types) {
      const { error } = await supabase
        .from('course_assignments')
        .insert({
          teacher_id: '00000000-0000-0000-0000-000000000000',
          course_id: '00000000-0000-0000-0000-000000000000',
          assignment_type: type,
          assigned_by: '00000000-0000-0000-0000-000000000000'
        });
      
      if (!error || !error.message.includes('assignment_type_check')) {
        console.log(`✓ Assignment type '${type}' seems valid`);
      } else if (error.message.includes('assignment_type_check')) {
        console.log(`✗ Assignment type '${type}' is not allowed`);
      }
    }
    
    // Also check existing data
    const { data: existing } = await supabase
      .from('course_assignments')
      .select('assignment_type')
      .limit(10);
      
    if (existing && existing.length > 0) {
      console.log('\nExisting assignment types in use:');
      const uniqueTypes = [...new Set(existing.map(e => e.assignment_type))];
      console.log(uniqueTypes);
    }

  } catch (error) {
    console.error('Failed:', error);
  }
}

checkConstraint();