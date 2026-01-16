/**
 * QA Scenario Assignments API
 *
 * Manages assignment of QA scenarios to testers.
 * Supports bulk assignment, status tracking, and notification triggers.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, checkIsAdmin } from '@/lib/api-auth';
import notificationService from '@/lib/notificationService';

export interface QAScenarioAssignment {
  id: string;
  scenario_id: string;
  tester_id: string;
  assigned_by: string;
  assigned_at: string;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  // Joined data
  scenario?: {
    id: string;
    name: string;
    feature_area: string;
    priority: number;
    role_required: string;
  };
  tester?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  assigned_by_user?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface CreateAssignmentRequest {
  scenario_ids: string[];
  tester_id: string;
  due_date?: string;
}

interface UpdateAssignmentRequest {
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  due_date?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify authentication and admin status using standard pattern
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar asignaciones' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user.id);
    case 'POST':
      return handlePost(req, res, user.id);
    case 'PUT':
      return handlePut(req, res, user.id);
    case 'DELETE':
      return handleDelete(req, res, user.id);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }
}

/**
 * GET: List assignments with optional filters
 */
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { tester_id, status, scenario_id, include_completed } = req.query;

    let query = supabaseAdmin
      .from('qa_scenario_assignments')
      .select(`
        *,
        scenario:qa_scenarios(id, name, feature_area, priority, role_required),
        tester:profiles!qa_scenario_assignments_tester_id_fkey(id, email, first_name, last_name),
        assigned_by_user:profiles!qa_scenario_assignments_assigned_by_fkey(id, email, first_name, last_name)
      `)
      .order('assigned_at', { ascending: false });

    // Apply filters
    if (tester_id) {
      query = query.eq('tester_id', tester_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (scenario_id) {
      query = query.eq('scenario_id', scenario_id);
    }

    // By default, exclude completed unless specified
    if (include_completed !== 'true') {
      query = query.neq('status', 'completed');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching assignments:', error);
      return res.status(500).json({ error: 'Error al obtener asignaciones' });
    }

    return res.status(200).json({ assignments: data || [] });
  } catch (error) {
    console.error('Exception in GET assignments:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST: Create new assignment(s)
 */
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { scenario_ids, tester_id, due_date }: CreateAssignmentRequest = req.body;

    // Validate required fields
    if (!scenario_ids || !Array.isArray(scenario_ids) || scenario_ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un escenario' });
    }

    if (!tester_id) {
      return res.status(400).json({ error: 'Se requiere un tester' });
    }

    // Verify tester exists and can run QA tests
    const { data: tester, error: testerError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, can_run_qa_tests')
      .eq('id', tester_id)
      .single();

    if (testerError || !tester) {
      return res.status(400).json({ error: 'Tester no encontrado' });
    }

    // Check if tester is admin (admins always have QA access)
    const { data: testerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', tester_id)
      .eq('is_active', true);

    const isTesterAdmin = testerRoles?.some((r) => r.role_type === 'admin') || false;

    if (!tester.can_run_qa_tests && !isTesterAdmin) {
      return res.status(400).json({
        error: 'El usuario seleccionado no tiene permisos de QA tester',
      });
    }

    // Verify scenarios exist
    const { data: scenarios, error: scenariosError } = await supabaseAdmin
      .from('qa_scenarios')
      .select('id, name, feature_area')
      .in('id', scenario_ids);

    if (scenariosError || !scenarios || scenarios.length === 0) {
      return res.status(400).json({ error: 'Escenarios no encontrados' });
    }

    // Check for existing assignments to avoid duplicates
    const { data: existingAssignments } = await supabaseAdmin
      .from('qa_scenario_assignments')
      .select('scenario_id')
      .eq('tester_id', tester_id)
      .in('scenario_id', scenario_ids)
      .in('status', ['pending', 'in_progress']);

    const existingScenarioIds = new Set(
      existingAssignments?.map((a) => a.scenario_id) || []
    );

    // Filter out already assigned scenarios
    const newScenarioIds = scenario_ids.filter((id) => !existingScenarioIds.has(id));

    if (newScenarioIds.length === 0) {
      return res.status(400).json({
        error: 'Todos los escenarios ya están asignados a este tester',
      });
    }

    // Create assignments
    const assignments = newScenarioIds.map((scenarioId) => ({
      scenario_id: scenarioId,
      tester_id,
      assigned_by: userId,
      assigned_at: new Date().toISOString(),
      due_date: due_date || null,
      status: 'pending',
    }));

    const { data: createdAssignments, error: insertError } = await supabaseAdmin
      .from('qa_scenario_assignments')
      .insert(assignments)
      .select(`
        *,
        scenario:qa_scenarios(id, name, feature_area, priority)
      `);

    if (insertError) {
      console.error('Error creating assignments:', insertError);
      return res.status(500).json({ error: 'Error al crear asignaciones' });
    }

    // Trigger notification for the assigned tester
    const scenarioNames = scenarios
      .filter((s) => newScenarioIds.includes(s.id))
      .map((s) => s.name);

    try {
      await notificationService.triggerNotification('qa_scenario_assigned', {
        tester_id,
        tester_email: tester.email,
        tester_name: `${tester.first_name || ''} ${tester.last_name || ''}`.trim() || tester.email,
        scenario_count: newScenarioIds.length,
        scenario_names: scenarioNames,
        due_date: due_date || null,
        assigned_by_id: userId,
      });
    } catch (notifyError) {
      console.error('Error sending notification:', notifyError);
      // Don't fail the request if notification fails
    }

    return res.status(201).json({
      message: `${createdAssignments?.length || 0} asignación(es) creada(s)`,
      assignments: createdAssignments,
      skipped: existingScenarioIds.size,
    });
  } catch (error) {
    console.error('Exception in POST assignments:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * PUT: Update an assignment (status, due date)
 */
async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { id } = req.query;
    const { status, due_date }: UpdateAssignmentRequest = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Se requiere ID de asignación' });
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
    }

    if (due_date !== undefined) {
      updateData.due_date = due_date;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    const { data, error } = await supabaseAdmin
      .from('qa_scenario_assignments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating assignment:', error);
      return res.status(500).json({ error: 'Error al actualizar asignación' });
    }

    return res.status(200).json({ assignment: data });
  } catch (error) {
    console.error('Exception in PUT assignments:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * DELETE: Remove an assignment
 */
async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const supabaseAdmin = createServiceRoleClient();
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Se requiere ID de asignación' });
    }

    const { error } = await supabaseAdmin
      .from('qa_scenario_assignments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting assignment:', error);
      return res.status(500).json({ error: 'Error al eliminar asignación' });
    }

    return res.status(200).json({ message: 'Asignación eliminada' });
  } catch (error) {
    console.error('Exception in DELETE assignments:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
