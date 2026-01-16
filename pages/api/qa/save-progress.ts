/**
 * QA Progress Save API
 *
 * POST - Save partial progress (time tracking) for a test run in progress
 * Used for periodic auto-saves to prevent data loss on browser crash/refresh
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';

interface SaveProgressRequest {
  test_run_id: string;
  current_step_index: number;
  step_active_seconds: number;
  total_active_seconds: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    return handleSaveProgress(req, res);
  }

  return handleMethodNotAllowed(res, ['POST']);
}

/**
 * POST /api/qa/save-progress
 * Saves partial progress for a test run in progress
 */
async function handleSaveProgress(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const body: SaveProgressRequest = req.body;

    // Validate required fields
    if (
      !body.test_run_id ||
      body.current_step_index === undefined ||
      body.step_active_seconds === undefined ||
      body.total_active_seconds === undefined
    ) {
      return res.status(400).json({
        error: 'Faltan campos requeridos: test_run_id, current_step_index, step_active_seconds, total_active_seconds',
      });
    }

    // Verify the test run exists, belongs to this user, and is in progress
    const { data: testRun, error: runError } = await supabaseClient
      .from('qa_test_runs')
      .select('id, tester_id, status, scenario_id')
      .eq('id', body.test_run_id)
      .single();

    if (runError || !testRun) {
      return res.status(404).json({
        error: 'Ejecución de prueba no encontrada',
      });
    }

    if (testRun.tester_id !== user.id) {
      return res.status(403).json({
        error: 'No puedes guardar progreso en esta ejecución',
      });
    }

    if (testRun.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Esta ejecución ya ha sido completada o abortada',
      });
    }

    // Update the test run with partial total_active_seconds
    // This is a running total that will be finalized when the test completes
    const { error: updateRunError } = await supabaseClient
      .from('qa_test_runs')
      .update({
        total_active_seconds: body.total_active_seconds,
      })
      .eq('id', body.test_run_id);

    if (updateRunError) {
      console.error('Error updating test run progress:', updateRunError);
      // Don't fail the request, just log it - sessionStorage has the backup
    }

    // Check if we have an existing step result for the current step
    // If so, update its active_seconds
    const { data: existingStepResult, error: stepError } = await supabaseClient
      .from('qa_step_results')
      .select('id, active_seconds')
      .eq('test_run_id', body.test_run_id)
      .eq('step_index', body.current_step_index + 1) // step_index is 1-based
      .single();

    if (existingStepResult && !stepError) {
      // Update existing step result's active_seconds
      const { error: updateStepError } = await supabaseClient
        .from('qa_step_results')
        .update({
          active_seconds: body.step_active_seconds,
        })
        .eq('id', existingStepResult.id);

      if (updateStepError) {
        console.error('Error updating step active_seconds:', updateStepError);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Progreso guardado',
      saved: {
        test_run_id: body.test_run_id,
        total_active_seconds: body.total_active_seconds,
        step_updated: !!existingStepResult,
      },
    });
  } catch (err) {
    console.error('Unexpected error saving progress:', err);
    return res.status(500).json({
      error: 'Error inesperado al guardar progreso',
    });
  }
}
