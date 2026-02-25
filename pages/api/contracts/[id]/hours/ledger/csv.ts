import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../../../lib/api-auth';
import { Validators } from '../../../../../../lib/types/api-auth.types';
import { getUserRoles, getHighestRole } from '../../../../../../utils/roleUtils';
import { csvEscape } from '../../../../../../lib/exportUtils';

// ============================================================
// Handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'contracts-hours-ledger-csv');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || !Validators.isUUID(id)) {
    return sendAuthError(res, 'ID de contrato inválido', 400);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    // RBAC: equipo_directivo can only access their school's contracts
    if (highestRole === 'equipo_directivo') {
      const { data: contrato } = await serviceClient
        .from('contratos')
        .select('clientes!inner(school_id)')
        .eq('id', id)
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
    } else if (highestRole !== 'admin' && highestRole !== 'consultor') {
      return sendAuthError(res, 'Acceso denegado', 403);
    }

    // Step 1: Get allocation IDs for this contract
    const { data: allocations, error: allocError } = await serviceClient
      .from('contract_hour_allocations')
      .select('id, hour_types!hour_type_id(display_name)')
      .eq('contrato_id', id);

    if (allocError) {
      return sendAuthError(res, 'Error al obtener asignaciones del contrato', 500, allocError.message);
    }

    const allocationIds = (allocations ?? []).map((a: { id: string }) => a.id);

    if (allocationIds.length === 0) {
      // Return empty CSV
      const filename = `libro-horas-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.write('\uFEFF');
      res.write('Fecha,Sesión,Tipo de Hora,Consultor,Horas,Estado\n');
      res.end();
      return;
    }

    // Build allocation → hour type name map
    const allocHourTypeMap = new Map<string, string>();
    for (const rawAlloc of (allocations ?? [])) {
      const alloc = rawAlloc as unknown as { id: string; hour_types: { display_name: string } | { display_name: string }[] | null };
      const htObj = Array.isArray(alloc.hour_types) ? alloc.hour_types[0] : alloc.hour_types;
      allocHourTypeMap.set(alloc.id, htObj?.display_name ?? '');
    }

    // Step 2: Query ledger with session info
    let query = serviceClient
      .from('contract_hours_ledger')
      .select(
        `
        id,
        allocation_id,
        session_id,
        hours,
        status,
        session_date,
        is_manual,
        consultor_sessions:session_id (
          title,
          session_facilitators (
            profiles ( first_name, last_name )
          )
        )
      `
      )
      .in('allocation_id', allocationIds)
      .order('session_date', { ascending: false });

    // Consultor: only their sessions
    if (highestRole === 'consultor') {
      const { data: facilitatedSessionIds } = await serviceClient
        .from('session_facilitators')
        .select('session_id')
        .eq('user_id', user.id);

      const sessionIds = (facilitatedSessionIds ?? []).map((f: { session_id: string }) => f.session_id);
      if (sessionIds.length === 0) {
        const filename = `libro-horas-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.write('\uFEFF');
        res.write('Fecha,Sesión,Tipo de Hora,Consultor,Horas,Estado\n');
        res.end();
        return;
      }
      query = query.in('session_id', sessionIds);
    }

    const { data: ledger, error: dbError } = await query;

    if (dbError) {
      return sendAuthError(res, 'Error al obtener libro de horas', 500, dbError.message);
    }

    // Build CSV
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `libro-horas-${id.slice(0, 8)}-${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // UTF-8 BOM for Excel
    res.write('\uFEFF');
    res.write('Fecha,Sesión,Tipo de Hora,Consultor,Horas,Estado\n');

    type SessionFacilitator = {
      profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    };
    type SessionInfo = {
      title: string | null;
      session_facilitators: SessionFacilitator[] | null;
    };
    type LedgerRow = {
      allocation_id: string;
      session_id: string | null;
      hours: number;
      status: string;
      session_date: string | null;
      is_manual: boolean;
      consultor_sessions: SessionInfo | SessionInfo[] | null;
    };

    for (const rawEntry of (ledger ?? [])) {
      const entry = rawEntry as unknown as LedgerRow;
      const fecha = entry.session_date ?? '';
      const sessionObj = Array.isArray(entry.consultor_sessions)
        ? entry.consultor_sessions[0]
        : entry.consultor_sessions;
      const sessionTitle = entry.is_manual
        ? 'Entrada manual'
        : (sessionObj?.title ?? '');
      const hourTypeName = allocHourTypeMap.get(entry.allocation_id) ?? '';
      const facilitators = sessionObj?.session_facilitators ?? [];
      const firstFacilitator = facilitators.length > 0 ? facilitators[0] : null;
      const profileObj = firstFacilitator?.profiles
        ? (Array.isArray(firstFacilitator.profiles) ? firstFacilitator.profiles[0] : firstFacilitator.profiles)
        : null;
      const consultorName = profileObj
        ? `${profileObj.first_name ?? ''} ${profileObj.last_name ?? ''}`.trim()
        : '';
      const horas = entry.hours.toFixed(2);
      const estado = entry.status;

      res.write(
        [
          csvEscape(fecha),
          csvEscape(sessionTitle),
          csvEscape(hourTypeName),
          csvEscape(consultorName),
          csvEscape(horas),
          csvEscape(estado),
        ].join(',') + '\n'
      );
    }

    res.end();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al exportar libro de horas', 500, message);
  }
}
