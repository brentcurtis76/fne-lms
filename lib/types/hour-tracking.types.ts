/**
 * Type definitions for the Hour Tracking system (Phase 2)
 * Mirrors the deployed schema from supabase/migrations/20260224100000_hour_tracking_p1_review_fixes.sql
 */

// ============================================================
// UNION TYPES
// ============================================================

export type HourTypeModality = 'presencial' | 'online' | 'both';

export type LedgerEntryStatus =
  | 'reservada'
  | 'consumida'
  | 'devuelta'
  | 'penalizada';

export type CancellationClause =
  | 'clause_1'
  | 'clause_2'
  | 'clause_3'
  | 'clause_4'
  | 'clause_5'
  | 'clause_6';

export type CancelledByParty = 'school' | 'fne' | 'force_majeure';

// ============================================================
// ROW INTERFACES
// ============================================================

/**
 * HourType — Service category for consulting hours
 */
export interface HourType {
  id: string;
  key: string;
  display_name: string;
  modality: HourTypeModality;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * ContractHourAllocation — Hour budget per contract per hour type
 */
export interface ContractHourAllocation {
  id: string;
  contrato_id: string; // UUID
  hour_type_id: string;
  allocated_hours: number;
  adds_to_allocation_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * ContractHoursLedger — Session-level hour consumption log
 */
export interface ContractHoursLedger {
  id: string;
  allocation_id: string;
  session_id: string | null;
  hours: number;
  status: LedgerEntryStatus;
  session_date: string | null;
  recorded_by: string;
  is_over_budget: boolean;
  is_manual: boolean;
  cancellation_clause: CancellationClause | null;
  cancellation_reason: string | null;
  admin_override: boolean;
  admin_override_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * ConsultantRate — Per-consultant hourly rates with date ranges
 */
export interface ConsultantRate {
  id: string;
  consultant_id: string;
  rate_eur: number; // DECIMAL(10,2)
  effective_from: string; // DATE
  effective_to: string | null; // DATE — exclusive upper bound (half-open interval)
  notes: string | null;
  created_at: string;
  created_by: string;
}

/**
 * FxRate — EUR→CLP exchange rate cache (append-only)
 */
export interface FxRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number; // DB column is 'rate', not 'rate_clp_per_eur'
  fetched_at: string;
  source: string;
  created_at: string;
}

/**
 * ContractHourReallocationLog — Audit trail for hour transfers
 * NOTE: uses created_by/created_at (not performed_by/performed_at)
 */
export interface ContractHourReallocationLog {
  id: string;
  contrato_id: string; // UUID
  from_allocation_id: string;
  to_allocation_id: string;
  hours_transferred: number;
  reason: string | null;
  created_by: string;
  created_at: string;
}

// ============================================================
// FUNCTION RETURN TYPES
// ============================================================

/**
 * BucketSummary — Return type of get_bucket_summary(p_contrato_id UUID)
 * Column names use full names (not short names)
 */
export interface BucketSummary {
  hour_type_id: string;
  hour_type_key: string;
  display_name: string;
  allocated_hours: number;
  reserved_hours: number;
  consumed_hours: number;
  available_hours: number;
}

// ============================================================
// SERVICE TYPES
// ============================================================

/**
 * ReservationResult — Return type of createReservation service function
 */
export interface ReservationResult {
  skipped: boolean;
  ledger_entry_id?: string;
  hours?: number;
  is_over_budget?: boolean;
  allocation_id?: string;
}

/**
 * CancellationClauseResult — Return type of evaluateCancellationClause
 */
export interface CancellationClauseResult {
  clause: CancellationClause;
  ledger_status: 'devuelta' | 'penalizada';
  consultant_paid: boolean;
  rescheduling_deadline_days: number | null;
  description_es: string;
}

/**
 * CancellationParams — Input to executeCancellation service function
 */
export interface CancellationParams {
  cancelled_by_party: CancelledByParty;
  reason: string;
  is_force_majeure?: boolean;
  admin_override_status?: 'devuelta' | 'penalizada';
  admin_override_reason?: string;
}

/**
 * FxRateResponse — API response for FX rate endpoints
 */
export interface FxRateResponse {
  rate_clp_per_eur: number;
  fetched_at: string;
  is_stale: boolean;
  source: string;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

/**
 * LedgerEntryManualInsert — For POST /api/contracts/[id]/hours/ledger
 */
export interface LedgerEntryManualInsert {
  allocation_id: string;
  hours: number;
  status: LedgerEntryStatus;
  session_date: string;
  notes?: string | null;
}

/**
 * LedgerEntryOverride — For PATCH /api/contracts/[id]/hours/ledger/[ledgerId]
 */
export interface LedgerEntryOverride {
  status: 'devuelta' | 'penalizada';
  admin_override_reason: string;
}

/**
 * CancelSessionRequest — For POST /api/sessions/[id]/cancel (extended)
 */
export interface CancelSessionRequest {
  cancellation_reason: string;
  cancelled_by?: CancelledByParty;
  is_force_majeure?: boolean;
  admin_override_status?: 'devuelta' | 'penalizada';
  admin_override_reason?: string;
}
