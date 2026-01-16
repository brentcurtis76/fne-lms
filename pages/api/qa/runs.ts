/**
 * QA Test Runs API
 *
 * GET - List test runs (own runs or admin sees all)
 * POST - Start a new test run
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  checkIsAdmin,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type { StartTestRunRequest, BrowserInfo } from '@/types/qa';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    return handleGetRuns(req, res);
  }

  if (req.method === 'POST') {
    return handleStartRun(req, res);
  }

  return handleMethodNotAllowed(res, ['GET', 'POST']);
}

/**
 * GET /api/qa/runs
 * Query params:
 * - scenario_id: Filter by scenario
 * - status: Filter by status (in_progress, completed, aborted)
 * - result: Filter by overall_result (pass, fail, partial)
 * - limit: Number of results (default 50)
 */
async function handleGetRuns(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const { scenario_id, status, result, limit = '50' } = req.query;

    let query = supabaseClient
      .from('qa_test_runs')
      .select(
        `
        *,
        scenario:qa_scenarios(id, name, feature_area, priority),
        tester:profiles(email, first_name, last_name)
      `
      )
      .order('started_at', { ascending: false })
      .limit(parseInt(limit as string, 10));

    // Non-admins can only see their own runs
    if (!isAdmin) {
      query = query.eq('tester_id', user.id);
    }

    if (scenario_id) {
      query = query.eq('scenario_id', scenario_id as string);
    }

    if (status) {
      query = query.eq('status', status as string);
    }

    if (result) {
      query = query.eq('overall_result', result as string);
    }

    const { data: runs, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching test runs:', fetchError);
      return res.status(500).json({
        error: 'Error al obtener ejecuciones',
        details: fetchError.message,
      });
    }

    return res.status(200).json({
      success: true,
      runs: runs || [],
      total: runs?.length || 0,
    });
  } catch (err) {
    console.error('Unexpected error fetching runs:', err);
    return res.status(500).json({
      error: 'Error inesperado al obtener ejecuciones',
    });
  }
}

/**
 * POST /api/qa/runs
 * Starts a new test run
 */
async function handleStartRun(req: NextApiRequest, res: NextApiResponse) {
  const { user, error } = await getApiUser(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const body: StartTestRunRequest = req.body;

    if (!body.scenario_id) {
      return res.status(400).json({
        error: 'scenario_id es requerido',
      });
    }

    // Verify scenario exists and is active
    const { data: scenario, error: scenarioError } = await supabaseClient
      .from('qa_scenarios')
      .select('id, name, role_required, is_active')
      .eq('id', body.scenario_id)
      .single();

    if (scenarioError || !scenario) {
      return res.status(404).json({
        error: 'Escenario no encontrado',
      });
    }

    if (!scenario.is_active) {
      return res.status(400).json({
        error: 'Este escenario no está activo',
      });
    }

    // Get user's current role
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return res.status(500).json({
        error: 'Error al verificar rol del usuario',
      });
    }

    const currentRole =
      userRoles?.find((r) => r.role_type === scenario.role_required)
        ?.role_type ||
      userRoles?.[0]?.role_type ||
      'unknown';

    // Create the test run
    const runData = {
      scenario_id: body.scenario_id,
      tester_id: user.id,
      role_used: currentRole,
      status: 'in_progress',
      environment: body.environment || 'local',
      browser_info: body.browser_info || null,
    };

    const { data: testRun, error: insertError } = await supabaseClient
      .from('qa_test_runs')
      .insert(runData)
      .select(
        `
        *,
        scenario:qa_scenarios(*)
      `
      )
      .single();

    if (insertError) {
      console.error('Error creating test run:', insertError);
      return res.status(500).json({
        error: 'Error al iniciar ejecución',
        details: insertError.message,
      });
    }

    return res.status(201).json({
      success: true,
      testRun,
    });
  } catch (err) {
    console.error('Unexpected error starting run:', err);
    return res.status(500).json({
      error: 'Error inesperado al iniciar ejecución',
    });
  }
}
