import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

/**
 * GET /api/docente/assessments/[instanceId]
 *
 * Returns a single assessment instance with full template snapshot data
 * and existing responses for the form to display.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') {
    return res.status(400).json({ error: 'instanceId es requerido' });
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // First, verify the user is assigned to this instance
    const { data: assignee, error: assigneeError } = await supabaseClient
      .from('assessment_instance_assignees')
      .select('*')
      .eq('instance_id', instanceId)
      .eq('user_id', user.id)
      .single();

    if (assigneeError || !assignee) {
      return res.status(403).json({
        error: 'No tienes permiso para acceder a esta evaluación'
      });
    }

    // Get the instance with full snapshot data
    const { data: instance, error: instanceError } = await supabaseClient
      .from('assessment_instances')
      .select(`
        id,
        template_snapshot_id,
        school_id,
        course_structure_id,
        transformation_year,
        status,
        context_responses,
        assigned_at,
        started_at,
        completed_at,
        created_at,
        updated_at,
        assessment_template_snapshots:template_snapshot_id (
          id,
          template_id,
          version,
          snapshot_data,
          created_at
        ),
        school_course_structure:course_structure_id (
          id,
          grade_level,
          course_name
        )
      `)
      .eq('id', instanceId)
      .single();

    if (instanceError || !instance) {
      console.error('Error fetching instance:', instanceError);
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Get existing responses for this instance
    const { data: responses, error: responsesError } = await supabaseClient
      .from('assessment_responses')
      .select('*')
      .eq('instance_id', instanceId);

    if (responsesError) {
      console.error('Error fetching responses:', responsesError);
    }

    // Build response map keyed by indicator_id
    const responseMap: Record<string, any> = {};
    (responses || []).forEach((resp: any) => {
      responseMap[resp.indicator_id] = {
        id: resp.id,
        coverageValue: resp.coverage_value,
        frequencyValue: resp.frequency_value,
        frequencyUnit: resp.frequency_unit,
        profundityLevel: resp.profundity_level,
        rationale: resp.rationale,
        evidenceNotes: resp.evidence_notes,
        subResponses: resp.sub_responses,
        respondedAt: resp.responded_at,
        updatedAt: resp.updated_at,
      };
    });

    // Extract snapshot data for easier frontend access
    const snapshot = instance.assessment_template_snapshots as any;
    const snapshotData = snapshot?.snapshot_data || {};

    // Count total indicators and answered indicators
    let totalIndicators = 0;
    let answeredIndicators = 0;

    const modules = snapshotData.modules || [];
    modules.forEach((module: any) => {
      const indicators = module.indicators || [];
      indicators.forEach((indicator: any) => {
        totalIndicators++;
        if (responseMap[indicator.id]) {
          const resp = responseMap[indicator.id];
          // Check if the indicator has a meaningful response
          const hasResponse =
            resp.coverageValue !== null && resp.coverageValue !== undefined ||
            resp.frequencyValue !== null && resp.frequencyValue !== undefined ||
            resp.profundityLevel !== null && resp.profundityLevel !== undefined;
          if (hasResponse) {
            answeredIndicators++;
          }
        }
      });
    });

    return res.status(200).json({
      success: true,
      instance: {
        id: instance.id,
        transformationYear: instance.transformation_year,
        status: instance.status,
        contextResponses: instance.context_responses,
        startedAt: instance.started_at,
        completedAt: instance.completed_at,
        createdAt: instance.created_at,
        courseInfo: instance.school_course_structure ? {
          gradeLevel: (instance.school_course_structure as any).grade_level,
          courseName: (instance.school_course_structure as any).course_name,
        } : null,
      },
      assignee: {
        canEdit: assignee.can_edit,
        canSubmit: assignee.can_submit,
        hasStarted: assignee.has_started,
        hasSubmitted: assignee.has_submitted,
      },
      template: {
        id: snapshot?.template_id,
        version: snapshot?.version,
        name: snapshotData.template?.name || 'Sin título',
        area: snapshotData.template?.area || 'personalizacion',
        description: snapshotData.template?.description,
        scoringConfig: snapshotData.template?.scoring_config,
      },
      modules: modules.map((module: any) => ({
        id: module.id,
        name: module.name,
        description: module.description,
        instructions: module.instructions,
        displayOrder: module.display_order,
        weight: module.weight,
        indicators: (module.indicators || []).map((indicator: any) => ({
          id: indicator.id,
          code: indicator.code,
          name: indicator.name,
          description: indicator.description,
          category: indicator.category,
          frequencyConfig: indicator.frequency_config,
          frequencyUnitOptions: indicator.frequency_unit_options,
          level0Descriptor: indicator.level_0_descriptor,
          level1Descriptor: indicator.level_1_descriptor,
          level2Descriptor: indicator.level_2_descriptor,
          level3Descriptor: indicator.level_3_descriptor,
          level4Descriptor: indicator.level_4_descriptor,
          displayOrder: indicator.display_order,
          weight: indicator.weight,
          subQuestions: indicator.sub_questions || [],
          expectations: indicator.expectations,
        })),
      })),
      responses: responseMap,
      progress: {
        total: totalIndicators,
        answered: answeredIndicators,
        percentage: totalIndicators > 0 ? Math.round((answeredIndicators / totalIndicators) * 100) : 0,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error fetching assessment:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener la evaluación' });
  }
}
