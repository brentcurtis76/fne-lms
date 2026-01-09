import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { RubricEvaluator } from '@/lib/transformation/evaluator';
import { isAdmin } from '@/utils/getUserRoles';

export const config = {
  api: {
    responseTimeout: 120000, // 2 minutes - dynamically loads objectives from rubric
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

interface ErrorResponse {
  error: string;
  details?: string;
  missingObjectives?: number[];
  incompleteObjectives?: number[];
}

interface SuccessResponse {
  message: string;
  assessmentId: string;
  completedAt: string;
  evaluation?: any;
  success?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });

  // Initialize service role client for permission checks (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check authentication
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const { id } = req.query;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof id !== 'string' || !uuidRegex.test(id)) {
    return res.status(400).json({ error: 'ID de evaluación inválido' });
  }

  try {
    // First, verify the assessment exists and belongs to user's community/school
    const { data: assessmentCheck, error: fetchError } = await supabase
      .from('transformation_assessments')
      .select('id, growth_community_id, school_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !assessmentCheck) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    // Check if already completed
    if (assessmentCheck.status === 'completed') {
      return res.status(400).json({ error: 'Esta evaluación ya está finalizada' });
    }

    // Verify user has access to this community
    // Allow admins (global) OR users with an active role in this community
    let userIsAdmin = isAdmin(session);

    // If not admin from metadata, check user_roles table for admin role
    // Use service role client to bypass RLS restrictions on user_roles
    if (!userIsAdmin) {
      const { data: adminRoles } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('role_type', 'admin')
        .eq('is_active', true)
        .limit(1);

      if (adminRoles && adminRoles.length > 0) {
        userIsAdmin = true;
      }
    }

    if (!userIsAdmin) {
      // For non-admins, check if they have a role matching either:
      // 1. The assessment's growth_community_id (legacy community-based assessments)
      // 2. The assessment's school_id (new school-based assessments)
      let hasAccess = false;

      // First try community_id match (if assessment has growth_community_id)
      // Use service role client to bypass RLS restrictions on user_roles
      if (assessmentCheck.growth_community_id) {
        const { data: communityRole } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('community_id', assessmentCheck.growth_community_id)
          .eq('is_active', true)
          .maybeSingle();

        if (communityRole) {
          hasAccess = true;
        }
      }

      // Then try school_id match (if assessment has school_id)
      // Use service role client to bypass RLS restrictions on user_roles
      if (!hasAccess && assessmentCheck.school_id) {
        const { data: schoolRole } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('school_id', assessmentCheck.school_id)
          .eq('is_active', true)
          .maybeSingle();

        if (schoolRole) {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ error: 'No tienes permiso para finalizar esta evaluación' });
      }
    }

    // Load full assessment data
    const { data: assessment, error: fetchFullError } = await supabase
      .from('transformation_assessments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchFullError || !assessment) {
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    console.log('[finalize] Assessment loaded:', assessment.id);
    console.log('[finalize] Status:', assessment.status);

    // Get objective evaluations from context_metadata
    const objectiveEvaluations = assessment.context_metadata?.objective_evaluations || {};
    const objectiveCount = Object.keys(objectiveEvaluations).length;
    console.log('[finalize] Objective evaluations found:', objectiveCount);

    if (objectiveCount === 0) {
      console.error('[finalize] No objective evaluations found');
      return res.status(400).json({
        error: 'No hay evaluaciones de objetivos. Debes evaluar los objetivos primero.',
      });
    }

    // Load rubric items to determine expected objectives and dimension counts
    console.log('[finalize] Loading rubric to determine expected objectives...');
    const { data: rubricItems, error: rubricError } = await supabase
      .from('transformation_rubric')
      .select('objective_number, action_number, dimension')
      .eq('area', assessment.area)
      .order('objective_number', { ascending: true });

    if (rubricError || !rubricItems) {
      console.error('[finalize] Error loading rubric:', rubricError);
      return res.status(500).json({ error: 'Error al cargar rúbrica para validación' });
    }

    // Count expected dimensions per objective based on actual rubric
    const expectedDimensionsPerObjective: Record<number, number> = {};
    rubricItems.forEach(item => {
      if (!expectedDimensionsPerObjective[item.objective_number]) {
        expectedDimensionsPerObjective[item.objective_number] = 0;
      }
      expectedDimensionsPerObjective[item.objective_number]++;
    });

    // Dynamically get expected objectives from rubric (not hardcoded!)
    const expectedObjectives = Object.keys(expectedDimensionsPerObjective)
      .map(Number)
      .sort((a, b) => a - b);

    console.log('[finalize] Expected objectives for area', assessment.area + ':', expectedObjectives);
    console.log('[finalize] Expected dimensions per objective:', expectedDimensionsPerObjective);

    // Verify all objectives have been evaluated
    const missingObjectives = expectedObjectives.filter(
      objNum => !objectiveEvaluations[objNum]
    );

    if (missingObjectives.length > 0) {
      console.error('[finalize] Missing objective evaluations:', missingObjectives);
      return res.status(400).json({
        error: `Faltan evaluaciones para los objetivos: ${missingObjectives.join(', ')}`,
        missingObjectives,
      });
    }

    console.log(`[finalize] All ${expectedObjectives.length} objectives have been evaluated`);

    // CRITICAL: Validate each objective has the correct number of dimensions
    const incompleteObjectives: Array<{ objNum: number; actual: number; expected: number }> = [];

    for (const objNum of expectedObjectives) {
      const objEval = objectiveEvaluations[objNum];
      const dimensionCount = objEval?.dimension_evaluations?.length || 0;
      const expectedCount = expectedDimensionsPerObjective[objNum] || 0;

      if (dimensionCount !== expectedCount) {
        console.error(`[finalize] Objective ${objNum} has ${dimensionCount} dimensions, expected ${expectedCount}`);
        incompleteObjectives.push({ objNum, actual: dimensionCount, expected: expectedCount });
      }
    }

    if (incompleteObjectives.length > 0) {
      console.error('[finalize] Incomplete objective evaluations:', incompleteObjectives);
      const errorDetails = incompleteObjectives.map(
        ({ objNum, actual, expected }) => `Objetivo ${objNum}: ${actual}/${expected} dimensiones`
      ).join(', ');

      return res.status(422).json({
        error: `Evaluaciones incompletas detectadas: ${errorDetails}`,
        details: 'Cada objetivo debe tener todas sus dimensiones evaluadas (cobertura, frecuencia, profundidad por cada acción).',
        incompleteObjectives: incompleteObjectives.map(o => o.objNum),
      });
    }

    console.log('[finalize] All objectives have complete dimension evaluations');

    // Initialize evaluator
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[finalize] ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'API key no configurada' });
    }

    const evaluator = new RubricEvaluator(apiKey, assessment.area as 'personalizacion' | 'aprendizaje' | 'evaluacion');

    // Generate overall summary
    console.log('[finalize] Generating overall summary...');
    const overallSummary = await evaluator.generateOverallSummary(objectiveEvaluations);

    console.log('[finalize] Overall summary generated');
    console.log('[finalize] Overall stage:', overallSummary.overall_stage, '-', overallSummary.overall_stage_label);

    // Collect all dimension evaluations
    const allDimensionEvaluations: any[] = [];
    for (const objNum of expectedObjectives) {
      const objEval = objectiveEvaluations[objNum];
      if (objEval?.dimension_evaluations) {
        allDimensionEvaluations.push(...objEval.dimension_evaluations);
      }
    }

    console.log('[finalize] Total dimension evaluations:', allDimensionEvaluations.length);

    // Build complete evaluation object
    const completeEvaluation = {
      ...overallSummary,
      dimension_evaluations: allDimensionEvaluations,
      evaluated_at: new Date().toISOString(),
    };

    // Save to database and mark as completed
    const now = new Date().toISOString();
    console.log('[finalize] Saving complete evaluation to database...');
    const { error: updateError } = await supabase
      .from('transformation_assessments')
      .update({
        context_metadata: {
          ...assessment.context_metadata,
          evaluation: completeEvaluation,
        },
        status: 'completed',
        completed_at: now,
        updated_at: now,
      })
      .eq('id', id);

    if (updateError) {
      console.error('[finalize] Error saving complete evaluation:', updateError);
      return res.status(500).json({ error: 'Error al guardar evaluación completa' });
    }

    console.log('[finalize] Assessment finalized successfully');

    return res.status(200).json({
      success: true,
      message: 'Evaluación finalizada exitosamente',
      assessmentId: id,
      completedAt: now,
      evaluation: completeEvaluation,
    });
  } catch (error) {
    console.error('Unexpected error in finalize endpoint:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
