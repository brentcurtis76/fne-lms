import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';

interface FeatureStatus {
  is_completed: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
  last_updated_at: string | null;
  last_updated_by_name: string | null;
}

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
      error: 'Solo directivos, consultores y administradores pueden acceder al estado de completitud'
    });
  }

  if (!isAdmin && !schoolId) {
    return res.status(400).json({ error: 'No se encontró escuela asociada al usuario' });
  }

  if (isAdmin && !requestedSchoolId) {
    return res.status(400).json({ error: 'Se requiere school_id para administradores' });
  }

  const effectiveSchoolId = isAdmin ? requestedSchoolId! : schoolId!;

  try {
    // Fetch all data in parallel
    const [transversalResult, planStatusResult, tcLastUpdateResult, mpLastUpdateResult, crLastUpdateResult] = await Promise.all([
      // 1. Transversal context completion (stored on the table itself)
      serviceClient
        .from('school_transversal_context')
        .select('is_completed, completed_at, completed_by')
        .eq('school_id', effectiveSchoolId)
        .maybeSingle(),

      // 2. Plan completion status for migration_plan and context_responses
      serviceClient
        .from('school_plan_completion_status')
        .select('feature, is_completed, completed_at, completed_by')
        .eq('school_id', effectiveSchoolId),

      // 3. Most recent change history entry per feature (targeted queries with limit)
      serviceClient
        .from('school_change_history')
        .select('feature, user_name, created_at')
        .eq('school_id', effectiveSchoolId)
        .eq('feature', 'transversal_context')
        .order('created_at', { ascending: false })
        .limit(1),

      serviceClient
        .from('school_change_history')
        .select('feature, user_name, created_at')
        .eq('school_id', effectiveSchoolId)
        .eq('feature', 'migration_plan')
        .order('created_at', { ascending: false })
        .limit(1),

      serviceClient
        .from('school_change_history')
        .select('feature, user_name, created_at')
        .eq('school_id', effectiveSchoolId)
        .eq('feature', 'context_responses')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (transversalResult.error) {
      console.error('Error fetching transversal context status:', transversalResult.error);
    }
    if (planStatusResult.error) {
      console.error('Error fetching plan completion status:', planStatusResult.error);
    }
    if (tcLastUpdateResult.error) {
      console.error('Error fetching transversal_context last update:', tcLastUpdateResult.error);
    }
    if (mpLastUpdateResult.error) {
      console.error('Error fetching migration_plan last update:', mpLastUpdateResult.error);
    }
    if (crLastUpdateResult.error) {
      console.error('Error fetching context_responses last update:', crLastUpdateResult.error);
    }

    // Build a map of completed_by user IDs to resolve names
    const completedByIds = new Set<string>();
    if (transversalResult.data?.completed_by) {
      completedByIds.add(transversalResult.data.completed_by);
    }
    for (const ps of planStatusResult.data || []) {
      if (ps.completed_by) completedByIds.add(ps.completed_by);
    }

    let namesMap: Record<string, string> = {};
    if (completedByIds.size > 0) {
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('id, name')
        .in('id', [...completedByIds]);

      if (profiles) {
        namesMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.name]));
      }
    }

    // Build last-updated map from targeted per-feature queries
    const lastUpdateMap: Record<string, { user_name: string; created_at: string }> = {};
    if (tcLastUpdateResult.data?.[0]) lastUpdateMap['transversal_context'] = tcLastUpdateResult.data[0];
    if (mpLastUpdateResult.data?.[0]) lastUpdateMap['migration_plan'] = mpLastUpdateResult.data[0];
    if (crLastUpdateResult.data?.[0]) lastUpdateMap['context_responses'] = crLastUpdateResult.data[0];

    // Build plan status map
    const planStatusMap: Record<string, any> = {};
    for (const ps of planStatusResult.data || []) {
      planStatusMap[ps.feature] = ps;
    }

    // Assemble response
    const emptyStatus: FeatureStatus = {
      is_completed: false,
      completed_at: null,
      completed_by_name: null,
      last_updated_at: null,
      last_updated_by_name: null,
    };

    const status: Record<string, FeatureStatus> = {};

    // transversal_context
    const tc = transversalResult.data;
    const tcLastUpdate = lastUpdateMap['transversal_context'];
    status.transversal_context = tc ? {
      is_completed: tc.is_completed ?? false,
      completed_at: tc.completed_at ?? null,
      completed_by_name: tc.completed_by ? (namesMap[tc.completed_by] ?? null) : null,
      last_updated_at: tcLastUpdate?.created_at ?? null,
      last_updated_by_name: tcLastUpdate?.user_name ?? null,
    } : { ...emptyStatus };

    // migration_plan and context_responses
    for (const feature of ['migration_plan', 'context_responses'] as const) {
      const ps = planStatusMap[feature];
      const lastUpdate = lastUpdateMap[feature];
      status[feature] = ps ? {
        is_completed: ps.is_completed ?? false,
        completed_at: ps.completed_at ?? null,
        completed_by_name: ps.completed_by ? (namesMap[ps.completed_by] ?? null) : null,
        last_updated_at: lastUpdate?.created_at ?? null,
        last_updated_by_name: lastUpdate?.user_name ?? null,
      } : {
        ...emptyStatus,
        last_updated_at: lastUpdate?.created_at ?? null,
        last_updated_by_name: lastUpdate?.user_name ?? null,
      };
    }

    return res.status(200).json({ success: true, status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Unexpected error fetching completion status:', message);
    return res.status(500).json({ error: 'Error inesperado al obtener el estado de completitud' });
  }
}
