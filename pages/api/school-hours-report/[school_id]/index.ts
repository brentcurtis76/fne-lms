/**
 * GET /api/school-hours-report/[school_id]
 *
 * Returns the full school hours report: programs → contracts → buckets → sessions.
 *
 * Auth:
 *   - admin: can view any school
 *   - equipo_directivo: can only view their own school (resolved via user_roles.school_id)
 *   - All other roles: 403
 *
 * school_id is INTEGER (not UUID). Validated with parseInt() + isNaN().
 *
 * Sessions are capped at 500 per bucket to prevent PDF DoS.
 * attendance is always null — session_attendance table does not exist yet.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getUserRoles, getHighestRole } from '../../../../utils/roleUtils';
import type { SchoolReportData, BucketWithSessions, SessionDetail, ProgramGroup, ContractSummary } from '../../../../lib/types/hour-tracking.types';

// Max sessions returned per bucket (DoS prevention)
const MAX_SESSIONS_PER_BUCKET = 500;

// ============================================================
// DB row types (local)
// ============================================================

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

type SessionRow = {
  id: string;
  title: string;
  scheduled_date: string | null;
  actual_duration_minutes: number | null;
  planned_duration_minutes: number | null;
  status: string;
  hour_type_key: string | null;
  session_facilitators: Array<{ profiles: { first_name: string | null; last_name: string | null } | null }> | null;
};

type ContratoRow = {
  id: string;
  numero_contrato: string | null;
  is_annexo: boolean | null;
  horas_contratadas: number | null;
  programa_id: string | null;
  programas: { id: string; nombre: string } | null;
};

// ============================================================
// Main handler
// ============================================================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'school-hours-report');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { school_id } = req.query;

  if (!school_id || typeof school_id !== 'string') {
    return sendAuthError(res, 'ID de escuela inválido', 400);
  }

  const parsedSchoolId = parseInt(school_id, 10);
  if (isNaN(parsedSchoolId)) {
    return sendAuthError(res, 'ID de escuela inválido', 400);
  }

  return handleGet(req, res, parsedSchoolId);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, schoolId: number) {
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida', 401);
  }

  try {
    const serviceClient = createServiceRoleClient();

    // RBAC
    const userRoles = await getUserRoles(serviceClient, user.id);
    const highestRole = getHighestRole(userRoles);

    if (highestRole === 'equipo_directivo') {
      // Resolve school_id from user_roles (NOT profiles — see architect-review.md)
      const userSchoolIds = userRoles
        .filter((r) => r.school_id !== undefined && r.school_id !== null)
        .map((r) => String(r.school_id));

      if (!userSchoolIds.includes(String(schoolId))) {
        return sendAuthError(res, 'No tiene permisos para ver el reporte de esta escuela', 403);
      }
    } else if (highestRole !== 'admin') {
      return sendAuthError(res, 'Acceso denegado', 403);
    }

    // Fetch school name
    const { data: schoolData, error: schoolError } = await serviceClient
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (schoolError || !schoolData) {
      return sendAuthError(res, 'Escuela no encontrada', 404);
    }

    // Step 1: Fetch cliente_ids for this school
    const { data: clientesData, error: clientesError } = await serviceClient
      .from('clientes')
      .select('id')
      .eq('school_id', schoolId);

    if (clientesError) {
      return sendAuthError(res, 'Error al obtener clientes de la escuela', 500, clientesError.message);
    }

    const clienteIds = (clientesData ?? []).map((c: { id: string }) => c.id);

    if (clienteIds.length === 0) {
      const result: SchoolReportData = {
        school_id: schoolId,
        school_name: schoolData.name,
        programs: [],
      };
      return sendApiResponse(res, result);
    }

    // Step 2: Fetch active contracts for those clientes, with program info
    const { data: contratos, error: contratosError } = await serviceClient
      .from('contratos')
      .select(`
        id,
        numero_contrato,
        is_annexo,
        horas_contratadas,
        programa_id,
        programas(id, nombre)
      `)
      .in('cliente_id', clienteIds)
      .eq('estado', 'activo');

    if (contratosError) {
      return sendAuthError(res, 'Error al obtener contratos', 500, contratosError.message);
    }

    const contratoList = (contratos ?? []) as unknown as ContratoRow[];

    if (contratoList.length === 0) {
      const result: SchoolReportData = {
        school_id: schoolId,
        school_name: schoolData.name,
        programs: [],
      };
      return sendApiResponse(res, result);
    }

    // Group contracts by programa_id (null → "Sin Programa")
    const programaMap = new Map<string, { programa_id: string; programa_name: string; contracts: ContractSummary[] }>();

    for (const contrato of contratoList) {
      const programaId = contrato.programa_id ?? 'sin_programa';
      const programaName = contrato.programas?.nombre ?? 'Sin Programa';

      if (!programaMap.has(programaId)) {
        programaMap.set(programaId, {
          programa_id: programaId,
          programa_name: programaName,
          contracts: [],
        });
      }

      // Fetch bucket summary for this contract
      const { data: bucketRows, error: bucketError } = await serviceClient.rpc('get_bucket_summary', {
        p_contrato_id: contrato.id,
      });

      if (bucketError) {
        // Skip this contract rather than failing the whole report
        continue;
      }

      // Build buckets with sessions
      const bucketsWithSessions: BucketWithSessions[] = [];

      for (const bucket of (bucketRows ?? []) as BucketRow[]) {
        // Fetch sessions for this contract + hour_type_key
        const { data: sessionRows } = await serviceClient
          .from('consultor_sessions')
          .select(`
            id,
            title,
            scheduled_date,
            actual_duration_minutes,
            planned_duration_minutes,
            status,
            hour_type_key,
            session_facilitators(
              profiles(first_name, last_name)
            )
          `)
          .eq('contrato_id', contrato.id)
          .eq('hour_type_key', bucket.hour_type_key)
          .order('scheduled_date', { ascending: false })
          .limit(MAX_SESSIONS_PER_BUCKET);

        const sessions: SessionDetail[] = ((sessionRows ?? []) as unknown as SessionRow[]).map((s) => {
          // Get first facilitator name
          const facilitator = s.session_facilitators?.[0]?.profiles;
          const consultantName = facilitator
            ? `${facilitator.first_name ?? ''} ${facilitator.last_name ?? ''}`.trim()
            : 'Sin asignar';

          // Hours: use actual_duration_minutes if available, else planned_duration_minutes
          const durationMinutes = s.actual_duration_minutes ?? s.planned_duration_minutes ?? 0;
          const hours = durationMinutes / 60;

          // Map status to valid ledger status
          const statusMap: Record<string, SessionDetail['status']> = {
            completada: 'consumida',
            cancelada: 'penalizada',
            aprobada: 'consumida',
            reservada: 'reservada',
            en_curso: 'reservada',
          };
          const mappedStatus: SessionDetail['status'] = statusMap[s.status] ?? 'reservada';

          return {
            session_id: s.id,
            title: s.title ?? 'Sin título',
            date: s.scheduled_date ?? '',
            consultant_name: consultantName,
            hours,
            status: mappedStatus,
            // attendance: null — session_attendance table does not exist (future feature)
            attendance: null,
          };
        });

        bucketsWithSessions.push({
          hour_type_key: bucket.hour_type_key,
          display_name: bucket.display_name,
          allocated: bucket.allocated_hours,
          reserved: bucket.reserved_hours,
          consumed: bucket.consumed_hours,
          available: bucket.available_hours,
          is_fixed: bucket.is_fixed_allocation,
          annex_hours: bucket.annex_hours,
          sessions,
        });
      }

      // Compute contract-level totals
      const totalReserved = bucketsWithSessions.reduce((s, b) => s + b.reserved, 0);
      const totalConsumed = bucketsWithSessions.reduce((s, b) => s + b.consumed, 0);
      const totalAvailable = bucketsWithSessions.reduce((s, b) => s + b.available, 0);

      const contractSummary: ContractSummary = {
        contrato_id: contrato.id,
        numero_contrato: contrato.numero_contrato ?? contrato.id,
        is_annexo: contrato.is_annexo ?? false,
        total_contracted_hours: contrato.horas_contratadas ?? 0,
        total_reserved: totalReserved,
        total_consumed: totalConsumed,
        total_available: totalAvailable,
        buckets: bucketsWithSessions,
      };

      programaMap.get(programaId)!.contracts.push(contractSummary);
    }

    const programs: ProgramGroup[] = Array.from(programaMap.values());

    const result: SchoolReportData = {
      school_id: schoolId,
      school_name: schoolData.name,
      programs,
    };

    return sendApiResponse(res, result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return sendAuthError(res, 'Error inesperado al obtener el reporte de horas', 500, message);
  }
}
