import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';
import { getMonthlyFormStats } from '../../../lib/formSubmissionTracker';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, error } = await checkIsAdmin(req, res);
  if (error || !isAdmin) {
    return sendAuthError(res, 'Admin access required', 403);
  }

  const { data, error: statsError } = await getMonthlyFormStats(createServiceRoleClient());
  if (statsError) {
    return res.status(500).json({ error: 'Failed to load form stats' });
  }

  return res.status(200).json({ data });
}
