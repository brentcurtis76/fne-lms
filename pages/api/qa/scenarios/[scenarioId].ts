/**
 * QA Scenario Detail API
 *
 * GET - Get scenario details
 * PUT - Update scenario (admin only)
 * DELETE - Delete scenario (admin only)
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  checkIsAdmin,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type { UpdateScenarioRequest } from '@/types/qa';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { scenarioId } = req.query;

  if (!scenarioId || typeof scenarioId !== 'string') {
    return res.status(400).json({ error: 'ID de escenario requerido' });
  }

  if (req.method === 'GET') {
    return handleGetScenario(req, res, scenarioId);
  }

  if (req.method === 'PUT') {
    return handleUpdateScenario(req, res, scenarioId);
  }

  if (req.method === 'DELETE') {
    return handleDeleteScenario(req, res, scenarioId);
  }

  return handleMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
}

/**
 * GET /api/qa/scenarios/[scenarioId]
 */
async function handleGetScenario(
  req: NextApiRequest,
  res: NextApiResponse,
  scenarioId: string
) {
  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const { data: scenario, error: fetchError } = await supabaseClient
      .from('qa_scenarios')
      .select('*')
      .eq('id', scenarioId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Escenario no encontrado' });
      }
      console.error('Error fetching scenario:', fetchError);
      return res.status(500).json({
        error: 'Error al obtener escenario',
        details: fetchError.message,
      });
    }

    return res.status(200).json({
      success: true,
      scenario,
    });
  } catch (err) {
    console.error('Unexpected error fetching scenario:', err);
    return res.status(500).json({
      error: 'Error inesperado al obtener escenario',
    });
  }
}

/**
 * PUT /api/qa/scenarios/[scenarioId]
 */
async function handleUpdateScenario(
  req: NextApiRequest,
  res: NextApiResponse,
  scenarioId: string
) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Solo administradores pueden actualizar escenarios',
    });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const body: UpdateScenarioRequest = req.body;

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.feature_area !== undefined) updateData.feature_area = body.feature_area;
    if (body.role_required !== undefined) updateData.role_required = body.role_required;
    if (body.preconditions !== undefined) updateData.preconditions = body.preconditions;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.estimated_duration_minutes !== undefined) {
      updateData.estimated_duration_minutes = body.estimated_duration_minutes;
    }
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.automated_only !== undefined) {
      updateData.automated_only = body.automated_only;
      // Source of truth: testing_channel. automated_only kept in sync for backward compatibility.
      updateData.testing_channel = body.automated_only ? 'automation' : 'human';
    }

    // Handle steps with proper indexing
    if (body.steps !== undefined) {
      if (!Array.isArray(body.steps)) {
        return res.status(400).json({ error: 'steps debe ser un array' });
      }
      updateData.steps = body.steps.map((step, index) => ({
        ...step,
        index: index + 1,
        captureOnFail: step.captureOnFail ?? true,
        captureOnPass: step.captureOnPass ?? false,
      }));
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const { data: scenario, error: updateError } = await supabaseClient
      .from('qa_scenarios')
      .update(updateData)
      .eq('id', scenarioId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Escenario no encontrado' });
      }
      console.error('Error updating scenario:', updateError);
      return res.status(500).json({
        error: 'Error al actualizar escenario',
        details: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      scenario,
    });
  } catch (err) {
    console.error('Unexpected error updating scenario:', err);
    return res.status(500).json({
      error: 'Error inesperado al actualizar escenario',
    });
  }
}

/**
 * DELETE /api/qa/scenarios/[scenarioId]
 */
async function handleDeleteScenario(
  req: NextApiRequest,
  res: NextApiResponse,
  scenarioId: string
) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Solo administradores pueden eliminar escenarios',
    });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if scenario has test runs
    const { data: testRuns, error: checkError } = await supabaseClient
      .from('qa_test_runs')
      .select('id')
      .eq('scenario_id', scenarioId)
      .limit(1);

    if (checkError) {
      console.error('Error checking test runs:', checkError);
      return res.status(500).json({
        error: 'Error al verificar el escenario',
      });
    }

    if (testRuns && testRuns.length > 0) {
      // Soft delete - just deactivate
      const { error: updateError } = await supabaseClient
        .from('qa_scenarios')
        .update({ is_active: false })
        .eq('id', scenarioId);

      if (updateError) {
        console.error('Error deactivating scenario:', updateError);
        return res.status(500).json({
          error: 'Error al desactivar escenario',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Escenario desactivado (tiene ejecuciones de prueba)',
      });
    }

    // Hard delete if no test runs
    const { error: deleteError } = await supabaseClient
      .from('qa_scenarios')
      .delete()
      .eq('id', scenarioId);

    if (deleteError) {
      console.error('Error deleting scenario:', deleteError);
      return res.status(500).json({
        error: 'Error al eliminar escenario',
        details: deleteError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Escenario eliminado',
    });
  } catch (err) {
    console.error('Unexpected error deleting scenario:', err);
    return res.status(500).json({
      error: 'Error inesperado al eliminar escenario',
    });
  }
}
