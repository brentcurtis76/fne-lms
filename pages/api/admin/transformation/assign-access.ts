/**
 * API Route: Assign Transformation Access
 *
 * POST /api/admin/transformation/assign-access
 *
 * Asigna el paquete completo de 7 Vías de Transformación a una Growth Community.
 * Solo admins pueden ejecutar esta acción.
 *
 * Body:
 * {
 *   communityId: string (UUID),
 *   notes?: string (opcional)
 * }
 *
 * Response:
 * {
 *   success: true
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';
import {
  assignTransformationAccess,
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

  const supabase = await createApiSupabaseClient(req, res);
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
      error: 'Requiere rol de administrador para asignar acceso a Vías de Transformación',
    });
  }

  const { communityId, notes } = req.body;

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

  // Asignar acceso
  const result = await assignTransformationAccess(
    supabase,
    communityId,
    caller.user.id,
    notes
  );

  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({
    success: true,
    message: `Acceso a Vías de Transformación asignado a ${community.name}`,
  });
}
