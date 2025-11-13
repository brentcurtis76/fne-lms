/**
 * Fix submitted_by Foreign Key Constraint
 * Changes FK from auth.users(id) to profiles(id) for PostgREST auto-join support
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixSubmittedByFK() {
  console.log('Fixing submitted_by foreign key constraint...\n');

  try {
    // Step 1: Drop existing constraint if it exists
    console.log('Step 1: Dropping existing constraint (if any)...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'lesson_assignment_submissions_submitted_by_fkey'
            AND table_name = 'lesson_assignment_submissions'
          ) THEN
            ALTER TABLE lesson_assignment_submissions
              DROP CONSTRAINT lesson_assignment_submissions_submitted_by_fkey;
            RAISE NOTICE 'Dropped existing constraint';
          ELSE
            RAISE NOTICE 'No existing constraint found';
          END IF;
        END $$;
      `
    });

    if (dropError) {
      console.error('Error dropping constraint:', dropError);
      throw dropError;
    }
    console.log('✓ Constraint drop completed\n');

    // Step 2: Add new constraint referencing profiles
    console.log('Step 2: Adding new constraint to profiles(id)...');
    const { error: addError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE lesson_assignment_submissions
          ADD CONSTRAINT lesson_assignment_submissions_submitted_by_fkey
          FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE;
      `
    });

    if (addError) {
      console.error('Error adding constraint:', addError);
      throw addError;
    }
    console.log('✓ New constraint added\n');

    // Step 3: Verify the fix by testing the join
    console.log('Step 3: Verifying PostgREST join works...');
    const { data, error: testError } = await supabase
      .from('lesson_assignment_submissions')
      .select('id, student_id, submitted_by, profiles:submitted_by(full_name)')
      .limit(1);

    if (testError) {
      console.error('❌ Join test failed:', testError);
      throw testError;
    }

    console.log('✓ Join test successful!');
    console.log('Sample record:', JSON.stringify(data, null, 2));

    console.log('\n✅ Foreign key fix complete!');
    console.log('The submitted_by column now references profiles(id) for PostgREST auto-joins.');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

fixSubmittedByFK();
