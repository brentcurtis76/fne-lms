import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasAssessmentWritePermission } from '@/lib/assessment-permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Only admins can search users
  const canWrite = await hasAssessmentWritePermission(supabaseClient, user.id);
  if (!canWrite) {
    return res.status(403).json({ error: 'Solo administradores pueden buscar usuarios' });
  }

  const q = ((req.query.q as string) || '').trim();

  if (!q || q.length < 2) {
    return res.status(200).json({ users: [] });
  }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, email, first_name, last_name')
      .or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(20);

    if (error) {
      console.error('Error searching users:', error);
      return res.status(500).json({ error: 'Error al buscar usuarios' });
    }

    const users = (data || []).map((p: any) => ({
      id: p.id,
      email: p.email,
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || '',
    }));

    return res.status(200).json({ users });
  } catch (err: any) {
    console.error('Unexpected error searching users:', err);
    return res.status(500).json({ error: err.message || 'Error al buscar usuarios' });
  }
}
