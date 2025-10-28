import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { RubricEvaluator } from '@/lib/transformation/evaluator';
import { isAdmin } from '@/utils/getUserRoles';

export const config = {
  api: {
    responseTimeout: 120000, // 2 minutes (sufficient for single objective)
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

/**
 * POST /api/transformation/assessments/[id]/evaluate-objective
 *
 * Evaluates a single objective's responses progressively.
 * This avoids timeout issues by evaluating one objective at a time.
 *
 * Request body: { objectiveNumber: number }
 *
 * This endpoint:
 * 1. Loads assessment responses for the specified objective
 * 2. Calls Claude API to evaluate only that objective
 * 3. Stores results in context_metadata.objective_evaluations[objectiveNumber]
 * 4. Returns the evaluation results
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🎯 EVALUATE-OBJECTIVE ENDPOINT CALLED');
  console.log('📋 Request method:', req.method);
  console.log('📋 Assessment ID:', req.query.id);

  if (req.method !== 'POST') {
    console.log('❌ Wrong method:', req.method);
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { id } = req.query;
  const { objectiveNumber } = req.body;

  if (!id || typeof id !== 'string') {
    console.log('❌ Invalid assessment ID');
    return res.status(400).json({ error: 'ID de evaluación no válido' });
  }

  if (!objectiveNumber || typeof objectiveNumber !== 'number') {
    console.log('❌ Invalid objective number');
    return res.status(400).json({ error: 'Número de objetivo no válido' });
  }

  console.log('📊 Evaluating Objective:', objectiveNumber);

  try {
    // Initialize Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check authentication
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.log('❌ No session');
      return res.status(401).json({ error: 'No autorizado' });
    }

    console.log('✅ User authenticated:', session.user.email);

    // Load assessment
    console.log('📥 Loading assessment...');
    const { data: assessment, error: assessmentError } = await supabase
      .from('transformation_assessments')
      .select('*')
      .eq('id', id)
      .single();

    if (assessmentError || !assessment) {
      console.error('❌ Error loading assessment:', assessmentError);
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    console.log('✅ Assessment loaded:', assessment.id);
    console.log('📊 Status:', assessment.status);
    console.log('📊 Area:', assessment.area);

    // CRITICAL: Verify user has access to this community (prevent unauthorized evaluation)
    // Allow admins (global) OR users with an active role in this community
    console.log('🔐 Verifying user access to community...');

    const userIsAdmin = isAdmin(session);
    console.log('🔍 Is admin?', userIsAdmin);

    if (userIsAdmin) {
      console.log('✅ User is admin - access granted to all communities');
    } else {
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('community_id', assessment.growth_community_id)
        .eq('is_active', true)
        .maybeSingle();

      if (roleError || !userRole) {
        console.error('❌ User does not have access to this community');
        return res.status(403).json({ error: 'No tienes permiso para evaluar esta evaluación' });
      }

      console.log('✅ User has role in this community');
    }

    // GUARD: Prevent evaluation of already-completed assessments
    if (assessment.status === 'completed') {
      console.warn('⚠️ Attempted to evaluate already-completed assessment');
      return res.status(409).json({
        error: 'Esta evaluación ya ha sido finalizada',
        details: 'No se pueden agregar evaluaciones después de finalizar.',
      });
    }

    // Load all rubric items (we'll filter in evaluateObjective)
    console.log('📥 Loading rubric items...');
    const { data: rubricItems, error: rubricError } = await supabase
      .from('transformation_rubric')
      .select('*')
      .eq('area', assessment.area)
      .order('display_order', { ascending: true });

    if (rubricError || !rubricItems) {
      console.error('❌ Error loading rubric:', rubricError);
      return res.status(500).json({ error: 'Error al cargar rúbrica' });
    }

    console.log('✅ Rubric items loaded:', rubricItems.length);

    // Extract responses from context_metadata
    const responses = assessment.context_metadata?.responses || {};
    console.log('📊 Total responses in assessment:', Object.keys(responses).length);

    // Initialize evaluator
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'API key no configurada' });
    }

    const evaluator = new RubricEvaluator(apiKey);

    // Evaluate this objective
    console.log(`🤖 Evaluating Objective ${objectiveNumber}...`);
    const objectiveEvaluation = await evaluator.evaluateObjective(
      objectiveNumber,
      responses,
      rubricItems
    );

    console.log('✅ Objective evaluation complete');
    console.log('📊 Dimension evaluations:', objectiveEvaluation.dimension_evaluations.length);

    // Validate dimension count matches the number of rubric items for this objective
    // CRITICAL: Filter rubric items locally - objectiveItems doesn't exist in this scope
    const expectedDimensionCount = rubricItems.filter(
      item => item.objective_number === objectiveNumber
    ).length;

    if (objectiveEvaluation.dimension_evaluations.length !== expectedDimensionCount) {
      console.warn(
        `⚠️ WARNING: Expected ${expectedDimensionCount} dimensions for Objective ${objectiveNumber}, got ${objectiveEvaluation.dimension_evaluations.length}`
      );
      console.warn('This may indicate an incomplete AI evaluation response.');
    }

    // ATOMIC UPDATE: Use PostgreSQL jsonb_set to prevent race conditions
    // Try to use RPC function first (if migration 021 was applied)
    console.log('💾 Attempting atomic update via RPC function...');
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_objective_evaluation', {
      p_assessment_id: id,
      p_objective_number: objectiveNumber,
      p_evaluation: objectiveEvaluation as any,
    });

    if (rpcError) {
      // RPC function might not exist yet - fall back to optimistic locking
      console.log('⚠️ RPC function not available, using fallback with retry logic');
      console.log('RPC Error:', rpcError.message);

      // Retry logic to handle race conditions
      let retryCount = 0;
      const maxRetries = 3;
      let updateSuccess = false;

      while (retryCount < maxRetries && !updateSuccess) {
        try {
          // Re-fetch the latest assessment data
          const { data: latestAssessment, error: refetchError } = await supabase
            .from('transformation_assessments')
            .select('context_metadata, updated_at')
            .eq('id', id)
            .single();

          if (refetchError || !latestAssessment) {
            throw new Error('Failed to fetch latest assessment data');
          }

          // Build updated objective evaluations
          const existingObjectiveEvaluations = latestAssessment.context_metadata?.objective_evaluations || {};
          const updatedObjectiveEvaluations = {
            ...existingObjectiveEvaluations,
            [objectiveNumber]: objectiveEvaluation,
          };

          // Update with optimistic locking (check updated_at hasn't changed)
          // CRITICAL: Use .select() to detect zero-row updates (Supabase returns null data, not error)
          const { data: updateResult, error: updateError } = await supabase
            .from('transformation_assessments')
            .update({
              context_metadata: {
                ...latestAssessment.context_metadata,
                objective_evaluations: updatedObjectiveEvaluations,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('updated_at', latestAssessment.updated_at) // Optimistic lock
            .select('id'); // Request data back to confirm row was updated

          if (updateError) {
            throw updateError;
          }

          // CRITICAL: Check if any rows were updated
          if (!updateResult || updateResult.length === 0) {
            // Concurrent update detected - another request modified updated_at
            retryCount++;
            console.log(`⚠️ Concurrent update detected (zero rows updated), retry ${retryCount}/${maxRetries}`);

            // Exponential backoff with jitter to avoid thundering herd
            const baseDelay = 100 * Math.pow(2, retryCount - 1); // 100ms, 200ms, 400ms
            const jitter = Math.random() * 50; // 0-50ms random jitter
            const delay = baseDelay + jitter;

            console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          updateSuccess = true;
          console.log('✅ Objective evaluation saved successfully (fallback method)');
        } catch (err: any) {
          console.error('❌ Error in fallback update:', err);
          if (retryCount >= maxRetries - 1) {
            return res.status(500).json({ error: 'Error al guardar evaluación del objetivo' });
          }
          retryCount++;
        }
      }

      if (!updateSuccess) {
        return res.status(500).json({ error: 'Error al guardar evaluación del objetivo después de reintentos' });
      }
    } else {
      console.log('✅ Objective evaluation saved successfully (atomic RPC)');
    }

    // Record evaluation metadata for audit trail
    try {
      await supabase.rpc('record_objective_evaluation_metadata', {
        p_assessment_id: id,
        p_objective_number: objectiveNumber,
        p_user_id: session.user.id,
      });
    } catch (metadataError) {
      // Non-critical - log but don't fail
      console.warn('⚠️ Failed to record evaluation metadata:', metadataError);
    }

    // Return the evaluation result
    return res.status(200).json({
      success: true,
      objectiveNumber,
      evaluation: objectiveEvaluation,
      message: `Objetivo ${objectiveNumber} evaluado exitosamente`,
    });
  } catch (error: any) {
    console.error('❌ ERROR in evaluate-objective endpoint:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error type:', error.constructor?.name || 'Unknown');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return res.status(500).json({
      error: 'Error al evaluar objetivo',
      details: error.message,
    });
  }
}
