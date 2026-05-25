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

  const stats = await getMonthlyFormStats(createServiceRoleClient());
  if (!stats) {
    return sendAuthError(res, 'Failed to load form stats', 500);
  }

  return res.status(200).json({ data: stats });
}
