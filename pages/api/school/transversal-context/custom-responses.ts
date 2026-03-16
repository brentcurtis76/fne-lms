import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createApiSupabaseClient,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';
import type { SaveContextResponsesRequest, ContextGeneralResponse } from '@/types/assessment-builder';

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  // User-scoped client for CRUD operations (respects RLS)
  const supabaseClient = await createApiSupabaseClient(req, res);

  // Use service role client for permission checks (bypasses RLS)
  const serviceClient = createServiceRoleClient();

  // Get school_id from query for GET, or from body for POST
  const rawQuerySchoolId = req.query.school_id ? parseInt(req.query.school_id as string) : undefined;
  const rawBodySchoolId = req.body?.school_id ? parseInt(req.body.school_id) : undefined;
  const requestedSchoolId = req.method === 'GET' ? rawQuerySchoolId : rawBodySchoolId;

  // Validate school_id is a valid number
  if (requestedSchoolId !== undefined && isNaN(requestedSchoolId)) {
    return res.status(400).json({ error: 'school_id debe ser un número válido' });
  }

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    serviceClient,
    user.id,
    requestedSchoolId
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden acceder a las respuestas de contexto'
    });
  }

  // For non-admin users, we must have a school_id
  if (!isAdmin && !schoolId) {
    return res.status(400).json({
      error: 'No se encontró escuela asociada al usuario'
    });
  }

  // For admin, require school_id in request
  if (isAdmin && !requestedSchoolId) {
    return res.status(400).json({
      error: 'Se requiere school_id para administradores'
    });
  }

  const effectiveSchoolId = isAdmin ? requestedSchoolId : schoolId;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, effectiveSchoolId!);
    case 'POST':
      return handlePost(req, res, supabaseClient, effectiveSchoolId!, user.id);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST']);
  }
}

// ============================================================
// GET — fetch custom responses for a specific school
// ============================================================

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number
) {
  try {
    // Fetch responses joined with question info
    const { data: responses, error: dbError } = await supabaseClient
      .from('context_general_responses')
      .select('*, question:context_general_questions(*)')
      .eq('school_id', schoolId);

    if (dbError) {
      console.error('Error fetching custom responses:', dbError);
      return res.status(500).json({ error: 'Error al obtener respuestas de contexto' });
    }

    return res.status(200).json({
      success: true,
      responses: responses ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error fetching custom responses:', message);
    return res.status(500).json({ error: 'Error inesperado al obtener respuestas de contexto' });
  }
}

// ============================================================
// POST — save/update custom responses for a school
// ============================================================

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number,
  userId: string
) {
  try {
    const body = req.body as SaveContextResponsesRequest;

    // Validation
    if (!body.responses || !Array.isArray(body.responses) || body.responses.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una respuesta' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const r of body.responses) {
      if (!r.question_id || typeof r.question_id !== 'string' || !uuidRegex.test(r.question_id)) {
        return res.status(400).json({ error: 'Cada respuesta debe incluir un question_id válido (UUID)' });
      }
    }

    const serviceClient = createServiceRoleClient();

    // Fetch previous responses for change history
    const { data: previousResponses } = await serviceClient
      .from('context_general_responses')
      .select('question_id, response')
      .eq('school_id', schoolId);

    // Upsert each response
    const upsertRows = body.responses.map((r) => ({
      school_id: schoolId,
      question_id: r.question_id,
      response: r.response,
      responded_by: userId,
      updated_at: new Date().toISOString(),
    }));

    const { data: savedResponses, error: upsertError } = await supabaseClient
      .from('context_general_responses')
      .upsert(upsertRows, { onConflict: 'school_id,question_id' })
      .select('*, question:context_general_questions(*)');

    if (upsertError) {
      console.error('Error upserting custom responses:', upsertError);
      return res.status(500).json({ error: 'Error al guardar respuestas de contexto' });
    }

    // Log change history and update completion status
    try {
      const prevMap = Object.fromEntries((previousResponses || []).map((r: any) => [r.question_id, r.response]));
      const newMap = Object.fromEntries(body.responses.map(r => [r.question_id, r.response]));
      const changedFields = body.responses
        .filter(r => JSON.stringify(prevMap[r.question_id]) !== JSON.stringify(r.response))
        .map(r => r.question_id);

      if (changedFields.length > 0) {
        const { data: profile } = await serviceClient.from('profiles').select('full_name').eq('id', userId).single();
        await serviceClient.from('school_change_history').insert({
          school_id: schoolId,
          feature: 'context_responses',
          action: previousResponses?.length ? 'update' : 'initial_save',
          previous_state: prevMap,
          new_state: newMap,
          changed_fields: changedFields,
          user_id: userId,
          user_name: profile?.full_name || 'Unknown',
        });
      }

      // Check if all required generic questions are answered
      const { data: requiredQuestions } = await serviceClient
        .from('context_general_questions')
        .select('id')
        .eq('is_active', true)
        .eq('is_required', true)
        .eq('widget_type', 'generic');

      const allRequiredAnswered = (requiredQuestions || []).every(q => {
        const response = body.responses.find(r => r.question_id === q.id);
        return response && response.response !== null && response.response !== '' && response.response !== undefined;
      });

      // Also check previously saved responses for questions not in this save batch
      if (!allRequiredAnswered) {
        const { data: allSavedResponses } = await serviceClient
          .from('context_general_responses')
          .select('question_id, response')
          .eq('school_id', schoolId);

        const savedMap = Object.fromEntries((allSavedResponses || []).map((r: any) => [r.question_id, r.response]));
        const isComplete = (requiredQuestions || []).every(q => {
          const val = savedMap[q.id];
          return val !== null && val !== '' && val !== undefined;
        });

        await serviceClient.from('school_plan_completion_status').upsert({
          school_id: schoolId,
          feature: 'context_responses',
          is_completed: isComplete,
          completed_at: isComplete ? new Date().toISOString() : null,
          completed_by: isComplete ? userId : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'school_id,feature' });
      } else {
        await serviceClient.from('school_plan_completion_status').upsert({
          school_id: schoolId,
          feature: 'context_responses',
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'school_id,feature' });
      }
    } catch (historyErr) {
      console.error('Error logging change history:', historyErr);
    }

    return res.status(200).json({
      success: true,
      responses: savedResponses ?? [],
      message: 'Respuestas guardadas exitosamente',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error saving custom responses:', message);
    return res.status(500).json({ error: 'Error inesperado al guardar respuestas de contexto' });
  }
}
