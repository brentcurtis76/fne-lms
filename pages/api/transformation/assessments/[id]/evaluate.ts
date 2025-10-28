import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { RubricEvaluator } from '@/lib/transformation/evaluator';

export const config = {
  api: {
    responseTimeout: 300000, // 5 minutes (300 seconds)
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

/**
 * POST /api/transformation/assessments/[id]/evaluate
 *
 * Triggers AI evaluation of completed assessment responses.
 * Uses Claude Sonnet 4.5 to analyze responses and generate transformation insights.
 *
 * This endpoint:
 * 1. Loads assessment responses and rubric items
 * 2. Calls Claude API to evaluate responses against rubric
 * 3. Stores evaluation results in context_metadata
 * 4. Returns evaluation summary
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🔍 EVALUATE ENDPOINT CALLED');
  console.log('📋 Request method:', req.method);
  console.log('📋 Assessment ID:', req.query.id);

  if (req.method !== 'POST') {
    console.log('❌ Wrong method:', req.method);
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    console.log('❌ Invalid ID:', id);
    return res.status(400).json({ error: 'ID de evaluación requerido' });
  }

  try {
    console.log('✅ Creating Supabase client...');
    const supabase = createPagesServerClient({ req, res });

    // Check authentication
    console.log('✅ Checking authentication...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('❌ Session error:', sessionError);
      return res.status(401).json({ error: 'Authentication error' });
    }

    if (!session) {
      console.error('❌ No session found');
      return res.status(401).json({ error: 'No autorizado' });
    }

    console.log('✅ User authenticated:', session.user.id);

    // 1. Load assessment with responses
    console.log('✅ Fetching assessment from database...');
    const { data: assessment, error: assessmentError } = await supabase
      .from('transformation_assessments')
      .select('id, area, status, context_metadata, growth_community_id')
      .eq('id', id)
      .single();

    if (assessmentError) {
      console.error('❌ Error fetching assessment:', assessmentError);
      return res.status(500).json({
        error: 'Error fetching assessment',
        details: assessmentError.message
      });
    }

    if (!assessment) {
      console.error('❌ Assessment not found:', id);
      return res.status(404).json({ error: 'Evaluación no encontrada' });
    }

    console.log('✅ Assessment loaded:', {
      id: assessment.id,
      area: assessment.area,
      status: assessment.status,
      hasPreAssessment: !!assessment.context_metadata?.preAssessmentAnswers,
      hasResponses: !!assessment.context_metadata?.responses,
      responseCount: assessment.context_metadata?.responses
        ? Object.keys(assessment.context_metadata.responses).length
        : 0
    });

    // Verify assessment has sufficient responses to evaluate
    // We check responses count, not status, because status might not be updated yet
    // when user clicks "Finalizar Evaluación" (race condition)
    const responses = assessment.context_metadata?.responses || {};
    const responseCount = Object.keys(responses).length;

    console.log('✅ Response count check:', {
      status: assessment.status,
      responseCount,
      minRequired: 40,
      firstKey: Object.keys(responses)[0]
    });

    if (responseCount === 0) {
      console.error('❌ No responses found in assessment');
      return res.status(400).json({
        error: 'No responses found',
        message: 'Debe completar las preguntas antes de generar la evaluación'
      });
    }

    // Personalizacion area has 44 sections (11 objectives × 4 actions × 1 dimension)
    // Allow some flexibility (40) in case of optional sections
    if (responseCount < 40) {
      console.log('❌ Insufficient responses:', responseCount);
      return res.status(400).json({
        error: 'Debe completar al menos 40 secciones antes de generar la evaluación',
        message: `Secciones completadas: ${responseCount}/44`
      });
    }

    console.log('✅ Found sufficient responses:', responseCount);

    // Note: We intentionally do NOT check status here because:
    // 1. Status update might happen async/race condition
    // 2. Presence of responses is the real requirement
    // 3. Evaluate endpoint will mark as completed after successful evaluation

    // 2. Load rubric items for this area
    console.log('✅ Fetching rubric items for area:', assessment.area);
    const { data: rubricItems, error: rubricError } = await supabase
      .from('transformation_rubric')
      .select('*')
      .eq('area', assessment.area)
      .order('display_order', { ascending: true });

    if (rubricError) {
      console.error('❌ Error fetching rubric items:', rubricError);
      return res.status(500).json({
        error: 'Error fetching rubric items',
        details: rubricError.message
      });
    }

    if (!rubricItems || rubricItems.length === 0) {
      console.error('❌ No rubric items found for area:', assessment.area);
      return res.status(500).json({
        error: 'No rubric items found',
        message: 'Sistema de rúbrica no configurado'
      });
    }

    console.log('✅ Loaded rubric items:', rubricItems.length);

    // 4. Get Anthropic API key from environment
    console.log('✅ Checking Anthropic API key...');
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return res.status(500).json({
        error: 'API key not configured',
        message: 'La clave de API de Anthropic no está configurada'
      });
    }

    console.log('✅ API key configured:', apiKey.substring(0, 15) + '...');

    // 5. Create evaluator and run evaluation
    console.log('✅ Initializing RubricEvaluator...');
    let evaluator;
    try {
      evaluator = new RubricEvaluator(apiKey);
      console.log('✅ RubricEvaluator initialized successfully');
    } catch (evalError: any) {
      console.error('❌ Error initializing evaluator:', evalError);
      console.error('Stack trace:', evalError.stack);
      return res.status(500).json({
        error: 'Error initializing evaluator',
        details: evalError.message
      });
    }

    console.log('✅ Calling evaluator.evaluateAssessment()...');
    let evaluation;
    try {
      evaluation = await evaluator.evaluateAssessment(responses, rubricItems);
      console.log('✅ Evaluation generated successfully');
      console.log('📊 Evaluation summary:', {
        hasOverallStage: !!evaluation.overall_stage,
        overallStage: evaluation.overall_stage,
        dimensionCount: evaluation.dimension_evaluations?.length || 0,
        strengthsCount: evaluation.strengths?.length || 0,
        growthAreasCount: evaluation.growth_areas?.length || 0,
        recommendationsCount: evaluation.recommendations?.length || 0
      });
    } catch (evalError: any) {
      console.error('❌ Error generating evaluation:', evalError);
      console.error('Error message:', evalError.message);
      console.error('Stack trace:', evalError.stack);
      return res.status(500).json({
        error: 'Error generating evaluation',
        details: evalError.message,
        stack: process.env.NODE_ENV === 'development' ? evalError.stack : undefined
      });
    }

    // 6. Update assessment with evaluation results
    console.log('✅ Saving evaluation to database...');
    const updatedMetadata = {
      ...assessment.context_metadata,
      evaluation: evaluation,
      evaluated_at: new Date().toISOString(),
    };

    const { data: updatedAssessment, error: updateError } = await supabase
      .from('transformation_assessments')
      .update({
        context_metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Error saving evaluation:', updateError);
      return res.status(500).json({
        error: 'Error saving evaluation',
        details: updateError.message
      });
    }

    console.log('✅ Evaluation saved successfully');
    console.log('🎉 EVALUATE ENDPOINT COMPLETE');

    // 7. Return evaluation results
    return res.status(200).json({
      success: true,
      evaluation: {
        overall_stage: evaluation.overall_stage,
        overall_stage_label: evaluation.overall_stage_label,
        summary: evaluation.summary,
        strengths_count: evaluation.strengths.length,
        growth_areas_count: evaluation.growth_areas.length,
        dimensions_evaluated: evaluation.dimension_evaluations.length,
      },
    });

  } catch (error: any) {
    console.error('❌ UNHANDLED ERROR IN EVALUATE ENDPOINT:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

    return res.status(500).json({
      error: 'Error al procesar la evaluación',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
