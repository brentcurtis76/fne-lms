import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../lib/api-auth';
import { Validators } from '../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../utils/roleUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'contracts-hours-summary');

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de contrato inválido', 400);
  }

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  }

  return handleMethodNotAllowed(res, ['GET']);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, contratoId: string) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // Resolve user role for access control
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    // RBAC checks
    if (highestRole === 'equipo_directivo') {
      const { data: contrato } = await serviceClient
        .from('contratos')
        .select('clientes!inner(school_id)')
        .eq('id', contratoId)
        .single();

      const contractSchoolId = Array.isArray(contrato?.clientes)
        ? (contrato?.clientes as { school_id: number }[])[0]?.school_id
        : (contrato?.clientes as { school_id: number } | null)?.school_id;

      const userSchoolIds = userRoles
        .filter((r) => r.school_id !== undefined && r.school_id !== null)
        .map((r) => String(r.school_id));

      if (!contractSchoolId || !userSchoolIds.includes(String(contractSchoolId))) {
        return sendAuthError(res, 'Acceso denegado: este contrato no pertenece a su institución', 403);
      }
    } else if (highestRole === 'consultor') {
      // Consultor can only see contracts for sessions they facilitate
      const { data: facilitatedSessionIds } = await serviceClient
        .from('session_facilitators')
        .select('session_id')
        .eq('user_id', user.id);

      const sessionIds = (facilitatedSessionIds || []).map(
        (f: { session_id: string }) => f.session_id
      );

      if (sessionIds.length === 0) {
        return sendAuthError(res, 'Acceso denegado: no tiene sesiones para este contrato', 403);
      }

      const { data: sessionContrato } = await serviceClient
        .from('consultor_sessions')
        .select('id')
        .eq('contrato_id', contratoId)
        .in('id', sessionIds)
        .limit(1);

      if (!sessionContrato || sessionContrato.length === 0) {
        return sendAuthError(res, 'Acceso denegado: no tiene sesiones para este contrato', 403);
      }
    } else if (highestRole !== 'admin') {
      return sendAuthError(res, 'Acceso denegado', 403);
    }

    // Fetch horas_contratadas from contratos
    const { data: contrato, error: contratoError } = await serviceClient
      .from('contratos')
      .select('horas_contratadas')
      .eq('id', contratoId)
      .single();

    if (contratoError) {
      return sendAuthError(res, 'Error al obtener datos del contrato', 500, contratoError.message);
    }

    // Call get_bucket_summary DB function
    const { data: bucketRows, error: bucketError } = await serviceClient.rpc('get_bucket_summary', {
      p_contrato_id: contratoId,
    });

    if (bucketError) {
      return sendAuthError(res, 'Error al obtener resumen de horas', 500, bucketError.message);
    }

    // Map DB full column names to short names
    type BucketRow = {
      hour_type_key: string;
      display_name: string;
      allocated_hours: number;
      reserved_hours: number;
      consumed_hours: number;
      available_hours: number;
      is_fixed_allocation: boolean;
      annex_hours: number;
    };

    // Build sources array for annex support
    const { data: contractAllocs } = await serviceClient
      .from('contract_hour_allocations')
      .select('id, contrato_id, hour_type_id, allocated_hours, adds_to_allocation_id')
      .eq('contrato_id', contratoId);

    const contractAllocIds = (contractAllocs || []).map((a: { id: string }) => a.id);

    let annexAllocs: Array<{ id: string; contrato_id: string; hour_type_id: string; allocated_hours: number; adds_to_allocation_id: string }> = [];
    if (contractAllocIds.length > 0) {
      const { data: annexData } = await serviceClient
        .from('contract_hour_allocations')
        .select('id, contrato_id, hour_type_id, allocated_hours, adds_to_allocation_id')
        .in('adds_to_allocation_id', contractAllocIds);
      annexAllocs = (annexData || []) as typeof annexAllocs;
    }

    // Fetch hour_types to map hour_type_id -> key
    const { data: allHourTypes } = await serviceClient
      .from('hour_types')
      .select('id, key');
    const htIdToKey = new Map((allHourTypes || []).map((ht: { id: string; key: string }) => [ht.id, ht.key]));

    // Group sources by hour_type_key
    const sourcesByKey = new Map<string, Array<{ contrato_id: string; hours: number; is_annex: boolean }>>();
    for (const alloc of (contractAllocs || [])) {
      const key = htIdToKey.get(alloc.hour_type_id);
      if (!key) continue;
      if (!sourcesByKey.has(key)) sourcesByKey.set(key, []);
      sourcesByKey.get(key)!.push({
        contrato_id: alloc.contrato_id,
        hours: alloc.allocated_hours,
        is_annex: false,
      });
    }
    for (const alloc of annexAllocs) {
      const parentAlloc = (contractAllocs || []).find((a: { id: string }) => a.id === alloc.adds_to_allocation_id);
      const key = parentAlloc ? htIdToKey.get(parentAlloc.hour_type_id) : null;
      if (!key) continue;
      if (!sourcesByKey.has(key)) sourcesByKey.set(key, []);
      sourcesByKey.get(key)!.push({
        contrato_id: alloc.contrato_id,
        hours: alloc.allocated_hours,
        is_annex: true,
      });
    }

    const buckets = (bucketRows || []).map((row: BucketRow) => ({
      hour_type_key: row.hour_type_key,
      display_name: row.display_name,
      allocated: row.allocated_hours,
      reserved: row.reserved_hours,
      consumed: row.consumed_hours,
      available: row.available_hours,
      is_fixed: row.is_fixed_allocation,
      annex_hours: row.annex_hours,
      sources: sourcesByKey.get(row.hour_type_key) || [],
    }));

    return sendApiResponse(res, {
      horas_contratadas: contrato?.horas_contratadas ?? null,
      buckets,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener resumen de horas', 500, message);
  }
}
