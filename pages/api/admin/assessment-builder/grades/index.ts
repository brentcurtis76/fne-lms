import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import type { Grade } from '@/types/assessment-builder';

/**
 * GET /api/admin/assessment-builder/grades
 * Returns all grades ordered by sort_order
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

  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    const { data: grades, error } = await supabaseClient
      .from('ab_grades')
      .select('id, name, sort_order, is_always_gt')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching grades:', error);
      return res.status(500).json({ error: 'Error al obtener los niveles' });
    }

    return res.status(200).json({
      success: true,
      grades: grades as Grade[],
    });
  } catch (err: any) {
    console.error('Unexpected error fetching grades:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener niveles' });
  }
}
