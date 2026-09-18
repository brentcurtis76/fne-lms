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
  SchoolHoursSummary,
} from '../types/hour-tracking.types';
import { billableHours } from './billable-hours';
import { isClientTenant, parseTenantKind } from '../types/tenant-kind';

// Max sessions returned per bucket (DoS prevention)
const MAX_SESSIONS_PER_BUCKET = 500;
// One row past the cap. Its existence is the whole proof that older sessions were left
// out; it is never emitted, never looked up in the ledger and never counted.
const TRUNCATION_PROBE_ROWS = MAX_SESSIONS_PER_BUCKET + 1;
// Every page but the last carries at least one row, so a server that makes progress needs
// at most one request per probed row plus the empty page that ends the read.
const MAX_SESSION_REQUESTS_PER_BUCKET = TRUNCATION_PROBE_ROWS + 1;

// Requested page size for school-wide reads; the server may return fewer rows per page.
// IN lists stay short enough for the request URL.
const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;

const EMPTY_SUMMARY: SchoolHoursSummary = {
  total_contracted_hours: 0,
  total_allocated: 0,
  total_reserved: 0,
  total_consumed: 0,
  total_available: 0,
};

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
  /** §11 admin override (Z7-4); NULL = no override, `hours` governs. */
  effective_minutes: number | null;
};

type ContratoRow = {
  id: string;
  numero_contrato: string | null;
  /** DB column is `is_anexo` (one n); the wire field stays `is_annexo`. */
  is_anexo: boolean | null;
  horas_contratadas: number | null;
  programa_id: string | null;
  programas: { id: string; nombre: string } | null;
};

type AllocationRow = { id: string; allocated_hours: number | null };

type SummaryLedgerRow = {
  id: string;
  status: string;
  hours: number | null;
  effective_minutes: number | null;
};

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type PageResult = { data: unknown; error: unknown };

/**
 * Reads every row matching each ID chunk, failing on any error. `page` builds a query
 * ordered by `id` for one chunk and the inclusive `[from, to]` range. The offset advances
 * by the rows actually returned and stops only on an empty page, so a server row cap
 * smaller than PAGE_SIZE can neither end the read early nor skip rows.
 */
async function readAllIn<T extends { id: string }>(
  label: string,
  ids: string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>
): Promise<T[]> {
  const rows: T[] = [];
  for (let c = 0; c < ids.length; c += ID_CHUNK_SIZE) {
    const chunk = ids.slice(c, c + ID_CHUNK_SIZE);
    for (let from = 0; ; ) {
      const { data, error } = await page(chunk, from, from + PAGE_SIZE - 1);
      if (error || !Array.isArray(data)) {
        console.error(`[SchoolHoursReport] ${label} read failed:`, error);
        throw new Error('No se pudieron obtener las horas del colegio');
      }
      if (data.length === 0) break;
      rows.push(...(data as T[]));
      from += data.length;
    }
  }
  return rows;
}

/**
 * The latest sessions of one bucket, plus the single row that proves older ones exist.
 *
 * `.limit(500)` returned the cap with nothing to say whether it WAS the cap: a category
 * with exactly 500 sessions and one with 4000 rendered identically, under totals that
 * cover the whole record. Reading one row past the cap answers that without an exact count
 * and without an unbounded read — the 501st row is dropped before anything downstream sees
 * it. The offset advances by the rows actually returned, so a server page cap smaller than
 * the window asked for can neither end the read early nor skip rows, and a page that
 * overruns that window, repeats a row, returns something other than a list or never ends
 * fails the report rather than quietly duplicating or inventing sessions.
 */
async function readBucketSessions(
  serviceClient: ServiceClient,
  contratoId: string,
  hourTypeKey: string
): Promise<{ rows: SessionRow[]; truncated: boolean }> {
  const collected: SessionRow[] = [];
  const seenIds = new Set<string>();

  // A failed sessions read must never be reported as "this bucket has no sessions":
  // schools reconcile billable hours against this drill-down, so a silently short list is
  // worse than a visible error. Fail the whole report, naming contract and bucket.
  const fail = (reason: unknown): never => {
    console.error(
      `[SchoolHoursReport] Sessions query failed (contrato=${contratoId}, bucket=${hourTypeKey}):`,
      reason
    );
    throw new Error(
      `No se pudieron obtener las sesiones del bucket "${hourTypeKey}" del contrato ${contratoId}`
    );
  };

  for (let requests = 0; collected.length < TRUNCATION_PROBE_ROWS; requests += 1) {
    if (requests >= MAX_SESSION_REQUESTS_PER_BUCKET) {
      fail(new Error(`sessions read exceeded ${MAX_SESSION_REQUESTS_PER_BUCKET} requests`));
    }

    let page: { data: unknown; error: unknown };
    try {
      page = await serviceClient
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
        .eq('contrato_id', contratoId)
        .eq('hour_type_key', hourTypeKey)
        .order('session_date', { ascending: false })
        // Tie-break only — the primary order stays `session_date` descending. Sessions
        // sharing a date are otherwise free to change places between requests, which is
        // exactly how a paged read skips one row and repeats another.
        .order('id', { ascending: true })
        .range(collected.length, TRUNCATION_PROBE_ROWS - 1);
    } catch (thrown) {
      return fail(thrown);
    }

    if (page.error) return fail(page.error);
    if (!Array.isArray(page.data)) return fail(new Error('sessions page was not a list of rows'));
    if (page.data.length === 0) break;

    // The window asked for is never wider than what is left of the probe allowance, so a
    // longer page is malformed: fail on its size before reading any of its rows, rather
    // than slicing the surplus off and reporting the oversized answer as a good one.
    const windowRows = TRUNCATION_PROBE_ROWS - collected.length;
    if (page.data.length > windowRows) {
      return fail(
        new Error(`sessions page returned ${page.data.length} rows for a window of ${windowRows}`)
      );
    }

    for (const row of page.data as SessionRow[]) {
      if (typeof row?.id !== 'string') {
        return fail(new Error('sessions page returned a row without an id'));
      }
      if (seenIds.has(row.id)) {
        return fail(new Error(`sessions page repeated session ${row.id}`));
      }
      seenIds.add(row.id);
      collected.push(row);
    }
  }

  return {
    rows: collected.slice(0, MAX_SESSIONS_PER_BUCKET),
    truncated: collected.length > MAX_SESSIONS_PER_BUCKET,
  };
}

function finiteOrThrow(value: number | null): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) {
    throw new Error('El resumen de horas del colegio contiene valores inválidos');
  }
  return n;
}

const roundHours = (n: number) => Math.round(n * 100) / 100;

/**
 * School-wide totals. Mirrors `get_bucket_summary` membership (direct allocations plus
 * one-hop `adds_to_allocation_id` annexes) and ledger accounting, but counts each
 * allocation and ledger row once by ID across all active contracts: an annex allocation
 * belongs to both its own contract and its parent, so summing per-contract totals
 * double-counts it.
 */
async function computeSchoolSummary(
  serviceClient: ServiceClient,
  contratoList: ContratoRow[]
): Promise<SchoolHoursSummary> {
  const contratoIds = contratoList.map((c) => c.id);
  const direct = await readAllIn<AllocationRow>('contract_hour_allocations', contratoIds, (chunk, from, to) =>
    serviceClient.from('contract_hour_allocations').select('id, allocated_hours')
      .in('contrato_id', chunk).order('id', { ascending: true }).range(from, to)
  );
  const linked = await readAllIn<AllocationRow>('contract_hour_allocations', direct.map((a) => a.id), (chunk, from, to) =>
    serviceClient.from('contract_hour_allocations').select('id, allocated_hours')
      .in('adds_to_allocation_id', chunk).order('id', { ascending: true }).range(from, to)
  );
  const allocations = new Map<string, AllocationRow>();
  for (const a of [...direct, ...linked]) allocations.set(a.id, a);

  const ledgerRows = await readAllIn<SummaryLedgerRow>('contract_hours_ledger', Array.from(allocations.keys()), (chunk, from, to) =>
    serviceClient.from('contract_hours_ledger').select('id, status, hours, effective_minutes')
      .in('allocation_id', chunk).in('status', ['reservada', 'consumida', 'penalizada'])
      .order('id', { ascending: true }).range(from, to)
  );
  const ledger = new Map<string, SummaryLedgerRow>();
  for (const row of ledgerRows) ledger.set(row.id, row);

  let allocated = 0;
  for (const a of allocations.values()) allocated += finiteOrThrow(a.allocated_hours);

  let reserved = 0;
  let consumed = 0;
  for (const row of ledger.values()) {
    const hours = billableHours(
      { status: row.status, hours: finiteOrThrow(row.hours), effective_minutes: row.effective_minutes === null ? null : finiteOrThrow(row.effective_minutes) },
      null,
      'per_session_display'
    );
    if (row.status === 'reservada') reserved += hours;
    else if (row.status === 'consumida' || row.status === 'penalizada') consumed += hours;
  }

  const contracted = contratoList.reduce((s, c) => s + finiteOrThrow(c.horas_contratadas), 0);
  return {
    total_contracted_hours: roundHours(contracted),
    total_allocated: roundHours(allocated),
    total_reserved: roundHours(reserved),
    total_consumed: roundHours(consumed),
    total_available: roundHours(allocated - reserved - consumed),
  };
}

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
    .select('id, name, tenant_kind')
    .eq('id', schoolId)
    .single();

  // `.single()` answers a genuinely absent school with PGRST116, which is the honest
  // 404 this function has always returned. Anything else is a failed read.
  if (schoolError && schoolError.code !== 'PGRST116') {
    console.error(`[SchoolHoursReport] School lookup failed (school=${schoolId}):`, schoolError);
    throw new Error(`No se pudieron obtener los datos del colegio ${schoolId}`);
  }

  if (!schoolData) return null;

  const tenantKind = parseTenantKind(schoolData.tenant_kind);
  if (tenantKind === null) {
    throw new Error(`El colegio ${schoolId} tiene una clasificación inválida`);
  }
  // This service feeds stakeholder JSON and PDF reports. Operations can inspect QA
  // tenants elsewhere, but a non-client school is indistinguishable from absent here.
  if (!isClientTenant(tenantKind)) return null;

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
    return { school_id: schoolId, school_name: schoolData.name, programs: [], school_summary: EMPTY_SUMMARY };
  }

  // Step 2: Fetch active contracts with program info
  const { data: contratos, error: contratosError } = await serviceClient
    .from('contratos')
    .select(`
      id,
      numero_contrato,
      is_anexo,
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
    return { school_id: schoolId, school_name: schoolData.name, programs: [], school_summary: EMPTY_SUMMARY };
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
      // Fetch sessions for this contract + hour_type_key, plus the one extra row that
      // says whether older sessions were left out of the list below.
      const { rows: typedRows, truncated } = await readBucketSessions(
        serviceClient,
        contrato.id,
        bucket.hour_type_key
      );

      // Fetch the authoritative ledger row for these sessions. One round trip carries
      // everything the drill-down needs about a session's hours: the billed `hours`, the
      // status displayed beside it, and the over-budget flag.
      const sessionIds = typedRows.map((s) => s.id);
      const ledgerBySession = new Map<string, LedgerRow>();

      if (sessionIds.length > 0) {
        const { data: ledgerEntries, error: ledgerError } = await serviceClient
          .from('contract_hours_ledger')
          .select('session_id, status, is_over_budget, hours, effective_minutes')
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

        // The ledger row is authoritative when there is one. When there is not — and the
        // read above SUCCEEDED, so the absence is proven rather than assumed — the session
        // has no hours record at all, whatever its own lifecycle status says. Deriving one
        // from `s.status` invented facts: a cancellation nobody ever billed was shown as
        // `penalizada`, a finished session nobody ledgered as `consumida`, and everything
        // else as a reservation that was never made. `sin_registro` says only what is true,
        // and the `hours` beside it stays the scheduled estimate it has always been.
        const mappedStatus: SessionDetail['status'] =
          (ledgerEntry?.status as SessionDetail['status'] | undefined) ?? 'sin_registro';

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
        // Per bucket, never shared: the flag says only that THIS category's list stops
        // short. The four totals above it still cover the complete record.
        sessions_truncated: truncated,
      });
    }

    // Compute contract-level totals
    const totalReserved = bucketsWithSessions.reduce((s, b) => s + b.reserved, 0);
    const totalConsumed = bucketsWithSessions.reduce((s, b) => s + b.consumed, 0);
    const totalAvailable = bucketsWithSessions.reduce((s, b) => s + b.available, 0);

    programaMap.get(programaId)!.contracts.push({
      contrato_id: contrato.id,
      numero_contrato: contrato.numero_contrato ?? contrato.id,
      is_annexo: contrato.is_anexo ?? false,
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
    school_summary: await computeSchoolSummary(serviceClient, contratoList),
  };
}
