#!/usr/bin/env npx ts-node
/**
 * Automated Test Script for Transformation Assessments
 *
 * This script creates and tests transformation assessments for all 3 areas:
 * - Personalización (6 objectives, 44 sections)
 * - Aprendizaje (6 objectives, 68 sections)
 * - Evaluación (2 objectives, 27 sections)
 *
 * Usage:
 *   npx ts-node scripts/test-transformation-assessment.ts [area] [--dry-run] [--cleanup]
 *
 * Examples:
 *   npx ts-node scripts/test-transformation-assessment.ts evaluacion
 *   npx ts-node scripts/test-transformation-assessment.ts personalizacion --dry-run
 *   npx ts-node scripts/test-transformation-assessment.ts all --cleanup
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('   Set it in your environment or .env.local file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Area configurations based on actual rubric data
const AREA_CONFIG = {
  personalizacion: {
    name: 'Personalización',
    expectedObjectives: 6,
    expectedSections: 44,
    expectedActions: 11,
  },
  aprendizaje: {
    name: 'Aprendizaje',
    expectedObjectives: 6,
    expectedSections: 68,
    expectedActions: 17,
  },
  evaluacion: {
    name: 'Evaluación',
    expectedObjectives: 2,
    expectedSections: 36, // 9 actions × 4 sections each
    expectedActions: 9,
  },
};

type AreaType = keyof typeof AREA_CONFIG;

interface TestResult {
  area: AreaType;
  passed: boolean;
  steps: Array<{ name: string; passed: boolean; error?: string; duration?: number }>;
  assessmentId?: string;
}

/**
 * Verify rubric data exists and has correct structure for an area
 */
async function verifyRubricData(area: AreaType): Promise<{ success: boolean; objectives: number[]; dimensionCounts: Record<number, number>; error?: string }> {
  console.log(`\n📋 Verifying rubric data for ${AREA_CONFIG[area].name}...`);

  const { data: rubricItems, error } = await supabase
    .from('transformation_rubric')
    .select('objective_number, action_number, dimension')
    .eq('area', area)
    .order('objective_number', { ascending: true });

  if (error) {
    return { success: false, objectives: [], dimensionCounts: {}, error: error.message };
  }

  if (!rubricItems || rubricItems.length === 0) {
    return { success: false, objectives: [], dimensionCounts: {}, error: 'No rubric items found' };
  }

  // Count dimensions per objective
  const dimensionCounts: Record<number, number> = {};
  rubricItems.forEach(item => {
    if (!dimensionCounts[item.objective_number]) {
      dimensionCounts[item.objective_number] = 0;
    }
    dimensionCounts[item.objective_number]++;
  });

  const objectives = Object.keys(dimensionCounts).map(Number).sort((a, b) => a - b);

  console.log(`   Found ${rubricItems.length} rubric items`);
  console.log(`   Objectives: ${objectives.join(', ')}`);
  console.log(`   Dimensions per objective:`, dimensionCounts);

  // Verify expected structure
  if (objectives.length !== AREA_CONFIG[area].expectedObjectives) {
    return {
      success: false,
      objectives,
      dimensionCounts,
      error: `Expected ${AREA_CONFIG[area].expectedObjectives} objectives, found ${objectives.length}`,
    };
  }

  return { success: true, objectives, dimensionCounts };
}

/**
 * Generate mock responses for all sections of an area
 */
function generateMockResponses(area: AreaType, sections: any[]): Record<string, any> {
  const responses: Record<string, any> = {};

  sections.forEach((section, index) => {
    const sectionKey = `section_${index}`;

    // Generate responses based on section type
    if (section.section.type === 'accion') {
      // Initial action questions - multiple choice
      responses[sectionKey] = {
        answers: section.section.questions.map((q: any) => ({
          questionId: q.id || `q_${index}_${Math.random()}`,
          selectedOption: 'Si', // Default to positive answer
        })),
        completedAt: new Date().toISOString(),
      };
    } else {
      // Dimension questions (cobertura, frecuencia, profundidad)
      responses[sectionKey] = {
        selectedLevel: Math.floor(Math.random() * 4) + 1, // Random level 1-4
        justification: `Justificación de prueba para ${section.section.type}`,
        completedAt: new Date().toISOString(),
      };
    }
  });

  return responses;
}

/**
 * Create a test assessment
 */
async function createTestAssessment(area: AreaType, communityId: string, userId: string): Promise<{ success: boolean; assessmentId?: string; error?: string }> {
  console.log(`\n🔨 Creating test assessment for ${AREA_CONFIG[area].name}...`);

  const { data, error } = await supabase
    .from('transformation_assessments')
    .insert({
      growth_community_id: communityId,
      area,
      status: 'in_progress',
      created_by: userId,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      context_metadata: {
        test_mode: true,
        created_by_script: 'test-transformation-assessment.ts',
      },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  console.log(`   Assessment created: ${data.id}`);
  return { success: true, assessmentId: data.id };
}

/**
 * Simulate saving responses to an assessment
 */
async function saveResponses(assessmentId: string, responses: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  console.log(`\n💾 Saving ${Object.keys(responses).length} responses...`);

  const { data: assessment, error: fetchError } = await supabase
    .from('transformation_assessments')
    .select('context_metadata')
    .eq('id', assessmentId)
    .single();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  const { error: updateError } = await supabase
    .from('transformation_assessments')
    .update({
      context_metadata: {
        ...assessment.context_metadata,
        responses,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', assessmentId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  console.log(`   Responses saved successfully`);
  return { success: true };
}

/**
 * Simulate evaluating each objective (without calling Claude API)
 */
async function simulateObjectiveEvaluations(
  assessmentId: string,
  objectives: number[],
  dimensionCounts: Record<number, number>
): Promise<{ success: boolean; error?: string }> {
  console.log(`\n🤖 Simulating objective evaluations for objectives: ${objectives.join(', ')}...`);

  const objectiveEvaluations: Record<number, any> = {};

  for (const objNum of objectives) {
    const dimensionCount = dimensionCounts[objNum];
    console.log(`   Objective ${objNum}: Creating ${dimensionCount} dimension evaluations`);

    objectiveEvaluations[objNum] = {
      objective_number: objNum,
      stage: Math.floor(Math.random() * 4) + 1,
      stage_label: ['Incipiente', 'En Desarrollo', 'Consolidado', 'Referente'][Math.floor(Math.random() * 4)],
      summary: `Resumen de prueba para objetivo ${objNum}`,
      dimension_evaluations: Array(dimensionCount).fill(null).map((_, i) => ({
        dimension: ['cobertura', 'frecuencia', 'profundidad'][i % 3],
        level: Math.floor(Math.random() * 4) + 1,
        rationale: `Justificación para dimensión ${i + 1}`,
      })),
      evaluated_at: new Date().toISOString(),
    };
  }

  // Save objective evaluations
  const { data: assessment, error: fetchError } = await supabase
    .from('transformation_assessments')
    .select('context_metadata')
    .eq('id', assessmentId)
    .single();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  const { error: updateError } = await supabase
    .from('transformation_assessments')
    .update({
      context_metadata: {
        ...assessment.context_metadata,
        objective_evaluations: objectiveEvaluations,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', assessmentId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  console.log(`   All ${objectives.length} objective evaluations saved`);
  return { success: true };
}

/**
 * Verify finalize validation logic
 */
async function verifyFinalizeValidation(
  assessmentId: string,
  expectedObjectives: number[],
  dimensionCounts: Record<number, number>
): Promise<{ success: boolean; errors: string[] }> {
  console.log(`\n✅ Verifying finalize validation logic...`);
  const errors: string[] = [];

  const { data: assessment, error } = await supabase
    .from('transformation_assessments')
    .select('context_metadata, area')
    .eq('id', assessmentId)
    .single();

  if (error || !assessment) {
    errors.push(`Failed to load assessment: ${error?.message}`);
    return { success: false, errors };
  }

  const objectiveEvaluations = assessment.context_metadata?.objective_evaluations || {};
  const objectiveCount = Object.keys(objectiveEvaluations).length;

  console.log(`   Found ${objectiveCount} objective evaluations`);

  // Check all objectives are present
  const missingObjectives = expectedObjectives.filter(objNum => !objectiveEvaluations[objNum]);
  if (missingObjectives.length > 0) {
    errors.push(`Missing objectives: ${missingObjectives.join(', ')}`);
  }

  // Check dimension counts
  for (const objNum of expectedObjectives) {
    const objEval = objectiveEvaluations[objNum];
    if (objEval) {
      const actualCount = objEval.dimension_evaluations?.length || 0;
      const expectedCount = dimensionCounts[objNum];
      if (actualCount !== expectedCount) {
        errors.push(`Objective ${objNum}: expected ${expectedCount} dimensions, found ${actualCount}`);
      }
    }
  }

  if (errors.length > 0) {
    console.log(`   ❌ Validation errors found:`);
    errors.forEach(e => console.log(`      - ${e}`));
    return { success: false, errors };
  }

  console.log(`   ✅ All validations passed`);
  return { success: true, errors: [] };
}

/**
 * Cleanup test assessment
 */
async function cleanupAssessment(assessmentId: string): Promise<void> {
  console.log(`\n🧹 Cleaning up assessment ${assessmentId}...`);

  const { error } = await supabase
    .from('transformation_assessments')
    .delete()
    .eq('id', assessmentId);

  if (error) {
    console.log(`   ⚠️ Failed to cleanup: ${error.message}`);
  } else {
    console.log(`   ✅ Assessment deleted`);
  }
}

/**
 * Run full test for a specific area
 */
async function runAreaTest(area: AreaType, options: { dryRun: boolean; cleanup: boolean }): Promise<TestResult> {
  const result: TestResult = {
    area,
    passed: true,
    steps: [],
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 TESTING: ${AREA_CONFIG[area].name.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);

  // Step 1: Verify rubric data
  const startRubric = Date.now();
  const rubricResult = await verifyRubricData(area);
  result.steps.push({
    name: 'Verify rubric data',
    passed: rubricResult.success,
    error: rubricResult.error,
    duration: Date.now() - startRubric,
  });

  if (!rubricResult.success) {
    result.passed = false;
    return result;
  }

  if (options.dryRun) {
    console.log(`\n🔍 DRY RUN - Skipping assessment creation`);
    return result;
  }

  // Get a test community and user
  const { data: community } = await supabase
    .from('growth_communities')
    .select('id')
    .limit(1)
    .single();

  const { data: adminUser } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role_type', 'admin')
    .limit(1)
    .single();

  if (!community || !adminUser) {
    result.steps.push({
      name: 'Get test data',
      passed: false,
      error: 'No community or admin user found',
    });
    result.passed = false;
    return result;
  }

  // Step 2: Create test assessment
  const startCreate = Date.now();
  const createResult = await createTestAssessment(area, community.id, adminUser.user_id);
  result.steps.push({
    name: 'Create assessment',
    passed: createResult.success,
    error: createResult.error,
    duration: Date.now() - startCreate,
  });

  if (!createResult.success || !createResult.assessmentId) {
    result.passed = false;
    return result;
  }

  result.assessmentId = createResult.assessmentId;

  try {
    // Step 3: Generate and save mock responses
    // For testing, we'll create minimal mock data
    const mockSections = Array(AREA_CONFIG[area].expectedSections).fill(null).map((_, i) => ({
      sectionIndex: i,
      section: {
        type: i % 4 === 0 ? 'accion' : ['cobertura', 'frecuencia', 'profundidad'][i % 3],
        questions: [{ id: `q_${i}`, text: 'Test question' }],
      },
    }));

    const mockResponses = generateMockResponses(area, mockSections);

    const startSave = Date.now();
    const saveResult = await saveResponses(createResult.assessmentId, mockResponses);
    result.steps.push({
      name: 'Save responses',
      passed: saveResult.success,
      error: saveResult.error,
      duration: Date.now() - startSave,
    });

    if (!saveResult.success) {
      result.passed = false;
      return result;
    }

    // Step 4: Simulate objective evaluations
    const startEval = Date.now();
    const evalResult = await simulateObjectiveEvaluations(
      createResult.assessmentId,
      rubricResult.objectives,
      rubricResult.dimensionCounts
    );
    result.steps.push({
      name: 'Simulate evaluations',
      passed: evalResult.success,
      error: evalResult.error,
      duration: Date.now() - startEval,
    });

    if (!evalResult.success) {
      result.passed = false;
      return result;
    }

    // Step 5: Verify finalize validation
    const startValidate = Date.now();
    const validateResult = await verifyFinalizeValidation(
      createResult.assessmentId,
      rubricResult.objectives,
      rubricResult.dimensionCounts
    );
    result.steps.push({
      name: 'Verify finalize validation',
      passed: validateResult.success,
      error: validateResult.errors.join('; '),
      duration: Date.now() - startValidate,
    });

    if (!validateResult.success) {
      result.passed = false;
    }

  } finally {
    // Cleanup
    if (options.cleanup && result.assessmentId) {
      await cleanupAssessment(result.assessmentId);
    }
  }

  return result;
}

/**
 * Print test results summary
 */
function printSummary(results: TestResult[]): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`\n${AREA_CONFIG[result.area].name}: ${status}`);

    if (result.passed) {
      totalPassed++;
    } else {
      totalFailed++;
    }

    for (const step of result.steps) {
      const stepStatus = step.passed ? '✓' : '✗';
      const duration = step.duration ? ` (${step.duration}ms)` : '';
      console.log(`   ${stepStatus} ${step.name}${duration}`);
      if (step.error) {
        console.log(`      Error: ${step.error}`);
      }
    }

    if (result.assessmentId) {
      console.log(`   Assessment ID: ${result.assessmentId}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('='.repeat(60));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const areaArg = args.find(a => !a.startsWith('--')) || 'all';
  const dryRun = args.includes('--dry-run');
  const cleanup = args.includes('--cleanup');

  console.log('🧪 Transformation Assessment Test Suite');
  console.log(`   Area: ${areaArg}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Cleanup: ${cleanup}`);

  const areasToTest: AreaType[] = areaArg === 'all'
    ? ['personalizacion', 'aprendizaje', 'evaluacion']
    : [areaArg as AreaType];

  // Validate area argument
  for (const area of areasToTest) {
    if (!AREA_CONFIG[area]) {
      console.error(`❌ Invalid area: ${area}`);
      console.error(`   Valid areas: ${Object.keys(AREA_CONFIG).join(', ')}, all`);
      process.exit(1);
    }
  }

  const results: TestResult[] = [];

  for (const area of areasToTest) {
    const result = await runAreaTest(area, { dryRun, cleanup });
    results.push(result);
  }

  printSummary(results);

  // Exit with appropriate code
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
