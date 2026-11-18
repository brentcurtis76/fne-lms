import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { resolveCoberturaGate } from '@/lib/services/assessment-builder/coberturaGatePolicy';
import {
  assertInstanceAssignee,
  loadSnapshotForInstance,
  loadActiveIndicatorIds,
  stripExpectations,
} from '@/lib/services/assessment-builder/registroAccess';

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
    // First, verify the user is assigned to this instance (caller's own session)
    const assignee = await assertInstanceAssignee(supabaseClient, instanceId, user.id);

    if (!assignee) {
      return res.status(403).json({
        error: 'No tienes permiso para acceder a este registro'
      });
    }

    // Get the instance (R11: also fetch generation_type). The stored version is
    // read below with the service client, after the assignee gate (N1).
    const { data: instance, error: instanceError } = await supabaseClient
      .from('assessment_instances')
      .select(`
        id,
        template_snapshot_id,
        school_id,
        course_structure_id,
        transformation_year,
        generation_type,
        status,
        context_responses,
        assigned_at,
        started_at,
        completed_at,
        created_at,
        updated_at,
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
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // N1: the stored version and the expected levels are read with the
    // service client, only after the gate above. A failed read of the stored
    // version answers as the joined read did before (404).
    const serviceClient = createServiceRoleClient();
    const { snapshot, error: snapshotError } = await loadSnapshotForInstance(serviceClient, instance as any);
    if (snapshotError) {
      console.error('Error fetching instance snapshot:', snapshotError);
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    // R11: which indicators have an expected level for the instance's
    // transformation year and generation_type (isActiveThisYear per indicator).
    // As before, a failed read or no rows means every indicator is active.
    const templateId = snapshot?.template_id;
    const transformationYear = instance.transformation_year;
    const generationType = (instance as any).generation_type || 'GT';

    const { ids: activeIndicatorIds } = await loadActiveIndicatorIds(serviceClient, {
      templateId,
      transformationYear,
      generationType,
    });

    // Get existing responses for this instance
    const { data: responses, error: responsesError } = await supabaseClient
      .from('assessment_responses')
      .select('*')
      .eq('instance_id', instanceId);

    if (responsesError) {
      console.error('Error fetching assessment responses');
      return res.status(500).json({ error: 'No se pudieron recuperar las respuestas guardadas. Intenta nuevamente.' });
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

    // Extract snapshot data for easier frontend access (snapshot already defined above for template_id lookup).
    // N1: until the registro is sent (status completed) no expected level leaves the server.
    const rawSnapshotData = snapshot?.snapshot_data || {};
    const snapshotData = instance.status === 'completed' ? rawSnapshotData : stripExpectations(rawSnapshotData);

    // Helper to count indicator progress
    const countProgress = (indicator: any) => {
      const resp = responseMap[indicator.id];
      if (resp) {
        if (indicator.category === 'traspaso') {
          const sub = resp.subResponses as Record<string, unknown> | undefined;
          return !!(sub?.evidence_link || sub?.improvement_suggestions);
        }
        return (
          (resp.coverageValue !== null && resp.coverageValue !== undefined) ||
          (resp.frequencyValue !== null && resp.frequencyValue !== undefined) ||
          (resp.profundityLevel !== null && resp.profundityLevel !== undefined)
        );
      }
      return false;
    };

    // Count total indicators and answered indicators (dual-path: objectives or flat modules)
    let totalIndicators = 0;
    let answeredIndicators = 0;

    const snapshotObjectives = snapshotData.objectives || [];
    const flatModules = snapshotData.modules || [];

    // Use objectives hierarchy if present, else flat modules
    const modulesToCount = snapshotObjectives.length > 0
      ? snapshotObjectives.flatMap((o: any) => o.modules || [])
      : flatModules;

    modulesToCount.forEach((module: any) => {
      // R11: filter by year-active status BEFORE ordering/gate resolution.
      const activeIndicators = (module.indicators || []).filter((indicator: any) =>
        activeIndicatorIds !== null
          ? activeIndicatorIds.has(indicator.id)
          : true
      );

      const gate = resolveCoberturaGate({
        indicators: activeIndicators,
        getId: (ind: any) => ind.id,
        getCategory: (ind: any) => ind.category,
        getDisplayOrder: (ind: any) => ind.display_order,
        getCoverageValue: (id: string) => responseMap[id]?.coverageValue,
      });

      totalIndicators += gate.applicable.length;
      gate.applicable.forEach((indicator: any) => {
        if (countProgress(indicator)) answeredIndicators++;
      });
    });

    // Build modules array for the frontend (flat list from objectives or direct flat)
    const modules = flatModules;

    // Helper to map module data to frontend shape
    const mapModule = (module: any) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      instructions: module.instructions,
      displayOrder: module.display_order,
      weight: module.weight,
      objectiveId: module.objective_id || null,
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
        detalle_options: indicator.detalle_options || null,
        displayOrder: indicator.display_order,
        weight: indicator.weight,
        subQuestions: indicator.sub_questions || [],
        // N1: absent (stripped above) while the registro is not completed.
        expectations: indicator.expectations,
        // R11: isActiveThisYear — true if indicator has an expectation for this year.
        // When no expectations data exists (legacy instances), all indicators are active (true).
        isActiveThisYear: activeIndicatorIds !== null
          ? activeIndicatorIds.has(indicator.id)
          : true,
      })),
    });

    // Build objectives for 3-level rendering
    const objectives = snapshotObjectives.map((obj: any) => ({
      id: obj.id,
      name: obj.name,
      description: obj.description,
      displayOrder: obj.display_order,
      weight: obj.weight,
      modules: (obj.modules || []).map(mapModule),
    }));

    return res.status(200).json({
      success: true,
      instance: {
        id: instance.id,
        transformationYear: instance.transformation_year,
        generationType: (instance as any).generation_type || 'GT',
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
      // Objectives hierarchy (new 3-level format)
      objectives,
      // Flat modules for backward compatibility
      modules: modules.map(mapModule),
      responses: responseMap,
      progress: {
        total: totalIndicators,
        answered: answeredIndicators,
        percentage: totalIndicators > 0 ? Math.round((answeredIndicators / totalIndicators) * 100) : 0,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error fetching assessment:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener el registro' });
  }
}
