import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin } from '@/lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { isAdmin, user } = await checkIsAdmin(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden aplicar migraciones' });
  }

  return res.status(410).json({
    error: 'Endpoint retirado',
    message: 'Los cambios de esquema se aplican únicamente mediante migraciones revisadas.',
  });
}
