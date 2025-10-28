#!/usr/bin/env node

/**
 * List My Assessments
 *
 * Shows all transformation assessments for the current user
 * with their IDs, status, and progress
 *
 * Usage:
 *   node scripts/list-my-assessments.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listAssessments() {
  console.log('📋 Listing All Transformation Assessments\n');

  try {
    const { data: assessments, error } = await supabase
      .from('transformation_assessments')
      .select('id, area, status, started_at, updated_at, context_metadata, growth_community_id')
      .order('started_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching assessments:', error.message);
      process.exit(1);
    }

    if (!assessments || assessments.length === 0) {
      console.log('ℹ️  No assessments found\n');
      return;
    }

    console.log(`Found ${assessments.length} assessment(s):\n`);

    for (const assessment of assessments) {
      const metadata = assessment.context_metadata || {};
      const responseCount = Object.keys(metadata.responses || {}).length;
      const objectiveEvalCount = Object.keys(metadata.objective_evaluations || {}).length;
      const hasOverallEval = !!metadata.evaluation;

      console.log('━'.repeat(70));
      console.log(`📊 Assessment ID: ${assessment.id}`);
      console.log(`   Area: ${assessment.area}`);
      console.log(`   Status: ${assessment.status}`);
      console.log(`   Community ID: ${assessment.growth_community_id}`);
      console.log(`   Started: ${new Date(assessment.started_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(assessment.updated_at).toLocaleString()}`);
      console.log(`   Progress:`);
      console.log(`     • Responses: ${responseCount}/44 sections`);
      console.log(`     • Objective Evaluations: ${objectiveEvalCount}/6 objectives`);
      console.log(`     • Overall Evaluation: ${hasOverallEval ? 'Complete' : 'Pending'}`);
      console.log();
    }

    console.log('━'.repeat(70));
    console.log('\n💡 To reset an assessment, use:');
    console.log('   node scripts/reset-assessment-fresh-start.js <assessment-id>\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

listAssessments();
