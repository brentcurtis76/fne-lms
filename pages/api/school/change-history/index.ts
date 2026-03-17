import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const serviceClient = createServiceRoleClient();

  const requestedSchoolId = req.query.school_id ? parseInt(req.query.school_id as string) : undefined;

  if (requestedSchoolId !== undefined && isNaN(requestedSchoolId)) {
    return res.status(400).json({ error: 'school_id debe ser un número válido' });
  }

  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    serviceClient,
    user.id,
    requestedSchoolId
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos, consultores y administradores pueden acceder al historial de cambios'
    });
  }

  if (!isAdmin && !schoolId) {
    return res.status(400).json({ error: 'No se encontró escuela asociada al usuario' });
  }

  if (isAdmin && !requestedSchoolId) {
    return res.status(400).json({ error: 'Se requiere school_id para administradores' });
  }

  const effectiveSchoolId = isAdmin ? requestedSchoolId! : schoolId!;

  // Parse optional query params
  const feature = req.query.feature as string | undefined;
  const validFeatures = ['transversal_context', 'migration_plan', 'context_responses'];
  if (feature && !validFeatures.includes(feature)) {
    return res.status(400).json({ error: `feature debe ser uno de: ${validFeatures.join(', ')}` });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  try {
    // Build query
    let query = serviceClient
      .from('school_change_history')
      .select('*', { count: 'exact' })
      .eq('school_id', effectiveSchoolId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (feature) {
      query = query.eq('feature', feature);
    }

    const { data: history, count, error: dbError } = await query;

    if (dbError) {
      console.error('Error fetching change history:', dbError);
      return res.status(500).json({ error: 'Error al obtener el historial de cambios' });
    }

    // Resolve user_name from profiles at read time so names stay fresh
    // (the denormalized user_name column is a fallback if profile lookup fails)
    const userIds = [...new Set((history ?? []).map((h: any) => h.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('id, name')
        .in('id', userIds);

      if (profiles) {
        const namesMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.name]));
        for (const entry of history ?? []) {
          entry.user_name = namesMap[entry.user_id] || entry.user_name;
        }
      }
    }

    return res.status(200).json({
      success: true,
      history: history ?? [],
      total: count ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error fetching change history:', message);
    return res.status(500).json({ error: 'Error inesperado al obtener el historial de cambios' });
  }
}
