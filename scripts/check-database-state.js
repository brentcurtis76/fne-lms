const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabaseState() {
  console.log('Checking database state for group assignments...\n');

  try {
    // Check table structure using raw SQL
    const { data: tableInfo, error: tableError } = await supabase.rpc('get_table_columns', {
      table_name: 'lesson_assignments'
    }).single();

    if (tableError) {
      // Try alternative approach
      const { data: columns, error: columnsError } = await supabase
        .from('lesson_assignments')
        .select('*')
        .limit(1);

      if (columnsError) {
        console.error('Error checking columns:', columnsError);
      } else if (columns && columns.length > 0) {
        console.log('lesson_assignments columns:', Object.keys(columns[0]));
        console.log('allow_self_grouping exists?', 'allow_self_grouping' in columns[0]);
      } else {
        // No data, create a test query to check column
        const { error: testError } = await supabase
          .from('lesson_assignments')
          .select('allow_self_grouping')
          .limit(1);
        
        if (testError && testError.message.includes('column')) {
          console.log('allow_self_grouping column: ❌ Does not exist (good - role corrections applied)');
        } else {
          console.log('allow_self_grouping column: ✅ Still exists (need to apply role corrections)');
        }
      }
    }

    // Check for group assignments
    const { data: groupAssignments, error: assignmentsError } = await supabase
      .from('lesson_assignments')
      .select('id, title, assignment_for, assignment_type')
      .eq('assignment_for', 'group')
      .limit(5);

    if (!assignmentsError) {
      console.log('\nGroup assignments found:', groupAssignments?.length || 0);
      if (groupAssignments?.length > 0) {
        console.log('Sample:', groupAssignments[0]);
      }
    }

    // Check if group tables exist by trying to query them
    const tables = [
      'group_assignment_members',
      'group_assignment_submissions',
      'group_assignment_discussions'
    ];

    console.log('\nChecking group tables:');
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`- ${table}: ❌ Does not exist or error`);
      } else {
        console.log(`- ${table}: ✅ Exists (${count} records)`);
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDatabaseState();