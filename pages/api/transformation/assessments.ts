import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';
import {
  hasTransformationAccess,
  assignTransformationAccess,
  isUserAdmin,
} from '@/lib/transformation/accessControl';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  // Validate required fields
  const { communityId, area } = req.body ?? {};

  if (!communityId) {
    return res.status(400).json({ error: 'Debes indicar communityId.' });
  }

  // Validate área (required field, must be valid value)
  const VALID_AREAS = ['personalizacion', 'aprendizaje'] as const;
  if (!area) {
    return res.status(400).json({
      error: 'El campo "area" es requerido',
      validAreas: VALID_AREAS,
    });
  }

  if (!VALID_AREAS.includes(area as any)) {
    return res.status(400).json({
      error: `Área inválida: "${area}"`,
      validAreas: VALID_AREAS,
    });
  }

  // Check if community exists
  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, name')
    .eq('id', communityId)
    .single();

  if (communityError || !community) {
    console.error('[transformation/create-assessment] community not found', communityError);
    return res.status(404).json({ error: 'Comunidad no encontrada.' });
  }

  // Check if community has transformation access using new system
  const hasAccess = await hasTransformationAccess(supabase, communityId);

  if (!hasAccess) {
    // If user is admin, auto-assign access; otherwise, deny
    const isAdmin = await isUserAdmin(supabase, caller.user.id);

    if (isAdmin) {
      console.log('[transformation/create-assessment] Auto-assigning transformation access for admin:', caller.user.id);

      const assignResult = await assignTransformationAccess(
        supabase,
        communityId,
        caller.user.id,
        'Auto-asignado al crear primer assessment'
      );

      if (!assignResult.success) {
        console.error('[transformation/create-assessment] Failed to assign transformation access', assignResult.error);
        return res.status(500).json({
          error: 'No se pudo habilitar la evaluación de transformación para esta comunidad.'
        });
      }

      console.log('[transformation/create-assessment] Transformation access assigned successfully');
    } else {
      console.log('[transformation/create-assessment] User is not admin and community has no access');
      return res.status(403).json({
        error: 'Esta comunidad no tiene acceso a Vías de Transformación. Contacta a un administrador.'
      });
    }
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('transformation_assessments')
    .insert({
      growth_community_id: communityId,
      area,
      status: 'in_progress',
      created_by: caller.user.id,
      started_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[transformation/create-assessment] error', error);
    return res.status(400).json({ error: error?.message ?? 'No se pudo crear el assessment.' });
  }

  // Return the full assessment object
  return res.status(200).json(data);
}
