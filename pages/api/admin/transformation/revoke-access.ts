/**
 * API Route: Revoke Transformation Access
 *
 * POST /api/admin/transformation/revoke-access
 *
 * Revoca el acceso a Vías de Transformación de una Growth Community.
 * Archiva automáticamente todos los assessments activos (in_progress, completed).
 *
 * ⚠️ IMPORTANTE: Los assessments archivados NO se reactivan automáticamente
 * si se reasigna el acceso más adelante.
 *
 * Solo admins pueden ejecutar esta acción.
 *
 * Body:
 * {
 *   communityId: string (UUID)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   archivedCount: number,
 *   archivedIds: string[],
 *   message: string
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVerifiedCaller } from '@/lib/api-auth';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import {
  revokeTransformationAccess,
  isUserAdmin,
} from '@/lib/transformation/accessControl';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });
  // Identity comes from the auth server; the cookie's stored `user` is
  // client-controlled (SM-B015).
  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  // Verificar que usuario sea admin
  const isAdmin = await isUserAdmin(supabase, caller.user.id);

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Requiere rol de administrador para revocar acceso a Vías de Transformación',
    });
  }

  const { communityId } = req.body;

  if (!communityId) {
    return res.status(400).json({ error: 'communityId requerido' });
  }

  // Verificar que la comunidad existe
  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, name')
    .eq('id', communityId)
    .single();

  if (communityError || !community) {
    return res.status(404).json({ error: 'Comunidad no encontrada' });
  }

  // Revocar acceso (archivará assessments automáticamente via trigger SQL)
  const result = await revokeTransformationAccess(supabase, communityId);

  if (!result.success) {
    // 🔧 MEDIUM FIX: Return 404 when no access record exists
    if (result.error?.includes('no tiene un registro de acceso')) {
      return res.status(404).json({ error: result.error });
    }
    return res.status(500).json({ error: result.error });
  }

  const message =
    result.archivedCount === 0
      ? `Acceso revocado. No había assessments activos.`
      : `Acceso revocado. ${result.archivedCount} assessment${result.archivedCount !== 1 ? 's' : ''} archivado${result.archivedCount !== 1 ? 's' : ''}.`;

  return res.status(200).json({
    success: true,
    archivedCount: result.archivedCount,
    archivedIds: result.archivedIds,
    message,
  });
}
