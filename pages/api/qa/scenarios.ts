/**
 * QA Scenarios API
 *
 * GET - List scenarios (authenticated users)
 * POST - Create scenario (admin only)
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  checkIsAdmin,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import type {
  QAScenario,
  CreateScenarioRequest,
  FeatureArea,
} from '@/types/qa';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    return handleGetScenarios(req, res);
  }

  if (req.method === 'POST') {
    return handleCreateScenario(req, res);
  }

  return handleMethodNotAllowed(res, ['GET', 'POST']);
}

/**
 * GET /api/qa/scenarios
 * Query params:
 * - feature_area: Filter by feature area
 * - role: Filter by role required
 * - is_active: Filter by active status (default: true)
 * - priority: Filter by priority level
 * - automated_only: Filter by automation type ('true', 'false', or 'all')
 * - include_automated: If 'false', excludes automated_only scenarios (for tester UI)
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 25, max: 100)
 * - search: Text search across name and description
 */
async function handleGetScenarios(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const {
      feature_area,
      role,
      is_active = 'true',
      priority,
      automated_only,
      include_automated = 'true',
      completion_status: rawCompletionStatus,
    } = req.query;

    // Validate and sanitize completion_status
    const completion_status = ['all', 'completed', 'pending'].includes(String(rawCompletionStatus || 'all'))
      ? String(rawCompletionStatus || 'all')
      : 'all';

    // Pagination params — only apply when explicitly requested
    const hasPagination = req.query.page !== undefined || req.query.pageSize !== undefined;
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt((req.query.pageSize as string) || '25', 10), 1), 100);
    const search = (req.query.search as string)?.trim() || '';
    const offset = (page - 1) * pageSize;

    // Step 1: Query qa_test_runs for completed scenario IDs (if filtering by completion status)
    let completedIds: string[] = [];
    if (completion_status !== 'all') {
      let runsQuery = supabaseClient
        .from('qa_test_runs')
        .select('scenario_id')
        .eq('status', 'completed');

      // Non-admin users only see their own completion status
      if (!isAdmin) {
        runsQuery = runsQuery.eq('tester_id', user.id);
      }

      const { data: runsData, error: runsError } = await runsQuery;

      if (runsError) {
        console.error('Error fetching test runs:', runsError);
        return res.status(500).json({
          error: 'Error al obtener datos de ejecución',
          details: runsError.message,
        });
      }

      // Extract unique scenario IDs
      completedIds = [...new Set((runsData || []).map((r) => r.scenario_id))];
    }

    // Step 2: Build main query with completion status filter
    let query = supabaseClient
      .from('qa_scenarios')
      .select('*', { count: 'exact' })
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    // Apply completion status filter
    if (completion_status === 'completed') {
      if (completedIds.length === 0) {
        // No completed scenarios — return empty result
        return res.status(200).json({
          success: true,
          scenarios: [],
          total: 0,
          page,
          pageSize,
          automatedCount: 0,
        });
      }
      query = query.in('id', completedIds);
    } else if (completion_status === 'pending') {
      if (completedIds.length > 0) {
        // Exclude completed scenarios
        query = query.not('id', 'in', `(${completedIds.join(',')})`);
      }
      // If completedIds.length === 0, all scenarios are pending — no filter needed
    }

    // Apply filters
    if (feature_area) {
      query = query.eq('feature_area', feature_area as string);
    }

    if (role) {
      query = query.eq('role_required', role as string);
    }

    if (is_active !== 'all') {
      query = query.eq('is_active', is_active === 'true');
    }

    if (priority) {
      query = query.eq('priority', parseInt(priority as string, 10));
    }

    // Filter by automated_only status
    if (automated_only === 'true') {
      query = query.eq('automated_only', true);
    } else if (automated_only === 'false') {
      query = query.eq('automated_only', false);
    }
    // If automated_only is 'all' or not specified, no filter applied

    // For tester UI: exclude automated_only scenarios
    if (include_automated === 'false') {
      query = query.or('automated_only.is.null,automated_only.eq.false');
    }

    // Text search (server-side)
    if (search) {
      const sanitized = search.replace(/%/g, '').toLowerCase();
      query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
    }

    // Apply pagination only when explicitly requested
    if (hasPagination) {
      query = query.range(offset, offset + pageSize - 1);
    }

    const { data: scenarios, count, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching scenarios:', fetchError);
      return res.status(500).json({
        error: 'Error al obtener escenarios',
        details: fetchError.message,
      });
    }

    // Count automated scenarios (only if we're filtering them out)
    let automatedCount = 0;
    if (include_automated === 'false') {
      const { count } = await supabaseClient
        .from('qa_scenarios')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('automated_only', true);
      automatedCount = count || 0;
    }

    return res.status(200).json({
      success: true,
      scenarios: scenarios || [],
      total: count ?? 0,
      page,
      pageSize,
      automatedCount, // Number of scenarios that require Playwright
    });
  } catch (err) {
    console.error('Unexpected error fetching scenarios:', err);
    return res.status(500).json({
      error: 'Error inesperado al obtener escenarios',
    });
  }
}

/**
 * POST /api/qa/scenarios
 * Creates a new QA scenario (admin only)
 */
async function handleCreateScenario(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Solo administradores pueden crear escenarios',
    });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const body: CreateScenarioRequest = req.body;

    // Validate required fields
    if (!body.name || !body.feature_area || !body.role_required || !body.steps) {
      return res.status(400).json({
        error: 'Faltan campos requeridos: name, feature_area, role_required, steps',
      });
    }

    // Validate steps array
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return res.status(400).json({
        error: 'El escenario debe tener al menos un paso',
      });
    }

    // Validate each step
    for (let i = 0; i < body.steps.length; i++) {
      const step = body.steps[i];
      if (!step.instruction || !step.expectedOutcome) {
        return res.status(400).json({
          error: `El paso ${i + 1} debe tener instruction y expectedOutcome`,
        });
      }
    }

    // Create the scenario
    const scenarioData = {
      name: body.name,
      description: body.description || null,
      feature_area: body.feature_area,
      role_required: body.role_required,
      preconditions: body.preconditions || [],
      steps: body.steps.map((step, index) => ({
        ...step,
        index: index + 1,
        captureOnFail: step.captureOnFail ?? true,
        captureOnPass: step.captureOnPass ?? false,
      })),
      priority: body.priority || 2,
      estimated_duration_minutes: body.estimated_duration_minutes || 5,
      created_by: user.id,
      is_active: true,
    };

    const { data: scenario, error: insertError } = await supabaseClient
      .from('qa_scenarios')
      .insert(scenarioData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating scenario:', insertError);
      return res.status(500).json({
        error: 'Error al crear escenario',
        details: insertError.message,
      });
    }

    return res.status(201).json({
      success: true,
      scenario,
    });
  } catch (err) {
    console.error('Unexpected error creating scenario:', err);
    return res.status(500).json({
      error: 'Error inesperado al crear escenario',
    });
  }
}
