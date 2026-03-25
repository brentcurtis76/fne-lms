import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '@/lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden ver instructores' });
  }

  const supabaseAdmin = createServiceRoleClient();

  try {
    // Fetch from the instructors table as specified
    const { data: instructors, error } = await supabaseAdmin
      .from('instructors')
      .select('id, full_name')
      .order('full_name');

    if (error) throw error;

    res.status(200).json(instructors || []);
  } catch (error: any) {
    console.error('Error fetching instructors:', error);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
}