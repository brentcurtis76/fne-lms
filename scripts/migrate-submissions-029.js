/**
 * Data Migration Script for Migration 029
 * Backfills existing submissions with new collaborative fields
 * FIXED: Now targets lesson_assignment_submissions (correct table)
 *
 * Usage: node scripts/migrate-submissions-029.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('Starting migration 029 data backfill for lesson_assignment_submissions...\n');

  try {
    // Step 1: Get all existing submissions
    console.log('Step 1: Fetching existing submissions from lesson_assignment_submissions...');
    const { data: submissions, error: fetchError } = await supabase
      .from('lesson_assignment_submissions')
      .select('id, student_id, submitted_by, is_original, source_submission_id')
      .order('submitted_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Error fetching submissions: ${fetchError.message}`);
    }

    console.log(`Found ${submissions?.length || 0} submissions\n`);

    if (!submissions || submissions.length === 0) {
      console.log('No submissions to migrate');
      return;
    }

    // Step 2: Backfill submitted_by and is_original
    console.log('Step 2: Backfilling submitted_by and is_original fields...');
    let updated = 0;
    let errors = 0;

    for (const submission of submissions) {
      try {
        // Set submitted_by to student_id if null
        // Set is_original to true
        // Set source_submission_id to null
        const { error: updateError } = await supabase
          .from('lesson_assignment_submissions')
          .update({
            submitted_by: submission.submitted_by || submission.student_id,
            is_original: submission.is_original !== undefined ? submission.is_original : true,
            source_submission_id: submission.source_submission_id || null
          })
          .eq('id', submission.id);

        if (updateError) {
          console.error(`Error updating submission ${submission.id}:`, updateError.message);
          errors++;
        } else {
          updated++;
          if (updated % 100 === 0) {
            console.log(`  Updated ${updated}/${submissions.length} submissions...`);
          }
        }
      } catch (err) {
        console.error(`Error processing submission ${submission.id}:`, err);
        errors++;
      }
    }

    console.log(`\nStep 2 Complete:`);
    console.log(`  ✓ Updated: ${updated}`);
    console.log(`  ✗ Errors: ${errors}\n`);

    // Step 3: Verify migration
    console.log('Step 3: Verifying migration...');
    const { data: verification, error: verifyError } = await supabase
      .from('lesson_assignment_submissions')
      .select('id, submitted_by, is_original')
      .is('submitted_by', null);

    if (verifyError) {
      throw new Error(`Error verifying migration: ${verifyError.message}`);
    }

    if (verification && verification.length > 0) {
      console.warn(`Warning: ${verification.length} submissions still have null submitted_by`);
    } else {
      console.log('✓ All submissions have submitted_by values');
    }

    // Check is_original distribution
    const { count: originalCount } = await supabase
      .from('lesson_assignment_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('is_original', true);

    const { count: derivedCount } = await supabase
      .from('lesson_assignment_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('is_original', false);

    console.log(`\nSubmission Distribution:`);
    console.log(`  Original submissions: ${originalCount || 0}`);
    console.log(`  Derived submissions: ${derivedCount || 0}`);

    console.log('\n✅ Migration 029 data backfill complete!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\nMigration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration script failed:', error);
    process.exit(1);
  });
