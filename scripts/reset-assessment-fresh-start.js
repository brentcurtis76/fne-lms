#!/usr/bin/env node

/**
 * Reset Assessment - Fresh Start
 *
 * This script completely resets a transformation assessment to start a new experience:
 * 1. Clears all responses from context_metadata.responses
 * 2. Clears all objective evaluations from context_metadata.objective_evaluations
 * 3. Clears overall evaluation from context_metadata.evaluation
 * 4. Resets status to 'in_progress'
 * 5. Resets updated_at timestamp
 *
 * Usage:
 *   node scripts/reset-assessment-fresh-start.js <assessment-id>
 *
 * Example:
 *   node scripts/reset-assessment-fresh-start.js 43a5b3ee-5a0a-45bf-9cde-4f652330e964
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetAssessment(assessmentId) {
  console.log('🧹 Resetting Assessment to Fresh Start...\n');
  console.log(`Assessment ID: ${assessmentId}\n`);

  try {
    // 1. First, verify the assessment exists
    console.log('1️⃣  Verifying assessment exists...');
    const { data: assessment, error: fetchError } = await supabase
      .from('transformation_assessments')
      .select('id, area, status, context_metadata, started_at')
      .eq('id', assessmentId)
      .single();

    if (fetchError || !assessment) {
      console.error('❌ Assessment not found:', fetchError?.message || 'No data returned');
      process.exit(1);
    }

    console.log(`   ✅ Found assessment: ${assessment.area} (${assessment.status})`);
    console.log(`   Started: ${assessment.started_at}\n`);

    // 2. Show what will be cleared
    console.log('2️⃣  Current data to be cleared:');
    const currentMetadata = assessment.context_metadata || {};
    const responseCount = Object.keys(currentMetadata.responses || {}).length;
    const objectiveEvalCount = Object.keys(currentMetadata.objective_evaluations || {}).length;
    const hasOverallEval = !!currentMetadata.evaluation;

    console.log(`   📝 Responses: ${responseCount} sections answered`);
    console.log(`   📊 Objective Evaluations: ${objectiveEvalCount} objectives evaluated`);
    console.log(`   🎯 Overall Evaluation: ${hasOverallEval ? 'Yes' : 'No'}\n`);

    if (responseCount === 0 && objectiveEvalCount === 0 && !hasOverallEval) {
      console.log('ℹ️  Assessment is already clean - nothing to reset');
      return;
    }

    // 3. Reset the assessment
    console.log('3️⃣  Resetting assessment data...');
    const { data: updated, error: updateError } = await supabase
      .from('transformation_assessments')
      .update({
        status: 'in_progress',
        context_metadata: {
          responses: {},
          // Keep any other metadata (like user_id, etc.) but clear evaluation data
          ...(currentMetadata.user_id && { user_id: currentMetadata.user_id }),
          ...(currentMetadata.school_id && { school_id: currentMetadata.school_id }),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId)
      .select();

    if (updateError) {
      console.error('❌ Failed to reset assessment:', updateError.message);
      process.exit(1);
    }

    console.log('   ✅ Assessment reset successfully\n');

    // 4. Verify the reset
    console.log('4️⃣  Verifying reset...');
    const { data: verified, error: verifyError } = await supabase
      .from('transformation_assessments')
      .select('status, context_metadata')
      .eq('id', assessmentId)
      .single();

    if (verifyError || !verified) {
      console.error('❌ Failed to verify reset:', verifyError?.message);
      process.exit(1);
    }

    const verifiedMetadata = verified.context_metadata || {};
    console.log(`   Status: ${verified.status}`);
    console.log(`   Responses: ${Object.keys(verifiedMetadata.responses || {}).length}`);
    console.log(`   Objective Evaluations: ${Object.keys(verifiedMetadata.objective_evaluations || {}).length}`);
    console.log(`   Overall Evaluation: ${verifiedMetadata.evaluation ? 'Yes' : 'No'}\n`);

    // 5. Success summary
    console.log('✅ ASSESSMENT RESET COMPLETE\n');
    console.log('📋 Summary:');
    console.log(`   • Cleared ${responseCount} responses`);
    console.log(`   • Cleared ${objectiveEvalCount} objective evaluations`);
    if (hasOverallEval) {
      console.log('   • Cleared overall evaluation');
    }
    console.log(`   • Status reset to: in_progress`);
    console.log('   • Ready for fresh start!\n');

    console.log('🌐 Access the assessment at:');
    console.log(`   http://localhost:3000/community/transformation/assessment?communityId=${assessment.growth_community_id}\n`);
    console.log('📝 Note: The page loads by community ID, not assessment ID.');
    console.log('   It will find/create the assessment for this community automatically.\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Main execution
const assessmentId = process.argv[2];

if (!assessmentId) {
  console.error('❌ Missing required argument: assessment-id\n');
  console.error('Usage:');
  console.error('  node scripts/reset-assessment-fresh-start.js <assessment-id>\n');
  console.error('Example:');
  console.error('  node scripts/reset-assessment-fresh-start.js 43a5b3ee-5a0a-45bf-9cde-4f652330e964\n');
  process.exit(1);
}

// UUID validation
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(assessmentId)) {
  console.error('❌ Invalid assessment ID format (must be a valid UUID)\n');
  console.error(`Provided: ${assessmentId}\n`);
  process.exit(1);
}

resetAssessment(assessmentId).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
