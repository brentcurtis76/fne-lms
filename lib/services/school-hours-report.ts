/**
 * Shared school hours report data fetcher.
 *
 * Used by both GET /api/school-hours-report/[school_id] (JSON)
 * and GET /api/school-hours-report/[school_id]/pdf.
 */

import type { createServiceRoleClient } from '../api-auth';
import type {
  SchoolReportData,
  BucketWithSessions,
  SessionDetail,
  ContractSummary,
} from '../types/hour-tracking.types';

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
  session_facilitators: Array<{
    profiles: { first_name: string | null; last_name: string | null } | null;
  }> | null;
};

type ContratoRow = {
  id: string;
  numero_contrato: string | null;
  is_annexo: boolean | null;
  horas_contratadas: number | null;
  programa_id: string | null;
  programas: { id: string; nombre: string } | null;
};

// Fallback mapping from session status → display status (used only when no ledger entry exists)
const SESSION_STATUS_FALLBACK: Record<string, SessionDetail['status']> = {
  completada: 'consumida',
  aprobada: 'consumida',
  reservada: 'reservada',
  en_curso: 'reservada',
  cancelada: 'penalizada', // conservative fallback; ledger entry is authoritative
};

/**
 * Fetches the full school hours report data.
 *
 * For cancelled sessions, resolves the authoritative status from
 * contract_hours_ledger (penalizada vs devuelta) instead of assuming
 * all cancellations are penalties.
 */
export async function fetchSchoolReportData(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  schoolId: number
): Promise<SchoolReportData | null> {
  // Fetch school name
  const { data: schoolData } = await serviceClient
    .from('schools')
    .select('id, name')
    .eq('id', schoolId)
    .single();

  if (!schoolData) return null;

  // Step 1: Get cliente_ids for this school
  const { data: clientesData } = await serviceClient
    .from('clientes')
    .select('id')
    .eq('school_id', schoolId);

  const clienteIds = (clientesData ?? []).map((c: { id: string }) => c.id);
  if (clienteIds.length === 0) {
    return { school_id: schoolId, school_name: schoolData.name, programs: [] };
  }

  // Step 2: Fetch active contracts with program info
  const { data: contratos } = await serviceClient
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

  const contratoList = (contratos ?? []) as unknown as ContratoRow[];

  if (contratoList.length === 0) {
    return { school_id: schoolId, school_name: schoolData.name, programs: [] };
  }

  // Group contracts by programa_id
  const programaMap = new Map<
    string,
    { programa_id: string; programa_name: string; contracts: ContractSummary[] }
  >();

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

      const typedRows = (sessionRows ?? []) as unknown as SessionRow[];

      // Fetch authoritative ledger statuses for these sessions
      const sessionIds = typedRows.map((s) => s.id);
      let ledgerMap = new Map<string, SessionDetail['status']>();

      // Map from session_id → { status, is_over_budget }
      let overBudgetMap = new Map<string, boolean>();

      if (sessionIds.length > 0) {
        const { data: ledgerEntries } = await serviceClient
          .from('contract_hours_ledger')
          .select('session_id, status, is_over_budget')
          .in('session_id', sessionIds);

        if (ledgerEntries) {
          for (const entry of ledgerEntries as { session_id: string; status: string; is_over_budget: boolean }[]) {
            if (entry.session_id) {
              ledgerMap.set(entry.session_id, entry.status as SessionDetail['status']);
              overBudgetMap.set(entry.session_id, entry.is_over_budget ?? false);
            }
          }
        }
      }

      const sessions: SessionDetail[] = typedRows.map((s) => {
        // Get first facilitator name
        const facilitator = s.session_facilitators?.[0]?.profiles;
        const consultantName = facilitator
          ? `${facilitator.first_name ?? ''} ${facilitator.last_name ?? ''}`.trim()
          : 'Sin asignar';

        // Hours: use actual_duration_minutes if available, else planned_duration_minutes
        const durationMinutes = s.actual_duration_minutes ?? s.planned_duration_minutes ?? 0;
        const hours = durationMinutes / 60;

        // Use ledger status if available, otherwise fall back to session status mapping
        const ledgerStatus = ledgerMap.get(s.id);
        const mappedStatus: SessionDetail['status'] =
          ledgerStatus ?? (SESSION_STATUS_FALLBACK[s.status] ?? 'reservada');

        return {
          session_id: s.id,
          title: s.title ?? 'Sin título',
          date: s.scheduled_date ?? '',
          consultant_name: consultantName,
          hours,
          status: mappedStatus,
          is_over_budget: overBudgetMap.get(s.id) ?? false,
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

    programaMap.get(programaId)!.contracts.push({
      contrato_id: contrato.id,
      numero_contrato: contrato.numero_contrato ?? contrato.id,
      is_annexo: contrato.is_annexo ?? false,
      total_contracted_hours: contrato.horas_contratadas ?? 0,
      total_reserved: totalReserved,
      total_consumed: totalConsumed,
      total_available: totalAvailable,
      buckets: bucketsWithSessions,
    });
  }

  return {
    school_id: schoolId,
    school_name: schoolData.name,
    programs: Array.from(programaMap.values()),
  };
}
