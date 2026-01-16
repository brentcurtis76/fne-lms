/**
 * QA Step Results API
 *
 * POST - Save a step result
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type { SaveStepResultRequest, QATestRun, QAStepResult } from '@/types/qa';
import { notifyQAFailure, getAdminUserIds } from '@/lib/qa/notifyFailure';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    return handleSaveStepResult(req, res);
  }

  return handleMethodNotAllowed(res, ['POST']);
}

/**
 * POST /api/qa/step-results
 * Saves a step result for a test run
 */
async function handleSaveStepResult(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const body: SaveStepResultRequest = req.body;

    // Validate required fields
    if (
      !body.test_run_id ||
      body.step_index === undefined ||
      !body.step_instruction ||
      !body.expected_outcome ||
      body.passed === undefined
    ) {
      return res.status(400).json({
        error:
          'Faltan campos requeridos: test_run_id, step_index, step_instruction, expected_outcome, passed',
      });
    }

    // Verify the test run exists and belongs to this user
    const { data: testRun, error: runError } = await supabaseClient
      .from('qa_test_runs')
      .select('id, tester_id, status')
      .eq('id', body.test_run_id)
      .single();

    if (runError || !testRun) {
      return res.status(404).json({
        error: 'Ejecución de prueba no encontrada',
      });
    }

    if (testRun.tester_id !== user.id) {
      return res.status(403).json({
        error: 'No puedes agregar resultados a esta ejecución',
      });
    }

    if (testRun.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Esta ejecución ya ha sido completada o abortada',
      });
    }

    // Extract active_seconds from body (extended type)
    const activeSeconds = (body as any).active_seconds;

    // Check if this step already has a result
    const { data: existingResult, error: checkError } = await supabaseClient
      .from('qa_step_results')
      .select('id')
      .eq('test_run_id', body.test_run_id)
      .eq('step_index', body.step_index)
      .single();

    if (existingResult) {
      // Update existing result
      const { data: stepResult, error: updateError } = await supabaseClient
        .from('qa_step_results')
        .update({
          passed: body.passed,
          tester_note: body.tester_note || null,
          console_logs: body.console_logs || [],
          network_logs: body.network_logs || [],
          screenshot_url: body.screenshot_url || null,
          dom_snapshot: body.dom_snapshot || null,
          time_spent_seconds: body.time_spent_seconds || null,
          active_seconds: activeSeconds || null,
          captured_at: new Date().toISOString(),
        })
        .eq('id', existingResult.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating step result:', updateError);
        return res.status(500).json({
          error: 'Error al actualizar resultado del paso',
          details: updateError.message,
        });
      }

      // Send failure notification if step failed
      if (body.passed === false) {
        await sendFailureNotification(supabaseClient, body.test_run_id, stepResult);
      }

      return res.status(200).json({
        success: true,
        stepResult,
        message: 'Resultado actualizado',
      });
    }

    // Create new step result
    const stepResultData = {
      test_run_id: body.test_run_id,
      step_index: body.step_index,
      step_instruction: body.step_instruction,
      expected_outcome: body.expected_outcome,
      passed: body.passed,
      tester_note: body.tester_note || null,
      console_logs: body.console_logs || [],
      network_logs: body.network_logs || [],
      screenshot_url: body.screenshot_url || null,
      dom_snapshot: body.dom_snapshot || null,
      time_spent_seconds: body.time_spent_seconds || null,
      active_seconds: activeSeconds || null,
    };

    const { data: stepResult, error: insertError } = await supabaseClient
      .from('qa_step_results')
      .insert(stepResultData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating step result:', insertError);
      return res.status(500).json({
        error: 'Error al guardar resultado del paso',
        details: insertError.message,
      });
    }

    // Send failure notification if step failed
    if (body.passed === false) {
      await sendFailureNotification(supabaseClient, body.test_run_id, stepResult);
    }

    return res.status(201).json({
      success: true,
      stepResult,
    });
  } catch (err) {
    console.error('Unexpected error saving step result:', err);
    return res.status(500).json({
      error: 'Error inesperado al guardar resultado del paso',
    });
  }
}

/**
 * Helper to send failure notification to admin users
 */
async function sendFailureNotification(
  supabaseClient: any,
  testRunId: string,
  stepResult: any
): Promise<void> {
  try {
    // Fetch full test run with scenario and tester info
    const { data: fullTestRun, error: fetchError } = await supabaseClient
      .from('qa_test_runs')
      .select(`
        *,
        scenario:qa_scenarios(*),
        tester:profiles!qa_test_runs_tester_id_fkey(email, first_name, last_name)
      `)
      .eq('id', testRunId)
      .single();

    if (fetchError || !fullTestRun) {
      console.error('Could not fetch test run for notification:', fetchError);
      return;
    }

    // Get admin user IDs
    const adminUserIds = await getAdminUserIds(supabaseClient);

    if (adminUserIds.length === 0) {
      console.log('No admin users to notify about QA failure');
      return;
    }

    // Build the step result object with required fields
    const failedStep: QAStepResult = {
      id: stepResult.id,
      test_run_id: testRunId,
      step_index: stepResult.step_index,
      step_instruction: stepResult.step_instruction,
      expected_outcome: stepResult.expected_outcome,
      passed: stepResult.passed,
      tester_note: stepResult.tester_note,
      console_logs: stepResult.console_logs || [],
      network_logs: stepResult.network_logs || [],
      screenshot_url: stepResult.screenshot_url,
      dom_snapshot: stepResult.dom_snapshot,
      captured_at: stepResult.captured_at,
      time_spent_seconds: stepResult.time_spent_seconds,
    };

    // Send notification
    const result = await notifyQAFailure(fullTestRun as QATestRun, failedStep, adminUserIds);

    if (result.success) {
      console.log(`✅ QA failure notification sent to ${result.notificationsCreated || 0} admins`);
    } else {
      console.error('❌ Failed to send QA failure notification:', result.error);
    }
  } catch (error) {
    console.error('Error sending QA failure notification:', error);
    // Don't throw - notification failures shouldn't break the step result save
  }
}
