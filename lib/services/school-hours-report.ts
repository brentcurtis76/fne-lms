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
import { billableHours } from './billable-hours';

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
  session_date: string | null;
  scheduled_duration_minutes: number | null;
  status: string;
  hour_type_key: string | null;
  session_facilitators: Array<{
    profiles: { first_name: string | null; last_name: string | null } | null;
  }> | null;
};

/** The `contract_hours_ledger` columns the drill-down reads for a session. */
type LedgerRow = {
  session_id: string;
  status: string;
  is_over_budget: boolean | null;
  hours: number | null;
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
  // r29 (Sol R-B): the three reads below used to destructure only `data`, so a FAILED
  // read was indistinguishable from an empty one — `clientes` erroring coalesced to `[]`
  // and returned `{ programs: [] }`, a 200 whose whole-school report shows zero contracts
  // and zero hours, pixel-identical to a school with nothing billed; `schools` erroring
  // became a 404 for a school that exists. Same rule as the bucket summary and the
  // sessions query below: these are the figures a school reconciles an invoice against,
  // so fail, do not degrade. A LEGITIMATE empty still returns a valid empty report — the
  // emptiness has to be proven by a successful query, not assumed from a failed one.

  // Fetch school name
  const { data: schoolData, error: schoolError } = await serviceClient
    .from('schools')
    .select('id, name')
    .eq('id', schoolId)
    .single();

  // `.single()` answers a genuinely absent school with PGRST116, which is the honest
  // 404 this function has always returned. Anything else is a failed read.
  if (schoolError && schoolError.code !== 'PGRST116') {
    console.error(`[SchoolHoursReport] School lookup failed (school=${schoolId}):`, schoolError);
    throw new Error(`No se pudieron obtener los datos del colegio ${schoolId}`);
  }

  if (!schoolData) return null;

  // Step 1: Get cliente_ids for this school
  const { data: clientesData, error: clientesError } = await serviceClient
    .from('clientes')
    .select('id')
    .eq('school_id', schoolId);

  if (clientesError) {
    console.error(`[SchoolHoursReport] Clientes lookup failed (school=${schoolId}):`, clientesError);
    throw new Error(`No se pudieron obtener los clientes del colegio ${schoolData.name}`);
  }

  const clienteIds = (clientesData ?? []).map((c: { id: string }) => c.id);
  if (clienteIds.length === 0) {
    return { school_id: schoolId, school_name: schoolData.name, programs: [] };
  }

  // Step 2: Fetch active contracts with program info
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
    console.error(
      `[SchoolHoursReport] Contratos lookup failed (school=${schoolId}):`,
      contratosError
    );
    throw new Error(`No se pudieron obtener los contratos del colegio ${schoolData.name}`);
  }

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

    // A failed bucket summary must never be skipped. `continue` dropped the contract from
    // the report entirely, which renders exactly like a contract that genuinely has no
    // hours — and the reader cannot tell the two apart. These are the figures a school
    // reconciles an invoice against, so the same rule the sessions query below already
    // follows applies here: fail, do not degrade. The scheduled fallback further down is
    // reached only after a SUCCESSFUL query proves a session has no ledger row.
    if (bucketError) {
      console.error(
        `[SchoolHoursReport] Bucket summary failed (contrato=${contrato.id}):`,
        bucketError
      );
      throw new Error(`No se pudo obtener el resumen de horas del contrato ${contrato.id}`);
    }

    // Build buckets with sessions
    const bucketsWithSessions: BucketWithSessions[] = [];

    for (const bucket of (bucketRows ?? []) as BucketRow[]) {
      // Fetch sessions for this contract + hour_type_key
      const { data: sessionRows, error: sessionsError } = await serviceClient
        .from('consultor_sessions')
        .select(`
          id,
          title,
          session_date,
          scheduled_duration_minutes,
          status,
          hour_type_key,
          session_facilitators(
            profiles(first_name, last_name)
          )
        `)
        .eq('contrato_id', contrato.id)
        .eq('hour_type_key', bucket.hour_type_key)
        .order('session_date', { ascending: false })
        .limit(MAX_SESSIONS_PER_BUCKET);

      // A failed sessions query must never be reported as "this bucket has no
      // sessions": schools reconcile billable hours against this drill-down, so a
      // silently short list is worse than a visible error. Fail the whole report.
      if (sessionsError) {
        console.error(
          `[SchoolHoursReport] Sessions query failed (contrato=${contrato.id}, bucket=${bucket.hour_type_key}):`,
          sessionsError
        );
        throw new Error(
          `No se pudieron obtener las sesiones del bucket "${bucket.hour_type_key}" del contrato ${contrato.id}`
        );
      }

      const typedRows = (sessionRows ?? []) as unknown as SessionRow[];

      // Fetch the authoritative ledger row for these sessions. One round trip carries
      // everything the drill-down needs about a session's hours: the billed `hours`, the
      // status displayed beside it, and the over-budget flag.
      const sessionIds = typedRows.map((s) => s.id);
      const ledgerBySession = new Map<string, LedgerRow>();

      if (sessionIds.length > 0) {
        const { data: ledgerEntries, error: ledgerError } = await serviceClient
          .from('contract_hours_ledger')
          .select('session_id, status, is_over_budget, hours')
          .in('session_id', sessionIds);

        // The `billableHours` fallback below is only honest once a SUCCESSFUL read has
        // proved a session has no ledger row. A failed read left this map empty and sent
        // every session in the bucket through that fallback, synthesising a billable
        // figure out of the schedule for all of them at once — silently, and for exactly
        // the number a school is invoiced against.
        if (ledgerError) {
          console.error(
            `[SchoolHoursReport] Ledger query failed (contrato=${contrato.id}, bucket=${bucket.hour_type_key}):`,
            ledgerError
          );
          throw new Error(
            `No se pudieron obtener las horas registradas del bucket "${bucket.hour_type_key}" del contrato ${contrato.id}`
          );
        }

        for (const entry of (ledgerEntries ?? []) as LedgerRow[]) {
          if (entry.session_id) {
            ledgerBySession.set(entry.session_id, entry);
          }
        }
      }

      const sessions: SessionDetail[] = typedRows.map((s) => {
        // Get first facilitator name
        const facilitator = s.session_facilitators?.[0]?.profiles;
        const consultantName = facilitator
          ? `${facilitator.first_name ?? ''} ${facilitator.last_name ?? ''}`.trim()
          : 'Sin asignar';

        const ledgerEntry = ledgerBySession.get(s.id);

        // Hours come from the ledger, which is what the school was billed. The status is
        // rendered beside this number, so every status shows its row's `hours` verbatim;
        // a session with no ledger row falls back to its scheduled duration. See
        // lib/services/billable-hours.ts — `actual_duration_minutes` is not read here.
        const hours = billableHours(
          ledgerEntry,
          s.scheduled_duration_minutes,
          'per_session_display'
        );

        // Use ledger status if available, otherwise fall back to session status mapping
        const mappedStatus: SessionDetail['status'] =
          (ledgerEntry?.status as SessionDetail['status'] | undefined) ??
          (SESSION_STATUS_FALLBACK[s.status] ?? 'reservada');

        return {
          session_id: s.id,
          title: s.title ?? 'Sin título',
          date: s.session_date ?? '',
          consultant_name: consultantName,
          hours,
          status: mappedStatus,
          is_over_budget: ledgerEntry?.is_over_budget ?? false,
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
