/**
 * DEPRECATED: This endpoint is deprecated in favor of /api/transformation/area-questions
 * Redirects to the new dynamic endpoint for backward compatibility
 *
 * @deprecated Use /api/transformation/area-questions?area=personalizacion instead
 */

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Redirect to new dynamic endpoint
  return res.redirect(307, '/api/transformation/area-questions?area=personalizacion');
}
