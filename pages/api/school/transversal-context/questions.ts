import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '@/lib/api-auth';

/**
 * Public (authenticated) endpoint to fetch active context questions.
 * Any authenticated user can read active questions — no admin check needed.
 * This is used by school edit/view pages so directivos can see custom questions.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    const { data: questions, error: dbError } = await serviceClient
      .from('context_general_questions')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (dbError) {
      console.error('Error fetching active context questions:', dbError);
      return res.status(500).json({ error: 'Error al obtener preguntas de contexto' });
    }

    return res.status(200).json({
      success: true,
      questions: questions ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error fetching context questions:', message);
    return res.status(500).json({ error: 'Error inesperado al obtener preguntas de contexto' });
  }
}
