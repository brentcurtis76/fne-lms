-- Hour Tracking System — Phase 1: Database + Reference Data
--
-- This migration creates the complete database infrastructure for the
-- Hour Tracking System (Sistema de Control de Horas).
--
-- Tables created (6 new + 2 ALTER):
--   1. hour_types                        -- Reference: 9 standard service categories
--   2. contract_hour_allocations         -- Core bucket table per contract
--   3. contract_hours_ledger             -- Per-session hour reservation/consumption log
--   4. consultant_rates                  -- Per-consultant EUR rates by service type
--   5. fx_rates                          -- EUR→CLP exchange rate cache
--   6. contract_hour_reallocation_log    -- Audit trail for bucket reallocations
--   ALTER consultor_sessions             -- Add 3 new nullable columns
--   ALTER contratos                      -- Add horas_contratadas + backfill
--
-- Indexes: 16 total
-- RLS: 6 new tables with 19 policies total
-- DB Functions: get_bucket_summary, get_consultant_earnings
-- Seed: 9 hour type reference rows
--
-- Schema notes from live DB verification (2026-02-24):
--   - contratos.id is UUID (not TEXT — corrected during deploy)
--   - contratos.programa_id is UUID; programas.id is UUID — no cast needed in JOIN
--   - programas.horas_totales EXISTS and is INTEGER (nullable)
--   - clientes.school_id EXISTS (confirmed via app code + FK clientes_school_id_fkey)
--   - consultor_sessions.cancelled_at ALREADY EXISTS (from 20260212000000) — NOT re-added
--   - session_facilitators uses user_id (not facilitator_id) — confirmed
--   - btree_gist: added with IF NOT EXISTS guard
--
-- Architect corrections applied:
--   - Only 3 columns added to consultor_sessions (NOT cancelled_at)
--   - sf.user_id used everywhere (NOT sf.facilitator_id)
--   - AND p.horas_totales IS NOT NULL added to backfill WHERE clause
--   - UNIQUE(from_currency, to_currency, fetched_at) added on fx_rates (PRD)
--   - updated_at added on consultant_rates (PRD)
--   - idx_cr_effective index added on consultant_rates (PRD)
--   - COALESCE(effective_to, '9999-12-31'::date) used for EXCLUDE constraint
--   - daterange uses '[)' (half-open) per PostgreSQL convention
--   - contract_hour_allocations.updated_at has DEFAULT NOW() (PRD)
--   - contract_hour_reallocation_log uses created_by/created_at (PRD)
--   - get_bucket_summary returns PRD column names (allocated_hours, reserved_hours, etc.)
--   - consultant_rates.rate_eur uses DECIMAL(10,2) (PRD)
--
-- Date: 2026-02-24
-- Author: DB Agent (Pipeline Task: Hour Tracking Phase 1)
-- Source: .pipeline/current-task.md + .pipeline/architect-review.md + docs/PRD_HOUR_TRACKING.md v2.2

-- ============================================================
-- SECTION 1: EXTENSION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- SECTION 2: TABLE 1 — hour_types (Reference table, no deps)
-- ============================================================

CREATE TABLE hour_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('online', 'presencial')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE hour_types IS 'Reference table for the 9 standard service hour categories. Keys are stable identifiers used across sessions, allocations, and rates.';

-- ============================================================
-- SECTION 3: TABLE 2 — contract_hour_allocations (deps: contratos, hour_types, profiles)
-- ============================================================

CREATE TABLE contract_hour_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id),
  hour_type_id UUID NOT NULL REFERENCES hour_types(id),
  allocated_hours DECIMAL(8,2) NOT NULL CHECK (allocated_hours >= 0),
  is_fixed_allocation BOOLEAN NOT NULL DEFAULT false,
  -- true for online_learning bucket: fixed reservation at activation, not session-tracked
  adds_to_allocation_id UUID REFERENCES contract_hour_allocations(id),
  -- If set, this annex allocation adds hours to an existing parent bucket.
  -- NULL for standalone allocations (parent contract or new annex bucket).
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),

  UNIQUE(contrato_id, hour_type_id)
);

CREATE INDEX idx_cha_contrato ON contract_hour_allocations(contrato_id);
CREATE INDEX idx_cha_hour_type ON contract_hour_allocations(hour_type_id);
CREATE INDEX idx_cha_adds_to ON contract_hour_allocations(adds_to_allocation_id)
  WHERE adds_to_allocation_id IS NOT NULL;

COMMENT ON TABLE contract_hour_allocations IS 'Hour budget buckets per contract/annex. Sum of allocated_hours must equal contratos.horas_contratadas. Annex buckets can extend parent buckets via adds_to_allocation_id.';

-- ============================================================
-- SECTION 4: TABLE 3 — contract_hours_ledger (deps: contract_hour_allocations, consultor_sessions, profiles)
-- ============================================================

CREATE TABLE contract_hours_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES contract_hour_allocations(id),
  session_id UUID REFERENCES consultor_sessions(id),
  -- NULL for manual corrections; one entry per session when not NULL
  hours DECIMAL(6,2) NOT NULL CHECK (hours > 0),
  status TEXT NOT NULL CHECK (status IN ('reservada', 'consumida', 'devuelta', 'penalizada')),
  -- reservada: session scheduled, hours soft-locked
  -- consumida: session completed, hours hard-locked
  -- devuelta: cancelled with sufficient notice, hours returned to bucket
  -- penalizada: cancelled late, hours count as consumed (penalty)
  session_date DATE NOT NULL,
  is_over_budget BOOLEAN NOT NULL DEFAULT false,
  is_manual BOOLEAN NOT NULL DEFAULT false,
  cancellation_clause TEXT,
  -- Which clause from contract QUINTO was applied (e.g. 'clause_1')
  cancellation_reason TEXT,
  admin_override BOOLEAN NOT NULL DEFAULT false,
  admin_override_reason TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID NOT NULL REFERENCES profiles(id),
  updated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES profiles(id),
  notes TEXT,

  -- Allows multiple NULL session_ids (manual entries) but prevents duplicate session entries
  CONSTRAINT unique_session_ledger UNIQUE(session_id)
);

CREATE INDEX idx_chl_allocation ON contract_hours_ledger(allocation_id);
CREATE INDEX idx_chl_session ON contract_hours_ledger(session_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX idx_chl_session_date ON contract_hours_ledger(session_date);
CREATE INDEX idx_chl_status ON contract_hours_ledger(status);

COMMENT ON TABLE contract_hours_ledger IS 'Tracks hour reservations and consumption per session. One entry per session. Status transitions: reservada → consumida (completed), reservada → devuelta (cancelled with notice), reservada → penalizada (cancelled late). Manual corrections use is_manual=true. Consultant earnings derived by joining session → session_facilitators → consultant_rates.';

-- ============================================================
-- SECTION 5: TABLE 4 — consultant_rates (deps: profiles, hour_types, btree_gist)
-- ============================================================

CREATE TABLE consultant_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES profiles(id),
  hour_type_id UUID NOT NULL REFERENCES hour_types(id),
  rate_eur DECIMAL(10,2) NOT NULL CHECK (rate_eur >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  -- NULL = currently active rate
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),

  -- Prevent overlapping rate ranges for the same consultant + hour_type.
  -- Uses half-open intervals [): effective_to is the EXCLUSIVE upper bound.
  -- A rate with effective_to='2025-12-31' means the rate is active through 2025-12-30.
  -- A new rate starting 2025-12-31 does not overlap.
  CONSTRAINT no_overlapping_rates EXCLUDE USING gist (
    consultant_id WITH =,
    hour_type_id WITH =,
    daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[)') WITH &&
  )
);

CREATE INDEX idx_cr_consultant ON consultant_rates(consultant_id);
CREATE INDEX idx_cr_hour_type ON consultant_rates(hour_type_id);
CREATE INDEX idx_cr_effective ON consultant_rates(effective_from, effective_to);

COMMENT ON TABLE consultant_rates IS 'Hourly rates in EUR per consultant per service type. Effective date ranges prevent overlaps via btree_gist EXCLUDE constraint. effective_to is the exclusive upper bound (half-open interval [)).';

-- ============================================================
-- SECTION 6: TABLE 5 — fx_rates (no deps)
-- ============================================================

CREATE TABLE fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL DEFAULT 'EUR',
  to_currency TEXT NOT NULL DEFAULT 'CLP',
  rate DECIMAL(12,4) NOT NULL CHECK (rate > 0),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'api',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(from_currency, to_currency, fetched_at)
);

CREATE INDEX idx_fx_currencies ON fx_rates(from_currency, to_currency, fetched_at DESC);

COMMENT ON TABLE fx_rates IS 'Exchange rate cache. Append-only. Latest rate per currency pair is the active rate, auto-refreshed when stale (>1 hour). Indexed for fast latest-rate lookup.';

-- ============================================================
-- SECTION 7: TABLE 6 — contract_hour_reallocation_log (deps: contratos, hour_types, profiles)
-- ============================================================

CREATE TABLE contract_hour_reallocation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id),
  from_hour_type_id UUID NOT NULL REFERENCES hour_types(id),
  to_hour_type_id UUID NOT NULL REFERENCES hour_types(id),
  hours DECIMAL(6,2) NOT NULL CHECK (hours > 0),
  reason TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chrl_contrato ON contract_hour_reallocation_log(contrato_id);

COMMENT ON TABLE contract_hour_reallocation_log IS 'Immutable audit log of hour reallocations between buckets within the same contract. No UPDATE or DELETE — append-only.';

-- ============================================================
-- SECTION 8: ALTER TABLE consultor_sessions (3 new nullable columns — NOT cancelled_at, already exists)
-- ============================================================

ALTER TABLE consultor_sessions
  ADD COLUMN hour_type_key TEXT;

ALTER TABLE consultor_sessions
  ADD CONSTRAINT fk_session_hour_type FOREIGN KEY (hour_type_key) REFERENCES hour_types(key);

ALTER TABLE consultor_sessions
  ADD COLUMN contrato_id UUID;

ALTER TABLE consultor_sessions
  ADD CONSTRAINT fk_session_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id);

ALTER TABLE consultor_sessions
  ADD COLUMN cancelled_notice_hours DECIMAL(8,2);

COMMENT ON COLUMN consultor_sessions.hour_type_key IS 'Links session to one of the 9 service categories. NULL for legacy sessions. Required for new sessions that consume hours from a bucket.';
COMMENT ON COLUMN consultor_sessions.contrato_id IS 'Links session to the specific contract whose hours are being consumed. NULL for legacy sessions created before hour tracking.';
COMMENT ON COLUMN consultor_sessions.cancelled_notice_hours IS 'Hours of notice given before session start time. Calculated at cancellation time. Used to determine which cancellation clause from contract QUINTO applies.';

-- ============================================================
-- SECTION 9: ALTER TABLE contratos — Add horas_contratadas + backfill
-- ============================================================

ALTER TABLE contratos
  ADD COLUMN horas_contratadas DECIMAL(8,2);

-- Backfill from programas.horas_totales where available.
-- contratos.programa_id is TEXT; programas.id is TEXT (both store UUID values as text strings).
-- The AND p.horas_totales IS NOT NULL guard prevents setting horas_contratadas to NULL
-- for programs that do not yet have a default hour value defined.
UPDATE contratos c
SET horas_contratadas = p.horas_totales
FROM programas p
WHERE c.programa_id = p.id
  AND p.horas_totales IS NOT NULL
  AND c.horas_contratadas IS NULL;

COMMENT ON COLUMN contratos.horas_contratadas IS 'Total contracted hours. Populated from programa default on creation, can be overridden by admin. Single source of truth for allocation total.';

-- ============================================================
-- SECTION 10: ENABLE RLS ON ALL 6 NEW TABLES
-- ============================================================

ALTER TABLE hour_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_hour_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_hours_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_hour_reallocation_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 11: RLS POLICIES
-- ============================================================

-- Admin check subquery used throughout:
-- EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin' AND is_active = true)

-- equipo_directivo school resolution path:
-- contratos.cliente_id → clientes.id → clientes.school_id → schools.id
-- Then check: user_roles WHERE user_id = auth.uid() AND role_type = 'equipo_directivo'
-- Note: clientes.school_id confirmed to exist via app code (clientes_school_id_fkey).

-- consultor path through session_facilitators uses sf.user_id (column is user_id, not facilitator_id).

-- ============================
-- 11.1 hour_types (3 policies)
-- Public read for all authenticated users; admin-only writes.
-- ============================

CREATE POLICY "hour_types_authenticated_select" ON hour_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "hour_types_admin_insert" ON hour_types
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "hour_types_admin_update" ON hour_types
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

-- ============================
-- 11.2 contract_hour_allocations (4 policies)
-- Admin: full CRUD
-- equipo_directivo: SELECT via contratos → clientes → school
-- consultor: SELECT via consultor_sessions → session_facilitators
-- ============================

CREATE POLICY "cha_admin_all" ON contract_hour_allocations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "cha_equipo_directivo_select" ON contract_hour_allocations
  FOR SELECT USING (
    contrato_id IN (
      SELECT c.id FROM contratos c
      JOIN clientes cl ON c.cliente_id = cl.id
      WHERE cl.school_id IN (
        SELECT ur.school_id FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role_type = 'equipo_directivo'
          AND ur.is_active = true
      )
    )
  );

CREATE POLICY "cha_consultor_select" ON contract_hour_allocations
  FOR SELECT USING (
    contrato_id IN (
      SELECT cs.contrato_id
      FROM consultor_sessions cs
      JOIN session_facilitators sf ON sf.session_id = cs.id
      WHERE sf.user_id = auth.uid()
        AND cs.contrato_id IS NOT NULL
    )
  );

-- ============================
-- 11.3 contract_hours_ledger (4 policies)
-- Admin: INSERT + UPDATE + SELECT (no DELETE — append-only)
-- consultor: SELECT via session → session_facilitators
-- equipo_directivo: SELECT via allocation → contract → client → school
-- ============================

CREATE POLICY "chl_admin_select" ON contract_hours_ledger
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "chl_admin_insert" ON contract_hours_ledger
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "chl_admin_update" ON contract_hours_ledger
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "chl_consultor_select" ON contract_hours_ledger
  FOR SELECT USING (
    session_id IN (
      SELECT cs.id FROM consultor_sessions cs
      JOIN session_facilitators sf ON sf.session_id = cs.id
      WHERE sf.user_id = auth.uid()
    )
  );

CREATE POLICY "chl_equipo_directivo_select" ON contract_hours_ledger
  FOR SELECT USING (
    allocation_id IN (
      SELECT cha.id FROM contract_hour_allocations cha
      WHERE cha.contrato_id IN (
        SELECT c.id FROM contratos c
        JOIN clientes cl ON c.cliente_id = cl.id
        WHERE cl.school_id IN (
          SELECT ur.school_id FROM user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'equipo_directivo'
            AND ur.is_active = true
        )
      )
    )
  );

-- ============================
-- 11.4 consultant_rates (3 policies)
-- Admin: full CRUD
-- consultor: SELECT own rates only
-- equipo_directivo: NO ACCESS (intentional — rates are confidential)
-- ============================

CREATE POLICY "cr_admin_all" ON consultant_rates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "cr_consultor_select_own" ON consultant_rates
  FOR SELECT USING (consultant_id = auth.uid());

-- ============================
-- 11.5 fx_rates (2 policies)
-- All authenticated users: SELECT
-- Admin: INSERT only (rates are append-only, no UPDATE/DELETE)
-- ============================

CREATE POLICY "fx_rates_authenticated_select" ON fx_rates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "fx_rates_admin_insert" ON fx_rates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

-- ============================
-- 11.6 contract_hour_reallocation_log (3 policies)
-- Admin: INSERT + SELECT (immutable — no UPDATE/DELETE)
-- equipo_directivo: SELECT own school
-- consultor: NO ACCESS (intentional)
-- ============================

CREATE POLICY "chrl_admin_select" ON contract_hour_reallocation_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "chrl_admin_insert" ON contract_hour_reallocation_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "chrl_equipo_directivo_select" ON contract_hour_reallocation_log
  FOR SELECT USING (
    contrato_id IN (
      SELECT c.id FROM contratos c
      JOIN clientes cl ON c.cliente_id = cl.id
      WHERE cl.school_id IN (
        SELECT ur.school_id FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role_type = 'equipo_directivo'
          AND ur.is_active = true
      )
    )
  );

-- ============================================================
-- SECTION 12: DB FUNCTIONS
-- ============================================================

-- ------------------------------------------------------------
-- 12.1 get_bucket_summary(p_contrato_id TEXT)
--
-- Returns allocated, reserved, consumed, and available hours per bucket
-- for a given contract, including any annex additions.
--
-- Annex logic: allocations that point to parent contract buckets
-- via adds_to_allocation_id are included in the totals.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_bucket_summary(p_contrato_id UUID)
RETURNS TABLE (
  hour_type_key TEXT,
  display_name TEXT,
  allocated_hours DECIMAL,
  reserved_hours DECIMAL,
  consumed_hours DECIMAL,
  available_hours DECIMAL,
  is_fixed_allocation BOOLEAN
) AS $$
  WITH effective_allocations AS (
    -- Direct allocations for this contract
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation
    FROM contract_hour_allocations cha
    WHERE cha.contrato_id = p_contrato_id

    UNION ALL

    -- Annex allocations that add hours to this contract's buckets
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation
    FROM contract_hour_allocations cha
    WHERE cha.adds_to_allocation_id IN (
      SELECT id FROM contract_hour_allocations
      WHERE contrato_id = p_contrato_id
    )
  )
  SELECT
    ht.key AS hour_type_key,
    ht.display_name,
    SUM(ea.allocated_hours) AS allocated_hours,
    COALESCE(SUM(CASE WHEN chl.status = 'reservada' THEN chl.hours END), 0) AS reserved_hours,
    COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada') THEN chl.hours END), 0) AS consumed_hours,
    SUM(ea.allocated_hours)
      - COALESCE(SUM(CASE WHEN chl.status = 'reservada' THEN chl.hours END), 0)
      - COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada') THEN chl.hours END), 0)
    AS available_hours,
    BOOL_OR(ea.is_fixed_allocation) AS is_fixed_allocation
  FROM effective_allocations ea
  JOIN hour_types ht ON ht.id = ea.hour_type_id
  LEFT JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
    AND chl.status IN ('reservada', 'consumida', 'penalizada')
  GROUP BY ht.key, ht.display_name, ht.sort_order
  ORDER BY ht.sort_order;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_bucket_summary(UUID) IS 'Returns hour bucket summary for a contract: allocated, reserved, consumed, available. Includes annex allocations. Used for the admin and equipo_directivo hour tracking dashboard.';

-- ------------------------------------------------------------
-- 12.2 get_consultant_earnings(p_consultant_id UUID, p_from DATE, p_to DATE)
--
-- Returns earnings breakdown for a consultant over a date range.
-- Only consumida and penalizada entries count toward earnings.
-- Joins: ledger → session → session_facilitators → consultant_rates.
-- If no rate is configured for a bucket, rate_eur and total_eur are NULL.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_consultant_earnings(
  p_consultant_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS TABLE (
  hour_type_key TEXT,
  display_name TEXT,
  total_hours DECIMAL,
  rate_eur DECIMAL,
  total_eur DECIMAL
) AS $$
  SELECT
    ht.key AS hour_type_key,
    ht.display_name,
    SUM(chl.hours) AS total_hours,
    cr.rate_eur,
    SUM(chl.hours) * cr.rate_eur AS total_eur
  FROM contract_hours_ledger chl
  JOIN consultor_sessions cs ON cs.id = chl.session_id
  JOIN session_facilitators sf ON sf.session_id = cs.id
    AND sf.user_id = p_consultant_id
  JOIN contract_hour_allocations cha ON cha.id = chl.allocation_id
  JOIN hour_types ht ON ht.id = cha.hour_type_id
  LEFT JOIN consultant_rates cr ON cr.consultant_id = p_consultant_id
    AND cr.hour_type_id = cha.hour_type_id
    AND chl.session_date >= cr.effective_from
    AND (cr.effective_to IS NULL OR chl.session_date < cr.effective_to)
  WHERE chl.session_date BETWEEN p_from AND p_to
    AND chl.status IN ('consumida', 'penalizada')
  GROUP BY ht.key, ht.display_name, cr.rate_eur, ht.sort_order
  ORDER BY ht.sort_order;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_consultant_earnings(UUID, DATE, DATE) IS 'Returns earnings breakdown for a consultant over a date range. Groups by hour_type and rate. NULL rate_eur means no rate is configured for that bucket.';

-- ============================================================
-- SECTION 13: SEED DATA — 9 Hour Types
-- ============================================================
-- All 9 standard service categories. ON CONFLICT DO NOTHING ensures
-- this seed is idempotent (safe to run multiple times).

INSERT INTO hour_types (key, display_name, modality, sort_order) VALUES
  ('online_learning',               'Cursos Online (LMS)',              'online',     1),
  ('asesoria_tecnica_online',       'Asesoría Técnica Online',          'online',     2),
  ('asesoria_tecnica_presencial',   'Asesoría Técnica Presencial',      'presencial', 3),
  ('asesoria_directiva_online',     'Asesoría Directiva Online',        'online',     4),
  ('asesoria_directiva_presencial', 'Asesoría Directiva Presencial',    'presencial', 5),
  ('gestion_cambio_online',         'Gestión del Cambio Online',        'online',     6),
  ('gestion_cambio_presencial',     'Gestión del Cambio Presencial',    'presencial', 7),
  ('talleres_presenciales',         'Talleres Presenciales',            'presencial', 8),
  ('encuentro_lideres',             'Encuentro de Líderes',             'presencial', 9)
ON CONFLICT (key) DO NOTHING;
