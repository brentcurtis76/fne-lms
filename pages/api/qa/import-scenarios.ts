/**
 * QA Scenario Import API
 *
 * POST - Import scenarios from Claude Code generated JSON
 * Supports automatic assignment to QA test users based on role_required
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createApiSupabaseClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type {
  CreateScenarioRequest,
  ImportScenariosRequest,
  ImportScenariosResponse,
  QAScenarioStep,
  FeatureArea,
} from '@/types/qa';
import { getQATestUserForRole } from '@/lib/qa/testUserMapping';

// Extended request type with assignment option
interface ImportScenariosRequestExtended extends ImportScenariosRequest {
  auto_assign?: boolean; // If true, assign scenarios to QA test user based on role_required
  assign_to_role?: string; // Override role for assignment (use this instead of scenario's role_required)
}

// Valid feature areas (includes both original and generator feature areas)
const VALID_FEATURE_AREAS: string[] = [
  // Original feature areas
  'authentication',
  'user_management',
  'role_assignment',
  'school_management',
  'course_builder',
  'course_enrollment',
  'assessment_builder',
  'transformation_assessment',
  'quiz_submission',
  'reporting',
  'network_management',
  'community_workspace',
  // Generator feature areas
  'course_management',
  'docente_experience',
  'navigation',
  'collaborative_space',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Solo administradores pueden importar escenarios',
    });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const body: ImportScenariosRequestExtended = req.body;

    console.log('Import scenarios request:', JSON.stringify(body, null, 2));

    if (!body.scenarios || !Array.isArray(body.scenarios)) {
      return res.status(400).json({
        error: 'El cuerpo debe contener un array "scenarios"',
      });
    }

    // Check if we should auto-assign to QA testers
    const autoAssign = body.auto_assign ?? false;
    const assignToRoleOverride = body.assign_to_role;

    const results: ImportScenariosResponse & { assignments_created?: number } = {
      imported: 0,
      skipped: 0,
      errors: [],
      assignments_created: 0,
    };

    for (let i = 0; i < body.scenarios.length; i++) {
      const scenario = body.scenarios[i];

      // Validate required fields
      if (!scenario.name) {
        results.errors.push(`Escenario ${i + 1}: Falta el nombre`);
        results.skipped++;
        continue;
      }

      if (!scenario.feature_area || !VALID_FEATURE_AREAS.includes(scenario.feature_area)) {
        results.errors.push(
          `Escenario ${i + 1} (${scenario.name}): feature_area inválido o faltante`
        );
        results.skipped++;
        continue;
      }

      if (!scenario.role_required) {
        results.errors.push(
          `Escenario ${i + 1} (${scenario.name}): role_required es requerido`
        );
        results.skipped++;
        continue;
      }

      if (!scenario.steps || !Array.isArray(scenario.steps) || scenario.steps.length === 0) {
        results.errors.push(
          `Escenario ${i + 1} (${scenario.name}): Debe tener al menos un paso`
        );
        results.skipped++;
        continue;
      }

      // Validate steps
      let stepsValid = true;
      for (let j = 0; j < scenario.steps.length; j++) {
        const step = scenario.steps[j];
        if (!step.instruction || !step.expectedOutcome) {
          results.errors.push(
            `Escenario ${i + 1} (${scenario.name}), Paso ${j + 1}: Falta instruction o expectedOutcome`
          );
          stepsValid = false;
          break;
        }
      }

      if (!stepsValid) {
        results.skipped++;
        continue;
      }

      // Check for duplicate by name
      const { data: existing } = await supabaseClient
        .from('qa_scenarios')
        .select('id')
        .eq('name', scenario.name)
        .single();

      if (existing) {
        results.errors.push(
          `Escenario "${scenario.name}": Ya existe un escenario con este nombre`
        );
        results.skipped++;
        continue;
      }

      // Create the scenario
      const scenarioData = {
        name: scenario.name,
        description: scenario.description || null,
        feature_area: scenario.feature_area,
        role_required: scenario.role_required,
        preconditions: scenario.preconditions || [],
        steps: scenario.steps.map((step, index) => ({
          index: index + 1,
          instruction: step.instruction,
          expectedOutcome: step.expectedOutcome,
          route: step.route || null,
          elementToCheck: step.elementToCheck || null,
          captureOnFail: step.captureOnFail ?? true,
          captureOnPass: step.captureOnPass ?? false,
          // Multi-user scenario fields
          actor: step.actor || null,
          tabIndicator: step.tabIndicator || null,
        })),
        priority: scenario.priority || 2,
        estimated_duration_minutes: scenario.estimated_duration_minutes || 5,
        created_by: user.id,
        is_active: true,
        is_multi_user: scenario.is_multi_user || false,
      };

      const { data: insertedScenario, error: insertError } = await supabaseClient
        .from('qa_scenarios')
        .insert(scenarioData)
        .select('id')
        .single();

      if (insertError || !insertedScenario) {
        results.errors.push(
          `Escenario "${scenario.name}": Error al guardar - ${insertError?.message || 'No se pudo crear'}`
        );
        results.skipped++;
        continue;
      }

      results.imported++;

      // Auto-assign to QA test user if enabled
      if (autoAssign) {
        const roleToAssign = assignToRoleOverride || scenario.role_required;
        const testUser = getQATestUserForRole(roleToAssign);

        if (testUser) {
          const { error: assignError } = await supabaseClient
            .from('qa_scenario_assignments')
            .insert({
              scenario_id: insertedScenario.id,
              tester_id: testUser.userId,
              assigned_by: user.id,
              status: 'pending',
            });

          if (assignError) {
            console.warn(
              `Could not assign scenario "${scenario.name}" to ${testUser.email}:`,
              assignError.message
            );
            // Don't fail the whole import, just log the warning
          } else {
            results.assignments_created = (results.assignments_created || 0) + 1;
          }
        } else {
          console.warn(
            `No QA test user found for role "${roleToAssign}" - scenario "${scenario.name}" not assigned`
          );
        }
      }
    }

    return res.status(200).json({
      success: true,
      ...results,
    });
  } catch (err: any) {
    console.error('Unexpected error importing scenarios:', err);
    return res.status(500).json({
      error: 'Error inesperado al importar escenarios',
      details: err.message,
    });
  }
}
