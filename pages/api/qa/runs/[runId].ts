/**
 * QA Test Run Detail API
 *
 * GET - Get test run details with step results
 * PUT - Update test run (complete/abort)
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  checkIsAdmin,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type { CompleteTestRunRequest } from '@/types/qa';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { runId } = req.query;

  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ error: 'ID de ejecución requerido' });
  }

  if (req.method === 'GET') {
    return handleGetRun(req, res, runId);
  }

  if (req.method === 'PUT') {
    return handleUpdateRun(req, res, runId);
  }

  return handleMethodNotAllowed(res, ['GET', 'PUT']);
}

/**
 * GET /api/qa/runs/[runId]
 */
async function handleGetRun(
  req: NextApiRequest,
  res: NextApiResponse,
  runId: string
) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // First get the test run
    const { data: testRun, error: fetchError } = await supabaseClient
      .from('qa_test_runs')
      .select(
        `
        *,
        scenario:qa_scenarios(*),
        tester:profiles(email, first_name, last_name)
      `
      )
      .eq('id', runId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Ejecución no encontrada' });
      }
      console.error('Error fetching test run:', fetchError);
      return res.status(500).json({
        error: 'Error al obtener ejecución',
        details: fetchError.message,
      });
    }

    // Check permission (own run or admin)
    if (!isAdmin && testRun.tester_id !== user.id) {
      return res.status(403).json({
        error: 'No tienes permiso para ver esta ejecución',
      });
    }

    // Get step results
    const { data: stepResults, error: stepsError } = await supabaseClient
      .from('qa_step_results')
      .select('*')
      .eq('test_run_id', runId)
      .order('step_index', { ascending: true });

    if (stepsError) {
      console.error('Error fetching step results:', stepsError);
    }

    return res.status(200).json({
      success: true,
      testRun: {
        ...testRun,
        step_results: stepResults || [],
      },
    });
  } catch (err) {
    console.error('Unexpected error fetching test run:', err);
    return res.status(500).json({
      error: 'Error inesperado al obtener ejecución',
    });
  }
}

/**
 * PUT /api/qa/runs/[runId]
 * Used to complete or abort a test run
 */
async function handleUpdateRun(
  req: NextApiRequest,
  res: NextApiResponse,
  runId: string
) {
  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user owns this run
    const { data: existingRun, error: fetchError } = await supabaseClient
      .from('qa_test_runs')
      .select('id, tester_id, status')
      .eq('id', runId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Ejecución no encontrada' });
      }
      console.error('Error fetching test run:', fetchError);
      return res.status(500).json({
        error: 'Error al obtener ejecución',
      });
    }

    if (existingRun.tester_id !== user.id) {
      return res.status(403).json({
        error: 'Solo puedes actualizar tus propias ejecuciones',
      });
    }

    if (existingRun.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Esta ejecución ya ha sido completada o abortada',
      });
    }

    const body: CompleteTestRunRequest & { status?: string; total_active_seconds?: number } = req.body;

    // Build update data
    const updateData: Record<string, unknown> = {
      completed_at: new Date().toISOString(),
    };

    if (body.status === 'aborted') {
      updateData.status = 'aborted';
      updateData.overall_result = null;
    } else if (body.overall_result) {
      updateData.status = 'completed';
      updateData.overall_result = body.overall_result;
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    // Save total active seconds for billing
    if (body.total_active_seconds !== undefined) {
      updateData.total_active_seconds = body.total_active_seconds;
    }

    const { data: testRun, error: updateError } = await supabaseClient
      .from('qa_test_runs')
      .update(updateData)
      .eq('id', runId)
      .select(
        `
        *,
        scenario:qa_scenarios(id, name)
      `
      )
      .single();

    if (updateError) {
      console.error('Error updating test run:', updateError);
      return res.status(500).json({
        error: 'Error al actualizar ejecución',
        details: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      testRun,
    });
  } catch (err) {
    console.error('Unexpected error updating test run:', err);
    return res.status(500).json({
      error: 'Error inesperado al actualizar ejecución',
    });
  }
}
