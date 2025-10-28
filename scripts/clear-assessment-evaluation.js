/**
 * Clear evaluation from a transformation assessment to allow re-evaluation
 * Usage: node scripts/clear-assessment-evaluation.js <assessment-id>
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearEvaluation(assessmentId) {
  console.log(`🔧 Clearing evaluation for assessment: ${assessmentId}\n`);

  // First, check current state
  const { data: before, error: fetchError } = await supabase
    .from('transformation_assessments')
    .select('id, status, context_metadata')
    .eq('id', assessmentId)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching assessment:', fetchError.message);
    return;
  }

  if (!before) {
    console.error('❌ Assessment not found');
    return;
  }

  console.log('📊 Current state:');
  console.log(`   Status: ${before.status}`);
  console.log(`   Has evaluation: ${before.context_metadata?.evaluation ? 'Yes' : 'No'}`);

  if (before.context_metadata?.evaluation) {
    console.log(`   Evaluation dimensions: ${before.context_metadata.evaluation.dimension_evaluations?.length || 0}`);
  }
  console.log('');

  // Clear the evaluation by setting it to null
  const { error: updateError } = await supabase
    .from('transformation_assessments')
    .update({
      context_metadata: {
        ...before.context_metadata,
        evaluation: null
      },
      status: 'in_progress' // Reset to in_progress so it can be evaluated again
    })
    .eq('id', assessmentId);

  if (updateError) {
    console.error('❌ Error clearing evaluation:', updateError.message);
    return;
  }

  // Verify the update
  const { data: after, error: verifyError } = await supabase
    .from('transformation_assessments')
    .select('id, status, context_metadata')
    .eq('id', assessmentId)
    .single();

  if (verifyError) {
    console.error('❌ Error verifying update:', verifyError.message);
    return;
  }

  console.log('✅ Evaluation cleared successfully!\n');
  console.log('📊 New state:');
  console.log(`   Status: ${after.status}`);
  console.log(`   Has evaluation: ${after.context_metadata?.evaluation ? 'Yes' : 'No'}`);
  console.log('');
  console.log('🎯 Next step: Click "Finalizar Evaluación" in the UI to trigger fresh evaluation with:');
  console.log('   ✅ Sonnet model (claude-sonnet-4-20250514)');
  console.log('   ✅ Updated quantitative descriptors');
  console.log('   ✅ Chilean educational context (correct GT/GI definitions)');
}

// Get assessment ID from command line argument
const assessmentId = process.argv[2];

if (!assessmentId) {
  console.error('❌ Usage: node scripts/clear-assessment-evaluation.js <assessment-id>');
  console.error('   Example: node scripts/clear-assessment-evaluation.js 43a5b3ee-5a0a-45bf-9cde-4f652330e964');
  process.exit(1);
}

clearEvaluation(assessmentId)
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
