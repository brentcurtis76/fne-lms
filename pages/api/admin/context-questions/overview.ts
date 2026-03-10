import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
  logApiRequest,
} from '@/lib/api-auth';

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-context-questions-overview');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden acceder a la vista general de contexto', 403);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Query 1: Fetch all schools
    const { data: schools, error: schoolsError } = await serviceClient
      .from('schools')
      .select('id, name')
      .order('name', { ascending: true });

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ error: 'Error al obtener escuelas' });
    }

    // Query 2: Fetch all structural (transversal) context records
    const { data: structuralContextRows, error: structuralError } = await serviceClient
      .from('school_transversal_context')
      .select('*');

    if (structuralError) {
      console.error('Error fetching structural context:', structuralError);
      return res.status(500).json({ error: 'Error al obtener contexto estructural' });
    }

    // Query 3: Fetch all custom responses joined with their questions
    const { data: customResponseRows, error: responsesError } = await serviceClient
      .from('context_general_responses')
      .select('*, question:context_general_questions(*)');

    if (responsesError) {
      console.error('Error fetching custom responses:', responsesError);
      return res.status(500).json({ error: 'Error al obtener respuestas de contexto' });
    }

    // Query 4: Fetch only generic (non-structural) active questions for custom columns
    const { data: questions, error: questionsError } = await serviceClient
      .from('context_general_questions')
      .select('*')
      .eq('is_active', true)
      .or('widget_type.eq.generic,widget_type.is.null')
      .order('display_order', { ascending: true });

    if (questionsError) {
      console.error('Error fetching context questions:', questionsError);
      return res.status(500).json({ error: 'Error al obtener preguntas de contexto' });
    }

    // Build structuralContextBySchool: Record keyed by school_id
    const structuralContextBySchool: Record<number, any> = {};
    for (const row of structuralContextRows ?? []) {
      structuralContextBySchool[row.school_id] = row;
    }

    // Build customResponsesBySchool: Record keyed by school_id, value is array of responses
    const customResponsesBySchool: Record<number, any[]> = {};
    for (const row of customResponseRows ?? []) {
      if (!customResponsesBySchool[row.school_id]) {
        customResponsesBySchool[row.school_id] = [];
      }
      customResponsesBySchool[row.school_id].push(row);
    }

    return res.status(200).json({
      success: true,
      schools: schools ?? [],
      structuralContextBySchool,
      customResponsesBySchool,
      questions: questions ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error in context-questions overview:', message);
    return res.status(500).json({ error: 'Error inesperado al obtener vista general de contexto' });
  }
}
